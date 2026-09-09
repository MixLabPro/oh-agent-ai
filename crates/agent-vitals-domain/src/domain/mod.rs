//! Cross-host Agent Vitals computations.
//!
//! Phase A changes ownership and navigation only. `usage` and `cost` still
//! contain known host-era compatibility seams; their semantic split belongs
//! to Phase C and is guarded by the existing parity and golden suites.

pub mod behavior;
pub mod budget;
pub mod canonical_audit;
pub mod coords;
pub mod cost;
pub mod data_contract;
pub mod detectors;
pub mod duration;
pub mod findings;
pub mod mcp;
pub mod plan;
pub mod skill;
pub mod skills;
pub mod state;
pub mod subagent;
pub mod takeover;
pub mod trace;
pub mod trajectory;
pub mod usage;
pub mod util;
