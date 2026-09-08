//! `data_status` 工具（spec §7.1）：回答「当前数据是否可信、是否新鲜、是否
//! 已经切到 SQL」。
//!
//! 这是 **doctor 工具**——即使权威库损坏也要端出结构化结果，所以它不走
//! [`super::AuthorityHandle::open`]（那个在损坏时 fail-fast），而是自管一个
//! 只读连接。只有「文件不存在」才 hard error（`database_missing`，spec §7.1
//! 「不自动建库」）。
//!
//! [`collect_report`] 是 **CLI 与 MCP 的共享核心**（spec §5「同一 repository /
//! 同一 DTO」的落地）：`apps/cli` 的 `data-status` handler 和这里的 [`run`]
//! 都调它，保证两个消费面逐字段一致。

use std::path::Path;

use rusqlite::{Connection, OpenFlags};
use serde_json::{json, Map, Value};

use super::{build_envelope, coverage_not_applicable, stale_hosts, ToolError};

pub fn spec() -> super::ToolSpec {
    super::ToolSpec {
        name: "data_status",
        description: "Report whether the local authority data is trustworthy, fresh, and switched to SQL: schema version, DB integrity, per-host fact counts and coverage, open data-quality issues by code, recent sync runs, and a health verdict. Takes no arguments. Works even when the database is empty; returns a structured error only when the database file is missing.",
        input_schema: json!({
            "type": "object",
            "properties": {},
            "additionalProperties": false
        }),
        output_schema: json!({
            "type": "object",
            "description": "The standard response envelope (schema_version, data_version, authority_state, authority_revision, coverage, freshness, warnings, data). `data` carries: schema_version, integrity, facts, sources, sessions, open_quality_issues(+_by_code), sql_authority_enabled, pricing_snapshots, host_bills, recent_runs, by_host, health, hints."
        }),
    }
}

/// `tools/call data_status`。
pub fn run(_args: &Value, data_home: &Path) -> Result<Value, ToolError> {
    let path = agent_vitals_data::authority::default_authority_path(data_home);
    if !path.exists() {
        return Err(ToolError::new(
            "database_missing",
            "authority DB does not exist — run `agent-vitals sync-facts` first (data_status does not create it)",
        ));
    }
    let conn = Connection::open_with_flags(
        &path,
        OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_URI,
    )
    .map_err(|_| {
        ToolError::new(
            "database_unreadable",
            "authority DB could not be opened read-only — keep the file for diagnosis",
        )
    })?;
    let _ = conn.busy_timeout(std::time::Duration::from_millis(5_000));

    let enabled = crate::sql_authority::is_enabled(data_home);
    let report = collect_report(&conn, true, enabled);

    // 损坏 / schema 不符 = **业务错误**（spec §7.1：「integrity != ok →
    // envelope authority_state=unavailable + 错误码 database_unreadable」——
    // 即 `isError: true` + envelope 内 `error.code: "database_unreadable"`，
    // 不是带 `unavailable` 标记的成功响应）。返回错误把这条契约对齐到
    // Python `tests/test_data_status_health.py` 的 `corrupt → critical + 退出 1`。
    let integrity_ok = report["integrity"].as_str() == Some("ok");
    let schema_ok = report["schema_version"].as_str()
        == Some(&agent_vitals_data::authority::SCHEMA_VERSION.to_string());
    if !integrity_ok {
        return Err(ToolError::new(
            "database_unreadable",
            format!(
                "PRAGMA integrity_check failed: {} — keep the DB file for diagnosis, do NOT rebuild (the authority DB does not self-heal)",
                report["integrity"].as_str().unwrap_or("?")
            ),
        ));
    }
    if !schema_ok {
        return Err(ToolError::new(
            "schema_migration_required",
            format!(
                "authority schema is v{}, this build supports v{}",
                report["schema_version"].as_str().unwrap_or("?"),
                agent_vitals_data::authority::SCHEMA_VERSION
            ),
        ));
    }

    let authority_state = if enabled { "enabled" } else { "candidate" };

    let mut warnings = Vec::new();
    if report["health"].as_str() == Some("critical") {
        for h in report["hints"].as_array().into_iter().flatten() {
            warnings.push(json!({ "code": "health_critical", "message": h }));
        }
    }

    // 无时间窗的 doctor 也必须把「有宿主但最近实时事实已过期」显式折成
    // partial；否则 consumer 容易把旧数据误读为当前零用量。没有任何已知宿主
    // 时仍保留 not_applicable，避免把空库编成一次覆盖失败。
    let known_hosts = report["by_host"]
        .as_object()
        .is_some_and(|hosts| !hosts.is_empty());
    let stale_hosts = stale_hosts(&conn, crate::sql_sync::now_ms());
    let coverage = if known_hosts {
        json!({
            "status": if stale_hosts.is_empty() { "complete" } else { "partial" },
            "missing_hosts": stale_hosts,
        })
    } else {
        coverage_not_applicable()
    };

    Ok(build_envelope(
        &conn,
        authority_state,
        None,
        coverage,
        warnings,
        report,
    ))
}

