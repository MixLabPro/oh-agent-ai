# Vitals Core v0.7 —— 数据平面：统一事实行 + 视图目录 + 迁移函数表（方案）

> 状态：**提案 v0.0.1**（草案，未立项）。2026-09-02 由 v0.6 spec
> （`VITALS_CORE_V0_6_HOST_CONTRACT_SPEC.md`）§5.4 **独立成版**——版本边界、拆分
> 表与验收纪律见 v0.6 spec §2.3/§0.6。正文迁自 v0.6 §5.4 的 5.4.1/5.4.2/5.4.4；
> §5.4.3（HostProfile 列化卡）是 host-contract 语义，留 v0.6 spec。设计基准与
> 全部实测数字：2026-09-02。
>
> 一句话：v0.6 把「关于宿主长什么样的声明」收进注册表（字节零漂移，golden 不许
> 动）；本版把散在 per-host 账里的 usage/token/账单事实收成一张**逻辑统一事实行**
> （§2），消费端只许查**视图目录**（§3）不许直读各家账，schema 演进收进显式
> **迁移函数表**（§4 候选 #4、§5 验收）——这是数据重构的**唯一受评审 --update
> 窗口**。

## 0. 范围与版本边界

1. **本版 = 机制落地**：v0.6 spec §5.4.4 候选 #3（事实行契约 + 每宿主一物化视图）、
   候选 #4（schema_version 迁移函数表）、§3 视图目录里「零新数据」未来例行的
   **输出面**（按 provider/model 月成本、本日非订阅按量、名义 vs 实际单位成本），
   外加 **1bis 计价分辨率的实现面**（2026-09-02 新增）。
   候选 #1/#2（I/O 类型壳、键词表收敛）字节不变，**不占版本、随时可进**。

   **1bis 计价分辨率实现面**：hour 轴（ledger 日桶加 hour 桶、`claude_day_cost` 走
   `is_peak_slot`、事实行 hour 列）+ 归日转正 + `message.id` 去重 + 残差哨兵。
   **契约面不在本版**——不变量（v0.6 spec §5.3 条款 7）与守卫（§8 G10）随 v0.6
   走，本版只负责把 v0.6 登记的 `"pending v0.7"` 缺口结清（方案 b 的后半；理由与
   §5.4.3 列化卡留守 v0.6 同源：条款是 host-contract 语义，动持久格式才是数据面）。
   本条与候选 #3 天然同批——事实行的 hour 列就是它的落点。
2. **验收先写死**（§5）：迁移函数表落地 + **唯一一次逐条评审的大 `--update`** +
   parity 与不变式全绿。绝不 reflexive `--update`——那是把 golden 变成「当前行为
   的记录」，快照测试失去意义（CLAUDE.md 纪律）。
3. **顺序约束**：v0.6（registry，字节冻结验收）先行落地 → 本版后开——重叠即互相
   污染（golden 变红无法归属：是 host-contract 还是 schema 演进引起）；并行
   claude-sync/workbuddy 流合入后再动手（`r2a.py`/`r2a_store.rs` 在修改清单，事实
   行契约与 R2a 身份层相邻）。
4. **不是 ORM、不是 NoSQL 引擎**（§4 论证）——组合灵活度来自键规范 + 视图纯函数；
   文档库只是「文件面失守」后的迁移去向，不是设计目标。

## 1. 背景：为什么事实层独立成版

会话「身份」的统一已有先行实现——**R2a SessionStore**（`docs/R2A_CONTRACT_DESIGN.md`；
`core::r2a` 纯规则 + `r2a_store.rs`/`r2a.py` I/O；cache v2 按源指纹增量失效、载荷复
用既有审计输出「不发明新字段名」）。它统一的是**会话是什么**（SessionKey：
host_kind→native_id→source_profile→machine_namespace + filter/cursor/版本闸）。
v0.6 spec §5.4 intro 的两层模型（基本事实行 + 视图）是两版共享的公共声明。

