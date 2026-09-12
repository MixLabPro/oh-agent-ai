//! 读进程时钟的日期 helper——runtime 允许读时钟，domain 不许。
//!
//! v0.8 Phase D6：从二进制 `src/agent/codex_cost.rs` 迁进来。Python 镜像
//! `codex_cost.py` 通过同一系统时区规则保持差分对拍一致。

use jiff::{tz::TimeZone, Timestamp, ToSpan};

/// 北京时区当前自然月 → `YYYY-MM`。
pub fn current_month_beijing() -> String {
    current_month_system()
}

/// 北京时区今天 → `YYYY-MM-DD`。`--today` 的过滤键与输出契约的 `today` 字段。
pub fn today_beijing() -> String {
    today_system()
}

/// 北京时区昨天 → `YYYY-MM-DD`。v0.9 Stage 0.4 起给 `MonthlySummary`/
/// `DailySummary` 的新鲜度判断用（`rotate_today` 还没跑之前，最新一条真实
/// 记录可能停在昨天，不算"过期"）——直接减一天的秒数再走同一套 civil
/// 数学，不新引入日期库。
pub fn yesterday_beijing() -> String {
    yesterday_system()
}

/// 统计使用的系统 IANA 时区。Jiff 读取 macOS/Linux 的系统设置，并处理
/// `TZ` 覆盖、夏令时和历史偏移；供应商价格规则不得调用这个值来改写价卡。
pub fn system_timezone_name() -> String {
    TimeZone::system().iana_name().unwrap_or("Etc/Unknown").to_string()
}

/// 统计时区：优先使用启动时由 statistics_timezone::apply 写入的 IANA
/// `TZ`，否则回退到 OS 时区。macOS 的系统时区对象不会因为进程内修改
/// `TZ` 而自动改变，因此统计计算不能只调用 `TimeZone::system()`。
pub fn statistics_timezone() -> TimeZone {
    let configured = std::env::var("TZ").ok().map(|value| value.trim_start_matches(':').to_string());
    configured
        .as_deref()
        .and_then(|name| TimeZone::get(name).ok())
        .unwrap_or_else(TimeZone::system)
}

fn system_now() -> jiff::Zoned {
    Timestamp::now().to_zoned(statistics_timezone())
}

fn format_zoned_date(date: jiff::civil::Date) -> String {
    format!("{:04}-{:02}-{:02}", date.year(), date.month(), date.day())
}

/// 将一个绝对时间按指定 IANA 时区投影为统计日期。该函数只改变展示/统计
/// 边界，不改变输入的 epoch 时间，也不参与供应商价格时区判断。
pub fn date_for_unix_secs_in_timezone(unix_secs: i64, timezone: &str) -> Option<String> {
    let zone = TimeZone::get(timezone).ok()?;
    let timestamp = Timestamp::from_second(unix_secs).ok()?;
    Some(format_zoned_date(timestamp.to_zoned(zone).date()))
}

/// 返回指定绝对时间在 IANA 时区中的实际偏移，用于统计边界计算和 DST 回归测试。
pub fn offset_seconds_for_unix_secs_in_timezone(unix_secs: i64, timezone: &str) -> Option<i32> {
    let zone = TimeZone::get(timezone).ok()?;
    let timestamp = Timestamp::from_second(unix_secs).ok()?;
    Some(timestamp.to_zoned(zone).offset().seconds())
}

/// 将 Unix 秒按系统 IANA 时区格式化为菜单栏使用的本地时间文本。
/// 输入仍是绝对时间；只有展示时区变化，供应商价格规则不读取此值。
pub fn local_timestamp_text(unix_secs: i64) -> String {
    let timestamp = Timestamp::from_second(unix_secs)
        .unwrap_or_else(|_| Timestamp::from_second(0).expect("Unix epoch is valid"));
    timestamp
        .to_zoned(statistics_timezone())
        .strftime("%Y-%m-%d %H:%M:%S")
        .to_string()
}

/// 系统统计时区的当前自然月 → `YYYY-MM`。
pub fn current_month_system() -> String {
    let date = system_now().date();
    format!("{:04}-{:02}", date.year(), date.month())
}

/// 系统统计时区的今天 → `YYYY-MM-DD`。
pub fn today_system() -> String {
    format_zoned_date(system_now().date())
}

/// 系统统计时区的昨天。使用 civil date 运算而不是减去 24 小时，避免夏令时
/// 切换日把“昨天”错算成同一天或跳过一天。
pub fn yesterday_system() -> String {
    let date = system_now().date().checked_sub(1.days()).unwrap_or_else(|_| system_now().date());
    format_zoned_date(date)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn current_month_and_today_are_well_formed() {
        let m = current_month_beijing();
        assert!(m.len() == 7 && m.as_bytes()[4] == b'-' && m[..4].parse::<i32>().is_ok());
        let d = today_beijing();
        assert!(d.len() == 10 && d.as_bytes()[4] == b'-' && d.as_bytes()[7] == b'-');
        assert!(d.starts_with(&m));
    }

    #[test]
    fn yesterday_is_strictly_before_today() {
        let y = yesterday_beijing();
        let t = today_beijing();
        assert!(y.len() == 10 && y.as_bytes()[4] == b'-' && y.as_bytes()[7] == b'-');
        assert!(y < t, "yesterday {y} should sort strictly before today {t}");
    }

    #[test]
    fn system_timezone_is_an_iana_name_and_dates_are_well_formed() {
        let tz = system_timezone_name();
        assert!(!tz.is_empty());
        assert_eq!(today_system().len(), 10);
        assert_eq!(current_month_system().len(), 7);
        assert!(yesterday_system() < today_system());
    }

    #[test]
    fn named_timezone_projection_respects_dst_without_changing_epoch() {
        // 2026-03-08 09:30Z is before the Los Angeles spring transition;
        // 10:30Z is after it. The epoch remains unchanged, only the local offset moves.
        assert_eq!(date_for_unix_secs_in_timezone(1_772_955_000, "America/Los_Angeles"), Some("2026-03-07".into()));
        assert_eq!(date_for_unix_secs_in_timezone(1_772_958_600, "America/Los_Angeles"), Some("2026-03-08".into()));
        assert_eq!(offset_seconds_for_unix_secs_in_timezone(1_772_962_200, "America/Los_Angeles"), Some(-28_800));
        assert_eq!(offset_seconds_for_unix_secs_in_timezone(1_772_965_800, "America/Los_Angeles"), Some(-25_200));
        assert_eq!(date_for_unix_secs_in_timezone(1_772_955_000, "not/a-zone"), None);
    }
}
