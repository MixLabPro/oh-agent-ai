//! Codex 成本折叠 —— 把 Codex rollout 的 `token_count` 事件折成「5 桶 × 模型 × 日期」。
//!
//! DSH 的 `usage.rs::token_by_model` 是给 DeepSeek token-meter 的折叠；Codex 的线格式
//! 与计价维度都不同，不能复用同一个折叠：DSH 的 4 桶（input/output/cacheRead/
//! cacheWrite）+ peak/off-peak 是模型无关的，Codex 的 5 桶按 `payload.info` 的
//! `last_token_usage` 读，计价还要 speed 维度。这是 cc-trace 研究 §D 显式 defer 的
//! 一块新能力，不是给 DSH 的成本引擎套 Codex 壳。
//!
//! 折叠语义的**正确性铁律**（实测本机 51 份 rollout，见 `codex-corpus-facts` 记忆）：
//!
//! - **读 `last_token_usage`，不是 `total_token_usage`**：`total` 是累计、`last` 是
//!   本 turn 增量（`total[i] − total[i−1]`）。拿 total 折叠会把整段会话反复加进桶里。
//! - **`uncached = input − cached − cache_write`（派生，不直接读）**；`input_tokens` /
//!   `output_tokens` 是必填（缺键 → 无效），cached / cache_write / reasoning 缺省 0
//!   （cc-trace 的 `integer_or_zero` 同款）。`output >= reasoning` 必须成立——reasoning
//!   **已计入 output**，绝不把 reasoning 加在 output 之上（那是双计）。
//! - **去重是必须的**：11575 个 token_count 事件里有 **366 个连续重复的
//!   `total_token_usage` 签名**（两种形态：整段复读 `last==total`、清零复读 `last`
//!   全 0 + 一个假的 `total_tokens`）。cc-trace 用 `last_total_signature` 跳过同签名的
//!   后续事件。累计总量单调不减，所以**连续去重 = 完全去重**——签名相同就 continue，
//!   不折叠、不算 unaccounted（同一计量的复读不是残差）。
//! - **model 不在 token_count 事件里**：来自 `turn_context.payload.model`（游标），
//!   token_count 归到最近一次 turn_context 的 model。首个 turn_context 之前的
//!   token_count 无法归属 → 进 `unaccounted`（残差哨兵：看见了 token、没接住）。
//! - **speed 也来自游标**：`turn_context.payload.service_tier` / `thread_settings/
//!   service_tier` 或 `thread_settings_applied` 的 `thread_settings/service_tier`，
//!   `default|standard → standard`、`fast|priority → fast`。实测 service_tier 全为 null
//!   → 恒 standard，但折叠**保留** speed 解析并按 (model, speed) 分桶——真实数据不
//!   命中 fast，命中就是未来的不同计费，不能静默并进 standard 桶（同「窄进宽出，
//!   绝不静默漏算」纪律）。没看到 service_tier 时默认 standard（cc-trace 同款）。
//! - **日期**：从事件的顶层 `timestamp`（回退 `payload.timestamp`）取 `YYYY-MM-DD`
//!   前缀。无日期的事件仍折进 `by_model`，但**不产生日期桶**（未知时间不能算进任何
//!   一天——与 `usage.rs::token_by_date_model` 对无时间样本同一条纪律）。因此
//!   `sum(by_date_model) == by_model − 无日期样本的量`；全部带日期时两者精确相等，
//!   这正是守恒测试断言的形式。
//!
//! `codex_fold_file`（单文件有序流）与 `codex_merge_folds`（跨文件求和）都输出同一
//! 形状：`{by_date_model, by_model, unaccounted}`。日期升序、模型/速度按首现序（与
//! Python dict 的插入序对齐，两侧 JSON 逐字节相同靠的是这份一致）。Python 平行实现
//! 见 `scripts/skill_vitals/codex_usage.py`，差分由 `tests/test_cli_matrix.py::both()`
//! 与 characterization 钉死。

use serde_json::{Map, Value, json};

/// Codex 5 桶字段名（输出顺序 = 桶序）。`uncached_input_tokens` 是派生字段，其余
/// 四个直接来自 `last_token_usage`。
pub const CODEX_TOKEN_FIELDS: [&str; 5] = [
    "uncached_input_tokens",
    "output_tokens",
    "cached_input_tokens",
    "cache_write_input_tokens",
    "reasoning_output_tokens",
];

