//! CLI 显示层的成本块 —— 把 usage 报告变成人读的费用行。
//!
//! 纯展示层，不做任何折叠（折叠在 core 的 `usage::token_by_model`，`peak_*`
//! 子桶已经按每笔请求自己的 `time` 精确标出高峰时段）：这里只把
//! `{by_model, sequence}` × 价格表（`pricing.json`）变成一组字符串，off-peak
//! 份额（全量 − peak）按空闲价、peak 份额按高峰价，加总成**一个真实发生的
//! 费用**——不再是旧版本那种「给空闲价和高峰价两个数，猜不出实际该按哪个
//! 算」的区间估算。与 `scripts/agent_vitals/agent/cost.py` 逐字节一致，由
//! `tests/test_cli_matrix.py` 的 `both()` 差分看守。
//!
//! 价格表的单一真相源是 `scripts/agent_vitals/pricing.json`（这里 `include_str!`
//! 内嵌、Python 侧读包内文件；`dsh-client/client.js` 因浏览器限制内嵌自己的
//! PRICING，lockstep 测试对齐）。缓存写入报价表没有行 → 按 0 计（不臆造价格）。
//! 高峰时段为北京时间**周一至周五** 9–12、14–18 点，周末全天空闲；空闲价
//! = 高峰价的一半。

use serde_json::Value;

const PRICING_JSON: &str = include_str!("../../scripts/agent_vitals/pricing.json");

pub fn load_pricing() -> Value {
    serde_json::from_str(PRICING_JSON).unwrap_or_else(|_| Value::Object(Default::default()))
}

fn strip_zero(x: f64) -> String {
    let s = format!("{:.1}", x);
    if s.ends_with(".0") {
        s[..s.len() - 2].to_string()
    } else {
        s
    }
}

/// token 数 → 人类可读：226423948 → 226.4M。与 tab 的 formatNumber 同 spec。
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

/// 金额 → `¥774.7` / `¥22.38` / `¥6.73`。≥100 一位小数否则两位，去尾零。
fn format_money(x: f64) -> String {
    let s = if x >= 100.0 { format!("{:.1}", x) } else { format!("{:.2}", x) };
    let s = s.trim_end_matches('0').trim_end_matches('.').to_string();
    format!("¥{}", s)
}

/// 某个供应商的模型表。找不到该供应商返回 None。
fn models_of<'a>(pricing: &'a Value, provider: &str) -> Option<&'a serde_json::Map<String, Value>> {
    pricing
        .pointer(&format!("/providers/{provider}/models"))
        .and_then(|v| v.as_object())
}

/// `deepseek/deepseek-v4-pro-0813` → 价格卡键 `deepseek-v4-pro`，在**指定供应商
/// 的表里**匹配；匹配不上返回 None（不臆造）。
fn norm_model_in(model: &str, cards: &serde_json::Map<String, Value>) -> Option<String> {
    let seg = model.rsplit('/').next().unwrap_or(model);
    for key in cards.keys() {
        if seg == key || seg.starts_with(key.as_str()) {
            return Some(key.clone());
        }
    }
    None
}

/// 计价依据：用了这个供应商自己的报价，还是回落到原厂报价。
/// **必须透出到展示层**——按别家的价估出来的数字，不说清楚就是在冒充实价。
#[derive(Clone, Copy, PartialEq)]
enum Basis {
    Provider,
    Fallback,
    /// 同一模型在本会话里被多家供应商服务过，无法判断哪些 token 属于哪家。
    /// 仍按原厂报价给一个估算（用户要的是"有个数"而不是一片空白），但**依据
    /// 与 Fallback 不同**：那边是"这家没报价"，这边是"报价有、归属不明"，
    /// 文案不能共用一句。
    Ambiguous,
}

