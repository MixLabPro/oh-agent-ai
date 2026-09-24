//! 行为 findings 评估器：同步后对有变化的 DSH / Codex 会话跑 behavior 规则，
//! 结果落 `issue_instances`（W8，docs/ARCHITECTURE_OPTIMIZATION_GUIDE.md）。
//!
//! 为什么搬到同步路径：此前唯一生产者是 `sessions/r2a_store.rs` 的
//! `sessions findings`——整套 legacy SessionStore（全宿主遍历 + 文件指纹缓存）
//! 只为这一个出口活着，且只在旧 DOM 界面的「重载」按钮或首启引导时触发。React
//! 切换（ed1660c）后没有任何入口再触发它，Findings 页读到的 Issues 停在了
//! 2026-09-20（真机：5,332 条全是 `legacy-finding`，最后更新 09-20 15:23）。
//! 同步本来就知道「本轮哪些源文件变了」（SourceGraph 差量），在这里评估即可
//! 增量、自动、不依赖任何界面。
//!
//! **身份连续性**：evaluator_id / version / instance_fingerprint 格式 /
//! metadata 形状与 r2a 的 `persist_findings_as_issues` 逐字段一致——唯一键是
//! `(machine_namespace, issue_type, instance_fingerprint)`，换任何一项都会让
//! 已有 issue 全部「消失 + 重新出现」，用户的 acknowledged/wontfix 状态跟着丢。
//! `evaluator_id = "legacy-finding"` 这个名字已经名不副实，改名要配迁移，另做。
//!
//! **只关闭本轮真正评估过的会话**：读失败 / 头行缺失的会话不进结果集，它的
//! issue 保持原状——没观察到 ≠ 观察到已消失（与 r2a 同义）。
//!
//! 规则计算本身在锁外做（DSH 解压 + 审计、Codex 解析都慢）；写库由调用方
//! 在短临界区里调 [`persist`]。

use std::collections::{BTreeMap, BTreeSet};
use std::path::{Path, PathBuf};

use agent_vitals_domain::findings::FindingRef;
use rusqlite::Connection;
use serde_json::Value;

/// 与 r2a 写入的既有 issue 同一身份（见模块文档「身份连续性」）。
pub const EVALUATOR_ID: &str = "legacy-finding";
pub const EVALUATOR_VERSION: &str = "v0.11";
/// 一次性全量回填标记：升级前已同步过的会话在 SourceGraph 眼里是 Unchanged，
/// 不回填的话它们的 findings 永远停在 r2a 最后一次运行的样子。
pub const BACKFILL_META_KEY: &str = "behavior_findings_evaluated_v1";

/// 会话载荷带 findings 的宿主，与 r2a SessionStore 的三源一致（DSH / Codex /
/// Claude Code；workbuddy 没有会话级 SV6xx 产出）。第一版漏了 claude-code——
/// r2a `findings_for` 的「非 DSH → `audit.findings`」分支同时覆盖 Codex 与
/// Claude，按函数名读成「只有 codex」是错的；真机 1,778 条 claude-code issue、
/// `test_cli_matrix::test_sessions_findings_include_claude_sv601` 抓到。
pub const EVALUATED_HOSTS: [&str; 3] = ["dsh", "codex", "claude-code"];

/// 一个会话本轮观察到的全部 findings（空 vec = 评估成功且零命中，会关闭旧 issue）。
#[derive(Debug, Clone)]
pub struct SessionFindings {
    pub host: &'static str,
    pub native_id: String,
    pub findings: Vec<FindingRef>,
}

#[derive(Debug, Default, Clone, PartialEq, Eq, serde::Serialize)]
pub struct EvalReport {
    pub sessions_evaluated: usize,
    pub findings_upserted: usize,
    pub reopened: usize,
    pub closed: usize,
    pub errors: Vec<String>,
}

/// 「哪个字段带 findings」的单一权威（原 r2a `findings_for`，W8 随生产者搬来）。
/// DSH 载荷是 behavior 20 键形状 → `findings`；Codex 载荷 → `audit.findings`。
/// 两者皆无 → 空 vec（诚实零命中，不是错误）。缺失字段诚实 None，不编造。
pub fn findings_from_payload(host: &str, payload: &Value) -> Vec<FindingRef> {
    let arr = if host == "dsh" {
        payload.get("findings").and_then(Value::as_array)
    } else {
        payload.pointer("/audit/findings").and_then(Value::as_array)
    };
    let Some(arr) = arr else { return Vec::new() };
    let text = |f: &Value, k: &str| f.get(k).and_then(Value::as_str).unwrap_or("").to_string();
    arr.iter()
        .map(|f| FindingRef {
            rule: text(f, "rule"),
            severity: text(f, "severity"),
            category: text(f, "category"),
            tool_name: f.get("tool_name").and_then(Value::as_str).map(str::to_owned),
            evidence: f.get("evidence").and_then(Value::as_str).map(str::to_owned),
            time: f.get("time").and_then(Value::as_i64),
            seq: f.get("seq").and_then(Value::as_u64),
        })
        .collect()
}

