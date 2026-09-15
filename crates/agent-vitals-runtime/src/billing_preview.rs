//! 计费声明的保存前影响预览（计费主链规格 §5.5）。
//!
//! 三组数字、同一谓词：`moved`（会被移出按量估算的事实）、`kept`（同宿主/
//! provider/期间内**未**命中作用域、继续按量估算的事实）、`pending`（命中但
//! 证据为 `conflict`、既不移出也不归因的事实）。事实选择来自
//! `authority::billing_declaration_fact_selection`——与重算归因同一条 `WHERE`；
//! 金额来自 `mcp::cost_breakdown::price_fact_selection`——与 MCP `cost_breakdown`
//! 同一条计价路径。这里没有第二套 SQL，也没有第二套价格查询。

use agent_vitals_data::authority::{
    billing_declaration_fact_selection, AuthorityDb, ConflictEvidence,
};
use serde_json::{json, Value};
use std::collections::BTreeMap;

use crate::mcp::cost_breakdown::{price_fact_selection, WindowResult};

/// 非 `official_subscription` 的关系在 Beta 不改变金额：预览仍返回三组数字，
/// 但 `moved` 的金额恒空并带 `changes_amounts: false`，UI 必须照实显示。
pub fn declaration_impact_preview(
    db: &AuthorityDb, host: &str, provider_id: &str, relationship_kind: &str,
    effective_start: &str, effective_end: Option<&str>, scopes: &[(&str, &str)],
) -> Value {
    let counts = match db.billing_declaration_impact_preview_for(
        host, provider_id, effective_start, effective_end, scopes, None,
    ) {
        Ok(counts) => counts,
        Err(error) => return json!({ "status": "unavailable", "reason": error.to_string() }),
    };
    let priced = |scopes: &[(&str, &str)]| -> Result<WindowResult, String> {
        let selection = billing_declaration_fact_selection(
            host, provider_id, effective_start, effective_end, scopes, None, ConflictEvidence::Exclude,
        );
        price_fact_selection(db.conn(), &selection.where_sql, &selection.params, &[])
            .map_err(|error| error.message)
    };
    let moved = match priced(scopes) {
        Ok(result) => result,
        Err(reason) => return json!({ "status": "unavailable", "reason": reason }),
    };
    let all = match priced(&[]) {
        Ok(result) => result,
        Err(reason) => return json!({ "status": "unavailable", "reason": reason }),
    };
    let changes_amounts = relationship_kind == "official_subscription";
    let kept_amounts = subtract_amounts(&all.amounts, &moved.amounts);
    json!({
        "status": "ok",
        "host": host, "provider_id": provider_id, "relationship_kind": relationship_kind,
        "effective_start": effective_start, "effective_end": effective_end,
        "scopes": scopes.iter().map(|(kind, value)| json!({ "scope_kind": kind, "scope_value": value })).collect::<Vec<_>>(),
        "changes_amounts": changes_amounts,
        "moved": {
            "fact_count": counts.fact_count,
            "session_count": counts.session_count,
            "tokens": counts.total_tokens,
            "unpriced_tokens": moved.unresolved_tokens,
            "amounts": if changes_amounts { moved.amounts.clone() } else { Vec::new() },
            "estimated_amounts": moved.amounts,
        },
        "kept": {
            "tokens": all.total_tokens.saturating_sub(counts.total_tokens),
            "unpriced_tokens": all.unresolved_tokens.saturating_sub(moved.unresolved_tokens),
            "amounts": kept_amounts,
        },
        "pending": {
            "fact_count": counts.conflict_fact_count,
            "tokens": counts.conflict_tokens,
            "reasons": if counts.conflict_fact_count > 0 { vec!["route-evidence-conflict"] } else { Vec::new() },
        },
        "first_event_ts_ms": counts.first_event_ts_ms,
        "last_event_ts_ms": counts.last_event_ts_ms,
    })
}

