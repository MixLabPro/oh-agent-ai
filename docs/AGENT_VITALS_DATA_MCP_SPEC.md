# Agent Vitals Data MCP Spec

> 版本：v0.9.1-draft-2  
> 日期：2026-09-07（draft-2：按 v0.9.1 实施现状校正——见 §5.3）  
> 状态：待评审  
> 依赖：`AGENT_VITALS_V0_9_1_SQL_AUTHORITY_MIGRATION_SPEC.md`（冻结规格） · `AGENT_VITALS_V0_9_1_IMPLEMENTATION_PLAN.md`（Phase 实际进度）  
> 目标版本：v0.9.1 提供内部 MVP；v0.9.2/v0.10 补齐解释能力；达到发布门槛后随 v1.0.0 提供本机只读能力

> **draft-2 校正摘要**（评审重点看这几处）：
> 1. §5.3 新增「实现现状锚点」——钉死 MCP 能直接依赖 / 不得假设存在的 SQL 能力面。
> 2. §8.1 `authority_reconcile` 重定义——Phase 4.3 Stage 1（commit `ad4e33e`）已删除 SQL-vs-legacy 对账机制，本工具改为「导入幂等 + SQL vs 冻结导出快照」自洽对账。
> 3. §5 规则 4/5 + §16 决策 8–12——模型归属按 `(host, raw_model, billing_route)` 语义（§3.4 归一表未落地）；envelope 金额最小货币单位整数；传输层与内部工具 gating 列为 M0 决策。
> 4. §7 工具门槛表 + §13 各 Phase——按「哪些工具现在就能建」重排。

## 1. 一句话定义

Data MCP 是 Agent Vitals 面向 AI Agent 的**本机、只读、语义稳定的数据查询接口**。

它让 Agent 能安全回答“今天各模型怎么用、哪个宿主花得多、哪些问题反复出现、哪些 Skill 需要关注、数据是否可信”等问题，并能自动执行验收；它不是任意 SQL 控制台，也不是新的数据权威层。

## 2. 为什么现在需要它

v0.9.1 正在把运行时读取统一到 SQLite 权威库。仅完成数据库和页面切换，还不足以证明系统真的满足用户需求。Data MCP 在产品界面与数据库之间增加一层稳定、可重复调用的“问题接口”，主要解决四件事：

1. **算得清**：统一模型、供应商、宿主、币种、计费口径和时间范围。
2. **算得准**：MCP、CLI、桌面端读取同一 SQL repository，可逐值对账。
3. **看得懂**：结果携带覆盖范围、新鲜度、缺失来源和未定价项，不把“不知道”显示成零。
4. **用得上**：Agent 可以直接完成趋势分析、异常定位、成本解释和版本验收。

Data MCP 也是架构的“压力测试面”。当重导入不幂等、数据重复、模型无法归一、价格缺失或来源过期时，它应主动暴露问题，而不是用默认值掩盖问题。

## 3. 用户场景与核心问题

### 3.1 使用节奏

- 今天每个模型的小时分布曲线是什么？峰值发生在几点？
- 今天每个宿主的小时分布曲线是什么？
- 某个高峰由哪些会话构成？
- 本周与上周相比，使用时间和模型选择发生了什么变化？

### 3.2 成本与预算

- 今天、本月分别花了多少钱？
- 哪个模型、供应商、宿主贡献了最多成本？
- 成本上升是因为调用更多、换了模型、缓存下降、价格变化，还是录入了宿主账单？
- 哪些用量无法计价？为什么无法计价？
- 实际账单、API 等价估算、订阅摊销是否被清晰区分？

### 3.3 问题与效率

- 哪些错误、拒绝、重试或重复调用反复出现？
- 哪些问题影响会话最多、浪费 token 最多？
- 哪些 Skill 调用频繁但失败率高？
- 哪些 Skill 缺少足够证据，暂时不能评价？

### 3.4 数据可信度

- 最近一次同步是什么时候？
- 哪些宿主或日期数据不完整？
- 是否存在重复事实、无法识别的模型、缺失价格或重导入差异？
- 当前结果来自正式 SQL 权威库，还是尚未切换的候选库？

## 4. 产品边界

### 4.1 本版本包含

- 本机 `stdio` MCP server。
- 只读、参数化、面向用户问题的工具。
- 使用、成本、会话、工作流问题和数据质量查询。
- 统一的覆盖度、新鲜度、警告和分页协议。
- MCP 与 CLI、Tauri、SQL repository 的一致性验收。
- 内部开发模式下的迁移对账工具。

### 4.2 本版本不包含

- 公共的任意 SQL 执行。
- 写入、删除、修复、重建或修改 Agent Vitals 数据。
- 原始对话、Prompt、回复正文、工具参数或原始错误文本查询。
- HTTP/SSE 服务、远程访问、云同步或多人共享。
- 外部 MCP server 的安装、配置和健康检查；那属于 v0.8 Phase F，不属于 Data MCP。
- 自动判断任务“成功”或自动下线 Skill；证据不足时必须明确返回未知。
- MCP Resources、Prompts 和批量数据导出；首版只提供 Tools。

## 5. 架构与权威边界

```text
宿主原始日志
    ↓ 清洗、校验、去重、身份归一
SQLite 权威库
    ↓ 统一 query/repository
Data MCP ── CLI ── Tauri ── HTML
```

### 5.1 不可违反的规则

