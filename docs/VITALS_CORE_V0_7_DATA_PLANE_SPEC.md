# Vitals Core v0.7 —— 数据平面：统一事实行 + 视图目录 + 迁移函数表（方案）

> 状态：**提案 v0.0.2**（草案，未立项；R4 修订见 §7）。2026-09-02 由 v0.6 spec
> （`VITALS_CORE_V0_6_HOST_CONTRACT_SPEC.md`）§5.4 **独立成版**——版本边界、拆分
> 表与验收纪律见 v0.6 spec §2.3/§0 结论第 6 条。正文迁自 v0.6 §5.4 的
> 5.4.1/5.4.2/5.4.4；§5.4.3（HostProfile 列化卡）是 host-contract 语义，留 v0.6
> spec。设计基准与全部实测数字：2026-09-02——**但 v0.6 spec 的 M0–M3 已于
> 2026-09-02 夜至 09-03 落地并提交**（`e13dafa`…`3d06f15`，registry/共享投影
> 塌缩/evidence derive/G1–G10 完整性守卫全部字节零漂移验收），读本文件时不要
> 按 09-02 那个时间点想象 v0.6 侧还是纯草案。
>
> 一句话：v0.6 把「关于宿主长什么样的声明」收进注册表（字节零漂移，golden 不许
> 动）；本版把散在 per-host 账里的 usage/token/账单事实收成一张**逻辑统一事实行**
> （§2），消费端只许查**视图目录**（§3）不许直读各家账，schema 演进收进显式
> **迁移函数表**（§4 候选 #4、§5 验收）——schema/输出变化必须逐项产生可审查 diff，
> 禁止 reflexive `--update`。

## 0. 范围与版本边界

1. **本版 = 机制落地**：v0.6 spec §5.4.4 候选 #3（事实行契约 + 每宿主一物化视图）、
   候选 #4（schema_version 迁移函数表）、§3 视图目录里「零新数据」未来例行的
   **输出面**（按 provider/model 月成本、未落入已声明套餐覆盖范围的估算、名义 vs
   实际单位成本），
   计价分辨率、归日、去重和残差哨兵的**正确性修复不再绑进本版**：它们作为
   v0.6.x 前置热修复先行落地，本版复用其 fixture 与不变量（R4 修订）。
   候选 #1/#2（I/O 类型壳、键词表收敛）字节不变，**不占版本、随时可进**。

   **1bis 前置正确性热修复**（v0.6.x；2026-09-02 R4 从本版拆出）：claude ledger
   日桶加 `peak_*` 子桶——照 DSH 既有日形状（`usage.rs::add_buckets` 折叠时按
   `is_peak_slot` 预拆，`cost.rs::bucket_price` 用「全量 − peak_*」还原空闲份额），
   于是 `price_claude_map` 的**两个**计价入口（`claude_day_cost` 日面、
   `claude_session_cost` 会话面）都能改走峰谷读法、复用 `bucket_price`/`priced_day`，
   与 `token_by_date_model` 同形，**不新造第四种日形状**。
   本面还含：归日转正、`message.id` 去重、残差哨兵（三者同批，但不等待统一数据平面）。
   **契约面不在本版**——不变量（v0.6 spec §5.3 条款 7）与守卫（§8 G10）随 v0.6
   走。**归属现状（本条降级为提案，尚未同步）**：本节提议原 `"pending v0.7"` 缺口
   改由 v0.6.x 结清，不再把已知计费错误作为数据平面迁移的前置债务；但这只是本文件
   一侧的单方面记录——审核时点核实 v0.6 spec 全文（G10 表 `:594/595`、§0 结论第 6 条、§2.3、
   §11、§12 DoD、§14 之二）与 `tests/test_host_contract.py` 的登记注释**仍然**写
   `"pending v0.7"`，两份路线图当前确实指向不同版本，本条的自警已成真。**决策
   点**：若本次审核通过把归属改到 v0.6.x，需同批完成 v0.6 spec 与测试注释的同步
   修订，才能把本条从"提案"转正；否则保持现状（缺口仍归 v0.7，本节这段作废）。
   热修后的 ledger 是 v0.7 writer 的已验证输入；v0.7 的基本事实保留原始事件时间，
   `peak_*` 仅是从时间投影出来的可重建物化视图，不是事实列。
2. **验收先写死**（§5）：迁移函数表落地 + 每项 schema 变更的逐条评审 diff +
   parity 与不变式全绿。绝不 reflexive `--update`——那是把 golden 变成「当前行为
   的记录」，快照测试失去意义（CLAUDE.md 纪律）。
