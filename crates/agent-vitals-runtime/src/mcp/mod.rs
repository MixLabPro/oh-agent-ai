//! Data MCP 工具应用层（`docs/AGENT_VITALS_DATA_MCP_SPEC.md` §5.2：工具应用层
//! 住 `agent-vitals-runtime`；stdio 传输 / JSON-RPC 编解码 / 进程生命周期住
//! `apps/cli/src/mcp.rs`）。
//!
//! 本模块暴露：
//! - [`build_envelope`]：spec §6 顶层响应契约（所有工具结果都包一层）。
//! - [`AuthorityHandle`]：**只读**打开权威库（spec §9.3——不建库、不迁移）+
//!   `authority_state`（spec §6.1）。
//! - [`ToolError`]：spec §11 稳定错误码 + 安全描述。传输层把它映射成
//!   `tools/call` 结果的 `isError: true` + envelope 内 `error`，**不塞 JSON-RPC
//!   error**（否则客户端拿不到 warnings/coverage，spec §6.4）。
//! - [`tool_specs`]：`tools/list` 的工具定义（含 JSON Schema，spec §6.4 / D10）。
//! - [`dispatch`]：`tools/call` 的分发入口。
//!
//! **增量 1**（`docs/AGENT_VITALS_DATA_MCP_IMPLEMENTATION_PLAN.md`）：只有
//! `data_status` 一个工具；envelope / 错误映射 / authority 状态 / revision 的
//! 读取方式在这里为后续工具钉死。

mod data_status;
mod session_detail;
mod session_trace;
mod session_ref;
mod sessions_search;
mod usage_hourly;
#[cfg(feature = "mcp-internal")]
mod query_sql_readonly;

// PR #1 (mcp 0.9.1 SQL authority 收口)：把 cursor 解析/生成的 `pub` 包装
// 在模块顶层再 re-export 一次，CLI 二进制侧可以 `use agent_vitals_runtime::
// mcp::{parse_search_cursor, make_search_cursor, parse_detail_cursor,
// make_detail_cursor}` 直接拿，无需穿透到子模块（子模块仍是 private）。
pub use session_detail::{make_detail_cursor, parse_detail_cursor};
pub use sessions_search::{make_search_cursor, parse_search_cursor};

use std::path::{Path, PathBuf};

use agent_vitals_data::authority::{AuthorityDb, AuthorityError};
use rusqlite::Connection;
use serde_json::{json, Value};

/// spec §6：MCP envelope 的顶层版本。结构变化时 bump。
pub const ENVELOPE_SCHEMA_VERSION: &str = "1";
/// spec §6：查询语义版本——查询**含义**（不是结构）变化时手动 bump。
pub const QUERY_SEMANTICS: &str = "2026-09-07";

const BEIJING_OFFSET_MS: i64 = 8 * 3_600 * 1_000;

// ─────────────────────────── 错误 ───────────────────────────

/// spec §11 稳定错误码 + 安全描述（详细诊断写 `stderr`，不进响应）。
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ToolError {
    pub code: &'static str,
    pub message: String,
}

impl ToolError {
    pub fn new(code: &'static str, message: impl Into<String>) -> Self {
        Self { code, message: message.into() }
    }
    pub fn to_json(&self) -> Value {
        json!({ "code": self.code, "message": self.message })
    }
}

impl std::fmt::Display for ToolError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "[{}] {}", self.code, self.message)
    }
}

/// [`AuthorityDb::open_readonly`] 的 typed 错误 → spec §11 码。
fn map_open_error(e: AuthorityError) -> ToolError {
    match e {
        AuthorityError::MissingFile => ToolError::new(
            "database_missing",
            "authority DB does not exist — run `agent-vitals sync-facts` first",
        ),
        AuthorityError::Corrupt => ToolError::new(
            "database_unreadable",
            "authority DB is corrupt or not a SQLite file — run `agent-vitals data-status`, keep the file for diagnosis",
        ),
        AuthorityError::NewerSchema { found, supported } => ToolError::new(
            "schema_too_new",
            format!("authority schema v{found} is newer than supported v{supported} — upgrade agent-vitals / the MCP client"),
        ),
        AuthorityError::OlderSchema { found } => ToolError::new(
            "schema_migration_required",
            format!("authority schema v{found} is older than supported — run the matching product migration"),
        ),
        other => ToolError::new("internal_error", other.to_string()),
    }
}