/// 从 `last_token_usage` 折出 5 桶。`None` = 无效（缺 input/output、`uncached < 0`、
/// `reasoning > output`）——交给调用方进残差哨兵，绝不把假数字折进桶。
pub fn codex_token_facts(last: &Value) -> Option<[i64; 5]> {
    if !last.is_object() {
        return None;
    }
    let input = last.get("input_tokens").and_then(|v| v.as_i64())?;
    let output = last.get("output_tokens").and_then(|v| v.as_i64())?;
    let cached = last.get("cached_input_tokens").and_then(|v| v.as_i64()).unwrap_or(0);
    let cache_write = last.get("cache_write_input_tokens").and_then(|v| v.as_i64()).unwrap_or(0);
    let reasoning = last.get("reasoning_output_tokens").and_then(|v| v.as_i64()).unwrap_or(0);
    let uncached = input - cached - cache_write;
    if uncached < 0 || reasoning > output {
        return None;
    }
    Some([uncached, output, cached, cache_write, reasoning])
}

/// `total_token_usage` 的 6 字段签名（去重键）。缺任一字段 → None（这种 total 没法
/// 判定「同一计量复读」，就不去重，交给下游的 last 校验兜底）。
fn total_signature(total: &Value) -> Option<(i64, i64, i64, i64, i64, i64)> {
    Some((
        total.get("input_tokens")?.as_i64()?,
        total.get("output_tokens")?.as_i64()?,
        total.get("cached_input_tokens")?.as_i64()?,
        total.get("cache_write_input_tokens")?.as_i64()?,
        total.get("reasoning_output_tokens")?.as_i64()?,
        total.get("total_tokens")?.as_i64()?,
    ))
}

/// 事件的时间戳 → `YYYY-MM-DD` 前缀。顶层 `timestamp` 回退 `payload.timestamp`；
/// 不是 `YYYY-MM-DD` 开头的字符串 → None（未知时间，不编造日期）。
fn codex_date_of(event: &Value) -> Option<String> {
    let ts = event
        .get("timestamp")
        .and_then(|v| v.as_str())
        .or_else(|| event.pointer("/payload/timestamp").and_then(|v| v.as_str()))?;
    let b = ts.as_bytes();
    if b.len() < 10
        || !b[..4].iter().all(|c| c.is_ascii_digit())
        || b[4] != b'-'
        || !b[5..7].iter().all(|c| c.is_ascii_digit())
        || b[7] != b'-'
        || !b[8..10].iter().all(|c| c.is_ascii_digit())
    {
        return None;
    }
    Some(ts[..10].to_string())
}

/// `default|standard → standard`、`fast|priority → fast`，其余 → None（未知档位不猜，
/// 保持当前 speed——不是把未知档位静默降级成 standard）。
fn normalize_speed(tier: &str) -> Option<&'static str> {
    match tier {
        "default" | "standard" => Some("standard"),
        "fast" | "priority" => Some("fast"),
        _ => None,
    }
}

/// 从一个 payload 里读 service_tier → 归一化 speed。`payload.service_tier` 优先，
/// 回退 `thread_settings/service_tier`（cc-trace 的两处 pointer 同款）。
fn speed_from_payload(payload: &Value) -> Option<&'static str> {
    if let Some(t) = payload.get("service_tier").and_then(|v| v.as_str()) {
        if let Some(s) = normalize_speed(t) {
            return Some(s);
        }
    }
    payload
        .pointer("/thread_settings/service_tier")
        .and_then(|v| v.as_str())
        .and_then(normalize_speed)
}

/// 把一个 5 桶对象折进 `map[model][speed]`。桶对象存在则按位累加，不存在则按
/// `CODEX_TOKEN_FIELDS` 的桶序新建（键序是字节一致的一部分，不能重排）。
fn add_bucket(map: &mut Map<String, Value>, model: &str, speed: &str, facts: &[i64; 5]) {
    let speed_map = map
        .entry(model.to_string())
        .or_insert_with(|| Value::Object(Map::new()))
        .as_object_mut()
        .expect("bucket map value is an object");
    let bucket = speed_map
        .entry(speed.to_string())
        .or_insert_with(|| {
            json!({
                "uncached_input_tokens": 0,
                "output_tokens": 0,
                "cached_input_tokens": 0,
                "cache_write_input_tokens": 0,
                "reasoning_output_tokens": 0,
            })
        });
    let obj = bucket.as_object_mut().expect("bucket is an object");
    for (i, field) in CODEX_TOKEN_FIELDS.iter().enumerate() {
        let cur = obj.get(*field).and_then(|v| v.as_i64()).unwrap_or(0);
        obj.insert((*field).to_string(), json!(cur + facts[i]));
    }
}

/// 把一个 5 桶对象读回 `[i64; 5]`（合并跨文件的桶时用）。
fn bucket_to_array(bucket: &Value) -> [i64; 5] {
    let mut out = [0i64; 5];
    for (i, field) in CODEX_TOKEN_FIELDS.iter().enumerate() {
        out[i] = bucket.get(*field).and_then(|v| v.as_i64()).unwrap_or(0);
    }
    out
}

