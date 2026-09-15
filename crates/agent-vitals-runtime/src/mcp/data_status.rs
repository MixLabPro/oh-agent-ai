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
            "description": "The standard response envelope (schema_version, data_version, authority_state, authority_revision, coverage, freshness, warnings, data). `data` carries: schema_version, integrity, facts, sources, sessions, open_quality_issues(+_by_code), sql_authority_enabled, pricing_snapshots, pricing health, unresolved_tokens, unpriced_tokens, host_bills, recent_runs, by_host, health, hints."
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
    let mut report = collect_report(&conn, true, enabled);
    augment_sync_failure(&mut report, data_home);

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

/// Merge the desktop/runtime sync receipt into the read-only data-status view.
/// The authority DB can legitimately have zero rows when discovery failed before
/// the first source file was written; without this receipt MCP would report an
/// empty healthy source instead of the host-level failure.
pub fn augment_sync_failure(report: &mut Value, data_home: &Path) {
    let path = data_home.join("state").join("last-sync.json");
    let Ok(raw) = std::fs::read_to_string(path) else { return; };
    let Ok(status) = serde_json::from_str::<Value>(&raw) else { return; };
    if status["ok"].as_bool() != Some(false) { return; }
    let message = status["message"].as_str().unwrap_or("sync failed");
    let lower = message.to_lowercase();
    let error_code = if lower.contains("permission") || lower.contains("denied") {
        "permission_denied"
    } else if lower.contains("parse") || lower.contains("json") || lower.contains("malformed") {
        "source_parse_failed"
    } else {
        "source_read_failed"
    };
    let hosts = ["claude-code", "codex", "dsh", "workbuddy"];
    let affected: Vec<&str> = hosts.iter().copied()
        .filter(|host| message.contains(&format!("[{host}]")) || message.to_lowercase().contains(host))
        .collect();
    let affected = if affected.is_empty() { vec!["unknown"] } else { affected };
    let failures = report.as_object_mut().map(|object| {
        object.entry("source_failures").or_insert_with(|| json!({}));
        object.get_mut("source_failures").and_then(Value::as_object_mut).unwrap()
    });
    if let Some(failures) = failures {
        for host in affected {
            failures.insert(host.to_string(), json!({
                "connection_state": "needs_attention",
                "error_codes": [error_code],
                "recovery_action": "retry_sync"
            }));
        }
    }
    if let Some(object) = report.as_object_mut() {
        if object.get("health").and_then(Value::as_str) == Some("ok") {
            object.insert("health".into(), Value::String("warn".into()));
        }
        let hints = object.entry("hints").or_insert_with(|| json!([]));
        if let Some(hints) = hints.as_array_mut() {
            hints.push(json!(format!("source sync failed ({error_code}); retry `sync-facts`")));
        }
    }
}

fn fact_tokens(uncached: i64, cache_read: i64, cache_write: i64, output: i64) -> i64 {
    uncached + cache_read + cache_write + output
}

/// Count facts that the currently effective immutable pricing snapshot cannot
/// price. This deliberately uses the same domain pricing resolvers as the
/// product projections instead of treating `provider_id IS NULL` as a price
/// miss: an unknown provider may still be estimable from a model card.
/// 全库 token 总量（与 `unresolved_tokens` / `unpriced_tokens` **同跨度**）。
///
/// **为什么需要**：那两个数都是全库累计，而总览把它们渲染在「本月已处理 …」下面。
/// 没有这个总量时，前端的占比只能拿「全库未计价 ÷ 本月总量」去算——两个时间
/// 跨度相除，2026-09-14 实测算出的"少算了约 11%"就是这么来的（1.09B ÷ 9.60B）。
/// 给出同跨度的分母，占比才有意义。
fn total_tokens(conn: &Connection) -> i64 {
    conn.query_row(
        "SELECT COALESCE(SUM(uncached_input_tokens + cache_read_tokens +
                cache_write_tokens + output_tokens), 0)
         FROM usage_facts
         WHERE deleted_at_ms IS NULL AND observation_kind != 'legacy_aggregate'",
        [],
        |r| r.get::<_, i64>(0),
    )
    .unwrap_or(0)
}

