//! Claude Code 会话的 locate → shape → extract（五段式流水线的前三段，I/O 都在
//! 这里；derive → coverage 在 core 的 `claude_code_evidence::build_claude_evidence`）。
//! `claude-session` 子命令的数据层。
//!
//! 与 `codex-session` 同一个分工、同一个形状：`codex_session.rs` 读 rollout 文件、
//! `codex_session_audit.rs` 拼审计；Claude 侧一份 `~/.claude/projects/<slug>/<uuid>.jsonl`
//! 就是完整会话（无 header、无跨文件 resume 的历史模式），locate/shape/extract/
//! audit 收在一个模块里，行数更少但不比 codex 侧少任何诚实纪律。
//!
//! **SV607/608 的 Unavailable 是本模块的 host-capability degradation（§12），不是
//! core 规则改动。** Claude 的 tool_result 没有原因码词汇——core 适配器 §3 让
//! `error_code` 结构性恒 None（绝不伪造），而 SV607/608 是原因级检测器（读
//! error_code，不读 failed）。家族①门控按 timeline 非空放行后，检测器会在全 None
//! 上空转产出 MeasuredZero——那是对「结构上读不到原因」撒谎（DSH 的
//! error_code=None 是「工具成功」的真测量，Claude 的 None 是「schema 不可能有」）。
//! 所以本模块在 Claude 路径把 SV607/608 从 MeasuredZero 覆盖成 Unavailable，理由
//! 写进 `reason`（读报告的人能看见为什么）。**只在 Claude 路径生效**——DSH/Codex
//! 的 golden 字节零改动（它们的 `failed` 恒 None，走不到这个 override 之外任何
//! 分支）。SV609/610/614 不需要 override：approvals/sandbox_modes timeline 恒空，
//! 家族①门控 / 家族④ OR 门控已经如实给 Unavailable。

use std::path::{Path, PathBuf};

use serde_json::{json, Value};

use agent_vitals_core::behavior::{flatten, match_behavior_canonical, rule_outcomes_json};
use agent_vitals_core::claude_code_evidence::{
    build_claude_evidence, claude_evidence_json, ClaudeEvidence,
};
use agent_vitals_core::evidence::RuleOutcome;
use agent_vitals_core::trajectory::{flatten_trajectory, match_trajectory_canonical};

/// 一个会话文件对 `claude-session` 有用的全部信息（路径本身没有消费者——
/// 调用方各自从 walk 结果拿路径，这里只携带读出来的元数据）。
struct FileInfo {
    session_id: String,
    records: Vec<Value>,
    first: Option<String>,
    last: Option<String>,
}

fn record_ts(record: &Value) -> Option<String> {
    record.get("timestamp").and_then(|v| v.as_str()).map(str::to_owned)
}

/// 纯解析：整份 Claude 会话 JSONL → 记录数组。无 header（Claude 没有），所以
/// 降级语义与 codex 的 `missing-header` 对齐：空文件 / 首条就非 JSON → degraded，
/// `records` 保持 null（**绝不改成空数组**——空数组会被上层当成「读全了但确实
/// 0 条」，那是编造）。与 Python 镜像 `scripts/agent_vitals/adapters/`
/// `claude_session.py::parse_claude_session_log` 逐字节对齐（Task #31）。
pub fn parse_claude_session_log(text: &str) -> Value {
    let mut records: Vec<Value> = Vec::new();
    let mut seen_any = false;
    for line in text.lines() {
        if line.trim().is_empty() {
            continue;
        }
        seen_any = true;
        match serde_json::from_str::<Value>(line) {
            Ok(v) => records.push(v),
            Err(_) => {
                // 一条坏行毁整份——不拼半截会话（与 DSH/codex 的 degraded 同款：
                // 截断写导致的损坏，拼半截是编造缺失）。
                let mut map = serde_json::Map::new();
                map.insert("degraded".to_string(), json!("non-json"));
                map.insert("records".to_string(), Value::Null);
                return Value::Object(map);
            }
        }
    }
    if !seen_any {
        let mut map = serde_json::Map::new();
        map.insert("degraded".to_string(), json!("empty"));
        map.insert("records".to_string(), Value::Null);
        return Value::Object(map);
    }
    json!({ "records": records })
}

