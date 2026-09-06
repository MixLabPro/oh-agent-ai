//! Stage B 遗留收口：Runtime 共享 sync service —— 三宿主**例行** facts ingest。
//!
//! `ingest_service` 是「一批事实怎么落盘」；本模块回答「**哪些会话文件该被
//! emit**」：文件发现（各宿主 sources 的 locate 面）→ checkpoint 差量 →
//! emitter → ingest。这是 month.json/today.json 退休路径（§5）的第 ① 步——
//! facts 平面从「手动 `--write` 诊断」升级为「可例行驱动的生产流」（托盘
//! tick / CLI 定时都调这里，不各自长文件枚举）。
//!
//! **checkpoint 是纯性能优化，不是正确性来源**：指纹 `(size, mtime_ns)`
//! 与 `claude_cost` fold checkpoint 同款；checkpoint 丢失/回退的最坏后果是
//! 重发 → writer 层 fact_id exactly-once 全部 Duplicate，账目零影响。所以
//! checkpoint 更新放在 ingest **之后**（崩溃在两者之间 = 下次重发，安全），
//! 失败的文件不进 checkpoint（下次重试，错误随报告如实上呈）。
//!
//! **namespace**：例行服务用 `takeover::machine_namespace()`（机器身份，
//! 跨次运行稳定）——与 CLI `--write` 要求调用方显式传入不冲突：那是诊断
//! 命令「不许 CLI 编造身份」的纪律，而 sync service 的调用者身份就是机器
//! 本身（machine.json 持久化 UUID，重装明示新 profile，不静默重排历史）。
//!
//! **不在此处的**：调度（何时跑——托盘 tick / 外部 cron 的事）、watcher
//! （§7.1 门槛未触发）、SQLite 投影更新（`ingest_facts` 内已同步索引）。

use std::path::{Path, PathBuf};

use serde_json::Value;

/// checkpoint 版本（形状变更时递增；旧文件整体作废，全量重发由 exactly-once
/// 兜底）。
const CHECKPOINT_SCHEMA_VERSION: u64 = 1;

fn checkpoint_path(data_home: &Path) -> PathBuf {
    data_home.join("facts").join(".ingest-checkpoint.json")
}

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

fn load_checkpoint(data_home: &Path) -> serde_json::Map<String, Value> {
    crate::state::read_json(&checkpoint_path(data_home))
        .and_then(|v| {
            // 版本不匹配 → 整体作废（全量重发，exactly-once 兜底）。
            if v.get("schema_version").and_then(Value::as_u64)
                == Some(CHECKPOINT_SCHEMA_VERSION)
            {
                v.get("files").and_then(Value::as_object).cloned()
            } else {
                None
            }
        })
        .unwrap_or_default()
}

fn save_checkpoint(data_home: &Path, files: &serde_json::Map<String, Value>) {
    let doc = serde_json::json!({
        "schema_version": CHECKPOINT_SCHEMA_VERSION,
        "files": Value::Object(files.clone()),
    });
    crate::state::atomic_write_json(&checkpoint_path(data_home), &doc);
}

/// 单宿主同步结果。`errors` 是「该文件本轮没 ingest、没进 checkpoint」的
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
    pub errors: Vec<String>,
}

/// 三宿主例行同步报告。
#[derive(Debug, Default, serde::Serialize)]
pub struct SyncReport {
    pub hosts: Vec<HostSyncReport>,
    pub total_appended: usize,
    pub total_duplicate: usize,
}

