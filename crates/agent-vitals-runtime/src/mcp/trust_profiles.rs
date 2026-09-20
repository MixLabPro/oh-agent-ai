//! Typed MCP control plane for dynamically imported host/Trust profiles.
//!
//! An Agent may inspect the schema, validate a manifest, and stage a proposal.
//! Staging is an explicit local write, guarded by `--allow-local-writes`; it
//! never activates a host. Approval/revoke are UI-only operations exposed by
//! the desktop, so an Agent cannot silently add a collector or Trust sensor.

use std::path::{Path, PathBuf};

use agent_vitals_hosts::generic_manifest;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};

use super::{build_envelope, coverage_not_applicable, AuthorityHandle, ToolError, ToolSpec};

const PENDING_DIR: &str = "trust-profile-proposals";
const EVENT_LOG: &str = "trust-profile-events.jsonl";

pub fn schema_spec() -> ToolSpec {
    ToolSpec {
        name: "trust_profile_schema",
        description: "Return the supported declarative host/Trust profile schema. This is metadata only and never reads host logs.",
        input_schema: json!({"type":"object","properties":{},"additionalProperties":false}),
        output_schema: json!({"type":"object"}),
    }
}

pub fn list_spec() -> ToolSpec {
    ToolSpec {
        name: "trust_profile_list",
        description: "List approved and pending local host/Trust profiles without returning local paths or raw observations.",
        input_schema: json!({"type":"object","properties":{},"additionalProperties":false}),
        output_schema: json!({"type":"object"}),
    }
}

pub fn validate_spec() -> ToolSpec {
    ToolSpec {
        name: "trust_profile_validate",
        description: "Validate a proposed declarative host manifest. Validation has no filesystem side effect.",
        input_schema: json!({"type":"object","properties":{"manifest":{"type":"object"}},"required":["manifest"],"additionalProperties":false}),
        output_schema: json!({"type":"object"}),
    }
}

pub fn stage_spec() -> ToolSpec {
    ToolSpec {
        name: "trust_profile_stage",
        description: "Stage a validated host/Trust manifest for user approval. It cannot activate, scan, or revoke a host.",
        input_schema: json!({"type":"object","properties":{"manifest":{"type":"object"}},"required":["manifest"],"additionalProperties":false}),
        output_schema: json!({"type":"object"}),
    }
}

pub fn status_spec() -> ToolSpec {
    ToolSpec {
        name: "trust_profile_proposal_status",
        description: "Read pending host/Trust profile proposals and their validation status. Raw manifest paths and evidence are withheld.",
        input_schema: json!({"type":"object","properties":{},"additionalProperties":false}),
        output_schema: json!({"type":"object"}),
    }
}

pub fn schema() -> Value {
    json!({
        "manifest_version": 1,
        "required": ["manifest_version", "slug", "display", "discovery", "source", "session", "recipe", "event_key", "trust"],
        "trust": {
            "required": ["roots", "artifact_terms", "extensions"],
            "roots": "array<string> of ~/ relative paths",
            "artifact_terms": "lowercase token array",
            "extensions": "dot-prefixed lowercase extension array",
            "adapter": {"optional": true, "enum": ["generic_artifact_v1", "zcode_checkpoint_v1", "minimax_workspace_index_v1"],
                "note": "reviewed local adapter identifier only; SQL and commands are not accepted"},
            "watch_priority": {"optional": true, "enum": ["normal", "enhanced"],
                "note": "coverage and review scheduling hint only; never changes Finding evidence, severity, or notification eligibility"}
        },
        "activation": "user_approval_only",
        "agent_permissions": ["list", "validate", "stage", "proposal_status"],
        "agent_forbidden": ["approve", "reject", "revoke", "scan", "arbitrary_file_write"]
    })
}

fn proposal_dir(data_home: &Path) -> PathBuf {
    data_home.join(PENDING_DIR)
}

fn validate_manifest(manifest: &Value) -> Result<(generic_manifest::PluginManifest, String), ToolError> {
    let parsed = generic_manifest::parse_manifest(manifest.clone())
        .map_err(|error| ToolError::new("invalid_argument", error.to_string()))?;
    if parsed.trust.is_none() {
        return Err(ToolError::new("invalid_argument", "manifest.trust is required for a Trust profile"));
    }
    let slug = parsed.slug.clone();
    Ok((parsed, slug))
}

