//! Codex session wire, evidence and token observations.

pub mod evidence;

/// Phase B residual bridge; physical ownership moves here after Phase C
/// removes `domain::usage`'s reverse dependency on the Codex fold.
pub use agent_vitals_core::codex_usage as usage;
