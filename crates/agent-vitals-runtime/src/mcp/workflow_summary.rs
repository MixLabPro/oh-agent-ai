//! Read-only MCP projections over the redacted `workflow_events` authority
//! table.  The query layer never reads prompt/argument/error text; fingerprints
//! and capability names are the only identifiers exposed.

use std::path::Path;

use rusqlite::{Connection, params_from_iter, types::Value as SqlValue};
use serde_json::{Value, json};

use super::{AuthorityHandle, ToolError, ToolSpec, build_envelope, check_as_of_run_id};

pub fn issues_spec() -> ToolSpec {
    ToolSpec {
        name: "issues_summary",
        description: "Summarize repeated workflow errors, tool retries, denied approvals, and incomplete workflow evidence without exposing raw errors or invocation arguments.",
        input_schema: json!({
            "type": "object",
            "properties": {
                "from": { "type": "string", "description": "Inclusive statistics date YYYY-MM-DD." },
                "to": { "type": "string", "description": "Inclusive statistics date YYYY-MM-DD." },
                "hosts": { "type": "array", "items": { "type": "string" } },
                "skills": { "type": "array", "items": { "type": "string" } },
                "group_by": { "type": "string", "enum": ["category", "fingerprint", "capability"] },
                "limit": { "type": "integer", "minimum": 1, "maximum": 200 },
                "as_of_run_id": { "type": "string" }
            },
            "required": ["from", "to"],
            "additionalProperties": false
        }),
        output_schema: json!({
            "type": "object",
            "description": "Standard envelope; data.issues contains safe grouped issue rows and explicit token/cost linkage status."
        }),
    }
}

pub fn skills_spec() -> ToolSpec {
    ToolSpec {
        name: "skills_summary",
        description: "Summarize observed Skill invocations with explicit success, failure, unknown, retry, duration, and coverage states; never infer value from low usage.",
        input_schema: json!({
            "type": "object",
            "properties": {
                "from": { "type": "string", "description": "Inclusive statistics date YYYY-MM-DD." },
                "to": { "type": "string", "description": "Inclusive statistics date YYYY-MM-DD." },
                "skills": { "type": "array", "items": { "type": "string" } },
                "sort": { "type": "string", "enum": ["calls", "failures", "duration"] },
                "limit": { "type": "integer", "minimum": 1, "maximum": 200 },
                "as_of_run_id": { "type": "string" }
            },
            "required": ["from", "to"],
            "additionalProperties": false
        }),
        output_schema: json!({
            "type": "object",
            "description": "Standard envelope; data.skills contains safe Skill rows and every ratio carries numerator, denominator, and coverage."
        }),
    }
}

struct Window {
    from: String,
    to: String,
    start_ms: i64,
    end_ms: i64,
}

fn parse_window(args: &Value) -> Result<Window, ToolError> {
    let from = args.get("from").and_then(Value::as_str).ok_or_else(|| {
        ToolError::new("invalid_argument", "`from` (YYYY-MM-DD) is required")
    })?;
    let to = args.get("to").and_then(Value::as_str).ok_or_else(|| {
        ToolError::new("invalid_argument", "`to` (YYYY-MM-DD) is required")
    })?;
    let (start_ms, _) = agent_vitals_data::authority_query::beijing_day_bounds_ms(from)
        .ok_or_else(|| ToolError::new("invalid_argument", format!("invalid `from`: {from}")))?;
    let (_, end_ms) = agent_vitals_data::authority_query::beijing_day_bounds_ms(to)
        .ok_or_else(|| ToolError::new("invalid_argument", format!("invalid `to`: {to}")))?;
    if start_ms >= end_ms {
        return Err(ToolError::new("invalid_argument", "`to` must be after `from`"));
    }
    Ok(Window { from: from.to_string(), to: to.to_string(), start_ms, end_ms })
}

fn list_arg(args: &Value, key: &str) -> Result<Vec<String>, ToolError> {
    match args.get(key) {
        None => Ok(Vec::new()),
        Some(Value::Array(values)) => values
            .iter()
            .map(|value| {
                value.as_str().filter(|v| !v.is_empty()).map(str::to_string).ok_or_else(|| {
                    ToolError::new("invalid_argument", format!("`{key}` must contain non-empty strings"))
                })
            })
            .collect(),
        Some(_) => Err(ToolError::new("invalid_argument", format!("`{key}` must be an array"))),
    }
}

