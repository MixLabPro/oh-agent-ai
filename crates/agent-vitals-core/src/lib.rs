//! Compatibility facade for agent-vitals.
//!
//! v0.8 Phase C split the old monolithic `agent-vitals-core` into two crates:
//! `agent-vitals-contracts` (host-agnostic vocabulary — `evidence`,
//! `host_capability`, `source_identity`, `usage_fact`, `r2a`) and
//! `agent-vitals-domain` (all the pure business computation +
//! `compatibility/`). This crate keeps **no code of its own** — it is a pure
//! `pub use` facade so every historical flat path
//! (`agent_vitals_core::behavior::*`, `agent_vitals_core::evidence::*`,
//! `agent_vitals_core::compatibility::*`, …) that the CLI binary, the Tauri
//! menu bar, the wasm crate and `agent-vitals-adapters` import still resolves
//! for one version cycle. New code should import from `agent-vitals-domain` /
//! `agent-vitals-contracts` directly.

pub use agent_vitals_contracts::{
    contracts, evidence, host_capability, r2a, source_identity, usage_fact,
};
pub use agent_vitals_domain::{
    audit, behavior, budget, canonical_audit, compaction, compatibility, coords, cost, detectors,
    domain, dsh_evidence, duration, findings, plan, skill, state, subagent, takeover, trajectory,
    usage, util, waste,
};
