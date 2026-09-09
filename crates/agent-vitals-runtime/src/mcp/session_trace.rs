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
                    "enum": ["graph", "timeline_series"],
                    "description": "'graph' = full TraceGraph (byte-identical to the CLI's trace --json). 'timeline_series' = the projection consumed by the shared timeline geometry (buildGeometry), with an unplaced_events counter."
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
    if !matches!(output, "graph" | "timeline_series") {
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
