//! v0.9 Stage 0.4：`agent-vitals-data::repository::SummaryRepository` 的
//! Stage 0 实现（`docs/AGENT_VITALS_V0_9_STAGE0_RESEARCH.md` §8）。
//!
//! 只读——不写 state、不建索引、不启动任何后台任务。逐宿主接线、逐提交
//! 落地（§8.4）：DSH 本轮实现；Codex、Claude Code 是后续提交；WorkBuddy
//! 永久留在 `excluded_hosts`（用户 2026-09-05 决定，见本文档触发记录）。
//! 尚未接线的宿主临时进 `excluded_hosts`——`data_contract.rs` 原话"已知
//! 存在但本版本不产出数据的宿主"，Codex/Claude Code 此刻符合这个定义，
//! 接完各自的提交后就从这里移进 `by_host`。

use std::collections::{BTreeMap, BTreeSet};

use agent_vitals_data::projection::{
    BillingBasis, DailySummary, Freshness, FreshnessState, HostAmount, MonthlySummary,
};
use agent_vitals_data::repository::{DailySummaryQuery, MonthlySummaryQuery, SummaryRepository};

use crate::clock::{today_beijing, yesterday_beijing};

/// Stage 0 的宿主接线状态：真正读数据的 vs. 还没接的。
const WIRED_HOSTS: &[&str] = &["dsh"];
const NOT_YET_WIRED_HOSTS: &[&str] = &["codex", "claude-code"];
const PERMANENTLY_EXCLUDED_HOSTS: &[&str] = &["workbuddy"];

fn excluded_hosts() -> BTreeSet<String> {
    NOT_YET_WIRED_HOSTS
        .iter()
        .chain(PERMANENTLY_EXCLUDED_HOSTS)
        .map(|s| s.to_string())
        .collect()
}

/// 一份「日期 → 最新观测」的月度 `days` map → `HostAmount`。
///
/// `None`（`compute_month`/`read_month` 都诚实报 None——本月没有任何记录）
/// → 空 `amounts_by_basis` + `Freshness::unavailable()`：不是「花了 ¥0」，
/// 是「没有测到」（`data_contract.rs` 模块头不变式 3 的同一条纪律）。
fn dsh_host_amount(cost: Option<serde_json::Value>, latest_day: Option<&str>) -> HostAmount {
    let mut amounts_by_basis = BTreeMap::new();
    let freshness = match (&cost, latest_day) {
        (Some(c), Some(day)) => {
            // DeepSeek 官方逐 token 价表是 DSH 的真实计费费率（不是第三方猜测
            // 价），`month_cost` 只是把「用了多少 token」按「官方多少钱一个
            // token」相乘——这是可观测的真实费用，定为 MeteredActual，不是
            // MeteredEstimate（§8.4 的判断）。
            let total = c.get("total").and_then(serde_json::Value::as_f64).unwrap_or(0.0);
            amounts_by_basis.insert(BillingBasis::MeteredActual, total);
            let today = today_beijing();
            let yesterday = yesterday_beijing();
            let state = if day == today || day == yesterday {
                FreshnessState::Fresh
            } else {
                FreshnessState::Stale
            };
            Freshness { state, last_observed_at: Some(format!("{day}T00:00:00Z")) }
        }
        _ => Freshness::unavailable(),
    };
    HostAmount {
        host_id: "dsh".to_string(),
        amounts_by_basis,
        has_unresolved: false,
        freshness,
    }
}

/// `days` map 里最晚的日期键（"YYYY-MM-DD" 字符串序等价于日期序）。
fn latest_day_key(days: &serde_json::Value) -> Option<String> {
    days.as_object()?.keys().max().cloned()
}

/// Stage 0 的 `SummaryRepository`：读现有 JSON state（`budget.rs` 的
/// `month.json`/`month-archive.json`），不建任何新索引。
pub struct JsonSummaryRepository;

impl SummaryRepository for JsonSummaryRepository {
    fn monthly_summary(&self, query: &MonthlySummaryQuery) -> MonthlySummary {
        let mut by_host = BTreeMap::new();

        let days = crate::budget::read_month(Some(&query.month));
        let cost = crate::budget::compute_month(Some(&query.month));
        let latest_day = days.as_ref().and_then(latest_day_key);
        by_host.insert("dsh".to_string(), dsh_host_amount(cost, latest_day.as_deref()));

        let freshness = by_host["dsh"].freshness.clone();
        let last_observed_at = freshness.last_observed_at.clone();
        MonthlySummary {
            month: query.month.clone(),
            by_host,
            coverage: agent_vitals_data::projection::CoverageStatus {
                measured_fields: WIRED_HOSTS.len() as u64,
                total_fields: (WIRED_HOSTS.len() + NOT_YET_WIRED_HOSTS.len()) as u64,
                denominator_version: 1,
            },
            freshness,
            excluded_hosts: excluded_hosts(),
            last_observed_at,
        }
    }

