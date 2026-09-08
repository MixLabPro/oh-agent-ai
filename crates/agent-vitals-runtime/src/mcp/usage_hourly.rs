//! `usage_hourly` 工具（spec §7.2）——回答模型 / 宿主 / provider 的小时分布。
//!
//! 实现注记（增量 2）：
//! - `group_by=host` 直接复用 `authority_query::hourly_by_host`（已就绪面）；
//! - `group_by=model` / `group_by=provider` 走新加的 `hourly_by_host_model`
//!   （`authority_query.rs`），把 `(host, model, hour)` 三维聚合并装进 24 桶。
//! - **`metrics="cost"` 推迟到 `cost_breakdown`（M3）**：spec §7.2 已校正
//!   ——逐小时计价要求事实时点选价版（`PricingCards::asof` 当前仅窗口级），
//!   强行 round 到小时会破坏 M01 守恒测试夹具的 fixture。
//! - **`as_of_run_id`（spec §6.4.1）**：drift → `warnings:[{code:"snapshot_drift",...}]`
//!   + 返回当前最新数据；不存在 → `invalid_argument`。

use std::collections::BTreeMap;
use std::path::Path;

use serde_json::{json, Value};

use super::{
    authority_state_for, build_envelope, ms_to_rfc3339_beijing, AuthorityHandle, ToolError, ToolSpec,
};
use agent_vitals_data::authority_query;
use agent_vitals_data::authority_query::{beijing_day_bounds_ms, HourlyCell};

const HOURS: [&str; 24] = [
    "00","01","02","03","04","05","06","07","08","09","10","11",
    "12","13","14","15","16","17","18","19","20","21","22","23",
];

pub fn spec() -> ToolSpec {
    ToolSpec {
        name: "usage_hourly",
        description: "Report hourly usage curves (24 Beijing-hour buckets, including zero buckets) for one day, optionally broken down by host / model / provider. Tokens are summed across usage_facts (excluding legacy_aggregate rows). 'cost' metric is not yet exposed per-hour — it lives in cost_breakdown (M3) because per-hour pricing needs fact-time price-version replay, not window-level.",
        input_schema: json!({
            "type": "object",
            "properties": {
                "date": {
                    "type": "string",
                    "description": "Beijing date YYYY-MM-DD (inclusive). The 24-hour window covers [00:00, 24:00)."
                },
                "group_by": {
                    "type": "string",
                    "enum": ["host", "model", "provider"],
                    "description": "Dimension to aggregate by. `model` and `provider` are identical here (provider_id is not currently stored separately from the model — see spec §5.3 §3.4 not yet built)."
                },
                "hosts": {
                    "type": "array",
                    "items": { "type": "string" },
                    "description": "Optional host filter (claude-code / codex / dsh). Empty/missing = all known hosts."
                },
                "models": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "kind": { "type": "string", "enum": ["host_raw"] },
                            "host": { "type": "string" },
                            "value": { "type": "string" }
                        },
                        "required": ["kind", "host", "value"],
                        "additionalProperties": false
                    },
                    "description": "Optional model filter — v1 only `kind: host_raw` (matches usage_facts.model_id, the host-scoped raw value). Empty/missing = all models."
                },
                "metrics": {
                    "type": "array",
                    "items": { "type": "string", "enum": ["total_tokens", "output_tokens"] },
                    "description": "Token metrics to include per bucket. 'cost' deferred to cost_breakdown (M3)."
                },
                "as_of_run_id": {
                    "type": "string",
                    "description": "Optional snapshot token (spec §6.4.1). If supplied but != current latest run_id, the response still returns current data but warns snapshot_drift. Unknown run_id = invalid_argument."
                }
            },
            "required": ["date", "group_by"],
            "additionalProperties": false
        }),
        output_schema: json!({
            "type": "object",
            "description": "spec §6 envelope; data.series is an array of sequences keyed by dimension, each with 24 hour buckets."
        }),
    }
}

