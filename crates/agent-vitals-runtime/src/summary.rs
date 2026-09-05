//! v0.9 Stage 0.4：`agent-vitals-data::repository::SummaryRepository` 的
//! Stage 0 实现（`docs/AGENT_VITALS_V0_9_STAGE0_RESEARCH.md` §8）。
//!
//! 只读——不写 state、不建索引、不启动任何后台任务。逐宿主接线、逐提交
//! 落地（§8.4）：DSH（读 `budget.rs` 的 month.json）、Codex（读 ~/.codex
//! rollout 折叠计价）已接线；Claude Code 是后续提交；WorkBuddy 永久留在
//! `excluded_hosts`（用户 2026-09-05 决定，见本文档触发记录）。尚未接线的
//! 宿主临时进 `excluded_hosts`——`data_contract.rs` 原话"已知存在但本版本
//! 不产出数据的宿主"，Claude Code 此刻符合这个定义，接完后就从这里移进
//! `by_host`。

use std::collections::{BTreeMap, BTreeSet};
use std::path::Path;

use agent_vitals_data::projection::{
    BillingBasis, DailySummary, Freshness, FreshnessState, HostAmount, MonthlySummary,
};
use agent_vitals_data::repository::{DailySummaryQuery, MonthlySummaryQuery, SummaryRepository};

use crate::clock::{today_beijing, yesterday_beijing};

/// Stage 0 的宿主接线状态：真正读数据的 vs. 还没接的。
const WIRED_HOSTS: &[&str] = &["codex", "dsh"];
const NOT_YET_WIRED_HOSTS: &[&str] = &["claude-code"];
const PERMANENTLY_EXCLUDED_HOSTS: &[&str] = &["workbuddy"];

fn excluded_hosts() -> BTreeSet<String> {
    NOT_YET_WIRED_HOSTS
        .iter()
        .chain(PERMANENTLY_EXCLUDED_HOSTS)
        .map(|s| s.to_string())
        .collect()
}

/// `YYYY-MM-DD` 日键 → 新鲜度（今天/昨天 = Fresh，更早 = Stale）。Stage 0 的
/// 近似口径（§8.5）：Partial 需要「源本身还活着吗」的信号，Stage B 才有。
/// `last_observed_at` 统一 `{day}T00:00:00Z`——汇总层聚合按字符串序取最大，
/// 各宿主必须同格式，字典序才等价于时间序。
fn day_freshness(day_key: &str) -> Freshness {
    let state = if day_key == today_beijing() || day_key == yesterday_beijing() {
        FreshnessState::Fresh
    } else {
        FreshnessState::Stale
    };
    Freshness { state, last_observed_at: Some(format!("{day_key}T00:00:00Z")) }
}