// ─────────────────────────── 只读句柄 ───────────────────────────

/// 只读打开的权威库 + envelope 元数据来源。非 `data_status` 的工具都从这里
/// 取 conn（`data_status` 是 doctor 工具，自管低层连接以便在损坏时仍能报告）。
pub struct AuthorityHandle {
    db: AuthorityDb,
    data_home: PathBuf,
}

impl AuthorityHandle {
    pub fn open(data_home: &Path) -> Result<Self, ToolError> {
        let path = agent_vitals_data::authority::default_authority_path(data_home);
        let db = AuthorityDb::open_readonly(&path).map_err(map_open_error)?;
        Ok(Self { db, data_home: data_home.to_path_buf() })
    }

    pub fn conn(&self) -> &Connection {
        self.db.conn()
    }

    /// spec §6.1 `authority_state`（库已能打开，故只在 `enabled` / `candidate`
    /// 二选一——`unavailable` 只发生在打不开时，那种情况根本到不了这里）。
    pub fn authority_state(&self) -> &'static str {
        authority_state_for(&self.data_home)
    }
}

fn authority_state_for(data_home: &Path) -> &'static str {
    if crate::sql_authority::is_enabled(data_home) {
        "enabled"
    } else {
        "candidate"
    }
}

// ─────────────────────────── envelope（spec §6） ───────────────────────────

/// spec §6：所有成功工具返回的顶层结构。工具只负责组装 `coverage` / `warnings`
/// / `data`，元数据（schema 版本、`authority_revision`、`freshness`）在这里从
/// `conn` 统一读——保证每个工具的 envelope 形状逐字节一致。
///
/// `max_observed_at_ms`：本次查询窗口内命中事实的最大 `event_ts_ms`（spec
/// §6.1）——带时间窗的工具传窗口内的 MAX；`data_status` 这类无窗工具传
/// `None`，则退回全库 MAX。
pub fn build_envelope(
    conn: &Connection,
    authority_state: &str,
    max_observed_at_ms: Option<i64>,
    coverage: Value,
    warnings: Vec<Value>,
    data: Value,
) -> Value {
    json!({
        "schema_version": ENVELOPE_SCHEMA_VERSION,
        "data_version": {
            "authority_schema": schema_version(conn),
            "query_semantics": QUERY_SEMANTICS,
        },
        "authority_state": authority_state,
        "authority_revision": authority_revision(conn, max_observed_at_ms),
        "generated_at": ms_to_rfc3339_beijing(crate::sql_sync::now_ms()),
        "timezone": "Asia/Shanghai",
        "coverage": coverage,
        "freshness": freshness(conn),
        "warnings": warnings,
        "data": data,
    })
}

/// spec §6.1 `coverage`：不依赖时间覆盖的工具（如 `data_status`）用这个。
pub fn coverage_not_applicable() -> Value {
    json!({ "status": "not_applicable", "missing_hosts": [] })
}

