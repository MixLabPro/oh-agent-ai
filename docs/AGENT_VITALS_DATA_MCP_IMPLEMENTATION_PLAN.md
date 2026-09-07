# Agent Vitals Data MCP——实施计划

> **规格**：`AGENT_VITALS_DATA_MCP_SPEC.md`（draft-3，待冻结）
> **本文档**：把 spec 的 Phase M0–M5 拆成可勾选的工程增量——每项标落点文件、
> spec 章节、验收方式。执行循环（与 v0.9.1 实施计划同）：
> **实现 → 全量测试（cargo test + clippy + golden + `AGENT_VITALS_BIN` 差分）→
> subAgent 代码审查 → 修复 → commit**，每个增量一个收口点。
>
> 状态：✅ 完成 · 🔨 进行中 · ⬜ 未开始

---

## M0 决策裁决（spec §13 M0 D1–D10）

spec 把 D1–D10 列为「冻结前必须拍板」。本节按 spec 的推荐默认逐条裁决，
供实施依据；有异议在评审时改这里，不在代码里留隐式默认。

| 决策 | 裁决 | 依据 / 落点 |
|---|---|---|
| **D1 传输层 + 线协议** | 手写最小 JSON-RPC 2.0 over stdio（stdlib + `serde_json`）。MCP protocol version = `"2025-06-18"`（支持 `structuredContent`）。逐行 JSON framing（`\n` 分隔，UTF-8）。方法集 = `initialize` / `notifications/initialized` / `tools/list` / `tools/call` / `ping`。业务错误走 `tools/call` 结果的 `isError: true` + envelope，不塞 JSON-RPC error。stdin EOF → flush stderr + 关连接 + exit 0。单连接串行。 | spec §6.4；`apps/cli/src/mcp/` |
| **D2 金额精度** | `MoneyMinor { amount_minor: i64, currency, basis }`。舍入：本次查询最细上报维度一次 `pyround(× 10^minor_digits)`，父层 = 子项整数和。落点 = `agent-vitals-data` / `agent-vitals-runtime`，三消费面同源读。`minor_digits` 由 currency 决定（CNY/USD=2）。 | spec §5.1 规则 5；增量 2（首个带金额工具落地时） |
| **D3 模型归属范围** | `(host, raw_model, billing_route)` 语义。过滤字段 `models: [{kind, host, value}]`，v1 仅 `kind="host_raw"`；响应带 `identity_kind`。canonical 归一表不拉进 v0.9.1。 | spec §5.1 规则 4、§7.2 |
| **D4 内部工具 gating** | cargo feature `mcp-internal`（`apps/cli`）。公开构建编译期排除 `authority_audit` / `query_sql_readonly`。 | spec §8；`apps/cli/Cargo.toml` |
| **D5 `session_ref` salt** | `<data_home>/.mcp-session-salt`（32 字节随机，权限 `0600`），首次 `data-mcp serve` 时生成。HMAC-SHA256（`sha2` 已是依赖）。**不进权威库**。 | spec §9.2；增量 6（session 工具） |
| **D6 迁移验收工具** | 拆分：MCP 内只读 `authority_audit`（守恒/重复/覆盖/`authority_revision` 自检）+ MCP 外 `agent-vitals data reimport-verify`（临时库重导入比对，非 MCP 工具）。 | spec §8.1；增量 7 |
| **D7 `authority_revision`** | envelope 字段 `{last_completed_run_id, committed_at, max_observed_at}`，从 `sync_runs` 最近 `succeeded` 行 + 查询窗口 `MAX(event_ts_ms)` 取。`as_of_run_id` 入参：v1 只「识别并 warn」，钉截面 M2 补。 | spec §6.1、§10；增量 1（envelope） |
| **D8 summary 输出范围** | 保留 spec 承诺的完整输出，把会话数 / 活跃小时 / `group_by=model` / 逐日趋势 / 月底预测 / 成本占比作为**新增聚合查询**逐项列进增量 3，工作量按新查询计。 | spec §7.3/§7.4；增量 3 |
| **D9 `query_sql_readonly` 脱敏** | 若实现：SQLite `authorizer` 按来源表 + 列拒绝 + 脱敏 view allowlist；结果列名扫描仅第二层。默认**不实现**（不在 v1 兼容承诺内）。 | spec §8.2；延后 |
| **D10 JSON Schema 交付** | 每个工具的 `inputSchema` / `outputSchema` 作为 `serde_json::Value` 常量随工具定义，`tools/list` 直出；用 `additionalProperties: false` + 显式枚举。校验测试 = 每个 schema 能被 `serde_json` 解析且结构自洽（M0 退出条件）。 | spec §6.4、§13 M0；每个增量随工具 |

---

## 增量拆分

spec 的 Phase 是能力里程碑；这里是可 commit 的工程增量，每个都过完整循环。

