//! v0.9.1 Phase 3.1：`usage_facts` → 各宿主计价函数期望的日/月/小时桶
//! `Value` 形状——SQL 权威库版的 `store::dsh_days_map`（那份是旧
//! `index.sqlite3`/`facts` 表的实现，本模块是同一形状对着新
//! `agent-vitals.sqlite3`/`usage_facts` 表重做，字段名与时间列类型都变了，
//! 不能共用查询字符串，但输出形状刻意保持一致——下游 `domain::cost::
//! {month_cost,priced_day,bucket_cost}`/`hosts::codex_usage::{codex_by_model_
//! from_hours,codex_aggregate_hours}`/`sessions::codex_cost::codex_cost_report`/
//! `domain::cost::claude_day_cost` 全部不知道数字是从 JSONL 折叠出来的还是从
//! SQL 聚合出来的，这正是"只有一套计价规则"纪律的落地方式（CLAUDE.md
//! 「不长第四份拷贝」）。
//!
//! **北京日/小时的桶算法**：`usage_facts.event_ts_ms` 是 UTC 毫秒整数（不是
//! 旧表的 ISO 字符串），所以用整数除法而不是字符串切片：
//! `(event_ts_ms + 28_800_000) / 86_400_000` 恰好是「北京日」在 1970-01-01
//! 记 0 的天数序号——因为北京日边界 = UTC 时刻 +8h 后再按天取整，与
//! `agent_vitals_domain::usage::civil_date_from_days` 的输入定义（days-
//! since-epoch）完全对齐，不需要再转一轮时区。小时桶同理除以 3,600,000，
//! 商 mod 24 是北京小时数、商 / 24 是北京日序号——两者都不用碰字符串。
//! 这一算法与旧表 `dsh_days_map` 的"UTC 小时 ≥16 → 次日"字符串判断是同一
//! 条边界的两种写法（该文件模块头有证明），两边永远对齐。
//!
//! **行轴/聚合轴分离纪律**（spec §4，`AGENT_VITALS_V0_9_1_SQL_AUTHORITY_
//! MIGRATION_SPEC.md`）：本模块所有"实时行级事实"查询都显式
//! `observation_kind != 'legacy_aggregate'`；claude 深历史的 legacy_aggregate
//! 行只经 [`claude_legacy_days`] 这一条专用路径，从不与实时行同查询相加。

use std::collections::BTreeMap;

use rusqlite::Connection;
use serde_json::{json, Map, Value};

use agent_vitals_domain::usage::{civil_date_from_days, ms_from_civil};

use crate::authority::AuthorityError;

const BEIJING_OFFSET_MS: i64 = 8 * 3_600_000;
const DAY_MS: i64 = 86_400_000;
const HOUR_MS: i64 = 3_600_000;

/// Beijing 民历日 `(y, m, d)` 的零点 → UTC 毫秒。`ms_from_civil` 已做真实
/// 日期校验（02-30 之类非法日期返回 `None`），本函数原样传导。
fn beijing_midnight_ms(y: i64, m: u32, d: u32) -> Option<i64> {
    let utc_midnight = ms_from_civil(y, m, d, 0, 0, 0)?;
    Some(utc_midnight - BEIJING_OFFSET_MS)
}

fn parse_ymd(date: &str) -> Option<(i64, u32, u32)> {
    if date.len() != 10 || date.as_bytes().get(4) != Some(&b'-') || date.as_bytes().get(7) != Some(&b'-') {
        return None;
    }
    let y: i64 = date.get(0..4)?.parse().ok()?;
    let m: u32 = date.get(5..7)?.parse().ok()?;
    let d: u32 = date.get(8..10)?.parse().ok()?;
    Some((y, m, d))
}

/// `"YYYY-MM-DD"` → 该 Beijing 日的 `[start, end)` UTC 毫秒窗口。格式或日期
/// 非法（如 02-30）→ `None`，调用方按"这个日期没有意义"处理，不是报 0。
pub fn beijing_day_bounds_ms(date: &str) -> Option<(i64, i64)> {
    let (y, m, d) = parse_ymd(date)?;
    let start = beijing_midnight_ms(y, m, d)?;
    Some((start, start + DAY_MS))
}

/// `"YYYY-MM"` → 该 Beijing 月的 `[start, end)` UTC 毫秒窗口。
pub fn beijing_month_bounds_ms(month: &str) -> Option<(i64, i64)> {
    if month.len() != 7 || month.as_bytes().get(4) != Some(&b'-') {
        return None;
    }
    let y: i64 = month.get(0..4)?.parse().ok()?;
    let m: u32 = month.get(5..7)?.parse().ok()?;
    if !(1..=12).contains(&m) {
        return None;
    }
    let start = beijing_midnight_ms(y, m, 1)?;
    let (ny, nm) = if m == 12 { (y + 1, 1) } else { (y, m + 1) };
    let end = beijing_midnight_ms(ny, nm, 1)?;
    Some((start, end))
}

const BASE_KEYS: [&str; 4] =
    ["uncached_input_tokens", "cache_read_tokens", "cache_write_tokens", "output_tokens"];
const PEAK_KEYS: [&str; 4] = [
    "peak_uncached_input_tokens",
    "peak_cache_read_tokens",
    "peak_cache_write_tokens",
    "peak_output_tokens",
];

#[derive(Default, Clone, Copy)]
struct Bucket4 {
    u: i64,
    cr: i64,
    cw: i64,
    o: i64,
}

impl Bucket4 {
    fn add(&mut self, u: i64, cr: i64, cw: i64, o: i64) {
        self.u += u;
        self.cr += cr;
        self.cw += cw;
        self.o += o;
    }

