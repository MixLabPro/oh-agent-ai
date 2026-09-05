# Agent Vitals v0.10 Value Loop 架构规格

> 状态：架构草案 R1（2026-09-04）  
> 前置：`AGENT_VITALS_V0_9_DATA_VALUE_ARCHITECTURE_SPEC.md` 已发布并通过其 Definition of Done。  
> 定位：把可信数据转化为普通用户可理解、可执行、可验证收益的问题解决闭环。

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
```

节点可表示 user task、assistant turn、model invocation、tool call、subagent、compaction、retry 或 outcome；每一个节点和边均应指回 v0.9 的事实/证据 ID。

### 2.2 指标与评估

- `MetricDefinition`：指标 ID、分子、分母、窗口、缺失策略、排序与版本；
- `EvaluationResult`：program 或 LLM evaluator 的结论、版本、coverage、input fingerprint 与证据；
- `IssueInstance`：将多个 Finding/Evaluation 聚为用户问题，保存根因、风险、状态和证据；
- `RemedyDefinition` / `RemedyPlan`：方案、适用条件、权限、风险、预估影响、验证方式与 rollback；
- `ActionReceipt`：真实执行目标、时间、变更指纹、结果和 rollback 引用；
- `OutcomeMeasurement`：baseline、观察窗、覆盖、反事实限制、Potential/Validated/Realized savings。

`Potential`、`Validated`、`Realized` savings 永不混算；所有成本仍继承 v0.9 的 basis 与 unresolved 口径。

## 3. 评估策略

程序评估优先：重复尝试、重复工具调用、失败率、无效读写、上下文增长、模型错配、cache/usage 守恒与覆盖异常等，优先用结构、状态机、统计和守恒律判断。

LLM evaluator 仅用于程序规则无法覆盖的语义问题；默认关闭、须授权和预算、只产生评估证据，不能直接执行修改或把正文默认发往外部服务。

人类反馈是弱信号：用于确认方案是否有帮助，不作为普通用户使用产品的前置要求。

## 4. 问题到方案

每个稳定问题族必须有以下之一：

1. 至少一个可执行、低风险的 remedy；或
2. 明确 `diagnostic-only`，说明为什么当前不能安全自动处理。

首批 remedy 应优先覆盖可逆、可预览的动作，例如：禁用长期未触发且证据充分的 Skill、收紧重复工具调用策略、推荐合适模型/上下文策略、修复可验证的配置错误。禁止默认删除用户文件、改变宿主配置或进行网络 MCP probe。

## 5. 产品界面

```text
Overview   月度总感知成本、可避免浪费、已实现节省、数据覆盖
Sessions   会话筛选、成本/失败/持续时间、下钻
Traces     轨迹、节点图、时间线、覆盖与缺失说明
Issues     问题、根因、证据、风险、状态
Savings    potential / validated / realized 三层收益
Settings   宿主、套餐/按量、数据源、隐私、LLM 授权与预算
```

Tauri 与 CLI 消费同一 Runtime projection DTO；状态栏只呈现摘要、同步状态和安全快捷入口，不承载复杂诊断。

## 6. Runtime 与目录增量

```text
vitals-core/
  graph.rs, measurement.rs, action.rs       # 无 Agent 语义的原语

agent-vitals-domain/
  contracts/{trace_graph,evaluation_result,issue,remedy,outcome}.rs
  domain/{metrics,evaluation,remediation,impact}/

agent-vitals-hosts/src/hosts/<host>/sessions/trace.rs
  # host wire → trace node / invocation / tool observation

agent-vitals-runtime/
  trace_service.rs
  metrics_service.rs
  validation_service.rs
  evaluation_service.rs
  llm_evaluation_service.rs
  issue_service.rs
  remedy_service.rs
  action_service.rs
  outcome_service.rs
  projection_service.rs
```

CLI/Tauri 只发 command、请求授权并展示 DTO；不得复制 token/cost/fact identity、诊断或定价公式。

## 7. 实施阶段

### v0.10-A：Trace & Metrics

- Claude Code、Codex、DSH 的确定性 TraceGraph builder；
- Invocation / tool timing / model / cost / failure metrics；
- Sessions、Traces 查询 DTO、时间线与节点图；
- coverage 与降级显示。

**门槛：**至少三宿主可生成确定性图；缺失关系不伪造。

### v0.10-B：Issues & Remedies

- EvaluationResult、IssueInstance、根因归并；
- 程序 evaluator；
- remedy catalog、preview 与 potential savings；
- Issues / Savings 页面。

**门槛：**稳定问题族 remedy coverage 100%，其余显式 diagnostic-only。

### v0.10-C：Action & Outcome

- 授权、preview、apply、rollback 与 ActionReceipt；
- baseline/comparison、actual outcome 与 realized savings；
- 至少三个低风险方案端到端闭环。

**门槛：**发现 → 预览 → 授权执行 → 回执 → 结果验证可重放、可回滚。

### v0.10-D：可选 LLM 补盲

独立 feature；不阻塞 A–C。需实现 evaluator registry、脱敏、预算、缓存、schema validation 和明确 unavailable 状态。

## 8. 明确不做

- 不做 Phoenix/Jaeger 的完整替代品；
- 不把缺失 parent/time/status 的日志伪造成完整分布式 trace；
- 不默认上传提示词、会话正文或工具结果；
- 不默认修改或删除 Skill、配置、项目文件；
- 不做主动 MCP 健康探测；
- 不把 DuckDB 引入为运行时第二状态库；
- 不以文件 watcher 的有无作为本版本发布条件。watcher 仅在 v0.9 durable ingest 稳定后另行立项。

## 9. 架构守卫与 Definition of Done

1. 图节点/边引用的 fact/evidence 必须存在；
2. 无证据 parent/time/status 不得由数组顺序或 mtime 补造；
3. EvaluationResult 必含 evaluator version、coverage 和 input fingerprint；
4. 每个稳定 Issue 映射 remedy 或 diagnostic-only；
5. 自动动作须有风险、授权、rollback、verification 与 ActionReceipt；
6. Potential/Validated/Realized savings 的字段与聚合路径严格分离；
7. 同一输入重放不重复写 issue、action 或 outcome；
8. CLI、Tauri、HTML 的关键 projection 一致；
9. LLM 默认关闭仍可完整使用产品，开启后费用可见且绝不直接触发修改；
10. 至少三个低风险方案端到端验证实际结果，不能只展示预计节省。