1. Data MCP 不是新的计算实现。它必须调用 `agent-vitals-data` / `agent-vitals-runtime` 的统一查询与计价能力。
2. 除内部 `authority_reconcile`（draft-2 起只读 SQL 权威库 + 冻结导出快照，不再读 legacy）外，任何 MCP 工具不得读取宿主原始日志、legacy JSON、JSONL、ledger 或旧 fold。
3. Data MCP 不直接写表，不调用同步、迁移、repair 或 host bill 写接口。
4. 模型与供应商归属走 SQL 权威库**当前实际具备**的解析面：`usage_facts.provider_id` / `model_id`（v0.9.1 仍是宿主 raw 值）+ `billing_route_of`（`pricing.json::catalog_2026_09.billing_modes` 声明序）。§3.4 的 `models` / `model_aliases` / `pricing_versions` 归一表在 v0.9.1 **未落地**（见 §5.3），canonical ID 是 v0.9.2+ 补强。归一层就绪前，MCP 工具按 `(host, raw_model, billing_route)` 语义查询与展示；无法解析的项显式 `unresolved`，绝不并入相近拼写。
5. 价格与币种不可浮点计算、不可跨币种相加、不可把 unresolved 当成 0。MCP envelope 内金额一律 **最小货币单位整数 + `currency` + `basis` 三元组**，不复用冻结 DTO（`HostAmount.amounts_by_basis`）展示层的 `f64`——那是 UI 换算面，机器接口用整数。
6. 在 SQL 尚未正式成为 runtime authority 时，可以用于内部验收，但每个响应必须标记 `authority_state=candidate`（直接读 `sql_authority::is_enabled(data_home)` 标记文件）。

### 5.2 落点与进程约束

建议落点：

- 协议入口：`agent-vitals data-mcp serve`（clap 子命令 doc 注释必须英文——`test_regressions::test_help_defaults_to_english` 钉住）。
- MCP adapter：`apps/cli` 仅负责 `stdio`、协议编解码和进程生命周期（D1 决定手写还是 `rmcp`）。
- 工具应用层：`agent-vitals-runtime`（唯一同时看得到 `hosts` 与 `data` 的 crate）。
- SQL 查询、分页与覆盖度：`agent-vitals-data`（依赖预算：只允许 domain + rusqlite，`tests/dependency_budget.rs` 钉边界——新查询进 `authority_query`）。
- DTO 与枚举：复用 `agent_vitals_domain::data_contract`（`MonthlySummary` 等冻结 DTO）；MCP 专属 envelope 是独立版本化的新类型，`schema_version` 与 DTO 版本解耦。

`stdout` 只能输出 MCP 协议消息；日志必须写入 `stderr`。Server 不监听端口。

### 5.3 实现现状锚点（2026-09-07，draft-2 校正）

Data MCP 的前置是 v0.9.1 SQL 权威迁移。截至本次校正，`AGENT_VITALS_V0_9_1_IMPLEMENTATION_PLAN.md` 的实际进度是：Phase 0–3（schema / 清洗写入 / 读路径切换）已完成，Phase 4（双轨验收与旧路径退役）进行中——4.1/4.2 已收口，4.3 Stage 1（退役 SQL-vs-legacy 对账）已提交，真机翻开关 + 观察期待用户执行。本节钉死 MCP 的可依赖面，避免规格描述超前于代码。

**已落地、MCP 可直接依赖**：

- SQLite 权威库（DDL v1 共 12 表：`schema_meta` / `sync_runs` / `source_files` / `sessions` / `usage_facts` / `host_bills` / `pricing_snapshots` / `budget_config` / `budget_snoozes` / `data_quality_issues` / `migrations` / `workflow_events`）+ 版本闸 + 中断批次清扫 + `PRAGMA integrity_check`（不自愈，损坏诚实报 critical）。
- `SqlSummaryRepository`（`daily_summary` / `monthly_summary` / `coverage_status`），已是 CLI/Tauri 的运行时读路径（Phase 3.5 Tier A/B 切完）。冻结 DTO：`MonthlySummary` / `DailySummary`（`by_host` / `by_provider`（键 `"host/provider"`，单币）/ `tokens_by_host` / `coverage` / `freshness` / `excluded_hosts`），`CoverageStatus`（带 `denominator_version`），`Freshness`（`FreshnessState` + `last_observed_at`）。
- `authority_query`：`peaked_days_map`（DSH 峰谷逐日）、`claude_days` / `claude_legacy_days`、`codex_by_hour_model`（**仅 Codex 单宿主**的小时 × 模型）、`coverage_status`（逐宿主三维分母 v1：usage / price / sync）、`facts_page_window`（host × 时间窗 × keyset 分页，无 OFFSET 漂移）、`hourly_by_host`（三宿主北京小时轴，**仅 token 之和——无模型/供应商轴、无成本**）。窗口查询已断言命中 `usage_facts_host_time` 索引（EXPLAIN QUERY PLAN，不 full scan）。
- `pricing_snapshots` + `summary::PricingCards::asof(窗口月末 ms)`：历史价卡重放，**粒度 = 窗口级（查询窗口月末时点）**。逐日 / 逐事实重放明确是独立后续项。
- `sql_authority::is_enabled(data_home)`：标记文件开关（`<data_home>/.sql-authority-enabled`）→ 直接映射 envelope 的 `authority_state` ∈ `candidate`（未翻）/ `enabled`（已翻）。
- `data_quality_issues` 表 + `data-status`（health / integrity / `open_quality_issues_by_code` / `recent_runs`）+ `data-unresolved`（逐模型 unresolved 下钻：billing-route-unknown / billing-mode-unknown / no-price-card / partial-price-basis）。

**未落地，MCP 规格不得假设其存在**：

