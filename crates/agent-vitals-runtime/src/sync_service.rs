//! Stage B 遗留收口：Runtime 共享 sync service —— 三宿主**例行** facts ingest。
//!
//! 本模块回答「**哪些会话文件该被 emit**」：文件发现（各宿主 sources 的
//! locate 面）→ `source_files` SQL 指纹差量 → emitter → authority 写入。这是
//! month.json/today.json 退休路径（§5）的第 ① 步——
//! facts 平面从「手动 `--write` 诊断」升级为「可例行驱动的生产流」（托盘
//! tick / CLI 定时都调这里，不各自长文件枚举）。
//!
//! **`source_files` 是纯性能优化，不是正确性来源**：指纹 `(size, mtime_ns)`
//! 丢失/回退的最坏后果是重发 → writer 层 fact_id exactly-once 全部 Duplicate，
//! 账目零影响。源文件元数据与事实同一 SQL 事务提交；失败文件没有指纹行，
//! 下次必然重试。
//!
//! **namespace**：例行服务用 `takeover::machine_namespace()`（机器身份，
//! 跨次运行稳定）——与 CLI `--write` 要求调用方显式传入不冲突：那是诊断
//! 命令「不许 CLI 编造身份」的纪律，而 sync service 的调用者身份就是机器
//! 本身（machine.json 持久化 UUID，重装明示新 profile，不静默重排历史）。
//!
//! **调用方**：托盘 tick（desktop `run_facts_sync`，claude-sync 成功后叠跑）
//! 与 CLI `sync-facts`。**不在此处的**：watcher（§7.1 门槛未触发）、SQLite
//! 旧 JSON 投影更新（已退役）。

use std::path::{Path, PathBuf};

use rusqlite::OptionalExtension;
use serde_json::{json, Value};

/// 单文件指纹（size + mtime 纳秒）——与 `claude_cost` fold checkpoint 同款。
/// **无时间戳字段**：指纹就是状态，字节确定性由构造保证。
fn fingerprint(path: &Path) -> Option<(u64, u64)> {
    let meta = std::fs::metadata(path).ok()?;
    let mtime = meta
        .modified()
        .ok()?
        .duration_since(std::time::UNIX_EPOCH)
        .ok()?;
    Some((meta.len(), mtime.as_nanos() as u64))
}

/// 单宿主同步结果。`errors` 是「该文件本轮没写进 authority」的
/// 明细——下次 sync 会重试它们（永久坏文件会每次重试并每次出现在这里，
/// 这是诚实噪声：坏文件不该被静默遗忘）。
#[derive(Debug, Default, serde::Serialize)]
pub struct HostSyncReport {
    pub host: String,
    pub files_seen: usize,
    pub files_synced: usize,
    pub files_skipped: usize,
    pub appended: usize,
    pub duplicate: usize,
    /// 迁移期双写（spec §6.1）：权威库侧新插入数。None = 权威库未启用
    /// （打开失败，错误已上 stderr）。
    pub sql_inserted: Option<usize>,
    pub sql_duplicate: Option<usize>,
    pub errors: Vec<String>,
}

/// 三宿主例行同步报告。
#[derive(Debug, Default, serde::Serialize)]
pub struct SyncReport {
    pub hosts: Vec<HostSyncReport>,
    pub total_appended: usize,
    pub total_duplicate: usize,
}

