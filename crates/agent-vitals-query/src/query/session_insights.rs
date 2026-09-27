//! 会话消耗诊断的查询面（SESSION_TRACE_DIAGNOSTICS_SPEC r6 §5、§6、§8.5、§10）。
//!
//! 两个入口，**出口等级不同**，不得互相借数据：
//!
//! - [`session_insights`]：`session_trace(output = "insights")` 的数据体——回合轴、
//!   三类诊断、安全提醒计数、泳道可用性、名义成本。经 MCP 供出，所以只含
//!   计数、token、模型 id、工具名、规则码（§10 允许清单）；错误/参数摘录、
//!   指纹原值、findings 的 evidence 文本一律不进。
//! - [`session_trace_evidence`]：**本地呈现层专属**（桌面检查器的「错误摘要」
//!   「逐次调用」「命令摘要」）。含摘录，不注册为 MCP 工具——与
//!   `trace_service::session_anchor_report` 同一信任域（CLAUDE.md「出口收口」）。
//!
//! 计算全部在 `agent_vitals_domain::session_insights`；本模块只做 SQL 投影与计价。
//! 只读权威库，不读宿主源文件——源日志轮换后诊断照样可用。

use std::collections::BTreeMap;

use agent_vitals_data::authority_query::billing_bucket_usage_json;
use agent_vitals_domain::session_insights::{
    build_insights, call_steps, InsightCall, InsightEvent, InsightSafety, InsightsConfig,
};
use rusqlite::{params, Connection, OptionalExtension};
use serde_json::{json, Value};

/// 进「安全提醒」块的规则：危险命令与敏感路径写入（shell / sensitive-fs 两类）。
/// 审批类（SV609/610/614）与轨迹类（SV611/613）不在其中——前者是权限配置
/// 状态、后者与「重复失败」诊断同源，放进安全块只会淹没真正的危险操作。
pub const SAFETY_RULES: [&str; 5] = ["SV601", "SV602", "SV603", "SV604", "SV605"];

struct CallRow {
    call: InsightCall,
    provider_id: Option<String>,
    peak: bool,
    pricing_version: Option<String>,
}

fn load_calls(conn: &Connection, session_key: &str) -> rusqlite::Result<Vec<CallRow>> {
    // 走 `usage_facts_session_time`（部分索引，谓词必须带 deleted_at_ms IS NULL）。
    let mut stmt = conn.prepare(
        "SELECT f.event_ts_ms, f.model_id, f.cache_read_tokens, f.cache_write_tokens,
                f.uncached_input_tokens, f.output_tokens, f.provider_id, f.event_peak,
                (SELECT pricing_version FROM pricing_snapshots
                 WHERE captured_at_ms <= f.event_ts_ms
                 ORDER BY captured_at_ms DESC, pricing_version DESC LIMIT 1)
         FROM usage_facts f
         WHERE f.session_key = ?1 AND f.deleted_at_ms IS NULL
           AND f.event_ts_ms IS NOT NULL AND f.observation_kind != 'legacy_aggregate'
         ORDER BY f.event_ts_ms, f.fact_id",
    )?;
    let rows = stmt.query_map(params![session_key], |r| {
        Ok(CallRow {
            call: InsightCall {
                ts_ms: r.get(0)?,
                model_id: r.get(1)?,
                cache_read: r.get(2)?,
                cache_write: r.get(3)?,
                uncached_input: r.get(4)?,
                output: r.get(5)?,
            },
            provider_id: r.get(6)?,
            peak: r.get::<_, i64>(7)? != 0,
            pricing_version: r.get(8)?,
        })
    })?;
    rows.collect()
}

struct EventRows {
    events: Vec<InsightEvent>,
    tool_finished: usize,
    tool_known: usize,
}