- **§3.4 模型 / 供应商 / 价格归一表**（`providers` / `models` / `model_aliases` / `pricing_versions` / `model_prices`）——**从未建**。实际实现用 `pricing_snapshots`（整份 `pricing.json` 快照 blob）+ 查询时 `billing_route_of` 反查。canonical 模型 ID、`model_aliases` 时效区间、`pricing_versions.source_kind`（official / user_configured / imported）三分并列展示都还没有落点。
- **`workflow_events` 的 writer 与 reader**——只有 DDL，没有任何宿主 wire 提取、脱敏指纹、写入或读取代码。这是 `issues_summary` / `skills_summary`（M4）的**全部**数据来源。
- **`sessions` 表的会话级信息**——是最小索引（`session_key` / `host` / `machine_namespace` / `last_observed_at_ms`），`started_at_ms` / `ended_at_ms` 大多为空，无会话级 token / 成本聚合。
- **`session_ref` 所需的 HMAC + 每安装随机 salt**——仓库内无此基元（`source_identity.rs` 的 `fnv1a64_hex` 是非密码学哈希，不满足「不可反推」）。
- **跨宿主「小时 × 模型 / 供应商」聚合查询**——只有 `codex_by_hour_model` 单宿主版；claude / dsh 及三宿主合并的模型轴小时曲线要新写。
- **逐小时成本**——`hourly_by_host` 只出 token。
- **SQL-vs-legacy 双轨对账机制**——已于 Phase 4.3 Stage 1（commit `ad4e33e`）**删除**（`summary::reconcile_authority_vs_legacy` / `persist_reconcile_exceptions` / CLI `data-reconcile-authority` / `data-budget-reconcile`）。`JsonSummaryRepository` 本体暂留（Stage 2+ 处理），但不再是对账基准；用户 2026-09-07 已决定「翻开关 + 纯 SQL 重导入」。这直接改变 §8.1 与 Phase M2 的定义。`data-reconcile`（index.sqlite3 投影 vs DTO，旧库自洽）仍在，与本工具无关。
- **MCP / JSON-RPC 协议栈**——工作区无 `rmcp` / `jsonrpc` / `tokio` 依赖，MSRV 1.74，且「分发物零第三方」约束（CLAUDE.md）。传输层实现方式是 M0 决策项（§13 M0 D1）。
- **`--profile internal` 运行时开关**——不存在。当前唯一类似机制是 `sql_authority` 的标记文件。内部工具的启用 / 排除方式是 M0 决策项（§13 M0 D4）。

## 6. 通用响应契约

所有成功工具返回相同顶层结构：

```json
{
  "schema_version": "1",
  "data_version": {
    "authority_schema": 1,
    "query_semantics": "2026-09-07"
  },
  "authority_state": "candidate",
  "generated_at": "2026-09-07T14:30:00+08:00",
  "timezone": "Asia/Shanghai",
  "coverage": {
    "status": "complete",
    "requested_from": "2026-09-07T00:00:00+08:00",
    "requested_to": "2026-09-08T00:00:00+08:00",
    "covered_from": "2026-09-07T00:00:00+08:00",
    "covered_to": "2026-09-07T14:29:12+08:00",
    "missing_hosts": []
  },
  "freshness": {
    "last_successful_sync_at": "2026-09-07T14:29:12+08:00",
    "stale_hosts": []
  },
  "warnings": [],
  "data": {}
}
```

### 6.1 枚举语义

`authority_state`：

- `enabled`：SQL 已是产品运行时权威源。
- `candidate`：SQL 可供迁移验收，但产品尚未正式切换。
- `unavailable`：数据库缺失、损坏或版本不兼容。

`coverage.status`：

- `complete`：请求区间内，所需来源均有可信覆盖。
- `partial`：部分宿主、日期、维度或事件缺失。
- `unavailable`：无法形成可信结果。
- `not_applicable`：该工具不依赖时间覆盖。

### 6.2 诚实返回原则

- “没有发生”返回数值 `0`。
- “没有采集到”返回 `null` 或省略指标，并给出 warning。
- “无法计价”返回 token 和 `unresolved`，金额不得写成 `0`。
- “缺少工作流事件”不能解释成“没有问题”。
- 任何聚合都应满足可守恒：下钻子项之和等于上层总量；无法守恒必须警告。

### 6.3 时间规则

- 默认时区为 `Asia/Shanghai`，与 v0.9.1 业务日口径一致。
- 日期使用 `YYYY-MM-DD`，月份使用 `YYYY-MM`，时间戳使用 RFC 3339。
- `from` 为闭区间，`to` 为开区间。
- 首版不允许调用方更改时区，避免同一“今天”产生不同答案。

## 7. 工具清单

交付版本不是一次性承诺。当前 SQL 已能可靠支撑 v0.9.1 核心查询；成本归因仍需完成历史价格重放，问题与 Skill 查询仍需 `workflow_events` writer/reader。工具按以下门槛启用（draft-2 按 §5.3 实际能力面校正，`✅` = 读路径已就绪、`🔶` = 部分就绪需新查询、`⬜` = 前置未落地）：

| 工具 | 首次启用 | 前置条件（draft-2 校正） |
|---|---|---|
| `data_status` | v0.9.1 MVP | ✅ `data-status` JSON + `schema_meta` / `sync_runs` / `source_files` 查询已在；补逐宿主覆盖起止 |
| `usage_hourly` | v0.9.1 MVP | 🔶 `hourly_by_host` 已在（宿主轴、仅 token）；**`group_by=model`/`provider` + 逐小时 `cost` 需新写**（只有 `codex_by_hour_model` 覆盖单宿主） |
| `summary_daily` | v0.9.1 MVP | ✅ `SqlSummaryRepository::daily_summary` |
| `summary_monthly` | v0.9.1 MVP | ✅ `SqlSummaryRepository::monthly_summary` + `budget_status_sql`；逐日趋势用 `peaked_days_map`，月底预测需新写 |
| `data_quality_issues` | v0.9.1 MVP | 🔶 `data_quality_issues` 表已在；**`detail_json` 的 code-aware 脱敏 allowlist 需新写** |
| `authority_reconcile` | v0.9.1 internal only | ⬜ legacy 双轨已退役（`ad4e33e`）——**重定义**为「导入幂等 + SQL vs 冻结导出快照」，见 §8.1 |
| `cost_breakdown` | v0.9.2 | ⬜ 逐事实 / 逐日历史价格重放（当前仅窗口级）+ 变化因子分解引擎 |
| `sessions_search` / `session_detail` | v0.9.2 | ⬜ `session_ref` HMAC 基元 + `sessions` 表补 `started`/`ended` + 会话级聚合查询（「session 索引 v2」子阶段） |
| `issues_summary` / `skills_summary` | v0.10 | ⬜ `workflow_events` 完整 writer + reader + 覆盖度管线（独立于 MCP 的工作量，随 v0.10 任务图立项） |

