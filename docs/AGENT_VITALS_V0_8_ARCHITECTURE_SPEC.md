# Agent Vitals 目录与模块边界设计

> 状态：目标架构 v3，已拍板；Phase A 完成，Phase B1 已实施（2026-09-04）
> 适用范围：Rust workspace、Tauri、Python 便携实现、宿主接入与测试资产  
> 关联文档：`ARCHITECTURE.md`、`DELIVERY_ARCHITECTURE.md`、
> `TAURI_RUNTIME_WORKBENCH_SPEC.md`、`VITALS_CORE_V0_5_IMPLEMENTATION_SPEC.md`、
> `VITALS_CORE_V0_6_HOST_CONTRACT_SPEC.md`、`VITALS_CORE_V0_7_DATA_PLANE_SPEC.md`

> v2 补充：Skill/Session 双数据面、Model & Billing、User Profile，以及基于现有
> Rust/Python/Tauri 代码的架构差距评估。本文描述目标边界，不授权在功能提交中夹带
> 目录搬迁。
>
> v3 实施记录：Phase A 在独立分支 `codex/v0.8-phase-a-boundaries` 完成。现有
> `agent-vitals-core` 已建立 `contracts/domain/adapters/hosts` 所有权目录，并以
> compatibility re-export 保持旧公开路径；DSH Session 读取也已从 Skill inventory
> 移到 Session source 后注入。Phase B1 已建立独立 adapters crate 并迁出无反向
> 依赖的叶子 adapter；Phase B2 须在 Phase C 解除两条依赖债务后收口。

## 0. 结论

Agent Vitals 应形成六层单向架构，并由三类独立数据面提供证据：

```text
用户配置            套餐、按量账户、数据源覆盖、预算与偏好
   │
   ├───────────────┐
   ▼               ▼
产品入口（CLI / Tauri / integrations）
                    │
                    ▼
Runtime             文件、SQLite、zstd、watcher、state、catalog、任务编排
                    │
                    ▼
Host Adapters       Skill / Session / MCP 的宿主 wire 解释与标准事实生成
                    │
                    ▼
Agent Domain        模型解析、Billing、UsageFact、Evidence、Finding、报告投影
                    │
                    ▼
Vitals Core         完全通用的证据、覆盖率、检测与回放机制
```

三类证据面必须区分：

```text
Skill Surface       Agent 声明、加载和可发现的能力
Session Surface     Agent 实际行为、用量、成本与轨迹
MCP Surface         外部工具服务的配置与运行健康（后续阶段）
```

它们可以共享同一个宿主 descriptor、source profile 和 provenance，但不能因为底层都
“扫描文件”而共用 scanner、fold 或输出模型。

关键命名：

- `vitals-core`：真正通用的 Vitals Framework，不认识 Agent 或任何宿主；
- `agent-vitals-domain`：Agent Vitals 的跨宿主领域契约与业务计算；
- `agent-vitals-adapters`：各 harness 的纯协议适配；
- `agent-vitals-runtime`：本机数据源、持久化、监听与服务编排；
- `Model Catalog`：模型/provider 身份与版本化价格、套餐定义；
- `User Profile`：当前用户声明的账户、套餐、费用和计费路由；
- `agent-vitals`：用户看到的产品名、CLI 命令和安装包名。

现有 `agent-vitals-core` 不直接改名为 `agent-vitals`。根 package 和产品已经使用
`agent-vitals`，而且这个名字无法表达“领域层”与“通用 Core”的区别。目标状态是把
它逐步拆成 `agent-vitals-domain` 与 `agent-vitals-adapters`；拆分完成前保留当前 crate
名称，避免制造一次大规模无语义重构。

---

## 1. 核心术语

### 1.1 Source Connector

Source Connector 回答：**数据在哪里，如何可靠地取到？**

职责包括：

- 定位宿主安装目录和会话文件；
- 读取文件、SQLite、JSONL；
- zstd 解压与多帧读取；
- 文件监听、debounce、checkpoint；
- 权限、缺文件、坏压缩等 I/O 错误分类；
- 生成 source revision/fingerprint。

它不解释 token 字段，不判断两行是不是同一次请求，也不计算 Finding。

### 1.2 Host Adapter

Host Adapter 回答：**拿到内存中的宿主记录后，这些记录是什么意思？**

职责包括：

- 识别宿主 wire shape；
- 把宿主字段翻译成稳定的领域字段；
- 消解宿主特有的 shadow、重复视图和累计快照；
- 把 cumulative 变成 delta；
- 生成 `CanonicalEvent`、`CanonicalEvidence`、`UsageFact`；
- 声明该宿主的 capability/coverage 上限；
- 保留 provider/model 等原始证据。

Host Adapter 可以执行**宿主语义所必需的纯计算**，但不能读文件、环境变量、SQLite，
也不能写 state。这里的“adapter 不做计算”应理解为“不做跨宿主产品分析”，而不是
禁止它完成去重、快照差分和字段归一化。

### 1.3 Agent Domain

Agent Domain 回答：**标准事实产生后，Agent Vitals 如何审计和解释？**

职责包括：

- `UsageFact`、`SessionKey`、Coverage 等契约；
- 跨宿主统一的 cost/budget/usage 计算；
- trajectory、detector、Finding；
- 会话、日历、总览等投影；
- schema migration 与兼容投影。

它不能知道宿主文件位于哪里，也不应直接解析 Claude/Codex/DSH 原始 JSON 路径。

### 1.4 Vitals Core

Vitals Core 回答：**任意领域的事实如何形成可回放、可解释、三态诚实的诊断？**

它只提供通用机制：Event、Evidence、Signal、Coverage、Provenance、Detector、Replay、
Engine、Finding。公开模块、类型和 fixture 不出现 Codex、Claude、DSH、WorkBuddy、Skill
或 SV 规则码。

### 1.5 Product App

CLI、Tauri 和 integrations 是交互与投递层：解析参数、调用 runtime service、展示或
导出结果。它们不复制 adapter、计费和 detector 的规则。

### 1.6 Skill Surface 与 Session Surface

Skill 与 Session 虽然都可能来自磁盘扫描，但语义完全不同：