本版的缺口在**事实层**：usage/token/账单行分存各家账（dsh state 链 / codex 静态
fold / claude ledger / workbuddy credit_json），消费端（menubar 六行、日历、工作台
tab、dsh-client 投影）各自手工 join、每处一个 basis——v0.6 spec §1.2「漏了不红」
在**结果侧**的重演。事实层不随 v0.6 落地的原因（v0.6 spec §2.3）：两版验收纪律
互斥——v0.6 是字节零漂移（golden 原样、differential 全绿、`--update` 不许动），
数据重构是「主动改持久格式 + 受控 `--update`」。独立成版 = 给 schema 演进一个唯一
的、受评审的更新窗口。扫描报告（方向 A）不在本平面内——它消费宿主安装语料而非
会话事实，两个方向的数据平面不相交（v0.6 spec §8 方向轴）。

## 2. 统一事实行（逻辑 schema；持久化不是承诺）

| 字段组 | 列 | 出处/纪律 |
|---|---|---|
| 引用 | `session_key` | 引用 R2a 身份行，不复制（含 machine_namespace） |
| 计价键 | `host`/`provider`/`model` | v0.6 spec §5.2bis 数据轴：`(model, provider)` 逐事件属性 |
| 时间 | 事件 ts + 北京日归属 + **北京小时归属** | **小时对时变卡行是 NOT NULL**（v0.6 spec §5.3 条款 7 / G10）：`billing_kind=RepriceTokens` 且其价目卡为 `{off_peak, peak}` 形状时，行必须带小时，否则只能写 partial 并计哨兵——不得取时间维下界（全 `off_peak`）冒充保守。行自带 ts，小时是**投影时不许丢**的分辨率，不是新数据源。**归日不再沿用 `claude_cost` 的 startTime 基线近似**（该近似 2026-09-02 被真机证伪，见下） |
| 去重键 | `(turn, step)` 替代语义 / `message.id` / `call_id`+影子主源 | **写表时去重，视图永不担心双计**（SV611、2026-08 三倍计数事故前置） |
| 度量 | 4 型 token 四列 | API 全形 snake 键；camel→snake 由写者转换，键序固定 |
| 记账 | `billing_kind` = v0.6 spec §5.1 `BillingKind`（`RepriceTokens`\|`HostBilled`）+ `currency` + `host_amount`（可空） | **金额不是单列**：RepriceTokens 与 HostBilled 不可同列相加（credit ≠ USD ≠ CNY）；单价折算只发生在视图（core cost 函数），不在写表时——`priced_day` 单点纪律 |
| 裁定 | `subscription`：`billing_type`/`quota_window`/`is_using_overage`（可空） | claude-pro 判定链（价目表 `_doc`）的列化；NULL = 不可判定 → 落「整体按量/问用户」降级 |

**时间列为什么改（2026-09-02 修订，本版最重要的一处 schema 更正）**：本行原文写
「基线按会话 startTime 归日近似**与 `claude_cost` 同款**」——那等于把一个当天被真机
证伪的近似写进统一事实行契约，后续所有宿主都会继承它。实证
（`docs/CLAUDE_COST_DAY_ATTRIBUTION_ANALYSIS.md`）：

- **小时缺失**是托盘 claude 今日 ¥45.40 vs 账单 ¥74.3797 差额的 **89%**（¥25.68）
  ——当日 69% 消费落在峰窗，日桶全谷价即砍半。同日反证价卡与峰谷窗口本身无误：
  **本仓价卡 × 官方 token 量 × 每行真实小时 = ¥74.3797 = 账单，分毫不差**。
  故本版把小时列成一等列，而不是留给消费端各自补。
- **startTime 基线归日**同日被否证：假定「压缩会删历史行」，真机上压缩**保留**
  历史行（12,797 行的 live 文件里，末条 cost-state 之前仍有 1,175 条带 ts 的当日
  请求），于是有日界的行被整段折进无日界的基线，跨午夜会话当日消费错记到起始日
  （实测 197.5M flash cache-read 记到前一天）。事实行的归日**以行自身 ts 为准**，
  cost-state 只作对账锚：行和 ≥ 基线 → 基线弃用；行和 < 基线 → 差值为真残差，
  归 startTime 日并**标 partial/`unaccounted`**，绝不静默（与哨兵条款同族）。