    fn daily_summary(&self, query: &DailySummaryQuery) -> DailySummary {
        let month = query.date.chars().take(7).collect::<String>();
        let days = crate::budget::read_month(Some(&month));
        let day_value = days.as_ref().and_then(|d| d.get(&query.date));
        let pricing = agent_vitals_domain::cost::load_pricing();
        // 与 `agent_vitals_domain::cost::month_cost` 对单日的处理完全一致——
        // `priced_day` 认不出的旧壳形状回落 `bucket_cost`，不当"这天没测到"。
        let cost = day_value.map(|d| {
            agent_vitals_domain::cost::priced_day(d, &pricing)
                .unwrap_or_else(|| agent_vitals_domain::cost::bucket_cost(d, &pricing))
        });
        let mut by_host = BTreeMap::new();
        by_host.insert(
            "dsh".to_string(),
            dsh_host_amount(cost, day_value.map(|_| query.date.as_str())),
        );

        let freshness = by_host["dsh"].freshness.clone();
        let last_observed_at = freshness.last_observed_at.clone();
        DailySummary {
            date: query.date.clone(),
            by_host,
            coverage: agent_vitals_data::projection::CoverageStatus {
                measured_fields: WIRED_HOSTS.len() as u64,
                total_fields: (WIRED_HOSTS.len() + NOT_YET_WIRED_HOSTS.len()) as u64,
                denominator_version: 1,
            },
            freshness,
            excluded_hosts: excluded_hosts(),
            last_observed_at,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::state::atomic_write_json;
    use serde_json::json;

    fn with_home<F: FnOnce()>(f: F) {
        let _g = crate::ENV_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        let dir = std::env::temp_dir().join(format!("avr-summary-test-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let prev = std::env::var("AGENT_VITALS_HOME").ok();
        std::env::set_var("AGENT_VITALS_HOME", &dir);
        f();
        match prev {
            Some(p) => std::env::set_var("AGENT_VITALS_HOME", p),
            None => std::env::remove_var("AGENT_VITALS_HOME"),
        }
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn no_month_json_reports_unavailable_not_zero() {
        with_home(|| {
            let repo = JsonSummaryRepository;
            let summary = repo.monthly_summary(&MonthlySummaryQuery { month: "2020-01".to_string() });
            assert!(summary.contract_violations().is_empty(), "{:?}", summary.contract_violations());
            let dsh = &summary.by_host["dsh"];
            assert!(dsh.amounts_by_basis.is_empty());
            assert_eq!(dsh.freshness.state, FreshnessState::Unavailable);
            assert!(summary.excluded_hosts.contains("codex"));
            assert!(summary.excluded_hosts.contains("claude-code"));
            assert!(summary.excluded_hosts.contains("workbuddy"));
            assert!(!summary.excluded_hosts.contains("dsh"));
        });
    }

    #[test]
    fn month_with_data_sums_as_metered_actual() {
        with_home(|| {
            let month = crate::clock::current_month_beijing();
            let day_key = crate::clock::today_beijing();
            let month_json = crate::state::state_dir().join("month.json");
            // 字段名是 DSH 自己的四桶词表（`uncached_input_tokens`/
            // `cache_read_tokens`/`cache_write_tokens`/`output_tokens` + 各自
            // 的 `peak_*` 变体，见 `cost::bucket_price`）——不是 Claude Code
            // 的 `input_tokens`/`cache_read_input_tokens` 那一套，两者字段名
            // 不通用，混用会让 `priced_day` 静默算出 0（之前踩过这个坑）。
            atomic_write_json(
                &month_json,
                &json!({
                    "days": {
                        day_key.clone(): {
                            "by_model": {
                                "deepseek-v4-flash": {
                                    "uncached_input_tokens": 1_000_000,
                                    "output_tokens": 100_000,
                                    "cache_read_tokens": 0,
                                    "cache_write_tokens": 0,
                                    "peak_uncached_input_tokens": 0,
                                    "peak_output_tokens": 0,
                                    "peak_cache_read_tokens": 0,
                                    "peak_cache_write_tokens": 0,
                                }
                            }
                        }
                    }
                }),
            );
            let repo = JsonSummaryRepository;
            let summary = repo.monthly_summary(&MonthlySummaryQuery { month });
            assert!(summary.contract_violations().is_empty(), "{:?}", summary.contract_violations());
            let dsh = &summary.by_host["dsh"];
            assert_eq!(dsh.freshness.state, FreshnessState::Fresh);
            assert!(dsh.amounts_by_basis.contains_key(&BillingBasis::MeteredActual));
            assert!(summary.total_summable() > 0.0);
        });
    }
}
