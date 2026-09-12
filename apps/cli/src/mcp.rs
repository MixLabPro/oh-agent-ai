//! Data MCP stdio 传输层（`docs/AGENT_VITALS_DATA_MCP_SPEC.md` §5.2 / §6.4）：
//! JSON-RPC 2.0 编解码 + method dispatch + 进程生命周期。**只做协议帧**——
//! 工具逻辑、envelope、错误码在 `agent_vitals_runtime::mcp`。
//!
//! 线协议（spec §6.4，M0 D1 冻结值）：
//! - protocol version `2025-06-18`（支持 `structuredContent`）。
//! - 逐行 JSON framing（`\n` 分隔，UTF-8，单条消息不跨行）。`stdout` 只出
//!   协议帧，日志走 `stderr`。
//! - 方法集：`initialize` / `notifications/initialized` / `tools/list` /
//!   `tools/call` / `ping`。`initialize` 之前只接受 `initialize`。
//! - 业务错误（库缺失 / 超时 / …）走 `tools/call` 结果的 `isError: true` +
//!   envelope 内 `error`，**不塞 JSON-RPC error**（否则客户端拿不到
//!   warnings/coverage）。协议层错误（未知方法 / 参数缺失）才用 JSON-RPC error。
//! - stdin EOF / 写 `stdout` 失败 → 冲刷 `stderr` + 退出 0。单连接串行。

use std::io::{BufRead, Write};

use serde_json::{json, Value};

use agent_vitals_runtime::mcp;

const PROTOCOL_VERSION: &str = "2025-06-18";
const SERVER_NAME: &str = "agent-vitals-data";

/// `agent-vitals data-mcp serve` 的入口。永不返回（stdin EOF → exit 0）。
pub fn serve(allow_local_writes: bool) -> ! {
    let data_home = agent_vitals_runtime::home::data_home();
    eprintln!(
        "data-mcp: serving on stdio (protocol {PROTOCOL_VERSION}, data_home {})",
        data_home.display()
    );
    let stdin = std::io::stdin();
    let stdout = std::io::stdout();
    run_loop_with_permissions(stdin.lock(), stdout.lock(), &data_home, allow_local_writes);
    eprintln!("data-mcp: stdin closed, exiting");
    std::process::exit(0);
}

/// 传输循环——读一行 JSON-RPC → 处理 → 写一帧，直到 `reader` EOF 或写失败。
/// 拆出来是为了让 `#[cfg(test)]` 用内存 reader/writer 驱动（`serve` 只是它 +
/// 真 stdio + `exit(0)`）。
#[cfg(test)]
pub(crate) fn run_loop(reader: impl BufRead, mut out: impl Write, data_home: &std::path::Path) {
    run_loop_with_permissions(reader, &mut out, data_home, false);
}

pub(crate) fn run_loop_with_permissions(
    reader: impl BufRead,
    mut out: impl Write,
    data_home: &std::path::Path,
    allow_local_writes: bool,
) {
    let mut initialized = false;

    for line in reader.lines() {
        let line = match line {
            Ok(l) => l,
            Err(e) => {
                eprintln!("data-mcp: stdin read error: {e}");
                break;
            }
        };
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }

        let msg: Value = match serde_json::from_str(trimmed) {
            Ok(v) => v,
            Err(e) => {
                write_frame(&mut out, &rpc_error(Value::Null, -32700, format!("parse error: {e}")));
                continue;
            }
        };

        let method = msg.get("method").and_then(Value::as_str).unwrap_or_default();
        let id = msg.get("id").cloned();

        // notification（无 id）：`notifications/initialized` 记状态，其余静默忽略。
        let Some(id) = id else {
            if method == "notifications/initialized" {
                initialized = true;
            }
            continue;
        };

        let params = msg.get("params").cloned().unwrap_or_else(|| json!({}));

        let response = if method == "initialize" {
            initialized = true;
            handle_initialize(id)
        } else if method == "ping" {
            rpc_ok(id, json!({}))
        } else if !initialized {
            rpc_error(id, -32002, "received request before `initialize`")
        } else {
            match method {
                "tools/list" => handle_tools_list(id),
                "tools/call" => handle_tools_call(id, &params, data_home, allow_local_writes),
                other => rpc_error(id, -32601, format!("method not found: {other}")),
            }
        };
        if !write_frame(&mut out, &response) {
            break; // 客户端断开（写 stdout 失败）→ 干净退出。
        }
    }

    let _ = out.flush();
}

fn handle_initialize(id: Value) -> Value {
    rpc_ok(
        id,
        json!({
            "protocolVersion": PROTOCOL_VERSION,
            "capabilities": { "tools": {} },
            "serverInfo": { "name": SERVER_NAME, "version": env!("CARGO_PKG_VERSION") },
        }),
    )
}