    fn merge_into(self, keys: &[&str; 4], obj: &mut Map<String, Value>) {
        for (k, v) in keys.iter().zip([self.u, self.cr, self.cw, self.o]) {
            obj.insert(k.to_string(), json!(v));
        }
    }
}

/// `usage_facts` 里一个宿主在 `[start_ms, end_ms)` 窗口内的日桶 map——与旧
/// `store::dsh_days_map`/`month.json` 的 `days` 同形（顶层 4 基础 + 4 `peak_`
/// 前缀桶 + `by_model`：每个模型同样 8 键）。目前只有 DSH 走这条形状（唯一
/// 按时段峰谷计价的宿主）；`model_id` 为 `NULL`（未归属）的事实只计入顶层
/// 总量、不进 `by_model`——`domain::cost::priced_day` 靠这个缺口识别"这天
/// 有一部分 token 没有模型归属"，回落 `fallback_price` 补齐，不是本函数的
/// 职责。**实时行级事实专用**：显式排除 `observation_kind='legacy_aggregate'`
/// （spec §4 分离纪律，DSH 目前没有 legacy_aggregate 行，排除是防御性的，
/// 与 claude 那条路径写法一致，防止未来给 DSH 补历史聚合时悄悄踩坑）。
pub fn peaked_days_map(
    conn: &Connection,
    host: &str,
    start_ms: i64,
    end_ms: i64,
) -> Result<Value, AuthorityError> {
    let mut stmt = conn.prepare(
        "SELECT (event_ts_ms + ?1) / ?2 AS day_idx,
                model_id, event_peak,
                SUM(uncached_input_tokens), SUM(cache_read_tokens),
                SUM(cache_write_tokens), SUM(output_tokens)
         FROM usage_facts
         WHERE host = ?3 AND observation_kind != 'legacy_aggregate'
           AND deleted_at_ms IS NULL AND event_ts_ms IS NOT NULL
           AND event_ts_ms >= ?4 AND event_ts_ms < ?5
         GROUP BY day_idx, model_id, event_peak",
    )?;
    let rows = stmt.query_map(
        rusqlite::params![BEIJING_OFFSET_MS, DAY_MS, host, start_ms, end_ms],
        |r| {
            Ok((
                r.get::<_, i64>(0)?,
                r.get::<_, Option<String>>(1)?,
                r.get::<_, i64>(2)?,
                r.get::<_, i64>(3)?,
                r.get::<_, i64>(4)?,
                r.get::<_, i64>(5)?,
                r.get::<_, i64>(6)?,
            ))
        },
    )?;

    struct DayAcc {
        total: Bucket4,
        peak: Bucket4,
        by_model_total: BTreeMap<String, Bucket4>,
        by_model_peak: BTreeMap<String, Bucket4>,
    }
    let mut days: BTreeMap<String, DayAcc> = BTreeMap::new();
    for row in rows {
        let (day_idx, model, peak, u, cr, cw, o) = row?;
        let date = civil_date_from_days(day_idx);
        let acc = days.entry(date).or_insert_with(|| DayAcc {
            total: Bucket4::default(),
            peak: Bucket4::default(),
            by_model_total: BTreeMap::new(),
            by_model_peak: BTreeMap::new(),
        });
        acc.total.add(u, cr, cw, o);
        if peak == 1 {
            acc.peak.add(u, cr, cw, o);
        }
        if let Some(model) = model {
            acc.by_model_total.entry(model.clone()).or_default().add(u, cr, cw, o);
            if peak == 1 {
                acc.by_model_peak.entry(model).or_default().add(u, cr, cw, o);
            }
        }
    }

    let mut out = Map::new();
    for (date, acc) in days {
        let mut day_obj = Map::new();
        acc.total.merge_into(&BASE_KEYS, &mut day_obj);
        acc.peak.merge_into(&PEAK_KEYS, &mut day_obj);
        let mut by_model = Map::new();
        for (model, total) in &acc.by_model_total {
            let mut m = Map::new();
            total.merge_into(&BASE_KEYS, &mut m);
            acc.by_model_peak.get(model).copied().unwrap_or_default().merge_into(&PEAK_KEYS, &mut m);
            by_model.insert(model.clone(), Value::Object(m));
        }
        day_obj.insert("by_model".to_string(), Value::Object(by_model));
        out.insert(date, Value::Object(day_obj));
    }
    Ok(Value::Object(out))
}

