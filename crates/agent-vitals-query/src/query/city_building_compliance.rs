//! Hard model compliance for session-kit/v1 (合规模型 MVP).
//!
//! Gates: lot/footprint, height (incl. story height / floors), construction budget,
//! and required part roles (door, window) for occupiable volumes.
//! Shared by `preview_building` and `set_building_model`.

use serde_json::Value;

use super::city_building::{geometric_summary, tokens_to_height, BuildingError};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum HeightClass {
    Low,
    Mid,
    High,
}

impl HeightClass {
    pub fn as_str(self) -> &'static str {
        match self {
            HeightClass::Low => "low",
            HeightClass::Mid => "mid",
            HeightClass::High => "high",
        }
    }

    fn from_token_height(h: f64) -> Self {
        if h >= 30.0 {
            HeightClass::High
        } else if h >= 14.0 {
            HeightClass::Mid
        } else {
            HeightClass::Low
        }
    }

    fn class_max_height(self) -> f64 {
        match self {
            HeightClass::Low => 14.0,
            HeightClass::Mid => 30.0,
            HeightClass::High => 48.0,
        }
    }
}

#[derive(Debug, Clone, PartialEq)]
pub struct BuildingSlot {
    pub height_class: HeightClass,
    pub footprint_half_x: f64,
    pub footprint_half_z: f64,
    pub max_height: f64,
    pub budget_cap: f64,
    pub story_height_min: f64,
    pub story_height_max: f64,
}

#[derive(Debug, Clone)]
struct CatalogEntry {
    id: &'static str,
    max_half_x: f64,
    max_half_z: f64,
    max_height: f64,
    cost: f64,
    /// Catalog kit satisfies door/window without tagging every part.
    provides_door_window: bool,
}

const CATALOG: &[CatalogEntry] = &[
    CatalogEntry {
        id: "kit-low-block",
        max_half_x: 3.8,
        max_half_z: 5.5,
        max_height: 14.0,
        cost: 32.0,
        provides_door_window: true,
    },
    CatalogEntry {
        id: "kit-midrise",
        max_half_x: 4.0,
        max_half_z: 6.0,
        max_height: 30.0,
        cost: 72.0,
        provides_door_window: true,
    },
    CatalogEntry {
        id: "kit-tower",
        max_half_x: 3.2,
        max_half_z: 3.2,
        max_height: 48.0,
        cost: 120.0,
        provides_door_window: true,
    },
    CatalogEntry {
        id: "kit-wide-slab",
        max_half_x: 4.0,
        max_half_z: 5.0,
        max_height: 22.0,
        cost: 48.0,
        provides_door_window: true,
    },
];

const MIN_LOT_COVERAGE: f64 = 0.32;
const OCCUPIABLE_HEIGHT: f64 = 3.5;
const PILLAR_HEIGHT: f64 = 6.0;
const REQUIRED_ROLES: &[&str] = &["door", "window"];

pub fn budget_cap_for_tokens(tokens_total: i64) -> f64 {
    let t = tokens_total.max(500) as f64;
    ((t / 800.0).powf(0.85) * 18.0).clamp(12.0, 200.0)
}

pub fn derive_slot(_session_key: &str, tokens_total: i64) -> BuildingSlot {
    let token_height = tokens_to_height(tokens_total);
    let height_class = HeightClass::from_token_height(token_height);
    let max_height = token_height.min(height_class.class_max_height());
    let scale = 1.0 + (token_height / 48.0).clamp(0.0, 1.0) * 0.12;
    BuildingSlot {
        height_class,
        footprint_half_x: 4.0 * scale,
        footprint_half_z: 6.0 * scale,
        max_height,
        budget_cap: budget_cap_for_tokens(tokens_total),
        story_height_min: 2.4,
        story_height_max: 4.2,
    }
}

pub fn slot_to_json(slot: &BuildingSlot) -> Value {
    serde_json::json!({
        "height_class": slot.height_class.as_str(),
        "footprint": {
            "half_x": round3(slot.footprint_half_x),
            "half_z": round3(slot.footprint_half_z),
        },
        "max_height": round3(slot.max_height),
        "budget_cap": round3(slot.budget_cap),
        "story_height": { "min": slot.story_height_min, "max": slot.story_height_max },
        "required_part_roles": REQUIRED_ROLES,
        "source": "derived",
    })
}