未达到前置条件的工具不得用空实现提前注册。客户端可通过 MCP capability 列表判断可用能力。

### 7.1 `data_status`

回答“当前数据是否可信、是否新鲜、是否已经切到 SQL”。

输入：无。

输出至少包含：

- 权威状态与 schema 版本。
- 最近一次成功、失败和进行中的同步。
- 各宿主最近观测时间、事实数和覆盖起止。
- 未解决的数据质量问题数量，按严重度和类型分组。
- 未识别模型、未定价用量和重导入差异摘要（`data_quality_issues` 里 `undated_residual` / `reconcile_*` 等 code）。

该工具必须在业务数据为空时仍可使用；数据库不存在时返回结构化错误，不自动建库。

**实现注记（draft-2）**：现有 `data-status` JSON 已含 schema / integrity / `facts` / `sources` / `sessions` 全局计数 + `open_quality_issues_by_code` + `recent_runs` + `health` / `hints` + `sql_authority_enabled`。**需补**：逐宿主的最近观测时间 / 事实数 / 覆盖起止（当前只有全局数）——数据在 `source_files` + `usage_facts`，加一条 `GROUP BY host` 查询即可。「未识别模型 / 未定价用量」下钻可复用 `data-unresolved` 的逐模型口径。`integrity != ok` → envelope `authority_state=unavailable` + 错误码 `database_unreadable`。

### 7.2 `usage_hourly`

回答模型或宿主的小时分布曲线。

输入：

```json
{
  "date": "2026-09-07",
  "group_by": "model",
  "hosts": ["claude-code", "codex"],
  "model_ids": [],
  "metrics": ["total_tokens", "output_tokens", "cost"]
}
```

约束：

- `group_by` 仅允许 `model`、`provider`、`host`。
- 单次最多查询 31 天；使用 `date` 时返回 24 个小时桶，包括零值桶。
- `cost` 按币种和计费口径分列，不能形成虚假的单一总金额。

输出每个序列包含维度 ID、展示名、24 小时点、总量、峰值小时、覆盖度和 unresolved 信息。

**实现注记（draft-2）**：`model_ids` 过滤匹配 `usage_facts.model_id` 的宿主 raw 值（按 `hosts` 限定），不是 canonical ID（§5 规则 4）；`group_by=model` 的序列键是 `(host, raw_model)`。`group_by=host` 可复用 `authority_query::hourly_by_host`；`group_by=model`/`provider` 与逐小时 `cost` 需新增查询（当前只有 `codex_by_hour_model` 覆盖单宿主的小时 × 模型，且不含成本）。北京小时用整数除法（`(event_ts_ms + BEIJING_OFFSET_MS) / HOUR_MS % 24`），与 `hourly_by_host` 同一算术。

### 7.3 `summary_daily`

回答某日的总体使用和成本，并支持按宿主、模型或供应商拆分。

输入：`date`、可选 `group_by`、可选维度过滤器。

输出：token 分类、会话数、活跃小时、各币种/口径金额、缓存占比、未定价 token 和分组明细。

### 7.4 `summary_monthly`

回答某月累计、日趋势、预算进度与成本构成。

输入：`month`、可选 `group_by`、可选维度过滤器。

输出：

- 月累计 token 与逐日趋势。
- 模型、供应商、宿主的用量和成本占比。
- `api_equivalent`、`metered_estimate`、`host_billed`、`subscription_allocated` 等口径分离结果。
- 预算值、已用比例和预计月底值；证据不足时预测为空。
- 未定价、跨币种和数据缺口警告。

### 7.5 `cost_breakdown`

回答“钱花在哪里、为什么变化”。

输入：

```json
{
  "from": "2026-09-01",
  "to": "2026-09-08",
  "compare_to_previous": true,
  "group_by": ["host", "provider", "model", "basis"]
}
```

输出：

- 各币种、各计费口径的金额和 token。
- 与对比期的绝对变化和比例变化。
- 可解释的变化因子：用量、模型组合、缓存结构、价格版本和账单录入。
- 无法归因的余额；不得为了凑齐总额强行分配。
- 使用到的价格版本、有效时间和价格来源类型。

首版只做确定性分解，不生成自然语言结论。

**实现注记（draft-2）**：价格版本重放当前粒度 = 查询窗口月末的 `pricing_snapshots` 时点（`PricingCards::asof`），不是逐事实时点。在 §3.4 归一价表落地前，「使用到的价格版本」只能报 snapshot 的 `captured_at` 与「官方标价 / 用户配置」二分，不能报 `pricing_versions.source_kind` 三分。**逐日 / 逐事实价格重放（Q13、U10）是本工具的硬前置**，M3 必须先补 `authority_query` 的按事实时点选价版能力。变化因子分解引擎（用量 / 模型组合 / 缓存结构 / 价格版本 / 账单录入 + 未解释余额）是净新增，无现成实现。

### 7.6 `sessions_search`

回答“哪些会话构成了这个峰值或异常”。

输入：时间范围、可选宿主/模型/供应商、排序字段、`limit`、`cursor`。

输出只包含：