/// claude 的实时行级事实：`[start_ms, end_ms)` 窗口内逐 Beijing 日、逐模型
/// 4 桶求和（无峰谷维度——claude 计价不按时段拆分）。**只读实时行**
/// （`observation_kind != 'legacy_aggregate'`）；深历史走 [`claude_legacy_days`]。
pub fn claude_days(
    conn: &Connection,
    start_ms: i64,
    end_ms: i64,
) -> Result<BTreeMap<String, Value>, AuthorityError> {
    let mut stmt = conn.prepare(
        "SELECT (event_ts_ms + ?1) / ?2 AS day_idx,
                model_id,
                SUM(uncached_input_tokens), SUM(cache_read_tokens),
                SUM(cache_write_tokens), SUM(output_tokens)
         FROM usage_facts
         WHERE host = 'claude-code' AND observation_kind != 'legacy_aggregate'
           AND deleted_at_ms IS NULL AND event_ts_ms IS NOT NULL
           AND event_ts_ms >= ?3 AND event_ts_ms < ?4
         GROUP BY day_idx, model_id",
    )?;
    let rows = stmt.query_map(rusqlite::params![BEIJING_OFFSET_MS, DAY_MS, start_ms, end_ms], |r| {
        Ok((
            r.get::<_, i64>(0)?,
            r.get::<_, Option<String>>(1)?,
            r.get::<_, i64>(2)?,
            r.get::<_, i64>(3)?,
            r.get::<_, i64>(4)?,
            r.get::<_, i64>(5)?,
        ))
    })?;
    let mut days: BTreeMap<String, Map<String, Value>> = BTreeMap::new();
    for row in rows {
        let (day_idx, model, u, cr, cw, o) = row?;
        // 无模型归属的行没有落点：claude_day_cost 按模型键计价，不知道
        // "unknown" 该归到哪张卡——与 `claude_provider_amounts` 现有的
        // unresolved 兜底一致，这里先诚实略过（真实 claude 事实恒有
        // model_raw，见 hosts/claude_code/sources/usage_fact.rs）。
        let Some(model) = model else { continue };
        let date = civil_date_from_days(day_idx);
        let bucket = days.entry(date).or_default().entry(model).or_insert_with(|| {
            json!({"input_tokens": 0, "cache_read_input_tokens": 0,
                   "cache_creation_input_tokens": 0, "output_tokens": 0})
        });
        for (key, v) in [
            ("input_tokens", u),
            ("cache_read_input_tokens", cr),
            ("cache_creation_input_tokens", cw),
            ("output_tokens", o),
        ] {
            let cur = bucket.get(key).and_then(Value::as_i64).unwrap_or(0);
            bucket[key] = json!(cur + v);
        }
    }
    Ok(days.into_iter().map(|(d, m)| (d, Value::Object(m))).collect())
}

/// claude 深历史聚合（`observation_kind='legacy_aggregate'`，spec §6.2.3）：
/// 只读 `event_peak=0` 行（`legacy_import::build_legacy_fact` 的"全量"行；
/// `event_peak=1` 是同一 (day,model) 的峰值子集重复编码，加进来就是双计——
/// 见本模块与 legacy_import 模块头共同强调的分离纪律）。形状与
/// [`claude_days`] 相同，供调用方在真实事实缺席的日期上兜底。
pub fn claude_legacy_days(
    conn: &Connection,
    start_ms: i64,
    end_ms: i64,
) -> Result<BTreeMap<String, Value>, AuthorityError> {
    let mut stmt = conn.prepare(
        "SELECT (event_ts_ms + ?1) / ?2 AS day_idx,
                model_id,
                SUM(uncached_input_tokens), SUM(cache_read_tokens),
                SUM(cache_write_tokens), SUM(output_tokens)
         FROM usage_facts
         WHERE host = 'claude-code' AND observation_kind = 'legacy_aggregate'
           AND event_peak = 0 AND deleted_at_ms IS NULL AND event_ts_ms IS NOT NULL
           AND event_ts_ms >= ?3 AND event_ts_ms < ?4
         GROUP BY day_idx, model_id",
    )?;
    let rows = stmt.query_map(rusqlite::params![BEIJING_OFFSET_MS, DAY_MS, start_ms, end_ms], |r| {
        Ok((
            r.get::<_, i64>(0)?,
            r.get::<_, Option<String>>(1)?,
            r.get::<_, i64>(2)?,
            r.get::<_, i64>(3)?,
            r.get::<_, i64>(4)?,
            r.get::<_, i64>(5)?,
        ))
    })?;
    let mut days: BTreeMap<String, Map<String, Value>> = BTreeMap::new();
    for row in rows {
        let (day_idx, model, u, cr, cw, o) = row?;
        let Some(model) = model else { continue };
        let date = civil_date_from_days(day_idx);
        days.entry(date).or_default().insert(
            model,
            json!({"input_tokens": u, "cache_read_input_tokens": cr,
                   "cache_creation_input_tokens": cw, "output_tokens": o}),
        );
    }
    Ok(days.into_iter().map(|(d, m)| (d, Value::Object(m))).collect())
}

/// codex 的实时行级事实 → `by_hour_model` 形状（`{"YYYY-MM-DDTHH":
/// {model: {"standard": {5 桶}}}}`）——`hosts::codex_usage::{codex_by_model_
/// from_hours, codex_aggregate_hours}` 与 `sessions::codex_cost::
/// codex_cost_report` 的输入形状。**speed 恒 "standard"**：codex 的
/// UsageFact emitter 从不记录 `service_tier`/speed（`hosts/codex/sources/
/// usage_fact.rs` 只填 `model_raw`），但 `assets/codex_pricing.json` 的
/// `_note` 明写"真实数据 service_tier 恒为 null → standard"——真机从未观测
/// 到非 standard 速度，这不是精度损失，是如实反映数据。`reasoning_output_
/// tokens` 恒填 0：emitter 在写 `usage_facts.output_tokens` 时已经把
/// reasoning 并入 output（"决策 A"，模块头 `consumed_to_usage_fact` 的
/// 注释），这里不重复计入，避免双计。无时间戳的事实（`event_ts_ms IS
/// NULL`）被本查询天然排除——与旧 fold 路径「untimed 样本不进时间轴」的
/// 已知简化一致，不是本函数引入的新缺口。
pub fn codex_by_hour_model(
    conn: &Connection,
    start_ms: i64,
    end_ms: i64,
) -> Result<Value, AuthorityError> {
    let mut stmt = conn.prepare(
        "SELECT (event_ts_ms + ?1) / ?2 AS hour_idx,
                model_id,
                SUM(uncached_input_tokens), SUM(cache_read_tokens),
                SUM(cache_write_tokens), SUM(output_tokens)
         FROM usage_facts
         WHERE host = 'codex' AND observation_kind != 'legacy_aggregate'
           AND deleted_at_ms IS NULL AND event_ts_ms IS NOT NULL
           AND event_ts_ms >= ?3 AND event_ts_ms < ?4
         GROUP BY hour_idx, model_id",
    )?;
    let rows = stmt.query_map(rusqlite::params![BEIJING_OFFSET_MS, HOUR_MS, start_ms, end_ms], |r| {
        Ok((
            r.get::<_, i64>(0)?,
            r.get::<_, Option<String>>(1)?,
            r.get::<_, i64>(2)?,
            r.get::<_, i64>(3)?,
            r.get::<_, i64>(4)?,
            r.get::<_, i64>(5)?,
        ))
    })?;
    let mut hours: BTreeMap<String, Map<String, Value>> = BTreeMap::new();
    for row in rows {
        let (hour_idx, model, u, cr, cw, o) = row?;
        let Some(model) = model else { continue };
        let day_idx = hour_idx.div_euclid(24);
        let hour_of_day = hour_idx.rem_euclid(24);
        let key = format!("{}T{:02}", civil_date_from_days(day_idx), hour_of_day);
        let per_model = hours.entry(key).or_default();
        let entry = per_model.entry(model).or_insert_with(|| json!({}));
        let mut speeds = Map::new();
        speeds.insert(
            "standard".to_string(),
            json!({
                "uncached_input_tokens": u,
                "cached_input_tokens": cr,
                "cache_write_input_tokens": cw,
                "output_tokens": o,
                "reasoning_output_tokens": 0,
            }),
        );
        *entry = Value::Object(speeds);
    }
    Ok(Value::Object(hours.into_iter().map(|(k, v)| (k, Value::Object(v))).collect()))
}

