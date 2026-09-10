//! v0.9.1（SQL Authority Migration，spec §3/§7 Phase 1）：**SQLite 单一运行时
//! 权威库**——`<data_home>/agent-vitals.sqlite3`。
//!
//! 与旧 `store`（index.sqlite3）的本质区别（spec §1.1 不可变决策）：
//! - 本库是**运行时权威数据源**，不是可重建投影；「删库 → 从 JSONL 重建」
//!   不再是正常恢复方式。损坏 → 如实报错，恢复 = 用户备份 + 宿主原始日志
//!   重放（§7 Phase 1），恢复不了就报 coverage 缺口，绝不静默回落另一本账。
//! - `facts/*.jsonl` 降级为迁移/导出输入；宿主日志是不可信输入，必须经
//!   清洗校验才能进 `usage_facts`。
//! - 所有写入走 `BEGIN IMMEDIATE` 事务 + `sync_runs` 记录；running 批次在
//!   下次 open 时标 interrupted（§3.1）。
//!
//! **时钟纪律**：本 crate 不读时钟（dependency_budget 禁 chrono/time，且
//! 「事实自带事件时间」的同款纪律）——所有 `*_at_ms` 由调用方（runtime）
//! 注入。规格的 `CHECK`/`UNIQUE`/部分索引逐条照搬 spec §3，DDL 是 spec 的
//! 镜像，改动必须两处同步 + 递增 [`SCHEMA_VERSION`]。
//!
//! Phase 1 范围：DDL + migration runner + 事务帮助器 + sync_runs。写入端
//! （SQL writer）与查询端（SqlSummaryRepository）是 Phase 2/3。

use std::path::{Path, PathBuf};

use rusqlite::{Connection, OpenFlags, OptionalExtension};

use agent_vitals_domain::billing::{BillingTemplateKind, PricingSource};

use crate::safe_query::authority_callback;

/// 当前 DDL 版本。spec §3 的表结构变更递增；`migrations` 表（§3.5）记录的
/// 是**数据迁移**（legacy import 等），与 DDL 版本刻意分开。
///
/// v2（`host_runtime_snapshots`）走 `MIGRATE_V1_TO_V2` 升级。增量 7.5 的 4 个
/// 脱敏只读 view（`v_facts_safe` / …）是**版本无关**的只读加法：`VIEWS_V1`
/// 在每次 open 用 `CREATE VIEW IF NOT EXISTS` 幂等重建，不占版本号。
pub const SCHEMA_VERSION: i64 = 6;

/// 权威库默认路径：`<data_home>/agent-vitals.sqlite3`（spec §3）。
/// 与旧 `index.sqlite3` 并存至 Phase 1 迁移框架完成导入后退役。
pub fn default_authority_path(data_home: &Path) -> PathBuf {
    data_home.join("agent-vitals.sqlite3")
}

/// `host_bills_for_period` 的一行：`(host, provider_id, billing_basis,
/// amount_minor, currency)`。`amount_minor` 是最小货币单位整数——金额从不
/// 以浮点入库（spec §5.3），折算在展示层。
pub type HostBillRow = (String, String, String, i64, String);

type BillingTemplateRow = (String, Option<String>, String, String, i64, Option<i64>);
type OutcomeMeasurementRow = (String, String, String, Option<i64>, Option<String>, String);

/// 权威库错误。`Corrupt` **不再自愈**——恢复路径是「用户备份 + 原始日志
/// 重放」，静默删库重建会把权威库变成可被悄悄替换的第二本账（spec §1.1.3
/// 的反面教材）。
#[derive(Debug)]
pub enum AuthorityError {
    Sqlite(rusqlite::Error),
    /// 库的 schema 版本比本二进制新——升级二进制，不降级重建。
    NewerSchema {
        found: i64,
        supported: i64,
    },
    Io(std::io::Error),
    /// `open_readonly` 专用（spec §9.3：只读取数面不建库）——文件不存在。
    /// 与 `open` 的「不存在则建库」刻意相反：只读消费者遇到缺库必须如实报
    /// 错，不能悄悄造一个空库端出 facts=0。
    MissingFile,
    /// `open_readonly` 专用——不是 SQLite 文件 / 文件损坏 / 半建库
    /// （`schema_meta` 读不出）。
    Corrupt,
    /// `open_readonly` 专用——库的 schema 版本比本二进制旧，需要产品迁移。
    /// （`open` 里这条走 `__unsupported_legacy_version__` 防御分支；只读面
    /// 单列一个 typed 变体，供错误码映射成 `schema_migration_required`。）
    OlderSchema {
        found: i64,
    },
}

impl From<rusqlite::Error> for AuthorityError {
    fn from(e: rusqlite::Error) -> Self {
        AuthorityError::Sqlite(e)
    }
}

impl From<std::io::Error> for AuthorityError {
    fn from(e: std::io::Error) -> Self {
        AuthorityError::Io(e)
    }
}

impl std::fmt::Display for AuthorityError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            AuthorityError::Sqlite(e) => write!(f, "authority sqlite: {e}"),
            AuthorityError::NewerSchema { found, supported } => write!(
                f,
                "authority schema v{found} is newer than supported v{supported} — 升级二进制"
            ),
            AuthorityError::Io(e) => write!(f, "authority io: {e}"),
            AuthorityError::MissingFile => write!(f, "authority db file does not exist"),
            AuthorityError::Corrupt => {
                write!(f, "authority db is not readable (not a SQLite file, corrupt, or half-built)")
            }
            AuthorityError::OlderSchema { found } => write!(
                f,
                "authority schema v{found} is older than supported v{SCHEMA_VERSION} — run product migration"
            ),
        }
    }
}

/// spec §3 全量 DDL（v1）。`executescript` 一次成库；幂等性由「只在空/低版
/// 本库上执行」保证，不用 IF NOT EXISTS（有版本闸后重复执行是 bug，静默
/// 跳过反而掩盖它）。
const SCHEMA_V1: &str = r#"
CREATE TABLE schema_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE sync_runs (
  run_id TEXT PRIMARY KEY,
  started_at_ms INTEGER NOT NULL,
  completed_at_ms INTEGER,
  trigger TEXT NOT NULL,                 -- cli | tray | migration | repair | maintenance
  status TEXT NOT NULL,                  -- running | succeeded | failed | cancelled
  schema_version INTEGER NOT NULL,
  error_code TEXT,
  error_detail TEXT
);

CREATE TABLE source_files (
  source_id TEXT PRIMARY KEY,
  host TEXT NOT NULL,
  path_hash TEXT NOT NULL,                -- 不暴露本地路径
  native_session_id TEXT,
  size_bytes INTEGER NOT NULL,
  mtime_ns INTEGER NOT NULL,
  content_fingerprint TEXT,
  parser_version INTEGER NOT NULL,
  first_seen_at_ms INTEGER NOT NULL,
  last_seen_at_ms INTEGER NOT NULL,
  last_successful_run_id TEXT REFERENCES sync_runs(run_id),
  last_error_code TEXT,
  UNIQUE(host, path_hash)
);

CREATE TABLE sessions (
  session_key TEXT PRIMARY KEY,
  host TEXT NOT NULL,
  native_session_id TEXT NOT NULL,
  machine_namespace TEXT NOT NULL,
  source_profile TEXT,
  started_at_ms INTEGER,
  ended_at_ms INTEGER,
  last_observed_at_ms INTEGER NOT NULL,
  deleted_at_ms INTEGER,
  UNIQUE(host, machine_namespace, native_session_id)
);

CREATE TABLE usage_facts (
  fact_id TEXT PRIMARY KEY,
  host TEXT NOT NULL,
  machine_namespace TEXT NOT NULL,
  native_session_id TEXT NOT NULL,
  session_key TEXT REFERENCES sessions(session_key),
  source_event_id TEXT NOT NULL,
  observation_kind TEXT NOT NULL,
  source_profile TEXT,
  provider_id TEXT,
  model_id TEXT,
  event_ts_ms INTEGER,
  event_peak INTEGER NOT NULL DEFAULT 0,
  uncached_input_tokens INTEGER NOT NULL DEFAULT 0,
  cache_read_tokens INTEGER NOT NULL DEFAULT 0,
  cache_write_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  source_id TEXT REFERENCES source_files(source_id),
  ingested_run_id TEXT NOT NULL REFERENCES sync_runs(run_id),
  created_at_ms INTEGER NOT NULL,
  updated_at_ms INTEGER NOT NULL,
  deleted_at_ms INTEGER,
  CHECK (uncached_input_tokens >= 0),
  CHECK (cache_read_tokens >= 0),
  CHECK (cache_write_tokens >= 0),
  CHECK (output_tokens >= 0),
  UNIQUE(host, machine_namespace, native_session_id, source_event_id, observation_kind)
);

CREATE INDEX usage_facts_host_time
  ON usage_facts(host, event_ts_ms) WHERE deleted_at_ms IS NULL;
CREATE INDEX usage_facts_session_time
  ON usage_facts(session_key, event_ts_ms) WHERE deleted_at_ms IS NULL;
CREATE INDEX usage_facts_provider_model_time
  ON usage_facts(provider_id, model_id, event_ts_ms) WHERE deleted_at_ms IS NULL;

CREATE TABLE host_bills (
  bill_id TEXT PRIMARY KEY,
  host TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  billing_period TEXT NOT NULL,           -- YYYY-MM
  billing_basis TEXT NOT NULL,            -- fixed_subscription | host_billed | metered_actual
  amount_minor INTEGER NOT NULL,
  currency TEXT NOT NULL,
  source_id TEXT REFERENCES source_files(source_id),
  evidence_ref TEXT,
  created_at_ms INTEGER NOT NULL,
  updated_at_ms INTEGER NOT NULL,
  deleted_at_ms INTEGER,
  UNIQUE(host, provider_id, billing_period, billing_basis, evidence_ref)
);

CREATE TABLE pricing_snapshots (
  pricing_version TEXT PRIMARY KEY,
  captured_at_ms INTEGER NOT NULL,
  source_kind TEXT NOT NULL,
  payload_json TEXT NOT NULL
);

CREATE TABLE budget_config (
  config_id INTEGER PRIMARY KEY CHECK (config_id = 1),
  monthly_cny_minor INTEGER,
  daily_cny_minor INTEGER,
  warning_ratio_bp INTEGER NOT NULL,
  updated_at_ms INTEGER NOT NULL
);

CREATE TABLE budget_snoozes (
  snooze_id INTEGER PRIMARY KEY CHECK (snooze_id = 1),
  until_ms INTEGER NOT NULL,
  updated_at_ms INTEGER NOT NULL
);

CREATE TABLE data_quality_issues (
  issue_id TEXT PRIMARY KEY,
  scope_type TEXT NOT NULL,               -- source | session | fact | month
  scope_key TEXT NOT NULL,
  code TEXT NOT NULL,
  severity TEXT NOT NULL,
  first_seen_at_ms INTEGER NOT NULL,
  last_seen_at_ms INTEGER NOT NULL,
  resolved_at_ms INTEGER,
  detail_json TEXT NOT NULL,
  UNIQUE(scope_type, scope_key, code)
);

CREATE TABLE migrations (
  migration_id TEXT PRIMARY KEY,
  started_at_ms INTEGER NOT NULL,
  completed_at_ms INTEGER,
  status TEXT NOT NULL,
  source_version TEXT NOT NULL,
  target_version TEXT NOT NULL,
  checkpoint_json TEXT NOT NULL,
  error_detail TEXT
);