fn unpriced_tokens(conn: &Connection, payload: Option<&Value>) -> i64 {
    let Some(payload) = payload else {
        return conn
            .query_row(
                "SELECT COALESCE(SUM(uncached_input_tokens + cache_read_tokens +
                        cache_write_tokens + output_tokens), 0)
                 FROM usage_facts
                 WHERE deleted_at_ms IS NULL
                   AND observation_kind != 'legacy_aggregate'",
                [],
                |r| r.get::<_, i64>(0),
            )
            .unwrap_or(0);
    };
    let main = payload.get("pricing").unwrap_or(payload);
    let codex = payload.get("codex_pricing").unwrap_or(payload);
    let entries = codex
        .get("entries")
        .and_then(Value::as_array)
        .map(Vec::as_slice)
        .unwrap_or(&[]);
    let mut total_unpriced = 0i64;
    let Ok(mut stmt) = conn.prepare(
        "SELECT host, provider_id, model_id, uncached_input_tokens,
                cache_read_tokens, cache_write_tokens, output_tokens
         FROM usage_facts
         WHERE deleted_at_ms IS NULL
           AND observation_kind != 'legacy_aggregate'",
    ) else {
        return 0;
    };
    let Ok(rows) = stmt.query_map([], |r| {
        Ok((
            r.get::<_, String>(0)?,
            r.get::<_, Option<String>>(1)?,
            r.get::<_, Option<String>>(2)?,
            r.get::<_, i64>(3)?,
            r.get::<_, i64>(4)?,
            r.get::<_, i64>(5)?,
            r.get::<_, i64>(6)?,
        ))
    }) else {
        return 0;
    };
    for row in rows.flatten() {
        let (host, provider, model, uncached, cache_read, cache_write, output) = row;
        let tokens = fact_tokens(uncached, cache_read, cache_write, output);
        let Some(model) = model else {
            total_unpriced += tokens;
            continue;
        };
        // WorkBuddy（E4b）：事实一律 provider null——平台积分 / 自配 key / 限免
        // 三轨请求级不可判（WORKBUDDY_ONBOARDING §2.1）。不能拿裸模型名去撞
        // DSH 价卡（真机 `deepseek-v4-flash` ×62 会命中 deepseek-official 卡，
        // 那是给「路由证据缺失」的 token 借一张别家的价卡）——整宿主计 unpriced。
        if host == "workbuddy" {
            total_unpriced += tokens;
            continue;
        }
        let priced = if host == "codex" {
            agent_vitals_domain::cost::codex_resolve_entry(&model, "standard", entries).is_some()
        } else if host == "claude-code" {
            let report = agent_vitals_domain::cost::claude_day_cost(
                &json!({
                    model.clone(): {
                        "input_tokens": uncached,
                        "cache_read_input_tokens": cache_read,
                        "cache_creation_input_tokens": cache_write,
                        "output_tokens": output
                    }
                }),
                main,
            );
            report
                .as_ref()
                .and_then(|v| v.get("unpriced_tokens"))
                .and_then(Value::as_i64)
                == Some(0)
        } else {
            let mut providers = serde_json::Map::new();
            if let Some(provider) = provider.as_deref() {
                providers.insert(model.clone(), Value::String(provider.to_string()));
            }
            let report = agent_vitals_domain::cost::cost_report(
                &json!({
                    "by_model": {
                        model.clone(): {
                            "uncached_input_tokens": uncached,
                            "cache_read_tokens": cache_read,
                            "cache_write_tokens": cache_write,
                            "output_tokens": output
                        }
                    },
                    "providers": providers
                }),
                main,
            );
            report
                .as_ref()
                .and_then(|v| v.get("unpriced_tokens"))
                .and_then(Value::as_i64)
                == Some(0)
        };
        if !priced {
            total_unpriced += tokens;
        }
    }
    total_unpriced
}