fn manifest_hash(manifest: &Value) -> String {
    let bytes = serde_json::to_vec(manifest).unwrap_or_default();
    let digest = Sha256::digest(bytes);
    digest.iter().take(8).map(|byte| format!("{byte:02x}")).collect()
}

/// Profile metadata is local-only and useful before the authority database is
/// initialized. Keep the normal MCP envelope when the DB exists, but make an
/// explicit degraded response for a fresh install. Analytical tools continue
/// to require the authority database.
fn metadata_response(data_home: &Path, data: Value) -> Result<Value, ToolError> {
    match AuthorityHandle::open(data_home) {
        Ok(handle) => Ok(build_envelope(
            handle.conn(),
            handle.authority_state(),
            None,
            coverage_not_applicable(),
            Vec::new(),
            data,
        )),
        Err(error) if error.code == "database_missing" => Ok(json!({
            "status": "ok",
            "authority_state": "unavailable",
            "data": data,
            "warnings": ["authority database is not initialized; profile metadata is still local-only"]
        })),
        Err(error) => Err(error),
    }
}

fn safe_manifest_summary(manifest: &Value, state: &str, hash: &str) -> Value {
    let slug = manifest.get("slug").and_then(Value::as_str).unwrap_or("unknown");
    let display = manifest.get("display").and_then(Value::as_object)
        .and_then(|value| value.get("name")).and_then(Value::as_str).unwrap_or("unknown");
    let trust = manifest.get("trust").and_then(Value::as_object);
    json!({
        "slug": slug,
        "display_name": display,
        "state": state,
        "manifest_hash": hash,
        "trust_roots_count": trust.and_then(|value| value.get("roots")).and_then(Value::as_array).map_or(0, Vec::len),
        "artifact_terms_count": trust.and_then(|value| value.get("artifact_terms")).and_then(Value::as_array).map_or(0, Vec::len),
        "extensions_count": trust.and_then(|value| value.get("extensions")).and_then(Value::as_array).map_or(0, Vec::len),
        "trust_adapter": trust.and_then(|value| value.get("adapter")).and_then(Value::as_str)
            .and_then(generic_manifest::TrustEvidenceAdapter::parse).map(|adapter| adapter.as_str()),
        "watch_priority": trust.and_then(|value| value.get("watch_priority")).and_then(Value::as_str)
            .and_then(generic_manifest::TrustWatchPriority::parse).map(|priority| priority.as_str()),
    })
}

pub fn run_schema(data_home: &Path) -> Result<Value, ToolError> {
    metadata_response(data_home, json!({"schema": schema()}))
}

pub fn run_list(data_home: &Path) -> Result<Value, ToolError> {
    let (hosts, errors) = crate::host_registry::scan_plugin_hosts(data_home);
    let approved = hosts.into_iter().filter_map(|host| {
        let trust = host.trust_profile.as_ref()?;
        Some(json!({"slug": host.slug, "display_name": host.display_name,
            "state": "approved", "manifest_hash": host.manifest_sha256,
            "trust_roots_count": trust.roots.len(), "artifact_terms_count": trust.artifact_terms.len(),
            "extensions_count": trust.extensions.len(), "trust_adapter": trust.adapter.map(|adapter| adapter.as_str()),
            "watch_priority": trust.watch_priority.as_str()}))
    }).collect::<Vec<_>>();
    let pending = pending_summaries(data_home)?;
    let home = std::env::var_os("HOME").map(PathBuf::from).unwrap_or_else(|| PathBuf::from("/"));
    let (local_profiles, local_errors) = crate::trust_audit::profiles(data_home, &home);
    let local = crate::trust_audit::profile_summaries(&local_profiles).into_iter()
        .map(|profile| json!({"slug": profile.id, "display_name": profile.display,
            "state": "available", "source": profile.source, "capability": profile.capability, "adapter": profile.adapter,
            "watch_priority": profile.watch_priority}))
        .collect::<Vec<_>>();
    metadata_response(data_home, json!({"approved": approved, "pending": pending,
        "local_profiles": local, "invalid_plugin_manifests": errors.len(),
        "invalid_local_profiles": local_errors.len()}))
}

