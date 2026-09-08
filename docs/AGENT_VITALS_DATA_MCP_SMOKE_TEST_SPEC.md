# Agent Vitals Data MCP 真机可用性冒烟测试规格

> 状态：v1（2026-09-08）——首轮真机执行完成，随 Data MCP 增量推进滚动更新。
> 脚本：`tests/mcp_smoke.py`。上位规格：`AGENT_VITALS_DATA_MCP_SPEC.md`。

## 0. 目的与定位

把**用户实际会问的数据问题**逐条打到 `agent-vitals data-mcp serve` 上，在**真机
`~/.agent-vitals` 数据**上回答三个问题：

1. 这个问题今天能不能通过 MCP 回答？（能 / 部分 / 被未实现的工具挡住）
2. 能回答的，数值对不对？——与 CLI（`agent-vitals data …`）**逐值对账**，不是"看起来差不多"。
3. 回答里有没有泄露不该泄露的东西（本机路径 / 原生会话 ID / 对话正文）。

这是**冒烟**，不是契约测试。契约测试（`M01–M19`）在 `cargo test` 里用受控
fixture 跑；本规格用真机数据做端到端可用性巡检，抓的是"工具在真实数据形状上
到底行不行"——例如增量 2 的 `usage_hourly` 单测全绿，真机一跑就暴露
`total_output_tokens` 是垃圾（`d3251ea` 修）。

## 1. 参考基准

冒烟用例直接取自两份规格里的用户查询集，不另造：

| 来源 | 内容 | 本规格如何用 |
|---|---|---|
| `AGENT_VITALS_V0_9_1_SQL_AUTHORITY_MIGRATION_SPEC.md` §4.1 | 面向用户的查询目录（7 类能力 + 下钻链路） | 冒烟矩阵的"能力"分组 |
| 同上 §4.2 | **Q01–Q14 用户查询验收用例**（既是产品验收也是 e2e fixture） | **冒烟矩阵的主轴**——每条 Q 一行 |
| `AGENT_VITALS_DATA_MCP_SPEC.md` §3 | 用户场景（使用节奏 / 成本与预算 / 问题与效率 / 数据可信度） | 补 §4.2 未覆盖的可信度问题（S4.x） |
| 同上 §12.2 | U01–U10（§4.2 的 MCP 工具投影） | 工具映射参考 |
| 同上 §12.1 | M01–M19 契约测试 | 协议 / 安全冒烟（M07 / M12 / M18 / M19）从中取 |

§4.2 的 Q 分三档，本规格沿用：**Q01–Q05 首批可见价值**；**Q06–Q10 依赖
`workflow_events`**；**Q11–Q14 是所有查询成立的可信度底线**。

## 2. 前置条件

```bash
# 公开构建（data_status / usage_hourly）
cargo build --release
python3 tests/mcp_smoke.py --bin target/release/agent-vitals

# 内部构建（+ query_sql_readonly，跑得动更多代理查询与 M19）
cargo build --release --features mcp-internal
python3 tests/mcp_smoke.py --bin target/release/agent-vitals --internal

# 隔离数据根（默认真机 ~/.agent-vitals）
AGENT_VITALS_HOME=/path/to/fixture python3 tests/mcp_smoke.py --bin … [--internal]
```

真机跑之前权威库必须是 schema v2 且 `sql_authority_enabled`：

```bash
agent-vitals data-status   # health: ok · schema v2 · sql_authority_enabled true
agent-vitals sync-facts    # 让 freshness 是新的
```

## 3. 判定口径（承 `AGENT_VITALS_DATA_MCP_SPEC.md` §12.3）

| 判定 | 含义 | 脚本退出码影响 |
|---|---|---|
| `EXACT` | MCP 返回值与 CLI 对照项**逐值相等**（token 整数、金额 `amount_minor` 整数） | — |
| `EXPLAINED` | 有差异，但**有书面原因**（已知实现缺口、口径差、时区窗设计差） | — |
| `MISMATCH` | 未解释差异 | **exit 1**——必须开 data quality issue 或修，禁止调容差关掉 |
| `PARTIAL` | 目标工具在，但只覆盖问题的一部分（例如有 token 维、缺金额维） | — |
| `BLOCKED` | 目标工具**未实现**（附解锁里程碑） | — |

## 4. 冒烟矩阵

