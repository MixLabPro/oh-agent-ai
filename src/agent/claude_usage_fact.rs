//! v0.7 Stage 1：Claude Code 原始 session JSONL → UsageFact emitter（Rust 镜像）。
//!
//! 镜像 `scripts/agent_vitals/agent/claude_usage_fact.py` 的 Python 端实现，
//! 走 `agent_vitals_core::usage_fact::build_usage_fact` 同一契约函数。
//! Python↔Rust byte-parity 钉测：同一 JSONL 两侧 stdout 字节相等。
//!
//! Stage 1 commit 1（extractor 重构 + golden 零漂移）已先落地 fold 侧的
//! 字节不变；本 commit 是 commit 2b——Rust 镜像 + parity 钉测。

use std::collections::HashMap;
use std::path::Path;

use serde_json::{json, Map, Value};

use crate::agent::claude_cost::{day_from_iso_ts, row_tokens};
use agent_vitals_core::usage_fact::build_usage_fact;

// P0 哨兵常量——与 Python `claude_usage_fact.py` 同源字节。
const SKIP: &str = "skip";
const UNREADABLE: &str = "unreadable";
const UNATTRIBUTED: &str = "unattributed";
const OBSERVATION_KIND: &str = "assistant-usage";

/// `claude_jsonl_to_usage_facts` 的 Rust 返回类型——`tests/test_claude_usage_fact.py`
/// 对应 `UsageFactEmitResult` NamedTuple。`malformed` 留作未来软失败版（当前
/// I/O 坏行抛异常，不计入 malformed 字段）。
#[derive(Debug)]
pub struct UsageFactEmitResult {
    pub facts: Vec<Value>,
    pub attempts: HashMap<String, i64>,
    pub total_rows: i64,
    pub skip_rows: i64,
    pub malformed: i64,
}

/// `parse_claude_usage_row` 的 Rust 镜像——单条 JSON record → `Ok(Observation)`
/// 或 `Err(reason)`。与 Python `parse_claude_usage_row` 字段映射逐字段一致。
///
/// Sentinel reason 与 Python 同名字面量（`"skip"` / `"unreadable"` /
/// `"unattributed"`），保证 attempt 计数跨语言字节相等。
fn parse_claude_usage_row(
    rec: &Value,
    native_session_id: &str,
    machine_namespace: &str,
    source_profile: &str,
) -> Result<Observation, &'static str> {
    let obj = match rec.as_object() {
        Some(o) => o,
        None => return Err(SKIP),
    };
    let rtype = obj.get("type").and_then(Value::as_str).unwrap_or("");
    if rtype != "assistant" {
        return Err(SKIP);
    }
    let msg = match obj.get("message").and_then(Value::as_object) {
        Some(m) => m,
        None => return Err(SKIP),
    };
    let usage = match msg.get("usage") {
        Some(u @ Value::Object(_)) if !u.as_object().unwrap().is_empty() => u,
        _ => return Err(SKIP),
    };
    let model = match msg.get("model").and_then(Value::as_str) {
        Some(m) if !m.is_empty() => m,
        _ => return Err(UNREADABLE),
    };
    // 复用 fold 的 `row_tokens`（claude_cost.rs，R1「共享 extractor」commit
    // d0ec2f2）——两态都认、全形优先，fold 与 emitter 不得各自解释 usage 形状。
    // 缺失 / 非数 → None → UNREADABLE（corpus 值全非负 int；负值/超宽等病理
    // 输入 Python 任意精度与 Rust as_u64 的分歧面见 row_tokens 注释，不追平）。
    let Some([in_t, cr_t, cw_t, out_t]) = row_tokens(usage) else {
        return Err(UNREADABLE);
    };
    let ts = obj.get("timestamp").and_then(Value::as_str).unwrap_or("");
    // 只校验 ts 可归日（mirror Python：day 解析失败 → UNATTRIBUTED）。day/ms/
    // peak 是 fold 面字段（tail_days 归日 + 峰谷），UsageFact 事实行用原始
    // `ts_iso` 作 event_ts_utc、不物化归日/峰谷（那是物化视图派生，spec §2.1）——
    // emit 不消费它们，Observation 不带这三个字段（见 struct 注释）。
    if day_from_iso_ts(ts).is_none() {
        return Err(UNATTRIBUTED);
    }
    let msg_id = msg.get("id").and_then(Value::as_str).map(String::from);
    let (identity_basis, source_event_id) = match msg_id.clone() {
        Some(id) => ("native", id),
        None => ("derived-hash", String::new()),
    };
    Ok(Observation {
        native_session_id: native_session_id.to_string(),
        machine_namespace: machine_namespace.to_string(),
        source_profile: source_profile.to_string(),
        ts_iso: ts.to_string(),
        model: model.to_string(),
        input_tokens: in_t,
        cache_read_tokens: cr_t,
        cache_write_tokens: cw_t,
        output_tokens: out_t,
        source_event_id,
        identity_basis: identity_basis.to_string(),
        observation_kind: OBSERVATION_KIND.to_string(),
    })
}

