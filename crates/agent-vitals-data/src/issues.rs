//! v0.11 persistent Issue identity and status history.

use rusqlite::{Connection, OptionalExtension};
use serde_json::{json, Value};

const BEIJING_OFFSET_MS: i64 = 8 * 60 * 60 * 1000;
const DAY_MS: i64 = 24 * 60 * 60 * 1000;

#[derive(Debug, Clone)]
pub struct IssueInput<'a> {
    pub machine_namespace: &'a str,
    pub host: &'a str,
    pub session_key: Option<&'a str>,
    pub issue_type: &'a str,
    pub instance_fingerprint: &'a str,
    pub status: &'a str,
    pub severity: &'a str,
    pub evaluator_id: &'a str,
    pub evaluator_version: &'a str,
    pub evidence_fingerprint: &'a str,
    pub opened_at_ms: i64,
    pub metadata_json: &'a str,
}

/// v0.11 read-only remedy catalog; it never contains executable payloads.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct RemedyCandidate {
    pub remedy_id: &'static str,
    pub diagnostic_only: bool,
}

impl Default for RemedyCandidate {
    fn default() -> Self { remedy_for("<unknown>") }
}

pub fn remedy_for(issue_type: &str) -> RemedyCandidate {
    match issue_type {
        "retry_loop" => RemedyCandidate { remedy_id: "inspect-retry-policy", diagnostic_only: false },
        "context_overflow" => RemedyCandidate { remedy_id: "reduce-context-window", diagnostic_only: false },
        "tool_failure" => RemedyCandidate { remedy_id: "inspect-tool-error", diagnostic_only: false },
        _ => RemedyCandidate { remedy_id: "diagnostic-only", diagnostic_only: true },
    }
}

pub fn stable_issue_id(input: &IssueInput<'_>) -> String {
    stable_hash(&format!(
        "{}\0{}\0{}",
        input.machine_namespace, input.issue_type, input.instance_fingerprint
    ))
}

/// Idempotently creates or refreshes a stable Issue row. Status transitions are
/// deliberately handled by `transition_issue`, never inferred from upsert time.
pub fn upsert_issue(conn: &Connection, input: &IssueInput<'_>) -> rusqlite::Result<String> {
    if input.status != "open" {
        return Err(rusqlite::Error::InvalidParameterName(
            "new_issue_must_start_open".to_string(),
        ));
    }
    let issue_id = stable_issue_id(input);
    conn.execute(
        "INSERT INTO issue_instances(
           issue_id, machine_namespace, host, session_key, issue_type,
           instance_fingerprint, status, severity, evaluator_id, evaluator_version,
           evidence_fingerprint, opened_at_ms, metadata_json)
         VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13)
         ON CONFLICT(machine_namespace, issue_type, instance_fingerprint) DO UPDATE SET
           host=excluded.host, session_key=excluded.session_key,
           severity=excluded.severity, evaluator_id=excluded.evaluator_id,
           evaluator_version=excluded.evaluator_version,
           evidence_fingerprint=excluded.evidence_fingerprint,
           metadata_json=excluded.metadata_json",
        rusqlite::params![
            issue_id,
            input.machine_namespace,
            input.host,
            input.session_key,
            input.issue_type,
            input.instance_fingerprint,
            input.status,
            input.severity,
            input.evaluator_id,
            input.evaluator_version,
            input.evidence_fingerprint,
            input.opened_at_ms,
            input.metadata_json,
        ],
    )?;
    Ok(issue_id)
}

