//! Stable cross-host contracts.
//!
//! These modules define identities and serialized fact shapes. They do not
//! interpret a host wire format and must remain free of I/O.

pub mod evidence;
pub mod billing;
pub mod host_capability;
pub mod r2a;
pub mod source_identity;
pub mod trace_graph;
pub mod usage_fact;