3. **顺序约束**：v0.6 registry → v0.6.x 正确性热修 → 本版——先把用户可见计费结果
   修正确，再迁移数据平面。v0.6 的字节冻结验收完成前不启动 v0.7 schema 变更，
   避免 golden 变红后无法归属。**现状核实（2026-09-03）**：claude-sync 流已合入
   （`r2a.py`/`r2a_store.rs` 目前工作区干净，不再是本条原文写的"在修改清单"），
   v0.6 spec 的 M0–M3 也已落地提交、golden 字节零漂移——这两项前置条件已经满足；
   仍未落地的只有 workbuddy 流（`workbuddy_evidence.rs`/`.py`、`fixtures/
   workbuddy/` 仍未提交）。本条约束的意图不变（数据平面迁移不该跟一条还在动的
   证据适配器流撞车），但字面写的"两条流"现在只剩一条真的挡着——v0.6.x 热修的
   范围（`usage.rs`/`cost.rs`/`cost.py`/claude ledger）与 workbuddy 证据适配器
   文件不相交，理论上可以先动 v0.6.x，无需等 workbuddy 流；本版（更大范围的数据
   结构迁移，含 R2a 身份层相邻的事实行契约）是否同样不受 workbuddy 流影响，
   需要在真正立项时重新核对文件面。
4. **不是 ORM、不是 NoSQL 引擎**（§4 论证）——组合灵活度来自键规范 + 视图纯函数；
   文档库只是「文件面失守」后的迁移去向，不是设计目标。

## 1. 背景：为什么事实层独立成版

会话「身份」的统一已有先行实现——**R2a SessionStore**（`docs/R2A_CONTRACT_DESIGN.md`；
`core::r2a` 纯规则 + `r2a_store.rs`/`r2a.py` I/O；按 `SourceFingerprint`
增量失效、载荷复用既有审计输出「不发明新字段名」——不是"cache v2"，那不是
R2A 自有术语，见 §2 的订正）。它统一的是**会话是什么**（SessionKey：
host_kind→native_id→source_profile→machine_namespace + filter/cursor/版本闸）。
v0.6 spec §5.4 intro 的两层模型（基本事实行 + 视图）是两版共享的公共声明。

**已知优化点（非本版待办，供记录）**：`r2a.rs::list_sessions`
（`crates/agent-vitals-core/src/r2a.rs:430-468`）每次翻页都对命中集做**全量
重排** + **线性扫描**找游标断点（`matched.sort_by(...)` 之后紧跟
`matched.iter().position(...)`）——会话数一旦上到几千，翻 P 页就是
O(N·P·log N) 的重复功。`matched` 排序之后紧接着找游标位置这一步，把
`.position()`（O(n)）换成 `.binary_search_by()`（O(log n)）是个不动数据
结构、风险很小的即时可做优化；真要免掉"每页全量重排"那一半，则需要把
`entries` 换成按排序键维护的持久有序结构（如 `BTreeMap`），插入/更新
O(log n) 起步而不是每次 O(n log n) 重排。**现状规模不需要**（DSH/Codex/
WorkBuddy 语料量级目前是几十到低百级会话），记在这里是为了"知道在哪、
将来量级上来时不用重新发现"，不是本版验收项，也不阻塞 v0.7 的事实行/
视图目录设计——`sessions_navigation`（§3 视图目录）当前直接消费 R2a 的
输出，本版不改 R2a 内部实现。

本版的缺口在**事实层**：usage/token/账单行分存各家账（dsh state 链 / codex 静态
fold / claude ledger / workbuddy credit_json），消费端（menubar 六行、日历、工作台
tab、dsh-client 投影）各自手工 join、每处一个 basis——v0.6 spec §1.2「漏了不红」
在**结果侧**的重演。事实层不随 v0.6 落地的原因（v0.6 spec §2.3）：两版验收纪律
互斥——v0.6 是字节零漂移（golden 原样、differential 全绿、`--update` 不许动），
数据重构是「主动改持久格式 + 受控 `--update`」。独立成版 = 给 schema 演进明确且
逐项受评审的更新窗口。扫描报告（方向 A）不在本平面内——它消费宿主安装语料而非
会话事实，两个方向的数据平面不相交（v0.6 spec §8 方向轴）。

## 2. 统一事实行（逻辑 schema；持久化不是承诺）

### 2.1 粒度与身份

**一行 = 一个宿主原生 usage observation**：即日志中能够独立识别、携带 token 或
宿主账单增量的一次观测。它不是 tool step、消息、会话汇总或日桶；累计快照必须先由
adapter 转成 delta，再进入事实层。没有 token/金额、只提供行为证据的事件仍留在
CanonicalSession，不为了“统一”被塞进 usage fact。

统一幂等键：

```text
fact_id = hash(machine_namespace, host, source_profile, native_session_id,
               source_event_id, observation_kind)
```

`source_event_id` 优先使用 provider request/billing id 或宿主稳定 message/event id；
没有原生 id 时，adapter 才可用“规范化原始记录 + 文件稳定身份”的 hash fallback，并
必须标 `identity_basis=derived-hash`。`turn`/`step`/`call_id` 只是 provenance，不能单独
充当统一主键——同一步可能产生多次模型请求。source 文件重写、checkpoint/resume 与
重复扫描必须得到同一个 `fact_id`；同一累计快照不得重复转 delta。

