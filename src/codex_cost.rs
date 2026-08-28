//! Codex 成本计价 —— 把 core 的 `codex_usage` 折叠（5 桶 × 模型 × 日期）变成 USD 费用。
//!
//! 与 DSH 的分工同构：**折叠进 core，计价进 binary**。折叠（`codex_usage.rs`）是纯
//! 规则、零 I/O；计价（本文件）读 `codex_pricing.json`（`include_str!` 内嵌，Python
//! 侧读包内文件）——价格是**业务数据**，不是规则，与 `src/cost.rs` 的 `pricing.json`
//! 同一哲学，且没有 wasm 消费者，所以不进 core。Python 平行实现
//! `scripts/skill_vitals/codex_cost.py`，由 `both("codex-cost", ...)` 逐字节看守。
//!
//! **计价铁律**（与 cc-trace 的公式逐条对齐，见 `codex_pricing.json` 的 `_doc`）：
//!
//! - **5 桶**：`uncached`·uncachedRate + `cache_read`·cacheReadRate +
//!   `cache_write`·cacheWrite5mRate（Codex 只有一个 cache_write 桶，全部进 5m 档，
//!   1h 恒 0——cc-trace `codex_cache_write_tokens` 同款）；`output`·outputRate。
//!   **reasoning 已计入 output，绝不叠加**。
//! - **speed 是 catalog 的独立行**（不是乘数）：`fast` 行价 = standard 行 ×2 是
//!   catalog 里写死的，不是代码里乘出来的。resolve 时按 `(model, speed)` 匹配。
//! - **longContext**：`input_tokens > longContextThresholdTokens` 且条目没标
//!   `longContextPriced:false` 时，input 全桶 ×= longContextInputMultiplierBps/10000
//!   （默认 2.0）、output ×= longContextOutputMultiplierBps/10000（默认 1.5）。fast
//!   行都显式 `longContextPriced:false` → fast + longContext = 不乘（cc-trace 同款）。
//! - **modelPrefix 最长前缀匹配**：`gpt-5.6-sol` 必须命中 sol 行而不是 `gpt-5.6`
//!   泛化行；`codex-auto-review` 无条目 → unpriced（`priced:false`、token 进
//!   `unpriced_tokens`，诚实上报，绝不按 0 价冒充）。
//! - **USD**：cc-trace 价格表是 USD 权威价，零汇率猜测。与 DSH 的 ¥ 明确区分
//!   （`currency` 字段标到最外层）。
//!
//! **守恒**：`per_model` 从 `by_model`（完整折叠）计价、`days` 从 `by_date_model`
//! （日期轴）计价——无时间戳的样本被日期轴按设计丢弃（与 `usage.rs` 的 untimed
//! 纪律一致）。**per_model 轴先按 (date, model, speed) 逐桶计价、再把 untimed 剩余
//! 单独成桶计价**（见 `codex_cost_report` 的 LC 粒度坑），所以
//! `sum(days.cost_usd) == total_cost_usd` 只在全部样本都带日期时精确成立；差异恰好
//! 是 untimed 样本的价，由守恒测试钉死。两个轴永远对得上，不会出现两份价格。

use std::collections::HashMap;

use serde_json::{Map, Value, json};

const CODEX_PRICING_JSON: &str = include_str!("../scripts/skill_vitals/codex_pricing.json");

pub fn load_codex_pricing() -> Value {
    serde_json::from_str(CODEX_PRICING_JSON).unwrap_or_else(|_| Value::Object(Default::default()))
}

fn strip_zero(x: f64) -> String {
    let s = format!("{:.1}", x);
    if s.ends_with(".0") {
        s[..s.len() - 2].to_string()
    } else {
        s
    }
}

/// token 数 → 人类可读：226423948 → 226.4M。与 `cost.rs::format_number` 同 spec。
fn format_number(n: i64) -> String {
    if n >= 1_000_000_000 {
        return strip_zero(n as f64 / 1e9) + "B";
    }
    if n >= 1_000_000 {
        return strip_zero(n as f64 / 1e6) + "M";
    }
    if n >= 1_000 {
        return strip_zero(n as f64 / 1e3) + "K";
    }
    n.to_string()
}

/// 金额 → `$12.34` / `$123.4`。≥100 一位小数否则两位，去尾零。与
/// `cost.rs::format_money` 同一 spec，前缀换成 `$`（USD）。
fn format_usd(x: f64) -> String {
    let s = if x >= 100.0 { format!("{:.1}", x) } else { format!("{:.2}", x) };
    let s = s.trim_end_matches('0').trim_end_matches('.').to_string();
    format!("${s}")
}