/// 权威库状态报告——CLI `data-status` 与 MCP `data_status` 的共享数据面。
///
/// `db_existed`：调用方 open **之前**文件是否存在（CLI 用 `AuthorityDb::open`
/// 会建库，所以「刚被删」和「同步过但空」在 open 之后长得一样——前者在
/// `sql_authority_enabled` 下是灾难态，见 spec 1.7 / §5.3）。
/// `enabled`：`sql_authority::is_enabled(data_home)`。
pub fn collect_report(conn: &Connection, db_existed: bool, enabled: bool) -> Value {
    let integrity: String = conn
        .query_row("PRAGMA integrity_check", [], |r| r.get(0))
        .unwrap_or_else(|e| format!("integrity_check failed: {e}"));
    let schema: String = conn
        .query_row(
            "SELECT value FROM schema_meta WHERE key = 'schema_version'",
            [],
            |r| r.get(0),
        )
        .unwrap_or_else(|_| "?".into());
    let count = |sql: &str| -> i64 { conn.query_row(sql, [], |r| r.get(0)).unwrap_or(0) };
    let facts = count("SELECT COUNT(*) FROM usage_facts WHERE deleted_at_ms IS NULL");
    let sources = count("SELECT COUNT(*) FROM source_files");
    let sessions = count("SELECT COUNT(*) FROM sessions WHERE deleted_at_ms IS NULL");
    let issues = count("SELECT COUNT(*) FROM data_quality_issues WHERE resolved_at_ms IS NULL");
    let pricing_snapshots = count("SELECT COUNT(*) FROM pricing_snapshots");
    let host_bills = count("SELECT COUNT(*) FROM host_bills WHERE deleted_at_ms IS NULL");

    let mut issues_by_code: Map<String, Value> = Map::new();
    if let Ok(mut stmt) = conn.prepare(
        "SELECT code, COUNT(*) FROM data_quality_issues
         WHERE resolved_at_ms IS NULL GROUP BY code ORDER BY code",
    ) {
        if let Ok(rows) = stmt.query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, i64>(1)?))) {
            for (code, n) in rows.flatten() {
                issues_by_code.insert(code, json!(n));
            }
        }
    }

    let mut runs = Vec::new();
    if let Ok(mut stmt) = conn.prepare(
        "SELECT run_id, trigger, status, started_at_ms, error_code FROM sync_runs
         ORDER BY started_at_ms DESC LIMIT 5",
    ) {
        if let Ok(rows) = stmt.query_map([], |r| {
            Ok(json!({
                "run_id": r.get::<_, String>(0)?,
                "trigger": r.get::<_, String>(1)?,
                "status": r.get::<_, String>(2)?,
                "started_at_ms": r.get::<_, i64>(3)?,
                "error_code": r.get::<_, Option<String>>(4)?,
            }))
        }) {
            runs.extend(rows.flatten());
        }
    }

    // spec §7.1 impl note（draft-3）：逐宿主最近观测时间 / 事实数 / 覆盖起止。
    let by_host = per_host_breakdown(conn);

    let last_run_bad = runs
        .first()
        .is_some_and(|r| matches!(r["status"].as_str(), Some("failed") | Some("running")));

    // spec 1.7 / §5.3：权威库不自愈——损坏 / 被清空必须诚实报 critical + 恢复
    // 入口，绝不静默端出 facts=0 当成「没花钱」。
    let mut hints: Vec<Value> = Vec::new();
    let health = if !db_existed && enabled {
        hints.push(json!("authority DB was just created (was missing) while sql_authority_enabled=true — legacy state-JSON writes are FROZEN, so a fresh empty DB means lost history, not zero spend"));
        hints.push(json!("recover: `agent-vitals sync-facts` to repopulate from session logs, then `agent-vitals data-migrate` if you kept the legacy facts JSONL"));
        hints.push(json!("or `agent-vitals data authority disable` to resume dual-write (legacy state JSON becomes authoritative again)"));
        "critical"
    } else if !integrity.eq_ignore_ascii_case("ok") {
        hints.push(json!(format!("SQLite integrity_check: {integrity}")));
        hints.push(json!("the authority DB does NOT self-heal — rebuild from the authoritative facts JSONL: `rm ~/.agent-vitals/agent-vitals.sqlite3*` then `agent-vitals data-migrate`"));
        "critical"
    } else if enabled && facts == 0 {
        hints.push(json!("sql_authority_enabled=true but the authority DB has zero facts — run `agent-vitals sync-facts`; do not read zero as 'no spend'"));
        "critical"
    } else if last_run_bad {
        hints.push(json!("most recent sync run did not succeed — check `error_code` above and re-run `agent-vitals sync-facts`"));
        "warn"
    } else {
        "ok"
    };

    json!({
        "schema_version": schema,
        "integrity": integrity,
        "facts": facts,
        "sources": sources,
        "sessions": sessions,
        "open_quality_issues": issues,
        "open_quality_issues_by_code": Value::Object(issues_by_code),
        "sql_authority_enabled": enabled,
        "pricing_snapshots": pricing_snapshots,
        "host_bills": host_bills,
        "recent_runs": runs,
        "by_host": by_host,
        "health": health,
        "hints": hints,
    })
}