| 字段组 | 列 | 出处/纪律 |
|---|---|---|
| 身份 | `fact_id`、`identity_basis`、`observation_kind` | 主键规则见 §2.1；未知原生 id 时显式标 derived-hash |
| 会话引用 | `session_key` 的稳定序列化值 | JSON 文件没有外键；必须写入可独立解析的稳定引用值。身份行暂不可用时保留引用并标 orphan，不删除事实；R2a 重建后必须仍能解析到同一 SessionKey |
| 来源 | `host`、`source_profile`、`source_event_id`、`source_revision`、`adapter_version` | 支持幂等重放、来源文件重写与适配器升级追溯 |
| 模型归属 | `provider_raw`/`model_raw` + `provider_id`/`model_id` + `normalization_version` | raw 值不可改；规范化 id 由带版本的映射产生。映射升级不得覆写历史 raw 值 |
| 时间 | `event_ts_utc`、`event_tz_basis`；派生 `billing_date` | 基本事实保留原始时间分辨率；北京日和 `is_peak_slot` 是版本化视图投影。无事件时间时标 `time_basis=unaccounted`，不得用 session start 冒充事实 |
| 去重语义 | `source_usage_semantics=delta\|cumulative`、`provider_request_id`/`provider_billing_id`（可空）、`turn`/`step`/`call_id`（可空） | 事实 Token 永远是 delta；该字段记录源语义。cumulative 必须在 adapter 边界转 delta；影子记录、累计快照和重复日志在写事实前消解，并保留 provenance |
| Token 度量 | `uncached_input_tokens`、`cache_read_tokens`、`cache_write_tokens`、`output_tokens` | 非负整数；宿主 camel/短键只存在于 adapter 输入，不进入事实契约。缺失与真实 0 必须可区分 |
| 计费归属 | `billing_source`、`billing_mode=subscription\|metered\|credits\|unknown`、`pricing_basis` | usage/session 级事实，**Host ≠ BillingSource**；不可判定保持 unknown，绝不默认整体按量 |
| 宿主金额 | `amount_decimal`（可空）、`currency`（可空）、`amount_basis` | 仅记录宿主/provider 已报告金额；使用十进制定点字符串或等价 Decimal，禁止二进制浮点。不同币种、credits 与现金不裸加 |
| 套餐证据 | `account_ref`、`billing_period_start/end`、`product_scope`、`quota_window`、`is_using_overage`、`evidence_basis`（均可空） | 套餐是账户/账期证据，可被多条 usage 引用；NULL = 不可判，不得降级成“整体按量” |

价目表计算产生的金额**不回写基本事实行**；它属于带 `pricing_version`、
`pricing_effective_at`、`priced_at` 的 cost view。这样换价目表或峰谷规则时可以从原始
事实重算，不会把估算价格固化成账单事实。

**时间列为什么改（2026-09-02 修订，本版最重要的一处 schema 更正）**：本行原文写
「基线按会话 startTime 归日近似**与 `claude_cost` 同款**」——那等于把一个当天被真机
证伪的近似写进统一事实行契约，后续所有宿主都会继承它。实证
（`docs/CLAUDE_COST_DAY_ATTRIBUTION_ANALYSIS.md`）：

- **时间分辨率缺失**是托盘 claude 今日 ¥45.40 vs 账单 ¥74.3797 差额的 **89%**（¥25.68）
  ——当日 69% 消费落在峰窗，日桶全谷价即砍半。同日反证价卡与峰谷窗口本身无误：
  **本仓价卡 × 官方 token 量 × 每行真实小时 = ¥74.3797 = 账单，分毫不差**。
  故基本事实把 `event_ts_utc` 作为一等列；`peak_*` 是物化日视图的派生子桶。既保留
  当前计价效率，也允许峰窗或时区规则变化后重算。
- **startTime 基线归日**同日被否证：假定「压缩会删历史行」，真机上压缩**保留**
  历史行（12,797 行的 live 文件里，末条 cost-state 之前仍有 1,175 条带 ts 的当日
  请求），于是有日界的行被整段折进无日界的基线，跨午夜会话当日消费错记到起始日
  （实测 197.5M flash cache-read 记到前一天）。事实行的归日**以行自身 ts 为准**，
  cost-state 只作对账锚：行和 ≥ 基线 → 基线弃用；行和 < 基线 → 差值为真残差，
  进入**无日期的 `unaccounted` 池**并令相关期间 partial，绝不写进 exact 日桶。若 UI
  需要按 session start 展示，只能作为 `time_basis=estimated-session-start` 的独立估算。

身份行归 R2a 管。事实行若持久化，复用 R2a 的 `SourceFingerprint` 做指纹增量失效
（R2A_CONTRACT_DESIGN.md §1.5/§3.4；同一 `data_home()`；Store 只写自己的可删
cache、不碰 R1 权威状态——写权边界见 R2a 设计 §3.2，不是 §3.5——§3.5 是 cursor
失效与安全回退全量 fold，另一个话题）；物化视图（month.json/ledger）仍是跨调用持久化的唯一允许处，merge/rotate
「每 token 恰好一次」的分工不变。本版的候选 #3 = 把这张逻辑 schema 落成**共享序列
化契约**（双语言读写函数 + parity 测试钉键），每宿主一张物化视图替掉手工 join。