fn load_events(conn: &Connection, session_key: &str) -> rusqlite::Result<EventRows> {
    let mut stmt = conn.prepare(
        "SELECT event_ts_ms, event_type, capability_id, outcome, invocation_fingerprint,
                error_excerpt IS NOT NULL
         FROM workflow_events
         WHERE session_key = ?1
           AND event_type IN ('task_started', 'task_finished', 'tool_finished', 'model_switched')
         ORDER BY event_ts_ms, event_id",
    )?;
    let mut out = EventRows { events: Vec::new(), tool_finished: 0, tool_known: 0 };
    let mut rows = stmt.query(params![session_key])?;
    while let Some(r) = rows.next()? {
        let ts_ms: i64 = r.get(0)?;
        let event_type: String = r.get(1)?;
        let outcome: String = r.get(3)?;
        let event = match event_type.as_str() {
            "task_started" => InsightEvent::TaskStarted { ts_ms },
            "task_finished" => InsightEvent::TaskFinished { ts_ms, outcome },
            "model_switched" => InsightEvent::ModelSwitched { ts_ms },
            _ => {
                out.tool_finished += 1;
                if outcome != "unknown" {
                    out.tool_known += 1;
                }
                InsightEvent::ToolFinished {
                    ts_ms,
                    capability_id: r.get(2)?,
                    outcome,
                    invocation_fingerprint: r.get(4)?,
                    has_error_excerpt: r.get(5)?,
                }
            }
        };
        out.events.push(event);
    }
    Ok(out)
}

/// `issue_instances.session_key` 存的是**原生会话 id**（findings_eval 按
/// `session.native_id` 写入），不是 ledger key——按 ledger key 查会恒为 0 条
/// （真机 6079 条全是原生 id）。这里按 (宿主, 原生 id) 查，并兼容将来改写成
/// ledger key 的行。
fn safety_filter(conn: &Connection, session_key: &str) -> rusqlite::Result<(String, String, String)> {
    let (host, native): (String, String) = conn
        .query_row(
            "SELECT host, native_session_id FROM sessions WHERE session_key = ?1",
            params![session_key],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .optional()?
        .unwrap_or_default();
    let placeholders = SAFETY_RULES.iter().map(|r| format!("'{r}'")).collect::<Vec<_>>().join(",");
    Ok((host, native, placeholders))
}

fn load_safety(conn: &Connection, session_key: &str) -> rusqlite::Result<Vec<InsightSafety>> {
    let (host, native, placeholders) = safety_filter(conn, session_key)?;
    let mut stmt = conn.prepare(&format!(
        "SELECT issue_type, severity, json_extract(metadata_json, '$.time')
         FROM issue_instances
         WHERE host = ?1 AND session_key IN (?2, ?3) AND issue_type IN ({placeholders})
         ORDER BY issue_type, opened_at_ms"
    ))?;
    let rows = stmt.query_map(params![host, native, session_key], |r| {
        Ok(InsightSafety { rule: r.get(0)?, severity: r.get(1)?, ts_ms: r.get::<_, Option<i64>>(2)? })
    })?;
    rows.collect()
}

/// 泳道可用性（spec §6.3）：能不能画只看数据；画不了的原因来自宿主能力。
fn lane(total: usize, known: usize, empty_reason: &str) -> Value {
    if total == 0 {
        return json!({ "state": "unavailable", "reason": empty_reason });
    }
    let coverage = known as f64 / total as f64;
    if coverage >= 0.95 {
        json!({ "state": "available", "coverage": round4(coverage) })
    } else if known > 0 {
        json!({ "state": "partial", "coverage": round4(coverage) })
    } else {
        // 事件在，但结果一个都没记（如 Codex Legacy 线格式的工具输出不带成败）。
        json!({ "state": "unavailable", "reason": "not_recorded_by_host" })
    }
}

/// 会话里一个工具结果都没有时的原因。插件宿主（`plugin:*`，走 DSL 适配）目前
/// 不产 workflow 事件；原生宿主没有就是这次会话恰好没用工具。
fn tools_empty_reason(host: &str) -> &'static str {
    if host.starts_with("plugin:") { "not_ingested" } else { "no_data_in_session" }
}

/// 名义成本（spec §4、§8.5）：每组（回合 × 宿主 × 模型 × provider × 峰谷 × 价格快照）
/// 按官方价卡估算，**不扣订阅**（名义 = 官方标价折算，与 `metered_*` 不相加），
/// 含输出。计价函数与会话成本分桶同一个（`metered_estimate_minor` +
/// `billing_bucket_usage_json`）。无价卡的调用不计 0：`coverage` 标 partial。
/// 计价分组键：(回合下标, 模型, provider, 峰时, 价格快照版本)。
type PriceGroupKey = (usize, String, Option<String>, bool, Option<String>);

struct NominalAccumulator {
    groups: BTreeMap<PriceGroupKey, [i64; 4]>,
}

/// 币种 → 最小货币单位金额。
type Money = BTreeMap<String, i64>;

