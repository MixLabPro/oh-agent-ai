//! v0.9.1 Phase 2（spec §5.1/§7）：`sync_facts` 的 SQL 权威写入集成。
//!
//! `sync_service.rs` 保留「文件发现 → 差量 → emit」；本模块接手其后半程：
//! **不再写 facts/*.jsonl（JSONL 停写，存量为遗留），改为 SQL 权威写入**：
//! `sync_runs` 批次 → `source_files` upsert → `sessions` upsert →
//! `usage_facts` 写入，全部包在一个 `with_immediate_txn` 里（spec §5.1.4）。
//! 差量指纹改查 `source_files` 表（JSON checkpoint `.ingest-checkpoint.json`
//! 退役——首启时迁移，见 [`migrate_json_checkpoint`]）。
//!
//! **写协议两步分闱**：`AuthorityDb::begin_run`/`finish_run` 是批号观测记录
//! （§3.1 的恢复用），业务写入只经 `with_immediate_txn`。`begin_run` 在事务
//! **之前**落行，与 spec §5.1.4 的「事务内创建 sync_runs」措辞略有出入——
//! 批号先于事务，是为了幂等重跑用同一 run_id、以及 begin 失败时错误独立可见；
//! 真正动业务数据的写入仍在一个立即事务里，绝不半提交。
//!
//! 时钟注入点（Phase 1.5）：`now_ms()` 是本 crate 唯一读 `std::time` 的位置
//! （runtime 允许读时钟，data 不读）——所有 `*_at_ms` 从这里取。
//! `sync_host_sql` 进入时取一次 `now` 注入全程（一个批次 = 一格时间）；
//! `migrate_json_checkpoint` 完全由调用方注入。模块内无其他 `std::time` 读取。

use std::path::Path;

use agent_vitals_data::authority::{AuthorityDb, AuthorityError};
use agent_vitals_data::fact_writer_sql::SqlFactWriter;
use serde_json::Value;

/// 注入时钟（Phase 1.5）：runtime 是唯一读时钟层。
pub fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

/// 生成 run_id（幂等重跑 = 同来源同时段同 id；首版用 `{trigger}:{unix_ms}`）。
pub fn new_run_id(trigger: &str) -> String {
    format!("{trigger}:{}", now_ms())
}

/// v0.9.1 Phase 2.8（spec §5.3）：落一份**当前**价格快照进 `pricing_snapshots`。
/// `pricing_version` = `{pricing.json, codex_pricing.json}` 合并对象的
/// `fnv1a64_hex(canonical_json)`——内容指纹，价卡变则版本变。已存在 → 幂等
/// 吸收（返回 `false`）。`data-migrate` / `sync-facts` 每次调用一次，DB 里
/// 总有当前版本 + 历次运行留下的历史版本（Q13：调价日前后重放正确版本，
/// 消费面 `authority::pricing_snapshot_asof`）。
pub fn snapshot_current_pricing(db: &AuthorityDb) -> Result<bool, AuthorityError> {
    let combined = serde_json::json!({
        "pricing": agent_vitals_domain::cost::load_pricing(),
        "codex_pricing": crate::sessions::codex_cost::load_codex_pricing(),
    });
    let mut canon = String::new();
    agent_vitals_domain::source_identity::canonical_json(&combined, &mut canon);
    let version = agent_vitals_domain::source_identity::fnv1a64_hex(canon.as_bytes());
    let now = now_ms();
    db.with_immediate_txn(|conn| {
        let changed = conn.execute(
            "INSERT INTO pricing_snapshots(pricing_version, captured_at_ms, source_kind, payload_json)
             VALUES (?1, ?2, 'embedded-assets', ?3)
             ON CONFLICT(pricing_version) DO NOTHING",
            rusqlite::params![version, now, canon],
        )?;
        Ok(changed > 0)
    })
}

/// 保留窗月数的 fencepost 常量：spec「保留最近 13 个自然月（含当月）」→
/// cutoff = current − 12。**legacy（enforce_retention）与 authority
///（retention_usage_facts）必须同值**——13 vs 12 的窗差会让 §6.3 对账在
/// 13 个月后必然 mismatch（审查 P1-3）。
pub const RETENTION_MONTHS_MINUS_ONE: u32 = 12;

/// `sync_runs.trigger` 词表（spec §3.1）。例行 sync = cli；checkpoint 迁移 =
/// migration（观测/审计用）。
const TRIGGER_SYNC: &str = "cli";
const TRIGGER_MIGRATION: &str = "migration";

/// `source_files.parser_version`。第一版恒 1——事实行解析 schema 版本；语义
/// 与 `usage_fact.rs::CURRENT_SCHEMA_VERSION` 的演进纪律一致。
const PARSER_VERSION: i64 = 1;

