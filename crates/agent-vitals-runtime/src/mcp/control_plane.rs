//! Typed MCP control-plane operations shared with the desktop workbench.
//!
//! Read actions are safe projections of the same runtime/data APIs used by the
//! UI. Mutating actions are intentionally local-only and require the explicit
//! `--allow-local-writes` server flag. There is no generic SQL, URL, or file
//! write escape hatch here.

use std::path::{Path, PathBuf};

use agent_vitals_data::authority::AuthorityDb;
use agent_vitals_data::repository::SummaryRepository;
use serde_json::{json, Value};

use super::{build_envelope, coverage_not_applicable, AuthorityHandle, ToolError, ToolSpec};

const ACTIONS: &[&str] = &[
    "dashboard_snapshot", "source_status", "custom_sources", "source_controls",
    "retention_get", "statistics_timezone_get", "sync_state", "daily_summary",
    "monthly_summary", "calendar_month", "hourly_distribution", "codex_quota",
    "pricing_catalog_status", "issues_list", "custom_source_add", "custom_source_remove", "source_exclusion_set",
    "source_data_delete", "retention_set", "statistics_timezone_set", "sync_pause_set",
    "sync_facts", "issue_transition", "pricing_catalog_policy_set",
];

const MUTATIONS: &[&str] = &[
    "custom_source_add", "custom_source_remove", "source_exclusion_set",
    "source_data_delete", "retention_set", "statistics_timezone_set", "sync_pause_set",
    "sync_facts", "issue_transition", "pricing_catalog_policy_set",
];

pub fn spec() -> ToolSpec {
    ToolSpec {
        name: "control_plane",
        description: "Typed local control-plane API shared with the Agent Vitals workbench. Reads expose safe source, sync, configuration, summary, quota, and issue projections. Mutations never accept SQL or arbitrary URLs and require the explicit --allow-local-writes server flag.",
        input_schema: json!({
            "type": "object",
            "properties": {
                "action": { "type": "string", "enum": ACTIONS },
                "host": { "type": "string" },
                "root": { "type": "string" },
                "excluded": { "type": "boolean" },
                "confirmation": { "type": "string" },
                "months": { "type": "integer" },
                "timezone": { "type": "string" },
                "network_enabled": { "type": "boolean" },
                "paused": { "type": "boolean" },
                "date": { "type": "string" },
                "month": { "type": "string" },
                "from_ms": { "type": "integer" },
                "to_ms": { "type": "integer" },
                "page_size": { "type": "integer" },
                "cursor": { "type": "string" },
                "issue_id": { "type": "string" },
                "to_status": { "type": "string" },
                "reason": { "type": ["string", "null"] }
            },
            "required": ["action"],
            "additionalProperties": false
        }),
        output_schema: json!({
            "type": "object",
            "description": "Standard MCP envelope. The data member contains a typed control-plane result; absolute local paths are not returned."
        }),
    }
}

pub fn run(args: &Value, data_home: &Path, allow_local_writes: bool) -> Result<Value, ToolError> {
    let action = required_string(args, "action")?;
    if !ACTIONS.contains(&action) {
        return Err(ToolError::new("invalid_argument", format!("unsupported control-plane action `{action}`")));
    }
    if MUTATIONS.contains(&action) && !allow_local_writes {
        return Err(ToolError::new(
            "permission_denied",
            "control-plane mutation requires the explicit `--allow-local-writes` server flag; default MCP remains read-only",
        ));
    }
    if MUTATIONS.contains(&action) {
        write_run(action, args, data_home)
    } else {
        read_run(action, args, data_home)
    }
}

