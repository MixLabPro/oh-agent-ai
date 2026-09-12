//! Read-only MCP view of the independent budget profiles.

use std::path::Path;

use agent_vitals_data::authority::BudgetProfile;
use serde_json::{json, Value};

use super::{build_envelope, AuthorityHandle, ToolError, ToolSpec};

pub fn spec() -> ToolSpec {
    ToolSpec {
        name: "budget_profiles",
        description: "Report independent estimate and confirmed-spend budgets without converting or combining currencies.",
        input_schema: json!({
            "type": "object",
            "properties": {
                "month": { "type": "string", "description": "Optional Beijing month YYYY-MM; defaults to the current month." }
            },
            "additionalProperties": false
        }),
        output_schema: json!({
            "type": "object",
            "description": "spec §6 envelope; data.profiles contains one row per configured budget profile."
        }),
    }
}

pub fn run(args: &Value, data_home: &Path) -> Result<Value, ToolError> {
    let month = args.get("month")
        .and_then(Value::as_str)
        .map(str::to_owned)
        .unwrap_or_else(crate::clock::current_month_beijing);
    if !valid_month(&month) {
        return Err(ToolError::new("invalid_argument", format!("invalid `month`: {month} (expect YYYY-MM)")));
    }
    let handle = AuthorityHandle::open(data_home)?;
    let profiles = read_profiles(handle.conn())?;
    let summary = {
        use agent_vitals_data::repository::SummaryRepository;
        crate::summary::SqlSummaryRepository::at(data_home).monthly_summary(
            &agent_vitals_data::repository::MonthlySummaryQuery { month: month.clone() },
        )
    };
    let daily = {
        use agent_vitals_data::repository::SummaryRepository;
        crate::summary::SqlSummaryRepository::at(data_home).daily_summary(
            &agent_vitals_data::repository::DailySummaryQuery {
                date: crate::clock::today_beijing(),
            },
        )
    };
    let amounts = summary.by_provider.values().collect::<Vec<_>>();
    let daily_amounts = daily.by_provider.values().collect::<Vec<_>>();
    let data = json!({
        "month": month,
        "profiles": profiles.into_iter().map(|profile| {
            let spent_minor = crate::budget::budget_profile_spent_minor(
                amounts.iter().copied(), &profile.profile_id, &profile.currency,
            );
            let daily_spent_minor = crate::budget::budget_profile_spent_minor(
                daily_amounts.iter().copied(), &profile.profile_id, &profile.currency,
            );
            let has_unresolved = crate::budget::budget_profile_has_unresolved(
                amounts.iter().copied(), &profile.currency,
            );
            let daily_has_unresolved = crate::budget::budget_profile_has_unresolved(
                daily_amounts.iter().copied(), &profile.currency,
            );
            let ratio_bp = (!has_unresolved && spent_minor > 0)
                .then(|| spent_minor * 10_000 / profile.monthly_minor);
            let daily_ratio_bp = profile.daily_minor.and_then(|limit| {
                (!daily_has_unresolved && daily_spent_minor > 0)
                    .then(|| daily_spent_minor * 10_000 / limit)
            });
            let level = match (has_unresolved, ratio_bp) {
                (true, _) => "incomplete",
                (false, Some(r)) if r >= 10_000 => "exceeded",
                (false, Some(r)) if r >= profile.warning_ratio_bp => "warn",
                (false, Some(_)) => "ok",
                (false, None) => "no_data",
            };
            let daily_level = match (daily_has_unresolved, daily_ratio_bp) {
                (true, _) => "incomplete",
                (false, Some(r)) if r >= 10_000 => "exceeded",
                (false, Some(r)) if r >= profile.warning_ratio_bp => "warn",
                (false, Some(_)) => "ok",
                (false, None) if profile.daily_minor.is_some() => "no_data",
                (false, None) => "disabled",
            };
            json!({
                "profile_id": profile.profile_id, "currency": profile.currency,
                "monthly_minor": profile.monthly_minor, "daily_minor": profile.daily_minor,
                "warning_ratio_bp": profile.warning_ratio_bp,
                "spent_minor": spent_minor, "ratio_bp": ratio_bp, "level": level,
                "has_unresolved": has_unresolved,
                "daily_spent_minor": daily_spent_minor,
                "daily_ratio_bp": daily_ratio_bp, "daily_level": daily_level,
                "daily_has_unresolved": daily_has_unresolved,
            })
        }).collect::<Vec<_>>(),
    });
    Ok(build_envelope(
        handle.conn(), handle.authority_state(), None,
        summary.coverage.to_json(), Vec::new(), data,
    ))
}

fn read_profiles(conn: &rusqlite::Connection) -> Result<Vec<BudgetProfile>, ToolError> {
    let mut stmt = conn.prepare(
        "SELECT profile_id, currency, monthly_minor, daily_minor,
                warning_ratio_bp, updated_at_ms
         FROM budget_profiles ORDER BY profile_id",
    ).map_err(|e| ToolError::new("internal_error", format!("budget profile query failed: {e}")))?;
    let rows = stmt.query_map([], |r| Ok(BudgetProfile {
        profile_id: r.get(0)?, currency: r.get(1)?, monthly_minor: r.get(2)?,
        daily_minor: r.get(3)?, warning_ratio_bp: r.get(4)?, updated_at_ms: r.get(5)?,
    })).map_err(|e| ToolError::new("internal_error", format!("budget profile query failed: {e}")))?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| ToolError::new("internal_error", format!("budget profile query failed: {e}")))
}

fn valid_month(month: &str) -> bool {
    month.is_ascii() && month.len() == 7 && month.as_bytes().get(4) == Some(&b'-')
        && month[..4].parse::<u16>().is_ok()
        && month[5..].parse::<u8>().is_ok_and(|m| (1..=12).contains(&m))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn schema_is_closed_and_month_is_validated() {
        let s = spec();
        assert_eq!(s.input_schema["additionalProperties"], json!(false));
        assert!(valid_month("2026-09"));
        assert!(!valid_month("2026-13"));
        assert!(!valid_month("2026/09"));
    }
}
