//! 桌面预算提醒：只负责把 runtime 的权威预算结果投递到系统通知。
//!
//! 金额、阈值和静默状态都来自 `overview::read_overview` 的 SQL 投影；本模块
//! 不重算预算。投递前先领取 runtime 的持久化许可，通知失败也不会被重试成
//! 第二条提醒（下一轮仍可从账本语义继续判断）。

use tauri::AppHandle;
use tauri_plugin_notification::NotificationExt;

use crate::overview;

const ACTION_TYPE: &str = "budget-alert";
const FOCUS_TAB: &str = "budget";

pub fn maybe_notify(app: &AppHandle) {
    let overview = overview::read_overview();
    let budget = &overview.budget;
    if budget.source != "sql" || budget.snoozed_until.is_some() {
        return;
    }
    let data_home = overview::data_home();
    let Ok(db) = agent_vitals_data::authority::AuthorityDb::open(
        &agent_vitals_data::authority::default_authority_path(&data_home),
        agent_vitals_runtime::sql_sync::now_ms(),
    ) else {
        return;
    };
    let Ok(Some(config)) = db.budget_config_get() else {
        return;
    };
    let revision = config.updated_at_ms.max(0);
    let warn_ratio = config.warning_ratio_bp as f64 / 10_000.0;
    if !(0.0..=1.0).contains(&warn_ratio) {
        return;
    }
    let day = overview::today_beijing();
    let month = overview::current_month_beijing();

    let mut candidates = Vec::new();
    if let Some(threshold) = threshold_for(budget.ratio, warn_ratio) {
        candidates.push((
            agent_vitals_runtime::budget_notifications::BudgetAlertDeliveryKey {
                period: day,
                scope: agent_vitals_runtime::budget_notifications::BudgetAlertScope::Daily,
                threshold,
                budget_revision: revision,
            },
            budget.ratio,
            budget.effective_daily_budget,
        ));
    }
    if let Some(threshold) = threshold_for(budget.month_ratio, warn_ratio) {
        candidates.push((
            agent_vitals_runtime::budget_notifications::BudgetAlertDeliveryKey {
                period: month,
                scope: agent_vitals_runtime::budget_notifications::BudgetAlertScope::Monthly,
                threshold,
                budget_revision: revision,
            },
            budget.month_ratio,
            budget.monthly_cny,
        ));
    }

    for (key, ratio, limit) in candidates {
        let threshold = match key.threshold {
            agent_vitals_runtime::budget_notifications::BudgetAlertThreshold::Warn => "接近预算",
            agent_vitals_runtime::budget_notifications::BudgetAlertThreshold::Over => "已超预算",
        };
        let scope = match key.scope {
            agent_vitals_runtime::budget_notifications::BudgetAlertScope::Daily => "今日按量预算",
            agent_vitals_runtime::budget_notifications::BudgetAlertScope::Monthly => "本月按量预算",
        };
        let body = match (ratio, limit) {
            (Some(ratio), Some(limit)) => format!("{scope}达到 {:.0}%（预算 ¥{limit:.2}），点击查看原因与明细。", ratio * 100.0),
            (Some(ratio), None) => format!("{scope}达到 {:.0}%，点击查看原因与明细。", ratio * 100.0),
            _ => format!("{scope}{threshold}，点击查看原因与明细。"),
        };
        let app_for_notification = app.clone();
        let Ok(true) = agent_vitals_runtime::budget_notifications::claim_delivery_with(
            &data_home,
            &key,
            agent_vitals_runtime::sql_sync::now_ms(),
            || app_for_notification.notification().builder()
                .title(format!("Agent Vitals：{threshold}"))
                .body(body)
                .action_type_id(ACTION_TYPE)
                .extra("focusTab", FOCUS_TAB)
                .show()
                .map_err(|error| error.to_string()),
        ) else {
            continue;
        };
    }
}

fn threshold_for(ratio: Option<f64>, warn_ratio: f64) -> Option<agent_vitals_runtime::budget_notifications::BudgetAlertThreshold> {
    let ratio = ratio?;
    if ratio >= 1.0 {
        Some(agent_vitals_runtime::budget_notifications::BudgetAlertThreshold::Over)
    } else if ratio >= warn_ratio {
        Some(agent_vitals_runtime::budget_notifications::BudgetAlertThreshold::Warn)
    } else {
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn threshold_is_first_crossing_aware() {
        assert_eq!(threshold_for(Some(0.79), 0.8), None);
        assert_eq!(threshold_for(Some(0.8), 0.8), Some(agent_vitals_runtime::budget_notifications::BudgetAlertThreshold::Warn));
        assert_eq!(threshold_for(Some(1.0), 0.8), Some(agent_vitals_runtime::budget_notifications::BudgetAlertThreshold::Over));
        assert_eq!(threshold_for(None, 0.8), None);
    }

    #[test]
    fn malformed_warning_ratio_does_not_create_a_threshold() {
        assert_eq!(threshold_for(Some(0.8), 1.2), None);
    }
}