fn limit_arg(args: &Value) -> Result<i64, ToolError> {
    match args.get("limit") {
        None => Ok(50),
        Some(value) => {
            let limit = value.as_i64().ok_or_else(|| ToolError::new("invalid_argument", "`limit` must be an integer"))?;
            if !(1..=200).contains(&limit) {
                return Err(ToolError::new("invalid_argument", "`limit` must be between 1 and 200"));
            }
            Ok(limit)
        }
    }
}

fn append_scope_filter(
    sql: &mut String,
    values: &mut Vec<SqlValue>,
    next_param: &mut usize,
    hosts: &[String],
    capabilities: &[String],
) {
    if !hosts.is_empty() {
        let placeholders = (0..hosts.len())
            .map(|_| {
                let value = format!("?{next_param}");
                *next_param += 1;
                value
            })
            .collect::<Vec<_>>()
            .join(",");
        sql.push_str(&format!(" AND s.host IN ({placeholders})"));
        values.extend(hosts.iter().cloned().map(SqlValue::Text));
    }
    if !capabilities.is_empty() {
        let placeholders = (0..capabilities.len())
            .map(|_| {
                let value = format!("?{next_param}");
                *next_param += 1;
                value
            })
            .collect::<Vec<_>>()
            .join(",");
        sql.push_str(&format!(" AND e.capability_id IN ({placeholders})"));
        values.extend(capabilities.iter().cloned().map(SqlValue::Text));
    }
}

fn workflow_count(
    conn: &Connection,
    window: &Window,
    hosts: &[String],
    capabilities: &[String],
) -> Result<i64, ToolError> {
    let mut sql = String::from(
        "SELECT COUNT(*) FROM workflow_events e
         LEFT JOIN sessions s ON s.session_key = e.session_key
         WHERE e.event_ts_ms >= ?1 AND e.event_ts_ms < ?2",
    );
    let mut values = vec![
        SqlValue::Integer(window.start_ms),
        SqlValue::Integer(window.end_ms),
    ];
    let mut next_param = 3;
    append_scope_filter(&mut sql, &mut values, &mut next_param, hosts, capabilities);
    conn.query_row(&sql, params_from_iter(values.iter()), |row| row.get(0))
        .map_err(|e| ToolError::new("internal_error", format!("workflow event count failed: {e}")))
}

fn workflow_hosts(
    conn: &Connection,
    window: &Window,
    hosts: &[String],
    capabilities: &[String],
) -> Result<Vec<String>, ToolError> {
    let mut sql = String::from(
        "SELECT DISTINCT s.host FROM workflow_events e
         JOIN sessions s ON s.session_key = e.session_key
         WHERE e.event_ts_ms >= ?1 AND e.event_ts_ms < ?2
           AND s.host IS NOT NULL",
    );
    let mut values = vec![
        SqlValue::Integer(window.start_ms),
        SqlValue::Integer(window.end_ms),
    ];
    let mut next_param = 3;
    append_scope_filter(&mut sql, &mut values, &mut next_param, hosts, capabilities);
    sql.push_str(" ORDER BY s.host");
    let mut statement = conn
        .prepare(&sql)
        .map_err(|e| ToolError::new("internal_error", format!("workflow host coverage query failed: {e}")))?;
    let mut rows = statement
        .query(params_from_iter(values.iter()))
        .map_err(|e| ToolError::new("internal_error", format!("workflow host coverage query failed: {e}")))?;
    let mut out = Vec::new();
    while let Some(row) = rows
        .next()
        .map_err(|e| ToolError::new("internal_error", format!("workflow host coverage row failed: {e}")))?
    {
        out.push(
            row.get(0)
                .map_err(|e| ToolError::new("internal_error", format!("workflow host coverage row failed: {e}")))?,
        );
    }
    Ok(out)
}