身份行归 R2a 管。事实行若持久化，复用 R2a cache v2 的指纹增量失效（同一
`data_home()`；Store 只写自己的可删 cache、不碰 R1 权威状态——R2a 设计 §3.5 写右
边界）；物化视图（month.json/ledger）仍是跨调用持久化的唯一允许处，merge/rotate
「每 token 恰好一次」的分工不变。本版的候选 #3 = 把这张逻辑 schema 落成**共享序列
化契约**（双语言读写函数 + parity 测试钉键），每宿主一张物化视图替掉手工 join。

## 3. 视图目录（现有消费端全映射；新增消费端照此加行）

| 视图 | 基本事实行的查询 | 现有落点 |
|---|---|---|
| `token_by_model` | 会话内 (turn,step) 去重桶 + `unaccounted_usage` 哨兵 | dsh-client tokenByModel、behavior --json |
| `token_by_date_model` | 时间轴投影（**日桶下保留小时桶**——时变卡计价的唯一合法输入，G10 断言面）；月度与 by_model 全等 | 日历、month.json 写入 |
| `cost_report` | by_model+sequence × pricing 卡片（峰谷/平费率两价面，basis 各标）。**前置条件（v0.6 spec §5.3 条款 7）：平费率面只对平费率卡合法**（catalog anthropic/moonshot USD 卡、MiniMax 档位卡）；`{off_peak, peak}` 时变卡**必须**走峰谷面，缺小时则报 partial，**标 basis 不能替代分辨率** | menubar 账卡、costReport 投影 |
| `priced_day` | 逐日 by_model 覆盖：全→exact、不全→partial 只标不价 | month.json 逐日渲染 |
| behavior findings | canonical 全信号 × 规则，RuleOutcome 三态 | findings tab、审计投影 |
| `sessions_navigation` | 身份视图：今日/最近 N 会话（现状唯一跨宿主 join 视图，r2a） | menubar 行、工作台 chip |
| 未来例：**按 provider/model 月成本** | month.json `by_model` 逐模型 × 模型卡（core 计价函数现成）→ per-model 金额；同一 provider 跨两账（如 deepseek：DSH 真账 vs claude ledger 估算）**分 basis 列，不裸加** | —（数据/价目/函数全现成，缺输出面） |
| 未来例：**本日非订阅按量（模型族排除）** | model 不在订阅 provider 模型清单 → 按量金额（`subscriptions` 行自带 provider、catalog `providers` 行自带 models 清单，join 在价目表内闭合）；订阅覆盖的 token 单列感知行、不并入现金（摊销不得冒充 confirmed waste spend） | —（排除谓词 + 输出面缺失，零新数据；2026-09-02 实测 by_model 唯一键 deepseek-v4-flash 不在订阅集 → 全量按量） |
| 未来例：**名义 vs 实际单位成本（节约因子）** | Σ tokens_m × 市价_m（不排除订阅，counterfactual 基线）÷ Σ tokens = 名义混合单价；真账实际 ÷ Σ tokens = 实际混合单价；ratio<1 = 节约；订阅含 USD 卡，跨币种 ratio 需 basis 分列 | —（可算；单宿主官方卡语义下 ratio 恒 1——2026-09-02 实测 1.00；信号仅在结算价≠卡价时出现：订阅覆盖/路由折扣/模型替代；缓存节约已内嵌卡价差 cached 0.05 vs uncached 1.5 = 1/30，需无缓存反事实基线才显性） |
| 未来例：**非订阅成本** | `WHERE billing_kind=RepriceTokens AND 裁定列未覆盖` → 折算 | — |

