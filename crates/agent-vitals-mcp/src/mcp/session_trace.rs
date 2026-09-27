//! `session_trace` 工具（v0.10.0，spec §7 门槛 3 的 MCP 消费面）——
//! 对一个 `sessions_search` 返回的会话引用产出确定性 TraceGraph / timeline_series。
//!
//! **信任域说明（读代码前必读）**：本工具不接受路径。它解析安装级 HMAC
//! `session_ref` 后，只在当前用户三宿主的固定目录反查 matching source，路径
//! 始终留在进程内部。这既让 Sessions → Trace 可用，也不会把 MCP 变成任意本机
//! 文件读取接口。
//!
//! **memo**：MCP server 是常驻消费面——Phase 3 memo（60s TTL +
//! `(COUNT, MAX(rowid))` 失效）在这里首次有真实收益；同一会话被反复下钻时
//! 命中同一份 `Arc<TraceGraph>`，不重算。CLI（一次性进程）不走 memo。
//!
//! **parity（spec §7 门槛 3）**：`output=graph` 的 `data` 与同一受控源文件
//! 建出的 CLI TraceGraph 必须相等；MCP 多出的只是 session_ref 安全解析，不得
//! 改变图的节点、证据或计量语义。

use std::path::Path;

use serde_json::{json, Value};

use super::{authority_state_for, build_envelope, AuthorityHandle, ToolError, ToolSpec};
use agent_vitals_data::authority_query;
use agent_vitals_domain::domain::trace::project_timeline_series;
use agent_vitals_domain::evidence::Linearization;

pub fn spec() -> ToolSpec {
    ToolSpec {
        name: "session_trace",
        description: "Build the deterministic TraceGraph (or its timeline_series projection) \
for ONE opaque session_ref returned by sessions_search. The server resolves that reference only \
against this installation's authority sessions and reads only a matching source under the fixed \
Claude Code/Codex/DSH roots; it never accepts caller-controlled file paths. Nodes are ordered by \
(scope, ordinal), never by timestamp; missing parent/time/status are counted in coverage, never \
fabricated. Three-host closed vocabulary: claude-code / codex / dsh.",
        input_schema: json!({
            "type": "object",
            "properties": {
                "session_ref": {
                    "type": "string",
                    "description": "Opaque per-install session id returned by sessions_search."
                },
                "output": {
                    "type": "string",
                    "enum": ["graph", "timeline_series", "insights"],
                    "description": "'graph' = full TraceGraph (byte-identical to the CLI's trace --json). 'timeline_series' = the projection consumed by the shared timeline geometry (buildGeometry), with an unplaced_events counter. 'insights' = consumption diagnostics from the authority DB only (turn axis with per-turn input/output tokens, hit rate, tool outcome counts and nominal cost; diagnostics as fact + cause certainty + remedy_id; safety rule counts). Never includes error/argument excerpts, fingerprints, paths or finding evidence text."
                }
            },
            "required": ["session_ref"],
            "additionalProperties": false
        }),
        output_schema: json!({
            "type": "object",
            "description": "envelope; data = TraceGraph JSON (output=graph) or timeline_series spec (output=timeline_series)",
            "additionalProperties": true
        }),
    }
}