/// 解析出该 (供应商, 模型) 实际适用的价格卡。
///
/// 顺序：该供应商自己的表 → 回落到 `fallback_provider`（原厂）的同名模型 →
/// 都没有才算未计价。**回落是有意的默认行为**：供应商没报价时给一个标注了
/// 来源的估算，比什么都不给有用；但它必须带着 `Basis::Fallback` 一路传到
/// 展示层，由展示层写明「按原厂报价估算」。
fn resolve_card(model: &str, provider: Option<&str>, pricing: &Value) -> Option<(String, String, Basis)> {
    // 归属不明：哨兵不是真实供应商名，查不到它的表，会一路掉到回落分支。
    // 单独认出来是为了让展示层说对话——也顺带保证这个内部哨兵**永远不会**
    // 被当成供应商名渲染给用户看。
    let ambiguous = provider == Some(agent_vitals_core::usage::AMBIGUOUS_PROVIDER);
    if let Some(p) = provider.filter(|_| !ambiguous) {
        if let Some(cards) = models_of(pricing, p) {
            if let Some(key) = norm_model_in(model, cards) {
                return Some((key, p.to_string(), Basis::Provider));
            }
        }
    }
    let fb = pricing.get("fallback_provider").and_then(|v| v.as_str())?;
    let cards = models_of(pricing, fb)?;
    let key = norm_model_in(model, cards)?;
    Some((key, fb.to_string(), if ambiguous { Basis::Ambiguous } else { Basis::Fallback }))
}

fn model_short(model: &str, pricing: &Value) -> String {
    let fb = pricing.get("fallback_provider").and_then(|v| v.as_str()).unwrap_or("");
    if let Some(cards) = models_of(pricing, fb) {
        if let Some(key) = norm_model_in(model, cards) {
            return key;
        }
    }
    model.rsplit('/').next().unwrap_or(model).chars().take(24).collect()
}

fn get_i64(v: &Value, key: &str) -> i64 {
    v.get(key).and_then(|x| x.as_i64()).unwrap_or(0)
}

/// 一个模型桶算出来的三个数：真实总价、其中高峰份额的价、其中缓存命中
/// （cache_read）那部分单独的价——三者不是三个独立的桶，`cache_read_cost`
/// 已经算在 `total` 里，是 `total` 内部的一个可见切面（想知道"缓存命中帮我
/// 省了多少钱"得靠它，不是靠 total 单独一个数能看出来的）。
struct Price {
    total: f64,
    peak: f64,
    cache_read_cost: f64,
}

/// 把每种 token 类型拆成高峰份额（`peak_*`）和空闲份额（全量 − `peak_*`），
/// 各按各自单价计价再相加——不是「全量按空闲价」和「全量按高峰价」两个
/// 假设性区间。
fn bucket_price(buckets: &Value, model_key: &str, provider_key: &str, pricing: &Value) -> Option<Price> {
    let card = pricing.pointer(&format!("/providers/{provider_key}/models/{model_key}"))?;
    let get = |key: &str| get_i64(buckets, key) as f64 / 1e6;
    let u_peak = get("peak_uncached_input_tokens");
    let c_peak = get("peak_cache_read_tokens");
    let o_peak = get("peak_output_tokens");
    let u_off = get("uncached_input_tokens") - u_peak;
    let c_off = get("cache_read_tokens") - c_peak;
    let o_off = get("output_tokens") - o_peak;
    let rate = |path: &str| card.pointer(path).and_then(|v| v.as_f64()).unwrap_or(0.0);
    let cache_read_cost = rate("/input_cached/off_peak") * c_off + rate("/input_cached/peak") * c_peak;
    let off = rate("/input_uncached/off_peak") * u_off + rate("/input_cached/off_peak") * c_off
        + rate("/output/off_peak") * o_off;
    let peak = rate("/input_uncached/peak") * u_peak + rate("/input_cached/peak") * c_peak
        + rate("/output/peak") * o_peak;
    Some(Price { total: off + peak, peak, cache_read_cost })
}

