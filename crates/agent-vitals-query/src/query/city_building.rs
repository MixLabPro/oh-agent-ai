//! Session-building model overrides for Agent City (MCP MVP).
//!
//! Persistence is a City-owned SQLite file keyed by stable `asset_ref`, separate
//! from the analytical authority DB and from the city:v3 projection. Validation
//! is pure: `session-kit/v1` is params + ≤64 parts, no scripts.
//!
//! TODO(city:v3-default / PR #6): after the city:v3 default loader lands, the
//! City UI should read `build_events` here and play the queued block-by-block
//! construction animation. This module must not grow a projection/bootstrap hook
//! until that PR is merged — colliding with city load path is out of band.

use std::path::Path;

use rusqlite::{params, Connection, OptionalExtension};
use serde_json::{json, Map, Value};

use super::city_assets;
use super::session_ref::{self, session_ref};

pub const KIT_VERSION: &str = "session-kit/v1";
pub const MAX_PARTS: usize = 64;

const KINDS: &[&str] = &["box", "cylinder", "cone"];
const ROLES: &[&str] = &["wall", "trim", "roof", "glass", "structure"];
const FORMS: &[&str] = &["tower", "slab", "block", "midrise"];
const PART_KEYS: &[&str] = &["id", "kind", "role", "at", "size", "rot", "color"];
const MODEL_KEYS: &[&str] = &["kit_version", "params", "parts"];
const PARAM_KEYS: &[&str] = &["form", "palette"];

/// Canonical lot envelope in local parcel coordinates (world units, 1 u = 2 m).
/// Cheap out-of-bounds check until the city loader can supply the real parcel.
const LOT_HALF_X: f64 = 4.0;
const LOT_HALF_Z: f64 = 6.0;
const MAX_HEIGHT: f64 = 48.0;
const OVERLAP_EPS: f64 = 0.02;

#[derive(Debug, Clone, PartialEq)]
pub struct BuildingError {
    pub kind: &'static str,
    pub rule: &'static str,
    pub parts: Vec<String>,
    pub message: String,
    pub suggested_fix: Option<String>,
}

impl BuildingError {
    fn validation(rule: &'static str, parts: Vec<String>, message: impl Into<String>, fix: impl Into<String>) -> Self {
        Self { kind: "validation", rule, parts, message: message.into(), suggested_fix: Some(fix.into()) }
    }
    fn conflict(current_revision: u64) -> Self {
        Self {
            kind: "conflict",
            rule: "revision_conflict",
            parts: Vec::new(),
            message: format!("expected_revision does not match current revision {current_revision}"),
            suggested_fix: Some("call get_building and retry with the returned revision".into()),
        }
    }
    fn not_found(session_id: &str) -> Self {
        Self {
            kind: "not_found",
            rule: "unknown_session",
            parts: Vec::new(),
            message: format!("no session building matches `{session_id}`"),
            suggested_fix: Some("pass sessions_search.session_ref (sr_…) or the building asset_ref (ca_…)".into()),
        }
    }
    pub fn to_json(&self) -> Value {
        json!({
            "kind": self.kind,
            "rule": self.rule,
            "parts": self.parts,
            "message": self.message,
            "suggested_fix": self.suggested_fix,
        })
    }
}

#[derive(Debug, Clone)]
pub struct BuildingIdentity {
    pub asset_ref: String,
    pub session_id: String,
    pub harness: String,
    tokens_total: i64,
}

#[derive(Debug, Clone)]
struct Aabb { min: [f64; 3], max: [f64; 3] }

impl Aabb {
    fn height(&self) -> f64 { (self.max[1] - self.min[1]).max(0.0) }
    fn overlaps(&self, other: &Aabb) -> bool {
        (0..3).all(|i| self.min[i] < other.max[i] - OVERLAP_EPS && other.min[i] < self.max[i] - OVERLAP_EPS)
    }
    fn out_of_lot(&self) -> bool {
        self.min[0] < -LOT_HALF_X - OVERLAP_EPS || self.max[0] > LOT_HALF_X + OVERLAP_EPS
            || self.min[2] < -LOT_HALF_Z - OVERLAP_EPS || self.max[2] > LOT_HALF_Z + OVERLAP_EPS
            || self.min[1] < -OVERLAP_EPS || self.max[1] > MAX_HEIGHT + OVERLAP_EPS
    }
}

/// Token → height, same curve as `cityModel.tokensToHeight` (1e3→3.4 / 1e5→15.8 / 1e7→38.6, cap 48).
pub fn tokens_to_height(tokens: i64) -> f64 {
    let magnitude = ((tokens.max(1) as f64).log10() - 1.0).max(0.0);
    (0.75 * magnitude.powf(2.2)).clamp(2.6, 48.0)
}

