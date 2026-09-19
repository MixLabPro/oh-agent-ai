//! Authority storage for the host-neutral workflow event contract.
//!
//! This module intentionally contains no host parsing and no product scoring.
//! Adapters produce [`agent_vitals_domain::workflow::WorkflowEvent`]; the
//! runtime supplies the source/run provenance; this module only validates and
//! persists the redacted event rows with replay-safe identity semantics.

use agent_vitals_domain::contracts::workflow::SessionExcerpt;
use agent_vitals_domain::workflow::WorkflowEvent;
use agent_vitals_domain::contracts::r2a::SessionKey;
use rusqlite::{Connection, params};

use crate::authority::AuthorityError;

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct WorkflowInsertReport {
    pub inserted: usize,
    pub duplicate: usize,
}

/// Insert a batch of already-redacted workflow events.
///
/// All events are validated before the first SQL write.  Replay semantics are
/// two-tier since V16: the base columns stay `INSERT OR IGNORE`（同 event_id
/// 重放不重复计、原始 provenance 不被改写），while the V16 enrichment columns
/// back-fill on conflict **only when the stored copy is still NULL and the
/// replay carries a value**——不升 PARSER_VERSION 的普通重放（值相同）与升版
/// 后的一次性回填都由此正确处理，且幂等（第二次重放 WHERE 不再命中）。
pub fn insert_events(
    conn: &Connection,
    events: &[WorkflowEvent],
    source_id: &str,
    run_id: &str,
    now_ms: i64,
) -> Result<WorkflowInsertReport, AuthorityError> {
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
        // 先查存在性再分流：`ON CONFLICT DO UPDATE` 的 changes() 分不清「新插入」
        // 与「回填更新」，报表语义（inserted=新行 / duplicate=重放）会漂。
        let exists: bool = conn
            .query_row(
                "SELECT 1 FROM workflow_events WHERE event_id = ?1",
                params![event.event_id],
                |_| Ok(true),
            )
            .unwrap_or(false);
        let changed = if exists {
            // 回填：只补仍为 NULL 的 V16 列（COALESCE 保首见值），基础列与
            // provenance 一概不动；全部列已有值时 WHERE 不命中（幂等）。
            conn.execute(
                "UPDATE workflow_events SET
                     error_code = COALESCE(error_code, ?2),
                     error_class = COALESCE(error_class, ?3),
                     error_excerpt = COALESCE(error_excerpt, ?4),
                     args_excerpt = COALESCE(args_excerpt, ?5),
                     request_bytes = COALESCE(request_bytes, ?6),
                     result_bytes = COALESCE(result_bytes, ?7),
                     native_event_id = COALESCE(native_event_id, ?8),
                     source_line = COALESCE(source_line, ?9),
                     source_byte_offset = COALESCE(source_byte_offset, ?10)
                 WHERE event_id = ?1
                   AND ((error_code IS NULL AND ?2 IS NOT NULL)
                     OR (error_class IS NULL AND ?3 IS NOT NULL)
                     OR (error_excerpt IS NULL AND ?4 IS NOT NULL)
                     OR (args_excerpt IS NULL AND ?5 IS NOT NULL)
                     OR (request_bytes IS NULL AND ?6 IS NOT NULL)
                     OR (result_bytes IS NULL AND ?7 IS NOT NULL)
                     OR (native_event_id IS NULL AND ?8 IS NOT NULL)
                     OR (source_line IS NULL AND ?9 IS NOT NULL)
                     OR (source_byte_offset IS NULL AND ?10 IS NOT NULL))",
                params![
                    event.event_id,
                    event.error_code,
                    event.error_class,
                    event.error_excerpt,
                    event.args_excerpt,
                    event.request_bytes,
                    event.result_bytes,
                    event.native_event_id,
                    event.source_line,
                    event.source_byte_offset,
                ],
            )?
        } else {
            conn.execute(
                "INSERT OR IGNORE INTO workflow_events(
                     event_id, session_key, event_ts_ms, event_type,
                     capability_kind, capability_id, capability_version, outcome,
                     duration_ms, error_fingerprint, invocation_fingerprint,
                     error_code, error_class, error_excerpt, args_excerpt,
                     request_bytes, result_bytes, native_event_id, source_line, source_byte_offset,
                     source_id, ingested_run_id, created_at_ms)
                 VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18,?19,?20,?21,?22,?23)",
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
                    event.error_code,
                    event.error_class,
                    event.error_excerpt,
                    event.args_excerpt,
                    event.request_bytes,
                    event.result_bytes,
                    event.native_event_id,
                    event.source_line,
                    event.source_byte_offset,
                    source_id,
                    run_id,
                    now_ms,
                ],
            )?
        };
        if !exists && changed == 1 {
            report.inserted += 1;
        } else {
            report.duplicate += 1;
        }
    }
    Ok(report)
}