| 数据面 | 回答的问题 | 典型输入 | 主要输出 | 更新节奏 |
|---|---|---|---|---|
| Skill Surface | Agent 能做什么、什么已加载/可发现 | `SKILL.md`、plugin/config、skills/list | `SkillVitalRecord`、能力漏斗 | 配置变化、低频扫描 |
| Session Surface | Agent 实际做了什么、哪里异常 | JSONL、rollout、SQLite、事件流 | `CanonicalSession`、`UsageFact`、Finding | 日志追加、近实时 |
| MCP Surface | 外部工具是否配置正确、可用、可靠 | MCP config、handshake、tool call/result | `McpServerRecord`、MCP Finding | 配置变化 + 运行事件 |

三者只通过稳定身份和 provenance 关联。例如 Session 中的 skill invocation 可以推进
`Installed → Loaded → Triggered` 漏斗，但 Session Adapter 不负责扫描 `SKILL.md`，Skill
Adapter 也不负责解释 token/cost。

### 1.7 Model Catalog 与 Billing

模型层分成四个连续步骤，不能塞进 Host Adapter 或单个 `cost.rs`：

```text
model_raw/provider_raw
        ↓ Model Resolver
model_id/provider_id + normalization_version
        ↓ Rate Card Resolver
时间有效的模型价格
        ↓ User Billing Route
subscription / metered / hybrid / unknown
        ↓ Cost Projection
billed / estimated / covered / uncovered / unresolved
```

官方模型、价格和套餐定义属于版本化 Catalog；“当前用户买了什么”属于 User Profile。
套餐覆盖不等于 token 单价为零，月度总感知成本必须把固定订阅支出与按量支出分开。

### 1.8 User Profile

User Profile 是用户声明的本机配置，不是程序观测 state：

- 产品偏好与预算；
- 宿主 source path/profile 覆盖；
- 用户账户别名；
- 订阅套餐、有效期、实际月费和币种；
- host/source_profile/provider 到计费账户的路由；
- 按量、订阅、混合或未知的声明。

Runtime 负责从 `~/.agent-vitals/` 读取并校验配置，再把 typed `BillingContext` 传给
Domain。Domain 不自行读取 home，配置中也不保存 API Key、OAuth token、Cookie 或支付
凭证。

---

## 2. 目标目录结构