pub fn validate_model(model: &Value) -> Result<Value, BuildingError> {
    let obj = model.as_object().ok_or_else(|| {
        BuildingError::validation("invalid_model", vec![], "model must be a JSON object", "send {kit_version, params, parts}")
    })?;
    if let Some(extra) = obj.keys().find(|k| !MODEL_KEYS.contains(&k.as_str())) {
        return Err(BuildingError::validation(
            "invalid_model", vec![], format!("unknown model field `{extra}`"),
            "session-kit/v1 only accepts kit_version, params, parts — no scripts",
        ));
    }
    let kit = obj.get("kit_version").and_then(Value::as_str).unwrap_or("");
    if kit != KIT_VERSION {
        return Err(BuildingError::validation(
            "kit_version", vec![], format!("kit_version must be `{KIT_VERSION}` (got `{kit}`)"),
            format!("set kit_version to `{KIT_VERSION}`"),
        ));
    }
    let params = match obj.get("params") {
        None => json!({}),
        Some(Value::Object(map)) => {
            if let Some(extra) = map.keys().find(|k| !PARAM_KEYS.contains(&k.as_str())) {
                return Err(BuildingError::validation(
                    "invalid_model", vec![], format!("unknown params field `{extra}`"),
                    "params only accepts form and palette",
                ));
            }
            if let Some(form) = map.get("form") {
                let form = form.as_str().ok_or_else(|| {
                    BuildingError::validation("invalid_part", vec![], "params.form must be a string", "use tower, slab, block, or midrise")
                })?;
                if !FORMS.contains(&form) {
                    return Err(BuildingError::validation(
                        "invalid_part", vec![], format!("params.form `{form}` is not a kit form"),
                        "use tower, slab, block, or midrise",
                    ));
                }
            }
            if let Some(palette) = map.get("palette") {
                let palette = palette.as_str().ok_or_else(|| {
                    BuildingError::validation("invalid_part", vec![], "params.palette must be a hex colour", "use #rrggbb")
                })?;
                if !is_hex_color(palette) {
                    return Err(BuildingError::validation(
                        "invalid_part", vec![], format!("params.palette `{palette}` is not #rrggbb"),
                        "use a six-digit hex colour such as #c47a54",
                    ));
                }
            }
            Value::Object(map.clone())
        }
        Some(_) => {
            return Err(BuildingError::validation("invalid_model", vec![], "params must be an object", "send params as {} or {form, palette}"));
        }
    };
    let parts_val = obj.get("parts").ok_or_else(|| {
        BuildingError::validation("invalid_model", vec![], "model.parts is required", "send an array of at most 64 parts")
    })?;
    let parts = parts_val.as_array().ok_or_else(|| {
        BuildingError::validation("invalid_model", vec![], "model.parts must be an array", "send parts as a JSON array")
    })?;
    if parts.len() > MAX_PARTS {
        return Err(BuildingError::validation(
            "parts_limit", vec![],
            format!("model has {} parts; {KIT_VERSION} allows at most {MAX_PARTS}", parts.len()),
            format!("merge or drop parts until the list has {MAX_PARTS} or fewer"),
        ));
    }
    if parts.is_empty() {
        return Err(BuildingError::validation("invalid_model", vec![], "model.parts must contain at least one part", "add a box/cylinder/cone part"));
    }
    let mut seen_ids = std::collections::BTreeSet::new();
    let mut boxes = Vec::new();
    let mut normalized = Vec::new();
    for (index, part) in parts.iter().enumerate() {
        let (label, aabb, clean) = validate_part(index, part, &mut seen_ids)?;
        if aabb.out_of_lot() {
            return Err(BuildingError::validation(
                "out_of_bounds", vec![label.clone()],
                format!("part `{label}` extends outside the parcel envelope (±{LOT_HALF_X} x, ±{LOT_HALF_Z} z, height 0..{MAX_HEIGHT})"),
                "shrink size or move `at` so the part stays inside the lot",
            ));
        }
        boxes.push((label, aabb));
        normalized.push(clean);
    }
    for i in 0..boxes.len() {
        for j in (i + 1)..boxes.len() {
            if boxes[i].1.overlaps(&boxes[j].1) {
                return Err(BuildingError::validation(
                    "overlap", vec![boxes[i].0.clone(), boxes[j].0.clone()],
                    format!("parts `{}` and `{}` overlap", boxes[i].0, boxes[j].0),
                    "move or shrink one of the two parts so their boxes no longer intersect",
                ));
            }
        }
    }
    Ok(json!({
        "kit_version": KIT_VERSION,
        "params": params,
        "parts": normalized,
    }))
}