CREATE TABLE workflow_events (
  event_id TEXT PRIMARY KEY,
  session_key TEXT REFERENCES sessions(session_key),
  event_ts_ms INTEGER NOT NULL,
  event_type TEXT NOT NULL,               -- task_started | task_finished | skill_invoked |
                                          -- skill_finished | tool_invoked | tool_finished |
                                          -- model_switched | approval_denied
  capability_kind TEXT,                   -- skill | tool | model
  capability_id TEXT,                     -- Skill/tool/model 的稳定标识
  capability_version TEXT,
  outcome TEXT NOT NULL,                  -- succeeded | failed | cancelled | unknown
  duration_ms INTEGER,
  error_fingerprint TEXT,                 -- 脱敏、稳定的错误分类/指纹
  invocation_fingerprint TEXT,            -- 脱敏调用指纹，用于识别重复重试
  source_id TEXT REFERENCES source_files(source_id),
  ingested_run_id TEXT NOT NULL REFERENCES sync_runs(run_id),
  created_at_ms INTEGER NOT NULL
);

CREATE INDEX workflow_events_session_time
  ON workflow_events(session_key, event_ts_ms);
CREATE INDEX workflow_events_capability_time
  ON workflow_events(capability_kind, capability_id, event_ts_ms);
CREATE INDEX workflow_events_error_time
  ON workflow_events(error_fingerprint, event_ts_ms)
  WHERE error_fingerprint IS NOT NULL;

-- v2：非账务但面向产品展示的宿主实时状态。不能塞进 usage_facts（不是用量），
-- 也不能继续由 UI 直接读宿主日志；payload 保留来源的完整、脱敏 JSON 形状。
CREATE TABLE host_runtime_snapshots (
  host TEXT NOT NULL,
  snapshot_kind TEXT NOT NULL,            -- 目前：codex_quota
  payload_json TEXT NOT NULL,
  observed_at_ms INTEGER NOT NULL,
  source_id TEXT REFERENCES source_files(source_id),
  ingested_run_id TEXT NOT NULL REFERENCES sync_runs(run_id),
  updated_at_ms INTEGER NOT NULL,
  PRIMARY KEY(host, snapshot_kind)
);
"#;

const MIGRATE_V1_TO_V2: &str = r#"
CREATE TABLE host_runtime_snapshots (
  host TEXT NOT NULL,
  snapshot_kind TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  observed_at_ms INTEGER NOT NULL,
  source_id TEXT REFERENCES source_files(source_id),
  ingested_run_id TEXT NOT NULL REFERENCES sync_runs(run_id),
  updated_at_ms INTEGER NOT NULL,
  PRIMARY KEY(host, snapshot_kind)
);
"#;

const SCHEMA_V3_ADD: &str = r#"
ALTER TABLE usage_facts ADD COLUMN provider_raw TEXT;
ALTER TABLE usage_facts ADD COLUMN billing_source TEXT;
ALTER TABLE usage_facts ADD COLUMN billing_mode TEXT;
ALTER TABLE usage_facts ADD COLUMN pricing_basis TEXT;
ALTER TABLE usage_facts ADD COLUMN evidence_basis TEXT;
ALTER TABLE usage_facts ADD COLUMN normalization_version TEXT;
ALTER TABLE usage_facts ADD COLUMN route_evidence_id TEXT;
ALTER TABLE usage_facts ADD COLUMN attribution_version TEXT;

CREATE TABLE route_evidence (
  evidence_id TEXT PRIMARY KEY,
  host TEXT NOT NULL,
  machine_namespace TEXT NOT NULL,
  native_session_id TEXT,
  provider_raw TEXT,
  endpoint_host TEXT,
  account_ref TEXT,
  plan_type TEXT,
  quota_window TEXT,
  evidence_basis TEXT NOT NULL,
  observed_at_ms INTEGER,
  source_id TEXT REFERENCES source_files(source_id),
  ingested_run_id TEXT NOT NULL REFERENCES sync_runs(run_id)
);
CREATE INDEX route_evidence_session ON route_evidence(host, machine_namespace, native_session_id);
CREATE TRIGGER usage_facts_route_evidence_insert_fk
BEFORE INSERT ON usage_facts
WHEN NEW.route_evidence_id IS NOT NULL
 AND NOT EXISTS (SELECT 1 FROM route_evidence WHERE evidence_id = NEW.route_evidence_id)
BEGIN
  SELECT RAISE(ABORT, 'usage_facts.route_evidence_id does not reference route_evidence');
END;
CREATE TRIGGER usage_facts_route_evidence_update_fk
BEFORE UPDATE OF route_evidence_id ON usage_facts
WHEN NEW.route_evidence_id IS NOT NULL
 AND NOT EXISTS (SELECT 1 FROM route_evidence WHERE evidence_id = NEW.route_evidence_id)
BEGIN
  SELECT RAISE(ABORT, 'usage_facts.route_evidence_id does not reference route_evidence');
END;

CREATE TABLE issue_instances (
  issue_id TEXT PRIMARY KEY,
  machine_namespace TEXT NOT NULL,
  host TEXT NOT NULL,
  session_key TEXT,
  issue_type TEXT NOT NULL,
  instance_fingerprint TEXT NOT NULL,
  status TEXT NOT NULL,
  severity TEXT NOT NULL,
  evaluator_id TEXT NOT NULL,
  evaluator_version TEXT NOT NULL,
  evidence_fingerprint TEXT NOT NULL,
  opened_at_ms INTEGER NOT NULL,
  closed_at_ms INTEGER,
  metadata_json TEXT NOT NULL,
  UNIQUE(machine_namespace, issue_type, instance_fingerprint)
);

CREATE TABLE issue_status_transitions (
  transition_id TEXT PRIMARY KEY,
  issue_id TEXT NOT NULL REFERENCES issue_instances(issue_id),
  from_status TEXT,
  to_status TEXT NOT NULL,
  transitioned_at_ms INTEGER NOT NULL,
  reason TEXT NOT NULL,
  actor TEXT NOT NULL,
  evidence_fingerprint TEXT NOT NULL,
  evaluator_id TEXT NOT NULL,
  evaluator_version TEXT NOT NULL,
  input_fingerprint TEXT NOT NULL,
  UNIQUE(issue_id, transition_id)
);
CREATE INDEX issue_transitions_issue_time ON issue_status_transitions(issue_id, transitioned_at_ms, transition_id);
"#;

// v0.12：计费合同、catalog 和金额测量都必须版本化。所有对历史 facts 的新
// 关联均可空：迁移绝不凭当前模板猜测旧 session 的合同。
const SCHEMA_V4_ADD: &str = r#"
ALTER TABLE usage_facts ADD COLUMN billing_template_id TEXT;
ALTER TABLE pricing_snapshots ADD COLUMN catalog_version TEXT;
ALTER TABLE pricing_snapshots ADD COLUMN billing_template_id TEXT;

CREATE TABLE provider_catalog_snapshots (
  catalog_version TEXT PRIMARY KEY,
  captured_at_ms INTEGER NOT NULL,
  source_kind TEXT NOT NULL,
  snapshot_id TEXT NOT NULL UNIQUE,
  payload_json TEXT NOT NULL
);

CREATE TABLE billing_templates (
  billing_template_id TEXT PRIMARY KEY,
  provider_id TEXT NOT NULL,
  account_ref TEXT,
  template_kind TEXT NOT NULL,
  pricing_source TEXT NOT NULL,
  effective_from_ms INTEGER NOT NULL,
  effective_to_ms INTEGER,
  created_at_ms INTEGER NOT NULL,
  CHECK (effective_to_ms IS NULL OR effective_to_ms >= effective_from_ms)
);
CREATE INDEX billing_templates_provider_window
  ON billing_templates(provider_id, account_ref, effective_from_ms, effective_to_ms);

CREATE TABLE billing_template_snapshots (
  snapshot_id TEXT PRIMARY KEY,
  billing_template_id TEXT NOT NULL REFERENCES billing_templates(billing_template_id),
  catalog_version TEXT REFERENCES provider_catalog_snapshots(catalog_version),
  captured_at_ms INTEGER NOT NULL,
  payload_json TEXT NOT NULL,
  UNIQUE(billing_template_id, catalog_version, snapshot_id)
);
CREATE INDEX billing_template_snapshots_template_time
  ON billing_template_snapshots(billing_template_id, captured_at_ms);

CREATE TABLE outcome_measurements (
  measurement_id TEXT PRIMARY KEY,
  fact_set_fingerprint TEXT NOT NULL,
  algorithm_version TEXT NOT NULL,
  basis TEXT NOT NULL,
  amount_minor INTEGER,
  currency TEXT,
  measured_at_ms INTEGER NOT NULL,
  payload_json TEXT NOT NULL,
  CHECK ((amount_minor IS NULL AND currency IS NULL) OR (amount_minor IS NOT NULL AND currency IS NOT NULL))
);

CREATE TABLE savings_records (
  savings_id TEXT PRIMARY KEY,
  measurement_id TEXT NOT NULL REFERENCES outcome_measurements(measurement_id),
  billing_template_snapshot_id TEXT REFERENCES billing_template_snapshots(snapshot_id),
  pricing_version TEXT REFERENCES pricing_snapshots(pricing_version),
  amount_minor INTEGER NOT NULL,
  currency TEXT NOT NULL,
  savings_basis TEXT NOT NULL,
  created_at_ms INTEGER NOT NULL,
  CHECK (savings_basis IN ('estimated', 'actual', 'realized'))
);
CREATE INDEX savings_records_measurement ON savings_records(measurement_id);

CREATE TRIGGER usage_facts_billing_template_insert_fk
BEFORE INSERT ON usage_facts
WHEN NEW.billing_template_id IS NOT NULL
 AND NOT EXISTS (SELECT 1 FROM billing_templates WHERE billing_template_id = NEW.billing_template_id)
BEGIN
  SELECT RAISE(ABORT, 'usage_facts.billing_template_id does not reference billing_templates');
END;
CREATE TRIGGER usage_facts_billing_template_update_fk
BEFORE UPDATE OF billing_template_id ON usage_facts
WHEN NEW.billing_template_id IS NOT NULL
 AND NOT EXISTS (SELECT 1 FROM billing_templates WHERE billing_template_id = NEW.billing_template_id)
BEGIN
  SELECT RAISE(ABORT, 'usage_facts.billing_template_id does not reference billing_templates');
END;
"#;

// `data_status` 的未决 provider 归因使用相关子查询。只索引未解决的问题，
// 使查询谓词命中索引，又不为历史审计记录增加索引成本。
const SCHEMA_V5_ADD: &str = r#"
CREATE INDEX IF NOT EXISTS data_quality_issues_open_code_scope
  ON data_quality_issues(code, scope_key)
  WHERE resolved_at_ms IS NULL;
"#;

// SQLite cannot add REFERENCES constraints to existing columns. These triggers
// make the nullable v0.12 provenance columns fail closed on every write.
const SCHEMA_V6_ADD: &str = r#"
CREATE TRIGGER pricing_snapshots_catalog_insert_fk
BEFORE INSERT ON pricing_snapshots
WHEN NEW.catalog_version IS NOT NULL
 AND NOT EXISTS (SELECT 1 FROM provider_catalog_snapshots WHERE catalog_version = NEW.catalog_version)
BEGIN
  SELECT RAISE(ABORT, 'pricing_snapshots.catalog_version does not reference provider_catalog_snapshots');
END;
CREATE TRIGGER pricing_snapshots_catalog_update_fk
BEFORE UPDATE OF catalog_version ON pricing_snapshots
WHEN NEW.catalog_version IS NOT NULL
 AND NOT EXISTS (SELECT 1 FROM provider_catalog_snapshots WHERE catalog_version = NEW.catalog_version)
BEGIN
  SELECT RAISE(ABORT, 'pricing_snapshots.catalog_version does not reference provider_catalog_snapshots');
END;
CREATE TRIGGER pricing_snapshots_template_insert_fk
BEFORE INSERT ON pricing_snapshots
WHEN NEW.billing_template_id IS NOT NULL
 AND NOT EXISTS (SELECT 1 FROM billing_templates WHERE billing_template_id = NEW.billing_template_id)