/// 单条有效 assistant usage row 的最小事实单元——镜像 Python
/// `ClaudeUsageObservation`。Python NamedTuple 还带 `day`/`ms`/`peak`（fold
/// 面 tail_days 归日 + 峰谷）；本 Rust 镜像只服务 emit，UsageFact 事实行不
/// 物化这三个字段（event_ts_utc 用原始 `ts_iso`，归日/峰谷是物化视图派生，
/// spec §2.1），所以不携带它们——`day` 的解析只用来判定 UNATTRIBUTED。
#[derive(Debug, Clone)]
struct Observation {
    native_session_id: String,
    machine_namespace: String,
    source_profile: String,
    ts_iso: String,
    model: String,
    input_tokens: u64,
    cache_read_tokens: u64,
    cache_write_tokens: u64,
    output_tokens: u64,
    source_event_id: String,
    identity_basis: String,
    observation_kind: String,
}

impl Observation {
    fn to_usage_fact(&self) -> Option<Value> {
        // `build_usage_fact` 需要 6 个 identity 字段非空。`source_event_id`
        // 在 derived-hash 路径下为空字符串——`build_usage_fact` 拒绝空字
        // 符串，记为 `bad_id` attempt。
        if self.identity_basis == "derived-hash" && self.source_event_id.is_empty() {
            return None;
        }
        let mut fields = Map::new();
        fields.insert("machine_namespace".into(), json!(self.machine_namespace));
        fields.insert("host".into(), json!("claude-code"));
        fields.insert("source_profile".into(), json!(self.source_profile));
        fields.insert("native_session_id".into(), json!(self.native_session_id));
        fields.insert("source_event_id".into(), json!(self.source_event_id));
        fields.insert("observation_kind".into(), json!(self.observation_kind));
        fields.insert("identity_basis".into(), json!(self.identity_basis));
        fields.insert("event_ts_utc".into(), json!(self.ts_iso));
        fields.insert("time_basis".into(),
                      json!(if self.identity_basis == "native" { "native" } else { "estimated" }));
        fields.insert("source_usage_semantics".into(), json!("delta"));
        fields.insert("model_raw".into(), json!(self.model));
        fields.insert("model_id".into(), json!(self.model));
        fields.insert("provider_id".into(), json!("deepseek-official"));
        fields.insert("provider_raw".into(), json!("deepseek-official"));
        fields.insert("uncached_input_tokens".into(), json!(self.input_tokens));
        fields.insert("cache_read_tokens".into(), json!(self.cache_read_tokens));
        fields.insert("cache_write_tokens".into(), json!(self.cache_write_tokens));
        fields.insert("output_tokens".into(), json!(self.output_tokens));
        build_usage_fact(&fields).ok()
    }
}

