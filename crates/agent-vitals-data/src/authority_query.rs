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

use rusqlite::{Connection, OptionalExtension};
use serde_json::{json, Map, Value};

use agent_vitals_domain::usage::{civil_date_from_days, ms_from_civil};

use crate::authority::AuthorityError;

const BEIJING_OFFSET_MS: i64 = 8 * 3_600_000;
const DAY_MS: i64 = 86_400_000;
const HOUR_MS: i64 = 3_600_000;

// v0.9.1 测试矩阵 §8 行 8「performance（不枚举原始日志/索引命中）」：所有
// 窗口化聚合查询的 SQL 抽成 `const`，`prepare()` 与 `tests/query_plan.rs` 的
// `EXPLAIN QUERY PLAN` 断言共用同一字符串——两处零漂移。断言内容：`host` +
// `event_ts_ms` 范围必须命中部分索引 `usage_facts_host_time`（`WHERE
// deleted_at_ms IS NULL` 与查询谓词一致），绝不 `SCAN usage_facts`（全表）。

/// [`peaked_days_map`]：DSH 峰谷分桶（`(day, model, event_peak)` 三维聚合）。
pub(crate) const SQL_PEAKED_DAYS_MAP: &str = "SELECT (event_ts_ms + ?1) / ?2 AS day_idx,
                model_id, event_peak,
                SUM(uncached_input_tokens), SUM(cache_read_tokens),
                SUM(cache_write_tokens), SUM(output_tokens)
         FROM usage_facts
         WHERE host = ?3 AND observation_kind != 'legacy_aggregate'
           AND deleted_at_ms IS NULL AND event_ts_ms IS NOT NULL
           AND event_ts_ms >= ?4 AND event_ts_ms < ?5
         GROUP BY day_idx, model_id, event_peak";

/// [`claude_days`]：claude 实时行级事实的逐日 `{model: 4 桶}`。
pub(crate) const SQL_CLAUDE_DAYS: &str = "SELECT (event_ts_ms + ?1) / ?2 AS day_idx,
                model_id,
                SUM(uncached_input_tokens), SUM(cache_read_tokens),
                SUM(cache_write_tokens), SUM(output_tokens)
         FROM usage_facts
         WHERE host = 'claude-code' AND observation_kind != 'legacy_aggregate'
           AND deleted_at_ms IS NULL AND event_ts_ms IS NOT NULL
           AND event_ts_ms >= ?3 AND event_ts_ms < ?4
         GROUP BY day_idx, model_id";

/// [`claude_legacy_days`]：claude 深历史聚合（`event_peak=0` 全量行）。
pub(crate) const SQL_CLAUDE_LEGACY_DAYS: &str = "SELECT (event_ts_ms + ?1) / ?2 AS day_idx,
                model_id,
                SUM(uncached_input_tokens), SUM(cache_read_tokens),
                SUM(cache_write_tokens), SUM(output_tokens)
         FROM usage_facts
         WHERE host = 'claude-code' AND observation_kind = 'legacy_aggregate'
           AND event_peak = 0 AND deleted_at_ms IS NULL AND event_ts_ms IS NOT NULL
           AND event_ts_ms >= ?3 AND event_ts_ms < ?4
         GROUP BY day_idx, model_id";

/// [`codex_by_hour_model`]：codex 实时行级事实的逐北京小时 `{model: 5 桶}`。
pub(crate) const SQL_CODEX_BY_HOUR_MODEL: &str = "SELECT (event_ts_ms + ?1) / ?2 AS hour_idx,
                model_id,
                SUM(uncached_input_tokens), SUM(cache_read_tokens),
                SUM(cache_write_tokens), SUM(output_tokens)
         FROM usage_facts
         WHERE host = 'codex' AND observation_kind != 'legacy_aggregate'
           AND deleted_at_ms IS NULL AND event_ts_ms IS NOT NULL
           AND event_ts_ms >= ?3 AND event_ts_ms < ?4
         GROUP BY hour_idx, model_id";

/// [`hourly_by_host_model`] 三宿主 × 模型 × 小时聚合（增量 2 `usage_hourly`
/// 工具的 SQL 数据源）。从函数体抽出来便于 EXPLAIN QUERY PLAN 测试断言。
///
/// **单宿主** SQL：`host = ?5` 走 `usage_facts_host_time` 索引（与
/// `codex_by_hour_model` / `claude_days` 同款）。三宿主聚合由 fn 把三个
/// 单宿主查询的结果 in-memory 合并——OR + IN + positional params 三种
/// 写法 SQLite planner 都会退化成 SCAN + temp B-tree（实测，2026-09-05
/// tab 卡顿事故形状）。wired 宿主就 3 个（claude-code / codex / dsh），
/// in-memory 合并成本可忽略；多于 3 个需要重新评估。
pub(crate) const SQL_HOURLY_BY_HOST_MODEL: &str = "SELECT host, COALESCE(model_id, '<unknown>'),
                CAST(((event_ts_ms + ?1) / ?2) % 24 AS TEXT) AS bj_hour,
                SUM(uncached_input_tokens),
                SUM(cache_read_tokens),
                SUM(cache_write_tokens),
                SUM(output_tokens)
         FROM usage_facts
         WHERE observation_kind != 'legacy_aggregate'
           AND deleted_at_ms IS NULL AND event_ts_ms IS NOT NULL
           AND event_ts_ms >= ?3 AND event_ts_ms < ?4
           AND host = ?5
         GROUP BY host, model_id, bj_hour";

pub(crate) const SQL_HOURLY_BY_HOST_PROVIDER: &str = "SELECT host, COALESCE(provider_id, '<unknown>'),
                CAST(((event_ts_ms + ?1) / ?2) % 24 AS TEXT) AS bj_hour,
                SUM(uncached_input_tokens), SUM(cache_read_tokens),
                SUM(cache_write_tokens), SUM(output_tokens)
         FROM usage_facts
         WHERE observation_kind != 'legacy_aggregate' AND deleted_at_ms IS NULL
           AND event_ts_ms IS NOT NULL AND event_ts_ms >= ?3 AND event_ts_ms < ?4
           AND host = ?5
         GROUP BY host, provider_id, bj_hour";

/// [`facts_page_window`]：键集分页（`(event_ts_ms, fact_id)` 游标，无 OFFSET）。
pub(crate) const SQL_FACTS_PAGE_WINDOW: &str =
    "SELECT fact_id, native_session_id, model_id, event_ts_ms,
                uncached_input_tokens, cache_read_tokens, cache_write_tokens, output_tokens
         FROM usage_facts
         WHERE host = ?1 AND observation_kind != 'legacy_aggregate'
           AND deleted_at_ms IS NULL AND event_ts_ms IS NOT NULL
           AND event_ts_ms >= ?2 AND event_ts_ms < ?3
           AND (event_ts_ms, fact_id) > (?4, ?5)
         ORDER BY event_ts_ms, fact_id
         LIMIT ?6";

/// Beijing 民历日 `(y, m, d)` 的零点 → UTC 毫秒。`ms_from_civil` 已做真实
/// 日期校验（02-30 之类非法日期返回 `None`），本函数原样传导。
fn beijing_midnight_ms(y: i64, m: u32, d: u32) -> Option<i64> {
    let utc_midnight = ms_from_civil(y, m, d, 0, 0, 0)?;
    Some(utc_midnight - BEIJING_OFFSET_MS)
}

