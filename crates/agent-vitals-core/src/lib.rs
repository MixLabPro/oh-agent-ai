//! Pure computation facade of agent-vitals, shared by the native CLI and the
//! browser wasm build. Phase A makes the contracts/domain/adapters ownership
//! explicit inside the existing crate without changing public behavior.
//!
//! The split is the disk ≠ context boundary from the repo's design: the wasm
//! build can run these pure functions on data already in memory, but it must
//! never read a file.

pub mod adapters;
pub mod compatibility;
pub mod contracts;
pub mod domain;

// Phase A compatibility facade. Existing CLI, Tauri, WASM, tests and Python
// parity references keep their old paths while new code uses the explicit
// `contracts`, `domain`, and adapter namespaces. Leaf adapters moved to
// `agent-vitals-adapters` in Phase B. These two residual aliases stay until
// Phase C removes the domain → host dependency.
pub use adapters::hosts::codex::sessions::usage as codex_usage;
pub use adapters::hosts::dsh::sessions::{
    audit, compaction, evidence as dsh_evidence, waste,
};
pub use contracts::{evidence, host_capability, r2a, source_identity, usage_fact};
pub use domain::{
    behavior, budget, canonical_audit, coords, cost, detectors, duration, findings, plan, skill,
    state, subagent, takeover, trajectory, usage, util,
};