/// 读一个会话文件。文件缺失 → degraded("file-missing")；解析降级透传。
/// `session_id` 由调用方从文件名兜底（同 codex 的 file_stem 惯例——session 永远
/// 可指认，绝不把缺席当成 0 条真数据）。
pub fn read_claude_session_log(path: &Path) -> Value {
    let bytes = match std::fs::read(path) {
        Ok(b) => b,
        Err(_) => {
            let mut map = serde_json::Map::new();
            map.insert("degraded".to_string(), json!("file-missing"));
            map.insert("records".to_string(), Value::Null);
            return Value::Object(map);
        }
    };
    let text = String::from_utf8_lossy(&bytes).into_owned();
    parse_claude_session_log(&text)
}

/// 枚举 `~/.claude/projects/**/*.jsonl`（递归，同 codex_rollout_files 的 walkdir
/// 做法），**全局按路径字符串排序**。缺失的根 → 空（存在性探测，绝不报错）。
pub fn claude_project_files(home: &Path) -> Vec<PathBuf> {
    let root = home.join(".claude").join("projects");
    let mut files: Vec<PathBuf> = Vec::new();
    if root.is_dir() {
        files.extend(
            walkdir::WalkDir::new(&root)
                .into_iter()
                .filter_map(Result::ok)
                .filter(|e| e.file_type().is_file())
                .filter(|e| e.path().extension().map(|x| x == "jsonl").unwrap_or(false))
                .map(|e| e.into_path()),
        );
    }
    files.sort_by(|a, b| a.to_string_lossy().cmp(&b.to_string_lossy()));
    files
}

fn file_info(path: &Path) -> FileInfo {
    let parsed = read_claude_session_log(path);
    let records: Vec<Value> = parsed
        .get("records")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();
    let session_id = path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("unknown")
        .to_string();
    let first = records.first().and_then(record_ts);
    let last = records.last().and_then(record_ts);
    FileInfo { session_id, records, first, last }
}

/// ai-title 记录是 Claude 的会话标题（随会话推进更新，最后看见的赢——与 codex
/// 的「当前状态」惯例一致）。真机字段是 `aiTitle`（不是 `title`——首版读到
/// `title` 恒 None，被 812 条真机 ai-title 当场证伪）；`title` 保留为旧版本兜底。
fn title_of(records: &[Value]) -> Option<String> {
    records
        .iter()
        .filter(|r| r.get("type").and_then(Value::as_str) == Some("ai-title"))
        .find_map(|r| r
            .get("aiTitle")
            .and_then(Value::as_str)
            .or_else(|| r.get("title").and_then(Value::as_str))
            .map(str::to_owned))
}

/// 第一条携带 cwd 的记录（会话的起跑目录——同 core 适配器的 first_cwd 惯例）。
fn cwd_of(records: &[Value]) -> Option<String> {
    records
        .iter()
        .find_map(|r| r.get("cwd").and_then(Value::as_str).map(str::to_owned))
}

