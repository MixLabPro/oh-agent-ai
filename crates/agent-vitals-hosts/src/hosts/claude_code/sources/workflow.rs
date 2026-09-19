//! Claude Code JSONL → host-neutral WorkflowEvent.
//!
//! Claude's log contains tool arguments, paths, prompts, and tool-result
//! bodies.  This adapter deliberately keeps only bounded tool/Skill names and
//! one-way fingerprints.  Missing approval and error-code evidence remains
//! unavailable rather than being inferred from a boolean or a text body.

use std::collections::HashMap;
use std::path::Path;

use agent_vitals_domain::contracts::r2a::SessionKey;
use agent_vitals_domain::source_identity::fnv1a64_hex;
use agent_vitals_domain::workflow::WorkflowEvent;
use serde_json::Value;

use crate::workflow_utils::{fingerprint, iso_to_epoch_ms, safe_label};

#[derive(Clone)]
enum CallKind { Tool(String), Skill(String) }

fn event_id(path: &Path, offset: usize, ordinal: usize, event_type: &str) -> String {
    let material = format!("claude|{}|{}|{}|{}", path.to_string_lossy(), offset, ordinal, event_type);
    format!("workflow:claude:{}", fnv1a64_hex(material.as_bytes()))
}

#[allow(clippy::too_many_arguments)]
fn add_event(
    out: &mut Vec<WorkflowEvent>, path: &Path, offset: usize, ordinal: usize,
    session_key: &str, event_type: &str, time: Option<i64>, kind: Option<&str>,
    id: Option<String>, result: &str, error: Option<String>, invocation: Option<String>,
) {
    let Some(event_ts_ms) = time else { return };
    let event = WorkflowEvent {
        event_id: event_id(path, offset, ordinal, event_type),
        session_key: Some(session_key.to_string()),
        event_ts_ms,
        event_type: event_type.to_string(),
        capability_kind: kind.map(str::to_string),
        capability_id: id,
        capability_version: None,
        outcome: result.to_string(),
        duration_ms: None,
        error_fingerprint: error,
        invocation_fingerprint: invocation,
    };
    if event.validate().is_ok() { out.push(event); }
}

fn text_content(content: Option<&Value>) -> bool {
    match content {
        Some(Value::String(value)) => !value.trim().is_empty(),
        Some(Value::Array(values)) => !values.is_empty() && values.iter().all(|value| {
            value.get("type").and_then(Value::as_str) == Some("text")
                && value.get("text").and_then(Value::as_str).is_some_and(|text| !text.trim().is_empty())
        }),
        _ => false,
    }
}

fn skill_name(input: Option<&Value>) -> String {
    input
        .and_then(Value::as_object)
        .and_then(|object| object.get("skill").or_else(|| object.get("name")))
        .and_then(Value::as_str)
        .map(safe_label)
        .unwrap_or_else(|| "<unknown-skill>".to_string())
}

fn read_records(path: &Path) -> Result<Vec<(usize, Value)>, String> {
    let bytes = std::fs::read(path).map_err(|error| format!("read {}: {error}", path.display()))?;
    let mut out = Vec::new();
    let mut start = 0usize;
    for (index, byte) in bytes.iter().enumerate() {
        if *byte != b'\n' { continue; }
        let mut line = &bytes[start..index];
        if line.last() == Some(&b'\r') { line = &line[..line.len() - 1]; }
        if !line.is_empty() {
            let value = serde_json::from_slice::<Value>(line)
                .map_err(|error| format!("non-json line in {}: {error}", path.display()))?;
            out.push((start, value));
        }
        start = index + 1;
    }
    // A non-newline-terminated tail is potentially an in-flight writer.  The
    // usage emitter has the same rule, so do not manufacture workflow events.
    Ok(out)
}