/// 整份 Claude JSONL → `UsageFactEmitResult`。
///
/// 与 Python `claude_jsonl_to_usage_facts` 字节等价：
/// - facts 顺序按 record 顺序
/// - attempts 字典键集合 = `{"skip", "unreadable", "unattributed"}` + 可选
///   `"bad_id"`（仅当存在 derived-hash + 空 source_event_id 的 Observation）
/// - total_rows / skip_rows 计数按 record 顺序（cost-state 不算 usage 但
///   算 total_rows，因为它被读了）
/// - malformed 恒 0（commit 1 既有 I/O 行为：坏行抛异常）
///
/// 行切分镜像 Python `_read_suffix`（claude_cost.py）的字节级语义：按 `\n`
/// 切完整行、剥尾 `\r`、空行跳过；**末行无换行符不消费**（写入方可能写到
/// 一半，与 fold 尾读续折同款「绝不拼半截」）。`BufRead::lines()` 会把
/// 无换行结尾的末段当成一行——与 Python 语义分叉，故不用它。
pub fn claude_jsonl_to_usage_facts(
    path: &Path,
    machine_namespace: &str,
    source_profile: &str,
    native_session_id: &str,
) -> Result<UsageFactEmitResult, String> {
    let data = std::fs::read(path)
        .map_err(|e| format!("read {}: {}", path.display(), e))?;
    let mut facts = Vec::new();
    let mut attempts: HashMap<String, i64> = HashMap::new();
    attempts.insert(SKIP.to_string(), 0);
    attempts.insert(UNREADABLE.to_string(), 0);
    attempts.insert(UNATTRIBUTED.to_string(), 0);
    let mut total_rows = 0i64;
    let mut skip_rows = 0i64;
    let mut start = 0usize;
    for (i, b) in data.iter().enumerate() {
        if *b != b'\n' {
            continue;
        }
        let mut line = &data[start..i];
        if line.ends_with(b"\r") {
            line = &line[..line.len() - 1];
        }
        start = i + 1;
        if line.is_empty() {
            continue;
        }
        total_rows += 1;
        // Python `json.loads(..., errors="replace")` → `String::from_utf8_lossy`
        // 同款：坏 UTF-8 字节替换而非报错（正常 JSONL 都是合法 UTF-8，此路
        // 只是防御镜像）。
        let text = String::from_utf8_lossy(line);
        let rec: Value = serde_json::from_str(&text).map_err(|e| {
            format!("non-json line in {} at row {}: {}", path.display(), total_rows, e)
        })?;
        match parse_claude_usage_row(&rec, native_session_id, machine_namespace, source_profile) {
            Ok(obs) => match obs.to_usage_fact() {
                Some(fact) => facts.push(fact),
                None => {
                    // derived-hash + 空 source_event_id → bad_id 哨兵
                    *attempts.entry("bad_id".to_string()).or_insert(0) += 1;
                    skip_rows += 1;
                }
            },
            Err(reason) => {
                *attempts.entry(reason.to_string()).or_insert(0) += 1;
                skip_rows += 1;
            }
        }
    }
    Ok(UsageFactEmitResult {
        facts,
        attempts,
        total_rows,
        skip_rows,
        malformed: 0,
    })
}

