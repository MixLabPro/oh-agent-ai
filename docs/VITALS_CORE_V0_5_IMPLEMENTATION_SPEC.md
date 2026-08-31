# Vitals Core v0.5 Implementation Spec

> 状态：Draft  
> 目标版本：0.5  
> 适用仓库：当前 `agent-vitals` monorepo  
> 上位设计：《Vitals Core 设计文档 v0.1》  
> 决策主题：从现有 Agent Vitals 中建立可运行的通用行为审计最小闭环

---

## 0. 结论

Vitals Core v0.5 不重写 Agent Vitals，也不立即拆成独立仓库。

本阶段在现有 workspace 内新增通用 crate：

```text
crates/vitals-core
```

并形成以下最小闭环：

```text
Canonical Event
      ↓
Trajectory Reconstruction
      ↓
Detector Evaluation
      ↓
Evidence-backed Finding
      ↓
Deterministic Replay
```

现有 `agent-vitals-core` 保留，逐步转为 Agent 领域层：

```text
vitals-core                 通用机制，不知道 Codex / DSH / Agent
      ↑
agent-vitals-core           Agent 领域模型、规则与兼容层
      ↑
agent-vitals CLI / WASM     适配器、I/O、命令与交付
      ↑
Tauri / dsh-client          展示与宿主集成
```

v0.5 的成功标准不是“完成所有通用 Runtime 能力”，而是：

> 现有 DSH 与 Codex 的规范化事件，可以不向 `vitals-core` 引入任何宿主专属字段，经过同一个 Engine 生成可解释、可回放、三态诚实的 Finding；至少三条 Agent 规则迁移后与现有结果保持一致。

---

## 1. 背景

当前项目已经具备一批可复用资产：

- `CanonicalSession` 与宿主中立 timeline；
- `Signal`、`Coverage`、`CoverageCounts`；
- `Provenance` 与 measured / derived / estimated / lossy 区分；
- `RuleOutcome` 的 findings / measured-zero / unavailable 三态；
- DSH、Codex 的适配与证据抽取；
- 行为规则、轨迹规则、跨会话 Finding 汇总；
- Rust / Python 差分测试、golden、property tests；
- CLI、WASM、Tauri 的消费链路。

但当前 `agent-vitals-core` 仍包含大量领域与产品语义：

```text
codex_evidence
codex_usage
dsh_evidence
skill
budget
cost
subagent
takeover
waste
```

它是 Agent Vitals 的纯计算核心，不是可被 Investment Vitals 等项目直接依赖的通用行为 Runtime。

v0.5 的任务是建立明确的通用边界，并用现有产品验证该边界，而不是一次性完成整个 Vitals Framework。

---

## 2. 用户与场景

### 2.1 直接用户

v0.5 的直接用户是领域包开发者，而不是最终桌面用户。

典型开发者需要完成：

1. 将某种日志或事件源转换为 Canonical Event；
2. 指定事件如何归入 Trajectory；
3. 注册领域 Detector；
4. 得到带 Evidence、Coverage 和 Replay 的 Audit Report；
5. 在 CLI、WASM、桌面应用或其他宿主中渲染结果。

### 2.2 首个验证场景

```text
DSH / Codex session log
        ↓ Adapter（Agent 层）
Canonical Event
        ↓ Vitals Core
Trajectory + RuleOutcome + Finding + Replay
        ↓ Agent 层兼容投影
现有 CLI / HTML / Tauri 输出
```

### 2.3 非本阶段用户场景

以下场景不作为 v0.5 交付目标：

- 用户在线安装第三方动态插件；
- Core 主动停止或修改 Agent；
- 云端分布式事件流；
- 多租户 SaaS；
- LLM 对完整 session 做语义判断；
- Investment Vitals 正式产品化。

---

## 3. 目标与非目标

### 3.1 必须实现

v0.5 必须提供：