```text
agent-vitals/
├── Cargo.toml                         # Rust workspace，只声明成员与公共 profile
├── README.md
│
├── apps/                              # 用户直接运行的产品
│   ├── cli/
│   │   ├── Cargo.toml
│   │   └── src/
│   │       ├── main.rs
│   │       ├── commands/
│   │       │   ├── scan.rs
│   │       │   ├── doctor.rs
│   │       │   ├── sessions.rs
│   │       │   ├── usage_facts.rs
│   │       │   └── export.rs
│   │       └── output/
│   │           ├── json.rs
│   │           └── terminal.rs
│   │
│   └── desktop/
│       ├── src-tauri/
│       │   ├── Cargo.toml
│       │   └── src/
│       │       ├── main.rs
│       │       ├── commands/
│       │       ├── tray/
│       │       ├── watcher/
│       │       └── window/
│       └── ui/
│           ├── package.json
│           └── src/
│               ├── pages/
│               │   ├── overview/
│               │   ├── sessions/
│               │   ├── calendar/
│               │   ├── findings/
│               │   └── sources/
│               ├── components/
│               └── ipc/
│
├── crates/
│   ├── vitals-core/                   # 通用机制；现有 crate 保留
│   │   └── src/
│   │       ├── lib.rs
│   │       ├── id.rs
│   │       ├── event.rs
│   │       ├── signal.rs
│   │       ├── coverage.rs
│   │       ├── provenance.rs
│   │       ├── trajectory.rs
│   │       ├── detector.rs
│   │       ├── evidence.rs
│   │       ├── finding.rs
│   │       ├── replay.rs
│   │       ├── engine.rs
│   │       ├── report.rs
│   │       └── error.rs
│   │
│   ├── agent-vitals-domain/           # 跨宿主 Agent 领域
│   │   └── src/
│   │       ├── lib.rs
│   │       ├── contracts/
│   │       │   ├── mod.rs
│   │       │   ├── usage_fact.rs
│   │       │   ├── session_key.rs
│   │       │   ├── source_identity.rs
│   │       │   ├── host_capability.rs
│   │       │   └── coverage.rs
│   │       ├── audit/
│   │       │   ├── mod.rs
│   │       │   ├── canonical_audit.rs
│   │       │   ├── trajectory.rs
│   │       │   ├── findings.rs
│   │       │   └── detectors/
│   │       ├── analytics/
│   │       │   ├── mod.rs
│   │       │   ├── usage.rs
│   │       │   ├── budget.rs
│   │       │   ├── duration.rs
│   │       │   ├── compaction.rs
│   │       │   └── waste.rs
│   │       ├── models/
│   │       │   ├── mod.rs
│   │       │   ├── identity.rs
│   │       │   ├── resolver.rs
│   │       │   ├── aliases.rs
│   │       │   └── normalization.rs
│   │       ├── billing/
│   │       │   ├── mod.rs
│   │       │   ├── account.rs
│   │       │   ├── user_profile.rs
│   │       │   ├── rate_card.rs
│   │       │   ├── subscription.rs
│   │       │   ├── entitlement.rs
│   │       │   ├── attribution.rs
│   │       │   ├── price_engine.rs
│   │       │   └── currency.rs
│   │       ├── projection/
│   │       │   ├── mod.rs
│   │       │   ├── session.rs
│   │       │   ├── calendar.rs
│   │       │   ├── overview.rs
│   │       │   └── source_status.rs
│   │       └── compatibility/
│   │           ├── canonical_session.rs
│   │           └── legacy_findings.rs
│   │
│   ├── agent-vitals-adapters/         # 无 I/O 的 harness 适配
│   │   └── src/
│   │       ├── lib.rs
│   │       ├── registry.rs
│   │       ├── shared/
│   │       │   ├── canonical_json.rs
│   │       │   ├── timestamp.rs
│   │       │   └── identity.rs
│   │       └── hosts/
│   │           ├── claude_code/
│   │           │   ├── mod.rs
│   │           │   ├── skills/
│   │           │   │   ├── manifest.rs
│   │           │   │   └── visibility.rs
│   │           │   ├── sessions/
│   │           │   │   ├── wire.rs
│   │           │   │   ├── evidence.rs
│   │           │   │   ├── usage.rs
│   │           │   │   └── usage_fact.rs
│   │           │   └── capability.rs
│   │           ├── codex/
│   │           │   ├── mod.rs
│   │           │   ├── skills/
│   │           │   │   ├── catalog.rs
│   │           │   │   └── visibility.rs
│   │           │   ├── sessions/
│   │           │   │   ├── wire.rs
│   │           │   │   ├── evidence.rs
│   │           │   │   ├── usage.rs
│   │           │   │   └── usage_fact.rs
│   │           │   └── capability.rs
│   │           ├── dsh/
│   │           │   ├── mod.rs
│   │           │   ├── skills/
│   │           │   │   ├── manifest.rs
│   │           │   │   ├── visibility.rs
│   │           │   │   └── invocation.rs
│   │           │   ├── sessions/
│   │           │   │   ├── wire.rs
│   │           │   │   ├── observer.rs
│   │           │   │   ├── evidence.rs
│   │           │   │   ├── usage.rs
│   │           │   │   └── usage_fact.rs
│   │           │   ├── mcp/           # 后续阶段；未实现时不建空模块
│   │           │   └── capability.rs
│   │           ├── workbuddy/
│   │           │   ├── mod.rs
│   │           │   ├── skills/
│   │           │   ├── sessions/
│   │           │   │   ├── wire.rs
│   │           │   │   ├── evidence.rs
│   │           │   │   └── usage.rs
│   │           │   └── capability.rs
│   │           ├── openclaw/
│   │           └── hermes/
│   │
│   ├── agent-vitals-runtime/          # 本机 I/O、状态和调度
│   │   └── src/
│   │       ├── lib.rs
│   │       ├── sources/
│   │       │   ├── mod.rs
│   │       │   ├── claude_code/
│   │       │   │   ├── skills/
│   │       │   │   │   ├── discovery.rs
│   │       │   │   │   └── config_reader.rs
│   │       │   │   └── sessions/
│   │       │   │       ├── discovery.rs
│   │       │   │       └── jsonl_reader.rs
│   │       │   ├── codex/
│   │       │   │   ├── skills/
│   │       │   │   │   └── app_server.rs
│   │       │   │   └── sessions/
│   │       │   │       ├── discovery.rs
│   │       │   │       └── rollout_reader.rs
│   │       │   ├── dsh/
│   │       │   │   ├── skills/
│   │       │   │   │   ├── discovery.rs
│   │       │   │   │   └── config_reader.rs
│   │       │   │   ├── sessions/
│   │       │   │   │   ├── discovery.rs
│   │       │   │   │   ├── session_reader.rs
│   │       │   │   │   └── zstd.rs
│   │       │   │   └── mcp/           # passive config；active probe 必须显式授权
│   │       │   └── workbuddy/
│   │       │       ├── skills/
│   │       │       └── sessions/
│   │       │           ├── discovery.rs
│   │       │           ├── sqlite.rs
│   │       │           └── history_reader.rs
│   │       ├── user/
│   │       │   ├── home.rs
│   │       │   ├── config.rs
│   │       │   ├── billing.rs
│   │       │   ├── sources.rs
│   │       │   ├── validation.rs
│   │       │   └── migration.rs
│   │       ├── catalog/
│   │       │   ├── loader.rs
│   │       │   ├── cache.rs
│   │       │   └── validation.rs
│   │       ├── state/
│   │       │   ├── mod.rs
│   │       │   ├── store.rs
│   │       │   ├── ledger.rs
│   │       │   ├── migration.rs
│   │       │   └── takeover.rs
│   │       ├── watcher/
│   │       │   ├── filesystem.rs
│   │       │   ├── scheduler.rs
│   │       │   └── debounce.rs
│   │       └── services/
│   │           ├── session_service.rs
│   │           ├── usage_service.rs
│   │           ├── audit_service.rs
│   │           └── report_service.rs
│   │
│   └── agent-vitals-wasm/
│       └── src/lib.rs
│
├── packages/
│   └── agent-vitals-python/           # Python 便携/兼容实现，独立发布边界
│       ├── pyproject.toml
│       └── agent_vitals/
│           ├── cli.py
│           ├── adapters/
│           │   ├── claude_code/
│           │   ├── codex/
│           │   ├── dsh/
│           │   └── workbuddy/
│           ├── contracts/
│           ├── compatibility/
│           └── skills/
│
├── integrations/                      # 宿主内 UI、插件和便携调用入口
│   ├── dsh-client/
│   ├── openclaw/
│   └── skills/
│
├── assets/
│   ├── catalog/
│   │   ├── models/
│   │   ├── pricing/
│   │   └── subscriptions/
│   ├── templates/
│   └── icons/
│
├── fixtures/                          # 按宿主保存原始、脱敏、可重放语料
│   ├── claude_code/
│   ├── codex/
│   ├── dsh/
│   └── workbuddy/
│
├── tests/
│   ├── architecture/                  # 依赖方向与注册完整性
│   ├── contracts/                     # UsageFact/SessionKey/schema
│   ├── parity/                        # Python ↔ Rust 字节一致
│   ├── golden/                        # 重构零漂移
│   └── integration/                   # CLI/runtime/Tauri 边界
│
├── docs/
│   ├── architecture/
│   ├── specs/
│   ├── adr/
│   ├── host-integrations/
│   └── product/
│
└── xtask/                             # fixture、golden、检查和发布编排
    └── src/
```

---

## 3. 依赖规则

### 3.1 允许的方向

```text
apps/cli ───────────────┐
apps/desktop ───────────┼──► agent-vitals-runtime
integrations ───────────┘              │
                            ┌───────────┴────────────┐
                            │ user config + catalog │
                            └───────────┬────────────┘
                                       ▼
                           agent-vitals-adapters
                                       │
                                       ▼
                            agent-vitals-domain
                                       │
                                       ▼
                                 vitals-core

agent-vitals-wasm ─────────► agent-vitals-adapters（仅纯模块）
agent-vitals-wasm ─────────► agent-vitals-domain ─► vitals-core
```

### 3.2 禁止的方向

```text
vitals-core              → 任意 Agent/宿主/runtime/app
agent-vitals-domain      → adapter/runtime/app
agent-vitals-adapters    → runtime/app
agent-vitals-runtime     → CLI/Tauri UI
Tauri UI                 → 直接读取宿主文件或 state
```