/// 对单个宿主执行「发现 → 差量 → emit → ingest → checkpoint」。
/// `emit` 的宿主差异收敛在这个闭包里：输入差量文件集，输出事实批（或
/// 逐文件错误）。
fn sync_host(
    host: &str,
    data_home: &Path,
    files: Vec<PathBuf>,
    checkpoint: &mut serde_json::Map<String, Value>,
    report: &mut HostSyncReport,
) {
    report.files_seen = files.len();
    let mut dirty: Vec<(PathBuf, (u64, u64))> = Vec::new();
    for path in files {
        let fp = fingerprint(&path);
        let key = path.to_string_lossy().to_string();
        let recorded = checkpoint.get(&key).and_then(|v| {
            let size = v.get("size").and_then(Value::as_u64)?;
            let mtime = v.get("mtime_ns").and_then(|x| x.as_u64())?;
            Some((size, mtime))
        });
        match (fp, recorded) {
            (Some(fp), Some(r)) if r == fp => report.files_skipped += 1, // 未变，跳过
            (Some(fp), _) => dirty.push((path, fp)),
            (None, _) => report
                .errors
                .push(format!("{}: stat failed (vanished?)", path.display())),
        }
    }

    // namespace：机器身份（模块头说明为什么这里可以由服务自取）。
    let ns = crate::takeover::machine_namespace();

    let mut facts: Vec<Value> = Vec::new();
    let mut synced_keys: Vec<(String, (u64, u64))> = Vec::new();
    for (path, fp) in &dirty {
        let emit: Result<Vec<Value>, String> = match host {
            "claude-code" => {
                let sid = path
                    .file_stem()
                    .and_then(|s| s.to_str())
                    .unwrap_or_default()
                    .to_string();
                agent_vitals_hosts::claude_usage_fact::claude_jsonl_to_usage_facts(
                    path, &ns, "default", &sid,
                )
                .map(|r| r.facts)
            }
            "codex" => agent_vitals_hosts::codex_usage_fact::codex_rollouts_to_usage_facts(
                std::slice::from_ref(path),
                &ns,
                "default",
            )
            .map(|r| r.facts),
            "dsh" => agent_vitals_hosts::dsh_usage_fact::dsh_session_to_usage_facts(
                path, &ns, None,
            )
            .map(|r| r.facts),
            other => Err(format!("unknown host `{other}`")),
        };
        match emit {
            Ok(f) => {
                facts.extend(f);
                synced_keys.push((path.to_string_lossy().to_string(), *fp));
            }
            Err(e) => report.errors.push(format!("{}: {e}", path.display())),
        }
    }

    if !facts.is_empty() {
        match crate::ingest_service::ingest_facts(data_home, &facts) {
            Ok(r) => {
                if let Some(h) = r.hosts.iter().find(|h| h.host == host) {
                    report.appended = h.appended;
                    report.duplicate = h.duplicate;
                }
            }
            Err(e) => {
                // ingest 失败（索引/磁盘）→ 本轮全部不进 checkpoint，下次重试。
                report.errors.push(format!("ingest: {e}"));
                return;
            }
        }
    }
    for (key, fp) in synced_keys {
        report.files_synced += 1;
        checkpoint.insert(
            key,
            serde_json::json!({"size": fp.0, "mtime_ns": fp.1, "host": host}),
        );
    }
}

/// 三宿主例行同步入口。幂等：重复调用第二次基本全 skipped / duplicate。
pub fn sync_facts(data_home: &Path) -> Result<SyncReport, String> {
    let mut checkpoint = load_checkpoint(data_home);
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
            agent_vitals_hosts::codex_session::codex_rollout_files(
                &crate::summary::codex_home(),
            ),
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
        sync_host(host, data_home, files, &mut checkpoint, &mut r);
        report.total_appended += r.appended;
        report.total_duplicate += r.duplicate;
        report.hosts.push(r);
    }
    save_checkpoint(data_home, &checkpoint);
    Ok(report)
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
        let dir = home.join(".codex").join("sessions").join("2026").join("09").join("05");
        std::fs::create_dir_all(&dir).unwrap();
        let p = dir.join("rollout-2026-09-05T17-00-00-abc.jsonl");
        std::fs::write(
            &p,
            concat!(
                r#"{"timestamp":"2026-09-05T17:00:00.000Z","type":"session_meta","payload":{"id":"cx-1","cwd":"/tmp/w"}}"#,
                "\n",
                r#"{"timestamp":"2026-09-05T17:01:00.000Z","type":"event_msg","payload":{"type":"token_count","info":{"total_token_usage":{"input_tokens":100,"cached_input_tokens":10,"output_tokens":20,"reasoning_output_tokens":0},"last_token_usage":{"input_tokens":100,"cached_input_tokens":10,"output_tokens":20,"reasoning_output_tokens":0},"model_context_window":272000}}}"#,
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

            // 第二次：全部 skipped（checkpoint 指纹命中），零新增。
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
    fn failing_files_are_reported_not_checkpointed() {
        with_isolated_home(|home| {
            let dir = home.join(".claude/projects/p-bad");
            std::fs::create_dir_all(&dir).unwrap();
            // 不可读会导致 Err（read 失败走 Err 串）；用一个坏 JSON 行文件
            // ——emitter 对坏行抛错 → 该文件必须不进 checkpoint。
            let p = dir.join("bad.jsonl");
            std::fs::write(&p, "{not json\n").unwrap();
            let data = PathBuf::from(std::env::var("AGENT_VITALS_HOME").unwrap());
            let r = sync_facts(&data).unwrap();
            let cl = r.hosts.iter().find(|h| h.host == "claude-code").unwrap();
            assert!(!cl.errors.is_empty(), "坏文件必须出现在 errors 里");
            // checkpoint 里没有坏文件 → 下次 sync 仍然重试它（仍然报错）。
            let cp = crate::state::read_json(&checkpoint_path(&data)).unwrap();
            assert!(
                !cp["files"].as_object().unwrap().iter().any(|(k, _)| k.contains("bad.jsonl")),
                "失败的文件不得进 checkpoint"
            );
            let r2 = sync_facts(&data).unwrap();
            let cl2 = r2.hosts.iter().find(|h| h.host == "claude-code").unwrap();
            assert!(!cl2.errors.is_empty(), "下次 sync 重试坏文件（诚实噪声）");
        });
    }
}