1. 稳定、可序列化的 Canonical Event；
2. 确定性的事件校验、排序与去重；
3. 最小 Trajectory 生命周期：open、append、close；
4. 编译期 Detector 注册；
5. Coverage-aware 的 Detector 前置门控；
6. 三态 RuleOutcome；
7. Evidence-backed Finding；
8. 确定性 Finding fingerprint 与去重；
9. ReplayFrame 与完整 ReplayReport；
10. In-memory、sync-first 的 VitalsEngine；
11. Agent Vitals 兼容桥；
12. 至少三条现有 Agent 规则迁移验证；
13. 现有 CLI / JSON / HTML / Tauri 无破坏性变化。

### 3.2 明确不实现

v0.5 不实现：

```text
通用 StateReducer Runtime
通用 ProgressProvider
Validator DSL
Recommendation Provider
Intervention 执行
Hook Runtime
SemanticJudge / LLM
HistoryProvider
Behavior Profile
动态库 / WASM 插件加载
SQLite / PostgreSQL EventStore
异步 Runtime
分布式流处理
trajectory reopen / merge / split
独立 vitals-core 仓库发布
```

这些能力可以在模型中保留扩展位置，但不得为了未来能力提前引入不可验证的复杂度。

---

## 4. 核心设计原则

### 4.1 Domain-free

`vitals-core` 的公开类型、模块名、测试夹具中不得出现：

```text
Codex
DSH
Agent
Skill
LLM
Tool Call
Token
Budget
Investment
IBKR
```

通用事件可以通过 `kind` 和 `attributes` 承载领域内容，但 Core 不解释这些值。

### 4.2 Evidence-first

任何 Finding 必须至少引用一个 Evidence；没有可定位证据的 Detector 输出视为契约错误。

### 4.3 Coverage-aware

Core 必须保留当前项目已经验证过的事实边界：

```text
有 Finding
实测为零
无法测量
```

`Unavailable` 不得被序列化为零，不得被统计为“健康”。

### 4.4 Provenance-preserving

任何从原始事件派生出的观察值必须保留来源：

```text
Measured
Derived
Estimated
Lossy
```

聚合后不能把混合来源伪装成单一 measured 值。

### 4.5 Deterministic-first

相同的：

```text
输入事件
Core 版本
Detector ID + 版本
配置
```

必须产生字节级可稳定比较的结构化结果。时间、随机数、文件系统和网络不得在 Core 内部隐式读取。

### 4.6 Batch-first, streaming-compatible

v0.5 的主要场景是本地 session log 审计，因此以批处理审计为主。

Engine 可以逐条 `ingest`，但 Finding 的权威结果在 `finalize` 后产生。v0.5 不承诺晚到事件触发实时撤回或重算通知。

### 4.7 Compatibility-first

新 Core 首先通过兼容桥服务现有产品。迁移过程中：

- 现有 JSON key 不删除、不改义；
- 现有规则码不变；
- 现有 Python 差分测试继续运行；
- Tauri 与 dsh-client 不直接依赖新 Core API；
- 新模型通过 Agent 层投影为现有输出。

---

## 5. Crate 与依赖方向

### 5.1 Workspace 结构

```text
crates/
├── vitals-core/
│   ├── Cargo.toml
│   ├── src/
│   │   ├── lib.rs
│   │   ├── id.rs
│   │   ├── event.rs
│   │   ├── signal.rs
│   │   ├── coverage.rs
│   │   ├── provenance.rs
│   │   ├── trajectory.rs
│   │   ├── detector.rs
│   │   ├── evidence.rs
│   │   ├── finding.rs
│   │   ├── replay.rs
│   │   ├── engine.rs
│   │   ├── report.rs
│   │   └── error.rs
│   └── tests/
│       ├── fixtures/
│       ├── golden_replay.rs
│       ├── detector_contract.rs
│       └── properties.rs
│
├── agent-vitals-core/
│   ├── src/
│   │   ├── compatibility/
│   │   │   ├── canonical_session.rs
│   │   │   └── findings.rs
│   │   ├── detectors/
│   │   └── ...现有模块
│   └── Cargo.toml
│
└── agent-vitals-wasm/
```

### 5.2 单向依赖

允许：

```text
agent-vitals-core → vitals-core
agent-vitals-wasm → agent-vitals-core
agent-vitals CLI  → agent-vitals-core
```