/// `finish_run.error_code` 的稳定词（错误细节进 error_detail，code 可机器判）。
const ERR_ALL_FILES_FAILED: &str = "all_files_failed";
const ERR_DB_ERROR: &str = "db_error";
const ERR_MIGRATION: &str = "migration_failed";

/// JSON checkpoint 的 schema 版本号——必须与 `sync_service`（JSONL 版）的
/// `CHECKPOINT_SCHEMA_VERSION` 保持同一值：迁移期两版 checkpoint **读者**不能
/// 对同名叫出不同版本。该常量在 sync_service 是私有，这里显式写明 1。
const CHECKPOINT_SCHEMA_VERSION: u64 = 1;

/// checkpoint 文件名（与 JSONL 版同路径）。
fn checkpoint_path(data_home: &Path) -> std::path::PathBuf {
    data_home.join("facts").join(".ingest-checkpoint.json")
}

/// fact 对象里取 native_session_id（身份四边形之一；`build_usage_fact` 契约
/// 保证非空——filter 空串只是防御，不是语义分支）。
fn native_session_of(fact: &Value) -> Option<&str> {
    fact.get("native_session_id")
        .and_then(Value::as_str)
        .filter(|s| !s.is_empty())
}

/// 一批 facts → 按 `(native_session_id, 归一 profile)` 分组 + 缺身份残组。
///
/// - **profile 参与分组**（审查 P2）：`fact_writer_sql::session_key` 逐事实
///   按 profile 算外键——组内 profile 异构时，第二个事实算出的键与组首
///   upsert 的 sessions 行不同 → 外键炸批。归一规则 = `unwrap_or("default")`
///   （与 writer 的键构造同款），组键含 profile 后逐事实键与组行严格一致。
/// - 返回的 `missing` = 缺 native_session_id 的事实——**调用方记 quality
///   issue + rejected，不得据此造 session**（审查 P2：fallback stem 会留下
///   永无 usage 引用的孤儿会话行）。
type SessionGroups = Vec<(String, String, Vec<Value>)>;

fn group_facts_by_session(facts: &[Value]) -> (SessionGroups, Vec<Value>) {
    let mut groups: Vec<(String, String, Vec<Value>)> = Vec::new();
    let mut missing: Vec<Value> = Vec::new();
    for fact in facts {
        let Some(sid) = native_session_of(fact) else {
            missing.push(fact.clone());
            continue;
        };
        let profile = fact
            .get("source_profile")
            .and_then(Value::as_str)
            .unwrap_or("default")
            .to_string();
        match groups.iter_mut().find(|(k, p, _)| *k == sid && *p == profile) {
            Some((_, _, v)) => v.push(fact.clone()),
            None => groups.push((sid.to_string(), profile, vec![fact.clone()])),
        }
    }
    (groups, missing)
}

