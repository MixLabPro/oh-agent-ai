//! Official projection handlers; business dispatch does not belong to PluginHost.
use serde_json::Value;

pub fn session_target(plugin_id: &str, payload: &Value) -> Result<(String, String), &'static str> {
    if plugin_id != "city" { return Err("navigation_unavailable"); }
    let handle = payload["handle"].as_str().ok_or("invalid_session_handle")?;
    agent_vitals_runtime::query::app_local::city_session_target(&crate::overview::data_home(), handle)
}

pub fn read(allowed: &[String], method: &str, payload: &Value) -> Result<Value, &'static str> {
    if method != "data.read" { return Err("method_unavailable"); }
    let name = payload["projection"].as_str().ok_or("projection_unavailable")?;
    let version = payload["version"].as_u64().ok_or("projection_unavailable")?;
    let key = format!("{name}:v{version}");
    if !allowed.contains(&key) { return Err("projection_denied"); }
    match key.as_str() {
        "city-settings:v1" => city_settings(payload),
        "city:v1" => {
            let days = payload["windowDays"].as_u64().ok_or("invalid_window")?;
            if !matches!(days, 7 | 30 | 90 | 366) { return Err("invalid_window"); }
            agent_vitals_runtime::query::app_local::city_projection(&crate::overview::data_home(), days as u16,
                agent_vitals_runtime::core::clock::now_ms())
        }
        _ => Err("projection_unavailable"),
    }
}

fn city_settings(payload: &Value) -> Result<Value, &'static str> {
    city_settings_at(&crate::overview::data_home(), payload)
}

fn city_settings_at(data_home: &std::path::Path, payload: &Value) -> Result<Value, &'static str> {
    let path = data_home.join("state/plugins/city.json");
    match payload["action"].as_str() {
        Some("read") => {
            let seed = match std::fs::read(&path) {
                Ok(bytes) => serde_json::from_slice::<Value>(&bytes).map_err(|_| "state_unavailable")?["seed"].as_u64(),
                Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                    match std::fs::read(data_home.join("state/city-seed.json")) {
                        Ok(bytes) => serde_json::from_slice::<Value>(&bytes).ok().and_then(|value| value["seed"].as_u64()),
                        Err(_) => None,
                    }
                }
                Err(_) => return Err("state_unavailable"),
            };
            Ok(serde_json::json!({"seed": seed.filter(|n| *n > 0 && *n <= u32::MAX as u64)}))
        }
        Some("write") => {
            let seed = payload["seed"].as_u64().filter(|n| *n > 0 && *n <= u32::MAX as u64).ok_or("invalid_seed")?;
            std::fs::create_dir_all(path.parent().unwrap()).map_err(|_| "state_unavailable")?;
            let temp = path.with_extension("tmp");
            std::fs::write(&temp, serde_json::json!({"seed": seed}).to_string()).map_err(|_| "state_unavailable")?;
            std::fs::rename(&temp, &path).map_err(|_| "state_unavailable")?;
            Ok(serde_json::json!({"seed": seed}))
        }
        _ => Err("invalid_settings_action"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    #[test]
    fn projections_are_explicitly_scoped_and_windows_bounded() {
        assert_eq!(read(&[], "data.read", &json!({"projection":"city","version":1,"windowDays":30})), Err("projection_denied"));
        assert_eq!(read(&["city:v1".into()], "sql", &json!({})), Err("method_unavailable"));
        assert_eq!(read(&["city:v1".into()], "data.read", &json!({"projection":"city","version":1,"windowDays":65566})), Err("invalid_window"));
    }

    #[test]
    fn plugin_seed_state_preserves_legacy_and_rejects_invalid_writes() {
        let dir = std::env::temp_dir().join(format!("city-state-{}-{}", std::process::id(),
            std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos()));
        std::fs::create_dir_all(dir.join("state")).unwrap();
        std::fs::write(dir.join("state/city-seed.json"), r#"{"seed":123}"#).unwrap();
        assert_eq!(city_settings_at(&dir, &json!({"action":"read"})).unwrap()["seed"], 123);
        assert_eq!(city_settings_at(&dir, &json!({"action":"write","seed":42})).unwrap()["seed"], 42);
        assert_eq!(city_settings_at(&dir, &json!({"action":"write","seed":0})), Err("invalid_seed"));
        assert_eq!(city_settings_at(&dir, &json!({"action":"read"})).unwrap()["seed"], 42);
        assert_eq!(std::fs::read_to_string(dir.join("state/city-seed.json")).unwrap(), r#"{"seed":123}"#);
        std::fs::remove_dir_all(dir).unwrap();
    }
}