同层模块之间也不得通过 JSON 绕过正式类型契约。JSON 是跨语言和外部 API；Rust crate
内部优先使用 typed struct，在序列化边界才转 JSON。

### 3.3 依赖预算

- `vitals-core`：只接受通用、可 WASM、无 I/O 依赖；
- `agent-vitals-domain`：可依赖 `vitals-core`、serde、纯算法库；
- `agent-vitals-adapters`：可依赖 domain 和纯解析库，不能依赖 SQLite/watcher；
- `agent-vitals-runtime`：可使用 `rusqlite`、`ruzstd`、文件监听等 native 依赖；
- `apps/desktop`：依赖 runtime，Tauri command 不持有领域规则。

用户配置和 Catalog 是输入，不是更高权限的业务层：Runtime 只负责读取、校验和版本选择，
Domain 的 resolver/billing 接收 typed snapshot 后计算，不能在纯函数内部再次读取磁盘。

---

## 4. 同一宿主为什么出现两次

同一宿主分别出现在 `adapters/hosts/` 和 `runtime/sources/` 是有意设计，不是平行实现：

```text
runtime::sources::dsh
  locate → read → decompress → fingerprint
                         │
                         ▼
adapters::hosts::dsh
  parse wire → observe → dedupe/delta → UsageFact/Evidence
                         │
                         ▼
agent-vitals-domain
  cost → findings → session/calendar/overview projection
```

### 4.1 同一宿主内部为什么还要区分 skills/sessions/mcp

目录第一维按宿主组织，便于新增 harness；第二维按证据面组织，防止把“配置能力”和
“实际行为”混成一个扫描器：

```text
hosts/dsh/
├── skills/       SKILL.md、启用/加载/遮蔽、调用关联
├── sessions/     行为事件、轨迹、usage、cost 事实
├── mcp/          MCP 配置与运行证据（后续）
└── capability.rs 三个 surface 分别声明能力
```

Skill 与 Session 的关联发生在 Domain/service，不发生在 reader：Session 中观测到
`skill-invocation` 后，用稳定的 host/source_profile/observer/skill identity 与
`SkillVitalRecord` 对账。扫描不到某个 surface 时必须标 unavailable，不能用空数组伪装
“实测为零”。

### 4.2 Source 与 Adapter 的分工示例

以 DSH 为例：

| 代码 | 归属 | 原因 |
|---|---|---|
| 查找 `session.jsonl.zstd` | runtime source | 文件系统策略 |
| 多帧 zstd 解压 | runtime source | I/O/原生依赖 |
| 识别 `assistant/chunk` usage | host adapter | DSH wire 语义 |
| 相邻 run shadow 替换 | host adapter | DSH 计量语义 |
| 生成 DSH `UsageFact` | host adapter | 宿主 → 领域契约边界 |
| 汇总跨宿主月度 token | domain | 与 DSH 无关 |
| Tauri 自动刷新 | app/runtime | 生命周期与 UI 编排 |

如果未来为了代码导航希望按宿主垂直聚合，可以在仓库顶层改成
`hosts/dsh/{adapter,runtime}` 两个 crate，但不能因此取消编译期的 I/O 边界。当前宿主数
和代码量下，统一的 adapters/runtime 两个 crate 更容易维护，也不会产生大量小 crate。

---

## 5. Host Adapter 内部契约

每个支持运行时审计的宿主目录按能力选择下列文件；不支持的能力不创建空文件：

```text
hosts/<host>/
├── mod.rs                 对外出口与 descriptor
├── skills/
│   ├── manifest.rs        宿主 Skill 元数据
│   ├── visibility.rs      enabled/loaded/discoverable
│   ├── shadowing.rs       scope 与同名覆盖
│   └── invocation.rs      与 Session 调用证据的关联
├── sessions/
│   ├── wire.rs            宿主会话字段与版本嗅探
│   ├── evidence.rs        raw → CanonicalEvidence/CanonicalEvent
│   ├── observer.rs        请求槽、shadow、累计快照
│   ├── usage.rs           宿主 token 语义
│   └── usage_fact.rs      observation → UsageFact
├── mcp/                   后续独立 surface，不塞进 skills/
│   ├── config.rs
│   ├── events.rs
│   └── invocation.rs
└── capability.rs          三个 surface 分别声明能力上限
```

统一要求：

1. 输入是内存数据或 `Read` 抽象，不自行定位用户目录；
2. 不读取环境变量和全局配置；
3. 不写 state，不负责 watcher；
4. raw 字段保持原样，normalized 字段带版本；
5. 缺失与真实零分开；
6. cumulative 在 adapter 边界转 delta；
7. shadow、重复与不可归属必须可解释；
8. 输出由 domain contract 校验；
9. 同一输入产生确定性、可逐字节比较的输出；
10. capability 声明必须进入 host registry 完整性测试。
11. Skill scanner 不读取 token/cost，Session scanner 不扫描 `SKILL.md`；
12. MCP 默认只消费配置和已有证据，主动 handshake/probe 必须由 Runtime 显式授权。

不建议现在创建一个包办所有行为的 `HostAdapter` 大 trait。不同宿主的数据源和能力差异
过大，容易形成大量 `Option` 和伪空实现。优先统一数据契约、模块命名和 registry；只有
在至少三个宿主出现完全相同、稳定的调用生命周期后，才抽最小 trait。

---

## 6. Runtime Source 内部契约

```text
sources/<host>/
├── skills/
│   ├── discovery.rs       SKILL.md、plugin/config、skills/list 来源
│   └── reader.rs
├── sessions/
│   ├── discovery.rs       会话根目录与候选文件
│   ├── reader.rs          JSONL/rollout/SQLite 读取
│   ├── fingerprint.rs     revision/checkpoint 输入
│   └── watcher.rs         仅需要特殊监听时存在
├── mcp/
│   ├── config_reader.rs   默认被动读取
│   └── probe.rs           显式授权的主动探测
└── error.rs               I/O 错误映射
```

统一输出不应直接是最终报告，而应是类似：

```text
SourceDocument {
    host,
    source_profile,
    path/reference,
    revision,
    bytes/records,
    read_status,
}
```