pub fn run_validate(args: &Value, data_home: &Path) -> Result<Value, ToolError> {
    let manifest = args.get("manifest").ok_or_else(|| ToolError::new("invalid_argument", "manifest is required"))?;
    let (parsed, slug) = validate_manifest(manifest)?;
    let hash = manifest_hash(manifest);
    let result = json!({"status":"valid", "slug": slug, "display_name": parsed.display_name,
        "manifest_hash": hash, "trust": {"roots_count": parsed.trust.as_ref().map_or(0, |v| v.roots.len()),
        "artifact_terms_count": parsed.trust.as_ref().map_or(0, |v| v.artifact_terms.len()),
        "extensions_count": parsed.trust.as_ref().map_or(0, |v| v.extensions.len()),
        "adapter": parsed.trust.as_ref().and_then(|v| v.adapter).map(|adapter| adapter.as_str()),
        "watch_priority": parsed.trust.as_ref().map(|v| v.watch_priority.as_str())},
        "activation": "requires_user_approval"});
    metadata_response(data_home, result)
}

pub fn run_stage(args: &Value, data_home: &Path, allow_local_writes: bool) -> Result<Value, ToolError> {
    if !allow_local_writes {
        return Err(ToolError::new("permission_denied", "staging a Trust profile requires the explicit `--allow-local-writes` server flag"));
    }
    let manifest = args.get("manifest").ok_or_else(|| ToolError::new("invalid_argument", "manifest is required"))?;
    let (_, slug) = validate_manifest(manifest)?;
    // If an authority DB is present, fail before touching the proposal store
    // when it is corrupt or from an incompatible schema. A genuinely fresh
    // install is allowed to stage metadata and receives a degraded envelope.
    let authority_path = agent_vitals_data::authority::default_authority_path(data_home);
    if authority_path.exists() {
        let _ = AuthorityHandle::open(data_home)?;
    }
    let hash = manifest_hash(manifest);
    let dir = proposal_dir(data_home);
    std::fs::create_dir_all(&dir).map_err(|_| ToolError::new("local_write_failed", "could not create Trust profile proposal store"))?;
    let target = dir.join(format!("{slug}.json"));
    let temporary = dir.join(format!(".{slug}.{}.tmp", std::process::id()));
    let bytes = serde_json::to_vec_pretty(manifest).map_err(|_| ToolError::new("invalid_argument", "manifest is not serializable"))?;
    std::fs::write(&temporary, bytes).map_err(|_| ToolError::new("local_write_failed", "could not stage Trust profile"))?;
    std::fs::rename(&temporary, &target).map_err(|_| ToolError::new("local_write_failed", "could not commit Trust profile proposal atomically"))?;
    let result = json!({"status":"staged", "slug":slug, "proposal_ref":format!("proposal_{hash}"), "manifest_hash":hash,
        "activation":"requires_user_approval"});
    metadata_response(data_home, result)
}

pub fn run_status(data_home: &Path) -> Result<Value, ToolError> {
    let (hosts, _) = crate::host_registry::scan_plugin_hosts(data_home);
    let approved = hosts.into_iter().filter(|host| host.trust_profile.is_some())
        .map(|host| json!({"slug": host.slug, "state": "approved", "manifest_hash": host.manifest_sha256}))
        .collect::<Vec<_>>();
    let home = std::env::var_os("HOME").map(PathBuf::from).unwrap_or_else(|| PathBuf::from("/"));
    let (local_profiles, _) = crate::trust_audit::profiles(data_home, &home);
    let local = crate::trust_audit::profile_summaries(&local_profiles).into_iter()
        .map(|profile| json!({"slug": profile.id, "state": "available", "source": profile.source, "adapter": profile.adapter, "watch_priority": profile.watch_priority}))
        .collect::<Vec<_>>();
    metadata_response(data_home, json!({"pending": pending_summaries(data_home)?, "approved": approved,
        "local_profiles": local, "history": event_history(data_home)}))
}

fn record_event(data_home: &Path, status: &str, slug: &str) {
    let now_ms = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH)
        .map(|value| value.as_millis() as i64).unwrap_or(0);
    let line = serde_json::json!({"status": status, "slug": slug, "at_ms": now_ms}).to_string() + "\n";
    let path = data_home.join(EVENT_LOG);
    use std::io::Write;
    if let Ok(mut file) = std::fs::OpenOptions::new().create(true).append(true).open(path) {
        let _ = file.write_all(line.as_bytes());
    }
}