/// Insert task-intent excerpts (V16 `session_excerpts`).  `INSERT OR IGNORE` on
/// the `(session_key, ordinal, role)` primary key：同源重放幂等；序号/角色相同
/// 而文本不同（emitter 改版）时**保留首见**——摘录是首见证据，不追新。
pub fn insert_session_excerpts(
    conn: &Connection,
    excerpts: &[SessionExcerpt],
    source_id: &str,
    run_id: &str,
    now_ms: i64,
) -> Result<usize, AuthorityError> {
    for excerpt in excerpts {
        excerpt.validate().map_err(|reason| {
            AuthorityError::Sqlite(rusqlite::Error::InvalidParameterName(
                format!("__invalid_session_excerpt__:{reason}"),
            ))
        })?;
    }
    let writer = crate::fact_writer_sql::SqlFactWriter::new(conn, run_id, now_ms)?;
    let mut inserted = 0usize;
    for excerpt in excerpts {
        let key = SessionKey::from_ledger_key(&excerpt.session_key).ok_or_else(|| {
            AuthorityError::Sqlite(rusqlite::Error::InvalidParameterName(
                "__invalid_excerpt_session_key__".to_string(),
            ))
        })?;
        writer.upsert_session(
            &key.host_kind,
            &key.machine_namespace,
            &key.native_id,
            Some(&key.source_profile),
            now_ms,
        )?;
        let changed = conn.execute(
            "INSERT OR IGNORE INTO session_excerpts(
                 session_key, ordinal, role, excerpt, provenance,
                 native_event_id, source_id, ingested_run_id)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8)",
            params![
                excerpt.session_key,
                excerpt.ordinal,
                excerpt.role,
                excerpt.excerpt,
                excerpt.provenance,
                excerpt.native_event_id,
                source_id,
                run_id,
            ],
        )?;
        inserted += changed;
    }
    Ok(inserted)
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
    fn session_excerpts_insert_is_idempotent_and_keeps_first_seen() {
        use super::insert_session_excerpts;
        use agent_vitals_domain::contracts::workflow::SessionExcerpt;
        let path = std::env::temp_dir().join(format!(
            "agent-vitals-excerpts-{}-{}.sqlite3",
            std::process::id(),
            std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos()
        ));
        let db = AuthorityDb::open(&path, 1).expect("open");
        db.begin_run("excerpt-test", "cli", 1).expect("begin");
        let source_id = db
            .with_immediate_txn(|conn| {
                crate::fact_writer_sql::SqlFactWriter::new(conn, "excerpt-test", 1)?
                    .upsert_batch_source("claude-code")
            })
            .expect("seed source");
        let session_key = SessionKey::new("claude-code", "s1", "default", "ns").ledger_key();
        let excerpt = SessionExcerpt {
            session_key: session_key.clone(),
            ordinal: 0,
            role: "user_first".to_string(),
            excerpt: "帮我修登录页".to_string(),
            provenance: "verbatim".to_string(),
            native_event_id: "uuid-1".to_string(),
        };
        let first = db.with_immediate_txn(|conn| {
            insert_session_excerpts(conn, std::slice::from_ref(&excerpt), &source_id, "excerpt-test", 2)
        }).unwrap();
        // 首见保留：同 PK 重放（即使文本变了）不覆盖、不重复。
        let mut revised = excerpt.clone();
        revised.excerpt = "改版后的文本".to_string();
        let second = db.with_immediate_txn(|conn| {
            insert_session_excerpts(conn, std::slice::from_ref(&revised), &source_id, "excerpt-test", 3)
        }).unwrap();
        assert_eq!(first, 1);
        assert_eq!(second, 0);
        let stored: String = db.conn().query_row(
            "SELECT excerpt FROM session_excerpts WHERE session_key = ?1",
            [&session_key], |row| row.get(0),
        ).unwrap();
        assert_eq!(stored, "帮我修登录页", "摘录是首见证据，不追新");
        drop(db);
        let _ = std::fs::remove_file(&path);
        let _ = std::fs::remove_file(path.with_extension("sqlite3-shm"));
        let _ = std::fs::remove_file(path.with_extension("sqlite3-wal"));
    }

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
            error_code: None,
            error_class: None,
            error_excerpt: None,
            args_excerpt: None,
            request_bytes: None,
            result_bytes: None,
            native_event_id: None,
            source_line: None,
            source_byte_offset: None,
        };
        let first = db
            .with_immediate_txn(|conn| {
                insert_events(conn, std::slice::from_ref(&event), &source_id, "workflow-test", 2)
            })
            .expect("insert event");
        // V16 回填路径：同 event_id 重放、携带富化值——旧行的 NULL 列被补写，
        // 原始 created_at 不动；第三次重放（值相同）不再命中 WHERE。
        let mut enriched = event.clone();
        enriched.error_excerpt = Some("Error: boom".to_string());
        enriched.native_event_id = Some("call_1".to_string());
        enriched.source_line = Some(3);
        let second = db
            .with_immediate_txn(|conn| {
                insert_events(conn, std::slice::from_ref(&enriched), &source_id, "workflow-test", 3)
            })
            .expect("backfill replay");
        let third = db
            .with_immediate_txn(|conn| {
                insert_events(conn, std::slice::from_ref(&enriched), &source_id, "workflow-test", 4)
            })
            .expect("idempotent replay");
        assert_eq!(first.inserted, 1);
        assert_eq!(second.duplicate, 1, "回填不算新插入");
        assert_eq!(third.duplicate, 1);
        let (excerpt, native, line, created): (String, String, i64, i64) = db
            .conn()
            .query_row(
                "SELECT error_excerpt, native_event_id, source_line, created_at_ms
                 FROM workflow_events WHERE event_id = 'workflow:test:1'",
                [],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
            )
            .expect("row");
        assert_eq!(excerpt, "Error: boom");
        assert_eq!(native, "call_1");
        assert_eq!(line, 3);
        assert_eq!(created, 2, "原始 created_at_ms 不得被回填改写");
        let count: i64 = db
            .conn()
            .query_row("SELECT COUNT(*) FROM workflow_events", [], |row| row.get(0))
            .expect("count");
        assert_eq!(count, 1);
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
