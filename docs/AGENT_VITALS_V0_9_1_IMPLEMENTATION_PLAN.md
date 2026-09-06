# Agent Vitals v0.9.1 SQL 权威迁移——实施计划

> **规格**：`AGENT_VITALS_V0_9_1_SQL_AUTHORITY_MIGRATION_SPEC.md`（已冻结，2026-09-06）
> **本文档**：把规格的 Phase 0–4 拆成可勾选的工程工作项——每项标注落点文件、
> 规格章节、验收方式。实施按既定循环推进：**实现 → 全量测试 → subAgent 审查
> → 修复**，每个 Phase 一个收口点。
>
> 状态标记：✅ 完成 · 🔨 进行中 · ⬜ 未开始 · 🔶 部分完成

---

## 0. 当前进度快照（2026-09-06）

| Phase | 状态 | 说明 |
|---|---|---|
| Phase 0 冻结与基线 | ✅ | spec 冻结；基线备份 `~/.agent-vitals/backup-v0.9.1-baseline/`（facts 48,999 条 + 索引库 + state JSON + 对账报告） |
| Phase 1 schema 与迁移框架 | ✅ | authority.rs（DDL v1 全 12 表 + 版本闸 + 中断清扫 + 事务帮助器 + retention）+ 时钟注入（sql_sync::now_ms）+ 迁移记录（sync_runs/migrations 表） |
| Phase 2 清洗写入与同步 | ✅ | 三路并发实现合流（c06de2e）+ 审查收口（6776fe0）+ 收口批（b1f8b38）+ 迁移哨兵真 bug 修复（1f67331，rusqlite 参数计数错位导致 migrations 表假绿） |
| Phase 3 SQL repository 与读路径切换 | 🔨 | 3.1 完成：`authority_query`（69a0d56，usage_facts 反查 DSH/claude/codex 计价桶形状，15 测）+ `SqlSummaryRepository`（e99c23a，SummaryRepository 第二实现，5 个 client-parity 测试）。**真机对账意外发现并修复一条独立头部 bug**：见下方「claude ledger 去重 bug」。3.2–3.6 未开始 |
| Phase 4 双轨验收与旧路径退役 | ⬜ | |

### claude ledger 去重 bug——发现、修复、真机验证（2026-09-06，非本 Phase 引入）

`SqlSummaryRepository` 写完后用真机 `~/.agent-vitals` 数据跑
`crates/agent-vitals-runtime/examples/reconcile_real.rs`（json vs sql 逐宿主
对比），claude-code 月度 token 相差近 2 倍。排查定位到 **`apps/cli/src/agent/
claude_cost.rs::apply_record`（`claude_sync` 重建 `claude-ledger.json` 的 fold
核心）没有按 `message.id` 去重**——Claude Code 的 session JSONL 会把同一条
已完成的 assistant 消息重复写出多行（真机实例逐字节验证：同一 `message.id`
出现 4 次，`usage` 字段完全相同，只有各行自己的 `uuid`/`timestamp` 不同），
`apply_record` 对每一行无条件累加，系统性高估真实花费。v0.7 UsageFact
emitter（喂新 SQL 管线）从 Stage 1c 就按 `message.id`/`uuid` 正确去重——两条
管线共用同一行解析器 `parse_claude_usage_row`，但去重逻辑只在 emitter 侧，
fold 侧从未补齐，这是 v0.7 就存在的缺陷，不是本 Phase 引入。

**已修复**（用户 2026-09-06 决策：先修此 bug 再继续 Phase 3.2/3.5，避免
读路径切换时无法区分"SQL 迁移效果"与"旧账修正"）：`apply_record`/
`_apply_record`（Rust + Python 双侧）按 `source_event_id` 去重，持久化
`sess["seen_event_ids"]`（增量 resume 也要认得出跨批次重复）；
`FOLD_SCHEMA_VERSION` 2→3 强制真机全量重折（已写入的重复计数不可逆）。
新增 3 组测试：同 message.id 重复 3 次只计一次、不同 message.id 都计入、
真机语料 fixture 扩展进 `tests/test_claude_cost.py` 的 `both()` 差分（byte-parity
覆盖去重后的正确值）。