#[allow(clippy::too_many_arguments)]
pub fn transition_issue(
    conn: &Connection,
    issue_id: &str,
    to_status: &str,
    transitioned_at_ms: i64,
    reason: &str,
    actor: &str,
    evidence_fingerprint: &str,
    evaluator_id: &str,
    evaluator_version: &str,
    input_fingerprint: &str,
) -> rusqlite::Result<String> {
    // Callers must invoke this function inside AuthorityDb::with_immediate_txn;
    // the transition insert and current-row update are one atomic unit.
    let from_status: Option<String> = conn
        .query_row(
            "SELECT status FROM issue_instances WHERE issue_id = ?1",
            [issue_id],
            |row| row.get(0),
        )
        .optional()?;
    let from_status = from_status.ok_or_else(|| rusqlite::Error::QueryReturnedNoRows)?;
    let transition_id = stable_hash(&format!(
        "{}\0{}\0{}\0{}\0{}\0{}\0{}",
        issue_id,
        from_status,
        to_status,
        evidence_fingerprint,
        evaluator_id,
        evaluator_version,
        input_fingerprint
    ));
    let existing_transition: Option<String> = conn
        .query_row(
            "SELECT transition_id FROM issue_status_transitions
             WHERE issue_id = ?1 AND to_status = ?2 AND evidence_fingerprint = ?3
               AND evaluator_id = ?4 AND evaluator_version = ?5 AND input_fingerprint = ?6",
            rusqlite::params![
                issue_id,
                to_status,
                evidence_fingerprint,
                evaluator_id,
                evaluator_version,
                input_fingerprint
            ],
            |row| row.get::<_, String>(0),
        )
        .optional()?;
    if let Some(existing) = existing_transition {
        return Ok(existing);
    }
    if !valid_transition(&from_status, to_status) {
        return Err(rusqlite::Error::InvalidParameterName(format!(
            "invalid_issue_transition:{from_status}->{to_status}"
        )));
    }
    conn.execute(
        "INSERT OR IGNORE INTO issue_status_transitions(
           transition_id, issue_id, from_status, to_status, transitioned_at_ms,
           reason, actor, evidence_fingerprint, evaluator_id, evaluator_version, input_fingerprint)
         VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11)",
        rusqlite::params![
            transition_id,
            issue_id,
            from_status,
            to_status,
            transitioned_at_ms,
            reason,
            actor,
            evidence_fingerprint,
            evaluator_id,
            evaluator_version,
            input_fingerprint,
        ],
    )?;
    conn.execute(
        "UPDATE issue_instances SET status = ?2, closed_at_ms =
           CASE WHEN ?2 IN ('closed','wontfix') THEN COALESCE(closed_at_ms, ?3) ELSE NULL END
         WHERE issue_id = ?1",
        rusqlite::params![issue_id, to_status, transitioned_at_ms],
    )?;
    Ok(transition_id)
}

fn valid_transition(from: &str, to: &str) -> bool {
    matches!(
        (from, to),
        ("open", "acknowledged")
            | ("open", "closed")
            | ("open", "wontfix")
            | ("acknowledged", "closed")
            | ("acknowledged", "wontfix")
            | ("acknowledged", "open")
            | ("closed", "open")
            | ("wontfix", "open")
    )
}

fn stable_hash(value: &str) -> String {
    format!(
        "fnv1a64:{}",
        agent_vitals_domain::source_identity::fnv1a64_hex(value.as_bytes())
    )
}

/// Normalize the object part of a finding without merging different issue
/// families. This is intentionally pure: it is also used by the group key and
/// therefore must not depend on database state or presentation labels.
pub fn normalize_issue_object(issue_type: &str, object: &str) -> String {
    let object = object.trim();
    match issue_type {
        "SV601" | "SV602" | "SV603" | "retry_loop" | "tool_failure" =>
            object.split_whitespace().next().unwrap_or(object).to_string(),
        "SV604" | "SV605" => {
            if object.starts_with("/ingest/export/") {
                "/ingest/export/*".to_string()
            } else if let Some((parent, _)) = object.rsplit_once('/') {
                format!("{parent}/*")
            } else {
                format!("{object}/*")
            }
        }
        "SV611" => strip_counters(object, "连续重复"),
        "SV613" => strip_counters(object, "进度停滞: 连续工具失败"),
        "SV614" => strip_counters(object, "权限异常: 危险模式"),
        _ => object.to_string(),
    }
}

fn strip_counters(object: &str, prefix: &str) -> String {
    if object.starts_with(prefix) {
        prefix.to_string()
    } else {
        object
            .split_whitespace()
            .filter(|part| !part.chars().all(|c| c.is_ascii_digit()) && *part != "次")
            .collect::<Vec<_>>()
            .join(" ")
    }
}

fn issue_object(issue_type: &str, fingerprint: &str, metadata: &Value) -> String {
    fingerprint
        .split('\0')
        .nth(3)
        .or_else(|| metadata.get("tool_name").and_then(Value::as_str))
        .or_else(|| metadata.get("evidence").and_then(Value::as_str))
        .unwrap_or("<unknown>")
        .pipe(|object| normalize_issue_object(issue_type, object))
}