## 3. 视图目录（现有消费端全映射；新增消费端照此加行）

| 视图 | 基本事实行的查询 | 现有落点 |
|---|---|---|
| `token_by_model` | 按 `fact_id` 幂等聚合 + `unaccounted_usage` 哨兵 | dsh-client tokenByModel、behavior --json |
| `token_by_date_model` | 时间轴投影（**日桶下保留 `peak_*` 子桶**——时变卡计价的合法输入形状，G10 断言面；DSH 侧现状即如此，claude ledger 本版对齐它）；月度与 by_model 全等 | 日历、month.json 写入 |
| `cost_report` | by_model+sequence × pricing 卡片（峰谷/平费率两价面，basis 各标）。**前置条件（v0.6 spec §5.3 条款 7）：平费率面（`flat_rate`/`_flat_rate`）只对平费率卡合法**（catalog anthropic/moonshot USD 卡、MiniMax 档位卡）；`{off_peak, peak}` 时变卡**必须**走峰谷面（`bucket_price` 族），缺分辨率则报 partial，**标 basis 不能替代分辨率**。G10 的断言就钉在这个读法分界上 | menubar 账卡、costReport 投影 |
| `priced_day` | 逐日 by_model 覆盖：全→exact；不全→标 `pricing_basis="partial"` + `coverage` 比例，未覆盖的剩余部分仍经 `fallback_price` 补齐计入 `total`（不是"只标不价"——`basis` 字段本身就是"这个数字不精确"的标注，不许被下游读成 exact） | month.json 逐日渲染 |
| behavior findings | canonical 全信号 × 规则，RuleOutcome 三态 | findings tab、审计投影 |
| `sessions_navigation` | 身份视图：今日/最近 N 会话（现状唯一跨宿主 join 视图，r2a） | menubar 行、工作台 chip |
| 未来例：**按 provider/model 月成本** | month.json `by_model` 逐模型 × 模型卡（core 计价函数现成）→ per-model 金额；同一 provider 跨两账（如 deepseek：DSH 真账 vs claude ledger 估算）**分 basis 列，不裸加** | —（数据/价目/函数全现成，缺输出面） |
| 未来例：**未落入已声明套餐覆盖范围（估算）** | model 不在当前已声明 subscription 的覆盖范围 → 仅输出 token 与 catalog 反事实金额，`basis=estimated-subscription-exclusion`；不能据此断言发生按量现金成本。**粒度待定，非零新数据**：`pricing.json` 的 `subscriptions.*` 目前只有 `provider`/`currency`/`amount_per_month`/`reported_at`/`note`——覆盖范围的核对（如 claude-pro 那段"19,248 事件超窗口"的推理）是**散文**写在 `note` 里，没有结构化键。若谓词按 **provider 粒度**（该 provider 订阅覆盖全部用量）判定，行名"模型集"就名不副实，应改叫"未落入已声明订阅覆盖范围"；若坚持**模型粒度**，则需要新增一个结构化的模型清单字段——这本身就是新数据，与"零新数据"矛盾。两者二选一，落地前须先在本节澄清，不能两种粒度混着写 | —（价目/函数现成，覆盖范围粒度与其结构化表示待定；可能仍属企业套餐、免费额度、代理路由或未知来源） |
| 未来例：**名义 vs 实际单位成本（节约因子）** | Σ tokens_m × 市价_m（不排除订阅，counterfactual 基线）÷ Σ tokens = 名义混合单价；真账实际 ÷ Σ tokens = 实际混合单价；ratio<1 = 节约；订阅含 USD 卡，跨币种 ratio 需 basis 分列 | —（可算；单宿主官方卡语义下 ratio 恒 1——2026-09-02 实测 1.00；信号仅在结算价≠卡价时出现：订阅覆盖/路由折扣/模型替代；缓存节约已内嵌卡价差 cached 0.05 vs uncached 1.5 = 1/30，需无缓存反事实基线才显性） |
| 未来例：**已确认非订阅成本** | `WHERE billing_mode=metered AND billing_source 已归属` → 按相同币种与 pricing basis 折算；unknown 单列 | — |

**提醒（现状，不是本版待改行为）**：`unaccounted_usage` 哨兵目前只在
`token_by_model` 这条主折叠面上报——`token_by_date_model`/`hour_buckets` 是
独立折叠，遇非 usage 事件直接 `continue`、不报哨兵（与"日期轴丢弃 untimed
样本"的设计一致）。CLAUDE.md 里"每个 fold 报 `unaccounted_usage`"说的是主
折叠面，不是字面上"所有折叠函数都报"——引用该纪律时不要泛化到这两个视图。