fn round3(n: f64) -> f64 {
    (n * 1000.0).round() / 1000.0
}

fn model_footprint(model: &Value) -> (f64, f64, f64) {
    let summary = geometric_summary(model);
    let min = summary["bbox"]["min"].as_array().cloned().unwrap_or_default();
    let max = summary["bbox"]["max"].as_array().cloned().unwrap_or_default();
    let height = summary["height"].as_f64().unwrap_or(0.0);
    let half_x = if min.len() >= 1 && max.len() >= 1 {
        (max[0].as_f64().unwrap_or(0.0) - min[0].as_f64().unwrap_or(0.0)) / 2.0
    } else {
        0.0
    };
    let half_z = if min.len() >= 3 && max.len() >= 3 {
        (max[2].as_f64().unwrap_or(0.0) - min[2].as_f64().unwrap_or(0.0)) / 2.0
    } else {
        0.0
    };
    (half_x, half_z, height)
}

pub fn estimate_build_cost(model: &Value) -> f64 {
    let parts = model.get("parts").and_then(Value::as_array).cloned().unwrap_or_default();
    let mut cost = 0.0;
    for part in &parts {
        let size = part.get("size").and_then(Value::as_array).cloned().unwrap_or_default();
        if size.len() != 3 {
            continue;
        }
        let vol = size.iter().filter_map(Value::as_f64).fold(1.0, |a, b| a * b);
        cost += vol * 0.2 + 1.0;
    }
    cost
}

fn count_floor_bands(model: &Value) -> u32 {
    let parts = model.get("parts").and_then(Value::as_array).cloned().unwrap_or_default();
    let mut bands = 0u32;
    for part in &parts {
        let role = part.get("role").and_then(Value::as_str).unwrap_or("");
        if !matches!(role, "wall" | "structure" | "door" | "window") {
            continue;
        }
        let h = part
            .get("size")
            .and_then(Value::as_array)
            .and_then(|a| a.get(1))
            .and_then(Value::as_f64)
            .unwrap_or(0.0);
        if h >= 2.0 {
            bands += 1;
        }
    }
    bands
}

fn story_metrics(model: &Value, total_height: f64) -> (u32, f64) {
    let params = model.get("params").and_then(Value::as_object);
    let declared_floors = params
        .and_then(|p| p.get("floors"))
        .and_then(Value::as_u64)
        .map(|n| n.max(1) as u32);
    let declared_story = params
        .and_then(|p| p.get("story_height"))
        .and_then(Value::as_f64)
        .filter(|n| n.is_finite() && *n > 0.0);

    let bands = count_floor_bands(model);
    let floors = declared_floors.unwrap_or_else(|| if bands >= 2 { bands } else { 1 });
    let story_height = declared_story.unwrap_or_else(|| total_height / floors.max(1) as f64);
    (floors, story_height)
}

fn has_part_role(model: &Value, role: &str) -> bool {
    model
        .get("parts")
        .and_then(Value::as_array)
        .is_some_and(|parts| parts.iter().any(|p| p.get("role").and_then(Value::as_str) == Some(role)))
}

pub fn compliant_catalog_ids(slot: &BuildingSlot) -> Vec<String> {
    CATALOG
        .iter()
        .filter(|entry| {
            entry.max_height <= slot.max_height + 0.05
                && entry.max_half_x <= slot.footprint_half_x + 0.02
                && entry.max_half_z <= slot.footprint_half_z + 0.02
                && entry.cost <= slot.budget_cap + 0.05
        })
        .map(|entry| entry.id.to_string())
        .collect()
}

fn catalog_by_id(id: &str) -> Option<&'static CatalogEntry> {
    CATALOG.iter().find(|entry| entry.id == id)
}

