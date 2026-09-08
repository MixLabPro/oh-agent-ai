//! `session_trace` 工具（v0.10.0，spec §7 门槛 3 的 MCP 消费面）——
//! 对一个调用方指定的本地会话文件产出确定性 TraceGraph / timeline_series。
//!
//! **信任域说明（与 sibling 工具的差异，读代码前必读）**：`sessions_search` /
//! `usage_hourly` 只读权威库、不接受路径；本工具接受调用方给的**本地文件路径**
//! 并读取它。这与 CLI `agent-vitals trace` 同一信任域（本 MCP server 本来就跑
//! 在用户本机、与 CLI 同权限），不是新增攻击面——但 description 里写明，别让
//! 远端 MCP 客户端误以为这是纯权威库查询。
//!
//! **memo**：MCP server 是常驻消费面——Phase 3 memo（60s TTL +
//! `(COUNT, MAX(rowid))` 失效）在这里首次有真实收益；同一会话被反复下钻时
//! 命中同一份 `Arc<TraceGraph>`，不重算。CLI（一次性进程）不走 memo。
//!
//! **parity（spec §7 门槛 3）**：`output=graph` 的 `data` 与
//! `agent-vitals trace <file> --host <h> --machine-namespace <ns> --json -`
//! 的输出必须相等——由 `tests/mcp_smoke.py` S6 块对真实 fixture 钉住。

use std::path::Path;

use serde_json::{json, Value};

use super::{
    authority_state_for, build_envelope, AuthorityHandle, ToolError, ToolSpec,
};
use agent_vitals_domain::contracts::r2a::SessionKey;
use agent_vitals_domain::domain::trace::project_timeline_series;
use agent_vitals_domain::evidence::Linearization;

pub fn spec() -> ToolSpec {
    ToolSpec {
        name: "session_trace",
        description: "Build the deterministic TraceGraph (or its timeline_series projection) \
for ONE caller-supplied local session file (unlike sibling tools, this READS A LOCAL FILE PATH \
passed in args — same trust domain as the `agent-vitals trace` CLI command, not an authority-only \
query). Nodes are ordered by (scope, ordinal), never by timestamp; missing parent/time/status are \
counted in coverage, never fabricated. Three-host closed vocabulary: claude-code / codex / dsh.",
        input_schema: json!({
            "type": "object",
            "properties": {
                "path": {
                    "type": "string",
                    "description": "Local path to a session file (jsonl; dsh accepts .zstd). Read as-is; no directory traversal."
                },
                "host": {
                    "type": "string",
                    "enum": ["claude-code", "codex", "dsh"],
                    "description": "Which host's wire format to parse."
                },
                "machine_namespace": {
                    "type": "string",
                    "description": "SessionKey machine namespace — REQUIRED (spec §9: identity segments are never invented)."
                },
                "source_profile": {
                    "type": "string",
                    "description": "SessionKey source profile (default: 'default')."
                },
                "output": {
                    "type": "string",
                    "enum": ["graph", "timeline_series"],
                    "description": "'graph' = full TraceGraph (byte-identical to the CLI's trace --json). 'timeline_series' = the projection consumed by the shared timeline geometry (buildGeometry), with an unplaced_events counter."
                }
            },
            "required": ["path", "host", "machine_namespace"],
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
    let path = args.get("path").and_then(Value::as_str)
        .ok_or_else(|| ToolError::new("invalid_argument", "`path` is required"))?;
    let host = args.get("host").and_then(Value::as_str)
        .ok_or_else(|| ToolError::new("invalid_argument", "`host` is required"))?;
    let ns = args.get("machine_namespace").and_then(Value::as_str).filter(|s| !s.is_empty())
        .ok_or_else(|| ToolError::new(
            "invalid_argument",
            "`machine_namespace` is required (spec §9: identity segments are never invented)",
        ))?;
    let source_profile = args.get("source_profile").and_then(Value::as_str).unwrap_or("default");
    let output = args.get("output").and_then(Value::as_str).unwrap_or("graph");
    if !matches!(output, "graph" | "timeline_series") {
        return Err(ToolError::new("invalid_argument", format!("unknown `output`: {output}")));
    }

    // 权威库只用来喂 envelope 元数据 + memo 的失效计数器——本工具的数据源是
    // 调用方给的文件，不是库。与 sibling 工具一致：打不开就报错（诚实，
    // 不静默降级成"无 envelope 的裸 JSON"破坏 envelope 形状契约）。
    let handle = AuthorityHandle::open(data_home)?;
    let conn = handle.conn();

    let native_id = std::path::Path::new(path)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("unknown")
        .to_string();
    let key = SessionKey::new(host, &native_id, source_profile, ns);

    let canonical = agent_vitals_hosts::canonical_input::canonical_session_for_path(
        std::path::Path::new(path),
        host,
    )
    .map_err(|e| ToolError::new("invalid_argument", format!("session source unavailable: {e}")))?;

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
            let unplaced = series.get("unplaced_events").and_then(Value::as_u64).unwrap_or(0);
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
            "host": host,
            "output": output,
            // coverage 语义：envelope 的 coverage 描述**这次查询**的完整度，
            // 与 TraceCoverage（图本身的诚实计数）分开——后者在 data.coverage。
            "trace": extra_coverage,
        }),
        Vec::new(),
        data,
    ))
}
