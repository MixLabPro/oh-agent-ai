# Agent Vitals Value Loop 架构规格（v0.10.0 – v0.13.0）

> 状态：架构草案 **R2.4**（2026-09-08；R2–R2.3 同日，R1 为 2026-09-04）
> 范围：原 v0.10 单版含 A–D 四阶段，R2.4 拆为 **v0.10.0 / v0.11.0 / v0.12.0 / v0.13.0**
> 四个版本，按「一版只新增一类风险」切（§7.0 版本地图）。
> 前置：`AGENT_VITALS_V0_9_DATA_VALUE_ARCHITECTURE_SPEC.md` 已发布并通过其 Definition of Done；
> v0.9.1 SQL 权威库（schema v2）已落 main。
> 定位：把可信数据转化为普通用户可理解、可执行、可验证收益的问题解决闭环。
> R1 → R2 变更见 **§12 changelog**；审查来源 `docs/SPEC_REVIEW_V0_10_VALUE_LOOP.md`。

## 0. 版本目标

v0.10 的北极星不是“发现多少异常”，而是：

> **多少高可信问题获得了安全的可执行方案，并最终减少了多少浪费、成本或失败。**

```text
v0.9 facts / canonical / billing / coverage
  → task trace + metrics
  → evaluation + root cause
  → issue + remedy plan + potential savings
  → preview / approval / apply / receipt
  → baseline comparison + realized savings
```

## 1. 用户问题

1. 哪些任务最贵、最慢或最容易失败？
2. 具体哪一步造成成本、重试、无效工具调用或上下文浪费？
3. 为什么发生，证据覆盖是否足够？
4. 我现在能安全地做什么？
5. 改完以后，是否真的省钱或降低失败率？

首页仍优先展示月度总感知成本；缓存率、compaction、工具失败率、推理 token 比例等是诊断指标，不应替代用户结果。

## 2. 核心契约

### 2.1 TraceGraph

使用 `TraceGraph`，而非把所有宿主强行称为 OTel Span。缺 parent/child、精确时间或 status 时，必须在 coverage 中标缺失。

```rust
pub struct TraceGraph {
    pub schema_version: u16,
    pub graph_id: String,
    pub session_key: SessionKey,
    pub task_id: Option<String>,
    pub nodes: Vec<TraceNode>,
    pub edges: Vec<TraceEdge>,
    pub coverage: TraceCoverage,
    pub input_fingerprint: String,
}

pub struct TraceNode {
    pub node_id: String,                 // fnv1a64_hex(canonical_json(...))：稳定主键，仅用于幂等
    // ── 序：与 vitals-core::CanonicalEvent 同义（§2.1.1）──────────────────
    pub scope: String,                   // 编号空间：主会话 "main" / 子代理
    pub ordinal: u64,                    // **权威执行顺序**；scope 内严格递增，跨 scope 不可比
    pub native: String,                  // 宿主原生事件 id（Seq|Uuid|CallId|TurnId）；**跨 scope join 只走它**
    // ──────────────────────────────────────────────────────────────────
    pub node_type: TraceNodeType,        // user_task / assistant_turn / model_invocation / tool_call /
                                         //   subagent / compaction / retry / outcome / model_change
                                         //   （model_change：Pi 单会话实测 4 模型 5 次切换，W1 需按模型族
                                         //    分别计算并排除切换边界——§2.4.1）
    pub fact_id: String,                 // 引用的 UsageFact.fact_id（v0.9 已落地，形如 "uf1-<hex>"）
    pub evidence_ref: String,            // 引用的 evidence_ref（空串占位，见 §10.6 空串规则的适用边界）
    pub parent_node_id: Option<String>,  // 不存在的 parent 在 TraceCoverage 里标 missing（§0 原则）
    pub branch_state: BranchState,       // live / abandoned / unknown —— 废弃分叉进 unmetered，**不归零**
    pub started_at_ms: Option<i64>,      // **仅用于展示与时间分桶，不参与排序**；缺失时 None，
                                         //   不得用 mtime / 数组顺序补造（§0 + §8 + §9）
    pub ended_at_ms: Option<i64>,
    pub status: Option<TraceStatus>,     // ok / error / timeout / cancelled / unknown
    pub provenance: Provenance,          // measured / derived / lossy —— lossy 不得与 measured 同置信度
    pub values: BTreeMap<String, f64>,   // 量值；**缺的键不出现**（不是填 0/null）
    pub metadata: serde_json::Value,     // 非量值的附加信息
}

pub struct TraceEdge {
    pub edge_id: String,                 // fnv1a64_hex(canonical_json(...))
    pub from_node_id: String,
    pub to_node_id: String,
    pub fact_id: String,                 // 引用的 UsageFact.fact_id
    pub evidence_ref: String,            // 空串占位
    pub edge_type: TraceEdgeType,        // causal / temporal / data_flow / control_flow
    pub provenance: Provenance,          // subagent 父子边尤其需要——DSH parentSession 实测 5/19 可靠
}

pub struct TraceCoverage {
    pub missing_parent: u32,             // 节点存在但 parent_node_id 不可解析
    pub missing_time: u32,               // started_at_ms 或 ended_at_ms 缺失（一个节点最多计 1）
    pub missing_status: u32,             // status 字段缺失
    pub unmetered_nodes: u32,            // branch_state = abandoned/unknown —— 缺口出现在覆盖率里
    pub total_nodes: u32,
    pub total_edges: u32,
}
```

`fact_id` 与 v0.9 `source_identity::fnv1a64_hex` 同源。**「不得自造 ID」的准确含义是
「不得自造 join 键」**：`node_id` 是我们合成的稳定主键（幂等用），而**跨 scope 的关联
只能走 `native`**（宿主自己的 id），绝不走 `ordinal` 或哈希——子代理会话是另一个编号空间。

#### 2.1.1 序与线性化继承 `TRAJECTORY_TIMELINE_SPEC.md`（**R2.2 新增**）

完整对账见 `docs/TRACEGRAPH_TIMELINE_RECONCILIATION.md`。要点：

- **时间戳永不参与排序。** 权威顺序是 `(scope, ordinal)`，与 `vitals-core::CanonicalEvent`
  同义（`crates/vitals-core/src/event.rs`：`ordinal: u64` + `occurred_at_ms: Option<i64>`
  「只用于展示和时间窗口，不参与排序」，单测 `occurred_at_ms_missing_is_not_zero` 钉着）。
  理由：时钟漂移 / resume 续写 / backfill 补录会让时间戳缺失或乱序。
- **`TraceGraph` 是树，不选线性化；线性化在投影函数上声明。** 三个宿主日志里都躺着用户
  放弃过的路径，画线前必须先决定画哪条。`branch_state` 记录哪些分支废弃，
  `TraceCoverage.unmetered_nodes` 让缺口出现在覆盖率里——**不归零、不静默合并**。
- **线性化信号是读来的，不是发明的**：Claude Code 的 `leafUuid`（实测 281 条 `last-prompt`
  全带）+ `isSidechain`；Codex 的 `thread_rolled_back`；DSH 的 `seedLength` 前缀。
- **撞名警告**：`hosts/*/sources/usage_fact.rs` 里的 `time_basis: "native"` /
  `identity_basis: "native"` 是 **basis 取值**（「时间戳来自宿主原生字段」），与本节
  `TraceNode.native`（宿主原生事件 id）**是两个概念**，勿混。
- **`task_id` 必须按三分法区分**，不要再引入一个含糊字段：`/goal` 斜杠命令是**文本**
  （需 parse `<command-args>`，lossy）；结构化 task 跟踪（Claude Code `TaskCreate`、
  WorkBuddy `tasks/*.json`）语义是「待办列表」不是「会话目标」，作独立列表维度；
  Codex 的 `task` **就是 turn**。`TraceNode.task_id` 只承载最后一种（= turn）。

#### 2.1.2 timeline_series 是 TraceGraph 的投影，几何**不得新写第二份**

```text
TraceGraph  --project(linearization)-->  timeline_series  --buildGeometry-->  SVG
  （树，分析）          v0.10 新增纯函数        （线，绘图）      **已落地，勿动**
```

`buildGeometry` / `buildTimeline` 已经是**唯一一份**几何实现
（`apps/desktop/src-tauri/ui/timeline.js`，字节锁步副本
`integrations/dsh-client/src/client/timeline-shared.cjs`，由
`scripts/verify-timeline-geometry.mjs` + `tests/test_timeline_lockstep.py` 守）。它的存在
理由就是 2026-09-01 之前仓库里有两份各画各的折线图、语义还不同。

**§5 的 Traces tab 必须调用它**，v0.10 只新增「TraceGraph → geometry spec」的数据准备
函数。**新增第二份几何 = 复刻「比例尺算错了不报错、只有人眼看出来」的原始风险**
（见 §7 v0.10.0 门槛 5）。

几何层已钉死的两条不变量自动继承：**事件点一个不丢**（`eventsIn === eventsOut`，曲线可
抽稀、事件标记不参与聚合）；**缺数据留缺口不连直线**（不把 null 当 0，不跨未测量的缺口
插值）。

**不设单值 `coverage_ratio`。** 三个缺失计数必须原样呈现：一个 0..1 的比率会诱导跨会话
求平均，而本仓库的纪律是「部分覆盖必须打标，不得按精确值聚合」（`cost.rs::priced_day`
的 `partial` 标记同源教训）。若 UI 需要一个概览数字，它是 **display-only**，必须与三个
计数同屏展示，且**禁止进入任何聚合查询**。

### 2.2 指标与评估

**派生关系（v0.9/v0.9.1 已实现，v0.10 不重写）**——v0.10 MetricDefinition 不得重写以下
已落地算法，只能派生：

- cost 相关 metric 从 `agent_vitals_domain::cost::{cost_report, priced_day, bucket_cost,
  month_cost, today_cost, cost_series}` 派生（`crates/agent-vitals-domain/src/domain/cost/mod.rs`）；
- token bucket 相关 metric 从 `agent_vitals_domain::usage::{token_by_model,
  token_by_date_model}` 与 fold 状态 `UsageFoldState`（`usage_fold_checkpoint` /
  `usage_fold_resume`）派生；
- coverage metric 从 `agent_vitals_domain::evidence::{Coverage, Signal::Usage::unmetered}`
  派生（契约层在 `contracts/evidence.rs`，扁平 re-export 路径可用）。

**新 metric 才允许新增定义**；同名 metric 必须复用既有实现。三消费面（CLI / Tauri IPC /
HTML）byte-identical 由 `tests/test_cli_matrix.py::both()` 守。理由是「形状来源纪律」：
渲染器/verify stub 手写数据期望形状，会与 fold/DTO 的真实形状互相印证着一起错。

契约清单：

- `MetricDefinition`：指标 ID、**版本**、分子、分母、窗口、缺失策略与排序；
- `EvaluationResult`：program 或 LLM evaluator 的结论、版本、coverage、input fingerprint 与证据；
- `IssueInstance`：将多个 Finding/Evaluation 聚为用户问题，保存根因、风险、状态和证据；
- `RemedyDefinition` / `RemedyPlan`：方案、适用条件、权限、风险、预估影响、验证方式与 rollback；
- `ActionReceipt`：真实执行目标、时间、变更指纹、结果和 rollback 引用；
- `OutcomeMeasurement`：baseline、观察窗、覆盖、反事实限制、Potential/Validated/Realized savings。

#### 2.2.1 savings 三档的定义与派生（**R2 修正**）

`Potential`、`Validated`、`Realized` savings 永不混算；所有成本仍继承 v0.9 的 basis 与
unresolved 口径（`ATTRIBUTABLE_WASTE.md` §6/§6.7）。

| savings_kind | 定义 | 派生公式 | 货币口径 |
|---|---|---|---|
| `potential` | 修好这个 issue **本可以不花**的钱 | `Σ(该 issue 归因的 wasted_tokens × 该 token 自己的价卡)` | 与被浪费 token 的实付 basis 同币种 |
| `validated` | preview 阶段用真实历史窗重算出的、可复现的差额 | baseline 窗与反事实窗的同 metric 差 | 同 `metered_spend` |
| `realized` | remedy 执行后观察窗的实际差额 | observed 窗 − baseline 窗 | 同 `metered_spend` |

**硬规则**：

1. **`nominal_cost − metered_spend` 不是 savings。** 该差额来自套餐/中转/促销折扣，是
   *已经拿到的价格优惠*，没有任何 remedy 能“实现”它。它属于 §6.7 的**订阅利用率**指标，
   归 Settings/计费页，**禁止进入 savings 三档任一档**。
   （反例后果：`potential` 会变成一个与 issue 数量无关的恒定大数字，`realized/potential`
   恒接近 0，§9 DoD 第 10 条永远不达标——与 2026-08「日历 ¥2386 vs 实测 ¥1733」同形态。）
2. **订阅型模型照样产 potential，但落在 token 而不是钱上。** 订阅制下浪费真实存在，收益
   体现为配额/限流余量。此时 `savings_tokens` 有值、`savings_value_minor` 为 NULL 且
   `savings_coverage` 标 `unavailable`。**不得填 0 假装没有浪费**——那是
   `evidence.rs`「adapter 不得用读不到的东西刷覆盖」的镜像违规。
3. 三档在同一 SQL 查询里**不得 `SUM`**（§9 DoD 第 6 条 + §10.7）。
4. 跨币时 `savings_value_minor` 置 NULL **并且** `savings_coverage` 标 `unavailable` +
   `counterfactual_note` 说明跨币（§10.6）。
5. `unpriced_tokens` 不参与任何 savings 派生——它本身已是无价卡 token，强行代入会编造节省。
6. **每一个 savings 数字都必须能下钻到产生它的 `fact_id` 集合**（§9 DoD 第 11 条）。
7. **不同 issue_type 的 `potential` 之间也不得相加**（§2.4.2）——这是 `ATTRIBUTABLE_WASTE`
   §2 已经论证过的结论，比第 3 条更强：三档不能相加是因为语义不同，跨类别不能相加是因为
   **归因粒度不同且没有 token-span 级血缘**。Savings 页面的「合计」在 `WasteClaim` 互斥
   证明落地前**不存在**（§2.4.3）。
8. **`potential` 是否允许存在，由该 issue 的 basis 三元组决定**（§2.4.1）——不是所有 issue
   都配有 potential savings。绝大多数只能产 `opportunity` / `suspected`，不进任何分子。

#### 2.2.2 remedy catalog 的种子来自 v0.9 `plan`

v0.9 `agent-vitals plan` 已输出 ranked savings 列表（zombie / oversized /
trim-description / shadow），由 `agent_vitals_domain::plan::build_plan(report, startup_rate)`
纯函数实现。v0.12.0 **不重写排名规则，直接复用**为 remedy catalog 的种子数据；catalog
条目的 `applicable_issue_types` 填对应 issue_type id。

### 2.3 版本戳（**R2 新增**）

`OutcomeMeasurement` 是**唯一寿命长于产生它的定义**的契约：baseline 行会在指标口径或价卡
变更后仍被读取。因此每一行必须自带：

- `metric_version` —— MetricDefinition 的版本；
- `pricing_snapshot_id` —— 引用 authority 库既有的 `pricing_snapshots` 表。

比较 baseline 与 observed 时，两侧的 `metric_version` / `pricing_snapshot_id` 不一致则
**不出数**，`savings_coverage` 标 `unavailable`。理由：`assets/pricing.json` 是业务数据、
改价不需要 golden `--update`，用 9 月价卡去减 7 月 baseline 得到的 realized savings 是
编造的。

### 2.4 浪费词表继承 `ATTRIBUTABLE_WASTE.md`（**R2.1 新增，不得另起炉灶**）

`docs/ATTRIBUTABLE_WASTE.md`（修订稿 v3，2026-09-02）是**浪费定义的真相源**，其 v1 被
评审推翻的三处 P0 与本 spec R1 犯的是同类错误。v0.10 的 `IssueInstance` / `issue_type` /
savings **全部继承该文档的词表**，不新造。

