//! 菜单栏后端数据组装：读数据根的 month.json/today.json + 根下 config.toml 预算，
//! 喂给 core 的 cost 折叠，产出一个纯展示 JSON。
//!
//! **计算本体在 core**（`agent_vitals_core::cost::{priced_day, month_cost,
//! today_cost, bucket_cost}`），这里只有文件 I/O 与组装——CLAUDE.md 教训：同一份
//! month.json 在日历/budget/菜单栏各写一份「有没有 by_model 就……」的判断，报出
//! ¥4.50 vs ¥18.00 两个价。菜单栏不重写任何定价，只调 core 的单一覆盖率校验入口。
//!
//! data_home 解析与北京日期键是**管道不是规则**：Python 侧 `paths.py`/`state.py`
//! 与二进制 `snapshot.rs`/`codex_cost.rs` 各有镜像，这里是菜单栏一份（独立
//! workspace，import 不到二进制模块）。规格与那两份逐字段一致，单测钉住。

use std::path::{Path, PathBuf};

use agent_vitals_core::cost::{bucket_cost, load_pricing, month_cost, priced_day, today_cost};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

#[derive(Serialize)]
pub struct DayRow {
    pub date: String,
    pub total: f64,
    pub peak_total: f64,
    /// "exact" | "partial"，无 by_model 的日子为 None（按 fallback 近似）。
    pub basis: Option<String>,
    pub coverage: Option<f64>,
}

/// alert.json 的预算权威字段（`budget.evaluate()` 落盘）。菜单栏**只读不重算**：
/// level/ratio/日预算/snooze 全部以这里为准——这是迁移要修的 D2 缺口
/// （Tauri 自算 remaining% 与 budget.py 规则无关）。缺场时 `source = "missing"`，
/// UI 走降级文案，不臆造百分比。
#[derive(Serialize, Default)]
pub struct BudgetAlert {
    pub level: Option<String>,
    /// 今日占比（alert.json `ratio`，今日无数据时为 null）。
    pub ratio: Option<f64>,
    /// 本月占比（alert.json `month_ratio`）。
    pub month_ratio: Option<f64>,
    pub effective_daily_budget: Option<f64>,
    pub snoozed_until: Option<String>,
    pub reasons: Option<Vec<String>>,
    pub today_cost: Option<f64>,
    pub month_cost: Option<f64>,
    pub monthly_cny: Option<f64>,
    pub peak_over: Option<bool>,
    pub adaptive_floor_applied: Option<bool>,
    /// 新鲜度源：`budget.evaluate()` 的落盘时刻。
    pub generated_at: Option<String>,
    pub schema_version: Option<String>,
    /// "alert" | "missing" —— 权威来源标记，UI 据此决定展示还是降级。
    pub source: String,
}

/// 菜单栏自身同步回路的状态：每轮 tick（发现未折会话 → oneline 折账）都会落盘
/// 一条，托盘/面板只读展示。这是「同步失败可见、可行动」的数据源——tick 的每一类
/// 结局（二进制缺失/discover 失败/oneline 失败/无未折会话/成功）都必须写成一条
/// 可展示的记录，而不是只进 stderr。`read_overview` 把它放进 Overview，UI 据此
/// 决定主入口要不要示警、给不给「立即同步」入口。
#[derive(Serialize, Deserialize, Clone)]
pub struct SyncStatus {
    /// 本轮同步是否成功结束（无未折会话也是成功——「没活干」不是故障）。
    pub ok: bool,
    /// 卡在哪一步："never" | "resolve" | "discover" | "fold"。前端用 "never"
    /// 区分「从未同步」与「同步失败」，措辞不同。
    pub stage: String,
    /// 人话原因：失败时是错误原因，成功时是「已折入 <session_id>」这类摘要。
    pub message: String,
    /// 本轮尝试的北京时间（`YYYY-MM-DD HH:MM:SS`）。无 chrono 依赖，用 `beijing_timestamp`。
    pub at: Option<String>,
}

impl Default for SyncStatus {
    fn default() -> Self {
        Self { ok: false, stage: "never".into(), message: "尚未同步".into(), at: None }
    }
}

impl SyncStatus {
    pub fn ok(stage: &str, message: String) -> Self {
        Self { ok: true, stage: stage.into(), message, at: Some(beijing_timestamp(now_unix_secs())) }
    }

    pub fn fail(stage: &str, message: String) -> Self {
        Self { ok: false, stage: stage.into(), message, at: Some(beijing_timestamp(now_unix_secs())) }
    }
}

fn now_unix_secs() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

/// 北京时间 `YYYY-MM-DD HH:MM:SS`（UTC+8 无夏令时）。复用 `civil_from_unix_secs`，
/// 不引日期库——与 data_home 解析同款「管道不是规则」的镜像位置。
fn beijing_timestamp(secs: i64) -> String {
    let (y, m, d) = civil_from_unix_secs(secs, 8 * 3600);
    let tod = (secs + 8 * 3600).rem_euclid(86400);
    let (h, mi, s) = (tod / 3600, (tod % 3600) / 60, tod % 60);
    format!("{y:04}-{m:02}-{d:02} {h:02}:{mi:02}:{s:02}")
}

/// tick 每轮结束把同步状态落盘到 `state/last-sync.json`（与 alert.json 同目录——
/// 数据根只有一份，菜单栏和 CLI 读的都是它）。
pub fn save_sync_status(status: &SyncStatus) {
    save_sync_status_at(&data_home(), status);
}

/// 参数化版——数据根由调用方指定，单测往临时目录写就能端到端验证。
pub fn save_sync_status_at(dh: &Path, status: &SyncStatus) {
    let dir = dh.join("state");
    let _ = std::fs::create_dir_all(&dir);
    if let Ok(text) = serde_json::to_string_pretty(status) {
        let _ = std::fs::write(dir.join("last-sync.json"), text);
    }
}