/// `claude-session --list`：所有会话的行摘要，按「末行时间戳降序（最新在前），
/// 平局按 session_id 升序」排序；无时间样本排最后。与 codex_session_list 同款
/// 排序，Python 镜像逐字节对齐。
pub fn claude_session_list(home: &Path) -> Value {
    let mut sessions: Vec<Value> = claude_project_files(home)
        .iter()
        .map(|p| file_info(p))
        .map(|info| {
            json!({
                "session_id": info.session_id,
                "title": title_of(&info.records),
                "model": info.records.iter().find_map(|r| {
                    r.get("message").and_then(|m| m.get("model")).and_then(Value::as_str).map(str::to_owned)
                }),
                "cwd": cwd_of(&info.records),
                "first": info.first,
                "last": info.last,
            })
        })
        .collect();
    sessions.sort_by(|a, b| {
        let al = a["last"].as_str().unwrap_or("");
        let bl = b["last"].as_str().unwrap_or("");
        bl.cmp(al).then_with(|| {
            a["session_id"]
                .as_str()
                .unwrap_or("")
                .cmp(b["session_id"].as_str().unwrap_or(""))
        })
    });
    json!({ "host": "claude-code", "sessions": sessions })
}

/// `claude-session --list` 的人读呈现。缺席的字段一律 `-`（诚实缺失，不编造）。
pub fn render_claude_session_list(out: &Value) -> String {
    let mut s = String::from("host: claude-code\n");
    let sessions = out
        .get("sessions")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();
    s.push_str(&format!("sessions: {}\n\n", sessions.len()));
    for row in &sessions {
        let sid = row.get("session_id").and_then(|v| v.as_str()).unwrap_or("");
        let title = row.get("title").and_then(|v| v.as_str()).unwrap_or("-");
        let model = row.get("model").and_then(|v| v.as_str()).unwrap_or("-");
        let first = row.get("first").and_then(|v| v.as_str()).unwrap_or("-");
        let last = row.get("last").and_then(|v| v.as_str()).unwrap_or("-");
        s.push_str(&format!("{sid:<28}  {title}  {model}  {first} → {last}\n"));
    }
    s
}

/// family① + family④ 的审计投影：findings + 三态 rule_outcomes + summary。与
/// codex_session_audit 的 `audit_projection` 同构，唯一差异是 SV607/608 的
/// host-capability degrade（core `host_capability`——表已下沉，这里是消费方）。
fn claude_audit_projection(evidence: &ClaudeEvidence) -> Value {
    let mut family1 = match_behavior_canonical(&evidence.canonical);
    agent_vitals_core::host_capability::degrade_rule_outcomes("claude-code", &mut family1);
    let trajectory = match_trajectory_canonical(&evidence.canonical);

    let mut findings = flatten(&family1);
    findings.extend(flatten_trajectory(&trajectory));
    let mut outcomes = family1;
    outcomes.extend(trajectory);

    let mut critical = 0_u64;
    let mut warning = 0_u64;
    let mut info = 0_u64;
    for finding in &findings {
        match finding.get("severity").and_then(|v| v.as_str()) {
            Some("critical") => critical += 1,
            Some("warning") => warning += 1,
            Some("info") => info += 1,
            _ => {}
        }
    }
    let rules_unavailable = outcomes
        .iter()
        .filter(|(_, outcome)| matches!(outcome, RuleOutcome::Unavailable { .. }))
        .count() as u64;
    json!({
        "summary": {
            "critical": critical, "warning": warning, "info": info,
            "findings_total": findings.len(), "rules_unavailable": rules_unavailable,
        },
        "findings": findings,
        "rule_outcomes": rule_outcomes_json(&outcomes),
    })
}