禁止：

```text
vitals-core → agent-vitals-core
vitals-core → CLI / Tauri / WASM
vitals-core → 任意宿主 Adapter
```

### 5.3 依赖预算

v0.5 建议只使用：

```toml
serde
serde_json
thiserror
```

时间使用整数毫秒，ID 使用 newtype string，避免为了基础模型引入异步 Runtime、数据库、UUID 或完整时间库。

`rust-version` 与现有 workspace 保持一致，不低于 Rust 1.74。

---

## 6. Canonical Event

### 6.1 数据结构

```rust
pub struct EventId(pub String);
pub struct ActorId(pub String);
pub struct GoalId(pub String);
pub struct TrajectoryId(pub String);

pub struct CanonicalEvent {
    pub schema_version: u16,
    pub id: EventId,
    pub actor_id: ActorId,
    pub goal_id: Option<GoalId>,
    pub kind: String,
    pub ordinal: u64,
    pub occurred_at_ms: Option<i64>,
    pub attributes: serde_json::Value,
    pub outcome: Option<serde_json::Value>,
    pub source: SourceRef,
    pub provenance: Provenance,
}

pub struct SourceRef {
    pub source_type: String,
    pub source_id: String,
    pub raw_reference: Option<String>,
    pub raw_ordinal: Option<u64>,
}
```

### 6.2 字段纪律

- `id`：在同一来源内稳定、可重建；不能使用本次进程随机值；
- `actor_id`：行为主体；来源无法提供时由 Adapter 生成稳定匿名 ID；
- `kind`：领域定义的事件类型，Core 只做非空校验；
- `ordinal`：Adapter 对当前审计输入分配的严格递增顺序；
- `occurred_at_ms`：允许缺失；缺失不等于 `0`；
- `attributes`：必须为 JSON object；
- `outcome`：事件的可选结果，不强制所有行为都有反馈；
- `raw_reference`：文件路径、blob ID 或其他可追溯引用，允许脱敏；
- `provenance`：描述 Canonical Event 本身如何获得。

### 6.3 排序规则

v0.5 的权威顺序为：

```text
ordinal ASC
→ id ASC 作为病态输入的稳定 tie-breaker
```

`occurred_at_ms` 只用于展示和时间窗口，不参与主排序。原因是现有 DSH/Codex 日志可能缺时间或时间精度不足，而 Adapter 已拥有最可靠的日志顺序。

### 6.4 去重规则

同一 AuditInput 中：

- `EventId` 首次出现保留；
- 再次出现且规范化内容相同：记为 diagnostic，不重复进入轨迹；
- 再次出现但内容不同：返回 `ConflictingDuplicate`，本次审计失败；
- 不允许按时间、kind 或 attributes 猜测去重。

### 6.5 校验失败

以下情况为硬错误：

- 空 ID；
- 空 actor；
- 空 kind；
- attributes 不是 object；
- 相同 ID 对应不同内容；
- schema major 不支持。

ordinal 重复但 ID 不同属于 diagnostic；排序继续按 ID 稳定完成。

---

## 7. Signal、Coverage 与 Provenance

### 7.1 Signal

通用 Core 不内置 `ToolCalls` 等 Agent 专属枚举，改为稳定字符串 newtype：

```rust
pub struct SignalId(pub String);
```

命名规范：

```text
<domain>.<signal>
```

示例仅存在于 Agent 领域层：

```text
agent.action
agent.feedback
agent.turn_boundary
agent.approval_decision
agent.sandbox_mode
```

Core 自身只保留少量保留前缀：

```text
vitals.event
vitals.trajectory
vitals.diagnostic
```

### 7.2 Provenance

沿用现有语义，改造成可序列化公开模型：

```rust
pub enum Provenance {
    Measured,
    Derived { from: Vec<SignalId> },
    Estimated { estimator: String },
    Lossy { kind: LossKind },
}
```

### 7.3 Coverage

沿用当前 `CoverageCounts`：

```rust
pub struct CoverageCounts {
    pub measured: u64,
    pub derived: u64,
    pub lossy: u64,
    pub unmetered: u64,
}
```