/// DSH：逐文件（一个文件 = 一个会话）读头行拿 id，跑 `behavior::audit_payload`。
pub fn evaluate_dsh(paths: &[PathBuf]) -> (Vec<SessionFindings>, Vec<String>) {
    let mut out = Vec::new();
    let mut errors = Vec::new();
    for path in paths {
        let text = match agent_vitals_hosts::dsh_sources::read_session_text(path) {
            Ok(text) => text,
            Err(code) => {
                errors.push(format!("dsh findings {}: {code}", path.display()));
                continue;
            }
        };
        let degraded = agent_vitals_hosts::dsh_sources::parse_session_log(&text)
            .get("degraded")
            .and_then(Value::as_str)
            .is_some();
        let header = if degraded {
            None
        } else {
            agent_vitals_hosts::hosts::dsh::sessions::header::dsh_header(&text)
        };
        let Some((id, _cwd)) = header else {
            errors.push(format!("dsh findings {}: missing-header", path.display()));
            continue;
        };
        let Some(payload) = crate::sessions::behavior::audit_payload(path) else {
            errors.push(format!("dsh findings {}: file-missing", path.display()));
            continue;
        };
        out.push(SessionFindings {
            host: "dsh",
            native_id: id,
            findings: findings_from_payload("dsh", &payload),
        });
    }
    (out, errors)
}

/// Codex 的「路径 → session_id」索引，按 `(size, mtime_ns)` 指纹缓存在
/// `facts/.codex-session-index.json`（同 `.claude-quota-cache.json` 的做法）。
///
/// 为什么不能按文件名预筛：第一版按「文件名含 session uuid」挑同会话兄弟文件，
/// 真机回填对拍抓到偏差——Codex resume 会开新的 rollout 文件（文件名是新 uuid）
/// 却沿用原会话的 session_meta id，真机一个会话横跨 25 个文件，文件名命中的只有
/// 1 个；合并事件流不同 → seq 整体偏移 → 11 条 issue 被误关、换指纹重开。
/// session_id 只能从内容读（`codex_session_id_of` = 解析整份文件），所以缓存它：
/// 未变文件零解析，变了的文件本来就要解析。分组结果与 r2a 的全量过滤逐一等价。
/// 缓存读不到 / 坏了 = 全部重解析（慢但对），不影响正确性。
fn codex_session_index(data_home: &Path, all_files: &[PathBuf]) -> BTreeMap<PathBuf, String> {
    let cache_path = data_home.join("facts").join(".codex-session-index.json");
    let cached = crate::state::read_json(&cache_path).unwrap_or(Value::Null);
    let fingerprint = |path: &Path| -> Option<(u64, u128)> {
        let meta = std::fs::metadata(path).ok()?;
        let mtime = meta.modified().ok()?.duration_since(std::time::UNIX_EPOCH).ok()?.as_nanos();
        Some((meta.len(), mtime))
    };
    let mut index = BTreeMap::new();
    let mut entries = serde_json::Map::new();
    for path in all_files {
        let key = path.to_string_lossy().to_string();
        let fp = fingerprint(path);
        let hit = fp.and_then(|(size, mtime)| {
            let e = cached.get("entries")?.get(&key)?;
            (e.get("size")?.as_u64()? == size && e.get("mtime_ns")?.as_str()? == mtime.to_string())
                .then(|| e.get("session_id")?.as_str().map(str::to_owned))
                .flatten()
        });
        let sid = hit.unwrap_or_else(|| crate::sessions::codex_session_audit::codex_session_id_of(path));
        if let Some((size, mtime)) = fp {
            // mtime 用字符串存：纳秒超出 JSON 安全整数范围。
            entries.insert(key, serde_json::json!({"size": size, "mtime_ns": mtime.to_string(), "session_id": sid}));
        }
        index.insert(path.clone(), sid);
    }
    crate::state::atomic_write_json(&cache_path, &serde_json::json!({"version": 1, "entries": entries}));
    index
}