#### 2.4.1 basis 三维 + classification 四态

R2 原先只给了一个 `savings_coverage` 三态，那是「覆盖多全」；**证据等级是另一个正交维度**，
必须一并落库（`ATTRIBUTABLE_WASTE` §3）：

```text
measurement_basis: measured | derived | estimated | unavailable
attribution_basis: evidence-confirmed | inferred | benchmark-counterfactual
                 | human-confirmed | none
pricing_basis:     provider-reported | catalog-provider | catalog-fallback
                 | user-reported-invoice | subscription-allocated | unpriced
classification:    confirmed | opportunity | suspected | review
```

**准入规则（§8 铁律第 1 条）**：只有 `measurement_basis = measured` **且**
`attribution_basis ∈ {evidence-confirmed, human-confirmed}` 的 claim 可以进入「确认浪费」
分子、并因此拥有 money 口径的 `potential`。其余一律落 `opportunity`（估算机会）或
`suspected`（告警）或 `review`（待复核），**永远不在分子里**。

各 issue 族的当前 basis 真值表（照抄 `ATTRIBUTABLE_WASTE` §3，实现时不得放宽）：

| issue 族 | measurement | attribution | 能否进确认分子 |
|---|---|---|---|
| W1 缓存低命中 | measured（命中率本身） | inferred（「本可命中」是推测） | **否**，默认 suspected 告警 |
| SV-COST-01 重复相同结果 | **estimated**（`est_tokens × (n−1)`） | inferred（「第一次是必要」是假设） | **否**，估算机会 |
| SV-COST-02 失败重试上下文增长 | **measured**（request_metrics 差值） | **inferred**（期间含 assistant 输出等） | **否**，估算机会 |
| W3 长尾 session | derived | **human-confirmed**（复核后） | 仅复核确认的**具体请求/金额**进 |
| W4 常驻上下文（僵尸 Skill） | estimated | none | **否**，估算机会 |
| DuplicateProviderRequest | measured | evidence-confirmed | **是** |

> **对 §4「首批 remedy」的直接后果**：R2 §4 点名的「禁用长期未触发且证据充分的 Skill」
> 属于 **W4，basis = (estimated, none)**——它**不能产出 money 口径的确认节省**。
> 它仍是合理的首批 remedy（动作可逆、可预览），但其收益必须呈现为
> `classification=opportunity` 的**估算机会**，且 `attribution_basis=none` 必须在 UI 上
> 可见。`ATTRIBUTABLE_WASTE` §4 的诚实性边界写死了理由：`tier1_tokens` 是 tokenizer 估算；
> `loaded` 只证明 **catalog-visible**，不证明正文被读；`skillUsage=0` 是终身零触发，
> **不证明该 skill 没有发现/约束/安全价值**。

#### 2.4.2 issue_type 的封闭词表（不新造）

v0.10 的 `issue_type` 从既有分类派生，**不发明新族**：

| issue_type | 来源 | 现状 |
|---|---|---|
| `cache_inefficiency_suspect` | W1 | 需 eligibility 实现（§2.4.4 第 3 条） |
| `repeated_identical_result` | SV-COST-01（`waste.rs` 已实现） | **DSH-only**，需跨宿主化 |
| `retry_context_growth` | SV-COST-02（`waste.rs` 已实现） | **DSH-only**，需跨宿主化 |
| `repeated_tool_call` | SV611（`trajectory.rs`） | 行为告警，**不计费用** |
| `duplicate_provider_request` | W2 拆分项 | 唯一可进确认分子的族，未实现 |
| `resident_opportunity` | W4（`plan::build_plan` 的 zombie 项） | 估算机会 |
| `review_queue` | W3 | 需人工确认记录结构（§2.4.4 第 4 条） |
| `accounting_shadow` | W2 拆分项 | **永远不算浪费**——Codex `custom_tool_call{exec}` ↔ `CommandExecution` 是同一逻辑执行的两份日志，ingestion 去重，成本为零 |

`accounting_shadow` 必须显式存在于词表里且恒为零，而不是「不实现」——它是一个**主动排除**
的会计类别，写进词表才能防止后来者把影子记录当成双倍计费（§8 铁律第 2 条）。

#### 2.4.3 跨类别不可相加，`WasteClaim` 是合计的前提

`ATTRIBUTABLE_WASTE` §2 已论证：四类归因粒度不同（请求级输入 token / 工具执行 / 整个
session / 跨 session 常驻），且**当前日志没有 token-span 级血缘**——重复工具结果会进入
后续输入（同时落入 W1），skill 描述也可能属于 cached/uncached 输入，因此无法知道某段
输入成本究竟属于哪一类，`W1→W2→W3→W4` 优先扣减顺序无法实现。

因此 **Savings 页面在 `WasteClaim` 落地前不提供跨 issue_type 的「合计」数字**，只按族
并列展示。合计的前提是 `ATTRIBUTABLE_WASTE` §9 未落地第 1 条：`WasteClaim` 统一声明
（core 类型）+ **互斥证明测试**（证明多个 claim 不占用同一笔 request/token amount）。
`WasteClaim` 的字段见该文档 §2，v0.10 直接复用，**不重新设计**。

#### 2.4.4 `ATTRIBUTABLE_WASTE` §9 未落地清单 = v0.10 的前置 backlog

该文档 §9 列了 8 条未落地项，其中 5 条是 v0.12.0 / v0.13.0 的**硬前置**：

| # | 未落地项 | v0.10 归属 |
|---|---|---|
| 1 | `WasteClaim` 统一声明 + 互斥证明测试 | **v0.12.0 前置**（§2.4.3；无它则无合计） |
| 2 | 审计覆盖率计算（eligible audited cost） | **v0.12.0 前置**（§5 护栏；无它则浪费率分母不诚实） |
| 3 | W1 eligibility + 90% 降级为可配告警阈值 | v0.12.0（`cache_inefficiency_suspect` 可用性前提） |
| 4 | W3 人工确认记录结构 | **v0.12.0 前置**（§10.2.7；IssueInstance 的复核工作流） |
| 5 | W4 exposure count + `catalog-visible ≠ body loaded` 展示拆分 | v0.12.0（首批 remedy 的诚实性前提，§2.4.1） |
| 6 | BillingSource + 套餐金额输入位 | 部分已落（`pricing.json` 的 `subscriptions`）；账单确认待 |
| 7 | 月度感知成本投影（套餐/按量分卡） | v0.10.0 Overview（§5） |
| 8 | 历史价格稳定性（pricing card effective date + `pricing_version`） | **已在 R2 §2.3 落为 `pricing_snapshot_id`**——两处独立推出同一结论，互相印证 |

#### 2.4.5 已实现的 waste 规则目前只覆盖一个宿主（**实施风险**）

`SV-COST-01` / `SV-COST-02` 的实现位于
**`crates/agent-vitals-hosts/src/hosts/dsh/sessions/waste.rs`** ↔
`packages/agent-vitals-python/agent_vitals/agent/waste.py`（字节级 parity，wasm 导出
`structural_waste`）——即**只有 DSH 宿主有**。`ATTRIBUTABLE_WASTE` 全篇建立在这两条规则上，
但 v0.10.0 的门槛是**三宿主**确定性图。

因此 v0.12.0 必须显式包含「waste 规则跨宿主化」的工作量：把 `waste.rs` 从
`hosts/dsh/sessions/` 提升为跨宿主纯规则（输入是 `CanonicalSession`，与 SV601–SV614 同
形态），Claude Code / Codex 缺失的维度按既有纪律报 `Unavailable` 而非 `MeasuredZero`。
**这项工作 R1/R2 均未提及，是 v0.12.0 排期里最容易被漏掉的一块。**

### 2.5 宿主接入契约：三层参与度（**R2.3 新增**）

R1/R2 的 §7 v0.10.0 门槛写「至少三宿主」，但**三宿主不等于多宿主**——那正好是
`ingest_service::FACT_HOSTS` 里硬编码的三个。spec 从未定义「第四个宿主怎么接」，也没
定义「接不进来的宿主看到什么」。本节补上。

#### 2.5.1 事实：数据面的宿主词表当前是封闭的

```rust
// crates/agent-vitals-runtime/src/ingest_service.rs:34
pub const FACT_HOSTS: [&str; 3] = ["claude-code", "codex", "dsh"];
//  :122  未知 host → Err("unknown host `{host}` — refusing to invent a facts file")
```

这条拒绝是**对的**（不为不认识的宿主凭空造事实文件），但它意味着 v0.10 的
TraceGraph / metrics / savings / outcome **全部只对这三个宿主开放**——因为它们都建在
`UsageFact` 之上。UsageFact emitter 也只有三份
（`hosts/{claude_code,codex,dsh}/sources/usage_fact.rs`）。

#### 2.5.2 三层参与度（新宿主按能力落在哪层，就得到哪层）

| 层 | 宿主要提供什么 | 得到 v0.10 的什么 | 受 `FACT_HOSTS` 限制？ |
|---|---|---|---|
| **T1 账单级** | 一份可录入的账单金额（订阅费 / 宿主积分 / 中转对账单） | Overview 的**感知层**成本、订阅利用率、跨宿主总花费 | **否**——`host_bills` 表的 `host` 列不校验 FACT_HOSTS |
| **T2 证据级** | 一个可解析成 `CanonicalSession` 的会话日志 | Traces（图 + 时间线 + coverage）、Issues 里所有 `requires` 得到满足的 SV 规则 | **否**——走 `HostProfile` 声明式降级 |
| **T3 事实级** | 一个 `UsageFact` emitter + 进 `FACT_HOSTS` | Metrics、potential/validated/realized savings、Outcome、Remedy 闭环 | **是** |

**T1 已经可用，不需要改代码**：`AuthorityDb::host_bill_put`（`authority.rs:757`）只校验
`billing_period` 是 `YYYY-MM`、`billing_basis` 属五档词表
（`fixed_subscription` / `host_billed` / `metered_actual` / `metered_estimate` /
`api_equivalent`）、`amount_minor ≥ 0`、`currency` 非空——**`host` 是自由字符串**。
该函数的注释本身就点名了这个用途：「宿主自身账单（WorkBuddy 积分、订阅月费、中转对账
单…）——**不是**从我们的价卡派生，由用户显式录入」。

`host_billed` 这一档正是为**按积分/额度计费、不暴露逐模型 token** 的宿主准备的。

**T2 的降级是声明式的，不是硬编码**：`contracts/host_capability.rs::HOSTS` 里每个宿主
声明自己的 `unmeasured_signals` + `degraded_rules`，规则按 `requires` 信号门控，缺信号报
`Unavailable`（不是 `MeasuredZero`）。**新增宿主只需加一条 `HostProfile`，不需要改任何
一条 SV 规则**——这是本仓库设计得最对的一处，v0.10 直接继承。

#### 2.5.3 v0.10 各能力的最低宿主要求

| v0.10 能力 | 最低要求 | 达不到时的诚实退化 |
|---|---|---|
| Sessions 列表 | session store + `session_key` | 该宿主整体不出现（不是显示 0 个会话） |
| 工作区归属 / 项目下钻 | workspace root（`cwd` / `git_repo_root`） | **依赖它的规则显式降级，不得用 `cwd` 猜 repo root**；聊天平台来源的会话（如 Hermes 的 discord）本就无工作区，身份维度是 `(user_id, chat_id, thread_id)` |
| TraceGraph 节点 | `CanonicalSession` + `(scope, ordinal)`（§2.1.1） | 无法建图 → 该宿主无 Traces tab |
| TraceGraph 因果边 | parent 信号或可 join 的 `native` | 边计入 `missing_parent`，图退化成有序列表 |
| 时间线 y 轴 | 任一 `values` 序列 | 只画事件标记，不画线（**不画 0 值线**） |
| Metrics（token 口径） | `Signal::Usage` = measured | metric = `unavailable` |
| Metrics（money 口径） | usage + 价卡 + billing mode 可解析 | `unpriced_tokens`，不借卡不计 0 |
| Issues（SV601–614） | 各规则自己的 `requires` 信号 | 逐规则 `Unavailable`（已有机制） |
| Issues（SV-COST 浪费族） | 目前**只有 DSH 有**（§2.4.5） | 其余宿主该族恒空——需跨宿主化 |
| `potential` savings | `measured` + attribution 可证明（§2.4.1） | 只能产 `opportunity` / `suspected` |
| `realized` savings | 可重复测量的 baseline 窗 + 同 `metric_version`/`pricing_snapshot_id`（§2.3） | 不出数，`savings_coverage = unavailable` |
| Remedy 执行 | 宿主有**可逆**的配置面 | `diagnostic-only`（§4） |

#### 2.5.4 目标产品线与宿主定位

**产品范围（2026-09-08 定）**：核心是 **coding agent / work agent** 产品线——
`claude-code` · `codex` · `pi` · `cline` · `opencode`。其余宿主按用途分两类：

| 类别 | 宿主 | 处置 |
|---|---|---|
| **核心目标** | claude-code · codex · pi · cline · opencode · **dsh** | 按 §2.5.5 逐个接到 T3 |
| **仅供参考** | hermes · workbuddy · openclaw | **不作为接入目标**；价值在于其数据模型对本 spec 的反向验证（见下），以及作为「弱/异形宿主」的降级测试对象 |

> **参考类宿主的用法**：它们暴露的缺口已并入本 spec（Hermes → §2.5.3 工作区降级行、
> §13 第 61 条双列成本；WorkBuddy → §2.5.2 T1 账单级路径）。**不要为它们写 adapter**，
> 但在设计核心宿主的降级路径时用它们当反例。

**DSH 是核心目标，且是唯一有第四层的宿主**（`docs/DSH_HOST_ASSESSMENT.md`）：
其余四个核心宿主我们都是**事后读日志**，而 agent-vitals 在 DSH 里是注册进
`dsh.profile.bundles` 的一等 cordis 插件，与 `@deepseek-ai/dsh-base` 并列。
因此除 T1/T2/T3 外它还有：

> **T4 宿主内呈现**——v0.10 的 Issues / Savings 可经既有 dual-face 插件直接进 DSH 的
> 「审计」tab，**不必只活在 Tauri 工作台里**。这是其他核心宿主都没有的分发通道。
> 前提：修复当前的安装故障（E1 目录迁移后，profile 的两条 symlink 都指向已删除的
> `skill-vitals/dsh-client`，审计 tab 实测是坏的）。

| 宿主 | T1 | T2 | T3 | 说明 |
|---|---|---|---|---|
| **claude-code** | ✅ | ✅ | ✅ | 7 个 signal unmeasured（含 ContextWindow / QuotaConsumption）；SV607/608 已声明降级 |
| **codex** | ✅ | ✅ | ✅ | `ThreadHistoryMode` 产生 Legacy/Paginated **两套不兼容词汇**，新宿主接入时注意这不是特例而是常态 |
| **dsh** | ✅ | ✅ | ✅ | 唯一有 `StepBoundaries`；也是唯一有 SV-COST 浪费规则的 |
| **workbuddy** | ✅ **可用** | ⚠️ 部分 | ❌ **明确排除** | 见下 |
| **openclaw** | ✅ | ❌ | ❌ | 参考类。只有 `sources/skills.rs`（安装时扫描），无会话证据面；本机目录存在但**文件数 0** |
| **cline** | ✅ | ✅ | ✅ **核心目标** | 本机实测；见 `docs/CLINE_HOST_ASSESSMENT.md`。**子代理模型是五宿主里最干净的**（`is_subagent`/`parent_agent_id`/`subagent_spawn_queue`/`aggregatedAgentsCost`），per-message 自报成本。语料仅 1 会话 6 消息、零工具调用 |
| **opencode** | ？ | ？ | ？ **核心目标** | **本机未安装**，已枚举 `~/.opencode` · `~/.local/share/opencode` · `~/.config/opencode` · `~/Library/Application Support/opencode` 与 VS Code globalStorage 均无。按纪律不写二手形状——需先产语料 |
| **pi** | ✅ | ✅ | ✅ **候选** | 本机实测 1 会话即满足 T3 全部字段；见 `docs/PI_HOST_ASSESSMENT.md`。语料仅 1 会话，转正前须扩语料 |
| **hermes** | ⚠️ 退化 | ✅ 强 | ✅ **可行** | 本机实测 15 会话 / 2,092 消息（`state.db` schema v23）；见 `docs/HERMES_HOST_ASSESSMENT.md`。**schema 富、数据缺**：成本列全 0、`pricing_version` 填充数 0，但 5 桶 token 填得很满且 `pricing.json` 已认识 `MiniMax-M3` |

