//! 公共价格目录的边界校验。
//!
//! 目录是公共输入，不应直接当作计价配置使用。这个模块只做无副作用的
//! 解析、规范化和校验；下载、状态展示和落库由桌面适配层负责。

use agent_vitals_domain::source_identity::{canonical_json, fnv1a64_hex};
use serde_json::Value;

const MAX_CATALOG_BYTES: usize = 2 * 1024 * 1024;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ValidatedCatalog {
    pub canonical_json: String,
    pub version: String,
    pub model_count: usize,
}

/// 规范化并校验公共目录。
///
/// 允许当前内置价卡的两种形状：顶层 `providers`，以及历史 Claude 目录中
/// 的 `catalog_2026_09.providers`。价格值必须是有限非负数；`tiers` 的
/// `max_input_tokens` 可以为 null。来源链接若存在必须是 HTTPS，避免把
/// 未验证的本地/明文地址写成公共来源。
pub fn validate(raw: &[u8]) -> Result<ValidatedCatalog, String> {
    if raw.len() > MAX_CATALOG_BYTES {
        return Err(format!("catalog exceeds {} byte limit", MAX_CATALOG_BYTES));
    }
    let value: Value = serde_json::from_slice(raw).map_err(|e| format!("invalid JSON: {e}"))?;
    let root = value
        .as_object()
        .ok_or_else(|| "catalog root must be an object".to_string())?;

    validate_non_negative(&value, "root")?;
    validate_sources(root)?;

    let mut model_count = 0;
    let mut found_provider_models = false;
    if let Some(providers) = root.get("providers") {
        model_count += validate_providers(providers, "providers")?;
        found_provider_models = true;
    }
    if let Some(catalog) = root.get("catalog_2026_09") {
        if let Some(providers) = catalog.get("providers") {
            model_count += validate_providers(providers, "catalog_2026_09.providers")?;
            found_provider_models = true;
        }
    }
    if !found_provider_models || model_count == 0 {
        return Err("catalog must contain at least one provider model".to_string());
    }

    let mut canonical = String::new();
    canonical_json(&value, &mut canonical);
    let version = format!("public-{}", fnv1a64_hex(canonical.as_bytes()));
    Ok(ValidatedCatalog {
        canonical_json: canonical,
        version,
        model_count,
    })
}

fn validate_providers(value: &Value, path: &str) -> Result<usize, String> {
    let providers = value
        .as_object()
        .ok_or_else(|| format!("{path} must be an object"))?;
    let mut count = 0;
    for (provider_id, provider) in providers {
        if provider_id.trim().is_empty() {
            return Err(format!("{path} contains an empty provider id"));
        }
        let object = provider
            .as_object()
            .ok_or_else(|| format!("{path}.{provider_id} must be an object"))?;
        if let Some(currency) = object.get("currency") {
            let currency = currency
                .as_str()
                .ok_or_else(|| format!("{path}.{provider_id}.currency must be text"))?;
            if currency.len() != 3 || !currency.chars().all(|c| c.is_ascii_uppercase()) {
                return Err(format!("{path}.{provider_id}.currency is not ISO-like uppercase currency"));
            }
        }
        let models = object
            .get("models")
            .ok_or_else(|| format!("{path}.{provider_id}.models is missing"))?
            .as_object()
            .ok_or_else(|| format!("{path}.{provider_id}.models must be an object"))?;
        for (model_id, model) in models {
            if model_id.trim().is_empty() {
                return Err(format!("{path}.{provider_id} contains an empty model id"));
            }
            let model = model
                .as_object()
                .ok_or_else(|| format!("{path}.{provider_id}.models.{model_id} must be an object"))?;
            let has_dimension = ["input_uncached", "input_cached", "output", "tiers"]
                .iter()
                .any(|key| model.contains_key(*key));
            if !has_dimension {
                return Err(format!("{path}.{provider_id}.models.{model_id} has no billing dimension"));
            }
            for dimension in ["input_uncached", "input_cached", "output"] {
                if let Some(value) = model.get(dimension) {
                    validate_rate(value, &format!("{path}.{provider_id}.models.{model_id}.{dimension}"))?;
                }
            }
            if let Some(tiers) = model.get("tiers") {
                let tiers = tiers
                    .as_array()
                    .ok_or_else(|| format!("{path}.{provider_id}.models.{model_id}.tiers must be an array"))?;
                if tiers.is_empty() {
                    return Err(format!("{path}.{provider_id}.models.{model_id}.tiers must not be empty"));
                }
                for tier in tiers {
                    let tier = tier.as_object().ok_or_else(|| {
                        format!("{path}.{provider_id}.models.{model_id}.tiers item must be an object")
                    })?;
                    if !tier.keys().any(|key| {
                        matches!(key.as_str(), "input_uncached" | "input_cached" | "output")
                    }) {
                        return Err(format!("{path}.{provider_id}.models.{model_id}.tier has no billing dimension"));
                    }
                    for dimension in ["input_uncached", "input_cached", "output"] {
                        if let Some(value) = tier.get(dimension) {
                            validate_rate(
                                value,
                                &format!("{path}.{provider_id}.models.{model_id}.tiers.{dimension}"),
                            )?;
                        }
                    }
                    if let Some(max_input_tokens) = tier.get("max_input_tokens") {
                        if !max_input_tokens.is_null()
                            && (!max_input_tokens.is_u64() || max_input_tokens.as_u64() == Some(0))
                        {
                            return Err(format!(
                                "{path}.{provider_id}.models.{model_id}.tiers.max_input_tokens must be a positive integer or null"
                            ));
                        }
                    }
                }
            }
            count += 1;
        }
    }
    Ok(count)
}