/// JSON checkpoint（`.ingest-checkpoint.json`）→ `source_files` 的一次性
/// 迁移（spec §7 Phase 2：JSON checkpoint 退役）。迁移成功后旧文件**改名
/// 保留**（`.ingest-checkpoint.json.migrated`），不删除（用户可审计）。
/// 幂等：文件不存在 = Ok(0)。文件存在但坏 JSON / schema_version 不匹配 =
/// Ok(0)（整体作废，与 JSONL 版「版本不匹配 → 全量重发」同语义，fact_id 的
/// exactly-once 兜底）。已改名 = 下次 Ok(0)。
///
/// 迁移记录走 `sync_runs`（trigger="migration"）：迁移也是写入，观测在规范里
/// 不缺席。DB 级失败 → 事务整体回退（零写入）+ run 标 failed + Err 上抛；
/// 事务提交成功后才改名（改名失败如实上抛，DB 行已幂等落库可重跑）。
pub fn migrate_json_checkpoint(
    db: &AuthorityDb,
    data_home: &Path,
    now_ms: i64,
) -> Result<usize, AuthorityError> {
    // **持久哨兵**（审查 P1-2）：迁移成功一次即永久标记——否则 sync 结尾
    // save_checkpoint 无条件重建 JSON 文件，下一轮 sync 又「文件存在」→
    // 每 5 分钟产一行 migration run（sync_runs 无界增长 + data-status 失明）。
    let sentinel: Option<String> = db
        .conn()
        .query_row(
            "SELECT value FROM schema_meta WHERE key = 'checkpoint_migrated'",
            [],
            |r| r.get(0),
        )
        .ok();
    if sentinel.as_deref() == Some("1") {
        return Ok(0);
    }
    let checkpoint = checkpoint_path(data_home);
    let text = match std::fs::read_to_string(&checkpoint) {
        Ok(t) => t,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(0),
        Err(e) => return Err(e.into()),
    };
    let doc: Value = match serde_json::from_str(&text) {
        Ok(v) => v,
        Err(_) => return Ok(0), // 照 JSONL 的宽容语义：坏 JSON = 空
    };
    if doc.get("schema_version").and_then(Value::as_u64) != Some(CHECKPOINT_SCHEMA_VERSION) {
        return Ok(0);
    }
    let Some(files) = doc.get("files").and_then(Value::as_object) else {
        return Ok(0);
    };

    let run_id = new_run_id(TRIGGER_MIGRATION);
    db.begin_run(&run_id, TRIGGER_MIGRATION, now_ms)?;

    let count = match db.with_immediate_txn(|conn| {
        let writer = SqlFactWriter::new(conn, &run_id, now_ms)?;
        let mut n = 0usize;
        for (path_key, entry) in files {
            // 项缺 host/size/mtime → 不迁：该项在下次差量里会被当「新文件」
            //（source_files 连一行都没有 → dirty → 重 emit），安全侧优先。
            let Some(host) = entry.get("host").and_then(Value::as_str) else {
                continue;
            };
            let (Some(size), Some(mtime)) = (
                entry.get("size").and_then(Value::as_u64),
                entry.get("mtime_ns").and_then(Value::as_u64),
            ) else {
                continue;
            };
            // 明文路径不落库：source_id = fnv1a64(路径) 由 writer 层算。
            // checkpoint 里不携带会话信息，native_session_id 不推断（None）。
            writer.upsert_source_file(
                host,
                std::path::Path::new(path_key),
                size,
                mtime,
                None,
                PARSER_VERSION,
            )?;
            n += 1;
        }
        Ok(n)
    }) {
        Ok(n) => n,
        Err(e) => {
            let msg = format!("{e}");
            let _ = db.finish_run(&run_id, "failed", Some(ERR_MIGRATION), Some(&msg), now_ms);
            return Err(e);
        }
    };

    // 事务提交成功后才改名。DB 行已落库（幂等可重跑），改名只是审计标记
    // 「这过了」——失败如实上抛（Io），下次重跑会再 upsert（幂等）并再试。
    let migrated_path = data_home
        .join("facts")
        .join(".ingest-checkpoint.json.migrated");
    std::fs::rename(&checkpoint, &migrated_path).map_err(AuthorityError::from)?;

    db.conn().execute(
        "INSERT OR REPLACE INTO schema_meta(key, value) VALUES('checkpoint_migrated', '1')",
        [],
    )?;

    db.finish_run(&run_id, "succeeded", None, None, now_ms)?;
    Ok(count)
}

/// SQL 版例行同步的结果形状，与 `sync_service::HostSyncReport` 对齐（CLI
/// 渲染复用）。`files_skipped` 由调用方（差量计算侧）填，本模块收到的
/// `dirty` 已经剔除了「指纹未变」的文件，故本模块不产生 skipped；
/// `errors` = 「该文件本轮没进库」的明细，与 JSONL 版的诚实噪声同语义
/// （坏文件每次重试都会再出现）。
#[derive(Debug, Default, Clone, PartialEq, Eq)]
pub struct SqlSyncOutcome {
    pub files_synced: usize,
    pub files_skipped: usize,
    pub inserted: usize,
    pub duplicate: usize,
    pub rejected: usize,
    pub errors: Vec<String>,
}