fn read_run(action: &str, args: &Value, data_home: &Path) -> Result<Value, ToolError> {
    let handle = AuthorityHandle::open(data_home)?;
    let data = match action {
        "dashboard_snapshot" => {
            let mut sources = source_status(data_home, handle.conn())?;
            let sync = sync_state(data_home)?;
            if sync["paused"] == Value::Bool(true) {
                mark_paused(&mut sources);
            }
            json!({
                "action": action,
                "data_status": super::dispatch("data_status", &json!({}), data_home)
                    .map_err(|error| ToolError::new(error.code, error.message))?,
                "source_status": sources,
                "custom_sources": custom_sources(data_home)?,
                "retention_months": crate::retention::retention_months(data_home)
                    .map_err(local_error)?,
                "statistics_timezone": crate::statistics_timezone::timezone_name(data_home)
                    .map_err(local_error)?,
                "sync": sync,
            })
        }
        "source_status" => json!({ "action": action, "source_status": source_status(data_home, handle.conn())? }),
        "custom_sources" => json!({ "action": action, "sources": custom_sources(data_home)? }),
        "source_controls" => json!({
            "action": action,
            "excluded_hosts": crate::source_controls::excluded_hosts(data_home).map_err(local_error)?,
            "supported_hosts": crate::source_controls::supported_hosts_for(data_home)
        }),
        "retention_get" => json!({
            "action": action,
            "months": crate::retention::retention_months(data_home).map_err(local_error)?
        }),
        "statistics_timezone_get" => json!({
            "action": action,
            "timezone": crate::statistics_timezone::timezone_name(data_home).map_err(local_error)?
        }),
        "sync_state" => json!({ "action": action, "sync": sync_state(data_home)? }),
        "daily_summary" => {
            let date = required_string(args, "date")?;
            let summary = crate::summary::SqlSummaryRepository::at(data_home)
                .daily_summary(&agent_vitals_data::repository::DailySummaryQuery { date: date.to_owned() });
            json!({ "action": action, "date": date, "summary": summary.to_json() })
        }
        "monthly_summary" => {
            let month = required_string(args, "month")?;
            let summary = crate::summary::SqlSummaryRepository::at(data_home)
                .monthly_summary(&agent_vitals_data::repository::MonthlySummaryQuery { month: month.to_owned() });
            json!({ "action": action, "month": month, "summary": summary.to_json() })
        }
        "calendar_month" => {
            let month = required_string(args, "month")?;
            json!({ "action": action, "month": month,
                "calendar": crate::summary::calendar_month(month, &crate::summary::codex_home()) })
        }
        "hourly_distribution" => {
            let date = required_string(args, "date")?;
            json!({ "action": action, "date": date,
                "distribution": crate::summary::hourly_distribution(date, &crate::summary::codex_home()) })
        }
        "codex_quota" => json!({
            "action": action,
            "quota": crate::summary::codex_quota_snapshot(&crate::summary::codex_home())
        }),
        "pricing_catalog_status" => json!({
            "action": action,
            "pricing": pricing_catalog_status(data_home)?,
        }),
        "issues_list" => {
            let (from_ms, to_ms) = issue_window(args);
            let page_size = args.get("page_size").and_then(Value::as_u64).unwrap_or(50).min(500) as usize;
            let cursor = args.get("cursor").and_then(Value::as_str);
            let groups = agent_vitals_data::issues::issue_groups_with_sources(
                handle.conn(), from_ms, to_ms, page_size, cursor,
            ).map_err(|error| ToolError::new("authority_query", error.to_string()))?;
            json!({ "action": action, "issues": groups })
        }
        _ => return Err(ToolError::new("invalid_argument", format!("action `{action}` is not a read action"))),
    };
    Ok(build_envelope(
        handle.conn(), handle.authority_state(), None,
        coverage_not_applicable(), Vec::new(), data,
    ))
}

