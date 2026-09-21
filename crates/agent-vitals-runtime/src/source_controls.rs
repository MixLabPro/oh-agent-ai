//! 用户对单个宿主读取范围的显式控制。排除只停止后续读取，不触及原始日志或
//! 已导入事实；删除本 App 数据是另一个需要单独确认的动作。

use std::collections::BTreeSet;
use std::path::Path;

use serde::{Deserialize, Serialize};

const SOURCE_CONTROLS_FILE: &str = "source-controls.json";
const HOSTS: [&str; 3] = ["claude-code", "codex", "dsh"];

pub fn supported_hosts() -> &'static [&'static str] {
    &HOSTS
}

#[derive(Debug, Default, Deserialize, Serialize)]
struct SourceControls {
    excluded_hosts: BTreeSet<String>,
}

fn validate_host(host: &str) -> Result<(), String> {
    if HOSTS.contains(&host) { Ok(()) } else { Err("source host is not supported".to_string()) }
}

fn path(data_home: &Path) -> std::path::PathBuf {
    data_home.join("state").join(SOURCE_CONTROLS_FILE)
}

fn read(data_home: &Path) -> Result<SourceControls, String> {
    let value = match std::fs::read_to_string(path(data_home)) {
        Ok(text) => serde_json::from_str::<SourceControls>(&text)
            .map_err(|error| format!("source controls are invalid: {error}"))?,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => SourceControls::default(),
        Err(error) => return Err(format!("source controls are unreadable: {error}")),
    };
    for host in &value.excluded_hosts { validate_host(host)?; }
    Ok(value)
}

pub fn excluded_hosts(data_home: &Path) -> Result<BTreeSet<String>, String> {
    Ok(read(data_home)?.excluded_hosts)
}

pub fn set_host_excluded(data_home: &Path, host: &str, excluded: bool) -> Result<bool, String> {
    validate_host(host)?;
    let mut controls = read(data_home)?;
    let changed = if excluded {
        controls.excluded_hosts.insert(host.to_string())
    } else {
        controls.excluded_hosts.remove(host)
    };
    if !changed { return Ok(false); }
    let directory = data_home.join("state");
    std::fs::create_dir_all(&directory).map_err(|error| error.to_string())?;
    let temporary = directory.join("source-controls.json.tmp");
    std::fs::write(&temporary, serde_json::to_vec(&controls).map_err(|error| error.to_string())?)
        .map_err(|error| error.to_string())?;
    std::fs::rename(temporary, path(data_home)).map_err(|error| error.to_string())?;
    Ok(true)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn exclusion_round_trip_and_host_validation() {
        let home = std::env::temp_dir().join(format!("agent-vitals-controls-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&home);
        assert!(set_host_excluded(&home, "codex", true).unwrap());
        assert_eq!(excluded_hosts(&home).unwrap(), BTreeSet::from(["codex".to_string()]));
        assert!(set_host_excluded(&home, "codex", false).unwrap());
        assert!(excluded_hosts(&home).unwrap().is_empty());
        assert!(set_host_excluded(&home, "workbuddy", true).is_err());
        let _ = std::fs::remove_dir_all(&home);
    }
}