**真机验证**（修复前后对比，2026-09 月）：claude-code token 总量
6,752,783,759 → 3,403,484,732（−49.6%，此前 ≈2.0× 高估）；ApiEquivalent
（anthropic，USD）$1368.92 → $788.81（−42.4%）；MeteredEstimate（deepseek
relay，CNY）¥591.68 → ¥216.79（−63.4%）；真机 `claude-sync` 报告
`duplicate usage rows: 38708`（169 个真实 session 文件）。修复后 json/sql
两条独立管线的月度 token 差距从 ~49% 收窄到 ~1.7%——两条管线互相印证的
直接证据。详情见 memory `claude-ledger-overcount-bug`。

---

## Phase 1：SQLite 权威 schema 与迁移框架（spec §7 Phase 1）

目标：权威库 `agent-vitals.sqlite3` 成库、可重复打开、损坏与半建状态诚实报错、
批次可观测。**恢复语义在此定调：损坏不自愈**（与旧 index.sqlite3 的本质区别）。

- [x] **1.1 DDL v1 全量建库** — `agent-vitals-data/src/authority.rs`
  （spec §3.1–§3.6 逐表：schema_meta / sync_runs / source_files / sessions /
  usage_facts / host_bills / pricing_snapshots / budget_config /
  budget_snoozes / data_quality_issues / migrations / workflow_events；
  `foreign_keys=ON` + WAL + `busy_timeout` 5s）
- [x] **1.2 版本闸** — 空/同版本/更新版本三态；半建库（有业务表无版本行）
  报 `__corrupt_partial_schema__`（建库必须事务化完成）
- [x] **1.3 中断批次清扫** — open 时 running → cancelled（`error_code=interrupted`）
- [x] **1.4 事务帮助器** — `with_immediate_txn`（Err → ROLLBACK）；全部业务
  写入必须走它
- [x] **1.5 时钟纪律接线** — `sql_sync::now_ms()` 是 runtime 唯一读时钟
  点；data crate 全部 `*_at_ms` 由调用方注入
- [x] **1.6 数据迁移记录** — `migrations` 表已建（DDL 与数据迁移分离）；
  legacy import 的迁移记录走 sync_runs（trigger=migration）
- [ ] **1.7 损坏恢复文档化** — `data doctor` 的报告项预留（schema version /
  完整性 / 恢复路径提示；Phase 2 落命令）

**验收**：空安装 / 重复 open / 中断清扫 / 损坏报错 / 半建拒绝 / 新版本拒绝
六条测试全绿（已有）；`data doctor` 能报库状态（Phase 2 补）。

## Phase 2：清洗写入与同步（spec §5.1 / §7 Phase 2）

**接口契约（实现前钉死，实现 agent 不得偏离）**：

```rust
// agent-vitals-data/src/fact_writer_sql.rs —— SQL 写入面（spec §5.1 四步协议）
pub struct SqlFactWriter<'a> { /* conn + run_id + now_ms */ }
impl<'a> SqlFactWriter<'a> {
    pub fn new(conn: &'a Connection, run_id: &str, now_ms: i64) -> Result<Self, AuthorityError>;
    /// source_files upsert（path_hash = fnv1a64(路径)，不存明文）。返回 source_id。
    pub fn upsert_source_file(&self, host: &str, path: &Path, size: u64,
        mtime_ns: u64, native_session_id: Option<&str>, parser_version: i64) -> Result<String, AuthorityError>;
    /// sessions upsert（session_key = r2a 键构造）。
    pub fn upsert_session(&self, host: &str, ns: &str, native_id: &str,
        profile: Option<&str>, last_observed_ms: i64) -> Result<String, AuthorityError>;
    /// 事实批写入：契约校验（build_usage_fact 同款）→ 合格 INSERT OR CONFLICT
    /// DO NOTHING；不合格写 data_quality_issues（不静默丢）。重复 = duplicate 计数。
    pub fn insert_facts(&self, facts: &[Value], source_id: &str,
        native_session_id: &str) -> Result<SqlInsertReport, AuthorityError>;
}
pub struct SqlInsertReport { pub inserted: usize, pub duplicate: usize, pub rejected: usize }
```