fn get_i64(v: &Value, key: &str) -> i64 {
    v.get(key).and_then(|x| x.as_i64()).unwrap_or(0)
}

/// 价格表条目里的金额是**字符串**（cc-trace 原样，避免浮点漂移），解析成 f64。
fn rate(entry: &Value, key: &str) -> f64 {
    entry
        .get(key)
        .and_then(|v| v.as_str())
        .and_then(|s| s.parse::<f64>().ok())
        .unwrap_or(0.0)
}

/// `(model, speed)` → 价格表条目：**最长 modelPrefix 匹配**（`gpt-5.6-sol` 命中
/// sol 行而非 `gpt-5.6` 泛化行）。同长度时先出现的条目赢（catalog 数组序即作者
/// 意图，确定性匹配）。找不到 → None（unpriced）。
fn resolve_entry<'a>(model: &str, speed: &str, entries: &'a [Value]) -> Option<&'a Value> {
    let mut best: Option<&Value> = None;
    let mut best_len = 0usize;
    for e in entries {
        if e.get("speed").and_then(|v| v.as_str()) != Some(speed) {
            continue;
        }
        let prefix = e.get("modelPrefix").and_then(|v| v.as_str()).unwrap_or("");
        if prefix.len() > best_len && model.starts_with(prefix) {
            best_len = prefix.len();
            best = Some(e);
        }
    }
    best
}

/// 一个 5 桶对象 × 价格条目 → USD 费用。`reasoning` 桶存在但不参与计价——它已
/// 含在 `output` 里（折叠侧的校验保证 `output >= reasoning`），再乘一次就是双计。
fn price_bucket(bucket: &Value, entry: &Value) -> f64 {
    let uncached = get_i64(bucket, "uncached_input_tokens") as f64;
    let cached = get_i64(bucket, "cached_input_tokens") as f64;
    let cache_write = get_i64(bucket, "cache_write_input_tokens") as f64;
    let output = get_i64(bucket, "output_tokens") as f64;
    let mut input_cost = uncached * rate(entry, "uncachedInputUsdPerMTok")
        + cached * rate(entry, "cacheReadUsdPerMTok")
        + cache_write * rate(entry, "cacheWrite5mUsdPerMTok");
    let mut output_cost = output * rate(entry, "outputUsdPerMTok");
    let threshold = entry
        .get("longContextThresholdTokens")
        .and_then(|v| v.as_i64())
        .unwrap_or(0);
    // `longContextPriced` 缺省 true：standard 行靠「有 threshold + 有乘数」触发；
    // fast 行显式 `false` → fast + longContext 不乘（catalog 里 fast 行都带这个
    // false，见 codex_pricing.json `_note`）。
    let lc_priced = entry
        .get("longContextPriced")
        .and_then(|v| v.as_bool())
        .unwrap_or(true);
    let input_total = uncached + cached + cache_write;
    if threshold > 0 && input_total > threshold as f64 && lc_priced {
        let lc_in = entry
            .get("longContextInputMultiplierBps")
            .and_then(|v| v.as_i64())
            .unwrap_or(20000) as f64
            / 10000.0;
        let lc_out = entry
            .get("longContextOutputMultiplierBps")
            .and_then(|v| v.as_i64())
            .unwrap_or(15000) as f64
            / 10000.0;
        input_cost *= lc_in;
        output_cost *= lc_out;
    }
    (input_cost + output_cost) / 1e6
}

/// 5 桶对象 → `[i64; 5]`（桶序与 `CODEX_TOKEN_FIELDS` 一致）。
fn bucket_fields(bucket: &Value) -> [i64; 5] {
    let mut out = [0i64; 5];
    for (i, f) in skill_vitals_core::codex_usage::CODEX_TOKEN_FIELDS.iter().enumerate() {
        out[i] = get_i64(bucket, f);
    }
    out
}

fn tokens_object(t: &[i64; 5]) -> Value {
    let mut obj = Map::new();
    for (i, f) in skill_vitals_core::codex_usage::CODEX_TOKEN_FIELDS.iter().enumerate() {
        obj.insert((*f).to_string(), json!(t[i]));
    }
    Value::Object(obj)
}

/// 窗口分钟数 → 人读标签：300→`5h`、10080→`7d`，其余 → `Nmin`。py↔rs 同 spec，
/// 文本渲染逐字节对齐（`codex_cost.py::_window_label` 镜像）。
fn window_label(wm: i64) -> String {
    match wm {
        300 => "5h".to_string(),
        10080 => "7d".to_string(),
        _ => format!("{wm}min"),
    }
}