| # | 增量 | spec 对应 | 状态 |
|---|---|---|---|
| **1** | 传输层 + envelope + `data_status` | M1 起步 | 🔨 |
| 2 | `MoneyMinor` 精确投影 + `usage_hourly`（宿主轴 + model/provider 轴 + 逐小时成本） | M1 | ⬜ |
| 3 | `summary_daily` + `summary_monthly`（含会话数 / 活跃小时 / 逐日趋势 / 月底预测 / 占比新查询） | M1 | ⬜ |
| 4 | `data_quality_issues` + code-aware 脱敏 allowlist | M1 | ⬜ |
| 5 | M1 收口：M01–M08 / M13–M18 契约测试 + 三消费面 parity（M15）+ 真机 U01/U02/U08 | M1 退出 | ⬜ |
| 6 | `authority_revision` `as_of_run_id` 钉截面 + `authority_audit`（`mcp-internal`）| M2 | ⬜ |
| 7 | `reimport_verify`（CLI 子命令）+ U09a/U09b 真机 | M2 退出 | ⬜ |
| 8+ | M3：`cost_breakdown` / `sessions_search` / `session_detail` + session 索引 v2 + 历史价重放 | M3 | ⬜ |
| … | M4：`workflow_events` 管线 + `issues_summary` / `skills_summary` | M4 | ⬜ |
| … | M5：公开/内部构建分离 + 打包 + 发布文档 | M5 | ⬜ |

---

## 增量 1：传输层 + envelope + `data_status`

**目标**：`agent-vitals data-mcp serve` 起一个本机 stdio MCP server，能完成
握手、`tools/list`、`ping`，并把 `data_status` 作为第一个工具跑通——为后续
工具钉死 envelope 形状、错误映射、authority 状态/revision 的读取方式。

### 落点

- **`crates/agent-vitals-data/src/authority.rs`**：新增 `AuthorityDb::open_readonly(db_path)`
  ——`SQLITE_OPEN_READ_ONLY`，**不建库、不跑 DDL**；`AuthorityError` 加
  `MissingFile` / `Corrupt` / `OlderSchema { found }` 变体（typed，供错误码映射）。
- **`crates/agent-vitals-runtime/src/mcp/`**（工具应用层，spec §5.2）：
  - `mod.rs`：`Envelope` 构建、`AuthorityHandle`（只读打开 + `authority_state` +
    `authority_revision` + `data_version`）、`ToolError`（映射 spec §11 错误码）、
    `tool_specs()`（`[ToolSpec { name, description, input_schema, output_schema }]`）、
    `dispatch(name, args, data_home) -> Result<Value /*envelope*/, ToolError>`。
  - `data_status.rs`：从 `apps/cli/src/main.rs` 抽出的 `data-status` 查询
    + spec §7.1 要求补的逐宿主 `GROUP BY host`。
- **`apps/cli/src/mcp.rs`**（传输层）：`serve()` stdio 循环 + JSON-RPC 编解码
  + method dispatch + 错误映射。
- **`apps/cli/src/main.rs`**：`DataMcp { action: Serve }` 命令（→ `data-mcp serve`）
  + handler 调 `mcp::serve()`。
- **`apps/cli/Cargo.toml`**：`[features] mcp-internal = []`（本增量只声明，不用）。
- **`apps/cli/src/main.rs` `Cmd::DataStatus` handler**：改调
  `agent_vitals_runtime::mcp::data_status(...)` 的 `data` 部分（去重，保证 CLI/MCP 同源）。

### 验收

- Rust 单元：`open_readonly` 六态（缺文件→MissingFile / 正常 / 损坏→Corrupt /
  新版本→NewerSchema / 旧版本→OlderSchema / 只读连接写入失败）；envelope 形状
  （必含 `schema_version` / `data_version` / `authority_state` / `authority_revision` /
  `generated_at` / `timezone` / `coverage` / `freshness` / `warnings` / `data`）；
  `data_status` 空库 vs 有数据。
- Rust 集成（`apps/cli/tests/`）：喂 JSON-RPC 到 `serve` 的 stdin，断言
  `initialize` 回 protocol version + `tools` capability；`initialize` 前发别的方法 →
  JSON-RPC error；`tools/list` 含 `data_status` schema；`tools/call data_status` →
  envelope；未知方法 → `-32601`；stdin EOF → exit 0；`stdout` 无非协议行（M18）。
- 差分：`AGENT_VITALS_BIN` 下 `data-mcp serve` 的 `data_status.data` 与
  `data-status --json` 的核心字段逐值相等（M15 的 data_status 切片）。
- 全量 `cargo test` + `cargo clippy --release --all-targets -- -D warnings` + golden 15/15
  + `AGENT_VITALS_BIN` python 差分不回归。

### 收口

subAgent 审查（envelope 契约、错误映射、只读边界、CLI/MCP 去重是否真的同源、
stdout 纪律）→ 修复 → commit。