- 事务边界：调用方（runtime sync）`with_immediate_txn` 包「upsert sources/
  sessions + insert_facts」整段（spec §5.1.4）；`SqlFactWriter` 内部不再开
  事务（嵌套 BEGIN 是 sqlite 错误）。
- `sync_facts` 切换：发现/差量逻辑不变；checkpoint 改查 `source_files`；
  emit 后走 `SqlFactWriter`；**JSONL 停写**（存量文件保留为遗留）。
- 敏感点：fact 的 `event_ts_ms` 由 ISO ts 解析（复用 store.rs `parse_ymd` 同
  层 helper）；`event_peak` 复用 `peak_of`（三个尾部形态都已钉测）。
- **批次合成 source 行排除规则**（审查收口定稿）：`upsert_batch_source` 落
  的合成行路径 = `/sync/{host}`、size/mtime 恒 0——Phase 3 的差量判定、
  repair 重放、source 计数必须排除（`source_id LIKE '%:sync'` 或按指纹
  判 0），并把「迁移窗口内事实的 source_id 指向批次行」记录为已知
  provenance 限制（fact_id/会话下钻不受影响，文件级溯源在此窗口缺失）。



目标：三宿主 emitter → **SQL writer**；JSON checkpoint → `source_files`；
lease 包住完整事务。旧 `index.sqlite3` 的 facts 按 §6.2.1 一次性导入。

- [ ] **2.1 SQL writer** — `runtime`（或 data）新增 `fact_writer_sql`：
  candidate facts 校验（schema/token 非负/宿主词表/身份）→ 不合格写
  `data_quality_issues` → 合格项进 `BEGIN IMMEDIATE` 事务
  `INSERT ... ON CONFLICT DO NOTHING`（spec §5.1.3/5.1.4）。幂等键 =
  既有 `fact_id`（第二道防线 = 表上的 UNIQUE 五元组）
- [ ] **2.2 `source_files` 迁移** — JSON checkpoint（`.ingest-checkpoint.json`）
  的 (size, mtime_ns) 指纹迁入 `source_files`（path_hash = 路径的 fnv1a64，
  不存明文路径，spec §3.2）；JSON checkpoint 文件退役
- [ ] **2.3 sessions 最小索引** — emitter 的身份字段 upsert `sessions`
  （session_key = 既有 r2a 键构造），`usage_facts.session_key` 关联
- [x] **2.4 双写（迁移窗口 §6.1）** — `sync_facts` emit 一次，同一批事实
  先写 SQL 权威（write_flat_facts_to_authority）再走旧链 ingest；两轨都
  成功才进 checkpoint。JSONL 停写推迟到 Phase 4（旧读面切换完成后）