trait Pipe: Sized {
    fn pipe<T>(self, f: impl FnOnce(Self) -> T) -> T { f(self) }
}
impl<T> Pipe for T {}

fn issue_day_bucket(opened_at_ms: i64) -> String {
    agent_vitals_domain::usage::civil_date_from_days(
        (opened_at_ms + BEIJING_OFFSET_MS).div_euclid(DAY_MS),
    )
}

fn issue_group_key(issue_type: &str, host: &str, fingerprint: &str, opened_at_ms: i64, metadata: &Value) -> String {
    let object = issue_object(issue_type, fingerprint, metadata);
    let evidence_class = metadata.get("evidence").and_then(Value::as_str)
        .or_else(|| metadata.get("category").and_then(Value::as_str))
        .unwrap_or("<unknown>");
    format!("{issue_type}\0{host}\0{object}\0{evidence_class}\0{}", issue_day_bucket(opened_at_ms))
}

#[derive(Default)]
struct IssueGroupAccum {
    rule: String,
    host: String,
    object: String,
    evidence_class: String,
    bucket: String,
    count: usize,
    first_seen_at_ms: i64,
    last_seen_at_ms: i64,
    severity: String,
    status_rollup: [usize; 5],
    sessions: std::collections::BTreeSet<String>,
    sample_evidence: Vec<Value>,
    remedy: RemedyCandidate,
}

fn severity_rank(value: &str) -> u8 {
    match value { "critical" => 3, "warning" => 2, "info" => 1, _ => 0 }
}

fn status_index(value: &str) -> usize {
    match value { "later" => 1, "acknowledged" => 2, "closed" | "resolved" => 3,
        "wontfix" | "not_applicable" => 4, _ => 0 }
}

#[allow(clippy::too_many_arguments)]
fn projection_group(
    source_kind: &str,
    rule: &str,
    host: &str,
    object: &str,
    evidence_class: &str,
    opened_at_ms: i64,
    count: usize,
    severity: &str,
    status: &str,
    sample: Value,
    remedy_id: &'static str,
) -> Value {
    let group_key = format!("{source_kind}\0{rule}\0{host}\0{object}\0{evidence_class}\0{}", issue_day_bucket(opened_at_ms));
    let mut rollup = json!({"open": 0, "later": 0, "acknowledged": 0, "resolved": 0, "not_applicable": 0});
    let status_key = match status { "closed" | "resolved" => "resolved", "wontfix" | "not_applicable" => "not_applicable", other => other };
    if let Some(slot) = rollup.get_mut(status_key) { *slot = json!(count); }
    json!({
        "group_id": stable_hash(&group_key), "source_kind": source_kind, "rule": rule,
        "host": host, "object": object, "evidence_class": evidence_class,
        "bucket": issue_day_bucket(opened_at_ms), "count": count,
        "first_seen_at_ms": opened_at_ms, "last_seen_at_ms": opened_at_ms,
        "severity": severity, "status_rollup": rollup, "sessions_count": 0,
        "sample_evidence": [sample],
        "remedy": {"remedy_id": remedy_id, "diagnostic_only": true},
        "actionability": if severity == "critical" { 1.0 } else if severity == "warning" { 0.7 } else { 0.4 },
        "time": opened_at_ms, "evidence": evidence_class, "tool_name": object,
        "category": evidence_class, "hits": count, "sessions": 0,
    })
}