/// usage 报告 × 价格表 → 结构化成本数据。**这是唯一算价格的地方**——
/// `cost_block`（人读文本）与 `--json` 的 `cost` 键都从这里取数，不是两处
/// 各算一遍再凑成两种格式。之前 `cost` 完全没有 JSON 出口：想拿这份数字只能
/// 手写脚本重新调 `_price`/`load_pricing`，算一次就要重新验证一次是否用对了
/// 价格表——现在报告数据里的 `cost` 字段和人读文本走的是同一次计算。
///
/// 无任何可分桶的桶且没有未计价 token 时返回 `None`（与 `cost_block` 的空
/// 列表同一语义：没有数据就是没有，不摆一个全零的结构出来）。金额是未四舍
/// 五入的原始浮点——舍入是格式化文本时才做的展示决定，结构化数据不预先舍。
pub fn cost_report(usage: &Value, pricing: &Value) -> Option<Value> {
    let by_model = usage.get("by_model").and_then(|v| v.as_object())?;
    let providers = usage.get("providers").and_then(|v| v.as_object());
    let mut total: f64 = 0.0;
    let mut peak_total: f64 = 0.0;
    let mut unpriced: i64 = 0;
    let mut per_model = serde_json::Map::new();
    for (model, buckets) in by_model {
        // 价目表**按供应商分层**，不是按模型名一张表打天下。真实日志里
        // provider=shengsuanyun 的 pro 和 provider=deepseek-official 的 flash
        // 并存，两家报价不同（胜算云 DeepSeek 线路缓存读 0.15、Ali 线路 0.45）。
        //
        // 解析顺序见 resolve_card：该供应商自己的表 → 回落原厂 → 未计价。
        // **回落是有意的默认**：供应商没报价时给一个标注了来源的估算，比什么
        // 都不给有用；但依据必须一路传到展示层写明「按原厂报价估算」，否则就是
        // 拿别家的价冒充实价。
        //
        // provider 为 Null（老日志没上报）或该模型没留下 header 时按 None 处理，
        // resolve_card 自然回落到原厂——与老日志的既有行为一致。
        let provider = providers
            .and_then(|m| m.get(model))
            .and_then(|v| v.as_str());
        match resolve_card(model, provider, pricing) {
            Some((key, provider_key, basis)) => {
                if let Some(p) = bucket_price(buckets, &key, &provider_key, pricing) {
                    total += p.total;
                    peak_total += p.peak;
                    per_model.insert(
                        model.clone(),
                        serde_json::json!({
                            "short_name": model_short(model, pricing),
                            // 供应商随每一行一起给出：同一会话可能横跨两家，
                            // 只给模型名的话这张表跟任何一家的账单都对不上。
                            // 归属不明时 provider 落 Null——`__ambiguous__` 是
                            // 内部哨兵，绝不能作为供应商名渲染给用户看。
                            "provider": if basis == Basis::Ambiguous {
                                Value::Null
                            } else {
                                provider.map(Value::from).unwrap_or(Value::Null)
                            },
                            // 这一行是按谁的报价算的。非 provider 时展示层必须说明依据。
                            "pricing_basis": match basis {
                                Basis::Provider => "provider",
                                Basis::Fallback => "fallback",
                                Basis::Ambiguous => "ambiguous",
                            },
                            "priced_with": provider_key,
                            "total": p.total,
                            "peak": p.peak,
                            "cache_read_cost": p.cache_read_cost,
                        }),
                    );
                }
            }
            None => {
                unpriced += get_i64(buckets, "uncached_input_tokens")
                    + get_i64(buckets, "cache_read_tokens")
                    + get_i64(buckets, "cache_write_tokens");
            }
        }
    }
    if per_model.is_empty() && unpriced == 0 {
        return None;
    }
    Some(serde_json::json!({
        "currency": "CNY",
        "estimate_disclaimer": "估算值，不是账单",
        "total": total,
        "peak_total": peak_total,
        "per_model": Value::Object(per_model),
        "unpriced_tokens": unpriced,
    }))
}