/// 变化文件 → 受影响的 session → 各自的全部文件（`all_files` 同一全局序）。
fn codex_groups(changed: &[PathBuf], index: &BTreeMap<PathBuf, String>) -> BTreeMap<String, Vec<PathBuf>> {
    let sids: BTreeSet<&String> = changed.iter().filter_map(|p| index.get(p)).collect();
    let mut groups: BTreeMap<String, Vec<PathBuf>> = BTreeMap::new();
    for (path, sid) in index {
        if sids.contains(sid) {
            groups.entry(sid.clone()).or_default().push(path.clone());
        }
    }
    for files in groups.values_mut() {
        files.sort_by(|a, b| a.to_string_lossy().cmp(&b.to_string_lossy()));
    }
    groups
}

/// Codex：一个会话可以横跨多份 rollout（live / archived 拷贝、resume 新开的文件）。
/// 按内容 session_id 分组（见 [`codex_session_index`]），只审计受影响的会话。
pub fn evaluate_codex(
    home: &Path,
    data_home: &Path,
    changed: &[PathBuf],
    all_files: &[PathBuf],
) -> (Vec<SessionFindings>, Vec<String>) {
    let mut universe: Vec<PathBuf> = all_files.iter().chain(changed.iter()).cloned().collect();
    universe.sort();
    universe.dedup();
    let index = codex_session_index(data_home, &universe);
    let mut out = Vec::new();
    let mut errors = Vec::new();
    for (sid, files) in codex_groups(changed, &index) {
        match crate::sessions::codex_session_audit::codex_session_audit_json_for_files(home, &sid, &files) {
            Some(payload) => out.push(SessionFindings {
                host: "codex",
                native_id: sid.clone(),
                findings: findings_from_payload("codex", &payload),
            }),
            None => errors.push(format!("codex findings {sid}: no rollout matched")),
        }
    }
    (out, errors)
}

/// Claude Code：session_id 就是文件 stem（`file_info` 不看内容），同会话候选按
/// stem 精确匹配——与 r2a `claude_session_id_of` + 全量过滤逐一等价，零额外解析。
/// subagent 文件（`<sid>/subagents/agent-*.jsonl`）stem 不同，r2a 起就是独立会话。
pub fn evaluate_claude(changed: &[PathBuf], all_files: &[PathBuf]) -> (Vec<SessionFindings>, Vec<String>) {
    let stem = |p: &Path| p.file_stem().and_then(|s| s.to_str()).unwrap_or("unknown").to_string();
    let sids: BTreeSet<String> = changed.iter().map(|p| stem(p)).collect();
    let mut out = Vec::new();
    for sid in sids {
        let mut candidates: Vec<PathBuf> = all_files
            .iter()
            .chain(changed.iter())
            .filter(|p| stem(p) == sid)
            .cloned()
            .collect();
        candidates.sort_by(|a, b| a.to_string_lossy().cmp(&b.to_string_lossy()));
        candidates.dedup();
        // None = 空会话（无记录）：r2a 同样不建条目——不是错误，也不关旧 issue。
        if let Some(payload) =
            agent_vitals_hosts::claude_session::claude_session_audit_json_for_files(&sid, &candidates)
        {
            out.push(SessionFindings {
                host: "claude-code",
                native_id: sid,
                findings: findings_from_payload("claude-code", &payload),
            });
        }
    }
    (out, Vec::new())
}