每行：**目标工具**（spec §7 承诺的）· **今日可跑**（现在实际能打的调用，含
`query_sql_readonly` 代理）· **CLI 对照** · **判据** · **首轮判定（2026-09-08）**。

### 4.1 Q01–Q05：首批可见价值

| Q | 目标工具 | 今日可跑 | CLI 对照 | 判据 | 判定 |
|---|---|---|---|---|---|
| **Q01** 今天各模型小时曲线 | `usage_hourly(group_by=model)` | 同 ✅ | `data daily --date <today> --json` | 每序列 24 桶；`peak_hour` 在场且是最大桶；model 轴按 host 求和 == host 轴（守恒）；MCP 逐宿主 total == CLI `tokens_by_host` | **EXACT** |
| **Q02** 今天各宿主小时曲线 + 峰值 | `usage_hourly(group_by=host)` | 同 ✅ | `data daily` | 宿主曲线分开；`totals_by_host` 之和 == 全局；`peak_hour_by_host` 自洽 | **EXACT** |
| **Q03** 北京月/日界归属 | `usage_hourly` / `summary_monthly` | `usage_hourly(date=<月初>)` ✅ | `data daily --date <月初>` | 月初 00 点桶（= UTC 前一天晚上）归属北京当日；逐宿主 total == CLI | **EXACT** |
| **Q04** 峰值下钻到会话，token 合计==峰值 | `sessions_search` → `session_detail` | — | — | 下钻列出构成会话；会话 token 合计严格等于峰值；不泄露正文/原生 ID | **BLOCKED**（M3；`session_ref` HMAC 基元 D5 未落地） |
| **Q05** 缺价卡模型不归零 | `cost_breakdown` | `data-unresolved --json` + `query_sql_readonly(v_data_quality_safe)` | `data-unresolved` | 用量可见；成本 `unresolved`，不以 0 或估算冒充实付 | **PARTIAL**（用量维 ✅ via SQL；成本 `unresolved` 判定只在 CLI / `cost_breakdown` M3） |

### 4.2 Q06–Q10：依赖 `workflow_events`

| Q | 目标工具 | 判定 |
|---|---|---|
| **Q06** 本周重复错误指纹聚为问题卡 | `issues_summary` | **BLOCKED** |
| **Q07** 连续失败后成功 = 一组重试链 | `issues_summary` | **BLOCKED** |
| **Q08** Skill 成功率 + 样本不足判定 | `skills_summary` | **BLOCKED** |
| **Q09** Skill 版本回归识别 | `skills_summary` | **BLOCKED** |
| **Q10** 会话时间线关联失败/峰值 | `session_detail` | **BLOCKED** |

全部卡在 `workflow_events` 管线（宿主 wire 提取 → 脱敏指纹 → SQL writer →
reader）——spec §13 M4 前置，"工作量与 behavior 检测线相当"，随 v0.10 任务图。
`workflow_events` 表已建，无 writer/reader。

### 4.3 Q11–Q14：可信度底线

| Q | 目标工具 | 今日可跑 | 判据 | 判定 |
|---|---|---|---|---|
| **Q11** 宿主 24h 未同步 → 标 stale/partial、列明缺失宿主 | envelope `freshness.stale_hosts` + `coverage.missing_hosts` | `data_status` → `by_host.covered_to` / `last_seen_at` | envelope 把过期宿主折成显式标记 | **EXPLAINED**（缺口 #F1：`freshness.stale_hosts` 硬编码 `[]`，`by_host` 有原始数据但没折成标记；真机 dsh 事实停在 2026-08-31，8 天过期，envelope 不标） |
| **Q12** 重复导入 + 中途中断 → 重跑查询逐值恒等 | `reimport_verify`（MCP 外命令） | — | 临时库两遍导入逐值恒等，不碰生产库 | **BLOCKED**（M2 增量 7；只读 MCP 工具刻意不做重导入，spec 决策 12） |
| **Q13** 调价日前后用正确价格版本 | `cost_breakdown` | `query_sql_readonly(pricing_snapshots)` | 调价日前后分别用对应 `pricing_snapshots` 版本；历史不被当前价卡覆盖 | **BLOCKED**（M3 硬前置：`authority_query` 按事实时点选价版；真机 `pricing_snapshots` 只有 1 版） |
| **Q14** 同 raw 模型名跨宿主 | `usage_hourly` / `cost_breakdown` 的 `identity_kind` | `usage_hourly(group_by=model)` ✅ | 每序列显式 `identity_kind`；无法映射标 `unresolved`，不并入相似名 | **PARTIAL**（`identity_kind: "host_raw"` 每序列在场，key 带 `host` 消歧 ✅；canonical 归一 = v0.9.2+；`unresolved` 语义在 `data-unresolved` / M3） |

