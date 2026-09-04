//! DSH session wire and evidence projection.

/// Phase B residual bridge; physical ownership moves here after Phase C
/// removes the canonical domain wrappers' reverse dependency on DSH evidence.
pub use agent_vitals_domain::dsh_evidence as evidence;
