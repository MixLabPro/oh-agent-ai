//! WorkBuddy traces → `UsageFact`（spec §9E.5 E4a/E4b）。两个入口：
//! - `workbuddy_traces_to_usage_facts(root)`——全量（CLI `workbuddy-usage-facts`
//!   的只读诊断面，Python 逐字节镜像）；
//! - `workbuddy_trace_file_to_usage_facts(path)`——单文件（E4b `sync_service` 的
//!   例行 ingest 面：一个 trace 文件 = 一个 source_id，dirty 才喂）。
//!
//! 两者共用 `emit_trace`：全量 = 按路径序对每个文件调单文件入口再拼接（测试钉
//! 这条等式，两侧都钉）。
//!
//! **源**：generation span 解码后的 `usage`（OpenAI 兼容格式）+ 逐调用 `model`——
//! E1 的读取层已经把二次编码解开、只留 `usages`/`model`。**每个 generation span 恰好
//! 一条 usage**（真机 5,067/5,067），所以 `source_event_id = spanId` 是原生身份
//! （`identity_basis: native`），不需要 Codex 那种字节偏移派生 id。
//!
//! **桶映射**（与 Codex 同形，`codex/sources/usage_fact.rs` 决策 A）：
//! `uncached = prompt − cached`、`cache_read = cached`、`cache_write = 0`（OpenAI 格式
//! 无此桶——`source_usage_semantics` 仍是 `delta`，每 span 一次独立调用）、
//! `output = completion`（OpenAI 的 completion **已含** reasoning，绝不叠加）。
//!
//! **归属**：`resolve_billing_attribution(None, None)`——WorkBuddy 的轨道（平台积分 /
//! 自配 key / 限免）是请求级且本机不可判（spec §2.1），所以 provider/route 一律不填：
//! `provider_id: null`、`pricing_basis: metered_estimate`、`evidence_basis: missing`，
//! `data-unresolved` 归入 billing-route-unknown。**不解析 `model` 前缀**（`custom-local:`
//! 不代表轨道，§2.1），**不把 models.json 当 RouteEvidence**（即便传入也是 ConfigCurrent
//! → 仍 unresolved，resolver 已内置这份保守）。
//!
//! **未归属 trace（无 `trace.sessionId`）按 Codex 先例计 `attempts.unattributed`，不发
//! 事实**——`native_session_id` 是身份必填字段，编一个就是编 session。
//!
//! Python 镜像 `agent/workbuddy_usage_fact.py`，逐字节对齐（`tests/test_workbuddy_usage_fact.py`）。

use std::collections::HashMap;
use std::path::Path;

use agent_vitals_domain::usage_fact::build_usage_fact;
use agent_vitals_provider::resolve_billing_attribution;
use serde_json::{json, Map, Value};

use super::traces::{
    read_workbuddy_trace_file, read_workbuddy_traces, SpanSummary, TraceSummary,
};

const HOST: &str = "workbuddy";
const OBSERVATION_KIND: &str = "assistant-usage";
/// attempts 词表——与 Codex 同键（`to_payload_value` 固定输出前三个）。
pub const SKIP: &str = "skip";
pub const UNREADABLE: &str = "unreadable";
pub const UNATTRIBUTED: &str = "unattributed";

/// 镜像 Python `workbuddy_usage_fact.UsageFactEmitResult`。`malformed` = degraded
/// 的 trace **文件**数（不是 JSON / 无 `trace` 对象）。
#[derive(Debug)]
pub struct UsageFactEmitResult {
    pub facts: Vec<Value>,
    pub attempts: HashMap<String, i64>,
    /// 全部 generation span 数（归属 + 未归属）。恒等式：`total = fact + skip +
    /// unreadable + unattributed + bad_id`——每个 span 恰落一个桶（decode_failed 先判，
    /// 再判无 usage，再判无 sessionId）。function span 的解码失败不在此计（不是用量事件）。
    pub total_generation_spans: i64,
    pub skip_rows: i64,
    pub malformed: i64,
}

