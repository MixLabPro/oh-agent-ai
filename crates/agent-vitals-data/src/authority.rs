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

use rusqlite::Connection;

/// 当前 DDL 版本。spec §3 的表结构变更递增；`migrations` 表（§3.5）记录的
/// 是**数据迁移**（legacy import 等），与 DDL 版本刻意分开。
pub const SCHEMA_VERSION: i64 = 1;

/// 权威库默认路径：`<data_home>/agent-vitals.sqlite3`（spec §3）。
/// 与旧 `index.sqlite3` 并存至 Phase 1 迁移框架完成导入后退役。
pub fn default_authority_path(data_home: &Path) -> PathBuf {
    data_home.join("agent-vitals.sqlite3")
}

/// 权威库错误。`Corrupt` **不再自愈**——恢复路径是「用户备份 + 原始日志
/// 重放」，静默删库重建会把权威库变成可被悄悄替换的第二本账（spec §1.1.3
/// 的反面教材）。
#[derive(Debug)]
pub enum AuthorityError {
    Sqlite(rusqlite::Error),
    /// 库的 schema 版本比本二进制新——升级二进制，不降级重建。
    NewerSchema { found: i64, supported: i64 },
    Io(std::io::Error),
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
  trigger TEXT NOT NULL,                 -- cli | tray | migration | repair
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
"#;

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
        conn.pragma_update(None, "journal_mode", "WAL")?;
        conn.pragma_update(None, "foreign_keys", "ON")?;
        conn.busy_timeout(std::time::Duration::from_millis(5_000))?;
        Self::ensure_schema(&conn, now_ms)?;
        Ok(Self { conn })
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
            Some(v) if v == SCHEMA_VERSION => {}
            Some(old) => {
                // 未来版本升级路径：按版本阶梯执行迁移步骤。v1 是第一版，
                // 不存在合法的 old < 1（空库走 None 分支）；防御性报错。
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
                .prepare(
                    "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
                )
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
        assert_eq!(ver, "1");
        let _ = std::fs::remove_file(&db);
    }

    #[test]
    fn interrupted_running_batches_are_swept_on_open() {
        let db = tmp_db("sweep");
        let a = AuthorityDb::open(&db, 1_000).unwrap();
        a.begin_run("run-1", "tray", 1_000).unwrap();
        a.begin_run("run-2", "cli", 1_100).unwrap();
        a.finish_run("run-2", "succeeded", None, None, 1_200).unwrap();
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
            Err(AuthorityError::Sqlite(rusqlite::Error::InvalidParameterName(
                "boom".to_string(),
            )))
        });
        assert!(err.is_err());
        let n: i64 = a
            .conn()
            .query_row("SELECT COUNT(*) FROM sync_runs WHERE run_id = 'run-2'", [], |r| {
                r.get(0)
            })
            .unwrap();
        assert_eq!(n, 0, "回滚后不得有半提交残留");
        let _ = std::fs::remove_file(&db);
    }
}