### 4.4 数据可信度补充（Data MCP §3.4，`data_status` 直接答）

| ID | 问题 | 调用 | 判据 | 判定 |
|---|---|---|---|---|
| **S4.1** 最近一次同步 | `data_status` | `freshness.last_successful_sync_at` + `authority_revision.committed_at` 在场且是 RFC3339 +08:00 | **EXACT** |
| **S4.2** 哪些宿主/日期不完整 | `data_status` | `by_host` 逐宿主 `covered_from/covered_to/facts`；`coverage.missing_hosts` | **EXACT**（原始数据齐；折成 stale 标记见 #F1） |
| **S4.3** 重复事实 / 无法识别模型 / 缺价 / 重导入差异 | `data_status` | `open_quality_issues_by_code`（真机：`legacy_aggregate`×3 / `reconcile_exception`×4 / `undated_residual`×1） | **EXACT** |
| **S4.4** 正式 SQL 权威库还是候选 | `data_status` | `authority_state ∈ {enabled, candidate}` + `data.sql_authority_enabled` + `schema_version` | **EXACT** |

## 5. 协议与安全冒烟（取自 M07 / M12 / M18 / M19）

| ID | 检查 | 判据 | 判定 |
|---|---|---|---|
| **M07** 敏感字段 | 扫 `data_status` + `usage_hourly` 全响应文本 | 不含 `native_session_id` / `path_hash` / `machine_namespace` / `session_key` / `source_event_id` / `/Users/` | **EXACT**（零命中） |
| **M12** 公开工具清单 | 公开构建 `tools/list` | 恰为 `["data_status", "usage_hourly"]`——无任意 SQL / 写入 / 同步 / repair | **EXACT** |
| **M18** 线协议 | JSON-RPC 序列 | `initialize` 前发别的 → JSON-RPC error（真机 `-32002`）；未知方法 → `-32601`；未知工具 → `-32602`；坏日期 / 多余字段 / 坏枚举 → `isError` + `invalid_argument`；stdin EOF → exit 0；stdout 无非协议行 | **EXACT** |
| **M19** `query_sql_readonly` 来源列拒绝（`--internal`） | authorizer 冒烟 | `SELECT native_session_id AS x` / `INSERT …` / `SELECT * FROM usage_facts` 全部 `invalid_argument`；`SELECT … FROM v_facts_safe GROUP BY host` 放行 | **EXACT** |

## 6. 执行

```bash
python3 tests/mcp_smoke.py --bin <bin> [--internal] [--home <dir>]
```

**不变式（脚本断言，不只是打印）**：

1. **守恒**：`usage_hourly` model 轴按 host 分组求和 ≡ host 轴 `totals_by_host` ≡ CLI `data daily` 逐宿主 total。
2. **诚实零**：某宿主真机零事实（dsh 当日）→ 两侧都不出现该宿主的 0 行，不是"claude=X, codex=Y, dsh=0"。
3. **窗口**：24 个北京小时桶恒在场（含全零桶）；`peak_hour` 是最大非零桶。
4. **脱敏**：见 M07。
5. **退出码**：出现 `MISMATCH` → exit 1。`BLOCKED` / `PARTIAL` / `EXPLAINED` 不影响退出码（它们是路线状态，不是回归）。

**何时重跑**：每次 Data MCP 增量收口；每次改 `authority_query` 的窗口/聚合 SQL；
真机启用观察期内每周一次。

## 7. 2026-09-08 首轮真机结果

`~/.agent-vitals`（schema v2，54,873→54,941 facts，`sql_authority_enabled=true`），
`--internal` 构建：

| 判定 | 数量 | 用例 |
|---|---|---|
| EXACT | 9 | Q01 Q02 Q03 · S4.1 S4.4（+ S4.2/S4.3 归 EXACT）· M07 M18 M19 M19b |
| EXPLAINED | 1 | Q11（缺口 #F1） |
| PARTIAL | 2 | Q05 Q14 |
| BLOCKED | 8 | Q04 · Q06–Q10 · Q12 Q13 |
| MISMATCH | **0** | — |