/// usage 报告 → 成本行列表；无任何可分桶的桶时返回空列表（与 tab 空态同构，
/// 不打印假的 ¥0 行）。纯格式化——数字来自 `cost_report`，这里不重算。
pub fn cost_block(usage: &Value, pricing: &Value) -> Vec<String> {
    let Some(report) = cost_report(usage, pricing) else { return vec![] };
    let total = report["total"].as_f64().unwrap_or(0.0);
    let peak_total = report["peak_total"].as_f64().unwrap_or(0.0);
    let unpriced = report["unpriced_tokens"].as_i64().unwrap_or(0);
    let per_model_map = report["per_model"].as_object().cloned().unwrap_or_default();

    let seq: Vec<Value> = usage.get("sequence").and_then(|v| v.as_array()).cloned().unwrap_or_default();
    let mut line = format!("费用（估算）≈ {}", format_money(total));
    if peak_total > 0.0 {
        line += &format!("（其中高峰时段 {}）", format_money(peak_total));
    }
    if seq.len() == 1 {
        if let Some(m) = seq[0].as_str() {
            line += &format!(" · {}", model_short(m, pricing));
        }
    } else if seq.len() > 1 {
        let names: Vec<String> = seq
            .iter()
            .filter_map(|v| v.as_str())
            .map(|m| model_short(m, pricing))
            .collect();
        line += &format!(" · 中途切换模型（{}）", names.join(" → "));
    }
    let mut rows = vec![line];
    // per_model 的展示顺序必须跟 by_model 的原始遍历顺序一致——serde_json 开了
    // preserve_order，Map 迭代序即插入序，与 Python dict 的插入序天然对齐。
    if per_model_map.len() > 1 {
        if let Some(by_model) = usage.get("by_model").and_then(|v| v.as_object()) {
            for model in by_model.keys() {
                if let Some(entry) = per_model_map.get(model) {
                    let label = entry["short_name"].as_str().unwrap_or(model);
                    let t = entry["total"].as_f64().unwrap_or(0.0);
                    rows.push(format!("  {}  {}", label, format_money(t)));
                }
            }
        }
    }
    if unpriced > 0 {
        rows.push(format!("另有 {} tokens 模型未知未计价", format_number(unpriced)));
    }
    rows
}

#[cfg(test)]
mod tests {
    use super::*;

    /// 与 cost.py 对同一份真实 usage 报告的输出逐字节一致（差分由 cli_matrix 补）。
    /// 桶里没有 peak_* 键（老形状/手写夹具）→ 缺省 0，全部按空闲价计——真实总价
    /// 正好等于旧版本的「空闲」栏数字，高峰栏直接消失（peak_total == 0）。
    #[test]
    fn cost_block_real_session_report() {
        let usage = serde_json::from_str(
            r#"{"by_model":{"deepseek/deepseek-v4-pro-0813":{"uncached_input_tokens":165754353,"output_tokens":467981,"cache_read_tokens":642944,"cache_write_tokens":0},"deepseek/deepseek-v4-flash":{"uncached_input_tokens":14823001,"output_tokens":30754,"cache_read_tokens":69376,"cache_write_tokens":0}},"sequence":["deepseek/deepseek-v4-pro-0813","deepseek/deepseek-v4-flash","deepseek/deepseek-v4-pro-0813"]}"#,
        ).unwrap();
        let pricing = load_pricing();
        let rows = cost_block(&usage, &pricing);
        let expected: Vec<String> = [
            "费用（估算）≈ ¥774.7 · 中途切换模型（deepseek-v4-pro → deepseek-v4-flash → deepseek-v4-pro）",
            "  deepseek-v4-pro  ¥752.3",
            "  deepseek-v4-flash  ¥22.38",
        ].iter().map(|s| s.to_string()).collect();
        assert_eq!(rows, expected);
    }

    /// 桶里带 peak_* 且非零：真实总价是「空闲份额×空闲价 + 高峰份额×高峰价」，
    /// 不是全量分别乘两个价。全部输入都在高峰（peak_uncached_input_tokens ==
    /// uncached_input_tokens）时，总价应等于全量按高峰价计——不多不少。
    #[test]
    fn cost_block_splits_peak_and_off_peak_shares() {
        let usage = serde_json::from_str(
            r#"{"by_model":{"deepseek-v4-pro":{"uncached_input_tokens":1000000,"output_tokens":0,"cache_read_tokens":0,"cache_write_tokens":0,"peak_uncached_input_tokens":1000000,"peak_output_tokens":0,"peak_cache_read_tokens":0,"peak_cache_write_tokens":0}},"sequence":["deepseek-v4-pro"]}"#,
        ).unwrap();
        let pricing = load_pricing();
        let rows = cost_block(&usage, &pricing);
        // 100 万输入 tokens 全落峰值 → 9.0 元/百万 tokens 高峰价，整份按高峰算。
        assert_eq!(rows[0], "费用（估算）≈ ¥9（其中高峰时段 ¥9） · deepseek-v4-pro");
    }