pub fn run(args: &Value, data_home: &Path) -> Result<Value, ToolError> {
    let session_ref = args
        .get("session_ref")
        .and_then(Value::as_str)
        .filter(|s| !s.is_empty())
        .ok_or_else(|| ToolError::new("invalid_argument", "`session_ref` is required"))?;
    let output = args
        .get("output")
        .and_then(Value::as_str)
        .unwrap_or("graph");
    if !matches!(output, "graph" | "timeline_series" | "insights") {
        return Err(ToolError::new(
            "invalid_argument",
            format!("unknown `output`: {output}"),
        ));
    }

    // 打不开权威库时连 session_ref 都不能安全反解，故不可降级成裸路径读取。
    let handle = AuthorityHandle::open(data_home)?;
    let conn = handle.conn();

    let salt = super::session_ref::load_or_create_salt(data_home)?;
    let keys = authority_query::all_session_keys(conn)
        .map_err(|e| ToolError::new("internal_error", format!("authority query: {e}")))?;
    let session_key = super::session_ref::resolve(&salt, session_ref, keys).ok_or_else(|| {
        ToolError::new("invalid_argument", "unknown session_ref — it may be from a different machine, or the session was deleted, or the salt was rotated")
    })?;
    if output == "insights" {
        // 只读权威库（不找源文件）：源日志轮换后诊断照样可用。
        let host = authority_query::session_row(conn, &session_key)
            .map_err(|e| ToolError::new("internal_error", format!("authority query: {e}")))?
            .map(|(host, _)| host)
            .ok_or_else(|| ToolError::new("invalid_argument", "session not found"))?;
        let data = crate::query::session_insights::session_insights(conn, &session_key, &host)
            .map_err(|e| ToolError::new("internal_error", format!("insights query: {e}")))?;
        return Ok(build_envelope(
            conn,
            authority_state_for(data_home),
            None,
            json!({
                "mode": "diagnostic",
                "host": host,
                "session_ref": session_ref,
                "output": output,
            }),
            Vec::new(),
            data,
        ));
    }
    let key = crate::trace_service::session_key_for(conn, &session_key)
        .map_err(|e| ToolError::new("invalid_argument", e.to_string()))?;
    let canonical = crate::trace_service::canonical_for_local_session(&key)
        .map_err(|e| ToolError::new("source_unavailable", e.to_string()))?;

    // memo 命中/回填（常驻消费面的收益点）；失败计数器查询视为内部错误。
    let graph = crate::trace_service::trace_graph_for_canonical(data_home, &key, &canonical, conn)
        .map_err(|e| ToolError::new("internal_error", e.to_string()))?;

    let (data, extra_coverage) = match output {
        "graph" => (graph.to_json(), json!({})),
        "timeline_series" => {
            // AllRecorded 不暴露成参数——v0.10.0 的图只有 adapter 选定的一条
            // 路径，域层会诚实拒绝；LeafPath 按契约不可能失败。
            let series = project_timeline_series(&graph, Linearization::LeafPath)
                .map_err(|e| ToolError::new("internal_error", e.to_string()))?;
            let unplaced = series
                .get("unplaced_events")
                .and_then(Value::as_u64)
                .unwrap_or(0);
            (series, json!({ "unplaced_events": unplaced }))
        }
        _ => unreachable!(),
    };

    Ok(build_envelope(
        conn,
        authority_state_for(data_home),
        None,
        json!({
            "mode": "diagnostic",
            "host": key.host_kind,
            "session_ref": session_ref,
            "output": output,
            // coverage 语义：envelope 的 coverage 描述**这次查询**的完整度，
            // 与 TraceCoverage（图本身的诚实计数）分开——后者在 data.coverage。
            "trace": extra_coverage,
        }),
        Vec::new(),
        data,
    ))
}

#[cfg(test)]
mod insights_tests {
    use super::run;
    use agent_vitals_data::authority::AuthorityDb;
    use serde_json::{json, Value};

    const T0: i64 = 1_790_000_000_000;
    const MIN: i64 = 60_000;
    const SKEY: &str = "11:claude-code|10:priv-ins-01|2:ns";

    fn tmp_home(tag: &str) -> std::path::PathBuf {
        std::env::temp_dir().join(format!(
            "avmcp-ins-{tag}-{}-{}",
            std::process::id(),
            std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos()
        ))
    }