BEGIN
  SELECT RAISE(ABORT, 'pricing_snapshots.billing_template_id does not reference billing_templates');
END;
CREATE TRIGGER pricing_snapshots_template_update_fk
BEFORE UPDATE OF billing_template_id ON pricing_snapshots
WHEN NEW.billing_template_id IS NOT NULL
 AND NOT EXISTS (SELECT 1 FROM billing_templates WHERE billing_template_id = NEW.billing_template_id)
BEGIN
  SELECT RAISE(ABORT, 'pricing_snapshots.billing_template_id does not reference billing_templates');
END;
"#;

/// 增量 7.5：v1 base 表之上的 4 个脱敏只读 view。`CREATE VIEW IF NOT EXISTS`
/// 幂等——在 `ensure_schema` 的「version == SCHEMA_VERSION」分支上执行。
/// **不**进 `SCHEMA_V1` 主 DDL，避免『v1 库必须重跑 SCHEMA_V1 才能拿 view』
/// 这种不必要的迁移负担。
const VIEWS_V1: &str = r#"
CREATE VIEW IF NOT EXISTS v_facts_safe AS
  SELECT fact_id, host, observation_kind, source_profile,
         provider_id, provider_raw, billing_source, billing_mode,
         pricing_basis, evidence_basis, normalization_version,
         route_evidence_id, attribution_version,
         model_id, event_ts_ms, event_peak,
         uncached_input_tokens, cache_read_tokens,
         cache_write_tokens, output_tokens,
         ingested_run_id, created_at_ms, updated_at_ms, deleted_at_ms
  FROM usage_facts;
CREATE VIEW IF NOT EXISTS v_sessions_safe AS
  SELECT session_key, host, source_profile,
         started_at_ms, ended_at_ms, last_observed_at_ms, deleted_at_ms
  FROM sessions;
CREATE VIEW IF NOT EXISTS v_data_quality_safe AS
  SELECT issue_id, scope_type, scope_key, code, severity,
         first_seen_at_ms, last_seen_at_ms, resolved_at_ms
  FROM data_quality_issues;
CREATE VIEW IF NOT EXISTS v_sync_runs_safe AS
  SELECT run_id, started_at_ms, completed_at_ms, trigger, status,
         schema_version, error_code
  FROM sync_runs;
"#;

/// v0.9.1 Phase 3.4：`budget_config` 单行（config_id=1）的 typed 视图。
/// 金额一律**最小货币单位整数**（纪律 2「金额不落浮点」——展示层再换算）；
/// `warning_ratio_bp` 是万分比（8000 = 80%，seed 时由 config.toml 的
/// `warn_at_ratio: 0.8` × 10000 得来）。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct BudgetConfig {
    pub monthly_cny_minor: i64,
    pub daily_cny_minor: i64,
    pub warning_ratio_bp: i64,
    pub updated_at_ms: i64,
}

/// 权威库连接。**非 Sync**（rusqlite `Connection` 语义同旧 store）；每线程
/// 自开。open 时：`foreign_keys=ON`（spec §3 前言）+ WAL + `busy_timeout`
/// + DDL 版本闸 + 中断批次清扫（§3.1）。
#[derive(Debug)]
pub struct AuthorityDb {
    conn: Connection,
}

impl AuthorityDb {
    /// 打开（不存在则建库 + 全量 DDL）。**损坏不自愈**——`Corrupt` 上抛，
    /// 恢复路径在模块头。
    pub fn open(db_path: &Path, now_ms: i64) -> Result<Self, AuthorityError> {
        if let Some(dir) = db_path.parent() {
            std::fs::create_dir_all(dir).map_err(AuthorityError::Io)?;
        }
        let conn = Connection::open(db_path)?;
        // 损坏库在第一个语句就会炸——先探一下（PRAGMA 是最便宜的语句），
        // 把 sqlite 的 "not a database"/"malformed" 归为 Corrupt 语义由调用
        // 方走恢复流程，而不是当成普通 Sqlite 错误继续写。
        // busy_timeout 必须先于 journal_mode：WAL 切换本身要拿锁——并发
        // open（托盘 tick + CLI）时先设 journal_mode 会直接 BUSY 报错
        // （审查 P1-1 的触发面之一）。
        conn.busy_timeout(std::time::Duration::from_millis(5_000))?;
        conn.pragma_update(None, "journal_mode", "WAL")?;
        conn.pragma_update(None, "foreign_keys", "ON")?;
        Self::ensure_schema(&conn, now_ms)?;
        Ok(Self { conn })
    }

    /// **只读取数面**（Data MCP `data-mcp serve`，spec §9.3）：`SQLITE_OPEN_READ_ONLY`——
    /// 不建库、不跑 DDL、不 migration、不清扫中断批次。缺文件 / 损坏 / schema
    /// 版本不符各返回 typed 错误，供调用方映射成 spec §11 的稳定错误码
    /// （`database_missing` / `database_unreadable` / `schema_too_new` /
    /// `schema_migration_required`）。
    ///
    /// 与 [`Self::open`] 的「不存在则建库」刻意相反：只读消费者遇到缺库/损坏
    /// 必须如实报错——在 `sql_authority_enabled` 下，一个被悄悄新建的空库
    /// 端出 facts=0 会被读成「没花钱」（spec §5.3 / 1.7 的灾难态）。
    pub fn open_readonly(db_path: &Path) -> Result<Self, AuthorityError> {
        if !db_path.exists() {
            return Err(AuthorityError::MissingFile);
        }
        let conn = Connection::open_with_flags(
            db_path,
            OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_URI,
        )
        .map_err(|_| AuthorityError::Corrupt)?;
        conn.busy_timeout(std::time::Duration::from_millis(5_000))?;
        // 损坏 / 非 SQLite / 半建库探测：`schema_meta` 读不出就不是我们的库。
        // （`PRAGMA integrity_check` 更彻底但慢——留给 `data_status` 自己跑，
        // 它是 doctor 工具，其余工具在这一步 fail-fast 即可。）
        let found: i64 = match conn.query_row(
            "SELECT value FROM schema_meta WHERE key = 'schema_version'",
            [],
            |r| r.get::<_, String>(0),
        ) {
            Ok(s) => s.parse().map_err(|_| AuthorityError::Corrupt)?,
            Err(_) => return Err(AuthorityError::Corrupt),
        };
        match found.cmp(&SCHEMA_VERSION) {
            std::cmp::Ordering::Equal => Ok(Self { conn }),
            std::cmp::Ordering::Greater => Err(AuthorityError::NewerSchema {
                found,
                supported: SCHEMA_VERSION,
            }),
            std::cmp::Ordering::Less => Err(AuthorityError::OlderSchema { found }),
        }
    }

    /// **只读 + authorizer 守护的连接**（增量 7.5 `query_sql_readonly` 专用）——
    /// `SQLITE_OPEN_READ_ONLY` + 挂 SQLite `sqlite3_set_authorizer` 回调，按
    /// 来源表 + 来源列拒绝敏感字段（spec §8.2 P1-5：作者层拒绝是第一层防线，
    /// 结果列名扫描仅第二层）。
    ///
    /// **不在 v1 兼容承诺内**：仅 `mcp-internal` 构建调用；公开构建不挂这个
    /// 工具。Caller 必须在执行前/后 close this connection。
    pub fn make_query_sql_readonly_connection(
        db_path: &Path,
    ) -> Result<Connection, AuthorityError> {
        if !db_path.exists() {
            return Err(AuthorityError::MissingFile);
        }
        let conn = Connection::open_with_flags(
            db_path,
            OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_URI,
        )
        .map_err(|_| AuthorityError::Corrupt)?;
        conn.busy_timeout(std::time::Duration::from_millis(3_000))?;
        // 用 raw connection 挂 authorizer——`rusqlite::Connection::authorizer`
        // 接受 `FnMut(AuthContext) -> Authorization + Send + RefUnwindSafe + 'static`。
        conn.authorizer(Some(authority_callback));
        Ok(conn)
    }

