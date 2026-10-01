//! 报告币种与手动汇率的持久化（`<data_home>/state/` 下两个小 JSON）。
//!
//! 账单层始终按原币种记账；这里只保存**展示偏好**：应用层用哪个币种汇总，以及用户手动
//! 输入的汇率假设。两者都不改任何费用事实，删掉文件即恢复默认。

use std::path::Path;

use agent_vitals_domain::fx::{default_reporting_currency, FxPolicy, UserRate};
use serde_json::{json, Value};

const CURRENCY_FILE: &str = "reporting-currency.json";
const MANUAL_RATES_FILE: &str = "fx-manual-rates.json";

/// 保存哨兵：选「按系统区域默认」就删文件，之后随区域走（同「跟随系统」时区的做法）。
pub const DEFAULT_SENTINEL: &str = "default";

fn state_path(data_home: &Path, file: &str) -> std::path::PathBuf { data_home.join("state").join(file) }

fn write_atomic(path: &Path, value: &Value) -> Result<(), String> {
    let directory = path.parent().ok_or("state path has no parent")?;
    std::fs::create_dir_all(directory).map_err(|error| error.to_string())?;
    // 临时文件名带进程号与纳秒：两个并发保存不再抢同一个固定的 *.json.tmp。
    let nonce = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.subsec_nanos()).unwrap_or(0);
    let temporary = path.with_extension(format!("json.{}.{nonce}.tmp", std::process::id()));
    std::fs::write(&temporary, serde_json::to_vec(value).map_err(|error| error.to_string())?).map_err(|error| error.to_string())?;
    std::fs::rename(&temporary, path).map_err(|error| error.to_string())
}

/// 文件损坏（不是合法 JSON）= 应用自己无法修复的状态：这是设置文件，不是用户账单。
/// 把坏文件改名为 `.bad` 留作证据，之后当作「没有文件」继续；否则保存、移除都会一直报错，
/// 而界面又把错误吞掉，用户只能手动删文件。
fn read_json(path: &Path) -> Result<Option<Value>, String> {
    match std::fs::read_to_string(path) {
        Ok(text) => match serde_json::from_str(&text) {
            Ok(value) => Ok(Some(value)),
            Err(_) => {
                let _ = std::fs::rename(path, path.with_extension("json.bad"));
                Ok(None)
            }
        },
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(format!("{} unreadable: {error}", path.display())),
    }
}

/// 当前报告币种与是否是默认值。`system_locale` 由调用方供给（本模块不读环境）。
/// 已保存的币种若不在快照里（快照更新后被移除）→ 退回默认，不用一个无法折算的币种。
pub fn reporting_currency(data_home: &Path, system_locale: &str) -> Result<(String, bool), String> {
    let fallback = default_reporting_currency(system_locale).to_string();
    let Some(saved) = read_json(&state_path(data_home, CURRENCY_FILE))? else { return Ok((fallback, true)) };
    let code = saved.get("currency").and_then(Value::as_str).map(str::to_ascii_uppercase);
    let policy = FxPolicy::bundled()?;
    match code {
        Some(code) if policy.supports(&code) => Ok((code, false)),
        _ => Ok((fallback, true)),
    }
}

pub fn save_reporting_currency(data_home: &Path, code: &str) -> Result<String, String> {
    let path = state_path(data_home, CURRENCY_FILE);
    if code.trim().eq_ignore_ascii_case(DEFAULT_SENTINEL) {
        match std::fs::remove_file(&path) {
            Ok(()) => {}
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(error) => return Err(error.to_string()),
        }
        return Ok(DEFAULT_SENTINEL.to_string());
    }
    let upper = code.trim().to_ascii_uppercase();
    if !FxPolicy::bundled()?.supports(&upper) { return Err(format!("currency {code:?} has no reference rate")); }
    write_atomic(&path, &json!({ "currency": upper }))?;
    Ok(upper)
}

