//! 用户对单个宿主读取范围的显式控制。排除只停止后续读取，不触及原始日志或
//! 已导入事实；删除本 App 数据是另一个需要单独确认的动作。

use std::collections::BTreeSet;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

const SOURCE_CONTROLS_FILE: &str = "source-controls.json";
const SOURCE_DATA_REVISION_FILE: &str = "source-data-revision.json";
// Hosts with a first-class local ingest/source-control adapter.  This registry is
// intentionally shared by stop-reading and delete-imported-data operations; a
// host must not appear as controllable in one surface and fail in another.
const HOSTS: [&str; 4] = ["claude-code", "codex", "dsh", "workbuddy"];

pub fn supported_hosts() -> &'static [&'static str] {
    &HOSTS
}

/// Runtime registry: built-in adapters plus validated hot-plugged manifests.
/// Manifest slugs are returned in the `host:<slug>` namespace used by the
/// authority and findings projections (spec v0.4.2 §13).
pub fn supported_hosts_for(data_home: &Path) -> Vec<String> {
    let mut hosts = HOSTS.iter().map(|host| (*host).to_string()).collect::<Vec<_>>();
    let (plugins, _) = crate::host_registry::scan_plugin_hosts(data_home);
    hosts.extend(plugins.into_iter().map(|plugin| format!("host:{}", plugin.slug)));
    hosts
}

/// 迁移期规范化：旧 `plugin:<slug>` 折算到新 `host:<slug>`（slug 合法时）。
/// 锁路径与 authority 操作统一走规范化后的值，避免新旧前缀各拿各的锁。
fn canonical_host(host: &str) -> String {
    match host.strip_prefix("plugin:") {
        Some(slug) if crate::host_registry::plugin_slug_ok(slug) => format!("host:{slug}"),
        _ => host.to_string(),
    }
}

/// Per-host coordination path used by ingest and destructive projection cleanup.
/// Keeping the path construction here prevents the Tauri command and the runtime
/// from accidentally using different locks for the same host.
pub fn host_data_lock_path(data_home: &Path, host: &str) -> Result<PathBuf, String> {
    validate_host_for(data_home, host)?;
    Ok(encoded_host_data_lock_path(data_home, &canonical_host(host)))
}

fn encoded_host_data_lock_path(data_home: &Path, host: &str) -> PathBuf {
    // Encode the host bytes instead of embedding `plugin:<slug>` directly:
    // Windows rejects `:` in file names, and byte-hex keeps the mapping
    // collision-free across built-in and hot-plugged hosts.
    let encoded = host.bytes().map(|byte| format!("{byte:02x}")).collect::<String>();
    data_home.join("facts").join(format!(".source-{encoded}.lock"))
}

/// Shared destructive projection cleanup used by both Tauri and MCP.  The
/// host lease covers exclusion + authority deletion as one operation, so an
/// in-flight sync cannot re-import rows between those two steps.
pub fn delete_imported_source_data(
    data_home: &Path,
    host: &str,
) -> Result<agent_vitals_data::authority::HostImportedDataDeletion, String> {
    let canonical = canonical_host(host);
    let registered = supported_hosts_for(data_home).contains(&canonical);
    let valid_orphan = canonical.strip_prefix("host:").is_some_and(crate::host_registry::plugin_slug_ok);
    if !registered && !valid_orphan {
        return Err("source host is not supported by the local source registry".to_string());
    }
    let _lease = crate::lease::acquire_blocking(
        &encoded_host_data_lock_path(data_home, &canonical),
        "delete-imported-source",
        600_000,
        10_000,
    )
    .map_err(|error| format!("source deletion is busy: {error}"))?;
    // A valid but currently uninstalled manifest host may leave orphaned
    // authority rows. It cannot be excluded (there is no importer to stop),
    // but its projection remains safely deletable under the same host lease.
    if registered {
        set_host_excluded(data_home, &canonical, true)?;
    }
    let db = agent_vitals_data::authority::AuthorityDb::open(
        &agent_vitals_data::authority::default_authority_path(data_home),
        crate::clock::now_ms(),
    )
    .map_err(|error| format!("authority database unavailable: {error}"))?;
    let deleted = db.delete_imported_host_data(&canonical, crate::clock::now_ms())
        .map_err(|error| format!("delete imported data failed: {error}"))?;
    // Best-effort cross-process invalidation marker.  The Tauri event is the
    // fast path; this marker lets an already-open desktop notice an MCP delete.
    if let Err(error) = bump_source_data_revision(data_home) {
        // The authority deletion remains successful; the desktop's direct
        // event path still refreshes Tauri callers. MCP callers get an
        // observable stderr diagnostic instead of a silent lost invalidation.
        eprintln!("source-data invalidation marker unavailable: {error}");
    }
    Ok(deleted)
}

pub fn source_data_revision(data_home: &Path) -> u64 {
    std::fs::read_to_string(data_home.join("state").join(SOURCE_DATA_REVISION_FILE))
        .ok()
        .and_then(|text| text.trim().parse::<u64>().ok())
        .unwrap_or(0)
}

fn bump_source_data_revision(data_home: &Path) -> Result<(), String> {
    let _lease = crate::lease::acquire_blocking(
        &data_home.join("facts").join(".source-data-revision.lock"),
        "source-data-revision",
        60_000,
        10_000,
    )
    .map_err(|error| error.to_string())?;
    let directory = data_home.join("state");
    std::fs::create_dir_all(&directory).map_err(|error| error.to_string())?;
    let next = source_data_revision(data_home).saturating_add(1);
    let temporary = directory.join(format!("{SOURCE_DATA_REVISION_FILE}.tmp"));
    std::fs::write(&temporary, next.to_string()).map_err(|error| error.to_string())?;
    std::fs::rename(temporary, directory.join(SOURCE_DATA_REVISION_FILE))
        .map_err(|error| error.to_string())
}