/// 对单个宿主执行「发现 → SQL 差量 → emit → authority 写入」。
/// `emit` 的宿主差异收敛在这个闭包里：输入差量文件集，输出事实批（或
/// 逐文件错误）。
fn sync_host(
    host: &str,
    ns: &str,
    db: &agent_vitals_data::authority::AuthorityDb,
    files: Vec<PathBuf>,
    report: &mut HostSyncReport,
) -> Result<(), String> {
    report.files_seen = files.len();
    let now = crate::sql_sync::now_ms();
    // schema v2 新增了 Codex 当前配额快照。升级已有权威库时，旧 source_files
    // 指纹会让所有 rollout 都被跳过，因而必须强制重放一次，不能把「日志未变」
    // 误当成「新派生状态已经存在」。没有 rate_limits 的历史也只重放一次：同一
    // 事务留下 schema_meta 标记，避免以后每个 tick 扫完整个 rollout 历史。
    let runtime_snapshot_backfill_needed = if host == "codex" {
        let already_backfilled: Option<i64> = db
            .conn()
            .query_row(
                "SELECT 1 FROM schema_meta
                 WHERE key = 'codex_quota_snapshot_backfilled_v2'",
                [],
                |row| row.get(0),
            )
            .optional()
            .map_err(|e| format!("read Codex quota backfill marker: {e}"))?;
        already_backfilled.is_none()
    } else {
        false
    };
    let mut dirty: Vec<(PathBuf, (u64, u64))> = Vec::new();
    for path in files {
        let fp = fingerprint(&path);
        let recorded = crate::sql_sync::source_file_fingerprint(db, host, &path)
            .map_err(|e| format!("source_files fingerprint: {e}"))?;
        match (fp, recorded) {
            // 解析器升级即使源文件字节不变也必须重放；fact_id 幂等吸收
            // 未变事实，新增解析结果会正常写入。
            (Some(fp), Some((size, mtime, parser_version)))
                if (size, mtime) == fp
                    && parser_version == crate::sql_sync::parser_version()
                    && !runtime_snapshot_backfill_needed =>
            {
                report.files_skipped += 1
            }
            (Some(fp), _) => dirty.push((path, fp)),
            (None, _) => report
                .errors
                .push(format!("{}: stat failed (vanished?)", path.display())),
        }
    }

    let mut facts: Vec<Value> = Vec::new();
    let mut runtime_snapshot: Option<Value> = None;
    let mut synced_sources: Vec<(PathBuf, (u64, u64))> = Vec::new();
    // codex 的 emitter 跨文件 `seen` 去重只在**单次调用内**成立（live/
    // archived 同 stem 双收靠它）——差量集必须一批喂进去，逐文件调用会把
    // 去重丢给 ingest 层（账不错但 duplicate 通胀 + 双倍 emit；tick 常驻后
    // 每 5 分钟付一次，审查 P2-1）。claude/dsh 是单文件语义，逐文件隔离错误。
    let codex_dirty: Vec<PathBuf> = dirty.iter().map(|(p, _)| p.clone()).collect();
    if host == "codex" && !codex_dirty.is_empty() {
        match agent_vitals_hosts::codex_usage_fact::codex_rollouts_to_usage_facts_with_route(
            &codex_dirty,
            ns,
            "default",
            None,
        ) {
            Ok(r) => {
                runtime_snapshot = r.quota_snapshot;
                facts.extend(r.facts);
                synced_sources.extend(dirty.iter().cloned());
            }
            Err(e) => {
                // 批量 Err = 任一文件读失败（read 层错误）——全部重试，
                // 错误如实上呈。
                report.errors.push(format!("codex batch: {e}"));
            }
        }
    }
    for (path, fp) in &dirty {
        if host == "codex" {
            continue; // 已批量处理
        }
        let emit: Result<Vec<Value>, String> = match host {
            "claude-code" => {
                let sid = path
                    .file_stem()
                    .and_then(|s| s.to_str())
                    .unwrap_or_default()
                    .to_string();
                agent_vitals_hosts::claude_usage_fact::claude_jsonl_to_usage_facts(
                    path, ns, "default", &sid,
                )
                .map(|r| r.facts)
            }
            "dsh" => agent_vitals_hosts::dsh_usage_fact::dsh_session_to_usage_facts(path, ns, None)
                .map(|r| r.facts),
            other => Err(format!("unknown host `{other}`")),
        };
        match emit {
            Ok(f) => {
                facts.extend(f);
                synced_sources.push((path.clone(), *fp));
            }
            Err(e) => report.errors.push(format!("{}: {e}", path.display())),
        }
    }

    if !synced_sources.is_empty() {
        let snapshot_write = (runtime_snapshot.is_some() || runtime_snapshot_backfill_needed)
            .then_some(crate::sql_sync::RuntimeSnapshotWrite {
                snapshot: runtime_snapshot.as_ref(),
                backfill_marker: runtime_snapshot_backfill_needed
                    .then_some("codex_quota_snapshot_backfilled_v2"),
            });
        let outcome = crate::sql_sync::write_flat_facts_with_sources(
            db,
            host,
            ns,
            &synced_sources,
            &facts,
            None,
            snapshot_write,
            now,
        )?;
        report.files_synced += outcome.files_synced;
        report.appended = outcome.inserted;
        report.duplicate = outcome.duplicate;
        report.sql_inserted = Some(outcome.inserted);
        report.sql_duplicate = Some(outcome.duplicate);
        report.errors.extend(outcome.errors);
    }
    Ok(())
}

