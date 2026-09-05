# Agent Vitals v0.9 Data Foundation 架构规格

> 状态：架构草案 R3（2026-09-05）  
> 前置：干净收口的 v0.8（含 Skill Surface ownership migration）  
> 后续：`AGENT_VITALS_V0_10_VALUE_LOOP_ARCHITECTURE_SPEC.md`

## 0. 版本定位

v0.9 是独立可发布的**可信数据底座**，不是 v0.10 的施工前置。

它回答的产品问题是：

> 用户看到的月度成本、用量、订阅覆盖、按量估算和数据缺口，能否追溯、重放、恢复并诚实解释？

```text
Host source
  → CanonicalSession / UsageFact / HostBillRecord
  → agent-vitals-data durable evidence plane
  → rebuildable SQLite query projection
  → cost / coverage / billing projection
  → CLI / Tauri / HTML
```

v0.9 不交付通用任务图、问题→方案→执行闭环或 LLM evaluator；这些属于 v0.10。

### 0.1 Stage 0 的可信度边界

v0.9 不把当前展示错误留到后续版本。它的 **v0.9.0 Stage 0：Data Access Foundation**
首先完成控制台的**诚实展示**：过期、未同步、部分覆盖或宿主未接入的日/月数据不得渲染为
`¥0`、“正常”或看似完整的总额；每一个金额都必须可见其宿主范围、计费口径与最后有效时间。

Stage 0 不要求先完成 SQLite 迁移。它先建立稳定的 Data Query API，并可由现有 JSON
projection、Claude ledger 和 WorkBuddy source adapter 实现；UI/CLI 自此不再直接读取这些
文件。随后阶段只替换 Data 内部的写入与索引实现，不改变上层查询契约。

## 1. 用户可见能力

1. 月度总感知成本：固定订阅与按量成本分开，不把 API 等价额伪装成账单。
2. 每一项成本都有 `basis`：`measured`、`derived`、`estimated` 或 `unresolved`。
3. 数据源状态可见：哪些宿主、日期和模型已覆盖，哪些仍在估算或缺失。
4. 用户可重建本地索引，应用崩溃、索引损坏或并发运行不应悄悄改变账目。
5. CLI、Tauri、HTML 对同一 projection 的关键数字一致。

## 2. 范围

### 2.1 必做

- `UsageFact` append-only writer、稳定 identity、去重与 reconciliation；
- `HostBillRecord`：不能验证逐请求 token 时记录可信的宿主账单，而不伪造成 UsageFact；
- `CanonicalSession` 最小持久化；
- JSONL 事实与 canonical snapshot 作为审计输入；
- 可删除、可重建的 SQLite 查询投影；
- `SourceFingerprint`、checkpoint、replay、增量失效；
- 跨进程 writer lease；
- intent → facts → projection → manifest 的可恢复 generation transaction；
- BillingContext / UserProfile：订阅、按量账户、预算、模型/价格来源和 unresolved；
- coverage / data-quality projection 与 `data coverage`、`data rebuild-index` CLI；
- Runtime 共享 evidence/index/projection service；
- Python 边界守卫、文档主从图和故障注入测试。

### 2.2 明确不做

- `TraceGraph`、节点图、关键路径与图级指标；
- `IssueInstance`、`RemedyPlan`、自动执行、回滚、实际节省；
- LLM evaluator 或默认上传会话正文；
- 主动 MCP 网络健康探测；
- DuckDB 作为运行时第二状态库；
- `notify`/FSEvents watcher、DSH live subscription。

当前 Tauri 的五分钟 tick 与手动同步继续服务；watcher 必须等 checkpoint、replay、可恢复 writer 稳定后再进入后续版本。

## 3. 数据与所有权

```text
agent-vitals-hosts
  raw wire → CanonicalSession / UsageObservation / HostBillRecord candidate

agent-vitals-data
  validation + fact identity + JSONL evidence + SQLite index
  checkpoint + writer lease + generation/recovery + query repository

agent-vitals-runtime
  ingest orchestration + source scheduling + projection invalidation/events

apps/cli / apps/desktop
  commands, authorization, versioned DTO rendering only
```

- Hosts 不写 state、不决定套餐覆盖、不输出产品结论；
- Domain 保持纯：不读文件、不读凭据、不发网络请求、不取当前时间；
- `agent-vitals-data` 是事实写入、索引、恢复和查询的唯一数据边界；
- Runtime 编排 adapter 与 data，不拥有另一份账本或查询规则；
- UI 不从空数组推断 unavailable，必须消费 capability 与 coverage；
- 新命令不得直接读取宿主日志或 state JSON。

### 3.1 `agent-vitals-data`：数据层，不是独立服务

新增 workspace crate `crates/agent-vitals-data/`。它是嵌入式本地数据层，不启动 daemon、
不开放网络端口，也不让 Tauri 或 CLI 绕过它直读 SQLite。

