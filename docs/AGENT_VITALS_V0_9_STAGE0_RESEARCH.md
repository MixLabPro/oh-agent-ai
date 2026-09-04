# v0.9 Stage 0（Data Access Foundation）执行研究

> 前置：`docs/AGENT_VITALS_V0_9_DATA_VALUE_ARCHITECTURE_SPEC.md`（R3，2026-09-05）
> 触发：用户在 v0.8 收口后追加决定——WorkBuddy 的 `SessionStore::workbuddy()`
> 缺口"不做，留待 v0.9"；随后要求"先搭建好数据写入和获取的架构，解决本质
> 问题（workbuddy 的问题先不处理）"，即把 `r2a_store.rs`（用户此前点名的
> "v0.9 数据底座核心迁移对象"）纳入 v0.9 Stage 0 范围，但明确不在这一步
> 给 WorkBuddy 接真实数据源。

## 1. 对 spec R3 的分析结论

通读 spec 全文，对照现有 v0.8 终态架构（`docs/AGENT_VITALS_V0_8_ARCHITECTURE_SPEC.md`
+ 本仓库 `crates/*/tests/dependency_budget.rs` 的纯度墙），**没有发现阻塞性问题**：

- 新 crate `agent-vitals-data`（spec §3.1）插在 `agent-vitals-hosts` 与
  `agent-vitals-runtime` 之间，依赖方向 `domain ← hosts ← data ← runtime`
  与现有单向 DAG 不冲突，不产生环。
- `rusqlite` 已经是 `agent-vitals-hosts` 的 `sources` feature 下的可选依赖
  （WorkBuddy `~/.workbuddy/workbuddy.db` 只读用）；spec §5.1 把"共享数据
  写入"的 SQLite 使用放进新 `agent-vitals-data`，不是引入新技术栈，只是
  挪动职责边界。
- spec §3.2"DSH 是参考实现，不是数据模型"与本仓库既有纪律一致（`evidence.rs`
  "adapter 不得用读不到的东西刷覆盖"、`host_capability.rs` 的
  `unmeasured_signals`/`degraded_rules`——都是"能力声明与实现分居"的同一
  思路，spec 只是把这条思路从 behavior 规则扩到成本/账单)。
- **WorkBuddy 排除已经是现状，不是要新发明的概念**：
  `apps/cli/src/agent/host_runtime_registration.rs` 的
  `workbuddy_has_neither_session_store_nor_fold_registration` 测试已经钉死
  "WorkBuddy 无 SessionStore/无 fold，留给 M4"这一事实。spec §3.1 的
  `excluded_hosts` 字段与这个既有事实天然对应——Stage 0 只需要把这同一个
  事实，从"CLI 二进制内部的注册表"抬到"跨宿主查询层的显式字段"，用户
  "workbuddy 的问题先不处理"的决定与现状完全一致，不需要额外设计。

**唯一要指出的问题不是 spec 本身的缺陷，而是粒度**：spec §7 把 Stage 0 写成
一条扁平清单，但清单里其实是 7 条相对独立、体量总和堪比整个 v0.8 D+E7
阶段的工作流。按本仓库一贯纪律（每步独立提交、测试全绿、golden 兜底），
需要像 v0.8 A→F 一样再拆一层，否则任何一步出错都难以定位到具体提交。

## 2. Stage 0 的内部拆分（0.1 – 0.7）