fn source_issue_groups(
    conn: &Connection,
    from_ms: Option<i64>,
    to_ms: Option<i64>,
) -> rusqlite::Result<Vec<Value>> {
    let mut values = Vec::new();
    let mut stmt = conn.prepare(
        "SELECT issue_id, scope_type, scope_key, code, severity,
                first_seen_at_ms, last_seen_at_ms, detail_json
         FROM data_quality_issues WHERE resolved_at_ms IS NULL
         ORDER BY issue_id",
    )?;
    let rows = stmt.query_map([], |r| Ok((
        r.get::<_, String>(0)?, r.get::<_, String>(1)?, r.get::<_, String>(2)?,
        r.get::<_, String>(3)?, r.get::<_, String>(4)?, r.get::<_, i64>(5)?,
        r.get::<_, i64>(6)?, r.get::<_, String>(7)?,
    )))?;
    for row in rows {
        let (issue_id, scope_type, scope_key, code, severity, first, last, detail_raw) = row?;
        if to_ms.is_some_and(|to| first >= to) || from_ms.is_some_and(|from| last < from) { continue; }
        let detail = serde_json::from_str::<Value>(&detail_raw).unwrap_or_else(|_| json!({}));
        let host = detail.get("host").and_then(Value::as_str).unwrap_or("<unknown>");
        let rule = if code.contains("price") || code.contains("pricing") || code.contains("unpriced") {
            "PRICE_COVERAGE"
        } else if code.contains("source") || code.contains("permission") || code.contains("parse") || code.contains("read") {
            "DATA_SOURCE_FAILURE"
        } else { "DATA_QUALITY" };
        values.push(projection_group("data_quality", rule, host, &scope_key, &code,
            first, 1, &severity, "open", json!({"issue_id": issue_id, "scope_type": scope_type, "code": code, "detail": detail}), "diagnostic-only"));
    }

    let mut stmt = conn.prepare(
        "SELECT candidate_id, host, provider_id, currency, amount_minor,
                billing_period_start, status, created_at_ms
         FROM billing_import_candidates WHERE status = 'pending'
         ORDER BY candidate_id",
    )?;
    let rows = stmt.query_map([], |r| Ok((
        r.get::<_, String>(0)?, r.get::<_, String>(1)?, r.get::<_, String>(2)?,
        r.get::<_, String>(3)?, r.get::<_, i64>(4)?, r.get::<_, String>(5)?,
        r.get::<_, String>(6)?, r.get::<_, i64>(7)?,
    )))?;
    for row in rows {
        let (candidate_id, host, provider, currency, amount, period, status, created) = row?;
        if to_ms.is_some_and(|to| created >= to) || from_ms.is_some_and(|from| created < from) { continue; }
        values.push(projection_group("billing_candidate", "BILLING_CONFIRMATION", &host,
            &format!("{provider}:{period}"), &currency, created, 1, "warning", &status,
            json!({"candidate_id": candidate_id, "provider_id": provider, "currency": currency,
                "amount_minor": amount, "billing_period_start": period, "is_bill": false}), "diagnostic-only"));
    }

    let mut stmt = conn.prepare(
        "SELECT source_id, host, last_error_code, last_seen_at_ms
         FROM source_files WHERE last_error_code IS NOT NULL ORDER BY source_id",
    )?;
    let rows = stmt.query_map([], |r| Ok((
        r.get::<_, String>(0)?, r.get::<_, String>(1)?, r.get::<_, String>(2)?, r.get::<_, i64>(3)?,
    )))?;
    for row in rows {
        let (source_id, host, error, seen) = row?;
        if to_ms.is_some_and(|to| seen >= to) || from_ms.is_some_and(|from| seen < from) { continue; }
        values.push(projection_group("source_failure", "DATA_SOURCE_FAILURE", &host, &error,
            "source_file", seen, 1, "warning", "open", json!({"source_id": source_id, "error_code": error}), "diagnostic-only"));
    }
    Ok(values)
}

/// Unified read-only projection across behavior issues and authority-source
/// problems. Source families remain distinguishable via `source_kind`.
pub fn issue_groups_with_sources(
    conn: &Connection,
    from_ms: Option<i64>,
    to_ms: Option<i64>,
    page_size: usize,
    cursor: Option<&str>,
) -> rusqlite::Result<Value> {
    let behavior = issue_groups(conn, from_ms, to_ms, usize::MAX, None)?;
    let mut groups = behavior["groups"].as_array().cloned().unwrap_or_default();
    groups.extend(source_issue_groups(conn, from_ms, to_ms)?);
    groups.sort_by(|a, b| b["actionability"].as_f64().partial_cmp(&a["actionability"].as_f64()).unwrap_or(std::cmp::Ordering::Equal)
        .then_with(|| a["group_id"].as_str().cmp(&b["group_id"].as_str())));
    let offset = cursor.and_then(|v| v.parse::<usize>().ok()).unwrap_or(0).min(groups.len());
    let end = (offset + page_size.clamp(1, 500)).min(groups.len());
    Ok(json!({"groups": groups[offset..end].to_vec(), "next_cursor": (end < groups.len()).then(|| end.to_string()),
        "total_groups": groups.len(), "source_issue_count": behavior["source_issue_count"].as_u64().unwrap_or(0),
        "source_projection_count": groups.len().saturating_sub(behavior["total_groups"].as_u64().unwrap_or(0) as usize)}))
}