    fn ensure_schema(conn: &Connection, now_ms: i64) -> Result<(), AuthorityError> {
        // 版本行在 SCHEMA_V1 里随全量 DDL 一起建——这里只**读**：schema_meta
        // 表不存在 = 全新库（None）。不能先无条件建表再跑全量 DDL（后者会
        // 撞 already exists）。
        let meta_exists: bool = conn
            .query_row(
                "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'schema_meta'",
                [],
                |_| Ok(true),
            )
            .unwrap_or(false);
        let version: Option<i64> = if meta_exists {
            conn.query_row(
                "SELECT value FROM schema_meta WHERE key = 'schema_version'",
                [],
                |r| r.get::<_, String>(0),
            )
            .ok()
            .and_then(|v| v.parse().ok())
        } else {
            None
        };
        match version {
            Some(v) if v > SCHEMA_VERSION => {
                return Err(AuthorityError::NewerSchema {
                    found: v,
                    supported: SCHEMA_VERSION,
                })
            }
            Some(v) if v == SCHEMA_VERSION => {
                // 增量 7.5：脱敏只读 view（`query_sql_readonly` 的来源层屏障）。
                // 版本无关的只读加法——`CREATE VIEW IF NOT EXISTS` 幂等。
                conn.execute_batch("DROP VIEW IF EXISTS v_facts_safe;")?;
                conn.execute_batch(VIEWS_V1)?;
            }
            Some(5) => {
                conn.execute_batch("BEGIN IMMEDIATE")?;
                let migration = conn.execute_batch(SCHEMA_V6_ADD);
                match migration {
                    Ok(()) => {
                        conn.execute(
                            "UPDATE schema_meta SET value = ?1 WHERE key = 'schema_version'",
                            rusqlite::params![SCHEMA_VERSION.to_string()],
                        )?;
                        conn.execute_batch("COMMIT")?;
                    }
                    Err(error) => {
                        let _ = conn.execute_batch("ROLLBACK");
                        return Err(error.into());
                    }
                }
                conn.execute_batch("DROP VIEW IF EXISTS v_facts_safe;")?;
                conn.execute_batch(VIEWS_V1)?;
            }
            Some(4) => {
                conn.execute_batch("BEGIN IMMEDIATE")?;
                let migration = conn.execute_batch(SCHEMA_V5_ADD).and_then(|()| conn.execute_batch(SCHEMA_V6_ADD));
                match migration {
                    Ok(()) => {
                        conn.execute("UPDATE schema_meta SET value = ?1 WHERE key = 'schema_version'", rusqlite::params![SCHEMA_VERSION.to_string()])?;
                        conn.execute_batch("COMMIT")?;
                    }
                    Err(error) => { let _ = conn.execute_batch("ROLLBACK"); return Err(error.into()); }
                }
                conn.execute_batch("DROP VIEW IF EXISTS v_facts_safe;")?;
                conn.execute_batch(VIEWS_V1)?;
            }
            Some(3) => {
                conn.execute_batch("BEGIN IMMEDIATE")?;
                let migration = conn.execute_batch(SCHEMA_V4_ADD);
                match migration {
                    Ok(()) => {
                        if let Err(error) = conn.execute_batch(SCHEMA_V5_ADD) {
                            let _ = conn.execute_batch("ROLLBACK");
                            return Err(error.into());
                        }
                        if let Err(error) = conn.execute_batch(SCHEMA_V6_ADD) {
                            let _ = conn.execute_batch("ROLLBACK");
                            return Err(error.into());
                        }
                        conn.execute(
                            "UPDATE schema_meta SET value = ?1 WHERE key = 'schema_version'",
                            rusqlite::params![SCHEMA_VERSION.to_string()],
                        )?;
                        conn.execute_batch("COMMIT")?;
                    }
                    Err(error) => {
                        let _ = conn.execute_batch("ROLLBACK");
                        return Err(error.into());
                    }
                }
                conn.execute_batch("DROP VIEW IF EXISTS v_facts_safe;")?;
                conn.execute_batch(VIEWS_V1)?;
            }
            Some(2) => {
                conn.execute_batch("BEGIN IMMEDIATE")?;
                let migration = conn.execute_batch(SCHEMA_V3_ADD);
                match migration {
                    Ok(()) => {
                        if let Err(error) = conn.execute_batch(SCHEMA_V4_ADD) {
                            let _ = conn.execute_batch("ROLLBACK");
                            return Err(error.into());
                        }
                        if let Err(error) = conn.execute_batch(SCHEMA_V5_ADD) {
                            let _ = conn.execute_batch("ROLLBACK");
                            return Err(error.into());
                        }
                        if let Err(error) = conn.execute_batch(SCHEMA_V6_ADD) {
                            let _ = conn.execute_batch("ROLLBACK");
                            return Err(error.into());
                        }
                        conn.execute(
                            "UPDATE schema_meta SET value = ?1 WHERE key = 'schema_version'",
                            rusqlite::params![SCHEMA_VERSION.to_string()],
                        )?;
                        conn.execute_batch("COMMIT")?;
                    }
                    Err(error) => {
                        let _ = conn.execute_batch("ROLLBACK");
                        return Err(error.into());
                    }
                }
                conn.execute_batch("DROP VIEW IF EXISTS v_facts_safe;")?;
                conn.execute_batch(VIEWS_V1)?;
            }
            Some(1) => {
                conn.execute_batch("BEGIN IMMEDIATE")?;
                let migration = conn.execute_batch(MIGRATE_V1_TO_V2);
                match migration {
                    Ok(()) => {
                        if let Err(error) = conn.execute_batch(SCHEMA_V3_ADD) {
                            let _ = conn.execute_batch("ROLLBACK");
                            return Err(error.into());
                        }
                        if let Err(error) = conn.execute_batch(SCHEMA_V4_ADD) {
                            let _ = conn.execute_batch("ROLLBACK");
                            return Err(error.into());
                        }
                        if let Err(error) = conn.execute_batch(SCHEMA_V5_ADD) {
                            let _ = conn.execute_batch("ROLLBACK");
                            return Err(error.into());
                        }
                        if let Err(error) = conn.execute_batch(SCHEMA_V6_ADD) {
                            let _ = conn.execute_batch("ROLLBACK");
                            return Err(error.into());
                        }
                        conn.execute(
                            "UPDATE schema_meta SET value = ?1 WHERE key = 'schema_version'",
                            rusqlite::params![SCHEMA_VERSION.to_string()],
                        )?;
                        conn.execute_batch("COMMIT")?;
                    }
                    Err(error) => {
                        let _ = conn.execute_batch("ROLLBACK");
                        return Err(error.into());
                    }
                }
                conn.execute_batch(VIEWS_V1)?;
            }
            Some(old) => {
                return Err(AuthorityError::Sqlite(
                    rusqlite::Error::InvalidParameterName(format!(
                        "__unsupported_legacy_version__:{old}"
                    )),
                ));
            }
            None => {
                // 空库：若已有业务表（无版本行的半建库——创建中断残留），
                // 视为损坏：建库流程必须事务化完成，半建状态不可信。
                let has_tables: bool = conn
                    .query_row(
                        "SELECT 1 FROM sqlite_master WHERE type = 'table'
                         AND name IN ('usage_facts','sync_runs','sessions')",
                        [],
                        |_| Ok(true),
                    )
                    .unwrap_or(false);
                if has_tables {
                    return Err(AuthorityError::Sqlite(
                        rusqlite::Error::InvalidParameterName(
                            "__corrupt_partial_schema__".to_string(),
                        ),
                    ));
                }
                conn.execute_batch("BEGIN IMMEDIATE")?;
                conn.execute_batch(SCHEMA_V1)?;
                conn.execute_batch(SCHEMA_V3_ADD)?;
                conn.execute_batch(SCHEMA_V4_ADD)?;
                conn.execute_batch(SCHEMA_V5_ADD)?;
                conn.execute_batch(SCHEMA_V6_ADD)?;
                // 增量 7.5：新建库时同步加 4 个脱敏只读 view（spec §8.2 P1-5）。
                conn.execute_batch(VIEWS_V1)?;
                conn.execute(
                    "INSERT INTO schema_meta(key, value) VALUES('schema_version', ?1)",
                    rusqlite::params![SCHEMA_VERSION.to_string()],
                )?;
                conn.execute_batch("COMMIT")?;
                let _ = now_ms; // v1 建库本身不写业务时间戳（版本行是元数据）
            }
        }
        // 中断批次清扫（§3.1）：任何 running 的批次在下次 open 时标
        // interrupted——它是观测记录，不是可恢复状态（恢复靠幂等重跑）。
        conn.execute(
            "UPDATE sync_runs SET status = 'cancelled',
                 error_code = COALESCE(error_code, 'interrupted'),
                 completed_at_ms = COALESCE(completed_at_ms, ?1)
             WHERE status = 'running'",
            rusqlite::params![now_ms],
        )?;
        Ok(())
    }

    /// 开启一个同步批次（§3.1 sync_runs）。`run_id` 由调用方生成（幂等重跑
    /// 用同一 id 时是「重跑恢复」语义，不是新批次）。
    pub fn begin_run(
        &self,
        run_id: &str,
        trigger: &str,
        now_ms: i64,
    ) -> Result<(), AuthorityError> {
        self.conn.execute(
            "INSERT INTO sync_runs(run_id, started_at_ms, trigger, status, schema_version)
             VALUES (?1, ?2, ?3, 'running', ?4)
             ON CONFLICT(run_id) DO UPDATE SET
                 started_at_ms = excluded.started_at_ms,
                 status = 'running',
                 error_code = NULL,
                 error_detail = NULL",
            rusqlite::params![run_id, now_ms, trigger, SCHEMA_VERSION],
        )?;
        Ok(())
    }

    /// 结束批次。status ∈ succeeded | failed | cancelled（§3.1 词表）。
    pub fn finish_run(
        &self,
        run_id: &str,
        status: &str,
        error_code: Option<&str>,
        error_detail: Option<&str>,
        now_ms: i64,
    ) -> Result<(), AuthorityError> {
        self.conn.execute(
            "UPDATE sync_runs SET status = ?2, completed_at_ms = ?3,
                 error_code = ?4, error_detail = ?5
             WHERE run_id = ?1",
            rusqlite::params![run_id, status, now_ms, error_code, error_detail],
        )?;
        Ok(())
    }

    /// 保留滚动（spec §5.4）：物理清理 13 个自然月前的 usage_facts 行。
    /// `cutoff_iso_prefix` = "YYYY-MM"（event_ts_ms 由调用方换成 ISO 前缀
    /// 比较不便——这里直接收 UTC 毫秒下界 `cutoff_ms`：event_ts_ms < cutoff
    /// 的行删除）。无日期（event_ts_ms NULL）与 deleted 行的清理走显式
    /// 修复流程（spec §5.4「不能静默删除」），本函数不碰。
    pub fn retention_usage_facts(&self, cutoff_ms: i64) -> Result<usize, AuthorityError> {
        Ok(self.conn.execute(
            "DELETE FROM usage_facts WHERE event_ts_ms IS NOT NULL AND event_ts_ms < ?1",
            rusqlite::params![cutoff_ms],
        )?)
    }

    // ─────── v0.9.1 Phase 3.4：budget_config / budget_snoozes 显式管理 API
    // （spec §5.3「账单和预算配置为显式管理 API」；单行表 config_id/snooze_id
    // 恒 1，upsert 语义）。金额全是 minor 整数；判断在消费方，全整数比较。

    /// 读预算配置。None = 从未配置（消费方决定回落默认或报 no_budget）。
    pub fn budget_config_get(&self) -> Result<Option<BudgetConfig>, AuthorityError> {
        let r = self.conn.query_row(
            "SELECT monthly_cny_minor, daily_cny_minor, warning_ratio_bp, updated_at_ms
             FROM budget_config WHERE config_id = 1",
            [],
            |r| {
                Ok(BudgetConfig {
                    monthly_cny_minor: r.get(0)?,
                    daily_cny_minor: r.get(1)?,
                    warning_ratio_bp: r.get(2)?,
                    updated_at_ms: r.get(3)?,
                })
            },
        );
        match r {
            Ok(c) => Ok(Some(c)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(e.into()),
        }
    }

    /// 写预算配置（单行 upsert）。`updated_at_ms` 由调用方注入（时钟纪律）。
    pub fn budget_config_set(
        &self,
        monthly_cny_minor: i64,
        daily_cny_minor: i64,
        warning_ratio_bp: i64,
        now_ms: i64,
    ) -> Result<(), AuthorityError> {
        self.conn.execute(
            "INSERT INTO budget_config(config_id, monthly_cny_minor, daily_cny_minor,
                 warning_ratio_bp, updated_at_ms)
             VALUES (1, ?1, ?2, ?3, ?4)
             ON CONFLICT(config_id) DO UPDATE SET
                 monthly_cny_minor = excluded.monthly_cny_minor,
                 daily_cny_minor = excluded.daily_cny_minor,
                 warning_ratio_bp = excluded.warning_ratio_bp,
                 updated_at_ms = excluded.updated_at_ms",
            rusqlite::params![monthly_cny_minor, daily_cny_minor, warning_ratio_bp, now_ms],
        )?;
        Ok(())
    }

    /// 读 snooze（`until_ms`）。None = 从未设置；已过期的不清除（判断在
    /// 消费方——「过期自动失效」与 Python 链 `now >= until` 同语义），返回
    /// 原值让消费方比较，避免这里读时钟。
    pub fn budget_snooze_get(&self) -> Result<Option<i64>, AuthorityError> {
        self.conn
            .query_row(
                "SELECT until_ms FROM budget_snoozes WHERE snooze_id = 1",
                [],
                |r| r.get(0),
            )
            .map(Some)
            .or_else(|e| match e {
                rusqlite::Error::QueryReturnedNoRows => Ok(None),
                other => Err(other.into()),
            })
    }

    /// 写 snooze（单行 upsert）。`until_ms` = 毫秒时间戳（调用方由 ISO 解析）。
    pub fn budget_snooze_set(&self, until_ms: i64, now_ms: i64) -> Result<(), AuthorityError> {
        self.conn.execute(
            "INSERT INTO budget_snoozes(snooze_id, until_ms, updated_at_ms)
             VALUES (1, ?1, ?2)
             ON CONFLICT(snooze_id) DO UPDATE SET
                 until_ms = excluded.until_ms, updated_at_ms = excluded.updated_at_ms",
            rusqlite::params![until_ms, now_ms],
        )?;
        Ok(())
    }

    /// 清除 snooze（物理删单行——「撤销」不是「设为过去」，删了就是干净状态）。
    pub fn budget_snooze_clear(&self) -> Result<(), AuthorityError> {
        self.conn
            .execute("DELETE FROM budget_snoozes WHERE snooze_id = 1", [])?;
        Ok(())
    }

    // ─────── v0.9.1 Phase 2.8：pricing_snapshots（spec §5.3 价格快照）───────
    // 历史查询以记录的 pricing version 重放，不能用当前价卡覆盖历史解释
    // （§5.3）。一个 version 的内容不可变：`pricing_version` 是 payload 的
    // 内容指纹，同指纹 = 同 payload = 幂等吸收（DO NOTHING）。

    /// 落一份价格快照。`pricing_version` 由调用方按 payload 内容派生
    /// （`fnv1a64_hex(canonical_json)`）。已存在 → DO NOTHING（内容不可变）。
    pub fn pricing_snapshot_put(
        &self,
        pricing_version: &str,
        source_kind: &str,
        payload_json: &str,
        captured_at_ms: i64,
    ) -> Result<bool, AuthorityError> {
        let changed = self.conn.execute(
            "INSERT INTO pricing_snapshots(pricing_version, captured_at_ms, source_kind, payload_json)
             VALUES (?1, ?2, ?3, ?4)
             ON CONFLICT(pricing_version) DO NOTHING",
            rusqlite::params![pricing_version, captured_at_ms, source_kind, payload_json],
        )?;
        Ok(changed > 0)
    }