/// 三宿主例行同步入口。幂等：重复调用第二次基本全 skipped / duplicate。
pub fn sync_facts(data_home: &Path) -> Result<SyncReport, String> {
    // **machine_namespace 首建单飞（审查 P2-3）**：machine.json 缺失时两个
    // 进程同时首启（托盘 tick + 外部 cron）会各自生成不同 ns、写各自的
    // machine.json（rename 竞态一方覆盖）→ 同一批文件的事实按两个 ns 拆开
    // 入库。把 bootstrap 关进 facts 锁（machine.json 快路径存在时锁是无谓
    // 成本，纳秒级；仅首次首启真正串行）。
    let ns = {
        let _g = crate::lease::acquire_blocking(
            &data_home.join("facts").join(".ingest.lock"),
            "facts-ns-bootstrap",
            60_000,
            10_000,
        )
        .map_err(|e| format!("facts ns bootstrap lease: {e}"))?;
        crate::takeover::machine_namespace()
    };
    // SQL authority 既是事实库也是例行同步的唯一差量索引。打开失败就失败，不能
    // 回落 JSON checkpoint 或旧 ingest 链，否则会制造「看似同步成功、SQL 未写」。
    let authority = agent_vitals_data::authority::AuthorityDb::open(
        &agent_vitals_data::authority::default_authority_path(data_home),
        crate::sql_sync::now_ms(),
    )
    .map_err(|e| format!("authority open failed: {e}"))?;
    if let Err(e) =
        crate::sql_sync::migrate_json_checkpoint(&authority, data_home, crate::sql_sync::now_ms())
    {
        return Err(format!("checkpoint migration failed: {e}"));
    }
    {
        let db = &authority;
        let bj_day = crate::clock::today_beijing();
        let ret_path = data_home.join("facts").join(".authority-retention.json");
        let last: Option<String> = crate::state::read_json(&ret_path).and_then(|v| {
            v.get("last_retention_date")
                .and_then(Value::as_str)
                .map(String::from)
        });
        // matches! 直接比 Option<String>（as_deref 会触发 needless lint）。
        if !matches!(&last, Some(d) if d == &bj_day) {
            // 保留滚动也是写入 → maintenance run（spec §5.4「记录 maintenance
            // run」）+ 事务；失败不盖日戳（审查 P2：静默顺延 24h 是劣化）。
            let run_id = crate::sql_sync::new_run_id("maintenance");
            let _ = db.begin_run(&run_id, "maintenance", crate::sql_sync::now_ms());
            let retention_months = crate::retention::retention_months(data_home)
                .map_err(|error| format!("retention configuration failed: {error}"))?;
            let cutoff = crate::sql_sync::retention_cutoff_ms(
                &crate::clock::current_month_beijing(),
                retention_months - 1,
            )
            .unwrap_or(0);
            let ret = db.retention_usage_facts(cutoff);
            let _ = db.finish_run(
                &run_id,
                if ret.is_ok() { "succeeded" } else { "failed" },
                ret.as_ref()
                    .err()
                    .map(|_| "retention_failed".to_string())
                    .as_deref(),
                ret.as_ref().err().map(|e| e.to_string()).as_deref(),
                crate::sql_sync::now_ms(),
            );
            match ret {
                Ok(n) => {
                    crate::state::atomic_write_json(
                        &ret_path,
                        &json!({"last_retention_date": bj_day}),
                    );
                    if n > 0 {
                        eprintln!("authority retention: dropped {n} facts ({retention_months}mo)");
                    }
                }
                Err(e) => eprintln!("authority retention failed: {e}"),
            }
        }
    }
    let mut report = SyncReport::default();

    // 各宿主 locate 面直取（hosts sources 的既有函数，不在这里重写枚举）。
    let user_home = PathBuf::from(
        std::env::var("HOME")
            .or_else(|_| std::env::var("USERPROFILE"))
            .unwrap_or_default(),
    );
    let batches: [(&str, Vec<PathBuf>); 3] = [
        (
            "claude-code",
            agent_vitals_hosts::claude_session::claude_project_files(&user_home),
        ),
        (
            "codex",
            agent_vitals_hosts::codex_session::codex_rollout_files(&crate::summary::codex_home()),
        ),
        (
            "dsh",
            crate::home::dsh_home()
                .map(|d| crate::sessions::discovery::dsh_session_files(&d))
                .unwrap_or_default(),
        ),
    ];
    for (host, files) in batches {
        let mut r = HostSyncReport {
            host: host.to_string(),
            ..Default::default()
        };
        sync_host(host, &ns, &authority, files, &mut r)?;
        report.total_appended += r.appended;
        report.total_duplicate += r.duplicate;
        report.hosts.push(r);
    }
    // v1.0 升级闭环：旧个人订阅若存在于历史价卡快照，先落为本地 host_bills。
    // 正常桌面同步也会经过这里，用户无需手动执行 CLI 迁移；失败只警告，不能
    // 阻断三宿主事实导入。
    if let Err(e) = crate::sql_sync::migrate_legacy_subscription_snapshots(
        &authority,
        crate::sql_sync::now_ms(),
    ) {
        eprintln!("sync-facts warning (legacy subscriptions): {e}");
    }
    // Phase 2.8：落当前价格快照（§5.3）。幂等——价卡不变则无新版本。
    if let Err(e) = crate::sql_sync::snapshot_current_pricing(&authority) {
        eprintln!("sync-facts warning (pricing snapshot): {e}");
    }
    Ok(report)
}