/// Build a paginated L0 issue-group projection from the issue authority table.
/// Raw issue rows remain untouched and are only sampled here; L1/L2 can use the
/// returned `group_id` to fetch them later. `cursor` is a stable numeric offset
/// over the deterministic group ordering and is deliberately not a raw-row id.
pub fn issue_groups(
    conn: &Connection,
    from_ms: Option<i64>,
    to_ms: Option<i64>,
    page_size: usize,
    cursor: Option<&str>,
) -> rusqlite::Result<Value> {
    let mut sql = String::from(
        "SELECT issue_id, host, session_key, issue_type, instance_fingerprint, status,
                severity, evidence_fingerprint, opened_at_ms, metadata_json
         FROM issue_instances WHERE 1=1",
    );
    if from_ms.is_some() { sql.push_str(" AND opened_at_ms >= ?1"); }
    if to_ms.is_some() { sql.push_str(if from_ms.is_some() { " AND opened_at_ms < ?2" } else { " AND opened_at_ms < ?1" }); }
    sql.push_str(" ORDER BY opened_at_ms, issue_id");
    let mut stmt = conn.prepare(&sql)?;
    let params: Vec<Option<i64>> = match (from_ms, to_ms) {
        (Some(from), Some(to)) => vec![Some(from), Some(to)],
        (Some(from), None) => vec![Some(from)],
        (None, Some(to)) => vec![Some(to)],
        (None, None) => vec![],
    };
    let mut groups: std::collections::BTreeMap<String, IssueGroupAccum> = std::collections::BTreeMap::new();
    let mut source_issue_count = 0usize;
    let rows = stmt.query_map(rusqlite::params_from_iter(params), |r| {
        let metadata: String = r.get(9)?;
        Ok((
            r.get::<_, String>(0)?, r.get::<_, String>(1)?, r.get::<_, Option<String>>(2)?,
            r.get::<_, String>(3)?, r.get::<_, String>(4)?, r.get::<_, String>(5)?,
            r.get::<_, String>(6)?, r.get::<_, String>(7)?, r.get::<_, i64>(8)?, metadata,
        ))
    })?;
    for row in rows {
        source_issue_count += 1;
        let (issue_id, host, session, rule, fingerprint, status, severity, evidence, opened, metadata_raw) = row?;
        let metadata = serde_json::from_str::<Value>(&metadata_raw).unwrap_or_else(|_| json!({}));
        let key = issue_group_key(&rule, &host, &fingerprint, opened, &metadata);
        let object = issue_object(&rule, &fingerprint, &metadata);
        let evidence_class = metadata.get("evidence").and_then(Value::as_str)
            .or_else(|| metadata.get("category").and_then(Value::as_str))
            .unwrap_or("<unknown>").to_string();
        let bucket = issue_day_bucket(opened);
        let entry = groups.entry(key).or_insert_with(|| IssueGroupAccum {
            rule: rule.clone(), host: host.clone(), object: object.clone(),
            evidence_class: evidence_class.clone(), bucket: bucket.clone(),
            first_seen_at_ms: opened, last_seen_at_ms: opened,
            severity: severity.clone(), remedy: remedy_for(&rule), ..Default::default()
        });
        entry.count += 1;
        entry.first_seen_at_ms = entry.first_seen_at_ms.min(opened);
        entry.last_seen_at_ms = entry.last_seen_at_ms.max(opened);
        if severity_rank(&severity) > severity_rank(&entry.severity) { entry.severity = severity; }
        entry.status_rollup[status_index(&status)] += 1;
        if let Some(session) = session { entry.sessions.insert(session); }
        if entry.sample_evidence.len() < 3 {
            entry.sample_evidence.push(json!({"issue_id": issue_id, "evidence": evidence, "metadata": metadata}));
        }
    }
    let mut values: Vec<Value> = groups.into_iter().map(|(key, group)| {
        let actionability = match group.severity.as_str() { "critical" => 1.0, "warning" => 0.7, _ => 0.4 };
        json!({
            "group_id": stable_hash(&key), "rule": group.rule, "host": group.host,
            "object": group.object, "evidence_class": group.evidence_class, "bucket": group.bucket,
            "count": group.count, "first_seen_at_ms": group.first_seen_at_ms,
            "last_seen_at_ms": group.last_seen_at_ms, "severity": group.severity,
            "status_rollup": {"open": group.status_rollup[0], "later": group.status_rollup[1],
                "acknowledged": group.status_rollup[2], "resolved": group.status_rollup[3],
                "not_applicable": group.status_rollup[4]},
            "sessions_count": group.sessions.len(), "sample_evidence": group.sample_evidence,
            "remedy": {"remedy_id": group.remedy.remedy_id, "diagnostic_only": group.remedy.diagnostic_only},
            "actionability": actionability,
            "time": group.first_seen_at_ms, "evidence": group.evidence_class,
            "tool_name": group.object, "category": group.evidence_class,
            "hits": group.count, "sessions": group.sessions.len(),
        })
    }).collect();
    values.sort_by(|a, b| b["actionability"].as_f64().partial_cmp(&a["actionability"].as_f64()).unwrap_or(std::cmp::Ordering::Equal)
        .then_with(|| a["group_id"].as_str().cmp(&b["group_id"].as_str())));
    let offset = cursor.and_then(|v| v.parse::<usize>().ok()).unwrap_or(0).min(values.len());
    let end = (offset + page_size.clamp(1, 500)).min(values.len());
    let next_cursor = (end < values.len()).then(|| end.to_string());
    Ok(json!({"groups": values[offset..end].to_vec(), "next_cursor": next_cursor,
        "total_groups": values.len(), "source_issue_count": source_issue_count}))
}