/// `claude-session` 单会话审计：coverage（§13 逐信号）+ SV601–614 findings。
/// `None` = 没有会话文件属于该 session_id，或该 session 的文件 degraded（不可读 /
/// 无记录）。文件**存在**但读不出记录时绝不能报「空审计」——那是把不可读编成 0 条
/// 真数据（codex 的 §14.4 back-fill 同款纪律）。
///
/// 输出键序是字节一致的一部分（Python 镜像逐字节对齐），不能重排。
pub fn claude_session_audit_json(home: &Path, session_id: &str) -> Option<Value> {
    let mut records: Vec<Value> = Vec::new();
    let mut file: Option<PathBuf> = None;
    let mut first: Option<String> = None;
    let mut last: Option<String> = None;
    for path in claude_project_files(home) {
        let info = file_info(&path);
        if info.session_id == session_id {
            file = Some(path);
            // 跨文件按路径序拼接（resume 理论情况）；first/last 取全局 min/max。
            if first.is_none() {
                first = info.first.clone();
            }
            last = info.last.clone();
            records.extend(info.records);
        }
    }
    let file = file?;
    if records.is_empty() {
        return None;
    }

    let evidence = build_claude_evidence(records, session_id.to_string());
    let ev = claude_evidence_json(&evidence);
    let audit = claude_audit_projection(&evidence);
    let roots = ev["workspace_roots"].as_array().cloned().unwrap_or_default();

    Some(json!({
        "host": "claude-code",
        "session_id": session_id,
        "title": title_of(&evidence.raw_records),
        "model": ev["model"],
        "cwd": roots.first().cloned().unwrap_or(Value::Null),
        "file": file.to_string_lossy().to_string(),
        "date_span": { "first": first, "last": last },
        "audit": audit,
        "coverage": ev["coverage"].clone(),
        "signals": ev["signals"].clone(),
        "attempts": ev["attempts"].clone(),
        "notes": ev["notes"].clone(),
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    // ── 合成 Claude 记录构造器（真实 Claude Code JSONL 的 message 是 Anthropic
    // Message 形状：id/model/content/usage；纯文本 user 的 content 是字符串，工具
    // 续写是块数组）───────────────────────────────────────────────

    fn rec(typ: &str, uuid: &str, ts: &str) -> serde_json::Map<String, Value> {
        let mut m = serde_json::Map::new();
        m.insert("type".to_string(), json!(typ));
        m.insert("uuid".to_string(), json!(uuid));
        m.insert("timestamp".to_string(), json!(ts));
        m.insert("cwd".to_string(), json!("/repo"));
        m
    }

    fn user_text(uuid: &str, ts: &str, text: &str) -> Value {
        let mut r = rec("user", uuid, ts);
        r.insert(
            "message".to_string(),
            json!({"id": uuid, "model": "claude-sonnet-4-5", "content": text}),
        );
        Value::Object(r)
    }

    fn assistant_tool_use(uuid: &str, ts: &str, name: &str, call_id: &str, input: Value) -> Value {
        let mut r = rec("assistant", uuid, ts);
        r.insert(
            "message".to_string(),
            json!({
                "id": uuid,
                "model": "claude-sonnet-4-5",
                "content": [{"type": "tool_use", "id": call_id, "name": name, "input": input}],
                "usage": {"input_tokens": 1, "output_tokens": 1},
            }),
        );
        Value::Object(r)
    }

    fn user_tool_result(uuid: &str, ts: &str, call_id: &str, is_error: Option<bool>) -> Value {
        let mut r = rec("user", uuid, ts);
        let mut block = json!({"type": "tool_result", "tool_use_id": call_id, "content": "done"});
        if let Some(e) = is_error {
            block["is_error"] = json!(e);
        }
        r.insert("message".to_string(), json!({"id": uuid, "content": [block]}));
        Value::Object(r)
    }

    fn ai_title(uuid: &str, ts: &str, title: &str) -> Value {
        let mut r = rec("ai-title", uuid, ts);
        r.insert("aiTitle".to_string(), json!(title));
        Value::Object(r)
    }

    /// 一条 turn、两次工具调用（一 Bash 一 Write）、两个 tool_result（一 error 一
    /// 正常）、一个标题。无敏感路径、无网络工具、无重复 sig——健康的非违规会话。
    /// Write 写 `/repo/x.rs`（工作区根内，SV604/605 都不命中）。
    fn healthy_records() -> Vec<Value> {
        vec![
            user_text("m1", "2026-08-20T14:27:00Z", "修复这个 bug"),
            assistant_tool_use(
                "m2",
                "2026-08-20T14:27:05Z",
                "Bash",
                "call1",
                json!({"command": "ls -la"}),
            ),
            user_tool_result("m3", "2026-08-20T14:27:08Z", "call1", Some(true)),
            assistant_tool_use(
                "m4",
                "2026-08-20T14:27:12Z",
                "Write",
                "call2",
                json!({"file_path": "/repo/x.rs", "content": "fn main() {}"}),
            ),
            user_tool_result("m5", "2026-08-20T14:27:15Z", "call2", None),
            ai_title("t1", "2026-08-20T14:30:00Z", "我的会话"),
        ]
    }

    fn jsonl(records: &[Value]) -> String {
        let mut s = records
            .iter()
            .map(|r| r.to_string())
            .collect::<Vec<_>>()
            .join("\n");
        s.push('\n');
        s
    }

    // ── parse / read 的降级语义 ──────────────────────────────────────────────

    #[test]
    fn parse_keeps_all_records_in_order() {
        let v = parse_claude_session_log(&jsonl(&healthy_records()));
        assert!(v.get("degraded").is_none(), "健康文件不得有 degraded 键");
        let arr = v["records"].as_array().unwrap();
        assert_eq!(arr.len(), 6);
        assert_eq!(arr[0]["type"], json!("user"));
        assert_eq!(arr[1]["type"], json!("assistant"));
        assert_eq!(arr[5]["type"], json!("ai-title"));
    }

    #[test]
    fn parse_empty_is_degraded_empty_not_zero_records() {
        let v = parse_claude_session_log("");
        assert_eq!(v["degraded"], json!("empty"));
        assert!(v.get("records").unwrap().is_null());
    }

    #[test]
    fn parse_bad_line_degrades_whole_file() {
        // 一条坏行毁整份——records 必须 null（绝不把损坏拼成「读了但 0 条」）。
        let mut text = String::from("{not json\n");
        text.push_str(&jsonl(&healthy_records()));
        let v = parse_claude_session_log(&text);
        assert_eq!(v["degraded"], json!("non-json"));
        assert!(v.get("records").unwrap().is_null());
    }

    #[test]
    fn read_missing_file_is_degraded_file_missing() {
        let p = std::env::temp_dir().join(format!("sv-claude-absent-{}.jsonl", std::process::id()));
        let _ = std::fs::remove_file(&p);
        let v = read_claude_session_log(&p);
        assert_eq!(v["degraded"], json!("file-missing"));
        assert!(v.get("records").unwrap().is_null());
    }

    // ── audit projection：§10 验收 #4 的三态契约 ───────────────────────────────
    // （degrade 本身的单测在 core `host_capability.rs`——表已下沉，这里是消费方。）

    #[test]
    fn claude_audit_projection_unsupported_rules_are_unavailable_never_measured_zero() {
        let evidence = build_claude_evidence(healthy_records(), "s1".to_string());
        let audit = claude_audit_projection(&evidence);
        let rules = audit["rule_outcomes"].as_object().unwrap();

        // unsupported 规则（SV607/608/609/610/614）必须 Unavailable。
        for code in ["SV607", "SV608", "SV609", "SV610", "SV614"] {
            assert_eq!(
                rules[code]["status"], json!("unavailable"),
                "{code} 必须 Unavailable（§10 验收 #4）"
            );
        }
        // SV607/608 的 reason 是我们写的 override（host capability）——它们有
        // tool_results 证据（覆盖非零），是原因级读不到才 Unavailable，不是门控
        // 的「no evidence」。SV609/610/614 的 reason 是门控的 no evidence。
        assert!(rules["SV607"]["reason"].as_str().unwrap().contains("claude-code host capability"));
        assert!(rules["SV608"]["reason"].as_str().unwrap().contains("claude-code host capability"));
        assert_eq!(rules["SV609"]["reason"], json!("no evidence for required signal(s) in this session"));

        // 家族①可跑规则（requires 的 timeline 非空）在健康会话上空转零命中。
        for code in ["SV601", "SV602", "SV603", "SV604", "SV605", "SV606"] {
            assert_eq!(rules[code]["status"], json!("measured_zero"), "{code} 必须跑（MeasuredZero）");
        }
        // 家族④：SV611/612/613 跑；SV614 因 approvals/sandbox 恒空 Unavailable。
        for code in ["SV611", "SV612", "SV613"] {
            assert_eq!(rules[code]["status"], json!("measured_zero"), "{code} 必须跑（MeasuredZero）");
        }

        assert_eq!(audit["summary"]["rules_unavailable"], json!(5));
        assert_eq!(audit["summary"]["findings_total"], json!(0));
    }

    #[test]
    fn claude_audit_projection_with_three_failed_results_fires_sv613_lossy() {
        // is_error → failed=Some(true) 的 lossy 路径（trajectory.rs:402）——
        // 3 连败命中 SV613(b)。error_code 恒 None，这条 finding 只能来自 failed。
        let mut records: Vec<Value> = vec![user_text("m1", "2026-08-20T14:27:00Z", "跑测试")];
        for i in 0..3 {
            let aid = format!("m{}", 2 * i + 2);
            let rid = format!("m{}", 2 * i + 3);
            records.push(assistant_tool_use(
                &aid,
                &format!("2026-08-20T14:27:0{}Z", 1 + i * 2),
                "Bash",
                &format!("call{i}"),
                json!({"command": format!("run test {i}")}),
            ));
            records.push(user_tool_result(&rid, &format!("2026-08-20T14:27:0{}Z", 2 + i * 2), &format!("call{i}"), Some(true)));
        }
        let evidence = build_claude_evidence(records, "s2".to_string());
        let audit = claude_audit_projection(&evidence);
        let rules = audit["rule_outcomes"].as_object().unwrap();
        assert_eq!(
            rules["SV613"]["status"], json!("findings"),
            "三个 failed tool_result 必须命中 SV613(b) lossy 路径"
        );
        assert_eq!(rules["SV613"]["count"], json!(1));
        assert_eq!(audit["summary"]["findings_total"], json!(1));
    }

    // ── claude_session_list / render ─────────────────────────────────────────

    fn temp_home(tag: &str) -> std::path::PathBuf {
        let base =
            std::env::temp_dir().join(format!("sv-claude-home-{}-{tag}", std::process::id()));
        let _ = std::fs::remove_dir_all(&base);
        base
    }

    #[test]
    fn list_sorts_most_recent_last_first() {
        let home = temp_home("list");
        let older = home.join(".claude").join("projects").join("a");
        let newer = home.join(".claude").join("projects").join("b");
        std::fs::create_dir_all(&older).unwrap();
        std::fs::create_dir_all(&newer).unwrap();
        std::fs::write(
            older.join("aaa.jsonl"),
            jsonl(&[user_text("m1", "2026-08-20T10:00:00Z", "早上好"), ai_title("t1", "2026-08-20T10:05:00Z", "旧会话")]),
        )
        .unwrap();
        std::fs::write(
            newer.join("bbb.jsonl"),
            jsonl(&[user_text("m1", "2026-08-20T11:00:00Z", "晚上好"), ai_title("t1", "2026-08-20T11:05:00Z", "新会话")]),
        )
        .unwrap();

        let v = claude_session_list(&home);
        assert_eq!(v["host"], json!("claude-code"));
        let sessions = v["sessions"].as_array().unwrap();
        assert_eq!(sessions.len(), 2);
        assert_eq!(sessions[0]["session_id"], json!("bbb"), "最新会话排第一");
        assert_eq!(sessions[0]["title"], json!("新会话"));
        assert_eq!(sessions[1]["session_id"], json!("aaa"));
        assert_eq!(sessions[1]["title"], json!("旧会话"));

        let rendered = render_claude_session_list(&v);
        assert!(rendered.contains("host: claude-code"));
        assert!(rendered.contains("sessions: 2"));
        assert!(rendered.contains("bbb"));
        assert!(rendered.contains("新会话"));
        let _ = std::fs::remove_dir_all(&home);
    }

    #[test]
    fn list_with_missing_home_is_empty_not_error() {
        let home = temp_home("missing");
        let v = claude_session_list(&home);
        assert_eq!(v["sessions"].as_array().unwrap().len(), 0);
        let _ = std::fs::remove_dir_all(&home);
    }

    // ── claude_session_audit_json 端到端 ─────────────────────────────────────

    #[test]
    fn audit_json_end_to_end_over_fixture_file() {
        let home = temp_home("audit");
        let dir = home.join(".claude").join("projects").join("p-skill-vitals");
        std::fs::create_dir_all(&dir).unwrap();
        let sid = "c0ffee00000000000000000000000000";
        std::fs::write(dir.join(format!("{sid}.jsonl")), jsonl(&healthy_records())).unwrap();

        let out = claude_session_audit_json(&home, sid).expect("有会话文件就该出审计");
        assert_eq!(out["host"], json!("claude-code"));
        assert_eq!(out["session_id"], json!(sid));
        assert_eq!(out["title"], json!("我的会话"));
        assert_eq!(out["model"], json!("claude-sonnet-4-5"));
        assert_eq!(out["cwd"], json!("/repo"));
        assert!(out["file"].as_str().unwrap().ends_with(&format!("{sid}.jsonl")));
        assert_eq!(out["date_span"]["first"], json!("2026-08-20T14:27:00Z"));
        assert_eq!(out["date_span"]["last"], json!("2026-08-20T14:30:00Z"));

        // 键序是字节一致的一部分（Python 镜像逐字节对齐），不能重排。
        let keys: Vec<&str> = out.as_object().unwrap().keys().map(String::as_str).collect();
        assert_eq!(
            keys,
            vec!["host", "session_id", "title", "model", "cwd", "file", "date_span", "audit", "coverage", "signals", "attempts", "notes"]
        );

        let rules = out["audit"]["rule_outcomes"].as_object().unwrap();
        assert_eq!(rules["SV607"]["status"], json!("unavailable"));
        assert_eq!(rules["SV614"]["status"], json!("unavailable"));
        assert_eq!(out["audit"]["summary"]["rules_unavailable"], json!(5));

        // coverage 与 timeline 同源：2 个 tool_result、2 个 tool_use、1 个重建 turn。
        assert_eq!(out["coverage"]["ToolResults"]["measured"], json!(2));
        assert_eq!(out["coverage"]["ToolCalls"]["measured"], json!(2));
        assert_eq!(out["coverage"]["TurnBoundaries"]["derived"], json!(1));
        assert_eq!(out["coverage"]["ApprovalDecisions"]["available"], json!(false));
        let _ = std::fs::remove_dir_all(&home);
    }

    #[test]
    fn audit_unknown_session_id_returns_none() {
        let home = temp_home("unknown");
        let dir = home.join(".claude").join("projects").join("p-x");
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("aaa.jsonl"), jsonl(&healthy_records())).unwrap();
        assert!(claude_session_audit_json(&home, "no-such-session").is_none());
        let _ = std::fs::remove_dir_all(&home);
    }

    #[test]
    fn audit_degraded_file_returns_none_not_empty_audit() {
        // 文件存在但坏（不可读）→ None：绝不能报「读了但 0 条」的空审计。
        let home = temp_home("degraded");
        let dir = home.join(".claude").join("projects").join("p-x");
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("bad.jsonl"), "{not json\n").unwrap();
        assert!(claude_session_audit_json(&home, "bad").is_none());
        let _ = std::fs::remove_dir_all(&home);
    }
}