/// 读回上一轮同步状态；文件缺场 → 默认（"never"）。解析失败也走默认——一条坏掉
/// 的 last-sync.json 不该让面板整块红，回退成「尚未同步」即可。
fn load_sync_status(dh: &Path) -> SyncStatus {
    read_json(&dh.join("state").join("last-sync.json"))
        .and_then(|v| serde_json::from_value(v).ok())
        .unwrap_or_default()
}

#[derive(Serialize)]
pub struct Overview {
    pub data_home: String,
    pub today: Option<Value>,
    pub month: Value,
    pub days: Vec<DayRow>,
    pub budget_monthly_cny: f64,
    pub budget: BudgetAlert,
    /// 菜单栏同步回路状态（tick 落盘）。前端据此示警/给「立即同步」入口。
    pub sync: SyncStatus,
    pub estimate_note: String,
}

/// 数据根（镜像 `paths.py::data_home` / `snapshot.rs::data_home_from` 的优先序）：
/// `AGENT_VITALS_HOME` → `SKILL_VITALS_HOME` → `~/.agent-vitals`（已存在或 legacy
/// 不存在时）→ `~/.skill-vitals`。
pub fn data_home() -> PathBuf {
    data_home_from(
        &|k| match std::env::var(k) {
            Ok(v) if !v.trim().is_empty() => Some(v),
            _ => None,
        },
        PathBuf::from(std::env::var("HOME").unwrap_or_default()),
    )
}

/// 纯函数版数据根选择——env 源由调用方注入，单测不用碰真实环境变量。
/// 与 `snapshot.rs::data_home_from` 同一组分支（那边有 4 条同值测试）。
fn data_home_from<F>(get_env: &F, home: PathBuf) -> PathBuf
where
    F: Fn(&str) -> Option<String>,
{
    for var in ["AGENT_VITALS_HOME", "SKILL_VITALS_HOME"] {
        if let Some(path) = get_env(var) {
            return PathBuf::from(path);
        }
    }
    let current = home.join(".agent-vitals");
    let legacy = home.join(".skill-vitals");
    if current.exists() || !legacy.exists() {
        current
    } else {
        legacy
    }
}

/// 北京时区（UTC+8，无夏令时）今天 → `YYYY-MM-DD`。算法逐字段镜像二进制
/// `codex_cost.rs::civil_from_unix_secs`（Howard Hinnant 的 civil_from_days，
/// div_euclid 版，负 epoch 也正确）。
pub fn today_beijing() -> String {
    let secs = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);
    let (y, m, d) = civil_from_unix_secs(secs, 8 * 3600);
    format!("{y:04}-{m:02}-{d:02}")
}

fn civil_from_unix_secs(secs: i64, offset_secs: i64) -> (i64, u32, u32) {
    let days = (secs + offset_secs).div_euclid(86400);
    let z = days + 719468;
    let era = z.div_euclid(146097);
    let doe = z - era * 146097;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = if m <= 2 { y + 1 } else { y };
    (y, m as u32, d as u32)
}

fn read_json(path: &Path) -> Option<Value> {
    let text = std::fs::read_to_string(path).ok()?;
    serde_json::from_str(&text).ok()
}

/// config.toml `[budget] monthly_cny`，缺省 600（与 `budget.py::default_budget` 的
/// monthly_cny 同值）。极简解析镜像 `budget.py` 的 `_parse_scalar` 范围：只认
/// `[budget]` 节里的 snake_case 标量，不引 toml 依赖。
fn monthly_budget_cny(data_home: &Path) -> f64 {
    let Some(text) = std::fs::read_to_string(data_home.join("config.toml")).ok() else {
        return 600.0;
    };
    let mut in_budget = false;
    for line in text.lines() {
        let t = line.trim();
        if t.starts_with('[') && t.ends_with(']') {
            in_budget = t == "[budget]";
            continue;
        }
        if in_budget {
            if let Some(eq) = t.find('=') {
                let key = t[..eq].trim();
                let val = t[eq + 1..].trim();
                if key == "monthly_cny" {
                    if let Ok(x) = val.trim_end_matches(',').parse::<f64>() {
                        return x;
                    }
                }
            }
        }
    }
    600.0
}

/// 读 alert.json 的预算权威字段（`budget.evaluate()` 落盘）。**只读字段，不重算
/// level/ratio**——这是迁移要修的 D2 缺口（Tauri 自算 remaining% 与 budget.py 规则
/// 无关）。文件缺场或解析失败 → `source = "missing"`、字段全 None，UI 降级文案，
/// 不臆造百分比。
fn read_budget_alert(dh: &Path) -> BudgetAlert {
    let Some(v) = read_json(&dh.join("state").join("alert.json")) else {
        return BudgetAlert { source: "missing".into(), ..Default::default() };
    };
    let get = |k: &str| v.get(k).cloned();
    BudgetAlert {
        level: get("level").and_then(|x| x.as_str().map(String::from)),
        ratio: get("ratio").and_then(|x| x.as_f64()),
        month_ratio: get("month_ratio").and_then(|x| x.as_f64()),
        effective_daily_budget: get("effective_daily_budget").and_then(|x| x.as_f64()),
        snoozed_until: get("snoozed_until").and_then(|x| x.as_str().map(String::from)),
        reasons: get("reasons").and_then(|x| x.as_array().map(|a| {
            a.iter().filter_map(|r| r.as_str().map(String::from)).collect()
        })),
        today_cost: get("today_cost").and_then(|x| x.as_f64()),
        month_cost: get("month_cost").and_then(|x| x.as_f64()),
        monthly_cny: get("monthly_cny").and_then(|x| x.as_f64()),
        peak_over: get("peak_over").and_then(|x| x.as_bool()),
        adaptive_floor_applied: get("adaptive_floor_applied").and_then(|x| x.as_bool()),
        generated_at: get("generated_at").and_then(|x| x.as_str().map(String::from)),
        schema_version: get("schema_version").and_then(|x| x.as_str().map(String::from)),
        source: "alert".into(),
    }
}