`total == 0` 时 coverage ratio 必须是 `None`，不得输出 `0.0`。

### 7.4 Detector Requirement

为替代当前按规则码硬编码 OR 语义的方式，Core 正式提供：

```rust
pub enum SignalRequirement {
    All(Vec<SignalId>),
    Any(Vec<SignalId>),
}
```

Engine 在调用 Detector 之前完成门控：

- `All`：任一要求无可消费证据则 unavailable；
- `Any`：全部要求无可消费证据才 unavailable；
- requirement 为空：允许执行；
- Detector 不得自行把缺失证据解释成零。

---

## 8. Trajectory

### 8.1 最小模型

```rust
pub enum TrajectoryStatus {
    Open,
    Closed,
}

pub struct Trajectory {
    pub schema_version: u16,
    pub id: TrajectoryId,
    pub actor_id: ActorId,
    pub goal_id: Option<GoalId>,
    pub event_ids: Vec<EventId>,
    pub status: TrajectoryStatus,
    pub started_at_ms: Option<i64>,
    pub ended_at_ms: Option<i64>,
    pub attributes: serde_json::Value,
}
```

### 8.2 Assignment

v0.5 不实现通用 Builder 组合器，只提供一个明确接口：

```rust
pub trait TrajectoryAssigner: Send + Sync {
    fn assign(&self, event: &CanonicalEvent) -> Result<TrajectoryId, VitalsError>;
}
```

内置：

```text
BySourceSession
ByActor
```

Agent 兼容桥默认使用 `BySourceSession`，保证一份现有 session 对应一条 trajectory。

### 8.3 生命周期

v0.5 仅允许：

```text
不存在 → open
open → append
open → close
```

不允许：

```text
closed → append
closed → reopen
merge
split
```

违规操作返回类型化错误，不做隐式修复。

### 8.4 多轨迹

一个 Event 在 v0.5 只能属于一条 Trajectory。多重归属、父子轨迹和跨轨迹引用推迟到后续版本。

---

## 9. Detector 与 RuleOutcome

### 9.1 Detector Trait

```rust
pub trait Detector: Send + Sync {
    fn id(&self) -> &str;
    fn version(&self) -> &str;
    fn requirement(&self) -> SignalRequirement;

    fn detect(
        &self,
        ctx: &AuditContext,
    ) -> Result<Vec<FindingDraft>, VitalsError>;
}
```

`id + version` 是 Replay 确定性的一部分。相同 ID 不允许注册多个版本。

### 9.2 AuditContext

```rust
pub struct AuditContext<'a> {
    pub trajectory: &'a Trajectory,
    pub events: &'a [CanonicalEvent],
    pub coverage: &'a Coverage,
    pub config: &'a serde_json::Value,
}
```

Context 不提供文件系统、网络、时钟或随机数。

### 9.3 RuleOutcome

```rust
pub enum RuleOutcome {
    Findings(Vec<Finding>),
    MeasuredZero,
    Unavailable {
        missing: Vec<SignalId>,
        reason: String,
    },
}
```

语义：

- `Findings`：有足够证据且命中；
- `MeasuredZero`：有足够证据、Detector 已执行、零命中；
- `Unavailable`：Engine 前置门控未通过，Detector 不得执行。

Detector 抛错不属于第四种健康状态，而是 Audit Error / Partial Failure。

### 9.4 注册方式

v0.5 只支持编译期注册：

```rust
VitalsEngine::builder()
    .with_detector(detector)
    .build()
```

“Plugin”在 v0.5 仅表示 crate 内组合，不承诺动态加载、稳定 ABI 或第三方代码隔离。

---

## 10. Evidence 与 Finding

### 10.1 Evidence

```rust
pub struct Evidence {
    pub event_ids: Vec<EventId>,
    pub description: String,
    pub source_refs: Vec<SourceRef>,
    pub attributes: serde_json::Value,
}
```

要求：

- `event_ids` 不能为空；
- 引用的 Event 必须属于当前 Trajectory；
- `description` 是短说明，不承担结构化事实；
- 原始大段日志不得复制进 Evidence；
- SourceRef 应允许消费者定位或请求原文。

