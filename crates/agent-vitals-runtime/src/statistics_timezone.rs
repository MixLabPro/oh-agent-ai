//! 统计时区偏好：默认使用 OS IANA 时区，用户设置后持久化到数据根。
//!
//! 供应商价格规则不读取这里的值；它只定义统计日/月/小时窗口以及本地展示。

use std::path::Path;

use jiff::tz::TimeZone;
use serde_json::{json, Value};

const CONFIG_FILE: &str = "statistics-timezone.json";

/// 读取用户统计时区；缺少配置时回退到系统 IANA 时区。
pub fn timezone_name(data_home: &Path) -> Result<String, String> {
    let path = data_home.join("state").join(CONFIG_FILE);
    let text = match std::fs::read_to_string(&path) {
        Ok(text) => text,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            return Ok(crate::clock::system_timezone_name());
        }
        Err(error) => return Err(format!("statistics timezone unreadable: {error}")),
    };
    let value: Value = serde_json::from_str(&text)
        .map_err(|error| format!("statistics timezone is invalid: {error}"))?;
    let name = value.get("timezone").and_then(Value::as_str)
        .ok_or_else(|| "statistics timezone has no timezone value".to_string())?;
    validate_timezone(name)?;
    Ok(name.to_string())
}

/// 校验并原子保存用户统计时区。
pub fn save_timezone(data_home: &Path, name: &str) -> Result<String, String> {
    validate_timezone(name)?;
    let directory = data_home.join("state");
    std::fs::create_dir_all(&directory).map_err(|error| error.to_string())?;
    let temporary = directory.join("statistics-timezone.json.tmp");
    let target = directory.join(CONFIG_FILE);
    let contents = serde_json::to_vec(&json!({ "timezone": name }))
        .map_err(|error| error.to_string())?;
    std::fs::write(&temporary, contents).map_err(|error| error.to_string())?;
    std::fs::rename(&temporary, target).map_err(|error| error.to_string())?;
    Ok(name.to_string())
}

/// 将已保存的偏好应用到当前进程，使 SQLite `localtime` 与 Jiff 使用同一时区。
/// 未配置时保持 OS 环境不变；配置损坏不会静默切换到另一个时区。
pub fn apply(data_home: &Path) -> Result<String, String> {
    let name = timezone_name(data_home)?;
    let system_name = crate::clock::system_timezone_name();
    if name != system_name && name != "Etc/Unknown" {
        std::env::set_var("TZ", &name);
    }
    Ok(name)
}

pub fn validate_timezone(name: &str) -> Result<(), String> {
    if name.trim() != name || name.is_empty() || name.contains('\0') {
        return Err("statistics timezone must be a non-empty IANA name".to_string());
    }
    TimeZone::get(name)
        .map(|_| ())
        .map_err(|error| format!("unknown IANA statistics timezone {name:?}: {error}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temporary_home(name: &str) -> std::path::PathBuf {
        std::env::temp_dir().join(format!("agent-vitals-statistics-timezone-{name}-{}", std::process::id()))
    }

    #[test]
    fn absent_config_uses_system_timezone() {
        let home = temporary_home("default");
        let _ = std::fs::remove_dir_all(&home);
        assert_eq!(timezone_name(&home).unwrap(), crate::clock::system_timezone_name());
    }

    #[test]
    fn save_round_trips_and_rejects_unknown_zone() {
        let home = temporary_home("save");
        let _ = std::fs::remove_dir_all(&home);
        assert!(save_timezone(&home, "not/a-zone").is_err());
        assert_eq!(save_timezone(&home, "America/Los_Angeles").unwrap(), "America/Los_Angeles");
        assert_eq!(timezone_name(&home).unwrap(), "America/Los_Angeles");
        let _ = std::fs::remove_dir_all(&home);
    }

    #[test]
    fn malformed_config_fails_closed() {
        let home = temporary_home("invalid");
        let _ = std::fs::remove_dir_all(&home);
        std::fs::create_dir_all(home.join("state")).unwrap();
        std::fs::write(home.join("state").join(CONFIG_FILE), b"not json").unwrap();
        assert!(timezone_name(&home).is_err());
        let _ = std::fs::remove_dir_all(&home);
    }
}
