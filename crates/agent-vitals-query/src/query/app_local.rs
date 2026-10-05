//! Explicit local-presentation projection; never reused by MCP or export.
use std::path::Path;
use agent_vitals_data::authority::{AuthorityDb, default_authority_path};
use agent_vitals_domain::enrichment::{ExcerptRole, make_excerpt};
use serde_json::{Value, json};
use super::session_ref::{load_or_create_salt, session_ref};

/// City 一次载入的会话上限：366 天窗口内最多 4000 条（岛初始规划 2000 栋、扩展到 4000 栋）。
/// 曾是 500：一年的数据只载入最近 500 条，城市是被截断的半年历史。
pub const SESSION_CAP: usize = 4_000;

/// Host-only drilldown bridge: resolve a City handle without exposing raw keys to the plugin.
pub fn city_session_target(data_home: &Path, handle: &str) -> Result<(String, String), &'static str> {
    if handle.len() != 35 || !handle.starts_with("sr_") || !handle[3..].bytes().all(|b| b.is_ascii_hexdigit()) { return Err("invalid_session_handle"); }
    let db = AuthorityDb::open_readonly(&default_authority_path(data_home)).map_err(|_| "data_unavailable")?;
    let salt = load_or_create_salt(data_home).map_err(|_| "data_unavailable")?;
    let mut stmt = db.conn().prepare("SELECT session_key, harness FROM sessions WHERE deleted_at_ms IS NULL").map_err(|_| "data_unavailable")?;
    let rows = stmt.query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?))).map_err(|_| "data_unavailable")?;
    for row in rows {
        let (key, harness) = row.map_err(|_| "data_unavailable")?;
        if session_ref(&salt, &format!("app:city:{key}")) == handle { return Ok((session_ref(&salt, &key), harness)); }
    }
    Err("session_unavailable")
}
fn timestamp(ms: i64) -> Result<String, &'static str> {
    jiff::Timestamp::from_millisecond(ms).map(|t| t.to_string()).map_err(|_| "invalid_window")
}