pub fn read_overview() -> Overview {
    read_overview_at(&data_home())
}

/// 参数化的组装入口——数据根由调用方指定，单测往临时目录写 month.json/today.json
/// 就能端到端验证组装（读文件 → core 折叠 → 展示 JSON），不必碰真实环境变量。
fn read_overview_at(dh: &Path) -> Overview {
    let state = dh.join("state");
    let pricing = load_pricing();
    let today = today_beijing();

    // 今日：date 必须真的是今天 —— core 的 `today_cost` 判（stale → None，不是
    // 把昨天的账当今天的报）。date 缺场的老数据也交给 core 决定。
    let today_val = read_json(&state.join("today.json"))
        .and_then(|d| today_cost(&d, &pricing, &today));

    // 本月：month.json 的 days map → core `month_cost`；读不到/无 days → {0,0}，
    // 不臆造。
    let month_val = read_json(&state.join("month.json"))
        .and_then(|m| m.get("days").cloned())
        .unwrap_or_else(|| json!({}));
    let month = month_cost(&month_val, &pricing);

    // 逐日行：`priced_day`（唯一覆盖率校验入口）→ 无 by_model 的日子退回
    // `bucket_cost` 的 fallback 近似。与 core `month_cost` 内部同一套判断。
    let mut days = Vec::new();
    if let Some(map) = month_val.as_object() {
        for (date, day) in map {
            days.push(day_to_row(date, day, &pricing));
        }
        days.sort_by(|a, b| a.date.cmp(&b.date));
    }

    Overview {
        data_home: dh.display().to_string(),
        today: today_val,
        month,
        days,
        budget_monthly_cny: monthly_budget_cny(dh),
        budget: read_budget_alert(dh),
        sync: load_sync_status(dh),
        estimate_note: "估算值，不是账单；覆盖率不足的日子按 fallback 价补齐并标注".to_string(),
    }
}

/// 一天的成本行：`priced_day`（唯一覆盖率校验入口）→ 无 by_model 的日子退回
/// `bucket_cost` 的 fallback 近似。与 core `month_cost` 内部同一套判断。面板逐日
/// 列表与工作台日历共用这一份映射——同一份 month.json 只允许有一个「有没有
/// by_model 就……」的判断（CLAUDE.md 的 cost 教训：日历/budget/菜单栏各写一份，
/// 报出 ¥4.50 vs ¥18.00）。
fn day_to_row(date: &str, day: &Value, pricing: &Value) -> DayRow {
    let (total, peak, basis, coverage) = match priced_day(day, pricing) {
        Some(c) => (
            c["total"].as_f64().unwrap_or(0.0),
            c["peak_total"].as_f64().unwrap_or(0.0),
            c["pricing_basis"].as_str().map(|s| s.to_string()),
            c["coverage"].as_f64(),
        ),
        None => {
            let c = bucket_cost(day, pricing);
            (c["total"].as_f64().unwrap_or(0.0), c["peak_total"].as_f64().unwrap_or(0.0), None, None)
        }
    };
    DayRow { date: date.to_string(), total, peak_total: peak, basis, coverage }
}

/// 北京当前月 `YYYY-MM`（`today_beijing()` 的前 7 位）。工作台日历默认落在当月。
pub fn current_month_beijing() -> String {
    today_beijing()[..7].to_string()
}

/// 月键合法性：`YYYY-MM`（len 7、第 5 字符 '-'、余为数字）。IPC 是外部面，一个
/// 乱串不该 panic、也不该被当成有数据处理——非法键与「该月无数据」同形。
fn is_month_key(s: &str) -> bool {
    let b = s.as_bytes();
    b.len() == 7
        && b[4] == b'-'
        && b[..4].iter().all(|c| c.is_ascii_digit())
        && b[5..].iter().all(|c| c.is_ascii_digit())
}

/// 任意月逐日数据。当月 → `state/month.json` 的 days（防御性按 month 过滤——
/// month.json 理论上只装当月，但历史遗留可能混入外月行，读哪个月就只认哪个月的
/// 键，镜像二进制 `budget.rs::read_month` 的语义）；历史 → `state/month-archive.json`
/// 的 `/months/{month}/days`。返回（当月 days map，逐日行）——map 已过滤到该月，
/// 所以 `month_cost(map)` 与逐行求和必然一致。没有该月数据 → `None`（不是
/// `Some+空`：前端据此显示「该月暂无数据」，不摆全零结构）。
///
/// **第三份镜像**：二进制 `budget.rs::read_month` 私有且 src-tauri 是独立
/// workspace import 不到，这里与 data_home/北京日期键同款「管道不是规则」的镜像
/// 位置，单测钉死，后续可收进 core。
pub fn read_month_days_at(dh: &Path, month: &str, pricing: &Value) -> Option<(Value, Vec<DayRow>)> {
    if !is_month_key(month) {
        return None;
    }
    let state = dh.join("state");
    let raw = if month == current_month_beijing() {
        read_json(&state.join("month.json"))
            .and_then(|m| m.get("days").cloned())
            .unwrap_or_else(|| json!({}))
    } else {
        read_json(&state.join("month-archive.json"))
            .and_then(|a| {
                a.get("months")
                    .and_then(|ms| ms.get(month))
                    .and_then(|mo| mo.get("days"))
                    .cloned()
            })
            .unwrap_or_else(|| json!({}))
    };
    let mut filtered = serde_json::Map::new();
    let mut rows = Vec::new();
    if let Some(map) = raw.as_object() {
        for (date, day) in map {
            if date.starts_with(month) {
                filtered.insert(date.clone(), day.clone());
                rows.push(day_to_row(date, day, pricing));
            }
        }
    }
    rows.sort_by(|a, b| a.date.cmp(&b.date));
    if rows.is_empty() {
        None
    } else {
        Some((Value::Object(filtered), rows))
    }
}