### 10.2 Finding

```rust
pub struct Finding {
    pub schema_version: u16,
    pub id: FindingId,
    pub detector_id: String,
    pub detector_version: String,
    pub kind: String,
    pub severity: Severity,
    pub confidence: Option<f32>,
    pub trajectory_id: TrajectoryId,
    pub evidence: Vec<Evidence>,
    pub summary: String,
    pub attributes: serde_json::Value,
    pub fingerprint: String,
}
```

v0.5 不包含 Finding lifecycle。`Acknowledged / Resolved / Ignored` 属于上层产品状态，不属于纯审计结果。

### 10.3 Fingerprint

Fingerprint 必须由以下规范化内容生成：

```text
detector_id
detector_version
kind
trajectory_id
排序后的 evidence.event_ids
影响判定的 detector config
```

不得包含：

```text
生成时间
随机 ID
summary 文案
展示顺序
本机绝对路径
```

同一 fingerprint 在一份 AuditReport 中只保留一条 Finding；occurrence 信息放入 attributes。

---

## 11. Replay

### 11.1 ReplayFrame

```rust
pub struct ReplayFrame {
    pub index: u64,
    pub event: CanonicalEvent,
    pub trajectory_id: TrajectoryId,
    pub findings_opened: Vec<FindingId>,
    pub diagnostics: Vec<Diagnostic>,
}
```

### 11.2 ReplayReport

```rust
pub struct ReplayReport {
    pub schema_version: u16,
    pub engine_version: String,
    pub detector_versions: Vec<DetectorVersion>,
    pub input_fingerprint: String,
    pub frames: Vec<ReplayFrame>,
    pub outcomes: Vec<NamedRuleOutcome>,
    pub findings: Vec<Finding>,
    pub diagnostics: Vec<Diagnostic>,
}
```

### 11.3 确定性要求

Replay 结果不得隐式依赖：

- 当前时间；
- 当前工作目录；
- 环境变量；
- 外部价格表；
- 网络；
- 文件系统扫描顺序；
- HashMap 非确定性迭代顺序。

如 Detector 需要配置、价表或阈值，调用方必须将其作为显式 config 输入，并纳入 input fingerprint。

### 11.4 Replay 语义

v0.5 的 Detector 是 trajectory-level。为了避免伪造“实时首次触发点”：

- Engine 在 finalize 后计算权威 Finding；
- `findings_opened` 只有 Detector 能通过 Evidence 明确定位锚点时才写入对应 frame；
- 无明确锚点的 Finding 只出现在 report 顶层；
- 不得默认把所有 Finding 放到最后一帧。

---

## 12. Engine API

### 12.1 Builder

```rust
let mut engine = VitalsEngine::builder()
    .with_assigner(BySourceSession)
    .with_detector(detector)
    .with_config(config)
    .build()?;
```

### 12.2 执行 API

```rust
engine.ingest(event)?;
engine.ingest(event)?;

let report = engine.finalize()?;
```

批处理便捷入口：

```rust
let report = audit(AuditInput {
    events,
    coverage,
    config,
    detectors,
})?;
```

### 12.3 Pipeline

```text
Input
  ↓
Schema Validation
  ↓
ID Deduplication
  ↓
Deterministic Ordering
  ↓
Trajectory Assignment
  ↓
Trajectory Close
  ↓
Signal Requirement Gate
  ↓
Detector Evaluation
  ↓
Finding Validation
  ↓
Fingerprint / Dedup
  ↓
Replay Assembly
  ↓
AuditReport
```

### 12.4 AuditReport

```rust
pub struct AuditReport {
    pub schema_version: u16,
    pub engine_version: String,
    pub input_fingerprint: String,
    pub trajectories: Vec<Trajectory>,
    pub outcomes: Vec<NamedRuleOutcome>,
    pub findings: Vec<Finding>,
    pub replay: ReplayReport,
    pub diagnostics: Vec<Diagnostic>,
}
```

输出数组必须定义稳定顺序：