- 不可逆或不可枚举的 `session_ref`。
- 宿主、开始/结束时间、token、金额、模型构成、事件计数。
- 覆盖和质量标记。

禁止输出原生 session ID、机器 namespace、文件路径、标题、Prompt 或回复正文。默认 `limit=50`，最大 `200`。

**实现注记（draft-2）**：`session_ref` 依赖一个尚不存在的基元——每安装随机 salt + HMAC（§9.2）。`sessions` 表当前是最小索引：`started_at_ms` / `ended_at_ms` 多为空，无会话级 token / 成本聚合（`usage_facts.session_key` 外键在，但聚合查询要新写）。本工具的实际前置是一个「session 索引 v2」子阶段（补列 + 聚合 + `session_ref`），不只是查询封装——M3 应显式排期。

### 7.7 `session_detail`

回答一个聚合会话为什么消耗较高、包含哪些模型或工作流事件。

输入：`session_ref`。

输出：会话时间范围、宿主、模型/供应商构成、小时分布、成本构成、问题类型统计、Skill 统计和数据质量标记。

它不是对话浏览器，不返回消息内容、工具输入输出或原始异常内容。

### 7.8 `issues_summary`

回答“哪些问题重复出现、影响多大”。

输入：时间范围、可选宿主/Skill/严重度、`group_by`、分页参数。

可识别类别包括：

- 重复错误指纹。
- 重复工具调用。
- 拒绝、超时和重试。
- 无法解析或不完整的工作流事件。

输出每类问题的发生次数、影响会话数、关联 token/成本、首次和最近发生时间、趋势以及证据覆盖度。错误指纹只能来自脱敏后的稳定分类，不返回原始错误文本。

若 `workflow_events` 覆盖不足，应返回 `coverage=partial/unavailable`，不能返回“0 个问题”。

### 7.9 `skills_summary`

回答“哪些 Skill 值得关注”。

输入：时间范围、可选 Skill、排序方式、分页参数。

输出可包含调用数、涉及会话数、成功/失败/未知数、重试率、耗时、token、成本和趋势。每个比率必须同时返回分子、分母和覆盖度。

本工具不得仅根据 token 少或调用次数少推断 Skill 无价值。若成功状态、耗时或关联事件未采集，应把相应指标标为 `unknown`。

### 7.10 `data_quality_issues`

回答“哪些数据问题会影响当前结论”。

输入：状态、严重度、类型、宿主、时间范围和分页参数。

输出：脱敏 issue ID、类别、严重度、影响范围、首次/最近发生时间、出现次数、状态和建议的人类操作。禁止返回可能含路径、Prompt 或密钥的原始 payload。

**实现注记（draft-2）**：`data_quality_issues.detail_json` 当前按各 issue `code` 的需要原样存储（`undated_residual` 存逐模型 token；`missing_sid` 存来源提示；`legacy_aggregate*` 存 coverage 降级信息），可能含模型 raw 名或路径片段。reader 必须过一层 **code-aware allowlist 脱敏**（净新增）——按 `code` 白名单放行已知安全字段，绝不整体回吐 `detail_json`。未知 `code` 默认只放行结构化计数，不放行任何自由文本。

## 8. 内部开发工具

内部工具只能在编译期 feature（draft-2 定为 cargo feature `mcp-internal`，见 §13 M0 D4）下注册。公开安装包在**编译期**就不含这些工具——比运行时 `--profile` 判断更可证（DoD「公开构建没有任意 SQL、写入、同步、迁移、repair 工具」）。

### 8.1 `authority_reconcile`

**状态（draft-2）**：v0.9.1 Phase 4.3 Stage 1（commit `ad4e33e`）已删除「SQL 权威库 vs legacy state JSON」的对账机制——`JsonSummaryRepository` 不再是对账基准，用户已决定翻开关 + 纯 SQL 重导入。因此本工具**不再定义为 SQL-vs-legacy 对账**。

**重定义用途**：验证 SQL 权威库自身的内部一致性与可重导入性——

- **导入幂等**：对同一 `data-migrate` / `sync-facts` 输入重跑，`usage_facts` 的 token / 金额 / 行数逐值恒等（对应 Q12）。
- **快照对账**：SQL 当前查询结果 vs 一份冻结的 `data-export-private` 导出快照（同窗口），逐 `host × bucket`（token 严格相等）+ `provider × basis × currency`（最小货币单位）三态 `exact` / `explained` / `mismatch`。
- **守恒自检**：下钻子项之和 == 上层总量（§6.2 最后一条），且跨聚合面守恒（hourly 累加 == daily、daily 累加 == monthly）。

输入：月份或日期、宿主、可选快照路径、容差配置。输出三态 + 脱敏差异摘要。它**只读**，不修复、不回写。

**过渡条款**：若 M2 在 Phase 4.3 全部 Stage 完成之前落地，可临时保留一个 `--against legacy` 模式读残留的 `JsonSummaryRepository`；该模式随 4.3 Stage 2 退役同时删除，**不进入 v1 兼容承诺**，也不能作为验收用例的唯一依据。

### 8.2 为什么不公开任意 SQL

任意 SQL 会绕过产品语义和安全边界：

- 调用者可能混淆 UTC 与北京时间、事件与聚合、账单与估算。
- 可能跨币种误加、把未定价当零，得到“语法正确、业务错误”的答案。
- schema 一升级，外部查询立即失效，形成不可维护的隐形 API。
- SQLite 中仍含本机标识和审计字段，`SELECT *` 会扩大隐私暴露面。
- 无界查询可能锁库、占用大量内存，影响正在同步的产品。
- 开放 PRAGMA、ATTACH、扩展或写语句会突破“只读数据产品”的承诺。

如调试确有需要，可以另设不随产品发布的 `query_sql_readonly`：