/// 残差哨兵：给 `unaccounted` 里某个 type 累加 (count, tokens_seen)。
/// `tokens_seen` = 该事件 total_token_usage 里的 total_tokens（总能看到的大数），
/// 让展示层知道「看见了多大的用量、没接住」。
fn bump_unaccounted(
    unaccounted: &mut std::collections::BTreeMap<String, (i64, i64)>,
    ttype: &str,
    total_tokens: i64,
) {
    let e = unaccounted.entry(ttype.to_string()).or_insert((0, 0));
    e.0 += 1;
    e.1 += total_tokens;
}

/// 单文件有序折叠：把一份 rollout 的原始条目流折成 `{by_date_model, by_model,
/// unaccounted}`。纯函数，不碰文件系统——I/O 在适配器层，这里只吃 `events`。
///
/// 输出顺序：日期升序（BTreeMap）、模型/速度按首现序（Map 插入序）、`unaccounted`
/// 按 type 名升序。这些顺序是字节一致的一部分。
pub fn codex_fold_file(events: &[Value]) -> Value {
    let mut model: Option<String> = None;
    let mut speed: &'static str = "standard";
    let mut last_total_sig: Option<(i64, i64, i64, i64, i64, i64)> = None;
    // 日期升序：BTreeMap；模型层 / 速度层用 serde_json Map 保插入序。
    let mut by_date_model: std::collections::BTreeMap<String, Map<String, Value>> =
        std::collections::BTreeMap::new();
    let mut by_model: Map<String, Value> = Map::new();
    let mut unaccounted: std::collections::BTreeMap<String, (i64, i64)> =
        std::collections::BTreeMap::new();

    for event in events {
        if !event.is_object() {
            continue;
        }
        let ttype = event.get("type").and_then(|v| v.as_str()).unwrap_or("");
        match ttype {
            "turn_context" => {
                if let Some(p) = event.get("payload") {
                    if let Some(m) = p.get("model").and_then(|v| v.as_str()) {
                        model = Some(m.to_string());
                    }
                    if let Some(s) = speed_from_payload(p) {
                        speed = s;
                    }
                }
            }
            "event_msg" => {
                let payload = event.get("payload");
                let ptype = payload
                    .and_then(|p| p.get("type"))
                    .and_then(|v| v.as_str())
                    .unwrap_or("");
                match ptype {
                    "thread_settings_applied" => {
                        if let Some(p) = payload {
                            if let Some(s) = speed_from_payload(p) {
                                speed = s;
                            }
                        }
                    }
                    "token_count" => {
                        let Some(payload) = payload else { continue };
                        // `info` 必须真是对象：键存在但值为 `null`（真实语料 08-19 出过）
                        // 意味着这个事件**没有任何 token 字段**，不是「看见了没接住」，
                        // 不该进残差哨兵——Python 侧 `isinstance(info, dict)` 直接跳过，
                        // 这里用 `as_object()` 对齐：缺键和 null 都跳过，绝不在二者之间
                        // 产生 Py↔Rust 分歧。
                        let Some(info) = payload.get("info").and_then(|v| v.as_object()) else { continue };
                        let total = info.get("total_token_usage");
                        // 去重：同一计量复读（total 签名不变）→ 跳过。累计总量单调
                        // 不减，连续去重 = 完全去重（实测 366 处重复签名都是连续成对）。
                        if let Some(total) = total {
                            if let Some(sig) = total_signature(total) {
                                if last_total_sig == Some(sig) {
                                    continue;
                                }
                                last_total_sig = Some(sig);
                            }
                        }
                        let total_tokens = total
                            .and_then(|t| t.get("total_tokens"))
                            .and_then(|v| v.as_i64())
                            .unwrap_or(0);
                        let Some(last) = info.get("last_token_usage") else {
                            bump_unaccounted(&mut unaccounted, "token_count_invalid_last_usage", total_tokens);
                            continue;
                        };
                        let Some(facts) = codex_token_facts(last) else {
                            bump_unaccounted(&mut unaccounted, "token_count_invalid_last_usage", total_tokens);
                            continue;
                        };
                        let Some(m) = model.clone() else {
                            // 首个 turn_context 之前：看见了 token、没模型可归。
                            bump_unaccounted(&mut unaccounted, "token_count_before_turn_context", total_tokens);
                            continue;
                        };
                        if let Some(d) = codex_date_of(event) {
                            let date_map = by_date_model.entry(d).or_default();
                            add_bucket(date_map, &m, speed, &facts);
                        }
                        add_bucket(&mut by_model, &m, speed, &facts);
                    }
                    _ => {}
                }
            }
            _ => {}
        }
    }

    let mut date_out = Map::new();
    for (d, date_map) in by_date_model {
        date_out.insert(d, Value::Object(date_map));
    }
    let unaccounted_out: Vec<Value> = unaccounted
        .iter()
        .map(|(t, (count, tokens_seen))| {
            json!({"type": t, "count": count, "tokens_seen": tokens_seen})
        })
        .collect();
    json!({
        "by_date_model": Value::Object(date_out),
        "by_model": Value::Object(by_model),
        "unaccounted": Value::Array(unaccounted_out),
    })
}