/// 计价结果：每回合（金额, 是否部分未计价）、会话合计、会话是否部分未计价。
struct Priced {
    per_step: BTreeMap<usize, (Money, bool)>,
    session: Money,
    session_partial: bool,
}

fn price_groups(
    conn: &Connection,
    host: &str,
    acc: &NominalAccumulator,
) -> rusqlite::Result<Priced> {
    let mut snapshots: BTreeMap<String, Option<Value>> = BTreeMap::new();
    let mut per_step: BTreeMap<usize, (Money, bool)> = BTreeMap::new();
    for ((step, model, provider, peak, version), tokens) in &acc.groups {
        let snapshot = match version {
            Some(version) => {
                if !snapshots.contains_key(version) {
                    let payload: Option<String> = conn
                        .query_row(
                            "SELECT payload_json FROM pricing_snapshots WHERE pricing_version = ?1",
                            params![version],
                            |r| r.get(0),
                        )
                        .optional()?;
                    snapshots.insert(version.clone(), payload.and_then(|p| serde_json::from_str(&p).ok()));
                }
                snapshots[version].as_ref()
            }
            None => None,
        };
        let usage = billing_bucket_usage_json(host, model, provider.as_deref(), *peak, *tokens);
        let money = snapshot.and_then(|s| agent_vitals_domain::cost::metered_estimate_minor(host, &usage, s));
        let entry = per_step.entry(*step).or_insert_with(|| (Money::new(), false));
        match money {
            Some(m) => *entry.0.entry(m.currency).or_default() += m.amount_minor,
            None if tokens.iter().any(|t| *t > 0) => entry.1 = true,
            None => {}
        }
    }
    let mut session = Money::new();
    let mut session_partial = false;
    for (money, partial) in per_step.values() {
        for (currency, amount) in money {
            *session.entry(currency.clone()).or_default() += amount;
        }
        session_partial |= *partial;
    }
    Ok(Priced { per_step, session, session_partial })
}

fn money_json(money: &Money, partial: bool) -> Option<Value> {
    (!money.is_empty()).then(|| {
        json!({
            "amounts": money.iter().map(|(currency, amount)| json!({ "amount_minor": amount, "currency": currency })).collect::<Vec<_>>(),
            "coverage": if partial { "partial" } else { "full" },
            "basis": "nominal",
        })
    })
}

/// `session_trace(output = "insights")` 的 data。`host` 取自 `sessions.host`。
pub fn session_insights(conn: &Connection, session_key: &str, host: &str) -> rusqlite::Result<Value> {
    let calls = load_calls(conn, session_key)?;
    let events = load_events(conn, session_key)?;
    let safety = load_safety(conn, session_key)?;
    let plain: Vec<InsightCall> = calls.iter().map(|c| c.call.clone()).collect();
    let mut data = build_insights(&plain, &events.events, &safety, &InsightsConfig::default());

    // 名义成本：按回合分组计价，挂到回合与会话上（诊断不带金额，r6）。
    let steps = call_steps(&plain, &events.events);
    let mut acc = NominalAccumulator { groups: BTreeMap::new() };
    for (row, step) in calls.iter().zip(steps.iter()) {
        let Some(step) = step else { continue };
        let key = (
            *step,
            row.call.model_id.clone().unwrap_or_else(|| "<unknown>".to_string()),
            row.provider_id.clone(),
            row.peak,
            row.pricing_version.clone(),
        );
        let tokens = acc.groups.entry(key).or_insert([0; 4]);
        tokens[0] += row.call.uncached_input;
        tokens[1] += row.call.cache_read;
        tokens[2] += row.call.cache_write;
        tokens[3] += row.call.output;
    }
    let Priced { per_step, session: session_money, session_partial } = price_groups(conn, host, &acc)?;
    if let Some(steps_json) = data["axis"]["steps"].as_array_mut() {
        for (i, step) in steps_json.iter_mut().enumerate() {
            if let Some((money, partial)) = per_step.get(&i) {
                if let Some(v) = money_json(money, *partial) {
                    step["nominal_cost"] = v;
                }
            }
        }
    }
    if let Some(v) = money_json(&session_money, session_partial) {
        data["session"]["nominal_cost"] = v;
    }

    data["lanes"] = json!({
        "consumption": lane(calls.len(), calls.len(), "no_data_in_session"),
        "tools": lane(events.tool_finished, events.tool_known, tools_empty_reason(host)),
    });
    data["host"] = json!(host);
    Ok(data)
}

