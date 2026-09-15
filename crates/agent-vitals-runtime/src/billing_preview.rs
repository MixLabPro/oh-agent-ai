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

/// 「确认计费方式」面板的数据源（规格 §5.2 / B1）：`summary::unresolved_billing_groups_in`
/// 的组 + 同一批事实的分币估算金额。金额来自 `price_fact_selection` 跑
/// `SQL_UNRESOLVED_BILLING_FACT_WHERE`（与组 SQL 共享的谓词），按组键
/// `(host, provider, model, evidence_basis, pricing_basis)` 归并、不跨币种相加。
/// 排序：有金额的组按 `amount_minor` 降序，无价卡的组按 tokens 降序排在其后。
pub fn confirmation_groups(db: &AuthorityDb, month: &str) -> Value {
    confirmation_groups_with(db, month, &account_evidence_by_host())
}

/// 账户证据由调用方注入（测试不读真实 HOME）。
pub fn confirmation_groups_with(
    db: &AuthorityDb, month: &str,
    accounts: &std::collections::BTreeMap<String, agent_vitals_provider::AccountEvidence>,
) -> Value {
    let mut report = crate::summary::unresolved_billing_groups_in(db, month);
    if report["status"] != json!("ok") {
        return report;
    }
    let Some((start, end)) = agent_vitals_data::authority_query::beijing_month_bounds_ms(month) else {
        return report;
    };
    let priced = match price_fact_selection(
        db.conn(),
        agent_vitals_data::authority_query::SQL_UNRESOLVED_BILLING_FACT_WHERE,
        &[rusqlite::types::Value::Integer(start), rusqlite::types::Value::Integer(end)],
        &[],
    ) {
        Ok(priced) => priced,
        Err(error) => {
            report["pricing_status"] = json!({ "status": "unavailable", "reason": error.message });
            return report;
        }
    };
    let mut amounts: BTreeMap<String, BTreeMap<(String, String), i64>> = BTreeMap::new();
    let mut unpriced: BTreeMap<String, (i64, Option<String>)> = BTreeMap::new();
    for row in &priced.rows {
        let key = row["key"].as_object().map(|key| format!(
            "{}|{}|{}|{}|{}|{month}",
            key["host"].as_str().unwrap_or(""),
            key["provider"].as_str().unwrap_or("<unknown>"),
            key["model"].as_str().unwrap_or("<unknown>"),
            key["evidence_basis"].as_str().unwrap_or("missing"),
            key["pricing_basis"].as_str().unwrap_or("unavailable"),
        )).unwrap_or_default();
        match row.get("amount").filter(|amount| !amount.is_null()) {
            Some(amount) => {
                *amounts.entry(key).or_default().entry(amount_key(amount)).or_insert(0)
                    += amount["amount_minor"].as_i64().unwrap_or(0);
            }
            None => {
                let slot = unpriced.entry(key).or_insert((0, None));
                slot.0 += row["tokens"]["total"].as_i64().unwrap_or(0);
                if slot.1.is_none() {
                    slot.1 = row["unresolved_reason"].as_str().map(ToOwned::to_owned);
                }
            }
        }
    }
    let Some(groups) = report["groups"].as_array_mut() else { return report; };
    for group in groups.iter_mut() {
        let id = group["group_id"].as_str().unwrap_or("").to_owned();
        let estimated = amounts.remove(&id).unwrap_or_default().into_iter()
            .map(|((currency, basis), amount_minor)| json!({
                "amount_minor": amount_minor, "currency": currency, "basis": basis,
            })).collect::<Vec<_>>();
        let (unpriced_tokens, reason) = unpriced.remove(&id).unwrap_or((0, None));
        group["estimated_amounts"] = json!(estimated);
        group["unpriced_tokens"] = json!(unpriced_tokens);
        group["unresolved_reason"] = json!(reason);
        group.as_object_mut().map(|object| object.remove("estimated_cost_minor"));
    }
    groups.sort_by(|a, b| {
        let amount = |group: &Value| group["estimated_amounts"].as_array()
            .and_then(|rows| rows.iter().filter_map(|row| row["amount_minor"].as_i64()).max());
        let tokens = |group: &Value| group["tokens"].as_i64().unwrap_or(0);
        match (amount(a), amount(b)) {
            (Some(x), Some(y)) => y.cmp(&x).then_with(|| tokens(b).cmp(&tokens(a))),
            (Some(_), None) => std::cmp::Ordering::Less,
            (None, Some(_)) => std::cmp::Ordering::Greater,
            (None, None) => tokens(b).cmp(&tokens(a)),
        }
    });
    // E 类：workbuddy 是积分制，不是货币——不进待确认列表（规格 §0 表 E）。
    groups.retain(|group| group["host"] != json!("workbuddy") && group["tokens"].as_i64().unwrap_or(0) > 0);
    for group in groups.iter_mut() {
        let verdict = auto_verdict(group, accounts);
        group["auto_verdict"] = verdict;
    }
    let clusters = clusters_of(groups);
    report["clusters"] = json!(clusters);
    report
}