    /// `cost_report` 是 `cost_block` 现在唯一的数字来源——这条钉住结构化输出
    /// 本身，跟 `cost_block_real_session_report` 用同一份 usage，两条测试的
    /// 数字必须能对上（¥774.7 = 752.3+22.38 四舍五入误差内）。
    #[test]
    fn cost_report_structured_shape() {
        let usage = serde_json::from_str(
            r#"{"by_model":{"deepseek/deepseek-v4-pro-0813":{"uncached_input_tokens":165754353,"output_tokens":467981,"cache_read_tokens":642944,"cache_write_tokens":0},"deepseek/deepseek-v4-flash":{"uncached_input_tokens":14823001,"output_tokens":30754,"cache_read_tokens":69376,"cache_write_tokens":0}},"sequence":["deepseek/deepseek-v4-pro-0813","deepseek/deepseek-v4-flash","deepseek/deepseek-v4-pro-0813"]}"#,
        ).unwrap();
        let pricing = load_pricing();
        let report = cost_report(&usage, &pricing).expect("should have priceable data");
        assert_eq!(report["currency"], "CNY");
        assert_eq!(report["unpriced_tokens"], 0);
        let total = report["total"].as_f64().unwrap();
        assert!((total - 774.7).abs() < 0.05, "total should be ~774.7, got {total}");
        let pro = &report["per_model"]["deepseek/deepseek-v4-pro-0813"];
        assert_eq!(pro["short_name"], "deepseek-v4-pro");
        assert!((pro["total"].as_f64().unwrap() - 752.3).abs() < 0.05);
        // 642944 cache_read tokens，无 peak_* 键（老形状）→ 全部按空闲价
        // 0.15/百万计：642944/1e6 * 0.15 ≈ 0.0964。
        assert!((pro["cache_read_cost"].as_f64().unwrap() - 0.0964).abs() < 0.001);
    }

    /// cache_read_cost 是 total 内部的一个切面，不是另一个独立的桶——精确输入
    /// （100 万 cache_read tokens，其余为 0）下，cache_read_cost 应该等于 total。
    #[test]
    fn cost_report_cache_read_cost_is_isolated_from_other_token_types() {
        let usage = serde_json::json!({
            "by_model": {"deepseek-v4-pro": {
                "uncached_input_tokens": 0, "output_tokens": 0,
                "cache_read_tokens": 1000000, "cache_write_tokens": 0,
            }},
            "sequence": ["deepseek-v4-pro"],
        });
        let pricing = load_pricing();
        let report = cost_report(&usage, &pricing).unwrap();
        let pro = &report["per_model"]["deepseek-v4-pro"];
        // 100 万 cache_read tokens 全部空闲价：0.15 元/百万。
        assert_eq!(pro["cache_read_cost"].as_f64().unwrap(), 0.15);
        assert_eq!(pro["total"].as_f64().unwrap(), 0.15);
    }

    /// 没有任何可分桶的桶、也没有未计价 token → None，不是一个全零的结构。
    #[test]
    fn cost_report_none_when_nothing_to_price() {
        let usage = serde_json::json!({"by_model": {}, "sequence": []});
        let pricing = load_pricing();
        assert_eq!(cost_report(&usage, &pricing), None);
    }

    /// 未知模型：不进 per_model，token 数进 unpriced_tokens，不臆造价格。
    #[test]
    fn cost_report_unknown_model_is_unpriced_not_zero_priced() {
        let usage = serde_json::json!({
            "by_model": {"some/unknown-model": {"uncached_input_tokens": 1000, "output_tokens": 10, "cache_read_tokens": 0, "cache_write_tokens": 0}},
            "sequence": ["some/unknown-model"],
        });
        let pricing = load_pricing();
        let report = cost_report(&usage, &pricing).unwrap();
        assert_eq!(report["per_model"].as_object().unwrap().len(), 0);
        assert_eq!(report["unpriced_tokens"], 1000);
    }

    #[test]
    fn format_number_and_money_spec() {
        assert_eq!(format_number(226423948), "226.4M");
        assert_eq!(format_number(685754), "685.8K");
        assert_eq!(format_number(50073856), "50.1M");
        assert_eq!(format_number(999), "999");
        assert_eq!(format_money(774.7), "¥774.7");
        assert_eq!(format_money(1638.88), "¥1638.9");
        assert_eq!(format_money(22.38), "¥22.38");
        assert_eq!(format_money(12.0), "¥12");
    }
}