claude ledger / codex 静态 fold / dsh state 链是 per-host 的**物化事实视图**（v0.6
spec §5.2bis 记账轴各自的物化）；统一事实行是它们的共同逻辑 shape，不是第四套账。
纪律：视图是纯函数，同一语义两语言 = 双实现 + parity（v0.6 spec §5.1bis），不落第
四份拷贝；单会话视图恒单宿主，跨宿主只在聚合视图（月总额）相汇。**裁定列 reader
未实现前，非订阅成本视图天然不可用**——那是缺数据不是缺视图（裁定列三子列的证据
现在只写在价目表 claude-pro 行注里，代码零 reader）。反观按 provider/model 月成本
行：month.json `by_model`、模型价目卡、core 计价函数全已在手，缺的只是输出面——
纯新增视图（零新数据、零新持久化、与裁定列无依赖），DSH 宿主侧当月即可兑现
（`budget show --month` 总量之外的分模型金额）。非订阅成本是两档分层：**模型族排
除档**（模型名级近似，只能展示 estimated coverage，不称按量现金）先行，裁定列档
（会话级严格）等
reader 落地；ratio 行的计算不依赖裁定列（真账与卡价均现成，实测 1.00），但信号归
因（订阅覆盖/路由折扣/模型替代）与展示基线须挑明（§4）。

**本版交付矩阵**（候选 #3 + 输出面）：上表「未来例」行的归属——

- **随本版落地（零新数据、零新持久化、纯新增视图）**：按 provider/model 月成本、
  未落入已声明套餐覆盖范围（估算）、名义 vs 实际单位成本三行的**输出面**——输入
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
02 连问的四个需求（月成本分模型 / 套餐模型集排除估算 / 名义 vs 实际 ratio /
已确认订阅外按量）
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

### 4.1 迁移与重建的边界

- 新的 `UsageFact` 序列化契约从 `schema_version=1` 起步；旧 today/month/ledger 不是
  UsageFact v0，不能靠改键假装无损迁移。
- **事实 cache 可重建**：权威 session/provider 原始证据仍在时，按 source fingerprint
  重新 ingest，生成 v1 facts，再用新视图重建日/月物化结果。
- **历史聚合只能迁移已有信息**：旧日桶缺 event ts、billing source 或稳定 event id
  时，不得反推或伪造；转换结果进入 `legacy-aggregate` observation，相关字段为 unknown，
  coverage/partial 显式承重。它不能与重新 ingest 的明细重复计数。
- 每类持久对象分别维护版本与迁移表：`UsageFact`、day/month materialized view、R2a
  identity/cache 不共用一个全局 schema_version。迁移函数只负责自己的对象类型。
- writer 只写当前版本；reader 至少支持当前版与上一版。遇到未来版本禁止写回，允许
  在不丢字段的前提下只读，否则明确报 unsupported-version。
- **迁移链是严格线性的，不需要拓扑排序**：`vN -> vN+1` 连续迁移、禁止跨版本跳迁
  （§5 验收），且每类持久对象各自维护独立的版本号——这是一条链，不是带分叉依赖
  的有向图。曾有人问起迁移调度要不要引入拓扑排序，答案是不需要：没有"迁移 B 依赖
  迁移 A 但迁移顺序未定"这种场景，`for v in current..=target` 顺序执行即可覆盖全部
  需求；对象之间也不共享 schema_version、互相没有依赖边。如果将来某个对象的迁移
  真的需要先跑另一个对象的迁移（出现依赖边），才是引入拓扑排序的时机，现在不是。

## 5. 验收（逐项受评审的 schema 变更窗口）

本版允许因 schema 演进更新 golden，但每个有意变更必须先产生独立、可解释的 diff；
禁止把多个行为变化压成一次不可审查的大快照更新，也禁止 reflexive `--update`。

- **迁移函数表落地**：显式声明 `CURRENT_SCHEMA_VERSION` 与连续迁移链
  `vN -> vN+1`，禁止跨版本跳迁。每一步满足：幂等；输入不变；未知未来版本拒绝写入、
  允许带告警只读；迁移失败保持原文件；写入采用同目录临时文件 + fsync + atomic
  replace；首次迁移保留一份带版本的可恢复备份。降级不自动改写，由旧版本使用备份或
  明确的 reverse migration（若提供）。
- **迁移与并发**：迁移、merge、rotate 使用同一把文件锁；锁内重新读取并校验源版本，
  防止 TOCTOU。merge_month 独占写入、rotate_today 绝不加数，per-day 替换不重不丢。
- **逐项评审 `--update`**：每个 schema/输出变化分别运行 `golden_runner.py --diff`，
  diff 中必须标注对应迁移版本和变更理由；评审通过后才能冻结下一项。
- **双语言 parity 与不变式全绿**：golden/differential（含 usage_fold checkpoint/
  resume 不变：`fold(events) == fold_resume(checkpoint@turn边界, suffix)`）；每 token
  恰好一次；token_by_model ≡ token_by_date_model 月全等（唯一合法差 = untimed 样本
  被日期轴丢弃，自有测试钉）；partial 标 `pricing_basis` 与 `coverage`、剩余部分
  经 fallback 补价而非拒绝出数（`priced_day` 单点，§3 已订正措辞）；月文档只含当
  月（merge_month 归档先行）；新视图输出面（§3 交付矩阵三行）各自对真实数据出数并
  与手工复算一致。