/// Read L1 raw instances for one L0 group. The group id is resolved against
/// the same deterministic key as `issue_groups`; no caller-provided raw key is
/// accepted. Results are paginated by a numeric offset over issue_id order.
pub fn issue_group_instances(
    conn: &Connection,
    group_id: &str,
    page_size: usize,
    cursor: Option<&str>,
) -> rusqlite::Result<Value> {
    let mut stmt = conn.prepare(
        "SELECT issue_id, host, session_key, issue_type, instance_fingerprint,
                status, severity, evidence_fingerprint, opened_at_ms, closed_at_ms, metadata_json
         FROM issue_instances ORDER BY issue_id",
    )?;
    let mut matches = Vec::new();
    let rows = stmt.query_map([], |r| {
        let metadata: String = r.get(10)?;
        Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?, r.get::<_, Option<String>>(2)?,
            r.get::<_, String>(3)?, r.get::<_, String>(4)?, r.get::<_, String>(5)?,
            r.get::<_, String>(6)?, r.get::<_, String>(7)?, r.get::<_, i64>(8)?,
            r.get::<_, Option<i64>>(9)?, metadata))
    })?;
    for row in rows {
        let (issue_id, host, session, rule, fingerprint, status, severity, evidence, opened, closed, metadata_raw) = row?;
        let metadata = serde_json::from_str::<Value>(&metadata_raw).unwrap_or_else(|_| json!({}));
        if stable_hash(&issue_group_key(&rule, &host, &fingerprint, opened, &metadata)) != group_id { continue; }
        matches.push(json!({"issue_id": issue_id, "host_kind": host, "session_key": session,
            "rule": rule, "status": status, "severity": severity, "evidence": evidence,
            "opened_at_ms": opened, "closed_at_ms": closed, "metadata": metadata}));
    }
    let offset = cursor.and_then(|v| v.parse::<usize>().ok()).unwrap_or(0).min(matches.len());
    let end = (offset + page_size.clamp(1, 500)).min(matches.len());
    Ok(json!({"group_id": group_id, "instances": matches[offset..end].to_vec(),
        "next_cursor": (end < matches.len()).then(|| end.to_string()), "total_instances": matches.len()}))
}