**Hermes 的数据模型与本仓库 v0.9 的归属决策独立重合**：它的
`session_model_usage` 主键是 `(session_id, model, billing_provider, billing_base_url,
billing_mode, task)`——比 v0.9 定的 `(host, provider)` 还细一级，多出的 `base_url`
恰好解决「同一 provider 走不同中转」；且 `estimated_cost_usd` / `actual_cost_usd` 分列
+ `cost_status` / `cost_source` / **`pricing_version`**，正是 §2.3 与
`ATTRIBUTABLE_WASTE` §9 未落地第 8 条要的形状。**但这些字段一个都没被填**——与本仓库
`timeline_series`「设计了、从未落地」同型。

**Hermes 暴露的两个缺口**（详见该评估 §6）：

1. **聊天平台来源的会话没有工作区（P1）**。`sessions.source` ∈ {cli, discord, desktop,
   tui}，discord 会话的身份维度是 `(user_id, chat_id, chat_type, thread_id)`，与 cwd 正交；
   实测 `git_repo_root` 填充数 **0/15**、`cwd` 只有 8/15。§2.5.3 的能力表缺「无工作区
   宿主」这一行——**补规则：workspace root 缺失时依赖它的规则显式降级，不得用 `cwd`
   猜 repo root**（SV605 已有绝对路径启发式降级路径，沿用）。
2. **`estimated` / `actual` 双列可能优于「单列 + basis 标签」（P2，待评估）**。
   §10.2.5 的 `outcome_measurements` 用单列 `savings_value_minor` + `savings_basis` 标签
   区分名义/实付；Hermes 用两列 + basis 字段解释各自来源。单列靠标签区分正是 §10.7
   第 1 条担心的 `SUM` 误聚合温床，建议在 v0.13.0 前评估是否改双列。

> **接入 Hermes 前必须先解决的一个陷阱**：它的 skill 是**三层嵌套 bundle**，实测
> `SKILL.md` 分布为「第 1 层 12 · 第 2 层 76 · 第 3 层 4 = 92 个」。按
> `skills/<name>/SKILL.md` 扁平假设扫描只得 12 个，**少报 87%**——与
> `RUNTIME_EVIDENCE_CONTRACT` §14.6「WorkBuddy 的 `traces/` 整轮被漏掉」同型。
> 现有 dedup 键 `(namespace, name)` 不够，需**路径式身份**，否则跨 bundle 同名子技能撞键。

**Pi 是第一个自报成本的宿主，它暴露了 spec 的两个缺口**（详见该评估文档 §4）：

1. **`pricing_basis = provider-reported` 这条路径没走通。** §2.4.1 的词表里有这一档，但
   §2.2 的成本管线默认所有金额都由**我们的价卡**算出。Pi 的
   `message.usage.cost.{input,output,cacheRead,cacheWrite,total}` 是宿主自报实付。
   **待 PM 确认的建议**：宿主自报为权威（它本就排在 `pricing_basis` 词表最前），我们的
   价卡值降为对账第二数，差额进 `data_quality_issues` 而**不是静默取其一**——与 v0.9
   「权威在 JSONL、索引是可丢弃投影」同构。
2. **一次会话 4 个模型 + 5 次显式 `model_change`**，使「模型切换」从边缘情况变成常态。
   §2.4.1 的 W1 要求「按模型族分别计算、排除模型切换边界」，Pi 让这条成为默认路径。
   好消息是切换边界**不用猜**（一等事件），但 **§2.1 的 `TraceNodeType` 需增
   `model_change`**——现有枚举里没有。

**WorkBuddy 的准确状态**（这是问得最多的一个）：

- **T3 被明确排除**——用户决定 2026-09-03，WorkBuddy 不进 UsageFact 这条线。技术上也接不
  进：没有 `usage_fact.rs`，`HostProfile` 声明 `session_store: false` / `fold: None`，
  且 `Signal::Usage` 就在它的 `unmeasured_signals` 里。
- **它的计量单位是 credits 不是 token**（`session_usage.credit_json`），`Cost` 的
  `Credits` 档在 v0.10 无承载类型（与 §13 第 45 条的 `Quota` 同一个缺口）。
- **但 T1 完全可用**：实测宿主积分账单 4307.76 ≈ ¥215（官方加量包价 1000 积分 = ¥50），
  按 `billing_basis='host_billed'` 录入 `host_bills` 即可进 Overview 的跨宿主总花费。
- **T2 部分可用**：12 个 signal unmeasured、SV604/605 已声明降级；但它有**别人没有的**
  `NetworkAccess`（measured）、`SandboxModes`（measured）、hash 链的 `ApprovalDecisions`
  ——**弱宿主不是全弱**，接入时不要按「能力总量」一刀切。

#### 2.5.5 接入一个新宿主（如 Pi）的清单

按目标层级取前 N 步，**不必一次做到 T3**：

1. **T1**：确定计费形态 → 选 `billing_basis` 五档之一 → 调 `host_bill_put`。零代码改动。
2. **T2**：
   a. 找到会话存储并**枚举试过哪些 store**（WorkBuddy 的 `traces/` 曾整轮被漏掉，
      文档据此立规矩：adapter 报 `unavailable` 必须说明试过哪些 store）；
   b. 写 `hosts/pi/sessions/evidence.rs`，产 `CanonicalSession`；
   c. 在 `HOSTS` 加一条 `HostProfile`，**如实填 `unmeasured_signals`**——填少了就是用读不到
      的东西刷覆盖（`evidence.rs` 的红线）；
   d. 确认线性化信号（叶路径 / 回滚 / 分支前缀），无信号则 `linearization` 报 unavailable
      而不是默认画全部（§2.1.1）。
3. **T3**：
   a. 写 `hosts/pi/sources/usage_fact.rs`，Python 侧同构一份（byte-parity 差分门）；
   b. 把 `"pi"` 加进 `FACT_HOSTS`（**这是一个封闭词表的显式扩容，不是配置项**）；
   c. 价卡进 `assets/pricing.json` 的 `billing_modes`，否则模型落 `unpriced_tokens`；
   d. 补 `tests/test_pi_usage_fact.py` 差分测试。

**先决判断**：如果 Pi 不暴露 per-request 的 token 用量，**T3 就不该做**——按 T1 记账单、
T2 做行为审计，是诚实且完整的产品形态；硬凑 T3 会掉进 `MeasuredZero` 冒充 `measured` 的
坑，正是本仓库整套纪律要防的东西。

## 3. 评估策略

程序评估优先：重复尝试、重复工具调用、失败率、无效读写、上下文增长、模型错配、cache/usage 守恒与覆盖异常等，优先用结构、状态机、统计和守恒律判断。

**v0.9 锚点**：已实现的 SV601–SV614 共 14 条规则（`crates/agent-vitals-domain/src/domain/
behavior.rs` + `trajectory.rs` + `detectors/` ↔ `packages/agent-vitals-python/agent_vitals/
agent/behavior.py` ↔ wasm `audit_events`）是 v0.10 程序评估的种子；v0.11.0 升级为
IssueInstance 聚合（§10.2.1），**不重写规则**。Python ↔ Rust ↔ wasm 三方锁步继续；
differential gate `AGENT_VITALS_BIN` 守 byte-identical，新增任何 evaluator 必须同构三份。

LLM evaluator 仅用于程序规则无法覆盖的语义问题；默认关闭、须授权和预算、只产生评估证据，不能直接执行修改或把正文默认发往外部服务。

**LLM evaluator 输入脱敏管线（LLM 版前置门槛，须新建）**：

1. **不得复用扫描器的 `redact()`。** `packages/agent-vitals-python/agent_vitals/compat.py:39`
   的 `redact(obj, names=False, name_map=None, *, home_n=None, cwd_n=None)` 是为**扫描报告**
   （skill 名、路径、description）设计的，其属性测试保证的是「报告里不残留真实 skill 名」。
   LLM evaluator 的输入是**会话正文 / 工具结果 / 提示词**——凭证、客户数据、文件内容是完全
   不同的敏感面。复用它会得到一条**看起来被守卫覆盖、实际没覆盖**的脱敏路径。
2. 因此 LLM 版必须新建一条**会话正文脱敏管线**，与扫描器 redact 并列，**各自有属性测试**
   （模式对齐 `tests/test_properties.py`：任意深度任意字段不得残留原文）。
3. 脱敏后 payload → `source_identity::canonical_json` 序列化 → `fnv1a64_hex` 得
   `redacted_input_fingerprint`（同时是缓存键，§10.2.6）。
4. **原始 payload 不得入库、不得入缓存**；缓存只存 `result_json` + 指纹。
5. evaluator 自身**不得内联第二份脱敏逻辑**——脱敏管线是单一权威，自造会绕过验证。

人类反馈是弱信号：用于确认方案是否有帮助，不作为普通用户使用产品的前置要求。

## 4. 问题到方案

每个稳定问题族必须有以下之一：

1. 至少一个可执行、低风险的 remedy；或
2. 明确 `diagnostic-only`，说明为什么当前不能安全自动处理。

v0.12.0 起，remedy 候选必须先在 **remedy catalog**（§10.8，`assets/remedies.json`）里有
条目；ranked 顺序继承 `plan::build_plan` 纯函数，新加 remedy 时同构实现 Python ↔ Rust ↔
wasm 三方锁步。

首批 remedy 应优先覆盖可逆、可预览的动作，例如：禁用长期未触发且证据充分的 Skill、收紧重复工具调用策略、推荐合适模型/上下文策略、修复可验证的配置错误。禁止默认删除用户文件、改变宿主配置或进行网络 MCP probe。

**remedy 的执行方式必须是代码注册的 handler，不是数据里的可执行文本**（§10.8）。

## 5. 产品界面

```text
Overview   月度总感知成本、可避免浪费、已实现节省、数据覆盖、Token 日历
Sessions   会话筛选、成本/失败/持续时间、下钻
Traces     轨迹、节点图、时间线、覆盖与缺失说明
Issues     问题、根因、证据、风险、状态
Savings    potential / validated / realized 三层收益
Settings   宿主、套餐/按量、数据源、隐私、LLM 授权与预算
```

与当前工作台（`apps/desktop/src-tauri/ui/workbench.html:12-16` 的 5 个 tab）的对应：

| v0.10 tab | 当前 v0.9 tab | 动作 | 阶段 |
|---|---|---|---|
| Overview | 总览 | 复用 + 升级（加可避免浪费、已实现节省、数据覆盖） | v0.10.0 |
| Overview（内） | **Token 日历** | **并入 Overview**（月度成本的可视化下钻，与月度数字同区） | v0.10.0 |
| Sessions | 会话 | 复用（`mcp::sessions_search` 已落 main） | v0.9.1 收口 |
| **Traces** | ❌ 无 | **新增**：节点图、时间线、coverage 降级显示 | v0.10.0 |
| **Issues** | Findings | 改名 + 升级：Finding → IssueInstance 聚合（按根因归并） | v0.11.0 |
| **Savings** | ❌ 无 | **新增**：remedy catalog + potential / validated / realized 三档 | v0.12.0 / v0.13.0 |
| **Settings** | 数据源 | 改名 + 升级：加隐私 / LLM 授权与预算开关 | LLM 版 |

净变化：5 tab → 6 tab（Token 日历并入 Overview，新增 Traces / Savings）。Tauri 工作台
HTML 是单一渲染端，新增 tab 必须在 layout 上预留位置。

### 5.1 三层指标与 tab 的对应（继承 `ATTRIBUTABLE_WASTE` §1）

该文档已定义「感知 — 诊断 — 归因」三层，各回答一个问题、各有不负责的事。v0.10 的 tab
划分**就是这三层**，不要重新发明：

| 层 | 用户问题 | 主指标 | **不负责什么** | v0.10 tab |
|---|---|---|---|---|
| **感知层** | 本月花了多少、换来多少模型处理量？ | 月度感知成本、cost/M processed tokens、套餐/按量拆分 | **不证明某笔钱浪费** | Overview |
| **诊断层** | 为什么单位成本变高/变低？ | 缓存率、模型/provider 结构、高峰占比、fresh/output 四桶 | **不直接进入浪费分子** | Traces |
| **归因层** | 哪些请求/会话/常驻资源值得优化？ | 确认浪费、估算机会、待复核异常、SV 证据 | **不冒充账单或反事实节省** | Issues / Savings |

**Overview 不得展示归因层数字。** R2 §5 原先给 Overview 加了「可避免浪费」tile——按本表，
那是归因层的量，放进感知层就是「感知冒充归因」（§8 铁律第 9 条）。Overview 的浪费相关
呈现只能是**跳转入口**（「N 个待处理问题 →」），数字本体留在 Issues/Savings。

`ATTRIBUTABLE_WASTE` §7 给出的下钻路径即 Overview → Traces 的交互设计，直接复用：

```text
单位处理成本上升
├─ 更贵模型/provider 占比上升
├─ 缓存命中下降
├─ 高峰时段占比上升
├─ output 占比上升
└─ 套餐观察用量下降（固定费被更少 token 摊销）
```

### 5.2 两个护栏必须同屏（**硬约束**）

`ATTRIBUTABLE_WASTE` §1 写死：*用总成本/总用量直接作分母，一个什么都测不到的宿主会得到
漂亮的 0%，所以审计覆盖率必须同屏*。落到 v0.10：

- **Overview 的感知成本旁必须有「数据覆盖率」**（感知层护栏）；
- **Savings 的任何比率旁必须有「审计覆盖率」**（归因层护栏，= eligible audited
  population / observed population）。

浪费率的分母是 **eligible audited spend/usage**，**不是总成本**。`eligible` 按「该规则 +
该 provider/billing mode 所需字段 + 事件能归因到请求」判定，**不是机械要求四桶全有**；
provider 不适用的桶不因缺场被误判为不合格。

比率的单位随 billing mode 变，UI 可统一叫「确认浪费率」但**必须同时标 `basis`**：

```text
按量: confirmed waste spend  / eligible audited spend    → basis=spend
订阅: confirmed avoidable usage / eligible audited usage → basis=usage
```

**固定套餐没有边际 token 账单，不得先把套餐费摊成伪单价再冒充 confirmed waste spend。**

**不改 DSH 插件的 projection 名。** `behaviorFindings` 是 host/client 两半之间的契约
（`integrations/dsh-client/src/host/index.ts` 注册 + `client/index.cts` 的 `useProjection`
键）；UI tab 名与 projection 名本就不必同名，改名收益为零、风险是双面插件不同步。

Tauri 与 CLI 消费同一 Runtime projection DTO；状态栏只呈现摘要、同步状态和安全快捷入口，不承载复杂诊断。

## 6. Runtime 与目录增量

### 6.1 基座层（v0.9 / v0.9.1 已落地，v0.10 只派生、不重写）