fn validate_part(index: usize, part: &Value, seen_ids: &mut std::collections::BTreeSet<String>) -> Result<(String, Aabb, Value), BuildingError> {
    let obj = part.as_object().ok_or_else(|| {
        BuildingError::validation("invalid_part", vec![index_label(index)], format!("parts[{index}] must be an object"), "each part needs kind, role, at, size")
    })?;
    let fallback = index_label(index);
    if let Some(extra) = obj.keys().find(|k| !PART_KEYS.contains(&k.as_str())) {
        return Err(BuildingError::validation(
            "invalid_part", vec![fallback],
            format!("parts[{index}] has unknown field `{extra}`"),
            "session-kit/v1 parts accept id, kind, role, at, size, rot, color — no scripts",
        ));
    }
    let label = match obj.get("id") {
        None => fallback.clone(),
        Some(Value::String(id)) if !id.is_empty() && id.len() <= 64 => {
            if !seen_ids.insert(id.clone()) {
                return Err(BuildingError::validation(
                    "invalid_part", vec![id.clone()],
                    format!("duplicate part id `{id}`"),
                    "give each part a unique id",
                ));
            }
            id.clone()
        }
        Some(_) => {
            return Err(BuildingError::validation("invalid_part", vec![fallback], format!("parts[{index}].id must be a short string"), "omit id or use a unique string ≤64 chars"));
        }
    };
    let kind = obj.get("kind").and_then(Value::as_str).ok_or_else(|| {
        BuildingError::validation("invalid_part", vec![label.clone()], format!("part `{label}` is missing kind"), "kind must be box, cylinder, or cone")
    })?;
    if !KINDS.contains(&kind) {
        return Err(BuildingError::validation(
            "invalid_part", vec![label.clone()], format!("part `{label}` kind `{kind}` is not in the kit"),
            "use box, cylinder, or cone",
        ));
    }
    let role = obj.get("role").and_then(Value::as_str).ok_or_else(|| {
        BuildingError::validation("invalid_part", vec![label.clone()], format!("part `{label}` is missing role"), "role must be wall, trim, roof, glass, or structure")
    })?;
    if !ROLES.contains(&role) {
        return Err(BuildingError::validation(
            "invalid_part", vec![label.clone()], format!("part `{label}` role `{role}` is not in the kit"),
            "use wall, trim, roof, glass, or structure",
        ));
    }
    let at = vec3(obj.get("at"), &label, "at")?;
    let size = vec3(obj.get("size"), &label, "size")?;
    if size.iter().any(|n| *n <= 0.0) {
        return Err(BuildingError::validation(
            "invalid_part", vec![label.clone()], format!("part `{label}` size must be all positive"),
            "set each size component > 0",
        ));
    }
    if size[0] > LOT_HALF_X * 2.0 + 0.5 || size[2] > LOT_HALF_Z * 2.0 + 0.5 || size[1] > MAX_HEIGHT {
        return Err(BuildingError::validation(
            "out_of_bounds", vec![label.clone()], format!("part `{label}` is larger than the parcel"),
            "keep width/depth within the lot and height ≤ 48",
        ));
    }
    let rot = match obj.get("rot") {
        None => None,
        Some(v) => Some(vec3(Some(v), &label, "rot")?),
    };
    if let Some(color) = obj.get("color") {
        let color = color.as_str().ok_or_else(|| {
            BuildingError::validation("invalid_part", vec![label.clone()], format!("part `{label}` color must be a hex string"), "use #rrggbb")
        })?;
        if !is_hex_color(color) {
            return Err(BuildingError::validation(
                "invalid_part", vec![label.clone()], format!("part `{label}` color `{color}` is not #rrggbb"),
                "use a six-digit hex colour such as #c47a54",
            ));
        }
    }
    let aabb = part_aabb(at, size, rot);
    let mut clean = Map::new();
    if let Some(Value::String(id)) = obj.get("id") { clean.insert("id".into(), json!(id)); }
    clean.insert("kind".into(), json!(kind));
    clean.insert("role".into(), json!(role));
    clean.insert("at".into(), json!(at));
    clean.insert("size".into(), json!(size));
    if let Some(rot) = rot { clean.insert("rot".into(), json!(rot)); }
    if let Some(color) = obj.get("color") { clean.insert("color".into(), color.clone()); }
    Ok((label, aabb, Value::Object(clean)))
}

fn vec3(value: Option<&Value>, label: &str, field: &str) -> Result<[f64; 3], BuildingError> {
    let arr = value.and_then(Value::as_array).ok_or_else(|| {
        BuildingError::validation("invalid_part", vec![label.to_string()], format!("part `{label}` {field} must be [x, y, z]"), "send three finite numbers")
    })?;
    if arr.len() != 3 {
        return Err(BuildingError::validation(
            "invalid_part", vec![label.to_string()], format!("part `{label}` {field} must have 3 numbers"), "send [x, y, z]",
        ));
    }
    let mut out = [0.0; 3];
    for (i, item) in arr.iter().enumerate() {
        let n = item.as_f64().ok_or_else(|| {
            BuildingError::validation("invalid_part", vec![label.to_string()], format!("part `{label}` {field}[{i}] is not a number"), "use finite JSON numbers, not strings")
        })?;
        if !n.is_finite() {
            return Err(BuildingError::validation(
                "invalid_part", vec![label.to_string()], format!("part `{label}` {field}[{i}] is not finite"), "replace NaN/Inf with a real number",
            ));
        }
        out[i] = n;
    }
    Ok(out)
}