- trajectories：`id ASC`；
- outcomes：`detector_id ASC`；
- findings：severity rank、trajectory ID、fingerprint；
- evidence event IDs：ordinal、event ID；
- diagnostics：event ordinal、code。

---

## 13. Error 与 Diagnostic

### 13.1 硬错误

```rust
pub enum VitalsError {
    UnsupportedSchema { found: u16, supported: u16 },
    InvalidEvent { event_id: Option<EventId>, reason: String },
    ConflictingDuplicate { event_id: EventId },
    InvalidTrajectory { trajectory_id: TrajectoryId, reason: String },
    InvalidFinding { detector_id: String, reason: String },
    DuplicateDetector { detector_id: String },
    DetectorFailed { detector_id: String, reason: String },
    Serialization { reason: String },
}
```

### 13.2 Diagnostic

可恢复问题进入 report：

```text
DUPLICATE_EVENT_IGNORED
DUPLICATE_ORDINAL
MISSING_TIMESTAMP
LOSSY_SOURCE
EMPTY_TRAJECTORY
FINDING_DEDUPLICATED
```

Diagnostic 必须包含 code、message、相关 event / trajectory 引用，不能只写 stderr。

### 13.3 Partial Failure

v0.5 默认 fail-closed：任一 Detector 返回错误，整个 `finalize` 返回 `DetectorFailed`。

原因：现阶段 CLI 和回归测试需要明确失败，不能静默漏规则。未来如支持 partial report，必须显式增加执行策略，不能改变默认语义。

---

## 14. Agent Vitals 兼容桥

### 14.1 位置

兼容逻辑属于 `agent-vitals-core`：

```text
agent-vitals-core/src/compatibility/
├── canonical_session.rs
└── findings.rs
```

### 14.2 输入桥

提供纯函数：

```rust
pub fn canonical_session_to_vitals(
    session: &CanonicalSession,
) -> Result<AgentVitalsInput, CompatibilityError>;
```

职责：

- 将五条现有 timeline 投影为 Canonical Event；
- 使用现有 timeline 坐标生成稳定 `ordinal`；
- 将现有 `Signal` 映射为 `agent.*` SignalId；
- 原样保留 CoverageCounts；
- 原样保留 provenance；
- 一份 session 生成一条 source-session trajectory；
- 不重新读取原始日志。

### 14.3 输出桥

提供纯函数：

```rust
pub fn vitals_report_to_legacy_findings(
    report: &AuditReport,
) -> Result<Vec<serde_json::Value>, CompatibilityError>;
```

职责：

- 映射回现有 `rule / severity / category / evidence / seq / time / turn / step / call_id / run_end_seq`；
- 保持旧 JSON key 和 key 顺序；
- 无法无损映射的字段不得猜测；
- 迁移期允许 Finding attributes 保存旧坐标；
- 兼容输出与现有 golden 逐字节对比。

### 14.4 第一批迁移规则

建议选择已经使用 CanonicalSession timeline、宿主泄漏较少的三条：

```text
SV611 重复动作
SV612 重复序列
SV613 无进展 / 连续失败
```

迁移方式：

1. 在 Agent 层实现三个 `Detector`；
2. Detector 依赖 `agent.*` 信号和事件 attributes；
3. `vitals-core` 不出现 SV 规则码解释；
4. 同一 fixture 同时跑旧路径和新路径；
5. 结果规范化后逐字节一致；
6. parity 通过前不删除旧实现；
7. parity 稳定后，旧入口改为兼容 shim。

SV614 暂缓：其 `Any(approval_decision, sandbox_mode)` 适合在 requirement 模型稳定后作为第四条验证。

---

## 15. 版本与序列化契约

### 15.1 两类版本

```text
schema_version   数据结构兼容性
engine_version   执行语义兼容性
```

Detector 另带：

```text
detector_id
detector_version
```

### 15.2 v0.5 兼容规则

- schema major 不同：拒绝读取；
- schema minor 新增可选字段：旧消费者应忽略；
- 字段改义：必须升级 major；
- Detector 阈值或算法变化：升级 detector version；
- 排序、去重或 fingerprint 算法变化：升级 engine version；
- 旧 Agent Vitals JSON contract version 不因内部迁移自动升级。