公开构建：EXACT 8 / EXPLAINED 1 / PARTIAL 2 / BLOCKED 8（少 `--internal` 专属的
M19/M19b，多 M12）。

**逐值对账样本**（Q01/Q02，2026-09-07）：MCP `usage_hourly` 逐宿主
`total` + `total_output_tokens` 与 `agent-vitals data daily --date 2026-09-07
--json` **逐位相等**（claude-code total `1227310463` / output `1975245`；
codex total `28194124`；dsh 两侧均无 0 行）。

**首轮修的真机 bug**（`d3251ea`）：`usage_hourly group_by=host` 曾走
`hourly_by_host`（导航查询只回单个 i64），总量塞进 `output_tokens` 槽 →
`total_output_tokens == total_tokens`；`group_by=model` 不带 `hosts` 参数静默
返回空 series。两个 `group_by` 现统一走 `hourly_by_host_model`。

## 8. 缺口表 → 解锁触发

| # | 缺口 | 现状 | 解锁 |
|---|---|---|---|
| **F1** | `freshness.stale_hosts` 硬编码 `[]`；`coverage.status` 不因单宿主过期降 `partial` | `data_status.by_host` 有 `covered_to` / `last_seen_at` 原始数据，consumer 自己算 | M1 收口（增量 5）——envelope 把 `by_host` 按阈值（24h？可配）折成 `stale_hosts` + `coverage=partial`，钉 M05 契约测试 |
| **F2** | 无金额工具 → Q05 成本维、S2「花了多少」「哪个最贵（钱）」「实付/等价/订阅分离」全部只能走 CLII | `usage_hourly` 只有 token；`MoneyMinor` 类型 + `money.rs` 在，无消费面 | 增量 3（`summary_daily`/`summary_monthly`）+ M3（`cost_breakdown`） |
| **F3** | 无 `data_quality_issues` 工具 → Q05/S2.4 只能 `query_sql_readonly` 数 code，不能逐模型下钻 unresolved 原因 | `v_data_quality_safe` view 在（且刻意不含 `detail_json`） | 增量 4（`data_quality_issues` + code-aware 脱敏 allowlist） |
| **F4** | Q04/S1.4 会话下钻 | `usage_facts.session_key` 外键在，无 `session_ref` HMAC，`sessions` 表 `started_at_ms`/`ended_at_ms` 多空 | M3「session 索引 v2」子阶段 + `sessions_search` / `session_detail` |
| **F5** | Q06–Q10 问题 / Skill 洞察 | `workflow_events` 表已建，无 writer/reader | M4（`workflow_events` 管线独立立项，随 v0.10）+ `issues_summary` / `skills_summary` |
| **F6** | Q12 重导入幂等验收 | — | M2 增量 7：`agent-vitals data reimport-verify`（MCP 外隔离命令） |
| **F7** | Q13 历史价版重放 | `pricing_snapshots` 写入方 + `asof` 读原语在，只有 1 版快照；`cost_breakdown` 按事实时点选价版未落 | M3 硬前置：`authority_query` 补按事实时点选价版能力 |
| **F8** | `usage_hourly group_by=provider` 与 `model` 等价 | `provider_id` 归一表 §3.4 未建；schema 描述已注明"identical here" | v0.9.2+ canonical 归一 |

## 9. 通过门槛

- **当前阶段（M0–M1 部分）**：Q01 / Q02 / Q03 / S4.* / M07 / M12 / M18 全 `EXACT`；
  `MISMATCH` == 0。BLOCKED 项与缺口表逐条对得上。← **2026-09-08 达成**。
- **M1 收口**：F1 关闭（`stale_hosts` 落地）；增量 3/4 落地后 Q05 升 `EXACT`，
  新增 `summary_daily`/`summary_monthly` 行，三消费面 parity（M15）纳入。
- **M2 收口**：Q12 升可跑（`reimport_verify`）；`authority_audit` 纳入。
- **v1.0.0（M5）**：Q01–Q14 全部 `EXACT` 或 `EXPLAINED`；无未关闭 `mismatch`
  （`AGENT_VITALS_DATA_MCP_SPEC.md` §14 DoD 末条）。