- 只在 `mcp-internal` feature 构建里注册（与 `authority_reconcile` 同门），并在工具描述中标记不稳定。
- 使用 SQLite read-only 连接和只读 authorizer。
- 仅接受单条 `SELECT` 或只读 `WITH ... SELECT`。
- 拒绝写入、DDL、事务控制、PRAGMA、ATTACH/DETACH、VACUUM、扩展加载和多语句。
- 3 秒超时、最多 200 行、最大 1 MiB 结果，超限即失败。
- 列名命中敏感字段时拒绝或脱敏；只记录本地审计，不记录返回值。

该能力用于开发者排障，不属于 Data MCP v1 的兼容承诺，也不能作为验收用例依赖。

## 9. 隐私与安全

### 9.1 永不返回的内容

- Prompt、用户消息、模型回复正文。
- 工具原始参数、工具原始返回和原始错误文本。
- 本地绝对路径、用户名、机器 namespace、原生 session ID。
- API key、Cookie、Authorization header、环境变量和带 token 的 URL。
- 未经过脱敏分类的来源 payload。

### 9.2 会话引用

`session_ref` 必须是本机稳定、外部不可反推的引用。建议使用应用安装时生成的随机 salt 对内部 `session_key` 做 HMAC，并截断为足够长度。不得直接散列可枚举的原生 ID。

**实现注记（draft-2）**：仓库当前无此 salt——`source_identity.rs` 的 `fnv1a64_hex` 是非密码学哈希，不满足「不可反推」。M0 需定（D5）：① salt 生成时机（首次 `data-mcp serve` 或安装脚本）；② 存储位置——**不进权威库**，因为库会被 `data-export-*` 导出；建议 `<data_home>/.mcp-session-salt`，权限 `0600`；③ HMAC 原语——`sha2` 已是依赖，可实现 HMAC-SHA256，不新增 crate。`session_key` 本身含原生 ID 片段，绝不出现在响应里。

### 9.3 进程与文件权限

- Server 继承当前用户权限，不提权。
- 数据库以 read-only URI 打开；不得因查询自动创建数据库或执行 migration。
- 不监听网络端口。
- MCP 进程退出时释放连接；客户端断开后不得驻留后台。
- 错误响应只包含稳定错误码和安全描述，详细诊断写入本机 `stderr`。

## 10. 查询治理与性能

- 所有公开工具使用固定查询模板和绑定参数。
- 小时查询最大 31 天；一般聚合最大 24 个月；更长范围需按月分段。
- 分页默认 50、最大 200，使用稳定 cursor，不使用可能漂移的大 offset。
- 单工具默认 3 秒超时、最大 1 MiB 响应。
- 长查询使用一致性读事务，不能看到同步事务的半成品。
- 结果排序必须稳定；同值时以不可见稳定键补充排序。
- 对外 DTO 与数据库 schema 解耦；schema 变化不应无意改变 MCP 字段。
- 高频工具可以在 repository 层增加索引或可验证缓存，但缓存必须携带 authority data version，不能返回跨同步批次的混合结果。

## 11. 错误契约

错误统一返回稳定 code；不得只返回自由文本。

| code | 含义 | 调用者建议 |
|---|---|---|
| `database_missing` | 权威库不存在 | 先运行产品同步/迁移 |
| `database_unreadable` | 数据库损坏或无法读取 | 运行 data doctor，保留现场 |
| `schema_migration_required` | schema 过旧 | 用匹配版本的产品迁移 |
| `schema_too_new` | MCP 版本落后于数据库 | 升级 MCP/产品 |
| `invalid_argument` | 参数格式或枚举非法 | 修正参数 |
| `invalid_time_window` | 时间范围非法或超限 | 缩小范围 |
| `not_found` | session_ref 等不存在 | 重新搜索或检查范围 |
| `data_unavailable` | 无法形成可信结果 | 查看 warnings/status |
| `query_timeout` | 查询超过时间预算 | 缩小范围 |
| `result_too_large` | 结果超过行数或体积限制 | 使用分页/更细过滤 |
| `internal_error` | 未分类内部错误 | 查看本地日志；响应不泄露细节 |

数据部分缺失但仍可回答时，应返回成功响应并设置 `coverage=partial` 与 warnings，而不是把整次调用变成错误。

## 12. 测试与用户查询验收

### 12.1 契约测试

| ID | 场景 | 通过标准 |
|---|---|---|
| M01 | 空数据库 | `data_status` 如实显示空；聚合不制造历史数据 |
| M02 | 模型小时曲线 | 固定 fixture 返回 24 桶，合计与日汇总守恒 |
| M03 | 宿主小时曲线 | 各宿主合计与全局合计守恒，峰值小时正确 |
| M04 | 未定价模型 | token 保留，成本标记 unresolved，不显示为 0 |
| M05 | 来源过期/缺失 | coverage 为 partial，列明 stale/missing host |
| M06 | 稳定分页 | 无重复、无遗漏；相同快照重复调用结果一致 |
| M07 | 敏感字段 | 全工具响应不含路径、原生 ID、正文或密钥样本 |
| M08 | 注入输入 | 参数不能改变查询结构；非法枚举被拒绝 |
| M09 | 数据库缺失/损坏 | 返回稳定错误，不自动建库、不吞错 |
| M10 | schema 新旧不兼容 | 分别返回 migration required / too new |
| M11 | authority 未启用 | 可供内部验收，但响应明确标记 candidate |
| M12 | 公开工具清单 | 不存在任意 SQL、写入、同步、repair 工具 |
| M13 | 同步与查询并发 | 查询只看到事务提交前或提交后的完整快照 |
| M14 | 查询限制 | 超时、行数和响应体限制均有效 |
| M15 | 三消费面一致性 | MCP、CLI、Tauri 对同一窗口的 token/金额逐值相等 |

### 12.2 用户问题验收