fn event_history(data_home: &Path) -> Vec<Value> {
    let Ok(raw) = std::fs::read_to_string(data_home.join(EVENT_LOG)) else { return Vec::new() };
    raw.lines().filter_map(|line| serde_json::from_str::<Value>(line).ok()).collect()
}

fn pending_summaries(data_home: &Path) -> Result<Vec<Value>, ToolError> {
    let dir = proposal_dir(data_home);
    let Ok(entries) = std::fs::read_dir(dir) else { return Ok(Vec::new()) };
    let mut paths = entries.flatten().map(|entry| entry.path()).filter(|path| path.extension().and_then(|v| v.to_str()) == Some("json")).collect::<Vec<_>>();
    paths.sort();
    let mut out = Vec::new();
    for path in paths {
        let Ok(bytes) = std::fs::read(&path) else { continue };
        let Ok(manifest) = serde_json::from_slice::<Value>(&bytes) else { continue };
        let state = if validate_manifest(&manifest).is_ok() { "pending" } else { "invalid" };
        out.push(safe_manifest_summary(&manifest, state, &manifest_hash(&manifest)));
    }
    Ok(out)
}

/// UI-only approval primitive. MCP deliberately has no dispatch route to this
/// function. The pending file is atomically installed as a normal host
/// manifest, after revalidation, and then removed from the proposal queue.
pub fn approve_staged(data_home: &Path, slug: &str) -> Result<Value, String> {
    if !agent_vitals_runtime_slug_ok(slug) { return Err("invalid Trust profile slug".to_string()); }
    let pending = proposal_dir(data_home).join(format!("{slug}.json"));
    let bytes = std::fs::read(&pending).map_err(|_| "proposal not found".to_string())?;
    let manifest: Value = serde_json::from_slice(&bytes).map_err(|_| "proposal is invalid JSON".to_string())?;
    let (parsed, _) = validate_manifest(&manifest).map_err(|error| error.message)?;
    if parsed.slug != slug { return Err("proposal slug mismatch".to_string()); }
    let host_dir = data_home.join("hosts.d").join(slug);
    std::fs::create_dir_all(&host_dir).map_err(|_| "could not create host directory".to_string())?;
    let temporary = host_dir.join(".manifest.json.tmp");
    std::fs::write(&temporary, &bytes).map_err(|_| "could not write host manifest".to_string())?;
    std::fs::rename(&temporary, host_dir.join("manifest.json")).map_err(|_| "could not commit host manifest atomically".to_string())?;
    std::fs::remove_file(pending).map_err(|_| "host activated but proposal cleanup failed".to_string())?;
    record_event(data_home, "approved", slug);
    Ok(json!({"status":"approved", "slug":slug, "manifest_hash":manifest_hash(&manifest)}))
}

pub fn reject_staged(data_home: &Path, slug: &str) -> Result<Value, String> {
    if !agent_vitals_runtime_slug_ok(slug) { return Err("invalid Trust profile slug".to_string()); }
    std::fs::remove_file(proposal_dir(data_home).join(format!("{slug}.json"))).map_err(|_| "proposal not found".to_string())?;
    record_event(data_home, "rejected", slug);
    Ok(json!({"status":"rejected", "slug":slug}))
}

/// UI-only revocation. Moving the approved directory out of `hosts.d` keeps a
/// recoverable local copy while making the host disappear from the active
/// registry on the next scan.
pub fn revoke_approved(data_home: &Path, slug: &str) -> Result<Value, String> {
    if !agent_vitals_runtime_slug_ok(slug) { return Err("invalid Trust profile slug".to_string()); }
    let active = data_home.join("hosts.d").join(slug);
    if !active.exists() { return Err("approved profile not found".to_string()); }
    let revoked_root = data_home.join("hosts-revoked");
    std::fs::create_dir_all(&revoked_root).map_err(|_| "could not create revoked profile store".to_string())?;
    let destination = revoked_root.join(slug);
    if destination.exists() { return Err("a revoked profile with this slug already exists".to_string()); }
    std::fs::rename(active, destination).map_err(|_| "could not revoke Trust profile atomically".to_string())?;
    record_event(data_home, "revoked", slug);
    Ok(json!({"status":"revoked", "slug":slug}))
}