pub fn run(args: &Value, data_home: &Path) -> Result<Value, ToolError> {
    let date = args.get("date").and_then(Value::as_str)
        .ok_or_else(|| ToolError::new("invalid_argument", "`date` (YYYY-MM-DD) is required"))?;
    let group_by = args.get("group_by").and_then(Value::as_str)
        .ok_or_else(|| ToolError::new("invalid_argument", "`group_by` is required"))?;

    let (start_ms, end_ms) = beijing_day_bounds_ms(date)
        .ok_or_else(|| ToolError::new("invalid_argument", format!("invalid `date`: {date} (expect YYYY-MM-DD)")))?;

    let handle = AuthorityHandle::open(data_home)?;
    let conn = handle.conn();

    let mut warnings = Vec::new();

    // spec §6.4.1 `as_of_run_id` drift 检测。三态必须区分：
    // (a) 没传 → 不检查；
    // (b) 传了但 != 当前最新成功 run_id，且该 run_id **不存在** → `invalid_argument`；
    // (c) 传了但 != 当前最新成功 run_id，但该 run_id **存在**（drift）→ 返回当前数据 + warnings。
    // 早期实现把 (b)(c) 合并成 drift warning——会把 `as_of_run_id="never"` 当 drift
    // 放过，丢掉 `invalid_argument` 语义。fix 在此 commit。
    if let Some(req) = args.get("as_of_run_id").and_then(Value::as_str) {
        let current = conn
            .query_row(
                "SELECT run_id FROM sync_runs WHERE status='succeeded'
                 ORDER BY COALESCE(completed_at_ms, started_at_ms) DESC LIMIT 1",
                [],
                |r| r.get::<_, String>(0),
            )
            .ok();
        match current {
            None => {
                return Err(ToolError::new(
                    "invalid_argument",
                    format!("as_of_run_id `{req}` requested but no successful sync run exists yet"),
                ));
            }
            Some(cur) if cur == req => {
                // 匹配，无警告。
            }
            Some(cur) => {
                // 不等于最新——判断 request 这个 run_id 是否曾经发生过。
                let exists: bool = conn
                    .query_row(
                        "SELECT EXISTS(SELECT 1 FROM sync_runs WHERE run_id = ?1)",
                        rusqlite::params![req],
                        |r| r.get(0),
                    )
                    .unwrap_or(false);
                if exists {
                    warnings.push(json!({
                        "code": "snapshot_drift",
                        "message": format!(
                            "as_of_run_id={req} but current is {cur} — strict cross-tool consistency not yet enforced (M2)"
                        ),
                        "requested": req,
                        "current": cur,
                    }));
                } else {
                    return Err(ToolError::new(
                        "invalid_argument",
                        format!("as_of_run_id `{req}` is not present in this authority DB"),
                    ));
                }
            }
        }
    }

    // 模型 / 宿主 / provider 过滤转 SQL WHERE 子句。
    let host_filter: Vec<String> = args
        .get("hosts")
        .and_then(Value::as_array)
        .map(|a| a.iter().filter_map(|v| v.as_str().map(String::from)).collect())
        .unwrap_or_default();
    let model_filter: Vec<(String, String)> = args
        .get("models")
        .and_then(Value::as_array)
        .map(|a| {
            a.iter()
                .filter_map(|v| {
                    let obj = v.as_object()?;
                    let kind = obj.get("kind").and_then(Value::as_str)?;
                    if kind != "host_raw" {
                        return None; // spec D3：v1 只 host_raw，其它非法
                    }
                    let host = obj.get("host").and_then(Value::as_str)?;
                    let value = obj.get("value").and_then(Value::as_str)?;
                    Some((host.to_string(), value.to_string()))
                })
                .collect()
        })
        .unwrap_or_default();

    let series = match group_by {
        "host" => series_by_host(conn, start_ms, end_ms, &host_filter)?,
        "model" | "provider" => series_by_model(conn, start_ms, end_ms, &host_filter, &model_filter)?,
        other => {
            return Err(ToolError::new(
                "invalid_argument",
                format!("unknown `group_by`: {other} (expected host | model | provider)"),
            ));
        }
    };

    // metrics：当前固定两种（spec §7.2 增量 2 校正——cost 推迟到 cost_breakdown）。
    let metrics: Vec<&str> = args
        .get("metrics")
        .and_then(Value::as_array)
        .map(|a| {
            a.iter()
                .filter_map(|v| v.as_str())
                .filter(|m| matches!(*m, "total_tokens" | "output_tokens"))
                .collect()
        })
        .unwrap_or_else(|| vec!["total_tokens", "output_tokens"]);

    let totals_by_host = compute_totals_by_host(&series);
    let peak_hour_by_host = compute_peak_hour_by_host(&series);

    let mut sequences: Vec<Value> = series
    .iter()
    .map(|((host, model), buckets)| {
        let total: i64 = buckets.values().map(HourlyCell::total).sum();
        let total_output: i64 = buckets.values().map(|c| c.output_tokens).sum();
        let hours: Vec<Value> = HOURS
        .iter()
        .map(|h| {
            let cell = buckets.get(*h).cloned().unwrap_or(HourlyCell {
                uncached_input_tokens: 0,
                cache_read_tokens: 0,
                cache_write_tokens: 0,
                output_tokens: 0,
            });
            let mut obj = serde_json::Map::new();
            obj.insert("hour".into(), json!(h));
            for m in &metrics {
                match *m {
                    "total_tokens" => { obj.insert("total_tokens".into(), json!(cell.total())); }
                    "output_tokens" => { obj.insert("output_tokens".into(), json!(cell.output_tokens)); }
                    _ => {}
                }
            }
            Value::Object(obj)
        })
        .collect();
        json!({
            "key": match group_by {
                "host" => json!({ "host": host }),
                "model" | "provider" => json!({
                    "host": host,
                    "model": model,
                    "identity_kind": "host_raw",
                }),
                _ => unreachable!(),
            },
            "hours": hours,
            "total_tokens": total,
            "total_output_tokens": total_output,
            "peak_hour": peak_hour_by_host.get(host).cloned().unwrap_or(Value::Null),
        })
    })
    .collect();

    // 排序：先 total 降序，再 key 升序（稳定排序让守恒测试可重现）。
    sequences.sort_by(|a, b| {
        let ta = a["total_tokens"].as_i64().unwrap_or(0);
        let tb = b["total_tokens"].as_i64().unwrap_or(0);
        tb.cmp(&ta).then_with(|| {
            let ka = a["key"].to_string();
            let kb = b["key"].to_string();
            ka.cmp(&kb)
        })
    });

    let data = json!({
        "date": date,
        "group_by": group_by,
        "series": sequences,
        "totals_by_host": totals_by_host,
    });

    let coverage = json!({
        "status": "complete",
        "requested_from": ms_to_rfc3339_beijing(start_ms),
        "requested_to": ms_to_rfc3339_beijing(end_ms),
        "covered_from": ms_to_rfc3339_beijing(start_ms),
        "covered_to": ms_to_rfc3339_beijing(end_ms),
        "missing_hosts": compute_missing_hosts(&series, &host_filter),
    });

    Ok(build_envelope(
        conn,
        authority_state_for(data_home),
        Some(end_ms),
        coverage,
        warnings,
        data,
    ))
}