- [x] **2.5 一次性导入** — `data-migrate`：facts/*.jsonl 重放入权威库
  （真机 49,321 条，重跑全 duplicate 幂等）；旧 `store`（index.sqlite3）
  保留至 Phase 3 读切换后退役
- [ ] **2.6 命令面** — `data sync`（= 现 sync-facts 的 SQL 版）/
  `data status`（sync_runs + 来源 + 质量摘要）/ `data repair`（重放指定
  来源）/ `data migrate`（§6.1 升级状态机的手动入口）
- [ ] **2.7 lease 接线** — 现有 `.ingest.lock` 包住「发现→解析→事务写入」
  全程（spec §5.1.4）；并发双进程语义与现批次一致
- [ ] **2.8 HostBillRecord + 价格快照** — `host_bills` 写入方
  （WorkBuddy credit_json 首个，**范围待用户确认**）+
  `pricing_snapshots`（load_pricing 的版本化落库，历史查询按版本重放）

**验收**：同一事件重放/文件修改/截断/坏行/并发同步的测试矩阵（spec §8.2）；
`sync_runs` 与 `data_quality_issues` 如实记录。

## Phase 3：SQL repository 与全部读路径切换（spec §5.2 / §7 Phase 3）

目标：**所有产品查询只走 `SqlSummaryRepository`**。禁止运行时读取
month.json / ledger / Codex fold / facts JSONL（spec §5.2 禁读清单）。

- [x] **3.1 `SqlSummaryRepository`** — 实现 `SummaryRepository` trait
  （daily/monthly）：tokens 从 `usage_facts` 聚合（host × 日/月 ×
  model/provider，event_ts_ms → 北京日/月窗口）；金额走
  `domain::cost` 同一计价面，DSH peak 按 `event_peak` 列。
  `crates/agent-vitals-data/src/authority_query.rs`（反查层）+
  `SqlSummaryRepository`（`summary.rs`）；5 个真实数据 client-parity 测试
  + 真机对账脚本 `examples/reconcile_real.rs`。**pricing_snapshots 未接入**
  ——当前仍读 `domain::cost::load_pricing()`（与 JSON 路径同一张活价表），
  价格快照版本化是独立的 3.4 相邻工作，非阻断项
- [ ] **3.2 legacy_aggregate 导入** — claude ledger 深历史（轮转丢失的行）
  按 §6.2.3 导入：`source_kind=legacy_aggregate` + coverage 降级标记，
  不伪造为行级事实（见 R4 §5.2a 的根因结论：claude 深历史不可从现文件
  重放，ledger 是 store of record）。🔶 **读路径已就绪**
  （`authority_query::claude_legacy_days` + `SqlSummaryRepository` 的
  `merged_claude_days` 已消费）；**写路径未接线**——`legacy_import::
  import_claude_ledger_days` 函数本体在 Phase 1 就写好且有单测，但没有
  任何 CLI 命令调用它，真机库里目前没有一条 `legacy_aggregate` 行
- [ ] **3.3 coverage_status** — 每宿主 measured/partial/unavailable 的
  分母定义落库（spec §4：摘要必须带 coverage/freshness/excluded/
  last_observed_at/data_version）
- [ ] **3.4 budget_status** — 预算/告警从 `budget_config` + `usage_facts`
  聚合计算；`budget_config`/`budget_snoozes` 的显式管理 API（替代
  alert.json / budget.json）
- [ ] **3.5 读路径切换清单**（逐个消费点切 + 双轨验证）：
  - [ ] `runtime::summary::JsonSummaryRepository` → `SqlSummaryRepository`
  - [ ] `data coverage` / `data daily` CLI
  - [ ] Tauri：`data_monthly_summary` / `data_daily_summary` /
    `read_calendar_month` / `read_hourly_distribution` / 预算卡
  - [ ] `budget show` / alert 计算
  - [ ] HTML 模板消费面（`codex-cost --html`）
- [ ] **3.6 导出切 SQL** — `data-export-private` / `data-export-redacted`
  改从 SQL 查询生成（spec §9）
- [ ] **3.7 用户查询验收 Q01–Q14（spec §4.2）端到端 fixture** — 2026-09-07
  盘点（用户问询触发）：矩阵第 9 行此前一直 ⬜，现有覆盖全是单元/契约级，
  blocker 集无一以 e2e fixture 落地。逐用例现状：

  | 用例 | 现有覆盖（层级） | 缺口 |
  |---|---|---|
  | Q01 跨宿主小时曲线 | `codex_by_hour_model` 单元测试 | 跨宿主小时聚合面在 Tier B（未切 SQL）；e2e 无 |
  | Q02 同模型跨宿主不重不漏 | parity 测试隐式（三宿主同测） | 「各宿主之和 == 总量」未显式断言 |
  | Q03 北京月界 00:30 归属 | `authority_query` 边界单元测试（±1ms） | e2e fixture 无 |
  | Q04 峰值小时下钻、会话合计==峰值 | **无** | **前置 3.7a**：authority 库缺最小 `facts_page` 查询面（`SummaryRepository` 现只有 daily/monthly 两个方法，spec §4「最少提供」9 个方法只落 2 个） |
  | Q05 无价卡 unresolved 不归零 | claude/codex unresolved 单元测试 | e2e fixture 无 |
  | Q11 宿主 24h 未同步 → stale/partial 显式 | freshness/excluded_hosts 契约测试 | 「单宿主过期不得冒充完整总额」e2e 无 |
  | Q12 双次导入+中断 → 重跑恒等 | writer 级幂等/回滚测试 | 跨「导入→查询」e2e 无 |
  | Q13 调价日前后价格版本 | 无 | 依赖 pricing_snapshots 落库（3.4 相邻欠账），非 blocker、显式记欠 |
  | Q14 同 raw 模型名跨宿主 | unknown→unresolved 单元测试 | 跨宿主同名 fixture 无 |
  | Q06–Q10 workflow_events | 表已建、无 writer/reader | spec 自身定位 v0.9.1 最小化，随 v0.10 任务图，不阻塞 release |

  另：spec §4 行轴/聚合轴分离纪律明文要求 Phase 3 repository 验收矩阵含
  「聚合数 ≠ 行级数 + 聚合数 = ledger 数」fixture——单元级已钉
  （`peaked_days_map` 排除 legacy、`claude_legacy_days` 只读 peak=0），但
  `SqlSummaryRepository` 层「同日两类行并存不双计」未落。

  执行方案（3.2/3.5/3.6 之后、Phase 3 收口审查之前）：
  - **3.7a**：authority 库补最小 `facts_page`（host × 时间窗 × cursor 分页），
    落 `agent_vitals_data::authority_query`，供 Q04 下钻。
  - **3.7b**：新建 e2e 测试文件（临时 `AGENT_VITALS_HOME` + 权威库 seed 的
    fixture builder），blocker 集 Q01–Q05、Q11–Q12 + §4 分离纪律 fixture
    逐条钉判别值；Q14 顺带（成本低）；Q13 挂 3.4 验收；Q06–Q10 记 v0.10。

**验收**：client parity 测试（CLI/Tauri 命令/HTML 由同一 DTO 返回）；
双轨对账 harness 逐字段通过；3.7 blocker 集 e2e 全绿。

### 任务书：3.2 / 3.5 / 3.6（2026-09-06，供派发 subagent 前确认）

#### 3.2 legacy_aggregate 导入接线

**范围**：把已经写好、有单测、但从未被任何命令调用的
`agent_vitals_data::legacy_import::import_claude_ledger_days` 接进
`data-migrate`。纯接线，不改算法。

**落点**：`apps/cli/src/main.rs`，`Cmd::DataMigrate` 分支（约 2246-2322 行）。
现有代码在 `for host in ["claude-code", "codex", "dsh"]` 的 JSONL 导入循环
结束、`db.finish_run(...)` 之前收尾。

**步骤**：
1. 循环结束后，加一段：`agent_vitals_data::legacy_import::
   load_claude_ledger_days(&agent_vitals_runtime::state::state_dir())` 读
   `claude-ledger.json` + `claude-ledger-archive.json` 合并出的 `{day:
   {model: 4桶}}`（当前月优先于归档，函数已实现）。
2. 若非空对象，`db.with_immediate_txn(|conn| legacy_import::
   import_claude_ledger_days(conn, &run_id, now_ms, &days))`，把
   `LegacyImportReport{imported, duplicate, conflicts}` 累进汇总输出（新加
   一行 `println!`，格式参照现有 `"  {host}: +{} inserted, ..."`）。
3. 读文件失败（`AuthorityError::Io`，如非法 JSON）与 JSONL 导入失败同一
   处理：`finish_run("failed", ...)` + `exit(2)`——不能吞。
4. **不需要判断"这天是否已有实时事实"**——两者身份字段完全不重叠
   （`native_session_id="day:{day}"` + `machine_namespace="legacy"` 是
   legacy 专属固定值，`UNIQUE` 约束不会撞实时事实），查询侧
   （`SqlSummaryRepository::merged_claude_days`）已经做「有实时用实时、
   没有才退回 legacy」——导入侧只管把 ledger 全量灌进去，不用自己判重叠。
5. `migrations` 表的 `checkpoint_json` 可以顺带把 legacy 导入的三个数字也
   塞进去（跟 JSONL 导入的 `{"inserted":...}` 合并成一个对象），不需要
   单开一行 migrations 记录。

**验收**：
- 新增一条集成测试（或扩展现有 `data-migrate` 冒烟）：临时 data home 里放
  一份 `facts/claude-code.jsonl`（几条真实事实）+ `state/claude-ledger.json`
  （几天历史，其中至少一天与 jsonl 事实的日期不重叠），跑 `data-migrate`
  后 `usage_facts` 表里应同时出现 `observation_kind='assistant-usage'`（或
  实际用的 kind 名）与 `observation_kind='legacy_aggregate'` 两类行，且
  `SELECT COUNT(*) FROM data_quality_issues WHERE code LIKE 'legacy_aggregate%'`
  能看到 coverage 降级标记（`mark_coverage_degradation` 已实现）。
- 重跑 `data-migrate` 两次，第二次 legacy 部分应全 duplicate（幂等）。
- 真机（`~/.agent-vitals`）跑一次 `data-migrate`，确认 `usage_facts` 出现
  `legacy_aggregate` 行且 `SqlSummaryRepository` 对历史月份（当前月之前、
  ledger 已滚出但归档还在的月份）不再报 Unavailable。
- `cargo test --release` 全量 + `cargo clippy --release --all-targets -D warnings`。

**注意**：本次会话刚修完 `claude-ledger.json` 的重复计数 bug（见
「claude ledger 去重 bug」章节）——真机的 `claude-ledger.json`/
`claude-ledger-archive.json` 现在已经是修复后的正确值，3.2 接线时不需要
再关心这条历史 bug。

---

#### 3.5 读路径切换清单——先分两层，再派发

**关键澄清（写任务书前查代码发现的落差，与规划文档原有清单不同）**：
清单里六个消费点，**只有前两类真的经过 `SummaryRepository` trait**、切换
是一行改动；**后三类（calendar/hourly、budget/alert、HTML）根本不走这条
trait**，是各自直接读 JSON 状态文件/codex fold 的独立函数——切到 SQL
是和 `SqlSummaryRepository` 同等量级的新实现工作，不是"改一行调用"。
派发前务必按下面两层分别处理，不要把 3.5 当成一个均质任务整体丢出去。

**Tier A（真·一行切换，适合直接派发）**：

| 消费点 | 文件:行 | 改法 |
|---|---|---|
| `data coverage` / `data daily` CLI | `apps/cli/src/main.rs:2789-2790` | `Box::new(agent_vitals_runtime::summary::JsonSummaryRepository)` → `SqlSummaryRepository` |
| Tauri `data_monthly_summary` | `apps/desktop/src-tauri/src/lib.rs:1239` | 同上 |
| Tauri `data_daily_summary` | `apps/desktop/src-tauri/src/lib.rs:1248` | 同上 |

`apps/cli/src/main.rs:2129`（`Cmd::DataReconcile`）**故意不在这份清单
里**——它比较的是「facts 索引 vs DTO」，用途是验证旧 index.sqlite3 投影
本身的一致性，不是终端用户消费面；保持读 `JsonSummaryRepository` 不动，
除非 Phase 4 决定连这条诊断命令也一起退休。

Tier A 验收：client parity——同一份真机数据，切换前后 CLI/Tauri 输出
byte-diff 应只有本来就存在的「json vs sql 已知残差」（本次会话
`reconcile_real.rs` 已量出：claude token 差 ~1.7%、codex 差 ~0.3%，来自
SQL facts 同步覆盖率/未计时事件，不是新 bug）；`cargo test --release` +
clippy 全绿。**这三行切完之后必须重跑一次 `reconcile_real.rs` 确认残差
没有扩大**——扩大说明切换本身引入了新问题，不是已知残差。

**Tier B（需要新实现，工作量与 `SqlSummaryRepository` 本体相当，不建议
现在派发给不熟悉本次会话上下文的 subagent）**：

1. **`calendar_month`/`hourly_distribution`**
   （`crates/agent-vitals-runtime/src/summary.rs`，Tauri
   `read_calendar_month`/`read_hourly_distribution` 调用）——直接读 DSH
   month/today.json、codex fold、claude ledger，逐日/逐小时组装，完全在
   `SummaryRepository` trait 之外。SQL 版需要仿照本次会话
   `authority_query.rs` 的模式：DSH 已经有 `peaked_days_map`
   可以直接复用出日轴；小时轴（`hourly_distribution`）需要新写一个
   `authority_query::hourly_by_host`（三宿主，参照 `codex_by_hour_model`
   的整数除法算北京小时，claude/dsh 也要各自补一版）。
2. **`budget show` / alert**
   （`crates/agent-vitals-runtime/src/budget.rs::{budget_show,
   budget_show_month, evaluate_alert}`）——DSH-only，读
   `month.json`/`today.json`/`alert.json`。切 SQL 前必须先做 **3.4**
   （`budget_config`/`budget_snoozes` 表的 CRUD API）——alert 阈值现在存在
   `budget.json`，没有 SQL 对应物，3.4 不做，3.5 这块无法切。
3. **HTML 模板消费面**（`codex-cost --html` →
   `render_codex_cost_html`/`codex_calendar_blob`，`apps/cli/src/main.rs`
   约 1146 行起）——内联进模板的 JSON 直接来自 codex fold 的 `merged`
   对象，不经过任何 repository。

**建议**：3.5 只派发 Tier A；Tier B 三项等 3.3/3.4 落地、或由我本人（已有
`authority_query`/`SqlSummaryRepository` 的完整上下文）继续做，避免 subagent
冷启动重新踩一遍北京时区算术、峰谷分离这类本次会话已经趟出结论的坑。

---

#### 3.6 导出切 SQL——先决问题，不要直接派发实现

**范围**：`crates/agent-vitals-runtime/src/export.rs` 的
`export_private`/`export_redacted`，当前都读 `facts/<host>.jsonl` 原文件
（`export_private` 逐字节复制；`export_redacted` 经 `evidence::replay` 重放
后重导身份）。

**必须先回答的问题（不是实现细节，是方向判断）**：`usage_facts` 表的列
是原始 UsageFact JSON 字段的**子集**——`identity_basis`/`time_basis`/
`source_usage_semantics`/`model_raw` vs `model_id` 的区分/
`normalization_version`/`schema_version`/`event_ts_utc`（字符串）这些字段
在写入 SQL 时就没有对应列（`fact_writer_sql.rs` 只抽取了计价/查询需要
的列）。如果 3.6 真的把导出源换成 SQL 表，`export_private`
（"私有 trace 的完整面"，模块头原话）会从**逐字节精确复制**退化成
**从残缺投影重建的近似**——这是保真度倒退，且与 `export.rs` 模块头
"两条路径写各自的输出目录，绝不共用中间产物"暗含的"JSONL 是完整原始
证据"这条设定冲突。

**建议先确认再派发**：
- 若 spec §9 的本意是"JSONL 作为私有导出的权威源永久保留"（即使 SQL
  成为查询权威后，JSONL 仍是 evidence 层，不退役）——3.6 可能根本不需要
  改 `export_private`，只需要在文档/spec 里把这条决策明确写下来，检查
  项变成"确认现状符合预期"而不是"实现改动"。
- 若 spec §9 真的要求两个导出函数都改读 SQL——需要先决定
  `export_private` 能接受的保真度损失范围（哪些字段允许在导出里消失），
  这是产品/隐私决策，不是工程细节，我建议先问用户再让 subagent 动手，
  避免做出一个之后要推翻重来的实现。
- `export_redacted` 的伪名化逻辑（`pseudonym`/身份字段重导）与"读源是
  JSONL 还是 SQL"正交——不管往哪个方向走，这部分代码不用大改。

**如果确认要切 SQL**：读 `usage_facts WHERE deleted_at_ms IS NULL`（私有
导出可能还要决定是否包含软删除行——这也是需要先问的点，`export_private`
当前的"逐字节复制"语义下，被删除的行从未被排除，因为 JSONL 是
append-only 没有删除概念），按 host 分文件写出，字段名映射回原
UsageFact JSON 形状（`fact_id`/`host`/`machine_namespace`/... 直接对应列，
`event_ts_utc` 需要从 `event_ts_ms` 反算 ISO 字符串）。

## Phase 4：双轨验收与旧路径退役（spec §6.3 / §7 Phase 4 / §10）

- [ ] **4.1 机器可读对账报告** — SQL vs legacy 按 host × month × bucket
  严格相等；金额按 currency × basis × provider 比最小货币单位；例外必须
  有 issue code + partial 标记
- [ ] **4.2 切换门槛** — 「连续一次全量导入 + 至少一次增量同步均通过对
  账」→ 设 `sql_authority_enabled` → 停写旧 state JSON；否则保持
  legacy-only，不允许半切换
- [ ] **4.3 退役清单执行**（spec §10）— 删 `JsonSummaryRepository`、
  month.json/today.json/alert.json 业务读、ledger/fold 的查询路径直读、
  JSON checkpoint、以及「SQLite 可由 JSONL 重建」的权威语义；legacy 代码
  只留 importer/export/测试 fixture
- [ ] **4.4 人工验收** — 真机迁移、kill 后恢复、删旧 JSON 继续查询、删
  SQLite 后明确告警不回落

---

## 测试矩阵（spec §8 → 落点）

| # | 类别 | 落点 | 状态 |
|---|---|---|---|
| 1 | schema migration（空装/升级/重复/中断/低版本/高版本） | `agent-vitals-data/src/authority.rs::tests` | ✅ 核心 6 条（低版本升级随 Phase 2 补） |
| 2 | ingest（重放/修改/截断/坏行/并发） | Phase 2：`fact_writer_sql` 测试 | ⬜ |
| 3 | transaction 故障注入（facts/bills/checkpoint/run 各提交点） | Phase 2：writer + sync_runs 测试 | ⬜（Phase 1 的 txn 回滚已有） |
| 4 | CRUD（soft delete/retention/分页 cursor） | Phase 2/3 | ⬜ |
| 5 | query（时区边界/峰谷/跨月/跨币/unresolved） | Phase 3：repository 测试 | ⬜ |
| 6 | reconciliation（全量+增量） | Phase 4：对账报告 | ⬜ |
| 7 | client parity | Phase 3：三消费面同一 DTO | ⬜ |
| 8 | performance（不枚举原始日志/索引命中） | Phase 3：EXPLAIN QUERY PLAN 断言 | ⬜ |
| 9 | 用户查询验收 Q01–Q12 | 端到端 fixture；**Q01–Q05、Q11–Q12 为 release blocker** | 🔨 落点见 3.7（2026-09-07 盘点：仅有单元级重叠覆盖，e2e fixture 未落） |

---

## 关键工程纪律（实施期间不可违反）

1. **禁读清单**（Phase 3 起）：product 代码不得直读 month.json /
   today.json / ledger / codex fold / facts JSONL——只能经 repository。
2. **金额不落浮点**：库内一律最小货币单位整数；展示层换算。
3. **无日期/质量异常事实不静默删除**：retention 只处理有日期且过窗的行；
   异常行走显式修复流程。
4. **两处同步**：DDL 改动 = spec §3 + `authority.rs::SCHEMA_V1` 同改 +
   `SCHEMA_VERSION` 递增。
5. **MSRV 1.74**：不引入 >1.74 的 std API（clippy incompatible-mssvr 已
   开 `-D`）。
6. **每 Phase 收口**：全量测试（含 `AGENT_VITALS_BIN` 差分 + golden）→
   subAgent 审查 → 修复 → 编译安装 App 验证内置 CLI。

---

## 验证命令

```bash
# 权威库单元面
cargo test -p agent-vitals-data authority

# 全量 gate（每个收口点必跑）
cargo clippy --all-targets -- -D warnings
cargo test
AGENT_VITALS_BIN=$PWD/target/release/agent-vitals python3 -m unittest discover tests
AGENT_VITALS_BIN=$PWD/target/release/agent-vitals python3 tests/golden_runner.py

# 双轨对账（迁移期持续观测）
./target/release/agent-vitals data-budget-reconcile --month 2026-08
./target/release/agent-vitals data-reconcile --month 2026-09

# App 编译安装（Phase 切换点）
cd apps/desktop/src-tauri && cargo tauri build --bundles app
```