fn part_aabb(at: [f64; 3], size: [f64; 3], rot: Option<[f64; 3]>) -> Aabb {
    // `at` is the base centre (y = bottom), matching the City Part `anchor: "base"` default.
    let (hx, hz) = if rot.filter(|r| r.iter().any(|n| n.abs() > 1e-6)).is_some() {
        let r = size[0].max(size[2]) / 2.0;
        (r, r)
    } else {
        (size[0] / 2.0, size[2] / 2.0)
    };
    Aabb {
        min: [at[0] - hx, at[1], at[2] - hz],
        max: [at[0] + hx, at[1] + size[1], at[2] + hz],
    }
}

fn is_hex_color(value: &str) -> bool {
    let rest = match value.strip_prefix('#') { Some(r) => r, None => return false };
    rest.len() == 6 && rest.bytes().all(|b| b.is_ascii_hexdigit())
}

fn index_label(index: usize) -> String { format!("#{index}") }

pub fn geometric_summary(model: &Value) -> Value {
    let parts = model.get("parts").and_then(Value::as_array).cloned().unwrap_or_default();
    let mut bbox: Option<Aabb> = None;
    for (index, part) in parts.iter().enumerate() {
        let at = vec3(part.get("at"), &index_label(index), "at").unwrap_or([0.0; 3]);
        let size = vec3(part.get("size"), &index_label(index), "size").unwrap_or([1.0, 1.0, 1.0]);
        let rot = part.get("rot").and_then(|_| vec3(part.get("rot"), &index_label(index), "rot").ok());
        let aabb = part_aabb(at, size, rot);
        bbox = Some(match bbox {
            None => aabb,
            Some(prev) => Aabb {
                min: [prev.min[0].min(aabb.min[0]), prev.min[1].min(aabb.min[1]), prev.min[2].min(aabb.min[2])],
                max: [prev.max[0].max(aabb.max[0]), prev.max[1].max(aabb.max[1]), prev.max[2].max(aabb.max[2])],
            },
        });
    }
    let bbox = bbox.unwrap_or(Aabb { min: [0.0; 3], max: [0.0; 3] });
    json!({
        "part_count": parts.len(),
        "height": round4(bbox.height()),
        "bbox": { "min": bbox.min.iter().map(|n| json!(round4(*n))).collect::<Vec<_>>(),
            "max": bbox.max.iter().map(|n| json!(round4(*n))).collect::<Vec<_>>() },
    })
}

fn round4(n: f64) -> f64 { (n * 10_000.0).round() / 10_000.0 }

fn default_form(height: f64) -> &'static str {
    if height >= 30.0 { "tower" } else if height >= 14.0 { "midrise" } else { "block" }
}

pub fn default_model(tokens_total: i64) -> Value {
    let height = tokens_to_height(tokens_total);
    let form = default_form(height);
    let (w, d) = match form {
        "tower" => (3.2_f64, 3.2_f64),
        "slab" => (6.4, 3.6),
        "midrise" => (5.2, 4.4),
        _ => (4.6, 4.6),
    };
    let podium_h = 1.2_f64.min(height * 0.2).max(0.6);
    let roof_h = 0.4_f64.min(height * 0.08).max(0.25);
    let shaft_h = (height - podium_h - roof_h).max(0.8);
    let shaft_w = (w * 0.86).max(1.2);
    let shaft_d = (d * 0.86).max(1.2);
    json!({
        "kit_version": KIT_VERSION,
        "params": { "form": form },
        "parts": [
            { "id": "podium", "kind": "box", "role": "structure", "at": [0.0, 0.0, 0.0], "size": [w, podium_h, d] },
            { "id": "shaft", "kind": "box", "role": "wall", "at": [0.0, podium_h, 0.0], "size": [shaft_w, shaft_h, shaft_d] },
            { "id": "roof", "kind": "box", "role": "roof", "at": [0.0, podium_h + shaft_h, 0.0], "size": [w, roof_h, d] },
        ],
    })
}

