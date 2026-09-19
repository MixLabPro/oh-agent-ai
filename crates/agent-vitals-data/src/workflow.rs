//! Authority storage for the host-neutral workflow event contract.
//!
//! This module intentionally contains no host parsing and no product scoring.
//! Adapters produce [`agent_vitals_domain::workflow::WorkflowEvent`]; the
//! runtime supplies the source/run provenance; this module only validates and
//! persists the redacted event rows with replay-safe identity semantics.

use agent_vitals_domain::workflow::WorkflowEvent;
use agent_vitals_domain::contracts::r2a::SessionKey;
use rusqlite::{Connection, params};

use crate::authority::AuthorityError;

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct WorkflowInsertReport {
    pub inserted: usize,
    pub duplicate: usize,
    /// 重放时**派生列与已存值不同**而被纠正的行数（emitter 升级后由
    /// `PARSER_VERSION` 重放触达；见 sql_sync 的版本演进注释）。
    pub corrected: usize,
}

/// Insert a batch of already-redacted workflow events.
///
/// All events are validated before the first SQL write.  A row already present
/// (same `event_id`) keeps its original identity and provenance
/// (`source_id` / `ingested_run_id` / `created_at_ms`), but its **derived**
/// columns (`outcome` / `capability_version` / `duration_ms` /
/// `error_fingerprint`) are corrected when the replayed derivation differs —
/// the row is a derivation of the source log, so an improved emitter (see
/// `PARSER_VERSION` replay discipline in sql_sync) must be able to reach
/// historical rows instead of leaving them at the old derivation forever.
pub fn insert_events(
    conn: &Connection,
    events: &[WorkflowEvent],
    source_id: &str,
    run_id: &str,
    now_ms: i64,
) -> Result<WorkflowInsertReport, AuthorityError> {
    use rusqlite::OptionalExtension;

    for event in events {
        event.validate().map_err(|reason| {
            AuthorityError::Sqlite(rusqlite::Error::InvalidParameterName(
                format!("__invalid_workflow_event__:{reason}"),
            ))
        })?;
    }

    let writer = crate::fact_writer_sql::SqlFactWriter::new(conn, run_id, now_ms)?;
    for event in events {
        let Some(raw_key) = event.session_key.as_deref() else {
            continue;
        };
        let key = SessionKey::from_ledger_key(raw_key).ok_or_else(|| {
            AuthorityError::Sqlite(rusqlite::Error::InvalidParameterName(
                "__invalid_workflow_session_key__".to_string(),
            ))
        })?;
        writer.upsert_session(
            &key.host_kind,
            &key.machine_namespace,
            &key.native_id,
            Some(&key.source_profile),
            now_ms,
        )?;
    }

    let mut report = WorkflowInsertReport::default();
    for event in events {
        let existed = conn
            .query_row(
                "SELECT 1 FROM workflow_events WHERE event_id = ?1",
                [&event.event_id],
                |row| row.get::<_, i64>(0),
            )
            .optional()?
            .is_some();
        if existed {
            // NULL 安全比较（IS NOT）：值一致时是纯 no-op，不碰 provenance。
            let corrected = conn.execute(
                "UPDATE workflow_events
                 SET outcome = ?2, capability_version = ?3,
                     duration_ms = ?4, error_fingerprint = ?5
                 WHERE event_id = ?1
                   AND (outcome IS NOT ?2 OR capability_version IS NOT ?3
                        OR duration_ms IS NOT ?4 OR error_fingerprint IS NOT ?5)",
                params![
                    event.event_id,
                    event.outcome,
                    event.capability_version,
                    event.duration_ms,
                    event.error_fingerprint,
                ],
            )?;
            if corrected == 1 {
                report.corrected += 1;
            } else {
                report.duplicate += 1;
            }
            continue;
        }
        let changed = conn.execute(
            "INSERT INTO workflow_events(
                 event_id, session_key, event_ts_ms, event_type,
                 capability_kind, capability_id, capability_version, outcome,
                 duration_ms, error_fingerprint, invocation_fingerprint,
                 source_id, ingested_run_id, created_at_ms)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14)",
            params![
                event.event_id,
                event.session_key,
                event.event_ts_ms,
                event.event_type,
                event.capability_kind,
                event.capability_id,
                event.capability_version,
                event.outcome,
                event.duration_ms,
                event.error_fingerprint,
                event.invocation_fingerprint,
                source_id,
                run_id,
                now_ms,
            ],
        )?;
        if changed == 1 {
            report.inserted += 1;
        } else {
            report.duplicate += 1;
        }
    }
    Ok(report)
}