/// `used_percent` → 人读百分比：固定 3 位小数去尾零（67.0 → 67、67.5 → 67.5）。
/// **不用 Display**——它对小数会走最短表示，与 Python 的 `:g` 在大数/极小值上
/// 分歧；`{:.3}` + 去尾零在两侧完全确定（`codex_cost.py::_pct_text` 镜像）。
fn pct_text(up: f64) -> String {
    let s = format!("{up:.3}");
    let s = s.trim_end_matches('0').trim_end_matches('.').to_string();
    if s.is_empty() { "0".to_string() } else { s }
}

/// plan 块 → 人读一行（None = 无有效套餐，不打印）。数字只格式化不重算——
/// `used_percent` 直接来自日志 rate_limits。与 `codex_cost.py::_plan_line` 逐字节
/// 对齐。
fn plan_line(plan: Option<&Value>) -> Option<String> {
    let plan = plan?.as_object()?;
    let pt = plan.get("plan_type").and_then(|v| v.as_str())?;
    if pt.is_empty() {
        return None;
    }
    let mut parts = vec![format!("{pt}（订阅套餐）")];
    if let Some(limits) = plan.get("limits").and_then(|v| v.as_object()) {
        for (_name, win) in limits {
            let Some(win) = win.as_object() else { continue };
            let Some(up) = win.get("used_percent").and_then(|v| v.as_f64()) else { continue };
            let wm = win.get("window_minutes").and_then(|v| v.as_i64()).unwrap_or(0);
            parts.push(format!("{} {}% 已用", window_label(wm), pct_text(up)));
        }
    }
    Some(parts.join(" · "))
}

