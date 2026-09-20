//! Read-only historical artifact discovery for Trust/Egress audit.
//!
//! A Trust profile says where a client leaves evidence; the Observation and
//! correlation model stays vendor-neutral. An installed-but-unprofiled client
//! is coverage work, never a Finding.

use std::path::{Component, Path, PathBuf};

use agent_vitals_domain::trust::{
    TrustActorKind, TrustConsentState, TrustEvidenceLevel, TrustObservation,
    TrustObservationKind, TrustStage,
};
use crate::trust_identity::TrustIdentity;
use serde::{Deserialize, Serialize};
use serde_json::json;
use walkdir::WalkDir;

const RETENTION_MS: i64 = 7 * 24 * 60 * 60 * 1000;
const PROFILE_VERSION: u64 = 1;
const PROFILE_DIRECTORY: &str = "trust-hosts.d";

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum MatchMode { AnyTermOrExtension, TermAndExtension }

/// A validated artifact profile. It deliberately has no network endpoint or
/// raw-log parser: those require a higher evidence-grade adapter.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct TrustAuditProfile {
    id: String,
    display: String,
    roots: Vec<PathBuf>,
    artifact_terms: Vec<String>,
    extensions: Vec<String>,
    actor_id: String,
    collector_id: String,
    source: &'static str,
    match_mode: MatchMode,
}

impl TrustAuditProfile {
    pub fn id(&self) -> &str { &self.id }
    #[allow(clippy::too_many_arguments)]
    fn builtin(
        id: &str, display: &str, roots: Vec<PathBuf>, artifact_terms: &[&str],
        extensions: &[&str], actor_id: &str, collector_id: &str, match_mode: MatchMode,
    ) -> Self {
        Self {
            id: id.to_string(), display: display.to_string(), roots,
            artifact_terms: artifact_terms.iter().map(|v| (*v).to_string()).collect(),
            extensions: extensions.iter().map(|v| (*v).to_string()).collect(),
            actor_id: actor_id.to_string(), collector_id: collector_id.to_string(),
            source: "built_in", match_mode,
        }
    }

    fn imported(
        home: &Path, id: &str, display: &str,
        spec: &agent_vitals_hosts::generic_manifest::TrustArtifactProfile,
    ) -> Result<Self, String> {
        let roots = spec.roots.iter().map(|root| expand_profile_root(home, root)).collect::<Result<Vec<_>, _>>()?;
        Ok(Self {
            id: id.to_string(), display: display.to_string(), roots,
            artifact_terms: spec.artifact_terms.clone(), extensions: spec.extensions.clone(),
            actor_id: format!("{id}-client"), collector_id: format!("{id}-imported-artifact-metadata"),
            source: "imported_host_manifest", match_mode: MatchMode::TermAndExtension,
        })
    }
}