    /// 某 version 的 payload（历史重放入口）。
    pub fn pricing_snapshot_get(
        &self,
        pricing_version: &str,
    ) -> Result<Option<String>, AuthorityError> {
        Ok(self
            .conn
            .query_row(
                "SELECT payload_json FROM pricing_snapshots WHERE pricing_version = ?1",
                rusqlite::params![pricing_version],
                |r| r.get::<_, String>(0),
            )
            .optional()?)
    }

    /// `captured_at_ms` 最新的快照 `(version, captured_at_ms)`，或 None（从未落）。
    pub fn pricing_snapshot_latest(&self) -> Result<Option<(String, i64)>, AuthorityError> {
        Ok(self
            .conn
            .query_row(
                "SELECT pricing_version, captured_at_ms FROM pricing_snapshots
                 ORDER BY captured_at_ms DESC, pricing_version DESC LIMIT 1",
                [],
                |r| Ok((r.get::<_, String>(0)?, r.get::<_, i64>(1)?)),
            )
            .optional()?)
    }

    /// `captured_at_ms <= at_ms` 里最新的一份——「按事件时间点选价卡版本」
    /// （Q13：调价日前后分别用正确版本）。没有更早的快照 → None（不拿更晚的
    /// 版本冒充历史）。
    pub fn pricing_snapshot_asof(&self, at_ms: i64) -> Result<Option<String>, AuthorityError> {
        Ok(self
            .conn
            .query_row(
                "SELECT payload_json FROM pricing_snapshots
                 WHERE captured_at_ms <= ?1
                 ORDER BY captured_at_ms DESC, pricing_version DESC LIMIT 1",
                rusqlite::params![at_ms],
                |r| r.get::<_, String>(0),
            )
            .optional()?)
    }

    pub fn pricing_snapshot_count(&self) -> Result<i64, AuthorityError> {
        Ok(self
            .conn
            .query_row("SELECT COUNT(*) FROM pricing_snapshots", [], |r| r.get(0))?)
    }

    // ─────── v0.12：billing catalog/template snapshots ────────────────────