fn handle_tools_list(id: Value) -> Value {
    let tools: Vec<Value> = mcp::tool_specs()
        .iter()
        .map(|t| {
            json!({
                "name": t.name,
                "description": t.description,
                "inputSchema": t.input_schema,
                "outputSchema": t.output_schema,
            })
        })
        .collect();
    rpc_ok(id, json!({ "tools": tools }))
}

fn handle_tools_call(id: Value, params: &Value, data_home: &std::path::Path, allow_local_writes: bool) -> Value {
    let Some(name) = params.get("name").and_then(Value::as_str) else {
        return rpc_error(id, -32602, "tools/call requires a string `name`");
    };
    if !mcp::tool_specs().iter().any(|t| t.name == name) {
        return rpc_error(id, -32602, format!("unknown tool: {name}"));
    }
    let args = params.get("arguments").cloned().unwrap_or_else(|| json!({}));

    let (structured, is_error) = match mcp::dispatch_with_permissions(name, &args, data_home, allow_local_writes) {
        Ok(envelope) => (envelope, false),
        Err(err) => {
            eprintln!("data-mcp: tool {name} error [{}]: {}", err.code, err.message);
            (mcp::error_envelope(&err), true)
        }
    };
    let text = serde_json::to_string_pretty(&structured).unwrap_or_default();
    rpc_ok(
        id,
        json!({
            "content": [{ "type": "text", "text": text }],
            "structuredContent": structured,
            "isError": is_error,
        }),
    )
}

fn rpc_ok(id: Value, result: Value) -> Value {
    json!({ "jsonrpc": "2.0", "id": id, "result": result })
}

fn rpc_error(id: Value, code: i64, message: impl Into<String>) -> Value {
    json!({ "jsonrpc": "2.0", "id": id, "error": { "code": code, "message": message.into() } })
}