| crate / 层 | 允许依赖 | 不允许承担的职责 |
|---|---|---|
| `agent-vitals-domain` | 纯 Rust 类型与规则 | I/O、SQL、当前时间、宿主解析 |
| `agent-vitals-hosts` | Domain、受 feature 门控的源 I/O | 写共享账本、价格/套餐结论 |
| `agent-vitals-data` | Domain、SQLite 驱动 | 解析 host wire、UI 呈现、同步调度 |
| `agent-vitals-runtime` | Hosts + Data | 第二个 state/projection store |
| `apps/cli` / `apps/desktop` | Runtime 的版本化 DTO | SQL、state JSON、宿主日志直读 |

数据层提供小型 typed repository/query service，而不是通用 Active Record ORM。例如：

~~~rust
data.ingest(batch)?;
data.rebuild_index()?;
data.daily_summary(DailySummaryQuery { date, host_scope })?;
data.monthly_summary(MonthlySummaryQuery { month, host_scope, billing_scope })?;
data.coverage_status(CoverageQuery { month, host_scope })?;
~~~

`MonthlySummary` 必须同时返回 `total`、`by_host`、`billing_basis`、`coverage`、
`freshness`、`excluded_hosts` 与 `last_observed_at`。金额不是脱离来源的 scalar；任何 UI
若只消费金额而丢弃这些字段，视为契约违规。调用者不应知道数据来自 JSON、SQLite 或未来的
离线分析索引，但不得忽略这些业务语义字段。

### 3.2 DSH 是参考实现，不是数据模型

DSH + dsh-client 是当前审计闭环最完整的宿主集成：它已经验证了
原始会话事件 → 语义信号 → coverage → detector → finding → projection 这条链。
但 v0.9 不得把 DSH 的 JSONL 字段、四 token 桶、峰谷定价、compaction 事件或
session projection 协议提升为跨宿主模型。

复用单位必须是能力与事实契约：

~~~
DSH / Claude Code / Codex 原始 wire
  → 各自 host adapter
  → CanonicalSession + UsageObservation + SourceAttempt
  → shared identity / validation / reconciliation
  → UsageFact + coverage + projection
~~~

- DSH 的 zstd、header、cwd/profile、approval、sandbox、hook、峰谷定价仍是 DSH adapter 的责任；
- Claude/Codex 的累计快照、rollout、cache 桶、逻辑 session identity 仍是各自 adapter 的责任；
- UsageFact 的 ID、schema、provenance、缺失语义、事实校验和写入协议必须只有一份；
- 行为检测器以 Signal / capability 为输入。宿主未提供足够信号时，必须得到
  unavailable / partial，不能把 DSH 规则硬跑后输出 measured zero；
- dsh-client 的 WASM 复用证明同一规则可跨 CLI、host、browser 运行，但它不是
  其他宿主必须实现的 UI 插件接口。

### 3.3 最小宿主接入契约

一个宿主要进入 v0.9 的可信数据面，必须分别声明下列能力；不能以已扫到文件替代。

| 交付物 | Host adapter 责任 | Runtime 责任 |
|---|---|---|
| Source descriptor | roots、文件类型、读取错误与 source revision | 调度、checkpoint、source status |
| CanonicalSession | 原始 session → 可重放最小会话输入 | 持久化、保留、重放 |
| UsageObservation | 原始用量载体 → token/金额/时间/身份输入 | schema 校验、reconciliation、emit |
| UsageFact | 提供 build_usage_fact 所需字段和原始证据 | 去重、append、lease、transaction |
| HostBillRecord | 提供宿主账单金额、周期、原始账单证据与不可归因字段 | 独立持久化、不可与 token 估算混淆 |
| Coverage | 可观察/不可观察字段与分母 | 跨宿主汇总、投影和 UI 降级 |
| Capability | 支持的 trace、cost、session、MCP 等面 | 命令/UI 是否启用及 unavailable 解释 |

UsageObservation 是内部规范化输入，不是第二份账本，也不是公开 API。它允许不同宿主
保留精确 token、amount、provider、模型、时间和 identity 语义；Runtime 只消费已经
完成宿主解释的观察值，绝不从通用 writer 反向猜 wire 字段。

### 3.4 事实与索引

| 层 | 权威性 | 用途 |
|---|---|---|
| 原始宿主日志 | 宿主拥有 | 不复制、不作为本项目写入目标 |
| `UsageFact` JSONL | 审计事实 | 追加、去重、账目对账、导出 |
| `HostBillRecord` JSONL | 宿主账单事实 | 不可验证 token 时的可信费用、周期与来源 |
| CanonicalSession snapshot | 可重放输入 | session 级解释、重建与审计 |
| SQLite | 可重建投影 | 筛选、排序、分页、跨页面查询 |
| Tauri cache | 临时 | 加速显示，不能成为账目权威 |