/// Read one raw issue instance for L2 detail. Metadata is returned as parsed
/// JSON, while the authority row remains the source of truth for lifecycle.
pub fn issue_instance(conn: &Connection, issue_id: &str) -> rusqlite::Result<Option<Value>> {
    conn.query_row(
        "SELECT issue_id, host, session_key, issue_type, status, severity,
                evidence_fingerprint, opened_at_ms, closed_at_ms, metadata_json
         FROM issue_instances WHERE issue_id = ?1",
        [issue_id],
        |r| {
            let metadata: String = r.get(9)?;
            let metadata = serde_json::from_str::<Value>(&metadata).unwrap_or_else(|_| json!({}));
            Ok(json!({"issue_id": r.get::<_, String>(0)?, "host_kind": r.get::<_, String>(1)?,
                "session_key": r.get::<_, Option<String>>(2)?, "rule": r.get::<_, String>(3)?,
                "status": r.get::<_, String>(4)?, "severity": r.get::<_, String>(5)?,
                "evidence": r.get::<_, String>(6)?, "opened_at_ms": r.get::<_, i64>(7)?,
                "closed_at_ms": r.get::<_, Option<i64>>(8)?, "metadata": metadata,
                "remedy": {"remedy_id": remedy_for(r.get::<_, String>(3)?.as_str()).remedy_id}}))
        },
    ).optional()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::authority::AuthorityDb;

    fn input<'a>(status: &'a str) -> IssueInput<'a> {
        IssueInput {
            machine_namespace: "machine",
            host: "codex",
            session_key: Some("session"),
            issue_type: "retry_loop",
            instance_fingerprint: "fp-1",
            status,
            severity: "warning",
            evaluator_id: "rule.retry",
            evaluator_version: "1",
            evidence_fingerprint: "ev-1",
            opened_at_ms: 1,
            metadata_json: "{}",
        }
    }

    #[test]
    fn replay_is_idempotent_and_closed_issue_reopens() {
        let path = std::env::temp_dir().join(format!("av-issue-{}", std::process::id()));
        let db = AuthorityDb::open(&path, 1).unwrap();
        let id = upsert_issue(db.conn(), &input("open")).unwrap();
        let id2 = upsert_issue(db.conn(), &input("open")).unwrap();
        assert_eq!(id, id2);
        transition_issue(
            db.conn(),
            &id,
            "closed",
            2,
            "done",
            "rule",
            "ev-1",
            "rule.retry",
            "1",
            "fp-1",
        )
        .unwrap();
        let t = transition_issue(
            db.conn(),
            &id,
            "open",
            3,
            "reappeared",
            "rule",
            "ev-2",
            "rule.retry",
            "1",
            "fp-1",
        )
        .unwrap();
        let t2 = transition_issue(
            db.conn(),
            &id,
            "open",
            3,
            "reappeared",
            "rule",
            "ev-2",
            "rule.retry",
            "1",
            "fp-1",
        )
        .unwrap();
        assert_eq!(t, t2);
        let n: i64 = db
            .conn()
            .query_row("SELECT COUNT(*) FROM issue_status_transitions", [], |r| {
                r.get(0)
            })
            .unwrap();
        assert_eq!(n, 2);
        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn remedy_catalog_is_code_only_and_has_diagnostic_fallback() {
        assert!(!remedy_for("retry_loop").diagnostic_only);
        assert!(remedy_for("future_rule").diagnostic_only);
        assert_eq!(remedy_for("future_rule").remedy_id, "diagnostic-only");
    }

    #[test]
    fn normalize_issue_objects_keeps_family_boundaries() {
        assert_eq!(normalize_issue_object("SV601", "rm -rf"), "rm");
        assert_eq!(normalize_issue_object("SV601", "rmdir -p"), "rmdir");
        assert_eq!(normalize_issue_object("SV604", "~/.ssh/authorized_keys"), "~/.ssh/*");
        assert_eq!(normalize_issue_object("SV605", "/ingest/export/summary/state"), "/ingest/export/*");
        assert_eq!(normalize_issue_object("SV611", "read 连续重复 3 次"), "read 连续重复");
        assert_eq!(normalize_issue_object("SV610", "danger-full-access"), "danger-full-access");
    }

    #[test]
    fn issue_groups_reduce_hits_and_page_stably() {
        let path = std::env::temp_dir().join(format!("av-issue-groups-{}", std::process::id()));
        let db = AuthorityDb::open(&path, 1).unwrap();
        let rows = [
            ("i1", "SV601", "codex", "rm -rf", 1_i64),
            ("i2", "SV601", "codex", "rm -f", 2_i64),
            ("i3", "SV601", "codex", "rmdir", 3_i64),
            ("i4", "SV601", "dsh", "rm -rf", 4_i64),
        ];
        for (id, rule, host, object, opened) in rows {
            let metadata = r#"{"category":"command","evidence":"command-pattern"}"#.to_string();
            let input = IssueInput {
                machine_namespace: "machine", host, session_key: Some(id), issue_type: rule,
                instance_fingerprint: &format!("{id}\0{rule}\0seq\0{object}"), status: "open",
                severity: "warning", evaluator_id: "evaluator", evaluator_version: "1",
                evidence_fingerprint: id, opened_at_ms: opened, metadata_json: &metadata,
            };
            upsert_issue(db.conn(), &input).unwrap();
        }
        let grouped = issue_groups(db.conn(), None, None, 50, None).unwrap();
        assert_eq!(grouped["source_issue_count"], 4);
        assert_eq!(grouped["total_groups"], 3);
        let merged_group = grouped["groups"].as_array().unwrap().iter()
            .find(|g| g["count"] == 2).unwrap();
        let merged_id = merged_group["group_id"].as_str().unwrap();
        let instances = issue_group_instances(db.conn(), merged_id, 1, None).unwrap();
        assert_eq!(instances["total_instances"], 2);
        assert_eq!(instances["instances"].as_array().unwrap().len(), 1);
        let next = instances["next_cursor"].as_str().unwrap();
        let second = issue_group_instances(db.conn(), merged_id, 1, Some(next)).unwrap();
        assert_eq!(second["instances"].as_array().unwrap().len(), 1);
        let issue_id = instances["instances"][0]["issue_id"].as_str().unwrap();
        assert!(issue_instance(db.conn(), issue_id).unwrap().is_some());
        assert!(issue_instance(db.conn(), "missing").unwrap().is_none());
        let first = issue_groups(db.conn(), None, None, 1, None).unwrap();
        let next = first["next_cursor"].as_str().unwrap();
        let second = issue_groups(db.conn(), None, None, 1, Some(next)).unwrap();
        assert_eq!(first["groups"].as_array().unwrap().len(), 1);
        assert_eq!(second["groups"].as_array().unwrap().len(), 1);
        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn unified_groups_include_source_failures_and_pending_candidates_without_merging() {
        let path = std::env::temp_dir().join(format!("av-unified-issues-{}", std::process::id()));
        let db = AuthorityDb::open(&path, 1).unwrap();
        db.conn().execute(
            "INSERT INTO data_quality_issues(issue_id, scope_type, scope_key, code, severity,
             first_seen_at_ms, last_seen_at_ms, detail_json)
             VALUES ('dq1', 'source', 'src-1', 'price_missing', 'warning', 10, 10, ?1)",
            [r#"{"host":"codex","provider_id":"openai"}"#],
        ).unwrap();
        db.billing_import_candidate_put("candidate-1", "claude-code", "minimax", "CNY", 11400,
            "2026-09", "pricing-v1", 10).unwrap();
        db.conn().execute(
            "INSERT INTO source_files(source_id, host, path_hash, size_bytes, mtime_ns,
             parser_version, first_seen_at_ms, last_seen_at_ms, last_error_code)
             VALUES ('source-1', 'dsh', 'hash', 1, 1, 1, 10, 10, 'permission_denied')", [],
        ).unwrap();
        let result = issue_groups_with_sources(db.conn(), None, None, 50, None).unwrap();
        let groups = result["groups"].as_array().unwrap();
        assert_eq!(groups.len(), 3);
        assert!(groups.iter().any(|g| g["source_kind"] == "billing_candidate"
            && g["rule"] == "BILLING_CONFIRMATION" && g["sample_evidence"][0]["is_bill"] == false));
        assert!(groups.iter().any(|g| g["source_kind"] == "source_failure"));
        assert!(groups.iter().any(|g| g["source_kind"] == "data_quality"
            && g["rule"] == "PRICE_COVERAGE"));
        let _ = std::fs::remove_file(path);
    }
}