/// 工作台日历 IPC 的响应组装。Some → `{month, days, total, peak_total,
/// has_data:true}`，月总额走 core `month_cost`（与总览同一入口，不重加行）；
/// None → `{month, days:[], total:null, peak_total:null, has_data:false}`——
/// 诚实空，前端显示「该月暂无数据」，不出现 ¥0 格子。
pub fn month_response(month: &str, result: Option<(Value, Vec<DayRow>)>, pricing: &Value) -> Value {
    match result {
        Some((raw, rows)) => {
            let totals = month_cost(&raw, pricing);
            json!({
                "month": month,
                "days": rows,
                "total": totals["total"].as_f64().unwrap_or(0.0),
                "peak_total": totals["peak_total"].as_f64().unwrap_or(0.0),
                "has_data": true,
            })
        }
        None => json!({
            "month": month,
            "days": [],
            "total": Value::Null,
            "peak_total": Value::Null,
            "has_data": false,
        }),
    }
}

/// 工作台日历 IPC 的 Rust 侧一次性组装：读月 + 定价 + 响应。命令只薄转发这里，
/// pricing 的加载留在 overview（`load_pricing` 已在这层 import）——IPC 命令不
/// 碰定价细节。
pub fn read_month_json(month: &str) -> Value {
    let pricing = load_pricing();
    month_response(month, read_month_days_at(&data_home(), month, &pricing), &pricing)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// 北京日期键与二进制 `codex_cost.rs` 同一算法：给出固定 epoch 秒，断言
    /// 产出的 YYYY-MM-DD。1787846400 = 2026-08-28 00:00 北京（= 2026-08-27T16:00Z，
    /// 用 civil_from_days 反算核过：1787788800 = 2026-08-27T00:00Z）。
    #[test]
    fn civil_from_unix_secs_pins_beijing_date() {
        let (y, m, d) = civil_from_unix_secs(1787846400, 8 * 3600);
        assert_eq!((y, m, d), (2026, 8, 28));
        // 再退 1 秒 → 北京 2026-08-27 23:59:59，日期不应进位。
        let (y, m, d) = civil_from_unix_secs(1787846399, 8 * 3600);
        assert_eq!((y, m, d), (2026, 8, 27));
    }

    /// 负 epoch（1970 年前）也正确 —— div_euclid 而不是截断除法。
    #[test]
    fn civil_from_unix_secs_handles_negative_epoch() {
        // -1 = 1969-12-31T23:59:59Z，北京 = 1970-01-01 07:59:59。
        let (y, m, d) = civil_from_unix_secs(-1, 8 * 3600);
        assert_eq!((y, m, d), (1970, 1, 1));
    }

    /// data_home 优先序（纯函数版，env 由测试注入）：显式 env 覆盖 > ~/.agent-vitals
    /// （存在或 legacy 不存在）> ~/.skill-vitals。与 snapshot.rs 的同名测试同一组断言。
    #[test]
    fn data_home_prefers_explicit_env() {
        let tmp = std::env::temp_dir().join("sv-menubar-data-home-test");
        let _ = std::fs::remove_dir_all(&tmp);
        std::fs::create_dir_all(&tmp).unwrap();
        let get = |k: &str| match k {
            "AGENT_VITALS_HOME" => Some(tmp.join("explicit-a").to_string_lossy().into_owned()),
            "SKILL_VITALS_HOME" => Some(tmp.join("explicit-b").to_string_lossy().into_owned()),
            _ => None,
        };
        // AGENT_VITALS_HOME 优先于 SKILL_VITALS_HOME。
        assert_eq!(
            data_home_from(&get, tmp.clone()),
            tmp.join("explicit-a")
        );
        // 只设 SKILL_VITALS_HOME → 用它。
        let get_b = |k: &str| match k {
            "SKILL_VITALS_HOME" => Some(tmp.join("explicit-b").to_string_lossy().into_owned()),
            _ => None,
        };
        assert_eq!(data_home_from(&get_b, tmp.clone()), tmp.join("explicit-b"));
        // 无 env：~/.agent-vitals 存在 → 用它。
        std::fs::create_dir_all(tmp.join(".agent-vitals")).unwrap();
        let none = |_: &str| None;
        assert_eq!(data_home_from(&none, tmp.clone()), tmp.join(".agent-vitals"));
        // 无 env、~/.agent-vitals 不存在、~/.skill-vitals 存在 → 用 legacy。
        std::fs::remove_dir_all(tmp.join(".agent-vitals")).unwrap();
        std::fs::create_dir_all(tmp.join(".skill-vitals")).unwrap();
        assert_eq!(data_home_from(&none, tmp.clone()), tmp.join(".skill-vitals"));
        // 两个都不存在 → 默认 ~/.agent-vitals。
        std::fs::remove_dir_all(tmp.join(".skill-vitals")).unwrap();
        assert_eq!(data_home_from(&none, tmp.clone()), tmp.join(".agent-vitals"));
        let _ = std::fs::remove_dir_all(&tmp);
    }

    /// config.toml 缺省预算 = 600（与 budget.py 的 default_budget.monthly_cny）。
    /// 临时目录名带用途后缀——cargo test 并行执行，两条预算测试必须各用各的目录，
    /// 否则一条 remove_dir_all 会删掉另一条刚写好的 config.toml。
    #[test]
    fn monthly_budget_defaults_to_600() {
        let tmp = std::env::temp_dir().join("sv-menubar-budget-default-test");
        let _ = std::fs::remove_dir_all(&tmp);
        std::fs::create_dir_all(&tmp).unwrap();
        assert_eq!(monthly_budget_cny(&tmp), 600.0);
        let _ = std::fs::remove_dir_all(&tmp);
    }

    /// config.toml 里 `[budget] monthly_cny` 生效，其他节的同名字段不算。
    #[test]
    fn monthly_budget_reads_budget_section_only() {
        let tmp = std::env::temp_dir().join("sv-menubar-budget-read-test");
        let _ = std::fs::remove_dir_all(&tmp);
        std::fs::create_dir_all(&tmp).unwrap();
        std::fs::write(
            tmp.join("config.toml"),
            "[other]\nmonthly_cny = 1\n[budget]\nmonthly_cny = 888\n",
        )
        .unwrap();
        assert_eq!(monthly_budget_cny(&tmp), 888.0);
        let _ = std::fs::remove_dir_all(&tmp);
    }

    /// 组装级测试：临时数据根里放 month.json（exact 日 + legacy 日）+ today.json
    /// （今天的 date）+ config.toml，`read_overview_at` 应该产出与 core 单测同一组
    /// 数字——今日 1.5、本月 4.5（1.5 + 3.0）、两行逐日（按日期排序）、预算 888。
    /// 夹具逐字来自 core `cost.rs` 的 `month_cost_sums_exact_and_legacy_days`。
    #[test]
    fn read_overview_assembles_state_into_expected_numbers() {
        let tmp = std::env::temp_dir().join("sv-menubar-overview-test");
        let _ = std::fs::remove_dir_all(&tmp);
        std::fs::create_dir_all(tmp.join("state")).unwrap();

        let legacy = serde_json::json!({
            "uncached_input_tokens": 1000000, "output_tokens": 0,
            "cache_read_tokens": 0, "cache_write_tokens": 0,
            "peak_uncached_input_tokens": 0, "peak_output_tokens": 0,
            "peak_cache_read_tokens": 0, "peak_cache_write_tokens": 0,
        });
        let exact_day = serde_json::json!({
            "uncached_input_tokens": 1000000, "output_tokens": 0,
            "cache_read_tokens": 0, "cache_write_tokens": 0,
            "peak_uncached_input_tokens": 0, "peak_output_tokens": 0,
            "peak_cache_read_tokens": 0, "peak_cache_write_tokens": 0,
            "by_model": {"deepseek-v4-flash": legacy},
        });
        let month = serde_json::json!({
            "month": "2026-08",
            "days": {
                "2026-08-01": exact_day,
                "2026-08-02": serde_json::json!({ "uncached_input_tokens": 2000000, "output_tokens": 0,
                    "cache_read_tokens": 0, "cache_write_tokens": 0,
                    "peak_uncached_input_tokens": 0, "peak_output_tokens": 0,
                    "peak_cache_read_tokens": 0, "peak_cache_write_tokens": 0 }),
            },
        });
        std::fs::write(tmp.join("state").join("month.json"), month.to_string()).unwrap();

        // today.json 的 date 用 today_beijing()（与 app 运行时同一个「今天」）。
        let today = today_beijing();
        let today_json = serde_json::json!({
            "date": today,
            "by_model": {"deepseek-v4-flash": legacy},
        });
        std::fs::write(tmp.join("state").join("today.json"), today_json.to_string()).unwrap();
        std::fs::write(tmp.join("config.toml"), "[budget]\nmonthly_cny = 888\n").unwrap();

        let ov = read_overview_at(&tmp);
        let today_total = ov.today.expect("today.json 的 date 就是今天").get("total").unwrap().as_f64().unwrap();
        assert!((today_total - 1.5).abs() < 1e-9, "今日应 1.5，got {today_total}");
        let month_total = ov.month.get("total").unwrap().as_f64().unwrap();
        assert!((month_total - 4.5).abs() < 1e-9, "本月应 4.5（1.5+3.0），got {month_total}");
        assert_eq!(ov.days.len(), 2);
        assert_eq!(ov.days[0].date, "2026-08-01");
        assert_eq!(ov.days[0].basis.as_deref(), Some("exact"));
        assert_eq!(ov.days[1].date, "2026-08-02");
        assert_eq!(ov.days[1].basis, None);
        assert!((ov.days[1].total - 3.0).abs() < 1e-9);
        assert_eq!(ov.budget_monthly_cny, 888.0);

        let _ = std::fs::remove_dir_all(&tmp);
    }

    /// 空态诚实：数据根没有任何 state 文件 → today None（不是 0 元）、month {0,0}、
    /// days 空、预算回默认 600。不摆全零结构冒充「今天花了 0 元」。
    #[test]
    fn read_overview_empty_state_is_honest() {
        let tmp = std::env::temp_dir().join("sv-menubar-overview-empty-test");
        let _ = std::fs::remove_dir_all(&tmp);
        std::fs::create_dir_all(tmp.join("state")).unwrap();
        let ov = read_overview_at(&tmp);
        assert!(ov.today.is_none());
        assert_eq!(ov.month.get("total").unwrap().as_f64().unwrap(), 0.0);
        assert!(ov.days.is_empty());
        assert_eq!(ov.budget_monthly_cny, 600.0);
        // alert.json 缺场 → budget.source == "missing"（UI 走「等预算数据」降级）。
        assert_eq!(ov.budget.source, "missing");
        assert!(ov.budget.level.is_none() && ov.budget.month_ratio.is_none());
        let _ = std::fs::remove_dir_all(&tmp);
    }

    /// alert.json 解析：真机形态（2026-08-30 实测 schema）的字段逐个落位，
    /// source == "alert"。generated_at 保留为新鲜度源，UI 只读不重算百分比。
    #[test]
    fn read_budget_alert_parses_real_shaped_alert() {
        let tmp = std::env::temp_dir().join("sv-menubar-alert-parse-test");
        let _ = std::fs::remove_dir_all(&tmp);
        std::fs::create_dir_all(tmp.join("state")).unwrap();
        std::fs::write(
            tmp.join("state").join("alert.json"),
            r#"{
              "adaptive_floor_applied": false,
              "effective_daily_budget": 30.0,
              "generated_at": "2026-08-30T07:04:38.548588+00:00",
              "level": "ok",
              "month_cost": 12.7887157,
              "month_ratio": 0.021314526166666667,
              "monthly_cny": 600.0,
              "peak_over": false,
              "peak_share": null,
              "ratio": null,
              "reasons": ["month at 2% of monthly budget (¥12.79 / ¥600.00)"],
              "schema_version": "1.0.0",
              "snoozed_until": null,
              "today_cost": null,
              "today_peak_cost": null
            }"#,
        )
        .unwrap();

        let a = read_budget_alert(&tmp);
        assert_eq!(a.source, "alert");
        assert_eq!(a.level.as_deref(), Some("ok"));
        assert_eq!(a.effective_daily_budget, Some(30.0));
        assert_eq!(a.month_ratio, Some(0.021314526166666667));
        assert!(a.ratio.is_none(), "今日无数据 → ratio 应为 null");
        assert_eq!(a.snoozed_until, None);
        assert_eq!(a.reasons.as_ref().unwrap().len(), 1);
        assert_eq!(
            a.generated_at.as_deref(),
            Some("2026-08-30T07:04:38.548588+00:00")
        );
        assert_eq!(a.schema_version.as_deref(), Some("1.0.0"));
        assert_eq!(a.month_cost, Some(12.7887157));

        let ov = read_overview_at(&tmp);
        assert_eq!(ov.budget.source, "alert");
        assert_eq!(ov.budget.level.as_deref(), Some("ok"));
        let _ = std::fs::remove_dir_all(&tmp);
    }

    /// alert.json 是合法 JSON 但缺关键字段 → 该字段 None、source 仍为 "alert"
    /// （文件在，只是不全）；UI 据此可以显示部分权威值，不退回整行降级。
    #[test]
    fn read_budget_alert_tolerates_partial_alert() {
        let tmp = std::env::temp_dir().join("sv-menubar-alert-partial-test");
        let _ = std::fs::remove_dir_all(&tmp);
        std::fs::create_dir_all(tmp.join("state")).unwrap();
        std::fs::write(tmp.join("state").join("alert.json"), r#"{"level":"ok"}"#).unwrap();
        let a = read_budget_alert(&tmp);
        assert_eq!(a.source, "alert");
        assert_eq!(a.level.as_deref(), Some("ok"));
        assert!(a.month_ratio.is_none() && a.snoozed_until.is_none());
        let _ = std::fs::remove_dir_all(&tmp);
    }

    /// SyncStatus::ok/fail 构造函数：ok 标志对、stage 对、at 是北京时间（非 None）。
    /// at 的格式由 `beijing_timestamp` 单独钉住，这里只钉「落盘的是可展示时刻」。
    #[test]
    fn sync_status_constructors_flag_and_stage() {
        let ok = SyncStatus::ok("fold", "已折入 s1".into());
        assert!(ok.ok && ok.stage == "fold" && ok.message == "已折入 s1");
        assert!(ok.at.is_some());
        let fail = SyncStatus::fail("discover", "agent-vitals discover 失败".into());
        assert!(!fail.ok && fail.stage == "discover");
        assert!(fail.at.is_some());
    }

    /// 北京时间戳：1787846400 = 2026-08-28 00:00 北京（civil_from_unix_secs 同款
    /// 夹具）。格式 `YYYY-MM-DD HH:MM:SS`，面板可直接展示。
    #[test]
    fn beijing_timestamp_pins_known_epoch() {
        assert_eq!(beijing_timestamp(1787846400), "2026-08-28 00:00:00");
        // +8h → 同日 08:00:00；跨天进位也正确（再 +24h → 08-29）。
        assert_eq!(beijing_timestamp(1787846400 + 8 * 3600), "2026-08-28 08:00:00");
        assert_eq!(beijing_timestamp(1787846400 + 32 * 3600), "2026-08-29 08:00:00");
    }

    /// 缺场默认：没有 last-sync.json → "never / 尚未同步"，ok=false——这是「首次
    /// 启动、还没跑过 tick」的诚实空态，不是失败也不是成功。
    #[test]
    fn sync_status_defaults_to_never_when_missing() {
        let tmp = std::env::temp_dir().join("sv-menubar-sync-missing-test");
        let _ = std::fs::remove_dir_all(&tmp);
        std::fs::create_dir_all(tmp.join("state")).unwrap();
        let s = load_sync_status(&tmp);
        assert!(!s.ok && s.stage == "never" && s.message == "尚未同步" && s.at.is_none());
        let _ = std::fs::remove_dir_all(&tmp);
    }

    /// 落盘↔读回往返：save_sync_status_at 写的 JSON 能被 load_sync_status 原样读回
    /// （stage/message/at 不丢）。这是「同步结果可展示」的存储侧契约。
    #[test]
    fn save_then_load_sync_status_round_trips() {
        let tmp = std::env::temp_dir().join("sv-menubar-sync-roundtrip-test");
        let _ = std::fs::remove_dir_all(&tmp);
        std::fs::create_dir_all(tmp.join("state")).unwrap();
        let status = SyncStatus::fail("oneline", "oneline 失败（exit 1）：boom".into());
        save_sync_status_at(&tmp, &status);
        let back = load_sync_status(&tmp);
        assert!(!back.ok && back.stage == "oneline");
        assert_eq!(back.message, "oneline 失败（exit 1）：boom");
        assert!(back.at.is_some());
        let _ = std::fs::remove_dir_all(&tmp);
    }

    /// Overview 组装包含 sync：往临时数据根写 last-sync.json，read_overview_at 的
    /// ov.sync 应该原样带出——面板/托盘读 Overview 就能拿到同步状态，不需要第二条
    /// IPC 或第二个文件读取。
    #[test]
    fn read_overview_embeds_sync_status() {
        let tmp = std::env::temp_dir().join("sv-menubar-sync-overview-test");
        let _ = std::fs::remove_dir_all(&tmp);
        std::fs::create_dir_all(tmp.join("state")).unwrap();
        save_sync_status_at(&tmp, &SyncStatus::ok("fold", "已折入 sess-x".into()));
        let ov = read_overview_at(&tmp);
        assert!(ov.sync.ok && ov.sync.stage == "fold");
        assert_eq!(ov.sync.message, "已折入 sess-x");
        let _ = std::fs::remove_dir_all(&tmp);
    }

    /// day_to_row 三态：exact（by_model 覆盖完整 → basis "exact"、coverage 1.0）、
    /// partial（覆盖 30% → basis "partial"、coverage 0.3）、无 by_model（→ basis
    /// None、bucket_cost fallback）。夹具与 core `cost.rs` 的 `priced_day_*` 三测
    /// 同一组——菜单栏逐日行不许给同一份日桶报出另一个价。
    #[test]
    fn day_to_row_pins_exact_partial_and_legacy_states() {
        let pricing = load_pricing();
        let bucket = |uncached: u64| serde_json::json!({
            "uncached_input_tokens": uncached, "output_tokens": 0,
            "cache_read_tokens": 0, "cache_write_tokens": 0,
            "peak_uncached_input_tokens": 0, "peak_output_tokens": 0,
            "peak_cache_read_tokens": 0, "peak_cache_write_tokens": 0,
        });
        let exact = serde_json::json!({
            "uncached_input_tokens": 1000000, "output_tokens": 0,
            "cache_read_tokens": 0, "cache_write_tokens": 0,
            "peak_uncached_input_tokens": 0, "peak_output_tokens": 0,
            "peak_cache_read_tokens": 0, "peak_cache_write_tokens": 0,
            "by_model": {"deepseek-v4-flash": bucket(1000000)},
        });
        let partial = serde_json::json!({
            "uncached_input_tokens": 1000000, "output_tokens": 0,
            "cache_read_tokens": 0, "cache_write_tokens": 0,
            "peak_uncached_input_tokens": 0, "peak_output_tokens": 0,
            "peak_cache_read_tokens": 0, "peak_cache_write_tokens": 0,
            "by_model": {"deepseek-v4-flash": bucket(300000)},
        });
        let legacy = serde_json::json!({
            "uncached_input_tokens": 1000000, "output_tokens": 0,
            "cache_read_tokens": 0, "cache_write_tokens": 0,
            "peak_uncached_input_tokens": 0, "peak_output_tokens": 0,
            "peak_cache_read_tokens": 0, "peak_cache_write_tokens": 0,
        });

        let e = day_to_row("2026-08-01", &exact, &pricing);
        assert_eq!(e.basis.as_deref(), Some("exact"));
        assert_eq!(e.coverage, Some(1.0));
        assert!((e.total - 1.5).abs() < 1e-9);

        let p = day_to_row("2026-08-02", &partial, &pricing);
        assert_eq!(p.basis.as_deref(), Some("partial"));
        assert!((p.coverage.unwrap() - 0.3).abs() < 1e-9);

        let l = day_to_row("2026-08-03", &legacy, &pricing);
        assert_eq!(l.basis, None);
        assert_eq!(l.coverage, None);
        assert!((l.total - 1.5).abs() < 1e-9);
    }

    /// 当月读取：month.json 里混进外月行也要被滤掉——读哪个月就只认哪个月的键
    /// （镜像二进制 read_month 的防御语义）。行按日期排序，过滤后的 map 只含当月
    /// 两日 → `month_cost(raw)` 与逐行求和必然一致。
    #[test]
    fn read_month_days_at_filters_current_month() {
        let cm = current_month_beijing();
        let tmp = std::env::temp_dir().join("sv-menubar-read-month-current-test");
        let _ = std::fs::remove_dir_all(&tmp);
        std::fs::create_dir_all(tmp.join("state")).unwrap();
        let day = serde_json::json!({
            "uncached_input_tokens": 1000000, "output_tokens": 0,
            "cache_read_tokens": 0, "cache_write_tokens": 0,
            "peak_uncached_input_tokens": 0, "peak_output_tokens": 0,
            "peak_cache_read_tokens": 0, "peak_cache_write_tokens": 0,
        });
        let month = serde_json::json!({
            "month": cm,
            "days": {
                format!("{cm}-01"): day.clone(),
                format!("{cm}-15"): day.clone(),
                "1999-01-01": day.clone(),
            },
        });
        std::fs::write(tmp.join("state").join("month.json"), month.to_string()).unwrap();
        let pricing = load_pricing();
        let (raw, rows) = read_month_days_at(&tmp, &cm, &pricing).expect("当月有数据");
        assert_eq!(rows.len(), 2);
        assert_eq!(rows[0].date, format!("{cm}-01"));
        assert_eq!(rows[1].date, format!("{cm}-15"));
        assert_eq!(raw.as_object().unwrap().len(), 2, "过滤后 map 只含当月两日");
        let _ = std::fs::remove_dir_all(&tmp);
    }

    /// partial 保真：日历逐日行对 partial 日必须保留 basis=="partial" 与 coverage
    /// 数值，不许把部分覆盖抹平成 exact——这是 8 月账目的原 bug。走历史分支
    /// （1999-01 ≠ 当前月）验证归档读取也保真。
    #[test]
    fn read_month_days_at_preserves_partial_coverage() {
        let tmp = std::env::temp_dir().join("sv-menubar-read-month-partial-test");
        let _ = std::fs::remove_dir_all(&tmp);
        std::fs::create_dir_all(tmp.join("state")).unwrap();
        let partial_day = serde_json::json!({
            "uncached_input_tokens": 1000000, "output_tokens": 0,
            "cache_read_tokens": 0, "cache_write_tokens": 0,
            "peak_uncached_input_tokens": 0, "peak_output_tokens": 0,
            "peak_cache_read_tokens": 0, "peak_cache_write_tokens": 0,
            "by_model": {"deepseek-v4-flash": {
                "uncached_input_tokens": 300000, "output_tokens": 0,
                "cache_read_tokens": 0, "cache_write_tokens": 0,
                "peak_uncached_input_tokens": 0, "peak_output_tokens": 0,
                "peak_cache_read_tokens": 0, "peak_cache_write_tokens": 0,
            }},
        });
        let archive = serde_json::json!({
            "months": {"1999-01": {"days": {"1999-01-05": partial_day}, "archived_at": "x"}},
        });
        std::fs::write(tmp.join("state").join("month-archive.json"), archive.to_string()).unwrap();
        let pricing = load_pricing();
        let (_, rows) = read_month_days_at(&tmp, "1999-01", &pricing).expect("历史月有数据");
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].date, "1999-01-05");
        assert_eq!(rows[0].basis.as_deref(), Some("partial"));
        assert!((rows[0].coverage.unwrap() - 0.3).abs() < 1e-9);
        let _ = std::fs::remove_dir_all(&tmp);
    }

    /// 历史月读取：month-archive.json 的 `/months/{month}/days` 读得到；缺月 → None
    /// （不是 Some+空）。
    #[test]
    fn read_month_days_at_reads_archive_and_missing_is_none() {
        let tmp = std::env::temp_dir().join("sv-menubar-read-month-archive-test");
        let _ = std::fs::remove_dir_all(&tmp);
        std::fs::create_dir_all(tmp.join("state")).unwrap();
        let day = serde_json::json!({
            "uncached_input_tokens": 1000000, "output_tokens": 0,
            "cache_read_tokens": 0, "cache_write_tokens": 0,
            "peak_uncached_input_tokens": 0, "peak_output_tokens": 0,
            "peak_cache_read_tokens": 0, "peak_cache_write_tokens": 0,
        });
        let archive = serde_json::json!({
            "schema_version": "1",
            "months": {
                "1999-01": {"days": {"1999-01-10": day.clone()}, "archived_at": "x"},
            },
        });
        std::fs::write(tmp.join("state").join("month-archive.json"), archive.to_string()).unwrap();
        let pricing = load_pricing();
        let (raw, rows) = read_month_days_at(&tmp, "1999-01", &pricing).expect("归档月有数据");
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].date, "1999-01-10");
        assert_eq!(raw.as_object().unwrap().len(), 1);
        assert!(read_month_days_at(&tmp, "1999-02", &pricing).is_none(), "缺月 → None");
        let _ = std::fs::remove_dir_all(&tmp);
    }

    /// 空月诚实：days 为空 → None（不是 Some+空）。当月与历史各测一条。
    #[test]
    fn read_month_days_at_empty_month_is_none() {
        let tmp = std::env::temp_dir().join("sv-menubar-read-month-empty-test");
        let _ = std::fs::remove_dir_all(&tmp);
        std::fs::create_dir_all(tmp.join("state")).unwrap();
        std::fs::write(tmp.join("state").join("month.json"), r#"{"month":"x","days":{}}"#).unwrap();
        let pricing = load_pricing();
        assert!(read_month_days_at(&tmp, &current_month_beijing(), &pricing).is_none());
        let archive = r#"{"months":{"1999-03":{"days":{},"archived_at":"x"}}}"#;
        std::fs::write(tmp.join("state").join("month-archive.json"), archive).unwrap();
        assert!(read_month_days_at(&tmp, "1999-03", &pricing).is_none());
        let _ = std::fs::remove_dir_all(&tmp);
    }

    /// month_response 形状：Some → total 等于对过滤后 map 的 month_cost、has_data
    /// true；None → has_data false、total null——前端据此显示「该月暂无数据」，
    /// 绝不出现 ¥0 格子。
    #[test]
    fn month_response_shape_some_and_none() {
        let pricing = load_pricing();
        let none = month_response("2026-08", None, &pricing);
        assert_eq!(none["has_data"], serde_json::json!(false));
        assert_eq!(none["total"], serde_json::Value::Null);
        assert_eq!(none["peak_total"], serde_json::Value::Null);
        assert_eq!(none["days"].as_array().unwrap().len(), 0);

        let day = serde_json::json!({
            "uncached_input_tokens": 1000000, "output_tokens": 0,
            "cache_read_tokens": 0, "cache_write_tokens": 0,
            "peak_uncached_input_tokens": 0, "peak_output_tokens": 0,
            "peak_cache_read_tokens": 0, "peak_cache_write_tokens": 0,
        });
        let raw = serde_json::json!({"2026-08-01": day.clone(), "2026-08-02": day});
        let mut rows = Vec::new();
        for (date, d) in raw.as_object().unwrap() {
            rows.push(day_to_row(date, d, &pricing));
        }
        rows.sort_by(|a, b| a.date.cmp(&b.date));
        let some = month_response("2026-08", Some((raw.clone(), rows)), &pricing);
        assert_eq!(some["has_data"], serde_json::json!(true));
        let expect = month_cost(&raw, &pricing);
        assert!((some["total"].as_f64().unwrap() - expect["total"].as_f64().unwrap()).abs() < 1e-9);
        assert_eq!(some["days"].as_array().unwrap().len(), 2);
    }

    /// is_month_key 防御：合法 `YYYY-MM` 通过；长度不对/分隔符错/含非数字 → 拒绝。
    #[test]
    fn is_month_key_accepts_valid_rejects_garbage() {
        assert!(is_month_key("2026-08"));
        assert!(is_month_key("1999-01"));
        assert!(!is_month_key("2026-8"));
        assert!(!is_month_key("2026-081"));
        assert!(!is_month_key("2026/08"));
        assert!(!is_month_key("202608"));
        assert!(!is_month_key("abc-def"));
        assert!(!is_month_key(""));
        assert!(!is_month_key("2026-"));
    }

    /// current_month_beijing 就是 today_beijing() 的月键——日历默认月跟着「北京
    /// 今天」走，不引日期库。
    #[test]
    fn current_month_beijing_matches_today_prefix() {
        assert_eq!(current_month_beijing(), today_beijing()[..7].to_string());
    }
}