/// Emit privacy-safe workflow events from one Claude session file.
pub fn claude_file_to_workflow_events(
    path: &Path,
    machine_namespace: &str,
    source_profile: &str,
    native_session_id: &str,
) -> Result<Vec<WorkflowEvent>, String> {
    let records = read_records(path)?;
    let session_key = SessionKey::new("claude-code", native_session_id, source_profile, machine_namespace).ledger_key();
    let mut out = Vec::new();
    let mut calls: HashMap<String, CallKind> = HashMap::new();
    let mut previous_model: Option<String> = None;
    let mut task_started: Option<(usize, i64)> = None;

    for (offset, record) in records.iter() {
        let time = record.get("timestamp").and_then(Value::as_str).and_then(|value| iso_to_epoch_ms(Some(value)));
        match record.get("type").and_then(Value::as_str).unwrap_or("") {
            "user" => {
                let message = record.get("message");
                let content = message.and_then(|value| value.get("content"));
                if text_content(content) && task_started.is_none() {
                    task_started = time.map(|value| (*offset, value));
                    add_event(&mut out, path, *offset, 0, &session_key, "task_started", time,
                        None, None, "unknown", None, None);
                }
                if let Some(Value::Array(blocks)) = content {
                    // `toolUseResult` 是 record 级结构化结果：只有这条 user 记录
                    // 恰好带一个 tool_result 时，它才无歧义地属于该调用（真机
                    // 16/16 如此；并行工具调用时退回块级信号）。
                    let single_tool_result = blocks.iter()
                        .filter(|block| block.get("type").and_then(Value::as_str) == Some("tool_result"))
                        .count() == 1;
                    for (block_index, block) in blocks.iter().enumerate() {
                        if block.get("type").and_then(Value::as_str) != Some("tool_result") { continue; }
                        let call_id = block.get("tool_use_id").and_then(Value::as_str).unwrap_or("");
                        let Some(kind) = calls.get(call_id).cloned() else { continue };
                        let failed = block.get("is_error").and_then(Value::as_bool);
                        let mut result = match failed { Some(true) => "failed", Some(false) => "succeeded", None => "unknown" };
                        // Skill 的 tool_result **不写 is_error**（bash 恒带，skill
                        // 实测恒无——2026-09-20 真机 16/16）。Skill 的成败信号在
                        // record 级 `toolUseResult.success`；两个信号都缺席时保持
                        // unknown —— 「没看到失败」不折算成成功。
                        if matches!(kind, CallKind::Skill(_)) && single_tool_result {
                            if let Some(success) = record.get("toolUseResult")
                                .and_then(|t| t.get("success")).and_then(Value::as_bool) {
                                result = if success { "succeeded" } else { "failed" };
                            }
                        }
                        let error = (result == "failed").then(|| fingerprint("claude-tool-error"));
                        match kind {
                            CallKind::Tool(name) => add_event(&mut out, path, *offset, block_index + 1,
                                &session_key, "tool_finished", time, Some("tool"), Some(name.clone()),
                                result, error, Some(fingerprint(&format!("claude-tool:{name}")))),
                            CallKind::Skill(name) => add_event(&mut out, path, *offset, block_index + 1,
                                &session_key, "skill_finished", time, Some("skill"), Some(name),
                                result, error, Some(fingerprint("claude-skill-invocation"))),
                        }
                    }
                }
            }
            "assistant" => {
                let message = record.get("message");
                if let Some(model) = message.and_then(|value| value.get("model")).and_then(Value::as_str) {
                    let model = safe_label(model);
                    if previous_model.as_deref().is_some_and(|previous| previous != model) {
                        add_event(&mut out, path, *offset, 0, &session_key, "model_switched", time,
                            Some("model"), Some(model.clone()), "succeeded", None, None);
                    }
                    previous_model = Some(model);
                }
                if let Some(Value::Array(blocks)) = message.and_then(|value| value.get("content")) {
                    for (block_index, block) in blocks.iter().enumerate() {
                        if block.get("type").and_then(Value::as_str) != Some("tool_use") { continue; }
                        let raw_name = block.get("name").and_then(Value::as_str).unwrap_or("");
                        let call_id = block.get("id").and_then(Value::as_str).unwrap_or("");
                        if raw_name.eq_ignore_ascii_case("skill") {
                            let name = skill_name(block.get("input"));
                            calls.insert(call_id.to_string(), CallKind::Skill(name.clone()));
                            add_event(&mut out, path, *offset, block_index + 1, &session_key,
                                "skill_invoked", time, Some("skill"), Some(name), "unknown", None,
                                Some(fingerprint("claude-skill-invocation")));
                        } else {
                            let name = safe_label(raw_name);
                            calls.insert(call_id.to_string(), CallKind::Tool(name.clone()));
                            add_event(&mut out, path, *offset, block_index + 1, &session_key,
                                "tool_invoked", time, Some("tool"), Some(name.clone()), "unknown", None,
                                Some(fingerprint(&format!("claude-tool:{name}"))));
                        }
                    }
                }
            }
            _ => {}
        }
    }
    if let Some((offset, _)) = task_started {
        let last_time = records.last().and_then(|(_, record)| record.get("timestamp"))
            .and_then(Value::as_str).and_then(|value| iso_to_epoch_ms(Some(value)));
        add_event(&mut out, path, offset, usize::MAX, &session_key, "task_finished", last_time,
            None, None, "unknown", None, None);
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::claude_file_to_workflow_events;
    use std::path::PathBuf;

    /// Skill 的 tool_result 不带 is_error（真机 16/16）；成败信号在 record 级
    /// `toolUseResult.success`（WORKBENCH_FINDINGS_TAB_SPEC §9.4-① 修复）。
    /// 钉住三态：true → succeeded、false → failed（带错误指纹）、都缺席 →
    /// unknown（「没看到失败」不得折算成成功）。工具路径不受影响。
    #[test]
    fn skill_outcome_reads_tool_use_result_success() {
        let path = std::env::temp_dir().join(format!("av-claude-skill-{}.jsonl", std::process::id()));
        std::fs::write(&path, concat!(
            // skill 加载成功：无 is_error，toolUseResult.success=true
            r#"{"type":"assistant","timestamp":"2026-08-20T14:27:05.000Z","message":{"content":[{"type":"tool_use","id":"s1","name":"Skill","input":{"skill":"code-review"}}]}}"#, "\n",
            r#"{"type":"user","timestamp":"2026-08-20T14:27:08.000Z","toolUseResult":{"commandName":"code-review","success":true},"message":{"content":[{"type":"tool_result","tool_use_id":"s1","content":"loaded"}]}}"#, "\n",
            // skill 失败：无 is_error，toolUseResult.success=false
            r#"{"type":"assistant","timestamp":"2026-08-20T14:28:00.000Z","message":{"content":[{"type":"tool_use","id":"s2","name":"Skill","input":{"skill":"nope"}}]}}"#, "\n",
            r#"{"type":"user","timestamp":"2026-08-20T14:28:02.000Z","toolUseResult":{"commandName":"nope","success":false},"message":{"content":[{"type":"tool_result","tool_use_id":"s2","content":"not found"}]}}"#, "\n",
            // 两个信号都缺席 → unknown
            r#"{"type":"assistant","timestamp":"2026-08-20T14:29:00.000Z","message":{"content":[{"type":"tool_use","id":"s3","name":"Skill","input":{"skill":"third"}}]}}"#, "\n",
            r#"{"type":"user","timestamp":"2026-08-20T14:29:02.000Z","message":{"content":[{"type":"tool_result","tool_use_id":"s3","content":"loaded"}]}}"#, "\n",
            // 工具路径不变：is_error=false → succeeded
            r#"{"type":"assistant","timestamp":"2026-08-20T14:30:00.000Z","message":{"content":[{"type":"tool_use","id":"t1","name":"Bash","input":{"command":"ls"}}]}}"#, "\n",
            r#"{"type":"user","timestamp":"2026-08-20T14:30:02.000Z","message":{"content":[{"type":"tool_result","tool_use_id":"t1","is_error":false,"content":"ok"}]}}"#, "\n",
        )).unwrap();
        let events = claude_file_to_workflow_events(&PathBuf::from(&path), "machine", "default", "s1").unwrap();
        let finished = |skill: &str| events.iter().find(|event|
            event.event_type == "skill_finished" && event.capability_id.as_deref() == Some(skill)).cloned();
        assert_eq!(finished("code-review").map(|e| e.outcome).as_deref(), Some("succeeded"));
        let failed = finished("nope").expect("failed skill event");
        assert_eq!(failed.outcome, "failed");
        assert!(failed.error_fingerprint.is_some(), "success=false 的失败要带错误指纹");
        assert_eq!(finished("third").map(|e| e.outcome).as_deref(), Some("unknown"),
            "两个信号都缺席时保持 unknown");
        // safe_label 保留原大小写（"Bash" 合法且 ≤128 → 原样返回）。
        assert!(events.iter().any(|event| event.event_type == "tool_finished"
            && event.capability_id.as_deref().is_some_and(|name| name.eq_ignore_ascii_case("bash"))
            && event.outcome == "succeeded"),
            "工具路径的 is_error 语义不变");
        std::fs::remove_file(path).ok();
    }

    #[test]
    fn emits_safe_claude_workflow_events_without_raw_payloads() {
        let path = std::env::temp_dir().join(format!("av-claude-workflow-{}.jsonl", std::process::id()));
        std::fs::write(&path, concat!(
            r#"{"type":"user","timestamp":"2026-08-20T14:27:00.000Z","message":{"content":"do it"}}"#, "\n",
            r#"{"type":"assistant","timestamp":"2026-08-20T14:27:05.000Z","message":{"model":"claude-sonnet","content":[{"type":"tool_use","id":"c1","name":"Bash","input":{"command":"cat /Users/private/secret"}}]}}"#, "\n",
            r#"{"type":"user","timestamp":"2026-08-20T14:27:08.000Z","message":{"content":[{"type":"tool_result","tool_use_id":"c1","is_error":true,"content":"private error"}]}}"#, "\n",
        )).unwrap();
        let events = claude_file_to_workflow_events(&PathBuf::from(&path), "machine", "default", "s1").unwrap();
        assert!(events.iter().any(|event| event.event_type == "tool_invoked"));
        assert!(events.iter().any(|event| event.event_type == "tool_finished" && event.outcome == "failed"));
        assert!(events.iter().all(|event| event.validate().is_ok()));
        let debug = format!("{events:?}");
        assert!(!debug.contains("/Users/private"));
        assert!(!debug.contains("private error"));
        std::fs::remove_file(path).ok();
    }
}
