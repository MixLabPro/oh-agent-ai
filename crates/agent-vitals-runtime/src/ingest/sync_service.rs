//! Stage B 遗留收口：Runtime 共享 sync service —— 四宿主**例行** facts ingest
//! （claude-code / codex / dsh，E4b 起 + workbuddy）。
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

use agent_vitals_domain::workflow::WorkflowEvent;
use rusqlite::OptionalExtension;
use serde_json::{json, Value};

/// 单文件指纹（size + mtime 纳秒）——与 `claude_cost` fold checkpoint 同款。
/// **无时间戳字段**：指纹就是状态，字节确定性由构造保证。
/// （换行边界扫描在 `agent-vitals-hosts::sources::parsers`——P3 起它属于
/// 解析器注册表，只有增量能力宿主才需要写换行边界检查点。）
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
    /// 本轮同步末尾按当前有效计费声明新写的归因行数
    /// （`AuthorityDb::billing_apply_active_declarations`）。
    pub declarations_applied: usize,
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
    // 配额扫描要用**整份候选清单**（下面这个循环会把 `files` 消费掉）。复制一份
    // 路径而已（247 个 PathBuf，可忽略），换来的是撞窗计数覆盖完整的 7 天窗口——
    // 只看 dirty 会把"近 7 天撞窗 3 次"报成 1 次，那是拿一个支持不了的数字当结论。
    let host_files: Vec<PathBuf> = files.clone();
    // 发现/失效判定走 SourceGraph classify()（F3 修复 + M2 参数对齐）。
    // 发现层与 emit 层用**同一组 classify 参数**——此前发现层硬编码
    // can_increment=false 而 emit 层判 true，两次调用结论矛盾（复跑 M2）。
    // 发现层只需正确判定 skip（Unchanged） vs 处理（非 Unchanged），
    // 具体增量/全量路由由 emit 层的第二次 classify 决定。
    let expected_version = crate::sql_sync::parser_version();
    // classify 的 expected_parser/can_increment 参数经宿主解析器注册表
    // （agent-vitals-hosts::sources::parsers，P3 宿主铺开）——runtime 不再
    // 持有 host 字符串特判。
    let descriptor = agent_vitals_hosts::parsers::descriptor_for(host);
    let expected_parser = descriptor.parser_id;
    let can_increment_discovery = descriptor.can_increment;
    for path in files {
        let fp = fingerprint(&path);
        let hash = crate::source_graph::path_hash(&path);
        let checkpoint = crate::source_graph::read_checkpoint(db.conn(), host, &hash)
            .map_err(|e| format!("source_graph checkpoint: {e}"))?;
        let on_disk = fp;
        let decision = crate::source_graph::classify(
            &checkpoint.unwrap_or_default(),
            on_disk,
            can_increment_discovery,
            expected_parser,
            expected_version,
        );
        // codex 配额快照回填需要：即便 Unchanged 也强制走一次
        if matches!(decision, crate::source_graph::Invalidation::Unchanged)
            && !runtime_snapshot_backfill_needed
        {
            report.files_skipped += 1;
            continue;
        }
        let Some(fp) = fp else {
            report
                .errors
                .push(format!("{}: stat failed (vanished?)", path.display()));
            continue;
        };
        // classify 判定非 Unchanged（或回填需要）→ 标脏 + 进处理列表
        crate::source_graph::mark_dirty(db.conn(), host, &hash)
            .map_err(|e| format!("source_graph mark_dirty: {e}"))?;
        dirty.push((path, fp));
    }

    let mut facts: Vec<Value> = Vec::new();
    // 本轮要落库的宿主实时快照（kind, payload, observed_at_ms）。Codex 的配额与
    // Claude 的窗口状态共用这一条路，但各自是独立的 snapshot_kind。
    let mut pending_snapshots: Vec<(&'static str, String, i64)> = Vec::new();
    let mut workflow_events: Vec<WorkflowEvent> = Vec::new();
    // V16：任务意图摘录（现仅 claude-code emitter 产；其他宿主空集）。
    let mut session_excerpts: Vec<agent_vitals_domain::contracts::workflow::SessionExcerpt> =
        Vec::new();
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
                if let (Some(contract), Some(payload)) = (r.quota_snapshot, r.quota_snapshot_payload_json) {
                    // 观察时刻挪到这里派生：**解析失败只跳过这条快照，不再让整批写入
                    // 失败**（旧行为是 Err 上抛，一个坏时间戳会连累整个宿主的 facts）。
                    match agent_vitals_domain::budget::parse_iso(&contract.observed_at) {
                        Some((seconds, _)) => pending_snapshots.push((
                            "codex_quota",
                            payload,
                            seconds.saturating_mul(1_000),
                        )),
                        None => report
                            .errors
                            .push("codex quota snapshot: observed_at 不可解析，跳过落库".to_string()),
                    }
                }
                facts.extend(r.facts);
                workflow_events.extend(r.workflow_events);
                synced_sources.extend(dirty.iter().cloned());
            }
            Err(e) => {
                // 批量 Err = 任一文件读失败（read 层错误）——全部重试，
                // 错误如实上呈。
                report.errors.push(format!("codex batch: {e}"));
            }
        }
    }
    let mut incremental_checkpoints: std::collections::HashMap<String, crate::source_graph::SourceCheckpointOverride> = std::collections::HashMap::new();
    // 解析路由经宿主注册表（P3 收编，此前 `host == "claude-code"` 字面量
    // 特判散落两处）。trait 背书的逐文件宿主在这里走 parse_increment/parse_full；
    // codex 是批 emitter（跨文件 seen 去重 + 整批配额折叠，见上），
    // 注册表对它只给 descriptor 申报、不给 trait 实现。
    let registered = agent_vitals_hosts::parsers::parser_for(host);
    for (path, fp) in &dirty {
        if host == "codex" {
            continue; // 已批量处理
        }
        let Some(parser) = registered else {
            report.errors.push(format!(
                "{}: host `{host}` has no registered parser",
                path.display()
            ));
            continue;
        };
        // P1b/P3：SourceGraph 增量路由——classify 已在发现层标脏并判定软/硬。
        // 这里查检查点 + 注册表 descriptor 决定走增量还是全量。
        let hash = crate::source_graph::path_hash(path);
        let checkpoint = crate::source_graph::read_checkpoint(db.conn(), host, &hash)
            .map_err(|e| format!("source_graph checkpoint: {e}"))?
            .unwrap_or_default();
        // can_increment = 解析器申报（descriptor）合取检查点已有起读 offset
        //（trait 缺省判定）；全量申报宿主恒 false。
        let can_increment = parser.can_increment(&checkpoint);
        let emit_expected_parser = if can_increment {
            parser.descriptor().parser_id
        } else {
            crate::source_graph::FULL_PARSE_V0
        };
        let decision = crate::source_graph::classify(
            &checkpoint, Some(*fp), can_increment,
            emit_expected_parser,
            crate::sql_sync::parser_version(),
        );
        let incremental_offset = match &decision {
            crate::source_graph::Invalidation::Incremental { from_offset } => Some(*from_offset),
            _ => None,
        };
        let ctx = crate::source_graph::ParseContext {
            machine_namespace: ns,
            source_profile: "default",
        };

        type EmitTuple = (
            Vec<Value>,
            Vec<WorkflowEvent>,
            Vec<agent_vitals_domain::contracts::workflow::SessionExcerpt>,
        );
        let emit: Result<EmitTuple, String> = if let Some(from_offset) = incremental_offset {
            // 增量路径：usage facts 从 offset 续读（GB 级收益）。检查点推进
            // 随写事务（checkpoint_overrides 穿透 write_flat_facts_with_sources
            // ——M1 修复：事务外死写会被写路径覆盖，parser_id 从不跨 tick 存活）。
            parser.parse_increment(&ctx, path, from_offset).map(|out| {
                incremental_checkpoints.insert(hash.clone(),
                    crate::source_graph::SourceCheckpointOverride {
                        parser_id: parser.descriptor().parser_id.to_string(),
                        byte_offset: Some(out.new_offset),
                    });
                (out.facts, out.workflow_events, out.session_excerpts)
            })
        } else {
            // 全量路径（首见/硬失效/全量申报宿主）。增量能力宿主的全量轮也要
            // 写自己的 parser_id + **换行边界**（不是 stat size）：否则下次
            // classify 判 parser-id-mismatch，该文件永远进不了增量（F2 死循环
            // 防线）。全量申报宿主不覆写——写路径按 FULL_PARSE_V0 + stat size
            // 落（dsh/workbuddy 现状，它们的 offset 无语义）。
            parser.parse_full(&ctx, path).map(|out| {
                if parser.descriptor().can_increment {
                    incremental_checkpoints.insert(hash.clone(),
                        crate::source_graph::SourceCheckpointOverride {
                            parser_id: parser.descriptor().parser_id.to_string(),
                            byte_offset: Some(out.new_offset),
                        });
                }
                (out.facts, out.workflow_events, out.session_excerpts)
            })
        };
        match emit {
            Ok((f, events, excerpts)) => {
                facts.extend(f);
                workflow_events.extend(events);
                session_excerpts.extend(excerpts);
                synced_sources.push((path.clone(), *fp));
            }
            Err(e) => report.errors.push(format!("{}: {e}", path.display())),
        }
    }

    // Claude Pro 的窗口状态（`quotaLimits`）。扫**最近 7 天改动过的**会话文件
    // （窗口由 `scan_claude_quota` 自己按 mtime 筛；7 天 = 最长窗口，再往前扫
    // 不会改变结论）。扫不到就保持旧快照不动（不写空值）：
    // 窗口状态是"越新越准"的观察，空值覆盖反而会把已有证据抹掉，过期与否交给
    // 状态机按 `resets_at` 判。
    if host == "claude-code" {
        let scan = agent_vitals_hosts::claude_quota::scan_claude_quota(
            &host_files,
            std::time::SystemTime::now(),
        );
        // 待处理任务：窗口耗尽 → 建一条；重置或不再有证据 → 自动解决。与快照
        // 同一轮推进，所以「窗口一重置，任务自己从列表里消失」不需要额外机制。
        let exhausted = scan.latest.as_ref().and_then(|snapshot| {
            match agent_vitals_hosts::claude_quota::window_state(snapshot, now / 1_000) {
                agent_vitals_hosts::claude_quota::WindowState::Exhausted { resets_at, window } => Some((
                    resets_at,
                    window,
                    agent_vitals_hosts::claude_quota::window_label(window),
                )),
                agent_vitals_hosts::claude_quota::WindowState::Unknown => None,
            }
        });
        if let Err(e) = agent_vitals_data::issues::reconcile_quota_window_issue(
            db.conn(), host, exhausted, now,
        ) {
            report.errors.push(format!("claude quota issue: {e}"));
        }
        if let Some(snapshot) = scan.latest {
            // 撞窗次数与"最新那次"同一份 payload：`unknown` 态唯一的可显示内容
            // 就是它（spec §8.3.2「窗口状态未知 · 本周撞窗 N 次」）。
            pending_snapshots.push((
                "claude_quota",
                snapshot.payload_with_windows(scan.windows_recent),
                snapshot.observed_at_secs.saturating_mul(1_000),
            ));
        }
    }

    if !synced_sources.is_empty() {
        let snapshot_write = (!pending_snapshots.is_empty() || runtime_snapshot_backfill_needed)
            .then(|| crate::sql_sync::RuntimeSnapshotWrite {
                snapshots: pending_snapshots
                    .iter()
                    .map(|(kind, payload, observed_at_ms)| crate::sql_sync::RuntimeQuotaSnapshot {
                        snapshot_kind: kind,
                        payload_json: payload.as_str(),
                        observed_at_ms: *observed_at_ms,
                    })
                    .collect(),
                backfill_marker: runtime_snapshot_backfill_needed
                    .then_some("codex_quota_snapshot_backfilled_v2"),
            });
        let outcome = crate::sql_sync::write_flat_facts_with_sources(
            db,
            host,
            ns,
            &synced_sources,
            &incremental_checkpoints,
            &facts,
            &workflow_events,
            &session_excerpts,
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

/// 例行同步入口（`ingest_service::FACT_HOSTS` 全部宿主）。幂等：重复调用第二次
/// 基本全 skipped / duplicate。
pub fn sync_facts(data_home: &Path) -> Result<SyncReport, String> {
    sync_facts_filtered(data_home, None)
}

/// 定向同步入口（LIGHT-PATH spec §5.2）：`only` 给出时只跑这些宿主的批
/// （批级过滤——codex 的整批语义在 `sync_host` 之内，不受影响）。`None` =
/// 全宿主，行为与 [`sync_facts`] 逐字节一致。被过滤掉的宿主不 acquire
/// lease、不产生 HostSyncReport（对账责任整体留给周期重 tick）。
pub fn sync_facts_filtered(
    data_home: &Path,
    only: Option<&std::collections::BTreeSet<String>>,
) -> Result<SyncReport, String> {
    // 读取范围决定本轮会接触哪些本地数据，必须在任何维护写入之前完整校验。
    // 配置损坏时宁可不启动同步，也不能先清理一部分旧事实再报告错误。
    let custom_sources = crate::custom_sources::custom_source_roots(data_home)
        .map_err(|error| format!("custom source configuration failed: {error}"))?;
    // Validate the control file before maintenance writes; the authoritative
    // decision is re-read under each host lease immediately before import.
    crate::source_controls::excluded_hosts(data_home)
        .map_err(|error| format!("source controls failed: {error}"))?;
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
            let now = crate::sql_sync::now_ms();
            // 四步各自计数、各自如实报数（独立验证发现：and_then 链只保留尾环
            // 计数，此前 eprintln 拿它当 facts 数——标签与对象双双错位）。
            // 失败语义不变：任一步 Err → 整轮 failed、不盖日戳、下轮全量重跑
            // （四步皆幂等 DELETE，重跑已成功步为 0 行）。
            let steps: [(&str, Result<usize, agent_vitals_data::authority::AuthorityError>); 4] = [
                ("usage_facts", db.retention_usage_facts(cutoff)),
                ("session_excerpts", db.retention_session_excerpts(cutoff)),
                // v23 事件 outbox 保留 + v18 孤儿接线（retention_trust_observations
                // 有实现有测试但生产零调用——2026-09-21 迭代 3 发现）。
                ("event_outbox", db.retention_event_outbox(now)),
                ("trust_observations", db.retention_trust_observations(now)),
            ];
            let failed = steps
                .iter()
                .find(|(_, r)| r.is_err())
                .map(|(name, _)| *name);
            let summary: Vec<String> = steps
                .iter()
                .filter_map(|(name, r)| match r {
                    Ok(n) if *n > 0 => Some(format!("{name} {n}")),
                    _ => None,
                })
                .collect();
            if !summary.is_empty() {
                crate::core::logging::log_info(
                    "sync_service",
                    &format!("authority retention ({retention_months}mo): {}", summary.join(", ")),
                );
            }
            let _ = db.finish_run(
                &run_id,
                if failed.is_none() { "succeeded" } else { "failed" },
                failed.map(|_| "retention_failed".to_string()).as_deref(),
                None,
                crate::sql_sync::now_ms(),
            );
            match failed {
                None => {
                    crate::state::atomic_write_json(
                        &ret_path,
                        &json!({"last_retention_date": bj_day}),
                    );
                }
                Some(step) => {
                    let detail = steps
                        .iter()
                        .find_map(|(_, r)| match r {
                            Err(e) => Some(e.to_string()),
                            _ => None,
                        })
                        .unwrap_or_default();
                    crate::core::logging::log_warn(
                        "sync_service",
                        &format!("authority retention failed at {step}: {detail}"),
                    );
                }
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
    // 定向同步（LIGHT-PATH §5.2，验收 #2）：walk 也按宿主裁剪——非唤醒宿主
    // 不付目录遍历成本（stat 对账与解析本来就在后面的批过滤里跳过，但目录
    // walk 本身每宿主几百次 stat，不裁剪的话轻 tick 的发现面仍是全宿主）。
    let wanted = |host: &str| only.map_or(true, |set| set.contains(host));
    let mut batches: Vec<(&str, Vec<PathBuf>)> = vec![
        (
            "claude-code",
            if wanted("claude-code") {
                agent_vitals_hosts::claude_session::claude_project_files(&user_home)
            } else {
                Vec::new()
            },
        ),
        (
            "codex",
            if wanted("codex") {
                agent_vitals_hosts::codex_session::codex_rollout_files(&crate::home::codex_home())
            } else {
                Vec::new()
            },
        ),
        (
            "dsh",
            if wanted("dsh") {
                crate::home::dsh_home()
                    .map(|d| crate::sessions::discovery::dsh_session_files(&d))
                    .unwrap_or_default()
            } else {
                Vec::new()
            },
        ),
        (
            "workbuddy",
            if wanted("workbuddy") {
                agent_vitals_hosts::workbuddy_traces::workbuddy_trace_files(
                    &agent_vitals_hosts::workbuddy_session::workbuddy_root(&user_home),
                )
            } else {
                Vec::new()
            },
        ),
    ];
    let mut discovery_errors: Vec<(String, String)> = Vec::new();
    let mut collect_discovery_errors = |host: &str, errors: Vec<String>| {
        discovery_errors.extend(errors.into_iter().map(|error| (host.to_string(), error)));
    };
    collect_discovery_errors(
        "claude-code",
        agent_vitals_hosts::claude_session::claude_project_walk_errors(&user_home),
    );
    collect_discovery_errors(
        "codex",
        agent_vitals_hosts::codex_session::codex_rollout_walk_errors(&crate::home::codex_home()),
    );
    if let Some(dsh_home) = crate::home::dsh_home() {
        collect_discovery_errors("dsh", crate::sessions::discovery::dsh_session_walk_errors(&dsh_home));
    }
    collect_discovery_errors(
        "workbuddy",
        agent_vitals_hosts::workbuddy_traces::workbuddy_trace_walk_errors(
            &agent_vitals_hosts::workbuddy_session::workbuddy_root(&user_home),
        ),
    );
    for source in custom_sources {
        let files = match source.host.as_str() {
            "claude-code" => {
                let root = Path::new(&source.root);
                collect_discovery_errors("claude-code", agent_vitals_hosts::claude_session::claude_project_walk_errors(root));
                agent_vitals_hosts::claude_session::claude_project_files(root)
            }
            "codex" => {
                let root = Path::new(&source.root);
                collect_discovery_errors("codex", agent_vitals_hosts::codex_session::codex_rollout_walk_errors(root));
                agent_vitals_hosts::codex_session::codex_rollout_files(root)
            }
            "dsh" => {
                let root = Path::new(&source.root);
                collect_discovery_errors("dsh", crate::sessions::discovery::dsh_session_walk_errors(root));
                crate::sessions::discovery::dsh_session_files(root)
            }
            _ => continue,
        };
        if let Some((_, batch)) = batches.iter_mut().find(|(host, _)| *host == source.host) {
            batch.extend(files);
        }
    }
    for (_, files) in &mut batches {
        files.sort();
        files.dedup();
    }
    for (host, files) in batches {
        // Serialize each host's ingest with source deletion.  The exclusion
        // decision is deliberately re-read while holding the same per-host
        // lease as the delete command; otherwise a concurrent sync could pass
        // an old exclusion snapshot and re-import data after deletion.
        if let Some(only) = only {
            if !only.contains(host) {
                continue;
            }
        }
        let host_lease = crate::lease::acquire_blocking(
            &crate::source_controls::host_data_lock_path(data_home, host)?,
            "facts-source-sync",
            600_000,
            10_000,
        )
        .map_err(|error| format!("source {host} lease: {error}"))?;
        let _host_heartbeat = host_lease.heartbeat(std::time::Duration::from_secs(30), 600_000);
        let excluded_hosts = crate::source_controls::excluded_hosts(data_home)
            .map_err(|error| format!("source controls failed: {error}"))?;
        if excluded_hosts.contains(host) {
            continue;
        }
        let mut r = HostSyncReport {
            host: host.to_string(),
            ..Default::default()
        };
        sync_host(host, &ns, &authority, files, &mut r)?;
        for (error_host, error) in &discovery_errors {
            if error_host == host {
                r.errors.push(format!("discovery: {error}"));
            }
        }
        report.total_appended += r.appended;
        report.total_duplicate += r.duplicate;
        report.hosts.push(r);
    }

    // 插件宿主周期再摄取（zcode 接入收尾，2026-09-23）：只在全量路径跑
    // （定向过滤只针对内置宿主批）；exactly-once 由 fact_id 幂等兜底，
    // 单 manifest 失败隔离进 errors 不拖垮整轮。首装 format guard 挡
    // 「include/recipe 与数据不匹配」的 manifest（零 emit 拒写）。
    if only.is_none() {
        let user_home_for_plugins = user_home.clone();
        for (slug, result) in crate::plugin_ingest::ingest_installed(&ns, data_home, &user_home_for_plugins) {
            match result {
                Ok(payload) => {
                    let appended = payload.get("appended").and_then(Value::as_i64).unwrap_or(0);
                    if appended > 0 {
                        crate::core::logging::log_info(
                            "sync",
                            &format!("plugin:{slug} 再摄取 +{appended} 条"),
                        );
                    }
                }
                Err(error) => {
                    report.hosts.push(HostSyncReport {
                        host: format!("plugin:{slug}"),
                        errors: vec![error],
                        ..Default::default()
                    });
                }
            }
        }
    }
    // v1.0 升级闭环：旧个人订阅若存在于历史价卡快照，先落为本地 host_bills。
    // 正常桌面同步也会经过这里，用户无需手动执行 CLI 迁移；失败只警告，不能
    // 阻断三宿主事实导入。
    if let Err(e) = crate::sql_sync::migrate_legacy_subscription_snapshots(
        &authority,
        crate::sql_sync::now_ms(),
    ) {
        crate::core::logging::log_warn("sync_service", &format!("legacy subscriptions: {e}"));
    }
    // 候选状态与声明占用的一致性自愈（候选被有效声明占着 = accepted）；旧版本的
    // 「重新打开」留下的分裂态在这里收口，否则待确认面板反复问、新声明反复撞
    // 「already used by another live declaration」。
    match authority.reconcile_candidate_claims(crate::sql_sync::now_ms()) {
        Ok(n) if n > 0 => crate::core::logging::log_info(
            "sync_service",
            &format!("billing candidates: re-marked {n} record(s) accepted (held by live declarations)"),
        ),
        Ok(_) => {}
        Err(e) => crate::core::logging::log_warn("sync_service", &format!("candidate claims: {e}")),
    }
    // Phase 2.8：落当前价格快照（§5.3）。幂等——价卡不变则无新版本。
    if let Err(e) = crate::sql_sync::snapshot_current_pricing(&authority) {
        crate::core::logging::log_warn("sync_service", &format!("pricing snapshot: {e}"));
    }
    // 本地价格发现（零网络）改为事件驱动（EVENT_BUS spec §9 P0 验收 #4）：
    // FactsIngested 已在各宿主写入事务内落 outbox；价卡快照仍显式先行（消费
    // 者依赖最新价卡做判定），随后一次性 drain——本轮新事件与上次崩溃残留
    // （deliveries 缺行）同轮补投，顺序与原内联调用等价。
    {
        let authority_path = agent_vitals_data::authority::default_authority_path(data_home);
        let dispatcher = crate::events::Dispatcher::new(vec![
            crate::events::EventConsumer::new(
                "price-reconcile",
                crate::events::ConsumerInterest::domain(&["FactsIngested", "PriceCardSaved"]),
                move |_event| {
                // 消费者自持连接（drain 不持事务，spec §6）。打开失败按处理
                // 失败记账——**不重投本事件**（deliveries 反连接永久排除）；
                // price-reconcile 忽略事件载荷做全量 reconcile，下一轮
                // FactsIngested 自然自愈，所以这个语义是安全的。
                let db = agent_vitals_data::authority::AuthorityDb::open(
                    &authority_path,
                    crate::sql_sync::now_ms(),
                )
                .map_err(|e| e.to_string())?;
                crate::price_discovery::reconcile_unpriced_models(
                    &db,
                    &crate::clock::current_month_beijing(),
                    crate::sql_sync::now_ms(),
                )
                .map(|_| ())
            }),
        ])
        .expect("price-reconcile interest is a static Domain-class subset");
        match dispatcher.drain(authority.conn()) {
            Ok(report) if report.failed > 0 || report.skipped > 0 => crate::core::logging::log_warn(
                "sync_service",
                &format!("event dispatch: {} failed, {} skipped", report.failed, report.skipped),
            ),
            Ok(_) => {}
            Err(e) => crate::core::logging::log_warn("sync_service", &format!("event dispatch: {e}")),
        }
    }
    // 计费声明是持续生效的规则：用户在归因表单里填的「结束时间为空 = 持续有效」
    // 意味着之后同特征的新事实必须自动沿用，而不是每个新会话都回到待确认面板
    // 再问一遍（2026-09-16 真机：anthropic 订阅 / shengsuanyun 中转都声明过，
    // 当晚新会话照样弹出，用户把同一条中转声明重复保存了 7 次）。重算 job 只
    // 物化保存前的历史，这里补上「保存之后」那一半。失败只警告：归因是事实之上
    // 的解释层，不能反过来让事实同步失败。
    {
        let _lease = crate::lease::acquire_blocking(
            &data_home.join("facts").join(".ingest.lock"),
            "facts-apply-declarations",
            60_000,
            5_000,
        );
        match authority.billing_apply_active_declarations(crate::sql_sync::now_ms()) {
            Ok(applied) => {
                report.declarations_applied = applied.attributed;
                if applied.attributed > 0 {
                    crate::core::logging::log_info(
                        "sync_service",
                        &format!(
                            "billing declarations: attributed {} new facts under {} active rule(s)",
                            applied.attributed, applied.revisions
                        ),
                    );
                }
            }
            Err(e) => crate::core::logging::log_warn("sync_service", &format!("billing declarations: {e}")),
        }
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
                r#"{"type":"user","uuid":"u3","timestamp":"2026-09-05T10:01:10.000Z","message":{"content":[{"type":"text","text":"run the check"}]}}"#,
                "\n",
                r#"{"type":"assistant","uuid":"u4","timestamp":"2026-09-05T10:01:11.000Z","message":{"content":[{"type":"tool_use","id":"call-1","name":"Bash","input":{"command":"cat /private/secret"}}]}}"#,
                "\n",
                r#"{"type":"user","uuid":"u5","timestamp":"2026-09-05T10:01:12.000Z","message":{"content":[{"type":"tool_result","tool_use_id":"call-1","is_error":true,"content":"secret output"}]}}"#,
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
            let workflow_count: i64 = db
                .conn()
                .query_row(
                    "SELECT COUNT(*) FROM workflow_events WHERE session_key LIKE '11:claude-code|%'",
                    [],
                    |row| row.get(0),
                )
                .unwrap();
            assert!(workflow_count >= 3, "Claude workflow 事件必须随 facts 一起落 authority");

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
            // P1b 增量语义：只读新行，旧行不重发 → duplicate=0（此前全量重解析
            // 会 re-emit 旧行为 duplicate=2；增量是行为改进——更少 I/O 同终态）。
            assert_eq!(cl3.duplicate, 0, "增量路径不重读旧行，无 duplicate");
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
    fn one_host_read_failure_does_not_block_another_host() {
        with_isolated_home(|home| {
            let bad_dir = home.join(".claude/projects/p-bad");
            std::fs::create_dir_all(&bad_dir).unwrap();
            std::fs::write(bad_dir.join("bad.jsonl"), "{not json\n").unwrap();
            codex_rollout(home);
            let data = PathBuf::from(std::env::var("AGENT_VITALS_HOME").unwrap());

            let report = sync_facts(&data).unwrap();
            let claude = report.hosts.iter().find(|host| host.host == "claude-code").unwrap();
            let codex = report.hosts.iter().find(|host| host.host == "codex").unwrap();
            assert!(!claude.errors.is_empty(), "坏的 Claude 文件必须保留失败证据");
            assert_eq!(codex.files_synced, 1, "Codex 仍必须完成本轮导入");
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

    #[test]
    fn malformed_custom_source_configuration_stops_sync() {
        with_isolated_home(|_home| {
            let data = PathBuf::from(std::env::var("AGENT_VITALS_HOME").unwrap());
            std::fs::create_dir_all(data.join("state")).unwrap();
            std::fs::write(data.join("state").join("custom-sources.json"), b"invalid").unwrap();
            let error = sync_facts(&data).unwrap_err();
            assert!(error.contains("custom source configuration failed"), "{error}");
            assert!(!data.join("facts").join(".authority-retention.json").exists());
        });
    }

    #[test]
    fn malformed_source_controls_stop_sync_before_maintenance() {
        with_isolated_home(|_home| {
            let data = PathBuf::from(std::env::var("AGENT_VITALS_HOME").unwrap());
            std::fs::create_dir_all(data.join("state")).unwrap();
            std::fs::write(data.join("state").join("source-controls.json"), b"invalid").unwrap();
            let error = sync_facts(&data).unwrap_err();
            assert!(error.contains("source controls failed"), "{error}");
            assert!(!data.join("facts").join(".authority-retention.json").exists());
        });
    }

    #[test]
    fn excluded_host_is_not_read_by_sync() {
        with_isolated_home(|home| {
            claude_session(home);
            let data = PathBuf::from(std::env::var("AGENT_VITALS_HOME").unwrap());
            crate::source_controls::set_host_excluded(&data, "claude-code", true).unwrap();
            let report = sync_facts(&data).unwrap();
            assert!(!report.hosts.iter().any(|host| host.host == "claude-code"));
        });
    }

    #[test]
    fn custom_claude_root_is_ingested_by_normal_sync() {
        with_isolated_home(|home| {
            let custom_home = home.join("custom-claude");
            claude_session(&custom_home);
            let data = PathBuf::from(std::env::var("AGENT_VITALS_HOME").unwrap());
            assert!(crate::custom_sources::add_custom_source_root(
                &data, "claude-code", &custom_home,
            ).unwrap());
            let report = sync_facts(&data).unwrap();
            let claude = report.hosts.iter().find(|host| host.host == "claude-code").unwrap();
            assert_eq!(claude.files_synced, 1);
            assert_eq!(claude.appended, 2);
        });
    }
}