/// Coverage is separate from Findings. `detected` only says a local client
/// directory exists; it does not say data was packaged or uploaded.
#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
pub struct TrustHostCandidate {
    pub id: String,
    pub detected: bool,
    pub artifact_profile_available: bool,
    pub coverage_state: String,
}

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
pub struct TrustProfileSummary {
    pub id: String,
    pub display: String,
    pub source: String,
    pub capability: String,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct TrustAuditReport {
    pub host: String,
    pub discovered: usize,
    pub inserted: usize,
    pub duplicate: usize,
    pub findings_upserted: usize,
    pub evidence_links_added: usize,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct ProfileFile {
    profile_version: u64,
    id: String,
    display: String,
    roots: Vec<String>,
    artifact_terms: Vec<String>,
    extensions: Vec<String>,
}

/// Evidence-backed seed adapters. Additional profiles load from the local
/// profile directory; the architecture is not a two-vendor allow-list.
pub fn builtin_profiles(home: &Path) -> Vec<TrustAuditProfile> {
    vec![
        TrustAuditProfile::builtin(
            "zcode", "ZCode", vec![home.join(".zcode/v2/checkpoints")],
            &["checkpoint", "snapshot"], &[".enc"], "zcode-client",
            "zcode-checkpoint-metadata", MatchMode::AnyTermOrExtension,
        ),
        TrustAuditProfile::builtin(
            "minimax-code", "MiniMax Code", vec![
                home.join(".minimax"), home.join(".minimax-agent-cn"),
                home.join("Library/Application Support/MiniMax"),
            ], &["snapshot", "checkpoint", "eval"],
            &[".json", ".enc", ".log", ".state"], "minimax-code-client",
            "minimax-code-artifact-metadata", MatchMode::TermAndExtension,
        ),
    ]
}

fn safe_identifier(value: &str, max_len: usize) -> bool {
    value.bytes().next().is_some_and(|byte| byte.is_ascii_lowercase()) && value.len() <= max_len && value.bytes().all(|byte|
        byte.is_ascii_lowercase() || byte.is_ascii_digit() || matches!(byte, b'-' | b'_' | b'.'))
}

fn safe_display(value: &str) -> bool {
    !value.is_empty() && value.len() <= 80 && value.chars().all(|ch|
        ch.is_ascii_alphanumeric() || matches!(ch, ' ' | '-' | '_'))
}

fn expand_profile_root(home: &Path, root: &str) -> Result<PathBuf, String> {
    let relative = root.strip_prefix("~/").ok_or_else(|| "roots must start with ~/".to_string())?;
    if relative.is_empty() || relative.len() > 240 { return Err("root is empty or too long".to_string()); }
    let path = Path::new(relative);
    if path.is_absolute() || path.components().any(|part| !matches!(part, Component::Normal(_))) {
        return Err("root must not contain ., .., or an absolute path".to_string());
    }
    Ok(home.join(path))
}

fn parse_profile_file(home: &Path, raw: &[u8]) -> Result<TrustAuditProfile, String> {
    let profile: ProfileFile = serde_json::from_slice(raw).map_err(|error| format!("invalid JSON: {error}"))?;
    if profile.profile_version != PROFILE_VERSION { return Err(format!("unsupported profile_version {}", profile.profile_version)); }
    if !safe_identifier(&profile.id, 32) { return Err("id must be a lower-case identifier".to_string()); }
    if !safe_display(&profile.display) { return Err("display contains unsupported characters".to_string()); }
    if profile.roots.is_empty() || profile.roots.len() > 8 { return Err("roots must contain 1 to 8 entries".to_string()); }
    if profile.artifact_terms.is_empty() || profile.artifact_terms.len() > 8 || !profile.artifact_terms.iter().all(|term| safe_identifier(term, 40)) {
        return Err("artifact_terms must contain 1 to 8 lower-case identifiers".to_string());
    }
    if profile.extensions.is_empty() || profile.extensions.len() > 8 || !profile.extensions.iter().all(|extension| extension.strip_prefix('.').is_some_and(|suffix| safe_identifier(suffix, 16))) {
        return Err("extensions must contain 1 to 8 safe extensions".to_string());
    }
    let mut roots = Vec::new();
    for root in &profile.roots { roots.push(expand_profile_root(home, root)?); }
    Ok(TrustAuditProfile {
        actor_id: format!("{}-client", profile.id), collector_id: format!("{}-artifact-metadata", profile.id),
        id: profile.id, display: profile.display, roots, artifact_terms: profile.artifact_terms,
        extensions: profile.extensions, source: "local_profile", match_mode: MatchMode::TermAndExtension,
    })
}

/// Load optional local profiles from `<data_home>/trust-hosts.d`. Invalid files
/// are isolated and only a safe label plus reason is returned.
pub fn profiles(data_home: &Path, home: &Path) -> (Vec<TrustAuditProfile>, Vec<String>) {
    let mut loaded = builtin_profiles(home);
    let mut errors = Vec::new();
    let (plugin_hosts, plugin_host_errors) = crate::host_registry::scan_plugin_hosts(data_home);
    errors.extend(plugin_host_errors.into_iter().map(|_| "plugin_host_manifest_invalid".to_string()));
    for plugin in plugin_hosts {
        let Some(spec) = plugin.trust_profile.as_ref() else { continue; };
        match TrustAuditProfile::imported(home, &plugin.slug, &plugin.display_name, spec) {
            Ok(profile) => {
                if let Some(index) = loaded.iter().position(|present| present.id == profile.id) {
                    loaded[index] = profile;
                } else {
                    loaded.push(profile);
                }
            }
            Err(_) => errors.push("plugin_host_trust_profile_invalid".to_string()),
        }
    }
    let directory = data_home.join(PROFILE_DIRECTORY);
    let Ok(entries) = std::fs::read_dir(directory) else { return (loaded, errors); };
    let mut files: Vec<PathBuf> = entries.flatten().map(|entry| entry.path())
        .filter(|path| path.extension().and_then(|value| value.to_str()) == Some("json")).collect();
    files.sort();
    for file in files {
        let label = file.file_stem().and_then(|value| value.to_str()).filter(|value| safe_identifier(value, 32)).unwrap_or("profile");
        let parsed = std::fs::read(&file).map_err(|_| "file unreadable".to_string()).and_then(|raw| parse_profile_file(home, &raw));
        match parsed {
            Ok(profile) if loaded.iter().any(|present| present.id == profile.id) => errors.push(format!("{label}: duplicate id")),
            Ok(profile) => loaded.push(profile),
            Err(error) => errors.push(format!("{label}: {error}")),
        }
    }
    loaded.sort_by(|left, right| left.id.cmp(&right.id));
    (loaded, errors)
}

pub fn profile_summaries(profiles: &[TrustAuditProfile]) -> Vec<TrustProfileSummary> {
    profiles.iter().map(|profile| TrustProfileSummary {
        id: profile.id.clone(), display: profile.display.clone(), source: profile.source.to_string(),
        capability: "historical_artifact_only".to_string(),
    }).collect()
}

/// Discover well-known client roots without inspecting their content. This is
/// coverage inventory, not behavioral detection or a vendor risk ranking.
pub fn discover_host_candidates(home: &Path, profiles: &[TrustAuditProfile]) -> Vec<TrustHostCandidate> {
    let candidates: [(&str, &[&str]); 10] = [
        ("zcode", &[".zcode"]), ("minimax-code", &[".minimax", ".minimax-agent-cn", "Library/Application Support/MiniMax"]),
        ("codex", &[".codex"]), ("claude-code", &[".claude"]), ("cursor", &[".cursor"]),
        ("windsurf", &[".windsurf", ".codeium/windsurf"]), ("cline", &[".cline"]),
        ("continue", &[".continue"]), ("aider", &[".aider"]), ("opencode", &[".opencode"]),
    ];
    candidates.into_iter().map(|(id, roots)| {
        let detected = roots.iter().any(|root| home.join(root).is_dir());
        let available = profiles.iter().any(|profile| profile.id == id);
        TrustHostCandidate {
            id: id.to_string(), detected, artifact_profile_available: available,
            coverage_state: if !detected { "not_detected" } else if available { "profiled" } else { "detected_unprofiled" }.to_string(),
        }
    }).collect()
}

fn artifact_name_matches(profile: &TrustAuditProfile, name: &str) -> bool {
    let name = name.to_ascii_lowercase();
    let has_term = profile.artifact_terms.iter().any(|term| name.contains(term));
    let has_extension = profile.extensions.iter().any(|extension| name.ends_with(extension));
    match profile.match_mode {
        MatchMode::AnyTermOrExtension => has_term || has_extension,
        MatchMode::TermAndExtension => has_term && has_extension,
    }
}

/// Scan one profile and emit only E1 package observations. It is generic over
/// the profile and never reads file content.
pub fn scan_history(
    profile: &TrustAuditProfile, identity: &TrustIdentity, machine_namespace: &str, observed_at_ms: i64,
) -> Vec<TrustObservation> {
    if observed_at_ms < 0 || machine_namespace.is_empty() { return Vec::new(); }
    let mut observations = Vec::new();
    for root in &profile.roots {
        if !root.is_dir() { continue; }
        for entry in WalkDir::new(root).follow_links(false).max_depth(5).into_iter().filter_map(Result::ok) {
            if !entry.file_type().is_file() || !artifact_name_matches(profile, &entry.file_name().to_string_lossy()) { continue; }
            let Ok(metadata) = entry.metadata() else { continue; };
            let path_ref = identity.event_ref(&entry.path().to_string_lossy());
            let workspace = profile.roots.iter().find(|root| entry.path().starts_with(root));
            let workspace_ref = workspace.map(|root| identity.workspace_ref(root));
            let actor_ref = identity.actor_ref(&profile.actor_id);
            observations.push(TrustObservation {
                observation_id: format!("{}_{}", profile.id, path_ref), machine_namespace: machine_namespace.to_string(), host: profile.id.clone(),
                actor_id: actor_ref, actor_kind: TrustActorKind::Sidecar, actor_version: None,
                observed_at_ms, observation_kind: TrustObservationKind::Package, stage: TrustStage::PackageObserved,
                evidence_level: TrustEvidenceLevel::E1LocalArtifact, workspace_ref,
                scope_classes: vec!["snapshot_artifact".to_string()], file_count: Some(1), byte_count: i64::try_from(metadata.len()).ok(),
                destination_class: None, destination_host: None, consent_kind: None, consent_state: TrustConsentState::Unavailable,
                source_id: None, native_event_id: Some(path_ref), source_line: None, source_byte_offset: None,
                collector_id: profile.collector_id.clone(), collector_version: "v1".to_string(),
                provenance: json!({"artifact": "encrypted_or_snapshot", "content_read": false, "profile_source": profile.source}),
                expires_at_ms: observed_at_ms.checked_add(RETENTION_MS),
            });
        }
    }
    observations.sort_by(|a, b| a.observation_id.cmp(&b.observation_id));
    observations
}

/// Scan one local client and persist only redacted observations plus derived
/// Findings. A failed scan never leaves a partially linked Finding behind.
pub fn audit_and_store(
    data_home: &Path, profile: &TrustAuditProfile, machine_namespace: &str, now_ms: i64,
) -> Result<TrustAuditReport, String> {
    let identity = TrustIdentity::load_or_create(data_home)?;
    let observations = scan_history(profile, &identity, machine_namespace, now_ms);
    let authority = agent_vitals_data::authority::AuthorityDb::open(
        &agent_vitals_data::authority::default_authority_path(data_home), now_ms,
    ).map_err(|error| format!("authority open failed: {error}"))?;
    let run_id = format!("trust-audit:{}:{}", profile.id, now_ms);
    authority.begin_run(&run_id, "trust-audit", now_ms)
        .map_err(|error| format!("trust audit run begin failed: {error}"))?;
    let write = authority.with_immediate_txn(|conn| {
        let inserted = agent_vitals_data::trust::insert_observations(conn, &observations, &run_id, now_ms)?;
        let ids: Vec<String> = observations.iter().map(|row| row.observation_id.clone()).collect();
        let correlation = agent_vitals_data::trust_correlator::correlate_selected(conn, &ids)?;
        Ok((inserted, correlation))
    });
    match write {
        Ok((inserted, correlation)) => {
            authority.finish_run(&run_id, "succeeded", None, None, now_ms)
                .map_err(|error| format!("trust audit run finish failed: {error}"))?;
            Ok(TrustAuditReport {
                host: profile.id.clone(), discovered: observations.len(), inserted: inserted.inserted,
                duplicate: inserted.duplicate, findings_upserted: correlation.findings_upserted,
                evidence_links_added: correlation.evidence_links_added,
            })
        }
        Err(error) => {
            let _ = authority.finish_run(&run_id, "failed", Some("trust_audit_write_failed"), Some(&error.to_string()), now_ms);
            Err(format!("trust audit write failed: {error}"))
        }
    }
}

/// Safe, authority-only Finding rollup for desktop/CLI presentation.
pub fn findings_summary(data_home: &Path) -> Result<Vec<agent_vitals_data::trust_correlator::TrustFindingSummary>, String> {
    let authority = agent_vitals_data::authority::AuthorityDb::open_readonly(
        &agent_vitals_data::authority::default_authority_path(data_home),
    ).map_err(|error| format!("authority read failed: {error}"))?;
    agent_vitals_data::trust_correlator::findings_summary(authority.conn())
        .map_err(|error| format!("trust findings summary failed: {error}"))
}

#[cfg(test)]
mod tests {
    use super::{audit_and_store, builtin_profiles, discover_host_candidates, profiles, scan_history};
    use crate::trust_identity::TrustIdentity;

    #[test]
    fn zcode_scan_is_read_only_and_path_redacted() {
        let root = std::env::temp_dir().join(format!("agent-vitals-zcode-trust-{}", std::process::id()));
        std::fs::create_dir_all(root.join(".zcode/v2/checkpoints/workspace-private")).unwrap();
        let artifact = root.join(".zcode/v2/checkpoints/workspace-private/snapshot.enc");
        std::fs::write(&artifact, b"not-read-by-scanner").unwrap();
        let profile = builtin_profiles(&root).into_iter().find(|item| item.id() == "zcode").unwrap();
        let identity = TrustIdentity::load_or_create(&root).unwrap();
        let rows = scan_history(&profile, &identity, "machine-1", 1);
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].byte_count, Some(19));
        assert!(!rows[0].observation_id.contains("workspace-private"));
        assert!(rows[0].workspace_ref.is_some());
        assert!(!rows[0].native_event_id.as_deref().unwrap().contains("workspace-private"));
        assert!(rows[0].validate().is_ok());
        std::fs::remove_dir_all(root).ok();
    }