然后由 `services/session_service` 把 SourceDocument 交给对应 Host Adapter。这样 CLI、Tauri
和批处理共用同一个调用链，不会各写一套“读完以后顺手解析”的实现。

Skill Source 可以使用同一 envelope，但 `kind="skill-manifest|skill-runtime-catalog"`；
Session Source 使用 `kind="session-log|rollout|session-db"`。`kind` 是调度标签，不能靠
文件扩展名猜数据面。

---

## 7. Host Registry

registry 负责把宿主名称、能力和 adapter/source 入口关联起来，但不成为万能 dispatcher。

建议 descriptor 至少包含：

```text
HostDescriptor {
    id,
    display_name,
    adapter_version,
    skill_surface: { inventory, visibility, invocation_evidence },
    session_surface: { discovery, behavior, usage, live_watch },
    mcp_surface: { config, passive_runtime_evidence, active_probe },
    supported_sources,
    supported_signals,
    supported_outputs,
}
```

注册完整性守卫必须验证：

- CLI `--host` 词表与 registry 一致；
- adapter 目录与 registry 一致；
- runtime source 若存在，registry 必须声明；
- capability matrix 中每个宿主都有来源；
- Skill/Session/MCP 三个 surface 分别声明，不允许一个总 `available=true` 代替；
- 无 source 的纯导入 adapter 必须显式标记 `external-input-only`；
- UI 不维护第二份宿主列表。

---

## 8. 新宿主接入模板

以新增 `new-harness` 为例：

```text
crates/agent-vitals-adapters/src/hosts/new_harness/
├── mod.rs
├── skills/                  # 宿主有 Skill Surface 时创建
│   ├── manifest.rs
│   └── visibility.rs
├── sessions/                # 宿主有 Session Surface 时创建
│   ├── wire.rs
│   ├── evidence.rs
│   ├── usage.rs
│   └── usage_fact.rs
├── mcp/                     # 后续有 MCP 证据时创建
└── capability.rs

crates/agent-vitals-runtime/src/sources/new_harness/
├── skills/
│   ├── discovery.rs
│   └── reader.rs
├── sessions/
│   ├── discovery.rs
│   └── reader.rs
├── mcp/
└── error.rs

fixtures/new_harness/
├── README.md
├── minimal.jsonl
├── malformed.jsonl
└── build_fixture.*

docs/host-integrations/new-harness.md
```

接入顺序：

1. 用真实脱敏语料记录 wire contract；
2. 分别决定 Skill/Session/MCP surface 的能力，不把未知项填零；
3. 只为真实存在的 surface 实现 source discovery/reader；
4. 实现对应的纯 wire parser；
5. Session 可用时生成 CanonicalEvidence；
6. 宿主提供 usage 时再实现 observation 与 UsageFact；
7. 注册 HostDescriptor；
8. 加 Rust 单测、golden、跨语言 parity（仍有 Python 镜像时）；
9. 最后接 CLI/Tauri 展示。

新增宿主不应要求修改 `vitals-core`。如果为了接入一个 harness 必须在 `vitals-core` 中
新增宿主字段，说明边界放错，应退回 adapter/domain 重新设计。

---

## 9. Python 的位置

Python 不再与 Rust 项目源码混放成看似同一实现层，而作为独立 package：

```text
packages/agent-vitals-python/
```

短期职责：

- ClawHub/OpenClaw 等无二进制安装场景；
- 现有 Skill 调用入口；
- Rust 迁移期间的独立 parity oracle；
- 必要的便携、只读诊断。

长期原则：

- Tauri/runtime 不调用 Python 子进程完成核心工作；
- 新的 watcher、SQLite writer、state owner 只实现 Rust；
- Python 不无条件复制每个新产品能力；
- 每个平行模块必须标明 `authoritative / mirror / compatibility / retiring` 状态；
- 达到退役能力门后，可将 Python 缩成 CLI 客户端或移出主仓库。

---

## 10. Model、Billing 与用户配置

### 10.1 四类数据必须分开

| 类别 | 例子 | 权威来源 | 可否由程序推断 |
|---|---|---|---|
| Model Registry | 模型别名、provider、系列、上下文窗 | 随产品发布的版本化资产与宿主原始字段 | 可解析身份，无法匹配时保留 raw |
| Rate Card Catalog | 按 provider/model/时间生效的 input/cache/output 单价 | 版本化资产或有来源记录的远端 catalog | 不能从 token 或模型名猜价格 |
| User Profile | 用户买了 Claude Pro、月费 ¥140、生效日期 | 用户声明或受信任的账户同步 | 缺失时只能标 unknown |
| Observed Usage | 某次请求的 input/cache/output token | Session Surface 原始证据 | 由 adapter 规范化 |

Registry/Rate Card 不能写死“用户订阅了什么”；User Profile 不能复制整张模型价格表；
Session Adapter 不能因为看到某个宿主就默认它被套餐覆盖。这四个输入在 Billing Domain
中才合流。

### 10.2 `~/.agent-vitals/` 的推荐布局

```text
~/.agent-vitals/
├── config.toml                 # UI、预算、币种、隐私与刷新偏好
├── billing.toml                # 用户账户、套餐、有效期、实际月费、计费路由
├── sources.toml                # 宿主 source profile 与显式路径覆盖
├── state/                      # 程序生成，可重建的 ledger/index/projection
│   ├── ledger/
│   ├── sessions/
│   └── projections/
├── cache/                      # 可删除、可重建
│   ├── catalogs/
│   └── checkpoints/
├── reports/                    # 导出的 HTML/JSON，不作为真相源回读
├── logs/
└── version.json               # home schema 与迁移状态
```

边界规则：

- `config.toml`、`billing.toml`、`sources.toml` 是用户输入；不能被扫描任务静默覆盖；
- `state/`、`cache/`、`reports/` 是程序产物；删除后不应改变用户的套餐声明；
- API Key、OAuth token、Cookie、银行卡信息不写入这些文件，敏感引用使用系统 Keychain、
  环境变量或宿主自己的凭证存储；
- 配置文件建议仅当前用户可读写；导出报告默认脱敏路径、账户名和原始 prompt；
- 当前兼容顺序
  `AGENT_VITALS_HOME → SKILL_VITALS_HOME → ~/.agent-vitals → ~/.skill-vitals`
  保留到显式迁移完成，不能仅因改名让历史 state 消失。