/// Return whether the authority contains at least one workflow row for a
/// source.  This is used by coverage reporting; absence is `unavailable`, not
/// an empty successful result.
pub fn has_events(conn: &Connection) -> Result<bool, AuthorityError> {
    let present = conn.query_row(
        "SELECT EXISTS(SELECT 1 FROM workflow_events)",
        [],
        |row| row.get::<_, i64>(0),
    )?;
    Ok(present != 0)
}

#[cfg(test)]
mod tests {
    use super::insert_events;
    use agent_vitals_domain::contracts::r2a::SessionKey;
    use agent_vitals_domain::workflow::WorkflowEvent;
    use crate::authority::AuthorityDb;
    use crate::fact_writer_sql::SqlFactWriter;

    #[test]
    fn workflow_rows_are_idempotent_and_keep_sensitive_values_out() {
        let path = std::env::temp_dir().join(format!(
            "agent-vitals-workflow-{}-{}.sqlite3",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .expect("clock")
                .as_nanos()
        ));
        let db = AuthorityDb::open(&path, 1).expect("open authority");
        db.begin_run("workflow-test", "cli", 1).expect("begin run");
        let source_id = db
            .with_immediate_txn(|conn| {
                let writer = SqlFactWriter::new(conn, "workflow-test", 1)?;
                let source = writer.upsert_batch_source("dsh")?;
                Ok::<_, crate::authority::AuthorityError>(source)
            })
            .expect("seed source");
        let session_key = SessionKey::new("dsh", "s1", "default", "ns").ledger_key();
        let event = WorkflowEvent {
            event_id: "workflow:test:1".to_string(),
            session_key: Some(session_key.clone()),
            event_ts_ms: 100,
            event_type: "tool_finished".to_string(),
            capability_kind: Some("tool".to_string()),
            capability_id: Some("bash".to_string()),
            capability_version: None,
            outcome: "failed".to_string(),
            duration_ms: Some(10),
            error_fingerprint: Some("fnv1a64:deadbeef".to_string()),
            invocation_fingerprint: Some("fnv1a64:cafebabe".to_string()),
        };
        let first = db
            .with_immediate_txn(|conn| {
                insert_events(conn, std::slice::from_ref(&event), &source_id, "workflow-test", 2)
            })
            .expect("insert event");
        let second = db
            .with_immediate_txn(|conn| {
                insert_events(conn, std::slice::from_ref(&event), &source_id, "workflow-test", 3)
            })
            .expect("replay event");
        assert_eq!(first.inserted, 1);
        assert_eq!(second.duplicate, 1);
        let count: i64 = db
            .conn()
            .query_row("SELECT COUNT(*) FROM workflow_events", [], |row| row.get(0))
            .expect("count");
        assert_eq!(count, 1);

        // 重放**派生列不同**的同 id 事件：纠正 outcome，provenance 保持原样
        // （emitter 升级经 PARSER_VERSION 重放触达历史行的机制，spec §9.4-①）。
        let corrected_event = WorkflowEvent { outcome: "succeeded".to_string(), ..event.clone() };
        let third = db
            .with_immediate_txn(|conn| {
                insert_events(conn, std::slice::from_ref(&corrected_event), &source_id, "workflow-test", 4)
            })
            .expect("correcting replay");
        assert_eq!(third.corrected, 1);
        assert_eq!(third.inserted, 0);
        let (outcome, source, run): (String, String, String) = db
            .conn()
            .query_row(
                "SELECT outcome, source_id, ingested_run_id FROM workflow_events WHERE event_id = ?1",
                [&event.event_id],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .expect("row after correction");
        assert_eq!(outcome, "succeeded", "派生列被重放纠正");
        assert_eq!(source, source_id, "provenance 不随纠正变化");
        assert_eq!(run, "workflow-test", "首次接纳的 run_id 保留");

        // 再次原样重放：无变化 → duplicate，不再计 corrected。
        let fourth = db
            .with_immediate_txn(|conn| {
                insert_events(conn, std::slice::from_ref(&corrected_event), &source_id, "workflow-test", 5)
            })
            .expect("idempotent replay");
        assert_eq!(fourth.corrected, 0);
        assert_eq!(fourth.duplicate, 1);
        let session_count: i64 = db
            .conn()
            .query_row(
                "SELECT COUNT(*) FROM sessions WHERE session_key = ?1",
                [&session_key],
                |row| row.get(0),
            )
            .expect("session count");
        assert_eq!(session_count, 1);
        db.finish_run("workflow-test", "succeeded", None, None, 4)
            .expect("finish run");
        drop(db);
        let _ = std::fs::remove_file(&path);
        let _ = std::fs::remove_file(path.with_extension("sqlite3-shm"));
        let _ = std::fs::remove_file(path.with_extension("sqlite3-wal"));
    }
}
