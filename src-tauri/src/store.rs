//! R2a SessionStore 的 Tauri IPC 薄壳（docs/R2A_CONTRACT_DESIGN.md §6.3-7）。
//!
//! 纯查询逻辑在 `agent_vitals_core::r2a`（core crate，单一真相源），I/O 在二进制
//! crate 的 `src/agent/r2a_store.rs`。src-tauri 是**独立 workspace**，import 不到
//! 二进制 crate 的模块——所以 `sessions list` / `sessions read` 与 tick 的
//! `oneline` 同款：**spawn `agent-vitals` 二进制**，stdout 就是 versioned
//! list DTO / envelope JSON，stderr 是类型化错误 JSON（`{"error":{"code",
//! "message"}}`）。这是「不长第二份拷贝」的唯一路径（CLAUDE.md 的写右边界：
//! 计算在宿主，浏览器/前端只渲染投影）。
//!
//! IPC 面只做参数翻译与 spawn：
//!   · `sessions_list(host_kind, model, date_from, date_to, query, page_size,
//!      cursor) -> Result<Value, Value>`
//!   · `sessions_read(session_key, revision) -> Result<Value, Value>`
//! 错误码原样透传：`not-found` / `permission` / `stale-revision` /
//! `schema-mismatch` / `source-unavailable` / `cancelled`。二进制缺失/ spawn 失败
//! 这类**基础设施失败**也用 `cancelled`（code 集固定，不另造新码）。

use std::process::Command;

use serde_json::{Value, json};

use crate::overview::data_home;
use crate::resolve_binary;

fn error_value(code: &str, message: &str) -> Value {
    json!({ "error": { "code": code, "message": message } })
}

fn no_binary() -> Value {
    error_value(
        "cancelled",
        "agent-vitals binary not found (set AGENT_VITALS_BIN or put it on PATH)",
    )
}

/// `sessions list` 的 argv（纯函数，供单测钉住 IPC→CLI 参数映射）。空 filter →
/// 只有固定段；page_size 缺省由二进制兜底（50），IPC 不替它拍默认值。
fn list_args(
    host_kind: &Option<String>,
    model: &Option<String>,
    date_from: &Option<String>,
    date_to: &Option<String>,
    query: &Option<String>,
    page_size: Option<usize>,
    cursor: &Option<String>,
) -> Vec<String> {
    let mut a: Vec<String> = vec![
        "sessions".into(),
        "list".into(),
        "--json".into(),
    ];
    if let Some(h) = host_kind {
        a.push("--host-kind".into());
        a.push(h.clone());
    }
    if let Some(m) = model {
        a.push("--model".into());
        a.push(m.clone());
    }
    if let Some(f) = date_from {
        a.push("--from".into());
        a.push(f.clone());
    }
    if let Some(t) = date_to {
        a.push("--to".into());
        a.push(t.clone());
    }
    if let Some(q) = query {
        a.push("--query".into());
        a.push(q.clone());
    }
    if let Some(p) = page_size {
        a.push("--page-size".into());
        a.push(p.to_string());
    }
    if let Some(c) = cursor {
        a.push("--cursor".into());
        a.push(c.clone());
    }
    a
}

/// `sessions read` 的 argv。
fn read_args(session_key: &str, revision: &Option<String>) -> Vec<String> {
    let mut a: Vec<String> = vec![
        "sessions".into(),
        "read".into(),
        "--session-key".into(),
        session_key.to_string(),
        "--json".into(),
    ];
    if let Some(r) = revision {
        a.push("--revision".into());
        a.push(r.clone());
    }
    a
}

/// spawn 二进制并解析 stdout。非零退出 → 若 stderr 是 `{"error":…}` 形状则原样
/// 透传（类型化错误码不丢）；否则包成 `cancelled`。spawn/解析失败 → `cancelled`。
fn run_json(mut cmd: Command) -> Result<Value, Value> {
    let out = cmd
        .output()
        .map_err(|e| error_value("cancelled", &e.to_string()))?;
    if !out.status.success() {
        if let Ok(v) = serde_json::from_slice::<Value>(&out.stderr) {
            if v.get("error").is_some() {
                return Err(v);
            }
        }
        return Err(error_value(
            "cancelled",
            &String::from_utf8_lossy(&out.stderr),
        ));
    }
    serde_json::from_slice(&out.stdout)
        .map_err(|e| error_value("cancelled", &e.to_string()))
}

/// list_sessions：filter + cursor 分页 → versioned list DTO（§2.5/§3.3）。
#[tauri::command]
pub fn sessions_list(
    host_kind: Option<String>,
    model: Option<String>,
    date_from: Option<String>,
    date_to: Option<String>,
    query: Option<String>,
    page_size: Option<usize>,
    cursor: Option<String>,
) -> Result<Value, Value> {
    let Some(bin) = resolve_binary() else {
        return Err(no_binary());
    };
    let args = list_args(&host_kind, &model, &date_from, &date_to, &query,
                         page_size, &cursor);
    let mut cmd = Command::new(&bin);
    cmd.args(&args);
    // 与 tick 同款：显式钉死 AGENT_VITALS_HOME，cache/machine.json 落在 app
    // 自己的数据根，不依赖子进程继承的环境。
    cmd.env("AGENT_VITALS_HOME", data_home());
    run_json(cmd)
}

/// read_session：session_key（+ 可选 revision）→ 完整 versioned envelope（§2.1）。
#[tauri::command]
pub fn sessions_read(
    session_key: Value,
    revision: Option<String>,
) -> Result<Value, Value> {
    let Some(bin) = resolve_binary() else {
        return Err(no_binary());
    };
    let key_json = serde_json::to_string(&session_key)
        .map_err(|e| error_value("cancelled", &e.to_string()))?;
    let args = read_args(&key_json, &revision);
    let mut cmd = Command::new(&bin);
    cmd.args(&args);
    cmd.env("AGENT_VITALS_HOME", data_home());
    run_json(cmd)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// 空 filter → 固定段（无多余 flag）；全字段 → 按序全出。这是 IPC 薄壳的
    /// 全部职责——参数翻译不对，前端点得再准也打到错命令上。
    #[test]
    fn list_args_empty_and_full() {
        let none = &None;
        assert_eq!(list_args(none, none, none, none, none, None, none),
                   vec!["sessions", "list", "--json"]);
        let some = &Some("x".to_string());
        assert_eq!(
            list_args(some, some, some, some, some, Some(7),
                      &Some("c".to_string())),
            vec!["sessions", "list", "--json",
                 "--host-kind", "x", "--model", "x", "--from", "x",
                 "--to", "x", "--query", "x", "--page-size", "7",
                 "--cursor", "c"]
        );
    }

    /// read argv：key 必带 + revision 可选。
    #[test]
    fn read_args_with_and_without_revision() {
        let none = &None;
        assert_eq!(
            read_args("{\"native_id\":\"s1\"}", none),
            vec!["sessions", "read", "--session-key", "{\"native_id\":\"s1\"}",
                 "--json"]
        );
        assert_eq!(
            read_args("k", &Some("2026-08-30".to_string())),
            vec!["sessions", "read", "--session-key", "k", "--json",
                 "--revision", "2026-08-30"]
        );
    }

    /// 错误形状：`cancelled` 的 message 明确（二进制缺失是基础设施失败，不是
    /// 会话源的缺列）。
    #[test]
    fn no_binary_error_shape_is_typed() {
        assert_eq!(
            no_binary(),
            json!({"error": {"code": "cancelled",
                             "message": "agent-vitals binary not found (set \
                                         AGENT_VITALS_BIN or put it on PATH)"}})
        );
    }
}