| ID | 用户问题 | 使用工具 | 必须验证 |
|---|---|---|---|
| U01 | 今天各模型的小时曲线是什么？ | `usage_hourly(group_by=model)` | 24 桶、峰值、模型合计、覆盖度 |
| U02 | 今天各宿主什么时候最活跃？ | `usage_hourly(group_by=host)` | 宿主曲线与日汇总守恒 |
| U03 | 本月哪个模型最贵？ | `cost_breakdown` | 币种/口径分离、价格版本可解释 |
| U04 | 为什么本周成本上升？ | `cost_breakdown(compare=true)` | 用量/组合/缓存/价格/账单因子及未解释余额 |
| U05 | 高峰由哪些会话构成？ | `sessions_search` → `session_detail` | 能下钻且不泄露内容和原生标识 |
| U06 | 哪些问题反复出现？ | `issues_summary` | 次数、影响会话、成本、趋势、证据范围 |
| U07 | 哪些 Skill 有问题？ | `skills_summary` | 分子分母、失败率、未知态，不做越权推断 |
| U08 | 这个结论可信吗？ | 任一查询 + `data_status` | 新鲜度、缺口、未定价和 authority 状态可见 |
| U09 | SQL 权威库自洽吗（重导入幂等 + 与冻结快照一致）？ | internal `authority_reconcile` | 重跑导入逐值恒等；SQL vs 导出快照 exact/explained/mismatch 可区分（原「SQL 与旧链路一致」随 legacy 退役失效，见 §8.1） |
| U10 | 调价前后的历史成本对吗？ | `cost_breakdown` | 按事实时间选择价格版本，不用当前价覆盖历史（前置：逐日/逐事实价版重放，见 §7.5 注记） |

用户验收 fixture 必须包含：三个宿主、至少两个供应商、同一 raw 模型名跨宿主映射到不同归属、跨价格快照（`pricing_snapshots` 至少两版，覆盖一个调价日）、缓存 token、DSH 峰谷、重复事件、未定价模型（`billing_route` 认不出）、缺失来源、跨月边界和北京时间日界线。（draft-2：`model_aliases` / `pricing_versions` 归一表未落地，fixture 用 raw 模型名 + `pricing_snapshots` 表达同等场景。）

### 12.3 真机验收

内部版本使用本机真实数据执行，但报告只保存聚合和哈希引用：

1. 对今天、本月、跨月边界运行当前阶段已启用的 U 用例；到 v1.0.0 前完成 U01–U10。
2. 将 MCP 与 CLI/Tauri 结果逐值比较。
3. 对异常差异下钻到脱敏事实 ID；禁止复制原始对话到测试报告。
4. 所有差异必须分类为 `exact`、`explained` 或 `mismatch`。
5. `mismatch` 不得通过调大容差关闭；必须形成 data quality issue 或修复。

## 13. 交付阶段

### Phase M0：契约与风险冻结

- 冻结公开工具名、输入、输出 envelope、时间口径和错误码。
- 完成隐私 threat model，建立敏感字段阻断清单。
- 建立 MCP DTO 与 SQL schema 的映射测试（少一列 / 改一列类型必须让测试红）。

**M0 必须拍板的决策（draft-2）——每条给 owner + 结论，不留隐式默认**：

- **D1｜传输层**：手写最小 JSON-RPC 2.0 over stdio（stdlib + `serde_json`，仅 framing + method dispatch + 错误码映射）vs 引入 `rmcp`。约束：MSRV 1.74、「分发物零第三方」、只读本机 server 不需要 async 运行时。倾向手写；若走 `rmcp` 须单独评审其依赖树与 MSRV 影响。
- **D2｜envelope 金额**：最小货币单位整数 + `currency` + `basis` 三元组，定 MCP 侧整数金额类型与序列化（不复用冻结 DTO 的展示 `f64`）。
- **D3｜模型归属范围**：v1 工具按 `(host, raw_model, billing_route)` 语义（§5 规则 4），还是把 §3.4 归一表建设拉进 v0.9.1？前者让 M1 立即开工、Q13/Q14 弱一档；后者反之。倾向前者 + 在工具描述里显式标注降级。
- **D4｜内部工具 gating**：cargo feature `mcp-internal`，公开构建**编译期排除**（不是 `--profile internal` 运行时开关）。
- **D5｜`session_ref` salt**：生成时机、存储位置（不进权威库）、HMAC 原语（见 §9.2 注记）。
- **D6｜`authority_reconcile` 形态**：确认 §8.1 draft-2 的重定义（导入幂等 + SQL-vs-导出快照 + 守恒自检），或另议。

退出条件：评审确认本文件；D1–D6 全部有结论与 owner；任何未决语义都有后续版本，不留隐式默认值。

### Phase M1：最小可用查询面

- 实现 `data-mcp serve`、stdio 生命周期和 capability 列表（D1 定的传输层）。
- envelope 类型 + `coverage` / `freshness` 从 `CoverageStatus` / `Freshness` DTO 投影（`missing_hosts` / `stale_hosts` / `covered_from`/`covered_to` 从逐宿主 freshness 组装）。
- `data_status`、`summary_daily`、`summary_monthly`——薄封装现有 `SqlSummaryRepository` + `data-status` 查询（§5.3 已就绪面）。
- `usage_hourly`——**新增**跨宿主「小时 × model / provider」查询 + 逐小时成本（`hourly_by_host` 只够宿主轴）。
- `data_quality_issues`——issue reader + code-aware 脱敏 allowlist（§7.10 注记）。
- 完成 M01–M05、M08–M14。

退出条件：Agent 能可靠回答使用曲线、日/月汇总和数据可信度。M1 是本 spec 最大的单块工作（传输层 + envelope + 一个净新增查询）。

### Phase M2：v0.9.1 迁移验收能力

