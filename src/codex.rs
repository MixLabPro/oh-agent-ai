//! Codex 运行时目录：通过 `codex app-server` 的 `skills/list` 拿权威清单。
//!
//! 这是唯一一个能给出「宿主真的看见了哪些 skill」的官方接口，
//! 因此它的结果覆盖磁盘推断（`runtime_verified: true`）。
//!
//! **可测性说明。**子进程 + JSON-RPC 的成功路径依赖本机装着 Codex，
//! 无法在 CI 或没装 Codex 的开发机上验证。故把**能测的部分抽成纯函数**：
//! 消息构造与响应解析都不碰进程，由下面的单元测试用录制的报文覆盖；
//! 不可测的只剩管道本身。失败路径（找不到可执行文件、超时、非法 JSON）
//! 一律降级为 errors 里的一条，**绝不 panic、绝不无限等待**。

use std::io::{BufRead, BufReader, Write};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::mpsc;
use std::time::Duration;

use serde_json::{json, Value};

use crate::util::norm;

pub struct CodexRuntime {
    pub available: bool,
    pub cwd: String,
    pub skills: Vec<Value>,
    pub errors: Vec<String>,
    /// 实际跑的那个可执行文件。不进 JSON 输出（Python 侧同样不进），
    /// 但排查「装了两个 codex，跑的是哪个」时是唯一线索，故保留。
    #[allow(dead_code)]
    pub executable: Option<String>,
}

impl CodexRuntime {
    fn failed(cwd: String, err: impl Into<String>) -> Self {
        CodexRuntime {
            available: false,
            cwd,
            skills: Vec::new(),
            errors: vec![err.into()],
            executable: None,
        }
    }
}

/// 在 PATH 上找 codex。优先原生二进制：npm 的 `.cmd` shim 在重定向 stdio 下
/// 可能脱离父进程，导致读不到任何输出。
fn find_codex_executable() -> Option<PathBuf> {
    let path = std::env::var_os("PATH")?;
    let names: &[&str] = if cfg!(windows) {
        &["codex.exe", "codex.cmd", "codex"]
    } else {
        &["codex"]
    };
    for name in names {
        for dir in std::env::split_paths(&path) {
            let candidate = dir.join(name);
            if candidate.is_file() {
                return Some(candidate);
            }
        }
    }
    None
}

/// 构造三条 app-server 报文。抽出来是为了能单独测。
pub fn protocol_messages(cwd: &str) -> Vec<Value> {
    vec![
        json!({"method": "initialize", "id": 1, "params": {"clientInfo": {
            "name": "agent-vitals", "title": "Agent Vitals", "version": "0.1.0"}}}),
        json!({"method": "initialized", "params": {}}),
        json!({"method": "skills/list", "id": 2, "params": {
            "cwds": [cwd], "forceReload": true}}),
    ]
}

fn write_message(stdin: &mut impl Write, message: &Value) -> Result<(), String> {
    serde_json::to_writer(&mut *stdin, message)
        .map_err(|e| format!("app-server request serialization failed: {}", e))?;
    stdin
        .write_all(b"\n")
        .and_then(|_| stdin.flush())
        .map_err(|e| format!("app-server stdin write failed: {}", e))
}

/// 等待指定 JSON-RPC 请求的响应。Codex 要求 initialize 完成后才能接收
/// initialized/skills/list，因此不能只等待最终的 id=2。
fn wait_for_response(
    rx: &mpsc::Receiver<String>,
    id: i64,
    timeout: Duration,
) -> Result<(), String> {
    let deadline = std::time::Instant::now() + timeout;
    loop {
        let remaining = deadline.saturating_duration_since(std::time::Instant::now());
        if remaining.is_zero() {
            return Err(format!("app-server request {} timed out", id));
        }
        match rx.recv_timeout(remaining.min(Duration::from_millis(250))) {
            Ok(line) => {
                let msg = match serde_json::from_str::<Value>(&line) {
                    Ok(v) => v,
                    Err(_) => continue,
                };
                if msg.get("id").and_then(|v| v.as_i64()) != Some(id) {
                    continue;
                }
                if let Some(error) = msg.get("error").filter(|v| !v.is_null()) {
                    return Err(format!("app-server request {} failed: {}", id, error));
                }
                return Ok(());
            }
            Err(mpsc::RecvTimeoutError::Disconnected) => {
                return Err(format!("app-server closed before response {}", id));
            }
            Err(mpsc::RecvTimeoutError::Timeout) => continue,
        }
    }
}