SQLite 损坏或删除后，必须从 JSONL + canonical snapshot 重建；SQLite 主键、数组序号、导入顺序均不能充当 `fact_id` 或 `source_event_id`。

### 3.5 写入协议

```text
lease acquired → intent durable → facts/canonical durable
→ projection durable → manifest commit → checkpoint advance
```

重启恢复必须识别每个中断点；双进程竞争不得双计、漏计或留下不可恢复半提交。禁止用简单的“ledger-first”顺序替代该协议。

## 4. Billing 与成本口径

`BillingContext` / `UserProfile` 允许用户声明固定订阅套餐、按量账户、预算、模型价格来源和可计量范围。所有投影必须保留以下分离：

| 值 | 含义 | 能否冒充真实账单 |
|---|---|---|
| fixed subscription | 用户声明的固定订阅费用 | 否，只能按周期单列 |
| metered actual | 可观测到的按量实际费用 | 可以按口径汇总 |
| metered estimate | 依据价格表的估算 | 不可以 |
| host-billed | 宿主提供的账单/credits 消耗，但无逐请求 token 归因 | 可以按宿主账单口径汇总，不能重标为模型 API 成本 |
| API equivalent | 套餐消耗的等价 API 标价 | 不可以，只作诊断 |
| unresolved | 模型或价格不可确认 | 不得归零 |

## 5. 数据访问接口与 Runtime 编排

```text
agent-vitals-data/
├── evidence/             append / replay / reconciliation
├── store/                SQLite schema / migration / transaction
├── repository/           typed query and mutation boundary
├── billing/              BillingContext / cost basis
├── coverage/             source and denominator coverage
└── projection/           versioned summary DTO builders

agent-vitals-runtime/
├── ingest_service.rs     hosts → data batch orchestration
├── sync_service.rs       scheduling / checkpoint trigger / recovery entry
└── projection_events.rs  cache invalidation / UI refresh event only
```

建议命令：

```text
agent-vitals data coverage [--json]
agent-vitals data rebuild-index
agent-vitals data replay [--host <host>]
agent-vitals billing show
agent-vitals billing validate
```

旧命令兼容一个版本周期，但内部统一调用 Runtime → Data；不得保留第二条 JSON 直读路径。

### 5.1 SQLite、`rusqlite` 与 ORM 决策

v0.9 的权威事实仍是 JSONL；SQLite 只承担可删除、可重建的本地查询索引。选择 SQLite
是因为产品是单用户、离线优先、嵌入式桌面/CLI 运行：无需 App Server，事务、迁移、索引
和时间范围查询均已足够。

- 使用 `rusqlite` 作为 Rust 的 SQLite driver；它已经在 WorkBuddy 只读 source adapter
  中使用，v0.9 将把**共享数据写入**依赖放进 `agent-vitals-data`，不得泄漏到 Domain；
- 不引入 Diesel、SeaORM、SQLx 等完整 ORM/异步数据栈。它们不能定义成本口径或覆盖率，
  反而会扩大依赖、编译和模型迁移成本；
- repository 的 typed query 是唯一取数接口，手写、参数化 SQL 可审计且适合有限 schema；
- DuckDB 仍只可作为显式离线分析/导出 adapter，不可成为实时状态库或第二权威源；
- 将来若需要云同步，再在 Data 之上增加 sync adapter；不得改变 Host/Runtime/UI 的查询契约。

### 5.2 CLI application-layer extraction

v0.9 开工前必须完成 v0.8 E7 的所有权收口。当前 apps/cli/src/agent/ 仍混有三类职责：
宿主 UsageFact emitter、跨宿主 SessionStore/缓存/分页，以及命令输出。该目录不能继续
成为新的数据面 owner。

| 当前类别 | 目标位置 | 迁移原则 |
|---|---|---|
| Claude/Codex/DSH 的 wire → UsageFact emitter | hosts/<host>/sessions/ | 每宿主一份 adapter；不在 CLI 重抄 wire |
| roots、解码、数据库/文件读取 | hosts/<host>/sources/ | 受 sources feature 门控 |
| SessionStore、跨宿主分页、cache、checkpoint、writer | agent-vitals-runtime/ | 一套服务，不按 host 复制 |
| 成本、ID、coverage、事实校验、纯指标 | Domain / Vitals Core | 无 I/O、无 UI、无宿主文件路径 |
| 参数解析、human/JSON 终端渲染 | apps/cli/ | 只能调用 Runtime projection |

迁移不是机械移动文件：例如 Codex 单会话审计的成本/证据组合是 Runtime projection，
不应塞回 hosts/codex；反之 Claude/Codex/DSH 的原始 usage 解释不能继续留在 CLI。

## 6. 存储、隐私与导出

