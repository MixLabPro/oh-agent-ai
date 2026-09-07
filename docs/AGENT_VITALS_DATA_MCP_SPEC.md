# Agent Vitals Data MCP Spec

> 版本：v0.9.1-draft-1  
> 日期：2026-09-07  
> 状态：待评审  
> 依赖：`AGENT_VITALS_V0_9_1_SQL_AUTHORITY_MIGRATION_SPEC.md`  
> 目标版本：v0.9.1 提供内部 MVP；v0.9.2/v0.10 补齐解释能力；达到发布门槛后随 v1.0.0 提供本机只读能力

## 1. 一句话定义

Data MCP 是 Agent Vitals 面向 AI Agent 的**本机、只读、语义稳定的数据查询接口**。

它让 Agent 能安全回答“今天各模型怎么用、哪个宿主花得多、哪些问题反复出现、哪些 Skill 需要关注、数据是否可信”等问题，并能自动执行验收；它不是任意 SQL 控制台，也不是新的数据权威层。

## 2. 为什么现在需要它

v0.9.1 正在把运行时读取统一到 SQLite 权威库。仅完成数据库和页面切换，还不足以证明系统真的满足用户需求。Data MCP 在产品界面与数据库之间增加一层稳定、可重复调用的“问题接口”，主要解决四件事：

1. **算得清**：统一模型、供应商、宿主、币种、计费口径和时间范围。
2. **算得准**：MCP、CLI、桌面端读取同一 SQL repository，可逐值对账。
3. **看得懂**：结果携带覆盖范围、新鲜度、缺失来源和未定价项，不把“不知道”显示成零。
4. **用得上**：Agent 可以直接完成趋势分析、异常定位、成本解释和版本验收。

Data MCP 也是架构的“压力测试面”。当旧链路与 SQL 链路不一致、数据重复、模型无法归一、价格缺失或来源过期时，它应主动暴露问题，而不是用默认值掩盖问题。

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
- 是否存在重复事实、无法识别的模型、缺失价格或迁移对账差异？
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

不可违反的规则：

1. Data MCP 不是新的计算实现。它必须调用 `agent-vitals-data` / `agent-vitals-runtime` 的统一查询与计价能力。
2. 除内部 `authority_reconcile` 外，任何 MCP 工具不得读取宿主原始日志、legacy JSON、JSONL、ledger 或旧 fold。
3. Data MCP 不直接写表，不调用同步、迁移、repair 或 host bill 写接口。
4. 模型与供应商使用 SQL 中的 canonical ID；原始模型名不得直接成为查询语义。
5. 价格与币种不可浮点计算、不可跨币种相加、不可把 unresolved 当成 0。
6. 在 SQL 尚未正式成为 runtime authority 时，可以用于内部验收，但每个响应必须标记 `authority_state=candidate`。

建议落点：

- 协议入口：`agent-vitals data-mcp serve`
- MCP adapter：CLI 仅负责 `stdio`、协议编解码和进程生命周期。
- 工具应用层：`agent-vitals-runtime`。
- SQL 查询、分页与覆盖度：`agent-vitals-data`。
- DTO 与枚举：优先复用已有 domain/runtime 类型；MCP 专属 envelope 独立版本化。

`stdout` 只能输出 MCP 协议消息；日志必须写入 `stderr`。Server 不监听端口。

## 6. 通用响应契约

所有成功工具返回相同顶层结构：