/// `{ host: { facts, sources, covered_from, covered_to, last_seen_at } }`。
/// 空对象 = 库里一个宿主都没有（不是错误——诚实的空）。
fn per_host_breakdown(conn: &Connection) -> Value {
    use super::ms_to_rfc3339_beijing;
    let mut out: Map<String, Value> = Map::new();

    if let Ok(mut stmt) = conn.prepare(
        "SELECT host, COUNT(*), MIN(event_ts_ms), MAX(event_ts_ms)
         FROM usage_facts
         WHERE deleted_at_ms IS NULL AND observation_kind != 'legacy_aggregate'
         GROUP BY host ORDER BY host",
    ) {
        if let Ok(rows) = stmt.query_map([], |r| {
            Ok((
                r.get::<_, String>(0)?,
                r.get::<_, i64>(1)?,
                r.get::<_, Option<i64>>(2)?,
                r.get::<_, Option<i64>>(3)?,
            ))
        }) {
            for (host, n, min_ts, max_ts) in rows.flatten() {
                out.insert(
                    host,
                    json!({
                        "facts": n,
                        "sources": 0,
                        "covered_from": min_ts.map(ms_to_rfc3339_beijing),
                        "covered_to": max_ts.map(ms_to_rfc3339_beijing),
                        "last_seen_at": Value::Null,
                    }),
                );
            }
        }
    }

    if let Ok(mut stmt) = conn.prepare(
        "SELECT host, COUNT(*), MAX(last_seen_at_ms) FROM source_files GROUP BY host ORDER BY host",
    ) {
        if let Ok(rows) = stmt.query_map([], |r| {
            Ok((r.get::<_, String>(0)?, r.get::<_, i64>(1)?, r.get::<_, Option<i64>>(2)?))
        }) {
            for (host, n, last_seen) in rows.flatten() {
                let entry = out.entry(host).or_insert_with(|| {
                    json!({
                        "facts": 0,
                        "sources": 0,
                        "covered_from": Value::Null,
                        "covered_to": Value::Null,
                        "last_seen_at": Value::Null,
                    })
                });
                entry["sources"] = json!(n);
                entry["last_seen_at"] = last_seen.map(ms_to_rfc3339_beijing).into();
            }
        }
    }

    Value::Object(out)
}

#[cfg(test)]
mod tests {
    use super::*;
    use agent_vitals_data::authority::AuthorityDb;