fn coverage(
    conn: &Connection,
    window: &Window,
    observed: i64,
    hosts: &[String],
    capabilities: &[String],
    missing: &[&str],
) -> Result<Value, ToolError> {
    let observed_hosts = workflow_hosts(conn, window, hosts, capabilities)?;
    let status = if observed == 0 { "unavailable" } else { "partial" };
    Ok(json!({
        "status": status,
        "source": "workflow_events",
        "observed_events": observed,
        "observed_hosts": observed_hosts,
        "host_scope": if hosts.is_empty() { Value::String("observed_hosts".to_string()) } else { json!(hosts) },
        "requested_from": super::ms_to_rfc3339_beijing(window.start_ms),
        "requested_to": super::ms_to_rfc3339_beijing(window.end_ms),
        "missing": missing,
        "reason": if observed == 0 { "no accepted workflow events match the requested window and filters" } else { "workflow lifecycle and token/cost attribution evidence is still incomplete" },
        "host_absence_is_not_missing": true
    }))
}

pub fn run_issues(args: &Value, data_home: &Path) -> Result<Value, ToolError> {
    let window = parse_window(args)?;
    let hosts = list_arg(args, "hosts")?;
    let skills = list_arg(args, "skills")?;
    let group_by = args.get("group_by").and_then(Value::as_str).unwrap_or("category");
    if !matches!(group_by, "category" | "fingerprint" | "capability") {
        return Err(ToolError::new("invalid_argument", "`group_by` must be category, fingerprint, or capability"));
    }
    let limit = limit_arg(args)?;
    let mut warnings = Vec::new();
    let handle = AuthorityHandle::open(data_home)?;
    check_as_of_run_id(handle.conn(), args, &mut warnings)?;

    let mut filter_sql = String::new();
    let mut values = vec![
        SqlValue::Integer(window.start_ms),
        SqlValue::Integer(window.end_ms),
    ];
    let mut next_param = 3;
    if !hosts.is_empty() {
        let placeholders = (0..hosts.len())
            .map(|_| {
                let value = format!("?{next_param}");
                next_param += 1;
                value
            })
            .collect::<Vec<_>>()
            .join(",");
        filter_sql.push_str(&format!(" AND s.host IN ({placeholders})"));
        values.extend(hosts.iter().cloned().map(SqlValue::Text));
    }
    if !skills.is_empty() {
        let placeholders = (0..skills.len())
            .map(|_| {
                let value = format!("?{next_param}");
                next_param += 1;
                value
            })
            .collect::<Vec<_>>()
            .join(",");
        filter_sql.push_str(&format!(" AND e.capability_id IN ({placeholders})"));
        values.extend(skills.iter().cloned().map(SqlValue::Text));
    }
    let limit_param = next_param;
    values.push(SqlValue::Integer(limit));
    let sql = format!(
        "WITH scoped AS (
           SELECT e.event_type, e.capability_id, e.error_fingerprint,
                  e.invocation_fingerprint, e.outcome, e.event_ts_ms,
                  e.session_key
           FROM workflow_events e
           LEFT JOIN sessions s ON s.session_key = e.session_key
           WHERE e.event_ts_ms >= ?1 AND e.event_ts_ms < ?2
             AND (e.error_fingerprint IS NOT NULL OR e.outcome = 'failed'
                  OR e.event_type = 'approval_denied'
                  OR e.event_type = 'tool_invoked'){filter_sql}
        ), grouped AS (
           SELECT CASE
                    WHEN error_fingerprint IS NOT NULL THEN 'error_fingerprint'
                    WHEN event_type = 'approval_denied' THEN 'approval_denied'
                    WHEN event_type = 'tool_invoked' THEN 'repeated_tool_call'
                    ELSE 'failed_workflow'
                  END AS category,
                  COALESCE(error_fingerprint, invocation_fingerprint,
                           capability_id, event_type) AS safe_key,
                  COUNT(*) AS occurrences,
                  COUNT(DISTINCT session_key) AS sessions,
                  MIN(event_ts_ms) AS first_ms,
                  MAX(event_ts_ms) AS last_ms
           FROM scoped
           GROUP BY category, safe_key
        )
        SELECT category, safe_key, occurrences, sessions, first_ms, last_ms
        FROM grouped
        WHERE category != 'repeated_tool_call' OR occurrences > 1
        ORDER BY occurrences DESC, category, safe_key
        LIMIT ?{limit_param}"
    );
    let mut statement = handle.conn().prepare(&sql)
        .map_err(|e| ToolError::new("internal_error", format!("issues summary query failed: {e}")))?;
    let mut rows = statement.query(params_from_iter(values.iter()))
        .map_err(|e| ToolError::new("internal_error", format!("issues summary query failed: {e}")))?;
    let mut issues = Vec::new();
    while let Some(row) = rows.next().map_err(|e| ToolError::new("internal_error", format!("issues summary row failed: {e}")))? {
        let category: String = row.get(0).map_err(|e| ToolError::new("internal_error", format!("issues summary row failed: {e}")))?;
        let safe_key: String = row.get(1).map_err(|e| ToolError::new("internal_error", format!("issues summary row failed: {e}")))?;
        let occurrences: i64 = row.get(2).unwrap_or(0);
        let sessions: i64 = row.get(3).unwrap_or(0);
        let first_ms: i64 = row.get(4).unwrap_or(0);
        let last_ms: i64 = row.get(5).unwrap_or(0);
        issues.push(json!({
        "category": category,
        "fingerprint": safe_key,
        "occurrences": occurrences,
            "is_repeated": occurrences > 1,
            "affected_sessions": sessions,
            "tokens": { "value": Value::Null, "status": "unknown", "reason": "workflow-to-usage attribution is not unique" },
            "cost": { "value": Value::Null, "status": "unknown", "reason": "workflow-to-cost attribution is not unique" },
            "first_seen": super::ms_to_rfc3339_beijing(first_ms),
            "last_seen": super::ms_to_rfc3339_beijing(last_ms),
            "trend": { "status": "unknown", "reason": "workflow baseline is not complete" }
        }));
    }
    let observed = workflow_count(handle.conn(), &window, &hosts, &skills)?;
    if observed == 0 {
        warnings.push(json!({ "code": "workflow_coverage_insufficient", "message": "No accepted workflow events fall in the requested window; an empty issue list is not a proof of no issues." }));
    }
    let cov = coverage(
        handle.conn(),
        &window,
        observed,
        &hosts,
        &skills,
        &["unique token/cost linkage", "complete retry baseline"],
    )?;
    Ok(build_envelope(handle.conn(), handle.authority_state(), (observed > 0).then_some(window.end_ms), cov, warnings, json!({
        "from": window.from, "to": window.to, "issues": issues, "has_more": false, "next_cursor": Value::Null
    })))
}