| 步骤 | 内容 | 依赖 | 产出位置 |
|---|---|---|---|
| 0.1 | 冻结 Data Query API 的纯 DTO 契约（`MonthlySummary`/`DailySummary`/`BillingBasis`/`CostBasis`/`Freshness`/`CoverageStatus`）+ 三条不变式的可执行校验 | 无 | `agent-vitals-domain::domain::data_contract`（本次落地） |
| 0.2 | 建 `agent-vitals-data` 空 crate（workspace member），加入 default-members，`repository`/`store`/`projection` 模块骨架，只依赖 domain（还不连 hosts/SQLite） | 0.1 | `crates/agent-vitals-data/` |
| 0.3 | Stage 0 的"只读 JSON adapter"：复用现有 `r2a_store.rs::host_snapshot`/DSH `today/month`/Claude ledger 的输出，在 `agent-vitals-data::projection` 里组装成 0.1 的 DTO；WorkBuddy 显式进 `excluded_hosts`，不读它的任何真实数据源 | 0.1, 0.2 | `agent-vitals-data/src/projection/` |
| 0.4 | CLI application-layer extraction（spec §5.2）：把 `apps/cli/src/agent/r2a_store.rs` 的 `SessionStore` 缓存/checkpoint/分页所有权迁进 `agent-vitals-runtime`；三宿主 `*_usage_fact.rs` 的 wire 解释迁进 `hosts/<host>/sessions/` | 0.2 | `agent-vitals-runtime/`, `agent-vitals-hosts/hosts/<h>/sessions/` |
| 0.5 | Tauri/CLI 改接：新增 `agent-vitals data coverage`/`monthly-summary` 只读诊断命令，调用 0.3 的 projection；旧命令保留一个版本周期，内部改走同一路径 | 0.3, 0.4 | `apps/cli/`, `apps/desktop/src-tauri/` |
| 0.6 | 控制台诚实展示：Tauri 面板/CLI JSON 输出 `freshness`/`coverage`/`excluded_hosts`，stale/partial 不得渲染成 0 或"正常" | 0.5 | `apps/desktop/src-tauri/` |
| 0.7 | 四宿主（DSH/Claude Code/Codex/WorkBuddy）的 v0.9 最小接入契约 fixture（spec §3.3 表）；WorkBuddy 的 fixture 断言"声明但排除"，不要求真实数据 | 0.1–0.6 | `fixtures/`, `tests/` |

0.4 直接对应用户点名的 "SessionStore 问题"；0.7 是 WorkBuddy 唯一会被触及的
一步，且只到"显式声明排除"为止，不实现 `SessionStore::workbuddy()` 或任何
WorkBuddy 数据读取——与"workbuddy 的问题先不处理"的决定一致。

## 3. 0.1 完成记录

**落地**：`crates/agent-vitals-domain/src/domain/data_contract.rs`（新文件）+
`domain/mod.rs`/`lib.rs` 的模块登记。

- 类型：`BillingBasis`（spec §4 表五档，`summable_into_total()` 把"能否冒充
  真实账单"列翻成可执行谓词）、`CostBasis`（spec §0.1 的 measured/derived/
  estimated/unresolved 四档）、`FreshnessState`/`Freshness`、`CoverageStatus`
  （`denominator_version` 显式版本化分母）、`HostAmount`、`MonthlySummary`、
  `DailySummary`。
- 序列化**不用 `serde` derive**——核实过 `agent-vitals-domain` 现有类型
  （如 `contracts::host_capability::HostProfile`）全部手写
  `as_str()`/`json!()`，`serde` 派生宏从来不是这个 crate 的依赖；本次最初
  按 spec 的"typed DTO"字面意思写了 `#[derive(Serialize, Deserialize)]`，
  编译期 `E0432 unresolved import serde` 当场报错，改为跟随既有习惯手写
  `to_json()`，不新增依赖。
- 三条不变式钉死为 `contract_violations()`（报告而非 panic，呼应
  `usage.rs::unaccounted_usage` 哨兵一贯做法）：
  1. `excluded_hosts` 与 `by_host` 不能同时持有同一宿主；
  2. `FreshnessState::Unavailable` 不能带 `last_observed_at`；
  3. `CoverageStatus.measured_fields` 不能超过 `total_fields`。
- `HostAmount::summable_total()`/`MonthlySummary::total_summable()` **不存
  字段、每次算**——直接吸取 `month.json` 三倍计数事故（见记忆
  `month-json-triple-count-incident`）的教训：同一个数字只要出现两个来源
  迟早对不上。
- 单测覆盖 WorkBuddy 的 `HostBilled`（而非 `MeteredActual`）分档、
  三条不变式各自的违规样例、`to_json()` 输出形状（金额不是裸 scalar，
  带着 freshness/coverage）。