/// 读手动汇率，同时报告有没有读不懂而被跳过的行（调用方据此在改写前先备份，不静默丢行）。
fn read_manual(data_home: &Path) -> Result<(Vec<UserRate>, bool), String> {
    let Some(root) = read_json(&state_path(data_home, MANUAL_RATES_FILE))? else { return Ok((Vec::new(), false)) };
    let Some(rows) = root.get("rates").and_then(Value::as_array) else { return Ok((Vec::new(), true)) };
    let mut out = Vec::new();
    let mut lossy = false;
    for row in rows {
        let (Some(from), Some(to), Some(rate)) = (row.get("from").and_then(Value::as_str), row.get("to").and_then(Value::as_str), row.get("rate").and_then(Value::as_f64)) else { lossy = true; continue };
        out.push(UserRate { from: from.into(), to: to.into(), rate, as_of: row.get("as_of").and_then(Value::as_str).map(String::from) });
    }
    Ok((out, lossy))
}

pub fn manual_rates(data_home: &Path) -> Result<Vec<UserRate>, String> {
    read_manual(data_home).map(|(rates, _)| rates)
}

/// 改写之前：若原文件里有读不懂的行，先整份备份成 `.bak`，再写。
fn backup_if_lossy(data_home: &Path, lossy: bool) {
    if lossy {
        let path = state_path(data_home, MANUAL_RATES_FILE);
        let _ = std::fs::copy(&path, path.with_extension("json.bak"));
    }
}

fn write_manual(data_home: &Path, rates: &[UserRate]) -> Result<(), String> {
    let rows: Vec<Value> = rates.iter().map(|r| json!({ "from": r.from, "to": r.to, "rate": r.rate, "as_of": r.as_of })).collect();
    write_atomic(&state_path(data_home, MANUAL_RATES_FILE), &json!({ "rates": rows }))
}

/// 设置（或覆盖）一个币对的手动汇率。校验交给 `FxPolicy::with_user_rate`。
pub fn save_manual_rate(data_home: &Path, rate: UserRate) -> Result<(), String> {
    FxPolicy::bundled()?.with_user_rate(rate.clone())?; // 只为校验
    let (from, to) = (rate.from.to_ascii_uppercase(), rate.to.to_ascii_uppercase());
    let (existing, lossy) = read_manual(data_home)?;
    backup_if_lossy(data_home, lossy);
    let mut rates: Vec<UserRate> = existing.into_iter()
        .filter(|r| !(r.from.eq_ignore_ascii_case(&from) && r.to.eq_ignore_ascii_case(&to)) && !(r.from.eq_ignore_ascii_case(&to) && r.to.eq_ignore_ascii_case(&from)))
        .collect();
    rates.push(UserRate { from, to, ..rate });
    write_manual(data_home, &rates)
}

pub fn remove_manual_rate(data_home: &Path, from: &str, to: &str) -> Result<(), String> {
    let (existing, lossy) = read_manual(data_home)?;
    backup_if_lossy(data_home, lossy);
    let rates: Vec<UserRate> = existing.into_iter()
        .filter(|r| !(r.from.eq_ignore_ascii_case(from) && r.to.eq_ignore_ascii_case(to)) && !(r.from.eq_ignore_ascii_case(to) && r.to.eq_ignore_ascii_case(from)))
        .collect();
    write_manual(data_home, &rates)
}

/// 生效的汇率策略：内置快照 + 用户手动汇率（坏条目被丢弃而不是让整个策略失败）。
pub fn policy(data_home: &Path) -> FxPolicy {
    let mut policy = FxPolicy::bundled().expect("bundled FX snapshot is validated by tests");
    for rate in manual_rates(data_home).unwrap_or_default() {
        if let Ok(next) = policy.clone().with_user_rate(rate) { policy = next; }
    }
    policy
}

#[cfg(test)]
mod tests {
    use super::*;