/// **本地呈现层专属**（不进 MCP、不进导出）：检查器需要的原始证据——
/// 区间内每次失败的错误/参数摘录、逐次调用、安全提醒的命令摘要。
/// `from`/`to` 为 1 基回合号（含两端），与 `insights.axis.steps[].index` 同一坐标。
pub fn session_trace_evidence(conn: &Connection, session_key: &str, from: usize, to: usize) -> rusqlite::Result<Value> {
    let calls = load_calls(conn, session_key)?;
    let events = load_events(conn, session_key)?;
    let plain: Vec<InsightCall> = calls.iter().map(|c| c.call.clone()).collect();
    let steps = call_steps(&plain, &events.events);
    let in_range = |step: Option<usize>| step.is_some_and(|s| s + 1 >= from && s < to);

    let mut calls_out = Vec::new();
    for (row, step) in calls.iter().zip(steps.iter()) {
        if !in_range(*step) {
            continue;
        }
        let c = &row.call;
        calls_out.push(json!({
            "step": step.map(|s| s + 1),
            "ts_ms": c.ts_ms,
            "model_id": c.model_id,
            "input": { "cache_read": c.cache_read, "cache_write": c.cache_write, "uncached_input": c.uncached_input },
            "output": c.output,
        }));
    }

    // 回合落点与 insights 同一规则：按 task_started 边界。
    let mut starts: Vec<i64> = events.events.iter().filter_map(|e| match e {
        InsightEvent::TaskStarted { ts_ms } => Some(*ts_ms),
        _ => None,
    }).collect();
    starts.sort_unstable();
    starts.dedup();
    let step_of = |ts: i64| -> Option<usize> {
        if starts.len() <= 1 {
            // 按调用计的轴（与 domain 同一退化规则）：落到不晚于它的最后一次调用。
            let pos = plain.partition_point(|c| c.ts_ms <= ts);
            (pos > 0).then(|| pos - 1)
        } else {
            let pos = starts.partition_point(|b| *b <= ts);
            (pos > 0).then(|| pos - 1)
        }
    };

    let mut stmt = conn.prepare(
        "SELECT event_ts_ms, capability_id, outcome, invocation_fingerprint, error_excerpt, args_excerpt
         FROM workflow_events
         WHERE session_key = ?1 AND event_type = 'tool_finished' AND outcome = 'failed'
         ORDER BY event_ts_ms, event_id",
    )?;
    let mut failures = Vec::new();
    let mut rows = stmt.query(params![session_key])?;
    while let Some(r) = rows.next()? {
        let ts: i64 = r.get(0)?;
        let step = step_of(ts);
        if !in_range(step) {
            continue;
        }
        failures.push(json!({
            "step": step.map(|s| s + 1),
            "ts_ms": ts,
            "capability_id": r.get::<_, Option<String>>(1)?,
            // 分组键只在本地面出现，供检查器把「同一调用」的几次失败归到一起。
            "invocation_key": r.get::<_, Option<String>>(3)?,
            "error_excerpt": r.get::<_, Option<String>>(4)?,
            "args_excerpt": r.get::<_, Option<String>>(5)?,
        }));
    }

    let (host, native, placeholders) = safety_filter(conn, session_key)?;
    let mut stmt = conn.prepare(&format!(
        "SELECT issue_type, severity, json_extract(metadata_json, '$.time'),
                json_extract(metadata_json, '$.evidence'), json_extract(metadata_json, '$.tool_name')
         FROM issue_instances
         WHERE host = ?1 AND session_key IN (?2, ?3) AND issue_type IN ({placeholders})
         ORDER BY opened_at_ms"
    ))?;
    let mut safety = Vec::new();
    let mut rows = stmt.query(params![host, native, session_key])?;
    while let Some(r) = rows.next()? {
        let ts: Option<i64> = r.get(2)?;
        safety.push(json!({
            "rule": r.get::<_, String>(0)?,
            "severity": r.get::<_, String>(1)?,
            "step": ts.and_then(step_of).map(|s| s + 1),
            "tool": r.get::<_, Option<String>>(4)?,
            "summary": r.get::<_, Option<String>>(3)?,
        }));
    }

    Ok(json!({
        "steps": { "from": from, "to": to },
        "calls": calls_out,
        "failures": failures,
        "safety": safety,
        "local_only": true,
    }))
}

fn round4(v: f64) -> f64 {
    (v * 10_000.0).round() / 10_000.0
}
