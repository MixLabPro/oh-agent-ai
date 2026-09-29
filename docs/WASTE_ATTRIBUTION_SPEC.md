# 浪费量化与告警 Spec（Waste Attribution · 推翻并修订 r6 红线的立项）

> 状态：**Draft v1.0（2026-09-29）**。依据两路代码调研（2026-09-29，subAgent
> 报告全文见会话记录；关键证据以 file:line 内嵌本文）。
> 触发：A 档功能盘点中「浪费金额归因」被列为感召力/工期比之首；调研确认
> 其实现前提与 `SESSION_TRACE_DIAGNOSTICS_SPEC.md` r6 的「诊断不给金额」
> 红线正面冲突——本 spec 的第一任务就是**论证这次推翻并给出修订后的边界**，
> 而不是绕过它。
> 关联：`docs/SESSION_TRACE_DIAGNOSTICS_SPEC.md`（r7 现行）、
> `docs/ATTRIBUTABLE_WASTE.md`（v3，浪费口径真相源）、
> `docs/LANDING_VALUE_FIRST_SPEC.md`（hero 证据位等待本 spec 的真金额）。

---

## 0. 一句话结论

在 ATTRIBUTABLE_WASTE 已有的口径框架（classification=估算机会）之上，把
repeated_failure 诊断既有的「失败所在回合输入 token」影响量接上唯一计价
管线（`metered_estimate_minor`），让用户看到**带口径标签的疑似浪费估算**
（会话级 + 月度汇总），并给失败风暴加**实时告警**——金额永远标注「估算
机会、回合粒度、含高估」，永不进确认浪费分子，不动 golden 计费契约。

---

## 1. 预期 vs 现实：用户目标视角的差异分析

用户的完整目标是四层（G1→G4），逐层对照代码现实：

| 层 | 用户目标（预期） | 代码现实（调研证据） | 差距定性 |
|---|---|---|---|
| G1 感知 | 「我这个月有多少疑似浪费」一个可见数字 | ❌ 诊断仅在打开单个会话详情时现算；无任何跨会话汇总；无落库 | **汇总面缺失** |
| G2 定位 | 「烧在哪个会话、哪次失败」 | ✅ 已达成：repeated_failure 诊断 + 证据摘录（错误/参数）+ R1 深链 | 无 |
| G3 量化 | 「值多少钱」 | ❌ r6 红线：诊断不含金额（r6 移除了 r5 的 `estimated_amount`，spec §7.4:319、§8.5:420）；UI 契约钉死禁金额词（`verify-react-session-insights-contract.mjs:186-204` 断言无「多付/可节省/浪费/¥」） | **有意禁止**——需论证修订 |
| G4 行动 | 「正在烧的时候提醒我」 | ❌ 查询时现算、无持久化、无告警钩子；tick 不跑诊断 | 实时面缺失 |

**三个关键的「现实比预期更难」**（决定设计边界）：

1. **逐调用 token × 失败状态不可 JOIN**（调研一 §3）：token 最小单元是
   `usage_facts` 逐助手调用行，失败最小单元是 `workflow_events.tool_finished`
   行；两表 id 空间不同源（`usage_fact.rs:57-67` vs `workflow.rs:46-49`），
   唯一公共轴是回合桶。且**失败的模型 API 调用通常整行缺失**（claude
   emitter 无 usage 载荷即 SKIP）。→ 事实级归因需要 ingest 桥接改造，
   本期不做；回合粒度是诚实的上限。
2. **可避免性不可判**：`error_class` 全空（G8 缺口，2,775 次失败无分类，
   spec §5.3:150）。→ 全部浪费只能标「疑似机会」，没有 confirmed 档。
3. **r6 移除金额的理由正是粒度与可避免性**（回合输入含正常工作 = 系统
   性高估；文案用「不代表都能省下来」对冲）。→ 修订必须让金额**只在
   classification 语义下出现**，且高估语义可见。

## 2. r6 红线修订论证（为何现在可以给金额）

r6 当时的正确性成立；今天推翻的增量条件有三个，均非绕过而是加固：

1. **口径框架已就位**：`ATTRIBUTABLE_WASTE.md` v3 的 basis 四元组 +
   classification（confirmed/opportunity/suspected/review）+「四类浪费
   不相加」铁律在 r6 之后成文——金额可以挂进一个**语义上不可能被误读为
   账单**的位置（独立 DTO 键 + basis:"waste_estimate" + 免责串），r6 时代
   这个位置不存在（当时只有 amounts_by_basis 一条路，混进去就违反铁律）。
