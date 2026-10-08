//! 通用插件本地状态端口（CITY_GAME_MODE_IMPLEMENTATION_PLAN §9）：
//! 有界 JSON 文档存储于应用私有数据目录 `state/plugins/<plugin_id>/state/<key>.json`，
//! 路径由宿主生成（插件只传 key）；单文档 ≤ 32 KiB；读写携带 revision 做乐观并发检查；
//! 写入走临时文件 + 原子替换；损坏文件读取报错、写入前保留可恢复副本。
//! 本模块只提供有界本地 JSON 存储，不实现飞机/任务规则，不进 authority DB。
use serde_json::Value;

const MAX_DOCUMENT_BYTES: usize = 32 * 1024;

/// key 形如 `flight-profile:v1`（小写字母/数字/连字符 + 冒号 + v + 数字）。
fn valid_key(key: &str) -> bool {
    !key.is_empty() && key.len() <= 64 && key.split(':').count() == 2 && {
        let mut parts = key.split(':');
        let name = parts.next().unwrap_or("");
        let version = parts.next().unwrap_or("");
        !name.is_empty() && name.bytes().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == b'-')
            && version.len() >= 2 && version.starts_with('v') && version[1..].bytes().all(|c| c.is_ascii_digit())
    }
}

fn state_path(data_home: &std::path::Path, plugin_id: &str, key: &str) -> std::path::PathBuf {
    let safe_key = key.replace(':', "-");
    data_home.join(format!("state/plugins/{plugin_id}/state/{safe_key}.json"))
}

fn load(path: &std::path::Path) -> Result<Option<(u64, Value)>, &'static str> {
    match std::fs::read(path) {
        Ok(bytes) => {
            let parsed: Value = serde_json::from_slice(&bytes).map_err(|_| "state_unavailable")?;
            let revision = parsed["revision"].as_u64().ok_or("state_unavailable")?;
            let value = parsed.get("value").cloned().unwrap_or(Value::Null);
            Ok(Some((revision, value)))
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(_) => Err("state_unavailable"),
    }
}

/// 通用端口入口：read → {value, revision}；write → {revision}（成功后的新版本）。
pub fn handle(allowed_keys: &[String], data_home: &std::path::Path, plugin_id: &str, method: &str, payload: &Value) -> Result<Value, &'static str> {
    match method {
        "plugin.state.read" => read(allowed_keys, data_home, plugin_id, payload),
        "plugin.state.write" => write(allowed_keys, data_home, plugin_id, payload),
        _ => Err("method_unavailable"),
    }
}

fn read(allowed_keys: &[String], data_home: &std::path::Path, plugin_id: &str, payload: &Value) -> Result<Value, &'static str> {
    let key = payload["key"].as_str().ok_or("invalid_state_key")?;
    if !valid_key(key) || !allowed_keys.iter().any(|allowed| allowed == key) { return Err("state_key_denied"); }
    match load(&state_path(data_home, plugin_id, key)) {
        Ok(Some((revision, value))) => Ok(serde_json::json!({"value": value, "revision": revision})),
        Ok(None) => Ok(serde_json::json!({"value": Value::Null, "revision": 0})),
        Err(code) => Err(code),
    }
}