/// 从 app-server 的输出行里取出 skills/list 的结果。**纯函数，可测。**
///
/// 只收 `cwd` 与请求一致的那些条目 —— app-server 可以一次返回多个工作目录，
/// 混进来的会让清点数字凭空变大。
pub fn parse_skills_list(lines: &[String], cwd_n: &str) -> Result<(Vec<Value>, Vec<String>), String> {
    let mut response: Option<Value> = None;
    for line in lines {
        let msg: Value = match serde_json::from_str(line) {
            Ok(v) => v,
            Err(_) => continue, // 非 JSON 行（日志等）跳过，不是错误
        };
        if msg.get("id").and_then(|v| v.as_i64()) == Some(2) {
            response = Some(msg);
            break;
        }
    }
    let response = response.ok_or_else(|| "no skills/list response".to_string())?;
    if let Some(err) = response.get("error") {
        if !err.is_null() {
            return Err(err.to_string());
        }
    }
    let mut skills = Vec::new();
    let mut errors = Vec::new();
    if let Some(entries) = response
        .get("result")
        .and_then(|r| r.get("data"))
        .and_then(|d| d.as_array())
    {
        for entry in entries {
            let entry_cwd = entry.get("cwd").and_then(|v| v.as_str()).unwrap_or("");
            if norm(Path::new(entry_cwd)) != cwd_n {
                continue;
            }
            if let Some(list) = entry.get("skills").and_then(|v| v.as_array()) {
                skills.extend(list.iter().cloned());
            }
            if let Some(list) = entry.get("errors").and_then(|v| v.as_array()) {
                errors.extend(list.iter().map(|e| match e.as_str() {
                    Some(s) => s.to_string(),
                    None => e.to_string(),
                }));
            }
        }
    }
    Ok((skills, errors))
}

pub fn read_codex_runtime(cwd: &Path, timeout: Duration) -> CodexRuntime {
    let cwd_abs = cwd.canonicalize().unwrap_or_else(|_| cwd.to_path_buf());
    let cwd_n = norm(&cwd_abs);

    let exe = match find_codex_executable() {
        Some(e) => e,
        None => return CodexRuntime::failed(cwd_n, "codex executable not found"),
    };

    let mut child = match Command::new(&exe)
        .args(["app-server", "--stdio"])
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .current_dir(&cwd_abs)
        .spawn()
    {
        Ok(c) => c,
        Err(e) => return CodexRuntime::failed(cwd_n, format!("app-server failed: {}", e)),
    };

    let stdout = match child.stdout.take() {
        Some(s) => s,
        None => {
            let _ = child.kill();
            return CodexRuntime::failed(cwd_n, "app-server produced no stdout");
        }
    };

    // 读取放在独立线程里，主线程只等信号 —— 否则 app-server 不退出就永远读不完。
    let (tx, rx) = mpsc::channel::<String>();
    let reader = std::thread::spawn(move || {
        let mut collected = Vec::new();
        for line in BufReader::new(stdout).lines().map_while(Result::ok) {
            let is_response_2 = serde_json::from_str::<Value>(&line)
                .ok()
                .and_then(|v| v.get("id").and_then(|x| x.as_i64()))
                == Some(2);
            collected.push(line.clone());
            let _ = tx.send(line);
            if is_response_2 {
                break;
            }
        }
        collected
    });

    let messages = protocol_messages(&cwd_n);
    let protocol_result = match child.stdin.take() {
        Some(mut stdin) => {
            // app-server 是有状态协议：必须先完成 initialize 握手。
            let result = write_message(&mut stdin, &messages[0])
                .and_then(|_| wait_for_response(&rx, 1, timeout.min(Duration::from_secs(5))))
                .and_then(|_| write_message(&mut stdin, &messages[1]))
                .and_then(|_| write_message(&mut stdin, &messages[2]))
                .and_then(|_| wait_for_response(&rx, 2, timeout));
            // 请求完成或失败后再关闭；提前 EOF 会让部分版本的 app-server 收尾。
            drop(stdin);
            result
        }
        None => Err("app-server produced no stdin".to_string()),
    };

    let _ = child.kill();
    let _ = child.wait();
    let lines = reader.join().unwrap_or_default();

    if let Err(e) = protocol_result {
        return CodexRuntime::failed(cwd_n, e);
    }

    match parse_skills_list(&lines, &cwd_n) {
        Ok((skills, errors)) => CodexRuntime {
            available: true,
            cwd: cwd_n,
            skills,
            errors,
            executable: Some(norm(&exe)),
        },
        Err(e) => CodexRuntime::failed(cwd_n, e),
    }
}