/// 写一帧 + flush。返回 false = 写失败（客户端断开）。
fn write_frame(out: &mut impl Write, v: &Value) -> bool {
    let line = serde_json::to_string(v).unwrap_or_else(|_| "{}".into());
    out.write_all(line.as_bytes()).is_ok()
        && out.write_all(b"\n").is_ok()
        && out.flush().is_ok()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Cursor;

    /// 把一串请求喂给 `run_loop`，返回逐帧解析的响应。
    fn drive(reqs: &[Value], data_home: &std::path::Path) -> Vec<Value> {
        let input = reqs
            .iter()
            .map(|r| serde_json::to_string(r).unwrap())
            .collect::<Vec<_>>()
            .join("\n");
        let mut out: Vec<u8> = Vec::new();
        run_loop(Cursor::new(input.into_bytes()), &mut out, data_home);
        // stdout 纪律：每行必须是合法 JSON（M18「stdout 无非协议帧」）。
        String::from_utf8(out)
            .unwrap()
            .lines()
            .filter(|l| !l.trim().is_empty())
            .map(|l| serde_json::from_str(l).expect("every stdout line is a JSON frame"))
            .collect()
    }

    fn init() -> Value {
        json!({ "jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {} })
    }

    fn tmp_home(tag: &str) -> std::path::PathBuf {
        std::env::temp_dir().join(format!(
            "avmcp-tx-{tag}-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ))
    }

    fn seed_empty_db(home: &std::path::Path) {
        std::fs::create_dir_all(home).unwrap();
        let path = agent_vitals_data::authority::default_authority_path(home);
        agent_vitals_data::authority::AuthorityDb::open(&path, 1_700_000_000_000).unwrap();
    }

    #[test]
    fn initialize_reports_protocol_and_tools_capability() {
        let home = tmp_home("init");
        let out = drive(&[init()], &home);
        assert_eq!(out.len(), 1);
        assert_eq!(out[0]["jsonrpc"], "2.0");
        assert_eq!(out[0]["id"], 1);
        assert_eq!(out[0]["result"]["protocolVersion"], PROTOCOL_VERSION);
        assert!(out[0]["result"]["capabilities"]["tools"].is_object());
        assert!(out[0]["result"]["capabilities"].get("resources").is_none());
        assert_eq!(out[0]["result"]["serverInfo"]["name"], SERVER_NAME);
    }

    #[test]
    fn request_before_initialize_is_rejected() {
        let home = tmp_home("preinit");
        let out = drive(
            &[json!({ "jsonrpc": "2.0", "id": 7, "method": "tools/list" })],
            &home,
        );
        assert_eq!(out[0]["error"]["code"], -32002);
    }

    #[test]
    fn ping_works_before_and_after_initialize() {
        let home = tmp_home("ping");
        let out = drive(
            &[
                json!({ "jsonrpc": "2.0", "id": 1, "method": "ping" }),
                init(),
                json!({ "jsonrpc": "2.0", "id": 3, "method": "ping" }),
            ],
            &home,
        );
        assert_eq!(out[0]["result"], json!({}));
        assert_eq!(out[2]["result"], json!({}));
    }

    #[test]
    fn tools_list_carries_schemas() {
        let home = tmp_home("list");
        let out = drive(
            &[init(), json!({ "jsonrpc": "2.0", "id": 2, "method": "tools/list" })],
            &home,
        );
        let tools = out[1]["result"]["tools"].as_array().unwrap();
        let ds = tools.iter().find(|t| t["name"] == "data_status").unwrap();
        assert!(ds["description"].as_str().unwrap().len() > 20);
        assert_eq!(ds["inputSchema"]["type"], "object");
        assert_eq!(ds["inputSchema"]["additionalProperties"], json!(false));
        assert!(ds["outputSchema"].is_object());
    }

    #[test]
    fn unknown_method_is_jsonrpc_method_not_found() {
        let home = tmp_home("unknown");
        let out = drive(
            &[init(), json!({ "jsonrpc": "2.0", "id": 2, "method": "frobnicate" })],
            &home,
        );
        assert_eq!(out[1]["error"]["code"], -32601);
    }

    #[test]
    fn parse_error_yields_32700_with_null_id() {
        let home = tmp_home("parse");
        let mut out: Vec<u8> = Vec::new();
        run_loop(Cursor::new(b"{ not json\n".to_vec()), &mut out, &home);
        let frame: Value = serde_json::from_str(String::from_utf8(out).unwrap().trim()).unwrap();
        assert_eq!(frame["error"]["code"], -32700);
        assert_eq!(frame["id"], Value::Null);
    }

    #[test]
    fn tools_call_data_status_on_missing_db_is_business_error_not_jsonrpc_error() {
        let home = tmp_home("call-missing"); // no DB seeded
        let out = drive(
            &[
                init(),
                json!({ "jsonrpc": "2.0", "id": 2, "method": "tools/call",
                        "params": { "name": "data_status", "arguments": {} } }),
            ],
            &home,
        );
        // 成功的 JSON-RPC 响应，但 isError:true + envelope 里 error（spec §6.4）。
        assert!(out[1]["result"].is_object());
        assert!(out[1].get("error").is_none());
        assert_eq!(out[1]["result"]["isError"], true);
        assert_eq!(
            out[1]["result"]["structuredContent"]["error"]["code"],
            "database_missing"
        );
    }

    #[test]
    fn tools_call_data_status_on_empty_db_returns_envelope() {
        let home = tmp_home("call-empty");
        seed_empty_db(&home);
        let out = drive(
            &[
                init(),
                json!({ "jsonrpc": "2.0", "id": 2, "method": "tools/call",
                        "params": { "name": "data_status", "arguments": {} } }),
            ],
            &home,
        );
        let sc = &out[1]["result"]["structuredContent"];
        assert_eq!(out[1]["result"]["isError"], false);
        assert_eq!(sc["schema_version"], "1");
        assert_eq!(sc["timezone"], "Asia/Shanghai");
        assert_eq!(sc["authority_state"], "candidate");
        assert_eq!(sc["data"]["facts"], 0);
        // content 文本块与 structuredContent 同源（spec §6.4）。
        let text = out[1]["result"]["content"][0]["text"].as_str().unwrap();
        let reparsed: Value = serde_json::from_str(text).unwrap();
        assert_eq!(&reparsed, sc);
        let _ = std::fs::remove_dir_all(&home);
    }

    #[test]
    fn tools_call_unknown_tool_is_invalid_params() {
        let home = tmp_home("call-unknown");
        let out = drive(
            &[
                init(),
                json!({ "jsonrpc": "2.0", "id": 2, "method": "tools/call",
                        "params": { "name": "nope", "arguments": {} } }),
            ],
            &home,
        );
        assert_eq!(out[1]["error"]["code"], -32602);
    }

    #[test]
    fn tools_call_with_unknown_argument_is_business_error() {
        let home = tmp_home("call-badarg");
        seed_empty_db(&home);
        let out = drive(
            &[
                init(),
                json!({ "jsonrpc": "2.0", "id": 2, "method": "tools/call",
                        "params": { "name": "data_status", "arguments": { "x": 1 } } }),
            ],
            &home,
        );
        assert_eq!(out[1]["result"]["isError"], true);
        assert_eq!(
            out[1]["result"]["structuredContent"]["error"]["code"],
            "invalid_argument"
        );
        let _ = std::fs::remove_dir_all(&home);
    }

    #[test]
    fn notifications_are_absorbed_without_a_frame() {
        let home = tmp_home("notif");
        let out = drive(
            &[
                init(),
                json!({ "jsonrpc": "2.0", "method": "notifications/initialized" }),
                json!({ "jsonrpc": "2.0", "method": "notifications/something-else" }),
                json!({ "jsonrpc": "2.0", "id": 9, "method": "ping" }),
            ],
            &home,
        );
        // 2 帧：initialize 的响应 + ping 的响应；两个 notification 无响应。
        assert_eq!(out.len(), 2);
        assert_eq!(out[1]["id"], 9);
    }
}