claude ledger / codex 静态 fold / dsh state 链是 per-host 的**物化事实视图**（v0.6
spec §5.2bis 记账轴各自的物化）；统一事实行是它们的共同逻辑 shape，不是第四套账。
纪律：视图是纯函数，同一语义两语言 = 双实现 + parity（v0.6 spec §5.1bis），不落第
四份拷贝；单会话视图恒单宿主，跨宿主只在聚合视图（月总额）相汇。**裁定列 reader
未实现前，非订阅成本视图天然不可用**——那是缺数据不是缺视图（裁定列三子列的证据
现在只写在价目表 claude-pro 行注里，代码零 reader）。反观按 provider/model 月成本
行：month.json `by_model`、模型价目卡、core 计价函数全已在手，缺的只是输出面——
纯新增视图（零新数据、零新持久化、与裁定列无依赖），DSH 宿主侧当月即可兑现
（`budget show --month` 总量之外的分模型金额）。非订阅成本是两档分层：**模型族排
除档**（模型名级近似，2026-09-02 实测可兑现）先行，裁定列档（会话级严格）等
reader 落地；ratio 行的计算不依赖裁定列（真账与卡价均现成，实测 1.00），但信号归
因（订阅覆盖/路由折扣/模型替代）与展示基线须挑明（§4）。

**本版交付矩阵**（候选 #3 + 输出面）：上表「未来例」行的归属——

- **随本版落地（零新数据、零新持久化、纯新增视图）**：按 provider/model 月成本、
  本日非订阅按量（模型族排除）、名义 vs 实际单位成本三行的**输出面**——输入
  （today.json/month.json `by_model`）、价目（catalog 卡 + subscriptions）、计价函
  数（core cost_report/resolve_card_catalog）全现成，缺的只是逐模型金额与排除谓词
  的输出落点（CLI/budget 表面 + menubar 派生行）。
- **不随本版**：非订阅成本（裁定列档）依赖会话级**裁定 reader**——订阅裁决链（价
  目表 `_doc`：①账户层 oauthAccount.billingType ②路由层 ANTHROPIC_BASE_URL ③事件
  层 quotaLimits 拒绝史 ④问用户）的代码 reader 未实现前保持不可用；reader 是 v0.6
  之后的独立工作项，不进本版 `--update` 窗口。它先于本版交付也不冲突——裁定列写
  进事实行是新增列，不触碰既有键（候选 #2 键词表纪律内的增量）。

## 4. 数据结构演进（不是 ORM，也不是 NoSQL 引擎）

**现状形态（实证，2026-09-02）**：Python 侧全包零 dataclass/TypedDict——持久面是
裸 dict JSON 文件（today/month/archive/cache，`_read`/`_write` + flock），schema 靠
文档头部手写 `schema_version` stamp + 读写函数 docstring 钉键；计算面纯函数
dict→dict。Rust core 是 typed struct + serde。Python↔Rust byte-parity 由
golden/differential 钉住，**不靠类型**。

**为什么不是 ORM**（与不引 SQL 同一推理）：组合灵活度来自两件朴素的事——键规范
（同一字段同一名字，视图才无胶水互喂）与视图纯函数（dict→dict 任意串联）。2026-09-
02 连问的四个需求（月成本分模型 / 非订阅按量 / 名义 vs 实际 ratio / 订阅外按量）
全部 = 同一组输入 × 一个新纯函数——零新数据、零新持久化，是这套机制的现场证据。
对象映射层既无「关系」可映射（join 是函数式 + r2a SessionKey 手动索引）也无查询
收益。

**与 MongoDB 式文档库的关系**：形态上借了 document pragmatics——物化视图即文档、
聚合内嵌（month.json 逐日内嵌 by_model/by_source）、每宿主一 shape、写时聚合计账
（materialized view）。但三点刻意不在 NoSQL 语义内：①**无引擎**——文件即库，无查
询语言、无索引、无事务引擎，一致性靠 flock + per-day 幂等替换；②**查询 = 纯函数**
而非查询语言（方言 diff 是拒 SQL 的同一理由）；③**反 schema-free**——schema 自由
恰是本平面要防的键漂移，byte-parity + schema_version + 双键映射表把它钉死。文档库
只是「文件面失守」（单机变多机、MB 级变 GB 级）后的自然迁移去向——逻辑形态已经是
collections + materialized docs，迁移不改视图层——不是设计目标。