/// spec §6.4.1 `as_of_run_id` 三态。共享给所有带时间窗的工具，防止各写一份漂移。
/// - 没传 → `Ok(())`，不检查；
/// - 传了 == 当前最新成功 run → `Ok(())`；
/// - 传了、存在、但 != 最新（drift）→ push `snapshot_drift` warning，`Ok(())`（返回当前数据）；
/// - 传了但从没这个 run（或一次成功同步都没有）→ `Err(invalid_argument)`。
pub(super) fn check_as_of_run_id(
    conn: &Connection,
    args: &Value,
    warnings: &mut Vec<Value>,
) -> Result<(), ToolError> {
    let Some(req) = args.get("as_of_run_id").and_then(Value::as_str) else {
        return Ok(());
    };
    let current: Option<String> = conn
        .query_row(
            "SELECT run_id FROM sync_runs WHERE status='succeeded'
             ORDER BY COALESCE(completed_at_ms, started_at_ms) DESC LIMIT 1",
            [],
            |r| r.get(0),
        )
        .ok();
    match current {
        None => Err(ToolError::new(
            "invalid_argument",
            format!("as_of_run_id `{req}` requested but no successful sync run exists yet"),
        )),
        Some(cur) if cur == req => Ok(()),
        Some(cur) => {
            let exists: bool = conn
                .query_row(
                    "SELECT EXISTS(SELECT 1 FROM sync_runs WHERE run_id = ?1)",
                    rusqlite::params![req],
                    |r| r.get(0),
                )
                .unwrap_or(false);
            if exists {
                warnings.push(json!({
                    "code": "snapshot_drift",
                    "message": format!(
                        "as_of_run_id={req} but current is {cur} — strict cross-tool consistency not yet enforced (M2)"
                    ),
                    "requested": req,
                    "current": cur,
                }));
                Ok(())
            } else {
                Err(ToolError::new(
                    "invalid_argument",
                    format!("as_of_run_id `{req}` is not present in this authority DB"),
                ))
            }
        }
    }
}

/// `check_as_of_run_id` 的 `pub` 包装——CLI 二进制侧在自家工具（如
/// `sessions list` / `data daily`）实现 `as_of_run_id` 守门时复用同一段
/// 三态逻辑，避免各写一份漂移（spec §6.4.1）。内部 MCP 工具仍走
/// `pub(super)` 版以保留 module 边界。
pub fn check_as_of_run_id_pub(
    conn: &Connection,
    args: &Value,
    warnings: &mut Vec<Value>,
) -> Result<(), ToolError> {
    check_as_of_run_id(conn, args, warnings)
}

/// 业务错误的 envelope 形状（spec §6.4：`tools/call` 结果 `isError: true` +
/// envelope 内 `error`——**不塞 JSON-RPC error**）。库打不开时组不出完整
/// envelope，这里给一个最小可用形状：`authority_state=unavailable` + `error`。
pub fn error_envelope(err: &ToolError) -> Value {
    json!({
        "schema_version": ENVELOPE_SCHEMA_VERSION,
        "data_version": { "authority_schema": Value::Null, "query_semantics": QUERY_SEMANTICS },
        "authority_state": "unavailable",
        "authority_revision": Value::Null,
        "generated_at": ms_to_rfc3339_beijing(crate::sql_sync::now_ms()),
        "timezone": "Asia/Shanghai",
        "coverage": { "status": "unavailable", "missing_hosts": [] },
        "freshness": { "last_successful_sync_at": Value::Null, "stale_hosts": [] },
        "warnings": [],
        "data": Value::Null,
        "error": err.to_json(),
    })
}

#[cfg(test)]
mod error_envelope_tests {
    use super::*;
    #[test]
    fn error_envelope_uses_envelope_schema_version_constant() {
        // S3 fix: 与 `build_envelope` 同源——bump 常量时成功/错误路径同时变。
        let env = error_envelope(&ToolError::new("database_missing", "x"));
        assert_eq!(env["schema_version"], ENVELOPE_SCHEMA_VERSION);
    }
}

fn schema_version(conn: &Connection) -> i64 {
    conn.query_row(
        "SELECT value FROM schema_meta WHERE key = 'schema_version'",
        [],
        |r| r.get::<_, String>(0),
    )
    .ok()
    .and_then(|s| s.parse().ok())
    .unwrap_or(0)
}

