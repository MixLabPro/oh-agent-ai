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
// `contracts`, `domain`, and `adapters::hosts` namespaces. Remove these aliases
// only after Phase B/C consumers migrate.
pub use adapters::hosts::claude_code::sessions::evidence as claude_code_evidence;
pub use adapters::hosts::codex::sessions::evidence as codex_evidence;
pub use adapters::hosts::codex::sessions::usage as codex_usage;
pub use adapters::hosts::dsh::sessions::evidence as dsh_evidence;
pub use adapters::hosts::workbuddy::sessions::evidence as workbuddy_evidence;
pub use contracts::{evidence, host_capability, r2a, source_identity, usage_fact};
pub use domain::{
    behavior, budget, canonical_audit, compaction, cost, detectors, duration, findings, plan,
    skill, state, subagent, takeover, trajectory, usage, util, waste,
};
