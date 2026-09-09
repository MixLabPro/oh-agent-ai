//! Pure provider identity and attribution logic for v0.11.
//! This crate performs no I/O, SQL, network access, or host-log parsing.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct RouteEvidence {
    pub provider_raw: Option<String>,
    pub endpoint_host: Option<String>,
    pub evidence_basis: EvidenceBasis,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum EvidenceBasis {
    SessionNative,
    AccountTimeBound,
    ConfigTimeBound,
    ConfigCurrent,
    EnvCurrent,
    Inferred,
    Missing,
    Conflict,
}

impl EvidenceBasis {
    pub fn strength(self) -> u8 {
        match self {
            Self::SessionNative => 7,
            Self::AccountTimeBound => 6,
            Self::ConfigTimeBound => 5,
            Self::ConfigCurrent | Self::EnvCurrent => 4,
            Self::Inferred => 2,
            Self::Missing => 0,
            Self::Conflict => 0,
        }
    }

    pub fn as_str(self) -> &'static str {
        match self {
            Self::SessionNative => "session-native",
            Self::AccountTimeBound => "account-time-bound",
            Self::ConfigTimeBound => "config-time-bound",
            Self::ConfigCurrent => "config-current",
            Self::EnvCurrent => "env-current",
            Self::Inferred => "inferred",
            Self::Missing => "missing",
            Self::Conflict => "conflict",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum BillingMode {
    Subscription,
    Metered,
    Unknown,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct BillingAttribution {
    pub provider_id: Option<String>,
    pub provider_raw: Option<String>,
    pub billing_mode: BillingMode,
    pub pricing_basis: String,
    pub evidence_basis: EvidenceBasis,
    pub has_unresolved: bool,
}

/// Normalizes a raw provider marker or endpoint host to a stable provider id.
pub fn normalize_provider(
    provider_raw: Option<&str>,
    endpoint_host: Option<&str>,
) -> Option<String> {
    let endpoint = endpoint_host.unwrap_or_default().to_ascii_lowercase();
    if endpoint.contains("router.cogfoundry.ai") || endpoint == "cogfoundry.ai" {
        return Some("cogfoundry.ai".to_string());
    }
    match provider_raw
        .map(str::trim)
        .filter(|v| !v.is_empty())
        .map(str::to_ascii_lowercase)
        .as_deref()
    {
        Some("openai") => Some("openai".to_string()),
        Some(raw) => Some(raw.to_string()),
        None => None,
    }
}

/// Resolves identity first, then applies v0.11's conservative billing semantics.
/// A current custom route is never treated as an official subscription.
pub fn resolve_billing_attribution(
    model_provider: Option<&str>,
    route: Option<&RouteEvidence>,
) -> BillingAttribution {
    let raw = model_provider.map(str::to_string);
    let route_provider = route
        .and_then(|r| normalize_provider(r.provider_raw.as_deref(), r.endpoint_host.as_deref()));
    let route_basis = route
        .map(|r| r.evidence_basis)
        .unwrap_or(EvidenceBasis::Missing);
    let provider_id = match model_provider.map(str::trim).filter(|v| !v.is_empty()) {
        Some("openai") => Some("openai".to_string()),
        Some("custom") | None => route_provider.clone(),
        Some(other) => Some(other.to_string()),
    };
    // The session's explicit provider wins over a current-config hint. A
    // stronger conflicting route evidence is unresolved instead of silently
    // being called subscription.
    let route_conflicts = matches!(route_basis, EvidenceBasis::Conflict)
        || (route_basis.strength() >= EvidenceBasis::SessionNative.strength()
            && route_provider.as_deref().is_some_and(|p| p != "openai"));
    let is_official_subscription =
        model_provider == Some("openai") && route.is_some() && !route_conflicts;
    if is_official_subscription {
        return BillingAttribution {
            provider_id,
            provider_raw: raw,
            billing_mode: BillingMode::Subscription,
            pricing_basis: "session-provider".to_string(),
            evidence_basis: EvidenceBasis::SessionNative,
            has_unresolved: false,
        };
    }
    let unresolved = provider_id.is_none()
        || matches!(
            route_basis,
            EvidenceBasis::ConfigCurrent
                | EvidenceBasis::EnvCurrent
                | EvidenceBasis::Conflict
                | EvidenceBasis::Missing
        )
        || (model_provider == Some("custom"));
    let has_provider = provider_id.is_some();
    BillingAttribution {
        provider_id,
        provider_raw: raw,
        billing_mode: if has_provider || model_provider == Some("custom") {
            BillingMode::Metered
        } else {
            BillingMode::Unknown
        },
        pricing_basis: if unresolved {
            "metered_estimate"
        } else {
            "route-observed"
        }
        .to_string(),
        evidence_basis: route_basis,
        has_unresolved: unresolved,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn cog(basis: EvidenceBasis) -> RouteEvidence {
        RouteEvidence {
            provider_raw: Some("custom".into()),
            endpoint_host: Some("router.cogfoundry.ai".into()),
            evidence_basis: basis,
        }
    }

    #[test]
    fn custom_cogfoundry_is_metered_estimate() {
        let a =
            resolve_billing_attribution(Some("custom"), Some(&cog(EvidenceBasis::ConfigCurrent)));
        assert_eq!(a.provider_id.as_deref(), Some("cogfoundry.ai"));
        assert_eq!(a.billing_mode, BillingMode::Metered);
        assert_eq!(a.pricing_basis, "metered_estimate");
        assert!(a.has_unresolved);
    }

    #[test]
    fn explicit_openai_wins_over_current_custom_hint() {
        let a =
            resolve_billing_attribution(Some("openai"), Some(&cog(EvidenceBasis::ConfigCurrent)));
        assert_eq!(a.provider_id.as_deref(), Some("openai"));
        assert_eq!(a.billing_mode, BillingMode::Subscription);
        assert!(!a.has_unresolved);
        assert_eq!(a.evidence_basis, EvidenceBasis::SessionNative);
    }

    #[test]
    fn openai_without_route_is_unresolved_metered() {
        let a = resolve_billing_attribution(Some("openai"), None);
        assert_eq!(a.billing_mode, BillingMode::Metered);
        assert_eq!(a.pricing_basis, "metered_estimate");
        assert!(a.has_unresolved);
    }

    #[test]
    fn custom_without_route_is_unresolved_metered() {
        let a = resolve_billing_attribution(Some("custom"), None);
        assert_eq!(a.billing_mode, BillingMode::Metered);
        assert_eq!(a.pricing_basis, "metered_estimate");
        assert!(a.has_unresolved);
    }

    #[test]
    fn session_native_openai_is_subscription() {
        let a = resolve_billing_attribution(
            Some("openai"),
            Some(&RouteEvidence {
                provider_raw: Some("openai".into()),
                endpoint_host: Some("api.openai.com".into()),
                evidence_basis: EvidenceBasis::SessionNative,
            }),
        );
        assert_eq!(a.billing_mode, BillingMode::Subscription);
        assert!(!a.has_unresolved);
    }
}