pub fn run_skills(args: &Value, data_home: &Path) -> Result<Value, ToolError> {
    let window = parse_window(args)?;
    let skills = list_arg(args, "skills")?;
    let limit = limit_arg(args)?;
    let sort = args.get("sort").and_then(Value::as_str).unwrap_or("calls");
    if !matches!(sort, "calls" | "failures" | "duration") {
        return Err(ToolError::new("invalid_argument", "`sort` must be calls, failures, or duration"));
    }
    let mut warnings = Vec::new();
    let handle = AuthorityHandle::open(data_home)?;
    check_as_of_run_id(handle.conn(), args, &mut warnings)?;
    let mut filter_sql = String::new();
    let mut values = vec![
        SqlValue::Integer(window.start_ms),
        SqlValue::Integer(window.end_ms),
    ];
    let mut next_param = 3;
    if !skills.is_empty() {
        let placeholders = (0..skills.len())
            .map(|_| {
                let value = format!("?{next_param}");
                next_param += 1;
                value
            })
            .collect::<Vec<_>>()
            .join(",");
        filter_sql.push_str(&format!(" AND capability_id IN ({placeholders})"));
        values.extend(skills.iter().cloned().map(SqlValue::Text));
    }
    let limit_param = next_param;
    values.push(SqlValue::Integer(limit));
    let sql = format!(
        "SELECT capability_id, COUNT(*) AS calls,
                COUNT(DISTINCT session_key) AS sessions,
                SUM(CASE WHEN outcome='succeeded' THEN 1 ELSE 0 END),
                SUM(CASE WHEN outcome='failed' THEN 1 ELSE 0 END),
                SUM(CASE WHEN outcome='unknown' THEN 1 ELSE 0 END),
                AVG(duration_ms), MAX(event_ts_ms)
         FROM workflow_events
         WHERE event_type='skill_invoked'
           AND event_ts_ms >= ?1 AND event_ts_ms < ?2
           AND capability_id IS NOT NULL{filter_sql}
         GROUP BY capability_id
         ORDER BY {} DESC, capability_id
         LIMIT ?{limit_param}",
        match sort { "failures" => "SUM(CASE WHEN outcome='failed' THEN 1 ELSE 0 END)", "duration" => "COALESCE(AVG(duration_ms),0)", _ => "COUNT(*)" }
    );
    let mut stmt = handle.conn().prepare(&sql)
        .map_err(|e| ToolError::new("internal_error", format!("skills summary query failed: {e}")))?;
    let mut rows = stmt.query(params_from_iter(values.iter()))
        .map_err(|e| ToolError::new("internal_error", format!("skills summary query failed: {e}")))?;
    let mut out = Vec::new();
    while let Some(row) = rows.next().map_err(|e| ToolError::new("internal_error", format!("skills summary row failed: {e}")))? {
        let skill: String = row.get(0).map_err(|e| ToolError::new("internal_error", format!("skills summary row failed: {e}")))?;
        let calls: i64 = row.get(1).unwrap_or(0);
        let sessions: i64 = row.get(2).unwrap_or(0);
        let succeeded: i64 = row.get(3).unwrap_or(0);
        let failed: i64 = row.get(4).unwrap_or(0);
        let unknown: i64 = row.get(5).unwrap_or(0);
        let avg_duration: Option<f64> = row.get(6).unwrap_or(None);
        let last_ms: i64 = row.get(7).unwrap_or(0);
        out.push(json!({
            "skill": skill,
            "calls": calls,
            "sessions": sessions,
            "outcomes": { "succeeded": succeeded, "failed": failed, "unknown": unknown },
            "success_rate": { "numerator": succeeded, "denominator": calls, "coverage": if unknown > 0 { "partial" } else { "complete" }, "value": if unknown > 0 { Value::Null } else { json!(succeeded as f64 / calls.max(1) as f64) } },
            "retry_rate": { "numerator": Value::Null, "denominator": calls, "coverage": "unknown", "value": Value::Null, "reason": "skill invocation fingerprints are not yet paired with a retry lifecycle" },
            "duration_ms": { "average": avg_duration, "coverage": if avg_duration.is_some() { "partial" } else { "unknown" } },
            "tokens": { "value": Value::Null, "coverage": "unknown", "reason": "workflow-to-usage attribution is not unique" },
            "cost": { "value": Value::Null, "coverage": "unknown", "reason": "workflow-to-cost attribution is not unique" },
            "last_seen": super::ms_to_rfc3339_beijing(last_ms)
        }));
    }
    let observed = workflow_count(handle.conn(), &window, &[], &skills)?;
    if observed == 0 {
        warnings.push(json!({ "code": "workflow_coverage_insufficient", "message": "No accepted workflow events fall in the requested window; an empty Skill list is not a proof that no Skill was used." }));
    }
    let cov = coverage(
        handle.conn(),
        &window,
        observed,
        &[],
        &skills,
        &["skill_finished", "complete duration", "unique token/cost linkage"],
    )?;
    Ok(build_envelope(handle.conn(), handle.authority_state(), (observed > 0).then_some(window.end_ms), cov, warnings, json!({
        "from": window.from, "to": window.to, "skills": out, "has_more": false, "next_cursor": Value::Null
    })))
}

