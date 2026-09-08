//! 多宿主 `原始会话文件路径 -> CanonicalSession` 入口——v0.10.0 新建的基础设施
//! （spec §7 门槛 1「三宿主从 CanonicalSession 派生确定性图」的前提）。
//!
//! **这条能力此前不存在**：`agent-vitals-runtime::sessions::behavior::
//! audit_session_log` 是唯一现存的「路径 → CanonicalSession」生产入口，且
//! **硬编码只认 DSH**（直接调 `dsh_evidence::build_dsh_evidence`）。
//! Claude Code / Codex 的 `evidence.rs` 构建函数（`build_claude_evidence` /
//! `build_codex_evidence`）本身早就存在，但目前**只有测试代码**调用它们——
//! 生产路径上没有任何东西从真实文件读出 `Vec<Value>` 喂给它们。本模块补上
//! 这一段：一个按 `host_id` 分派的读取器 + 调度层，三宿主统一走
//! `canonical_session_for_path`。
//!
//! I/O（`std::fs`），所以整份文件挂 `sources` feature（与
//! `hosts::dsh::sources::read_session_log` 同一条边界）。

use std::fs;
use std::path::Path;

use agent_vitals_domain::contracts::evidence::CanonicalSession;
use serde_json::Value;

use crate::{claude_code_evidence, codex_evidence, dsh_evidence, dsh_sources};

/// 三宿主里唯一需要 I/O 的读取步骤失败的原因——诚实分类，不是笼统的
/// `String` 错误袋（呼应 `dsh_sources::read_session_log` 的 `degraded` 字符串
/// 分类，但做成类型而不是裸字符串，供上层按错误种类分支）。
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum CanonicalInputError {
    /// `host` 不在 v0.10.0 的三宿主封闭词表里。
    UnknownHost(String),
    /// 文件不存在 / 无法读取（权限、损坏等）。
    FileUnavailable(String),
    /// 读到了，但一行都解析不出合法 JSON——不是「空文件」（那是合法的零事件
    /// 会话），是「读到的内容不是这个宿主认识的形状」。
    NoParsableRecords,
}

impl std::fmt::Display for CanonicalInputError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            CanonicalInputError::UnknownHost(h) => {
                write!(f, "unknown host `{h}` (trace hosts: claude-code/codex/dsh)")
            }
            CanonicalInputError::FileUnavailable(e) => write!(f, "file unavailable: {e}"),
            CanonicalInputError::NoParsableRecords => {
                write!(f, "no parsable records — the file is not in this host's wire format")
            }
        }
    }
}

/// 逐行 JSONL 读取，跳过空行；解析失败的行**计数但不中止**——诚实报告
/// 「这个文件有多少行读不出来」，而不是让一行坏数据吞掉整个会话（同
/// `read_degradation` 系列纪律：损坏的语料要浮出来，不能被吃掉）。返回
/// `(记录, 坏行数)`。
fn read_jsonl_lines(text: &str) -> (Vec<Value>, usize) {
    let mut records = Vec::new();
    let mut bad = 0usize;
    for line in text.lines() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        match serde_json::from_str::<Value>(line) {
            Ok(v) => records.push(v),
            Err(_) => bad += 1,
        }
    }
    (records, bad)
}

/// 会话 id：优先文件名 stem（宿主惯例——DSH/Claude Code 都用会话 id 命名文件
/// 或所在目录），读不出 stem 时退化成整段路径字符串（诚实兜底，不是 panic）。
fn session_id_from_path(path: &Path) -> String {
    path.file_stem()
        .and_then(|s| s.to_str())
        .map(str::to_owned)
        .unwrap_or_else(|| path.to_string_lossy().into_owned())
}