/// 跨文件合并：把多个 `codex_fold_file` 的结果逐桶求和。纯函数。
///
/// 顺序确定性（字节一致的一部分）：`by_date_model` 的日期**全局升序**（先收集全部
/// 日期排序，再按序遍历——跨文件时插入序不可靠：先 fold 的文件日期可能晚于后 fold
/// 的）；每个日期内的模型、每个模型内的速度按**跨文件首现序**（按 folds 顺序遍历）。
/// `by_model` 按 folds 顺序、模型/速度首现序。`unaccounted` 按 type 名升序求和。
pub fn codex_merge_folds(folds: &[Value]) -> Value {
    let mut all_dates: std::collections::BTreeSet<String> = std::collections::BTreeSet::new();
    for fold in folds {
        if let Some(by_date) = fold.get("by_date_model").and_then(|v| v.as_object()) {
            all_dates.extend(by_date.keys().cloned());
        }
    }

    let mut by_date_out: Map<String, Value> = Map::new();
    for d in &all_dates {
        let mut date_map: Map<String, Value> = Map::new();
        for fold in folds {
            let Some(by_date) = fold.get("by_date_model").and_then(|v| v.as_object()) else {
                continue;
            };
            let Some(models) = by_date.get(d).and_then(|v| v.as_object()) else {
                continue;
            };
            for (m, speeds) in models {
                let Some(speeds) = speeds.as_object() else { continue };
                for (spd, bucket) in speeds {
                    add_bucket(&mut date_map, m, spd, &bucket_to_array(bucket));
                }
            }
        }
        by_date_out.insert(d.clone(), Value::Object(date_map));
    }

    let mut by_model: Map<String, Value> = Map::new();
    for fold in folds {
        let Some(bm) = fold.get("by_model").and_then(|v| v.as_object()) else {
            continue;
        };
        for (m, speeds) in bm {
            let Some(speeds) = speeds.as_object() else { continue };
            for (spd, bucket) in speeds {
                add_bucket(&mut by_model, m, spd, &bucket_to_array(bucket));
            }
        }
    }

    let mut unaccounted: std::collections::BTreeMap<String, (i64, i64)> =
        std::collections::BTreeMap::new();
    for fold in folds {
        let Some(ua) = fold.get("unaccounted").and_then(|v| v.as_array()) else {
            continue;
        };
        for e in ua {
            let t = e.get("type").and_then(|v| v.as_str()).unwrap_or("");
            let c = e.get("count").and_then(|v| v.as_i64()).unwrap_or(0);
            let s = e.get("tokens_seen").and_then(|v| v.as_i64()).unwrap_or(0);
            let entry = unaccounted.entry(t.to_string()).or_insert((0, 0));
            entry.0 += c;
            entry.1 += s;
        }
    }

    let unaccounted_out: Vec<Value> = unaccounted
        .iter()
        .map(|(t, (count, tokens_seen))| {
            json!({"type": t, "count": count, "tokens_seen": tokens_seen})
        })
        .collect();
    json!({
        "by_date_model": Value::Object(by_date_out),
        "by_model": Value::Object(by_model),
        "unaccounted": Value::Array(unaccounted_out),
    })
}