fn write_run(action: &str, args: &Value, data_home: &Path) -> Result<Value, ToolError> {
    let data = match action {
        "custom_source_add" => {
            let host = required_string(args, "host")?;
            let root = PathBuf::from(required_string(args, "root")?);
            let changed = crate::custom_sources::add_custom_source_root(data_home, host, &root)
                .map_err(local_error)?;
            json!({ "action": action, "host": host, "changed": changed })
        }
        "custom_source_remove" => {
            let host = required_string(args, "host")?;
            let root = PathBuf::from(required_string(args, "root")?);
            let changed = crate::custom_sources::remove_custom_source_root(data_home, host, &root)
                .map_err(local_error)?;
            json!({ "action": action, "host": host, "changed": changed })
        }
        "source_exclusion_set" => {
            let host = required_string(args, "host")?;
            let excluded = args.get("excluded").and_then(Value::as_bool)
                .ok_or_else(|| ToolError::new("invalid_argument", "`excluded` is required"))?;
            let changed = crate::source_controls::set_host_excluded(data_home, host, excluded)
                .map_err(local_error)?;
            json!({ "action": action, "host": host, "excluded": excluded, "changed": changed })
        }
        "source_data_delete" => {
            require_confirmation(args, "DELETE_IMPORTED_SOURCE_DATA")?;
            let host = required_string(args, "host")?;
            let deleted = crate::source_controls::delete_imported_source_data(data_home, host)
                .map_err(local_error)?;
            json!({ "action": action, "host": host, "excluded": true,
                "deleted": { "facts": deleted.facts, "sessions": deleted.sessions,
                    "source_files": deleted.source_files,
                    "trust_observations": deleted.trust_observations,
                    "route_evidence": deleted.route_evidence,
                    "session_excerpts": deleted.session_excerpts } })
        }
        "retention_set" => {
            let months = args.get("months").and_then(Value::as_u64)
                .and_then(|value| u32::try_from(value).ok())
                .ok_or_else(|| ToolError::new("invalid_argument", "`months` is required"))?;
            crate::retention::save_retention_months(data_home, months).map_err(local_error)?;
            json!({ "action": action, "months": months, "changed": true })
        }
        "statistics_timezone_set" => {
            let timezone = required_string(args, "timezone")?;
            let saved = crate::statistics_timezone::save_timezone(data_home, timezone)
                .map_err(local_error)?;
            let applied = crate::statistics_timezone::apply(data_home).map_err(local_error)?;
            json!({ "action": action, "timezone": saved, "applied_timezone": applied, "changed": true })
        }
        "sync_pause_set" => {
            let paused = args.get("paused").and_then(Value::as_bool)
                .ok_or_else(|| ToolError::new("invalid_argument", "`paused` is required"))?;
            crate::sync_control::set_paused(data_home, paused).map_err(local_error)?;
            json!({ "action": action, "paused": paused, "changed": true })
        }
        "pricing_catalog_policy_set" => {
            let network_enabled = args.get("network_enabled").and_then(Value::as_bool)
                .ok_or_else(|| ToolError::new("invalid_argument", "`network_enabled` is required"))?;
            save_pricing_catalog_policy(data_home, network_enabled)?;
            json!({ "action": action, "network_enabled": network_enabled, "changed": true })
        }
        "sync_facts" => {
            if crate::sync_control::is_paused(data_home).map_err(local_error)? {
                json!({ "action": action, "status": "paused", "report": Value::Null })
            } else {
                let report = crate::sync_service::sync_facts(data_home).map_err(local_error)?;
                json!({ "action": action, "status": "completed", "report": serde_json::to_value(report)
                    .map_err(|error| ToolError::new("internal_error", error.to_string()))? })
            }
        }
        "issue_transition" => {
            let issue_id = required_string(args, "issue_id")?;
            let to_status = required_string(args, "to_status")?;
            if !matches!(to_status, "open" | "later" | "acknowledged" | "resolved" |
                "not_applicable" | "closed" | "wontfix") {
                return Err(ToolError::new("invalid_argument", "unsupported issue target status"));
            }
            let reason = args.get("reason").and_then(Value::as_str).unwrap_or("user action");
            if reason.chars().count() > 512 {
                return Err(ToolError::new("invalid_argument", "reason is too long"));
            }
            let path = agent_vitals_data::authority::default_authority_path(data_home);
            let db = AuthorityDb::open(&path, crate::sql_sync::now_ms()).map_err(authority_error)?;
            let now = crate::sql_sync::now_ms();
            let evidence = format!("mcp-user-action:{to_status}");
            let fingerprint = format!("mcp-transition:{issue_id}:{to_status}:{reason}");
            let transition_id = db.with_immediate_txn(|conn| {
                agent_vitals_data::issues::transition_issue(
                    conn, issue_id, to_status, now, reason, "user", &evidence,
                    "user", "v1.0.0", &fingerprint,
                ).map_err(agent_vitals_data::authority::AuthorityError::Sqlite)
            }).map_err(authority_error)?;
            json!({ "action": action, "issue_id": issue_id, "to_status": to_status,
                "transition_id": transition_id })
        }
        _ => return Err(ToolError::new("invalid_argument", format!("action `{action}` is not a write action"))),
    };
    let path = agent_vitals_data::authority::default_authority_path(data_home);
    let db = AuthorityDb::open_readonly(&path).map_err(authority_error)?;
    Ok(build_envelope(
        db.conn(), super::authority_state_for(data_home), None,
        coverage_not_applicable(), Vec::new(), data,
    ))
}

fn source_status(data_home: &Path, conn: &rusqlite::Connection) -> Result<Value, ToolError> {
    let mut report = super::source_status_report(conn).map_err(local_error)?;
    let excluded = crate::source_controls::excluded_hosts(data_home).map_err(local_error)?;
    if let Some(sources) = report.get_mut("sources").and_then(Value::as_array_mut) {
        for source in sources {
            let host = source.get("host").and_then(Value::as_str).unwrap_or("");
            if excluded.contains(host) {
                source["connection_state"] = Value::String("excluded".to_string());
                source["recovery_action"] = json!({ "kind": "include_source", "label": "恢复读取" });
            }
        }
    }
    Ok(report)
}

fn mark_paused(report: &mut Value) {
    if let Some(sources) = report.get_mut("sources").and_then(Value::as_array_mut) {
        for source in sources {
            if source.get("connection_state").and_then(Value::as_str) == Some("excluded") {
                continue;
            }
            source["connection_state"] = Value::String("paused".to_string());
            source["recovery_action"] = json!({ "kind": "resume_sync", "label": "恢复同步" });
        }
    }
}

fn custom_sources(data_home: &Path) -> Result<Value, ToolError> {
    let sources = crate::custom_sources::custom_source_roots(data_home).map_err(local_error)?;
    // The UI can display the local root, but MCP responses must not export
    // absolute paths. Callers that manage a root already know the path they
    // supplied to the typed add/remove action.
    Ok(json!({
        "configured_count": sources.len(),
        "hosts": sources.iter().map(|source| source.host.as_str()).collect::<Vec<_>>(),
    }))
}