**演进候选（按 ROI 排序，都不是换存储引擎）**：

| # | 候选 | 依据 | 状态 |
|---|---|---|---|
| 1 | 读写边界最小类型壳（frozen dataclass + from_dict，仅 I/O 层） | 字段多到手写易错的既有对策是显式映射表（claude ledger CAMEL_KEYS/SNAKE_KEYS），不是类型系统；序列化照旧 dict 直出，不破 parity | 不入版本，随时可进（字节不变） |
| 2 | 键名收敛为单一共享词表（4+4 桶名、camel/snake 双面收进常量模块） | 视图组合出错的真实源头是各文件字面量里的键名漂移 | 不入版本，随时可进（字节不变） |
| 3 | 事实行落成共享序列化契约 + 每宿主一物化视图（§2 → §3，R2a 模式推广） | 现状 per-host ledger 形状各一是跨宿主视图手写 join 的根因 | **本版主体**（§0.1、§2） |
| 4 | schema_version 从写时 stamp 升级为显式迁移函数表（读旧版→迁移→新版） | 现状迁移只发生在 merge_month 归档处，读时容忍缺键 | **本版验收条目**（§5） |

## 5. 验收（唯一受评审的 --update 窗口）

本版的 `--update` 是数据重构的唯一一次受评审窗口，先写死防退化成第二场零散
update（v0.6 spec §2.3 版本边界同文）：

- **迁移函数表落地**：schema_version 从写时 stamp 升级为显式「读旧版 → 迁移 →
  新版」链（候选 #4）；迁移每步幂等——merge/rotate「每 token 恰好一次」分工照旧
  （merge_month 独占写入、rotate_today 绝不加数），per-day 替换不重不丢。
- **一次逐条评审的大 `--update`**：先 `golden_runner.py --diff` 看全量 diff、逐条确
  认是 schema 演进而非行为回归，再冻结；不是 reflexive（CLAUDE.md 纪律）。
- **双语言 parity 与不变式全绿**：golden/differential（含 usage_fold checkpoint/
  resume 不变：`fold(events) == fold_resume(checkpoint@turn边界, suffix)`）；每 token
  恰好一次；token_by_model ≡ token_by_date_model 月全等（唯一合法差 = untimed 样本
  被日期轴丢弃，自有测试钉）；partial 只标不价（`priced_day` 单点）；月文档只含当
  月（merge_month 归档先行）；新视图输出面（§3 交付矩阵三行）各自对真实数据出数并
  与手工复算一致。
- **计价分辨率转绿（G10 缺口结清）**：v0.6 以显式缺口 `"pending v0.7"` 登记的
  `claude-code × deepseek-official` 一格，在本版落地 hour 轴后**删除缺口条目、改为
  硬断言**（v0.6 spec §8 G10 / §12 DoD 9）。本版落地内容：claude ledger 日桶下加
  hour 桶、`claude_day_cost` 按 hour 查 `is_peak_slot` 取价而非 `flat_rate` 硬取
  `off_peak`、事实行 hour 列。**验收标准是硬的、可端到端复现的**：
  **本仓价卡 × 真实小时重算某日 == 该日官方账单**——2026-09-02 已证该等式在数据层
  成立（¥74.3797 == ¥74.3797，逐行核对 72 条计价行不符 0 行），实现后须端到端复现，
  并以该日语料落 fixture 钉死。
- **归日转正 + 残差哨兵**（与 hour 轴**同批**，不得分两次 `--update`）：行按自身
  ts 归日、cost-state 只作对账锚、`message.id` 去重、行和 < 基线的差值报
  partial/`unaccounted`。**同批的理由**：只修归日会让 flash 补回而 pro 的未去重
  虚高单边暴露，总额从系统性偏低翻成偏高（分析文档 §7 实测 flash 0.63× / pro
  2.12×，两者今日恰好互抵）；两者是同一批改动的两半。fixture 用 2279/753e/b695
  三段实测钉死 197.5M 归日。