/// 给定宿主 id + 会话文件路径，产出 `CanonicalSession`（spec §7 门槛 1 的入口）。
///
/// 三宿主分派：
/// - `dsh`：复用 `dsh_sources::read_session_log`（已处理 zstd 解压 + 降级分类），
///   再喂 `build_dsh_evidence`；
/// - `claude-code` / `codex`：本模块新增的逐行 JSONL 读取 + 对应 `build_*_evidence`；
///   Codex 的 `history_mode`/`cli_version`/`title` 三个字段是纯 provenance
///   （`codex/sessions/evidence.rs` 头注：「只进报告不参与计数」），此处统一传
///   `None`——不影响 canonical 时间线的解析正确性。
/// - 其余 host 字符串 → `UnknownHost`（v0.10.0 的封闭词表就是 `FACT_HOSTS`
///   那三个，见 spec §2.5.1）。
pub fn canonical_session_for_path(
    path: &Path,
    host: &str,
) -> Result<CanonicalSession, CanonicalInputError> {
    match host {
        "dsh" => {
            let session = dsh_sources::read_session_log(path);
            if let Some(code) = session.get("degraded").and_then(|v| v.as_str()) {
                return Err(CanonicalInputError::FileUnavailable(code.to_string()));
            }
            let execution_events: Vec<Value> = session
                .get("execution_events")
                .and_then(|v| v.as_array())
                .cloned()
                .unwrap_or_default();
            let usage_events: Vec<Value> = session
                .get("usage_events")
                .and_then(|v| v.as_array())
                .cloned()
                .unwrap_or_default();
            let cwd = session.get("cwd").and_then(|v| v.as_str()).map(str::to_owned);
            let session_id = session_id_from_path(path);
            Ok(dsh_evidence::build_dsh_evidence(execution_events, usage_events, cwd, session_id).canonical)
        }
        "claude-code" => {
            let text = fs::read_to_string(path)
                .map_err(|e| CanonicalInputError::FileUnavailable(e.to_string()))?;
            let (records, _bad) = read_jsonl_lines(&text);
            if records.is_empty() {
                return Err(CanonicalInputError::NoParsableRecords);
            }
            let session_id = session_id_from_path(path);
            Ok(claude_code_evidence::build_claude_evidence(records, session_id).canonical)
        }
        "codex" => {
            let text = fs::read_to_string(path)
                .map_err(|e| CanonicalInputError::FileUnavailable(e.to_string()))?;
            let (records, _bad) = read_jsonl_lines(&text);
            if records.is_empty() {
                return Err(CanonicalInputError::NoParsableRecords);
            }
            let session_id = session_id_from_path(path);
            Ok(codex_evidence::build_codex_evidence(
                records,
                session_id,
                None, // title：仅 provenance，session_index.jsonl 查询是 CLI 层的事
                None, // history_mode：仅 provenance，解析逻辑自己按事件形状判定
                None, // cli_version：仅 provenance
                Vec::new(), // workspace_roots：单文件读取拿不到，留空诚实反映
                None, // model：可从 turn_context 事件抽，本轮先诚实留空不猜
            )
            .canonical)
        }
        other => Err(CanonicalInputError::UnknownHost(other.to_string())),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    fn tmp_file(name: &str, content: &str) -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "agent-vitals-canonical-input-test-{}-{}",
            std::process::id(),
            name
        ));
        std::fs::create_dir_all(&dir).unwrap();
        let p = dir.join(name);
        let mut f = std::fs::File::create(&p).unwrap();
        f.write_all(content.as_bytes()).unwrap();
        p
    }

    // `CanonicalSession` 没有 `Debug`（domain 契约类型没有派生它），所以
    // `.unwrap_err()` 用不了——手写这个小 helper 代替。
    fn expect_err(
        r: Result<CanonicalSession, CanonicalInputError>,
    ) -> CanonicalInputError {
        match r {
            Ok(_) => panic!("expected an error, got Ok(CanonicalSession)"),
            Err(e) => e,
        }
    }

    #[test]
    fn unknown_host_is_rejected_not_silently_guessed() {
        let p = tmp_file("x.jsonl", "");
        let err = expect_err(canonical_session_for_path(&p, "not-a-real-host"));
        assert_eq!(err, CanonicalInputError::UnknownHost("not-a-real-host".to_string()));
    }

    #[test]
    fn missing_file_is_file_unavailable_not_a_panic() {
        let p = std::path::Path::new("/nonexistent/does/not/exist.jsonl");
        let err = expect_err(canonical_session_for_path(p, "claude-code"));
        assert!(matches!(err, CanonicalInputError::FileUnavailable(_)));
    }

    #[test]
    fn claude_code_jsonl_produces_a_canonical_session_with_a_tool_call() {
        let lines = [
            r#"{"type":"user","uuid":"u1","parentUuid":null,"timestamp":"2026-08-20T14:27:08.827Z","message":{"id":"m1","content":"hi"}}"#,
            r#"{"type":"assistant","uuid":"a1","parentUuid":"u1","timestamp":"2026-08-20T14:27:09.000Z","message":{"id":"m2","model":"claude-sonnet-5","content":[{"type":"tool_use","id":"tu1","name":"Bash","input":{"command":"ls"}}]}}"#,
        ];
        let p = tmp_file("session.jsonl", &lines.join("\n"));
        let session = canonical_session_for_path(&p, "claude-code").unwrap();
        assert_eq!(session.meta.host_id, "claude-code");
        assert!(!session.tool_calls.entries.is_empty(), "Bash tool_use 应该抽出一条 tool_call");
    }

    #[test]
    fn codex_rollout_produces_a_canonical_session() {
        let lines = [
            r#"{"type":"session_meta","payload":{"session_id":"ses-abc"}}"#,
            r#"{"type":"event_msg","payload":{"type":"task_started","turn_id":"t1"}}"#,
        ];
        let p = tmp_file("rollout.jsonl", &lines.join("\n"));
        let session = canonical_session_for_path(&p, "codex").unwrap();
        assert_eq!(session.meta.host_id, "codex");
    }

    #[test]
    fn empty_claude_code_file_is_no_parsable_records_not_a_fake_empty_session() {
        let p = tmp_file("empty.jsonl", "");
        let err = expect_err(canonical_session_for_path(&p, "claude-code"));
        assert_eq!(err, CanonicalInputError::NoParsableRecords);
    }

    #[test]
    fn jsonl_reader_counts_bad_lines_without_aborting() {
        let text = "not json\n{\"a\":1}\n\nalso not json\n";
        let (records, bad) = read_jsonl_lines(text);
        assert_eq!(records.len(), 1);
        assert_eq!(bad, 2);
    }
}