/// **迁移期双写的权威侧写入**（spec §6.1 迁移窗口）：调用方（sync_facts）
/// emit 一次，同一批事实既走旧链（ingest_facts，存量读面保鲜）也走本函数
/// （权威库）。`files` = (路径, 指纹, 该文件 facts)——emit 只发生一次，
/// 本函数不做 I/O。
///
/// Phase 3 读路径切换完成、`sql_authority_enabled` 设立后，旧链调用撤除，
/// 本函数成为唯一写入（届时可并入 `sync_host_sql`）。
pub fn write_facts_to_authority(
    db: &AuthorityDb,
    host: &str,
    machine_namespace: &str,
    files: &[(std::path::PathBuf, (u64, u64), Vec<Value>)],
    now: i64,
) -> Result<SqlSyncOutcome, String> {
    let run_id = new_run_id(TRIGGER_SYNC);
    db.begin_run(&run_id, TRIGGER_SYNC, now)
        .map_err(|e| format!("begin_run {run_id}: {e}"))?;

    let mut outcome = SqlSyncOutcome::default();
    let result: Result<(), AuthorityError> = db.with_immediate_txn(|conn| {
        let mut writer: Option<SqlFactWriter<'_>> = None;
        for (path, (size_bytes, mtime_ns), facts) in files {
            if writer.is_none() {
                writer = Some(SqlFactWriter::new(conn, &run_id, now)?);
            }
            let w = writer.as_ref().expect("writer 在首次使用前初始化");
            let mut distinct: Vec<&str> = Vec::new();
            for f in facts {
                if let Some(sid) = native_session_of(f) {
                    if !distinct.contains(&sid) {
                        distinct.push(sid);
                    }
                }
            }
            let file_sid: Option<&str> = if distinct.len() == 1 {
                Some(distinct[0])
            } else {
                None
            };
            let source_id = w.upsert_source_file(
                host,
                path,
                *size_bytes,
                *mtime_ns,
                file_sid,
                PARSER_VERSION,
            )?;
            if facts.is_empty() {
                outcome.files_synced += 1;
                continue;
            }
            let (groups, missing) = group_facts_by_session(facts);
            for f in &missing {
                conn.execute(
                    "INSERT INTO data_quality_issues(
                         issue_id, scope_type, scope_key, code, severity,
                         first_seen_at_ms, last_seen_at_ms, detail_json)
                     VALUES (?1, 'fact', ?2, 'missing_native_session_id', 'warning',
                             ?3, ?3, ?4)
                     ON CONFLICT(scope_type, scope_key, code)
                     DO UPDATE SET last_seen_at_ms = excluded.last_seen_at_ms",
                    rusqlite::params![
                        format!(
                            "missing_sid:{}",
                            f.get("fact_id").and_then(Value::as_str).unwrap_or("unknown")
                        ),
                        source_id,
                        now,
                        format!("fact 缺 native_session_id：{}", f),
                    ],
                )
                .map_err(AuthorityError::from)?;
                outcome.rejected += 1;
            }
            for (sid, profile, group) in groups {
                w.upsert_session(host, machine_namespace, &sid, Some(&profile), now)?;
                let report = w.insert_facts(&group, &source_id, &sid)?;
                outcome.inserted += report.inserted;
                outcome.duplicate += report.duplicate;
                outcome.rejected += report.rejected;
            }
            outcome.files_synced += 1;
        }
        Ok(())
    });

    match result {
        Ok(()) => {
            db.finish_run(&run_id, "succeeded", None, None, now)
                .map_err(|e| format!("finish_run: {e}"))?;
            Ok(outcome)
        }
        Err(e) => {
            let msg = format!("{e}");
            let _ = db.finish_run(&run_id, "failed", Some(ERR_DB_ERROR), Some(&msg), now);
            Err(msg)
        }
    }
}

/// 迁移期双写的**扁平批次**变体：宿主 emitter 产出的整批 facts（可能跨
/// 多文件）一次写入。source 落为批次标记行 `{host}:sync`（批次级 provenance；
/// 会话下钻靠事实自身的 native_session_id）。事务纪律同 write_facts_to_authority。
pub fn write_flat_facts_to_authority(
    db: &AuthorityDb,
    host: &str,
    machine_namespace: &str,
    facts: &[Value],
    now: i64,
) -> Result<SqlSyncOutcome, String> {
    let run_id = new_run_id(TRIGGER_SYNC);
    db.begin_run(&run_id, TRIGGER_SYNC, now)
        .map_err(|e| format!("begin_run {run_id}: {e}"))?;

    let mut outcome = SqlSyncOutcome::default();
    let result: Result<(), AuthorityError> = db.with_immediate_txn(|conn| {
        let writer = SqlFactWriter::new(conn, &run_id, now)?;
        let source_id = writer.upsert_batch_source(host)?;
        let (groups, missing) = group_facts_by_session(facts);
        for f in &missing {
            conn.execute(
                "INSERT INTO data_quality_issues(
                     issue_id, scope_type, scope_key, code, severity,
                     first_seen_at_ms, last_seen_at_ms, detail_json)
                 VALUES (?1, 'fact', ?2, 'missing_native_session_id', 'warning',
                         ?3, ?3, ?4)
                 ON CONFLICT(scope_type, scope_key, code)
                 DO UPDATE SET last_seen_at_ms = excluded.last_seen_at_ms",
                rusqlite::params![
                    format!(
                        "missing_sid:{}",
                        f.get("fact_id").and_then(Value::as_str).unwrap_or("unknown")
                    ),
                    source_id,
                    now,
                    format!("fact 缺 native_session_id：{}", f),
                ],
            )
            .map_err(AuthorityError::from)?;
            outcome.rejected += 1;
        }
        for (sid, profile, group) in groups {
            writer.upsert_session(host, machine_namespace, &sid, Some(&profile), now)?;
            let report = writer.insert_facts(&group, &source_id, &sid)?;
            outcome.inserted += report.inserted;
            outcome.duplicate += report.duplicate;
            outcome.rejected += report.rejected;
        }
        Ok(())
    });

    match result {
        Ok(()) => {
            db.finish_run(&run_id, "succeeded", None, None, now)
                .map_err(|e| format!("finish_run: {e}"))?;
            Ok(outcome)
        }
        Err(e) => {
            let msg = format!("{e}");
            let _ = db.finish_run(&run_id, "failed", Some(ERR_DB_ERROR), Some(&msg), now);
            Err(msg)
        }
    }
}