    #[test]
    fn local_profile_is_restricted_and_extensible() {
        let root = std::env::temp_dir().join(format!("agent-vitals-trust-profile-{}", std::process::id()));
        let data = root.join("data/trust-hosts.d");
        std::fs::create_dir_all(&data).unwrap();
        std::fs::write(data.join("cursor.json"), r#"{"profile_version":1,"id":"cursor","display":"Cursor","roots":["~/.cursor/cache"],"artifact_terms":["snapshot"],"extensions":[".enc"]}"#).unwrap();
        std::fs::create_dir_all(root.join(".cursor/cache")).unwrap();
        std::fs::write(root.join(".cursor/cache/repo-snapshot.enc"), b"x").unwrap();
        let (loaded, errors) = profiles(&root.join("data"), &root);
        assert!(errors.is_empty());
        let profile = loaded.iter().find(|item| item.id() == "cursor").unwrap();
        let identity = TrustIdentity::load_or_create(&root).unwrap();
        assert_eq!(scan_history(profile, &identity, "machine", 1).len(), 1);
        std::fs::write(data.join("bad.json"), r#"{"profile_version":1,"id":"bad","display":"Bad","roots":["/tmp"],"artifact_terms":["snapshot"],"extensions":[".enc"]}"#).unwrap();
        let (_, errors) = profiles(&root.join("data"), &root);
        assert_eq!(errors.len(), 1);
        std::fs::remove_file(data.join("bad.json")).unwrap();
        std::fs::write(data.join("unknown.json"), r#"{"profile_version":1,"id":"unknown","display":"Unknown","roots":["~/.unknown"],"artifact_terms":["snapshot"],"extensions":[".enc"],"command":"must-not-run"}"#).unwrap();
        let (_, errors) = profiles(&root.join("data"), &root);
        assert_eq!(errors.len(), 1, "profile parser must fail closed on unknown fields");
        std::fs::remove_dir_all(root).ok();
    }

    #[test]
    fn discovery_marks_unprofiled_client_as_coverage_not_finding() {
        let root = std::env::temp_dir().join(format!("agent-vitals-trust-discovery-{}", std::process::id()));
        std::fs::create_dir_all(root.join(".cursor")).unwrap();
        let candidates = discover_host_candidates(&root, &builtin_profiles(&root));
        let cursor = candidates.iter().find(|item| item.id == "cursor").unwrap();
        assert!(cursor.detected);
        assert_eq!(cursor.coverage_state, "detected_unprofiled");
        std::fs::remove_dir_all(root).ok();
    }

    #[test]
    fn imported_host_manifest_replaces_builtin_profile_without_rebuild() {
        let root = std::env::temp_dir().join(format!("agent-vitals-trust-plugin-{}", std::process::id()));
        let host_dir = root.join("data/hosts.d/zcode");
        std::fs::create_dir_all(&host_dir).unwrap();
        std::fs::write(host_dir.join("manifest.json"), r#"{
            "manifest_version":1,"slug":"zcode","display":{"name":"ZCode"},
            "discovery":{"roots":["~/.zcode/cli/rollout"],"include":["*.jsonl"]},
            "source":{"format":"jsonl"},"session":{"from":"filename","pattern":"^s_(?P<id>.+)\\.jsonl$"},
            "recipe":"request-usage-anthropic-v1","event_key":{"paths":["requestId"]},
            "trust":{"roots":["~/.zcode/v2/checkpoints"],"artifact_terms":["snapshot"],"extensions":[".enc"]}
        }"#).unwrap();
        let (loaded, errors) = profiles(&root.join("data"), &root);
        assert!(errors.is_empty());
        let profile = loaded.iter().find(|item| item.id() == "zcode").unwrap();
        assert_eq!(profile.source, "imported_host_manifest");
        std::fs::remove_dir_all(root).ok();
    }

    #[test]
    fn audit_writes_auditable_run_and_is_idempotent() {
        let root = std::env::temp_dir().join(format!("agent-vitals-zcode-store-{}", std::process::id()));
        std::fs::create_dir_all(root.join(".zcode/v2/checkpoints/x")).unwrap();
        std::fs::write(root.join(".zcode/v2/checkpoints/x/snapshot.enc"), b"x").unwrap();
        let data = root.join("data");
        let profile = builtin_profiles(&root).into_iter().find(|item| item.id() == "zcode").unwrap();
        let first = audit_and_store(&data, &profile, "machine-1", 10).unwrap();
        assert_eq!((first.discovered, first.inserted, first.duplicate), (1, 1, 0));
        let second = audit_and_store(&data, &profile, "machine-1", 11).unwrap();
        assert_eq!((second.discovered, second.inserted, second.duplicate), (1, 0, 1));
        std::fs::remove_dir_all(root).ok();
    }
}