```text
crates/agent-vitals-data/src/
  evidence.rs          # UsageFact append-only JSONL writer（事实写入/去重/重放/reconciliation）
  fact_writer_sql.rs   # facts → SQL 权威库的写入面
  authority.rs         # SQLite 权威库（schema v2；SCHEMA_VERSION 常量 + schema_meta 表）
  authority_query.rs   # sessions_in_window / session_facts_timeline / session_cost_minor (Q04)
  billing.rs           # BillingContext + 4 档成本口径（§6.7）
  coverage.rs / projection.rs / repository.rs
  safe_query.rs        # query_sql_readonly 的 SQLite authorizer（按列拒绝敏感读取）
  legacy_import.rs / reimport_verify.rs

crates/agent-vitals-runtime/src/
  mcp/                 # sessions_search / session_detail / session_ref / data_status /
                       #   usage_hourly / query_sql_readonly（Q04 + 增量已落 main）
  sql_authority.rs     # AuthorityHandle / 健康检查（**文件，非目录**）
  sql_sync.rs          # JSONL ↔ SQLite 同步（含 sync_runs sweep、retention_cutoff_ms）
  ingest_service.rs    # 三宿主 ingest 入口 + enforce_retention
  lease.rs             # writer lease（O_EXCL + atomic rename）（**文件，非目录**）
  summary.rs           # codex_merged_from_sql / overview_bundle / calendar_month /
                       #   SqlSummaryRepository（Phase 4.3 后唯一 SummaryRepository 实现）
  money.rs             # MoneyMinor 舍入/聚合辅助
  sessions/            # r2a_store（SessionStore 缓存/checkpoint）、codex 折叠/审计、DSH discovery

crates/agent-vitals-domain/src/
  contracts/source_identity.rs   # canonical_json + fnv1a64_hex
  contracts/usage_fact.rs        # UsageFact schema；fact_id = "uf1-" + fnv1a64_hex(...)
  contracts/evidence.rs          # **CanonicalSession 在这里**（无 contracts/canonical.rs）
                                 #   + Coverage + Signal::Usage::unmetered
  domain/cost/                   # cost_report / priced_day / bucket_cost / month_cost /
                                 #   today_cost / cost_series（**唯一是目录的**）
  domain/usage.rs                # token_by_model / token_by_date_model / UsageFoldState
  domain/behavior.rs + trajectory.rs + detectors/   # SV601–SV614
  domain/plan.rs                 # build_plan（v0.12.0 remedy catalog 种子）

crates/agent-vitals-hosts/src/hosts/<h>/sessions/
  # claude_code / codex / dsh 的 evidence.rs（CanonicalSession producer）
```

> **已退役，勿引用**：`agent-vitals-data/src/store.rs`（`index.sqlite3` / `FactsIndex`，
> Phase 4.3 删除）· `summary::JsonSummaryRepository` · CLI `data-reconcile*` /
> `data-rebuild-index`。

### 6.2 v0.10 派生层 / 服务层（新增）

```text
vitals-core/
  graph.rs, measurement.rs, action.rs       # 无 Agent 语义的原语

agent-vitals-domain/
  contracts/{trace_graph,evaluation_result,issue,remedy,outcome}.rs
  domain/{metrics,evaluation,remediation,impact}/

agent-vitals-hosts/src/hosts/<host>/sessions/trace.rs
  # CanonicalSession → trace node / invocation / tool observation

agent-vitals-runtime/
  trace_service.rs
  metrics_service.rs
  validation_service.rs
  evaluation_service.rs
  llm_evaluation_service.rs      # LLM 版（见 §7）
  issue_service.rs
  remedy_service.rs
  action_service.rs
  outcome_service.rs
  projection_service.rs
```

> **`vitals-core/graph.rs` 有边界风险**：`TRAJECTORY_TIMELINE_SPEC` §6 明写「**vitals-core
> 不碰时间线**」，且 `crates/vitals-core/tests/dependency_boundary.rs` 的
> `module_file_names_are_domain_free` / `public_item_identifiers_are_domain_free` 两条断言
> 在守——`graph.rs` 里只要出现 domain/呈现词汇（trace、session、turn、timeline、hour…）
> 就会红。因此 `graph.rs` 只放**无语义的图原语**（节点/边/可达性/拓扑序），
> **任何 trace 语义留在 `agent-vitals-domain`**。

### 6.3 三层归属（继承 `TRAJECTORY_TIMELINE_SPEC` §6）

| 层 | 干什么 | 归属 | v0.10 落点 |
|---|---|---|---|
| **数据准备** | 原始事件 → TraceGraph → geometry spec（折 token、分桶、选叶路径、映射 ordinal/native） | 宿主适配器 + envelope（Rust 侧） | `hosts/<h>/sessions/trace.rs` + `runtime/trace_service.rs` |
| **几何** | points+events → SVG（比例尺、聚合、缺口断开） | 共享 client `.js` 纯函数 | **已存在，不新增**（§2.1.2） |
| **渲染壳** | SVG → DOM/React/模板 | 每前端一份 | Traces tab |

CLI/Tauri 只发 command、请求授权并展示 DTO；不得复制 token/cost/fact identity、诊断或定价公式。

## 7. 版本拆分与实施阶段

> **R2.4 决策（2026-09-08）**：原 v0.10 一版含 A–D 四阶段，按 §7「阶段规模提示」与
> §12.2 的结论**拆成四个版本**。拆分原则是「**一个版本只新增一类风险**」——不是按
> 工作量切块，而是按「这一版第一次让系统能做什么它以前不能做的危险的事」切。

### 7.0 版本地图

| 版本 | 一句话 | **新增的风险类别** | schema | 阻塞状态 |
|---|---|---|---|---|
| **v0.10.0** | **看得见**——轨迹与指标 | **无**：纯派生、只读、不落盘 | **v2 不变** | ✅ **可立即开工** |
| **v0.11.0** | **说得清**——问题归并 | 持久化状态（**不含金额、不含动作**） | v3 | ✅ **不被证据阻塞** |
| **v0.12.0** | **算得准**——收益归因 | **金额主张** | v4 | ⚠️ 三项前置未完成 |
| **v0.13.0** | **改得动**——执行与验证 | **写动作 / 不可逆** | 无变更 | 依赖 v0.12 |
| 之后 | LLM 补盲 | 数据外发 | v5 | 独立 feature |

**这个切法的价值不只是"块更小"**：原 v0.10-B 里「Issues 归并」与「Savings 归因」被
捆在一起，而 §12.2 查明**只有后者被证据阻塞**——SV601–614 在所有核心宿主上都能跑，
被卡住的是只有 1/6 宿主实现的 SV-COST 浪费族。拆开之后 **v0.11.0 可以立刻排期**，
不必等语料建设和计价权决策。

**每版独立可发布**：v0.10.0 只有 Traces tab 也是完整产品（回答 §1 的前三个用户问题）；
v0.11.0 加 Issues 后是完整的"诊断"产品；金额与动作分别再往后。

---

### v0.10.0（原 A）：Trace & Metrics

- Claude Code、Codex、DSH 的确定性 TraceGraph builder；
- Invocation / tool timing / model / cost / failure metrics；
- Sessions、Traces 查询 DTO、时间线与节点图；
- coverage 与降级显示。

**门槛：**

1. 三宿主从 `CanonicalSession`（`contracts/evidence.rs`）派生确定性图，**不重读 raw
   event**，输入源唯一。「三宿主」= `FACT_HOSTS` 的三个，**不是「多宿主」的同义词**；
   第四个宿主按 §2.5 的三层参与度接入，达不到 T3 的宿主按 §2.5.3 诚实退化；
2. 缺失关系（parent / time / status）显式在 `TraceCoverage` 里计数并标 `unavailable`，
   **不得用 mtime / 数组顺序补造**；
3. CLI / Tauri IPC / HTML 三处对同一 `session_ref` 输出的 TraceGraph 节点列表
   byte-identical（由 `tests/test_cli_matrix.py::both()` + `tests/mcp_smoke.py` 新增 S6 块
   守，模式同 S5 sessions 三消费面 parity）；
4. TraceGraph memo：`Arc<RwLock<HashMap<session_ref, TraceGraph>>>`，60s TTL，按 home 键控。
   **失效条件 = `usage_facts` 表的 `(COUNT(*), MAX(rowid)) WHERE session_key = ?`**。
5. **Traces tab 的时间线复用既有几何**（`apps/desktop/src-tauri/ui/timeline.js` 的
   `buildGeometry` / `buildTimeline`），只新增「TraceGraph → geometry spec」数据准备函数；
   **仓库内几何实现数量必须保持为 1**（§2.1.2）。验收：`scripts/verify-timeline-geometry.mjs`
   与 `tests/test_timeline_lockstep.py` 全绿，且 grep 不出第二个比例尺实现。
6. 节点排序走 `(scope, ordinal)`，**不得按 `started_at_ms` 排序**（§2.1.1）；
   `branch_state != live` 的节点计入 `TraceCoverage.unmetered_nodes`。

> **memo 的两个陷阱（R2 修正，必须有守卫测试）**
> - **不得用 `MAX(fact_id)` 做变更检测。** `fact_id` 是 `"uf1-" + fnv1a64_hex(...)`
>   （`contracts/usage_fact.rs:97-110`），对哈希取 `MAX()` 是字典序最大值——新事实只要
>   哈希字典序小于当前最大值，`MAX` 就不变，**memo 永不失效、长期喂陈旧图**。
> - **表名是 `usage_facts`，没有 `session_facts` 表。** authority 库共 13 张表：
>   `usage_facts` / `sessions` / `source_files` / `sync_runs` / `data_quality_issues` /
>   `host_bills` / `host_runtime_snapshots` / `pricing_snapshots` / `budget_config` /
>   `budget_snoozes` / `workflow_events` / `migrations` / `schema_meta`。
> - **守卫测试**：写入一条新 fact 后 memo 必须失效。否则该缺陷会以「gate 全绿的假绿」
>   形态存活（Stage A–D 审查 10 条缺陷的共同根因）。
> - **命中路径必须是 `Arc`**——锁内深拷贝几 MB JSON 会把并发命令串行卡在锁上，缓存自身
>   变成瓶颈（2026-09-05 工作台 tab 卡顿事故，已修，别改回去）。
>
> v0.9.1 之后**没有现成的 60s memo 可以照抄**：`runtime::summary::codex_merged_from_sql`
> （`summary.rs:1305`）已改为直接读 SQL 权威库、不带 memo。TraceGraph memo 是 v0.10.0
> 新建的东西，按上述四条自行实现；可参考 `sessions/r2a_store.rs` 既有的 checkpoint 形状。

### v0.11.0（原 B 的前半）：Issues —— 只归并，不谈钱

- `EvaluationResult`、`IssueInstance`、按根因归并；
- 程序 evaluator，**种子 = 已落地的 SV601–SV614**（不重写规则）；
- **Issues 页面**（Findings 改名 + 升级）；
- schema v3：`issue_instances` + `issue_status_transitions`。

**本版一律 `diagnostic-only`——不产 remedy、不产任何金额。**

**门槛：**
1. 同一输入重放不重复写 issue（§9 DoD 第 7 条，`UNIQUE(machine_namespace, host,
   instance_fingerprint)`）；
2. 每条 issue 带 basis 三元组 + `classification`（§2.4.1），且**绝大多数落
   `opportunity` / `suspected`**——`confirmed` 在本版**没有合法来源**（`waste_reviews`
   要到 v0.12.0 才有），因此本版 `classification='confirmed'` 的行数必须为 **0**；
3. issue 能下钻到产生它的 `fact_id` 集合。

> **为什么值得单独一版**：它是第一次往库里写**状态**（issue 有生命周期、会被
> acknowledge/close）。状态机的幂等与去重是独立于金额的风险面，先单独跑稳。

### v0.12.0（原 B 的后半）：Savings —— 只估算，不执行

- **waste 规则跨宿主化**（§2.4.5，本版硬前置）；
- remedy catalog（`assets/remedies.json`，种子 = `plan::build_plan`）；
- `potential` savings + preview；
- **Savings 页面**（三档分栏 + 审计覆盖率同屏，§5.2）；
- schema v4：`issue_remedies` + `waste_reviews` + `outcome_measurements` +
  `action_receipts`（后者建表但不写，见 §10.4）。

**门槛：**稳定问题族 remedy coverage 100%，其余显式 `diagnostic-only`；
`potential` 的派生严格按 §2.2.1（**不得用 `nominal_cost − metered_spend`**）；
跨 issue_type **不出合计**（§2.4.3，除非 `WasteClaim` 互斥证明已落地）。

**三项开工前置**（§12.2 / §12.3）：
1. **计价权归属决策**（§13 第 57 条）——六宿主里三个已自报成本，会改数据模型；
2. **语料建设**——Pi / Cline 各只有 1 个会话，不足以写 adapter；
3. **waste 跨宿主化**——否则四个核心宿主里三个的 Savings 页面是空的。

### v0.13.0（原 C）：Action & Outcome


- 授权、preview、apply、rollback 与 `ActionReceipt`；
- baseline/comparison、actual outcome 与 `realized` savings；
- 低风险方案端到端闭环。
- **无 schema 变更**——v4 已建好 `action_receipts`，本版只启用写路径。

**门槛：**发现 → 预览 → 授权执行 → 回执 → 结果验证可重放、可回滚。

> **范围待 PM 拍板（R2 提出）**：v0.13.0 是唯一不可逆的版本。建议首批只做 §4 点名的
> 「禁用长期未触发且证据充分的 Skill」**一条**，把 preview→approve→apply→receipt→verify
> 骨架跑通再扩 catalog；§9 DoD 第 10 条的「至少三个」相应降为「至少一个」，另两条挪
> v0.10.1。

### 之后：可选 LLM 补盲

独立 feature；不阻塞 A–C。需实现 evaluator registry、**新建的会话正文脱敏管线（§3）**、
预算、缓存、schema validation 和明确 unavailable 状态。

> **已定（R2.4）**：不进 v0.10–v0.13 任一版，作为独立 feature 另行立项。理由：它需要新建一条带
> 属性测试的脱敏管线（§3，非复用），而 §3 自己声明它「默认关闭、不阻塞 A–C」——那就不
> 应占用前面版本的 schema 位。`llm_evaluator_cache` 随它走 schema v5。

### 7.5 拆分带来的三个直接好处

1. **v0.10.0 不动 schema。** 它需要的全部数据都是从 `UsageFact` / `CanonicalSession`
   现算的派生量（§10.3），**一张新表都不需要**——迁移风险为零，可以先发。
2. **不可逆动作被隔离到最后一版。** v0.13.0 是唯一会改用户环境的版本，可以给它单独的
   评审与灰度节奏，不被前三版的进度绑架。
3. **被证据阻塞的工作被隔离到 v0.12.0。** 语料建设与计价权决策只挡这一版，
   v0.10.0 / v0.11.0 可以并行推进。

原「阶段规模提示」的判断依然成立并已落实：§6.2 的 10 个 service + 6 张状态表 +
3 个新 tab + 执行回滚闭环，参照 v0.9 → v0.9.1 的真实节奏就是 2–3 个版本的量。

## 8. 明确不做

- 不做 Phoenix/Jaeger 的完整替代品；
- 不把缺失 parent/time/status 的日志伪造成完整分布式 trace；
- 不默认上传提示词、会话正文或工具结果；
- 不默认修改或删除 Skill、配置、项目文件；
- 不做主动 MCP 健康探测；
- **不引入新的运行时状态库**（v0.9.1 已落地的 SQLite 权威库**是**本版本的事实来源，
  不在此列——原 R1 措辞「不把 DuckDB 引入为运行时第二状态库」易被误读为要清掉 SQLite）；
  TraceGraph builder 不维护独立持久层，所有派生数据从 UsageFact 重算，memo 仅在内存层
  （§7 v0.10.0 门槛 4 + §10.3）；
- 不在数据里存可执行内容（SQL 字符串、脚本）——remedy 的执行走代码注册 handler（§10.8）；
- 不以文件 watcher 的有无作为本版本发布条件。watcher 仅在 v0.9 durable ingest 稳定后另行立项。

## 9. 架构守卫与 Definition of Done