/// Rolling UTC interval [now-days, now], window-scoped tokens, bounded sessions.
pub fn city_projection(data_home: &Path, days: u16, now: i64) -> Result<Value, &'static str> {
    if !matches!(days, 7 | 30 | 90 | 366) { return Err("invalid_window"); }
    let from = now.checked_sub(i64::from(days) * 86_400_000).ok_or("invalid_window")?;
    let db = AuthorityDb::open_readonly(&default_authority_path(data_home)).map_err(|_| "data_unavailable")?;
    let salt = load_or_create_salt(data_home).map_err(|_| "data_unavailable")?;
    db.conn().execute_batch("BEGIN DEFERRED").map_err(|_| "data_unavailable")?;
    let revision = db.revision().map_err(|_| "data_unavailable")?;
    let identities = super::app_harnesses::identities(db.conn(), data_home)?;
    let sql = "SELECT s.session_key, s.harness, MIN(f.event_ts_ms), MAX(f.event_ts_ms),
        SUM(f.uncached_input_tokens + f.cache_read_tokens + f.cache_write_tokens),
        SUM(f.output_tokens), COUNT(*)
        FROM sessions s JOIN usage_facts f ON f.session_key = s.session_key
        WHERE s.deleted_at_ms IS NULL AND f.deleted_at_ms IS NULL
          AND f.event_ts_ms >= ?1 AND f.event_ts_ms <= ?2
        GROUP BY s.session_key ORDER BY MAX(f.event_ts_ms) DESC, s.session_key LIMIT ?3";
    let mut stmt = db.conn().prepare(sql).map_err(|_| "data_unavailable")?;
    let rows = stmt.query_map(rusqlite::params![from, now, SESSION_CAP as i64], |r| {
        Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?, r.get::<_, i64>(2)?,
            r.get::<_, i64>(3)?, r.get::<_, i64>(4)?, r.get::<_, i64>(5)?, r.get::<_, i64>(6)?))
    }).map_err(|_| "data_unavailable")?;
    let mut sessions = Vec::new();
    // 摘录查询只准备一次（4000 条会话逐条 prepare 是可感知的延迟）。
    let mut excerpts_stmt = db.conn().prepare_cached("SELECT role, excerpt, provenance FROM session_excerpts
        WHERE session_key = ?1 AND role IN ('user_first','user_turn')
        ORDER BY CASE role WHEN 'user_first' THEN 0 ELSE 1 END, ordinal DESC LIMIT 2")
        .map_err(|_| "data_unavailable")?;
    let mut ordered = Vec::new();
    for row in rows { ordered.push(row.map_err(|_| "data_unavailable")?); }
    // 超过上限时保留最近的 SESSION_CAP 条（SQL 按最近活动倒序 LIMIT），再按创建时间由远到近输出——
    // 城市由内向外生长、回放从最早的会话开始（与旧版分页载入的「旧 → 新」口径一致）。
    ordered.sort_by(|a, b| a.2.cmp(&b.2).then_with(|| a.0.cmp(&b.0)));
    for (key, harness, first, last, input, output, events) in ordered {
        let excerpts_rows = excerpts_stmt.query_map([&key], |r| {
            Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?, r.get::<_, String>(2)?))
        }).map_err(|_| "data_unavailable")?;
        let mut excerpts = Vec::new();
        for row in excerpts_rows {
            let (role, text, provenance) = row.map_err(|_| "data_unavailable")?;
            if let Some(role_value) = ExcerptRole::from_wire(&role) {
                if let Some(clean) = make_excerpt(&text, role_value) {
                    let clean_provenance = clean.provenance.as_str();
                    excerpts.push(json!({"role": role, "text": clean.text,
                        "provenance": if clean_provenance == "verbatim" { provenance.as_str() } else { clean_provenance },
                        "is_excerpt": true}));
                }
            }
        }
        let public_harness = if identities.contains_key(&harness) { harness.as_str() } else { "unknown" };
        sessions.push(json!({"id": session_ref(&salt, &format!("app:city:{key}")), "harness": public_harness,
            "first_event_at": timestamp(first)?, "last_event_at": timestamp(last)?, "event_count": events,
            "tokens": {"input": input, "output": output, "total": input.checked_add(output).ok_or("data_unavailable")?},
            "task_excerpts": excerpts}));
    }
    let total: i64 = db.conn().query_row("SELECT COUNT(DISTINCT f.session_key)
        FROM usage_facts f JOIN sessions s ON s.session_key = f.session_key
        WHERE f.deleted_at_ms IS NULL AND s.deleted_at_ms IS NULL AND f.event_ts_ms >= ?1 AND f.event_ts_ms <= ?2",
        rusqlite::params![from, now], |r| r.get(0)).map_err(|_| "data_unavailable")?;
    let unknown: i64 = db.conn().query_row("SELECT COUNT(DISTINCT f.session_key)
        FROM usage_facts f JOIN sessions s ON s.session_key = f.session_key
        WHERE f.deleted_at_ms IS NULL AND s.deleted_at_ms IS NULL AND f.event_ts_ms IS NULL",
        [], |r| r.get(0)).map_err(|_| "data_unavailable")?;
    let mut findings_stmt = db.conn().prepare("SELECT harness, severity, COUNT(*) FROM issue_instances
        WHERE status IN ('open','later') AND opened_at_ms >= ?1 AND opened_at_ms <= ?2
          AND severity IN ('critical','warning','info') GROUP BY harness, severity")
        .map_err(|_| "data_unavailable")?;
    let findings_rows = findings_stmt.query_map(rusqlite::params![from, now], |r| {
        Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?, r.get::<_, i64>(2)?))
    }).map_err(|_| "data_unavailable")?;
    let mut findings = Vec::new();
    for row in findings_rows {
        let (harness, severity, count) = row.map_err(|_| "data_unavailable")?;
        if crate::fact_harnesses::FACT_HARNESSES.contains(&harness.as_str()) {
            findings.push(json!({"harness": harness, "severity": severity, "count": count}));
        }
    }
    db.conn().execute_batch("COMMIT").map_err(|_| "data_unavailable")?;
    Ok(json!({"protocol": "city:v2", "source": "local", "data_revision": revision,
        "harnesses": super::app_harnesses::public_identities(&identities),
        "generated_at": timestamp(now)?,
        "window": {"days": days, "label": format!("最近 {days} 天"), "from": timestamp(from)?, "to": timestamp(now)?},
        "coverage": {"total": total, "returned": sessions.len(), "truncated": total > sessions.len() as i64,
            "unknown_time": unknown, "findings_state": "partial"},
        "status": if sessions.is_empty() { "empty" } else { "ready" }, "sessions": sessions, "findings": findings}))
}