/// spec §6.1 `authority_revision`：本次答案基于哪一批已提交数据。
/// = 最近一次 `sync_runs.status='succeeded'` 的 run + 其提交时间 +
/// 查询窗口内（或全库）事实的 `MAX(event_ts_ms)`。
///
/// **S4 fix（增量 1 review）**：`max_observed_at` SQL 必须 `WHERE
/// observation_kind != 'legacy_aggregate'`——legacy 是聚合兜底行，
/// `event_ts_ms` 是北京日 12:00 代表点；混进去会把 `max_observed_at`
/// 推到 `covered_to` 之后，破坏 spec §6.1「本次答案基于哪一批已提交
/// 数据」的不变量。这条过滤与 `per_host_breakdown` / `hourly_by_host` 同。
fn authority_revision(conn: &Connection, max_observed_at_ms: Option<i64>) -> Value {
    let last = conn
        .query_row(
            "SELECT run_id, COALESCE(completed_at_ms, started_at_ms)
             FROM sync_runs WHERE status = 'succeeded'
             ORDER BY COALESCE(completed_at_ms, started_at_ms) DESC LIMIT 1",
            [],
            |r| Ok((r.get::<_, String>(0)?, r.get::<_, i64>(1)?)),
        )
        .ok();
    let max_observed = max_observed_at_ms.or_else(|| {
        conn.query_row(
            "SELECT MAX(event_ts_ms) FROM usage_facts
             WHERE deleted_at_ms IS NULL
               AND observation_kind != 'legacy_aggregate'",
            [],
            |r| r.get::<_, Option<i64>>(0),
        )
        .ok()
        .flatten()
    });
    match last {
        Some((run_id, committed_ms)) => json!({
            "last_completed_run_id": run_id,
            "committed_at": ms_to_rfc3339_beijing(committed_ms),
            "max_observed_at": max_observed.map(ms_to_rfc3339_beijing),
        }),
        // 从没有一次成功同步——诚实报 null，不编造一个 revision。
        None => Value::Null,
    }
}

/// spec §6 `freshness`。`stale_hosts` 的逐宿主阈值判定在带时间窗的工具里做；
/// `data_status` 把逐宿主最近观测时间放进 `data`，这里只报「上次成功同步」。
fn freshness(conn: &Connection) -> Value {
    let last = conn
        .query_row(
            "SELECT MAX(COALESCE(completed_at_ms, started_at_ms))
             FROM sync_runs WHERE status = 'succeeded'",
            [],
            |r| r.get::<_, Option<i64>>(0),
        )
        .ok()
        .flatten();
    json!({
        "last_successful_sync_at": last.map(ms_to_rfc3339_beijing),
        "stale_hosts": [],
    })
}

/// epoch ms → RFC 3339 带 `+08:00`（spec §6.3：时间戳用 RFC 3339，北京时区）。
/// `civil_from_unix_secs` 不引 `chrono`（domain 纪律，runtime 沿用）。
pub(crate) fn ms_to_rfc3339_beijing(ms: i64) -> String {
    let local = ms + BEIJING_OFFSET_MS;
    let secs = local.div_euclid(1_000);
    let millis = local.rem_euclid(1_000);
    let (y, m, d) = agent_vitals_domain::util::civil_from_unix_secs(secs, 0);
    let tod = secs.rem_euclid(86_400);
    format!(
        "{y:04}-{m:02}-{d:02}T{:02}:{:02}:{:02}.{millis:03}+08:00",
        tod / 3600,
        (tod / 60) % 60,
        tod % 60,
    )
}

// ─────────────────────────── 工具注册表 ───────────────────────────

/// `tools/list` 的一条：名字 + 描述 + JSON Schema（spec §6.4）。描述是英文
/// （面向 MCP 客户端 / Agent，与 CLI `--help` 同纪律）。
pub struct ToolSpec {
    pub name: &'static str,
    pub description: &'static str,
    pub input_schema: Value,
    pub output_schema: Value,
}

/// 当前构建注册的工具。传输层据此渲染 `tools/list` 并校验 `tools/call` 的名字。
pub fn tool_specs() -> Vec<ToolSpec> {
    // `mut` 只在 `mcp-internal` 构建里用到（下方 push）；公开构建不加工具。
    #[cfg_attr(not(feature = "mcp-internal"), allow(unused_mut))]
    let mut out = vec![
        data_status::spec(),
        usage_hourly::spec(),
        sessions_search::spec(),
        session_detail::spec(),
        session_trace::spec(),
    ];
    #[cfg(feature = "mcp-internal")]
    {
        out.push(query_sql_readonly::spec());
    }
    out
}