/// 单会话落库（调用方包事务）：upsert 本轮每条 finding；已关闭 / 已确认 /
/// wontfix 的再次出现 → 重开；本评估器对该会话旧有、本轮未再观察到的 → 关闭。
/// 语义与 r2a `persist_findings_as_issues` + `close_missing_legacy_issues` 一致。
pub fn persist(
    conn: &Connection,
    ns: &str,
    session: &SessionFindings,
    now_ms: i64,
    report: &mut EvalReport,
) -> rusqlite::Result<()> {
    use agent_vitals_data::issues;
    let mut current: BTreeSet<String> = BTreeSet::new();
    for finding in &session.findings {
        let evidence = finding.evidence.as_deref().unwrap_or("");
        let seq = finding.seq.map(|v| v.to_string()).unwrap_or_default();
        let fingerprint = format!("{}\0{}\0{}\0{}", session.native_id, finding.rule, seq, evidence);
        let evidence_fingerprint = format!(
            "fnv1a64:{}",
            agent_vitals_domain::source_identity::fnv1a64_hex(evidence.as_bytes())
        );
        let opened_at_ms = finding.time.map(issues::to_epoch_ms).unwrap_or(now_ms);
        let remedy = issues::remedy_for(&finding.rule);
        // 键序与 r2a 逐字一致（metadata_json 是 upsert 覆写的字段）。`source`
        // 保留旧值：它标识的是这类 issue 的族，不是本次调用栈。
        let metadata = serde_json::json!({
            "category": finding.category,
            "tool_name": finding.tool_name,
            "evidence": finding.evidence,
            "time": opened_at_ms,
            "seq": finding.seq,
            "source": "sessions_findings",
            "remedy": {
                "remedy_id": remedy.remedy_id,
                "diagnostic_only": remedy.diagnostic_only,
            },
        })
        .to_string();
        let input = issues::IssueInput {
            machine_namespace: ns,
            host: session.host,
            session_key: Some(&session.native_id),
            issue_type: &finding.rule,
            instance_fingerprint: &fingerprint,
            status: "open",
            severity: &finding.severity,
            evaluator_id: EVALUATOR_ID,
            evaluator_version: EVALUATOR_VERSION,
            evidence_fingerprint: &evidence_fingerprint,
            opened_at_ms,
            metadata_json: &metadata,
        };
        let issue_id = issues::upsert_issue(conn, &input)?;
        report.findings_upserted += 1;
        let status: Option<String> = conn
            .query_row("SELECT status FROM issue_instances WHERE issue_id = ?1", [&issue_id], |r| r.get(0))
            .ok();
        if matches!(status.as_deref(), Some("closed" | "wontfix" | "acknowledged")) {
            issues::transition_issue(
                conn, &issue_id, "open", now_ms, "reappeared", EVALUATOR_ID,
                &evidence_fingerprint, EVALUATOR_ID, EVALUATOR_VERSION, &fingerprint,
            )?;
            report.reopened += 1;
        }
        current.insert(issue_id);
    }
    let mut stmt = conn.prepare(
        "SELECT issue_id FROM issue_instances
         WHERE machine_namespace = ?1 AND host = ?2 AND session_key = ?3
           AND evaluator_id = ?4 AND status IN ('open', 'acknowledged')
         ORDER BY issue_id",
    )?;
    let open_ids = stmt
        .query_map(
            rusqlite::params![ns, session.host, session.native_id, EVALUATOR_ID],
            |r| r.get::<_, String>(0),
        )?
        .collect::<Result<Vec<_>, _>>()?;
    for issue_id in open_ids {
        if current.contains(&issue_id) {
            continue;
        }
        issues::transition_issue(
            conn, &issue_id, "closed", now_ms, "not observed on re-evaluation",
            EVALUATOR_ID, "re-evaluation:absent", EVALUATOR_ID, EVALUATOR_VERSION,
            &format!("re-evaluation:{issue_id}"),
        )?;
        report.closed += 1;
    }
    report.sessions_evaluated += 1;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn tmp_db(tag: &str) -> (PathBuf, agent_vitals_data::authority::AuthorityDb) {
        let path = std::env::temp_dir().join(format!(
            "av-findings-eval-{tag}-{}-{}",
            std::process::id(),
            crate::clock::now_ms()
        ));
        let db = agent_vitals_data::authority::AuthorityDb::open(&path, 1).unwrap();
        (path, db)
    }

    fn finding(rule: &str, evidence: &str, seq: u64) -> FindingRef {
        FindingRef {
            rule: rule.into(),
            severity: "warning".into(),
            category: "shell".into(),
            tool_name: Some("bash".into()),
            evidence: Some(evidence.into()),
            time: Some(1_700_000_000_000),
            seq: Some(seq),
        }
    }

    fn status(db: &agent_vitals_data::authority::AuthorityDb, id: &str) -> String {
        db.conn()
            .query_row("SELECT status FROM issue_instances WHERE issue_id=?1", [id], |r| r.get(0))
            .unwrap()
    }

    /// 原 r2a `findings_for_reads_the_right_field_per_host`，随谓词搬来。
    #[test]
    fn findings_from_payload_reads_the_right_field_per_host() {
        let dsh = json!({"findings": [{"rule": "SV601", "severity": "critical", "category": "shell",
            "tool_name": "bash", "evidence": "rm -rf /", "time": 100, "seq": 1}]});
        let codex = json!({"audit": {"findings": [{"rule": "SV610", "severity": "warning",
            "category": "approval", "tool_name": null, "evidence": "danger-full-access", "seq": 2}]}});
        let d = findings_from_payload("dsh", &dsh);
        assert_eq!((d.len(), d[0].rule.as_str(), d[0].time), (1, "SV601", Some(100)));
        let c = findings_from_payload("codex", &codex);
        assert_eq!((c.len(), c[0].rule.as_str(), c[0].tool_name.clone()), (1, "SV610", None));
        // 字段错位（DSH 形状喂 codex）→ 诚实零命中，不是错误。
        assert!(findings_from_payload("codex", &dsh).is_empty());
    }

    /// 身份连续性：r2a 以前写下的 issue（同 fingerprint 格式）必须被评估器原地
    /// 命中——同一 issue_id、不新增行；用户 acknowledged 的再次观察到 → 重开。
    #[test]
    fn persist_reuses_r2a_issue_identity_and_reopens_reappeared() {
        let (path, db) = tmp_db("identity");
        let f = finding("SV601", "rm -rf /tmp/x", 3);
        // 模拟 r2a 写入：fingerprint = native_id\0rule\0seq\0evidence。
        let legacy_fp = "sess-1\0SV601\u{0}3\0rm -rf /tmp/x";
        let legacy = agent_vitals_data::issues::IssueInput {
            machine_namespace: "ns", host: "dsh", session_key: Some("sess-1"),
            issue_type: "SV601", instance_fingerprint: legacy_fp, status: "open",
            severity: "warning", evaluator_id: "legacy-finding", evaluator_version: "v0.11",
            evidence_fingerprint: "e", opened_at_ms: 1, metadata_json: "{}",
        };
        let legacy_id = agent_vitals_data::issues::upsert_issue(db.conn(), &legacy).unwrap();
        agent_vitals_data::issues::transition_issue(db.conn(), &legacy_id, "acknowledged", 2,
            "seen", "user", "user-action", "user", "v1", "ack").unwrap();

        let session = SessionFindings { host: "dsh", native_id: "sess-1".into(), findings: vec![f] };
        let mut report = EvalReport::default();
        persist(db.conn(), "ns", &session, 10, &mut report).unwrap();

        let rows: i64 = db.conn().query_row("SELECT COUNT(*) FROM issue_instances", [], |r| r.get(0)).unwrap();
        assert_eq!(rows, 1, "同一身份不得新增行");
        assert_eq!(status(&db, &legacy_id), "open", "acknowledged 再观察到 → 重开（r2a 同义）");
        assert_eq!((report.findings_upserted, report.reopened, report.closed), (1, 1, 0));
        let _ = std::fs::remove_file(path);
    }

    /// 原 r2a `re_evaluation_closes_absent_issues_but_preserves_later`：本轮没再
    /// 观察到的 open 关闭；用户 `later` 不动；别的会话 / 别的 evaluator 不碰。
    #[test]
    fn persist_closes_absent_but_preserves_later_and_other_sessions() {
        let (path, db) = tmp_db("close");
        let mut report = EvalReport::default();
        let both = SessionFindings {
            host: "codex",
            native_id: "c1".into(),
            findings: vec![finding("SV611", "a", 1), finding("SV611", "b", 2), finding("SV611", "c", 3)],
        };
        persist(db.conn(), "ns", &both, 1, &mut report).unwrap();
        let other = SessionFindings { host: "codex", native_id: "c2".into(), findings: vec![finding("SV611", "a", 1)] };
        persist(db.conn(), "ns", &other, 1, &mut report).unwrap();
        let id_of = |sid: &str, ev: &str, seq: u64| -> String {
            db.conn().query_row(
                "SELECT issue_id FROM issue_instances WHERE session_key=?1 AND instance_fingerprint=?2",
                [sid, &format!("{sid}\0SV611\0{seq}\0{ev}")], |r| r.get(0)).unwrap()
        };
        let later = id_of("c1", "c", 3);
        agent_vitals_data::issues::transition_issue(db.conn(), &later, "later", 2,
            "remind later", "user", "user-action:later", "user", "v1", "defer").unwrap();

        // 第二轮：只剩 a。
        let mut report = EvalReport::default();
        let only_a = SessionFindings { host: "codex", native_id: "c1".into(), findings: vec![finding("SV611", "a", 1)] };
        persist(db.conn(), "ns", &only_a, 5, &mut report).unwrap();
        assert_eq!(status(&db, &id_of("c1", "a", 1)), "open");
        assert_eq!(status(&db, &id_of("c1", "b", 2)), "closed");
        assert_eq!(status(&db, &later), "later", "用户 later 不被评估器关闭");
        assert_eq!(status(&db, &id_of("c2", "a", 1)), "open", "别的会话不碰");
        assert_eq!(report.closed, 1);
        let _ = std::fs::remove_file(path);
    }

    /// Claude Code：session_id = 文件 stem。dangerous 夹具（fixtures/claude，§10
    /// 验收单一来源）必须产出 SV601；stem 不同的 healthy 会话独立成条、不串。
    #[test]
    fn evaluate_claude_groups_by_file_stem_and_finds_sv601() {
        let t = std::env::temp_dir().join(format!("av-findings-claude-{}-{}", std::process::id(), crate::clock::now_ms()));
        let proj = t.join(".claude/projects/-tmp-w");
        std::fs::create_dir_all(&proj).unwrap();
        let fixtures = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../fixtures/claude");
        std::fs::copy(fixtures.join("dangerous.jsonl"), proj.join("dangerous.jsonl")).unwrap();
        std::fs::copy(fixtures.join("healthy.jsonl"), proj.join("healthy.jsonl")).unwrap();
        let all = agent_vitals_hosts::claude_session::claude_project_files(&t);
        assert_eq!(all.len(), 2);

        let (sessions, errors) = evaluate_claude(&[proj.join("dangerous.jsonl")], &all);
        assert!(errors.is_empty());
        assert_eq!(sessions.len(), 1, "只评估变化的那个会话");
        assert_eq!(sessions[0].native_id, "dangerous");
        assert!(sessions[0].findings.iter().any(|f| f.rule == "SV601"), "{:?}", sessions[0].findings);
        let _ = std::fs::remove_dir_all(&t);
    }

    /// Codex 分组按**内容** session_id：live + archived 拷贝、以及 resume 新开的
    /// 文件（文件名是另一个 uuid，但 session_meta 仍是原会话 id）都归同一会话。
    /// 第一版按文件名预筛，真机一个 25 文件的会话只挑到 1 个（见 codex_session_index）。
    #[test]
    fn codex_groups_follow_content_session_id_not_file_name() {
        let t = std::env::temp_dir().join(format!("av-findings-codex-{}-{}", std::process::id(), crate::clock::now_ms()));
        let live = t.join(".codex/sessions/2026/09/05");
        let arch = t.join(".codex/archived_sessions");
        std::fs::create_dir_all(&live).unwrap();
        std::fs::create_dir_all(&arch).unwrap();
        let data = t.join("data");
        std::fs::create_dir_all(data.join("facts")).unwrap();
        let sid = "019f0000-0000-7000-8000-000000000001";
        let meta = |id: &str| format!(
            "{}\n",
            json!({"timestamp":"2026-09-05T17:00:00.000Z","type":"session_meta","payload":{"id":id,"cwd":"/tmp/w"}})
        );
        let name = format!("rollout-2026-09-05T17-00-00-{sid}.jsonl");
        std::fs::write(live.join(&name), meta(sid)).unwrap();
        std::fs::write(arch.join(&name), meta(sid)).unwrap();
        // resume：新 uuid 的文件名，内容仍是原会话 id。
        let resumed = live.join("rollout-2026-09-06T09-00-00-019f0000-0000-7000-8000-00000000aaaa.jsonl");
        std::fs::write(&resumed, meta(sid)).unwrap();
        let other = live.join("rollout-2026-09-05T18-00-00-019f0000-0000-7000-8000-00000000ffff.jsonl");
        std::fs::write(&other, meta("019f0000-0000-7000-8000-00000000ffff")).unwrap();
        let all = agent_vitals_hosts::codex_session::codex_rollout_files(&t);
        assert_eq!(all.len(), 4);

        let index = codex_session_index(&data, &all);
        let groups = codex_groups(std::slice::from_ref(&resumed), &index);
        assert_eq!(groups.len(), 1, "只动了一个会话");
        assert_eq!(groups[sid].len(), 3, "live + archived + resume 三份同属一个会话");
        assert!(!groups[sid].contains(&other));
        // 缓存命中：第二次索引结果一致（且缓存文件已落盘）。
        assert!(data.join("facts/.codex-session-index.json").exists());
        assert_eq!(codex_session_index(&data, &all), index);

        let (sessions, errors) = evaluate_codex(&t, &data, &[resumed], &all);
        assert!(errors.is_empty(), "{errors:?}");
        assert_eq!(sessions.len(), 1);
        assert_eq!(sessions[0].native_id, sid);
        let _ = std::fs::remove_dir_all(&t);
    }
}
