//! Pure computation facade of agent-vitals, shared by the native CLI and the
//! browser wasm build.
//!
//! Phase A carved the crate into `contracts/` (shared vocabulary + the
//! `vitals-core` bridge), `domain/` (cross-host business computation) and
//! `compatibility/`. Phase C (B2) moved the leaf host adapters + Codex fold +
//! cross-host canonical layer out to `agent-vitals-adapters`. What DSH wire
//! interpretation remains (`domain/dsh/` — `evidence`/`audit`/`compaction`/
//! `waste`) is registered layer-2 debt: `domain/*.rs` tests build
//! `CanonicalSession` fixtures through `build_dsh_evidence`, which a separate
//! crate + dev-dependency cycle cannot satisfy. It retires with the wire/fold
//! separation (post-Phase-D).
//!
//! `lib.rs` re-exports keep the old flat paths (`agent_vitals_core::behavior::*`
//! etc.) for the CLI / Tauri / WASM / tests.

pub mod compatibility;
pub mod contracts;
pub mod domain;

pub use contracts::{evidence, host_capability, r2a, source_identity, usage_fact};
pub use domain::dsh::{audit, compaction, evidence as dsh_evidence, waste};
pub use domain::{
    behavior, budget, canonical_audit, coords, cost, detectors, duration, findings, plan, skill,
    state, subagent, takeover, trajectory, usage, util,
};