/// CLI `data-status` 的数据面——与 MCP `data_status` 工具**同源**（spec §5
/// 「同一 repository / 同一 DTO」）。CLI 用 `AuthorityDb::open`（会建库）+ 自己
/// 判 `db_existed`；MCP 用只读路径。两边都调这个函数组装数据。
pub fn data_status_report(conn: &Connection, db_existed: bool, enabled: bool) -> Value {
    data_status::collect_report(conn, db_existed, enabled)
}

/// `tools/call` 分发。`name` 已由传输层对 [`tool_specs`] 校验过。参数在这里
/// 过一遍极简 schema 校验（spec §6.4 / M08：未知字段 → `invalid_argument`）。
pub fn dispatch(name: &str, args: &Value, data_home: &Path) -> Result<Value, ToolError> {
    let spec = tool_specs()
        .into_iter()
        .find(|s| s.name == name)
        .ok_or_else(|| ToolError::new("internal_error", format!("tool `{name}` registered but not wired")))?;
    validate_args(&spec, args)?;
    match name {
        "data_status" => data_status::run(args, data_home),
        "usage_hourly" => usage_hourly::run(args, data_home),
        "sessions_search" => sessions_search::run(args, data_home),
        "session_detail" => session_detail::run(args, data_home),
        "session_trace" => session_trace::run(args, data_home),
        #[cfg(feature = "mcp-internal")]
        "query_sql_readonly" => query_sql_readonly::run(args, data_home),
        other => Err(ToolError::new("internal_error", format!("tool `{other}` registered but not wired"))),
    }
}