/// coverage 分母版本（Phase 3.3 设计定稿）：三维定义（usage / price / sync）
/// 的演进刻度。定义变更必须递增——旧快照的覆盖率与新快照不可无声互比
/// （data_contract::CoverageStatus 的同一条纪律）。
pub const COVERAGE_DENOMINATOR_VERSION: u32 = 1;

/// 一个宿主在 `[start_ms, end_ms)` 窗口内的三维 coverage（measured, total）。
/// `total` 恒 3，`measured` ∈ 0..=3；窗口零事实 → (0, 0, 0)——「从没观测到」
/// 是三维全空，不是三维全满。分母定义见 [`COVERAGE_DENOMINATOR_VERSION`]：
///
/// - **usage 维**：窗口内有可解析时间戳的事实（`event_ts_ms IS NOT NULL`、
///   未软删除）。「接线了」是能力不是观测，永不计入。
/// - **price 维**：窗口内 token 非零的每个 distinct 模型都能经
///   `billing_route_of` 归属到已知 provider。认不出的模型（glm-* 无价卡、
///   moonshot 无声明）让本维不算 measured——与 `has_unresolved` 同源，
///   「看见了 token、钱不可归」就是覆盖缺口。
/// - **sync 维**（refinement，2026-09-07）：`source_files` 该宿主的
///   `MAX(last_seen_at_ms) >= MAX(窗口内 event_ts_ms)`——窗口内最后一次
///   事件已被某次同步观测到。历史月份自然成立；托盘停摆时当前窗口归 0。
///   不读时钟（data crate 纪律），比较双方都来自库内。
///
/// 返回 `(measured, total)`；`denominator_version` 由调用方配
/// [`COVERAGE_DENOMINATOR_VERSION`]。
pub fn coverage_status(
    conn: &Connection,
    host: &str,
    start_ms: i64,
    end_ms: i64,
) -> Result<(u64, u64), AuthorityError> {
    const TOTAL: u64 = 3;
    // usage 维 + price 维的模型清单一次查询拿齐。
    let usage_measured: i64 = conn.query_row(
        "SELECT EXISTS(SELECT 1 FROM usage_facts
             WHERE host = ?1 AND deleted_at_ms IS NULL
               AND event_ts_ms IS NOT NULL AND event_ts_ms >= ?2 AND event_ts_ms < ?3)",
        rusqlite::params![host, start_ms, end_ms],
        |r| r.get(0),
    )?;
    if usage_measured == 0 {
        return Ok((0, TOTAL));
    }
    // price 维：窗口内 token 非零的 distinct model_id 逐个过声明表。
    // model_id 为 NULL 的行不参与（未归属 → 与 peaked_days_map 的 fallback
    // 缺口同语义；当前 emitter 恒填 model_raw 所以库内为空）。
    let mut stmt = conn.prepare(
        "SELECT DISTINCT model_id FROM usage_facts
         WHERE host = ?1 AND deleted_at_ms IS NULL AND model_id IS NOT NULL
           AND event_ts_ms >= ?2 AND event_ts_ms < ?3
           AND (uncached_input_tokens + cache_read_tokens
                + cache_write_tokens + output_tokens) > 0",
    )?;
    let models: Vec<String> = stmt
        .query_map(rusqlite::params![host, start_ms, end_ms], |r| r.get(0))?
        .collect::<Result<_, _>>()?;
    let mut measured: u64 = 1; // usage 维已确认
    if !models.is_empty() {
        let pricing = agent_vitals_domain::cost::load_pricing();
        let all_routed = models.iter().all(|m| {
            agent_vitals_domain::cost::billing_route_of(m, &pricing).is_some()
        });
        if all_routed {
            measured += 1;
        }
    }
    // sync 维：该宿主最近一次同步观测 ≥ 窗口内最后一次事件。
    let max_event: Option<i64> = conn
        .query_row(
            "SELECT MAX(event_ts_ms) FROM usage_facts
             WHERE host = ?1 AND deleted_at_ms IS NULL
               AND event_ts_ms IS NOT NULL AND event_ts_ms >= ?2 AND event_ts_ms < ?3",
            rusqlite::params![host, start_ms, end_ms],
            |r| r.get(0),
        )
        .unwrap_or(None);
    let max_seen: Option<i64> = conn
        .query_row(
            "SELECT MAX(last_seen_at_ms) FROM source_files WHERE host = ?1",
            rusqlite::params![host],
            |r| r.get(0),
        )
        .unwrap_or(None);
    if let (Some(ev), Some(seen)) = (max_event, max_seen) {
        if seen >= ev {
            measured += 1;
        }
    }
    Ok((measured, TOTAL))
}

