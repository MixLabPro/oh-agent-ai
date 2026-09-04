//! v0.8 Phase B executable boundary for the pure host-adapter crate.

use std::fs;
use std::path::{Path, PathBuf};

fn manifest_dir() -> &'static Path {
    Path::new(env!("CARGO_MANIFEST_DIR"))
}

fn dependency_keys(manifest: &str) -> Vec<String> {
    let mut keys = Vec::new();
    let mut in_deps = false;
    for raw in manifest.lines() {
        let line = raw.split('#').next().unwrap_or("").trim();
        if line.is_empty() {
            continue;
        }
        if line.starts_with('[') {
            in_deps = line == "[dependencies]";
            continue;
        }
        if in_deps {
            let key = line.split(['=', '.']).next().unwrap_or("").trim();
            if !key.is_empty() {
                keys.push(key.to_string());
            }
        }
    }
    keys
}

#[test]
fn adapters_dependency_budget_is_pure_and_one_way() {
    let manifest = fs::read_to_string(manifest_dir().join("Cargo.toml")).unwrap();
    let mut actual = dependency_keys(&manifest);
    actual.sort();
    assert_eq!(
        actual,
        vec!["agent-vitals-domain", "regex", "serde_json", "vitals-core"]
    );

    // `adapters → domain` 是唯一允许的**生产**方向。`domain → adapters` 只以
    // `[dev-dependencies]` 存在（`domain/usage.rs::tests` 经它调 `canonical_tokens`，
    // 只换 `serde_json::Value`），Cargo 允许 dev-dep 成环。这里只断言 domain 的
    // `[dependencies]`（`dependency_keys` 在 `[dev-dependencies]` 处停）不含 adapters。
    let domain_manifest =
        fs::read_to_string(manifest_dir().join("../agent-vitals-domain/Cargo.toml")).unwrap();
    assert!(
        !dependency_keys(&domain_manifest)
            .iter()
            .any(|v| v == "agent-vitals-adapters"),
        "domain's [dependencies] must not reference adapters (only the dev-dep back-edge is allowed)"
    );
}

fn each_src_file(mut visit: impl FnMut(&Path, &str)) {
    fn walk(dir: &Path, visit: &mut impl FnMut(&Path, &str)) {
        let mut entries: Vec<PathBuf> = fs::read_dir(dir)
            .unwrap()
            .flatten()
            .map(|entry| entry.path())
            .collect();
        entries.sort();
        for path in entries {
            if path.is_dir() {
                walk(&path, visit);
            } else if path.extension().and_then(|v| v.to_str()) == Some("rs") {
                visit(&path, &fs::read_to_string(&path).unwrap());
            }
        }
    }
    walk(&manifest_dir().join("src"), &mut visit);
}

#[test]
fn production_adapters_do_not_perform_io_or_runtime_orchestration() {
    let forbidden = [
        "std::fs",
        "std::process",
        "std::env::",
        "File::open",
        "File::create",
        "SystemTime::now",
        "rusqlite",
        "ruzstd",
        "notify::",
        "tauri::",
    ];
    each_src_file(|path, content| {
        let production = content.split("#[cfg(test)]").next().unwrap_or(content);
        for needle in forbidden {
            assert!(
                !production.contains(needle),
                "pure adapter {} contains forbidden runtime token `{needle}`",
                path.strip_prefix(manifest_dir()).unwrap_or(path).display()
            );
        }
    });
}

#[test]
fn host_namespace_is_complete_and_surface_explicit() {
    let hosts = manifest_dir().join("src/hosts");
    let mut actual: Vec<String> = fs::read_dir(&hosts)
        .unwrap()
        .flatten()
        .filter(|entry| entry.path().is_dir())
        .map(|entry| entry.file_name().to_string_lossy().into_owned())
        .collect();
    actual.sort();
    assert_eq!(actual, vec!["claude_code", "codex", "dsh", "workbuddy"]);
    for host in actual {
        assert!(hosts.join(host).join("sessions/mod.rs").is_file());
    }
}

#[test]
fn flat_facade_and_host_namespaces_resolve_to_the_same_items() {
    assert_eq!(
        agent_vitals_adapters::codex_usage::CODEX_TOKEN_FIELDS,
        agent_vitals_adapters::hosts::codex::sessions::usage::CODEX_TOKEN_FIELDS
    );
    let _: Option<agent_vitals_adapters::claude_code_evidence::ClaudeEvidence> = None;
    let _: Option<agent_vitals_adapters::hosts::codex::sessions::evidence::CodexEvidence> = None;
    let _: Option<agent_vitals_adapters::dsh_evidence::DshEvidence> = None;
    let _: Option<agent_vitals_adapters::workbuddy_evidence::WorkbuddyEvidence> = None;
}