/// 折叠结果 × 价格表 → 结构化成本报告。**这是唯一算价格的地方**——人读文本、
/// `--json`、`--html` 都从这里取数，不是三处各算一遍。
///
/// `plan` 是折叠出的配额快照（Value，可为 Null），原样透传到输出——报告不解释
/// 它，展示层自己判「订阅 → 重标价」。
///
/// `None` = 没有任何 token 可计价（空折叠：per_model 空、unpriced 0）。有未计价
/// token 时返回 `Some`（total 0 + unpriced > 0 是「看见了、没价目」的诚实上报）。
///
/// **longContext 判定粒度（踩过的坑）**：LC 阈值（272000）按**单日聚合桶**的
/// `input_total` 判，**不是**按 by_model 合并后的模型总桶。一开始直接对 by_model
/// 的合并桶 `price_bucket`，结果是把「每天都没超阈值」的多天小请求累加成一个假的
/// 大 input_total，凭空触发 LC（8 月两桶合并后 400K 触发 ×2，per_model $5.54 却对
/// 不上 days 之和 $5.5357，守恒测试当场红）。LC 语义是「这一次请求的上下文超窗」——
/// 月总量超窗不代表任何单次请求超窗，合并桶判 LC 是静默多收。修正：**先按
/// (date, model, speed) 逐桶计价**，days 轴直接用逐日价；per_model 轴 = 该模型各
/// 日期价之和 + **untimed 剩余**（by_model − Σ 各日期桶，无日期样本没有日期桶可归，
/// 单独成一个桶计价）。于是全部样本都带日期时 `sum(days.cost) == total_cost_usd`
/// 精确成立（守恒测试钉死），有 untimed 时差异恰好是 untimed 的价——两轴永远对得
/// 上，不会出现两份价格。
pub fn codex_cost_report(
    by_date_model: &Value,
    by_model: &Value,
    unaccounted: &Value,
    plan: &Value,
    pricing: &Value,
) -> Option<Value> {
    let entries = pricing
        .get("entries")
        .and_then(|v| v.as_array())
        .map(|a| a.as_slice())
        .unwrap_or(&[]);
    let bm = by_model.as_object()?;

    // ── Pass 0：日期轴计价 ──────────────────────────────────────────────
    // 同时记下每个 (model, spd) 的「有日期份额」成本与 token，供 per_model 轴求
    // untimed 剩余用。by_date_model 键序 = 折叠的日期升序，days 保持升序。
    let mut dated_cost: HashMap<(String, String), f64> = HashMap::new(); // (model, spd) -> USD 费用（只含有价目桶）
    let mut dated_tokens: HashMap<(String, String), [i64; 5]> = HashMap::new(); // (model, spd) -> [5 桶]
    let mut days: Vec<Value> = Vec::new();
    if let Some(bd) = by_date_model.as_object() {
        for (date, date_map) in bd {
            let Some(date_map) = date_map.as_object() else { continue };
            let mut cost: f64 = 0.0;
            let mut toks: i64 = 0;
            for (model, speeds) in date_map {
                let Some(speeds) = speeds.as_object() else { continue };
                for (spd, bucket) in speeds {
                    let facts = bucket_fields(bucket);
                    for f in &facts {
                        toks += f;
                    }
                    let key = (model.clone(), spd.clone());
                    let dt = dated_tokens.entry(key.clone()).or_insert([0i64; 5]);
                    for (d, f) in dt.iter_mut().zip(facts.iter()) {
                        *d += f;
                    }
                    if let Some(entry) = resolve_entry(model, spd, entries) {
                        let c = price_bucket(bucket, entry);
                        cost += c;
                        *dated_cost.entry(key).or_insert(0.0) += c;
                    }
                }
            }
            days.push(json!({
                "date": date,
                "cost_usd": cost,
                "tokens": toks,
            }));
        }
    }

    // ── Pass 1：per_model / 总价 / 未计价 ──────────────────────────────
    // 遍历顺序 = 折叠的模型首现序（preserve_order 的插入序），与 Python dict 对齐。
    let mut total: f64 = 0.0;
    let mut unpriced: i64 = 0;
    let mut total_tokens = [0i64; 5];
    let mut per_model = Map::new();
    for (model, speeds) in bm {
        let Some(speeds) = speeds.as_object() else { continue };
        let mut tokens = [0i64; 5];
        let mut cost: f64 = 0.0;
        let mut all_priced = true;
        let mut speed_names: Vec<String> = Vec::new();
        for (spd, bucket) in speeds {
            let facts = bucket_fields(bucket);
            for (t, f) in tokens.iter_mut().zip(facts.iter()) {
                *t += f;
            }
            if let Some(entry) = resolve_entry(model, spd, entries) {
                let key = (model.clone(), spd.clone());
                let dated = dated_tokens.get(&key).copied().unwrap_or([0i64; 5]);
                // untimed 剩余 = by_model − Σ 各日期桶（fold 保证逐桶 ≥，不会负）。
                let mut untimed = [0i64; 5];
                for i in 0..5 {
                    untimed[i] = facts[i] - dated[i];
                }
                cost += dated_cost.get(&key).copied().unwrap_or(0.0)
                    + price_bucket(&tokens_object(&untimed), entry);
            } else {
                // 无价目：token 进 unpriced_tokens，诚实上报——绝不按 0 价冒充。
                all_priced = false;
                unpriced += facts.iter().sum::<i64>();
            }
            speed_names.push(spd.clone());
        }
        for (t, f) in total_tokens.iter_mut().zip(tokens.iter()) {
            *t += f;
        }
        total += cost;
        per_model.insert(
            model.clone(),
            json!({
                "tokens": tokens_object(&tokens),
                "cost_usd": cost,
                "priced": all_priced,
                // 模型名下可能挂多个 speed 子桶（真实数据只有 standard）；诚实列出
                // 全部 speed，不挑一个代表。
                "speed": speed_names.join(","),
            }),
        );
    }
    if per_model.is_empty() && unpriced == 0 {
        return None;
    }

    Some(json!({
        "total_cost_usd": total,
        "total_tokens": tokens_object(&total_tokens),
        "per_model": Value::Object(per_model),
        "days": Value::Array(days),
        "unpriced_tokens": unpriced,
        "unaccounted_usage": unaccounted.clone(),
        "plan": plan.clone(),
    }))
}