fn open_store(home: &Path) -> Result<Connection, BuildingError> {
    let dir = home.join("state/plugins/city-buildings");
    std::fs::create_dir_all(&dir).map_err(|_| store_unavailable())?;
    #[cfg(unix)] {
        use std::os::unix::fs::PermissionsExt;
        let _ = std::fs::set_permissions(&dir, std::fs::Permissions::from_mode(0o700));
    }
    let path = dir.join("overrides.sqlite");
    let db = Connection::open(&path).map_err(|_| store_unavailable())?;
    db.busy_timeout(std::time::Duration::from_secs(2)).map_err(|_| store_unavailable())?;
    db.execute_batch(
        "CREATE TABLE IF NOT EXISTS overrides(
            asset_ref TEXT PRIMARY KEY,
            revision INTEGER NOT NULL,
            kit_version TEXT NOT NULL,
            model_json TEXT,
            updated_at_ms INTEGER NOT NULL
         );
         CREATE TABLE IF NOT EXISTS build_events(
            build_event_id TEXT PRIMARY KEY,
            asset_ref TEXT NOT NULL,
            revision INTEGER NOT NULL,
            kind TEXT NOT NULL,
            part_count INTEGER NOT NULL,
            created_at_ms INTEGER NOT NULL
         );",
    ).map_err(|_| store_unavailable())?;
    #[cfg(unix)] {
        use std::os::unix::fs::PermissionsExt;
        let _ = std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o600));
    }
    Ok(db)
}

fn store_unavailable() -> BuildingError {
    BuildingError {
        kind: "not_found",
        rule: "store_unavailable",
        parts: Vec::new(),
        message: "city building override store is unavailable".into(),
        suggested_fix: Some("retry; the store lives under state/plugins/city-buildings/".into()),
    }
}

#[derive(Debug, Clone)]
struct StoredOverride {
    revision: u64,
    kit_version: String,
    model: Option<Value>,
}

fn load_override(db: &Connection, asset_ref: &str) -> Result<StoredOverride, BuildingError> {
    let row: Option<(u64, String, Option<String>)> = db.query_row(
        "SELECT revision, kit_version, model_json FROM overrides WHERE asset_ref=?1",
        [asset_ref],
        |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
    ).optional().map_err(|_| store_unavailable())?;
    match row {
        None => Ok(StoredOverride { revision: 0, kit_version: KIT_VERSION.to_string(), model: None }),
        Some((revision, kit_version, model_json)) => {
            let model = match model_json {
                None => None,
                Some(raw) => Some(serde_json::from_str(&raw).map_err(|_| store_unavailable())?),
            };
            Ok(StoredOverride { revision, kit_version, model })
        }
    }
}

fn new_build_event_id(db: &Connection) -> Result<String, BuildingError> {
    let hex: String = db.query_row("SELECT lower(hex(randomblob(16)))", [], |r| r.get(0))
        .map_err(|_| store_unavailable())?;
    Ok(format!("be_{hex}"))
}

fn construction_stub(kind: &str, part_count: usize, build_event_id: &str) -> Value {
    json!({
        "mode": "block-by-block",
        "replayable": true,
        "status": "queued",
        "kind": kind,
        "part_count": part_count,
        "build_event_id": build_event_id,
        // TODO(city:v3-default / PR #6): City UI should consume queued build_events
        // and play this construction. Do not hook the city loader in this PR.
        "ui": "deferred_until_city_v3_default",
    })
}

fn observe_text(source: &str, summary: &Value, revision: u64) -> String {
    format!(
        "{source} model, {} parts, height {}, revision {revision}",
        summary["part_count"], summary["height"]
    )
}

pub fn resolve_identity(home: &Path, conn: &Connection, session_id: &str) -> Result<BuildingIdentity, BuildingError> {
    let session_id = session_id.trim();
    if session_id.is_empty() || session_id.len() > 80 {
        return Err(BuildingError::not_found(session_id));
    }
    let salt = session_ref::load_or_create_salt(home).map_err(|_| BuildingError::not_found(session_id))?;
    let keys = agent_vitals_data::authority_query::all_session_keys(conn)
        .map_err(|_| BuildingError::not_found(session_id))?;
    let session_key = if session_id.starts_with("ca_") && session_id.len() == 35
        && session_id.as_bytes()[3..].iter().all(|b| b.is_ascii_hexdigit())
    {
        let assets = city_assets::publish(home, conn, &keys).map_err(|_| store_unavailable())?;
        assets.by_session.iter().find(|(_, asset)| asset.as_str() == session_id)
            .map(|(key, _)| key.clone())
            .ok_or_else(|| BuildingError::not_found(session_id))?
    } else if session_id.starts_with("sr_") && session_id.len() == 35
        && session_id.as_bytes()[3..].iter().all(|b| b.is_ascii_hexdigit())
    {
        session_ref::resolve(&salt, session_id, keys.clone()).ok_or_else(|| BuildingError::not_found(session_id))?
    } else {
        return Err(BuildingError::not_found(session_id));
    };
    let assets = city_assets::publish(home, conn, std::slice::from_ref(&session_key)).map_err(|_| store_unavailable())?;
    let asset_ref = assets.by_session.get(&session_key).cloned().ok_or_else(|| BuildingError::not_found(session_id))?;
    let (harness, tokens_total) = session_stats(conn, &session_key)?;
    Ok(BuildingIdentity {
        asset_ref,
        session_id: session_ref(&salt, &session_key),
        harness,
        tokens_total,
    })
}

