//! Cross-host Agent Vitals computations.
//!
//! Phase A changes ownership and navigation only. `usage` and `cost` still
//! contain known host-era compatibility seams; their semantic split belongs
//! to Phase C and is guarded by the existing parity and golden suites.

pub mod behavior;
pub mod budget;
pub mod canonical_audit;
pub mod compaction;
pub mod cost;
pub mod detectors;
pub mod duration;
pub mod findings;
pub mod plan;
pub mod skill;
pub mod state;
pub mod subagent;
pub mod takeover;
pub mod trajectory;
pub mod usage;
pub mod util;
pub mod waste;