/// 人读文本：host/月/币种 + 一行总费用 + 每模型一行。纯格式化——数字来自
/// `codex_cost_report` + CLI 的 host/currency/month 包装（`out` 即 `--json` 输出的
/// 同一个 dict），这里不重算。空报告（None）由调用方处理，不打印假的 `$0` 行。
pub fn render_codex_cost(out: &Value) -> String {
    let currency = out
        .get("currency")
        .and_then(|v| v.as_str())
        .unwrap_or("USD");
    let host = out.get("host").and_then(|v| v.as_str());
    let month = out.get("month").and_then(|v| v.as_str());
    let total = out.get("total_cost_usd").and_then(|v| v.as_f64()).unwrap_or(0.0);
    let unpriced = out.get("unpriced_tokens").and_then(|v| v.as_i64()).unwrap_or(0);
    let per_model = out
        .get("per_model")
        .and_then(|v| v.as_object())
        .cloned()
        .unwrap_or_default();
    let tt = out
        .get("total_tokens")
        .and_then(|v| v.as_object())
        .cloned()
        .unwrap_or_default();

    let mut parts = Vec::new();
    if let Some(h) = host {
        parts.push(format!("host: {h}\n"));
    }
    if let Some(m) = month {
        parts.push(format!("month: {m}\n"));
    }
    parts.push(format!("currency: {currency}\n"));
    let plan_line = plan_line(out.get("plan"));
    if let Some(pl) = &plan_line {
        parts.push(format!("plan: {pl}\n"));
    }
    // 5 桶人读只需一个总量；分桶明细在 --json 与仪表盘里。
    let mut all_tokens: i64 = 0;
    for f in skill_vitals_core::codex_usage::CODEX_TOKEN_FIELDS.iter() {
        all_tokens += tt.get(*f).and_then(|x| x.as_i64()).unwrap_or(0);
    }
    // 订阅套餐（plan 存在）时，per-token 美元是「按量标价」不是账单——账单 = 套餐
    // 固定费。诚实标注，别让用户把标价当成实际支出。
    let label = if plan_line.is_some() { "total cost (按量标价)" } else { "total cost" };
    let mut line = format!("{label}: {}", format_usd(total));
    if all_tokens > 0 {
        line += &format!(" · total tokens: {}", format_number(all_tokens));
    }
    parts.push(line + "\n");
    // 按折叠的模型首现序展示（per_model 的插入序即 by_model 序）。
    for (model, entry) in &per_model {
        let cost = entry.get("cost_usd").and_then(|v| v.as_f64()).unwrap_or(0.0);
        let speeds = entry.get("speed").and_then(|v| v.as_str()).unwrap_or("standard");
        if entry.get("priced").and_then(|v| v.as_bool()).unwrap_or(false) {
            parts.push(format!("  {model}  {}  ({speeds})\n", format_usd(cost)));
        } else {
            parts.push(format!("  {model}  unpriced  ({speeds})\n"));
        }
    }
    if unpriced > 0 {
        parts.push(format!("另有 {} tokens 模型未计价\n", format_number(unpriced)));
    }
    let ua = out
        .get("unaccounted_usage")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();
    for e in &ua {
        let t = e.get("type").and_then(|v| v.as_str()).unwrap_or("?");
        let c = e.get("count").and_then(|v| v.as_i64()).unwrap_or(0);
        let s = e.get("tokens_seen").and_then(|v| v.as_i64()).unwrap_or(0);
        parts.push(format!("未接住 {c} × {t}（看见 {} tokens）\n", format_number(s)));
    }
    parts.concat()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn entry(model_prefix: &str, speed: &str) -> Value {
        json!({
            "modelPrefix": model_prefix,
            "speed": speed,
            "uncachedInputUsdPerMTok": "5",
            "cacheReadUsdPerMTok": "0.5",
            "cacheWrite5mUsdPerMTok": "6.25",
            "cacheWrite1hUsdPerMTok": "10",
            "outputUsdPerMTok": "30",
            "usInferenceMultiplierBps": 10000,
            "longContextThresholdTokens": 272000,
            "longContextInputMultiplierBps": 20000,
            "longContextOutputMultiplierBps": 15000,
        })
    }

    #[test]
    fn resolve_entry_longest_prefix_wins() {
        let entries = serde_json::from_str::<Value>(r#"[
            {"modelPrefix":"gpt-5.6","speed":"standard"},
            {"modelPrefix":"gpt-5.6-sol","speed":"standard"}
        ]"#).unwrap();
        let arr = entries.as_array().unwrap();
        let r = resolve_entry("gpt-5.6-sol", "standard", arr).unwrap();
        assert_eq!(r["modelPrefix"], "gpt-5.6-sol");
        let r = resolve_entry("gpt-5.6-terra", "standard", arr).unwrap();
        assert_eq!(r["modelPrefix"], "gpt-5.6");
        // speed 不匹配 → None
        assert!(resolve_entry("gpt-5.6-sol", "fast", arr).is_none());
        // 无条目 → None（unpriced）
        assert!(resolve_entry("codex-auto-review", "standard", arr).is_none());
    }

    #[test]
    fn price_bucket_basic_and_cache_write_goes_to_5m() {
        let e = entry("gpt-5.6-sol", "standard");
        // input_total 必须低于 272000 阈值，否则 longContext 触发——本测试只钉
        // cache_write 进 5m 档 + reasoning 不叠加，不测 longContext。
        let bucket = json!({
            "uncached_input_tokens": 100000,
            "output_tokens": 50000,
            "cached_input_tokens": 100000,
            "cache_write_input_tokens": 50000,
            "reasoning_output_tokens": 5000,
        });
        // input = 0.1M·5 + 0.1M·0.5 + 0.05M·6.25 = 0.5 + 0.05 + 0.3125 = 0.8625
        // output = 0.05M·30 = 1.5   (reasoning 已含，不再叠加)
        // total = 2.3625 USD
        let cost = price_bucket(&bucket, &e);
        assert!((cost - 2.3625).abs() < 1e-9, "got {cost}");
    }

    #[test]
    fn price_bucket_long_context_multiplies_all_input() {
        let e = entry("gpt-5.6-sol", "standard");
        // input_total 超过 272000 阈值 → input 全桶 ×2、output ×1.5。
        let bucket = json!({
            "uncached_input_tokens": 300000,
            "output_tokens": 100000,
            "cached_input_tokens": 50000,
            "cache_write_input_tokens": 0,
            "reasoning_output_tokens": 0,
        });
        // input = (0.3M·5 + 0.05M·0.5) ·2 = (1.5 + 0.025)·2 = 3.05
        // output = 0.1M·30 ·1.5 = 3·1.5 = 4.5
        // total = 7.55
        let cost = price_bucket(&bucket, &e);
        assert!((cost - 7.55).abs() < 1e-9, "got {cost}");
        // 同样比例但低于阈值（input_total 150000 < 272000）：input 不乘 → 0.525 + 3。
        let small = json!({
            "uncached_input_tokens": 100000,
            "output_tokens": 100000,
            "cached_input_tokens": 50000,
            "cache_write_input_tokens": 0,
            "reasoning_output_tokens": 0,
        });
        let cost = price_bucket(&small, &e);
        assert!((cost - 3.525).abs() < 1e-9, "got {cost}");
    }

    #[test]
    fn price_bucket_long_context_priced_false_skips() {
        // fast 行显式 longContextPriced:false → 即使超阈值也不乘。
        let mut e = entry("gpt-5.6-sol", "fast");
        e.as_object_mut().unwrap().insert("longContextPriced".into(), json!(false));
        let bucket = json!({
            "uncached_input_tokens": 500000,
            "output_tokens": 100000,
            "cached_input_tokens": 0,
            "cache_write_input_tokens": 0,
            "reasoning_output_tokens": 0,
        });
        let cost = price_bucket(&bucket, &e);
        // 不过 fast 价格是 10/1/…，这里 entry() 硬编码 standard 价，只测乘数不触发：
        // (0.5M·5 + 0.1M·30)/1e6 = 2.5+3 = 5.5
        assert!((cost - 5.5).abs() < 1e-9, "got {cost}");
    }

    #[test]
    fn report_prices_by_model_and_days_and_reconciles() {
        let by_model = json!({
            "gpt-5.6-sol": {
                "standard": {
                    "uncached_input_tokens": 1000000,
                    "output_tokens": 100000,
                    "cached_input_tokens": 500000,
                    "cache_write_input_tokens": 200000,
                    "reasoning_output_tokens": 10000,
                }
            }
        });
        let by_date_model = json!({
            "2026-08-05": {
                "gpt-5.6-sol": {
                    "standard": {
                        "uncached_input_tokens": 600000,
                        "output_tokens": 60000,
                        "cached_input_tokens": 300000,
                        "cache_write_input_tokens": 120000,
                        "reasoning_output_tokens": 6000,
                    }
                }
            },
            "2026-08-06": {
                "gpt-5.6-sol": {
                    "standard": {
                        "uncached_input_tokens": 400000,
                        "output_tokens": 40000,
                        "cached_input_tokens": 200000,
                        "cache_write_input_tokens": 80000,
                        "reasoning_output_tokens": 4000,
                    }
                }
            }
        });
        let pricing = load_codex_pricing();
        let report = codex_cost_report(&by_date_model, &by_model, &json!([]), &json!(null), &pricing).unwrap();
        // by_date 之和 == by_model → 总价与 days 之和精确相等（守恒）。
        let total = report["total_cost_usd"].as_f64().unwrap();
        let mut day_sum = 0.0;
        for d in report["days"].as_array().unwrap() {
            day_sum += d["cost_usd"].as_f64().unwrap();
        }
        assert!((total - day_sum).abs() < 1e-9);
        let pm = &report["per_model"]["gpt-5.6-sol"];
        assert!(pm["priced"].as_bool().unwrap());
        assert_eq!(pm["speed"], "standard");
        // 1.7M input_total 超过 272000 → longContext 触发：
        // input 6.5e6·2 = 13e6、output 3e6·1.5 = 4.5e6 → 17.5 USD。
        assert!((pm["cost_usd"].as_f64().unwrap() - 17.5).abs() < 1e-9);
        assert_eq!(report["days"].as_array().unwrap().len(), 2);
        assert!(report["days"].as_array().unwrap()[0]["date"].as_str() == Some("2026-08-05"));
    }

    #[test]
    fn report_prices_per_day_bucket_not_merged_model_bucket() {
        // 回归（真实 defect）：LC 判定粒度必须是单日桶，不是 by_model 合并桶。两个
        // 日期各自 input_total 200000 < 272000（都不触发 LC），但合并成模型桶后
        // input_total 400000 > 272000。旧实现直接对 by_model 合并桶计价 → 凭空触发
        // LC ×2（4.10 变 6.70），per_model 价高于 days 之和且守恒测试当场红。修正后
        // per_model = Σ 各日期价（无 untimed 时）→ 两边精确相等。
        let day_bucket = json!({
            "uncached_input_tokens": 100000,
            "output_tokens": 50000,
            "cached_input_tokens": 100000,
            "cache_write_input_tokens": 0,
            "reasoning_output_tokens": 0,
        });
        let by_model = json!({
            "gpt-5.6-sol": { "standard": {
                "uncached_input_tokens": 200000,
                "output_tokens": 100000,
                "cached_input_tokens": 200000,
                "cache_write_input_tokens": 0,
                "reasoning_output_tokens": 0,
            } }
        });
        let by_date_model = json!({
            "2026-08-01": { "gpt-5.6-sol": { "standard": day_bucket.clone() } },
            "2026-08-02": { "gpt-5.6-sol": { "standard": day_bucket } },
        });
        let pricing = load_codex_pricing();
        let report = codex_cost_report(&by_date_model, &by_model, &json!([]), &json!(null), &pricing).unwrap();
        let total = report["total_cost_usd"].as_f64().unwrap();
        let mut day_sum = 0.0;
        for d in report["days"].as_array().unwrap() {
            day_sum += d["cost_usd"].as_f64().unwrap();
        }
        assert!((total - day_sum).abs() < 1e-9, "total {total} != days {day_sum}");
        // 每天 input = (0.1M·5 + 0.1M·0.5)/1M = 0.55，output = 0.05M·30/1M = 1.5
        // → 2.05，两天 4.10。合并桶判 LC 的错误价 6.70 绝不能出现。
        assert!((total - 4.10).abs() < 1e-9, "got {total}");
        assert_eq!(report["days"].as_array().unwrap().len(), 2);
    }

    #[test]
    fn report_prices_untimed_remainder_as_its_own_bucket() {
        // by_model 比 by_date_model 多出 untimed 份额（无日期样本被日期轴按设计丢弃）
        // → per_model = 各日期价 + untimed 剩余单独成桶的价；total == sum(days) +
        // untimed 价精确成立。两个桶各自 input_total 200000 < 272000，谁都不触发 LC
        // ——若对合并后的模型桶（400000）判 LC，dated+untimed 都会被多收。
        let by_model = json!({
            "gpt-5.6-sol": { "standard": {
                "uncached_input_tokens": 200000,
                "output_tokens": 100000,
                "cached_input_tokens": 200000,
                "cache_write_input_tokens": 0,
                "reasoning_output_tokens": 0,
            } }
        });
        let by_date_model = json!({
            "2026-08-01": { "gpt-5.6-sol": { "standard": {
                "uncached_input_tokens": 100000,
                "output_tokens": 50000,
                "cached_input_tokens": 100000,
                "cache_write_input_tokens": 0,
                "reasoning_output_tokens": 0,
            } } }
        });
        let pricing = load_codex_pricing();
        let report = codex_cost_report(&by_date_model, &by_model, &json!([]), &json!(null), &pricing).unwrap();
        let total = report["total_cost_usd"].as_f64().unwrap();
        let day_sum = report["days"].as_array().unwrap()[0]["cost_usd"].as_f64().unwrap();
        // dated 2.05 + untimed 2.05 = 4.10；days 只有 2.05 → 差 2.05 == untimed 价。
        assert!((total - 4.10).abs() < 1e-9, "got {total}");
        assert!((total - day_sum - 2.05).abs() < 1e-9, "conservation with untimed broken");
    }

    #[test]
    fn report_unpriced_model_surfaces_honestly() {
        let by_model = json!({
            "codex-auto-review": {
                "standard": {
                    "uncached_input_tokens": 5000,
                    "output_tokens": 100,
                    "cached_input_tokens": 0,
                    "cache_write_input_tokens": 0,
                    "reasoning_output_tokens": 0,
                }
            }
        });
        let pricing = load_codex_pricing();
        let report = codex_cost_report(&json!({}), &by_model, &json!([]), &json!(null), &pricing).unwrap();
        assert_eq!(report["total_cost_usd"], 0.0);
        assert_eq!(report["unpriced_tokens"], 5100);
        let pm = &report["per_model"]["codex-auto-review"];
        assert_eq!(pm["priced"], false);
    }

    #[test]
    fn report_none_when_nothing_to_price() {
        let pricing = load_codex_pricing();
        assert_eq!(codex_cost_report(&json!({}), &json!({}), &json!([]), &json!(null), &pricing), None);
    }

    #[test]
    fn format_usd_spec() {
        assert_eq!(format_usd(9.5), "$9.5");
        assert_eq!(format_usd(0.0964), "$0.1");
        assert_eq!(format_usd(123.4), "$123.4");
        assert_eq!(format_usd(1234.0), "$1234");
        assert_eq!(format_usd(22.38), "$22.38");
        assert_eq!(format_usd(12.0), "$12");
    }

    #[test]
    fn window_label_and_pct_text_are_deterministic() {
        assert_eq!(window_label(300), "5h");
        assert_eq!(window_label(10080), "7d");
        assert_eq!(window_label(60), "60min");
        // `:g`/Display 在大数/极小值上会分歧——`{:.3}`+去尾零两侧确定。
        assert_eq!(pct_text(67.0), "67");
        assert_eq!(pct_text(67.5), "67.5");
        assert_eq!(pct_text(11.0), "11");
        assert_eq!(pct_text(0.0), "0");
    }

    #[test]
    fn plan_line_formats_subscription_and_limits() {
        let plan = json!({
            "plan_type": "plus",
            "has_credits": false,
            "limits": {
                "primary": {"used_percent": 67.0, "window_minutes": 300, "resets_at": 1787858552},
                "secondary": {"used_percent": 11.0, "window_minutes": 10080, "resets_at": 1788351817}
            },
            "observed_at": "2026-08-19T..."
        });
        assert_eq!(
            plan_line(Some(&plan)),
            Some("plus（订阅套餐） · 5h 67% 已用 · 7d 11% 已用".to_string())
        );
        // 无有效 plan_type → None（不打印）；null/缺键同款。
        assert_eq!(plan_line(Some(&json!({"plan_type": ""}))), None);
        assert_eq!(plan_line(Some(&json!(null))), None);
        assert_eq!(plan_line(None), None);
    }

    #[test]
    fn report_passes_plan_through() {
        let by_model = json!({
            "gpt-5.6-sol": {
                "standard": {
                    "uncached_input_tokens": 1000,
                    "output_tokens": 500,
                    "cached_input_tokens": 0,
                    "cache_write_input_tokens": 0,
                    "reasoning_output_tokens": 0,
                }
            }
        });
        let plan = json!({"plan_type": "plus", "has_credits": false, "observed_at": "2026-08-19T..."});
        let pricing = load_codex_pricing();
        let report = codex_cost_report(&json!({}), &by_model, &json!([]), &plan, &pricing).unwrap();
        // plan 原样透传，不解释。
        assert_eq!(report["plan"], plan);
        // 没有 plan 时 → null（而非缺失）。
        let r2 = codex_cost_report(&json!({}), &by_model, &json!([]), &json!(null), &pricing).unwrap();
        assert!(r2["plan"].is_null());
    }

    #[test]
    fn render_relabels_total_as_按量标价_when_plan_present() {
        let plan = json!({
            "plan_type": "plus",
            "limits": {"primary": {"used_percent": 67.0, "window_minutes": 300, "resets_at": 0}},
            "observed_at": "2026-08-19T..."
        });
        let out = json!({
            "host": "codex",
            "currency": "USD",
            "month": "2026-08",
            "total_cost_usd": 5.54,
            "total_tokens": {"uncached_input_tokens": 1000000, "output_tokens": 0,
                             "cached_input_tokens": 0, "cache_write_input_tokens": 0,
                             "reasoning_output_tokens": 0},
            "per_model": {},
            "plan": plan,
        });
        let text = render_codex_cost(&out);
        assert!(text.contains("plan: plus（订阅套餐） · 5h 67% 已用"));
        assert!(text.contains("total cost (按量标价): $5.54"));
        // 无 plan → 旧标签。
        let out2 = json!({
            "host": "codex", "currency": "USD", "total_cost_usd": 1.0,
            "total_tokens": {"uncached_input_tokens": 1000, "output_tokens": 0,
                             "cached_input_tokens": 0, "cache_write_input_tokens": 0,
                             "reasoning_output_tokens": 0},
            "per_model": {}, "plan": null,
        });
        let text2 = render_codex_cost(&out2);
        assert!(text2.contains("total cost: $1"));
        assert!(!text2.contains("按量标价"));
    }
}
