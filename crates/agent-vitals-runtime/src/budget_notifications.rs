//! 预算提醒的本地投递去重账本。
//!
//! 它只决定「这一次跨越是否允许投递」，不负责发送系统通知，也不重新计算
//! 预算。调用方必须先用权威预算结果判定具体的日/月阈值；静默期间不得调用
//! `claim_delivery`，从而不会吞掉静默结束后应当出现的首次提醒。

use std::collections::BTreeMap;
use std::path::Path;

use serde::{Deserialize, Serialize};

const DELIVERY_FILE: &str = "budget-alert-deliveries.json";
const LOCK_FILE: &str = ".budget-alert-deliveries.lock";

/// 一条提醒的稳定身份。`budget_revision` 应来自预算配置的更新时间；用户修改
/// 预算后，用新阈值重新判断，不被旧配置下的投递记录抑制。
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BudgetAlertDeliveryKey {
    /// 日预算使用 `YYYY-MM-DD`，月预算使用 `YYYY-MM`。
    pub period: String,
    pub scope: BudgetAlertScope,
    pub threshold: BudgetAlertThreshold,
    pub budget_revision: i64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum BudgetAlertScope {
    Daily,
    Monthly,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum BudgetAlertThreshold {
    Warn,
    Over,
}

impl BudgetAlertDeliveryKey {
    fn encoded(&self) -> Result<String, String> {
        let period_is_valid = match self.scope {
            BudgetAlertScope::Daily => valid_day(&self.period),
            BudgetAlertScope::Monthly => valid_month(&self.period),
        };
        if !period_is_valid {
            return Err("budget alert period is invalid for its scope".to_string());
        }
        if self.budget_revision < 0 {
            return Err("budget alert revision must be non-negative".to_string());
        }
        let scope = match self.scope { BudgetAlertScope::Daily => "daily", BudgetAlertScope::Monthly => "monthly" };
        let threshold = match self.threshold { BudgetAlertThreshold::Warn => "warn", BudgetAlertThreshold::Over => "over" };
        Ok(format!("{}|{scope}|{threshold}|{}", self.period, self.budget_revision))
    }
}

#[derive(Debug, Default, Deserialize, Serialize)]
struct DeliveryState {
    deliveries: BTreeMap<String, i64>,
}

/// 原子地领取一次投递许可。返回 true 表示调用方现在应发送提醒；false 表示
/// 相同周期、阈值和预算版本已经发送过。读写/锁失败一律返回错误，调用方应
/// fail-closed 而不是发送可能重复的通知。
pub fn claim_delivery(
    data_home: &Path,
    key: &BudgetAlertDeliveryKey,
    now_ms: i64,
) -> Result<bool, String> {
    if now_ms < 0 { return Err("budget alert timestamp must be non-negative".to_string()); }
    let encoded = key.encoded()?;
    let directory = data_home.join("state");
    let lock = crate::lease::acquire_blocking(
        &directory.join(LOCK_FILE), "budget-alert-delivery", 2_000, 2_000,
    ).map_err(|error| format!("budget alert delivery lock unavailable: {error}"))?;
    let mut state = read_state(&directory)?;
    if state.deliveries.contains_key(&encoded) {
        return Ok(false);
    }
    state.deliveries.insert(encoded, now_ms);
    write_state(&directory, &state)?;
    lock.release().map_err(|error| format!("budget alert delivery lock release failed: {error}"))?;
    Ok(true)
}

fn read_state(directory: &Path) -> Result<DeliveryState, String> {
    let path = directory.join(DELIVERY_FILE);
    match std::fs::read_to_string(path) {
        Ok(text) => serde_json::from_str(&text)
            .map_err(|error| format!("budget alert delivery state is invalid: {error}")),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(DeliveryState::default()),
        Err(error) => Err(format!("budget alert delivery state is unreadable: {error}")),
    }
}

fn write_state(directory: &Path, state: &DeliveryState) -> Result<(), String> {
    std::fs::create_dir_all(directory).map_err(|error| error.to_string())?;
    let temporary = directory.join("budget-alert-deliveries.json.tmp");
    let target = directory.join(DELIVERY_FILE);
    let text = serde_json::to_vec(state).map_err(|error| error.to_string())?;
    std::fs::write(&temporary, text).map_err(|error| error.to_string())?;
    std::fs::rename(temporary, target).map_err(|error| error.to_string())
}

fn valid_month(period: &str) -> bool {
    period.is_ascii()
        && period.len() == 7
        && period.as_bytes().get(4) == Some(&b'-')
        && period[..4].parse::<u16>().is_ok()
        && period[5..].parse::<u8>().is_ok_and(|month| (1..=12).contains(&month))
}

fn valid_day(period: &str) -> bool {
    period.is_ascii()
        && period.len() == 10
        && period.as_bytes().get(4) == Some(&b'-')
        && period.as_bytes().get(7) == Some(&b'-')
        && valid_month(&period[..7])
        && period[8..].parse::<u8>().is_ok_and(|day| (1..=31).contains(&day))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temporary_home(name: &str) -> std::path::PathBuf {
        std::env::temp_dir().join(format!("agent-vitals-budget-notifications-{name}-{}", std::process::id()))
    }

    fn daily(threshold: BudgetAlertThreshold, revision: i64) -> BudgetAlertDeliveryKey {
        BudgetAlertDeliveryKey {
            period: "2026-09-12".to_string(), scope: BudgetAlertScope::Daily,
            threshold, budget_revision: revision,
        }
    }

    #[test]
    fn same_period_threshold_and_budget_revision_only_claims_once() {
        let home = temporary_home("dedupe");
        let _ = std::fs::remove_dir_all(&home);
        let key = daily(BudgetAlertThreshold::Warn, 7);
        assert!(claim_delivery(&home, &key, 100).unwrap());
        assert!(!claim_delivery(&home, &key, 200).unwrap());
        assert!(claim_delivery(&home, &daily(BudgetAlertThreshold::Over, 7), 300).unwrap());
        assert!(claim_delivery(&home, &daily(BudgetAlertThreshold::Warn, 8), 400).unwrap());
        let _ = std::fs::remove_dir_all(&home);
    }

    #[test]
    fn malformed_state_fails_closed() {
        let home = temporary_home("invalid");
        let _ = std::fs::remove_dir_all(&home);
        std::fs::create_dir_all(home.join("state")).unwrap();
        std::fs::write(home.join("state").join(DELIVERY_FILE), b"not json").unwrap();
        assert!(claim_delivery(&home, &daily(BudgetAlertThreshold::Warn, 1), 100).is_err());
        let _ = std::fs::remove_dir_all(&home);
    }

    #[test]
    fn invalid_period_is_rejected_before_writing() {
        let home = temporary_home("invalid-period");
        let _ = std::fs::remove_dir_all(&home);
        let key = BudgetAlertDeliveryKey {
            period: "2026-13".to_string(), scope: BudgetAlertScope::Monthly,
            threshold: BudgetAlertThreshold::Warn, budget_revision: 1,
        };
        assert!(claim_delivery(&home, &key, 100).is_err());
        assert!(!home.join("state").join(DELIVERY_FILE).exists());
        let _ = std::fs::remove_dir_all(&home);
    }

    #[test]
    fn non_ascii_period_is_rejected_without_panicking() {
        let home = temporary_home("unicode-period");
        let _ = std::fs::remove_dir_all(&home);
        let key = BudgetAlertDeliveryKey {
            period: "预算周期".to_string(), scope: BudgetAlertScope::Monthly,
            threshold: BudgetAlertThreshold::Warn, budget_revision: 1,
        };
        assert!(claim_delivery(&home, &key, 100).is_err());
        let _ = std::fs::remove_dir_all(&home);
    }
}