- `mcp-internal` feature 实现 `authority_reconcile`（§8.1 draft-2 形态：导入幂等 + SQL-vs-导出快照 + 守恒自检）。
- MCP、CLI、Tauri 三消费面对同一窗口逐值对账（M15）。
- 用真实本机数据完成 U01、U02、U08，并把 U09 改为「SQL 与冻结快照一致 + 重导入幂等」（原「SQL 与旧链路一致」随 legacy 退役失效）；关闭所有未解释 mismatch。

退出条件：Data MCP 可作为 SQL 权威库读路径与三消费面一致性的自动验收接口；M0–M2 即 v0.9.1 Data MCP MVP。

### Phase M3：v0.9.2 成本解释与会话下钻

- **前置子阶段**：① `authority_query` 补按事实时点选价版能力（逐日 / 逐事实历史价格重放）；② 「session 索引 v2」——`sessions` 表补 `started_at_ms` / `ended_at_ms` / 会话级聚合 + `session_ref` HMAC 基元（D5）。
- 实现 `cost_breakdown`（含变化因子分解引擎）、`sessions_search`、`session_detail`。
- 完成历史价格版本重放、脱敏、稳定分页和证据覆盖测试。

退出条件：Agent 能从异常曲线下钻到会话并解释成本变化；完成 U03–U05、U10。

### Phase M4：v0.10 问题与 Skill 洞察

- **前置（独立立项，不算 MCP 工作量）**：`workflow_events` 的宿主 wire 提取 → 脱敏指纹 → SQL writer → reader → 覆盖度。工作量与 behavior 检测线相当，随 v0.10 任务图推进；本 Phase 的 MCP 部分只是管线就绪后的工具封装。
- 实现 `issues_summary`、`skills_summary`。
- 完成重复问题、Skill 分子/分母、未知态和证据覆盖测试。

退出条件：完成 U06–U07；Agent 能基于证据回答重复问题和 Skill 健康度。

### Phase M5：v1.0.0 发布准备

- 公开构建确认不注册内部工具。
- 安装、发现、升级、schema 不兼容和卸载路径验证。
- 性能、资源占用、崩溃恢复和安全审查。
- 发布用户文档与示例问题，不暴露数据库内部概念。

退出条件：满足第 14 节 Definition of Done。

## 14. Definition of Done

Data MCP v1 完成必须同时满足：

- 所有公开查询只读 SQL 权威库，不读取 legacy 或宿主原始日志。
- MCP、CLI、Tauri 对冻结 fixture 和真机窗口的核心数字一致。
- 每个结果都能表达 complete、partial、unavailable 和 unresolved。
- 成本按币种、计费口径、供应商、模型和价格快照（`pricing_snapshots` 时点；归一 `pricing_versions` 就绪后升级为版本）解释，不产生伪合计。
- 公开构建没有任意 SQL、写入、同步、迁移、repair 工具。
- 响应不含对话正文、本机路径、原生 session ID、密钥或工具原始参数。
- 公开工具具备固定查询模板、参数校验、超时、分页和响应体限制。
- stdio 无协议外 stdout 输出；客户端断开后进程干净退出。
- M01–M15 与 U01–U10 全部通过。
- 至少一次真实数据验收中，所有差异均为 exact 或有书面解释；无未关闭 mismatch。

## 15. 与版本路线的关系

- **v0.8**：外部 MCP 使用证据与健康分析；不是本 Data MCP 的前置依赖，未完成部分继续独立管理。
- **v0.9**：提供事实模型、清洗与产品汇总能力；剩余产品功能可与 Data MCP 契约阶段并行，但不能绕过统一 repository。
- **v0.9.1**：SQL 权威迁移是 Data MCP 的数据前提。Phase 0–3（schema / 清洗写入 / 读路径切换）已完成，Phase 4（双轨验收）进行中——4.3 Stage 1 已退役 SQL-vs-legacy 对账。M1 五工具可基于已完成的读路径立即开工；M2 的对账验收口径改为「SQL 自洽 + 快照一致」，不依赖 legacy 第二实现。
- **v0.9.2**：可在稳定事实之上强化异常解释、质量守门、可观测性和性能；不得反向改变已发布的 MCP v1 语义。
- **v0.10**：TraceGraph、Issue、Action 等更高层能力可新增工具或 v2 字段，但必须基于明确证据，不污染 v1 的用量与成本事实。

## 16. 决策记录

1. 首版使用本机 stdio，不提供网络服务。
2. 首版只提供 Tools，不提供 Resources/Prompts。
3. 公开面不提供任意 SQL；受限 SQL 仅可作为不发布的开发工具。
4. MCP 是 SQL repository 的适配器，不复制业务计算。
5. SQL 尚为候选权威时允许内部查询，但必须显式标记 `candidate`。
6. 会话下钻使用不可反推的 `session_ref`，不暴露原生标识。
7. 缺失证据必须表现为 partial/unavailable/unknown，永不伪装成零。
8.（draft-2）MCP 传输层默认手写最小 JSON-RPC 2.0 over stdio；不引入 `rmcp` / `tokio`（MSRV 1.74 + 分发物零第三方），除非单独评审通过。
9.（draft-2）envelope 金额一律最小货币单位整数 + `currency` + `basis`，不复用冻结 DTO 展示层的 `f64`。
10.（draft-2）v1 工具按 `(host, raw_model, billing_route)` 语义归属；§3.4 canonical 归一表是 v0.9.2+ 补强，不阻塞 MVP。
11.（draft-2）内部工具经 cargo feature `mcp-internal` 编译期排除，公开构建不含（不用运行时 profile 开关）。
12.（draft-2）`authority_reconcile` 随 v0.9.1 legacy 退役重定义为「导入幂等 + SQL-vs-导出快照」对账，不再是 SQL-vs-legacy。