1. 图节点/边引用的 fact/evidence 必须存在；
2. 无证据 parent/time/status 不得由数组顺序或 mtime 补造；
3. EvaluationResult 必含 evaluator version、coverage 和 input fingerprint；
4. 每个稳定 Issue 映射 remedy 或 diagnostic-only；
5. 自动动作须有风险、授权、rollback、verification 与 ActionReceipt；
6. Potential/Validated/Realized savings 的字段与聚合路径严格分离；
7. **同一输入重放不重复写 issue、action 或 outcome。** 幂等键字段为 `instance_fingerprint`，
   派生规则 `fnv1a64_hex(source_identity::canonical_json(UsageFact[]))`——与 v0.9
   `UsageFact.fact_id` / `source_event_id` 同 `canonical_json` 序列化路径；同一输入必得
   同一指纹。落到 schema 上是 `issue_instances.UNIQUE(machine_namespace, host,
   instance_fingerprint)`（**不含 status**，见 §10.2.1 的说明）与
   `outcome_measurements` 的复合 UNIQUE（§10.2.5）；
8. CLI、Tauri、HTML 的关键 projection 一致；
9. LLM 默认关闭仍可完整使用产品，开启后费用可见且绝不直接触发修改；
10. 至少一个低风险方案端到端验证实际结果，不能只展示预计节省（原为「三个」，见 §7
    v0.13.0 范围说明）；
11. **savings 的每一个数字都必须能下钻到产生它的 `fact_id` 集合。** 不能下钻的数字就是
    不能对账的数字——这是把 §2.2.1 那类口径错误挡在发布之外的唯一可操作手段。

### 9.1 继承 `ATTRIBUTABLE_WASTE` §8 的诚实性铁律（**R2.1 新增**）

以下 9 条是该文档已写死的实现级约束，v0.10 全部继承；每一条都对应本 spec 曾经或可能
犯的错：

1. **证据不足 = 不计**。分子只收 `measured`（attribution 可证明）或稳定 `human-confirmed`；
   其余进「估算机会」「待复核」，**永远不在分子**（§2.4.1）。
2. **触发证据缺失 ≠ 零触发**（W4）；**首个请求无前缀 ≠ 缓存 bug**（W1）；**长尾 ≠ 全浪费**
   （W3）；**影子记录 ≠ 双倍计费**（`accounting_shadow`，§2.4.2）。
3. **标签不因措辞转化**——basis 三字段分离，「命中率低」是观察，「缓存坏了」是结论，
   互相不许代写。
4. **反事实隔离**——允许展示明确标为 `estimated` / `benchmark-counterfactual` 的机会，
   但**绝不把「若不优化会花 X」写成生产实付节省或放进 confirmed 分子**。
   *（R1 的 `potential = nominal_cost − metered_spend` 正是违反本条，见 §2.2.1 硬规则 1。）*
5. **baseline 必须带语料期标签**——DSH 08-18 前数据（bug 期）不进任何计算；Claude Code
   语料无已知事故分界，只做结构不做前后对照。v0.10 的 `outcome_measurements.baseline_*`
   窗口必须能声明其语料期，落在 bug 期的 baseline 不得用于 realized 计算。
6. **无基线不告警（FR-05）**——结构性浪费（SV-COST）与相对浪费（缓存）分开；混进来
   用户会觉得系统冤枉自己的正常行为。
7. **分母诚实**——浪费率不用总成本作分母，审计覆盖率必须同屏（§5.2）。
8. **Host ≠ BillingSource**——执行入口不决定收费方；混合路由逐 usage 归属，归属未知就
   `unavailable`。这与 v0.9 的「归属粒度是 (host, provider) 而非 host」同源。
9. **感知不冒充归因**——cost/M 是摊销/混合效率指标，不能单凭变高变低证明浪费（§5.1）。

## 10. schema 增量（v3 / v4 / v5，按版本分期见 §10.4）

> 本节定义 v0.10.0–v0.13.0 在 v0.9.1 schema v2 之上的持久化增量；派生数据（TraceGraph /
> MetricDefinition result / EvaluationResult / TraceCoverage）一律不入 schema，从
> UsageFact 重算。**`v0.10.0` 本身不新增任何表**（schema 停在 v2）。

### 10.1 设计原则（与 v0.9.1 数据面对齐）

- **权威在 JSONL**：`<data_home>/facts/<host>.jsonl` 是 append-only 权威源，本规则不破。
- **SQLite 权威库是唯一读路径**（v0.9.1 Phase 4.3 后）；新表只持久化需要状态机的实体
  （IssueInstance / ActionReceipt / OutcomeMeasurement），可从 UsageFact 重算的派生数据
  **一律不入 schema**。
- **幂等键统一**：所有新表主键与 `UNIQUE` constraint 用
  `fnv1a64_hex(canonical_json(...))` 派生，规则与 `source_identity::canonical_json` 一致
  ——§9 DoD 第 7 条在 schema 层的落地。
- **派生数据不持久化**：走「现算 + 60s memo」（§7 v0.10.0 门槛 4；失效条件见那里的修正）。
- **schema bump 是纯增量**：v0.10 不修改 v0.9.1 schema v2 任何已有表，迁移函数只
  `CREATE TABLE / INDEX`。
- **新表一律带 `machine_namespace`**：v0.9 的事实层按 `machine_namespace` 隔离
  （`source_identity` 隐私护栏）。issue / receipt / outcome 不带这个维度，多机同步或导出
  时会串。

### 10.2 新增表（6 张状态表 + 1 张可选 cache）

> remedy catalog **不入库**，见 §10.8。

#### 10.2.1 `issue_instances`（v0.11.0，根因归并）

```sql
CREATE TABLE issue_instances (
    issue_id TEXT PRIMARY KEY,             -- fnv1a64_hex(canonical_json(machine_namespace, host, issue_type, instance_fingerprint))
    machine_namespace TEXT NOT NULL,
    host TEXT NOT NULL,                    -- claude-code / codex / dsh / 'aggregate'
    session_key TEXT NOT NULL DEFAULT '',  -- aggregate-level issues 不绑会话时写空串（参与 UNIQUE 语义域）
    issue_type TEXT NOT NULL,              -- 根因族 id（zombie_skill / duplicate_tool_call / ...）
    severity TEXT NOT NULL,                -- critical / warning / info
    status TEXT NOT NULL DEFAULT 'open',   -- open / acknowledged / closed / wontfix
    CHECK (status IN ('open','acknowledged','closed','wontfix')),
    title TEXT NOT NULL,
    summary TEXT,
    root_cause TEXT,
    instance_fingerprint TEXT NOT NULL,    -- fnv1a64_hex(canonical_json(UsageFact[]))
    -- basis 三维 + classification 四态（§2.4.1，继承 ATTRIBUTABLE_WASTE §3）
    measurement_basis TEXT NOT NULL,       -- measured / derived / estimated / unavailable
    CHECK (measurement_basis IN ('measured','derived','estimated','unavailable')),
    attribution_basis TEXT NOT NULL,       -- evidence-confirmed / inferred / benchmark-counterfactual / human-confirmed / none
    CHECK (attribution_basis IN ('evidence-confirmed','inferred','benchmark-counterfactual','human-confirmed','none')),
    classification TEXT NOT NULL,          -- confirmed / opportunity / suspected / review
    CHECK (classification IN ('confirmed','opportunity','suspected','review')),
    opened_at_ms INTEGER NOT NULL,
    closed_at_ms INTEGER,
    metadata_json TEXT,
    UNIQUE(machine_namespace, host, instance_fingerprint)  -- §9 DoD 第 7 条幂等性
);
CREATE INDEX idx_issue_host_status ON issue_instances(host, status);
CREATE INDEX idx_issue_session ON issue_instances(session_key);
```

> **R2 修正：`status` 不进 UNIQUE 键。** R1 写的是
> `UNIQUE(host, instance_fingerprint, status)`，与 `issue_id` PRIMARY KEY（不含 status）
> 键不同、两个约束直接打架；且按 UNIQUE 的语义，同一 issue 可同时存在 open /
> acknowledged / closed / wontfix 四行，状态流转会被实现成 INSERT 而非 UPDATE——**恰好是
> DoD 第 7 条的反面**。现在 `status` 是可变列，走 UPDATE。

#### 10.2.2 `issue_status_transitions`（v0.11.0，状态历史）

```sql
CREATE TABLE issue_status_transitions (
    transition_id TEXT PRIMARY KEY,        -- fnv1a64_hex(canonical_json(issue_id, from_status, to_status, at_ms))
    issue_id TEXT NOT NULL,
    from_status TEXT NOT NULL,
    to_status TEXT NOT NULL,
    at_ms INTEGER NOT NULL,
    actor TEXT NOT NULL,                   -- 'user' / 'cli' / 'tauri' / 'automation'
    note TEXT,
    FOREIGN KEY (issue_id) REFERENCES issue_instances(issue_id)
);
CREATE INDEX idx_transition_issue ON issue_status_transitions(issue_id, at_ms);
```

状态历史要留就留在这里，**不塞进幂等键**。

#### 10.2.3 `issue_remedies`（v0.12.0，Issue ↔ Remedy 关联）

```sql
CREATE TABLE issue_remedies (
    issue_id TEXT NOT NULL,
    remedy_id TEXT NOT NULL,                      -- 引用 assets/remedies.json 的稳定 id（无 FK，catalog 不在库里）
    remedy_version INTEGER NOT NULL,              -- catalog 条目版本，随 potential 估算一起冻结
    plan_status TEXT NOT NULL DEFAULT 'pending',  -- pending / previewed / approved / applied / rolled_back
    CHECK (plan_status IN ('pending','previewed','approved','applied','rolled_back')),
    potential_savings_basis TEXT NOT NULL,        -- 'nominal_cost' / 'metered_spend'（§6.7 口径）
    potential_savings_amount_minor INTEGER,       -- NULL = 未测量；订阅型走 tokens 档
    potential_savings_tokens INTEGER,
    potential_savings_currency TEXT,              -- 'CNY' / 'USD'
    potential_savings_coverage TEXT NOT NULL,     -- coverage / partial / unavailable
    CHECK (potential_savings_coverage IN ('coverage','partial','unavailable')),
    created_at_ms INTEGER NOT NULL,
    PRIMARY KEY (issue_id, remedy_id),
    FOREIGN KEY (issue_id) REFERENCES issue_instances(issue_id)
);
```

`potential` 按 §2.2.1 派生（**不是** `nominal_cost − metered_spend`）。

#### 10.2.4 `action_receipts`（v0.12.0 建表 / v0.13.0 启用写入）

```sql
CREATE TABLE action_receipts (
    receipt_id TEXT PRIMARY KEY,           -- fnv1a64_hex(canonical_json(...))
    machine_namespace TEXT NOT NULL,
    issue_id TEXT NOT NULL,
    remedy_id TEXT NOT NULL,               -- catalog 引用，无 FK
    remedy_version INTEGER NOT NULL,
    actor TEXT NOT NULL,                   -- 'user' / 'cli' / 'tauri' / 'automation'
    actor_id_hash TEXT,                    -- 人类标识必须 hash（source_identity::fnv1a64_hex），不得明文
    action_target_json TEXT NOT NULL,      -- 修改目标（脱敏后；导出规则见 §10.9）
    action_fingerprint TEXT NOT NULL,      -- 修改前后状态 hash
    executed_at_ms INTEGER NOT NULL,
    result TEXT NOT NULL,                  -- success / failed / rolled_back
    CHECK (result IN ('success','failed','rolled_back')),
    rollback_receipt_id TEXT,              -- NULL = 未回滚（FK 形状用 NULL，见 §10.6）
    verification_result_json TEXT,
    FOREIGN KEY (issue_id) REFERENCES issue_instances(issue_id),
    FOREIGN KEY (rollback_receipt_id) REFERENCES action_receipts(receipt_id)
);
CREATE INDEX idx_action_issue ON action_receipts(issue_id);
CREATE INDEX idx_action_executed_at ON action_receipts(executed_at_ms);
```

#### 10.2.5 `outcome_measurements`（v0.12.0，三档严格分离）

```sql
CREATE TABLE outcome_measurements (
    outcome_id TEXT PRIMARY KEY,
    machine_namespace TEXT NOT NULL,
    issue_id TEXT NOT NULL,
    receipt_id TEXT,                       -- NULL = baseline 测量（执行前），FK 形状用 NULL
    metric_id TEXT NOT NULL,
    metric_version TEXT NOT NULL,          -- §2.3：定义版本，跨版本不出数
    pricing_snapshot_id TEXT,              -- §2.3：引用既有 pricing_snapshots 表
    -- baseline 窗口（历史快照）
    baseline_window_start_ms INTEGER NOT NULL,
    baseline_window_end_ms INTEGER NOT NULL,
    baseline_value_minor INTEGER,
    baseline_currency TEXT,
    baseline_tokens INTEGER,
    -- observed 窗口
    observed_window_start_ms INTEGER NOT NULL,
    observed_window_end_ms INTEGER NOT NULL,
    observed_value_minor INTEGER,
    observed_currency TEXT,
    observed_tokens INTEGER,
    -- 严格只填一档：potential / validated / realized 绝不三档相加（§9 DoD 第 6 条）
    savings_basis TEXT NOT NULL,           -- 'nominal_cost' / 'metered_spend'
    pricing_basis TEXT NOT NULL,           -- §2.4.1：provider-reported / catalog-provider /
                                           --   catalog-fallback / user-reported-invoice /
                                           --   subscription-allocated / unpriced
    corpus_period TEXT,                    -- §9.1 铁律 5：语料期标签；bug 期 baseline 不得用于 realized
    savings_kind TEXT NOT NULL,            -- 'potential' / 'validated' / 'realized'
    CHECK (savings_kind IN ('potential','validated','realized')),
    savings_value_minor INTEGER,           -- NULL 仅表示「未测量」
    savings_tokens INTEGER,                -- 订阅型收益落这里（§2.2.1 硬规则 2）
    savings_currency TEXT,
    savings_coverage TEXT NOT NULL,        -- coverage / partial / unavailable
    CHECK (savings_coverage IN ('coverage','partial','unavailable')),
    counterfactual_note TEXT,              -- 反事实限制说明（跨币 / 跨版本 / 订阅型 均在此说明）
    source_fact_ids_json TEXT NOT NULL,    -- §9 DoD 第 11 条：可下钻到产生它的 fact_id 集合
    created_at_ms INTEGER NOT NULL,
    UNIQUE(issue_id, metric_id, metric_version, savings_kind,
           baseline_window_start_ms, observed_window_start_ms),
    FOREIGN KEY (issue_id) REFERENCES issue_instances(issue_id),
    FOREIGN KEY (receipt_id) REFERENCES action_receipts(receipt_id)
);
CREATE INDEX idx_outcome_issue ON outcome_measurements(issue_id);
CREATE INDEX idx_outcome_kind ON outcome_measurements(savings_kind);
```

#### 10.2.6 `llm_evaluator_cache`（LLM 版，schema v5——见 §7）

```sql
CREATE TABLE llm_evaluator_cache (
    cache_id TEXT PRIMARY KEY,             -- fnv1a64_hex(redacted_payload + evaluator_version)
    evaluator_id TEXT NOT NULL,
    evaluator_version TEXT NOT NULL,
    redacted_input_fingerprint TEXT NOT NULL,
    result_json TEXT NOT NULL,
    cost_minor INTEGER,
    cost_currency TEXT,
    created_at_ms INTEGER NOT NULL,
    expires_at_ms INTEGER NOT NULL         -- 默认 7 天
);
CREATE INDEX idx_llm_cache_expires ON llm_evaluator_cache(expires_at_ms);
```

> **R2 修正：建表不得 feature-gated。** R1 让迁移「若 feature 启用则建表」再统一置版本 3，
> 结果是 `schema_version=3` 的库有两种表集合；且**先以关闭态迁到 v3、之后再开 feature 的
> 机器永远不会建这张表**（迁移已跑过）。若该表随 v3 落地，则**无条件建表**（空表零成本），
> feature 只 gate 读写路径。**schema 版本必须唯一决定表集合。** 若按 §7 建议延后到 v0.11，
> 则它属于 schema v4，不进 v3。