/// `PRAGMA integrity_check` 的进程级缓存（2026-09-14 性能取证）。
///
/// **为什么需要**：163MB 权威库上一次 integrity_check 实测 **522ms**。工作台每次
/// 切到「总览」都会调 `data_status`，于是每切一次 tab 就白付半秒——而工作台主线程
/// 还要渲染，界面直接被冻住（真机实测：切 tab 墙钟 1.25s，其中这一条占 0.5s）。
///
/// **为什么不降级成 quick_check 或干脆删掉**：integrity_check 是「权威库不自愈」
/// 这条恢复契约的唯一探测面（失败 = health critical，恢复 = rm + data-migrate）。
/// 削弱它等于削弱 doctor，所以保留全量检查，只缓存结果。
///
/// **失效条件**（任一命中即重查）：库文件 size 或 mtime 变了（应用自己的写入都会
/// 改，同步一跑就失效），或距上次检查超过 [`INTEGRITY_TTL`]。带外磁盘损坏若恰好
/// 不改 size 也不改 mtime，会在 TTL 窗口内被陈旧结果盖住——这是明确接受的代价，
/// 用 TTL 上限兜住。
///
/// **CLI 不受影响**：`agent-vitals data-status` 每次都是新进程，进程级缓存天然是
/// 冷的，命令行 doctor 仍然每次全量检查。缓存只对长期存活的 Tauri 进程生效，
/// 而那正是热路径所在。
const INTEGRITY_TTL: std::time::Duration = std::time::Duration::from_secs(300);

/// 库文件身份。size + mtime 任一变化即视为「另一个文件」。
#[derive(PartialEq, Clone)]
struct FileIdentity(u64, Option<std::time::SystemTime>);

struct IntegrityEntry {
    identity: FileIdentity,
    checked_at: std::time::Instant,
    result: String,
}

/// 缓存键：库文件路径 + 检查深度。深度必须入键——同一条连接上 Full 与 Quick
/// 的结论不同（Full 会多报索引与约束问题），共用一个槽位会让先到的深度污染另一个。
#[derive(PartialEq, Eq, Hash)]
struct CacheKey {
    path: String,
    depth: IntegrityDepth,
}

fn integrity_cache(
) -> &'static std::sync::Mutex<std::collections::HashMap<CacheKey, IntegrityEntry>> {
    static CACHE: std::sync::OnceLock<
        std::sync::Mutex<std::collections::HashMap<CacheKey, IntegrityEntry>>,
    > = std::sync::OnceLock::new();
    CACHE.get_or_init(|| std::sync::Mutex::new(std::collections::HashMap::new()))
}

/// 缓存决策核心——刻意做成「给定路径/身份 + 真正去查的闭包」的纯函数，好让
/// 「命中 / 身份变化 / TTL 过期」三条语义可以被确定性地断言，而不是靠构造一个
/// 真实的损坏 SQLite 文件去间接推断（2026-09-14 实践：截断文件根本不会让
/// integrity_check 失败——SQLite 把小于一页的文件当空库，仍回 "ok"）。
fn integrity_check_with(
    key: &CacheKey,
    identity: &FileIdentity,
    ttl: std::time::Duration,
    run: impl FnOnce() -> String,
) -> String {
    if let Ok(guard) = integrity_cache().lock() {
        if let Some(entry) = guard.get(key) {
            if entry.identity == *identity && entry.checked_at.elapsed() < ttl {
                return entry.result.clone();
            }
        }
    }
    let result = run();
    if let Ok(mut guard) = integrity_cache().lock() {
        guard.insert(
            CacheKey { path: key.path.clone(), depth: key.depth },
            IntegrityEntry {
                identity: identity.clone(),
                checked_at: std::time::Instant::now(),
                result: result.clone(),
            },
        );
    }
    result
}

fn run_integrity_check(conn: &Connection, depth: IntegrityDepth) -> String {
    conn.query_row(depth.pragma(), [], |r| r.get(0)).unwrap_or_else(|e| {
        format!("{} failed: {e}", match depth {
            IntegrityDepth::Full => "integrity_check",
            IntegrityDepth::Quick => "quick_check",
        })
    })
}