/// 账户级证据（L2）：每个宿主读一次白名单字段；文件缺失 → 无证据。
fn account_evidence_by_host() -> std::collections::BTreeMap<String, agent_vitals_provider::AccountEvidence> {
    let mut out = std::collections::BTreeMap::new();
    let Some(home) = std::env::var_os("HOME").map(std::path::PathBuf::from) else { return out; };
    if let Some(e) = agent_vitals_hosts::claude_account::read_claude_account(&home) {
        out.insert(e.host.clone(), e);
    }
    if let Some(e) = agent_vitals_hosts::codex_account::read_codex_account(&home) {
        out.insert(e.host.clone(), e);
    }
    out
}

/// 证据里已能说明「走的是官方路由」的 basis（与 `workbench.js::BILLING_ROUTE_KNOWN_OFFICIAL` 同表）。
const ROUTE_KNOWN_OFFICIAL: [&str; 4] = [
    "explicit-official-route", "session-native", "account-time-bound", "config-time-bound",
];

/// 程序判定（规格 §2 阶梯的合成，§5.1 三态）。只用事实里已有的 provider/evidence、
/// 目录里的 L0 厂商和白名单账户证据；`inferred` 永远到不了 determined。
fn auto_verdict(
    group: &Value, accounts: &std::collections::BTreeMap<String, agent_vitals_provider::AccountEvidence>,
) -> Value {
    use agent_vitals_provider::PlanKind;
    let host = group["host"].as_str().unwrap_or("");
    let provider = group["provider_id"].as_str().filter(|p| *p != "<unknown>").map(str::to_string);
    let model = group["model_id"].as_str().unwrap_or("");
    let evidence = group["evidence_basis"].as_str().unwrap_or("missing");
    let vendor = agent_vitals_domain::attribution::model_vendor(model);
    let vendor_name = vendor.as_ref().map(|v| v.vendor.clone());
    let gateway_named = vendor.as_ref().is_some_and(|v| v.gateway_named);
    let mut basis: Vec<String> = Vec::new();
    let route_state = if provider.is_some() && ROUTE_KNOWN_OFFICIAL.contains(&evidence) {
        basis.push(format!("route.{evidence}"));
        "official"
    } else if provider.is_some() {
        basis.push("host.provider_reported".to_string());
        "provider_reported"
    } else if gateway_named {
        basis.push("model.gateway_named".to_string());
        "gateway"
    } else if evidence == "inferred" && vendor_name.is_some() {
        basis.push("response_id.vendor_shape".to_string());
        "vendor_shape"
    } else {
        "unknown"
    };
    // 网关式命名：计费方是中转，不是模型厂商——计费方留空，厂商只作展示。
    let billing_party = provider.clone().or_else(|| if route_state == "gateway" { None } else { vendor_name.clone() });
    let account = accounts.get(host).filter(|a| Some(&a.vendor) == billing_party.as_ref());
    let mut plan = json!(null);
    let (state, relationship_kind, billing_mode) = match (route_state, account.map(|a| a.plan_kind)) {
        ("official", Some(PlanKind::Subscription)) => {
            let a = account.unwrap();
            basis.push(format!("account.{}", a.plan_label.clone().unwrap_or_else(|| "subscription".into())));
            plan = json!({ "label": a.plan_label, "channel": a.billing_channel, "anchor_date": a.anchor_date, "source": a.source });
            ("determined", Some("official_subscription"), Some("subscription"))
        }
        ("official", Some(PlanKind::ApiKey)) => {
            basis.push("account.api_key".to_string());
            ("determined", Some("official_api"), Some("metered"))
        }
        // codex：rollout 自报 openai + 账户 chatgpt 登录 → 请求走 ChatGPT 后端，按套餐计。
        ("provider_reported", Some(PlanKind::Subscription)) if host == "codex" => {
            let a = account.unwrap();
            basis.push(format!("account.{}", a.plan_label.clone().unwrap_or_else(|| "subscription".into())));
            plan = json!({ "label": a.plan_label, "channel": a.billing_channel, "anchor_date": a.anchor_date, "source": a.source });
            ("determined", Some("official_subscription"), Some("subscription"))
        }
        ("official", _) | ("provider_reported", _) => ("one_question", None, None),
        ("gateway", _) | ("vendor_shape", _) => ("one_question", None, Some("metered")),
        _ => ("needs_input", None, None),
    };
    let question = match (state, route_state) {
        ("one_question", "official") | ("one_question", "provider_reported") => json!("billing_mode"),
        ("one_question", _) => json!("route"),
        _ => json!(null),
    };
    json!({
        "model_vendor": vendor_name,
        "gateway_named": gateway_named,
        "route_state": route_state,
        "route_basis": evidence,
        "billing_party": billing_party,
        "billing_mode": billing_mode,
        "relationship_kind": relationship_kind,
        "plan": plan,
        "state": state,
        "question": question,
        "basis": basis,
    })
}