fn session_stats(conn: &Connection, session_key: &str) -> Result<(String, i64), BuildingError> {
    let harness: String = conn.query_row(
        "SELECT harness FROM sessions WHERE session_key=?1 AND deleted_at_ms IS NULL",
        [session_key],
        |r| r.get(0),
    ).map_err(|_| BuildingError::not_found(session_key))?;
    let tokens: i64 = conn.query_row(
        "SELECT COALESCE(SUM(uncached_input_tokens+cache_read_tokens+cache_write_tokens+output_tokens),0)
         FROM usage_facts WHERE session_key=?1 AND deleted_at_ms IS NULL AND observation_kind != 'legacy_aggregate'",
        [session_key],
        |r| r.get(0),
    ).unwrap_or(0);
    Ok((harness, tokens))
}

fn projection_meta(identity: &BuildingIdentity, summary: &Value, kit_status: &str) -> Value {
    json!({
        "asset_ref": identity.asset_ref,
        "session_id": identity.session_id,
        "harness": identity.harness,
        "height": summary["height"],
        "parcel": { "state": "unavailable", "reason": "city_layout_deferred_until_v3_default" },
        "kit_status": kit_status,
        "screenshot": { "state": "unavailable", "reason": "optional_vision_attachment_not_in_mvp" },
    })
}

pub fn get_building(home: &Path, conn: &Connection, session_id: &str) -> Result<Value, BuildingError> {
    let identity = resolve_identity(home, conn, session_id)?;
    let db = open_store(home)?;
    let stored = load_override(&db, &identity.asset_ref)?;
    let (model, source, kit_status) = match &stored.model {
        Some(model) => {
            let status = if stored.kit_version == KIT_VERSION { "current" } else { "frozen" };
            (model.clone(), "override", status)
        }
        None => (default_model(identity.tokens_total), "default", "current"),
    };
    let summary = geometric_summary(&model);
    Ok(json!({
        "ok": true,
        "error": Value::Null,
        "source": source,
        "revision": stored.revision,
        "kit_version": stored.kit_version,
        "model": model,
        "summary": summary,
        "observe": { "text": observe_text(source, &summary, stored.revision), "summary": summary },
        "projection": projection_meta(&identity, &summary, kit_status),
    }))
}

pub fn preview_building(home: &Path, conn: &Connection, session_id: &str, model: &Value) -> Result<Value, BuildingError> {
    let identity = resolve_identity(home, conn, session_id)?;
    match validate_model(model) {
        Ok(clean) => {
            let summary = geometric_summary(&clean);
            Ok(json!({
                "ok": true,
                "error": Value::Null,
                "persisted": false,
                "kit_version": KIT_VERSION,
                "model": clean,
                "summary": summary,
                "observe": { "text": observe_text("preview", &summary, 0), "summary": summary },
                "projection": projection_meta(&identity, &summary, "current"),
            }))
        }
        Err(error) => Ok(json!({
            "ok": false,
            "error": error.to_json(),
            "persisted": false,
            "kit_version": KIT_VERSION,
            "summary": Value::Null,
            "projection": {
                "asset_ref": identity.asset_ref,
                "session_id": identity.session_id,
                "harness": identity.harness,
                "parcel": { "state": "unavailable", "reason": "city_layout_deferred_until_v3_default" },
            },
        })),
    }
}

pub fn set_building_model(home: &Path, conn: &Connection, session_id: &str, model: &Value, expected_revision: u64) -> Result<Value, BuildingError> {
    let identity = resolve_identity(home, conn, session_id)?;
    let clean = match validate_model(model) {
        Ok(clean) => clean,
        Err(error) => {
            return Ok(json!({
                "ok": false,
                "error": error.to_json(),
                "persisted": false,
                "revision": current_revision(home, &identity.asset_ref)?,
            }));
        }
    };
    apply_override(home, &identity, Some(clean), expected_revision, "set")
}

pub fn reset_building(home: &Path, conn: &Connection, session_id: &str, expected_revision: u64) -> Result<Value, BuildingError> {
    let identity = resolve_identity(home, conn, session_id)?;
    apply_override(home, &identity, None, expected_revision, "reset")
}

fn current_revision(home: &Path, asset_ref: &str) -> Result<u64, BuildingError> {
    let db = open_store(home)?;
    Ok(load_override(&db, asset_ref)?.revision)
}