    fn tmp_home(tag: &str) -> std::path::PathBuf {
        std::env::temp_dir().join(format!(
            "avmcp-ds-{tag}-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ))
    }

    #[test]
    fn missing_db_is_a_hard_error() {
        let home = tmp_home("missing");
        let err = run(&json!({}), &home).unwrap_err();
        assert_eq!(err.code, "database_missing");
    }

    #[test]
    fn empty_db_reports_structurally_not_error() {
        let home = tmp_home("empty");
        std::fs::create_dir_all(&home).unwrap();
        let path = agent_vitals_data::authority::default_authority_path(&home);
        // 建一个空的合法权威库。
        AuthorityDb::open(&path, 1_700_000_000_000).unwrap();

        let env = run(&json!({}), &home).unwrap();
        assert_eq!(env["schema_version"], "1");
        assert_eq!(env["data"]["facts"], 0);
        assert_eq!(env["data"]["health"], "ok");
        assert_eq!(env["authority_state"], "candidate");
        assert_eq!(env["coverage"]["status"], "not_applicable");
        assert!(env["data"]["by_host"].as_object().unwrap().is_empty());
        // 从没同步过 → authority_revision 诚实为 null。
        assert_eq!(env["authority_revision"], Value::Null);

        let _ = std::fs::remove_dir_all(&home);
    }

    #[test]
    fn cli_and_mcp_read_the_exact_same_data() {
        // spec §5：CLI `data-status` 与 MCP `data_status` 工具**同源**。
        // CLI 渲染 `data_status_report(conn, ..)`；MCP 返回 envelope，其
        // `.data` 必须逐字节等于同一份 report。
        let home = tmp_home("same-source");
        std::fs::create_dir_all(&home).unwrap();
        let path = agent_vitals_data::authority::default_authority_path(&home);
        let db = AuthorityDb::open(&path, 1_700_000_000_000).unwrap();

        let cli_side = crate::mcp::data_status_report(db.conn(), true, false);
        let mcp_env = run(&json!({}), &home).unwrap();
        assert_eq!(mcp_env["data"], cli_side);

        let _ = std::fs::remove_dir_all(&home);
    }

    #[test]
    fn corrupt_db_is_a_business_error_not_silent_unavailable() {
        // S1 fix: spec §7.1 「integrity != ok → 错误码 database_unreadable」
        // 必须是业务错误（Err），不是带 `authority_state: "unavailable"` 的
        // 成功响应。后者会让 Python `tests/test_data_status_health.py` 的
        // 「corrupt → critical + exit 1」契约在 Rust 侧不复刻。
        let home = tmp_home("corrupt");
        std::fs::create_dir_all(&home).unwrap();
        let path = agent_vitals_data::authority::default_authority_path(&home);
        std::fs::write(&path, b"NOT A SQLITE DATABASE").unwrap();

        let err = run(&json!({}), &home).unwrap_err();
        assert_eq!(err.code, "database_unreadable");
        let _ = std::fs::remove_dir_all(&home);
    }

    #[test]
    fn schema_mismatch_is_a_business_error() {
        let home = tmp_home("schema-mismatch");
        std::fs::create_dir_all(&home).unwrap();
        let path = agent_vitals_data::authority::default_authority_path(&home);
        rusqlite::Connection::open(&path)
            .unwrap()
            .execute_batch(
                "CREATE TABLE schema_meta(key TEXT PRIMARY KEY, value TEXT NOT NULL);
                 INSERT INTO schema_meta VALUES('schema_version', '99');",
            )
            .unwrap();

        let err = run(&json!({}), &home).unwrap_err();
        assert_eq!(err.code, "schema_migration_required");
        let _ = std::fs::remove_dir_all(&home);
    }

    #[test]
    fn collect_report_flags_zero_facts_when_enabled() {
        let home = tmp_home("enabled-empty");
        std::fs::create_dir_all(&home).unwrap();
        let path = agent_vitals_data::authority::default_authority_path(&home);
        let db = AuthorityDb::open(&path, 1_700_000_000_000).unwrap();
        let rep = collect_report(db.conn(), true, true);
        assert_eq!(rep["health"], "critical");
        assert!(rep["hints"].as_array().unwrap().iter().any(|h| h
            .as_str()
            .unwrap_or("")
            .contains("zero facts")));
        let _ = std::fs::remove_dir_all(&home);
    }

    #[test]
    fn stale_host_is_reported_in_freshness_and_doctor_coverage() {
        let home = tmp_home("stale-host");
        std::fs::create_dir_all(&home).unwrap();
        let path = agent_vitals_data::authority::default_authority_path(&home);
        let db = AuthorityDb::open(&path, 1_700_000_000_000).unwrap();
        let now = crate::sql_sync::now_ms();
        let old = now - super::super::FRESHNESS_STALE_AFTER_MS - 1;
        let conn = db.conn();
        conn.execute(
            "INSERT INTO sync_runs(run_id, started_at_ms, completed_at_ms, trigger, status, schema_version)
             VALUES ('run-stale', ?1, ?1, 'test', 'succeeded', 1)",
            rusqlite::params![now],
        )
        .unwrap();
        for (host, fact_id, source_id, event_ts) in [
            ("dsh", "fact-old", "source-old", old),
            ("codex", "fact-current", "source-current", now),
        ] {
            conn.execute(
                "INSERT INTO source_files(source_id, host, path_hash, size_bytes, mtime_ns,
                                          parser_version, first_seen_at_ms, last_seen_at_ms,
                                          last_successful_run_id)
                 VALUES (?1, ?2, ?1, 0, 0, 1, ?3, ?3, 'run-stale')",
                rusqlite::params![source_id, host, now],
            )
            .unwrap();
            conn.execute(
                "INSERT INTO usage_facts(fact_id, host, machine_namespace, native_session_id,
                                         source_event_id, observation_kind, event_ts_ms,
                                         source_id, ingested_run_id, created_at_ms, updated_at_ms)
                 VALUES (?1, ?2, 'test', ?1, ?1, 'assistant-usage', ?3, ?4,
                         'run-stale', ?3, ?3)",
                rusqlite::params![fact_id, host, event_ts, source_id],
            )
            .unwrap();
        }

        let env = run(&json!({}), &home).unwrap();
        assert_eq!(env["freshness"]["stale_hosts"], json!(["dsh"]));
        assert_eq!(env["coverage"]["status"], "partial");
        assert_eq!(env["coverage"]["missing_hosts"], json!(["dsh"]));
        let _ = std::fs::remove_dir_all(&home);
    }
}