fn agent_vitals_runtime_slug_ok(slug: &str) -> bool {
    crate::host_registry::plugin_slug_ok(slug)
}

#[cfg(test)]
mod tests {
    use super::*;
    use agent_vitals_data::authority::AuthorityDb;

    fn manifest() -> Value {
        serde_json::json!({
            "manifest_version": 1, "slug": "minimax-code",
            "display": {"name": "MiniMax Code"},
            "discovery": {"roots": ["~/minimax"], "include": ["*.jsonl"]},
            "source": {"format": "jsonl"},
            "session": {"from": "filename", "pattern": "^s_(?P<id>.+)\\.jsonl$"},
            "recipe": "request-usage-openai-total-input-v1",
            "event_key": {"paths": ["request_id"]},
            "trust": {"roots": ["~/.minimax/cache"], "artifact_terms": ["snapshot"], "extensions": [".enc"]}
        })
    }

    fn seeded_home(tag: &str) -> std::path::PathBuf {
        let home = std::env::temp_dir().join(format!("av-trust-profile-{tag}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&home);
        std::fs::create_dir_all(&home).unwrap();
        let path = agent_vitals_data::authority::default_authority_path(&home);
        let _ = AuthorityDb::open(&path, 1).unwrap();
        home
    }

    fn fresh_home(tag: &str) -> std::path::PathBuf {
        let home = std::env::temp_dir().join(format!("av-trust-profile-fresh-{tag}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&home);
        std::fs::create_dir_all(&home).unwrap();
        home
    }

    #[test]
    fn metadata_and_staging_work_before_authority_db_initialization() {
        let home = fresh_home("metadata");
        assert_eq!(run_schema(&home).unwrap()["authority_state"], "unavailable");
        assert_eq!(run_list(&home).unwrap()["data"]["approved"].as_array().unwrap().len(), 0);
        assert_eq!(run_status(&home).unwrap()["data"]["pending"].as_array().unwrap().len(), 0);
        let staged = run_stage(&json!({"manifest": manifest()}), &home, true).unwrap();
        assert_eq!(staged["authority_state"], "unavailable");
        assert_eq!(staged["data"]["status"], "staged");
        assert!(home.join(PENDING_DIR).join("minimax-code.json").exists());
        let _ = std::fs::remove_dir_all(&home);
    }

    #[test]
    fn validation_is_side_effect_free_and_requires_trust() {
        let home = seeded_home("validate");
        let result = run_validate(&json!({"manifest": manifest()}), &home).unwrap();
        assert_eq!(result["data"]["status"], "valid");
        assert!(!home.join(PENDING_DIR).exists(), "validation must not create a proposal directory");
        let mut without_trust = manifest();
        without_trust.as_object_mut().unwrap().remove("trust");
        assert_eq!(run_validate(&json!({"manifest": without_trust}), &home).unwrap_err().code, "invalid_argument");
        let mut absolute = manifest();
        absolute["trust"]["roots"] = json!(["/tmp/secrets"]);
        assert_eq!(run_validate(&json!({"manifest": absolute}), &home).unwrap_err().code, "invalid_argument");
        let mut unknown = manifest();
        unknown["trust"]["command"] = json!("must-not-run");
        assert_eq!(run_validate(&json!({"manifest": unknown}), &home).unwrap_err().code, "invalid_argument");
        let _ = std::fs::remove_dir_all(&home);
    }

    #[test]
    fn stage_requires_permission_and_approval_is_separate() {
        let home = seeded_home("stage");
        let args = json!({"manifest": manifest()});
        assert_eq!(run_stage(&args, &home, false).unwrap_err().code, "permission_denied");
        let staged = run_stage(&args, &home, true).unwrap();
        assert_eq!(staged["data"]["status"], "staged");
        assert!(!home.join("hosts.d/minimax-code/manifest.json").exists());
        let approved = approve_staged(&home, "minimax-code").unwrap();
        assert_eq!(approved["status"], "approved");
        assert!(home.join("hosts.d/minimax-code/manifest.json").exists());
        revoke_approved(&home, "minimax-code").unwrap();
        assert!(!home.join("hosts.d/minimax-code").exists());
        let _ = std::fs::remove_dir_all(&home);
    }
}