fn validate_rate(value: &Value, path: &str) -> Result<(), String> {
    match value {
        Value::Number(number) if number.as_f64().is_some_and(|number| number >= 0.0) => Ok(()),
        Value::Object(values) if !values.is_empty() => {
            for (key, value) in values {
                if !value.is_number()
                    || value.as_f64().map_or(true, |number| number < 0.0)
                {
                    return Err(format!("{path}.{key} must be a finite non-negative number"));
                }
            }
            Ok(())
        }
        _ => Err(format!("{path} must be a finite non-negative number or rate object")),
    }
}

fn validate_sources(root: &serde_json::Map<String, Value>) -> Result<(), String> {
    let Some(catalog) = root.get("catalog_2026_09") else { return Ok(()); };
    let Some(sources) = catalog.get("sources") else { return Ok(()); };
    let sources = sources
        .as_object()
        .ok_or_else(|| "catalog_2026_09.sources must be an object".to_string())?;
    for (name, source) in sources {
        let source = source
            .as_str()
            .ok_or_else(|| format!("source {name} must be text"))?;
        for link in source.split(';') {
            let link = link.trim();
            if !link.is_empty() && !link.starts_with("https://") {
                return Err(format!("source {name} is not HTTPS"));
            }
        }
    }
    Ok(())
}

fn validate_non_negative(value: &Value, path: &str) -> Result<(), String> {
    match value {
        Value::Number(number) => {
            if number.as_f64().is_some_and(|number| number < 0.0) {
                return Err(format!("negative numeric value at {path}"));
            }
        }
        Value::Array(items) => {
            for (index, item) in items.iter().enumerate() {
                validate_non_negative(item, &format!("{path}[{index}]"))?;
            }
        }
        Value::Object(items) => {
            for (key, item) in items {
                validate_non_negative(item, &format!("{path}.{key}"))?;
            }
        }
        Value::Null | Value::Bool(_) | Value::String(_) => {}
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn good() -> &'static [u8] {
        br#"{"providers":{"p":{"currency":"USD","models":{"m":{"input_uncached":1.2,"output":3}}}}}"#
    }

    #[test]
    fn normalizes_and_fingerprints_catalog() {
        let result = validate(good()).unwrap();
        assert_eq!(result.model_count, 1);
        assert!(result.version.starts_with("public-"));
        assert_eq!(result.canonical_json, "{\"providers\":{\"p\":{\"currency\":\"USD\",\"models\":{\"m\":{\"input_uncached\":1.2,\"output\":3}}}}}");
    }

    #[test]
    fn rejects_negative_and_bad_source() {
        assert!(validate(br#"{"providers":{"p":{"models":{"m":{"output":-1}}}}}"#).is_err());
        assert!(validate(br#"{"catalog_2026_09":{"sources":{"p":"http://bad"},"providers":{"p":{"models":{"m":{"output":1}}}}}}"#).is_err());
    }

    #[test]
    fn rejects_missing_dimension_and_empty_tiers() {
        assert!(validate(br#"{"providers":{"p":{"models":{"m":{}}}}}"#).is_err());
        assert!(validate(br#"{"providers":{"p":{"models":{"m":{"tiers":[]}}}}}"#).is_err());
    }

    #[test]
    fn rejects_malformed_rates_and_tier_limits() {
        assert!(validate(br#"{"providers":{"p":{"models":{"m":{"output":null}}}}}"#).is_err());
        assert!(validate(br#"{"providers":{"p":{"models":{"m":{"output":{"peak":"unknown"}}}}}}"#).is_err());
        assert!(validate(br#"{"providers":{"p":{"models":{"m":{"tiers":[{"output":1,"max_input_tokens":"512k"}]}}}}}"#).is_err());
        assert!(validate(br#"{"providers":{"p":{"models":{"m":{"tiers":[{"output":1,"max_input_tokens":0}]}}}}}"#).is_err());
    }

    #[test]
    fn embedded_catalog_is_a_valid_update_candidate() {
        let result = validate(include_bytes!("../../../assets/pricing.json")).unwrap();
        assert!(result.model_count >= 5);
        assert!(result.version.starts_with("public-"));
    }
}