目前 Python、根 Rust CLI、Tauri 各自实现了 data-home 选择。语义虽有测试对齐，目标仍应是
Runtime 中唯一的 `HomeResolver`；迁移期保留三端契约测试，调用方切换后再删除复制代码。

### 10.3 `billing.toml` 的语义示例

```toml
schema_version = 1
reporting_currency = "CNY"

[[accounts]]
id = "anthropic-personal"
provider = "anthropic"
mode = "subscription"

[[accounts.subscriptions]]
plan_id = "claude-pro"
monthly_price = 140.00
currency = "CNY"
valid_from = "2026-08-01"
# valid_to 缺失表示当前仍有效；并不表示所有 Anthropic API 用量都被覆盖

[[accounts]]
id = "openai-api"
provider = "openai"
mode = "metered"

[[routes]]
host = "claude-code"
source_profile = "personal"
account = "anthropic-personal"

[[routes]]
host = "codex"
source_profile = "api-project-a"
account = "openai-api"
```

`route` 应以 `host + source_profile` 为最低可靠粒度；需要时再增加 provider、workspace 或
组织维度。只按模型名匹配会把同名模型的订阅渠道和 API 渠道混为一笔。

### 10.4 成本输出不能只有一个 `cost`

建议月度总览至少分开：

```text
perceived_monthly_cost
├── subscription_fixed_cost       用户声明的固定套餐支出
├── metered_billed_cost            有账单/明确计费路由的按量金额
├── metered_estimated_cost         只有 token × catalog 的估算金额
├── covered_usage_equivalent       套餐覆盖用量的反事实等价金额（诊断项）
└── unresolved_usage               无法归属账户/价格的 token 与原因
```

首页可展示“本月总感知成本”，但必须允许拆开订阅与按量；缓存率、reasoning 占比、浪费归因
属于诊断指标，不应冒充账单。价格未知、路由冲突或套餐覆盖未知时，结果必须是 `unknown` /
`unresolved`，不能回落成零。

Catalog 中每张 rate card 应携带 `catalog_version`、币种、`effective_from/to`、输入/缓存输入/
输出价格和来源。历史会话按事件时间选择价格版本；更新 catalog 不应改写已封账事实，只能
生成带新 projection version 的重算结果。

---

## 11. 现有文件迁移映射

| 当前文件/目录 | 目标位置 |
|---|---|
| `crates/vitals-core` | 原位保留 |
| `agent-vitals-core/usage_fact.rs` | `agent-vitals-domain/contracts/usage_fact.rs` |
| `agent-vitals-core/r2a.rs` 的纯契约 | `agent-vitals-domain/contracts/session_key.rs` |
| `agent-vitals-core/r2a.rs` 的存储投影 | `agent-vitals-runtime/state/` |
| `agent-vitals-core/claude_code_evidence.rs` | `agent-vitals-adapters/hosts/claude_code/evidence.rs` |
| `agent-vitals-core/codex_evidence.rs` | `agent-vitals-adapters/hosts/codex/evidence.rs` |
| `agent-vitals-core/codex_usage.rs` | `agent-vitals-adapters/hosts/codex/usage.rs` |
| `agent-vitals-core/dsh_evidence.rs` | `agent-vitals-adapters/hosts/dsh/evidence.rs` |
| `agent-vitals-core/workbuddy_evidence.rs` | `agent-vitals-adapters/hosts/workbuddy/evidence.rs` |
| `agent-vitals-core/usage.rs` | 拆为 domain 通用计算与 `adapters/hosts/dsh/usage.rs` |
| `agent-vitals-core/cost.rs` | 拆为 domain `models/` + `billing/`；宿主字段翻译进对应 adapter |
| `src/skills/discovery.rs`、`src/skills/inventory.rs` | runtime Skill Source + Skill service；移除对 Session reader 的直接编排 |
| `src/skills/snapshot.rs`、`scripts/agent_vitals/paths.py`、Tauri `overview.rs` 的 home 解析 | `agent-vitals-runtime/user/home.rs`，迁移期保留跨实现契约测试 |
| `src/agent/*session*.rs` | `agent-vitals-runtime/sources/<host>/reader.rs` |
| `src/agent/discovery.rs` | `agent-vitals-runtime/sources/` + registry |
| `src/agent/r2a_store.rs` | `agent-vitals-runtime/state/` |
| `src/agent/takeover.rs` | `agent-vitals-runtime/state/takeover.rs` |
| `src-tauri` | `apps/desktop/src-tauri` |
| `src-tauri/ui` | `apps/desktop/ui` |
| `scripts/agent_vitals` | `packages/agent-vitals-python/agent_vitals` |
| `dsh-client` | `integrations/dsh-client` |
| `scripts/agent_vitals/pricing.json` | `assets/catalog/pricing/`；由 catalog loader 校验并版本选择 |
| `pricing.json` 里的套餐定义 | `assets/catalog/subscriptions/`；用户购买事实进入 `~/.agent-vitals/billing.toml` |
| 模板、图标 | `assets/` 对应子目录 |

Stage 3 DSH observer 的当前落点仍可按已经批准的 v4 规格放入现有
`agent-vitals-core::usage`，先守住 byte-neutral 与 Python/Rust parity。目标架构下它属于
`agent-vitals-adapters::hosts::dsh::observer`。这次功能实现与目录迁移应分开提交，不能用
架构整理扩大 Stage 3 的变更面。

---

## 12. 现有代码架构评估

### 12.1 总评

当前代码不是“推倒重来”的状态。通用 Core、宿主事实、CLI/Tauri、Python parity 已经形成
可工作的垂直闭环；尤其 `vitals-core` 的无 I/O 和无宿主词汇边界是真实存在的，不只是
文档约定。问题主要在 `vitals-core` 之上的物理边界尚未跟上功能增长。

以“能否低风险接入第五、第六个宿主，并让 CLI/Tauri 共用同一热更新数据面”为标准，当前
架构成熟度约 **65%–70%**：基础契约和验证能力较强，模块归属、运行时服务与用户计费模型
仍不完整。这个百分比是架构判断，不是测试覆盖率。

### 12.2 已经做对的部分

1. `crates/vitals-core` 已明确禁止 I/O 和宿主概念，并有依赖边界测试；这是可以继续保留的
   Framework Core。