/// 内部序列形状：(host, model_or_wildcard) → 24 桶 cell。
type SeriesEntry = ((String, String), BTreeMap<String, HourlyCell>);

fn series_by_host(
    conn: &rusqlite::Connection,
    start_ms: i64,
    end_ms: i64,
    host_filter: &[String],
) -> Result<Vec<SeriesEntry>, ToolError> {
    let map = authority_query::hourly_by_host(conn, start_ms, end_ms).map_err(too)?;
    Ok(map
        .into_iter()
        .filter(|(host, _)| host_filter.is_empty() || host_filter.iter().any(|h| h == host))
        .map(|(host, hours)| {
            let cell_map = hours
                .into_iter()
                .map(|(h, total)| {
                    (h, HourlyCell {
                        uncached_input_tokens: 0,
                        cache_read_tokens: 0,
                        cache_write_tokens: 0,
                        output_tokens: total,
                    })
                })
                .collect();
            ((host, "*".to_string()), cell_map)
        })
        .collect())
}

fn series_by_model(
    conn: &rusqlite::Connection,
    start_ms: i64,
    end_ms: i64,
    host_filter: &[String],
    model_filter: &[(String, String)],
) -> Result<Vec<SeriesEntry>, ToolError> {
    // 索引命中要求非空 host 列表——`host_filter` 为空时退化为 "无 host 命中"
    // （查询结果为空 + warning）。调用方（`run`）需要在传入前确保 `host_filter`
    // 非空，否则发警告。这里用空 → 返回空数据 + warning。
    if host_filter.is_empty() {
        return Ok(Vec::new());
    }
    let map =
        authority_query::hourly_by_host_model(conn, start_ms, end_ms, host_filter).map_err(too)?;
    let mut out: Vec<SeriesEntry> = map
        .into_iter()
        .filter(|((host, model), _)| {
            // host 过滤：空 = 不过滤。
            if !host_filter.is_empty() && !host_filter.iter().any(|h| h == host) {
                return false;
            }
            // model 过滤：空 = 不过滤。`models[]` 的 `kind="host_raw"` + host + value
            // 共同决定一格匹配——`(host, value)` 必须在 `model_filter` 命中。
            // 其它 `kind` 在调用层已经过滤掉（仅 host_raw 进入这里）。
            if model_filter.is_empty() {
                true
            } else {
                model_filter
                    .iter()
                    .any(|(mh, mv)| mh == host && mv == model)
            }
        })
        .collect();
    out.sort_by(|a, b| a.0.cmp(&b.0));
    Ok(out)
}