2. **计价管线已收敛**：回合名义成本管线（`price_groups` +
   `billing_bucket_usage_json` + `metered_estimate_minor`，
   `query/session_insights.rs:214-265`）已把「按事件时刻价格快照计价 +
   coverage/reason 诚实降级」做熟——金额与同会话名义成本**同一条路**，
   数字互相可对，不产生第二套真相。
3. **产品语境变了**：landing 的 hero 证据位（LANDING_VALUE_FIRST spec）
   需要「真金额」；用户目标 G3 的缺失现在是转化链路的洞。

**修订后的红线（替代 r6 的禁止）**：金额可以出现，当且仅当——
(a) classification=opportunity（估算机会）；(b) 粒度声明可见（回合粒度、
含高估）；(c) 不进任何 summable/账单/golden 面；(d) UI 措辞用「疑似浪费
（估算机会）」，仍禁「可节省/省下/浪费了 ¥X 能省回」。

## 3. 数据可用性矩阵（调研结论，实施不再复查）

| 维度 | 状态 | 证据 |
|---|---|---|
| 逐助手调用 token（四桶+模型+provider+峰谷+就近价卡版本） | ✅ | usage_facts；load_calls query/session_insights.rs:38-67 |
| 逐工具失败（outcome/参数指纹/错误摘录） | ✅ | workflow_events + v16 富化列 |
| 回合粒度 token × 失败计数 × 名义金额 | ✅ 现算 | axis.steps + price_groups，domain 793-814 / query 214-265 |
| 事实级 token-失败血缘 | ❌（本期不做） | 两表 id 不同源 |
| error_class（可避免性） | ❌ 全空 | G8 |
| DSH 式 measured 净增长 | ⚠️ 仅 DSH | dsh/sessions/waste.rs:169-215 |
| 通知冷却原语 | ✅ | `claim_delivery_key_with`（billing/budget_notifications.rs:64-108，通用键、投递失败不记账本可重试）|
| 计价入口 | ✅ 唯一 | `metered_estimate_minor` cost/mod.rs:45；None≠0 |

## 4. 设计

### 4.1 Stage 1 · 浪费量化（~1 周）

**口径定义（本 spec 的核心裁决）**：
- `waste_tokens` = repeated_failure 诊断既有的 impact.tokens（失败落点回合
  的输入四桶之和，domain/session_insights.rs:671）——**不改计算，只加语义**。
- `waste_estimate` = 该 token 集合按既有 `price_groups` 分组（组=回合×模型
  ×provider×峰谷×价卡版本）过 `metered_estimate_minor` 的合计；**每组单独
  取整再求和的口径沿用会话合计注释（session_insights.rs:285-290）**。
- classification = `opportunity`；粒度 = `turn-level-upper-bound`（回合粒度
  上界）；全部继承 `has_unresolved` 传播（unpriced>0 → coverage:"partial"）。

**DTO（独立键，不碰 golden）**：
```json
waste_estimate: {
  amounts: [{amount_minor, currency}],        // 跨币分栏，不相加
  coverage: "full" | "partial",
  basis: "waste_estimate",
  classification: "opportunity",
  granularity: "turn-level-upper-bound",
  waste_tokens: <i64>,                         // 与金额分离：无价也有 token
  reason: null | "no_pricing_snapshot" | "no_price_card",
  estimate_disclaimer: "<点名 ATTRIBUTABLE_WASTE §6.7/§8 的固定串>"
}
```
挂载点：(a) session insights envelope（`fixtures/session_insights/
insights_envelope.json` 冻结面 additive 追加，放最后）；(b) 新增跨会话汇总
查询 `waste_summary(month)`：top N 会话 + 月合计（同样 DTO），走 ReadMemo
（键含月份参数，版本 `ReadVersion::observe`——revision+overrides+tz 已覆盖
计价输入，无新配置文件故指纹无需扩）。

**UI**：SessionInsights 摘要栏加「疑似浪费（估算机会）」一行（金额+token+
粒度小字）；诊断条目 repeated_failure 增加 waste_estimate 展示；Overview
内嵌发现条按 §LANDING spec 预留金额位。**契约脚本同步改写**：
`verify-react-session-insights-contract.mjs` 的禁词表从「禁一切金额」改为
「禁 confirmation 措辞」——允许「疑似浪费（估算机会）/估算」，仍禁
「可节省/省下/已浪费 ¥X」；新增断言：disclaimer 串在场、粒度小字在场、
reason 词表闭集。