    fn home(name: &str) -> std::path::PathBuf {
        let path = std::env::temp_dir().join(format!("av-fx-settings-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&path);
        path
    }

    #[test]
    fn reporting_currency_defaults_by_region_and_can_be_overridden_then_reset() {
        let h = home("currency");
        assert_eq!(reporting_currency(&h, "en_US").unwrap(), ("USD".into(), true));
        assert_eq!(reporting_currency(&h, "zh_CN").unwrap(), ("CNY".into(), true));
        assert_eq!(reporting_currency(&h, "fr_FR").unwrap(), ("USD".into(), true), "其他一律 USD");
        assert_eq!(save_reporting_currency(&h, "eur").unwrap(), "EUR");
        assert_eq!(reporting_currency(&h, "zh_CN").unwrap(), ("EUR".into(), false), "显式选择优先于区域");
        assert!(save_reporting_currency(&h, "XXX").is_err(), "没有汇率的币种不能当报告币种");
        assert_eq!(save_reporting_currency(&h, DEFAULT_SENTINEL).unwrap(), DEFAULT_SENTINEL);
        assert_eq!(reporting_currency(&h, "zh_CN").unwrap(), ("CNY".into(), true), "选默认 = 删文件，随区域走");
        let _ = std::fs::remove_dir_all(&h);
    }

    #[test]
    fn a_corrupt_manual_rates_file_is_set_aside_and_the_user_can_save_again() {
        let h = home("corrupt");
        std::fs::create_dir_all(h.join("state")).unwrap();
        let path = h.join("state").join(MANUAL_RATES_FILE);
        std::fs::write(&path, "{garbage").unwrap();
        assert!(manual_rates(&h).unwrap().is_empty(), "损坏文件当作没有，而不是一直报错");
        assert!(path.with_extension("json.bad").exists(), "坏文件留作证据");
        save_manual_rate(&h, UserRate { from: "USD".into(), to: "CNY".into(), rate: 6.8, as_of: None }).unwrap();
        assert_eq!(manual_rates(&h).unwrap().len(), 1);
        let _ = std::fs::remove_dir_all(&h);
    }

    #[test]
    fn rows_that_cannot_be_read_are_backed_up_before_the_file_is_rewritten() {
        let h = home("lossy");
        std::fs::create_dir_all(h.join("state")).unwrap();
        let path = h.join("state").join(MANUAL_RATES_FILE);
        std::fs::write(&path, r#"{"rates":[{"from":"USD","to":"CNY","rate":"7.1"},{"from":"EUR","to":"JPY","rate":160.0}]}"#).unwrap();
        save_manual_rate(&h, UserRate { from: "GBP".into(), to: "USD".into(), rate: 1.3, as_of: None }).unwrap();
        let backup = std::fs::read_to_string(path.with_extension("json.bak")).unwrap();
        assert!(backup.contains("\"7.1\""), "读不懂的行（字符串汇率）没有被静默丢掉：{backup}");
        let _ = std::fs::remove_dir_all(&h);
    }

    #[test]
    fn the_default_sentinel_is_forgiving_about_case_and_spaces() {
        let h = home("sentinel");
        save_reporting_currency(&h, "EUR").unwrap();
        assert_eq!(save_reporting_currency(&h, " Default ").unwrap(), DEFAULT_SENTINEL);
        assert_eq!(reporting_currency(&h, "en_US").unwrap(), ("USD".into(), true));
        let _ = std::fs::remove_dir_all(&h);
    }

    #[test]
    fn a_saved_currency_missing_from_the_snapshot_falls_back_instead_of_breaking() {
        let h = home("stale");
        std::fs::create_dir_all(h.join("state")).unwrap();
        std::fs::write(h.join("state").join(CURRENCY_FILE), r#"{"currency":"ZZZ"}"#).unwrap();
        assert_eq!(reporting_currency(&h, "en_US").unwrap(), ("USD".into(), true));
        let _ = std::fs::remove_dir_all(&h);
    }

    #[test]
    fn manual_rates_round_trip_replace_the_same_pair_and_feed_the_policy() {
        let h = home("manual");
        assert!(manual_rates(&h).unwrap().is_empty());
        save_manual_rate(&h, UserRate { from: "usd".into(), to: "cny".into(), rate: 6.8, as_of: Some("2026-09-01".into()) }).unwrap();
        // 同一币对（含反向）再存 = 覆盖，不并存
        save_manual_rate(&h, UserRate { from: "CNY".into(), to: "USD".into(), rate: 0.15, as_of: None }).unwrap();
        let rates = manual_rates(&h).unwrap();
        assert_eq!(rates.len(), 1);
        assert_eq!((rates[0].from.as_str(), rates[0].to.as_str()), ("CNY", "USD"));
        let c = policy(&h).convert(100.0, "CNY", "USD").unwrap();
        assert_eq!((c.rate, c.rate_source), (0.15, agent_vitals_domain::fx::RateSource::UserAssumption));
        assert!(save_manual_rate(&h, UserRate { from: "USD".into(), to: "CNY".into(), rate: 0.0, as_of: None }).is_err());
        remove_manual_rate(&h, "USD", "CNY").unwrap();
        assert!(manual_rates(&h).unwrap().is_empty());
        let _ = std::fs::remove_dir_all(&h);
    }
}