/// CLI `--json` 输出的完整 payload——键序与 Python
/// `scan.py claude-usage-facts --json -`（`cli.py::claude-usage-facts` handler
/// 的 `facts_out` dict 插入序）逐键一致：native_session_id, machine_namespace,
/// source_profile, facts, attempts, coverage, malformed。attempts/coverage 子
/// 对象同样按 Python dict 的插入序显式构造（HashMap 自身无序，不能直接序列化）。
pub fn to_payload_value(
    result: &UsageFactEmitResult,
    native_session_id: &str,
    machine_namespace: &str,
    source_profile: &str,
) -> Value {
    let mut out = Map::new();
    out.insert("native_session_id".to_string(), json!(native_session_id));
    out.insert("machine_namespace".to_string(), json!(machine_namespace));
    out.insert("source_profile".to_string(), json!(source_profile));
    out.insert("facts".to_string(), json!(result.facts));
    let mut attempts_obj = Map::new();
    for k in [SKIP, UNREADABLE, UNATTRIBUTED] {
        attempts_obj.insert(
            k.to_string(),
            json!(result.attempts.get(k).copied().unwrap_or(0)),
        );
    }
    if result.attempts.get("bad_id").is_some_and(|v| *v > 0) {
        attempts_obj.insert(
            "bad_id".to_string(),
            json!(result.attempts["bad_id"]),
        );
    }
    out.insert("attempts".to_string(), Value::Object(attempts_obj));
    let mut cov = Map::new();
    cov.insert("total_rows".to_string(), json!(result.total_rows));
    cov.insert("fact_rows".to_string(), json!(result.facts.len()));
    cov.insert("skip_rows".to_string(), json!(result.skip_rows));
    out.insert("coverage".to_string(), Value::Object(cov));
    out.insert("malformed".to_string(), json!(result.malformed));
    Value::Object(out)
}