/// 日期轴投影 → 模型轴投影：`by_date_model`（{date:{model:{speed:桶}}}）逐桶求和
/// 折回 `by_model`（{model:{speed:桶}}）。模型/速度按**跨日期首现序**（日期已升序，
/// 逐日期插入即首现序），与 `codex_fold_file` 的模型轴同一约定。
///
/// 踩过的坑：`codex-cost --month` 过滤日期轴后，by_model 必须**重算**——过滤掉了
/// 哪些日期，模型轴就必须同样丢掉那些 token，否则 per_model 里残留被过滤日期的
/// 用量，days 与 per_model 对不上（守恒测试红）。一开始想当然拿 `codex_merge_folds`
/// 把过滤后的 by_date_model "折回去"，但 merge 的 by_model **只读各 fold 的
/// `by_model` 字段**、从不读 by_date_model，传 `{"by_model": {}}` 得到的是空模型轴
/// ——整份月报告静默变全零（per_model 空 + unpriced 0 → 返回 None → 全零兜底），
/// 一个「看不见的错」。重算不是新数据：`by_model == Σ 各日期桶`（同一折叠的两投影，
/// usage.rs 日期轴守恒同款纪律），无日期样本没有日期桶、被月份过滤按设计丢弃。
pub fn codex_by_model_from_dates(by_date_model: &Value) -> Value {
    let mut by_model: Map<String, Value> = Map::new();
    if let Some(bd) = by_date_model.as_object() {
        for (_date, date_map) in bd {
            let Some(date_map) = date_map.as_object() else { continue };
            for (m, speeds) in date_map {
                let Some(speeds) = speeds.as_object() else { continue };
                for (spd, bucket) in speeds {
                    add_bucket(&mut by_model, m, spd, &bucket_to_array(bucket));
                }
            }
        }
    }
    Value::Object(by_model)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn token_count_line(ts: &str, model_total: (i64, i64, i64, i64, i64, i64), last: (i64, i64, i64, i64, i64, i64)) -> Value {
        let (ti, to, tc, tw, tr, tt) = model_total;
        let (li, lo, lc, lw, lr, lt) = last;
        serde_json::json!({
            "timestamp": ts,
            "type": "event_msg",
            "payload": {
                "type": "token_count",
                "info": {
                    "total_token_usage": {
                        "input_tokens": ti, "output_tokens": to,
                        "cached_input_tokens": tc, "cache_write_input_tokens": tw,
                        "reasoning_output_tokens": tr, "total_tokens": tt,
                    },
                    "last_token_usage": {
                        "input_tokens": li, "output_tokens": lo,
                        "cached_input_tokens": lc, "cache_write_input_tokens": lw,
                        "reasoning_output_tokens": lr, "total_tokens": lt,
                    },
                    "model_context_window": 258400,
                }
            }
        })
    }

    fn turn_context_line(model: &str, ts: &str) -> Value {
        serde_json::json!({
            "timestamp": ts,
            "type": "turn_context",
            "payload": {"model": model, "service_tier": null},
        })
    }

    fn bucket_of(v: &Value, model: &str, speed: &str) -> Value {
        v.get("by_model").unwrap().get(model).unwrap().get(speed).unwrap().clone()
    }

    #[test]
    fn token_facts_derives_uncached_and_validates() {
        let last = serde_json::json!({
            "input_tokens": 100, "output_tokens": 10,
            "cached_input_tokens": 30, "cache_write_input_tokens": 5,
            "reasoning_output_tokens": 3, "total_tokens": 110,
        });
        assert_eq!(codex_token_facts(&last), Some([65, 10, 30, 5, 3]));
        // reasoning > output → 无效
        let bad = serde_json::json!({
            "input_tokens": 100, "output_tokens": 10, "reasoning_output_tokens": 12,
        });
        assert_eq!(codex_token_facts(&bad), None);
        // cached + cache_write > input → uncached 为负 → 无效
        let bad2 = serde_json::json!({
            "input_tokens": 100, "output_tokens": 10, "cached_input_tokens": 200,
        });
        assert_eq!(codex_token_facts(&bad2), None);
        // 缺 input/output（必填）→ 无效
        assert_eq!(codex_token_facts(&serde_json::json!({"output_tokens": 1})), None);
        // 缺可选桶 → 缺省 0
        let missing = serde_json::json!({"input_tokens": 100, "output_tokens": 10});
        assert_eq!(codex_token_facts(&missing), Some([100, 10, 0, 0, 0]));
    }

    #[test]
    fn fold_file_splits_by_model_and_date() {
        let events = vec![
            turn_context_line("gpt-5.6-sol", "2026-08-05T10:00:00Z"),
            token_count_line(
                "2026-08-05T10:00:01Z",
                (20413, 128, 11008, 0, 0, 20541),
                (20413, 128, 11008, 0, 0, 20541),
            ),
            token_count_line(
                "2026-08-05T10:00:02Z",
                (45995, 242, 31232, 0, 14, 46237),
                (25582, 114, 20224, 0, 14, 25696),
            ),
            turn_context_line("gpt-5.6-terra", "2026-08-06T09:00:00Z"),
            token_count_line(
                "2026-08-06T09:00:01Z",
                (1000, 50, 200, 0, 5, 1050),
                (1000, 50, 200, 0, 5, 1050),
            ),
        ];
        let out = codex_fold_file(&events);
        // by_date_model[date][model][speed] 的 5 桶
        let sol_d5 = &out["by_date_model"]["2026-08-05"]["gpt-5.6-sol"]["standard"];
        // uncached = input − cached − cache_write（本样例 cache_write 恰为 0；
        // 用变量保留下「派生公式」的字面形状，而不是把 −0 折叠掉）。
        let cache_write = 0;
        assert_eq!(sol_d5["uncached_input_tokens"], json!(45995 - 31232 - cache_write));
        assert_eq!(sol_d5["output_tokens"], json!(242));
        assert_eq!(sol_d5["cached_input_tokens"], json!(31232));
        assert_eq!(sol_d5["reasoning_output_tokens"], json!(14));
        // by_model 跨日期求和：sol 在 08-05 折叠进 1 桶
        let sol = bucket_of(&out, "gpt-5.6-sol", "standard");
        assert_eq!(sol["uncached_input_tokens"], json!(45995 - 31232));
        assert_eq!(sol["output_tokens"], json!(242));
        let terra = bucket_of(&out, "gpt-5.6-terra", "standard");
        assert_eq!(terra["uncached_input_tokens"], json!(800));
        // 守恒：by_date_model 各日期之和 == by_model
        // 守恒：by_date_model 各日期之和 == by_model。两边各跑一遍 5 桶求和再比，
        // 不拿模型名当字段名查。
        let by_model = out["by_model"].as_object().unwrap();
        let mut sum: std::collections::HashMap<&str, i64> = Default::default();
        for date_map in out["by_date_model"].as_object().unwrap().values() {
            for speeds in date_map.as_object().unwrap().values() {
                for bucket in speeds.as_object().unwrap().values() {
                    for (i, f) in CODEX_TOKEN_FIELDS.iter().enumerate() {
                        *sum.entry(*f).or_insert(0) += bucket_to_array(bucket)[i];
                    }
                }
            }
        }
        let mut bm_sum: std::collections::HashMap<&str, i64> = Default::default();
        for speeds in by_model.values() {
            for bucket in speeds.as_object().unwrap().values() {
                for (i, f) in CODEX_TOKEN_FIELDS.iter().enumerate() {
                    *bm_sum.entry(*f).or_insert(0) += bucket_to_array(bucket)[i];
                }
            }
        }
        for (f, expected) in sum {
            assert_eq!(bm_sum.get(f).copied().unwrap_or(0), expected,
                       "reconciliation for {f}");
        }
        assert!(out["unaccounted"].as_array().unwrap().is_empty());
    }

    #[test]
    fn fold_file_dedups_identical_total_signatures() {
        // 两种真实复读形态：整段复读（last==total）与清零复读（last 全 0 + 假 total）。
        let events = vec![
            turn_context_line("gpt-5.6-sol", "2026-08-05T10:00:00Z"),
            // 真事件：total (100,10,0,0,0,110)，last 增量 (100,10,...)
            token_count_line(
                "2026-08-05T10:00:01Z",
                (100, 10, 0, 0, 0, 110),
                (100, 10, 0, 0, 0, 110),
            ),
            // 整段复读：total 签名不变 → 跳过
            token_count_line(
                "2026-08-05T10:00:02Z",
                (100, 10, 0, 0, 0, 110),
                (100, 10, 0, 0, 0, 110),
            ),
            // 清零复读：total 签名仍不变，last 全 0 + 假 total → 跳过
            token_count_line(
                "2026-08-05T10:00:03Z",
                (100, 10, 0, 0, 0, 110),
                (0, 0, 0, 0, 0, 12345),
            ),
        ];
        let out = codex_fold_file(&events);
        let sol = bucket_of(&out, "gpt-5.6-sol", "standard");
        assert_eq!(sol["uncached_input_tokens"], json!(100));
        assert_eq!(sol["output_tokens"], json!(10));
        assert!(out["unaccounted"].as_array().unwrap().is_empty());
    }

    #[test]
    fn fold_file_reports_unaccounted_before_turn_context() {
        let events = vec![
            token_count_line(
                "2026-08-05T10:00:01Z",
                (100, 10, 0, 0, 0, 110),
                (100, 10, 0, 0, 0, 110),
            ),
        ];
        let out = codex_fold_file(&events);
        assert!(out["by_model"].as_object().unwrap().is_empty());
        let ua = out["unaccounted"].as_array().unwrap();
        assert_eq!(ua.len(), 1);
        assert_eq!(ua[0]["type"], json!("token_count_before_turn_context"));
        assert_eq!(ua[0]["count"], json!(1));
        assert_eq!(ua[0]["tokens_seen"], json!(110));
    }

    #[test]
    fn fold_file_reports_invalid_last_usage() {
        // total 有效签名（去重不拦），但 last 里 reasoning > output → 无效
        let events = vec![
            turn_context_line("gpt-5.6-sol", "2026-08-05T10:00:00Z"),
            serde_json::json!({
                "timestamp": "2026-08-05T10:00:01Z",
                "type": "event_msg",
                "payload": {
                    "type": "token_count",
                    "info": {
                        "total_token_usage": {
                            "input_tokens": 100, "output_tokens": 10,
                            "cached_input_tokens": 0, "cache_write_input_tokens": 0,
                            "reasoning_output_tokens": 3, "total_tokens": 110,
                        },
                        "last_token_usage": {
                            "input_tokens": 100, "output_tokens": 5,
                            "cached_input_tokens": 0, "cache_write_input_tokens": 0,
                            "reasoning_output_tokens": 9, "total_tokens": 110,
                        },
                    }
                }
            }),
        ];
        let out = codex_fold_file(&events);
        assert!(out["by_model"].as_object().unwrap().is_empty());
        let ua = out["unaccounted"].as_array().unwrap();
        assert_eq!(ua[0]["type"], json!("token_count_invalid_last_usage"));
        assert_eq!(ua[0]["tokens_seen"], json!(110));
    }

    #[test]
    fn fold_file_skips_token_count_with_null_info() {
        // 真实语料（2026-08-19 rollout）里 `info` 是 JSON `null`：事件没有任何 token
        // 字段，不是「看见了没接住」，不能进残差哨兵——Py↔Rust 在这条上曾分歧
        // （Rust 把 null 当「有 info」继续走 → 误报 invalid_last_usage；Python 的
        // `isinstance(info, dict)` 直接跳过）。缺键与 null 必须等价跳过。
        let events = vec![
            turn_context_line("gpt-5.6-sol", "2026-08-19T02:46:39Z"),
            serde_json::json!({
                "timestamp": "2026-08-19T02:46:40.474Z",
                "type": "event_msg",
                "payload": {
                    "type": "token_count",
                    "info": null,
                    "rate_limits": {"limit_id": "premium"},
                }
            }),
            serde_json::json!({
                "timestamp": "2026-08-19T02:46:41Z",
                "type": "event_msg",
                "payload": {
                    "type": "token_count",
                }
            }),
        ];
        let out = codex_fold_file(&events);
        assert!(out["by_model"].as_object().unwrap().is_empty());
        assert!(out["unaccounted"].as_array().unwrap().is_empty());
    }

    #[test]
    fn fold_file_tracks_speed_cursor() {
        // 没有 service_tier → 默认 standard；thread_settings_applied 切 fast 后，
        // 后面的 token_count 落进 fast 子桶。
        let events = vec![
            turn_context_line("gpt-5.6-sol", "2026-08-05T10:00:00Z"),
            token_count_line(
                "2026-08-05T10:00:01Z",
                (100, 10, 0, 0, 0, 110),
                (100, 10, 0, 0, 0, 110),
            ),
            serde_json::json!({
                "timestamp": "2026-08-05T10:00:02Z",
                "type": "event_msg",
                "payload": {"type": "thread_settings_applied", "thread_settings": {"service_tier": "fast"}},
            }),
            token_count_line(
                "2026-08-05T10:00:03Z",
                (200, 20, 0, 0, 0, 220),
                (100, 10, 0, 0, 0, 110),
            ),
        ];
        let out = codex_fold_file(&events);
        let speeds = out["by_model"]["gpt-5.6-sol"].as_object().unwrap();
        assert!(speeds.contains_key("standard"));
        assert!(speeds.contains_key("fast"));
        assert_eq!(speeds["standard"]["uncached_input_tokens"], json!(100));
        assert_eq!(speeds["fast"]["uncached_input_tokens"], json!(100));
    }

    #[test]
    fn fold_file_drops_untimed_from_date_but_keeps_by_model() {
        // 无日期事件（timestamp 缺失/非 YYYY-MM-DD）：by_model 有、by_date_model 没有。
        let mut e = token_count_line(
            "2026-08-05T10:00:01Z",
            (100, 10, 0, 0, 0, 110),
            (100, 10, 0, 0, 0, 110),
        );
        e.as_object_mut().unwrap().remove("timestamp");
        let events = vec![turn_context_line("gpt-5.6-sol", "2026-08-05T10:00:00Z"), e];
        let out = codex_fold_file(&events);
        assert!(out["by_date_model"].as_object().unwrap().is_empty());
        let sol = bucket_of(&out, "gpt-5.6-sol", "standard");
        assert_eq!(sol["uncached_input_tokens"], json!(100));
    }

    #[test]
    fn merge_folds_sums_and_sorts_dates_globally() {
        // fold A 日期 08-05、fold B 日期 08-01：合并后日期必须升序 08-01, 08-05。
        let fa = codex_fold_file(&[turn_context_line("m1", "2026-08-05T00:00:00Z"),
            token_count_line("2026-08-05T00:00:01Z", (10, 1, 0, 0, 0, 11), (10, 1, 0, 0, 0, 11))]);
        let fb = codex_fold_file(&[turn_context_line("m1", "2026-08-01T00:00:00Z"),
            token_count_line("2026-08-01T00:00:01Z", (20, 2, 0, 0, 0, 22), (20, 2, 0, 0, 0, 22))]);
        let merged = codex_merge_folds(&[fa, fb]);
        let dates: Vec<&str> = merged["by_date_model"].as_object().unwrap().keys().map(String::as_str).collect();
        assert_eq!(dates, vec!["2026-08-01", "2026-08-05"]);
        let bm = merged["by_model"]["m1"]["standard"].as_object().unwrap();
        assert_eq!(bm["uncached_input_tokens"], json!(30));
        assert_eq!(bm["output_tokens"], json!(3));
    }

    #[test]
    fn by_model_from_dates_reprojects_and_reconciles() {
        // 回归（真实 defect）：codex-cost --month 过滤日期轴后，旧代码拿
        // codex_merge_folds 折回 by_model——但 merge 只读 fold 的 by_model 字段、
        // 不读 by_date_model，得到空模型轴，整份月报告静默变全零。本测试钉住
        // 重算：全部样本带日期时 by_model_from_dates == merge 的 by_model。
        let events = vec![
            turn_context_line("gpt-5.6-terra", "2026-07-15T09:00:00Z"),
            token_count_line("2026-07-15T09:00:01Z", (100, 20, 30, 5, 2, 155), (100, 20, 30, 5, 2, 155)),
            turn_context_line("gpt-5.6-luna", "2026-07-15T09:01:00Z"),
            token_count_line("2026-07-15T09:01:01Z", (200, 50, 60, 10, 5, 320), (200, 50, 60, 10, 5, 320)),
            turn_context_line("gpt-5.6-sol", "2026-08-01T00:00:00Z"),
            token_count_line("2026-08-01T00:00:01Z", (100, 10, 40, 10, 2, 160), (100, 10, 40, 10, 2, 160)),
        ];
        let fold = codex_fold_file(&events);
        // 全部带日期 → 无 untimed → 两投影严格相等（键序也一致：跨日期首现序
        // terra → luna → sol，与 merge 的 fold 首现序相同）。
        let reproj = codex_by_model_from_dates(&fold["by_date_model"]);
        assert_eq!(reproj, fold["by_model"]);
        assert_eq!(
            reproj.as_object().unwrap().keys().map(String::as_str).collect::<Vec<_>>(),
            vec!["gpt-5.6-terra", "gpt-5.6-luna", "gpt-5.6-sol"],
        );

        // 月份过滤后重算：只有 07 的 terra/luna（08 的 sol 被丢），模型轴随之缩小。
        let mut filtered = serde_json::Map::new();
        for (d, v) in fold["by_date_model"].as_object().unwrap() {
            if d.starts_with("2026-07") {
                filtered.insert(d.clone(), v.clone());
            }
        }
        let jul = codex_by_model_from_dates(&Value::Object(filtered));
        assert_eq!(jul["gpt-5.6-terra"], fold["by_model"]["gpt-5.6-terra"]);
        assert_eq!(jul["gpt-5.6-luna"], fold["by_model"]["gpt-5.6-luna"]);
        assert!(jul.get("gpt-5.6-sol").is_none(), "过滤掉的日期必须从模型轴消失");
    }

    #[test]
    fn by_model_from_dates_drops_untimed_samples() {
        // 无日期样本（timestamp 缺失）只有 by_model 有、by_date_model 没有：
        // 月份过滤重算时它按设计被丢弃（无日期可归月），不会出现在重算结果里。
        let mut e = token_count_line(
            "2026-08-05T10:00:01Z",
            (100, 10, 0, 0, 0, 110),
            (100, 10, 0, 0, 0, 110),
        );
        e.as_object_mut().unwrap().remove("timestamp");
        let fold = codex_fold_file(&[
            turn_context_line("gpt-5.6-sol", "2026-08-05T10:00:00Z"),
            e,
        ]);
        assert!(!fold["by_model"].as_object().unwrap().is_empty());
        assert!(fold["by_date_model"].as_object().unwrap().is_empty());
        let reproj = codex_by_model_from_dates(&fold["by_date_model"]);
        assert!(reproj.as_object().unwrap().is_empty());
    }
}