fn apply_override(
    home: &Path,
    identity: &BuildingIdentity,
    model: Option<Value>,
    expected_revision: u64,
    kind: &str,
) -> Result<Value, BuildingError> {
    let db = open_store(home)?;
    db.execute_batch("BEGIN IMMEDIATE").map_err(|_| store_unavailable())?;
    let stored = match load_override(&db, &identity.asset_ref) {
        Ok(stored) => stored,
        Err(error) => { let _ = db.execute_batch("ROLLBACK"); return Err(error); }
    };
    if stored.revision != expected_revision {
        let _ = db.execute_batch("ROLLBACK");
        return Ok(json!({
            "ok": false,
            "error": BuildingError::conflict(stored.revision).to_json(),
            "persisted": false,
            "revision": stored.revision,
        }));
    }
    let next = stored.revision + 1;
    let now = crate::clock::now_ms();
    let model_json = model.as_ref().map(|value| value.to_string());
    let kit_version = model.as_ref()
        .and_then(|value| value.get("kit_version").and_then(Value::as_str))
        .unwrap_or(KIT_VERSION);
    if db.execute(
        "INSERT INTO overrides(asset_ref, revision, kit_version, model_json, updated_at_ms)
         VALUES(?1, ?2, ?3, ?4, ?5)
         ON CONFLICT(asset_ref) DO UPDATE SET
            revision=excluded.revision, kit_version=excluded.kit_version,
            model_json=excluded.model_json, updated_at_ms=excluded.updated_at_ms",
        params![identity.asset_ref, next as i64, kit_version, model_json, now],
    ).is_err() {
        let _ = db.execute_batch("ROLLBACK");
        return Err(store_unavailable());
    }
    let applied = match &model {
        Some(value) => value.clone(),
        None => default_model(identity.tokens_total),
    };
    let summary = geometric_summary(&applied);
    let part_count = summary["part_count"].as_u64().unwrap_or(0) as i64;
    let build_event_id = match new_build_event_id(&db) {
        Ok(id) => id,
        Err(error) => { let _ = db.execute_batch("ROLLBACK"); return Err(error); }
    };
    if db.execute(
        "INSERT INTO build_events(build_event_id, asset_ref, revision, kind, part_count, created_at_ms)
         VALUES(?1, ?2, ?3, ?4, ?5, ?6)",
        params![build_event_id, identity.asset_ref, next as i64, kind, part_count, now],
    ).is_err() {
        let _ = db.execute_batch("ROLLBACK");
        return Err(store_unavailable());
    }
    db.execute_batch("COMMIT").map_err(|_| store_unavailable())?;
    let source = if model.is_some() { "override" } else { "default" };
    Ok(json!({
        "ok": true,
        "error": Value::Null,
        "persisted": true,
        "source": source,
        "revision": next,
        "build_event_id": build_event_id,
        "kit_version": kit_version,
        "model": applied,
        "summary": summary,
        "observe": { "text": observe_text(source, &summary, next), "summary": summary },
        "construction": construction_stub(kind, part_count as usize, &build_event_id),
        "projection": projection_meta(identity, &summary, "current"),
    }))
}

#[cfg(test)]
mod tests {
    use super::*;
    use agent_vitals_data::authority::{AuthorityDb, default_authority_path};

    fn valid_part(id: &str, y: f64) -> Value {
        json!({"id": id, "kind": "box", "role": "wall", "at": [0.0, y, 0.0], "size": [2.0, 1.0, 2.0]})
    }
    fn valid_model(parts: Vec<Value>) -> Value {
        json!({"kit_version": KIT_VERSION, "params": {"form": "tower"}, "parts": parts})
    }

    #[test]
    fn rejects_too_many_parts_unknown_fields_overlap_and_out_of_bounds() {
        let mut parts = Vec::new();
        for i in 0..65 {
            parts.push(json!({"id": format!("p{i}"), "kind": "box", "role": "wall",
                "at": [0.0, i as f64, 0.0], "size": [1.0, 0.8, 1.0]}));
        }
        let err = validate_model(&valid_model(parts)).unwrap_err();
        assert_eq!(err.rule, "parts_limit");
        assert_eq!(err.kind, "validation");

        let err = validate_model(&json!({"kit_version": KIT_VERSION, "params": {}, "parts": [valid_part("a", 0.0)], "script": "nope"})).unwrap_err();
        assert_eq!(err.rule, "invalid_model");
        assert!(err.message.contains("script"));

        let err = validate_model(&valid_model(vec![valid_part("a", 0.0), valid_part("b", 0.2)])).unwrap_err();
        assert_eq!(err.rule, "overlap");
        assert_eq!(err.parts, vec!["a", "b"]);

        let far = json!({"id": "away", "kind": "box", "role": "wall", "at": [20.0, 0.0, 0.0], "size": [2.0, 1.0, 2.0]});
        let err = validate_model(&valid_model(vec![far])).unwrap_err();
        assert_eq!(err.rule, "out_of_bounds");
    }