/// Force a Codex source replay for attribution migrations. This deliberately
/// invalidates only the Codex parser checkpoints; the normal sync path then
/// re-reads unchanged rollout files and preserves idempotent fact identities.
pub fn force_codex_provider_replay(data_home: &Path) -> Result<SyncReport, String> {
    let path = agent_vitals_data::authority::default_authority_path(data_home);
    let db = agent_vitals_data::authority::AuthorityDb::open(&path, crate::sql_sync::now_ms())
        .map_err(|e| format!("open authority for replay: {e}"))?;
    db.with_immediate_txn(|conn| {
        conn.execute(
            "UPDATE source_files SET parser_version = parser_version - 1 WHERE host = 'codex'",
            [],
        ).map(|_| ()).map_err(agent_vitals_data::authority::AuthorityError::Sqlite)
    }).map_err(|e| format!("invalidate Codex checkpoints: {e}"))?;
    drop(db);
    sync_facts(data_home)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tmp_home(tag: &str) -> PathBuf {
        std::env::temp_dir().join(format!(
            "avd-sync-{tag}-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ))
    }

    /// 一份最小 claude 会话（两条 usage 行）。
    fn claude_session(home: &Path) -> PathBuf {
        let dir = home.join(".claude").join("projects").join("p-x");
        std::fs::create_dir_all(&dir).unwrap();
        let p = dir.join("sess-a.jsonl");
        std::fs::write(
            &p,
            concat!(
                r#"{"type":"assistant","uuid":"u1","timestamp":"2026-09-05T10:00:00.000Z","message":{"id":"msg_1","model":"claude-sonnet-5","usage":{"input_tokens":10,"cache_read_input_tokens":20,"cache_creation_input_tokens":5,"output_tokens":3}}}"#,
                "\n",
                r#"{"type":"assistant","uuid":"u2","timestamp":"2026-09-05T10:01:00.000Z","message":{"id":"msg_2","model":"claude-sonnet-5","usage":{"input_tokens":11,"cache_read_input_tokens":21,"cache_creation_input_tokens":6,"output_tokens":4}}}"#,
                "\n",
            ),
        )
        .unwrap();
        p
    }

    /// 一份最小 codex rollout（一条 token_count）。
    fn codex_rollout(home: &Path) -> PathBuf {
        let dir = home
            .join(".codex")
            .join("sessions")
            .join("2026")
            .join("09")
            .join("05");
        std::fs::create_dir_all(&dir).unwrap();
        let p = dir.join("rollout-2026-09-05T17-00-00-abc.jsonl");
        std::fs::write(
            &p,
            concat!(
                r#"{"timestamp":"2026-09-05T17:00:00.000Z","type":"session_meta","payload":{"id":"cx-1","cwd":"/tmp/w"}}"#,
                "\n",
                r#"{"timestamp":"2026-09-05T17:01:00.000Z","type":"event_msg","payload":{"type":"token_count","info":{"total_token_usage":{"input_tokens":100,"cached_input_tokens":10,"output_tokens":20,"reasoning_output_tokens":0},"last_token_usage":{"input_tokens":100,"cached_input_tokens":10,"output_tokens":20,"reasoning_output_tokens":0},"model_context_window":272000},"rate_limits":{"plan_type":"plus","credits":{"has_credits":false},"primary":{"used_percent":67,"window_minutes":300,"resets_at":1788602460}}}}"#,
                "\n",
            ),
        )
        .unwrap();
        p
    }

    fn with_isolated_home<F: FnOnce(&Path)>(f: F) {
        // **必须用 crate::ENV_LOCK**（state/budget/r2a/summary 的测试全在用
        // 同一把）：任何会改 HOME/AGENT_VITALS_HOME 的测试持别的锁 = 两组
        // 并发互相把 atomic_write 写到对方家目录——2026-09-06 实际撞过。
        let _g = crate::ENV_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        let home = tmp_home("iso");
        std::fs::create_dir_all(&home).unwrap();
        let data_home = home.join("data");
        std::env::set_var("AGENT_VITALS_HOME", &data_home);
        let prev_home = std::env::var("HOME").ok();
        std::env::set_var("HOME", &home);
        let prev_profile = std::env::var("USERPROFILE").ok();
        std::env::remove_var("USERPROFILE");
        f(&home);
        match prev_home {
            Some(h) => std::env::set_var("HOME", h),
            None => std::env::remove_var("HOME"),
        }
        if let Some(h) = prev_profile {
            std::env::set_var("USERPROFILE", h);
        }
        std::env::remove_var("AGENT_VITALS_HOME");
        let _ = std::fs::remove_dir_all(&home);
    }

    #[test]
    fn sync_is_incremental_across_runs() {
        with_isolated_home(|home| {
            claude_session(home);
            codex_rollout(home);
            let data = std::env::var("AGENT_VITALS_HOME").unwrap();
            let data = PathBuf::from(data);

            let r1 = sync_facts(&data).unwrap();
            let cl = r1.hosts.iter().find(|h| h.host == "claude-code").unwrap();
            let cx = r1.hosts.iter().find(|h| h.host == "codex").unwrap();
            assert_eq!(cl.files_synced, 1, "首次全量：claude 1 文件");
            assert_eq!(cl.appended, 2, "两条 usage 事实");
            assert_eq!(cx.files_synced, 1, "首次全量：codex 1 文件");
            assert!(r1.total_appended > 0);
            let db = agent_vitals_data::authority::AuthorityDb::open(
                &agent_vitals_data::authority::default_authority_path(&data),
                crate::sql_sync::now_ms(),
            )
            .unwrap();
            let (quota, _) = db
                .runtime_snapshot_get("codex", "codex_quota")
                .unwrap()
                .expect("codex rate_limits 必须与同步事实同批落 SQL");
            assert_eq!(
                serde_json::from_str::<Value>(&quota).unwrap()["plan_type"],
                "plus"
            );

            // 第二次：全部 skipped（SQL source_files 指纹命中），零新增。
            let r2 = sync_facts(&data).unwrap();
            for h in &r2.hosts {
                assert_eq!(h.files_synced, 0, "{host} 二次不应有处理", host = h.host);
                assert_eq!(h.files_skipped, h.files_seen);
            }
            assert_eq!(r2.total_appended, 0);

            // 内容变化（追加一行）→ 该文件重新处理，但事实 exactly-once
            // → duplicate 而非双计。
            let sess = home.join(".claude/projects/p-x/sess-a.jsonl");
            let mut text = std::fs::read_to_string(&sess).unwrap();
            text.push_str(
                r#"{"type":"assistant","uuid":"u3","timestamp":"2026-09-05T10:02:00.000Z","message":{"id":"msg_3","model":"claude-sonnet-5","usage":{"input_tokens":1,"cache_read_input_tokens":1,"cache_creation_input_tokens":1,"output_tokens":1}}}"#,
            );
            text.push('\n');
            std::fs::write(&sess, text).unwrap();
            let r3 = sync_facts(&data).unwrap();
            let cl3 = r3.hosts.iter().find(|h| h.host == "claude-code").unwrap();
            assert_eq!(cl3.files_synced, 1, "变化文件重新处理");
            assert_eq!(cl3.appended, 1, "只有新行是新事实");
            assert_eq!(cl3.duplicate, 2, "旧行 fact_id 相同，幂等吞掉");
        });
    }

    #[test]
    fn normal_sync_surfaces_legacy_subscription_as_pending_candidate() {
        with_isolated_home(|_home| {
            let data = PathBuf::from(std::env::var("AGENT_VITALS_HOME").unwrap());
            let db = agent_vitals_data::authority::AuthorityDb::open(
                &agent_vitals_data::authority::default_authority_path(&data),
                crate::sql_sync::now_ms(),
            ).unwrap();
            let month = crate::clock::current_month_beijing();
            let payload = serde_json::json!({"pricing": {"catalog_2026_09": {
                "subscriptions": {"legacy": {
                    "provider": "minimax", "currency": "CNY", "amount_per_month": 114.0,
                    "reported_at": format!("{month}-01")
                }}
            }}}).to_string();
            db.pricing_snapshot_put("legacy-subscription-for-sync", "legacy", &payload, 1).unwrap();
            drop(db);

            sync_facts(&data).unwrap();
            let candidates = agent_vitals_data::authority::AuthorityDb::open(
                &agent_vitals_data::authority::default_authority_path(&data),
                crate::sql_sync::now_ms(),
            ).unwrap().pending_billing_import_candidates().unwrap();
            assert!(candidates.iter().any(|(_id, host, provider, currency, amount, start, status)| {
                host == "claude-code" && provider == "minimax"
                    && *amount == 11_400 && currency == "CNY" && start == &month && status == "pending"
            }), "normal sync must surface an unconfirmed legacy declaration: {candidates:?}");
        });
    }

    #[test]
    fn codex_quota_schema_backfill_replays_unchanged_rollout_once() {
        with_isolated_home(|home| {
            let rollout = codex_rollout(home);
            let data = PathBuf::from(std::env::var("AGENT_VITALS_HOME").unwrap());
            sync_facts(&data).unwrap();
            let db = agent_vitals_data::authority::AuthorityDb::open(
                &agent_vitals_data::authority::default_authority_path(&data),
                crate::sql_sync::now_ms(),
            )
            .unwrap();

            // 模拟由 schema v1 升级而来：原 rollout 指纹已经存在，但 v2 的
            // 派生快照及其 backfill 标记都尚未写入。
            db.conn()
                .execute(
                    "DELETE FROM host_runtime_snapshots
                     WHERE host = 'codex' AND snapshot_kind = 'codex_quota'",
                    [],
                )
                .unwrap();
            db.conn()
                .execute(
                    "DELETE FROM schema_meta
                     WHERE key = 'codex_quota_snapshot_backfilled_v2'",
                    [],
                )
                .unwrap();

            let replay = sync_facts(&data).unwrap();
            let codex = replay.hosts.iter().find(|h| h.host == "codex").unwrap();
            assert_eq!(codex.files_seen, 1);
            assert_eq!(codex.files_synced, 1, "unchanged rollout 必须为 v2 补快照");
            assert!(db
                .runtime_snapshot_get("codex", "codex_quota")
                .unwrap()
                .is_some());
            assert!(db
                .conn()
                .query_row(
                    "SELECT 1 FROM schema_meta
                     WHERE key = 'codex_quota_snapshot_backfilled_v2'",
                    [],
                    |_| Ok(true),
                )
                .unwrap());

            let stable = sync_facts(&data).unwrap();
            let codex = stable.hosts.iter().find(|h| h.host == "codex").unwrap();
            assert_eq!(codex.files_synced, 0, "backfill 后恢复普通 SQL 差量同步");
            assert!(rollout.exists());
        });
    }

    #[test]
    fn parser_version_change_replays_an_unchanged_source() {
        with_isolated_home(|home| {
            let source = claude_session(home);
            let data = PathBuf::from(std::env::var("AGENT_VITALS_HOME").unwrap());
            let first = sync_facts(&data).unwrap();
            assert_eq!(first.hosts[0].files_synced, 1);

            let db = agent_vitals_data::authority::AuthorityDb::open(
                &agent_vitals_data::authority::default_authority_path(&data),
                crate::sql_sync::now_ms(),
            )
            .unwrap();
            let path_hash = agent_vitals_domain::source_identity::fnv1a64_hex(
                source.to_string_lossy().as_bytes(),
            );
            db.conn()
                .execute(
                    "UPDATE source_files SET parser_version = parser_version - 1
                     WHERE host = 'claude-code' AND path_hash = ?1",
                    rusqlite::params![path_hash],
                )
                .unwrap();

            let second = sync_facts(&data).unwrap();
            let claude = second
                .hosts
                .iter()
                .find(|host| host.host == "claude-code")
                .unwrap();
            assert_eq!(claude.files_synced, 1, "解析器升级必须重放原文件");
            assert_eq!(claude.appended, 0, "原事实仍由 fact_id 幂等吸收");
            assert_eq!(claude.duplicate, 2);
        });
    }

    #[test]
    fn failing_files_are_reported_and_not_recorded_in_sql() {
        with_isolated_home(|home| {
            let dir = home.join(".claude/projects/p-bad");
            std::fs::create_dir_all(&dir).unwrap();
            // 不可读会导致 Err（read 失败走 Err 串）；用一个坏 JSON 行文件
            // ——emitter 对坏行抛错 → 该文件不能写入 source_files。
            let p = dir.join("bad.jsonl");
            std::fs::write(&p, "{not json\n").unwrap();
            let data = PathBuf::from(std::env::var("AGENT_VITALS_HOME").unwrap());
            let r = sync_facts(&data).unwrap();
            let cl = r.hosts.iter().find(|h| h.host == "claude-code").unwrap();
            assert!(!cl.errors.is_empty(), "坏文件必须出现在 errors 里");
            let db = agent_vitals_data::authority::AuthorityDb::open(
                &agent_vitals_data::authority::default_authority_path(&data),
                crate::sql_sync::now_ms(),
            )
            .unwrap();
            let n: i64 = db
                .conn()
                .query_row(
                    "SELECT COUNT(*) FROM source_files WHERE host = 'claude-code'",
                    [],
                    |row| row.get(0),
                )
                .unwrap();
            assert_eq!(n, 0, "失败文件不得留下 SQL 指纹，才能被下轮重试");
            let r2 = sync_facts(&data).unwrap();
            let cl2 = r2.hosts.iter().find(|h| h.host == "claude-code").unwrap();
            assert!(!cl2.errors.is_empty(), "下次 sync 重试坏文件（诚实噪声）");
        });
    }

    #[test]
    fn configured_retention_window_is_applied_by_sync_maintenance() {
        with_isolated_home(|_home| {
            let data = PathBuf::from(std::env::var("AGENT_VITALS_HOME").unwrap());
            crate::retention::save_retention_months(&data, 1).unwrap();
            let db = agent_vitals_data::authority::AuthorityDb::open(
                &agent_vitals_data::authority::default_authority_path(&data),
                crate::sql_sync::now_ms(),
            ).unwrap();
            db.begin_run("retention-test", "test", 1).unwrap();
            let cutoff = crate::sql_sync::retention_cutoff_ms(
                &crate::clock::current_month_beijing(), 0,
            ).unwrap();
            db.conn().execute(
                "INSERT INTO usage_facts(fact_id, host, machine_namespace, native_session_id,
                     source_event_id, observation_kind, event_ts_ms, event_peak,
                     uncached_input_tokens, cache_read_tokens, cache_write_tokens, output_tokens,
                     ingested_run_id, created_at_ms, updated_at_ms)
                 VALUES ('expired-by-config', 'codex', 'm', 's', 'event', 'token_count',
                         ?1, 0, 1, 0, 0, 0, 'retention-test', 1, 1)",
                rusqlite::params![cutoff - 1],
            ).unwrap();
            drop(db);

            sync_facts(&data).unwrap();

            let db = agent_vitals_data::authority::AuthorityDb::open_readonly(
                &agent_vitals_data::authority::default_authority_path(&data),
            ).unwrap();
            let remaining: i64 = db.conn().query_row(
                "SELECT COUNT(*) FROM usage_facts WHERE fact_id = 'expired-by-config'",
                [], |row| row.get(0),
            ).unwrap();
            assert_eq!(remaining, 0, "maintenance must use the saved one-month window");
        });
    }

    #[test]
    fn malformed_retention_configuration_stops_sync_before_maintenance() {
        with_isolated_home(|_home| {
            let data = PathBuf::from(std::env::var("AGENT_VITALS_HOME").unwrap());
            std::fs::create_dir_all(data.join("state")).unwrap();
            std::fs::write(data.join("state").join("retention-config.json"), b"invalid").unwrap();
            let error = sync_facts(&data).unwrap_err();
            assert!(error.contains("retention configuration failed"), "{error}");
        });
    }
}