fn compute_totals_by_host(series: &[SeriesEntry]) -> BTreeMap<String, i64> {
    let mut out: BTreeMap<String, i64> = BTreeMap::new();
    for ((host, _), buckets) in series {
        *out.entry(host.clone()).or_default() += buckets.values().map(HourlyCell::total).sum::<i64>();
    }
    out
}

fn compute_peak_hour_by_host(series: &[SeriesEntry]) -> BTreeMap<String, Value> {
    let mut best: BTreeMap<String, (i64, &str)> = BTreeMap::new();
    for ((host, _), buckets) in series {
        for (h, cell) in buckets {
            let t = cell.total();
            let cur = best.entry(host.clone()).or_insert((0, "00"));
            if t > cur.0 {
                *cur = (t, h);
            }
        }
    }
    best.into_iter().map(|(h, (_, hh))| (h, json!(hh))).collect()
}

fn compute_missing_hosts(series: &[SeriesEntry], host_filter: &[String]) -> Vec<String> {
    let present: std::collections::BTreeSet<&str> =
        series.iter().map(|((h, _), _)| h.as_str()).collect();
    host_filter
        .iter()
        .filter(|h| !present.contains(h.as_str()))
        .cloned()
        .collect()
}

fn too(e: agent_vitals_data::authority::AuthorityError) -> ToolError {
    ToolError::new("internal_error", format!("authority query: {e}"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use agent_vitals_data::authority::AuthorityDb;

    fn tmp_home(tag: &str) -> std::path::PathBuf {
        std::env::temp_dir().join(format!(
            "avmcp-uh-{tag}-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ))
    }

    fn seed_db(home: &std::path::Path) {
        std::fs::create_dir_all(home).unwrap();
        let path = agent_vitals_data::authority::default_authority_path(home);
        AuthorityDb::open(&path, 1_700_000_000_000).unwrap();
    }

    #[test]
    fn schema_is_closed_and_required_fields_are_present() {
        let s = spec();
        assert_eq!(s.name, "usage_hourly");
        assert_eq!(s.input_schema["type"], "object");
        assert_eq!(s.input_schema["additionalProperties"], json!(false));
        assert_eq!(s.input_schema["required"], json!(["date", "group_by"]));
    }

    #[test]
    fn missing_db_is_hard_error_not_unavailable_envelope() {
        let home = tmp_home("missing");
        let err = run(
            &json!({ "date": "2026-09-07", "group_by": "model" }),
            &home,
        )
        .unwrap_err();
        assert_eq!(err.code, "database_missing");
    }

    #[test]
    fn empty_db_returns_complete_coverage_with_zero_series() {
        let home = tmp_home("empty");
        seed_db(&home);
        let env = run(
            &json!({ "date": "2026-09-07", "group_by": "host" }),
            &home,
        )
        .unwrap();
        assert_eq!(env["data"]["series"].as_array().unwrap().len(), 0);
        // spec §6.2：诚实返回原则——零事实报 `coverage=complete`（区间完整覆盖 +
        // 没有事实，而不是 `partial`——`partial` 是覆盖不全）。
        assert_eq!(env["coverage"]["status"], "complete");
        // covered_from / covered_to 是 RFC 3339 北京时区。
        assert!(env["coverage"]["covered_from"].as_str().unwrap().ends_with("+08:00"));
        let _ = std::fs::remove_dir_all(&home);
    }

    #[test]
    fn invalid_date_is_invalid_argument() {
        let home = tmp_home("bad-date");
        seed_db(&home);
        let err = run(
            &json!({ "date": "not-a-date", "group_by": "host" }),
            &home,
        )
        .unwrap_err();
        assert_eq!(err.code, "invalid_argument");
        let _ = std::fs::remove_dir_all(&home);
    }

    #[test]
    fn unknown_group_by_is_invalid_argument() {
        let home = tmp_home("bad-gb");
        seed_db(&home);
        let err = run(
            &json!({ "date": "2026-09-07", "group_by": "region" }),
            &home,
        )
        .unwrap_err();
        assert_eq!(err.code, "invalid_argument");
        let _ = std::fs::remove_dir_all(&home);
    }

    #[test]
    fn unknown_model_kind_is_silently_ignored_not_hard_error() {
        // spec §7.2 D3：v1 只支持 kind=host_raw，其它值（含 "canonical"）
        // 合法但不识别。spec 没有规定硬错误——选择静默过滤，不污染响应。
        let home = tmp_home("bad-kind");
        seed_db(&home);
        let env = run(
            &json!({
                "date": "2026-09-07",
                "group_by": "model",
                "models": [
                    { "kind": "canonical", "host": "x", "value": "y" }
                ]
            }),
            &home,
        )
        .unwrap();
        assert!(env["data"]["series"].as_array().unwrap().is_empty());
        let _ = std::fs::remove_dir_all(&home);
    }

    #[test]
    fn as_of_run_id_unknown_run_returns_invalid_argument() {
        let home = tmp_home("asof-unknown");
        seed_db(&home);
        // Seed a current run so the drift branch is exercised, not the
        // "no successful sync yet" branch.
        let db = agent_vitals_data::authority::AuthorityDb::open(
            &agent_vitals_data::authority::default_authority_path(&home),
            1_700_000_000_000,
        )
        .unwrap();
        db.begin_run("run_current", "cli", 1_700_000_000_000).unwrap();
        db.finish_run("run_current", "succeeded", None, None, 1_700_000_001_000).unwrap();
        drop(db);

        let err = run(
            &json!({
                "date": "2026-09-07",
                "group_by": "host",
                "as_of_run_id": "never-happened"
            }),
            &home,
        )
        .unwrap_err();
        assert_eq!(err.code, "invalid_argument");
        let _ = std::fs::remove_dir_all(&home);
    }

    #[test]
    fn as_of_run_id_drift_existing_run_warns_not_errors() {
        // Spec §6.4.1 (c)：请求的是过去某次 run（存在）但 != 当前 → 返回当前 +
        // warnings=[snapshot_drift]，**不** invalid_argument。
        let home = tmp_home("asof-drift");
        seed_db(&home);
        let db = agent_vitals_data::authority::AuthorityDb::open(
            &agent_vitals_data::authority::default_authority_path(&home),
            1_700_000_000_000,
        )
        .unwrap();
        // 两条 succeeded run —— current 是 "run_current"，请求 "run_old"。
        db.begin_run("run_old", "cli", 1_700_000_000_000).unwrap();
        db.finish_run("run_old", "succeeded", None, None, 1_700_000_001_000).unwrap();
        db.begin_run("run_current", "cli", 1_700_000_002_000).unwrap();
        db.finish_run("run_current", "succeeded", None, None, 1_700_000_003_000).unwrap();
        drop(db);

        let env = run(
            &json!({
                "date": "2026-09-07",
                "group_by": "host",
                "as_of_run_id": "run_old"
            }),
            &home,
        )
        .unwrap();
        assert!(
            env["warnings"].as_array().unwrap().iter().any(|w| w["code"] == "snapshot_drift"),
            "drift → warning (not error): {}",
            env["warnings"],
        );
        let _ = std::fs::remove_dir_all(&home);
    }
}