- **事实身份与重放**：同一 source 全量扫描两次、checkpoint/resume、文件路径移动但
  稳定 source identity 不变三种情形下，`fact_id` 集合与聚合结果完全一致；累计快照
  只产生一次 delta；同一 turn/step 下两个不同 provider request 不得互相去重。
- **时间可重建**：基本事实保留 `event_ts_utc`，峰谷规则版本变化后可删除并重建
  `peak_*` 物化桶；无时间事实只进入 unaccounted，不得进入 exact 日期或峰谷金额。
- **计费诚实性**：混合路由 fixture 在同一 host 下至少覆盖 subscription、metered 与
  unknown；断言 Host 不改变 billing_source。不同币种/credits 不相加；宿主报告金额
  以 Decimal 往返无精度漂移；catalog 估算必须携带 pricing version/basis，且不回写
  基本事实。
- **迁移与故障恢复**：每个 `vN -> vN+1` 用夹具验证幂等、原文件不变、原子替换；在
  临时文件写入和 replace 前注入故障，重启后只能看到完整旧版或完整新版。未来版本
  reader 测试必须证明不会被旧 writer 覆盖。
- **前置热修复验证（本版不负责首次修复；2026-09-03 已落地）**：v0.6 原显式
  缺口由 v0.6.x 结清的**两个函数**——`cost.rs::claude_day_cost`（消费方是
  src-tauri `overview.rs` 的托盘日面）与 `cost.rs::claude_session_cost`
  （消费方是 src-tauri 的会话账面），双语言各一次——**这两个 core 函数在 CLI
  二进制（`src/`）零暴露**，与命令行的 `claude-sync`/`claude-session` 子命令
  是不同代码路径（那两个走 `claude_cost.rs`/`claude_session_audit.rs`，不
  经过 `price_claude_map`），行文不要用命令式名字指代，容易读成同一个东西。
  G10 的断言落在核心库单测层（`crates/agent-vitals-core/tests/
  host_contract.rs`/`tests/test_host_contract.py` 直接调这两个函数），不是
  CLI 命令面断言——**现在已是硬断言**（v0.6 spec §8 G10；例数从 11/19 增至
  12/20）。**两个函数在热修中同批结清**：两者共用
  `price_claude_map`→`price_claude_model`→`priced_field` 这一条链（`flat_rate`
  收窄为只服务真正平费率字段），该链 doc 注释自钉「两面的钱必须同源」，`
  claude_day_cost` 传 `peak_resolved=true`、`claude_session_cost` 传
  `peak_resolved=false`，未出现半修。落地内容：claude ledger 日桶下加
  `peak_*` 子桶（`claude_cost.rs`/`.py` 的 `tail_days` 逐行真实 ts 精确标记，
  不是照抄 DSH 的 `usage.rs::add_buckets`，是 claude 语料自己的折叠管线原生产出）、
  两个入口改走峰谷拆分计价（`priced_field`）而非硬取 `off_peak`；`claude_day_cost`
  据此报 `pricing_basis="catalog"`（精确值），`claude_session_cost` 因
  cost-state 累计口径结构性没有逐行 ts，如实报 `pricing_basis="partial"`
  （这是它能达到的诚实上限，不是残留缺口）。下界兜底本体原在 `flat_rate`
  （旧 `cost.rs:710-718`），不在 `resolve_card_catalog`——后者只负责解析出
  `(provider, key, currency)` 三元组，不做任何计价判断；命中的时变卡是三张
  ——deepseek-official 的 flash/pro **与 shengsuanyun 的 pro**（`resolve_
  card_catalog` 第二段遍历顶层 `providers` 时解析出的正是这三张 `{off_peak,
  peak}` 卡），三张 fixture 均覆盖（`g10_time_varying_card_set_matches_registry`
  机械推导钉住）。**端到端验收现状**：`docs/CLAUDE_COST_DAY_ATTRIBUTION_ANALYSIS.md`
  的 ¥74.3797 真机样本**尚未**钉进可重放 fixture（见下一条"归日转正"的 fixture
  现状说明）——本条只验证了计价函数本身的峰谷读法正确、`peak_*` 子桶来自逐行
  真实 ts，未验证对那个具体真机账期的端到端复现；该样本作为固定回归 fixture
  仍是后续待办，不作为所有 provider 的通用等式定义。