fn span_to_usage_fact(
    span: &SpanSummary,
    native_session_id: &str,
    machine_namespace: &str,
    source_profile: &str,
) -> Option<Value> {
    let u = span.usages.first()?;
    let attribution = resolve_billing_attribution(None, None);
    let uncached = (u.prompt_tokens - u.cached_tokens).max(0);
    let mut fields = Map::new();
    fields.insert("machine_namespace".into(), json!(machine_namespace));
    fields.insert("host".into(), json!(HOST));
    fields.insert("source_profile".into(), json!(source_profile));
    fields.insert("native_session_id".into(), json!(native_session_id));
    fields.insert("source_event_id".into(), json!(span.span_id));
    fields.insert("observation_kind".into(), json!(OBSERVATION_KIND));
    // spanId 是宿主原生 id——不像 Codex 的 token_count 要靠字节偏移派生。
    fields.insert("identity_basis".into(), json!("native"));
    // span.startedAt 原样 ISO 毫秒串；缺失 → None（诚实无观测时间）。
    fields.insert("event_ts_utc".into(), json!(span.started_at));
    fields.insert(
        "time_basis".into(),
        if span.started_at.is_some() { json!("native") } else { Value::Null },
    );
    fields.insert("source_usage_semantics".into(), json!("delta"));
    fields.insert("model_raw".into(), json!(u.model));
    fields.insert("provider_raw".into(), json!(attribution.provider_raw));
    fields.insert("endpoint_host".into(), Value::Null);
    fields.insert("provider_id".into(), json!(attribution.provider_id));
    fields.insert("route_evidence_id".into(), Value::Null);
    fields.insert("billing_source".into(), json!(attribution.provider_id));
    fields.insert("billing_mode".into(), json!(attribution.billing_mode.as_str()));
    fields.insert("pricing_basis".into(), json!(attribution.pricing_basis));
    fields.insert("evidence_basis".into(), json!(attribution.evidence_basis.as_str()));
    fields.insert("normalization_version".into(), json!("provider-v0.11"));
    fields.insert("attribution_version".into(), json!("provider-v0.11"));
    fields.insert("uncached_input_tokens".into(), json!(uncached));
    fields.insert("cache_read_tokens".into(), json!(u.cached_tokens));
    fields.insert("cache_write_tokens".into(), json!(0));
    fields.insert("output_tokens".into(), json!(u.completion_tokens));
    build_usage_fact(&fields).ok()
}

fn bump(attempts: &mut HashMap<String, i64>, key: &str) {
    *attempts.entry(key.to_string()).or_insert(0) += 1;
}

/// 一个 trace 的全部 generation span → facts / attempts。`session_id = None` 的 trace
/// 全部计 unattributed。
fn emit_trace(
    tr: &TraceSummary,
    machine_namespace: &str,
    source_profile: &str,
    out: &mut UsageFactEmitResult,
) {
    for span in &tr.spans {
        if span.kind != "generation" {
            continue;
        }
        out.total_generation_spans += 1;
        if span.decode_failed {
            // toolOutput 解不开（真机 4 例全是空串）→ unreadable，不是 skip。
            bump(&mut out.attempts, UNREADABLE);
            continue;
        }
        if span.usages.is_empty() {
            // 取消/进行中（toolOutput null）或解码后无 usage → 跳过，不是失败。
            bump(&mut out.attempts, SKIP);
            out.skip_rows += 1;
            continue;
        }
        let Some(sid) = tr.session_id.as_deref() else {
            bump(&mut out.attempts, UNATTRIBUTED);
            continue;
        };
        match span_to_usage_fact(span, sid, machine_namespace, source_profile) {
            Some(f) => out.facts.push(f),
            None => bump(&mut out.attempts, "bad_id"),
        }
    }
}