### 15.3 JSON 是正式调试面

所有公开模型必须 `Serialize + Deserialize + Debug + Clone + PartialEq`，必要时增加 `Eq`。

Rust struct 是主 API；JSON 用于 fixture、Replay、CLI 和跨语言验证。不得让内部 HashMap 顺序泄漏为 API 契约。

---

## 16. 测试策略

### 16.1 vitals-core 单元测试

必须覆盖：

- Event 校验；
- 相同重复与冲突重复；
- ordinal 稳定排序；
- trajectory open / append / close；
- closed trajectory 拒绝 append；
- SignalRequirement All / Any；
- unavailable 时 Detector 未被调用；
- measured-zero 与 unavailable 区分；
- Finding 无 Evidence 被拒绝；
- fingerprint 稳定；
- Finding 去重；
- Replay 稳定排序；
- 相同输入得到相同 input fingerprint。

### 16.2 Property Tests

至少建立：

1. 任意打乱输入 Vec，只要 ordinal 不变，最终 report 相同；
2. 重复插入相同 Event 不改变 Finding；
3. 冲突 Event ID 必定失败；
4. Replay 中每个 Evidence 引用都能找到 Event；
5. 每个 Event 最多属于一条 Trajectory；
6. serialize → deserialize → serialize 结构相同。

### 16.3 Golden Replay Fixtures

通用 Core fixture 不使用 Agent 术语：

```text
tests/fixtures/
├── repetition.json
├── alternating_sequence.json
├── missing_feedback.json
├── duplicate_event.json
└── unavailable_signal.json
```

### 16.4 Agent 迁移 Parity

对 SV611–613：

```text
现有 CanonicalSession
  ├── old detector path → legacy findings
  └── compatibility → vitals-core → legacy projection

normalize(dynamic fields)
              ↓
        byte-for-byte equal
```

### 16.5 全仓回归 Gate

合并前至少通过：

```bash
cargo test
(cd src-tauri && cargo test)
python -m pytest -q
git diff --check
```

WASM 包装层有 API 变化时额外执行：

```bash
(cd crates/agent-vitals-wasm && wasm-pack build --target web)
```

---

## 17. 性能与资源指标

v0.5 不以极限性能为目标，但必须记录基线。

基准数据集：

```text
1,000 events
10,000 events
100,000 events
```

最低验收指标（release build、开发机基线，记录机器型号）：

- 10,000 events 完整 audit：目标小于 100 ms；
- 100,000 events 完整 audit：目标小于 1 s；
- 内存峰值不超过规范化输入 JSON 大小的 8 倍；
- 相同数据运行 20 次，report fingerprint 完全一致。

这些指标是回归基线，不作为对外性能承诺。若未达到，应记录 profile 结果；不得为达标牺牲证据完整性或确定性。

---

## 18. 安全与隐私

### 18.1 Core 的权限边界

`vitals-core`：

- 不读文件；
- 不读环境变量；
- 不访问网络；
- 不启动子进程；
- 不执行 Intervention；
- 不持久化用户原始日志。

### 18.2 Evidence 最小化

- Finding 只保存定位所需的 Event ID、SourceRef 和短说明；
- 不默认复制 prompt、代码、命令输出；
- `raw_reference` 可被 Adapter 哈希或打码；
- Lossy / Redacted 必须通过 provenance 显式标记；
- Core fixture 不包含真实用户路径、用户名、代码和凭据。

---

## 19. 交付阶段

### M0：骨架与契约

交付：

- 新建 `crates/vitals-core`；
- 完成 Event、Signal、Coverage、Provenance、Trajectory 类型；
- 建立 schema、error、serde round-trip；
- 加入 workspace default-members；
- 不接入现有 CLI。

验收：类型测试、序列化测试、dependency boundary test 通过。

### M1：Engine 最小闭环

交付：

- ingest / finalize / audit；
- 排序、去重、trajectory assignment；
- Detector 注册与 requirement gate；
- RuleOutcome、Finding、Evidence；
- ReplayReport。

