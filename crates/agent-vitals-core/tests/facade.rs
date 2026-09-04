//! `agent-vitals-core` is the Phase C Step 4 **thin re-export facade** — its
//! `src/` holds only `lib.rs`. This test pins that the historical flat paths
//! (`agent_vitals_core::{evidence,behavior,cost,compatibility,dsh_evidence,…}`)
//! still resolve after the split into `agent-vitals-contracts` +
//! `agent-vitals-domain`, so the CLI binary / wasm / adapters / Tauri menu bar
//! call sites need no change. A dropped re-export fails this at compile time.

#[test]
fn contract_paths_still_resolve_through_the_facade() {
    // vocabulary layer (from agent-vitals-contracts)
    let _ = agent_vitals_core::host_capability::HOSTS;
    let _ = agent_vitals_core::usage_fact::USAGE_FACT_FIELDS;
    let _ = agent_vitals_core::source_identity::fnv1a64_hex(b"x");
    let _ = agent_vitals_core::evidence::Signal::ALL;
    let _ = agent_vitals_core::r2a::CURRENT_CONTRACT_VERSION;
    assert_eq!(
        agent_vitals_core::contracts::usage_fact::USAGE_FACT_FIELDS,
        agent_vitals_core::usage_fact::USAGE_FACT_FIELDS,
    );
}

#[test]
fn domain_paths_still_resolve_through_the_facade() {
    // domain computation (from agent-vitals-domain)
    let _ = agent_vitals_core::audit::match_behavior(&[], None);
    let _ = agent_vitals_core::audit::match_trajectory(&[]);
    let _ = agent_vitals_core::cost::load_pricing();
    let _ = agent_vitals_core::compaction::compaction_events(&[]);
    let _ = agent_vitals_core::waste::detect_structural_waste(&[], &[]);
    let _f = agent_vitals_core::dsh_evidence::build_dsh_evidence;
    // compatibility bridge onto vitals-core
    let _ = agent_vitals_core::compatibility::canonical_session::SIGNAL_TOOL_CALLS;
    assert_eq!(
        agent_vitals_core::domain::usage::AMBIGUOUS_PROVIDER,
        agent_vitals_core::usage::AMBIGUOUS_PROVIDER,
    );
}