/// 极简参数校验（spec §6.4：`additionalProperties: false` + 未知字段 →
/// `invalid_argument`）。**不做**完整 JSON Schema——只挡「不是对象」和「多余
/// 字段」两类，够 M08 注入防护；参数一多再引 schema crate。
///
/// **S5 fix（增量 1 review）**：首行 `debug_assert!` 每个注册工具的 schema
/// 都把 `additionalProperties` 设为 `false`——**没设就是 fail-fast**，
/// 否则未来某个工具忘了标就会被静默放行多余字段，构成注入漏洞。
fn validate_args(spec: &ToolSpec, args: &Value) -> Result<(), ToolError> {
    // S5 fix (increment 1 review, increment 2 落地)：**runtime** check（不是
    // debug_assert!）——release 构建必须也强制 `additionalProperties:false`，
    // 否则未来某工具忘了标会被静默放行多余字段，构成注入漏洞。
    // `debug_assert!` 在 release 是 no-op，不能用。
    if spec.input_schema.get("additionalProperties") != Some(&Value::Bool(false)) {
        return Err(ToolError::new(
            "internal_error",
            format!(
                "tool `{}` inputSchema must set additionalProperties:false (spec §6.4 / M08) — fix the tool registration",
                spec.name
            ),
        ));
    }
    let obj = args
        .as_object()
        .ok_or_else(|| ToolError::new("invalid_argument", "`arguments` must be a JSON object"))?;
    let known: std::collections::BTreeSet<&str> = spec
        .input_schema
        .get("properties")
        .and_then(Value::as_object)
        .map(|p| p.keys().map(String::as_str).collect())
        .unwrap_or_default();
    if let Some(extra) = obj.keys().find(|k| !known.contains(k.as_str())) {
        return Err(ToolError::new(
            "invalid_argument",
            format!("unknown argument `{extra}` for tool `{}`", spec.name),
        ));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use agent_vitals_data::authority::AuthorityDb;

    #[test]
    fn authority_revision_max_observed_excludes_legacy_aggregate() {
        // S4 fix (increment 1 review, increment 2 落地)：legacy_aggregate 行
        // 的 `event_ts_ms` 是北京日 12:00 代表点——不能被 `max_observed_at`
        // 当作可信快照的"最新观察时间"。回归测试。
        let home = std::env::temp_dir().join(format!(
            "avmcp-revfix-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir_all(&home).unwrap();
        let path = agent_vitals_data::authority::default_authority_path(&home);
        let db = AuthorityDb::open(&path, 1_700_000_000_000).unwrap();

        // 两条事实：
        // - 实时行，event_ts_ms = 2026-09-07 03:00 北京（≈ Unix 1.757e12 ms）
        // - legacy_aggregate 行，event_ts_ms = 2026-09-08 12:00 北京（故意比实时晚 1 天）
        // 期望 max_observed_at = 实时行的 event_ts_ms，**不是** legacy 的。
        let real_ts: i64 = 1_757_000_000_000;
        let legacy_ts: i64 = 1_757_100_800_000; // +30h 后
        let conn = db.conn();
        // 直接 INSERT 走 SQL——绕过 writer 校验（这是测试，不是生产写入）。
        conn.execute(
            "INSERT INTO sync_runs(run_id, started_at_ms, completed_at_ms, trigger, status, schema_version)
             VALUES ('run1', ?1, ?1, 'cli', 'succeeded', 1)",
            rusqlite::params![1_700_000_000_000_i64],
        ).unwrap();
        conn.execute(
            "INSERT INTO source_files(source_id, host, path_hash, size_bytes, mtime_ns,
                                     parser_version, first_seen_at_ms, last_seen_at_ms,
                                     last_successful_run_id)
             VALUES ('src-real', 'claude-code', 'h-real', 0, 0, 1, ?1, ?1, 'run1'),
                    ('src-legacy', 'claude-code', 'h-legacy', 0, 0, 1, ?2, ?2, 'run1')",
            rusqlite::params![real_ts, legacy_ts],
        ).unwrap();
        conn.execute(
            "INSERT INTO sessions(session_key, host, native_session_id, machine_namespace, last_observed_at_ms)
             VALUES ('sess-real', 'claude-code', 'real-1', 'test', ?1), ('sess-legacy', 'claude-code', 'legacy-1', 'test', ?2)",
            rusqlite::params![real_ts, legacy_ts],
        ).unwrap();
        conn.execute(
            "INSERT INTO usage_facts(fact_id, host, machine_namespace, native_session_id, source_event_id,
                                     observation_kind, event_ts_ms, output_tokens,
                                     source_id, ingested_run_id, created_at_ms, updated_at_ms)
             VALUES ('f-real', 'claude-code', 'test', 'real-1', 'e1', 'assistant-usage', ?1, 100,
                     'src-real', 'run1', ?1, ?1),
                    ('f-legacy', 'claude-code', 'test', 'legacy-1', 'e2', 'legacy_aggregate', ?2, 200,
                     'src-legacy', 'run1', ?2, ?2)",
            rusqlite::params![real_ts, legacy_ts],
        ).unwrap();

        let env = build_envelope(conn, "candidate", None, coverage_not_applicable(), vec![], json!({}));
        // committed_at = sync_run 的 started_at_ms = 2023-11-15 北京；不影响
        // S4 fix 的核心断言（`max_observed_at` 必须等于**实时行**的
        // event_ts_ms，不能被 legacy_aggregate 行拉到 30h 后）。
        let _committed_at = env["authority_revision"]["committed_at"].as_str().unwrap();
        let max_observed = env["authority_revision"]["max_observed_at"].as_str().unwrap();
        assert_eq!(max_observed, ms_to_rfc3339_beijing(real_ts),
            "max_observed_at must reflect real rows, not legacy_aggregate (legacy ts={legacy_ts}, max_observed={max_observed})");

        let _ = std::fs::remove_dir_all(&home);
    }

    #[test]
    fn rfc3339_beijing_formats_epoch_zero() {
        // epoch 0 = 1970-01-01T08:00:00 北京。
        assert_eq!(ms_to_rfc3339_beijing(0), "1970-01-01T08:00:00.000+08:00");
    }

    #[test]
    fn rfc3339_beijing_carries_millis_and_offset() {
        let s = ms_to_rfc3339_beijing(1_757_000_000_123);
        assert!(s.ends_with(".123+08:00"), "{s}");
        assert_eq!(s.len(), "2026-09-04T21:33:20.123+08:00".len());
    }

    #[test]
    fn tool_specs_and_dispatch_agree() {
        let names: Vec<_> = tool_specs().iter().map(|t| t.name).collect();
        assert!(names.contains(&"data_status"));
        // 每个注册的工具都有可分发的实现（不是 internal_error）。
        for name in names {
            let err = dispatch(name, &json!({}), Path::new("/nonexistent-data-home"))
                .err()
                .map(|e| e.code);
            assert_ne!(err, Some("internal_error"), "tool {name} not wired");
        }
    }

    #[test]
    fn tool_schemas_are_closed_objects() {
        for t in tool_specs() {
            assert_eq!(t.input_schema["type"], "object", "{}", t.name);
            assert_eq!(
                t.input_schema["additionalProperties"], json!(false),
                "{} input schema must forbid unknown fields (spec §6.4)", t.name
            );
        }
    }

    #[test]
    fn dispatch_rejects_unknown_arguments() {
        // M08：多余字段不能被静默吞掉。
        let err = dispatch("data_status", &json!({ "sneaky": 1 }), Path::new("/nope"))
            .unwrap_err();
        assert_eq!(err.code, "invalid_argument");
    }

    #[test]
    fn dispatch_rejects_non_object_arguments() {
        let err = dispatch("data_status", &json!("a string"), Path::new("/nope")).unwrap_err();
        assert_eq!(err.code, "invalid_argument");
    }

    #[test]
    fn map_open_error_covers_stable_codes() {
        assert_eq!(map_open_error(AuthorityError::MissingFile).code, "database_missing");
        assert_eq!(map_open_error(AuthorityError::Corrupt).code, "database_unreadable");
        assert_eq!(
            map_open_error(AuthorityError::NewerSchema { found: 2, supported: 1 }).code,
            "schema_too_new"
        );
        assert_eq!(
            map_open_error(AuthorityError::OlderSchema { found: 0 }).code,
            "schema_migration_required"
        );
    }

    // PR #1 (mcp 0.9.1 SQL authority 收口)：CLI 二进制侧复用 mcp 模块的
    // 内部 helper（`check_as_of_run_id` / cursor 解析），确认 wrapper 行为
    // 与内部版一致——这是 PR #2 「CLI 切 mcp::dispatch」的前置不变式。
    #[test]
    fn check_as_of_run_id_pub_wrapper_agrees_with_internal() {
        // 不传 `as_of_run_id` → 两版都 Ok(())，warnings 不变。
        let mut w_internal: Vec<Value> = Vec::new();
        let mut w_pub: Vec<Value> = Vec::new();
        // 无 conn 也能跑这条快路径——前两个分支只看 `args`，不查 conn。
        let no_conn = || {
            // 拿一个空打开的 db——不必真有数据。
            let home = std::env::temp_dir().join(format!(
                "avmcp-asof-empty-{}-{}",
                std::process::id(),
                std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap()
                    .as_nanos()
            ));
            std::fs::create_dir_all(&home).unwrap();
            let path = agent_vitals_data::authority::default_authority_path(&home);
            let db = AuthorityDb::open(&path, 1).unwrap();
            (db, home)
        };
        let (db, home) = no_conn();
        check_as_of_run_id(db.conn(), &json!({}), &mut w_internal).unwrap();
        check_as_of_run_id_pub(db.conn(), &json!({}), &mut w_pub).unwrap();
        assert_eq!(w_internal, w_pub);
        assert!(w_internal.is_empty());
        let _ = std::fs::remove_dir_all(&home);

        // 传了一个 run_id 但库里无任何 sync_runs → 两版都 invalid_argument + 同 message。
        let (db, home) = no_conn();
        let mut w_int = Vec::new();
        let mut w_pub = Vec::new();
        let err_int = check_as_of_run_id(db.conn(), &json!({"as_of_run_id": "run-x"}), &mut w_int).unwrap_err();
        let err_pub = check_as_of_run_id_pub(db.conn(), &json!({"as_of_run_id": "run-x"}), &mut w_pub).unwrap_err();
        assert_eq!(err_int.code, err_pub.code);
        assert_eq!(err_int.code, "invalid_argument");
        assert_eq!(err_int.message, err_pub.message);
        let _ = std::fs::remove_dir_all(&home);
    }
}
