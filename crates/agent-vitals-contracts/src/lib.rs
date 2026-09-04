//! Stable cross-host contracts for agent-vitals.
//!
//! These modules define identities (`source_identity`, `SessionKey`),
//! serialized fact shapes (`usage_fact`, `r2a`), the evidence vocabulary
//! (`evidence::{Signal, RuleOutcome, CanonicalSession, …}`) and the host
//! capability registry (`host_capability::HOSTS`). They do **not** interpret a
//! host wire format and must remain free of I/O — the only dependency is
//! `serde_json`.
//!
//! v0.8 Phase C Step 4a carved this out of `agent-vitals-core` so adapters and
//! the runtime can depend on the vocabulary without pulling in the domain
//! computation. `lib.rs` re-exports the flat module paths
//! (`agent_vitals_contracts::evidence::*` etc.) that `agent-vitals-core` and
//! `agent-vitals-domain` re-export in turn.

pub mod contracts;

pub use contracts::{evidence, host_capability, r2a, source_identity, usage_fact};