/// Q04 下钻的最小事实分页（3.7a，spec §4 `facts_page(filters, cursor)` 的
/// 窗口切片版）：`[start_ms, end_ms)` × host × 可选小时过滤，按
/// `(event_ts_ms, fact_id)` 稳定排序，cursor 分页（`limit` 行 + 下一页
/// 起点键）。**排除 legacy_aggregate**——下钻消费的是行级事实，聚合行是
/// 日轴账单不是会话证据（§4 分离纪律）。行形状 = Q04 需要的最小集：
/// fact_id/native_session_id（会话聚合键）/model_id/事件时间/四桶——
/// 「会话 token 合计严格等于峰值」的下钻靠 native_session_id 分组。
#[derive(Debug, Clone)]
pub struct FactPageRow {
    pub fact_id: String,
    pub native_session_id: String,
    pub model_id: Option<String>,
    pub event_ts_ms: i64,
    pub uncached_input_tokens: i64,
    pub cache_read_tokens: i64,
    pub cache_write_tokens: i64,
    pub output_tokens: i64,
}

/// cursor = 上一页最后一行的 `(event_ts_ms, fact_id)`（键集分页，无 OFFSET
/// 漂移）；`None` = 首页。返回 (rows, has_more)。
pub fn facts_page_window(
    conn: &Connection,
    host: &str,
    start_ms: i64,
    end_ms: i64,
    after_ts: Option<i64>,
    after_fact_id: Option<&str>,
    limit: usize,
) -> Result<(Vec<FactPageRow>, bool), AuthorityError> {
    let mut stmt = conn.prepare(
        "SELECT fact_id, native_session_id, model_id, event_ts_ms,
                uncached_input_tokens, cache_read_tokens, cache_write_tokens, output_tokens
         FROM usage_facts
         WHERE host = ?1 AND observation_kind != 'legacy_aggregate'
           AND deleted_at_ms IS NULL AND event_ts_ms IS NOT NULL
           AND event_ts_ms >= ?2 AND event_ts_ms < ?3
           AND (event_ts_ms, fact_id) > (?4, ?5)
         ORDER BY event_ts_ms, fact_id
         LIMIT ?6",
    )?;
    let rows = stmt.query_map(
        rusqlite::params![
            host,
            start_ms,
            end_ms,
            after_ts.unwrap_or(i64::MIN),
            after_fact_id.unwrap_or(""),
            limit as i64 + 1, // 多取一行判 has_more
        ],
        |r| {
            Ok(FactPageRow {
                fact_id: r.get(0)?,
                native_session_id: r.get(1)?,
                model_id: r.get(2)?,
                event_ts_ms: r.get(3)?,
                uncached_input_tokens: r.get(4)?,
                cache_read_tokens: r.get(5)?,
                cache_write_tokens: r.get(6)?,
                output_tokens: r.get(7)?,
            })
        },
    )?;
    let mut rows: Vec<FactPageRow> = rows.collect::<Result<_, _>>()?;
    let has_more = rows.len() > limit;
    rows.truncate(limit);
    Ok((rows, has_more))
}