fn write(allowed_keys: &[String], data_home: &std::path::Path, plugin_id: &str, payload: &Value) -> Result<Value, &'static str> {
    let key = payload["key"].as_str().ok_or("invalid_state_key")?;
    if !valid_key(key) || !allowed_keys.iter().any(|allowed| allowed == key) { return Err("state_key_denied"); }
    let value = payload["value"].as_object().ok_or("invalid_state_value")?;
    let revision = payload["revision"].as_u64().ok_or("revision_required")?;
    let path = state_path(data_home, plugin_id, key);
    let existing = load(&path);
    let current = match &existing {
        Ok(Some((seen, _))) => *seen,
        Ok(None) => 0,
        Err(_) => {
            // 损坏：保留可恢复副本后再启用空档案（不静默覆盖，§9）。
            let backup = path.with_extension(format!("corrupt-{}", std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_secs()));
            let _ = std::fs::rename(&path, &backup);
            0
        }
    };
    if current != revision { return Err("revision_conflict"); }
    let document = serde_json::json!({"revision": revision + 1, "value": value});
    let bytes = serde_json::to_vec(&document).map_err(|_| "state_unavailable")?;
    if bytes.len() > MAX_DOCUMENT_BYTES { return Err("state_too_large"); }
    std::fs::create_dir_all(path.parent().expect("state dir")).map_err(|_| "state_unavailable")?;
    let temp = path.with_extension("tmp");
    std::fs::write(&temp, &bytes).map_err(|_| "state_unavailable")?;
    std::fs::rename(&temp, &path).map_err(|_| "state_unavailable")?;
    Ok(serde_json::json!({"revision": revision + 1}))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn temp_home() -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!("plugin-state-{}-{}", std::process::id(),
            std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos()));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    const KEYS: &[&str] = &["flight-profile:v1"];

    #[test]
    fn round_trip_with_revision_and_allowlist() {
        let home = temp_home();
        // 空 → revision 0。
        let empty = handle(KEYS, &home, "city", "plugin.state.read", &json!({"key":"flight-profile:v1"})).unwrap();
        assert_eq!(empty["revision"], 0);
        assert!(empty["value"].is_null());
        // 未声明 key / 非法 key 拒绝。
        assert_eq!(handle(KEYS, &home, "city", "plugin.state.read", &json!({"key":"other:v1"})), Err("state_key_denied"));
        assert_eq!(handle(KEYS, &home, "city", "plugin.state.read", &json!({"key":"../escape:v1"})), Err("state_key_denied"));
        // 首写 revision 0；读回 revision 1。
        let written = handle(KEYS, &home, "city", "plugin.state.write",
            &json!({"key":"flight-profile:v1","revision":0,"value":{"best":120}})).unwrap();
        assert_eq!(written["revision"], 1);
        let read = handle(KEYS, &home, "city", "plugin.state.read", &json!({"key":"flight-profile:v1"})).unwrap();
        assert_eq!(read["revision"], 1);
        assert_eq!(read["value"]["best"], 120);
        // 旧 revision 写入冲突；正确 revision 推进。
        assert_eq!(handle(KEYS, &home, "city", "plugin.state.write",
            &json!({"key":"flight-profile:v1","revision":0,"value":{"best":1}})), Err("revision_conflict"));
        handle(KEYS, &home, "city", "plugin.state.write",
            &json!({"key":"flight-profile:v1","revision":1,"value":{"best":90}})).unwrap();
        assert_eq!(handle(KEYS, &home, "city", "plugin.state.read", &json!({"key":"flight-profile:v1"})).unwrap()["revision"], 2);
        // 按插件隔离：city 写入不影响其他插件。
        assert_eq!(handle(KEYS, &home, "other", "plugin.state.read", &json!({"key":"flight-profile:v1"})).unwrap()["revision"], 0);
        std::fs::remove_dir_all(&home).unwrap();
    }

    #[test]
    fn oversize_document_rejected_and_corrupt_preserved() {
        let home = temp_home();
        let big = "x".repeat(33 * 1024);
        assert_eq!(handle(KEYS, &home, "city", "plugin.state.write",
            &json!({"key":"flight-profile:v1","revision":0,"value":{"blob":big}})), Err("state_too_large"));
        // 损坏文件：读取报错；写入先备份再成功。
        let path = state_path(&home, "city", "flight-profile:v1");
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        std::fs::write(&path, "not json").unwrap();
        assert_eq!(handle(KEYS, &home, "city", "plugin.state.read", &json!({"key":"flight-profile:v1"})), Err("state_unavailable"));
        handle(KEYS, &home, "city", "plugin.state.write",
            &json!({"key":"flight-profile:v1","revision":0,"value":{"fresh":true}})).unwrap();
        assert!(path.parent().unwrap().read_dir().unwrap().any(|entry| entry.unwrap().file_name().to_string_lossy().contains("corrupt-")));
        assert_eq!(handle(KEYS, &home, "city", "plugin.state.read", &json!({"key":"flight-profile:v1"})).unwrap()["value"]["fresh"], true);
        std::fs::remove_dir_all(&home).unwrap();
    }
}
