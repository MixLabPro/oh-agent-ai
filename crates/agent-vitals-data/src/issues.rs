//! v0.11 persistent Issue identity and status history.

use rusqlite::{Connection, OptionalExtension};

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
}