**验收**：`cargo test -p agent-vitals-domain --lib data_contract`
10/10 通过；`cargo test -p agent-vitals-domain --test dependency_budget`
10/10 通过（含 `production_source_does_not_touch_files_env_or_clock`——
新文件零 I/O 已过纯度墙）；`cargo build/clippy --release`（workspace）、
`cargo check -p agent-vitals-wasm`、`apps/desktop/src-tauri cargo check`
全绿；`cargo test --release`（workspace）无新增失败。

0.2 起的每一步单独提交、单独验收，遵循同一纪律。

## 4. 0.2 完成记录

**落地**：新 workspace member `crates/agent-vitals-data/`（六个模块骨架：
`evidence`/`store`/`billing`/`coverage`/`repository`/`projection`，只有
`projection` 重新导出 0.1 的契约类型，其余五个目前只是说明未来职责的文档
注释）。`Cargo.toml` 只依赖 `agent-vitals-domain`，不接 `agent-vitals-hosts`/
`rusqlite`——`tests/dependency_budget.rs` 把这个"现状"钉成可执行断言，并在
注释里明写这是 Stage 0.3/Stage B 会按计划放开的收紧，不是永久上限。

**验收**：`cargo test -p agent-vitals-data` 2/2；`cargo build/clippy
--release`（workspace）全绿；`cargo check -p agent-vitals-wasm`、
`apps/desktop/src-tauri cargo check` 全绿；`cargo test --release`
（workspace，33 个 test binary）全部 0 failed。`.github/workflows/*.yml`
核实过不需要改——三个 workflow 都是 `cargo test/clippy/build --release`
workspace-root 命令，不硬编码 crate 列表，新 member 靠 `default-members`
自动纳入。

0.3（只读 JSON adapter，把 `r2a_store.rs::host_snapshot` 现有输出组装成
`MonthlySummary`/`DailySummary`）是下一步。

## 5. 顺序更正：0.3 与 0.4 对调（同 v0.8 E7.5/E7.6 的教训）

动手设计 0.3 时核实依赖方向，发现计划顺序又一次是反的——跟 v0.8 E7.5/E7.6
撞见的问题同一类，本节按同一纪律记录更正，而不是悄悄改顺序。

`host_snapshot`/`SessionStore`（"今日/本月折叠"的现有实现）目前整个住在
`apps/cli/src/agent/r2a_store.rs`——DAG 最顶层。`agent-vitals-data`（依赖
`domain`，未来加 `hosts`）与 `agent-vitals-runtime`（依赖 `hosts + data`）
都在 `apps/cli` **之下**，谁都不能反过来依赖二进制里的这份逻辑。如果先做
"0.3 读 adapter"，能拿到这份数据的唯一办法是把组装代码也写进 `apps/cli`
本身——但那正是 spec §0.1 门槛"CLI 不再拥有宿主 wire 解释或事实写入"要
消灭的形态，而且 0.4（CLI application-layer extraction）一旦把
`SessionStore` 搬进 runtime，这段刚写的组装代码又要跟着搬一次，等于重复
劳动。

更正后的执行序：**0.3 = CLI application-layer extraction（原 0.4）→
0.4 = 只读 JSON adapter（原 0.3，现在天然长在 runtime 里，可以直接调用
刚迁移过去的 SessionStore）**。0.5-0.7 的编号与内容不变，只是现在依赖
0.3/0.4 的顺序而非原表格的 0.3/0.4。

架构判断：`agent-vitals-data::repository` 定义**接口**（trait +
`agent_vitals_domain::data_contract` 的 DTO），Stage 0 的**实现**
（读现有 `state.json`/ledger/`SessionStore` 缓存拼出 DTO）放在
`agent-vitals-runtime`——这是仓库里已经有先例的"契约低、I/O 高"分层
（`host_capability::HostProfile` 声明能力 vs. 二进制侧
`HostRuntimeRegistration` 声明实现存在性），不是新发明一层抽象。