- **归日转正 + 残差哨兵 —— v0.6.x 验收项（前置，落地为 v0.7 前提；2026-09-03
  已落地）**：`claude_cost.rs`/`.py` 的 `tail_days` 改为永不清空、由每条
  `assistant` 行自己的真实 ts 累加（含峰谷标记）；`cost-state` 的 `baseline`
  降级为纯粹的对账锚点——重建时按会话按模型比较 `tail_days` 行和与 `baseline`：
  行和 ≥ baseline → baseline 已被更细粒度数据完全覆盖，弃置；行和 < baseline
  → 差额进新的 `unaccounted` 顶层键（dateless、无峰谷分辨率，绝不摊到某一
  具体日期）。**同批的理由**：只修归日会让 flash 补回而 pro 的未去重虚高单边
  暴露，总额从系统性偏低翻成偏高（分析文档 §7 实测 flash 0.63× / pro 2.12×，
  两者今日恰好互抵）；两者是同一热修的两半——本次落地里"消解重复计数"体现
  为 baseline 判定本身（行和覆盖 baseline 即视为无需重复计入，不是逐条消息
  级去重）。**现状核实（未变）**：`claude_cost.py` 全文没有 `message.id`
  去重——它现有的去重机制是按文件 `(size, mtime_ns)` 做 checkpoint
  （`_fold_one`），不是逐条消息 id；上一版写"message.id 去重"是对去重手段的
  误述，本次落地确认目标去重键就是文件级 checkpoint（未新增逐条 id 去重，
  未发现需要更细粒度的场景）。**fixture 现状**：`2279`/`753e`/`b695`/
  `197.5M` 这几个分析文档 §9 建议钉入夹具的具体真机数值**仍未**建成 fixture
  ——本次落地验证的是机制本身（`tests/test_claude_cost.py::ClaudeSyncBothTests`
  新增一条真实上月 `assistant` 行触发归档 + 一条 baseline 未被覆盖触发
  `unaccounted` 的合成夹具，双语言差分逐字节相等），不是对那份具体真机语料的
  逐数复现；把那三段实测数据钉进夹具仍是后续待办。
- **陈述性缺陷订正 —— v0.6.x 验收项（前置，落地为 v0.7 前提；2026-09-03
  已落地）**：`cost.rs` 里所写的峰段窗口「deepseek 官方高峰 00:30–08:30
  北京时间」这条与 `usage.rs::is_peak_slot`（周一至五 9–12/14–18）、
  `pricing.json` 的 `_doc`、官方文档三方矛盾的注释**已删除**（连带它所依附
  的旧 `flat_rate` off_peak 兜底分支一并移除，`flat_rate` 现在收窄为只服务
  真正平费率字段，文档字符串重写并指出真机对账证据：托盘 claude 今日 ¥45.40
  vs 官方账单 ¥74.3797，89% 差额来自这一步）；`cost.py::_flat_rate` 同步；
  `crates/agent-vitals-core/tests/host_contract.rs` 与
  `tests/test_host_contract.py` 里钉住"两入口卡在 off_peak 下界"这个（错误
  的）旧行为的测试**已删除**，替换为
  `g10_claude_day_cost_prices_peak_tokens_at_peak_rate_not_off_peak_floor`
  （验证峰谷读法正确）与
  `g10_claude_session_cost_honestly_reports_partial_for_time_varying_cards`
  （验证诚实降级）两条新硬断言——三处是同一次提交里同批改的，不是各自独立
  的收尾动作。

## 6. 与 v0.6 的文档边界

- **留在 v0.6 spec**：§5.4 intro（两层模型公共声明）、**§5.4.3 HostProfile 列化
  卡**（注册表行 = 列填充能力卡：unmeasured ↔ NULL/absent 列、degraded_rules ↔
  视图对 NULL 列的三态、fold ↔ 可产出的折叠列族、session_store ↔ 身份行——
  host-contract 语义随 v0.6 走）、§2.3 版本边界表、§0 结论第 6 条、**§5.3 条款 7
  （计价分辨率不变量）与 §8 G10（守卫；缺口归属已于 2026-09-03 随 R4 的
  v0.6.x 热修决策同步结清——v0.6 spec §8 G10 的两条 `"pending v0.7"` 条目
  已删除、改为硬断言，见该节 R4 修订记录）**——同为 host-contract 语义。
  本文件拥有统一事实契约及对前置热修不变量的持续回归验证；条款措辞与守卫
  判据的修改仍在 v0.6 spec。
- **本文件拥有**：统一事实行（§2）、视图目录与交付矩阵（§3）、数据结构演进/ORM-
  NoSQL 定位/候选表（§4）、验收（§5）。
- 引用纪律：本文件的 §/表引用只指向自身或 v0.6 spec/R2a/价目表等具名文档；v0.6
  spec §5.4 对本文件留指针。**两文件的评审地位都是提案（草案，未立项）**，机制
  变更从各自获批落地时生效——但这不等于"代码未动工"：v0.6 spec 的 M0–M3（注册表
  骨架、共享投影塌缩、evidence derive、G1–G10 完整性守卫）已于 2026-09-02 夜至
  09-03 落地并提交（commit `e13dafa`…`3d06f15`），读者不应按本文件 2026-09-02
  的设计基准日期把 v0.6 一侧也理解成原地未动。

## 7. 记录

