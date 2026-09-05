//! 读进程时钟的日期 helper（北京时区）—— runtime 允许读时钟，domain 不许。
//!
//! v0.8 Phase D6：从二进制 `src/agent/codex_cost.rs` 迁进来。纯 civil 数学在
//! `agent_vitals_domain::util::civil_from_unix_secs`（不引 `chrono`）；这里只
//! 补「现在几点」。Python 镜像 `codex_cost.py`（差分交叉断言两侧一致）。

use agent_vitals_domain::util::civil_from_unix_secs;

const BEIJING_OFFSET_SECS: i64 = 8 * 3600;

fn now_unix_secs() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

/// 北京时区当前自然月 → `YYYY-MM`。
pub fn current_month_beijing() -> String {
    let (y, m, _d) = civil_from_unix_secs(now_unix_secs(), BEIJING_OFFSET_SECS);
    format!("{:04}-{:02}", y, m)
}

/// 北京时区今天 → `YYYY-MM-DD`。`--today` 的过滤键与输出契约的 `today` 字段。
pub fn today_beijing() -> String {
    let (y, m, d) = civil_from_unix_secs(now_unix_secs(), BEIJING_OFFSET_SECS);
    format!("{:04}-{:02}-{:02}", y, m, d)
}

/// 北京时区昨天 → `YYYY-MM-DD`。v0.9 Stage 0.4 起给 `MonthlySummary`/
/// `DailySummary` 的新鲜度判断用（`rotate_today` 还没跑之前，最新一条真实
/// 记录可能停在昨天，不算"过期"）——直接减一天的秒数再走同一套 civil
/// 数学，不新引入日期库。
pub fn yesterday_beijing() -> String {
    let (y, m, d) = civil_from_unix_secs(now_unix_secs() - 86_400, BEIJING_OFFSET_SECS);
    format!("{:04}-{:02}-{:02}", y, m, d)
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
}