#### 10.2.7 `waste_reviews`（v0.12.0，W3 人工确认记录）

`ATTRIBUTABLE_WASTE` §4 的 W3 明确：人工确认后记录的是**明确的浪费请求或金额**，不是
「整个异常 session」；且**不带 revision 与 reviewer 的确认记录，在 session 更新、价格表
更新或重复审核后无法复现**。该文档 §9 未落地第 4 条即本表。

```sql
CREATE TABLE waste_reviews (
    review_id TEXT PRIMARY KEY,            -- fnv1a64_hex(canonical_json(...))
    machine_namespace TEXT NOT NULL,
    issue_id TEXT NOT NULL,
    session_key TEXT NOT NULL,
    session_revision TEXT NOT NULL,        -- 无 revision 则复核不可复现
    confirmed_request_ids_json TEXT NOT NULL,  -- 具体请求，不是整个 session
    confirmed_amount_minor INTEGER,
    confirmed_currency TEXT,
    confirmed_tokens INTEGER,
    pricing_basis TEXT NOT NULL,           -- §2.4.1
    pricing_snapshot_id TEXT,              -- §2.3：价表更新后仍可复现
    reviewer TEXT NOT NULL,                -- 人类标识须 hash（§10.6）
    reviewed_at_ms INTEGER NOT NULL,
    rationale TEXT,
    UNIQUE(issue_id, session_key, session_revision, reviewer),
    FOREIGN KEY (issue_id) REFERENCES issue_instances(issue_id)
);
CREATE INDEX idx_review_issue ON waste_reviews(issue_id);
```

**这是 `attribution_basis='human-confirmed'` 的唯一合法来源**：没有对应
`waste_reviews` 行的 issue，不得把 `classification` 置为 `confirmed`（§2.4.1 准入规则）。

### 10.3 派生数据不入 schema（性能与权威性双约束）

| 契约 | 不入 schema 的原因 | memo/缓存策略 |
|---|---|---|
| `TraceGraph` | 从 CanonicalSession + usage_facts 现算 | 见 §7 v0.10.0 门槛 4（含失效条件的两个陷阱） |
| `MetricDefinition` result | 必须从 `domain::{cost,usage,evidence}` 派生（§2.2） | 60s memo，按 `(metric_id, metric_version, params_fingerprint, home)` 键控 |
| `EvaluationResult` | program evaluator（SV 规则）已是纯函数 | 同上 |
| `TraceCoverage` | 等价 v0.9 `evidence::Coverage`，从 CanonicalSession.coverage 派生 | 无需 memo，构造代价 O(1) |

**性能形状纪律**：派生层 memo 必须走 `Arc`——锁内深拷贝几 MB JSON 会把并发命令串行卡在
锁上（2026-09-05 工作台 tab 卡顿事故同形态，已修）。

**这条规则有实证依据，不是假设**：DSH 自己的插件走了相反的路——把投影**物化到磁盘**，
实测 `storages/` 的投影 **1.76 GB** 派生自 `sessions/` 权威源 **67 MB**，
**放大 26×**，单会话投影缓存最大 **183 MB**。而上述卡顿事故的起因只是「几 MB JSON」。
所以 v0.10 的 TraceGraph **既不得物化到盘，命中路径也不得深拷贝**
（`docs/DSH_HOST_ASSESSMENT.md` §1.2）。

### 10.4 schema 版本升级路径

> **R2 修正：本仓库不用 `PRAGMA user_version`。** R1 整节的机制在代码里不存在——全仓库
> 唯一一处 `PRAGMA user_version` 是 `hosts/dsh/sources.rs:31` 的注释，且明确说「不是它」。

真实机制（`crates/agent-vitals-data/src/authority.rs`）：

- 版本常量 `pub const SCHEMA_VERSION: i64 = 2;`（:33）；
- 版本值存在 **`schema_meta` 表**：`SELECT value FROM schema_meta WHERE key='schema_version'`；
- 升级逻辑在 `ensure_schema` 的版本比较分支（:401 `found.cmp(&SCHEMA_VERSION)`），低版本
  当前走 :98 的 `"authority schema v{found} is older than supported v{SCHEMA_VERSION}
  — run product migration"` 错误路径。

**按版本分期（R2.4，与 §7.0 版本地图一一对应）**：

| 版本 | `SCHEMA_VERSION` | 本版 `CREATE TABLE` |
|---|---|---|
| **v0.10.0** | **2（不变）** | **无**——TraceGraph 全部现算，一张表都不需要（§10.3） |
| **v0.11.0** | 2 → **3** | `issue_instances` · `issue_status_transitions` |
| **v0.12.0** | 3 → **4** | `issue_remedies` · `waste_reviews` · `outcome_measurements` · **`action_receipts`** |
| **v0.13.0** | 4（不变） | 无——只启用 `action_receipts` 的写路径 |
| LLM | 4 → **5** | `llm_evaluator_cache` |

> **为什么 `action_receipts` 提前到 v4 建表**：`outcome_measurements.receipt_id` 声明了
> `FOREIGN KEY … REFERENCES action_receipts(receipt_id)`。SQLite 允许建表时引用尚不存在的
> 表，但开启 `foreign_keys` 后写入即报错——**FK 顺序要求两张表同批建**。这与 §10.2.6 的
> F10 修正同一条原则：**建表不做条件化，用不用由读写路径 gate**；schema 版本必须唯一
> 决定表集合。

每次 bump 的落地动作相同：

1. 递增 `SCHEMA_VERSION` 常量；
2. 在 `ensure_schema` 的 `Ordering::Less` 分支实现该档迁移（只 `CREATE TABLE / INDEX`）；
3. 迁移过程写 `migrations` 表（checkpoint / error_detail，v0.9.1 已有）；
4. `UPDATE schema_meta SET value=<n> WHERE key='schema_version'`；
5. `data-migrate` 子命令接线；
6. **不动任何已有表**——每一档都是纯增量。

**部署纪律**：每次 schema bump 必走
`cp -r ~/.agent-vitals ~/.agent-vitals.backup-$(date +%Y%m%d-%H%M%S)` +
`data-status --json` 验证 `health: ok / integrity: ok / schema_version=3`。
权威库**不自愈**：`PRAGMA integrity_check` 失败 → `health: critical`，恢复 =
`rm agent-vitals.sqlite3* && agent-vitals data-migrate`（从 facts JSONL 幂等重放）。

### 10.5 retention 与 v0.9.1 一致

v0.9.1 retention 规则（13 个自然月，含当月，cutoff = current − 12，fencepost 已钉死；
共享 `sql_sync::RETENTION_MONTHS_MINUS_ONE`）扩展到 v0.10 新表：

| 表 | retention 策略 |
|---|---|
| `issue_instances` | 13 个月；`status='open'` 行不过期 |
| `issue_status_transitions` | 随其 `issue_id` 一起清（父行不在则清） |
| `issue_remedies` | 13 个月 |
| `action_receipts` | 13 个月 |
| `outcome_measurements` | 13 个月 |
| `waste_reviews` | **不过期**——人工复核记录是 `confirmed` 分子的唯一凭据，清掉等于让历史确认浪费无法复现 |
| `llm_evaluator_cache` | 按 `expires_at_ms` 独立 sweep，不走 13 个月 fencepost |

`sync_facts` 每天首轮在 `.ingest.lock` 内自动跑一次 sweep；
`ingest_service::enforce_retention` 新增上述分支。解析不出 YYYY-MM 的行按 undated 保留。

### 10.6 与 v0.9.1 既有不变量对齐

| v0.9.1 规则 | v0.10 新表落地 |
|---|---|
| fact_id = `fnv1a64_hex(canonical_json(...))` | `issue_id` / `receipt_id` / `outcome_id` / `transition_id` 同款 |
| 货币一律 minor units | `*_value_minor INTEGER` + `*_currency TEXT` 拆分 |
| 跨币不得相加（§6.7） | `baseline_currency` ≠ `observed_currency` 时 `savings_value_minor` 置 NULL **并且** `savings_coverage='unavailable'` + `counterfactual_note` 说明。**只置 NULL 不够**——NULL 在本表已表示「未测量」，聚合 `SUM` 会把两种情形静默合并，又一次「不完整却不标记」 |
| retention 13 个月 + undated 保留 | 见 §10.5 |
| writer lease O_EXCL + atomic rename | 新表写入走 `runtime::lease` 同接口；临界区必须短，慢 fold/emit 在锁外 |
| `unaccounted_usage` residual sentinel | `savings_coverage` / `potential_savings_coverage` 同语义：三态 `coverage` / `partial` / `unavailable`，**绝不填 0 假装完整** |
| 敏感标识必须 hash | `action_receipts.actor_id_hash` 走 `source_identity::fnv1a64_hex`，与 `native_session_id` / `machine_namespace` 同护栏 |

**空串 vs NULL 的适用边界（R2 收窄）**：v0.9 那条「evidence_ref 不用 NULL」的**理由**是
SQLite 的 `UNIQUE` 把多个 NULL 视为互不相同，可空列进了 UNIQUE 键就会击穿去重。因此：

- **参与 UNIQUE 键的可空列** → 写空串（如 `issue_instances.session_key`）；
- **FK 形状的可空列** → 用 NULL（`action_receipts.rollback_receipt_id`、
  `outcome_measurements.receipt_id`）。`''` 会破坏引用完整性、让 `IS NULL` 语义失效，
  并在补上 FK 时直接违反。

这条规则**不是全局的**，不要 cargo-cult 到所有可空列上。

### 10.7 关键风险（v0.12.0 / v0.13.0 review 时逐条检查）

1. **`issue_remedies.potential_savings_*` 与 `outcome_measurements.savings_*` 口径严格
   区分**：前者是 pre-execution 估算（`kind='potential'`），后者是 post-execution 测量
   （`'validated'` / `'realized'`）；同一 SQL 查询不得 `SUM` 两者（§9 DoD 第 6 条）。
2. **`savings_kind` 必须是 enum CHECK constraint**（已加）：避免 typo `'realised'` 导致
   聚合错位——「形状来源纪律」的直接应用。
3. **remedy 的 `applies_via` 不得是可执行文本**，且必须经 `action_service` 走
   preview → approve → apply → receipt → verify；runtime 不得跳过（§10.8）。
4. **`actor_id_hash` 必须 hash 而非明文**（§10.6）。
5. **LLM evaluator 的 payload 必须先经 §3 新建的会话正文脱敏管线**，不得复用扫描器
   `redact()`，不得自行脱敏；cache 只存 `result_json` + 指纹，原始 payload 不入表。
6. **`potential` 不得用 `nominal_cost − metered_spend` 计算**（§2.2.1 硬规则 1）——这是
   R1 的原始定义，R2 已推翻；review 时逐个 remedy 核对其 potential 的派生来源。

### 10.8 remedy catalog 不入库（**R2 修正**）

R1 把 catalog 建成 `remedy_definitions` 表，并在 `applies_via_json` 里存
`{kind:'sql', sql:'...'}`。两个问题：

1. **catalog 是代码版本化的业务规则，不是用户状态。** 它的种子就是 `plan::build_plan`
   纯函数（§2.2.2）。放进 SQLite 会让代码与 DB 在升级后口径不一致，而 R1 又给它豁免
   retention，于是陈旧条目永久存活。
2. **存可执行 SQL 让 catalog 变成可执行内容**：一行被改写的 DB 记录就是对权威库的任意
   SQL。这与本仓库的核心立场（审计供应链风险的 skill 自己不能在扫描时拉第三方代码）方向
   相反，也绕过了已有的 `safe_query.rs` 授权器——它连**只读**查询都要按列拒绝。

R2 的做法：

- catalog 与 `assets/pricing.json` 同待遇——落 **`assets/remedies.json`**（Rust 侧
  `include_str!`，Python/TS 侧读各自副本，按 `tests/test_pricing_lockstep.py` 同款
  byte-compare 守副本一致）；
- DB 只存 `remedy_id` + `remedy_version` 引用，**无 FK**；
- `applies_via` 是**代码注册的 handler 枚举** + 参数 JSON，例如
  `{"kind": "disable_skill", "params": {...}}`；runtime 按 `kind` 分派到编译进二进制的
  实现。**DB 与资产文件里永远不存可执行文本。**
- catalog 条目字段：`remedy_id` / `name` / `description` / `applicable_issue_types` /
  `risk_level`（§4 禁止 high 默认）/ `requires_preview` / `requires_rollback_capability` /
  `applies_via` / `verification` / `rollback` / `version` / `enabled`。

### 10.9 导出双路径必须覆盖新表（**R2 新增**）

v0.9.1 §6 明令导出是两个独立函数/两个 CLI 子命令（`data-export-private` 原样 /
`data-export-redacted` 伪名化），不是一个 `redacted: bool`。v0.10 新表引入了 5 个自由
文本字段，是新的导出泄漏面：

| 字段 | redacted 路径的处理 |
|---|---|
| `issue_instances.title` | 保留（模板化文案，不含用户数据） |
| `issue_instances.summary` / `root_cause` | 走身份字段伪名化；含路径/skill 名的部分按 `redact_names` 最长优先替换 |
| `issue_instances.metadata_json` | 整体丢弃（形状不受控） |
| `action_receipts.action_target_json` | 身份字段 fnv1a64 伪名化后保留结构 |
| `outcome_measurements.counterfactual_note` | 保留（口径说明，不含用户数据） |

`source_fact_ids_json` 里的 fact_id 经契约层重 stamp（与 v0.9.1 `fact_id` 重 stamp 同规则）。

## 11. 与 v0.9/v0.9.1 已落地代码的对账结论

R1 §11 是一份「待合并 patch」影子章节：同一件事在文档里有两处描述（§2–§9 原文 + §11 的
「改哪里/改成什么」），读者必须在脑子里做 patch 才能得到真实规格——这正是本仓库反复警告
的多副本漂移形态（`pricing.json` 三副本要靠 lockstep 测试守，就是因为副本必然漂）。

**R2 已把 R1 §11.1–§11.11 全部并入 §2–§9 正文**，并在合并过程中修正了其中对 main 的错误
引用。为免再次误用，把这些**不存在的符号**记在这里：

