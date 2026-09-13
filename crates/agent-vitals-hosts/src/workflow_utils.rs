//! Small host-independent helpers for source adapters emitting WorkflowEvent.
//!
//! These helpers intentionally return only timestamps, bounded labels, and
//! one-way fingerprints.  They must never be used to move raw prompts,
//! arguments, paths, or error text across the adapter boundary.

use agent_vitals_domain::source_identity::fnv1a64_hex;

pub fn iso_to_epoch_ms(value: Option<&str>) -> Option<i64> {
    let value = value?;
    let (seconds, _) = agent_vitals_domain::domain::budget::parse_iso(value)?;
    let fraction = value
        .split_once('.')
        .and_then(|(_, rest)| rest.find(['Z', '+', '-']).map(|i| &rest[..i]))
        .unwrap_or("");
    let mut digits = fraction.chars().take(3).collect::<String>();
    if digits.chars().any(|c| !c.is_ascii_digit()) { return None; }
    while digits.len() < 3 { digits.push('0'); }
    let fraction_ms = if digits.is_empty() { 0 } else { digits.parse::<i64>().ok()? };
    seconds.checked_mul(1000)?.checked_add(fraction_ms)
}

pub fn safe_label(value: &str) -> String {
    if !value.is_empty()
        && value.len() <= 128
        && value.bytes().all(|byte| byte.is_ascii_alphanumeric() || b"._/-".contains(&byte))
    {
        value.to_string()
    } else {
        fingerprint(value)
    }
}

pub fn fingerprint(value: &str) -> String {
    format!("fnv1a64:{}", fnv1a64_hex(value.as_bytes()))
}

pub fn outcome(status: Option<&str>, error_present: bool) -> &'static str {
    if error_present { return "failed"; }
    match status.unwrap_or("").to_ascii_lowercase().as_str() {
        "ok" | "success" | "succeeded" | "completed" | "complete" | "applied" => "succeeded",
        "error" | "failed" | "failure" => "failed",
        "cancelled" | "canceled" | "aborted" => "cancelled",
        _ => "unknown",
    }
}