    #[test]
    fn accepts_stacked_boxes_and_summarises_height() {
        let model = validate_model(&valid_model(vec![valid_part("a", 0.0), valid_part("b", 1.2)])).unwrap();
        let summary = geometric_summary(&model);
        assert_eq!(summary["part_count"], 2);
        assert_eq!(summary["height"], 2.2);
    }

    fn seed() -> (std::path::PathBuf, AuthorityDb, String) {
        let home = std::env::temp_dir().join(format!(
            "av-city-bldg-{}-{}",
            std::process::id(),
            std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos()
        ));
        std::fs::create_dir_all(&home).unwrap();
        let db = AuthorityDb::open(&default_authority_path(&home), 1_700_000_000_000).unwrap();
        db.conn().execute(
            "INSERT INTO sync_runs(run_id, started_at_ms, trigger, status, schema_version) VALUES ('run',1,'cli','succeeded',2)",
            [],
        ).unwrap();
        db.conn().execute(
            "INSERT INTO sessions(session_key, harness, native_session_id, machine_namespace, last_observed_at_ms)
             VALUES ('sess-one', 'codex', 'native-one', 'ns', 1)",
            [],
        ).unwrap();
        db.conn().execute(
            "INSERT INTO usage_facts(fact_id, harness, machine_namespace, native_session_id, session_key,
                 source_event_id, observation_kind, event_ts_ms, uncached_input_tokens, cache_read_tokens,
                 cache_write_tokens, output_tokens, ingested_run_id, created_at_ms, updated_at_ms)
             VALUES ('f1', 'codex', 'ns', 'native-one', 'sess-one', 'e1', 'assistant-usage', 1, 100, 0, 0, 50, 'run', 1, 1)",
            [],
        ).unwrap();
        let salt = session_ref::load_or_create_salt(&home).unwrap();
        let session_id = session_ref(&salt, "sess-one");
        (home, db, session_id)
    }

    #[test]
    fn override_survives_reopen_and_reset_restores_default() {
        let (home, db, session_id) = seed();
        let got = get_building(&home, db.conn(), &session_id).unwrap();
        assert_eq!(got["ok"], true);
        assert_eq!(got["source"], "default");
        assert_eq!(got["revision"], 0);
        assert_eq!(got["model"]["parts"].as_array().unwrap().len(), 3);
        let asset = got["projection"]["asset_ref"].as_str().unwrap().to_string();
        assert!(asset.starts_with("ca_"));

        let proposed = valid_model(vec![
            json!({"id": "base", "kind": "box", "role": "structure", "at": [0.0, 0.0, 0.0], "size": [3.0, 2.0, 3.0]}),
            json!({"id": "cap", "kind": "cone", "role": "roof", "at": [0.0, 2.0, 0.0], "size": [2.0, 1.5, 2.0]}),
        ]);
        let fail = preview_building(&home, db.conn(), &session_id, &valid_model(vec![
            valid_part("a", 0.0), valid_part("b", 0.2),
        ])).unwrap();
        assert_eq!(fail["ok"], false);
        assert_eq!(fail["error"]["rule"], "overlap");
        assert_eq!(fail["persisted"], false);

        let pass = preview_building(&home, db.conn(), &session_id, &proposed).unwrap();
        assert_eq!(pass["ok"], true);
        assert_eq!(pass["persisted"], false);

        let conflict = set_building_model(&home, db.conn(), &session_id, &proposed, 9).unwrap();
        assert_eq!(conflict["ok"], false);
        assert_eq!(conflict["error"]["kind"], "conflict");
        assert_eq!(conflict["revision"], 0);

        let set = set_building_model(&home, db.conn(), &session_id, &proposed, 0).unwrap();
        assert_eq!(set["ok"], true);
        assert_eq!(set["revision"], 1);
        assert!(set["build_event_id"].as_str().unwrap().starts_with("be_"));
        assert_eq!(set["construction"]["mode"], "block-by-block");
        assert_eq!(set["construction"]["replayable"], true);

        drop(db);
        let db = AuthorityDb::open(&default_authority_path(&home), 1_700_000_000_000).unwrap();
        let again = get_building(&home, db.conn(), &asset).unwrap();
        assert_eq!(again["source"], "override");
        assert_eq!(again["revision"], 1);
        assert_eq!(again["model"]["parts"][1]["id"], "cap");

        let reset = reset_building(&home, db.conn(), &session_id, 1).unwrap();
        assert_eq!(reset["ok"], true);
        assert_eq!(reset["revision"], 2);
        assert_eq!(reset["source"], "default");
        let after = get_building(&home, db.conn(), &session_id).unwrap();
        assert_eq!(after["source"], "default");
        assert_eq!(after["revision"], 2);
        let _ = std::fs::remove_dir_all(&home);
    }
}
