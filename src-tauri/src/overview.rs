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
use serde::Serialize;
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

#[derive(Serialize)]
pub struct Overview {
    pub data_home: String,
    pub today: Option<Value>,
    pub month: Value,
    pub days: Vec<DayRow>,
    pub budget_monthly_cny: f64,
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
            let (total, peak, basis, coverage) = match priced_day(day, &pricing) {
                Some(c) => (
                    c["total"].as_f64().unwrap_or(0.0),
                    c["peak_total"].as_f64().unwrap_or(0.0),
                    c["pricing_basis"].as_str().map(|s| s.to_string()),
                    c["coverage"].as_f64(),
                ),
                None => {
                    let c = bucket_cost(day, &pricing);
                    (c["total"].as_f64().unwrap_or(0.0), c["peak_total"].as_f64().unwrap_or(0.0), None, None)
                }
            };
            days.push(DayRow { date: date.clone(), total, peak_total: peak, basis, coverage });
        }
        days.sort_by(|a, b| a.date.cmp(&b.date));
    }

    Overview {
        data_home: dh.display().to_string(),
        today: today_val,
        month,
        days,
        budget_monthly_cny: monthly_budget_cny(dh),
        estimate_note: "估算值，不是账单；覆盖率不足的日子按 fallback 价补齐并标注".to_string(),
    }
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
        let _ = std::fs::remove_dir_all(&tmp);
    }
}
