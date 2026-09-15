//! Host-neutral workflow event contract.
//!
//! Adapters may observe very different wire events, but the product-facing
//! workflow queries need one deliberately small shape.  This contract carries
//! only redacted identifiers and stable fingerprints; prompts, arguments,
//! paths, raw errors, and provider payloads must never cross this boundary.

/// A single observed workflow event suitable for authority storage.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct WorkflowEvent {
    /// Stable adapter-generated identity.  Replaying a source must not create
    /// another row for the same physical event.
    pub event_id: String,
    /// The normalised session ledger key.  `None` is allowed for an event that
    /// is observable but cannot be safely attached to a session.
    pub session_key: Option<String>,
    /// UTC Unix milliseconds from the host-native event timestamp.
    pub event_ts_ms: i64,
    /// One of the schema's closed event types.
    pub event_type: String,
    pub capability_kind: Option<String>,
    /// A normalised, non-secret capability identifier (for example `bash` or
    /// a skill slug), never the invocation arguments.
    pub capability_id: Option<String>,
    pub capability_version: Option<String>,
    pub outcome: String,
    pub duration_ms: Option<i64>,
    /// Stable category/fingerprint only; raw error text is forbidden.
    pub error_fingerprint: Option<String>,
    /// Stable redacted shape used to group retries without storing arguments.
    pub invocation_fingerprint: Option<String>,
}

impl WorkflowEvent {
    /// Validate the cross-host contract.  Wire-specific missing-field policy
    /// remains in the adapter; the data layer rejects only malformed output.
    pub fn validate(&self) -> Result<(), &'static str> {
        if self.event_id.is_empty() || self.event_id.len() > 256 {
            return Err("workflow event id is empty or too long");
        }
        if self.session_key.as_deref().is_some_and(|v| v.is_empty()) {
            return Err("workflow event session key is empty");
        }
        if self.event_ts_ms < 0 {
            return Err("workflow event timestamp is negative");
        }
        if !matches!(
            self.event_type.as_str(),
            "task_started"
                | "task_finished"
                | "skill_invoked"
                | "skill_finished"
                | "tool_invoked"
                | "tool_finished"
                | "model_switched"
                | "approval_denied"
        ) {
            return Err("workflow event type is unknown");
        }
        if let Some(kind) = self.capability_kind.as_deref() {
            if !matches!(kind, "skill" | "tool" | "model") {
                return Err("workflow event capability kind is unknown");
            }
        }
        if !matches!(
            self.outcome.as_str(),
            "succeeded" | "failed" | "cancelled" | "unknown"
        ) {
            return Err("workflow event outcome is unknown");
        }
        if self.duration_ms.is_some_and(|value| value < 0) {
            return Err("workflow event duration is negative");
        }
        for value in [
            self.capability_id.as_deref(),
            self.capability_version.as_deref(),
            self.error_fingerprint.as_deref(),
            self.invocation_fingerprint.as_deref(),
        ]
        .into_iter()
        .flatten()
        {
            if value.is_empty() || value.len() > 256 {
                return Err("workflow event redacted value is empty or too long");
            }
        }
        Ok(())
    }
}