#[cfg(test)]
mod tests {
    use super::{run_issues, run_skills};
    use agent_vitals_data::authority::{AuthorityDb, default_authority_path};
    use agent_vitals_data::fact_writer_sql::SqlFactWriter;
    use agent_vitals_data::workflow::insert_events;
    use agent_vitals_domain::contracts::r2a::SessionKey;
    use agent_vitals_domain::workflow::WorkflowEvent;
    use serde_json::json;

    fn seeded_home() -> std::path::PathBuf {
        let home = std::env::temp_dir().join(format!(
            "agent-vitals-workflow-summary-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .expect("clock")
                .as_nanos()
        ));
        std::fs::create_dir_all(&home).expect("home");
        let db = AuthorityDb::open(&default_authority_path(&home), 1).expect("db");
        db.begin_run("workflow-summary-test", "cli", 1)
            .expect("run");
        let source_id = db
            .with_immediate_txn(|conn| {
                SqlFactWriter::new(conn, "workflow-summary-test", 1)?.upsert_batch_source("dsh")
            })
            .expect("source");
        let session_key = SessionKey::new("dsh", "summary-s1", "default", "ns").ledger_key();
        let events = vec![
            WorkflowEvent {
                event_id: "workflow:issue-1".to_string(),
                session_key: Some(session_key.clone()),
                event_ts_ms: 1_700_000_000_000,
                event_type: "tool_finished".to_string(),
                capability_kind: Some("tool".to_string()),
                capability_id: Some("bash".to_string()),
                capability_version: None,
                outcome: "failed".to_string(),
                duration_ms: Some(12),
                error_fingerprint: Some("fnv1a64:error-1".to_string()),
                invocation_fingerprint: Some("fnv1a64:call-1".to_string()),
            },
            WorkflowEvent {
                event_id: "workflow:skill-alpha".to_string(),
                session_key: Some(session_key.clone()),
                event_ts_ms: 1_700_000_000_100,
                event_type: "skill_invoked".to_string(),
                capability_kind: Some("skill".to_string()),
                capability_id: Some("alpha".to_string()),
                capability_version: Some("1".to_string()),
                outcome: "succeeded".to_string(),
                duration_ms: None,
                error_fingerprint: None,
                invocation_fingerprint: None,
            },
            WorkflowEvent {
                event_id: "workflow:skill-beta".to_string(),
                session_key: Some(session_key),
                event_ts_ms: 1_700_000_000_200,
                event_type: "skill_invoked".to_string(),
                capability_kind: Some("skill".to_string()),
                capability_id: Some("beta".to_string()),
                capability_version: Some("2".to_string()),
                outcome: "failed".to_string(),
                duration_ms: None,
                error_fingerprint: None,
                invocation_fingerprint: None,
            },
        ];
        db.with_immediate_txn(|conn| {
            insert_events(conn, &events, &source_id, "workflow-summary-test", 2)
        })
        .expect("events");
        db.finish_run("workflow-summary-test", "succeeded", None, None, 3)
            .expect("finish");
        drop(db);
        home
    }