pub fn validate_model_compliance(model: &Value, slot: &BuildingSlot) -> Result<(), BuildingError> {
    let candidates = compliant_catalog_ids(slot);
    let (half_x, half_z, height) = model_footprint(model);
    let build_cost = estimate_build_cost(model);
    let declared_cost = model
        .get("params")
        .and_then(|p| p.get("build_cost"))
        .and_then(Value::as_f64)
        .filter(|n| n.is_finite() && *n >= 0.0);
    let catalog_id = model
        .get("params")
        .and_then(|p| p.get("catalog_id"))
        .and_then(Value::as_str);
    let catalog = catalog_id.and_then(catalog_by_id);

    if half_x > slot.footprint_half_x + 0.02 || half_z > slot.footprint_half_z + 0.02 {
        return Err(compliance_error(
            format!(
                "model footprint {:.2}×{:.2} exceeds lot {:.2}×{:.2}",
                half_x * 2.0,
                half_z * 2.0,
                slot.footprint_half_x * 2.0,
                slot.footprint_half_z * 2.0,
            ),
            "shrink or reposition parts so the bbox fits inside the parcel",
            &candidates,
        ));
    }

    let min_half_x = slot.footprint_half_x * MIN_LOT_COVERAGE;
    let min_half_z = slot.footprint_half_z * MIN_LOT_COVERAGE;
    if half_x + 0.02 < min_half_x || half_z + 0.02 < min_half_z {
        return Err(compliance_error(
            format!(
                "model footprint {:.2}×{:.2} under-fills the lot (need at least {:.2}×{:.2})",
                half_x * 2.0,
                half_z * 2.0,
                min_half_x * 2.0,
                min_half_z * 2.0,
            ),
            "widen the base so the building covers more of the parcel (avoid thin pillars)",
            &candidates,
        ));
    }

    let (floors, story_height) = story_metrics(model, height);
    if story_height < slot.story_height_min - 0.05 || story_height > slot.story_height_max + 0.05 {
        return Err(compliance_error(
            format!(
                "story height {story_height:.2} is outside allowed {slot.story_height_min:.1}..{slot.story_height_max:.1}"
            ),
            "set params.story_height in range or split into stacked floor parts",
            &candidates,
        ));
    }
    if (floors as f64) * story_height > slot.max_height + 0.1 {
        return Err(compliance_error(
            format!(
                "floors×story height ({floors}×{story_height:.2}) exceeds session max height {slot.max_height:.2}"
            ),
            "reduce floors, lower story_height, or shorten parts",
            &candidates,
        ));
    }
    if height > slot.max_height + 0.05 {
        return Err(compliance_error(
            format!(
                "model height {height:.2} exceeds {slot.height_class} max {slot.max_height:.2} for this session"
            ),
            "lower the structure to match the session height class",
            &candidates,
        ));
    }
    let bands = count_floor_bands(model);
    if height > PILLAR_HEIGHT && bands < 2 && floors < 2 {
        return Err(compliance_error(
            format!(
                "model height {height:.1} has no floor stack (need ≥2 floor bands or params.floors ≥ 2)"
            ),
            "add stacked wall/structure parts per floor or set params.floors and story_height",
            &candidates,
        ));
    }

    let cost = declared_cost.unwrap_or(build_cost);
    if cost > slot.budget_cap + 0.05 {
        return Err(compliance_error(
            format!("construction cost {cost:.1} exceeds session budget cap {slot.budget_cap:.1}"),
            "use fewer/smaller parts, set params.build_cost honestly, or pick a catalog kit within budget",
            &candidates,
        ));
    }

    if let Some(entry) = catalog {
        if cost > entry.cost + 0.05 {
            return Err(compliance_error(
                format!("construction cost {cost:.1} exceeds catalog `{catalog_id}` cost {entry.cost:.1}"),
                "simplify the model or pick a catalog kit with a higher cost",
                &candidates,
            ));
        }
        if half_x > entry.max_half_x + 0.02 || half_z > entry.max_half_z + 0.02 {
            return Err(compliance_error(
                format!("model footprint exceeds catalog `{catalog_id}` lot size"),
                "shrink the footprint or choose another catalog_id",
                &candidates,
            ));
        }
        if height > entry.max_height + 0.05 {
            return Err(compliance_error(
                format!("model height exceeds catalog `{catalog_id}` max {entry.max_height:.1}"),
                "lower the roof or pick a taller catalog entry",
                &candidates,
            ));
        }
    } else if let Some(id) = catalog_id {
        return Err(compliance_error(
            format!("unknown catalog_id `{id}`"),
            "use an id from get_building.projection.compliant_catalog",
            &candidates,
        ));
    }

    let skip_features = catalog.is_some_and(|e| e.provides_door_window);
    if !skip_features && height > OCCUPIABLE_HEIGHT {
        for role in REQUIRED_ROLES {
            if !has_part_role(model, role) {
                return Err(compliance_error(
                    format!("occupiable building is missing required part role `{role}`"),
                    "add parts with role door and window, or set params.catalog_id to a kit that provides them",
                    &candidates,
                ));
            }
        }
    }

    Ok(())
}