/// 保留滚动的 cutoff（UTC ms）：`months_back` 个月前的月初 00:00（UTC）。
/// 月算术用 domain 的 civil 表（与 `dsh_days_map` 同源），不引 chrono。
pub fn retention_cutoff_ms(current_month: &str, months_back: u32) -> Option<i64> {
    let (y, m) = (
        current_month.get(0..4)?.parse::<i64>().ok()?,
        current_month.get(5..7)?.parse::<u32>().ok()?,
    );
    let total = (y * 12 + m as i64 - 1 - months_back as i64).max(0);
    agent_vitals_domain::usage::ms_from_civil(total / 12, (total % 12 + 1) as u32, 1, 0, 0, 0)
}

/// 对单宿主执行 SQL 写入。
///
/// `dirty` = (路径, (size, mtime_ns)) 差集——**调用方算好**（sync_service 的
/// 发现/差量复用不变）；`emit` = 宿主 emitter（同一函数）。本函数只管后
/// 半程：`sync_runs` 开批 → source_files/sessions/usage_facts 写入 → 收批。
///
/// 协议（spec §5.1.4）：begin_run（trigger="cli"）→ 一个 `with_immediate_txn`
/// 里逐文件「source_files upsert → emit → sessions upsert → insert_facts」→
/// finish_run。
///
/// - **文件级 emit 错误**：只收集进 `errors`、该文件不计 synced、批次不中止
///   ——与 JSONL 版「失败文件不进 checkpoint」的可重试语义完全一致；
/// - **DB 级错误**（upsert/insert 的 SQL 失败）：整批回滚到 0 写入（spec
///   §5.1.4「不许半提交」）→ run 标 failed + Err 上抛；
/// - **全失败**（零文件成交且 errors 非空）：run 标 failed + Err 上抛。
///
/// 批次的时间都取入口处 `now_ms()` 的一次读数（时钟注入点），不重复取。
pub fn sync_host_sql(
    db: &AuthorityDb,
    data_home: &Path,
    host: &str,
    machine_namespace: &str,
    dirty: &[(std::path::PathBuf, (u64, u64))],
    emit: impl Fn(&std::path::Path) -> Result<Vec<serde_json::Value>, String>,
) -> Result<SqlSyncOutcome, String> {
    let _ = data_home; // 文件发现/差量在调用方（本函数只吃 dirty 不碰 fs）
    let now = now_ms(); // 时钟注入点：本批所有 `*_at_ms` 用同一次读数
    let run_id = new_run_id(TRIGGER_SYNC);
    db.begin_run(&run_id, TRIGGER_SYNC, now)
        .map_err(|e| format!("begin_run {run_id}: {e}"))?;

    // **emit 在事务外**（审查 P2）：emit 是宿主日志 I/O + 解析（毫秒到秒
    // 级），关进 BEGIN IMMEDIATE 会把写锁横跨 I/O 持有——并发读被无谓阻塞。
    // 先全部 emit 进内存，事务只包 DB 写入（spec §5.1.4 的事务语义指
    // 「写入原子性」，不要求把源读取也关进去）。文件级 emit 错误收集进
    // errors、不计 synced（重试语义与 JSONL 版一致）。
    let mut emitted: Vec<(std::path::PathBuf, u64, u64, Vec<Value>)> = Vec::new();
    let mut outcome = SqlSyncOutcome::default();
    for (path, (size_bytes, mtime_ns)) in dirty {
        match emit(path) {
            Ok(f) => emitted.push((path.clone(), *size_bytes, *mtime_ns, f)),
            Err(e) => outcome.errors.push(format!("{}: {e}", path.display())),
        }
    }

    let result: Result<(), AuthorityError> = db.with_immediate_txn(|conn| {
        // writer 惰性构造：若所有文件都在 emit 阶段失败（合法错误路径），
        // 一个 DB 写入都不发生——`new()` 的 run 预检不该成为失效点。
        let mut writer: Option<SqlFactWriter<'_>> = None;
        for (path, size_bytes, mtime_ns, facts) in &emitted {
            if writer.is_none() {
                writer = Some(SqlFactWriter::new(conn, &run_id, now)?);
            }
            let w = writer.as_ref().expect("writer 在首次使用前初始化");

            // 源文件 upsert：首见/再看都记录（size/mtime 指纹即下次差量的
            // 「已同步」对照）。native_session_id 从 emit 事实推断：
            // 单一会话带下去（claude/codex/dsh 一文件一会话），无/多会话则
            // None（源文件面的 native id 只是「主会话」提示，非强约束）。
            let mut distinct: Vec<&str> = Vec::new();
            for f in facts {
                if let Some(sid) = native_session_of(f) {
                    if !distinct.contains(&sid) {
                        distinct.push(sid);
                    }
                }
            }
            let file_sid: Option<&str> = if distinct.len() == 1 {
                Some(distinct[0])
            } else {
                None
            };
            let source_id =
                w.upsert_source_file(host, path, *size_bytes, *mtime_ns, file_sid, PARSER_VERSION)?;

            if facts.is_empty() {
                // 无事实但有源文件 → 仍算 synced（元数据被记录，本批无账）
                outcome.files_synced += 1;
                continue;
            }
            let (groups, missing) = group_facts_by_session(facts);
            // 缺 native_session_id 的事实 → quality issue + rejected，
            // **不造 session**（审查 P2：fallback stem 孤儿会话行）。
            for f in &missing {
                conn.execute(
                    "INSERT INTO data_quality_issues(
                         issue_id, scope_type, scope_key, code, severity,
                         first_seen_at_ms, last_seen_at_ms, detail_json)
                     VALUES (?1, 'fact', ?2, 'missing_native_session_id', 'warning',
                             ?3, ?3, ?4)
                     ON CONFLICT(scope_type, scope_key, code)
                     DO UPDATE SET last_seen_at_ms = excluded.last_seen_at_ms",
                    rusqlite::params![
                        format!(
                            "missing_sid:{}",
                            f.get("fact_id").and_then(Value::as_str).unwrap_or("unknown")
                        ),
                        source_id,
                        now,
                        format!("fact 缺 native_session_id：{}", f),
                    ],
                )
                .map_err(AuthorityError::from)?;
                outcome.rejected += 1;
            }
            for (sid, profile, group) in groups {
                let sid_ref = sid.as_str();
                let profile_ref = profile.as_str();
                // 会话 upsert：profile 用分组归一值（与 writer 键构造同款
                // 缺省），insert 阶段逐事实键与组行字节一致。
                w.upsert_session(host, machine_namespace, sid_ref, Some(profile_ref), now)?;
                let report = w.insert_facts(&group, &source_id, sid_ref)?;
                outcome.inserted += report.inserted;
                outcome.duplicate += report.duplicate;
                outcome.rejected += report.rejected;
            }
            outcome.files_synced += 1;
        }
        Ok(())
    });

    match result {
        Ok(_) => {}
        Err(e) => {
            let msg = format!("{e}");
            let _ = db.finish_run(&run_id, "failed", Some(ERR_DB_ERROR), Some(&msg), now);
            return Err(msg);
        }
    }

    if outcome.files_synced == 0 && !outcome.errors.is_empty() {
        let detail = outcome.errors.join("; ");
        db.finish_run(
            &run_id,
            "failed",
            Some(ERR_ALL_FILES_FAILED),
            Some(&detail),
            now,
        )
        .map_err(|e| format!("finish_run {run_id}: {e}"))?;
        return Err(detail);
    }

    db.finish_run(&run_id, "succeeded", None, None, now)
        .map_err(|e| format!("finish_run {run_id}: {e}"))?;
    Ok(outcome)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    fn tmp_home(tag: &str) -> PathBuf {
        let base = std::env::temp_dir().join(format!(
            "avr-sqlsync-{tag}-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir_all(&base).unwrap();
        base
    }

    fn open_db(home: &Path) -> AuthorityDb {
        AuthorityDb::open(&home.join("agent-vitals.sqlite3"), 1_000).unwrap()
    }

    #[test]
    fn now_ms_is_positive_epoch_millis() {
        assert!(now_ms() > 1_600_000_000_000);
    }

    #[test]
    fn new_run_id_embeds_trigger_and_epoch_millis() {
        let id = new_run_id("cli");
        assert!(id.starts_with("cli:"));
        let suffix = id.rsplit(':').next().unwrap();
        assert!(
            suffix.parse::<i64>().is_ok(),
            "run_id 后缀应为毫秒时间戳: {id}"
        );
        assert!(new_run_id("migration").starts_with("migration:"));
    }

    #[test]
    fn migrate_missing_checkpoint_is_ok_zero_without_run() {
        let home = tmp_home("nomig");
        let db = open_db(&home);
        // data_home/facts/.ingest-checkpoint.json 不存在 → Ok(0) 且无任何 run
        assert_eq!(migrate_json_checkpoint(&db, &home, 2_000).unwrap(), 0);
        let n: i64 = db
            .conn()
            .query_row("SELECT COUNT(*) FROM sync_runs", [], |r| r.get(0))
            .unwrap();
        assert_eq!(n, 0, "文件不存在时不产生迁移 run");
        std::fs::remove_dir_all(&home).unwrap();
    }

    #[test]
    fn migrate_schema_mismatch_is_noop_and_keeps_file() {
        let home = tmp_home("migsch");
        std::fs::create_dir_all(home.join("facts")).unwrap();
        let cp = home.join("facts/.ingest-checkpoint.json");
        std::fs::write(&cp, r#"{"schema_version":2,"files":{}}"#).unwrap();
        let db = open_db(&home);
        assert_eq!(migrate_json_checkpoint(&db, &home, 2_000).unwrap(), 0);
        assert!(cp.exists(), "版本不符：不迁也不改名");
        let n: i64 = db
            .conn()
            .query_row("SELECT COUNT(*) FROM source_files", [], |r| r.get(0))
            .unwrap();
        assert_eq!(n, 0);
        std::fs::remove_dir_all(&home).unwrap();
    }

    #[test]
    fn migrate_malformed_json_is_noop_and_keeps_file() {
        let home = tmp_home("migbad");
        std::fs::create_dir_all(home.join("facts")).unwrap();
        let cp = home.join("facts/.ingest-checkpoint.json");
        std::fs::write(&cp, "{not json").unwrap();
        let db = open_db(&home);
        assert_eq!(migrate_json_checkpoint(&db, &home, 2_000).unwrap(), 0);
        assert!(cp.exists());
        std::fs::remove_dir_all(&home).unwrap();
    }

    // ---- 不依赖 fact_writer_sql 的实现（writer 由并行 agent 实现）----

    #[test]
    fn sync_with_no_dirty_files_commits_a_succeeded_cli_run() {
        let home = tmp_home("emptysync");
        let db = open_db(&home);
        let out = sync_host_sql(&db, &home, "claude-code", "ns-test", &[], |_| Ok(vec![])).unwrap();
        assert_eq!(out.files_synced, 0);
        assert!(out.errors.is_empty());
        let (status, trigger): (String, String) = db
            .conn()
            .query_row(
                "SELECT status, trigger FROM sync_runs ORDER BY started_at_ms DESC LIMIT 1",
                [],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .unwrap();
        assert_eq!(status, "succeeded");
        assert_eq!(trigger, "cli");
        std::fs::remove_dir_all(&home).unwrap();
    }

    #[test]
    fn sync_with_all_files_erroring_marks_run_failed_and_reports() {
        let home = tmp_home("allfail");
        let db = open_db(&home);
        let dirty = vec![
            (home.join("a.jsonl"), (0u64, 0u64)),
            (home.join("b.jsonl"), (0, 0)),
        ];
        let err = sync_host_sql(&db, &home, "claude-code", "ns-test", &dirty, |_| {
            Err("boom".to_string())
        })
        .unwrap_err();
        assert!(err.contains("boom"), "错误细节应上抛: {err}");
        let (status, code): (String, Option<String>) = db
            .conn()
            .query_row(
                "SELECT status, error_code FROM sync_runs WHERE trigger = 'cli' LIMIT 1",
                [],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .unwrap();
        assert_eq!(status, "failed");
        assert_eq!(code.as_deref(), Some("all_files_failed"));
        std::fs::remove_dir_all(&home).unwrap();
    }

    #[test]
    fn group_facts_by_session_splits_multi_session_batches() {
        let f1 = serde_json::json!({"native_session_id": "s-a", "source_profile": "default"});
        let f2 = serde_json::json!({"native_session_id": "s-a"});
        let f3 = serde_json::json!({"native_session_id": "s-b"});
        let (groups, missing) = group_facts_by_session(&[f1.clone(), f2.clone(), f3.clone()]);
        assert_eq!(groups.len(), 2);
        assert_eq!(groups[0].0, "s-a");
        assert_eq!(groups[0].1, "default", "无 profile 归一为 default");
        assert_eq!(groups[0].2.len(), 2);
        assert_eq!(groups[1].0, "s-b");
        assert!(missing.is_empty());

        // **profile 异构同 sid 拆两组**（审查 P2：组内异构会让逐事实外键
        // 与组行不一致 → 外键炸批）。
        let f4 = serde_json::json!({"native_session_id": "s-a", "source_profile": "other"});
        let (groups2, missing2) = group_facts_by_session(&[f1, f4]);
        assert_eq!(groups2.len(), 2, "profile 异构拆组");
        assert_eq!(groups2[1].1, "other");
        assert!(missing2.is_empty());

        // 缺 native_session_id（防御路径）→ missing 桶，**不造会话**。
        let f5 = serde_json::json!({"native_session_id": ""});
        let (groups3, missing3) = group_facts_by_session(&[f5]);
        assert!(groups3.is_empty());
        assert_eq!(missing3.len(), 1);
    }

    // ---- 端到端：writer 由并行 Agent 实现，未落地前 run 会 panic -- 这里
    // 端到端（writer 已落地，spec §8.2 矩阵）：

        #[test]
    fn migrate_checkpoint_populates_source_files_and_renames_file() {
        let home = tmp_home("mige2e");
        std::fs::create_dir_all(home.join("facts")).unwrap();
        let cp = home.join("facts/.ingest-checkpoint.json");
        std::fs::write(
            &cp,
            r#"{
                "schema_version": 1,
                "machine_namespace": "m1",
                "files": {
                    "/data/claude/a.jsonl": {"size": 1024, "mtime_ns": 100, "host": "claude-code"},
                    "/data/dsh/b.jsonl":    {"size": 2048, "mtime_ns": 200, "host": "dsh"}
                }
            }"#,
        )
        .unwrap();
        let db = open_db(&home);
        let n = migrate_json_checkpoint(&db, &home, 5_000).unwrap();
        assert_eq!(n, 2);
        let rows: i64 = db
            .conn()
            .query_row("SELECT COUNT(*) FROM source_files", [], |r| r.get(0))
            .unwrap();
        assert_eq!(rows, 2);
        assert!(!cp.exists());
        assert!(home.join("facts/.ingest-checkpoint.json.migrated").exists());
        // 迁移 run：succeeded + trigger=migration
        let (status, trigger, _): (String, String, i64) = db
            .conn()
            .query_row(
                "SELECT status, trigger, schema_version FROM sync_runs WHERE trigger = 'migration' LIMIT 1",
                [],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
            )
            .unwrap();
        assert_eq!(status, "succeeded");
        assert_eq!(trigger, "migration");
        std::fs::remove_dir_all(&home).unwrap();
    }

        #[test]
    fn migrate_renamed_checkpoint_is_noop_on_second_call() {
        let home = tmp_home("migidem");
        std::fs::create_dir_all(home.join("facts")).unwrap();
        let cp = home.join("facts/.ingest-checkpoint.json");
        std::fs::write(
            &cp,
            r#"{"schema_version":1,"files":{"/x.jsonl":{"size":1,"mtime_ns":1,"host":"dsh"}}}"#,
        )
        .unwrap();
        let db = open_db(&home);
        assert_eq!(migrate_json_checkpoint(&db, &home, 5_000).unwrap(), 1);
        // 第二次：文件已改名（migrated），不再迁移
        assert_eq!(migrate_json_checkpoint(&db, &home, 6_000).unwrap(), 0);
        let n: i64 = db
            .conn()
            .query_row("SELECT COUNT(*) FROM source_files", [], |r| r.get(0))
            .unwrap();
        assert_eq!(n, 1, "重复迁移不重复插入");
        std::fs::remove_dir_all(&home).unwrap();
    }

        #[test]
    fn sync_hosts_wraps_facts_source_session_in_one_transaction() {
        use agent_vitals_domain::usage_fact::build_usage_fact;

        let home = tmp_home("synce2e");
        let db = open_db(&home);
        let mut fields = serde_json::Map::new();
        fields.insert("machine_namespace".into(), serde_json::json!("ns-e2e"));
        fields.insert("host".into(), serde_json::json!("claude-code"));
        fields.insert("source_profile".into(), serde_json::json!("default"));
        fields.insert("native_session_id".into(), serde_json::json!("sess-1"));
        fields.insert("source_event_id".into(), serde_json::json!("evt-1"));
        fields.insert(
            "observation_kind".into(),
            serde_json::json!("assistant-usage"),
        );
        fields.insert(
            "event_ts_utc".into(),
            serde_json::json!("2026-09-06T10:00:00.000Z"),
        );
        fields.insert("model_raw".into(), serde_json::json!("claude-sonnet-5"));
        fields.insert("uncached_input_tokens".into(), serde_json::json!(10));
        fields.insert("output_tokens".into(), serde_json::json!(4));
        let fact = build_usage_fact(&fields).unwrap();

        let dirty = vec![(home.join("sess-1.jsonl"), (1234u64, 5678u64))];
        let out = sync_host_sql(&db, &home, "claude-code", "ns-e2e", &dirty, |_| {
            Ok(vec![fact.clone()])
        })
        .unwrap();
        assert_eq!(out.files_synced, 1);
        assert_eq!(out.inserted, 1);
        assert_eq!(out.duplicate, 0);
        assert_eq!(out.errors.len(), 0);

        let src: i64 = db
            .conn()
            .query_row("SELECT COUNT(*) FROM source_files", [], |r| r.get(0))
            .unwrap();
        assert_eq!(src, 1);
        let sess: i64 = db
            .conn()
            .query_row("SELECT COUNT(*) FROM sessions", [], |r| r.get(0))
            .unwrap();
        assert_eq!(sess, 1);
        let facts: i64 = db
            .conn()
            .query_row("SELECT COUNT(*) FROM usage_facts", [], |r| r.get(0))
            .unwrap();
        assert_eq!(facts, 1);

        // run 状态 succeeded
        let status: String = db
            .conn()
            .query_row(
                "SELECT status FROM sync_runs WHERE trigger = 'cli' LIMIT 1",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(status, "succeeded");
        std::fs::remove_dir_all(&home).unwrap();
    }
}