| R1 §11 写的 | main 上的事实 |
|---|---|
| `PRAGMA user_version` 升级路径 | 不用该机制；真实是 `schema_meta` 表 + `SCHEMA_VERSION` 常量 + `ensure_schema` 分支（§10.4） |
| `runtime::summary::codex_merged_cached`（60s memo 参照实现） | 不存在。真实是 `codex_merged_from_sql`（`summary.rs:1305`），且**已无 memo**——v0.10 的 memo 是新建的（§7） |
| `session_facts` 表 | 不存在。会话事实在 `usage_facts`（authority 库共 13 张表，§7） |
| `MAX(fact_id)` 作变更计数器 | `fact_id` 是 `"uf1-" + fnv1a64_hex(...)`，对哈希取 MAX 永不失效（§7） |
| `agent_vitals_domain::cost::priced_token` | 不存在。cost 公开面见 §2.2 |
| `agent_vitals_domain::plan::rank` | 不存在。真实是 `plan::build_plan(report, startup_rate)` |
| `agent_vitals_domain::usage::usage_fold_state` | 是结构体 `UsageFoldState`，不是函数 |
| `contracts/canonical.rs` | 不存在。`CanonicalSession` 在 `contracts/evidence.rs` |
| `agent-vitals-data/src/store.rs` | 已退役（Phase 4.3 删 `index.sqlite3` / `FactsIndex`） |
| `agent-vitals-data/src/sql_sync.rs` | 在 runtime：`agent-vitals-runtime/src/sql_sync.rs` |
| `runtime/authority/` · `runtime/lease/`（目录） | 是文件：`sql_authority.rs` · `lease.rs` |
| `domain/{usage,evidence,behavior,plan}/`（目录） | 均为文件；`evidence` 在 **contracts/** 不在 domain/ |
| `agent_vitals.redact(redact_names=True, drop_description=True)` | 签名是 `redact(obj, names=False, name_map=None, *, home_n=None, cwd_n=None)`；且它是**扫描报告**脱敏器，不适用于会话正文（§3） |

CLAUDE.md 的「性能形状」段目前也还写着 `codex_merged_cached`，同属 v0.9.1 SQL 迁移后的
遗留，需一并订正。

## 12. 六宿主评估后的结论（2026-09-08）

R1 → R2.3 累计 71 条修改，全部围绕「让 spec 诚实」；六个宿主的一手实测
（claude-code / codex / dsh / pi / cline / hermes）之后，结论是**结构问题已经解决，
剩下的瓶颈不是架构，是证据**。

### 12.1 可以开工的：v0.10.0 与 v0.11.0

**v0.10.0（Trace & Metrics）已具备实施条件。** 它依赖的三样东西在所有核心宿主上都成立：
`CanonicalSession` 已落地、token 桶齐全、`(scope, ordinal)` 定序规则已与
`TRAJECTORY_TIMELINE_SPEC` 对齐（§2.1.1），且几何层复用既有 `buildGeometry`
（§2.1.2）不新增风险面。**它还不动 schema**（§10.4），迁移风险为零。

**v0.11.0（Issues）同样不被阻塞**——这是 R2.4 拆分挖出来的：原 v0.10-B 把「Issues 归并」
与「Savings 归因」捆在一起，而下面 §12.2 查明**只有后者被证据卡住**。IssueInstance 的
输入是已落地的 SV601–614，在所有核心宿主上都能跑；被卡的是只有 1/6 宿主实现的 SV-COST。

**两版都建议立即排期，不必等其余决策。**

### 12.2 被阻塞的：v0.12.0（Savings），且阻塞项不是 spec

| 阻塞 | 事实 | 后果 |
|---|---|---|
| **浪费族只有 1/6 宿主** | SV-COST-01/02 只实现在 `hosts/dsh/sessions/waste.rs` | Savings 页面在 claude-code / codex / pi / cline 上**是空的**——而 Savings 是 §0 北极星 |
| **两个核心宿主语料不足** | Pi = 1 会话 93 行；Cline = 1 会话 6 消息、**零工具调用** | 按这种语料写 adapter 就是照 fixture 编程；本仓库有明确前科（Codex 的假结论来自旧 fixture、渲染器手写形状「假绿」）。**同样挡 v0.11.0 的 pi/cline adapter，但不挡 v0.11.0 在 claude-code/codex/dsh 上先发** |
| **子代理可靠性差异未量化** | Cline 干净（`is_subagent` + `parent_agent_id` + queue）· DSH 实测 5/19 · Codex 只数不取 · Hermes 有列但 0 填充 · Pi 未观察 | `TraceGraph.parent_node_id` 只在 1 个宿主是 measured，其余需降级——降级规则尚未逐宿主写死 |

**这三条都不是写 spec 能解决的。** 结论：**v0.12.0 前应先做一轮语料建设**——
用每个核心宿主做一周真实工作，再复核 §2.5.4 的 `※` provisional 项。这比继续改 spec
便宜，也是唯一能解除阻塞的动作。

**R2.4 拆分后这三条只挡 v0.12.0 一版**：v0.10.0 与 v0.11.0 可以并行推进，
语料建设可以在它们开发期间同步进行——这正是拆版本换来的最大收益。

### 12.3 唯一仍然开放的架构决策：**谁拥有计价权**

这条已从「Pi 的个案」变成**趋势**：

| 宿主 | 自报成本 |
|---|---|
| **pi** | ✅ per-message `usage.cost{input,output,cacheRead,cacheWrite,total}` |
| **cline** | ✅ per-message `metrics.cost` + 会话级 `totalCost` / `aggregatedAgentsCost` |
| **hermes** | ⚠️ 有 `estimated_cost_usd` / `actual_cost_usd` / `cost_source` 列，**但全 0 未填** |
| claude-code / codex / dsh | ❌ 需我们用价卡算 |

**六个宿主里三个已经或即将自报成本。** 而 spec §2.2 现在写的是「cost metric 必须从
`domain::cost` 派生」——即**我们是计价权威**。这个立场正在变成少数派。

`pricing_basis` 词表（§2.4.1）里 `provider-reported` **本就排在 `catalog-provider`
之前**，所以词表是对的，**是管线没跟上**。

> **建议（§13 第 57 条，待 PM 拍板）**：宿主自报为权威，我们的价卡值降为**对账第二数**，
> 差额进 `data_quality_issues`，**不静默取其一**——与 v0.9「权威在 JSONL、索引是可丢弃
> 投影」同构。影响面：§2.2 · §2.4.1 · §10.2.5。**这是唯一还会改变数据模型的决策，
> 应在 v0.12.0 动工前定**（拆分后它不再挡 v0.10.0 / v0.11.0）。

### 12.4 宿主评估反向验证了 spec 的两条核心规则

不是新增约束，是把「假设」升级成「实证」：

1. **§10.3「派生数据不物化、命中走 `Arc`」**——DSH 走了相反的路：投影物化到盘，
   实测 `storages/` **1.76 GB** 派生自 `sessions/` **67 MB**（**26×**），单会话投影
   最大 **183 MB**。而 2026-09-05 卡顿事故起因只是「几 MB JSON」。
2. **§9.1 铁律 8「Host ≠ BillingSource」**——Cline 的
   `model="anthropic/claude-sonnet-5"` 但 `provider="shengsuanyun"`（中转）。
   按模型名前缀归到 Anthropic 计价就是编造。

另有两条**接入期数据陷阱**已写死为规则：Cline 的 `metadata` 块含与权威值冲突的过时字段
（§13 第 65 条）· Hermes 的 skill 三层嵌套致扁平扫描少报 87%（§13 第 60 条）。

### 12.5 文档卫生

本 spec 已 1,400+ 行、§12 changelog 71 条，超过部分正文章节的长度。
**建议 v0.10.0 首个 PR 时合并为 R3**：changelog 折叠成「R1→R2.3 摘要」一段，
正文保持单一叙述。理由与 §13 第 17 条（§11 影子章节）同源——**多份真相必然漂移**。

---

## 13. changelog

| # | 改动 | 位置 | 来源 finding |
|---|---|---|---|
| 1 | `potential` 定义从 `nominal_cost − metered_spend` 改为「归因浪费 × 同 basis 价卡」；订阅型改为产 token 档 potential + money `unavailable` | §2.2.1 | F1（P0） |
| 2 | `issue_instances` 的 UNIQUE 去掉 `status`，新增 `issue_status_transitions` 表 | §10.2.1 / §10.2.2 / §9 第 7 条 | F2（P0） |
| 3 | memo 失效条件从 `MAX(fact_id)` 改为 `(COUNT(*), MAX(rowid))`；表名 `session_facts` → `usage_facts`；加守卫测试要求 | §7 / §10.3 | F3（P0） |
| 4 | `outcome_measurements` 增 `metric_version` / `pricing_snapshot_id` 并入 UNIQUE 键 | §2.3 / §10.2.5 | F4（P0） |
| 5 | schema 升级路径改写为 `schema_meta` + `SCHEMA_VERSION` + `ensure_schema` 分支 | §10.4 | F5 |
| 6 | §6 基座层目录树按 main 全面订正，加「已退役勿引用」 | §6.1 | F6 |
| 7 | 删除对 `codex_merged_cached` 的参照，明确 memo 是 v0.10 新建 | §7 | F7 |
| 8 | 订正 `cost::priced_token` → 真实公开面；`plan::rank` → `build_plan`；`usage_fold_state` → `UsageFoldState` | §2.2 / §2.2.2 | F8 |
| 9 | LLM 脱敏从「复用扫描器 redact」改为「新建会话正文脱敏管线 + 独立属性测试」 | §3 | F9 |
| 10 | `llm_evaluator_cache` 改为无条件建表（若随 v3 落地），feature 只 gate 读写 | §10.2.6 | F10 |
| 11 | `applies_via` 从 SQL 字符串改为代码注册 handler 枚举 | §4 / §10.8 | F11 |
| 12 | `remedy_definitions` 表删除，catalog 移入 `assets/remedies.json` | §10.2 / §10.8 | F12 |
| 13 | 空串 vs NULL 规则收窄到「仅参与 UNIQUE 键的列用空串」 | §10.6 | F13 |
| 14 | 跨币从「置 NULL」改为「置 NULL + coverage `unavailable` + note」 | §2.2.1 / §10.6 | F14 |
| 15 | 删除单值 `coverage_ratio`，保留三计数（如需概览数字则 display-only） | §2.1 | F15 |
| 16 | tab 映射表补 Token 日历行；删除 `behaviorFindings` → `issueFindings` 改名 | §5 | F16 |
| 17 | §11 patch 章节并入 §2–§9 正文，原 §11 改为对账结论 + 本 changelog | 全篇 | F17 |
| 18 | 新表全部加 `machine_namespace` | §10.1 / §10.2 | 补充项 |
| 19 | 新增 §10.9 导出双路径覆盖新表 | §10.9 | 补充项 |
| 20 | DoD 新增第 11 条「savings 可下钻到 fact_id」；新增 `source_fact_ids_json` 字段 | §9 / §10.2.5 | 补充项 |
| 21 | 范围建议：v0.10-D 降 v0.11 候选、v0.10-C 首批 1 条 remedy、DoD 第 10 条 3 → 1（**待 PM 拍板**） | §7 / §9 | 范围 |

### R2 → R2.1（接入 `ATTRIBUTABLE_WASTE.md` 修订稿 v3）

R2 把「浪费」当成一个待定义的新概念来写，但 `docs/ATTRIBUTABLE_WASTE.md`（2026-09-02）
已经是该概念的**真相源**，且其 v1 被评审推翻的三处 P0 与本 spec R1 犯的是同类错误。
R2.1 全面继承其词表与铁律，**不另起炉灶**。

| # | 改动 | 位置 | 来源 |
|---|---|---|---|
| 22 | 新增 §2.4：basis 三维（measurement / attribution / pricing）+ classification 四态，含逐 issue 族 basis 真值表与「进确认分子」准入规则 | §2.4.1 | ATTR §3 / §8 铁律 1 |
| 23 | `potential` 新增硬规则 7/8：**跨 issue_type 也不得相加**（归因粒度不同 + 无 token-span 血缘）；`potential` 是否允许存在由 basis 三元组决定 | §2.2.1 / §2.4.3 | ATTR §2 |
| 24 | issue_type 改为**封闭词表**（8 族，从 W1–W4 / SV-COST / SV611 派生），含恒为零的 `accounting_shadow`（主动排除的会计类别，防止影子记录被当双倍计费） | §2.4.2 | ATTR §4 |
| 25 | 点明 §4 首批 remedy「禁用僵尸 Skill」属 W4、basis=(estimated, none)，**不能产 money 口径确认节省**，只能呈现为估算机会 | §2.4.1 | ATTR §4 W4 |
| 26 | 新增 §5.1 三层指标（感知/诊断/归因）↔ tab 对应；**撤销 R2 给 Overview 加的「可避免浪费」数字 tile**（感知层不得展示归因层数字），改为跳转入口 | §5.1 | ATTR §1 / §8 铁律 9 |
| 27 | 新增 §5.2 两个护栏必须同屏；浪费率分母是 eligible audited spend/usage **不是总成本**；比率须标 `basis=spend\|usage`；套餐费不得摊成伪单价 | §5.2 | ATTR §1 / §8 铁律 7 |
| 28 | 新增 §9.1：继承 9 条诚实性铁律为 DoD。其中铁律 4「反事实隔离」独立证实了 F1 的判断；铁律 5「baseline 须带语料期标签」为新增约束 | §9.1 | ATTR §8 |
| 29 | `issue_instances` 增 `measurement_basis` / `attribution_basis` / `classification` 三列 + CHECK | §10.2.1 | ATTR §3 |
| 30 | `outcome_measurements` 增 `pricing_basis` / `corpus_period` | §10.2.5 | ATTR §3 / §8 铁律 5 |
| 31 | 新增 §10.2.7 `waste_reviews` 表（session_revision / confirmed_request_ids / reviewer / reviewed_at）——`human-confirmed` 的唯一合法来源，retention 豁免 | §10.2.7 / §10.5 | ATTR §4 W3 / §9 未落地 4 |
| 32 | 新增 §2.4.4：把 ATTR §9 的 8 条未落地项映射为 v0.10 前置 backlog（其中 5 条是 B/C 硬前置） | §2.4.4 | ATTR §9 |
| 33 | **新增实施风险 §2.4.5**：`SV-COST-01/02` 的实现只在 `hosts/dsh/sessions/waste.rs`（DSH-only），而 v0.10-A 门槛是三宿主——waste 规则跨宿主化是 v0.10-B 里最易漏排的工作量，R1/R2 均未提及 | §2.4.5 | 代码核实 |

> **互相印证的一条**：ATTR §9 未落地第 8 条「pricing card 加 effective date + 月投影引用
> `pricing_version`，防止当前价表静默重写历史」与 R2 审查 F4 独立推出的
> `pricing_snapshot_id` 是同一结论——两条不同路径得到同一约束，可信度较高，建议优先实现。

### R2.1 → R2.2（TraceGraph ↔ timeline_series 对账）

完整对账见 `docs/TRACEGRAPH_TIMELINE_RECONCILIATION.md`。核心结论：**TraceGraph 是
timeline_series 的原像**，timeline_series = `project(TraceGraph, linearization)`；而
`TRAJECTORY_TIMELINE_SPEC` §4 设计过、但**实现侧从未落地**的 5 个诚实性字段，R2.1 的
TraceGraph 同样一个都没有——两份文档独立地漏掉了同一层。

| # | 改动 | 位置 | 来源 |
|---|---|---|---|
| 34 | `TraceNode` 增 `scope` / `ordinal` / `native`——**权威顺序是 `(scope, ordinal)`，时间戳永不参与排序**（时钟漂移/resume/backfill）；`started_at_ms` 降级为展示与分桶副属性 | §2.1 / §2.1.1 | F-T1（P0） |
| 35 | `TraceNode` 增 `branch_state`、`TraceCoverage` 增 `unmetered_nodes`——三宿主日志都有用户放弃的路径，废弃分叉进 unmetered **不归零不静默合并**；线性化信号读宿主的（`leafUuid`/`thread_rolled_back`/`seedLength`），不发明 | §2.1 / §2.1.1 | F-T2（P0） |
| 36 | 澄清「不得自造 ID」= **不得自造 join 键**：`node_id` 是合成主键（幂等用），跨 scope 关联**只走 `native`** | §2.1 | F-T3 |
| 37 | 量值从 `metadata` 拆出为 `values`，**缺的键不出现**（不是填 0/null）——`Unavailable ≠ MeasuredZero` 的呈现侧镜像 | §2.1 | F-T4 |
| 38 | `TraceNode` / `TraceEdge` 各增 `provenance`（measured/derived/lossy）——node 级 provenance 与 §2.4.1 的 issue 级 basis 三元组**不能互相代替**；DSH `parentSession` 实测 5/19 可靠，subagent 边尤其需要 | §2.1 | F-T5 / F-T6 |
| 39 | **新增 §2.1.2 + §7 门槛 5：Traces tab 必须复用既有 `buildGeometry`，仓库内几何实现数量保持为 1**。2026-09-01 刚把两份折线图收敛成一份，新增即复刻「比例尺算错了不报错」的原始风险 | §2.1.2 / §7 | 对账 §3 |
| 40 | §7 门槛 6：节点排序走 `(scope, ordinal)` 不得按时间戳；`branch_state != live` 计入 unmetered | §7 | F-T1/F-T2 |
| 41 | 新增 §6.3 三层归属表（数据准备/几何/渲染壳）；**`vitals-core/graph.rs` 只放无语义图原语**——`dependency_boundary.rs` 的两条 domain-free 断言会因 trace/timeline 词汇变红 | §6.2 / §6.3 | 对账 §3 |
| 42 | `task_id` 按三分法区分（`/goal` 文本 / 结构化 task 跟踪 / Codex task=turn），只承载 turn，不再引入含糊字段 | §2.1.1 | 对账 §4 附注 |
| 43 | 撞名警告：`usage_fact.rs` 的 `time_basis:"native"` 是 basis 取值，与 `TraceNode.native`（宿主原生事件 id）是两个概念 | §2.1.1 | 对账 §1.3 |
| 44 | 订正 `TRAJECTORY_TIMELINE_SPEC.md` 状态头——「已全部落地」只对几何层成立 | 该文档头部 | 对账 §1.2 |
| 45 | **待办（未决）**：`Cost` 的 `Quota` 档在 v0.10 无承载类型，而 §2.2.1 硬规则 2 的「订阅型收益 = 配额余量」正是它——需接进 §2.2.1 或显式声明延后 | §2.2.1 | F-T7（P2） |

### R2.2 → R2.3（宿主接入契约）

R1/R2 的 v0.10-A 门槛写「至少三宿主」，但那正好是 `FACT_HOSTS` 里硬编码的三个；
spec 从未定义「第四个宿主怎么接」「接不进来的宿主看到什么」。R2.3 补上这一层。

| # | 改动 | 位置 | 依据 |
|---|---|---|---|
| 46 | 新增 §2.5：**三层参与度**（T1 账单级 / T2 证据级 / T3 事实级），明确只有 T3 受 `FACT_HOSTS` 封闭词表限制 | §2.5.2 | `ingest_service.rs:34,122` |
| 47 | 点明 **T1 已可用、零代码改动**：`host_bill_put`（`authority.rs:757`）不校验 host，`billing_basis` 的 `host_billed` 档正为按积分/额度计费的宿主准备 | §2.5.2 | `authority.rs:743-800` |
| 48 | 点明 **T2 的降级是声明式的**：新宿主只需加一条 `HostProfile`（`unmeasured_signals` + `degraded_rules`），**不需要改任何一条 SV 规则** | §2.5.2 | `host_capability.rs::HOSTS` |
| 49 | 新增 §2.5.3：v0.10 **每项能力的最低宿主要求 + 达不到时的诚实退化**（11 行表） | §2.5.3 | RUNTIME_EVIDENCE_CONTRACT §13 |
| 50 | 新增 §2.5.4：五个现有宿主的 T1/T2/T3 定位。**WorkBuddy = T1 可用 / T2 部分 / T3 明确排除**（用户决定 2026-09-03，且无 emitter、`session_store:false`、`fold:None`、`Signal::Usage` 在 unmeasured 里）；**OpenClaw 只有安装时扫描，无会话证据面** | §2.5.4 | `host_capability.rs` + hosts 目录实测 |
| 51 | 记下「**弱宿主不是全弱**」：WorkBuddy 有别人没有的 `NetworkAccess` / `SandboxModes` / hash 链 `ApprovalDecisions`，接入时不得按「能力总量」一刀切 | §2.5.4 | §13 矩阵 |
| 52 | 新增 §2.5.5 新宿主接入清单（T1/T2/T3 逐步），含**先决判断**：宿主不暴露 per-request token 就不该做 T3——硬凑会掉进 `MeasuredZero` 冒充 `measured` | §2.5.5 | evidence.rs 红线 |
| 53 | §7 v0.10-A 门槛 1 补一句：「三宿主」≠「多宿主」，第四个宿主走 §2.5 | §7 | 本节 |
| 54 | 记下 Codex 的 Legacy/Paginated **两套不兼容词汇是常态不是特例**，新宿主接入时按此预期 | §2.5.4 | §13 矩阵双列 |

> **与 §13 第 45 条合并的待决项**：`Cost` 四档里 `Credits`（WorkBuddy 积分）与 `Quota`
> （订阅配额余量）在 v0.10 均无承载类型。`Credits` 可由 T1 的 `host_bills.host_billed`
> 覆盖；`Quota` 仍缺——它正是 §2.2.1 硬规则 2「订阅型收益 = 配额余量」所需要的类型。

### R2.3 补记（Pi 宿主实测）

用 `~/.pi/agent/sessions/` 的真实语料验证 §2.5 的三层框架，评估见
`docs/PI_HOST_ASSESSMENT.md`。**框架成立**：Pi 不需要改任何 SV 规则或 spec 结构就能定位，
按 §2.5.5 逐步接入即可。但它同时暴露两个真缺口：

| # | 改动 | 位置 | 依据 |
|---|---|---|---|
| 55 | §2.5.4 加入 Pi 行（T1/T2/T3 全绿候选，语料仅 1 会话待扩） | §2.5.4 | 本机实测 93 行 |
| 56 | **`TraceNodeType` 增 `model_change`**——Pi 单会话 4 模型 5 次切换，模型切换是常态不是边缘情况；W1 要求排除切换边界（§2.4.1），边界必须在图上有节点 | §2.1 | 实测 |
| 57 | **待 PM 确认：`provider-reported` 成本的权威性**。Pi 是第一个自报 per-message 实付成本的宿主，§2.2 的成本管线却默认金额都由我们的价卡算出。建议宿主自报为权威、价卡值降为对账第二数、差额进 `data_quality_issues`，不静默取其一 | §2.2 / §2.4.1 | 评估 §4.1 |

> **接入优先级建议**：Pi 的 `~/.pi/agent/skills/*/SKILL.md`（4 个 skill）可以**先于**会话面
> 接入——那是本仓库的本职（静态体检），零风险、最先见效，且不受 `FACT_HOSTS` 限制。

### R2.3 补记二（Hermes 宿主实测）

`~/.hermes/` 的第一手实测（`RUNTIME_EVIDENCE_CONTRACT` §13 此前因无实例而缺席
Hermes），评估见 `docs/HERMES_HOST_ASSESSMENT.md`。三层框架再次成立，另得 4 条：

| # | 改动 | 位置 | 依据 |
|---|---|---|---|
| 58 | §2.5.4 加入 Hermes 行（T1 退化 / T2 强 / T3 可行）；记下它与 v0.9 归属决策的独立重合（主键含 `base_url`，比 `(host, provider)` 更细）与「schema 富、数据缺」 | §2.5.4 | `state.db` schema v23 实测 |
| 59 | **§2.5.3 能力表新增「工作区归属」行**：workspace root 缺失时依赖它的规则显式降级，**不得用 `cwd` 猜 repo root**。Hermes 实测 `git_repo_root` 填充 0/15、`cwd` 8/15，discord 会话的身份维度与 cwd 正交 | §2.5.3 | 评估 §6.1 |
| 60 | **接入前置：嵌套 skill 需路径式身份。** Hermes 的 `SKILL.md` 三层嵌套（12/76/4 = 92），扁平扫描只得 12，**少报 87%**；现有 dedup 键 `(namespace, name)` 会让跨 bundle 同名子技能撞键 | §2.5.4 | 实测深度分布 |
| 61 | **待评估（v0.10-C 前）：`estimated`/`actual` 双列 vs 单列 + basis 标签。** Hermes 两个成本各占一列 + `cost_status`/`cost_source` 解释来源；本 spec 用单列 + `savings_basis` 标签，而靠标签区分正是 §10.7 第 1 条担心的 `SUM` 误聚合温床 | §10.2.5 | 评估 §6.2 |

> **一条机会**：`~/.hermes/models_dev_cache.json` 是 models.dev 的本地缓存镜像——
> **213 provider / 7,561 模型 / 7,126 带价**，对照 `assets/pricing.json` 的四族目录是
> 数量级差距，直接对着 `unpriced_tokens` 缺口。**但它属 `catalog-fallback`**（§2.4.1
> `pricing_basis` 里最弱的已计价档），**不得冒充 `provider-reported` 或 `catalog-provider`**；
> 读本地已缓存文件不违反「扫描时不拉第三方代码」，但数据质量责任必须标在 basis 上。

### R2.3 补记三（产品范围收敛 + Cline 实测）

用户 2026-09-08 定产品范围：核心是 coding agent / work agent 产品线
（claude-code · codex · pi · cline · opencode），hermes / workbuddy / openclaw 降为
**参考类**（不写 adapter，用作降级设计的反例）。

| # | 改动 | 位置 | 依据 |
|---|---|---|---|
| 62 | §2.5.4 改写为「目标产品线与宿主定位」，三分为核心目标 / 已接入基座 / 仅供参考 | §2.5.4 | 产品决策 |
| 63 | 加入 Cline 行（T1/T2/T3 全绿，核心目标）。**其子代理模型是所有宿主里最干净的**——`is_subagent` / `parent_agent_id` / `agent_id` / `conversation_id` + `subagent_spawn_queue` 表 + `aggregatedAgentsCost` 子代理成本汇总；建议作为 §2.1 `TraceEdge` subagent 边的**参考实现**（对照 DSH `parentSession` 实测 5/19 可靠） | §2.5.4 / §2.1 | `docs/CLINE_HOST_ASSESSMENT.md` |
| 64 | 加入 opencode 行，标注**本机未安装**并列出已枚举的 4 条路径——按纪律不写二手形状 | §2.5.4 | 实测 |
| 65 | **新增接入规则：Cline 的 `metadata` 块含过时重复字段，与权威值冲突**（同一记录里 `metadata.modelId=claude-sonnet-4.6` vs 权威 `modelInfo.id=claude-sonnet-5`；`metadata.tokensIn=2` vs 权威 `usage.inputTokens=4763`）。权威取 `modelInfo` + `metadata.usage`，其余一律不读，**必须带 fixture 钉死**——「形状来源纪律」的活例 | 评估 §3 | 实测 |
| 66 | **Host ≠ BillingSource 的教科书案例**：Cline 的 `model="anthropic/claude-sonnet-5"` 但 `provider="shengsuanyun"`（中转）。按 `anthropic/` 前缀归到 Anthropic 计价就是编造；归属必须走 `provider`，且 `pricing.json` 目前**无 `shengsuanyun` billing route**，接入前需补，否则落 `billing-route-unknown` | §2.4.1 | 实测 |

> **DSH 的处置已确认（2026-09-08）**：它是**核心产品线宿主**，不退役。因此
> §2.4.5 的「waste 规则跨宿主化」保持为优化项而非阻塞项——但**四个核心宿主里另三个
> （claude-code / codex / pi / cline）拿不到 SV-COST 浪费族，Savings 页面在它们上面
> 会是空的**，跨宿主化仍应排进 v0.10-B。

### R2.3 补记四（DSH 定位更正 + 实测）

用户 2026-09-08 更正：**DSH 是核心产品线宿主**，不是「已接入基座」。实测见
`docs/DSH_HOST_ASSESSMENT.md`——它与其余四个核心宿主有五处结构性不同。

| # | 改动 | 位置 | 依据 |
|---|---|---|---|
| 67 | §2.5.4 把 dsh 并入**核心目标**行；删除「若收敛掉 DSH 则 waste 跨宿主化升为阻塞项」的待定项 | §2.5.4 | 产品决策 |
| 68 | **新增 T4「宿主内呈现」**：agent-vitals 在 DSH 里是注册进 `dsh.profile.bundles` 的一等 cordis 插件（与 `@deepseek-ai/dsh-base` 并列），其余四个核心宿主我们只是事后读日志。v0.10 的 Issues/Savings 可经既有 dual-face 插件直接进 DSH「审计」tab，不必只活在 Tauri 里 | §2.5.4 | `~/.dsh/profiles/web/package.json` |
| 69 | **§10.3 的「不物化 + Arc」规则补上实证依据**：DSH 走了相反的路（投影物化到盘），实测 `storages/` 投影 **1.76 GB** 派生自 `sessions/` 权威源 **67 MB**——**放大 26×**，单会话投影最大 **183 MB**；而 2026-09-05 卡顿事故起因只是「几 MB JSON」 | §10.3 | 实测 |
| 70 | 记下 DSH 另三处独有：**多帧 zstd 压缩增量存储**（唯一需解压的核心宿主）· **唯一 `StepBoundaries = measured`**（turn+step 双层粒度）· **唯一实现 SV-COST 浪费族** | §2.5.4 | §13 矩阵 + 实测 |
| 71 | 保留 §2.4.5 为 v0.10-B 优化项，但点明后果：**四个核心宿主里另三个 Savings 页面会是空的** | §2.4.5 | 本次 |

> **当前故障（阻塞 T4，需先修）**：Phase E1 把 `dsh/` → `integrations/dsh/`、
> `dsh-client/` → `integrations/dsh-client/`，但已安装的 profile 仍指向旧路径——
> `dsh-skill-vitals-audit` 与 fallback 的 `dsh-agent-vitals-audit` **两条 symlink 都
> 指向已删除的 `skill-vitals/dsh-client`，审计 tab 实测是坏的**。且安装态在三轴同时
> 陈旧：包名（`dsh-skill-vitals` vs 仓库 `dsh-agent-vitals`）、路径、内容
> （`index.js` 与仓库不同却是**同一个版本号 1.3.0**）。
> **建议加守卫**：本仓库在 `pricing.json` 三副本、wasm↔CLI 都有锁步测试，
> **唯独插件安装态没有任何守卫**，靠人记得重装——1.3.0 现有两份不同内容即是后果。

### R2.3 → R2.4（拆成四个版本）

原 v0.10 一版含 A–D 四阶段，按 §7「阶段规模提示」与 §12.2 的结论拆开。
**拆分原则不是按工作量切块，而是按「这一版第一次让系统能做什么它以前不能做的危险的事」。**

| # | 改动 | 位置 | 理由 |
|---|---|---|---|
| 72 | §7 改写为「版本拆分与实施阶段」，新增 §7.0 版本地图：**v0.10.0 看得见 / v0.11.0 说得清 / v0.12.0 算得准 / v0.13.0 改得动**，一版只新增一类风险（无 → 持久化状态 → 金额主张 → 写动作） | §7.0 | 风险隔离 |
| 73 | **原 B 拆成两版**——这是拆分最大的收益：`Issues 归并` 与 `Savings 归因` 原本捆在一起，但只有后者被证据阻塞（SV601–614 全宿主可跑，SV-COST 只有 1/6）。拆开后 **v0.11.0 立即可排期** | §7 / §12.1 | §12.2 |
| 74 | **v0.10.0 不动 schema**：TraceGraph 全部现算，一张新表都不需要，迁移风险为零 | §10.4 | §10.3 |
| 75 | schema 分期：v0.10.0 = v2 不变 · v0.11.0 → v3（`issue_instances` + `issue_status_transitions`）· v0.12.0 → v4（`issue_remedies` + `waste_reviews` + `outcome_measurements` + `action_receipts`）· v0.13.0 无变更 · LLM → v5 | §10.4 | — |
| 76 | **`action_receipts` 提前到 v4 建表**：`outcome_measurements.receipt_id` 的 FK 指向它，SQLite 开启 `foreign_keys` 后写入即报错——FK 顺序要求同批建。同 F10 原则：建表不条件化，用不用由读写路径 gate | §10.4 | FK 顺序 |
| 77 | **v0.11.0 硬门槛：`classification='confirmed'` 行数必须为 0**——`waste_reviews`（human-confirmed 的唯一合法来源）要到 v0.12.0 才存在，本版无任何合法的 confirmed 来源 | §7 | §2.4.1 |
| 78 | LLM 从「建议降为 v0.11 候选」改为**已定：不进 v0.10–v0.13 任一版**，独立立项，schema v5 | §7 | — |
| 79 | 三项前置（计价权决策 / 语料建设 / waste 跨宿主化）明确**只挡 v0.12.0**，v0.10.0 与 v0.11.0 可并行推进，语料建设在其开发期同步进行 | §12.2 / §12.3 | 拆分收益 |
| 80 | 文档标题与状态头改为覆盖 v0.10.0 – v0.13.0 | 头部 | — |