    #[test]
    fn workflow_mcp_projections_read_redacted_rows_and_apply_skill_filter_before_limit() {
        let home = seeded_home();
        let args = json!({"from": "2023-11-15", "to": "2023-11-15", "limit": 10});
        let issues = run_issues(&args, &home).expect("issues");
        assert_eq!(issues["coverage"]["status"], "partial");
        assert_eq!(issues["coverage"]["observed_events"], 3);
        assert_eq!(issues["coverage"]["observed_hosts"], json!(["dsh"]));
        assert_eq!(issues["coverage"]["host_absence_is_not_missing"], true);
        assert!(!issues["coverage"]["missing"]
            .as_array()
            .unwrap()
            .iter()
            .any(|item| item == "all host workflow adapters"));
        assert_eq!(issues["data"]["issues"][0]["tokens"]["value"], serde_json::Value::Null);
        assert!(!issues.to_string().contains("call-1"));

        let filtered = run_issues(
            &json!({"from": "2023-11-15", "to": "2023-11-15", "hosts": ["codex"]}),
            &home,
        )
        .expect("filtered issues");
        assert_eq!(filtered["coverage"]["status"], "unavailable");
        assert_eq!(filtered["coverage"]["observed_events"], 0);
        assert_eq!(filtered["coverage"]["observed_hosts"], json!([]));

        let skills = run_skills(
            &json!({"from": "2023-11-15", "to": "2023-11-15", "skills": ["beta"], "limit": 1}),
            &home,
        )
        .expect("skills");
        assert_eq!(skills["data"]["skills"].as_array().unwrap().len(), 1);
        assert_eq!(skills["data"]["skills"][0]["skill"], "beta");
        assert_eq!(skills["coverage"]["observed_events"], 1);
        assert_eq!(skills["coverage"]["observed_hosts"], json!(["dsh"]));
        std::fs::remove_dir_all(home).ok();
    }
}