fn sync_state(data_home: &Path) -> Result<Value, ToolError> {
    Ok(json!({ "status": "ok", "paused": crate::sync_control::is_paused(data_home).map_err(local_error)? }))
}

const PUBLIC_PRICING_CATALOG_URL: &str =
    "https://raw.githubusercontent.com/MixLabPro/agent-vitals/main/assets/pricing.json";
const PRICING_UPDATE_STATUS_FILE: &str = "pricing-catalog-update.json";
const PRICING_UPDATE_POLICY_FILE: &str = "pricing-catalog-policy.json";

fn pricing_catalog_status(data_home: &Path) -> Result<Value, ToolError> {
    let status = data_home.join(PRICING_UPDATE_STATUS_FILE);
    let mut value = std::fs::read(&status)
        .ok()
        .and_then(|bytes| serde_json::from_slice::<Value>(&bytes).ok())
        .filter(Value::is_object)
        .unwrap_or_else(|| json!({
            "state": "never_checked",
            "source_url": PUBLIC_PRICING_CATALOG_URL,
            "last_checked_at_ms": null,
            "last_success_at_ms": null,
            "source_version": null,
            "model_count": null,
            "failure_reason": null,
            "failure_count": 0,
            "next_check_at_ms": null,
        }));
    let network_enabled = std::fs::read(data_home.join(PRICING_UPDATE_POLICY_FILE))
        .ok()
        .and_then(|bytes| serde_json::from_slice::<Value>(&bytes).ok())
        .and_then(|policy| policy.get("network_enabled").and_then(Value::as_bool))
        .unwrap_or(false);
    let object = value.as_object_mut().expect("status is normalized to an object");
    object.insert("source_url".into(), Value::String(PUBLIC_PRICING_CATALOG_URL.into()));
    object.insert("network_enabled".into(), Value::Bool(network_enabled));
    Ok(value)
}

fn save_pricing_catalog_policy(data_home: &Path, network_enabled: bool) -> Result<(), ToolError> {
    std::fs::create_dir_all(data_home).map_err(|error| local_error(format!("create data home failed: {error}")))?;
    let path = data_home.join(PRICING_UPDATE_POLICY_FILE);
    let temp = data_home.join("pricing-catalog-policy.json.tmp");
    let bytes = serde_json::to_vec_pretty(&json!({ "network_enabled": network_enabled }))
        .map_err(|error| ToolError::new("internal_error", format!("serialize pricing policy failed: {error}")))?;
    std::fs::write(&temp, bytes)
        .map_err(|error| local_error(format!("write pricing policy failed: {error}")))?;
    std::fs::rename(&temp, path)
        .map_err(|error| local_error(format!("commit pricing policy failed: {error}")))
}

fn issue_window(args: &Value) -> (Option<i64>, Option<i64>) {
    let now = crate::sql_sync::now_ms();
    (
        args.get("from_ms").and_then(Value::as_i64).or_else(|| Some(now.saturating_sub(30 * 24 * 60 * 60 * 1000))),
        args.get("to_ms").and_then(Value::as_i64).or_else(|| Some(now.saturating_add(1))),
    )
}

fn require_confirmation(args: &Value, expected: &str) -> Result<(), ToolError> {
    if args.get("confirmation").and_then(Value::as_str) == Some(expected) {
        Ok(())
    } else {
        Err(ToolError::new("confirmation_required", format!("this action requires confirmation `{expected}`")))
    }
}

fn required_string<'a>(args: &'a Value, key: &str) -> Result<&'a str, ToolError> {
    args.get(key).and_then(Value::as_str).filter(|value| !value.is_empty())
        .ok_or_else(|| ToolError::new("invalid_argument", format!("`{key}` is required")))
}

fn local_error(error: String) -> ToolError {
    ToolError::new("invalid_argument", error)
}

fn authority_error(error: agent_vitals_data::authority::AuthorityError) -> ToolError {
    match error {
        agent_vitals_data::authority::AuthorityError::MissingFile => ToolError::new("database_missing", "authority DB does not exist"),
        agent_vitals_data::authority::AuthorityError::Corrupt => ToolError::new("database_unreadable", "authority DB is corrupt or unreadable"),
        agent_vitals_data::authority::AuthorityError::NewerSchema { found, supported } => ToolError::new("schema_too_new", format!("authority schema v{found} is newer than supported v{supported}")),
        agent_vitals_data::authority::AuthorityError::OlderSchema { found } => ToolError::new("schema_migration_required", format!("authority schema v{found} is older than supported")),
        other => ToolError::new("internal_error", other.to_string()),
    }
}
