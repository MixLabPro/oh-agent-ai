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
| Phase 2 清洗写入与同步 | 🔨 | 三路并发实现合流（c06de2e）+ 审查收口（6776fe0）+ 收口批（b1f8b38：双写/存量迁移 49,321/data status/authority 保留）；审查 agent 复核中 |
| Phase 3 SQL repository 与读路径切换 | ⬜ | |
| Phase 4 双轨验收与旧路径退役 | ⬜ | |

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

- [ ] **3.1 `SqlSummaryRepository`** — 实现 `SummaryRepository` trait
  （daily/monthly）：tokens 从 `usage_facts` 聚合（host × 日/月 ×
  model/provider，event_ts_ms → 北京日/月窗口）；金额走
  `domain::cost` 同一计价面（事实桶 × pricing_snapshots），DSH peak 按
  `event_peak` 列
- [ ] **3.2 legacy_aggregate 导入** — claude ledger 深历史（轮转丢失的行）
  按 §6.2.3 导入：`source_kind=legacy_aggregate` + coverage 降级标记，
  不伪造为行级事实（见 R4 §5.2a 的根因结论：claude 深历史不可从现文件
  重放，ledger 是 store of record）
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

**验收**：client parity 测试（CLI/Tauri 命令/HTML 由同一 DTO 返回）；
双轨对账 harness 逐字段通过。

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
| 9 | 用户查询验收 Q01–Q12 | 端到端 fixture；**Q01–Q05、Q11–Q12 为 release blocker** | ⬜ |

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