- 2026-09-02（**R4 架构审核修订**）：
  1. 定义事实粒度为“一个宿主原生 usage observation”，新增稳定 `fact_id`、来源修订、
     delta/cumulative、raw/normalized model/provider 与 adapter version；turn/step 不再
     被误当统一去重键。
  2. 同步 v0.6 v0.1.2：删除 Host 级 `BillingKind` 引用，改为 usage/session 级
     `billing_source`、`billing_mode`、`pricing_basis`；金额使用 Decimal，Host ≠
     BillingSource。
  3. 基本事实保留 `event_ts_utc`，`peak_*` 只做可重建物化视图；无时间残差进入
     undated unaccounted，不再按 session start 写入 exact 日桶。
  4. 已知峰谷/归日/去重错误拆成 v0.6.x 正确性热修，不等待 v0.7 数据迁移；本版负责
     复用其 fixture 与持续验证。
  5. “模型不在套餐清单”降级为明确的 estimated coverage，不再命名为按量现金成本。
  6. 补迁移/重建边界、对象级版本、原子写入、故障恢复、未来版本只读保护和逐项
     golden diff 纪律。
- 2026-09-02（**R3：对下一条"计价分辨率修订"的更正**）——代码级复核后改两处，条款
  意图不变，错的是它的实现面：
  1. **转绿项不是 hour 轴，是 `peak_*` 子桶**。DSH 日桶**没有** hour 键却计价正确
     ——`usage.rs::add_buckets` 折叠时按 `is_peak_slot` 预拆 `peak_*`，
     `cost.rs::bucket_price`（:145-157）用「全量 − peak_*」还原空闲份额分别计价。
     照它做，claude ledger 直接复用 `bucket_price`/`priced_day`、与
     `token_by_date_model` 同形；原写法要新造第四种日形状。落点：§0.1bis、§2 时间行、
     §3 两行、§5 验收。
  2. **缺口是两条不是一条**。`flat_rate` 本体（`cost.rs:710-718`）的 off_peak
     兜底经 `price_claude_model`（`cost.rs:756-759` 是调用行，不是兜底本体——
     本条 R3 记录当时的引用有误，2026-09-03 复核订正）被 `claude_day_cost`
     （日/托盘）与 `claude_session_cost`（会话账）共用，且 `price_claude_map`
     doc 注释自钉「两面的钱必须同源」——只修日面会让两面分叉。命中的时变卡
     也是三张（含 `shengsuanyun.deepseek-v4-pro`，`resolve_card_catalog:
     684-694` 第二段遍历顶层 providers 时解析出的正是这张卡，同样流进
     `flat_rate` 兜底）。落点：§5 验收首条。
  对应的 v0.6 侧更正见该 spec §14「追加修订之三（R3）」（含 G10 判据从"时间键含
  hour"改成计价读法的行为级断言、撤回 `时变卡集 × 计价视图集` 叉积的理由）。
- 2026-09-02（**计价分辨率修订；缺口归属已被 R4 的 v0.6.x 热修决策取代**）：真机对账
  （`docs/CLAUDE_COST_DAY_ATTRIBUTION_ANALYSIS.md`）证伪本文件 §2 时间行原写的
  「基线按会话 startTime 归日近似与 `claude_cost` 同款」。托盘 claude 今日 ¥45.40
  vs DeepSeek 账单 ¥74.3797，反事实隔离（官方 token 量 × 全谷价 = ¥48.70）拆出两
  个因子：**缺小时轴 ¥25.68（89%）+ 归日误差净额 ¥3.30（11%）**。修订落点：§2 时间
  列（小时对时变卡 NOT NULL、归日改以行 ts 为准、cost-state 降为对账锚）、§3
  `cost_report` 平费率面的前置条件与 `token_by_date_model` 的小时桶、§5 验收三条
  （G10 缺口结清、归日+去重同批、注释订正）。契约面（v0.6 spec §5.3 条款 7 计价
  分辨率 + §8 G10 守卫）按**方案 b**（用户 2026-09-02 裁定）落 v0.6 并对该格登记
  `"pending v0.7"`，缺口清单闭集受断言；这是当时决策，R4 已把转绿责任前移到
  v0.6.x，本版只持续验证。同日实证支撑：本仓价卡
  × 官方 token 量 × 真实小时 = ¥74.3797 = 账单（72 条计价行不符 0 行）；峰段占当日
  消费 69%；ledger flash 0.63× / pro 2.12× 双向误差互抵。
- 2026-09-02：v0.6 spec §5.4（5.4.1/5.4.2/5.4.4）独立成版为本文件；版本边界决策
  （v0.6 spec §0.6/§2.3/§14 追加修订段）。同日实测：today.json `by_model` 键样例
  （deepseek-v4-flash，4+4 型桶）、subscriptions/catalog providers 模型清单 join 闭
  合、名义 vs 实际 ratio = 1.00（单宿主官方卡语义）、缓存节约反事实 ¥2.00/94.2%
  （cached 0.05 vs uncached 1.5 = 1/30）。