/// 三宿主统一的北京小时轴（3.5 Tier B：`hourly_distribution` 的 SQL 数据源
/// ——取代旧 facts-index 投影，行级事实本就都在 `usage_facts`，旧索引是
/// 可丢弃投影、权威读面没有理由绕它）。返回 `{host: {"HH": tokens}}`，
/// tokens = 四桶之和，只装非零小时（与旧 `hours_by_host` 同形）。DSH 的
/// 峰谷维度在小时轴上不保留（小时分布是「活跃度」视图；峰谷计价走
/// [`peaked_days_map`]）。
pub fn hourly_by_host(
    conn: &Connection,
    start_ms: i64,
    end_ms: i64,
) -> Result<BTreeMap<String, BTreeMap<String, i64>>, AuthorityError> {
    let mut stmt = conn.prepare(
        "SELECT host,
                CAST(((event_ts_ms + ?1) / ?2) % 24 AS TEXT) AS bj_hour,
                SUM(uncached_input_tokens + cache_read_tokens
                    + cache_write_tokens + output_tokens)
         FROM usage_facts
         WHERE observation_kind != 'legacy_aggregate'
           AND deleted_at_ms IS NULL AND event_ts_ms IS NOT NULL
           AND event_ts_ms >= ?3 AND event_ts_ms < ?4
         GROUP BY host, bj_hour",
    )?;
    let rows = stmt.query_map(
        rusqlite::params![BEIJING_OFFSET_MS, HOUR_MS, start_ms, end_ms],
        |r| {
            Ok((
                r.get::<_, String>(0)?,
                r.get::<_, String>(1)?,
                r.get::<_, i64>(2)?,
            ))
        },
    )?;
    let mut out: BTreeMap<String, BTreeMap<String, i64>> = BTreeMap::new();
    for row in rows {
        let (host, hour, total) = row?;
        if total > 0 {
            out.entry(host)
                .or_default()
                .insert(format!("{:0>2}", hour), total);
        }
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::authority::AuthorityDb;
    use std::path::PathBuf;

    fn ms_to_beijing_date(ms: i64) -> String {
        civil_date_from_days((ms + BEIJING_OFFSET_MS).div_euclid(DAY_MS))
    }

    fn tmp_db(tag: &str) -> PathBuf {
        std::env::temp_dir().join(format!(
            "avd-query-{tag}-{}-{}",
            std::process::id(),
            std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos()
        ))
    }

    /// 与 fact_writer_sql 的测试助手同构：直接 INSERT 一行 usage_facts，
    /// 不经过完整的 UsageFact 校验管线（本模块只测查询/reshape，不是
    /// writer 的校验规则）。
    #[allow(clippy::too_many_arguments)]
    fn insert_fact(
        db: &AuthorityDb,
        fact_id: &str,
        host: &str,
        model_id: Option<&str>,
        observation_kind: &str,
        event_ts_ms: i64,
        event_peak: i64,
        u: i64,
        cr: i64,
        cw: i64,
        o: i64,
    ) {
        db.conn()
            .execute(
                "INSERT INTO sync_runs(run_id, started_at_ms, trigger, status, schema_version)
                 VALUES ('run', 1, 'cli', 'succeeded', 1) ON CONFLICT(run_id) DO NOTHING",
                [],
            )
            .unwrap();
        db.conn()
            .execute(
                "INSERT INTO usage_facts(fact_id, host, machine_namespace, native_session_id,
                     source_event_id, observation_kind, provider_id, model_id, event_ts_ms,
                     event_peak, uncached_input_tokens, cache_read_tokens, cache_write_tokens,
                     output_tokens, ingested_run_id, created_at_ms, updated_at_ms)
                 VALUES (?1, ?2, 'm', 'sess', ?1, ?3, NULL, ?4, ?5, ?6, ?7, ?8, ?9, ?10, 'run', 1, 1)",
                rusqlite::params![
                    fact_id, host, observation_kind, model_id, event_ts_ms, event_peak, u, cr, cw, o
                ],
            )
            .unwrap();
    }

    #[test]
    fn beijing_day_bounds_match_month_boundary_at_utc_16() {
        // 北京 2026-09-01 00:00 = UTC 2026-08-31 16:00——与旧 `dsh_days_map`
        // 的字符串判断（"UTC 小时 >=16 → 次日"）钉的是同一条边界。
        let (start, end) = beijing_day_bounds_ms("2026-09-01").unwrap();
        assert_eq!(end - start, DAY_MS);
        // 边界前一毫秒仍是 08-31 的 UTC 时刻。
        let just_before = start - 1;
        assert_eq!(ms_to_beijing_date(just_before), "2026-08-31");
        assert_eq!(ms_to_beijing_date(start), "2026-09-01");
    }

    #[test]
    fn month_bounds_span_exactly_the_civil_month() {
        let (start, end) = beijing_month_bounds_ms("2026-09").unwrap();
        assert_eq!(ms_to_beijing_date(start), "2026-09-01");
        assert_eq!(ms_to_beijing_date(end - 1), "2026-09-30");
        assert_eq!(ms_to_beijing_date(end), "2026-10-01");
    }

    #[test]
    fn invalid_month_or_day_is_none_not_a_guess() {
        assert_eq!(beijing_month_bounds_ms("2026-13"), None);
        assert_eq!(beijing_month_bounds_ms("2026-9"), None);
        assert_eq!(beijing_day_bounds_ms("2026-02-30"), None);
    }

    #[test]
    fn peaked_days_map_splits_peak_and_attributes_by_model() {
        let path = tmp_db("dsh");
        let db = AuthorityDb::open(&path, 1).unwrap();
        let (start, end) = beijing_day_bounds_ms("2026-09-05").unwrap();
        // event_peak 直接注入（本模块只测查询/reshape，不重算
        // `is_peak_slot`——那是 emitter 的职责）：两条 peak=0、一条 peak=1。
        insert_fact(&db, "f1", "dsh", Some("deepseek-v4-pro"), "turn", start + 3_600_000, 0, 100, 10, 5, 20);
        insert_fact(&db, "f2", "dsh", Some("deepseek-v4-pro"), "turn", start + 4_000_000, 1, 50, 0, 0, 10);
        insert_fact(&db, "f3", "dsh", None, "turn", start + 5_000_000, 0, 7, 0, 0, 1); // 无模型归属
        let days = peaked_days_map(db.conn(), "dsh", start, end).unwrap();
        let day = &days["2026-09-05"];
        // 顶层总量 = 全部三条之和（含无归属行）。
        assert_eq!(day["uncached_input_tokens"], json!(157));
        assert_eq!(day["peak_uncached_input_tokens"], json!(50));
        // by_model 只含有归属的两条，且总/峰值分桶正确。
        let model = &day["by_model"]["deepseek-v4-pro"];
        assert_eq!(model["uncached_input_tokens"], json!(150));
        assert_eq!(model["peak_uncached_input_tokens"], json!(50));
        assert!(days["2026-09-05"]["by_model"].get("unknown").is_none());

        // 窗口外的事实不应该出现。
        insert_fact(&db, "f4", "dsh", Some("x"), "turn", end + 1, 0, 999, 0, 0, 0);
        let days2 = peaked_days_map(db.conn(), "dsh", start, end).unwrap();
        assert_eq!(days2["2026-09-05"]["uncached_input_tokens"], json!(157));

        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn peaked_days_map_excludes_legacy_aggregate_rows() {
        // 行轴/聚合轴分离纪律：legacy_aggregate 行绝不能被实时聚合查询计入，
        // 否则同一天的账会被算两遍（spec §4）。
        let path = tmp_db("dsh-legacy");
        let db = AuthorityDb::open(&path, 1).unwrap();
        let (start, end) = beijing_day_bounds_ms("2026-09-05").unwrap();
        insert_fact(&db, "f1", "dsh", Some("m"), "turn", start + 1000, 0, 10, 0, 0, 0);
        insert_fact(&db, "f2", "dsh", Some("m"), "legacy_aggregate", start + 1000, 0, 999, 0, 0, 0);
        let days = peaked_days_map(db.conn(), "dsh", start, end).unwrap();
        assert_eq!(days["2026-09-05"]["uncached_input_tokens"], json!(10));
        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn claude_days_sums_across_peak_states_without_a_peak_axis() {
        let path = tmp_db("claude");
        let db = AuthorityDb::open(&path, 1).unwrap();
        let (start, end) = beijing_day_bounds_ms("2026-09-05").unwrap();
        // 一条 peak=0、一条 peak=1——claude 计价不分峰谷，两条都要计入同一
        // 模型总量（与 DSH 的 `peaked_days_map` 行为对照，防止误把 claude
        // 的 event_peak 当"只算 0"处理——那是 legacy_aggregate 专属编码）。
        insert_fact(&db, "f1", "claude-code", Some("claude-opus-4"), "message", start + 1000, 0, 100, 20, 5, 30);
        insert_fact(&db, "f2", "claude-code", Some("claude-opus-4"), "message", start + 2000, 1, 50, 0, 0, 10);
        let days = claude_days(db.conn(), start, end).unwrap();
        let bucket = &days["2026-09-05"]["claude-opus-4"];
        assert_eq!(bucket["input_tokens"], json!(150));
        assert_eq!(bucket["output_tokens"], json!(40));
        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn claude_legacy_days_reads_only_the_base_peak_zero_row() {
        // `event_peak=1` 行是 base 行的峰值子集重复编码（legacy_import 的
        // 两行设计）——读它会把峰值部分的 token 算两遍。
        let path = tmp_db("claude-legacy");
        let db = AuthorityDb::open(&path, 1).unwrap();
        let (start, end) = beijing_day_bounds_ms("2026-01-05").unwrap();
        insert_fact(&db, "f1", "claude-code", Some("claude-opus-4"), "legacy_aggregate", start, 0, 1000, 100, 50, 200);
        insert_fact(&db, "f2", "claude-code", Some("claude-opus-4"), "legacy_aggregate", start, 1, 300, 0, 0, 60);
        let days = claude_legacy_days(db.conn(), start, end).unwrap();
        let bucket = &days["2026-01-05"]["claude-opus-4"];
        assert_eq!(bucket["input_tokens"], json!(1000), "只读 base 行，不叠加峰值子集");
        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn codex_by_hour_model_buckets_speed_as_standard() {
        let path = tmp_db("codex");
        let db = AuthorityDb::open(&path, 1).unwrap();
        let (start, _) = beijing_day_bounds_ms("2026-09-05").unwrap();
        insert_fact(&db, "f1", "codex", Some("gpt-5.6-sol"), "token_count", start + 3_600_000, 0, 800, 200, 50, 80);
        let by_hour = codex_by_hour_model(db.conn(), start, start + DAY_MS).unwrap();
        // 北京 01:00 的小时键。
        let bucket = &by_hour["2026-09-05T01"]["gpt-5.6-sol"]["standard"];
        assert_eq!(bucket["uncached_input_tokens"], json!(800));
        assert_eq!(bucket["cached_input_tokens"], json!(200));
        assert_eq!(bucket["reasoning_output_tokens"], json!(0));
        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn untimed_facts_are_excluded_from_all_windowed_queries() {
        // event_ts_ms IS NULL 的事实不进任何时间轴——与旧 fold 的
        // untimed 纪律一致，不是新缺口。
        let path = tmp_db("untimed");
        let db = AuthorityDb::open(&path, 1).unwrap();
        db.conn()
            .execute(
                "INSERT INTO sync_runs(run_id, started_at_ms, trigger, status, schema_version)
                 VALUES ('run', 1, 'cli', 'succeeded', 1)",
                [],
            )
            .unwrap();
        db.conn()
            .execute(
                "INSERT INTO usage_facts(fact_id, host, machine_namespace, native_session_id,
                     source_event_id, observation_kind, model_id, event_ts_ms, event_peak,
                     uncached_input_tokens, cache_read_tokens, cache_write_tokens, output_tokens,
                     ingested_run_id, created_at_ms, updated_at_ms)
                 VALUES ('u1', 'codex', 'm', 's', 'u1', 'token_count', 'gpt-5.6', NULL, 0,
                         500, 0, 0, 0, 'run', 1, 1)",
                [],
            )
            .unwrap();
        let (start, end) = beijing_month_bounds_ms("2026-09").unwrap();
        let by_hour = codex_by_hour_model(db.conn(), start, end).unwrap();
        assert!(by_hour.as_object().unwrap().is_empty());
        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn hourly_by_host_buckets_all_hosts_into_beijing_hours() {
        let path = tmp_db("hourly");
        let db = AuthorityDb::open(&path, 1).unwrap();
        db.begin_run("run", "cli", 1).unwrap();
        let (start, end) = beijing_day_bounds_ms("2026-09-05").unwrap();
        // 三宿主各自一条：北京 01:00（UTC 17:00 前一日——用 day_start 直接
        // 加小时即北京语义）、北京 08:00、北京 23:00。legacy 行必须排除。
        insert_fact(&db, "h1", "claude-code", Some("m"), "turn", start + 3_600_000, 0, 10, 0, 0, 5);
        insert_fact(&db, "h2", "codex", Some("m"), "token_count", start + 8 * 3_600_000, 0, 20, 0, 0, 2);
        insert_fact(&db, "h3", "dsh", Some("m"), "turn", start + 23 * 3_600_000, 0, 30, 0, 0, 3);
        insert_fact(&db, "h4", "dsh", Some("m"), "legacy_aggregate", start + 3_600_000, 0, 999, 0, 0, 0);
        let out = hourly_by_host(db.conn(), start, end).unwrap();
        assert_eq!(out["claude-code"]["01"], 15, "四桶之和");
        assert_eq!(out["codex"]["08"], 22);
        assert_eq!(out["dsh"]["23"], 33);
        assert!(!out["dsh"].contains_key("01"), "legacy 行不进小时轴");
        // 零填充键形态（"01" 非 "1"）。
        assert!(out["claude-code"].contains_key("01") && !out["claude-code"].contains_key("1"));
        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn facts_page_window_is_stable_and_cursor_paginates_without_drift() {
        let path = tmp_db("facts-page");
        let db = AuthorityDb::open(&path, 1).unwrap();
        db.begin_run("run", "cli", 1).unwrap();
        let (start, end) = beijing_day_bounds_ms("2026-09-05").unwrap();
        // 同一毫秒两条事实（键集分页的并列场景）+ 一条 legacy（必须排除）。
        insert_fact(&db, "b", "dsh", Some("m"), "turn", start + 1_000, 0, 1, 0, 0, 1);
        insert_fact(&db, "a", "dsh", Some("m"), "turn", start + 1_000, 0, 2, 0, 0, 2);
        insert_fact(&db, "c", "dsh", Some("m"), "turn", start + 2_000, 0, 3, 0, 0, 3);
        insert_fact(&db, "lg", "dsh", Some("m"), "legacy_aggregate", start + 1_500, 0, 999, 0, 0, 0);
        // 首页 limit=2：按 (ts, fact_id) 升序 → a, b；has_more。
        let (p1, more1) = facts_page_window(db.conn(), "dsh", start, end, None, None, 2).unwrap();
        assert!(more1);
        let ids1: Vec<&str> = p1.iter().map(|r| r.fact_id.as_str()).collect();
        assert_eq!(ids1, vec!["a", "b"], "同毫秒按 fact_id 决胜；legacy 排除");
        // 用首页尾行做 cursor → c；无更多。
        let last = p1.last().unwrap();
        let (p2, more2) = facts_page_window(
            db.conn(), "dsh", start, end,
            Some(last.event_ts_ms), Some(&last.fact_id), 2,
        )
        .unwrap();
        assert!(!more2);
        let ids2: Vec<&str> = p2.iter().map(|r| r.fact_id.as_str()).collect();
        assert_eq!(ids2, vec!["c"], "cursor 后无漂移无重复");
        // 窗口外事实不可见（开区间上界）。
        insert_fact(&db, "d", "dsh", Some("m"), "turn", end, 0, 4, 0, 0, 4);
        let (p3, _) = facts_page_window(db.conn(), "dsh", start, end, None, None, 10).unwrap();
        assert_eq!(p3.len(), 3, "event_ts_ms == end 落在窗外");
        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn coverage_status_empty_window_is_zero_not_full() {
        // 「从没观测到」是三维全空——不是三维全满（接线了 ≠ 观测到）。
        let path = tmp_db("cov0");
        let db = AuthorityDb::open(&path, 1).unwrap();
        let (start, end) = beijing_month_bounds_ms("2020-01").unwrap();
        assert_eq!(coverage_status(db.conn(), "dsh", start, end).unwrap(), (0, 3));
        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn coverage_status_usage_sync_dimensions_and_unpriced_model() {
        let path = tmp_db("cov3");
        let db = AuthorityDb::open(&path, 1).unwrap();
        db.begin_run("run", "cli", 1).unwrap();
        let (start, end) = beijing_month_bounds_ms("2026-09").unwrap();
        // 已知模型（deepseek 官方卡）→ usage+price 双维命中；token 全零的
        // 模型不参与 price 维（无消耗无价可评）。
        insert_fact(&db, "f1", "dsh", Some("deepseek-v4-flash"), "turn", start + 1_000, 0, 100, 0, 0, 10);
        insert_fact(&db, "f2", "dsh", Some("zero-model"), "turn", start + 2_000, 0, 0, 0, 0, 0);
        // sync 维：source_files.last_seen_at_ms ≥ 窗口内最后事件。
        db.conn()
            .execute(
                "INSERT INTO source_files(source_id, host, path_hash, size_bytes, mtime_ns,
                     parser_version, first_seen_at_ms, last_seen_at_ms)
                 VALUES ('src1', 'dsh', 'h1', 1, 1, 1, 1, ?1)",
                rusqlite::params![start + 2_000],
            )
            .unwrap();
        let (m, t) = coverage_status(db.conn(), "dsh", start, end).unwrap();
        assert_eq!((m, t), (3, 3), "usage+price+sync 三维全命中");
        // sync 维缺口：last_seen 落后于窗口内最后事件（此时 max_event 仍是
        // f2 的 start+2000）→ 降 1。
        db.conn()
            .execute(
                "UPDATE source_files SET last_seen_at_ms = ?1 WHERE source_id='src1'",
                rusqlite::params![start],
            )
            .unwrap();
        let (m2, _) = coverage_status(db.conn(), "dsh", start, end).unwrap();
        assert_eq!(m2, 2, "usage+price 命中但 sync 落后 → 2/3");
        // price 维缺口：出现声明表认不出的**有量**模型（顺带推进了 max_event
        // ——此时 sync 维本来就落空，price 缺口让 2 → 1）。
        insert_fact(&db, "f3", "dsh", Some("moonshot-kimi-x"), "turn", start + 3_000, 0, 50, 0, 0, 5);
        let (m3, _) = coverage_status(db.conn(), "dsh", start, end).unwrap();
        assert_eq!(m3, 1, "无路由模型让 price 维也落空");
        let _ = std::fs::remove_file(&path);
    }
}
