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
//!
//! 三个命令都是 **async + `spawn_blocking`**：冷启动的 store 构建（两源 631MB /
//! 115 文件，30s+）不能占住主线程——同步 `cmd.output()` 会把 Tauri 主线程冻住
//! 十几秒，托盘点击排队、切 tab 假死（真机 2026-09 的「点会话 tab 卡住」根因）。
//! `spawn_blocking` 让 CLI 子进程在阻塞线程池里跑，主线程继续收托盘事件。

use std::process::Command;
use std::sync::{Arc, Mutex};

use serde_json::{Value, json};

use crate::overview::data_home;
use crate::resolve_binary;

/// R2a 冷构建的 app 内串行锁。`sessions_*` 都是 spawn CLI 子进程，后台预热与
/// 用户点击可能并发各起一个——两份冷构建互抢 I/O、双倍付冷启动钱。原子写
/// （temp+rename）防的是「读半截 cache」，这把锁防的是「重复冷构建」：后到的
/// 构建等在锁外，前一个写完 cache 再进，直接走命中快路径。
#[derive(Clone)]
pub struct StoreBuildLock(pub Arc<Mutex<()>>);

impl StoreBuildLock {
    pub fn new() -> Self {
        Self(Arc::new(Mutex::new(())))
    }

    pub(crate) fn acquire(&self) -> std::sync::MutexGuard<'_, ()> {
        self.0.lock().unwrap_or_else(|e| e.into_inner())
    }
}

fn error_value(code: &str, message: &str) -> Value {
    json!({ "error": { "code": code, "message": message } })
}

fn no_binary() -> Value {
    error_value(
        "cancelled",
        "agent-vitals binary not found (set AGENT_VITALS_BIN, add it to PATH, or place it in the app's Contents/Resources/bin/)",
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

/// `sessions findings` 的 argv（纯函数，供单测钉住 IPC→CLI 参数映射）。无参数——
/// rollup 恒是全源聚合，跟 list 的 filter/cursor 无关。
fn findings_args() -> Vec<String> {
    vec!["sessions".into(), "findings".into(), "--json".into()]
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
/// async：CLI 冷构建 30s+ 不能占主线程，见模块头注释。
///
/// `#[allow(clippy::too_many_arguments)]`：这是 Tauri IPC 面，参数扁平是
/// 契约的一部分——`workbench.js` 的 invoke 调用面就是这七个扁平 filter，
/// 改成分组结构要连带改前端调用面，为一个 lint 不值。
#[allow(clippy::too_many_arguments)]
#[tauri::command]
pub async fn sessions_list(
    state: tauri::State<'_, StoreBuildLock>,
    host_kind: Option<String>,
    model: Option<String>,
    date_from: Option<String>,
    date_to: Option<String>,
    query: Option<String>,
    page_size: Option<usize>,
    cursor: Option<String>,
) -> Result<Value, Value> {
    let lock = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = lock.acquire();
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
    })
    .await
    .map_err(|e| error_value("cancelled", &e.to_string()))?
}

/// read_session：session_key（+ 可选 revision）→ 完整 versioned envelope（§2.1）。
/// async：会话读取依赖同一份冷构建，走同一把锁 + spawn_blocking。
#[tauri::command]
pub async fn sessions_read(
    state: tauri::State<'_, StoreBuildLock>,
    session_key: Value,
    revision: Option<String>,
) -> Result<Value, Value> {
    let lock = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = lock.acquire();
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
    })
    .await
    .map_err(|e| error_value("cancelled", &e.to_string()))?
}

/// aggregate_findings：跨会话 findings 汇总（workbench「Findings」页）。纯聚合在
/// core + 二进制（`sessions findings --json`），IPC 只做 spawn + 透传，与
/// `sessions_list` 同款。async：见模块头注释。
#[tauri::command]
pub async fn sessions_findings(
    state: tauri::State<'_, StoreBuildLock>,
) -> Result<Value, Value> {
    let lock = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = lock.acquire();
        let Some(bin) = resolve_binary() else {
            return Err(no_binary());
        };
        let mut cmd = Command::new(&bin);
        cmd.args(findings_args());
        cmd.env("AGENT_VITALS_HOME", data_home());
        run_json(cmd)
    })
    .await
    .map_err(|e| error_value("cancelled", &e.to_string()))?
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

    /// findings argv：固定段，无参数（rollup 恒全源聚合，跟 filter/cursor 无关）。
    #[test]
    fn findings_args_is_fixed() {
        assert_eq!(findings_args(), vec!["sessions", "findings", "--json"]);
    }

    /// 错误形状：`cancelled` 的 message 明确（二进制缺失是基础设施失败，不是
    /// 会话源的缺列）。
    #[test]
    fn no_binary_error_shape_is_typed() {
        assert_eq!(
            no_binary(),
            json!({"error": {"code": "cancelled",
                             "message": "agent-vitals binary not found (set AGENT_VITALS_BIN, \
                                         add it to PATH, or place it in the app's \
                                         Contents/Resources/bin/)"}})
        );
    }

    /// run_json 成功路径：spawn 真实子进程 → stdout 是 JSON → 原样解析。IPC
    /// 薄壳的全部行为就是「spawn 二进制 + 解析 stdout + 透传错误」，这三条用例
    /// 钉住 spawn/解析这一层——参数翻译（上面两条）对了、spawn/解析不对，前端点得
    /// 再准也拿不到数据。
    #[test]
    fn run_json_parses_success_stdout() {
        let mut cmd = Command::new("echo");
        cmd.arg("{\"a\":1}");
        assert_eq!(run_json(cmd), Ok(json!({"a": 1})));
    }

    /// 非零退出 + stderr 是类型化错误 JSON → 原样透传（错误码不丢、不被包成
    /// cancelled）。这依赖 spawn 的退出码 + stderr——正是真实二进制报
    /// `not-found` / `source-unavailable` 的路径。
    #[test]
    fn run_json_passes_through_typed_stderr() {
        let mut cmd = Command::new("sh");
        cmd.args(["-c",
                  "echo '{\"error\":{\"code\":\"not-found\",\"message\":\"m\"}}' \
                   >&2; exit 2"]);
        assert_eq!(run_json(cmd),
                   Err(json!({"error": {"code": "not-found", "message": "m"}})));
    }

    /// 非零退出 + stderr **不是** `{"error":…}` 形状 → 包成 cancelled（code 集固定，
    /// 不另造新码），message 带原始 stderr，不能丢成空的。
    #[test]
    fn run_json_wraps_non_json_stderr_as_cancelled() {
        let mut cmd = Command::new("sh");
        cmd.args(["-c", "echo plain-failure >&2; exit 1"]);
        match run_json(cmd) {
            Err(v) => {
                assert_eq!(v["error"]["code"], "cancelled");
                assert_eq!(v["error"]["message"], "plain-failure\n");
            }
            Ok(_) => panic!("non-zero exit must be an Err"),
        }
    }

    /// spawn 本身失败（二进制不存在）→ cancelled（基础设施失败，不是会话源的
    /// 缺列——§6.3-7 的 code 集固定）。
    #[test]
    fn run_json_spawn_failure_is_cancelled() {
        let cmd = Command::new("definitely-not-a-real-binary-xyz");
        match run_json(cmd) {
            Err(v) => assert_eq!(v["error"]["code"], "cancelled"),
            Ok(_) => panic!("missing binary must be an Err"),
        }
    }
}