fn parse_ymd(date: &str) -> Option<(i64, u32, u32)> {
    if date.len() != 10
        || date.as_bytes().get(4) != Some(&b'-')
        || date.as_bytes().get(7) != Some(&b'-')
    {
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

const BASE_KEYS: [&str; 4] = [
    "uncached_input_tokens",
    "cache_read_tokens",
    "cache_write_tokens",
    "output_tokens",
];
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
    let mut stmt = conn.prepare(SQL_PEAKED_DAYS_MAP)?;
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
            acc.by_model_total
                .entry(model.clone())
                .or_default()
                .add(u, cr, cw, o);
            if peak == 1 {
                acc.by_model_peak
                    .entry(model)
                    .or_default()
                    .add(u, cr, cw, o);
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
            acc.by_model_peak
                .get(model)
                .copied()
                .unwrap_or_default()
                .merge_into(&PEAK_KEYS, &mut m);
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
    let mut stmt = conn.prepare(SQL_CLAUDE_DAYS)?;
    let rows = stmt.query_map(
        rusqlite::params![BEIJING_OFFSET_MS, DAY_MS, start_ms, end_ms],
        |r| {
            Ok((
                r.get::<_, i64>(0)?,
                r.get::<_, Option<String>>(1)?,
                r.get::<_, i64>(2)?,
                r.get::<_, i64>(3)?,
                r.get::<_, i64>(4)?,
                r.get::<_, i64>(5)?,
            ))
        },
    )?;
    let mut days: BTreeMap<String, Map<String, Value>> = BTreeMap::new();
    for row in rows {
        let (day_idx, model, u, cr, cw, o) = row?;
        // 无模型归属的行没有落点：claude_day_cost 按模型键计价，不知道
        // "unknown" 该归到哪张卡——与 `claude_provider_amounts` 现有的
        // unresolved 兜底一致，这里先诚实略过（真实 claude 事实恒有
        // model_raw，见 hosts/claude_code/sources/usage_fact.rs）。
        let Some(model) = model else { continue };
        let date = civil_date_from_days(day_idx);
        let bucket = days
            .entry(date)
            .or_default()
            .entry(model)
            .or_insert_with(|| {
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
    Ok(days
        .into_iter()
        .map(|(d, m)| (d, Value::Object(m)))
        .collect())
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
    let mut stmt = conn.prepare(SQL_CLAUDE_LEGACY_DAYS)?;
    let rows = stmt.query_map(
        rusqlite::params![BEIJING_OFFSET_MS, DAY_MS, start_ms, end_ms],
        |r| {
            Ok((
                r.get::<_, i64>(0)?,
                r.get::<_, Option<String>>(1)?,
                r.get::<_, i64>(2)?,
                r.get::<_, i64>(3)?,
                r.get::<_, i64>(4)?,
                r.get::<_, i64>(5)?,
            ))
        },
    )?;
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
    Ok(days
        .into_iter()
        .map(|(d, m)| (d, Value::Object(m)))
        .collect())
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
    let mut stmt = conn.prepare(SQL_CODEX_BY_HOUR_MODEL)?;
    let rows = stmt.query_map(
        rusqlite::params![BEIJING_OFFSET_MS, HOUR_MS, start_ms, end_ms],
        |r| {
            Ok((
                r.get::<_, i64>(0)?,
                r.get::<_, Option<String>>(1)?,
                r.get::<_, i64>(2)?,
                r.get::<_, i64>(3)?,
                r.get::<_, i64>(4)?,
                r.get::<_, i64>(5)?,
            ))
        },
    )?;
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
    Ok(Value::Object(
        hours
            .into_iter()
            .map(|(k, v)| (k, Value::Object(v)))
            .collect(),
    ))
}

/// Codex facts grouped by provider first, then in the legacy by-hour/model
/// shape. This keeps provider attribution from being folded into OpenAI costs.
pub fn codex_by_hour_provider_model(
    conn: &Connection,
    start_ms: i64,
    end_ms: i64,
) -> Result<BTreeMap<String, Value>, AuthorityError> {
    let mut stmt = conn.prepare(
        "SELECT CAST(((event_ts_ms + ?1) / ?2) AS INTEGER), provider_id, model_id,
                SUM(uncached_input_tokens), SUM(cache_read_tokens),
                SUM(cache_write_tokens), SUM(output_tokens)
         FROM usage_facts
         WHERE host = 'codex' AND observation_kind != 'legacy_aggregate'
           AND deleted_at_ms IS NULL AND event_ts_ms IS NOT NULL
           AND event_ts_ms >= ?3 AND event_ts_ms < ?4
         GROUP BY ((event_ts_ms + ?1) / ?2), provider_id, model_id"
    )?;
    let rows = stmt.query_map(rusqlite::params![BEIJING_OFFSET_MS, HOUR_MS, start_ms, end_ms], |r| {
        Ok((r.get::<_, i64>(0)?, r.get::<_, Option<String>>(1)?, r.get::<_, Option<String>>(2)?,
            r.get::<_, i64>(3)?, r.get::<_, i64>(4)?, r.get::<_, i64>(5)?, r.get::<_, i64>(6)?))
    })?;
    let mut out: BTreeMap<String, BTreeMap<String, Map<String, Value>>> = BTreeMap::new();
    for row in rows {
        let (hour_idx, provider, model, u, cr, cw, o) = row?;
        let provider = provider.unwrap_or_else(|| "<unknown>".to_string());
        let Some(model) = model else { continue };
        let key = format!("{}T{:02}", civil_date_from_days(hour_idx.div_euclid(24)), hour_idx.rem_euclid(24));
        let entry = out.entry(provider).or_default().entry(key).or_default();
        entry.insert(model, json!({"standard": {
            "uncached_input_tokens": u, "cached_input_tokens": cr,
            "cache_write_input_tokens": cw, "output_tokens": o,
            "reasoning_output_tokens": 0
        }}));
    }
    Ok(out.into_iter().map(|(p, h)| (p, Value::Object(h.into_iter().map(|(k,v)| (k, Value::Object(v))).collect()))).collect())
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
        let all_routed = models
            .iter()
            .all(|m| agent_vitals_domain::cost::billing_route_of(m, &pricing).is_some());
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
    let mut stmt = conn.prepare(SQL_FACTS_PAGE_WINDOW)?;
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

/// 一个北京日窗口内各宿主的 token 总量。与 [`hourly_by_host`] 不同，这里保留
/// token 恰为零的事实行：调用方因此可以区分“已同步且真零”（map 中为 0）和
/// “该宿主在窗口内没有任何 SQL 事实”（缺键，必须渲染为 unavailable/unknown，
/// 不能编成 0）。
pub fn token_totals_by_host(
    conn: &Connection,
    start_ms: i64,
    end_ms: i64,
) -> Result<BTreeMap<String, i64>, AuthorityError> {
    let mut stmt = conn.prepare(
        "SELECT host,
                SUM(uncached_input_tokens + cache_read_tokens
                    + cache_write_tokens + output_tokens)
         FROM usage_facts
         WHERE observation_kind != 'legacy_aggregate'
           AND deleted_at_ms IS NULL AND event_ts_ms IS NOT NULL
           AND event_ts_ms >= ?1 AND event_ts_ms < ?2
         GROUP BY host",
    )?;
    let rows = stmt.query_map(rusqlite::params![start_ms, end_ms], |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?))
    })?;
    rows.collect::<Result<_, _>>().map_err(AuthorityError::from)
}

/// PR #2.3：`sessions navigation` 今日 token 的只读快照——按 host 聚合
/// `usage_facts` 在指定北京日内的 4 桶之和。返回 `None` = 库不可读（与
/// r2a_store `authority_day_token_totals` 同语义）。
///
/// 与 `token_totals_by_host` 同款 SQL，只是把 [start,end) ms 解析收敛到
/// 这里，避免每个调用方各自做 `beijing_day_bounds_ms` 的 null 检查再 +1 行。
pub fn day_token_totals_by_host(
    data_home: &std::path::Path,
    date: &str,
) -> Option<BTreeMap<String, i64>> {
    let (start_ms, end_ms) = beijing_day_bounds_ms(date)?;
    let path = crate::authority::default_authority_path(data_home);
    let db = crate::authority::AuthorityDb::open_readonly(&path).ok()?;
    token_totals_by_host(db.conn(), start_ms, end_ms).ok()
}

/// PR #2.3：`sessions navigation` 今日 session 数（distinct `session_key`），
/// 按 host 分组。SQL 权威库不可读 → 返回 `None`（CLI 降级到 0 而不是冒充）。
pub fn day_session_count(data_home: &std::path::Path, date: &str, host: &str) -> Option<i64> {
    let (start_ms, end_ms) = beijing_day_bounds_ms(date)?;
    let path = crate::authority::default_authority_path(data_home);
    let db = crate::authority::AuthorityDb::open_readonly(&path).ok()?;
    let n: i64 = db
        .conn()
        .query_row(
            "SELECT COUNT(DISTINCT session_key) FROM usage_facts
             WHERE observation_kind != 'legacy_aggregate'
               AND deleted_at_ms IS NULL AND event_ts_ms IS NOT NULL
               AND host = ?1 AND event_ts_ms >= ?2 AND event_ts_ms < ?3",
            rusqlite::params![host, start_ms, end_ms],
            |r| r.get(0),
        )
        .ok()?;
    Some(n)
}

/// `(host, model)` 序列在 24 个北京小时桶上的 token 分计。
pub type HostModelHourBuckets = BTreeMap<String, HourlyCell>;

/// `hourly_by_host_model` 返回值类型——`(host, model)` → 24 桶 map。
pub type HostModelHourly = BTreeMap<(String, String), HostModelHourBuckets>;

/// `usage_hourly` 工具（spec §7.2）的 SQL 数据源：`(host, model, hour)` 三维
/// 聚合 + 四桶分计。`legacy_aggregate` 始终排除（聚合兜底行不可作小时轴可信值，
/// 与 `hourly_by_host` 同一条窗口过滤纪律）。
///
/// 返回 `HostModelHourly`——`hourly_by_host` 同款 (key, value) 形状 + `model`
/// 第二维。`model_id` 是宿主 raw 值（spec §5.1 规则 4 + D3，`usage_facts.model_id`
/// 暂未归一为 canonical）。
pub fn hourly_by_host_model(
    conn: &Connection,
    start_ms: i64,
    end_ms: i64,
    hosts: &[String],
) -> Result<HostModelHourly, AuthorityError> {
    // 单宿主查询（`host = ?` 命中 `usage_facts_host_time` 索引）——三宿主
    // 聚合用 in-memory 合并。详见 `SQL_HOURLY_BY_HOST_MODEL` 的注释。
    let selected: Vec<String> = if hosts.is_empty() {
        conn.prepare("SELECT DISTINCT host FROM usage_facts WHERE deleted_at_ms IS NULL ORDER BY host")?
            .query_map([], |r| r.get(0))?
            .collect::<Result<Vec<String>, _>>()?
    } else {
        hosts.to_vec()
    };
    if selected.is_empty() {
        return Ok(BTreeMap::new());
    }
    let mut out: HostModelHourly = BTreeMap::new();
    for host in selected {
        let mut stmt = conn.prepare(SQL_HOURLY_BY_HOST_MODEL)?;
        let rows = stmt.query_map(
            rusqlite::params![BEIJING_OFFSET_MS, HOUR_MS, start_ms, end_ms, host],
            |r| {
                Ok((
                    r.get::<_, String>(0)?,
                    r.get::<_, String>(1)?,
                    r.get::<_, String>(2)?,
                    r.get::<_, i64>(3)?,
                    r.get::<_, i64>(4)?,
                    r.get::<_, i64>(5)?,
                    r.get::<_, i64>(6)?,
                ))
            },
        )?;
        for row in rows {
            let (host, model, hour, uncached, cache_read, cache_write, output) = row?;
            let cell = HourlyCell { uncached_input_tokens: uncached, cache_read_tokens: cache_read, cache_write_tokens: cache_write, output_tokens: output };
            out.entry((host, model)).or_default().insert(format!("{:0>2}", hour), cell);
        }
    }
    Ok(out)
}

pub fn hourly_by_host_provider(
    conn: &Connection,
    start_ms: i64,
    end_ms: i64,
    hosts: &[String],
) -> Result<HostModelHourly, AuthorityError> {
    let selected: Vec<String> = if hosts.is_empty() {
        conn.prepare("SELECT DISTINCT host FROM usage_facts WHERE deleted_at_ms IS NULL ORDER BY host")?
            .query_map([], |r| r.get(0))?
            .collect::<Result<Vec<String>, _>>()?
    } else { hosts.to_vec() };
    let mut out: HostModelHourly = BTreeMap::new();
    for host in selected {
        let mut stmt = conn.prepare(SQL_HOURLY_BY_HOST_PROVIDER)?;
        let rows = stmt.query_map(
            rusqlite::params![BEIJING_OFFSET_MS, HOUR_MS, start_ms, end_ms, host],
            |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?, r.get::<_, String>(2)?,
                r.get::<_, i64>(3)?, r.get::<_, i64>(4)?, r.get::<_, i64>(5)?, r.get::<_, i64>(6)?)),
        )?;
        for row in rows {
            let (host, provider, hour, uncached, cache_read, cache_write, output) = row?;
            out.entry((host, provider)).or_default().insert(format!("{:0>2}", hour), HourlyCell {
                uncached_input_tokens: uncached, cache_read_tokens: cache_read,
                cache_write_tokens: cache_write, output_tokens: output,
            });
        }
    }
    Ok(out)
}

/// `(host, hour)` 单元——四桶原始计数 + 派生 `total`。`cache_hit_ratio` 与
/// `HourlyCell` 的 `HourlyCell::to_json()` 在响应层算（spec §6.2 诚实
/// 返回原则：输入侧全零 → `null`，不外推 0）。
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct HourlyCell {
    pub uncached_input_tokens: i64,
    pub cache_read_tokens: i64,
    pub cache_write_tokens: i64,
    pub output_tokens: i64,
}

impl HourlyCell {
    /// 四桶之和 = 总 token（M0 §5.1.1 守恒由构造）。
    pub fn total(&self) -> i64 {
        self.uncached_input_tokens + self.cache_read_tokens + self.cache_write_tokens + self.output_tokens
    }

    /// cache_hit_ratio = cache_read / (uncached + cache_read + cache_write)；
    /// 输入侧全零 → `None`（不是 0）。
    pub fn cache_hit_ratio(&self) -> Option<f64> {
        let input = self.uncached_input_tokens + self.cache_read_tokens + self.cache_write_tokens;
        if input == 0 {
            None
        } else {
            Some(self.cache_read_tokens as f64 / input as f64)
        }
    }

    pub fn to_json(&self) -> Value {
        json!({
            "uncached_input_tokens": self.uncached_input_tokens,
            "cache_read_tokens": self.cache_read_tokens,
            "cache_write_tokens": self.cache_write_tokens,
            "output_tokens": self.output_tokens,
            "total": self.total(),
            "cache_hit_ratio": self.cache_hit_ratio(),
        })
    }
}

// ─────────────────────── Q04 会话下钻 ───────────────────────

/// 一个会话在查询窗口（可再按北京小时过滤）内的聚合。`session_key` 内嵌宿主
/// 原生 id——**调用方（MCP 工具）必须 HMAC 成 `session_ref`，绝不原样返回**。
#[derive(Debug, Clone)]
pub struct SessionAgg {
    pub session_key: String,
    pub host: String,
    pub first_event_ms: i64,
    pub last_event_ms: i64,
    pub event_count: i64,
    pub uncached_input_tokens: i64,
    pub cache_read_tokens: i64,
    pub cache_write_tokens: i64,
    pub output_tokens: i64,
    /// 其中落在 DSH 高峰时段的 token（`event_peak != 0`）。
    pub peak_tokens: i64,
    pub model_ids: Vec<String>,
}

impl SessionAgg {
    pub fn total(&self) -> i64 {
        self.uncached_input_tokens
            + self.cache_read_tokens
            + self.cache_write_tokens
            + self.output_tokens
    }
}

/// 单宿主 SQL（`host = ?1` 命中 `usage_facts_host_time`）。`?4 < 0` = 不按小时
/// 过滤；否则只算 `bj_hour == ?4` 的事实——**Q04 峰值下钻**要的正是「该小时
/// 的会话构成」，SUM 因此自动被 WHERE 收窄到那一小时。
const SQL_SESSIONS_IN_WINDOW: &str = "SELECT session_key, host,
            MIN(event_ts_ms), MAX(event_ts_ms), COUNT(*),
            SUM(uncached_input_tokens), SUM(cache_read_tokens),
            SUM(cache_write_tokens), SUM(output_tokens),
            SUM(CASE WHEN event_peak != 0 THEN
                (uncached_input_tokens + cache_read_tokens
                 + cache_write_tokens + output_tokens) ELSE 0 END),
            GROUP_CONCAT(DISTINCT COALESCE(model_id, '<unknown>'))
     FROM usage_facts
     WHERE host = ?1
       AND observation_kind != 'legacy_aggregate'
       AND deleted_at_ms IS NULL AND event_ts_ms IS NOT NULL
       AND session_key IS NOT NULL
       AND event_ts_ms >= ?2 AND event_ts_ms < ?3
       AND (?4 < 0 OR (((event_ts_ms + ?5) / ?6) % 24) = ?4)
     GROUP BY session_key";

/// 窗口内的会话聚合，跨 wired 宿主合并。`hour` = 北京小时过滤（`None` = 不过滤）；
/// `min_tokens` = HAVING 门槛；按 `total` 降序 + `session_key` 升序稳定排序，
/// keyset 分页（cursor = 上一页尾行的 `(total, session_key)`）。返回 (rows,
/// has_more, window_total_tokens)——`window_total_tokens` 让调用方核对
/// 「所有会话之和 == 窗口/峰值总量」（Q04 不变式）。
#[allow(clippy::too_many_arguments)]
pub fn sessions_in_window(
    conn: &Connection,
    start_ms: i64,
    end_ms: i64,
    hosts: &[String],
    hour: Option<u32>,
    min_tokens: i64,
    after_total: Option<i64>,
    after_key: Option<&str>,
    limit: usize,
) -> Result<(Vec<SessionAgg>, bool, i64), AuthorityError> {
    let selected: Vec<String> = if hosts.is_empty() {
        conn.prepare("SELECT DISTINCT host FROM usage_facts WHERE deleted_at_ms IS NULL ORDER BY host")?
            .query_map([], |r| r.get(0))?
            .collect::<Result<Vec<String>, _>>()?
    } else {
        hosts.to_vec()
    };
    let hour_param: i64 = hour.map(|h| h as i64).unwrap_or(-1);

    let mut all: Vec<SessionAgg> = Vec::new();
    for host in selected {
        let mut stmt = conn.prepare(SQL_SESSIONS_IN_WINDOW)?;
        let rows = stmt.query_map(
            rusqlite::params![host, start_ms, end_ms, hour_param, BEIJING_OFFSET_MS, HOUR_MS],
            |r| {
                let models: Option<String> = r.get(10)?;
                Ok(SessionAgg {
                    session_key: r.get(0)?,
                    host: r.get(1)?,
                    first_event_ms: r.get(2)?,
                    last_event_ms: r.get(3)?,
                    event_count: r.get(4)?,
                    uncached_input_tokens: r.get(5)?,
                    cache_read_tokens: r.get(6)?,
                    cache_write_tokens: r.get(7)?,
                    output_tokens: r.get(8)?,
                    peak_tokens: r.get(9)?,
                    model_ids: models
                        .map(|s| s.split(',').map(|x| x.trim().to_string()).collect())
                        .unwrap_or_default(),
                })
            },
        )?;
        for row in rows {
            all.push(row?);
        }
    }

    let window_total: i64 = all.iter().map(SessionAgg::total).sum();

    all.retain(|s| s.total() >= min_tokens);
    // total 降序、session_key 升序——稳定、可 keyset 分页。
    all.sort_by(|x, y| y.total().cmp(&x.total()).then_with(|| x.session_key.cmp(&y.session_key)));
    if let (Some(at), Some(ak)) = (after_total, after_key) {
        all.retain(|s| s.total() < at || (s.total() == at && s.session_key.as_str() > ak));
    }
    let has_more = all.len() > limit;
    all.truncate(limit);
    Ok((all, has_more, window_total))
}

/// 一个会话的行级事实时间线（`session_detail`）。按 `(event_ts_ms, fact_id)`
/// keyset 分页。排除 `legacy_aggregate`（聚合行不是会话证据，§4 分离纪律）。
#[derive(Debug, Clone)]
pub struct TimelineFact {
    pub fact_id: String,
    pub model_id: Option<String>,
    pub event_ts_ms: i64,
    pub event_peak: bool,
    pub uncached_input_tokens: i64,
    pub cache_read_tokens: i64,
    pub cache_write_tokens: i64,
    pub output_tokens: i64,
    pub observation_kind: String,
}

const SQL_SESSION_TIMELINE: &str = "SELECT fact_id, model_id, event_ts_ms, event_peak,
            uncached_input_tokens, cache_read_tokens, cache_write_tokens, output_tokens,
            observation_kind
     FROM usage_facts
     WHERE session_key = ?1
       AND observation_kind != 'legacy_aggregate'
       AND deleted_at_ms IS NULL AND event_ts_ms IS NOT NULL
       AND (event_ts_ms, fact_id) > (?2, ?3)
     ORDER BY event_ts_ms, fact_id
     LIMIT ?4";

/// 返回 (facts, has_more)。`session_key` 由调用方从 `session_ref` 反解得到。
pub fn session_facts_timeline(
    conn: &Connection,
    session_key: &str,
    after_ts: Option<i64>,
    after_fact_id: Option<&str>,
    limit: usize,
) -> Result<(Vec<TimelineFact>, bool), AuthorityError> {
    let mut stmt = conn.prepare(SQL_SESSION_TIMELINE)?;
    let rows = stmt.query_map(
        rusqlite::params![
            session_key,
            after_ts.unwrap_or(i64::MIN),
            after_fact_id.unwrap_or(""),
            limit as i64 + 1,
        ],
        |r| {
            Ok(TimelineFact {
                fact_id: r.get(0)?,
                model_id: r.get(1)?,
                event_ts_ms: r.get(2)?,
                event_peak: r.get::<_, i64>(3)? != 0,
                uncached_input_tokens: r.get(4)?,
                cache_read_tokens: r.get(5)?,
                cache_write_tokens: r.get(6)?,
                output_tokens: r.get(7)?,
                observation_kind: r.get(8)?,
            })
        },
    )?;
    let mut rows: Vec<TimelineFact> = rows.collect::<Result<_, _>>()?;
    let has_more = rows.len() > limit;
    rows.truncate(limit);
    Ok((rows, has_more))
}

/// 会话行的宿主 + 元数据（`session_detail` 组 envelope 用）。`None` = 会话不存在
/// 或已 soft-delete。
pub fn session_row(
    conn: &Connection,
    session_key: &str,
) -> Result<Option<(String, Option<String>)>, AuthorityError> {
    conn.query_row(
        "SELECT host, source_profile FROM sessions
         WHERE session_key = ?1 AND deleted_at_ms IS NULL",
        rusqlite::params![session_key],
        |r| Ok((r.get::<_, String>(0)?, r.get::<_, Option<String>>(1)?)),
    )
    .optional()
    .map_err(AuthorityError::from)
}

/// `session_detail` 反解 `session_ref` 用的候选 `session_key` 全集。本机量级
/// （真机 ~300），逐个算 HMAC 找匹配是微秒级。
pub fn all_session_keys(conn: &Connection) -> Result<Vec<String>, AuthorityError> {
    let mut stmt = conn.prepare("SELECT session_key FROM sessions WHERE deleted_at_ms IS NULL")?;
    let rows = stmt.query_map([], |r| r.get::<_, String>(0))?;
    rows.collect::<Result<_, _>>().map_err(AuthorityError::from)
}

// ─────── v0.9.1 最后一公里（PR #2）：sessions_search / session_detail envelope
// 加 `cost_minor` 字段──走 `usage_facts × pricing_snapshots` JOIN，按事件时间
// 选历史价卡（Q13），按模型 8 桶折成 `cost_report` 期望的 `by_model` 形状
// 再过 `agent_vitals_domain::cost::cost_report` 派生成本。
//
// **不在这里长第二份计价规则**：8 桶折算、peak/off-peak 拆分、未知模型归
// `unpriced_tokens`、baseline/fallback 标记——全是 `cost_report` 已经做对
// 的事；本函数只负责"从 SQL 拉数据喂给它"。`CostReport` 跑空 → `None`
// （与 `cost_report` 同语义，spec §0.1 不得伪造零成本）。

/// `session_cost_minor`：把一个会话的 8 桶 token 数 + 事件时间喂给
/// `cost_report` 用的中间聚合。**仅含实时行级事实**（与本模块其他查询同款：
/// `observation_kind != 'legacy_aggregate'`）——claude 深历史的 legacy_aggregate
/// 行不在这里加和，那是 `claude_day_cost` 的事（口径不同、价卡路径不同）。
///
/// `MAX(event_ts_ms)` 一并带出——用它去 `pricing_snapshot_asof` 选历史价卡
/// 版本（Q13：调价日前后分别用正确的价表）。
pub(crate) const SQL_SESSION_COST_BUCKETS: &str = "SELECT host, provider_id, COALESCE(model_id, '<unknown>') AS model,
                event_peak,
                SUM(uncached_input_tokens), SUM(cache_read_tokens),
                SUM(cache_write_tokens), SUM(output_tokens),
                MAX(event_ts_ms)
         FROM usage_facts
         WHERE session_key = ?1
           AND observation_kind != 'legacy_aggregate'
           AND deleted_at_ms IS NULL AND event_ts_ms IS NOT NULL
         GROUP BY model_id, event_peak";

/// 一个会话的 cost_minor（按价表**估算**的 metered_actual）。
///
/// 路径：`usage_facts` 折成 8 桶 → 选 `pricing_snapshot.asof(MAX(event_ts_ms))`
/// → `cost_report(usage, snapshot)` → 把 `total: f64` 一次 pyround 转最小货币
/// 单位整数（与 `agent_vitals_runtime::money::from_f64` 同样的舍入规则——
/// 这里内联一份以避免 `agent-vitals-data` 反向依赖 `agent-vitals-runtime`，
/// 依赖方向还是 `runtime → data → domain`）。
///
/// 返回 `None` 的语义（spec §0.1 不冒充）：
/// - 该会话无 `usage_facts` 行（无事实即无成本，与 `cost_report` 同语义）
/// - 没有任何 `pricing_snapshot` 能覆盖到 `MAX(event_ts_ms)`
/// - 价格表里没有任何模型可计价（`cost_report` 自身返 None）
/// - `total` 不是有限非负数（NaN/Inf/负→不冒充）
///
/// `BillingBasis::MeteredEstimate`：与 `host_bills` 的 `MeteredActual` 不同
/// 档位（spec §4 不冒充）。调用方拿到 basis 必须如实透出到 DTO，
/// 不与 `host_bills` 加和进 `summable_total`。
pub fn session_cost_minor(
    conn: &Connection,
    session_key: &str,
) -> Result<Option<agent_vitals_domain::data_contract::MoneyMinor>, AuthorityError> {
    use agent_vitals_domain::data_contract::{BillingBasis, MoneyMinor};
    use std::collections::BTreeMap;

    // 1. 聚合 8 桶 + peak 拆分 + max ts。`(model, event_peak)` 两轴 group by，
    //    Rust 端再按 model 合并 peak / off_peak 拆分。
    let mut stmt = conn.prepare(SQL_SESSION_COST_BUCKETS)?;
    let rows = stmt.query_map(
        rusqlite::params![session_key],
        |r| {
            Ok((
                r.get::<_, String>(0)?,
                r.get::<_, Option<String>>(1)?,
                r.get::<_, String>(2)?,
                r.get::<_, i64>(3)?,
                r.get::<_, i64>(4)?,
                r.get::<_, i64>(5)?,
                r.get::<_, i64>(6)?,
                r.get::<_, i64>(7)?,
                r.get::<_, i64>(8)?,
            ))
        },
    )?;
    // model → {off_peak 4 桶, peak 4 桶}
    #[derive(Default)]
    struct Split {
        u_off: i64, cr_off: i64, cw_off: i64, o_off: i64,
        u_peak: i64, cr_peak: i64, cw_peak: i64, o_peak: i64,
    }
    let mut by_model: BTreeMap<String, Split> = BTreeMap::new();
    let mut codex_unknown: BTreeMap<String, Split> = BTreeMap::new();
    let mut host: Option<String> = None;
    let mut max_ts: i64 = 0;
    for row in rows {
        let (row_host, provider, model, peak, u, cr, cw, o, ts) = row?;
        host = Some(row_host.clone());
        let model_key = model.clone();
        let entry = by_model.entry(model).or_default();
        if peak != 0 {
            entry.u_peak += u;
            entry.cr_peak += cr;
            entry.cw_peak += cw;
            entry.o_peak += o;
        } else {
            entry.u_off += u;
            entry.cr_off += cr;
            entry.cw_off += cw;
            entry.o_off += o;
        }
        if ts > max_ts {
            max_ts = ts;
        }
        if row_host == "codex" && provider.as_deref() != Some("openai") {
            let entry = codex_unknown.entry(model_key).or_default();
            if peak != 0 {
                entry.u_peak += u;
                entry.cr_peak += cr;
                entry.cw_peak += cw;
                entry.o_peak += o;
            } else {
                entry.u_off += u;
                entry.cr_off += cr;
                entry.cw_off += cw;
                entry.o_off += o;
            }
        }
    }
    if by_model.is_empty() || max_ts == 0 {
        return Ok(None);
    }

    // 2. 选历史价卡：调价日前后用正确版本（Q13）。
    let snap_payload: Option<String> = conn
        .query_row(
            "SELECT payload_json FROM pricing_snapshots
             WHERE captured_at_ms <= ?1
             ORDER BY captured_at_ms DESC, pricing_version DESC LIMIT 1",
            rusqlite::params![max_ts],
            |r| r.get::<_, String>(0),
        )
        .optional()?;
    let Some(snap_payload) = snap_payload else {
        return Ok(None);
    };
    let snap_pricing: serde_json::Value = match serde_json::from_str(&snap_payload) {
        Ok(v) => v,
        Err(_) => return Ok(None), // 脏价卡不致命：会话本身有数据，cost 字段为 None
    };

    // Codex unknown/custom routes use the official USD card from the same
    // immutable snapshot. Explicit OpenAI subscription facts are excluded.
    if host.as_deref() == Some("codex") && !codex_unknown.is_empty() {
        let codex_pricing = snap_pricing.get("codex_pricing").unwrap_or(&snap_pricing);
        let entries = codex_pricing
            .get("entries")
            .and_then(|v| v.as_array())
            .map(Vec::as_slice)
            .unwrap_or(&[]);
        let mut total_usd = 0.0;
        let mut codex_unpriced_tokens = 0i64;
        for (model, s) in &codex_unknown {
            let Some(entry) = agent_vitals_domain::cost::codex_resolve_entry(model, "standard", entries)
            else {
                codex_unpriced_tokens += s.u_off + s.cr_off + s.cw_off + s.o_off
                    + s.u_peak + s.cr_peak + s.cw_peak + s.o_peak;
                continue;
            };
            total_usd += agent_vitals_domain::cost::codex_price_bucket(
                &json!({
                    "uncached_input_tokens": s.u_off + s.u_peak,
                    "cached_input_tokens": s.cr_off + s.cr_peak,
                    "cache_write_input_tokens": s.cw_off + s.cw_peak,
                    "output_tokens": s.o_off + s.o_peak,
                    "reasoning_output_tokens": 0,
                }),
                entry,
                None,
            );
        }
        if codex_unpriced_tokens > 0 {
            return Ok(None);
        }
        if total_usd.is_finite() && total_usd > 0.0 {
            return Ok(Some(MoneyMinor {
                amount_minor: (agent_vitals_domain::util::pyround(total_usd, 2) * 100.0).round()
                    as i64,
                currency: "USD".to_string(),
                basis: BillingBasis::MeteredEstimate,
            }));
        }
    }

    // 3. 折成 cost_report 期望的 by_model 形状：每个模型的 8 个基础字段
    //    （uncached_input + cache_read + cache_write + output 的总桶 + 高峰子桶）。
    let mut by_model_json = serde_json::Map::new();
    for (model, s) in &by_model {
        by_model_json.insert(
            model.clone(),
            json!({
                "uncached_input_tokens": s.u_off + s.u_peak,
                "cache_read_tokens": s.cr_off + s.cr_peak,
                "cache_write_tokens": s.cw_off + s.cw_peak,
                "output_tokens": s.o_off + s.o_peak,
                "peak_uncached_input_tokens": s.u_peak,
                "peak_cache_read_tokens": s.cr_peak,
                "peak_cache_write_tokens": s.cw_peak,
                "peak_output_tokens": s.o_peak,
            }),
        );
    }
    let usage = json!({ "by_model": by_model_json });

    // 4. 跑核心计价——不在这里长第二份规则。
    let report = match agent_vitals_domain::cost::cost_report(&usage, &snap_pricing) {
        Some(r) => r,
        None => return Ok(None),
    };

    // A nullable cost field cannot carry a partial estimate. Never turn an
    // unpriced report into a misleading zero/partial amount.
    if report["unpriced_tokens"].as_i64().unwrap_or(0) > 0 {
        return Ok(None);
    }

    let total = report["total"].as_f64().unwrap_or(0.0);
    if !total.is_finite() || total < 0.0 {
        return Ok(None);
    }
    // cost_report 当前硬编码 currency="CNY"（DSH-style pricing.json 结构）。
    // pricing_snapshots 若将来落其它币种价卡，cost_report 会回填相应 currency；
    // 这里透出 report 里的 currency，不二次假设。
    let currency = report["currency"].as_str().unwrap_or("CNY");
    let n = match currency.to_ascii_uppercase().as_str() {
        "CNY" | "USD" | "EUR" | "GBP" | "HKD" | "SGD" | "AUD" | "CAD" | "CHF" | "NZD" => 2,
        "JPY" | "KRW" => 0,
        "KWD" | "BHD" | "OMR" => 3,
        // 未知币种不走主路径，避免 0.125 ¥ 误归到 0.125 元的精度——返回 None，
        // 由调用方报 warning 而不是交一个精度未定义的 MoneyMinor 出去。
        _ => return Ok(None),
    };
    let rounded = agent_vitals_domain::util::pyround(total, n);
    let amount_minor = (rounded * 10f64.powi(n as i32)).round() as i64;
    Ok(Some(MoneyMinor {
        amount_minor,
        currency: currency.to_string(),
        basis: BillingBasis::MeteredEstimate,
    }))
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
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
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
        insert_fact(
            &db,
            "f1",
            "dsh",
            Some("deepseek-v4-pro"),
            "turn",
            start + 3_600_000,
            0,
            100,
            10,
            5,
            20,
        );
        insert_fact(
            &db,
            "f2",
            "dsh",
            Some("deepseek-v4-pro"),
            "turn",
            start + 4_000_000,
            1,
            50,
            0,
            0,
            10,
        );
        insert_fact(
            &db,
            "f3",
            "dsh",
            None,
            "turn",
            start + 5_000_000,
            0,
            7,
            0,
            0,
            1,
        ); // 无模型归属
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
        insert_fact(
            &db,
            "f4",
            "dsh",
            Some("x"),
            "turn",
            end + 1,
            0,
            999,
            0,
            0,
            0,
        );
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
        insert_fact(
            &db,
            "f1",
            "dsh",
            Some("m"),
            "turn",
            start + 1000,
            0,
            10,
            0,
            0,
            0,
        );
        insert_fact(
            &db,
            "f2",
            "dsh",
            Some("m"),
            "legacy_aggregate",
            start + 1000,
            0,
            999,
            0,
            0,
            0,
        );
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
        insert_fact(
            &db,
            "f1",
            "claude-code",
            Some("claude-opus-4"),
            "message",
            start + 1000,
            0,
            100,
            20,
            5,
            30,
        );
        insert_fact(
            &db,
            "f2",
            "claude-code",
            Some("claude-opus-4"),
            "message",
            start + 2000,
            1,
            50,
            0,
            0,
            10,
        );
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
        insert_fact(
            &db,
            "f1",
            "claude-code",
            Some("claude-opus-4"),
            "legacy_aggregate",
            start,
            0,
            1000,
            100,
            50,
            200,
        );
        insert_fact(
            &db,
            "f2",
            "claude-code",
            Some("claude-opus-4"),
            "legacy_aggregate",
            start,
            1,
            300,
            0,
            0,
            60,
        );
        let days = claude_legacy_days(db.conn(), start, end).unwrap();
        let bucket = &days["2026-01-05"]["claude-opus-4"];
        assert_eq!(
            bucket["input_tokens"],
            json!(1000),
            "只读 base 行，不叠加峰值子集"
        );
        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn codex_by_hour_model_buckets_speed_as_standard() {
        let path = tmp_db("codex");
        let db = AuthorityDb::open(&path, 1).unwrap();
        let (start, _) = beijing_day_bounds_ms("2026-09-05").unwrap();
        insert_fact(
            &db,
            "f1",
            "codex",
            Some("gpt-5.6-sol"),
            "token_count",
            start + 3_600_000,
            0,
            800,
            200,
            50,
            80,
        );
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
        insert_fact(
            &db,
            "h1",
            "claude-code",
            Some("m"),
            "turn",
            start + 3_600_000,
            0,
            10,
            0,
            0,
            5,
        );
        insert_fact(
            &db,
            "h2",
            "codex",
            Some("m"),
            "token_count",
            start + 8 * 3_600_000,
            0,
            20,
            0,
            0,
            2,
        );
        insert_fact(
            &db,
            "h3",
            "dsh",
            Some("m"),
            "turn",
            start + 23 * 3_600_000,
            0,
            30,
            0,
            0,
            3,
        );
        insert_fact(
            &db,
            "h4",
            "dsh",
            Some("m"),
            "legacy_aggregate",
            start + 3_600_000,
            0,
            999,
            0,
            0,
            0,
        );
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
    fn token_totals_by_host_keeps_zero_rows_and_excludes_legacy_aggregates() {
        let path = tmp_db("token-totals");
        let db = AuthorityDb::open(&path, 1).unwrap();
        let (start, end) = beijing_day_bounds_ms("2026-09-05").unwrap();
        insert_fact(
            &db,
            "live",
            "dsh",
            Some("m"),
            "turn",
            start + 1,
            0,
            10,
            20,
            0,
            3,
        );
        insert_fact(
            &db,
            "zero",
            "codex",
            Some("m"),
            "turn",
            start + 2,
            0,
            0,
            0,
            0,
            0,
        );
        insert_fact(
            &db,
            "legacy",
            "claude-code",
            Some("m"),
            "legacy_aggregate",
            start + 3,
            0,
            999,
            0,
            0,
            0,
        );
        let totals = token_totals_by_host(db.conn(), start, end).unwrap();
        assert_eq!(totals.get("dsh"), Some(&33));
        assert_eq!(totals.get("codex"), Some(&0), "真零必须保留为一行");
        assert!(
            !totals.contains_key("claude-code"),
            "深历史聚合不是当日实时 token"
        );
        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn facts_page_window_is_stable_and_cursor_paginates_without_drift() {
        let path = tmp_db("facts-page");
        let db = AuthorityDb::open(&path, 1).unwrap();
        db.begin_run("run", "cli", 1).unwrap();
        let (start, end) = beijing_day_bounds_ms("2026-09-05").unwrap();
        // 同一毫秒两条事实（键集分页的并列场景）+ 一条 legacy（必须排除）。
        insert_fact(
            &db,
            "b",
            "dsh",
            Some("m"),
            "turn",
            start + 1_000,
            0,
            1,
            0,
            0,
            1,
        );
        insert_fact(
            &db,
            "a",
            "dsh",
            Some("m"),
            "turn",
            start + 1_000,
            0,
            2,
            0,
            0,
            2,
        );
        insert_fact(
            &db,
            "c",
            "dsh",
            Some("m"),
            "turn",
            start + 2_000,
            0,
            3,
            0,
            0,
            3,
        );
        insert_fact(
            &db,
            "lg",
            "dsh",
            Some("m"),
            "legacy_aggregate",
            start + 1_500,
            0,
            999,
            0,
            0,
            0,
        );
        // 首页 limit=2：按 (ts, fact_id) 升序 → a, b；has_more。
        let (p1, more1) = facts_page_window(db.conn(), "dsh", start, end, None, None, 2).unwrap();
        assert!(more1);
        let ids1: Vec<&str> = p1.iter().map(|r| r.fact_id.as_str()).collect();
        assert_eq!(ids1, vec!["a", "b"], "同毫秒按 fact_id 决胜；legacy 排除");
        // 用首页尾行做 cursor → c；无更多。
        let last = p1.last().unwrap();
        let (p2, more2) = facts_page_window(
            db.conn(),
            "dsh",
            start,
            end,
            Some(last.event_ts_ms),
            Some(&last.fact_id),
            2,
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
        assert_eq!(
            coverage_status(db.conn(), "dsh", start, end).unwrap(),
            (0, 3)
        );
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
        insert_fact(
            &db,
            "f1",
            "dsh",
            Some("deepseek-v4-flash"),
            "turn",
            start + 1_000,
            0,
            100,
            0,
            0,
            10,
        );
        insert_fact(
            &db,
            "f2",
            "dsh",
            Some("zero-model"),
            "turn",
            start + 2_000,
            0,
            0,
            0,
            0,
            0,
        );
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
        insert_fact(
            &db,
            "f3",
            "dsh",
            Some("moonshot-kimi-x"),
            "turn",
            start + 3_000,
            0,
            50,
            0,
            0,
            5,
        );
        let (m3, _) = coverage_status(db.conn(), "dsh", start, end).unwrap();
        assert_eq!(m3, 1, "无路由模型让 price 维也落空");
        let _ = std::fs::remove_file(&path);
    }

    /// v0.9.1 测试矩阵 §8 行 8「performance（不枚举原始日志/索引命中）」。
    ///
    /// SQL 权威库的整个存在理由是「查询不枚举原始日志」——每个窗口化聚合
    /// 必须命中 `usage_facts_host_time`（`(host, event_ts_ms)` 部分索引），
    /// 绝不 `SCAN usage_facts`（全表）。一个错的查询会**静默**退化成全表扫
    /// （功能对、性能崩），没有异常没有红测——只有真机 5 万行时的卡顿，正是
    /// 2026-09-05 tab 卡顿事故的形状。这条断言把「退化」变成编译期就该发现
    /// 的红。SQL 与 `prepare()` 共用 `SQL_*` const，零漂移。
    #[test]
    fn windowed_queries_hit_the_host_time_index_never_full_scan() {
        let path = tmp_db("qplan");
        let db = AuthorityDb::open(&path, 1).unwrap();
        // 三宿主各塞几行——EXPLAIN QUERY PLAN 不依赖行数，但有数据时 SQLite
        // 更可能选真实计划而非退化到 "SCAN"（空表任何查询都 SCAN）。
        let (s, _e) = beijing_day_bounds_ms("2026-09-05").unwrap();
        for (i, host) in ["dsh", "claude-code", "codex"].iter().enumerate() {
            insert_fact(
                &db,
                &format!("f{i}a"),
                host,
                Some("m"),
                "turn",
                s + 3_600_000,
                0,
                100,
                0,
                0,
                10,
            );
            insert_fact(
                &db,
                &format!("f{i}b"),
                host,
                Some("m"),
                "turn",
                s + 7_200_000,
                1,
                50,
                0,
                0,
                5,
            );
        }
        insert_fact(
            &db,
            "lg",
            "claude-code",
            Some("m"),
            "legacy_aggregate",
            s + 1_000,
            0,
            9,
            0,
            0,
            0,
        );
        db.conn().execute("ANALYZE", []).unwrap();

        let end = s + DAY_MS;
        let plan = |sql: &str, params: &[&dyn rusqlite::ToSql]| -> String {
            let mut stmt = db
                .conn()
                .prepare(&format!("EXPLAIN QUERY PLAN {sql}"))
                .unwrap();
            let rows: Vec<String> = stmt
                .query_map(params, |r| r.get::<_, String>(3))
                .unwrap()
                .map(Result::unwrap)
                .collect();
            rows.join(" | ")
        };

        let day_params: [&dyn rusqlite::ToSql; 4] = [&BEIJING_OFFSET_MS, &DAY_MS, &s, &end];
        let hour_params: [&dyn rusqlite::ToSql; 4] = [&BEIJING_OFFSET_MS, &HOUR_MS, &s, &end];
        let peak_params: [&dyn rusqlite::ToSql; 5] =
            [&BEIJING_OFFSET_MS, &DAY_MS, &"dsh", &s, &end];
        let page_after_ts = i64::MIN;
        let page_after_id = "";
        let page_limit = 50_i64;
        let page_params: [&dyn rusqlite::ToSql; 6] =
            [&"dsh", &s, &end, &page_after_ts, &page_after_id, &page_limit];
        // `hourly_by_host_model` = 单宿主 SQL + 在 fn 内 in-memory 合并 3 宿主。
        // EXPLAIN 只测一条 host 字面量是否命中索引——三宿主合并是 fn 行为，
        // 不在 SQL planner 视野内。
        let hourly_h_params: [&dyn rusqlite::ToSql; 5] =
            [&BEIJING_OFFSET_MS, &HOUR_MS, &s, &end, &"claude-code"];
        let no_hour: i64 = -1;
        let sessions_params: [&dyn rusqlite::ToSql; 6] =
            [&"dsh", &s, &end, &no_hour, &BEIJING_OFFSET_MS, &HOUR_MS];

        for (name, sql, params) in [
            ("peaked_days_map", SQL_PEAKED_DAYS_MAP, &peak_params[..]),
            ("claude_days", SQL_CLAUDE_DAYS, &day_params[..]),
            ("claude_legacy_days", SQL_CLAUDE_LEGACY_DAYS, &day_params[..]),
            ("codex_by_hour_model", SQL_CODEX_BY_HOUR_MODEL, &hour_params[..]),
            ("hourly_by_host_model", SQL_HOURLY_BY_HOST_MODEL, &hourly_h_params[..]),
            ("facts_page_window", SQL_FACTS_PAGE_WINDOW, &page_params[..]),
            ("sessions_in_window", SQL_SESSIONS_IN_WINDOW, &sessions_params[..]),
        ] {
            let p = plan(sql, params);
            assert!(
                p.contains("USING INDEX usage_facts_host_time"),
                "{name} 必须命中 usage_facts_host_time——计划：{p}"
            );
            assert!(
                !p.contains("SCAN usage_facts"),
                "{name} 不得全表扫 usage_facts——计划：{p}"
            );
        }

        // session_detail 时间线走 session_key 索引（不是 host_time）。
        let tl_ts = i64::MIN;
        let tl_id = "";
        let tl_limit = 50_i64;
        let tl_params: [&dyn rusqlite::ToSql; 4] = [&"3:dsh|1:s|1:n", &tl_ts, &tl_id, &tl_limit];
        let p = plan(SQL_SESSION_TIMELINE, &tl_params[..]);
        assert!(
            p.contains("USING INDEX usage_facts_session_time"),
            "session_facts_timeline 必须命中 usage_facts_session_time——计划：{p}"
        );
        assert!(!p.contains("SCAN usage_facts"), "计划：{p}");

        let _ = std::fs::remove_file(&path);
    }

    #[allow(clippy::too_many_arguments)]
    fn insert_session_fact(
        db: &AuthorityDb,
        fact_id: &str,
        host: &str,
        session_key: &str,
        model_id: &str,
        event_ts_ms: i64,
        event_peak: i64,
        tokens: i64,
    ) {
        db.conn()
            .execute(
                "INSERT INTO sync_runs(run_id, started_at_ms, trigger, status, schema_version)
                 VALUES ('run', 1, 'cli', 'succeeded', 2) ON CONFLICT(run_id) DO NOTHING",
                [],
            )
            .unwrap();
        db.conn()
            .execute(
                "INSERT INTO sessions(session_key, host, native_session_id, machine_namespace,
                     source_profile, last_observed_at_ms)
                 VALUES (?1, ?2, ?3, 'm', 'default', 1) ON CONFLICT(session_key) DO NOTHING",
                rusqlite::params![session_key, host, format!("native-{session_key}")],
            )
            .unwrap();
        db.conn()
            .execute(
                "INSERT INTO usage_facts(fact_id, host, machine_namespace, native_session_id,
                     session_key, source_event_id, observation_kind, model_id, event_ts_ms,
                     event_peak, uncached_input_tokens, cache_read_tokens, cache_write_tokens,
                     output_tokens, ingested_run_id, created_at_ms, updated_at_ms)
                 VALUES (?1, ?2, 'm', ?3, ?4, ?1, 'assistant-usage', ?5, ?6, ?7, ?8, 0, 0, 0,
                         'run', 1, 1)",
                rusqlite::params![
                    fact_id, host, format!("native-{session_key}"), session_key, model_id,
                    event_ts_ms, event_peak, tokens
                ],
            )
            .unwrap();
    }

    #[test]
    fn sessions_in_window_aggregates_and_hour_filter_sums_to_the_hour() {
        let path = tmp_db("sess-agg");
        let db = AuthorityDb::open(&path, 1).unwrap();
        let (start, end) = beijing_day_bounds_ms("2026-09-07").unwrap();
        let h9 = start + 9 * HOUR_MS;
        let h22 = start + 22 * HOUR_MS;
        // sA: 09点 100 + 22点 300；sB: 22点 500；sC(codex): 09点 40。
        insert_session_fact(&db, "f1", "claude-code", "kA", "m-a", h9, 0, 100);
        insert_session_fact(&db, "f2", "claude-code", "kA", "m-a", h22, 0, 300);
        insert_session_fact(&db, "f3", "claude-code", "kB", "m-b", h22 + 60_000, 0, 500);
        insert_session_fact(&db, "f4", "codex", "kC", "m-c", h9 + 60_000, 0, 40);

        // 无小时过滤：3 会话，window_total = 940。
        let (rows, more, wt) =
            sessions_in_window(db.conn(), start, end, &[], None, 0, None, None, 50).unwrap();
        assert_eq!(rows.len(), 3);
        assert!(!more);
        assert_eq!(wt, 940);
        // total 降序：kA(400) > kB(500)? no — kB=500 > kA=400. 顺序 kB, kA, kC。
        assert_eq!(rows[0].session_key, "kB");
        assert_eq!(rows[0].total(), 500);
        assert_eq!(rows[1].session_key, "kA");
        assert_eq!(rows[1].total(), 400);
        assert_eq!(rows[1].event_count, 2);
        assert_eq!(rows[1].first_event_ms, h9);
        assert_eq!(rows[1].last_event_ms, h22);

        // 22 点过滤：kA 贡献 300、kB 贡献 500 → sum == 800（== usage_hourly 22点 total）。
        let (rows, _, wt22) =
            sessions_in_window(db.conn(), start, end, &[], Some(22), 0, None, None, 50).unwrap();
        assert_eq!(wt22, 800, "Q04 不变式：会话之和 == 峰值小时总量");
        assert_eq!(rows.iter().map(|s| s.total()).sum::<i64>(), 800);
        assert!(rows.iter().all(|s| s.host == "claude-code"));

        // host 过滤 + min_tokens。
        let (rows, _, _) =
            sessions_in_window(db.conn(), start, end, &["codex".into()], None, 0, None, None, 50)
                .unwrap();
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].session_key, "kC");
        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn session_timeline_is_time_ordered_and_paginates() {
        let path = tmp_db("sess-tl");
        let db = AuthorityDb::open(&path, 1).unwrap();
        let (start, _) = beijing_day_bounds_ms("2026-09-07").unwrap();
        for (i, id) in ["a", "b", "c", "d"].iter().enumerate() {
            insert_session_fact(
                &db, id, "dsh", "kX", "m", start + (i as i64) * HOUR_MS,
                if i == 2 { 1 } else { 0 }, 10,
            );
        }
        // 别的会话的行不能混进来。
        insert_session_fact(&db, "z", "dsh", "kOther", "m", start, 0, 999);

        let (p1, more) = session_facts_timeline(db.conn(), "kX", None, None, 2).unwrap();
        assert_eq!(p1.iter().map(|f| f.fact_id.as_str()).collect::<Vec<_>>(), ["a", "b"]);
        assert!(more);
        let last = &p1[1];
        let (p2, more) = session_facts_timeline(
            db.conn(), "kX", Some(last.event_ts_ms), Some(&last.fact_id), 10,
        )
        .unwrap();
        assert_eq!(p2.iter().map(|f| f.fact_id.as_str()).collect::<Vec<_>>(), ["c", "d"]);
        assert!(!more);
        assert!(p2[0].event_peak, "c 在高峰时段");

        assert!(session_row(db.conn(), "kX").unwrap().is_some());
        assert!(session_row(db.conn(), "kNope").unwrap().is_none());
        let _ = std::fs::remove_file(&path);
    }

    // ─────── PR #2.1：session_cost_minor ───────
    //
    // 关键不变量（spec §0.1 不冒充）：
    // (1) JOIN 路径——usage_facts.peak=true/false 各聚合 → cost_report 期望的 8 桶
    //     形状 → pricing_snapshot.asof(MAX(event_ts_ms)) 选历史价卡（Q13）。
    // (2) 任意一环失败（无事实 / 无价卡 / 价卡脏 / 无可计模型）→ 返 None，
    //     不冒充零成本。
    // (3) BillingBasis::MeteredEstimate——与 host_bills 的 MeteredActual 不同
    //     档位，DTO 上层不得求和进 summable_total。

    /// 一份精简 `assets/pricing.json` 片段，模型名直接对得上 fallback_provider
    /// 的 `deepseek-v4-pro` 表项——`norm_model_in` 会把 `dsh/deepseek-v4-pro-0813`
    /// 之类的真实模型名归一化到这里。`input_uncached.off_peak = 4.5` 元/M token
    /// 是 OFF 价的客观基准，断言用它倒推 cost_minor 的精度与单位。
    const TEST_PRICING_FRAGMENT: &str = r#"{
        "fallback_provider": "deepseek-official",
        "providers": {
            "deepseek-official": {
                "models": {
                    "deepseek-v4-pro": {
                        "input_uncached": { "off_peak": 4.5, "peak": 9.0 },
                        "input_cached":  { "off_peak": 0.15, "peak": 0.30 },
                        "output":        { "off_peak": 13.5, "peak": 27.0 }
                    }
                }
            }
        }
    }"#;

    #[test]
    fn session_cost_minor_joins_pricing_snapshot_at_event_ts() {
        // 用例：会话事件峰期分布 + 历史价卡覆盖到 MAX(event_ts_ms)，
        // 期望 cost_minor = (u_off*4.5 + u_peak*9.0 + o_off*13.5) / 1e6，
        // 单位 CNY，basis = MeteredEstimate。
        let path = tmp_db("cm-join");
        let db = AuthorityDb::open(&path, 1).unwrap();
        db.begin_run("run", "cli", 1).unwrap();
        let (day_start, _) = beijing_day_bounds_ms("2026-09-07").unwrap();
        // model 用 `dsh/deepseek-v4-pro-0813`，norm_model_in 会归一化到
        // `deepseek-v4-pro` 卡键。
        let skey = "skey-cm-1";
        db.conn().execute(
            "INSERT INTO sessions(session_key, host, native_session_id, machine_namespace, source_profile, last_observed_at_ms)
             VALUES (?1, 'dsh', 'native-cm-1', 'm', 'default', 1)",
            rusqlite::params![skey],
        ).unwrap();
        // `insert_fact` 测试助手不写 session_key（其他测试只关心 hourly/聚合，
        // 不需要 join 到 sessions）。本测试要 join 到 sessions 用 skey 过滤，
        // 所以直接走完整 INSERT——把 session_key 写对。
        let mut ins = db.conn().prepare(
            "INSERT INTO usage_facts(fact_id, host, machine_namespace, native_session_id,
                 session_key, source_event_id, observation_kind, provider_id, model_id,
                 event_ts_ms, event_peak, uncached_input_tokens, cache_read_tokens,
                 cache_write_tokens, output_tokens, ingested_run_id, created_at_ms, updated_at_ms)
             VALUES (?1, 'dsh', 'm', 'native-cm-1', ?2, ?1, ?3, NULL, ?4, ?5, ?6, ?7, 0, 0, ?8, 'run', 1, 1)"
        ).unwrap();
        ins.execute(rusqlite::params![
            "f1", skey, "assistant-usage", "dsh/deepseek-v4-pro-0813",
            day_start + 3_600_000, 0_i64, 1000000_i64, 0_i64
        ]).unwrap();
        ins.execute(rusqlite::params![
            "f2", skey, "assistant-usage", "dsh/deepseek-v4-pro-0813",
            day_start + 5 * 3_600_000, 1_i64, 500000_i64, 0_i64
        ]).unwrap();
        ins.execute(rusqlite::params![
            "f3", skey, "assistant-usage", "dsh/deepseek-v4-pro-0813",
            day_start + 9 * 3_600_000, 0_i64, 0_i64, 200000_i64
        ]).unwrap();
        // legacy_aggregate 行：必须被排除。
        ins.execute(rusqlite::params![
            "f_legacy", skey, "legacy_aggregate", "dsh/deepseek-v4-pro-0813",
            day_start + 4 * 3_600_000, 0_i64, 9999999_i64, 0_i64
        ]).unwrap();
        drop(ins);
        // 价卡：captured_at_ms < max(event_ts) 才能被 SELECT ... WHERE
        // captured_at_ms <= max_ts 命中。
        db.pricing_snapshot_put(
            "v1", "cli_seed",
            TEST_PRICING_FRAGMENT,
            day_start - 7 * DAY_MS,
        ).unwrap();

        let mm = session_cost_minor(db.conn(), skey)
            .unwrap()
            .expect("有事实 + 有价卡 + 有可计模型 → 应有 MoneyMinor");
        assert_eq!(mm.currency, "CNY");
        assert_eq!(mm.basis, agent_vitals_domain::data_contract::BillingBasis::MeteredEstimate);
        // 手算：bucket_price 一次性合并 (model, peak) 两轴。
        //   总 uncached_input = 1_000_000 (f1 off) + 500_000 (f2 peak) = 1_500_000
        //   总 peak_uncached_input = 500_000 (f2)
        //   u_off = 1_500_000 - 500_000 = 1_000_000  ← 这里 4.5/1e6
        //   u_peak = 500_000                          ← 这里 9.0/1e6
        //   总 output = 200_000, peak_output = 0 → o_off = 200_000  ← 13.5/1e6
        //   total = 1_000_000*4.5/1e6 + 500_000*9.0/1e6 + 200_000*13.5/1e6
        //         = 4.5 + 4.5 + 2.7 = 11.70 元 → 1170 分（CNY=2）
        assert_eq!(mm.amount_minor, 1170, "8 桶折算 + peak 拆分 + 舍入到分");

        // 任何不含 native id 的字符串——DTO 不泄宿主词表。
        let j = mm.to_json().to_string();
        assert!(!j.contains("native-cm-1"));
        assert!(!j.contains("dsh/deepseek-v4-pro-0813"));

        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn session_cost_minor_prices_unknown_codex_with_official_snapshot_card() {
        let path = tmp_db("cm-codex-unknown");
        let db = AuthorityDb::open(&path, 1).unwrap();
        db.begin_run("run", "cli", 1).unwrap();
        let (day_start, _) = beijing_day_bounds_ms("2026-09-09").unwrap();
        let skey = "skey-codex-unknown";
        db.conn().execute(
            "INSERT INTO sessions(session_key, host, native_session_id, machine_namespace, source_profile, last_observed_at_ms)
             VALUES (?1, 'codex', 'native-codex-unknown', 'm', 'default', 1)",
            rusqlite::params![skey],
        ).unwrap();
        db.conn().execute(
            "INSERT INTO usage_facts(fact_id, host, machine_namespace, native_session_id,
                 session_key, source_event_id, observation_kind, provider_id, model_id,
                 event_ts_ms, event_peak, uncached_input_tokens, cache_read_tokens,
                 cache_write_tokens, output_tokens, ingested_run_id, created_at_ms, updated_at_ms)
             VALUES ('f1', 'codex', 'm', 'native-codex-unknown', ?1, 'f1', 'token_count', NULL,
                     'openai/gpt-5.6-luna', ?2, 0, 1000000, 1000000, 1000000, 1000000, 'run', 1, 1)",
            rusqlite::params![skey, day_start + 3_600_000],
        ).unwrap();
        let pricing = r#"{
          "codex_pricing": {"entries": [{
            "modelPrefix": "gpt-5.6-luna", "speed": "standard",
            "uncachedInputUsdPerMTok": "0.2", "cacheReadUsdPerMTok": "0.02",
            "cacheWrite5mUsdPerMTok": "0.25", "outputUsdPerMTok": "1.2"
          }]}
        }"#;
        db.pricing_snapshot_put("v-codex", "cli_seed", pricing, day_start - DAY_MS).unwrap();

        let mm = session_cost_minor(db.conn(), skey).unwrap().expect("unknown Codex must be estimated");
        assert_eq!(mm.currency, "USD");
        assert_eq!(mm.basis, agent_vitals_domain::data_contract::BillingBasis::MeteredEstimate);
        assert_eq!(mm.amount_minor, 167, "0.2 + 0.02 + 0.25 + 1.2 USD = $1.67");

        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn session_cost_minor_returns_none_when_no_pricing_snapshot() {
        let path = tmp_db("cm-no-snap");
        let db = AuthorityDb::open(&path, 1).unwrap();
        db.begin_run("run", "cli", 1).unwrap();
        let (day_start, _) = beijing_day_bounds_ms("2026-09-07").unwrap();
        let skey = "skey-cm-2";
        db.conn().execute(
            "INSERT INTO sessions(session_key, host, native_session_id, machine_namespace, source_profile, last_observed_at_ms)
             VALUES (?1, 'dsh', 'native-cm-2', 'm', 'default', 1)",
            rusqlite::params![skey],
        ).unwrap();
        db.conn().execute(
            "INSERT INTO usage_facts(fact_id, host, machine_namespace, native_session_id,
                 session_key, source_event_id, observation_kind, provider_id, model_id,
                 event_ts_ms, event_peak, uncached_input_tokens, cache_read_tokens,
                 cache_write_tokens, output_tokens, ingested_run_id, created_at_ms, updated_at_ms)
             VALUES ('f1', 'dsh', 'm', 'native-cm-2', ?1, 'f1', 'assistant-usage', NULL, 'm', ?2, 0, 1000000, 0, 0, 0, 'run', 1, 1)",
            rusqlite::params![skey, day_start + 3_600_000],
        ).unwrap();
        // 故意不插 pricing_snapshot——模拟「事实已 ingest 但价卡还没采集」的
        // 真实过渡态。JOIN 应返 None，不冒充零成本。
        let r = session_cost_minor(db.conn(), skey).unwrap();
        assert!(r.is_none(), "无价卡覆盖 → None（不冒充 0）");

        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn session_cost_minor_returns_none_when_cost_report_unpriced() {
        // `cost_report` 在**未知模型**时不会返 None——所有 token 进 unpriced 桶，
        // 但 `per_model.is_empty() && unpriced != 0` 仍让 cost_report 返
        // Some(report_total=0, unpriced_tokens=N)。我们透出 `Some(
        // MoneyMinor{amount_minor=0, currency, basis})` 而不是 None——
        // 与 cost_report 同语义（无 priced cost，但 unpriced 不冒充零）。
        //
        // 同样覆盖：脏价卡（JSON parse 失败）→ None，不冒充。
        let path = tmp_db("cm-unpriced");
        let db = AuthorityDb::open(&path, 1).unwrap();
        db.begin_run("run", "cli", 1).unwrap();
        let (day_start, _) = beijing_day_bounds_ms("2026-09-07").unwrap();
        let skey = "skey-cm-3";
        db.conn().execute(
            "INSERT INTO sessions(session_key, host, native_session_id, machine_namespace, source_profile, last_observed_at_ms)
             VALUES (?1, 'dsh', 'native-cm-3', 'm', 'default', 1)",
            rusqlite::params![skey],
        ).unwrap();
        // 模型名落进所有 provider 的卡都查不到的位置。
        db.conn().execute(
            "INSERT INTO usage_facts(fact_id, host, machine_namespace, native_session_id,
                 session_key, source_event_id, observation_kind, provider_id, model_id,
                 event_ts_ms, event_peak, uncached_input_tokens, cache_read_tokens,
                 cache_write_tokens, output_tokens, ingested_run_id, created_at_ms, updated_at_ms)
             VALUES ('f1', 'dsh', 'm', 'native-cm-3', ?1, 'f1', 'assistant-usage', NULL, 'totally/unknown-model-xyz', ?2, 0, 1000, 0, 0, 0, 'run', 1, 1)",
            rusqlite::params![skey, day_start + 3_600_000],
        ).unwrap();
        // 价卡覆盖到 max_ts：合法 JSON，但任何模型都查不到。
        db.pricing_snapshot_put(
            "v_unpriced", "cli_seed",
            TEST_PRICING_FRAGMENT,
            day_start - DAY_MS,
        ).unwrap();
        let r = session_cost_minor(db.conn(), skey).unwrap();
        assert!(r.is_none(), "未计价 token → None（不冒充 0 或 partial cost）");

        // 第二档：JSON 脏价卡。payload_json 存进去是合法字符串但不能 JSON parse，
        // 我们的内联 `serde_json::from_str(&snap_payload)` 失败 → None。
        // 这里直接走已插入路径，模拟「写入端已 commit 但内容坏」的情况。
        db.conn().execute(
            "DELETE FROM pricing_snapshots WHERE pricing_version = 'v_unpriced'",
            [],
        ).unwrap();
        db.pricing_snapshot_put(
            "v_corrupt", "cli_seed",
            "{this is not valid json",
            day_start - DAY_MS,
        ).unwrap();
        let r2 = session_cost_minor(db.conn(), skey).unwrap();
        assert!(r2.is_none(), "脏价卡 → None（不冒充 0，不向上抛）");

        let _ = std::fs::remove_file(&path);
    }

    // ── PR #2.3：CLI `sessions navigation` 的 SQL 只读快照 ─────────────

    #[test]
    fn day_token_totals_by_host_groups_and_sums_within_beijing_day() {
        // 2026-09-08 北京 10:00 / 14:00 各一条 fact（同 host 累加）；
        // 跨日那条（次日 01:00）不进 09-08 的桶。
        let dir = tmp_db("navig_total");
        std::fs::create_dir_all(&dir).unwrap();
        let path = crate::authority::default_authority_path(&dir);
        let db = AuthorityDb::open(&path, 1).unwrap();
        let (start, _) = beijing_day_bounds_ms("2026-09-08").unwrap();
        insert_fact(&db, "f1", "dsh", Some("m"), "assistant-usage", start + 10 * 3_600_000, 0, 100, 0, 0, 0);
        insert_fact(&db, "f2", "dsh", Some("m"), "assistant-usage", start + 14 * 3_600_000, 0, 200, 0, 0, 0);
        insert_fact(&db, "f3", "claude-code", Some("m"), "assistant-usage", start + 3_600_000, 0, 50, 0, 0, 0);
        // 跨日 fact：2026-09-09 北京 01:00 → 不计入 09-08 桶
        insert_fact(&db, "f4", "dsh", Some("m"), "assistant-usage", start + DAY_MS + 3_600_000, 0, 999, 0, 0, 0);
        drop(db);
        let totals = day_token_totals_by_host(&dir, "2026-09-08").expect("库可读");
        assert_eq!(totals.get("dsh").copied(), Some(300), "10:00 + 14:00 = 300");
        assert_eq!(totals.get("claude-code").copied(), Some(50));
        // 跨日 fact 不计入（2026-09-08 的 end 是次日 00:00，[start,end) 半开）。
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn day_token_totals_by_host_returns_none_when_authority_db_missing() {
        // 库文件不存在 → None（CLI 降级到 `{value:null, basis:null}`，不冒充 0）。
        let dir = tmp_db("navig_missing");
        std::fs::create_dir_all(&dir).unwrap();
        // 不开库，路径存在但库文件不存在
        let result = day_token_totals_by_host(&dir, "2026-09-08");
        assert!(result.is_none(), "无库 → None（不向上抛）");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn day_session_count_distinguishes_sessions_within_one_host() {
        // 同一 host 三条 fact 两条不同 session_key；其它 host 不计入。
        let dir = tmp_db("navig_count");
        std::fs::create_dir_all(&dir).unwrap();
        let path = crate::authority::default_authority_path(&dir);
        let db = AuthorityDb::open(&path, 1).unwrap();
        db.conn().execute(
            "INSERT INTO sync_runs(run_id, started_at_ms, trigger, status, schema_version)
             VALUES ('run', 1, 'cli', 'succeeded', 1) ON CONFLICT(run_id) DO NOTHING",
            [],
        ).unwrap();
        // 先建 sessions 行（usage_facts.session_key FK → sessions.session_key，
        // 且 (host, machine_namespace, native_session_id) 唯一）
        for (skey, host, nat) in [
            ("3:dsh|10:s1|2:n", "dsh", "nat-s1"),
            ("3:dsh|10:s2|2:n", "dsh", "nat-s2"),
            ("3:codex|10:s3|2:n", "codex", "nat-s3"),
        ] {
            db.conn().execute(
                "INSERT INTO sessions(session_key, host, native_session_id, machine_namespace,
                     source_profile, last_observed_at_ms)
                 VALUES (?1, ?2, ?3, 'm', 'default', 1)
                 ON CONFLICT(session_key) DO NOTHING",
                rusqlite::params![skey, host, nat],
            ).unwrap();
        }
        let (start, _) = beijing_day_bounds_ms("2026-09-08").unwrap();
        for (fact_id, host, skey) in [
            ("f1", "dsh", "3:dsh|10:s1|2:n"),
            ("f2", "dsh", "3:dsh|10:s1|2:n"),
            ("f3", "dsh", "3:dsh|10:s2|2:n"),
            ("f4", "codex", "3:codex|10:s3|2:n"),
        ] {
            db.conn().execute(
                "INSERT INTO usage_facts(fact_id, host, machine_namespace, native_session_id,
                     session_key, source_event_id, observation_kind, provider_id, model_id,
                     event_ts_ms, event_peak, uncached_input_tokens, cache_read_tokens,
                     cache_write_tokens, output_tokens, ingested_run_id, created_at_ms, updated_at_ms)
                 VALUES (?1, ?2, 'm', ?4, ?3, ?1, 'assistant-usage', NULL, 'm', ?5, 0,
                         100, 0, 0, 0, 'run', 1, 1)",
                rusqlite::params![fact_id, host, skey, &skey[5..skey.len()-4], start + 60_000],
            ).unwrap();
        }
        drop(db);
        let dsh_n = day_session_count(&dir, "2026-09-08", "dsh").unwrap();
        let codex_n = day_session_count(&dir, "2026-09-08", "codex").unwrap();
        let claude_n = day_session_count(&dir, "2026-09-08", "claude-code").unwrap();
        assert_eq!(dsh_n, 2, "dsh 两条不同 session_key → 2 sessions");
        assert_eq!(codex_n, 1, "codex 一条 session → 1");
        assert_eq!(claude_n, 0, "claude-code 无事实 → 0");
        let _ = std::fs::remove_dir_all(&dir);
    }
}