```json
{
  "schema_version": "1",
  "data_version": {
    "authority_schema": 1,
    "query_semantics": "2026-09-07"
  },
  "authority_state": "enabled",
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

交付版本不是一次性承诺。当前 SQL 已能可靠支撑 v0.9.1 核心查询；成本归因仍需完成历史价格重放，问题与 Skill 查询仍需 `workflow_events` writer/reader。工具按以下门槛启用：

| 工具 | 首次启用 | 前置条件 |
|---|---|---|
| `data_status` | v0.9.1 internal MVP | authority schema 与健康查询 |
| `usage_hourly` | v0.9.1 internal MVP | `usage_facts` 小时查询 |
| `summary_daily` | v0.9.1 internal MVP | SQL Summary Repository |
| `summary_monthly` | v0.9.1 internal MVP | SQL Summary Repository |
| `data_quality_issues` | v0.9.1 internal MVP | 脱敏 issue reader |
| `authority_reconcile` | v0.9.1 internal only | legacy 双轨仍在迁移期可用 |
| `cost_breakdown` | v0.9.2 | 按事实时间重放价格版本 |
| `sessions_search` / `session_detail` | v0.9.2 | 稳定 session_ref、会话聚合查询 |
| `issues_summary` / `skills_summary` | v0.10 | `workflow_events` writer、reader 与覆盖度 |

未达到前置条件的工具不得用空实现提前注册。客户端可通过 MCP capability 列表判断可用能力。

### 7.1 `data_status`

回答“当前数据是否可信、是否新鲜、是否已经切到 SQL”。

输入：无。

输出至少包含：

- 权威状态与 schema 版本。
- 最近一次成功、失败和进行中的同步。
- 各宿主最近观测时间、事实数和覆盖起止。
- 未解决的数据质量问题数量，按严重度和类型分组。
- 未识别模型、未定价用量和迁移差异摘要。

该工具必须在业务数据为空时仍可使用；数据库不存在时返回结构化错误，不自动建库。

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

### 7.6 `sessions_search`

回答“哪些会话构成了这个峰值或异常”。

输入：时间范围、可选宿主/模型/供应商、排序字段、`limit`、`cursor`。

输出只包含：

- 不可逆或不可枚举的 `session_ref`。
- 宿主、开始/结束时间、token、金额、模型构成、事件计数。
- 覆盖和质量标记。

禁止输出原生 session ID、机器 namespace、文件路径、标题、Prompt 或回复正文。默认 `limit=50`，最大 `200`。

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

## 8. 内部开发工具

内部工具只能在显式 `--profile internal` 或编译期开发 feature 下注册。公开安装包不得暴露这些工具。

### 8.1 `authority_reconcile`

用途：迁移期比较 SQL 与 legacy 链路，验证宿主/日/月的 token、金额和新鲜度。

输入：月份或日期、宿主、容差配置。输出 exact、explained、mismatch 三态及脱敏差异摘要。

它是唯一允许读取 legacy 聚合的 MCP 工具，并且只能读取，不能修复或回写。v0.9.1 完成旧链路退役后，该工具应删除或改为 SQL 与导出快照对账。

### 8.2 为什么不公开任意 SQL

任意 SQL 会绕过产品语义和安全边界：

- 调用者可能混淆 UTC 与北京时间、事件与聚合、账单与估算。
- 可能跨币种误加、把未定价当零，得到“语法正确、业务错误”的答案。
- schema 一升级，外部查询立即失效，形成不可维护的隐形 API。
- SQLite 中仍含本机标识和审计字段，`SELECT *` 会扩大隐私暴露面。
- 无界查询可能锁库、占用大量内存，影响正在同步的产品。
- 开放 PRAGMA、ATTACH、扩展或写语句会突破“只读数据产品”的承诺。

如调试确有需要，可以另设不随产品发布的 `query_sql_readonly`：

- 只在本地 internal profile 注册，并在工具描述中标记不稳定。
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
| U09 | SQL 与旧链路一致吗？ | internal `authority_reconcile` | exact/explained/mismatch 可区分 |
| U10 | 调价前后的历史成本对吗？ | `cost_breakdown` | 按事实时间选择价格版本，不用当前价覆盖历史 |

用户验收 fixture 必须包含：三个宿主、至少两个供应商、模型别名、跨价格版本、缓存 token、DSH 峰谷、重复事件、未定价模型、缺失来源、跨月边界和北京时间日界线。

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
- 建立 MCP DTO 与 SQL schema 的映射测试。

退出条件：评审确认本文件；任何未决语义都有 owner 和后续版本，不留隐式默认值。

### Phase M1：最小可用查询面

- 实现 `data-mcp serve`、stdio 生命周期和 capability 列表。
- 实现 `data_status`、`usage_hourly`、`summary_daily`、`summary_monthly`。
- 实现脱敏后的 `data_quality_issues`。
- 完成 M01–M05、M08–M14。

退出条件：Agent 能可靠回答使用曲线、日/月汇总和数据可信度。

### Phase M2：v0.9.1 迁移验收能力

- internal profile 实现 `authority_reconcile`。
- MCP、CLI、Tauri 三消费面对账。
- 用真实本机数据完成当前已具备证据的 U01、U02、U08、U09，并关闭所有未解释 mismatch。

退出条件：Data MCP 可以作为 v0.9.1 SQL 权威迁移的自动验收接口；M0–M2 即 v0.9.1 Data MCP MVP。

### Phase M3：v0.9.2 成本解释与会话下钻

- 实现 `cost_breakdown`、`sessions_search`、`session_detail`。
- 完成历史价格版本重放、脱敏、稳定分页和证据覆盖测试。

退出条件：Agent 能从异常曲线下钻到会话并解释成本变化；完成 U03–U05、U10。

### Phase M4：v0.10 问题与 Skill 洞察

- 接通 `workflow_events` writer、reader 和覆盖度。
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
- 成本按币种、计费口径、供应商、模型和价格版本解释，不产生伪合计。
- 公开构建没有任意 SQL、写入、同步、迁移、repair 工具。
- 响应不含对话正文、本机路径、原生 session ID、密钥或工具原始参数。
- 公开工具具备固定查询模板、参数校验、超时、分页和响应体限制。
- stdio 无协议外 stdout 输出；客户端断开后进程干净退出。
- M01–M15 与 U01–U10 全部通过。
- 至少一次真实数据验收中，所有差异均为 exact 或有书面解释；无未关闭 mismatch。

## 15. 与版本路线的关系

- **v0.8**：外部 MCP 使用证据与健康分析；不是本 Data MCP 的前置依赖，未完成部分继续独立管理。
- **v0.9**：提供事实模型、清洗与产品汇总能力；剩余产品功能可与 Data MCP 契约阶段并行，但不能绕过统一 repository。
- **v0.9.1**：SQL 权威迁移是 Data MCP 的数据前提；M0–M2 是迁移验收和读路径收口的放大器。
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