#[derive(Debug, Default, Deserialize, Serialize)]
struct SourceControls {
    excluded_hosts: BTreeSet<String>,
}

fn validate_host_for(data_home: &Path, host: &str) -> Result<(), String> {
    let canonical = canonical_host(host);
    if HOSTS.contains(&canonical.as_str()) {
        Ok(())
    } else if canonical.strip_prefix("host:").is_some_and(crate::host_registry::plugin_slug_ok) {
        if !supported_hosts_for(data_home).contains(&canonical) {
            return Err("source manifest host is not registered".to_string());
        }
        Ok(())
    } else {
        Err("source host is not supported".to_string())
    }
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
    let mut value = value;
    // 迁移：旧 plugin: 值折算到 host: 命名空间（原地、幂等）。
    let legacy: Vec<String> = value.excluded_hosts.iter().filter(|host| host.starts_with("plugin:")).cloned().collect();
    for host in legacy {
        let canonical = canonical_host(&host);
        value.excluded_hosts.remove(&host);
        value.excluded_hosts.insert(canonical);
    }
    let registered = supported_hosts_for(data_home);
    let mut stale = Vec::new();
    for host in &value.excluded_hosts {
        if HOSTS.contains(&host.as_str()) || registered.iter().any(|item| item == host) {
            continue;
        }
        if host.strip_prefix("host:").is_some_and(crate::host_registry::plugin_slug_ok) {
            stale.push(host.clone());
        } else {
            return Err("source host is not supported".to_string());
        }
    }
    for host in stale { value.excluded_hosts.remove(&host); }
    Ok(value)
}

pub fn excluded_hosts(data_home: &Path) -> Result<BTreeSet<String>, String> {
    Ok(read(data_home)?.excluded_hosts)
}

pub fn set_host_excluded(data_home: &Path, host: &str, excluded: bool) -> Result<bool, String> {
    validate_host_for(data_home, host)?;
    let canonical = canonical_host(host);
    let mut controls = read(data_home)?;
    let changed = if excluded {
        controls.excluded_hosts.insert(canonical)
    } else {
        controls.excluded_hosts.remove(&canonical)
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
        assert!(set_host_excluded(&home, "zcode", true).is_err());
        let _ = std::fs::remove_dir_all(&home);
    }

    #[test]
    fn host_lease_is_shared_and_windows_safe() {
        let home = std::env::temp_dir().join(format!("agent-vitals-controls-lock-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&home);
        let path = host_data_lock_path(&home, "host:zcode").unwrap_err();
        assert_eq!(path, "source manifest host is not registered");
        // 迁移期：旧 plugin: 输入规范化到新命名空间后同样报「未注册」，
        // 已注册官方宿主不受影响。
        assert_eq!(host_data_lock_path(&home, "plugin:zcode").unwrap_err(), "source manifest host is not registered");
        let path = host_data_lock_path(&home, "codex").unwrap();
        assert!(!path.to_string_lossy().contains(':'));
        let first = crate::lease::acquire(&path, "test-first", 60_000).unwrap();
        assert!(matches!(crate::lease::acquire(&path, "test-second", 60_000), Err(crate::lease::LeaseError::Held { .. })));
        drop(first);
        assert!(crate::lease::acquire(&path, "test-second", 60_000).is_ok());
        let _ = std::fs::remove_dir_all(&home);
    }

    #[test]
    fn legacy_excluded_hosts_are_normalized_in_place() {
        let home = std::env::temp_dir().join(format!("agent-vitals-controls-migrate-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&home);
        // 注册 zcode（否则未注册 manifest 宿主按既有语义被 stale 清扫）。
        let manifest_dir = home.join("hosts.d").join("zcode");
        std::fs::create_dir_all(&manifest_dir).unwrap();
        std::fs::create_dir_all(home.join("state")).unwrap();
        std::fs::write(manifest_dir.join("manifest.json"), r#"{"manifest_version":1,"slug":"zcode","display":{"name":"ZCode"},
            "discovery":{"roots":["~/r"],"include":["*.jsonl"]},
            "source":{"format":"jsonl"},
            "session":{"from":"filename","pattern":"^s_(?P<id>.+)\\.jsonl$"},
            "recipe":"request-usage-anthropic-v1",
            "event_key":{"paths":["requestId"]}}"#).unwrap();
        std::fs::write(home.join("state").join(SOURCE_CONTROLS_FILE), r#"{"excluded_hosts":["codex","plugin:zcode"]}"#).unwrap();
        // 旧 plugin: 值折算到 host: 并保留（已注册）；官方宿主不动。
        let excluded = excluded_hosts(&home).unwrap();
        assert_eq!(excluded, BTreeSet::from(["codex".to_string(), "host:zcode".to_string()]));
        // 未注册的旧 plugin: 值：折算后按 stale 语义清扫（与卸载宿主一致）。
        std::fs::remove_dir_all(&manifest_dir).unwrap();
        std::fs::write(home.join("state").join(SOURCE_CONTROLS_FILE), r#"{"excluded_hosts":["codex","plugin:zcode"]}"#).unwrap();
        let excluded = excluded_hosts(&home).unwrap();
        assert_eq!(excluded, BTreeSet::from(["codex".to_string()]));
        let _ = std::fs::remove_dir_all(&home);
    }
}