fn compliance_error(message: impl Into<String>, fix: impl Into<String>, candidates: &[String]) -> BuildingError {
    BuildingError::invalid_model_compliance(message, fix, candidates)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn mid_slot() -> BuildingSlot {
        derive_slot("sess-one", 50_000)
    }

    fn occupiable_parts() -> Value {
        json!([
            {"id": "base", "kind": "box", "role": "structure", "at": [0.0, 0.0, 0.0], "size": [5.0, 3.0, 6.0]},
            {"id": "upper", "kind": "box", "role": "wall", "at": [0.0, 3.0, 0.0], "size": [4.5, 3.2, 5.5]},
            {"id": "door", "kind": "box", "role": "door", "at": [0.0, 0.0, 3.0], "size": [1.2, 2.2, 0.2]},
            {"id": "window", "kind": "box", "role": "window", "at": [0.0, 4.0, 3.0], "size": [1.4, 1.2, 0.15]}
        ])
    }

    #[test]
    fn rejects_thin_pillar_on_lot() {
        let model = json!({
            "kit_version": "session-kit/v1",
            "params": {},
            "parts": [{
                "id": "pin",
                "kind": "box",
                "role": "wall",
                "at": [0.0, 0.0, 0.0],
                "size": [0.8, 12.0, 0.8]
            }]
        });
        let err = validate_model_compliance(&model, &mid_slot()).unwrap_err();
        assert_eq!(err.rule, "invalid_model");
        assert!(!err.compliant_models.is_empty());
    }

    #[test]
    fn rejects_pillar_without_floors() {
        let model = json!({
            "kit_version": "session-kit/v1",
            "params": {"story_height": 12.0, "floors": 1},
            "parts": [{
                "id": "mono",
                "kind": "box",
                "role": "wall",
                "at": [0.0, 0.0, 0.0],
                "size": [5.0, 12.0, 6.0]
            }]
        });
        let err = validate_model_compliance(&model, &mid_slot()).unwrap_err();
        assert_eq!(err.rule, "invalid_model");
        assert!(err.message.contains("story height") || err.message.contains("floor"));
    }

    #[test]
    fn rejects_missing_door_and_window() {
        let model = json!({
            "kit_version": "session-kit/v1",
            "params": {"floors": 2, "story_height": 3.2},
            "parts": [
                {"id": "a", "kind": "box", "role": "structure", "at": [0,0,0], "size": [5, 3.2, 6]},
                {"id": "b", "kind": "box", "role": "wall", "at": [0,3.2,0], "size": [5, 3.2, 6]},
            ]
        });
        let err = validate_model_compliance(&model, &mid_slot()).unwrap_err();
        assert_eq!(err.rule, "invalid_model");
        assert!(err.message.contains("door") || err.message.contains("window"));
    }

    #[test]
    fn accepts_compliant_midrise() {
        let model = json!({
            "kit_version": "session-kit/v1",
            "params": {"catalog_id": "kit-midrise", "floors": 2, "story_height": 3.2},
            "parts": occupiable_parts()
        });
        validate_model_compliance(&model, &mid_slot()).unwrap();
    }
}