/// `<workbuddy_root>/traces/**` → `UsageFactEmitResult`。facts 按 trace 文件路径序、
/// span 原序。不写盘。root 不存在 / traces 目录不存在 → Err（CLI exit 2，与其他
/// 宿主的 usage-facts 同款：源不可读不冒充 0 事实）。
pub fn workbuddy_traces_to_usage_facts(
    root: &Path,
    machine_namespace: &str,
    source_profile: &str,
) -> Result<UsageFactEmitResult, String> {
    if !root.is_dir() {
        return Err(format!("{}: not a directory", root.display()));
    }
    if !super::traces::workbuddy_traces_root(root).is_dir() {
        return Err(format!("{}: no traces/ directory", root.display()));
    }
    let read = read_workbuddy_traces(root);
    let mut out = UsageFactEmitResult {
        facts: Vec::new(),
        attempts: HashMap::new(),
        total_generation_spans: 0,
        skip_rows: 0,
        malformed: read.degraded.len() as i64,
    };
    // 与读取层同一顺序：先归属（按 session 键序、trace 路径序），后未归属。为了
    // 与 Python 的「按文件路径序」逐字节一致，这里重新按路径合并排序。
    let mut all: Vec<&TraceSummary> = read
        .by_session
        .values()
        .flatten()
        .chain(read.unattributed.iter())
        .collect();
    all.sort_by(|a, b| a.path.to_string_lossy().cmp(&b.path.to_string_lossy()));
    for tr in all {
        emit_trace(tr, machine_namespace, source_profile, &mut out);
    }
    Ok(out)
}

/// 单个 trace 文件 → `UsageFactEmitResult`（E4b 同步管线的 emit 面）。文件读不了 /
/// 不是 trace 形状 → Err（与 claude/dsh 的逐文件 emitter 同款：sync 把它记进该文件
/// 的 errors、不写指纹、下次重试）。`malformed` 恒 0——单文件路径上「坏文件」就是
/// Err，不是计数。
pub fn workbuddy_trace_file_to_usage_facts(
    path: &Path,
    machine_namespace: &str,
    source_profile: &str,
) -> Result<UsageFactEmitResult, String> {
    let tr = read_workbuddy_trace_file(path).map_err(|e| format!("{}: {e}", path.display()))?;
    let mut out = UsageFactEmitResult {
        facts: Vec::new(),
        attempts: HashMap::new(),
        total_generation_spans: 0,
        skip_rows: 0,
        malformed: 0,
    };
    emit_trace(&tr, machine_namespace, source_profile, &mut out);
    Ok(out)
}

/// `--json` 载荷，键序 = Python handler 的 dict 序。
pub fn to_payload_value(
    result: &UsageFactEmitResult,
    machine_namespace: &str,
    source_profile: &str,
) -> Value {
    let mut out = Map::new();
    out.insert("machine_namespace".into(), json!(machine_namespace));
    out.insert("source_profile".into(), json!(source_profile));
    out.insert("facts".into(), json!(result.facts));
    let mut attempts_obj = Map::new();
    for k in [SKIP, UNREADABLE, UNATTRIBUTED] {
        attempts_obj.insert(k.into(), json!(result.attempts.get(k).copied().unwrap_or(0)));
    }
    if result.attempts.get("bad_id").is_some_and(|v| *v > 0) {
        attempts_obj.insert("bad_id".into(), json!(result.attempts["bad_id"]));
    }
    out.insert("attempts".into(), Value::Object(attempts_obj));
    let mut cov = Map::new();
    cov.insert("total_generation_spans".into(), json!(result.total_generation_spans));
    cov.insert("fact_rows".into(), json!(result.facts.len()));
    cov.insert("skip_rows".into(), json!(result.skip_rows));
    out.insert("coverage".into(), Value::Object(cov));
    out.insert("malformed".into(), json!(result.malformed));
    Value::Object(out)
}

/// 人读摘要，逐行镜像 Python handler 的 print。
pub fn to_human_summary(
    result: &UsageFactEmitResult,
    root: &Path,
    machine_namespace: &str,
    source_profile: &str,
) -> String {
    let mut parts: Vec<String> = Vec::new();
    for k in [SKIP, UNREADABLE, UNATTRIBUTED] {
        parts.push(format!("'{}': {}", k, result.attempts.get(k).copied().unwrap_or(0)));
    }
    if result.attempts.get("bad_id").is_some_and(|v| *v > 0) {
        parts.push(format!("'bad_id': {}", result.attempts["bad_id"]));
    }
    format!(
        "Source: {}\nMachine namespace: {}\nSource profile: {}\nFacts: {} \
         (total_generation_spans={}, skip={})\nAttempts: {{{}}}\n",
        root.display(),
        machine_namespace,
        source_profile,
        result.facts.len(),
        result.total_generation_spans,
        result.skip_rows,
        parts.join(", "),
    )
}