fn integrity_check_cached(conn: &Connection, depth: IntegrityDepth) -> String {
    // 内存库 / 取不到文件元信息的连接 → 不缓存，照常检查。
    let Some(path) = conn.path() else { return run_integrity_check(conn, depth) };
    let Ok(meta) = std::fs::metadata(path) else { return run_integrity_check(conn, depth) };
    let identity = FileIdentity(meta.len(), meta.modified().ok());
    // 深度进了缓存键：同一条连接上 Full 与 Quick 的结果不同（Full 会多报索引
    // 与约束问题），共用一个键会让先来的那个深度污染另一个深度的结论。
    integrity_check_with(
        &CacheKey { path: path.to_string(), depth },
        &identity,
        INTEGRITY_TTL,
        || run_integrity_check(conn, depth),
    )
}

/// 权威库状态报告——CLI `data-status` 与 MCP `data_status` 的共享数据面。
///
/// `db_existed`：调用方 open **之前**文件是否存在（CLI 用 `AuthorityDb::open`
/// 会建库，所以「刚被删」和「同步过但空」在 open 之后长得一样——前者在
/// `sql_authority_enabled` 下是灾难态，见 spec 1.7 / §5.3）。
/// `enabled`：`sql_authority::is_enabled(data_home)`。
/// 完整性检查的深度。
///
/// **为什么有两个深度**：`integrity_check` 在 163MB 权威库上实测 **522ms**
/// （2026-09-14），并发读下可到 1.2s——而工作台每次切到「总览」都会调
/// `data_status`，于是它成了整次刷新里最长的那根杆（实测：其余 10 条命令
/// 并行 100–450ms，总耗时被它单独顶到 1.2s）。
///
/// - [`IntegrityDepth::Full`]：`PRAGMA integrity_check`。**CLI `data-status` 与
///   MCP `data_status` 用它**——doctor 面必须逐字节可复现地给出最强结论
///   （CLAUDE.md：integrity_check 失败 → health critical，恢复 = rm + data-migrate）。
/// - [`IntegrityDepth::Quick`]：`PRAGMA quick_check`（同库实测 **113ms**，4.6×）。
///   它是**工作台热路径**用的深度：quick_check 仍校验 B-tree 结构、页序、空闲页、
///   溢出页链这些「库还能不能用」的结构性损坏，只是不再逐条核对索引与表内容是否
///   一致、UNIQUE/CHECK 约束与 rowid 序。桌面端的健康横幅要回答的是「权威库还能
///   不能读」，那个问题由 quick_check 覆盖；深挖是 doctor 的事。
///
/// 两个深度都走同一个 TTL 缓存（见 [`integrity_check_cached`]）。
#[derive(Clone, Copy, PartialEq, Eq, Hash)]
pub enum IntegrityDepth {
    Full,
    Quick,
}

impl IntegrityDepth {
    fn pragma(self) -> &'static str {
        match self {
            IntegrityDepth::Full => "PRAGMA integrity_check",
            IntegrityDepth::Quick => "PRAGMA quick_check",
        }
    }
}

/// 忠实复刻 `data-status` 原有语义的入口（全量完整性检查）——CLI 与 MCP 用。
pub fn collect_report(conn: &Connection, db_existed: bool, enabled: bool) -> Value {
    collect_report_at_depth(conn, db_existed, enabled, IntegrityDepth::Full)
}

/// 工作台热路径入口：quick_check + 缓存，避免每次切 tab 白付半秒。
pub fn collect_report_quick(conn: &Connection, db_existed: bool, enabled: bool) -> Value {
    collect_report_at_depth(conn, db_existed, enabled, IntegrityDepth::Quick)
}

