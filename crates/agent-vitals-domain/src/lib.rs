//! Cross-host business computation of agent-vitals — the single source of truth
//! for the pure rules, shared by the native CLI, the wasm build and the Tauri
//! menu bar (all through the `agent-vitals-core` facade).
//!
//! v0.8 Phase C Step 4b carved this out of `agent-vitals-core`. It carries the
//! `domain/` modules (behavior/trajectory/cost/usage/detectors/plan/…), the
//! `domain/dsh/` DSH-wire interpreters (registered layer-2 debt — see
//! `domain/dsh/mod.rs`) and the `compatibility/` bridge onto `vitals-core`. It
//! depends on `agent-vitals-contracts` for the shared vocabulary and re-exports
//! it, so the flat paths (`crate::evidence`, `crate::host_capability`) that the
//! domain modules use resolve unchanged.
//!
//! `agent-vitals-core` is now a thin `pub use` facade over this crate +
//! `agent-vitals-contracts`; every `agent_vitals_core::{behavior,cost,…}` path
//! the binary / wasm / adapters use still resolves.

pub mod compatibility;
pub mod domain;

// 契约层透传——`domain/*.rs` 与 `compatibility/*.rs` 用 `crate::evidence` /
// `crate::host_capability` 等扁平路径引契约，这里把它们补齐。
pub use agent_vitals_contracts::{
    contracts, evidence, host_capability, r2a, source_identity, usage_fact,
};

// DSH-wire 债（`domain/dsh/`）——扁平别名与迁出前一致。
pub use domain::dsh::{audit, compaction, evidence as dsh_evidence, waste};

// domain 计算模块的扁平别名——迁出前 `agent_vitals_core::behavior::*` 等。
pub use domain::{
    behavior, budget, canonical_audit, coords, cost, detectors, duration, findings, plan, skill,
    state, subagent, takeover, trajectory, usage, util,
};