- JSONL 适合审计、append、跨语言 parity 和脱敏导出；
- SQLite 只承担交互查询，不承担第二份权威事实；
- DuckDB 只作为显式启用的离线分析/benchmark/export adapter，读取同一份脱敏输入；
- 原始宿主日志不复制；CanonicalSession 默认 90 天、UsageFact 13 个月、可重建 cache 30 天；
- 私有 trace 与脱敏 export 必须是不同写路径，不能由一个 `redacted: bool` 决定；
- 用户配置与可重建 state/cache 分目录，配置与导出均不得保存凭据。

## 7. 实施阶段

### v0.9.0 Stage 0：Data Access Foundation

- 创建 `agent-vitals-data` crate，冻结 versioned Data Query API 与 Summary/coverage/freshness DTO；
- 用现有 DSH `today/month`、Claude ledger 与 WorkBuddy source 实现只读 source adapters；
  Stage 0 可继续读取 JSON，不要求先迁移历史账本；
- Tauri、CLI、HTML 改为只调用 `daily_summary`、`monthly_summary`、`coverage_status` 等 API，
  禁止再直读 state JSON 或宿主账本；
- 控制台日/月/预算展示 freshness、coverage、host scope 和 excluded hosts；stale / partial /
  excluded 不得降级成零或“正常”；
- 完成 v0.8 E7：Skill Surface ownership migration 与 CLI application-layer extraction；
- 将三宿主 UsageFact emitter 的 wire 解释迁到 hosts/<host>/sessions/，将 SessionStore 的
  cache/checkpoint 所有权迁到 Runtime；
- 为 DSH、Claude Code、Codex 和 WorkBuddy 建立 v0.9 最小宿主接入契约 fixture；
- 保持现有 CLI/Python/WASM 输出零漂移，除新增的 freshness/coverage 契约字段外不重写既有数值。

**门槛：**上层仅依赖 Data Query API，且接口实现可以在不改 UI/CLI 的情况下由 JSON
切换至 SQLite；控制台不会把 stale / partial / excluded 当作零或正常；CLI 不再拥有宿主
wire 解释或事实写入；各宿主的 capability/coverage 与实际注册实现双向对账。

### v0.9.0 Stage A：事实写入与恢复

UsageFact/CanonicalSession writer、lease、generation transaction、故障注入、replay 与 reconciliation。

### v0.9.0 Stage B：索引、计费和覆盖

实现 SQLite schema/migration/rebuild，替换 Stage 0 的 JSON read adapter 为可重建索引；完成
BillingContext/UserProfile、coverage projection、CLI/Tauri data-source status。Data Query API
与上层 DTO 不变。

### v0.9.0 Stage C：发布收口

跨实现 parity、CLI/Tauri/HTML DTO 对账、迁移/删除/恢复文档、脱敏导出验证。

### 7.1 Watcher 的进入门槛

文件 watcher、DSH live subscription 和任何文件一变立即更新的机制均不属于
v0.9.0 发布条件。当前 Tauri 的五分钟 tick 与手动同步是允许的保守实现。

只有下列条件全部满足后，才可以另开后续 feature 实现 watcher：

1. fold_resume(checkpoint, appended) == fold(all) 有 fixture 证明；
2. source revision、稳定 identity 与 exactly-once writer 已在三宿主跑通；
3. append 中、半写入、rename、zstd 更新、重复事件和 watcher 重启均有恢复测试；
4. watcher 只触发 Runtime ingest，不直接让 Tauri、CLI 或 host adapter 写权威 state；
5. UI 只接收 versioned projection 更新事件，而不以文件事件本身作为账已结清的证明。

## 8. Definition of Done

v0.9 可发布，当且仅当：

1. 删除 SQLite 后可由事实文件重建等价 projection；
2. 在 lease、intent、facts、projection、manifest 各提交点注入崩溃，均不双计、不漏计、可恢复；
3. 双进程竞争遵守同一 writer lease；
4. 每月成本按 fixed / actual / estimate / equivalent / unresolved 分开，且可下钻来源；
5. coverage 不把未知伪装成零，所有分母有版本化定义；
6. CLI、Tauri、HTML 均通过同一 Data query DTO 取数；关键账目、宿主范围、新鲜度与覆盖率一致；
7. Python/Rust 的公开 JSON 保持必要的 byte-parity，Python 没有新增 writer、ORM 或网络持久化旁路；
8. v0.10 所需的 Trace/Issue/Action 数据可以只依赖本版事实与 projection，而无需回读 UI 文件。

## 9. 与 v0.10 的交接

v0.9 产出稳定的事实、canonical 输入、成本口径、coverage 与查询接口；v0.10 在此基础上建立任务轨迹、诊断、方案、行动和收益验证。没有 v0.9 的 data readiness，不得在 v0.10 将趋势、节省或自动建议表述为可信结论。