/// 汇总层的新鲜度 = **最新被观测到的宿主**的新鲜度。汇总回答的是「这份数据
/// 最近还有没有在更新」，单看某一个宿主会在另一个宿主更新得更晚时谎报过期
/// /谎报新鲜。全部宿主都 Unavailable（`last_observed_at=None`，不变式 3
/// 保证 Unavailable 必带 None）→ 汇总 Unavailable。
fn aggregate_freshness(by_host: &BTreeMap<String, HostAmount>) -> Freshness {
    by_host
        .values()
        .filter(|h| h.freshness.last_observed_at.is_some())
        .max_by_key(|h| h.freshness.last_observed_at.clone())
        .map(|h| h.freshness.clone())
        .unwrap_or_else(Freshness::unavailable)
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
            day_freshness(day)
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

/// `codex_home()`：rollout 根的解析与 CLI `codex-cost` handler 同一条
/// （`HOME` → `USERPROFILE` → 空串；空串 join 出的相对路径不存在 → 枚举为
/// 空 → Unavailable，绝不报错）。
fn codex_home() -> std::path::PathBuf {
    std::path::PathBuf::from(
        std::env::var("HOME")
            .or_else(|_| std::env::var("USERPROFILE"))
            .unwrap_or_default(),
    )
}

/// Codex 的月份/日期切片 → `HostAmount`（§8.4 的 Codex 栏）。
///
/// 管线与 CLI `codex-cost` / `codex_report_from_merged` 是同一条：枚举
/// rollout（live+archived，全局路径排序）→ fold → merge → **过滤小时轴后
/// 重算 by_model**——merge 的 by_model 只读 fold 的 by_model 字段、不读
/// by_hour_model，拿 merge 折回去得到的是空模型轴（真实 defect，
/// `apps/cli/src/main.rs::codex_report_from_merged` 注释原文）。`filter_key`
/// 是月份前缀 `YYYY-MM` 或完整日期 `YYYY-MM-DD`（小时键 startswith 都成立）。
///
/// 账单口径 = **ApiEquivalent**（spec §4）：Codex 消耗的是订阅套餐配额，这
/// 里按官方 API 价目折出的 USD 是「等价标价」、只作诊断——`summable_into_
/// total` 对它是 false，不会混进月度总额冒充真实账单；订阅费本身（
/// FixedSubscription）Stage 0 没有声明来源，不编。`day = Some(d)` 时金额取
/// `days[]` 里 `date == d` 那一行——untimed 样本没有日期归属，不能混进某
/// 一天；`None`（月视图）取 `total_cost_usd`（含 untimed 剩余，per_model 已
/// 并）。`unpriced_tokens > 0` → `has_unresolved`（看见了 token、价目表认
/// 不出模型——「看见了、没价目」的诚实上报）。无数据 = 过滤窗内没有任何
/// 小时桶（`days` 空）→ Unavailable 不是 $0；`unaccounted` 无时间归属、跨
/// 月份保留（数据质量哨兵），不能归进任何月份窗，不参与判断。
fn codex_host_amount(home: &Path, filter_key: &str, day: Option<&str>) -> HostAmount {
    let codex_no_data = || HostAmount {
        host_id: "codex".to_string(),
        amounts_by_basis: BTreeMap::new(),
        has_unresolved: false,
        freshness: Freshness::unavailable(),
    };

    let mut folds: Vec<serde_json::Value> = Vec::new();
    for path in agent_vitals_hosts::codex_session::codex_rollout_files(home) {
        let parsed = agent_vitals_hosts::codex_session::read_codex_session_log(&path);
        let items: Vec<serde_json::Value> = parsed
            .get("items")
            .and_then(|v| v.as_array())
            .cloned()
            .unwrap_or_default();
        folds.push(agent_vitals_hosts::codex_usage::codex_fold_file(&items));
    }
    let merged = agent_vitals_hosts::codex_usage::codex_merge_folds(&folds);

    // 过滤小时轴（BTreeMap 序保持升序），再重算模型轴（上面的 defect 注释）。
    let mut filtered = serde_json::Map::new();
    if let Some(bh) = merged["by_hour_model"].as_object() {
        for (h, v) in bh {
            if h.starts_with(filter_key) {
                filtered.insert(h.clone(), v.clone());
            }
        }
    }
    let by_hour_model = serde_json::Value::Object(filtered);
    let by_model = agent_vitals_hosts::codex_usage::codex_by_model_from_hours(&by_hour_model, None);
    let pricing = crate::sessions::codex_cost::load_codex_pricing();
    let Some(report) = crate::sessions::codex_cost::codex_cost_report(
        &by_hour_model,
        &by_model,
        &merged["unaccounted"],
        &merged["plan"],
        &pricing,
        false,
    ) else {
        return codex_no_data();
    };
    let days = report
        .get("days")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();
    if days.is_empty() {
        return codex_no_data();
    }
    let total = match day {
        Some(d) => {
            let row = days
                .iter()
                .find(|x| x.get("date").and_then(|v| v.as_str()) == Some(d));
            match row {
                // 结构上不可达（过滤键 == 日期，days 必含该日）——但宁可再走
                // 一次 Unavailable 也不编 0。
                None => return codex_no_data(),
                Some(r) => r.get("cost_usd").and_then(|v| v.as_f64()).unwrap_or(0.0),
            }
        }
        None => report
            .get("total_cost_usd")
            .and_then(|v| v.as_f64())
            .unwrap_or(0.0),
    };
    let unpriced = report
        .get("unpriced_tokens")
        .and_then(|v| v.as_i64())
        .unwrap_or(0);
    let freshness = days
        .iter()
        .filter_map(|x| x.get("date").and_then(|v| v.as_str()))
        .max()
        .map(day_freshness)
        .unwrap_or_else(Freshness::unavailable);
    let mut amounts_by_basis = BTreeMap::new();
    amounts_by_basis.insert(BillingBasis::ApiEquivalent, total);
    HostAmount {
        host_id: "codex".to_string(),
        amounts_by_basis,
        has_unresolved: unpriced > 0,
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
        by_host.insert(
            "codex".to_string(),
            codex_host_amount(&codex_home(), &query.month, None),
        );

        let freshness = aggregate_freshness(&by_host);
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
        // 日切片：过滤键 = 完整日期，金额取该日行（untimed 不混进某一天）。
        by_host.insert(
            "codex".to_string(),
            codex_host_amount(&codex_home(), &query.date, Some(&query.date)),
        );

        let freshness = aggregate_freshness(&by_host);
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
            // codex 已接线（Stage 0.4b）：进 `by_host`（DSH 无数据的 2020-01，
            // 这台真机上的 codex 2020-01 也必然无小时桶 → Unavailable），
            // `excluded_hosts` 只剩 claude-code 与 workbuddy。
            assert_eq!(summary.by_host["codex"].freshness.state, FreshnessState::Unavailable);
            assert!(summary.by_host["codex"].amounts_by_basis.is_empty());
            assert!(summary.excluded_hosts.contains("claude-code"));
            assert!(summary.excluded_hosts.contains("workbuddy"));
            assert!(!summary.excluded_hosts.contains("codex"));
            assert!(!summary.excluded_hosts.contains("dsh"));
            assert_eq!(summary.coverage.measured_fields, 2);
            assert_eq!(summary.coverage.total_fields, 3);
        });
    }

    /// 写一份最小 rollout fixture（与 `fixtures/codex/usage-fact/rollout-1a.jsonl`
    /// 同构的三行：session_meta / turn_context / token_count）。时间戳固定
    /// 2026-09-02（UTC）→ 北京小时桶 `2026-09-02T08`，月份/日期过滤都命中。
    /// `model` 由调用方给——价目表里有的（gpt-5.6-sol）测计价，没有的测
    /// has_unresolved。
    fn write_rollout(home: &Path, model: &str) {
        let dir = home.join(".codex").join("sessions");
        std::fs::create_dir_all(&dir).unwrap();
        let usage = json!({
            "total_token_usage": {
                "input_tokens": 800, "output_tokens": 80,
                "cached_input_tokens": 200, "cache_write_input_tokens": 50,
                "reasoning_output_tokens": 0, "total_tokens": 1130,
            },
            "last_token_usage": {
                "input_tokens": 800, "output_tokens": 80,
                "cached_input_tokens": 200, "cache_write_input_tokens": 50,
                "reasoning_output_tokens": 0, "total_tokens": 1130,
            },
        });
        let lines = [
            json!({"timestamp": "2026-09-02T00:00:00.000Z", "type": "session_meta",
                   "payload": {"session_id": "sum-fix-1", "id": "sum-fix-1",
                               "history_mode": "legacy", "cli_version": "0.149.0-alpha.4",
                               "cwd": "/Users/alice/repo"}}),
            json!({"timestamp": "2026-09-02T00:00:01.000Z", "type": "turn_context",
                   "payload": {"turn_id": "t1", "cwd": "/Users/alice/repo",
                               "workspace_roots": ["/Users/alice/repo"], "model": model,
                               "approval_policy": "on-request",
                               "sandbox_policy": "workspace-write", "service_tier": null}}),
            json!({"timestamp": "2026-09-02T00:00:02.000Z", "type": "event_msg",
                   "payload": {"type": "token_count", "info": usage}}),
        ];
        let text = lines
            .iter()
            .map(|l| l.to_string())
            .collect::<Vec<_>>()
            .join("\n");
        std::fs::write(dir.join("rollout-fixture.jsonl"), text).unwrap();
    }

    #[test]
    fn codex_month_data_reports_api_equivalent_not_summable() {
        let dir = std::env::temp_dir().join(format!("avr-codex-fix-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        write_rollout(&dir, "gpt-5.6-sol");
        let amount = codex_host_amount(&dir, "2026-09", None);
        assert!(amount.amounts_by_basis.contains_key(&BillingBasis::ApiEquivalent));
        let total = amount.amounts_by_basis[&BillingBasis::ApiEquivalent];
        assert!(total > 0.0, "gpt-5.6-sol 在价目表里，550 uncached + 80 output 必有非零价");
        // 套餐消耗的等价标价：只作诊断，不许混进月度总额（spec §4）。
        assert!(!BillingBasis::ApiEquivalent.summable_into_total());
        assert!(!amount.has_unresolved);
        // 观测日 2026-09-02：今天是几号不定，但绝不会是 Unavailable。
        assert_eq!(amount.freshness.last_observed_at.as_deref(), Some("2026-09-02T00:00:00Z"));
        assert_ne!(amount.freshness.state, FreshnessState::Unavailable);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn codex_unpriced_tokens_set_has_unresolved() {
        let dir = std::env::temp_dir().join(format!("avr-codex-unpriced-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        write_rollout(&dir, "gpt-model-not-in-pricing");
        let amount = codex_host_amount(&dir, "2026-09", None);
        // 「看见了、没价目」：total 0 + has_unresolved，而不是当没测到。
        assert!(amount.has_unresolved);
        let total = amount.amounts_by_basis[&BillingBasis::ApiEquivalent];
        assert_eq!(total, 0.0);
        assert_ne!(amount.freshness.state, FreshnessState::Unavailable);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn codex_other_month_is_unavailable_not_zero() {
        let dir = std::env::temp_dir().join(format!("avr-codex-empty-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        write_rollout(&dir, "gpt-5.6-sol");
        let amount = codex_host_amount(&dir, "2020-01", None);
        assert!(amount.amounts_by_basis.is_empty());
        assert_eq!(amount.freshness.state, FreshnessState::Unavailable);
        assert!(amount.freshness.last_observed_at.is_none());
        assert!(!amount.has_unresolved);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn codex_daily_slice_is_that_day_only() {
        let dir = std::env::temp_dir().join(format!("avr-codex-daily-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        write_rollout(&dir, "gpt-5.6-sol");
        let hit = codex_host_amount(&dir, "2026-09-02", Some("2026-09-02"));
        assert!(hit.amounts_by_basis[&BillingBasis::ApiEquivalent] > 0.0);
        // 相邻日没有任何小时桶 → Unavailable，不是 $0。
        let miss = codex_host_amount(&dir, "2026-09-03", Some("2026-09-03"));
        assert!(miss.amounts_by_basis.is_empty());
        assert_eq!(miss.freshness.state, FreshnessState::Unavailable);
        let _ = std::fs::remove_dir_all(&dir);
    }

    /// 接线结构（真机）：codex 进 `by_host`、不进 `excluded_hosts`；汇总
    /// 新鲜度 = 最新被观测到的宿主（不是硬编码 dsh）；codex 的 ApiEquivalent
    /// 不得混进 `total_summable`（可汇总总额必须等于 dsh 的 MeteredActual，
    /// codex 再大也不出现）。
    #[test]
    fn monthly_summary_wires_codex_without_leaking_into_total() {
        with_home(|| {
            let repo = JsonSummaryRepository;
            let summary =
                repo.monthly_summary(&MonthlySummaryQuery { month: crate::clock::current_month_beijing() });
            assert!(summary.contract_violations().is_empty(), "{:?}", summary.contract_violations());
            assert!(summary.by_host.contains_key("codex"));
            assert!(summary.by_host.contains_key("dsh"));
            assert!(!summary.excluded_hosts.contains("codex"));
            // 汇总新鲜度 = 宿主里最新的 last_observed_at（字典序=时间序，两处
            // 格式统一 `YYYY-MM-DDT00:00:00Z`）。
            let max_host = summary
                .by_host
                .values()
                .filter_map(|h| h.freshness.last_observed_at.clone())
                .max();
            assert_eq!(summary.freshness.last_observed_at, max_host);
            // spec §4 汇总纪律：ApiEquivalent（诊断价）不得计入总额。
            let dsh_summable = summary.by_host["dsh"]
                .amounts_by_basis
                .iter()
                .filter(|(b, _)| b.summable_into_total())
                .map(|(_, v)| v)
                .sum::<f64>();
            assert_eq!(summary.total_summable(), dsh_summable);
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