**文档**：`ATTRIBUTABLE_WASTE.md` 增补 §6.x（waste_estimate 的 basis 四元组
登记：measurement=turn-aggregated、attribution=inferred、pricing=snapshot-
asof、classification=opportunity）；`SESSION_TRACE_DIAGNOSTICS_SPEC` r8 记录
红线修订。

### 4.2 Stage 2 · 失败风暴实时告警（~3 天）

1. **触发面**：light tick 尾部（drain 后）对**本轮有新事实的活跃会话**跑
   轻量 repeated_failure 检查（复用 domain build_insights 的
   repeated_failure 分支，仅 events+calls 两查询；非活跃会话零成本）。
2. **判定**：会话级新增失败串 ≥3 次失败即触发（与诊断阈值一致）；结果缓
   存于进程内存（上次检查的失败指纹集，diff 出「新串」才报，避免每 tick
   重报同一串）。
3. **通知**：`claim_delivery_key_with(data_home, key, now_ms, send)`，键=
   `waste-alert:{session_key}:{fingerprint}`，冷却默认 30 分钟；正文含
   「连续失败 N 次 · 疑似浪费约 X tokens（估算机会）」；通知总开关复用
   trust 的 notifications_enabled？——**否**：新增独立偏好（默认关），
   避免把成本告警混入安全告警的同意语义。
4. **不依赖**循环检测（A2）；A2 落地后同一框架加 loop 变体。

### 4.3 明确不做（本期）

- 事实级 token-失败血缘（usage_facts/workflow_events 加列或归因桥表）：
  ingest 改造 + 回填，另案立项；本 spec 的粒度上限声明就是对它的诚实对冲。
- 跨宿主 measured 净增长口径（DSH SV-COST-02 式）：claude/codex 标准化层
  无 context_tokens，不可比。
- waste_estimate 进 MonthlySummary/golden/amounts_by_basis：永不。
- 「可节省金额」任何变体：永不。

## 5. 分期与验收

- [ ] **S1a 口径与 domain 纯函数**：waste_estimate 计算（输入=insights 各
  组 tokens+价卡，输出 DTO）；测试钉「无价→None+reason 不是 0」「跨币分
  栏」「disclaimer 常量」
- [ ] **S1b envelope + 汇总查询**：insights 键追加（fixture 更新走评审）+
  waste_summary(month) + ReadMemo；q_acceptance 直插事实用例
- [ ] **S1c UI + 契约改写**：摘要栏/诊断条/发现条金额位；契约脚本禁词表
  修订 + 新断言；verify:react 全绿
- [ ] **S1d 文档**：ATTRIBUTABLE_WASTE 登记 + 诊断 spec r8 修订记录
- [ ] **S2 实时告警**：活跃会话轻量检查 + 冷却通知 + 独立偏好；手测清单
  （触发/冷却/不重报/默认关）

**验收门**：golden 16 条零漂移；`verify-react-session-insights-contract`
按新禁词表绿；诊断条目金额在无价会话显示「token 数 + 无价卡」而非 ¥0；
landing hero 证据位获得首张真金额截图（月度汇总面）。

## 6. 风险与守卫

| 风险 | 守卫 |
|---|---|
| 高估金额误导用户（回合含正常工作） | granularity 标签 + disclaimer + token 占比同屏展示；契约禁 confirmation 措辞 |
| r6 修订被读作「红线可随意推翻」 | 本 spec §2 的三个增量条件 + 修订后红线写成不可变决策；r8 记录取代 r6 而非并存 |
| 汇总查询成本（全月全会话诊断现算） | waste_summary 走 ReadMemo + 仅统计有 workflow 失败事件的会话（SQL 预过滤）|
| 告警疲劳 | 冷却 30min/串 + 新串才报 + 默认关 + 独立偏好 |
| 双真相（金额与名义成本对不上） | 强制同管线同分组键，测试对拍同会话两数字可互验 |

## 7. 测试矩阵

| 层 | 测试 | 阶段 |
|---|---|---|
| domain | waste_estimate 纯函数：定价/无价/跨币/取整口径/常量串 | S1a |
| query | envelope 键形状冻结；waste_summary memo 命中/参数变异；预过滤正确性 | S1b |
| 契约 | 禁词新表 + disclaimer/粒度断言 + 空值形态 | S1c |
| 桌面 | 通知触发/冷却/默认关（手测清单） | S2 |
| 全局 | golden 零漂移 + Python 锁步 + clippy -D + verify:react | 每阶段 |