/// 用运行时元数据覆盖磁盘推断，并补上只在运行时可见的 skill。
pub fn apply_codex_runtime(
    skills: &mut Vec<Value>,
    runtime: &CodexRuntime,
    scan_one: impl Fn(&Path) -> Option<Value>,
) {
    for meta in &runtime.skills {
        let md = match meta.get("path").and_then(|v| v.as_str()) {
            Some(p) if Path::new(p).is_file() => PathBuf::from(p),
            _ => continue,
        };
        let dir = match md.parent() {
            Some(d) => d.to_path_buf(),
            None => continue,
        };
        let dir_n = norm(&dir.canonicalize().unwrap_or_else(|_| dir.clone()));

        let idx = skills.iter().position(|s| {
            s.get("host_family").and_then(|v| v.as_str()) == Some("codex")
                && s.get("path")
                    .and_then(|v| v.as_str())
                    .map(|p| norm(&Path::new(p).canonicalize().unwrap_or_else(|_| PathBuf::from(p))))
                    .as_deref()
                    == Some(dir_n.as_str())
        });
        let idx = match idx {
            Some(i) => i,
            None => match scan_one(&dir) {
                Some(rec) => {
                    skills.push(rec);
                    skills.len() - 1
                }
                None => continue,
            },
        };

        let rec = &mut skills[idx];
        let enabled = meta.get("enabled").and_then(|v| v.as_bool()).unwrap_or(true);
        if let Some(v) = meta.get("name").cloned() {
            rec["name"] = v;
        }
        if let Some(v) = meta.get("description").and_then(|v| v.as_str()) {
            rec["description"] = json!(v);
            rec["description_chars"] = json!(v.chars().count());
        }
        rec["loaded"] = json!(enabled);
        rec["loaded_reason"] = json!(if enabled {
            "codex-app-server-enabled"
        } else {
            "codex-app-server-disabled"
        });
        if let Some(v) = meta.get("scope").cloned() {
            rec["level"] = v;
        }
        rec["codex_scope"] = meta.get("scope").cloned().unwrap_or(Value::Null);
        rec["codex_interface"] = meta.get("interface").cloned().unwrap_or(Value::Null);
        rec["codex_dependencies"] = meta.get("dependencies").cloned().unwrap_or(Value::Null);
        rec["runtime_verified"] = json!(true);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn lines(v: &[&str]) -> Vec<String> {
        v.iter().map(|s| s.to_string()).collect()
    }

    #[test]
    fn protocol_shape() {
        let m = protocol_messages("/w");
        assert_eq!(m.len(), 3);
        assert_eq!(m[0]["method"], "initialize");
        assert_eq!(m[2]["method"], "skills/list");
        assert_eq!(m[2]["params"]["cwds"][0], "/w");
        assert_eq!(m[2]["params"]["forceReload"], true);
    }

    #[test]
    fn picks_the_matching_cwd_only() {
        // app-server 可以一次返回多个工作目录；混进来的会让清点数字凭空变大
        let l = lines(&[
            r#"{"id":1,"result":{}}"#,
            r#"{"id":2,"result":{"data":[
                {"cwd":"/other","skills":[{"name":"nope"}],"errors":[]},
                {"cwd":"/w","skills":[{"name":"yes"}],"errors":["boom"]}]}}"#,
        ]);
        let (skills, errors) = parse_skills_list(&l, "/w").unwrap();
        assert_eq!(skills.len(), 1);
        assert_eq!(skills[0]["name"], "yes");
        assert_eq!(errors, vec!["boom".to_string()]);
    }

    #[test]
    fn non_json_lines_are_skipped_not_fatal() {
        let l = lines(&[
            "starting app-server...",
            "",
            r#"{"id":2,"result":{"data":[{"cwd":"/w","skills":[]}]}}"#,
        ]);
        assert!(parse_skills_list(&l, "/w").is_ok());
    }

    #[test]
    fn missing_response_is_an_error_not_an_empty_success() {
        // 「没拿到响应」必须报错，绝不能当成「拿到了，是空的」——
        // 后者会让报告说「Codex 一个 skill 都没有」，那是编造证据。
        let l = lines(&[r#"{"id":1,"result":{}}"#]);
        assert!(parse_skills_list(&l, "/w").is_err());
    }

    #[test]
    fn protocol_error_is_propagated() {
        let l = lines(&[r#"{"id":2,"error":{"code":-1,"message":"nope"}}"#]);
        assert!(parse_skills_list(&l, "/w").is_err());
    }

    #[test]
    fn empty_result_for_matching_cwd_is_a_real_empty() {
        let l = lines(&[r#"{"id":2,"result":{"data":[{"cwd":"/w","skills":[],"errors":[]}]}}"#]);
        let (skills, errors) = parse_skills_list(&l, "/w").unwrap();
        assert!(skills.is_empty() && errors.is_empty());
    }

    #[test]
    fn missing_executable_degrades_without_panic() {
        // 失败路径必须是 errors 里的一条，不是 panic，也不是挂起
        let rt = read_codex_runtime(Path::new("/nonexistent-xyz"), Duration::from_millis(200));
        assert!(!rt.available);
        assert!(!rt.errors.is_empty());
    }
}