2. `agent-vitals-core` 明确定位纯计算，Tauri 复用其成本函数，没有产生第四套计价公式。
3. UsageFact、golden、Python/Rust byte-parity 和 CLI matrix 为后续搬目录提供了很强的
   零漂移护栏。
4. `host_runtime_registration.rs` 已开始校验宿主运行时注册与 Core host 列表，为目标 Host
   Registry 提供了可演进基础。
5. 新旧 data home 优先级已经在 Python、Rust CLI、Tauri 三端明确并测试，品牌迁移不会
   直接丢失老用户状态。
6. Tauri 已能消费现有 Core 与 CLI 会话 DTO，证明桌面入口不需要 Node.js app server 才能
   建立闭环。

### 12.3 主要差距与优先级

| 优先级 | 现状 | 风险 | 目标动作 |
|---|---|---|---|
| P1 | `agent-vitals-core/src` 平铺 Claude/Codex/DSH/WorkBuddy 模块 | 新宿主继续扩大“core”含义，所有权不清 | 先在现 crate 内建 `contracts/domain/adapters/hosts`，再拆 crate |
| P1 | 缺独立 Runtime；根 CLI 管 reader/state，Tauri 又直接读 state 并 spawn CLI | 热更新、锁、checkpoint 和错误语义可能出现两套 owner | 抽 runtime services；CLI/Tauri 都成为客户端 |
| P1 | `src/skills/inventory.rs` 同时编排 Skill inventory、DSH session evidence、Codex runtime probe | Skill 与 Session 数据面耦合，失败/空值含义不清 | 拆 Skill Source/Service 与 Session Source/Service，只在 Domain 投影关联 |
| P1 | `cost.rs` 同时承担模型匹配、价格表、订阅排除和成本投影 | 无法诚实表达用户买了什么、历史价格和混合计费 | 建 Model Catalog、BillingContext、User Profile 三个明确边界 |
| P1 | data-home 解析存在 Python、CLI Rust、Tauri 三份 | 规则演进时可能漂移 | Runtime 建唯一 `HomeResolver`；迁移期用契约测试锁步 |
| P2 | `usage.rs`、`r2a_store.rs`、根 `main.rs`、Tauri `lib.rs/overview.rs` 均接近或超过 2K 行 | 修改影响面大，职责难以独立测试 | 按领域/服务/command 渐进切片，不做机械按行数拆分 |
| P2 | Python adapter 反向导入 `agent.usage`，部分模块靠延迟 import 避免环 | 镜像实现的层级含义不稳定 | Python 包采用相同 contracts/domain/adapters 分层，共享 helper 下沉 |
| P2 | `r2a_store.rs` 聚合 discovery、store、projection 与宿主差异 | Session data plane 难以复用和增量化 | 分成 source index、ledger/store、projection service |

这些是结构性债务，暂未发现需要中止 Stage 3 的架构级 P0。Stage 3 应继续按已批准的
byte-neutral observer 范围完成；不要在同一个提交中顺手移动目录。真正的 P0 仍是事实
身份、去重、累计转 delta、封账/增量语义等正确性，一旦相关门禁失败才应阻断功能开发。

### 12.4 对 Tauri 的判断

Tauri 自身就是常驻桌面进程，不需要额外启动 Node.js 服务来监听 Session 日志。目标是把
watcher、reader、ledger 和 projection 放进 Rust Runtime，由 Tauri command 调 service，
并用 event 推送 UI。当前 `store.rs` 通过子进程取得 sessions DTO 是合理的过渡兼容层，
但不应成为最终内部架构；`overview.rs` 直接解析 home/config/state 也应逐步迁往 Runtime。

这意味着报告既可以封装在客户端内，也可以导出浏览器可打开的静态 HTML：两者消费同一
projection DTO，而不是维护两套审计和计费逻辑。

---

## 13. 分阶段迁移

### Phase A：先建立逻辑边界，不改 crate 名

- [x] 在现有 `agent-vitals-core/src` 内建立 `contracts/`、`domain/`、`adapters/hosts/`；
- [x] 在现有 runtime 代码内先区分 `skills/` 与 `sessions/` 调用链；
- [x] 用 re-export 保持旧 public path；
- [x] 新宿主代码不再落到根目录；
- [x] 增加禁止 adapter 依赖 I/O crate 的架构测试。

Phase A 的 runtime 边界采用依赖注入而不是新建一套 fold：
`agent/session_sources.rs` 读取 DSH Session 证据，根编排层把已读取的
`SessionEvidenceInput` 传给 `skills/inventory.rs`。Skill inventory 仍可做
Installed/Loaded/Triggered 关联，但不能自行扫描 Session 文件。Codex/OpenClaw 的
runtime probe 仍属于 Skill capability 求证，不被误分类为 Session 日志读取。

### Phase B：抽出 `agent-vitals-adapters`

**B1（已完成，2026-09-04）：**

- [x] 建立独立纯计算 crate、四宿主命名空间、统一 flat compatibility facade；
- [x] 迁移 Claude evidence、Codex evidence、WorkBuddy evidence 三个叶子 adapter；
- [x] CLI 改为统一从 `agent-vitals-adapters` 调用；
- [x] 增加 adapter 依赖预算、无 I/O、无反向依赖和 facade 等价守卫；
- [x] 全量门禁零漂移：`cargo test/clippy`、Python `unittest` 1143、golden 15+15
      逐字节、`cargo check -p agent-vitals-wasm` 全绿。

WASM **暂不登记** `agent-vitals-adapters` 依赖——`agent-vitals-wasm/src/lib.rs`
当前只调 `domain` 侧函数（behavior/trajectory/usage/…），没有一个符号来自新
adapter crate。§3.1 的 `wasm ─► adapters` 边是**未来边**：等某个 Phase 让 wasm
经 adapter facade 取证据时，届时那个 Phase 带真实调用点一起加，不提前挂空依赖。

**B2（待 Phase C 解耦后收口）：**

- [ ] 物理迁移 Codex usage 与 DSH evidence（Phase C 先断 domain → host 依赖）；
- [ ] 迁移后重跑全量门禁与 Python/Rust parity 零漂移，撤掉 core 里的两条 re-export。

Phase B 实施时确认了原提案未展开的 Cargo 环：`domain::usage` 仍调用 Codex fold，
`domain::behavior/trajectory/compaction/waste` 仍调用 DSH evidence。若 core 依赖新 adapter
crate，同时 adapter 又依赖 core contracts/domain，会形成循环。因此 Phase B1 采用
可编译的单向结构：