    /// 12 个回合、每回合 3 次调用；回合 5 有同一调用的 2 次失败（带错误摘录）；
    /// 回合 3 有一条 SV601（metadata 带命令摘要）。
    fn seed(home: &std::path::Path) -> String {
        std::fs::create_dir_all(home).unwrap();
        let db = AuthorityDb::open(&agent_vitals_data::authority::default_authority_path(home), 1).unwrap();
        let c = db.conn();
        c.execute("INSERT INTO sync_runs(run_id, started_at_ms, trigger, status, schema_version) VALUES ('run',1,'cli','succeeded',2)", []).unwrap();
        c.execute(
            "INSERT INTO sessions(session_key, host, native_session_id, machine_namespace, source_profile, last_observed_at_ms)
             VALUES (?1, 'claude-code', 'priv-ins-01', 'ns', 'default', 1)",
            rusqlite::params![SKEY],
        ).unwrap();
        let mut n = 0;
        for turn in 0..12i64 {
            let ts = T0 + turn * 2 * MIN;
            c.execute(
                "INSERT INTO workflow_events(event_id, session_key, event_ts_ms, event_type, outcome, ingested_run_id, created_at_ms)
                 VALUES (?1, ?2, ?3, 'task_started', 'unknown', 'run', 1)",
                rusqlite::params![format!("ts{turn}"), SKEY, ts],
            ).unwrap();
            for k in 0..3i64 {
                n += 1;
                c.execute(
                    "INSERT INTO usage_facts(fact_id, host, machine_namespace, native_session_id, session_key,
                         source_event_id, observation_kind, model_id, event_ts_ms, event_peak,
                         uncached_input_tokens, cache_read_tokens, cache_write_tokens, output_tokens,
                         ingested_run_id, created_at_ms, updated_at_ms)
                     VALUES (?1, 'claude-code', 'ns', 'priv-ins-01', ?2, ?1, 'assistant-usage', 'claude-sonnet-5', ?3, 0,
                             500, 49000, 500, 800, 'run', 1, 1)",
                    rusqlite::params![format!("f{n}"), SKEY, ts + 1_000 + k * 1_000],
                ).unwrap();
            }
        }
        for (i, dt) in [500i64, 1_500].iter().enumerate() {
            c.execute(
                "INSERT INTO workflow_events(event_id, session_key, event_ts_ms, event_type, capability_kind, capability_id,
                     outcome, invocation_fingerprint, error_excerpt, args_excerpt, ingested_run_id, created_at_ms)
                 VALUES (?1, ?2, ?3, 'tool_finished', 'tool', 'Bash', 'failed', 'fnv1a64:same-call',
                         'Error: Cannot find module vitest/config', '{\"command\":\"npx vitest run\"}', 'run', 1)",
                rusqlite::params![format!("fail{i}"), SKEY, T0 + 4 * 2 * MIN + dt],
            ).unwrap();
        }
        c.execute(
            "INSERT INTO issue_instances(issue_id, machine_namespace, host, session_key, issue_type,
                 instance_fingerprint, status, severity, evaluator_id, evaluator_version,
                 evidence_fingerprint, opened_at_ms, metadata_json)
             VALUES ('iss1', 'ns', 'claude-code', ?1, 'SV601', 'fp1', 'open', 'critical', 'ev', '1', 'ef', ?3, ?2)",
            // 与生产一致：findings_eval 写的是**原生会话 id**，不是 ledger key。
            // opened_at_ms 必须是毫秒量级：秒量级会在重开库时被单位修复迁移改写。
            rusqlite::params!["priv-ins-01", json!({"tool_name": "bash", "evidence": "rm -rf ./secret-dir", "time": T0 + 2 * 2 * MIN + 10}).to_string(), T0],
        ).unwrap();
        drop(db);
        let salt = crate::mcp::session_ref::load_or_create_salt(home).unwrap();
        crate::mcp::session_ref::session_ref(&salt, SKEY)
    }

    fn insights(home: &std::path::Path, sref: &str) -> Value {
        run(&json!({ "session_ref": sref, "output": "insights" }), home).unwrap()
    }

    #[test]
    fn insights_builds_the_turn_axis_and_diagnostics_from_the_authority_db_only() {
        let home = tmp_home("axis");
        let sref = seed(&home);
        // 不存在任何宿主源文件：insights 只读权威库。
        let env = insights(&home, &sref);
        let d = &env["data"];
        assert_eq!(d["axis"]["unit"], "turn");
        assert_eq!(d["axis"]["steps"].as_array().unwrap().len(), 12);
        assert_eq!(d["axis"]["steps"][4]["tools"]["failed"], 2);
        assert_eq!(d["lanes"]["consumption"]["state"], "available");
        assert_eq!(d["lanes"]["tools"]["state"], "available");
        let diag = &d["diagnostics"][0];
        assert_eq!(diag["kind"], "repeated_failure");
        assert_eq!(diag["steps"], json!({"from": 5, "to": 5}));
        assert_eq!(diag["cause"], "evidence");
        assert_eq!(diag["evidence"], json!(["error_excerpt"]));
        assert_eq!(d["safety"]["rules"][0], json!({"rule": "SV601", "severity": "critical", "count": 1, "steps": [3]}));
        let _ = std::fs::remove_dir_all(&home);
    }

    /// 出口红线（spec §10）：insights 经 MCP 供出，摘录、指纹原值、findings 的
    /// evidence 文本、原生会话 id 一律不得出现。
    #[test]
    fn insights_never_carry_excerpts_fingerprints_or_finding_evidence() {
        let home = tmp_home("egress");
        let sref = seed(&home);
        let text = insights(&home, &sref).to_string();
        for forbidden in ["Cannot find module", "npx vitest", "same-call", "rm -rf", "secret-dir", "priv-ins-01"] {
            assert!(!text.contains(forbidden), "insights 泄漏 {forbidden:?}: {text}");
        }
        let _ = std::fs::remove_dir_all(&home);
    }

    /// 本地证据面带摘录（检查器的「错误摘要」），且按回合范围过滤。
    #[test]
    fn local_evidence_carries_excerpts_for_the_requested_range_only() {
        let home = tmp_home("evidence");
        let _sref = seed(&home);
        let db = AuthorityDb::open(&agent_vitals_data::authority::default_authority_path(&home), 1).unwrap();
        let ev = crate::query::session_insights::session_trace_evidence(db.conn(), SKEY, 5, 5).unwrap();
        assert_eq!(ev["failures"].as_array().unwrap().len(), 2);
        assert_eq!(ev["failures"][0]["error_excerpt"], "Error: Cannot find module vitest/config");
        assert_eq!(ev["failures"][0]["step"], 5);
        assert_eq!(ev["calls"].as_array().unwrap().len(), 3, "只含回合 5 的调用");
        assert_eq!(ev["safety"][0]["summary"], "rm -rf ./secret-dir");
        assert_eq!(ev["safety"][0]["step"], 3);
        let none = crate::query::session_insights::session_trace_evidence(db.conn(), SKEY, 1, 2).unwrap();
        assert!(none["failures"].as_array().unwrap().is_empty());
        drop(db);
        let _ = std::fs::remove_dir_all(&home);
    }

    #[test]
    fn insights_without_turn_events_fall_back_to_assistant_calls() {
        let home = tmp_home("nocalls");
        let sref = seed(&home);
        let db = AuthorityDb::open(&agent_vitals_data::authority::default_authority_path(&home), 1).unwrap();
        db.conn().execute("DELETE FROM workflow_events", []).unwrap();
        drop(db);
        let d = insights(&home, &sref)["data"].clone();
        assert_eq!(d["axis"]["unit"], "assistant_call");
        assert_eq!(d["axis"]["steps"].as_array().unwrap().len(), 36);
        assert_eq!(d["lanes"]["tools"], json!({"state": "unavailable", "reason": "no_data_in_session"}));
        let _ = std::fs::remove_dir_all(&home);
    }

    /// 旧的工具名级指纹（源日志已清理、无法重放纠正）不能当成「同一调用」；
    /// 路径形状的能力名只留末段（§10）。
    #[test]
    fn legacy_fingerprints_are_not_same_call_and_paths_are_trimmed() {
        let home = tmp_home("legacy");
        let sref = seed(&home);
        let db = AuthorityDb::open(&agent_vitals_data::authority::default_authority_path(&home), 1).unwrap();
        let legacy = agent_vitals_domain::session_semantics::fingerprint("claude-tool:Bash");
        for (i, turn) in [7i64, 8].iter().enumerate() {
            db.conn().execute(
                "INSERT INTO workflow_events(event_id, session_key, event_ts_ms, event_type, capability_kind, capability_id,
                     outcome, invocation_fingerprint, ingested_run_id, created_at_ms)
                 VALUES (?1, ?2, ?3, 'tool_finished', 'tool', 'Bash', 'failed', ?4, 'run', 1)",
                rusqlite::params![format!("legacy{i}"), SKEY, T0 + turn * 2 * MIN + 700, legacy],
            ).unwrap();
        }
        for (i, turn) in [9i64, 9, 10].iter().enumerate() {
            db.conn().execute(
                "INSERT INTO workflow_events(event_id, session_key, event_ts_ms, event_type, capability_kind, capability_id,
                     outcome, invocation_fingerprint, ingested_run_id, created_at_ms)
                 VALUES (?1, ?2, ?3, 'tool_finished', 'tool', '/bin/zsh', 'failed', ?4, 'run', 1)",
                rusqlite::params![format!("zsh{i}"), SKEY, T0 + turn * 2 * MIN + 800 + i as i64, format!("fnv1a64:zsh{i}")],
            ).unwrap();
        }
        drop(db);
        let env = insights(&home, &sref);
        let d = &env["data"];
        assert_eq!(d["quality"]["legacy_fingerprints"], 2);
        let kinds: Vec<(&str, i64)> = d["diagnostics"].as_array().unwrap().iter()
            .map(|x| (x["fact"]["capability_id"].as_str().unwrap_or(""), x["steps"]["from"].as_i64().unwrap())).collect();
        assert!(!kinds.iter().any(|(_, from)| *from == 8), "两次旧指纹失败不得报成同一调用：{kinds:?}");
        assert!(kinds.iter().any(|(cap, _)| *cap == "zsh"), "{kinds:?}");
        let text = env.to_string();
        assert!(!text.contains("/bin/"), "路径出现在 insights：{text}");
        assert!(!text.contains("/Users/"), "路径出现在 insights");
        let _ = std::fs::remove_dir_all(&home);
    }
}