/// 人读摘要——逐行镜像 Python handler 的 print（含 `Attempts:` 行的 dict repr：
/// `{'skip': 3, 'unreadable': 0, ...}`，键单引号、逗号+空格）。诊断面不是
/// parity 测试面，但保持双语言同源字节，免得两套人读输出漂移。
pub fn to_human_summary(
    result: &UsageFactEmitResult,
    source_path: &Path,
    native_session_id: &str,
    machine_namespace: &str,
    source_profile: &str,
) -> String {
    let mut attempts_parts: Vec<String> = Vec::new();
    for k in [SKIP, UNREADABLE, UNATTRIBUTED] {
        attempts_parts.push(format!(
            "'{}': {}",
            k,
            result.attempts.get(k).copied().unwrap_or(0)
        ));
    }
    if result.attempts.get("bad_id").is_some_and(|v| *v > 0) {
        attempts_parts.push(format!("'bad_id': {}", result.attempts["bad_id"]));
    }
    format!(
        "Source: {}\nNative session id: {}\nMachine namespace: {}\nSource profile: {}\n\
         Facts: {} (rows={}, skip={})\nAttempts: {{{}}}\n",
        source_path.display(),
        native_session_id,
        machine_namespace,
        source_profile,
        result.facts.len(),
        result.total_rows,
        result.skip_rows,
        attempts_parts.join(", ")
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    fn line(rec: serde_json::Value) -> String {
        format!("{}\n", serde_json::to_string(&rec).unwrap())
    }

    #[test]
    fn parse_assistant_with_id_marks_native() {
        let obs = parse_claude_usage_row(
            &json!({
                "type": "assistant", "timestamp": "2026-09-02T03:00:00.000Z",
                "message": {
                    "id": "msg_x", "model": "deepseek-v4-flash",
                    "usage": {"input_tokens": 1, "cache_read_input_tokens": 0,
                              "cache_creation_input_tokens": 0, "output_tokens": 0}
                }
            }),
            "sid", "ns", "default",
        ).unwrap();
        assert_eq!(obs.source_event_id, "msg_x");
        assert_eq!(obs.identity_basis, "native");
    }

    #[test]
    fn parse_cost_state_returns_skip() {
        let r = parse_claude_usage_row(
            &json!({"type": "cost-state", "modelUsage": {}}),
            "sid", "ns", "default",
        );
        assert_eq!(r.unwrap_err(), SKIP);
    }

    #[test]
    fn parse_no_message_id_marks_derived_hash() {
        let obs = parse_claude_usage_row(
            &json!({
                "type": "assistant", "timestamp": "2026-09-02T03:00:00.000Z",
                "message": {"model": "m",
                            "usage": {"input_tokens": 1, "cache_read_input_tokens": 0,
                                      "cache_creation_input_tokens": 0, "output_tokens": 0}}
            }),
            "sid", "ns", "default",
        ).unwrap();
        assert_eq!(obs.source_event_id, "");
        assert_eq!(obs.identity_basis, "derived-hash");
        assert!(obs.to_usage_fact().is_none(),
                "derived-hash + 空 source_event_id → bad_id 哨兵，不发射 fact");
    }

    #[test]
    fn parse_bad_ts_returns_unattributed() {
        let r = parse_claude_usage_row(
            &json!({
                "type": "assistant", "timestamp": "bogus",
                "message": {"model": "m",
                            "usage": {"input_tokens": 1, "cache_read_input_tokens": 0,
                                      "cache_creation_input_tokens": 0, "output_tokens": 0}}
            }),
            "sid", "ns", "default",
        );
        assert_eq!(r.unwrap_err(), UNATTRIBUTED);
    }

    #[test]
    fn parse_no_model_returns_unreadable() {
        let r = parse_claude_usage_row(
            &json!({
                "type": "assistant", "timestamp": "2026-09-02T03:00:00.000Z",
                "message": {"usage": {"input_tokens": 1, "cache_read_input_tokens": 0,
                                      "cache_creation_input_tokens": 0, "output_tokens": 0}}
            }),
            "sid", "ns", "default",
        );
        assert_eq!(r.unwrap_err(), UNREADABLE);
    }

    #[test]
    fn parse_short_keys_shape_also_accepted() {
        // Python `test_short_keys_shape_also_accepted` 的镜像：row_tokens 嗅两态
        // ——短键（真机 0 命中但仍认）也走 Observation。commit 1 前 Rust fold 已
        // 认短键（differential 过 sess2），emitter 复用同一 row_tokens 后行为一致。
        let obs = parse_claude_usage_row(
            &json!({
                "type": "assistant", "timestamp": "2026-09-02T03:00:00.000Z",
                "message": {"model": "m",
                            "usage": {"input": 1, "cache_read": 2,
                                      "cache_creation": 3, "output": 4}}
            }),
            "sid", "ns", "default",
        )
        .unwrap();
        assert_eq!(obs.input_tokens, 1);
        assert_eq!(obs.cache_read_tokens, 2);
        assert_eq!(obs.cache_write_tokens, 3);
        assert_eq!(obs.output_tokens, 4);
    }

    #[test]
    fn end_to_end_real_world_three_sessions() {
        // 复用 commit 6421f2a 的真机数字：每份 1 cost-state + 4 assistant
        // 行，cache_read 合计 66.6M（spec §5 后段点名数字）。
        let rows = |sid_start: i64, baseline: i64, per: i64| -> Vec<String> {
            vec![
                line(json!({
                    "type": "cost-state", "timestamp": "2026-09-01T18:00:00.000Z",
                    "startTime": sid_start,
                    "modelUsage": {"deepseek-v4-flash": {
                        "inputTokens": 0, "outputTokens": 0,
                        "cacheReadInputTokens": baseline,
                        "cacheCreationInputTokens": 0,
                        "webSearchRequests": 0, "costUSD": 0.0}},
                    "hasUnknownModelCost": false
                })),
                line(json!({
                    "type": "assistant", "timestamp": "2026-09-02T03:00:00.000Z",
                    "message": {"id": "msg_3h", "model": "deepseek-v4-flash",
                                "usage": {"input_tokens": 0, "cache_read_input_tokens": per,
                                          "cache_creation_input_tokens": 0, "output_tokens": 0}}
                })),
                line(json!({
                    "type": "assistant", "timestamp": "2026-09-02T05:00:00.000Z",
                    "message": {"id": "msg_5h", "model": "deepseek-v4-flash",
                                "usage": {"input_tokens": 0, "cache_read_input_tokens": per,
                                          "cache_creation_input_tokens": 0, "output_tokens": 0}}
                })),
                line(json!({
                    "type": "assistant", "timestamp": "2026-09-02T07:00:00.000Z",
                    "message": {"id": "msg_7h", "model": "deepseek-v4-flash",
                                "usage": {"input_tokens": 0, "cache_read_input_tokens": per,
                                          "cache_creation_input_tokens": 0, "output_tokens": 0}}
                })),
                line(json!({
                    "type": "assistant", "timestamp": "2026-09-02T09:00:00.000Z",
                    "message": {"id": "msg_9h", "model": "deepseek-v4-flash",
                                "usage": {"input_tokens": 0, "cache_read_input_tokens": per,
                                          "cache_creation_input_tokens": 0, "output_tokens": 0}}
                })),
            ]
        };
        let tmp = std::env::temp_dir().join(format!(
            "av-claude-usage-fact-test-{}-{}",
            std::process::id(),
            std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap()
                .as_nanos()
        ));
        std::fs::create_dir_all(&tmp).unwrap();
        // 2279b7b0: baseline 38.7M, rows 5.7M (1.5+1.5+1.5+1.2M)
        let p1 = tmp.join("2279b7b0.jsonl");
        std::fs::write(&p1, rows(1_788_192_000_000, 38_700_000, 1_425_000).join("")).unwrap();
        // 753e080a: baseline 137.1M, rows 44.9M (4 × 11.225M)
        let p2 = tmp.join("753e080a.jsonl");
        std::fs::write(&p2, rows(1_788_235_200_000, 137_100_000, 11_225_000).join("")).unwrap();
        // b695a35f: baseline 88.3M, rows 16.0M (4 × 4.0M)
        let p3 = tmp.join("b695a35f.jsonl");
        std::fs::write(&p3, rows(1_788_170_400_000, 88_300_000, 4_000_000).join("")).unwrap();
        // 合并三份
        let mut all_facts: Vec<Value> = Vec::new();
        let mut total_rows = 0i64;
        let mut skip_rows = 0i64;
        let mut total_attempts: HashMap<String, i64> = HashMap::new();
        for (p, sid) in [(&p1, "2279b7b0"), (&p2, "753e080a"), (&p3, "b695a35f")] {
            let r = claude_jsonl_to_usage_facts(p, "ns-test", "default", sid).unwrap();
            all_facts.extend(r.facts);
            total_rows += r.total_rows;
            skip_rows += r.skip_rows;
            for (k, v) in &r.attempts {
                *total_attempts.entry(k.clone()).or_insert(0) += v;
            }
        }
        assert_eq!(total_rows, 15, "3 份 × (1 cost-state + 4 assistant) = 15");
        assert_eq!(all_facts.len(), 12);
        assert_eq!(skip_rows, 3, "15 行 − 12 fact = 3 skip（全为 cost-state）");
        assert_eq!(total_attempts.get(SKIP).copied().unwrap_or(0), 3);
        // 合计 cache_read tokens = 66.6M
        let cr_total: i64 = all_facts.iter()
            .map(|f| f.get("cache_read_tokens").and_then(Value::as_i64).unwrap_or(0))
            .sum();
        assert_eq!(cr_total, 66_600_000,
                   "spec §5 后段点名：1.5+1.5+1.5+1.2 + 11.225×4 + 4.0×4 = 66.6M cache_read");
        // 每条 fact identity_basis=native（每条都有 msg_id）
        assert!(all_facts.iter().all(|f| f.get("identity_basis")
                                     .and_then(Value::as_str) == Some("native")));
        // fact_id 跨三会话唯一
        let ids: Vec<String> = all_facts.iter()
            .map(|f| f.get("fact_id").and_then(Value::as_str).unwrap_or("").to_string())
            .collect();
        assert_eq!(ids.len(), 12);
        let unique: std::collections::HashSet<&String> = ids.iter().collect();
        assert_eq!(unique.len(), 12);
        std::fs::remove_dir_all(&tmp).ok();
    }

    // ── 防误用 ────────────────────────────────────────────────────
    // `Map` import 保留表明本模块对 serde_json::Map 的依赖（避免下游
    // 误删 use 后引入未使用的类型）。
    #[allow(dead_code)]
    fn _map_type_kept(_: Map<String, Value>) {}
    #[test]
    fn map_type_kept() {
        _map_type_kept(Map::new());
    }
}