/// 按 `(currency, basis)` 逐槽相减，永不跨币种；负数说明两次选择不是子集关系，
/// 属于谓词漂移，钳到 0 并不掩盖——`kept.tokens` 会同时暴露。
fn subtract_amounts(all: &[Value], moved: &[Value]) -> Vec<Value> {
    let mut slots: BTreeMap<(String, String), i64> = BTreeMap::new();
    for row in all {
        let key = amount_key(row);
        *slots.entry(key).or_insert(0) += row.get("amount_minor").and_then(Value::as_i64).unwrap_or(0);
    }
    for row in moved {
        let key = amount_key(row);
        *slots.entry(key).or_insert(0) -= row.get("amount_minor").and_then(Value::as_i64).unwrap_or(0);
    }
    slots.into_iter().map(|((currency, basis), amount_minor)| json!({
        "amount_minor": amount_minor.max(0), "currency": currency, "basis": basis,
    })).collect()
}

fn amount_key(row: &Value) -> (String, String) {
    (
        row.get("currency").and_then(Value::as_str).unwrap_or("").to_owned(),
        row.get("basis").and_then(Value::as_str).unwrap_or("").to_owned(),
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_home(tag: &str) -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!("avr-billing-preview-{tag}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn seed_codex_fact(db: &AuthorityDb, fact_id: &str, model: &str, event_ts_ms: i64, uncached: i64, output: i64) {
        db.conn().execute(
            "INSERT INTO sync_runs(run_id, started_at_ms, trigger, status, schema_version)
             VALUES ('run', 1, 'cli', 'succeeded', 13) ON CONFLICT(run_id) DO NOTHING", [],
        ).unwrap();
        db.conn().execute(
            "INSERT INTO usage_facts(fact_id, host, machine_namespace, native_session_id, source_event_id,
                 observation_kind, provider_id, model_id, event_ts_ms, event_peak, pricing_basis,
                 evidence_basis, billing_mode, uncached_input_tokens, cache_read_tokens,
                 cache_write_tokens, output_tokens, ingested_run_id, created_at_ms, updated_at_ms)
             VALUES (?1, 'codex', 'm', 'sess', ?1, 'token_count', 'openai', ?2, ?3, 0, 'metered_estimate',
                 'session-native', 'metered', ?4, 0, 0, ?5, 'run', 1, 1)",
            rusqlite::params![fact_id, model, event_ts_ms, uncached, output],
        ).unwrap();
    }

    fn amounts_of(rows: &[Value], billing_mode: &str) -> BTreeMap<(String, String), i64> {
        let mut out = BTreeMap::new();
        for row in rows {
            if row["key"]["billing_mode"] != json!(billing_mode) { continue; }
            let Some(amount) = row.get("amount").filter(|a| !a.is_null()) else { continue; };
            *out.entry(amount_key(amount)).or_insert(0) += amount["amount_minor"].as_i64().unwrap();
        }
        out
    }

    /// 规格 R5：预览「移出估算」的金额 == 重算后 MCP `cost_breakdown` 从按量桶里
    /// 消失、进入 `subscription` 桶的那部分——同一谓词、同一计价路径。同时钉
    /// 住：不在作用域内的模型留在 `kept`，且预览不写任何行。
    #[test]
    fn preview_moved_amounts_equal_cost_breakdown_subscription_bucket_after_recalc() {
        let home = temp_home("r5");
        let path = agent_vitals_data::authority::default_authority_path(&home);
        let db = AuthorityDb::open(&path, 1).unwrap();
        let (month_start, _) = agent_vitals_data::authority_query::beijing_month_bounds_ms("2026-08").unwrap();
        let noon = month_start + 12 * 3_600_000;
        let snapshot = json!({
            "pricing": agent_vitals_domain::cost::load_pricing(),
            "codex_pricing": crate::sessions::codex_cost::load_codex_pricing(),
        }).to_string();
        db.pricing_snapshot_put("v-test", "test", &snapshot, month_start - 1_000).unwrap();
        seed_codex_fact(&db, "f-move-a", "gpt-5.6-sol", noon, 1_000_000, 100_000);
        seed_codex_fact(&db, "f-move-b", "gpt-5.6-sol", noon + 3_600_000, 500_000, 50_000);
        seed_codex_fact(&db, "f-keep", "gpt-5.6-luna", noon + 7_200_000, 700_000, 70_000);

        let scopes = [("model", "gpt-5.6-sol")];
        let preview = declaration_impact_preview(
            &db, "codex", "openai", "official_subscription", "2026-08", Some("2026-08"), &scopes,
        );
        assert_eq!(preview["status"], json!("ok"), "{preview}");
        assert_eq!(preview["changes_amounts"], json!(true));
        assert_eq!(preview["moved"]["fact_count"], json!(2));
        assert_eq!(preview["moved"]["tokens"], json!(1_650_000));
        assert_eq!(preview["kept"]["tokens"], json!(770_000));
        assert_eq!(preview["pending"]["fact_count"], json!(0));
        let moved_amounts = preview["moved"]["amounts"].as_array().unwrap();
        assert_eq!(moved_amounts.len(), 1, "one currency, one basis: {moved_amounts:?}");
        assert_eq!(moved_amounts[0]["currency"], json!("USD"));
        let moved_usd = moved_amounts[0]["amount_minor"].as_i64().unwrap();
        assert!(moved_usd > 0);
        let kept_usd = preview["kept"]["amounts"][0]["amount_minor"].as_i64().unwrap();
        assert!(kept_usd > 0);
        assert_eq!(db.conn().query_row(
            "SELECT COUNT(*) FROM billing_declaration_revisions", [], |row| row.get::<_, i64>(0),
        ).unwrap(), 0, "preview must not persist anything");

        let breakdown_args = json!({"from": "2026-08-01", "to": "2026-08-31"});
        let before = crate::mcp::cost_breakdown::run(&breakdown_args, &home).unwrap();
        let before_rows = before["data"]["breakdown"].as_array().unwrap().clone();
        let before_metered: i64 = amounts_of(&before_rows, "metered").values().sum();
        assert_eq!(before_metered, moved_usd + kept_usd, "preview moved + kept == whole metered window");

        db.billing_declaration_revision_save(
            "rev-r5", "decl-r5", None, "codex", "openai", "official_subscription",
            None, None, None, "2026-08", Some("2026-08"), None, None, &scopes, 2,
        ).unwrap();
        db.billing_recalculation_enqueue("job-r5", "decl-r5", "rev-r5", 3).unwrap();
        assert!(db.billing_recalculation_run("job-r5", 4).unwrap());
        drop(db);

        let after = crate::mcp::cost_breakdown::run(&breakdown_args, &home).unwrap();
        let after_rows = after["data"]["breakdown"].as_array().unwrap().clone();
        let after_metered: i64 = amounts_of(&after_rows, "metered").values().sum();
        assert_eq!(after_metered, kept_usd, "what stays metered is exactly the preview's kept amount");
        assert_eq!(before_metered - after_metered, moved_usd, "what left the metered bucket is exactly the preview's moved amount");
        let subscription_tokens: i64 = after_rows.iter()
            .filter(|row| row["key"]["billing_mode"] == json!("subscription"))
            .map(|row| row["tokens"]["total"].as_i64().unwrap()).sum();
        assert_eq!(subscription_tokens, 1_650_000);
        let _ = std::fs::remove_dir_all(&home);
    }

    #[test]
    fn kept_amounts_subtract_per_currency_and_basis_only() {
        let all = vec![
            json!({"amount_minor": 1000, "currency": "USD", "basis": "metered_estimate"}),
            json!({"amount_minor": 500, "currency": "CNY", "basis": "metered_estimate"}),
        ];
        let moved = vec![json!({"amount_minor": 300, "currency": "USD", "basis": "metered_estimate"})];
        let kept = subtract_amounts(&all, &moved);
        assert_eq!(kept, vec![
            json!({"amount_minor": 500, "currency": "CNY", "basis": "metered_estimate"}),
            json!({"amount_minor": 700, "currency": "USD", "basis": "metered_estimate"}),
        ]);
    }
}