    /// 写入 catalog 快照。`catalog_version` 和 `snapshot_id` 都是不可变身份；
    /// 相同 version 的不同 payload 是调用方错误，不能静默改写历史计费解释。
    pub fn provider_catalog_snapshot_put(
        &self,
        catalog_version: &str,
        snapshot_id: &str,
        source_kind: &str,
        payload_json: &str,
        captured_at_ms: i64,
    ) -> Result<bool, AuthorityError> {
        if catalog_version.is_empty() || snapshot_id.is_empty() || source_kind.is_empty() {
            return Err(rusqlite::Error::InvalidParameterName(
                "catalog_version, snapshot_id, and source_kind are required".to_string(),
            )
            .into());
        }
        let existing: Option<(String, String)> = self.conn.query_row(
            "SELECT snapshot_id, payload_json FROM provider_catalog_snapshots WHERE catalog_version = ?1",
            rusqlite::params![catalog_version],
            |r| Ok((r.get(0)?, r.get(1)?)),
        ).optional()?;
        if let Some((existing_id, existing_payload)) = existing {
            if existing_id == snapshot_id && existing_payload == payload_json {
                return Ok(false);
            }
            return Err(rusqlite::Error::InvalidParameterName(
                "catalog_version already names a different immutable snapshot".to_string(),
            ).into());
        }
        self.conn.execute(
            "INSERT INTO provider_catalog_snapshots(
               catalog_version, captured_at_ms, source_kind, snapshot_id, payload_json)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            rusqlite::params![catalog_version, captured_at_ms, source_kind, snapshot_id, payload_json],
        )?;
        Ok(true)
    }

    /// 落入一个模板定义。更新合同必须使用新的 template id；这里不接受覆盖。
    #[allow(clippy::too_many_arguments)]
    pub fn billing_template_put(
        &self,
        billing_template_id: &str,
        provider_id: &str,
        account_ref: Option<&str>,
        template_kind: &str,
        pricing_source: &str,
        effective_from_ms: i64,
        effective_to_ms: Option<i64>,
        created_at_ms: i64,
    ) -> Result<bool, AuthorityError> {
        if billing_template_id.is_empty() || provider_id.is_empty()
            || BillingTemplateKind::parse(template_kind).is_none()
            || PricingSource::parse(pricing_source).is_none()
            || effective_to_ms.is_some_and(|end| end < effective_from_ms) {
            return Err(rusqlite::Error::InvalidParameterName(
                "invalid immutable billing template".to_string(),
            ).into());
        }
        let existing: Option<BillingTemplateRow> = self.conn.query_row(
            "SELECT provider_id, account_ref, template_kind, pricing_source, effective_from_ms, effective_to_ms
             FROM billing_templates WHERE billing_template_id = ?1",
            rusqlite::params![billing_template_id],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?, r.get(5)?)),
        ).optional()?;
        if let Some(existing) = existing {
            let expected = (provider_id.to_string(), account_ref.map(str::to_string),
                template_kind.to_string(), pricing_source.to_string(), effective_from_ms, effective_to_ms);
            if existing == expected {
                return Ok(false);
            }
            return Err(rusqlite::Error::InvalidParameterName(
                "billing_template_id already names a different immutable template".to_string(),
            ).into());
        }
        let changed = self.conn.execute(
            "INSERT INTO billing_templates(
               billing_template_id, provider_id, account_ref, template_kind, pricing_source,
               effective_from_ms, effective_to_ms, created_at_ms)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
             ON CONFLICT(billing_template_id) DO NOTHING",
            rusqlite::params![billing_template_id, provider_id, account_ref, template_kind,
                pricing_source, effective_from_ms, effective_to_ms, created_at_ms],
        )?;
        Ok(changed > 0)
    }

    /// 保存模板在一个 catalog 版本下的冻结形态，供历史金额重放使用。
    pub fn billing_template_snapshot_put(
        &self,
        snapshot_id: &str,
        billing_template_id: &str,
        catalog_version: Option<&str>,
        payload_json: &str,
        captured_at_ms: i64,
    ) -> Result<bool, AuthorityError> {
        if snapshot_id.is_empty() || billing_template_id.is_empty() || payload_json.is_empty() {
            return Err(rusqlite::Error::InvalidParameterName(
                "template snapshot id, template id, and payload are required".to_string(),
            ).into());
        }
        let existing: Option<(String, Option<String>, String)> = self.conn.query_row(
            "SELECT billing_template_id, catalog_version, payload_json
             FROM billing_template_snapshots WHERE snapshot_id = ?1",
            rusqlite::params![snapshot_id],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
        ).optional()?;
        if let Some(existing) = existing {
            let expected = (billing_template_id.to_string(), catalog_version.map(str::to_string), payload_json.to_string());
            if existing == expected {
                return Ok(false);
            }
            return Err(rusqlite::Error::InvalidParameterName(
                "snapshot_id already names a different immutable template snapshot".to_string(),
            ).into());
        }
        let changed = self.conn.execute(
            "INSERT INTO billing_template_snapshots(
               snapshot_id, billing_template_id, catalog_version, captured_at_ms, payload_json)
             VALUES (?1, ?2, ?3, ?4, ?5)
             ON CONFLICT(snapshot_id) DO NOTHING",
            rusqlite::params![snapshot_id, billing_template_id, catalog_version, captured_at_ms, payload_json],
        )?;
        Ok(changed > 0)
    }

    /// 写入一份可复算的 outcome measurement。相同 ID 只能重放完全相同的
    /// 证据，不允许以新算法或新金额覆盖历史 measurement。
    #[allow(clippy::too_many_arguments)]
    pub fn outcome_measurement_put(
        &self,
        measurement_id: &str,
        fact_set_fingerprint: &str,
        algorithm_version: &str,
        basis: &str,
        amount_minor: Option<i64>,
        currency: Option<&str>,
        measured_at_ms: i64,
        payload_json: &str,
    ) -> Result<bool, AuthorityError> {
        if measurement_id.is_empty() || fact_set_fingerprint.is_empty() || algorithm_version.is_empty()
            || !matches!(basis, "estimated" | "actual" | "realized")
            || amount_minor.is_some_and(|amount| amount < 0)
            || (amount_minor.is_some() != currency.is_some())
            || currency.is_some_and(str::is_empty) || payload_json.is_empty() {
            return Err(rusqlite::Error::InvalidParameterName(
                "invalid outcome measurement".to_string(),
            ).into());
        }
        let existing: Option<OutcomeMeasurementRow> = self.conn.query_row(
            "SELECT fact_set_fingerprint, algorithm_version, basis, amount_minor, currency, payload_json
             FROM outcome_measurements WHERE measurement_id = ?1",
            rusqlite::params![measurement_id],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?, r.get(5)?)),
        ).optional()?;
        if let Some(existing) = existing {
            let expected = (fact_set_fingerprint.to_string(), algorithm_version.to_string(), basis.to_string(),
                amount_minor, currency.map(str::to_string), payload_json.to_string());
            if existing == expected {
                return Ok(false);
            }
            return Err(rusqlite::Error::InvalidParameterName(
                "measurement_id already names a different immutable outcome".to_string(),
            ).into());
        }
        let changed = self.conn.execute(
            "INSERT INTO outcome_measurements(
               measurement_id, fact_set_fingerprint, algorithm_version, basis, amount_minor,
               currency, measured_at_ms, payload_json)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            rusqlite::params![measurement_id, fact_set_fingerprint, algorithm_version, basis,
                amount_minor, currency, measured_at_ms, payload_json],
        )?;
        Ok(changed > 0)
    }

    /// 写入 Savings 记录。estimated 永远不能被写作 actual/realized；后两者
    /// 必须引用同口径 measurement，防止 API 价差伪装成已实现节省。
    #[allow(clippy::too_many_arguments)]
    pub fn savings_record_put(
        &self,
        savings_id: &str,
        measurement_id: &str,
        billing_template_snapshot_id: Option<&str>,
        pricing_version: Option<&str>,
        amount_minor: i64,
        currency: &str,
        savings_basis: &str,
        created_at_ms: i64,
    ) -> Result<bool, AuthorityError> {
        if savings_id.is_empty() || measurement_id.is_empty() || amount_minor < 0 || currency.is_empty()
            || !matches!(savings_basis, "estimated" | "actual" | "realized") {
            return Err(rusqlite::Error::InvalidParameterName("invalid savings record".to_string()).into());
        }
        let measurement_basis: Option<String> = self.conn.query_row(
            "SELECT basis FROM outcome_measurements WHERE measurement_id = ?1",
            rusqlite::params![measurement_id], |r| r.get(0),
        ).optional()?;
        let Some(measurement_basis) = measurement_basis else {
            return Err(rusqlite::Error::InvalidParameterName("savings measurement does not exist".to_string()).into());
        };
        if savings_basis != "estimated" && measurement_basis != savings_basis {
            return Err(rusqlite::Error::InvalidParameterName(
                "actual or realized savings require an equally evidenced measurement".to_string(),
            ).into());
        }
        let existing = self.conn.query_row(
            "SELECT measurement_id, billing_template_snapshot_id, pricing_version,
                    amount_minor, currency, savings_basis
             FROM savings_records WHERE savings_id = ?1",
            rusqlite::params![savings_id],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?, r.get(5)?)),
        ).optional()?;
        if let Some(existing) = existing {
            let incoming = (measurement_id.to_string(), billing_template_snapshot_id.map(str::to_string),
                pricing_version.map(str::to_string), amount_minor, currency.to_string(), savings_basis.to_string());
            if existing == incoming {
                return Ok(false);
            }
            return Err(rusqlite::Error::InvalidParameterName(
                "savings_id already names a different immutable savings record".to_string(),
            ).into());
        }
        let changed = self.conn.execute(
            "INSERT INTO savings_records(
               savings_id, measurement_id, billing_template_snapshot_id, pricing_version,
               amount_minor, currency, savings_basis, created_at_ms)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
             ON CONFLICT(savings_id) DO NOTHING",
            rusqlite::params![savings_id, measurement_id, billing_template_snapshot_id,
                pricing_version, amount_minor, currency, savings_basis, created_at_ms],
        )?;
        Ok(changed > 0)
    }

    // ─────── v0.9.1 Phase 2.8：host_bills（spec §5.3 显式管理 API）───────
    // 宿主自身账单（WorkBuddy 积分、订阅月费、中转对账单…）——**不是**从我们
    // 的价卡派生，由用户显式录入，更新必须验证币种/账期/金额范围（§5.3）。

    /// 录一条宿主账单。`bill_id` = `{host}:{provider}:{period}:{basis}:{evidence_ref}`
    /// 的稳定构造（调用方给），同键 upsert（更正金额）。`amount_minor` 最小
    /// 货币单位整数（¥1.00 = 100）。校验：period `YYYY-MM`、basis 五档之一、
    /// amount_minor ≥ 0、currency 非空——不合格 `Err`（不猜不默认）。
    ///
    /// `evidence_ref` 是 `&str` 而不是 `Option`——空串就是"没有凭证引用"，**绝不存
    /// NULL**：SQLite 的 UNIQUE 里 NULL 互不相等，NULL 的 evidence_ref 会让
    /// `ON CONFLICT` 落空、同一 bill_id 第二次录入撞 PRIMARY KEY 报错而不是 upsert
    /// （`bill_id` 构造里的 `{evidence_ref}` 段同样是空串，两侧对齐）。
    #[allow(clippy::too_many_arguments)]
    pub fn host_bill_put(
        &self,
        bill_id: &str,
        host: &str,
        provider_id: &str,
        billing_period: &str,
        billing_basis: &str,
        amount_minor: i64,
        currency: &str,
        evidence_ref: &str,
        now_ms: i64,
    ) -> Result<(), AuthorityError> {
        let bad =
            |m: &str| AuthorityError::Sqlite(rusqlite::Error::InvalidParameterName(m.to_string()));
        if billing_period.len() != 7
            || billing_period.as_bytes()[4] != b'-'
            || !billing_period[..4].bytes().all(|c| c.is_ascii_digit())
            || !billing_period[5..].bytes().all(|c| c.is_ascii_digit())
        {
            return Err(bad("billing_period must be YYYY-MM"));
        }
        if !matches!(
            billing_basis,
            "fixed_subscription"
                | "host_billed"
                | "metered_actual"
                | "metered_estimate"
                | "api_equivalent"
        ) {
            return Err(bad("billing_basis not in the five-basis vocabulary"));
        }
        if amount_minor < 0 {
            return Err(bad("amount_minor must be >= 0"));
        }
        if currency.trim().is_empty() {
            return Err(bad("currency required"));
        }
        self.conn.execute(
            "INSERT INTO host_bills(bill_id, host, provider_id, billing_period, billing_basis,
                 amount_minor, currency, evidence_ref, created_at_ms, updated_at_ms)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?9)
             ON CONFLICT(host, provider_id, billing_period, billing_basis, evidence_ref) DO UPDATE SET
                 amount_minor = excluded.amount_minor, currency = excluded.currency,
                 updated_at_ms = excluded.updated_at_ms, deleted_at_ms = NULL",
            rusqlite::params![
                bill_id, host, provider_id, billing_period, billing_basis,
                amount_minor, currency, evidence_ref, now_ms
            ],
        )?;
        Ok(())
    }

    /// 某账期的所有活账单行 `(host, provider_id, basis, amount_minor, currency)`。
    pub fn host_bills_for_period(
        &self,
        billing_period: &str,
    ) -> Result<Vec<HostBillRow>, AuthorityError> {
        let mut stmt = self.conn.prepare(
            "SELECT host, provider_id, billing_basis, amount_minor, currency FROM host_bills
             WHERE billing_period = ?1 AND deleted_at_ms IS NULL
             ORDER BY host, provider_id, billing_basis",
        )?;
        let rows = stmt
            .query_map(rusqlite::params![billing_period], |r| {
                Ok((
                    r.get::<_, String>(0)?,
                    r.get::<_, String>(1)?,
                    r.get::<_, String>(2)?,
                    r.get::<_, i64>(3)?,
                    r.get::<_, String>(4)?,
                ))
            })?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(rows)
    }

    /// soft delete（查询默认过滤 `deleted_at_ms IS NULL`）。
    pub fn host_bill_delete(&self, bill_id: &str, now_ms: i64) -> Result<bool, AuthorityError> {
        let n = self.conn.execute(
            "UPDATE host_bills SET deleted_at_ms = ?2 WHERE bill_id = ?1 AND deleted_at_ms IS NULL",
            rusqlite::params![bill_id, now_ms],
        )?;
        Ok(n > 0)
    }

    pub fn host_bill_count(&self) -> Result<i64, AuthorityError> {
        Ok(self.conn.query_row(
            "SELECT COUNT(*) FROM host_bills WHERE deleted_at_ms IS NULL",
            [],
            |r| r.get(0),
        )?)
    }

    /// `BEGIN IMMEDIATE` 事务帮助器：闭包成功 → COMMIT，Err → ROLLBACK 后
    /// 原样上抛。**所有业务写入都必须走这里**（spec §5.1.4——事务边界是
    /// 写入协议的一部分，不是调用方的自由裁量）。
    pub fn with_immediate_txn<T>(
        &self,
        f: impl FnOnce(&Connection) -> Result<T, AuthorityError>,
    ) -> Result<T, AuthorityError> {
        self.conn.execute_batch("BEGIN IMMEDIATE")?;
        match f(&self.conn) {
            Ok(v) => {
                self.conn.execute_batch("COMMIT")?;
                Ok(v)
            }
            Err(e) => {
                let _ = self.conn.execute_batch("ROLLBACK");
                Err(e)
            }
        }
    }

    /// 只读连接访问（查询面在 Phase 3 接 repository；Phase 2 的 writer 也
    /// 走 with_immediate_txn——这个 getter 仅供测试与迁移框架）。
    /// 读取一份宿主实时快照；调用方负责反序列化，并把损坏 payload 当数据质量
    /// 问题而不是回落读取原始日志。
    pub fn runtime_snapshot_get(
        &self,
        host: &str,
        snapshot_kind: &str,
    ) -> Result<Option<(String, i64)>, AuthorityError> {
        self.conn
            .query_row(
                "SELECT payload_json, observed_at_ms FROM host_runtime_snapshots
                 WHERE host = ?1 AND snapshot_kind = ?2",
                rusqlite::params![host, snapshot_kind],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .optional()
            .map_err(AuthorityError::from)
    }

    pub fn conn(&self) -> &Connection {
        &self.conn
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tmp_db(tag: &str) -> PathBuf {
        std::env::temp_dir().join(format!(
            "avd-authority-{tag}-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ))
    }

    #[test]
    fn empty_install_creates_full_schema_and_stamps_version() {
        let db = tmp_db("fresh");
        {
            let a = AuthorityDb::open(&db, 1_000).unwrap();
            // 全部表存在。
            let tables: Vec<String> = a
                .conn()
                .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
                .unwrap()
                .query_map([], |r| r.get(0))
                .unwrap()
                .filter_map(Result::ok)
                .collect();
            for t in [
                "schema_meta",
                "sync_runs",
                "source_files",
                "sessions",
                "usage_facts",
                "host_bills",
                "pricing_snapshots",
                "budget_config",
                "budget_snoozes",
                "data_quality_issues",
                "migrations",
                "workflow_events",
                "host_runtime_snapshots",
                "route_evidence",
                "issue_instances",
                "issue_status_transitions",
                "provider_catalog_snapshots",
                "billing_templates",
                "billing_template_snapshots",
                "outcome_measurements",
                "savings_records",
            ] {
                assert!(tables.iter().any(|x| x == t), "缺表 {t}: {tables:?}");
            }
            // 重复 open 幂等（版本已 stamp）。
            drop(a);
        }
        let a2 = AuthorityDb::open(&db, 2_000).unwrap();
        let ver: String = a2
            .conn()
            .query_row(
                "SELECT value FROM schema_meta WHERE key = 'schema_version'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(ver, SCHEMA_VERSION.to_string());
        let _ = std::fs::remove_file(&db);
    }

    #[test]
    fn interrupted_running_batches_are_swept_on_open() {
        let db = tmp_db("sweep");
        let a = AuthorityDb::open(&db, 1_000).unwrap();
        a.begin_run("run-1", "tray", 1_000).unwrap();
        a.begin_run("run-2", "cli", 1_100).unwrap();
        a.finish_run("run-2", "succeeded", None, None, 1_200)
            .unwrap();
        drop(a);
        // 模拟 crash：run-1 停在 running。重新 open → 清扫为 cancelled。
        let a2 = AuthorityDb::open(&db, 9_000).unwrap();
        let (status, code): (String, Option<String>) = a2
            .conn()
            .query_row(
                "SELECT status, error_code FROM sync_runs WHERE run_id = 'run-1'",
                [],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .unwrap();
        assert_eq!(status, "cancelled");
        assert_eq!(code.as_deref(), Some("interrupted"));
        // succeeded 批次不受清扫影响。
        let s2: String = a2
            .conn()
            .query_row(
                "SELECT status FROM sync_runs WHERE run_id = 'run-2'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(s2, "succeeded");
        let _ = std::fs::remove_file(&db);
    }

    #[test]
    fn v1_database_migrates_to_current_schema() {
        let db = tmp_db("v1-to-v2");
        let conn = rusqlite::Connection::open(&db).unwrap();
        conn.execute_batch("BEGIN IMMEDIATE;").unwrap();
        conn.execute_batch(SCHEMA_V1).unwrap();
        conn.execute(
            "INSERT INTO schema_meta(key, value) VALUES('schema_version', '1')",
            [],
        )
        .unwrap();
        conn.execute_batch("DROP TABLE host_runtime_snapshots;")
            .unwrap();
        conn.execute_batch("COMMIT;").unwrap();
        drop(conn);

        let upgraded = AuthorityDb::open(&db, 2_000).unwrap();
        let version: String = upgraded
            .conn()
            .query_row(
                "SELECT value FROM schema_meta WHERE key = 'schema_version'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(version, SCHEMA_VERSION.to_string());
        let exists: i64 = upgraded
            .conn()
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'host_runtime_snapshots'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(exists, 1);
        let _ = std::fs::remove_file(&db);
    }

    #[test]
    fn v2_database_migrates_to_current_schema_and_preserves_facts() {
        let db = tmp_db("v2-to-v3");
        let conn = rusqlite::Connection::open(&db).unwrap();
        conn.execute_batch("BEGIN IMMEDIATE;").unwrap();
        conn.execute_batch(SCHEMA_V1).unwrap();
        conn.execute_batch("INSERT INTO schema_meta(key, value) VALUES('schema_version', '2');")
            .unwrap();
        conn.execute_batch(
            "INSERT INTO sync_runs(run_id, started_at_ms, trigger, status, schema_version)
             VALUES('migration-fixture', 1, 'migration', 'succeeded', 2);
             INSERT INTO usage_facts(
               fact_id, host, machine_namespace, native_session_id, source_event_id,
               observation_kind, uncached_input_tokens, cache_read_tokens,
               cache_write_tokens, output_tokens, ingested_run_id, created_at_ms, updated_at_ms)
             VALUES('fact-preserve', 'codex', 'ns', 'session', 'event', 'assistant-usage',
                    11, 22, 33, 44, 'migration-fixture', 1, 1);",
        )
        .unwrap();
        conn.execute_batch("COMMIT;").unwrap();
        drop(conn);

        let upgraded = AuthorityDb::open(&db, 2_000).unwrap();
        let version: String = upgraded
            .conn()
            .query_row(
                "SELECT value FROM schema_meta WHERE key = 'schema_version'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(version, SCHEMA_VERSION.to_string());
        let index_exists: i64 = upgraded
            .conn()
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master
                 WHERE type = 'index' AND name = 'data_quality_issues_open_code_scope'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(index_exists, 1, "missing data-status correlation index");
        for column in [
            "provider_raw",
            "billing_source",
            "billing_mode",
            "pricing_basis",
            "evidence_basis",
            "normalization_version",
            "route_evidence_id",
            "attribution_version",
            "billing_template_id",
        ] {
            let found: i64 = upgraded
                .conn()
                .query_row(
                    "SELECT COUNT(*) FROM pragma_table_info('usage_facts') WHERE name = ?1",
                    [column],
                    |r| r.get(0),
                )
                .unwrap();
            assert_eq!(found, 1, "missing migrated column {column}");
        }
        let preserved: (i64, i64, i64, i64, i64) = upgraded
            .conn()
            .query_row(
                "SELECT COUNT(*), COALESCE(SUM(uncached_input_tokens), 0),
                        COALESCE(SUM(cache_read_tokens), 0),
                        COALESCE(SUM(cache_write_tokens), 0),
                        COALESCE(SUM(output_tokens), 0)
                 FROM usage_facts WHERE fact_id = 'fact-preserve'",
                [],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?)),
            )
            .unwrap();
        assert_eq!(preserved, (1, 11, 22, 33, 44));
        let _ = std::fs::remove_file(&db);
    }

    #[test]
    fn v3_database_migrates_to_v4_without_assigning_historical_templates() {
        let db = tmp_db("v3-to-v4");
        let conn = rusqlite::Connection::open(&db).unwrap();
        conn.execute_batch("BEGIN IMMEDIATE;").unwrap();
        conn.execute_batch(SCHEMA_V1).unwrap();
        conn.execute_batch(SCHEMA_V3_ADD).unwrap();
        conn.execute_batch("INSERT INTO schema_meta(key, value) VALUES('schema_version', '3');")
            .unwrap();
        conn.execute_batch(
            "INSERT INTO sync_runs(run_id, started_at_ms, trigger, status, schema_version)
             VALUES('migration-fixture', 1, 'migration', 'succeeded', 3);
             INSERT INTO usage_facts(
               fact_id, host, machine_namespace, native_session_id, source_event_id,
               observation_kind, uncached_input_tokens, ingested_run_id, created_at_ms, updated_at_ms)
             VALUES('fact-v3', 'codex', 'ns', 'session', 'event', 'assistant-usage',
                    88, 'migration-fixture', 1, 1);",
        ).unwrap();
        conn.execute_batch("COMMIT;").unwrap();
        drop(conn);

        let upgraded = AuthorityDb::open(&db, 2_000).unwrap();
        let template_id: Option<String> = upgraded.conn().query_row(
            "SELECT billing_template_id FROM usage_facts WHERE fact_id = 'fact-v3'",
            [], |r| r.get(0),
        ).unwrap();
        assert_eq!(template_id, None);
        for table in ["provider_catalog_snapshots", "billing_templates", "billing_template_snapshots",
            "outcome_measurements", "savings_records"] {
            let found: i64 = upgraded.conn().query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = ?1",
                [table], |r| r.get(0),
            ).unwrap();
            assert_eq!(found, 1, "missing v4 table {table}");
        }
        let _ = std::fs::remove_file(&db);
    }

    #[test]
    fn billing_catalog_and_template_snapshots_are_immutable_and_referential() {
        let db = tmp_db("billing-snapshots");
        let authority = AuthorityDb::open(&db, 1_000).unwrap();
        assert!(authority.provider_catalog_snapshot_put(
            "catalog-1", "bc1-abc", "official", "{\"providers\":[]}", 1_000,
        ).unwrap());
        assert!(!authority.provider_catalog_snapshot_put(
            "catalog-1", "bc1-abc", "official", "{\"providers\":[]}", 2_000,
        ).unwrap());
        assert!(authority.provider_catalog_snapshot_put(
            "catalog-1", "bc1-other", "official", "{}", 2_000,
        ).is_err());
        assert!(authority.billing_template_put(
            "template-1", "openai", Some("acct-hash"), "metered_api", "official", 0, None, 1_000,
        ).unwrap());
        assert!(!authority.billing_template_put(
            "template-1", "openai", Some("acct-hash"), "metered_api", "official", 0, None, 2_000,
        ).unwrap());
        assert!(authority.billing_template_put(
            "template-1", "openai", Some("acct-hash"), "custom", "official", 0, None, 2_000,
        ).is_err());
        assert!(authority.billing_template_put(
            "template-invalid", "openai", None, "subscription", "official", 0, None, 1_000,
        ).is_err());
        assert!(authority.billing_template_snapshot_put(
            "bts1-abc", "template-1", Some("catalog-1"), "{\"kind\":\"metered_api\"}", 1_000,
        ).unwrap());
        assert!(authority.billing_template_snapshot_put(
            "bts1-abc", "template-1", Some("catalog-1"), "{}", 2_000,
        ).is_err());
        assert!(authority.billing_template_snapshot_put(
            "bad", "missing", Some("catalog-1"), "{}", 1_000,
        ).is_err());
        assert!(authority.conn().execute(
            "INSERT INTO pricing_snapshots(pricing_version, captured_at_ms, source_kind, payload_json, catalog_version)
             VALUES ('bad-catalog', 1, 'test', '{}', 'missing')", [],
        ).is_err());
        assert!(authority.conn().execute(
            "INSERT INTO pricing_snapshots(pricing_version, captured_at_ms, source_kind, payload_json, billing_template_id)
             VALUES ('bad-template', 1, 'test', '{}', 'missing')", [],
        ).is_err());
        assert_eq!(authority.conn().execute(
            "INSERT INTO pricing_snapshots(pricing_version, captured_at_ms, source_kind, payload_json, catalog_version, billing_template_id)
             VALUES ('priced-template', 1, 'test', '{}', 'catalog-1', 'template-1')", [],
        ).unwrap(), 1);
        let _ = std::fs::remove_file(&db);
    }

    #[test]
    fn savings_cannot_upgrade_an_estimate_to_actual_or_realized() {
        let db = tmp_db("savings-evidence");
        let authority = AuthorityDb::open(&db, 1_000).unwrap();
        assert!(authority.outcome_measurement_put(
            "outcome-est", "facts-1", "cost-v1", "estimated", Some(123), Some("USD"), 1_000, "{}",
        ).unwrap());
        assert!(authority.savings_record_put(
            "saving-est", "outcome-est", None, None, 123, "USD", "estimated", 1_000,
        ).unwrap());
        assert!(authority.savings_record_put(
            "saving-actual", "outcome-est", None, None, 123, "USD", "actual", 1_000,
        ).is_err());
        assert!(authority.outcome_measurement_put(
            "outcome-actual", "facts-2", "invoice-v1", "actual", Some(456), Some("USD"), 2_000, "{}",
        ).unwrap());
        assert!(authority.savings_record_put(
            "saving-actual", "outcome-actual", None, None, 456, "USD", "actual", 2_000,
        ).unwrap());
        let _ = std::fs::remove_file(&db);
    }

    #[test]
    fn corrupted_database_is_reported_not_deleted() {
        // 与旧 store 的关键差异：损坏 → 报错走恢复流程，绝不静默删库重建。
        let db = tmp_db("corrupt");
        std::fs::write(&db, b"NOT A SQLITE DATABASE AT ALL____garbage").unwrap();
        let err = AuthorityDb::open(&db, 1_000).unwrap_err();
        assert!(
            matches!(err, AuthorityError::Sqlite(_)),
            "损坏必须以 Sqlite 错误上抛（不自愈），got {err:?}"
        );
        // 文件原样保留（用户备份/取证）。
        assert!(db.exists());
        let _ = std::fs::remove_file(&db);
    }

    #[test]
    fn partial_schema_from_interrupted_creation_is_rejected() {
        let db = tmp_db("partial");
        // 模拟建库中途死掉：有业务表但没有版本行。
        let conn = rusqlite::Connection::open(&db).unwrap();
        conn.execute_batch("CREATE TABLE usage_facts (fact_id TEXT PRIMARY KEY);")
            .unwrap();
        drop(conn);
        let err = AuthorityDb::open(&db, 1_000).unwrap_err();
        let msg = format!("{err}");
        assert!(msg.contains("__corrupt_partial_schema__"), "got {msg}");
        let _ = std::fs::remove_file(&db);
    }

    #[test]
    fn newer_schema_is_rejected_not_downgraded() {
        let db = tmp_db("newer");
        {
            let conn = rusqlite::Connection::open(&db).unwrap();
            conn.execute_batch(
                "CREATE TABLE schema_meta(key TEXT PRIMARY KEY, value TEXT NOT NULL);
                 INSERT INTO schema_meta VALUES('schema_version', '99');",
            )
            .unwrap();
        }
        let err = AuthorityDb::open(&db, 1_000).unwrap_err();
        assert!(
            matches!(err, AuthorityError::NewerSchema { found: 99, .. }),
            "got {err:?}"
        );
        let _ = std::fs::remove_file(&db);
    }

    // ── open_readonly（Data MCP 只读取数面，spec §9.3）────────────────

    #[test]
    fn open_readonly_missing_file_is_typed() {
        let db = tmp_db("ro-missing");
        assert!(matches!(
            AuthorityDb::open_readonly(&db).unwrap_err(),
            AuthorityError::MissingFile
        ));
        // 缺文件时**不建库**（与 `open` 的关键区别）。
        assert!(!db.exists());
    }

    #[test]
    fn open_readonly_opens_a_valid_db_and_forbids_writes() {
        let db = tmp_db("ro-valid");
        AuthorityDb::open(&db, 1_000).unwrap(); // 先正常建库
        let ro = AuthorityDb::open_readonly(&db).unwrap();
        // 只读连接：写语句必须失败。
        let write = ro
            .conn()
            .execute("INSERT INTO schema_meta(key, value) VALUES('x','y')", []);
        assert!(write.is_err(), "read-only connection must reject writes");
        let _ = std::fs::remove_file(&db);
    }

    #[test]
    fn open_readonly_reports_corrupt_for_garbage_and_half_built() {
        let garbage = tmp_db("ro-garbage");
        std::fs::write(&garbage, b"NOT A SQLITE DATABASE").unwrap();
        assert!(matches!(
            AuthorityDb::open_readonly(&garbage).unwrap_err(),
            AuthorityError::Corrupt
        ));
        let _ = std::fs::remove_file(&garbage);

        let half = tmp_db("ro-half");
        rusqlite::Connection::open(&half)
            .unwrap()
            .execute_batch("CREATE TABLE usage_facts (fact_id TEXT PRIMARY KEY);")
            .unwrap();
        assert!(matches!(
            AuthorityDb::open_readonly(&half).unwrap_err(),
            AuthorityError::Corrupt
        ));
        let _ = std::fs::remove_file(&half);
    }

    #[test]
    fn existing_v1_db_picks_up_safe_views_on_reopen() {
        // 增量 7.5：v1 库已存在的情况下，再开一次应该把 v_*_safe view
        // 幂等加进去（review 增量 7.5：migrate 路径不阻塞）。
        let path = tmp_db("v1-views");
        let db = AuthorityDb::open(&path, 1_000).unwrap();
        // 先关掉 + 重新打开。
        drop(db);
        let db2 = AuthorityDb::open(&path, 1_001).unwrap();
        let n: i64 = db2
            .conn()
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type='view' AND name IN ('v_facts_safe', 'v_sessions_safe', 'v_data_quality_safe', 'v_sync_runs_safe')",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(n, 4, "v_*_safe views 应在二次 open 时被幂等加进去");
        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn open_readonly_distinguishes_newer_and_older_schema() {
        let newer = tmp_db("ro-newer");
        rusqlite::Connection::open(&newer)
            .unwrap()
            .execute_batch(
                "CREATE TABLE schema_meta(key TEXT PRIMARY KEY, value TEXT NOT NULL);
                 INSERT INTO schema_meta VALUES('schema_version', '99');",
            )
            .unwrap();
        assert!(matches!(
            AuthorityDb::open_readonly(&newer).unwrap_err(),
            AuthorityError::NewerSchema { found: 99, .. }
        ));
        let _ = std::fs::remove_file(&newer);

        let older = tmp_db("ro-older");
        rusqlite::Connection::open(&older)
            .unwrap()
            .execute_batch(
                "CREATE TABLE schema_meta(key TEXT PRIMARY KEY, value TEXT NOT NULL);
                 INSERT INTO schema_meta VALUES('schema_version', '0');",
            )
            .unwrap();
        assert!(matches!(
            AuthorityDb::open_readonly(&older).unwrap_err(),
            AuthorityError::OlderSchema { found: 0 }
        ));
        let _ = std::fs::remove_file(&older);
    }

    #[test]
    fn retention_deletes_only_dated_rows_older_than_cutoff() {
        let db = tmp_db("retention");
        let a = AuthorityDb::open(&db, 1_000).unwrap();
        a.begin_run("run-1", "cli", 1_000).unwrap();
        a.with_immediate_txn(|conn| {
            // 三行：旧（< cutoff）、新（≥ cutoff）、无日期（§5.4 不静默删）。
            for (rid, ts) in [
                ("f-old", Some(500_i64)),
                ("f-new", Some(9_999_i64)),
                ("f-nodate", None),
            ] {
                conn.execute(
                    "INSERT INTO usage_facts(fact_id, host, machine_namespace,
                         native_session_id, source_event_id, observation_kind,
                         event_ts_ms, ingested_run_id, created_at_ms, updated_at_ms)
                     VALUES (?1,'dsh','ns','s',?1,'token_count',?2,'run-1',1,1)",
                    rusqlite::params![rid, ts],
                )
                .unwrap();
            }
            Ok(())
        })
        .unwrap();
        let n = a.retention_usage_facts(5_000).unwrap();
        assert_eq!(n, 1, "只删 event_ts_ms < cutoff 的行");
        let left: i64 = a
            .conn()
            .query_row("SELECT COUNT(*) FROM usage_facts", [], |r| r.get(0))
            .unwrap();
        assert_eq!(left, 2, "新行与无日期行保留");
        // 幂等：再跑删 0 行。
        assert_eq!(a.retention_usage_facts(5_000).unwrap(), 0);
        std::fs::remove_file(&db).ok();
    }

    #[test]
    fn immediate_txn_rolls_back_on_error() {
        let db = tmp_db("txn");
        let a = AuthorityDb::open(&db, 1_000).unwrap();
        a.begin_run("run-1", "cli", 1_000).unwrap();
        let err: Result<(), AuthorityError> = a.with_immediate_txn(|conn| {
            conn.execute(
                "INSERT INTO sync_runs(run_id, started_at_ms, trigger, status, schema_version)
                 VALUES ('run-2', 1000, 'cli', 'running', 1)",
                [],
            )
            .map_err(AuthorityError::from)?;
            Err(AuthorityError::Sqlite(
                rusqlite::Error::InvalidParameterName("boom".to_string()),
            ))
        });
        assert!(err.is_err());
        let n: i64 = a
            .conn()
            .query_row(
                "SELECT COUNT(*) FROM sync_runs WHERE run_id = 'run-2'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(n, 0, "回滚后不得有半提交残留");
        let _ = std::fs::remove_file(&db);
    }

    #[test]
    fn budget_config_crud_roundtrip_and_overwrite() {
        let db = tmp_db("bcfg");
        let a = AuthorityDb::open(&db, 1_000).unwrap();
        assert!(a.budget_config_get().unwrap().is_none(), "新库无配置");
        a.budget_config_set(60_000, 3_000, 8_000, 2_000).unwrap();
        let c = a.budget_config_get().unwrap().expect("seed 后有配置");
        assert_eq!(
            (
                c.monthly_cny_minor,
                c.daily_cny_minor,
                c.warning_ratio_bp,
                c.updated_at_ms
            ),
            (60_000, 3_000, 8_000, 2_000)
        );
        // upsert 覆盖 + updated_at_ms 滚动（第二次 set 的时钟是 3_000）。
        a.budget_config_set(61_000, 3_100, 9_000, 3_000).unwrap();
        let c2 = a.budget_config_get().unwrap().unwrap();
        assert_eq!(
            (
                c2.monthly_cny_minor,
                c2.daily_cny_minor,
                c2.warning_ratio_bp,
                c2.updated_at_ms
            ),
            (61_000, 3_100, 9_000, 3_000)
        );
        let _ = std::fs::remove_file(&db);
    }

    #[test]
    fn budget_snooze_set_get_clear() {
        let db = tmp_db("bsnz");
        let a = AuthorityDb::open(&db, 1_000).unwrap();
        assert!(a.budget_snooze_get().unwrap().is_none());
        a.budget_snooze_set(9_999, 1_000).unwrap();
        assert_eq!(a.budget_snooze_get().unwrap(), Some(9_999));
        a.budget_snooze_set(8_888, 2_000).unwrap();
        assert_eq!(a.budget_snooze_get().unwrap(), Some(8_888), "upsert 覆盖");
        a.budget_snooze_clear().unwrap();
        assert!(a.budget_snooze_get().unwrap().is_none(), "clear 后干净");
        // clear 再 clear 幂等。
        a.budget_snooze_clear().unwrap();
        let _ = std::fs::remove_file(&db);
    }

    /// Phase 2.8：`pricing_snapshots` 写入方——同 version 幂等（内容不可变）、
    /// `asof` 按事件时间点选最新的更早版本、`latest` 取最新捕获。
    #[test]
    fn pricing_snapshots_put_get_asof_latest() {
        let db = tmp_db("pxsnap");
        let a = AuthorityDb::open(&db, 1_000).unwrap();
        assert_eq!(a.pricing_snapshot_count().unwrap(), 0);
        assert!(a.pricing_snapshot_latest().unwrap().is_none());
        assert!(
            a.pricing_snapshot_asof(9_999).unwrap().is_none(),
            "无更早版本 → None"
        );

        assert!(a
            .pricing_snapshot_put("v-aug", "embedded-assets", "{\"m\":1}", 1_000)
            .unwrap());
        assert!(
            !a.pricing_snapshot_put("v-aug", "embedded-assets", "{\"m\":1}", 5_000)
                .unwrap(),
            "同 version 再写 → DO NOTHING（内容不可变）"
        );
        assert!(a
            .pricing_snapshot_put("v-sep", "embedded-assets", "{\"m\":2}", 3_000)
            .unwrap());
        assert_eq!(a.pricing_snapshot_count().unwrap(), 2);

        assert_eq!(
            a.pricing_snapshot_get("v-sep").unwrap().as_deref(),
            Some("{\"m\":2}")
        );
        assert_eq!(
            a.pricing_snapshot_latest().unwrap(),
            Some(("v-sep".into(), 3_000))
        );
        // asof 调价前 → 用旧版本；调价后 → 新版本；更早 → None。
        assert_eq!(
            a.pricing_snapshot_asof(2_000).unwrap().as_deref(),
            Some("{\"m\":1}")
        );
        assert_eq!(
            a.pricing_snapshot_asof(4_000).unwrap().as_deref(),
            Some("{\"m\":2}")
        );
        assert!(a.pricing_snapshot_asof(500).unwrap().is_none());
        let _ = std::fs::remove_file(&db);
    }

    /// Phase 2.8：`host_bills` 写入方——校验四项（period/basis/amount/currency）、
    /// 同键 upsert（更正金额，deleted 复活）、`for_period` 只回活行、soft delete。
    #[test]
    fn host_bill_put_validates_and_upserts() {
        let db = tmp_db("hbill");
        let a = AuthorityDb::open(&db, 1_000).unwrap();
        assert_eq!(a.host_bill_count().unwrap(), 0);

        // 四项校验——每条都必须 Err（不猜、不默认）。
        assert!(
            a.host_bill_put("x", "wb", "wb", "2026-9", "host_billed", 100, "CNY", "", 1)
                .is_err(),
            "period 非 YYYY-MM"
        );
        assert!(
            a.host_bill_put("x", "wb", "wb", "2026-09", "credits", 100, "CNY", "", 1)
                .is_err(),
            "basis 不在五档词表"
        );
        assert!(
            a.host_bill_put("x", "wb", "wb", "2026-09", "host_billed", -1, "CNY", "", 1)
                .is_err(),
            "amount_minor < 0"
        );
        assert!(
            a.host_bill_put("x", "wb", "wb", "2026-09", "host_billed", 100, "  ", "", 1)
                .is_err(),
            "currency 空"
        );

        // 正常录入 + 同键 upsert 更正金额。
        a.host_bill_put(
            "b1",
            "workbuddy",
            "workbuddy",
            "2026-09",
            "host_billed",
            21_500,
            "CNY",
            "credit_json",
            1_000,
        )
        .unwrap();
        assert_eq!(a.host_bill_count().unwrap(), 1);
        a.host_bill_put(
            "b1",
            "workbuddy",
            "workbuddy",
            "2026-09",
            "host_billed",
            30_000,
            "CNY",
            "credit_json",
            2_000,
        )
        .unwrap();
        assert_eq!(
            a.host_bill_count().unwrap(),
            1,
            "同 (host,provider,period,basis,evidence) → upsert 不新增"
        );

        // evidence_ref 空串同样能 upsert（不撞 PRIMARY KEY）。
        a.host_bill_put(
            "b2:",
            "wb2",
            "wb2",
            "2026-09",
            "host_billed",
            500,
            "CNY",
            "",
            1,
        )
        .unwrap();
        a.host_bill_put(
            "b2:",
            "wb2",
            "wb2",
            "2026-09",
            "host_billed",
            700,
            "CNY",
            "",
            2,
        )
        .unwrap();
        assert_eq!(
            a.host_bill_count().unwrap(),
            2,
            "空 evidence 也 upsert 而非新增/报错"
        );
        a.host_bill_delete("b2:", 9).unwrap();

        let rows = a.host_bills_for_period("2026-09").unwrap();
        assert_eq!(
            rows,
            vec![(
                "workbuddy".to_string(),
                "workbuddy".to_string(),
                "host_billed".to_string(),
                30_000,
                "CNY".to_string()
            )]
        );
        assert!(a.host_bills_for_period("2026-08").unwrap().is_empty());

        // soft delete → for_period 不再回它；重复 delete 返回 false。
        assert!(a.host_bill_delete("b1", 3_000).unwrap());
        assert!(!a.host_bill_delete("b1", 4_000).unwrap());
        assert!(a.host_bills_for_period("2026-09").unwrap().is_empty());
        assert_eq!(a.host_bill_count().unwrap(), 0);

        // upsert 到已 soft-deleted 的键 → 复活（deleted_at_ms = NULL）。
        a.host_bill_put(
            "b1",
            "workbuddy",
            "workbuddy",
            "2026-09",
            "host_billed",
            12_000,
            "CNY",
            "credit_json",
            5_000,
        )
        .unwrap();
        assert_eq!(a.host_bill_count().unwrap(), 1, "同键再录 → 复活");
        let _ = std::fs::remove_file(&db);
    }
}