```text
agent-vitals-adapters ──► agent-vitals-core
          │
          └─ 统一 re-export core 中暂留的 codex_usage / dsh_evidence
```

这两项被架构测试钉为**仅有的 Phase C 残余债务**，不得扩张。Phase C 必须先把宿主
wire 解释从 domain 消费链中解耦，再执行 Phase B2 物理迁移；不能通过复制 parser、
fold 或 identity 逻辑来“消除”Cargo 环。

### Phase C：抽出 `agent-vitals-domain`

> **代码调研先行**（用户 2026-09-04 要求）：`docs/AGENT_VITALS_V0_8_PHASE_C_RESEARCH.md`。
> 调研结论修正了本节的范围估计——真实的 `domain → host` 生产耦合是 **6 个点 / ~370 行**
> （3 组：`Coords`+`tool_invocation` → contracts；`match_behavior`/`match_trajectory`
> raw shim → dsh adapter；canonical 归一层（生产零调用点）→ adapters），**不是**
> 「拆 `usage.rs` 188KB」。

- **C1–C3（阻塞项，见调研 §2–4）**：断 `domain → {dsh_evidence, codex_usage}` 的
  3 组耦合，每组「移动 + 改 import」级、golden 零漂移。
- **B2**：`dsh_evidence` + `codex_usage` residual 物理迁进 `agent-vitals-adapters`，
  撤 core lib.rs 的两条 re-export。
- **抽 crate**：`domain/` 整体成 `agent-vitals-domain`；`agent-vitals-core` 退成
  `contracts/` + `compatibility/` 薄 crate（arch §0「拆完前保留 crate 名」）。
- **不在 Phase C**：`cost.rs` 99KB 拆 Model Resolver / Rate Card / BillingContext /
  Cost Projection —— `cost.rs` 零 host import，是 domain **内部**重构，建议并入
  Phase D（与 Model Catalog / BillingContext / User Profile 同批，那时才有真实需求
  驱动）。`usage.rs` 的「DSH wire 解析混在 domain」同类，as-is 进 domain crate，
  wire/fold 分离另开。

### Phase D：建立 `agent-vitals-runtime`

- 移动 discovery、reader、zstd、SQLite、state、watcher；
- 建立唯一 HomeResolver、User Profile/Catalog loader 和 Skill/Session services；
- 承接 v0.7 延期的数据平面：`UsageFact` writer、per-host materialized view、
  R2a `SourceFingerprint` 增量失效、WorkBuddy `UsageFact` 接入；
- 在出现第二个持久 schema 时实现首个真实 migration，并同时交付原子写入、fsync
  与故障注入；没有 v2 之前不创建凑数迁移；
- CLI 与 Tauri 共用 runtime services；
- 禁止 Tauri command 直接读任意宿主 state 文件。

### Phase E：整理产品与 Python 包

- 根 CLI 移入 `apps/cli`，二进制名仍是 `agent-vitals`；
- `src-tauri` 移入 `apps/desktop`；
- Python 移入独立 package；
- `dsh-client` 移入 integrations。

### Phase F：再启用 MCP Surface

- 先接被动配置与现有 session 中的 MCP tool-call/result 证据；
- 主动 health probe 必须有用户授权、超时、速率限制和敏感信息边界；
- MCP 健康进入独立 coverage，不用 Skill 或 Session 的空数组代替 unavailable。

每个 Phase 都是独立重构，不与新功能、schema 升级或计费算法变更混在一个 commit。

---

## 14. 架构守卫

需要新增自动检查，避免目录只停留在文档层：

1. `vitals-core` 文件和公开符号禁止宿主词汇；
2. domain 的 Cargo 依赖禁止 runtime/Tauri/SQLite/zstd；
3. adapters 禁止 `std::fs`、`std::process`、环境变量和 state 写入；
4. runtime 可以依赖 adapters，反向依赖编译失败；
5. Tauri/CLI 中禁止重新实现 token/cost/fact_id 公式；
6. registry、CLI host 枚举、adapter 目录、capability matrix 双向相等；
7. 每个 adapter 至少有真实脱敏 fixture 与 malformed/unknown coverage；
8. Python 镜像存在期间，公开 JSON 保持 Python/Rust byte-parity；
9. WASM 只能链接 `vitals-core`、domain 和 adapters 的纯模块；
10. 旧 public path 的 re-export 必须有明确删除里程碑；
11. Skill/Session/MCP 的 capability 和 coverage 分开，scanner 不跨 surface 读取；
12. Catalog 必须携带版本、币种与有效期，历史价格选择有回归测试；
13. Billing 路由缺失/冲突必须产生 unresolved，禁止默认为免费；
14. 用户配置与可重建 state 分目录，配置与导出中不得保存凭证；
15. data-home 解析最终只有 Runtime 一个生产实现。

---

## 15. Definition of Done

目录重构完成必须同时满足：

- 新增宿主只修改 adapter、runtime source、registry、fixture 和接入文档；
- `vitals-core` 不出现任何宿主或 Agent 专属词；
- domain 不读取文件、环境变量、数据库或系统时间；
- adapter 不发现路径、不写 state；
- runtime 不解释 token wire shape、不实现 detector；
- Skill、Session、MCP 三个 surface 的 scanner、capability 与 coverage 可独立失败；
- 模型身份、价格目录、用户套餐和观测用量是四个可单独版本化/验证的输入；
- 月度成本能分开固定订阅、已计费按量、估算按量、覆盖等价额与 unresolved；
- `~/.agent-vitals/` 中用户配置不会被重建 state 的流程覆盖，也不保存敏感凭证；
- CLI 与 Tauri 不复制领域算法；
- WASM 可只编译纯计算链；
- Python 的保留范围和退出条件可见；
- 全量 Rust 测试、clippy、golden、CLI matrix 和 parity 全绿；
- 目录移动前后所有公开 JSON 和报告语义零漂移。

这份目录设计的目标不是让文件树“看起来整齐”，而是让依赖方向成为可执行的产品边界：
宿主越多，新增成本应收敛在一对 `adapter + source` 中，而不是继续扩散到 Core、CLI、Tauri
和每一张报告页面。