pub fn collect_report_at_depth(
    conn: &Connection,
    db_existed: bool,
    enabled: bool,
    depth: IntegrityDepth,
) -> Value {
    let integrity = integrity_check_cached(conn, depth);
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
    let unresolved_tokens = conn
        .query_row(
            "SELECT COALESCE(SUM(uncached_input_tokens + cache_read_tokens +
                    cache_write_tokens + output_tokens), 0)
             FROM usage_facts AS f
             WHERE f.deleted_at_ms IS NULL
               AND f.observation_kind != 'legacy_aggregate'
               AND (f.provider_id IS NULL OR EXISTS (
                    SELECT 1 FROM data_quality_issues AS q
                    WHERE q.scope_key = f.fact_id
                      AND q.code = 'conflicting_route_evidence'
                      AND q.resolved_at_ms IS NULL
               ))",
            [],
            |r| r.get::<_, i64>(0),
        )
        .unwrap_or(0);
    let pricing_latest = conn
        .query_row(
            "SELECT pricing_version, captured_at_ms, source_kind FROM pricing_snapshots
             ORDER BY captured_at_ms DESC, pricing_version DESC LIMIT 1",
            [],
            |r| Ok((r.get::<_, String>(0)?, r.get::<_, i64>(1)?, r.get::<_, String>(2)?)),
        )
        .ok();
    let pricing_payload = pricing_latest.as_ref().and_then(|(version, _, _)| {
        conn.query_row(
            "SELECT payload_json FROM pricing_snapshots WHERE pricing_version = ?1",
            rusqlite::params![version],
            |r| r.get::<_, String>(0),
        )
        .ok()
        .and_then(|raw| serde_json::from_str::<Value>(&raw).ok())
        // **用户补的卡也要盖在这里**：本函数自带一份卡解析（不看 `PricingCards`），
        // 只盖 `PricingCards::asof` 会让「未计价 token 数」与「未计价逐模型清单」
        // 两个面互相矛盾——2026-09-14 实测：补卡后 `data-unresolved` 归零、
        // `data-status` 仍报同一批 token 无价卡。
        .map(|mut payload| {
            if let Some(main) = payload.get_mut("pricing") {
                crate::price_overrides::apply_to_main(main, &crate::home::data_home());
            }
            payload
        })
    });
    let unpriced_tokens = unpriced_tokens(conn, pricing_payload.as_ref());
    let total_tokens = total_tokens(conn);
    let pricing_stale = pricing_latest
        .as_ref()
        .map(|(_, captured_at_ms, _)| {
            crate::sql_sync::now_ms().saturating_sub(*captured_at_ms) > 30 * 24 * 60 * 60 * 1_000
        })
        .unwrap_or(true);

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
    } else if pricing_stale && facts > 0 {
        hints.push(json!(format!(
            "pricing snapshot is stale or unavailable — {} unresolved tokens and {} unpriced tokens require review",
            unresolved_tokens, unpriced_tokens
        )));
        "warn"
    } else if unresolved_tokens > 0 || unpriced_tokens > 0 {
        hints.push(json!(format!(
            "cost attribution is unresolved: {} tokens have uncertain provider evidence and {} tokens have no matching price card",
            unresolved_tokens, unpriced_tokens
        )));
        "warn"
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
        "pricing": {
            "snapshot_count": pricing_snapshots,
            "latest_version": pricing_latest.as_ref().map(|(v, _, _)| v),
            "latest_captured_at_ms": pricing_latest.as_ref().map(|(_, ts, _)| ts),
            "latest_source_kind": pricing_latest.as_ref().map(|(_, _, source)| source),
            "stale": pricing_stale,
        },
        "unresolved_tokens": unresolved_tokens,
        "unpriced_tokens": unpriced_tokens,
        // 同跨度的分母（见 total_tokens 的注释）。
        "total_tokens": total_tokens,
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
    fn integrity_cache_hits_until_identity_changes_or_ttl_expires() {
        // 三条语义，缺一不可：
        //   命中   —— 否则半秒的检查会回到每次切 tab 的热路径，性能修复失效；
        //   身份变 —— 否则 doctor 会对已损坏的库继续报 "ok"（谎报恢复契约）；
        //   TTL 到 —— 带外损坏（不改 size/mtime）最多陈旧一个 TTL 窗口。
        use std::cell::Cell;
        use std::time::Duration;

        // 全局缓存是进程级的，测试并行跑——用含 pid 的唯一 path 避免互踩。
        let key = CacheKey {
            path: format!("integrity-cache-test-{}", std::process::id()),
            depth: IntegrityDepth::Full,
        };
        let key_quick = CacheKey { path: key.path.clone(), depth: IntegrityDepth::Quick };
        let identity_a = FileIdentity(4096, None);
        let identity_b = FileIdentity(8192, None);
        let ttl = Duration::from_secs(300);
        let runs = Cell::new(0u32);
        let probe = |tag: &str| {
            runs.set(runs.get() + 1);
            tag.to_string()
        };

        let first = integrity_check_with(&key, &identity_a, ttl, || probe("first"));
        assert_eq!(first, "first");
        assert_eq!(runs.get(), 1, "首次没有缓存，必须真的去查");

        // 身份不变 → 命中缓存：闭包绝不能再被调用（返回值仍是旧的 "first"，
        // 这就是「没有重查」的直接证据）。
        let second = integrity_check_with(&key, &identity_a, ttl, || probe("second"));
        assert_eq!(second, "first", "身份未变必须命中缓存");
        assert_eq!(runs.get(), 1, "命中缓存时不得再执行检查");

        // TTL 过期 → 重查（传零 TTL 模拟）。
        let third = integrity_check_with(&key, &identity_a, Duration::ZERO, || probe("third"));
        assert_eq!(third, "third", "TTL 过期必须重查");
        assert_eq!(runs.get(), 2);

        // 身份变化 → 重查。
        let fourth = integrity_check_with(&key, &identity_b, ttl, || probe("fourth"));
        assert_eq!(fourth, "fourth", "文件身份变化必须重查");
        assert_eq!(runs.get(), 3);

        // 深度进键：同一路径的 Quick 结论不得复用 Full 的缓存槽。
        let quick = integrity_check_with(&key_quick, &identity_b, ttl, || probe("quick"));
        assert_eq!(quick, "quick", "换深度必须重查，不能被另一深度的缓存顶替");
        assert_eq!(runs.get(), 4);
    }

    #[test]
    fn collect_report_still_reports_a_healthy_database_as_ok() {
        // 缓存不能把「健康库报 ok」这条基本行为改掉。
        let home = tmp_home("integrity-healthy");
        std::fs::create_dir_all(&home).unwrap();
        let path = agent_vitals_data::authority::default_authority_path(&home);
        let db = AuthorityDb::open(&path, 1_700_000_000_000).unwrap();
        assert_eq!(collect_report(db.conn(), true, false)["integrity"], "ok");
        // 同一连接再查一次（走缓存路径）仍然 ok。
        assert_eq!(collect_report(db.conn(), true, false)["integrity"], "ok");
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
    fn collect_report_exposes_pricing_and_token_quality_metrics() {
        let home = tmp_home("quality-metrics");
        std::fs::create_dir_all(&home).unwrap();
        let path = agent_vitals_data::authority::default_authority_path(&home);
        let db = AuthorityDb::open(&path, 1_700_000_000_000).unwrap();
        let report = collect_report(db.conn(), true, false);

        assert_eq!(report["pricing"]["snapshot_count"], 0);
        assert_eq!(report["pricing"]["latest_version"], Value::Null);
        assert_eq!(report["pricing"]["latest_source_kind"], Value::Null);
        assert_eq!(report["pricing"]["stale"], true);
        assert_eq!(report["unresolved_tokens"], 0);
        assert_eq!(report["unpriced_tokens"], 0);

        let _ = std::fs::remove_dir_all(&home);
    }

    #[test]
    fn collect_report_counts_unknown_fact_tokens_as_unresolved_and_unpriced() {
        let home = tmp_home("quality-fact");
        std::fs::create_dir_all(&home).unwrap();
        let path = agent_vitals_data::authority::default_authority_path(&home);
        let db = AuthorityDb::open(&path, 1_700_000_000_000).unwrap();
        db.conn()
            .execute(
                "INSERT INTO sync_runs(run_id, started_at_ms, trigger, status, schema_version)
                 VALUES ('run-quality', 1, 'cli', 'succeeded', 2)",
                [],
            )
            .unwrap();
        db.conn()
            .execute(
                "INSERT INTO sessions(session_key, host, native_session_id, machine_namespace,
                 source_profile, last_observed_at_ms)
                 VALUES ('quality-session', 'codex', 'native-quality', 'machine', 'default', 1)",
                [],
            )
            .unwrap();
        db.conn()
            .execute(
                "INSERT INTO usage_facts(fact_id, host, machine_namespace, native_session_id,
                 session_key, source_event_id, observation_kind, provider_id, model_id,
                 event_ts_ms, uncached_input_tokens, cache_read_tokens, cache_write_tokens,
                 output_tokens, ingested_run_id, created_at_ms, updated_at_ms)
                 VALUES ('quality-fact', 'codex', 'machine', 'native-quality', 'quality-session',
                 'quality-event', 'assistant-usage', NULL, NULL, 1, 100, 200, 300, 400,
                 'run-quality', 1, 1)",
                [],
            )
            .unwrap();

        let report = collect_report(db.conn(), true, false);
        assert_eq!(report["unresolved_tokens"], 1_000);
        assert_eq!(report["unpriced_tokens"], 1_000);
        assert_eq!(report["health"], "warn");

        let _ = std::fs::remove_dir_all(&home);
    }

    #[test]
    fn collect_report_counts_model_specific_unpriced_tokens() {
        let home = tmp_home("quality-model");
        std::fs::create_dir_all(&home).unwrap();
        let path = agent_vitals_data::authority::default_authority_path(&home);
        let db = AuthorityDb::open(&path, 1_700_000_000_000).unwrap();
        db.conn()
            .execute(
                "INSERT INTO sync_runs(run_id, started_at_ms, trigger, status, schema_version)
                 VALUES ('run', 1, 'cli', 'succeeded', 2)",
                [],
            )
            .unwrap();
        db.conn()
            .execute(
                "INSERT INTO sessions(session_key, host, native_session_id,
                    machine_namespace, source_profile, last_observed_at_ms)
                 VALUES ('s', 'codex', 'native', 'm', 'default', 1)",
                [],
            )
            .unwrap();
        for (id, model, tokens) in [("known", "openai/gpt-5.6-luna", 3i64), ("unknown", "gpt-never-listed", 7i64)] {
            db.conn()
                .execute(
                    "INSERT INTO usage_facts(
                        fact_id, host, machine_namespace, native_session_id,
                        session_key, source_event_id, observation_kind,
                        provider_id, model_id, event_ts_ms, event_peak,
                        uncached_input_tokens, cache_read_tokens,
                        cache_write_tokens, output_tokens,
                        ingested_run_id, created_at_ms, updated_at_ms)
                     VALUES (?1, 'codex', 'm', 'native', 's', ?1,
                        'assistant-usage', NULL, ?2, 1, 0, ?3, 0, 0, 0,
                        'run', 1, 1)",
                    rusqlite::params![id, model, tokens],
                )
                .unwrap();
        }
        db.pricing_snapshot_put(
            "codex-card",
            "test",
            r#"{"codex_pricing":{"entries":[{"modelPrefix":"gpt-5.6-luna","speed":"standard","uncachedInputUsdPerMTok":"0.2","cacheReadUsdPerMTok":"0.02","cacheWrite5mUsdPerMTok":"0.25","outputUsdPerMTok":"1.2"}]}}"#,
            1,
        )
        .unwrap();

        let report = collect_report(db.conn(), true, false);
        assert_eq!(report["unpriced_tokens"], 7);
        assert_eq!(report["unresolved_tokens"], 10);

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

    #[test]
    fn sync_failure_receipt_is_visible_without_exposing_source_path() {
        let home = tmp_home("sync-failure-receipt");
        std::fs::create_dir_all(home.join("state")).unwrap();
        let path = agent_vitals_data::authority::default_authority_path(&home);
        let db = AuthorityDb::open(&path, 1_700_000_000_000).unwrap();
        let mut report = collect_report(db.conn(), true, false);
        std::fs::write(
            home.join("state").join("last-sync.json"),
            r#"{"ok":false,"stage":"partial","message":"sync-facts partial failure [claude-code]: /Users/alice/.claude/projects/private: Permission denied (os error 13)"}"#,
        ).unwrap();
        augment_sync_failure(&mut report, &home);
        assert_eq!(report["health"], "warn");
        assert_eq!(report["source_failures"]["claude-code"]["connection_state"], "needs_attention");
        assert_eq!(report["source_failures"]["claude-code"]["error_codes"], json!(["permission_denied"]));
        let serialized = serde_json::to_string(&report).unwrap();
        assert!(!serialized.contains("/Users/alice"));
        let _ = std::fs::remove_dir_all(&home);
    }
}
