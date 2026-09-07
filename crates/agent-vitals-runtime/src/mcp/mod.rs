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
            "SELECT MAX(event_ts_ms) FROM usage_facts WHERE deleted_at_ms IS NULL",
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
    vec![data_status::spec()]
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
        other => Err(ToolError::new("internal_error", format!("tool `{other}` registered but not wired"))),
    }
}

/// 极简参数校验（spec §6.4：`additionalProperties: false` + 未知字段 →
/// `invalid_argument`）。**不做**完整 JSON Schema——只挡「不是对象」和「多余
/// 字段」两类，够 M08 注入防护；参数一多再引 schema crate。
fn validate_args(spec: &ToolSpec, args: &Value) -> Result<(), ToolError> {
    let obj = args
        .as_object()
        .ok_or_else(|| ToolError::new("invalid_argument", "`arguments` must be a JSON object"))?;
    if spec.input_schema.get("additionalProperties") == Some(&Value::Bool(false)) {
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
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

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
}