验收：通用 fixture、property tests、golden replay 通过。

### M2：Agent 兼容桥

交付：

- CanonicalSession → CanonicalEvent；
- AuditReport → legacy findings；
- Coverage / Provenance 无损映射；
- 不修改上层 JSON contract。

验收：桥接单元测试和现有 fixtures 通过。

### M3：三条规则迁移

交付：

- SV611、SV612、SV613 的 Agent Detector；
- old/new 双路径 parity；
- 旧公开入口改为兼容 shim；
- 新 Replay 可定位到现有 seq / turn / call_id。

验收：逐字节 parity、全仓测试、WASM 构建通过。

### M4：稳定与文档

交付：

- API docs；
- 一个无 Agent 术语的 30 秒 example；
- 性能基线；
- 迁移说明；
- v0.5 known limitations。

验收：新开发者仅阅读 README 即可实现一个自定义 Detector，并用 fixture 得到 ReplayReport。

---

## 20. Definition of Done

只有同时满足以下条件，Vitals Core v0.5 才算完成：

- [ ] `crates/vitals-core` 不含宿主或 Agent 专属类型；
- [ ] Core 无文件、网络、时钟、环境变量和子进程 I/O；
- [ ] Canonical Event 有稳定 ID、ordinal、SourceRef 和 provenance；
- [ ] 相同输入可稳定重放；
- [ ] All / Any requirement 前置门控通过测试；
- [ ] findings / measured-zero / unavailable 三态完整保留；
- [ ] 每条 Finding 至少包含一个有效 Evidence；
- [ ] Finding fingerprint 和去重稳定；
- [ ] SV611–613 新旧路径逐字节一致；
- [ ] 现有 CLI JSON contract 未变化；
- [ ] 现有 HTML、Tauri、dsh-client 不需要同步重写；
- [ ] Rust、Python、Tauri、WASM 相关 gate 全部通过；
- [ ] 性能与确定性基线已记录；
- [ ] 未提前引入 State、Progress、LLM、动态插件和 Intervention 执行。

---

## 21. 失败条件与止损线

出现以下任一情况，应暂停抽象并回到契约评审：

1. 为迁移某条 Agent 规则，需要在 `vitals-core` 新增 Codex / DSH / Tool 等专属字段；
2. 新路径无法表达现有 Coverage 或 Provenance；
3. 新路径把 unavailable 转成 measured-zero；
4. 同一输入无法稳定生成相同 Finding fingerprint；
5. 兼容桥需要重新读取原始日志；
6. 为兼容旧 JSON，Core 本体被迫持有 SV 规则码或旧展示字段；
7. 三条首批规则仍需修改 Core 才能各自落地；
8. 上层 CLI / Tauri 必须同时大改才能接入。

这说明抽象边界或迁移切口不成立，不能通过继续堆条件分支解决。

---

## 22. v0.5 之后

v0.5 完成后，下一步应由真实需求决定，而不是按原始大设计顺序机械实现。

候选方向：

```text
v0.6  通用 State / deterministic diff
v0.7  Progress / cost-per-progress
v0.8  第二领域包验证（Investment 或通用 workflow fixture）
v0.9  Validator / Recommendation
v1.0  稳定 Plugin API 与独立 crate 发布
```

Intervention、SemanticJudge 和动态插件必须在至少两个领域包验证 Core 抽象之后再进入正式范围。

---

## 23. 最终架构判断

v0.5 不是把现有 `agent-vitals-core` 改名为 `vitals-core`。

它是在现有产品内部建立一道新的、可验证的边界：

```text
宿主事实与 Agent 语义
          │
          ▼
  Agent Vitals Domain Layer
          │ Canonical Event / Detector
          ▼
      Vitals Core
          │ AuditReport / Replay
          ▼
  Agent Vitals Compatibility Layer
          │
          ▼
现有 CLI / WASM / Tauri / HTML
```

只有当 Agent Vitals 能依赖这道边界而不损失现有证据纪律，并且第二个领域能够不修改 Core 直接接入时，`vitals-core` 才具备独立仓库和 1.0 API 的条件。