/// 列表行 = `host × 计费方/厂商 × route_state × 判定状态`；模型折进 `models[]`，
/// 数字求和、金额按币种归并。
fn clusters_of(groups: &[Value]) -> Vec<Value> {
    let mut order: Vec<String> = Vec::new();
    let mut by_key: BTreeMap<String, Value> = BTreeMap::new();
    for group in groups {
        let v = &group["auto_verdict"];
        let key = format!(
            "{}|{}|{}|{}|{}|{}",
            group["host"].as_str().unwrap_or(""),
            v["billing_party"].as_str().unwrap_or("<unknown>"),
            v["route_state"].as_str().unwrap_or("unknown"),
            v["state"].as_str().unwrap_or("needs_input"),
            group["effective_start"].as_str().unwrap_or(""),
            group["effective_end"].as_str().unwrap_or(""),
        );
        let entry = by_key.entry(key.clone()).or_insert_with(|| {
            order.push(key.clone());
            json!({
                "cluster_id": key,
                "host": group["host"], "billing_party": v["billing_party"], "model_vendor": v["model_vendor"],
                "provider_id": group["provider_id"], "evidence_basis": group["evidence_basis"],
                "pricing_basis": group["pricing_basis"],
                "effective_start": group["effective_start"], "effective_end": group["effective_end"],
                "auto_verdict": v.clone(),
                "models": [], "group_ids": [], "tokens": 0, "session_count": 0, "unpriced_tokens": 0,
                "estimated_amounts": [],
            })
        });
        entry["models"].as_array_mut().unwrap().push(json!({
            "model_id": group["model_id"], "tokens": group["tokens"], "session_count": group["session_count"],
            "estimated_amounts": group["estimated_amounts"], "group_id": group["group_id"],
        }));
        entry["group_ids"].as_array_mut().unwrap().push(group["group_id"].clone());
        for field in ["tokens", "session_count", "unpriced_tokens"] {
            let sum = entry[field].as_i64().unwrap_or(0) + group[field].as_i64().unwrap_or(0);
            entry[field] = json!(sum);
        }
        let mut amounts: BTreeMap<(String, String), i64> = entry["estimated_amounts"].as_array().unwrap().iter()
            .map(|row| (amount_key(row), row["amount_minor"].as_i64().unwrap_or(0))).collect();
        for row in group["estimated_amounts"].as_array().into_iter().flatten() {
            *amounts.entry(amount_key(row)).or_insert(0) += row["amount_minor"].as_i64().unwrap_or(0);
        }
        entry["estimated_amounts"] = json!(amounts.into_iter().map(|((currency, basis), amount_minor)| json!({
            "amount_minor": amount_minor, "currency": currency, "basis": basis,
        })).collect::<Vec<_>>());
    }
    let mut clusters: Vec<Value> = order.into_iter().filter_map(|k| by_key.remove(&k)).collect();
    // 程序已判定的置顶（一键确认清掉最多），其余按金额降序，无价卡按 tokens。
    clusters.sort_by(|a, b| {
        let rank = |c: &Value| match c["auto_verdict"]["state"].as_str() {
            Some("determined") => 0, Some("one_question") => 1, _ => 2,
        };
        let amount = |c: &Value| c["estimated_amounts"].as_array()
            .and_then(|rows| rows.iter().filter_map(|row| row["amount_minor"].as_i64()).max()).unwrap_or(-1);
        let tokens = |c: &Value| c["tokens"].as_i64().unwrap_or(0);
        rank(a).cmp(&rank(b)).then_with(|| amount(b).cmp(&amount(a))).then_with(|| tokens(b).cmp(&tokens(a)))
    });
    clusters
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

    /// 规格 R3：待确认组带分币估算金额、按金额降序；只有 `official_subscription`
    /// 的重算让组消失（其他关系不改数字），撤销后组立即回来（撤销不需要重算）。
    #[test]
    fn confirmation_groups_price_and_react_to_subscription_attribution_only() {
        let home = temp_home("r3");
        let path = agent_vitals_data::authority::default_authority_path(&home);
        let db = AuthorityDb::open(&path, 1).unwrap();
        let (month_start, _) = agent_vitals_data::authority_query::beijing_month_bounds_ms("2026-08").unwrap();
        let noon = month_start + 12 * 3_600_000;
        let snapshot = json!({
            "pricing": agent_vitals_domain::cost::load_pricing(),
            "codex_pricing": crate::sessions::codex_cost::load_codex_pricing(),
        }).to_string();
        db.pricing_snapshot_put("v-test", "test", &snapshot, month_start - 1_000).unwrap();
        seed_codex_fact(&db, "f-small", "gpt-5.6-luna", noon, 100_000, 10_000);
        seed_codex_fact(&db, "f-big", "gpt-5.6-sol", noon + 60_000, 2_000_000, 200_000);

        let report = confirmation_groups(&db, "2026-08");
        assert_eq!(report["status"], json!("ok"), "{report}");
        let groups = report["groups"].as_array().unwrap();
        assert_eq!(groups.len(), 2);
        assert_eq!(groups[0]["model_id"], json!("gpt-5.6-sol"), "largest amount first");
        assert_eq!(groups[0]["estimated_amounts"][0]["currency"], json!("USD"));
        assert!(groups[0]["estimated_amounts"][0]["amount_minor"].as_i64().unwrap()
            > groups[1]["estimated_amounts"][0]["amount_minor"].as_i64().unwrap());
        assert_eq!(groups[0]["effective_start"], json!("2026-08"));
        assert_eq!(groups[0]["effective_end"], json!("2026-08"));
        assert!(groups[0].get("estimated_cost_minor").is_none());

        let scopes = [("model", "gpt-5.6-sol")];
        db.billing_declaration_revision_save(
            "rev-api", "decl-api", None, "codex", "openai", "official_api",
            None, None, None, "2026-08", Some("2026-08"), None, None, &scopes, 2,
        ).unwrap();
        db.billing_recalculation_enqueue("job-api", "decl-api", "rev-api", 3).unwrap();
        assert!(db.billing_recalculation_run("job-api", 4).unwrap());
        assert_eq!(confirmation_groups(&db, "2026-08")["groups"].as_array().unwrap().len(), 2,
            "official_api never changes numbers");

        db.billing_declaration_revision_save(
            "rev-sub", "decl-sub", None, "codex", "openai", "official_subscription",
            None, None, None, "2026-08", Some("2026-08"), None, None, &scopes, 5,
        ).unwrap();
        db.billing_recalculation_enqueue("job-sub", "decl-sub", "rev-sub", 6).unwrap();
        assert!(db.billing_recalculation_run("job-sub", 7).unwrap());
        let after = confirmation_groups(&db, "2026-08");
        let remaining = after["groups"].as_array().unwrap();
        assert_eq!(remaining.len(), 1);
        assert_eq!(remaining[0]["model_id"], json!("gpt-5.6-luna"));

        assert!(db.billing_declaration_revision_revoke("rev-sub-revoke", "decl-sub", "rev-sub", 8).unwrap());
        assert_eq!(confirmation_groups(&db, "2026-08")["groups"].as_array().unwrap().len(), 2,
            "revoke restores the group without a recalculation job");
        let _ = std::fs::remove_dir_all(&home);
    }

    /// 规格 §5.1 三态：官方路由 + 账户订阅 → determined（一键确认）；厂商形状
    /// inferred → one_question(route)；codex 自报 openai + chatgpt 登录 → determined；
    /// workbuddy 不进列表；程序已判定的簇置顶。
    #[test]
    fn auto_verdict_states_and_clusters() {
        use agent_vitals_provider::{AccountEvidence, EvidenceBasis, PlanKind};
        let home = temp_home("verdict");
        let path = agent_vitals_data::authority::default_authority_path(&home);
        let db = AuthorityDb::open(&path, 1).unwrap();
        let (month_start, _) = agent_vitals_data::authority_query::beijing_month_bounds_ms("2026-08").unwrap();
        let noon = month_start + 12 * 3_600_000;
        db.conn().execute(
            "INSERT INTO sync_runs(run_id, started_at_ms, trigger, status, schema_version)
             VALUES ('run', 1, 'cli', 'succeeded', 14)", [],
        ).unwrap();
        let insert = |fact: &str, host: &str, provider: Option<&str>, model: &str, evidence: &str, pricing: &str, ts: i64| {
            db.conn().execute(
                "INSERT INTO usage_facts(fact_id, host, machine_namespace, native_session_id, source_event_id,
                     observation_kind, provider_id, model_id, event_ts_ms, event_peak, pricing_basis, evidence_basis,
                     billing_mode, uncached_input_tokens, cache_read_tokens, cache_write_tokens, output_tokens,
                     ingested_run_id, created_at_ms, updated_at_ms)
                 VALUES (?1, ?2, 'm', 'sess', ?1, 'token_count', ?3, ?4, ?5, 0, ?6, ?7, 'metered', 1000, 0, 0, 10, 'run', 1, 1)",
                rusqlite::params![fact, host, provider, model, ts, pricing, evidence],
            ).unwrap();
        };
        insert("f-claude-official", "claude-code", Some("anthropic"), "claude-opus-5", "session-native", "route-observed", noon);
        insert("f-claude-minimax", "claude-code", None, "MiniMax-M3", "inferred", "metered_estimate", noon + 1);
        insert("f-claude-gateway", "claude-code", None, "anthropic/claude-opus-5", "inferred", "metered_estimate", noon + 2);
        insert("f-codex-openai", "codex", Some("openai"), "gpt-5.6-sol", "missing", "metered_estimate", noon + 3);
        insert("f-codex-custom", "codex", None, "gpt-5.6-luna", "missing", "metered_estimate", noon + 4);
        insert("f-workbuddy", "workbuddy", None, "hy4-preview-f", "missing", "metered_estimate", noon + 5);
        let mut accounts = std::collections::BTreeMap::new();
        accounts.insert("claude-code".to_string(), AccountEvidence {
            host: "claude-code".into(), vendor: "anthropic".into(), plan_kind: PlanKind::Subscription,
            plan_label: Some("Claude Pro".into()), billing_channel: Some("apple_subscription".into()),
            anchor_date: Some("2025-07-20".into()), evidence_basis: EvidenceBasis::AccountTimeBound, source: "test".into(),
        });
        accounts.insert("codex".to_string(), AccountEvidence {
            host: "codex".into(), vendor: "openai".into(), plan_kind: PlanKind::Subscription,
            plan_label: Some("ChatGPT".into()), billing_channel: None, anchor_date: None,
            evidence_basis: EvidenceBasis::AccountTimeBound, source: "test".into(),
        });
        let report = confirmation_groups_with(&db, "2026-08", &accounts);
        assert_eq!(report["status"], json!("ok"), "{report}");
        let groups = report["groups"].as_array().unwrap();
        assert!(groups.iter().all(|g| g["host"] != json!("workbuddy")), "credits host must not be pending");
        let verdict_of = |model: &str| groups.iter().find(|g| g["model_id"] == json!(model)).unwrap()["auto_verdict"].clone();
        let claude = verdict_of("claude-opus-5");
        assert_eq!(claude["state"], json!("determined"));
        assert_eq!(claude["relationship_kind"], json!("official_subscription"));
        assert_eq!(claude["plan"]["label"], json!("Claude Pro"));
        assert_eq!(claude["plan"]["anchor_date"], json!("2025-07-20"));
        let minimax = verdict_of("MiniMax-M3");
        assert_eq!((minimax["state"].clone(), minimax["question"].clone(), minimax["model_vendor"].clone()),
            (json!("one_question"), json!("route"), json!("minimax")));
        assert_eq!(verdict_of("anthropic/claude-opus-5")["route_state"], json!("gateway"));
        let codex = verdict_of("gpt-5.6-sol");
        assert_eq!((codex["state"].clone(), codex["route_state"].clone()), (json!("determined"), json!("provider_reported")));
        let custom = verdict_of("gpt-5.6-luna");
        assert_eq!(custom["state"], json!("needs_input"));
        let clusters = report["clusters"].as_array().unwrap();
        assert!(clusters.len() >= 4, "{clusters:?}");
        assert_eq!(clusters[0]["auto_verdict"]["state"], json!("determined"), "determined clusters come first");
        assert!(clusters.iter().all(|c| c["host"] != json!("workbuddy")));
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