- **陈述性缺陷订正**（随本版，零行为影响）：`cost.rs:709` 注释所写的峰段窗口
  「deepseek 官方高峰 00:30–08:30 北京时间」是错的，与 `usage.rs::is_peak_slot`
  （周一至五 9–12/14–18）、`pricing.json` 的 `_doc`、官方文档三方矛盾；`cost.rs` 与
  `cost.py::_flat_rate` 两侧共用的「Claude 会话文件没有时段证据」前提亦为假（实测
  104,809 条 ts 全带 `Z`）。两段注释必须随 hour 轴同改——否则错误窗口会被照着实现。

## 6. 与 v0.6 的文档边界

- **留在 v0.6 spec**：§5.4 intro（两层模型公共声明）、**§5.4.3 HostProfile 列化
  卡**（注册表行 = 列填充能力卡：unmeasured ↔ NULL/absent 列、degraded_rules ↔
  视图对 NULL 列的三态、fold/billing ↔ 记账列谁填、session_store ↔ 身份行——
  host-contract 语义随 v0.6 走）、§2.3 版本边界表、§0.6、**§5.3 条款 7（计价分辨率
  不变量）与 §8 G10（守卫 + `"pending v0.7"` 缺口登记）**——同为 host-contract 语义。
  本文件只拥有它的**实现面**（§0.1bis、§2 hour 列、§5 转绿项）；条款措辞与守卫判据
  的修改在 v0.6 spec，不在这里改。
- **本文件拥有**：统一事实行（§2）、视图目录与交付矩阵（§3）、数据结构演进/ORM-
  NoSQL 定位/候选表（§4）、验收（§5）。
- 引用纪律：本文件的 §/表引用只指向自身或 v0.6 spec/R2a/价目表等具名文档；v0.6
  spec §5.4 对本文件留指针。两文件都是提案（草案），机制变更从 v0.7 落地时生效。

## 7. 记录

- 2026-09-02（**计价分辨率修订**）：真机对账
  （`docs/CLAUDE_COST_DAY_ATTRIBUTION_ANALYSIS.md`）证伪本文件 §2 时间行原写的
  「基线按会话 startTime 归日近似与 `claude_cost` 同款」。托盘 claude 今日 ¥45.40
  vs DeepSeek 账单 ¥74.3797，反事实隔离（官方 token 量 × 全谷价 = ¥48.70）拆出两
  个因子：**缺小时轴 ¥25.68（89%）+ 归日误差净额 ¥3.30（11%）**。修订落点：§2 时间
  列（小时对时变卡 NOT NULL、归日改以行 ts 为准、cost-state 降为对账锚）、§3
  `cost_report` 平费率面的前置条件与 `token_by_date_model` 的小时桶、§5 验收三条
  （G10 缺口结清、归日+去重同批、注释订正）。契约面（v0.6 spec §5.3 条款 7 计价
  分辨率 + §8 G10 守卫）按**方案 b**（用户 2026-09-02 裁定）落 v0.6 并对该格登记
  `"pending v0.7"`，缺口清单闭集受断言；本版负责让它转绿。同日实证支撑：本仓价卡
  × 官方 token 量 × 真实小时 = ¥74.3797 = 账单（72 条计价行不符 0 行）；峰段占当日
  消费 69%；ledger flash 0.63× / pro 2.12× 双向误差互抵。
- 2026-09-02：v0.6 spec §5.4（5.4.1/5.4.2/5.4.4）独立成版为本文件；版本边界决策
  （v0.6 spec §0.6/§2.3/§14 追加修订段）。同日实测：today.json `by_model` 键样例
  （deepseek-v4-flash，4+4 型桶）、subscriptions/catalog providers 模型清单 join 闭
  合、名义 vs 实际 ratio = 1.00（单宿主官方卡语义）、缓存节约反事实 ¥2.00/94.2%
  （cached 0.05 vs uncached 1.5 = 1/30）。
