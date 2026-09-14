//! v0.9 Stage 0.4：`agent-vitals-data::repository::SummaryRepository` 的
//! Stage 0 实现（`docs/AGENT_VITALS_V0_9_STAGE0_RESEARCH.md` §8）。
//!
//! 只读——不写 state、不建索引、不启动任何后台任务。逐宿主接线、逐提交
//! 落地（§8.4）：DSH（读 `budget.rs` 的 month.json）、Codex（读 ~/.codex
//! rollout 折叠计价）、Claude Code（读 claude-ledger.json 逐日账，core
//! `claude_day_cost` 计价）三个宿主已接线；WorkBuddy 2026-09-11 起（spec
//! WORKBUDDY_ONBOARDING §9E.5 E4b）也进 `by_host`/`tokens_by_host`——**只有
//! token、没有金额**：它的事实全部 `provider_id: null`（平台积分 / 自配 key /
//! 限免三轨请求级不可判，§2.1），`amounts_by_basis` 恒空 + `has_unresolved`，
//! 不进 `by_provider`（用户手录的 `host_bills` 行除外，那是 Phase 2.8 的路径）。
//! 2026-09-05「永久 excluded」的决定由 spec v4 §9E 推翻：当时以为 traces 匿名，
//! 实测 `trace.sessionId` 可归属。

use std::collections::{BTreeMap, BTreeSet};
use std::path::Path;

use agent_vitals_data::projection::{
    BillingBasis, CoverageStatus, DailySummary, Freshness, FreshnessState, HostAmount,
    MonthlySummary,
};
use agent_vitals_data::repository::{DailySummaryQuery, MonthlySummaryQuery, SummaryRepository};
use serde_json::json;

use agent_vitals_domain::cost::BillingMode;
use agent_vitals_domain::data_contract::HostTokens;

use crate::clock::{today_beijing, yesterday_beijing};

/// Stage 0 的宿主接线状态：真正读数据的 vs. 还没接的。四宿主全接完后
/// `NOT_YET_WIRED_HOSTS` 与 `PERMANENTLY_EXCLUDED_HOSTS` 都为空——`excluded_hosts`
/// 是空集（DTO 语义「已知存在但本版本不产出数据」：现在没有这样的宿主）。
/// 与 `ingest_service::FACT_HOSTS` 同表（`wired_hosts_match_fact_hosts` 钉住）。
const WIRED_HOSTS: &[&str] = &["claude-code", "codex", "dsh", "workbuddy"];
const NOT_YET_WIRED_HOSTS: &[&str] = &[];
const PERMANENTLY_EXCLUDED_HOSTS: &[&str] = &[];

fn excluded_hosts() -> BTreeSet<String> {
    NOT_YET_WIRED_HOSTS
        .iter()
        .chain(PERMANENTLY_EXCLUDED_HOSTS)
        .map(|s| s.to_string())
        .collect()
}

/// v0.9.1 Q13（spec §5.3「价格历史重放」）：一次查询窗口用的价卡组。
///
/// SQL 权威读路径按**查询窗口的时间点**选价卡版本——历史月用当时的卡，不拿
/// 今天的卡重算历史（`authority::pricing_snapshot_asof`）。库里没有 `≤` 该时
/// 点的快照（查询早于第一次 sync）→ 退回当前嵌入卡。**「只有一份快照」时
/// `asof` 恒返回那一份、与 `load_pricing()` 逐字节相同**——所以本接线对当前
/// 真机数据是 no-op，只有真实调价 + 重新 sync 落下第二份快照后才分叉。
///
/// **粒度 = 窗口级**（月查询用月末毫秒、日查询用日末毫秒），不是逐日：
/// `calendar_month` 与 `monthly_summary` 必须对同一个月折出相等的总额
/// （`usage.rs` 的 `token_by_date_model` 对账纪律），两者用不同 asof 粒度会
/// 在调价月破坏这条等式。调价发生在月中时整月按月末卡计价——逐日重放是
/// 独立后续项（plan 已记「非 blocker」）。
pub struct PricingCards {
    /// `assets/pricing.json` 形状（DSH / claude 计价 + 订阅声明 + billing_modes）。
    pub main: serde_json::Value,
    /// `assets/codex_pricing.json` 形状（codex per-model USD 卡）。
    pub codex: serde_json::Value,
}

impl PricingCards {
    /// 当前嵌入价卡。历史查询无快照可依、以及 legacy 读路径全都用这个。
    ///
    /// 用户补的卡（`price_overrides`）在这里盖上去——**读取时合并**，写进快照会
    /// 被下一次价目表更新冲掉。数据根用与 `SqlSummaryRepository::new()` 同一个
    /// 全局解析（测试靠 `with_home` 隔离）。
    pub fn current() -> Self {
        Self {
            main: crate::price_overrides::merged_main(&crate::home::data_home()),
            codex: crate::sessions::codex_cost::load_codex_pricing(),
        }
    }

    /// `at_ms` 时点有效的历史价卡快照；库不可读 / 无更早快照 / 快照形状不认
    /// → [`Self::current`]（绝不拿更晚的版本冒充历史，`pricing_snapshot_asof`
    /// 已保证这点；这里只处理「一份都没有」的回退）。
    pub fn asof(
        db: &Option<agent_vitals_data::authority::AuthorityDb>,
        at_ms: Option<i64>,
    ) -> Self {
        let (Some(db), Some(at)) = (db.as_ref(), at_ms) else {
            return Self::current();
        };
        let Ok(Some(payload)) = db.pricing_snapshot_asof(at) else {
            return Self::current();
        };
        let Ok(v) = serde_json::from_str::<serde_json::Value>(&payload) else {
            return Self::current();
        };
        match (v.get("pricing"), v.get("codex_pricing")) {
            (Some(main), Some(codex)) => {
                // 用户补的卡也要盖在**快照**上：绝大多数月份查询走的是快照分支
                // （有价卡快照就用它），只在 `current()` 合并等于用户补的卡对
                // 当月不生效——而那恰恰是用户补卡时想看效果的月份。
                let mut main = main.clone();
                crate::price_overrides::apply_to_main(&mut main, &crate::home::data_home());
                Self {
                    main,
                    codex: codex.clone(),
                }
            }
            // 老快照只存了一半 → 整体退当前卡，不半用（半用会让 DSH 按历史卡、
            // codex 按当前卡，跨宿主总额失去单一时点语义）。
            _ => Self::current(),
        }
    }
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
    Freshness {
        state,
        last_observed_at: Some(format!("{day_key}T00:00:00Z")),
    }
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
    // DeepSeek 官方逐 token 价表是 DSH 的真实计费费率（不是第三方猜测价），
    // `month_cost` 只是把「用了多少 token」按「官方多少钱一个 token」相乘——
    // 这是可观测的真实费用，定为 MeteredActual，不是 MeteredEstimate（§8.4）。
    //
    // **`compute_month` 对"本月有 day 但 day 里 token 全 0"返回 `Some({total:
    // 0, ...})`** —— 之前直接走 `MeteredActual=0 + Stale(latest_day)` 分支，
    // 前端渲染成「实测 0.00 + ⚠ 过期 · 观测 YYYY-MM-DD」，数字看着像"测到
    // 零"、实则是"本月没真实 token 入账"——违反 spec §0.1「不得渲染为 ¥0、
    // 正常或看似完整的总额」。修：先看 cost 的 total 是否为 0、为 0 → 不入
    // MeteredActual，只报 freshness（与 codex 无数据/claude 全 unknown 的
    // 纪律一致）；`has_unresolved=false` 是因为 DSH 的价表里所有模型都计价，
    // total=0 是 token 全 0 而不是"看见了、没价目"。
    let freshness = match (&cost, latest_day) {
        (Some(c), Some(day)) => {
            let total = c
                .get("total")
                .and_then(serde_json::Value::as_f64)
                .unwrap_or(0.0);
            if total > 0.0 {
                amounts_by_basis.insert(BillingBasis::MeteredActual, total);
            }
            day_freshness(day)
        }
        _ => Freshness::unavailable(),
    };
    HostAmount {
        host_id: "dsh".to_string(),
        amounts_by_basis,
        currency: None,
        has_unresolved: false,
        // This summary is built from aggregated cost data; it does not itself
        // prove that every contributing row carried session-native evidence.
        evidence_basis: None,
        pricing_method: Some("provider-card".to_string()),
        unresolved_reason: None,
        freshness,
    }
}

/// `codex_home()`：rollout 根的解析与 CLI `codex-cost` handler 同一条
/// （`HOME` → `USERPROFILE` → 空串；空串 join 出的相对路径不存在 → 枚举为
/// 空 → Unavailable，绝不报错）。pub：src-tauri 的 `data_codex_quota`/
/// `read_calendar_month` 复用同一条解析（审查 #4——此前 lib.rs 各自手写
/// HOME-only，漏 USERPROFILE 回落，Windows 桌面端静默假 Unavailable）。
pub fn codex_home() -> std::path::PathBuf {
    std::path::PathBuf::from(
        std::env::var("HOME")
            .or_else(|_| std::env::var("USERPROFILE"))
            .unwrap_or_default(),
    )
}

/// Codex 用量 `by_hour_model` → `HostAmount`（§8.4 的 Codex 栏）。喂进来的
/// `by_hour_model` 从 SQL `usage_facts` 聚合（`SqlSummaryRepository`，
/// `agent_vitals_data::authority_query::codex_by_hour_model`）——Phase 4.3
/// 起 `SummaryRepository` 侧不再折 codex rollout。`unaccounted`/`plan` SQL
/// 事实里没有（无原始 fold 状态），传 `Value::Null` 安全：`codex_cost_report`
/// 只把它们原样透传
/// 进输出（`out.insert("unaccounted_usage", …)`/`out.insert("plan", …)`），
/// 从不参与 `total_cost_usd`/`days`/`unpriced_tokens` 的计算，而本函数只读
/// 这三个字段。
fn codex_host_amount_with_tokens_from_hours(
    by_hour_model: &serde_json::Value,
    unaccounted: &serde_json::Value,
    plan: &serde_json::Value,
    day: Option<&str>,
    cards: &PricingCards,
) -> (HostAmount, HostTokens) {
    let codex_no_data = || HostAmount {
        host_id: "codex".to_string(),
        amounts_by_basis: BTreeMap::new(),
        currency: None,
        has_unresolved: false,
        evidence_basis: None,
        pricing_method: None,
        unresolved_reason: None,
        freshness: Freshness::unavailable(),
    };

    let by_model = agent_vitals_hosts::codex_usage::codex_by_model_from_hours(by_hour_model, None);
    let Some(report) = crate::sessions::codex_cost::codex_cost_report(
        by_hour_model,
        &by_model,
        unaccounted,
        plan,
        &cards.codex,
        false,
    ) else {
        return (codex_no_data(), HostTokens::default());
    };
    let days = report
        .get("days")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();
    if days.is_empty() {
        return (codex_no_data(), HostTokens::default());
    }
    let total = match day {
        Some(d) => {
            let row = days
                .iter()
                .find(|x| x.get("date").and_then(|v| v.as_str()) == Some(d));
            match row {
                // 结构上不可达（过滤键 == 日期，days 必含该日）——但宁可再走
                // 一次 Unavailable 也不编 0。
                None => return (codex_no_data(), HostTokens::default()),
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
    // basis 由 billing_modes 声明决定（Stage B），不再硬编码 ApiEquivalent。
    // 公共目录不会替用户声明订阅，因此缺少本地明确证据时落
    // MeteredEstimate，并保持 unresolved。plan 快照（plan_type/credits）
    // **不参与**判定：
    // 它是"当前状态"的单快照、不按日期分桶（hosts/codex/sessions/usage.rs
    // 的 doc），拿它判历史窗口本身就是错的——快照与声明的冲突检测留给
    // Stage E 的证据链。
    let (basis, mode_unknown) =
        match agent_vitals_domain::cost::billing_mode_of("openai", &cards.main) {
            BillingMode::Subscription => (BillingBasis::ApiEquivalent, false),
            BillingMode::Metered => (BillingBasis::MeteredActual, false),
            BillingMode::Unknown => (BillingBasis::MeteredEstimate, true),
        };
    let mut amounts_by_basis = BTreeMap::new();
    amounts_by_basis.insert(basis, total);
    // tokens：过滤后重算的 by_model（model → speed → 5 桶）——merge 的
    // by_model 不读小时轴（函数体上方 defect 注释），必须用重算产物。
    let mut tk = HostTokens::default();
    if let Some(models) = by_model.as_object() {
        for (_model, speeds) in models {
            if let Some(speeds) = speeds.as_object() {
                for (_speed, b) in speeds {
                    let g = |k: &str| b.get(k).and_then(|v| v.as_f64()).unwrap_or(0.0) as i64;
                    tk.uncached_input += g("uncached_input_tokens");
                    tk.cache_read += g("cached_input_tokens");
                    tk.cache_write += g("cache_write_input_tokens");
                    tk.output += g("output_tokens") + g("reasoning_output_tokens");
                }
            }
        }
    }
    tk.total = tk.uncached_input + tk.cache_read + tk.cache_write + tk.output;
    tk.cache_hit_ratio = agent_vitals_domain::cost::cache_hit_ratio(&json!({
        "uncached_input_tokens": tk.uncached_input,
        "cached_input_tokens": tk.cache_read,
        "cache_write_input_tokens": tk.cache_write,
    }));
    (
        HostAmount {
            host_id: "codex".to_string(),
            amounts_by_basis,
            currency: None,
            has_unresolved: unpriced > 0 || mode_unknown,
            evidence_basis: None,
            pricing_method: Some("provider-card".to_string()),
            unresolved_reason: (unpriced > 0 || mode_unknown)
                .then(|| "missing-or-unpriced-route-evidence".to_string()),
            freshness,
        },
        tk,
    )
}

/// Claude Code 用量「窗口内账日 → `{model: 4 桶}`」map → `HostAmount`。
/// map 从 SQL `usage_facts` 聚合（`SqlSummaryRepository`，`authority_query::
/// {claude_days,claude_legacy_days}` 合并）——Phase 4.3 起不再读 ledger JSON。
/// `BTreeMap` 天然按日期升序迭代（同币求和的浮点顺序确定，跨平台字节一致）。
fn claude_host_amount_with_tokens_from_days(
    days: &BTreeMap<String, serde_json::Value>,
    cards: &PricingCards,
) -> (HostAmount, HostTokens) {
    let claude_no_data = || {
        (
            HostAmount {
                host_id: "claude-code".to_string(),
                amounts_by_basis: BTreeMap::new(),
                currency: None,
                has_unresolved: false,
                evidence_basis: Some("missing".to_string()),
                pricing_method: Some("fair-market-fallback".to_string()),
                unresolved_reason: None,
                freshness: Freshness::unavailable(),
            },
            HostTokens::default(),
        )
    };
    if days.is_empty() {
        return claude_no_data();
    }
    let mut tk = HostTokens::default();
    let pricing = cards.main.clone();
    let mut cny = 0.0f64;
    let mut usd = 0.0f64;
    let mut unpriced = 0i64;
    let mut any_partial = false;
    for day in days.values() {
        // tokens：四桶直读（claude snake 键 = 归一目标词表），跨模型累计。
        if let Some(models) = day.as_object() {
            for (_m, b) in models {
                let g = |k: &str| b.get(k).and_then(|v| v.as_f64()).unwrap_or(0.0) as i64;
                tk.uncached_input += g("input_tokens");
                tk.cache_read += g("cache_read_input_tokens");
                tk.cache_write += g("cache_creation_input_tokens");
                tk.output += g("output_tokens");
            }
        }
        if let Some(report) = agent_vitals_domain::cost::claude_day_cost(day, &pricing) {
            let totals = report.get("currency_totals");
            cny += totals
                .and_then(|t| t.get("CNY"))
                .and_then(|v| v.as_f64())
                .unwrap_or(0.0);
            usd += totals
                .and_then(|t| t.get("USD"))
                .and_then(|v| v.as_f64())
                .unwrap_or(0.0);
            unpriced += report
                .get("unpriced_tokens")
                .and_then(|v| v.as_i64())
                .unwrap_or(0);
            any_partial |= report.get("pricing_basis").and_then(|v| v.as_str()) == Some("partial");
        }
    }
    // freshness 的观测日 = 窗口内**最晚的账日**（含全 unknown 日——观测到
    // token 就是观测，与有没有折出钱无关）。
    let latest = days.keys().next_back().map(|k| k.as_str());
    let mut amounts_by_basis = BTreeMap::new();
    if cny > 0.0 {
        amounts_by_basis.insert(BillingBasis::MeteredEstimate, cny);
    }
    if usd > 0.0 {
        amounts_by_basis.insert(BillingBasis::MeteredEstimate, usd);
    }
    tk.total = tk.uncached_input + tk.cache_read + tk.cache_write + tk.output;
    tk.cache_hit_ratio = agent_vitals_domain::cost::cache_hit_ratio(&json!({
        "input_tokens": tk.uncached_input,
        "cache_read_input_tokens": tk.cache_read,
        "cache_creation_input_tokens": tk.cache_write,
    }));
    (
        HostAmount {
            host_id: "claude-code".to_string(),
            amounts_by_basis,
            currency: None,
            has_unresolved: unpriced > 0 || any_partial,
            evidence_basis: Some("missing".to_string()),
            pricing_method: Some("fair-market-fallback".to_string()),
            unresolved_reason: (unpriced > 0 || any_partial)
                .then(|| "missing-provider-route-evidence".to_string()),
            freshness: latest
                .map(day_freshness)
                .unwrap_or_else(Freshness::unavailable),
        },
        tk,
    )
}

/// billing_source 视角的单条目聚合（`by_provider` 的值）：basis → 币种 → 金额
/// 三层。中间那层币种是跨币防线的落点——同一 provider 条目内若出现两种币
/// （当前价表不存在：目录卡币种按 provider 固定），金额表整体留空 +
/// `has_unresolved`，绝不跨币相加。
struct ProviderAcc {
    by_basis_currency: BTreeMap<BillingBasis, BTreeMap<String, f64>>,
    /// 条目级币种（HostAmount.currency）：per-provider 条目天然单币，出现第
    /// 二种币时置 None 并标 unresolved（finish 里金额表整体留空）。
    currency: Option<String>,
    /// 币种冲突已发生：冻结 currency=None，后续 add 不再重新认领。
    currency_conflicted: bool,
    unresolved: bool,
    latest: Option<String>,
}

impl ProviderAcc {
    fn new() -> Self {
        Self {
            by_basis_currency: BTreeMap::new(),
            currency: None,
            currency_conflicted: false,
            unresolved: false,
            latest: None,
        }
    }

    fn observe(&mut self, day: &str) {
        if self.latest.as_deref().map_or(true, |d| d < day) {
            self.latest = Some(day.to_string());
        }
    }

    fn add(&mut self, basis: BillingBasis, currency: &str, amount: f64) {
        // 条目币种一致性：per-provider 天然单币，出现第二种币 → 撤销声明
        // （currency=None）+ unresolved——finish 的单币判定靠它，不在这里
        // 对齐就会把 USD 和 CNY 静默装进同一条目冒充单币。
        match &self.currency {
            None if !self.currency_conflicted => self.currency = Some(currency.to_string()),
            Some(c) if c == currency => {}
            _ => {
                // 冲突后冻结：currency=None 且不再认领——否则后续同币种 add
                // 会走 None 分支重新认领，条目带着单一 currency 收尾，另一币
                // 金额在 total_actual_spend 里被按该币桶吞掉（审查 #8）。
                self.currency = None;
                self.currency_conflicted = true;
                self.unresolved = true;
            }
        }
        *self
            .by_basis_currency
            .entry(basis)
            .or_default()
            .entry(currency.to_string())
            .or_insert(0.0) += amount;
    }

    fn finish(mut self, key: &str) -> HostAmount {
        let mut amounts_by_basis = BTreeMap::new();
        let mut multi_currency = false;
        for (basis, cur_map) in self.by_basis_currency {
            if cur_map.len() > 1 {
                multi_currency = true;
                break;
            }
            if let Some((_, amount)) = cur_map.iter().next() {
                if *amount > 0.0 {
                    amounts_by_basis.insert(basis, *amount);
                }
            }
        }
        if multi_currency {
            amounts_by_basis.clear();
            self.currency = None;
            self.unresolved = true;
        }
        HostAmount {
            host_id: key.to_string(),
            amounts_by_basis,
            currency: self.currency,
            has_unresolved: self.unresolved || multi_currency,
            // Aggregation preserves provider/pricing buckets but not a proof
            // that all rows had the same route-evidence basis.
            evidence_basis: (self.unresolved || multi_currency)
                .then(|| "missing".to_string()),
            pricing_method: Some("fair-market".to_string()),
            unresolved_reason: (self.unresolved || multi_currency)
                .then(|| "provider-or-currency-unresolved".to_string()),
            freshness: self
                .latest
                .as_deref()
                .map(day_freshness)
                .unwrap_or_else(Freshness::unavailable),
        }
    }
}

/// claude-code 窗口 → `by_provider`（键 `"claude-code/<provider>"`）。
/// 输入「窗口内账日 → `{model: 4 桶}`」map 从 SQL 聚合（Phase 4.3 起）。
fn claude_provider_amounts_from_days(
    days: &BTreeMap<String, serde_json::Value>,
    cards: &PricingCards,
) -> BTreeMap<String, HostAmount> {
    let mut accs: BTreeMap<String, ProviderAcc> = BTreeMap::new();
    if days.is_empty() {
        return accs
            .into_iter()
            .map(|(k, a)| {
                let host = a.finish(&k);
                (k, host)
            })
            .collect();
    }
    let pricing = cards.main.clone();
    for (date, day) in days {
        let Some(models) = day.as_object() else {
            continue;
        };
        let report = agent_vitals_domain::cost::claude_day_cost(day, &pricing);
        let per_model = report
            .as_ref()
            .and_then(|r| r.get("per_model"))
            .and_then(|v| v.as_object());
        // 有卡模型的归属与计价：per_model 的每条都是 {currency, total,
        // pricing_basis, priced_with}。
        if let Some(per_model) = per_model {
            for (model, entry) in per_model {
                // 用户尚未声明套餐/路由时，公共价卡仍能给出原厂供应商与
                // 名义金额。此时必须按量估算并标记待确认，不能因为
                // billing_modes 没有个人声明就把已有价卡金额丢掉。
                let card_provider = entry
                    .get("priced_with")
                    .and_then(|v| v.as_str())
                    .unwrap_or("unknown");
                let (prov, mode, route_unresolved) =
                    match agent_vitals_domain::cost::billing_route_of(model, &pricing) {
                        Some((provider, mode)) => (provider, mode, mode == BillingMode::Unknown),
                        None => (card_provider.to_string(), BillingMode::Metered, true),
                    };
                let key = format!("claude-code/{prov}");
                let acc = accs.entry(key.clone()).or_insert_with(ProviderAcc::new);
                acc.observe(date);
                let total = entry.get("total").and_then(|v| v.as_f64()).unwrap_or(0.0);
                let currency = entry
                    .get("currency")
                    .and_then(|v| v.as_str())
                    .unwrap_or("CNY");
                let basis = match mode {
                    BillingMode::Subscription => Some(BillingBasis::ApiEquivalent),
                    BillingMode::Metered => Some(BillingBasis::MeteredEstimate),
                    BillingMode::Unknown => None,
                };
                match basis {
                    Some(b) => acc.add(b, currency, total),
                    // 声明表不认识的模型有钱也无处归——不冒充任何档。
                    None => acc.unresolved = true,
                }
                if route_unresolved {
                    acc.unresolved = true;
                }
                if entry.get("pricing_basis").and_then(|v| v.as_str()) == Some("partial") {
                    acc.unresolved = true;
                }
            }
        }
        // 无卡模型（不在 per_model 里）：glm-*（有声明无价卡）、moonshot
        // （无声明）、<synthetic> 等。token 非零才算观测——全零模型不是
        // 消耗（MeasuredZero ≠ Unavailable 的镜像面）。
        for (model, tokens) in models {
            if per_model.map(|pm| pm.contains_key(model)).unwrap_or(false) {
                continue;
            }
            let total_tok: f64 = [
                "input_tokens",
                "cache_read_input_tokens",
                "cache_creation_input_tokens",
                "output_tokens",
            ]
            .iter()
            .map(|k| tokens.get(*k).and_then(|v| v.as_f64()).unwrap_or(0.0))
            .sum();
            if total_tok <= 0.0 {
                continue;
            }
            let (prov, _) = agent_vitals_domain::cost::billing_route_of(model, &pricing)
                .unwrap_or(("unknown".to_string(), BillingMode::Unknown));
            let key = format!("claude-code/{prov}");
            let acc = accs.entry(key).or_insert_with(ProviderAcc::new);
            acc.observe(date);
            acc.unresolved = true;
        }
    }
    accs.into_iter()
        .map(|(k, a)| {
            let host = a.finish(&k);
            (k, host)
        })
        .collect()
}

/// by_provider 的 DSH 条目：声明表里 deepseek-official = metered，官方逐
/// token 价是真实费率——与 `dsh_host_amount` 的 MeteredActual 判定一致，
/// 条目即宿主条目的镜像（Host = BillingSource 的宿主，键换名片）。
fn dsh_provider_amount(cost: Option<serde_json::Value>, latest_day: Option<&str>) -> HostAmount {
    let mut h = dsh_host_amount(cost, latest_day);
    h.host_id = "dsh/deepseek-official".to_string();
    h.currency = Some("CNY".to_string());
    h
}

/// 单日按小时分布（北京小时）——旧 calendar.html「小时格热力」组件的
/// 工作台接入（用户 2026-09-06 指出该组件从未接进控制面板）。
///
/// **数据源的诚实边界**（决定各宿主什么时候缺席）：
/// - **DSH**：逐小时轴只存在于 `today.json` 的 `buckets`（`domain/state.rs`
///   merge_today 折叠产物）——month.json 的 day 对象没有 by_hour，历史日的
///   小时数据从未持久化。所以仅当请求日 == today.json 的 `date` 时可用。
/// - **Codex**：fold 的 `by_hour_model` 全量保留（`hosts/codex/sessions/
///   usage.rs::codex_hour_of`，北京小时键 `YYYY-MM-DDTHH`），按 `date` 前缀
///   过滤即可得任意历史日。
/// - **Claude**：ledger 只有日轴（by_model 无小时）——小时只能来自事实
///   索引（ingest 过的会话）。
///
/// **来源矩阵**（`hosts_available` 值即来源标注，消费方如实渲染）：
/// codex → `fold`（生产权威全量）；dsh → `today-json`（今日）/
/// `facts-index`（历史日，需该日会话被 ingest）；claude → `facts-index`。
/// 索引是「已 ingest 会话」的小时来源——只 ingest 了一部分时小时图是
/// 部分覆盖，来源标注让这一点在 UI 上可见。
///
/// 每小时值 = `null`（该宿主该小时没有测量）≠ `0`（测到了零）——两态在
/// DTO 上都落 null，区分交给宿主级 `hosts_available`；「无小时轴」与
/// 「有轴没用量」不在小时粒度上区分（无诚实收益，徒增形状复杂度）。
pub fn hourly_distribution(date: &str, codex_home: &Path) -> serde_json::Value {
    // v0.9.1 Phase 3.5 Tier B：数据源从「today.json + 旧 facts-index + codex
    // fold 三路拼装」整体切换到 SQL 权威库——行级事实本就都在 `usage_facts`
    // （`authority_query::hourly_by_host` 三宿主统一），旧 facts-index 是可
    // 丢弃投影，权威读面没有理由绕它再走一遍 JSONL 重建；today.json/fold
    // 是禁读清单成员（spec §5.2），product 读面在此全部退役。`codex_home`
    // 参数保留（签名兼容 Tauri 调用点），SQL 路径不再使用。
    let _ = codex_home;
    let db = SqlSummaryRepository::new().open_db();
    let bounds = agent_vitals_data::authority_query::beijing_day_bounds_ms(date);
    let by_host: std::collections::BTreeMap<String, std::collections::BTreeMap<String, i64>> =
        match (&db, bounds) {
            (Some(db), Some((start, end))) => {
                agent_vitals_data::authority_query::hourly_by_host(db.conn(), start, end)
                    .unwrap_or_default()
            }
            _ => Default::default(),
        };
    // 来源标注如实切换：全部来自权威库的行级事实（legacy_aggregate 不进
    // 小时轴——它是日轴账单不是会话证据）。库打不开 = 全宿主缺席。
    let source = |host: &str| -> Option<&str> {
        by_host
            .get(host)
            .filter(|m| !m.is_empty())
            .map(|_| "sql-facts")
    };
    let mut hours = Vec::with_capacity(24);
    for hh in 0..24 {
        let key = format!("{hh:02}");
        hours.push(serde_json::json!({
            "hour": hh,
            "dsh_tokens": by_host.get("dsh").and_then(|m| m.get(&key)).copied(),
            "codex_tokens": by_host.get("codex").and_then(|m| m.get(&key)).copied(),
            "claude_tokens": by_host.get("claude-code").and_then(|m| m.get(&key)).copied(),
        }));
    }
    serde_json::json!({
        "date": date,
        "hosts_available": {
            "dsh": source("dsh"),
            "codex": source("codex"),
            "claude": source("claude-code"),
        },
        "hours": hours,
    })
}

/// Stage B（DoD #4 收口）：`has_unresolved` 的**逐模型下钻**——`data-unresolved`
/// 的服务面。各宿主的 by_model 桶，逐模型判定 unresolved 原因：
///
/// - `billing-route-unknown`：`billing_route_of` 认不出归属（DSH/claude 词表；
///   codex 宿主是 openai 订阅、路由是宿主级的，不做模型级判定）；
/// - `billing-mode-unknown`：路由命中但模式声明为 unknown（合法状态，不猜）；
/// - `no-price-card`：模型在本宿主价表里没有卡（unpriced_tokens 的逐模型
///   展开——聚合数说"有多少看不清"，这里说"是谁看不清"）；
/// - `partial-price-basis`：卡是时变价、日粒度无峰谷分辨率（`pricing_basis`
///   = "partial"，与 `has_unresolved` 的既有判定同源）。
///
/// - workbuddy（E4b）：整宿主 `billing-route-unknown`——事实 provider 一律
///   null（三轨请求级不可判，WORKBUDDY_ONBOARDING §2.1），逐模型列出 token
///   量让「谁看不清」可见，键 `workbuddy/unknown`（与 claude 的 unknown 同约定）。
///
/// 报告键与 `by_provider` 同词表（`host/provider`），消费方可以直接对上。
pub fn unresolved_detail(month: &str) -> serde_json::Value {
    use agent_vitals_domain::cost::BillingMode;
    let mut out: BTreeMap<String, Vec<serde_json::Value>> = BTreeMap::new();
    let db = SqlSummaryRepository::new().open_db();
    let bounds = agent_vitals_data::authority_query::beijing_month_bounds_ms(month);
    let cards = PricingCards::asof(&db, bounds.map(|(_, end)| end));
    let pricing = cards.main.clone();
    let (dsh_days, by_hour, claude_days) = fetch_windowed(&db, bounds);

    // ── claude-code：SQL 的实时事实优先 + 深历史聚合兜底，逐模型汇总 ────
    let mut claude_models: BTreeMap<String, [i64; 4]> = BTreeMap::new();
    let mut claude_priced: std::collections::HashSet<String> = Default::default();
    let mut claude_partial: std::collections::HashSet<String> = Default::default();
    for day in claude_days.values() {
        let Some(models) = day.as_object() else {
            continue;
        };
        for (model, buckets) in models {
            let g = |k: &str| buckets.get(k).and_then(|v| v.as_i64()).unwrap_or(0);
            let entry = claude_models.entry(model.clone()).or_insert([0, 0, 0, 0]);
            entry[0] += g("input_tokens");
            entry[1] += g("cache_read_input_tokens");
            entry[2] += g("cache_creation_input_tokens");
            entry[3] += g("output_tokens");
        }
        // per_model = 有卡模型（claude_day_cost 的报告）；partial 基础逐模型
        // 记名（时变卡的日粒度近似，has_unresolved 同源）。
        if let Some(report) = agent_vitals_domain::cost::claude_day_cost(day, &pricing) {
            if let Some(per_model) = report.get("per_model").and_then(|v| v.as_object()) {
                for (model, entry) in per_model {
                    claude_priced.insert(model.clone());
                    if entry.get("pricing_basis").and_then(|v| v.as_str()) == Some("partial") {
                        claude_partial.insert(model.clone());
                    }
                }
            }
        }
    }
    for (model, tokens) in &claude_models {
        // 0-token 行不进下钻：没有可计价的用量，「unresolved」无从谈起。
        if tokens.iter().all(|&v| v == 0) {
            continue;
        }
        let reason = match agent_vitals_domain::cost::billing_route_of(model, &pricing) {
            None => Some("billing-route-unknown"),
            Some((_, BillingMode::Unknown)) => Some("billing-mode-unknown"),
            Some(_) if !claude_priced.contains(model) => Some("no-price-card"),
            Some(_) if claude_partial.contains(model) => Some("partial-price-basis"),
            _ => None,
        };
        if let Some(reason) = reason {
            let provider = agent_vitals_domain::cost::billing_route_of(model, &pricing)
                .map(|(provider, _)| provider)
                .unwrap_or_else(|| "unknown".to_string());
            out.entry(format!("claude-code/{provider}"))
                .or_default()
                .push(serde_json::json!({
                    "model": model,
                    "reason": reason,
                    "tokens": tokens[0] + tokens[1] + tokens[2] + tokens[3],
                }));
        }
    }

    // ── codex/openai：SQL 小时桶 vs 同一份 codex 价表 ──────────────────
    let codex_by_model = agent_vitals_hosts::codex_usage::codex_by_model_from_hours(&by_hour, None);
    let codex_report = crate::sessions::codex_cost::codex_cost_report(
        &by_hour,
        &codex_by_model,
        &serde_json::Value::Null,
        &serde_json::Value::Null,
        &cards.codex,
        false,
    );
    let codex_priced: std::collections::HashSet<String> = codex_report
        .as_ref()
        .and_then(|report| report.get("per_model"))
        .and_then(|value| value.as_object())
        .map(|models| models.keys().cloned().collect())
        .unwrap_or_default();
    let codex_rows = codex_unresolved_rows(&codex_by_model, &codex_priced);
    if !codex_rows.is_empty() {
        out.entry("codex/openai".to_string())
            .or_default()
            .extend(codex_rows);
    }

    // ── dsh/deepseek-official：SQL 日桶逐模型聚合 ──────────────────────
    let mut dsh_by_model: serde_json::Map<String, serde_json::Value> = Default::default();
    for day in dsh_days
        .as_object()
        .map(|days| days.values())
        .into_iter()
        .flatten()
    {
        if let Some(models) = day.get("by_model").and_then(|value| value.as_object()) {
            for (model, buckets) in models {
                let entry = dsh_by_model
                    .entry(model.clone())
                    .or_insert(serde_json::json!({
                        "uncached_input_tokens": 0, "cache_read_tokens": 0,
                        "cache_write_tokens": 0, "output_tokens": 0,
                    }));
                for key in [
                    "uncached_input_tokens",
                    "cache_read_tokens",
                    "cache_write_tokens",
                    "output_tokens",
                ] {
                    let current = entry.get(key).and_then(|value| value.as_i64()).unwrap_or(0);
                    let added = buckets
                        .get(key)
                        .and_then(|value| value.as_i64())
                        .unwrap_or(0);
                    entry[key] = serde_json::json!(current + added);
                }
            }
        }
    }
    let dsh_usage = serde_json::json!({"by_model": dsh_by_model, "providers": {}});
    let dsh_priced: std::collections::HashSet<String> =
        agent_vitals_domain::cost::cost_report(&dsh_usage, &pricing)
            .as_ref()
            .and_then(|report| report.get("per_model"))
            .and_then(|value| value.as_object())
            .map(|models| models.keys().cloned().collect())
            .unwrap_or_default();
    for (model, buckets) in &dsh_by_model {
        if dsh_priced.contains(model) {
            continue;
        }
        let tokens = |key: &str| {
            buckets
                .get(key)
                .and_then(|value| value.as_i64())
                .unwrap_or(0)
        };
        let total = tokens("uncached_input_tokens")
            + tokens("cache_read_tokens")
            + tokens("cache_write_tokens")
            + tokens("output_tokens");
        if total == 0 {
            continue;
        }
        let reason = match agent_vitals_domain::cost::billing_route_of(model, &pricing) {
            None => "billing-route-unknown",
            Some((_, BillingMode::Unknown)) => "billing-mode-unknown",
            Some(_) => "no-price-card",
        };
        out.entry("dsh/deepseek-official".to_string())
            .or_default()
            .push(serde_json::json!({
                "model": model,
                "reason": reason,
                "tokens": total,
            }));
    }

    // ── workbuddy/unknown：SQL 逐模型直读，整宿主 billing-route-unknown ────
    if let (Some(db), Some((start, end))) = (&db, bounds) {
        if let Ok(by_model) = agent_vitals_data::authority_query::hourly_by_host_model(
            db.conn(),
            start,
            end,
            &["workbuddy".to_string()],
        ) {
            for ((_host, model), hours) in by_model {
                let total: i64 = hours.values().map(|c| c.total()).sum();
                if total == 0 {
                    continue;
                }
                out.entry("workbuddy/unknown".to_string())
                    .or_default()
                    .push(serde_json::json!({
                        "model": model,
                        "reason": "billing-route-unknown",
                        "tokens": total,
                    }));
            }
        }
    }

    let mut obj = serde_json::Map::new();
    for (k, rows) in out {
        obj.insert(k, serde_json::Value::Array(rows));
    }
    serde_json::Value::Object(obj)
}

/// 为「确认计费方式」提供的权威事实分组。它不猜测付款方式，也不把无法
/// 安全相加的币种金额塞成一个数字；金额由后续会话级历史价卡投影补充。
/// 此处先保证交互入口拿到真实的作用范围、宿主、模型、证据与会话规模。
pub fn unresolved_billing_groups(month: &str) -> serde_json::Value {
    let Some(db) = SqlSummaryRepository::new().open_db() else {
        return json!({"month": month, "groups": [], "status": "unavailable"});
    };
    let Some((start, end)) = agent_vitals_data::authority_query::beijing_month_bounds_ms(month) else {
        return json!({"month": month, "groups": [], "status": "invalid_month"});
    };
    let mut stmt = match db.conn().prepare(
        "SELECT host, COALESCE(provider_id, '<unknown>'), COALESCE(model_id, '<unknown>'),
                COALESCE(evidence_basis, 'missing'), COALESCE(pricing_basis, 'unavailable'),
                SUM(uncached_input_tokens + cache_read_tokens + cache_write_tokens + output_tokens),
                MIN(event_ts_ms), MAX(event_ts_ms),
                COUNT(DISTINCT COALESCE(session_key, host || ':' || machine_namespace || ':' || native_session_id))
         FROM usage_facts
         WHERE deleted_at_ms IS NULL AND observation_kind != 'legacy_aggregate'
           AND event_ts_ms >= ?1 AND event_ts_ms < ?2
           AND COALESCE(billing_mode, 'unknown') != 'subscription'
           AND NOT EXISTS (SELECT 1 FROM billing_fact_attributions ba
               JOIN billing_declaration_revisions br ON br.revision_id = ba.revision_id
               WHERE ba.fact_id = usage_facts.fact_id
                 AND ba.attribution_kind = 'subscription_covered'
                 AND br.revision_number = (SELECT MAX(br2.revision_number)
                   FROM billing_declaration_revisions br2
                   WHERE br2.declaration_id = br.declaration_id)
                 AND br.change_kind = 'saved')
           AND (COALESCE(pricing_basis, 'unavailable') = 'metered_estimate'
                OR COALESCE(evidence_basis, 'missing') != 'explicit-official-route')
         GROUP BY host, provider_id, model_id, evidence_basis, pricing_basis
         ORDER BY SUM(uncached_input_tokens + cache_read_tokens + cache_write_tokens + output_tokens) DESC",
    ) { Ok(stmt) => stmt, Err(_) => return json!({"month": month, "groups": [], "status": "unavailable"}) };
    let rows = stmt.query_map(rusqlite::params![start, end], |r| Ok(json!({
        "host": r.get::<_, String>(0)?, "provider_id": r.get::<_, String>(1)?,
        "model_id": r.get::<_, String>(2)?, "evidence_basis": r.get::<_, String>(3)?,
        "pricing_basis": r.get::<_, String>(4)?, "tokens": r.get::<_, i64>(5)?,
        "first_event_at_ms": r.get::<_, i64>(6)?, "last_event_at_ms": r.get::<_, i64>(7)?,
        "session_count": r.get::<_, i64>(8)?, "estimated_cost_minor": serde_json::Value::Null,
    })));
    let groups = rows.ok().into_iter().flatten().filter_map(Result::ok).collect::<Vec<_>>();
    json!({"month": month, "groups": groups, "status": "ok"})
}

/// 统一的只读声明影响预览入口；桌面与 CLI 共享数据层口径，不在 UI 拼 SQL。
pub fn billing_declaration_impact_preview(
    revision_id: &str, window_start_ms: i64, window_end_ms: i64,
) -> serde_json::Value {
    let Some(db) = SqlSummaryRepository::new().open_db() else {
        return json!({"status": "unavailable", "revision_id": revision_id});
    };
    match db.billing_declaration_impact_preview(revision_id, window_start_ms, window_end_ms) {
        Ok(preview) => json!({
            "status": "ok", "revision_id": revision_id,
            "fact_count": preview.fact_count, "session_count": preview.session_count,
            "total_tokens": preview.total_tokens,
            "first_event_ts_ms": preview.first_event_ts_ms,
            "last_event_ts_ms": preview.last_event_ts_ms,
        }),
        Err(_) => json!({"status": "unavailable", "revision_id": revision_id}),
    }
}

/// codex 下钻的纯分类核（可注入真实两层形状做钉测）：`by_model` 是
/// `model → speed → 桶对象`，桶键 = `CODEX_TOKEN_FIELDS` 5 键（形状来源：
/// `hosts/codex/sessions/usage.rs::codex_by_model_from_hours`——审查 P1-1
/// 之前这段直读单层 + 错键名，codex 行永远被 0-token 过滤吞掉）。
fn codex_unresolved_rows(
    by_model: &serde_json::Value,
    priced: &std::collections::HashSet<String>,
) -> Vec<serde_json::Value> {
    const CODEX_TOKEN_FIELDS: [&str; 5] = [
        "uncached_input_tokens",
        "output_tokens",
        "cached_input_tokens",
        "cache_write_input_tokens",
        "reasoning_output_tokens",
    ];
    let mut rows = Vec::new();
    let Some(bm) = by_model.as_object() else {
        return rows;
    };
    for (model, speeds) in bm {
        if priced.contains(model) {
            continue;
        }
        // codex 宿主路由是宿主级（openai 订阅）——只判价卡。
        let mut total: i64 = 0;
        if let Some(sp) = speeds.as_object() {
            for bucket in sp.values() {
                for f in CODEX_TOKEN_FIELDS {
                    total += bucket.get(f).and_then(|v| v.as_i64()).unwrap_or(0);
                }
            }
        }
        if total == 0 {
            continue; // 0-token 行无可计价用量，不进下钻
        }
        rows.push(serde_json::json!({
            "model": model,
            "reason": "no-price-card",
            "tokens": total,
        }));
    }
    rows
}

/// `by_provider` 的 Codex 条目：`billing_mode_of("openai") = subscription`
/// → 等价标价口径。`codex_host_amount_with_tokens_from_hours` 换个 host_id。
fn codex_provider_amount_from_hours(
    by_hour_model: &serde_json::Value,
    day: Option<&str>,
    cards: &PricingCards,
) -> (HostAmount, HostTokens) {
    let (mut h, tk) = codex_host_amount_with_tokens_from_hours(
        by_hour_model,
        &serde_json::Value::Null,
        &serde_json::Value::Null,
        day,
        cards,
    );
    h.host_id = "codex/openai".to_string();
    h.currency = Some("USD".to_string());
    (h, tk)
}

/// Provider-aware Codex projection. OpenAI keeps the subscription/nominal
/// pricing path; custom or unknown routes are isolated and remain unresolved
/// instead of being silently priced as OpenAI.
fn codex_provider_amounts_from_sql(
    db: &Option<agent_vitals_data::authority::AuthorityDb>,
    bounds: Option<(i64, i64)>,
    day: Option<&str>,
    fallback: &serde_json::Value,
    cards: &PricingCards,
) -> BTreeMap<String, HostAmount> {
    let Some((start, end)) = bounds else {
        return BTreeMap::from([(String::from("codex/openai"), codex_provider_amount_from_hours(fallback, day, cards).0)]);
    };
    let Some(db) = db else { return BTreeMap::new(); };
    let grouped = agent_vitals_data::authority_query::codex_by_hour_provider_model(db.conn(), start, end).unwrap_or_default();
    let mut out = BTreeMap::new();
    for (provider, hours) in grouped {
        let key = format!("codex/{provider}");
        if provider == "openai" {
            out.insert(key, codex_provider_amount_from_hours(&hours, day, cards).0);
        } else {
            // Custom/third-party routes are not OpenAI subscription usage, but
            // they still receive a fair-market estimate from the model card.
            // Keep it in the non-summable estimate bucket and mark unresolved;
            // never silently drop the tokens or label the estimate as actual.
            let model = agent_vitals_hosts::codex_usage::codex_by_model_from_hours(&hours, None);
            if model.to_string().contains("uncached_input_tokens") {
                let (priced, _tokens) = codex_host_amount_with_tokens_from_hours(
                    &hours,
                    &serde_json::Value::Null,
                    &serde_json::Value::Null,
                    day,
                    cards,
                );
                // The helper returns a non-summable model-card estimate. Read
                // whichever estimate basis applies and keep the custom route
                // in MeteredEstimate rather than treating it as an actual bill.
                let estimate = priced
                    .amounts_by_basis
                    .get(&BillingBasis::MeteredEstimate)
                    .or_else(|| priced.amounts_by_basis.get(&BillingBasis::ApiEquivalent))
                    .copied()
                    .unwrap_or(0.0);
                let mut amounts_by_basis = BTreeMap::new();
                if estimate > 0.0 {
                    amounts_by_basis.insert(BillingBasis::MeteredEstimate, estimate);
                }
                out.insert(key.clone(), HostAmount {
                    host_id: key,
                    amounts_by_basis,
                    currency: Some("USD".to_string()),
                    has_unresolved: true,
                    // The SQL summary cannot establish session-native route
                    // evidence for the whole aggregate.
                    evidence_basis: Some("missing".to_string()),
                    pricing_method: Some("fair-market-fallback".to_string()),
                    unresolved_reason: Some("provider-specific-card-unavailable".to_string()),
                    freshness: day.map(day_freshness).unwrap_or_else(|| Freshness { state: FreshnessState::Partial, last_observed_at: Some("sql-facts".to_string()) }),
                });
            }
        }
    }
    out
}

fn codex_host_amount_provider_safe(
    db: &Option<agent_vitals_data::authority::AuthorityDb>,
    bounds: Option<(i64, i64)>,
    by_hour_model: &serde_json::Value,
    day: Option<&str>,
    cards: &PricingCards,
) -> (HostAmount, HostTokens) {
    let mixed = bounds.and_then(|(start, end)| db.as_ref().and_then(|db| {
        agent_vitals_data::authority_query::codex_by_hour_provider_model(db.conn(), start, end).ok()
    })).map(|m| m.keys().any(|p| p != "openai")).unwrap_or(false);
    let (mut amount, tokens) = codex_host_amount_with_tokens_from_hours(
        by_hour_model, &serde_json::Value::Null, &serde_json::Value::Null, day, cards,
    );
    if mixed {
        amount.amounts_by_basis.clear();
        amount.has_unresolved = true;
        amount.freshness = day.map(day_freshness).unwrap_or(Freshness {
            state: FreshnessState::Partial,
            last_observed_at: Some("sql-facts".to_string()),
        });
    }
    (amount, tokens)
}

/// WorkBuddy 栏（E4b）：**只有 token、没有金额**。四桶从 SQL `usage_facts` 直接
/// 聚合（`host_window_tokens`）；金额一律不填——每条事实 `provider_id: null`、
/// `pricing_basis: metered_estimate`、`evidence_basis: missing`（§2.1 三轨不可判），
/// 没有可归属的价卡，`amounts_by_basis` 空 + `has_unresolved: true` +
/// `unresolved_reason: billing-route-unknown`（`data-unresolved` 同一词表）。
/// 窗口内无事实 → Unavailable（不是 0）。**不进 `by_provider`**：provider 为
/// null 的事实没有 `host/provider` 键可挂。
fn workbuddy_host_amount_with_tokens(
    db: &Option<agent_vitals_data::authority::AuthorityDb>,
    bounds: Option<(i64, i64)>,
) -> (HostAmount, HostTokens) {
    let window = match (db, bounds) {
        (Some(db), Some((start, end))) => {
            agent_vitals_data::authority_query::host_window_tokens(
                db.conn(),
                "workbuddy",
                start,
                end,
            )
            .ok()
            .flatten()
        }
        _ => None,
    };
    let mut amount = HostAmount {
        host_id: "workbuddy".to_string(),
        amounts_by_basis: BTreeMap::new(),
        currency: None,
        has_unresolved: false,
        evidence_basis: None,
        pricing_method: None,
        unresolved_reason: None,
        freshness: Freshness::unavailable(),
    };
    let Some(w) = window else {
        return (amount, HostTokens::default());
    };
    amount.has_unresolved = true;
    amount.evidence_basis = Some("missing".to_string());
    amount.unresolved_reason = Some("billing-route-unknown".to_string());
    amount.freshness = day_freshness(&w.latest_day);
    let mut tk = HostTokens {
        uncached_input: w.uncached_input,
        cache_read: w.cache_read,
        cache_write: w.cache_write,
        output: w.output,
        ..HostTokens::default()
    };
    tk.total = tk.uncached_input + tk.cache_read + tk.cache_write + tk.output;
    tk.cache_hit_ratio = agent_vitals_domain::cost::cache_hit_ratio(&json!({
        "uncached_input_tokens": tk.uncached_input,
        "cache_read_tokens": tk.cache_read,
        "cache_write_tokens": tk.cache_write,
    }));
    (amount, tk)
}

/// DSH 窗口（`days` map 或单日值）的 token 计量：DSH 四桶词表直读
/// （`uncached_input_tokens` 词表，与 claude/codex 不同——见 fixtures/v09
/// 的 _doc）。`window` 是月份前缀或完整日期。
/// 单个 DSH day 对象 → token 计量。**两种形状都认**（镜像 `priced_day` 的
/// 双形状处理）：正常管线的 day 顶层有 `merge_buckets` 折叠出的四桶字段；
/// 只有 `by_model` 有量、顶层零桶的变形日（跨零点切片等）走 `by_model`
/// 逐模型累加回退——审查 #2：此前日度路径把单日对象塞进按 {date: day} map
/// 设计的过滤，字段名键永远不命中窗口前缀 → DSH 的「今日 tokens」恒零
/// （假零，MeasuredZero≠Unavailable 纪律的违例）。
fn dsh_day_tokens(day: &serde_json::Value) -> HostTokens {
    let mut tk = HostTokens::default();
    let g =
        |v: &serde_json::Value, k: &str| v.get(k).and_then(|x| x.as_f64()).unwrap_or(0.0) as i64;
    tk.uncached_input = g(day, "uncached_input_tokens");
    tk.cache_read = g(day, "cache_read_tokens");
    tk.cache_write = g(day, "cache_write_tokens");
    tk.output = g(day, "output_tokens");
    if tk.uncached_input + tk.cache_read + tk.cache_write + tk.output == 0 {
        // 顶层零桶：by_model 回退（逐模型同词表四桶）。
        if let Some(models) = day.get("by_model").and_then(|v| v.as_object()) {
            for (_m, b) in models {
                tk.uncached_input += g(b, "uncached_input_tokens");
                tk.cache_read += g(b, "cache_read_tokens");
                tk.cache_write += g(b, "cache_write_tokens");
                tk.output += g(b, "output_tokens");
            }
        }
    }
    tk.total = tk.uncached_input + tk.cache_read + tk.cache_write + tk.output;
    tk.cache_hit_ratio = agent_vitals_domain::cost::cache_hit_ratio(&json!({
        "uncached_input_tokens": tk.uncached_input,
        "cache_read_tokens": tk.cache_read,
        "cache_write_tokens": tk.cache_write,
    }));
    tk
}

/// DSH 窗口（`days` map 或单日值）的 token 计量：逐日过 [`dsh_day_tokens`]。
fn dsh_tokens(days: Option<&serde_json::Value>, window: &str) -> HostTokens {
    let mut tk = HostTokens::default();
    if let Some(days) = days.and_then(|d| d.as_object()) {
        for (date, day) in days {
            if !date.starts_with(window) {
                continue;
            }
            let day_tk = dsh_day_tokens(day);
            tk.uncached_input += day_tk.uncached_input;
            tk.cache_read += day_tk.cache_read;
            tk.cache_write += day_tk.cache_write;
            tk.output += day_tk.output;
        }
    }
    tk.total = tk.uncached_input + tk.cache_read + tk.cache_write + tk.output;
    tk.cache_hit_ratio = agent_vitals_domain::cost::cache_hit_ratio(&json!({
        "uncached_input_tokens": tk.uncached_input,
        "cache_read_tokens": tk.cache_read,
        "cache_write_tokens": tk.cache_write,
    }));
    tk
}

/// Stage C：把已声明订阅的月费摊进 `by_provider` 的 `FixedSubscription` 档。
///
/// **这是「实际支出」缺失的另一半**：此前系统里订阅的钱根本不存在
/// （`FixedSubscription` 零写入方）——用户每月真金白银付的 $20 + ¥114 +
/// ¥118 不在任何账面，总额只收 DSH 按量。摊入后 `total_summable()`（它对
/// FixedSubscription 本来就返回 true，spec §4「固定订阅可以按口径汇总」）
/// 首次等于真实的月度总支出。
///
/// 三条纪律：
/// 1. **不付用量也在付**——用 `declared_subscriptions` 全量枚举，给没有用
///    量条目的 provider 补建条目（零用量的月份不能谎报成零支出）。宿主归
///    属查 [`HOST_PROVIDER_MAP`]；映射不到的声明落 `unattributed/<provider>`
///    条目可见，不静默丢钱。
/// 2. **账期过滤**——查询月早于 `billing_period_start`（缺省 `reported_at`）
///    的月份不摊：GLM 2026-09-05 才买，摊进 8 月就是编造历史支出（claude-pro
///    填了真机 `oauthAccount.subscriptionCreatedAt=2025-07-20`，所以 8 月照摊）。
///    `YYYY-MM` 前缀字符串比较即时间序。
/// 3. **只进月、不进日**——本函数只在 `monthly_summary` 组装路径调用；
///    月费不是日发生额，按日摊会造出「今天花了 ¥3.93」这种不存在的事实。
///
/// 同一 provider 声明重复时 `declared_subscriptions` 的首条语义保证只摊一次。
fn apply_subscription_fees(
    by_provider: &mut BTreeMap<String, HostAmount>,
    month: &str,
    cards: &PricingCards,
) {
    let pricing = cards.main.clone();
    for (provider, currency, amount, period_start) in
        agent_vitals_domain::cost::declared_subscriptions(&pricing)
    {
        // 账期未开始不摊（None 理论不可达——declared_subscriptions 已回落
        // reported_at；防御性跳过而不是摊进所有历史）。
        let Some(start) = period_start.as_deref() else {
            continue;
        };
        // chars 而非字节切片：声明混入非 ASCII 时 [..7] 会 panic（billing 的
        // 脏数据纪律是显式可见，不是 panic）。
        let start_month: String = start.chars().take(7).collect();
        if month < start_month.as_str() {
            continue;
        }
        let host = HOST_PROVIDER_MAP
            .iter()
            .find(|(_, providers)| providers.contains(&provider.as_str()))
            .map(|(host, _)| host.to_string())
            .unwrap_or_else(|| "unattributed".to_string());
        let key = format!("{host}/{provider}");
        let entry = by_provider
            .entry(key.clone())
            .or_insert_with(|| HostAmount {
                host_id: key,
                amounts_by_basis: BTreeMap::new(),
                currency: None,
                has_unresolved: false,
                evidence_basis: None,
                pricing_method: None,
                unresolved_reason: None,
                freshness: Freshness::unavailable(),
            });
        // 同 provider 重复摊的防线不在循环外而在取值语义：declared_
        // subscriptions 已按「首条」去重（测试钉住），这里每个 provider 恰好
        // 进一次循环。
        *entry
            .amounts_by_basis
            .entry(BillingBasis::FixedSubscription)
            .or_insert(0.0) += amount;
        // 币种合并：零用量纯月费条目（如 glm 无 token 的月份）此前 currency
        // 为 None，月费会掉进 total_actual_spend 的无币桶——用声明币种补齐；
        // 与条目既有币种冲突（理论形状：同一 provider 两张币种不同的卡）时
        // 撤销声明 + unresolved，绝不冒充单币。
        match &entry.currency {
            None => entry.currency = Some(currency),
            Some(c) if *c == currency => {}
            Some(_) => {
                entry.currency = None;
                entry.has_unresolved = true;
            }
        }
    }
}

/// Phase 2.8（spec §5.3）：用户显式录入的 `host_bills` 行 → `by_provider` 对应
/// 条目的 basis 桶。键 `{host}/{provider}`，与 `apply_subscription_fees` 同款
/// 「找不到条目就新建、有就叠加」。跨币不相加——同 provider 同 basis 出现
/// 第二币种（理论上不该）→ 撤 currency + unresolved。`data host-bill set` 的
/// 唯一消费面。
///
/// **在 `apply_subscription_fees` 之后跑**：主用途是 `host_billed`（WorkBuddy
/// credit_json、中转对账单——价卡派生不出来的），不与订阅声明重叠。若用户
/// 又把已在 `pricing.json` 声明的订阅重复录成 `fixed_subscription` host_bill，
/// 两者会叠进同一桶——那是录入责任（spec §5.3：这条路径专给非价卡来源），
/// 不在这里去重。
fn apply_host_bills(
    by_provider: &mut BTreeMap<String, HostAmount>,
    db: &agent_vitals_data::authority::AuthorityDb,
    month: &str,
) {
    let rows = match db.host_bills_for_period(month) {
        Ok(r) => r,
        Err(_) => return,
    };
    // `HostAmount` deliberately has one currency slot. Once a provider entry
    // has received two currencies, retain neither amounts nor a currency label;
    // otherwise a later row could re-claim one currency and make mixed money
    // look like a valid single-currency total.
    let mut currency_conflicted = BTreeSet::new();
    for (host, provider, basis_str, amount_minor, currency) in rows {
        let Some(basis) = agent_vitals_domain::data_contract::BillingBasis::from_wire(&basis_str)
        else {
            continue;
        };
        let key = format!("{host}/{provider}");
        let entry = by_provider
            .entry(key.clone())
            .or_insert_with(|| HostAmount {
                host_id: key.clone(),
                amounts_by_basis: BTreeMap::new(),
                currency: None,
                has_unresolved: false,
                evidence_basis: None,
                pricing_method: None,
                unresolved_reason: None,
                freshness: Freshness::unavailable(),
            });
        if currency_conflicted.contains(&key) {
            continue;
        }
        let mut accepts_amount = false;
        match &entry.currency {
            None if !entry.has_unresolved => {
                entry.currency = Some(currency);
                accepts_amount = true;
            }
            Some(c) if *c == currency => accepts_amount = true,
            Some(_) => {
                entry.currency = None;
                entry.has_unresolved = true;
                entry.amounts_by_basis.clear();
                currency_conflicted.insert(key);
            }
            None => {}
        }
        if accepts_amount {
            *entry.amounts_by_basis.entry(basis).or_insert(0.0) += amount_minor as f64 / 100.0;
        }
    }
}

/// Codex 当前配额快照（决策卡「现在该用谁」的唯一正向余量源）。
///
/// **为什么是独立函数而不是塞进 summary**：plan 是"当前状态"的单快照、不按
/// 日期分桶（`hosts/codex/sessions/usage.rs` 的 doc），塞进月/日窗口 DTO 会
/// 把"此刻余量"伪装成窗口数据。宿主字段由 Codex adapter 解析和校验；这里
/// 只从权威库读取 adapter 产出的快照，不二次解释：`{"plan_type", "has_credits",
/// "limits": {"primary": {"used_percent", "window_minutes", "resets_at"}},
/// "observed_at"}`——**窗口条在 `limits.primary` 之下、不在顶层**（审查 #1：
/// doc 曾写错为顶层 `primary`，前端与 verify stub 被同一个错误期望误导，
/// 决策卡整条失效）。无 rollout / 无 plan 事件 → None（无 ChatGPT 订阅
/// 证据，不得编造余量）。
pub fn codex_quota_snapshot(home: &Path) -> Option<serde_json::Value> {
    // 签名保留给 Tauri 调用点；配额现由同步管线写入 authority，产品读面不得
    // 回退扫描 ~/.codex rollout（库缺记录就诚实 None）。
    let _ = home;
    let db = SqlSummaryRepository::new().open_db()?;
    let (payload, _observed_at_ms) = db.runtime_snapshot_get("codex", "codex_quota").ok()??;
    let plan: serde_json::Value = serde_json::from_str(&payload).ok()?;
    agent_vitals_hosts::codex_usage::validate_quota_snapshot(&plan)
}

/// Claude Pro 的窗口状态（决策卡「现在该用谁」的 Claude 行）。
///
/// **与 `codex_quota_snapshot` 同一条纪律**：只读权威库里的宿主快照，产品读面
/// **不回退扫描 `~/.claude`**——库缺记录就诚实 `None`（宁可不显示，也不现扫）。
///
/// **状态机在这里算完再交给展示层**，`now_secs` 由调用方注入：前端不做时间判断，
/// 否则同一个"现在"在卡片、待处理、通知三处会各算各的，出现自相矛盾的显示。
///
/// 数据边界（真机核对 2026-09-14，42 条 `quotaLimits` 全为 `rejected`）：
/// **没有正向余量这回事**，所以这里只可能给出 `unknown` 或 `exhausted`，
/// 永远不会有"剩余 N%"（spec §8.3.2 明令）。
pub fn claude_quota_status(now_secs: i64) -> Option<serde_json::Value> {
    use agent_vitals_hosts::claude_quota::{window_state, ClaudeQuotaSnapshot, WindowState};
    let db = SqlSummaryRepository::new().open_db()?;
    let (payload, _observed_at_ms) = db.runtime_snapshot_get("claude-code", "claude_quota").ok()??;
    let value: serde_json::Value = serde_json::from_str(&payload).ok()?;
    // 库里的 payload 也当**不可信输入**再校验一遍：半截数据不该让界面显示一个
    // 凭空的"重置时刻"（与 Codex 的 validate_quota_snapshot 同一纪律）。
    let snapshot = ClaudeQuotaSnapshot::from_payload(&value)?;
    let windows_recent = value
        .get("windows_recent")
        .and_then(serde_json::Value::as_u64)
        .unwrap_or(0);
    Some(match window_state(&snapshot, now_secs) {
        WindowState::Unknown => serde_json::json!({
            "state": "unknown",
            "observed_at": snapshot.observed_at,
            "windows_recent": windows_recent,
            // 「未知」不等于"什么都不知道"：上次那条限流记录的重置时刻是**已知**的
            // （而且走到这个分支时它一定已经过去了）。把它带出来，展示层才能说
            // 「上次限流已于 02:20 重置」——而不是一句干巴巴的"窗口状态未知"。
            "last_resets_at": snapshot.resets_at,
            "last_window": snapshot.rate_limit_type,
        }),
        WindowState::Exhausted { resets_at, window } => serde_json::json!({
            "state": "exhausted",
            "window": window,
            // 人类标签随 DTO 走：卡片、待处理任务、系统通知三处必须叫同一个名字，
            // 而通知那条路径（Tauri）不依赖 hosts crate，只能从这里拿。
            "window_label": agent_vitals_hosts::claude_quota::window_label(window),
            "resets_at": resets_at,
            "observed_at": snapshot.observed_at,
            "windows_recent": windows_recent,
        }),
    })
}

/// 宿主 → 该宿主可能出现的 billing_source 提供方。接线知识（与
/// `WIRED_HOSTS` 同类）：新宿主/新提供方接线时同步维护；漏登记的已声明
/// 订阅会落 `unattributed/<provider>` 条目可见，不会静默消失。
const HOST_PROVIDER_MAP: &[(&str, &[&str])] = &[
    (
        "claude-code",
        &["anthropic", "minimax", "zhipu-glm", "moonshot"],
    ),
    ("codex", &["openai"]),
    ("dsh", &["deepseek-official", "shengsuanyun"]),
    // WorkBuddy：无价卡声明的 provider（三轨请求级不可判，§2.1）——空表是
    // 显式声明「没有可摊订阅的 provider」，不是漏登记。
    ("workbuddy", &[]),
];

/// Token 日历的逐日跨宿主数据（v0.9 Stage D——日历此前只画 DSH 日轴，
/// 2026-09 实测：DSH 全零月让 57 亿 token 的 claude/codex 用量在日历上
/// 完全不可见，用户看到一片空白）。
///
/// 每天三宿主各自计量 + 计价，**钱不跨宿主不跨币合并**（口径各异：DSH
/// 实测、claude relay 估算、codex 等价标价——格子副行分币并列，主行是
/// 托盘 `read_overview` 的 SQL 权威数据面（Phase 4 §5.2：菜单栏不再直读
/// `state/{today,month,claude-ledger}.json`）。开库一次，返回三份与旧 state
/// JSON **同形**的原始数据，供 Tauri 侧的 core 折叠函数（`today_cost` /
/// `month_cost` / `claude_estimates` / `rollup_by_model`）消费——不重写任何
/// 计价。与 `calendar_month` / `hourly_distribution` 同层同源。
pub struct OverviewBundle {
    /// DSH 今日桶（`month.json` days 单日同形：8 桶 + `by_model`）或 None
    /// （今日无 DSH 用量——不是「花了 0」）。
    pub dsh_today: Option<serde_json::Value>,
    /// DSH 当月逐日 map（`month.json` `days` 同形，SQL 北京月窗已过滤）。
    pub dsh_month_days: serde_json::Value,
    /// Claude 当月逐日账（`claude-ledger.json` `days` 同形：
    /// `{date:{model:{input_tokens,cache_read_input_tokens,
    /// cache_creation_input_tokens,output_tokens}}}`，实时事实优先 +
    /// legacy_aggregate 深历史按模型补缺）。
    pub claude_month_days: serde_json::Value,
}

pub fn overview_bundle(data_home: &Path) -> OverviewBundle {
    let today_key = crate::clock::today_beijing();
    let month = crate::clock::current_month_beijing();
    let bounds = agent_vitals_data::authority_query::beijing_month_bounds_ms(&month);
    let db = agent_vitals_data::authority::AuthorityDb::open(
        &agent_vitals_data::authority::default_authority_path(data_home),
        crate::sql_sync::now_ms(),
    )
    .ok();
    let (dsh_days, claude_days) = match (&db, bounds) {
        (Some(db), Some((start, end))) => {
            let conn = db.conn();
            let dsh = agent_vitals_data::authority_query::peaked_days_map(conn, "dsh", start, end)
                .unwrap_or_else(|_| json!({}));
            let claude: serde_json::Map<String, serde_json::Value> =
                merged_claude_days(conn, start, end).into_iter().collect();
            (dsh, serde_json::Value::Object(claude))
        }
        _ => (json!({}), json!({})),
    };
    let dsh_today = dsh_days.get(&today_key).cloned();
    OverviewBundle {
        dsh_today,
        dsh_month_days: dsh_days,
        claude_month_days: claude_days,
    }
}

/// token 总量，token 才是跨宿主可加的量）。返回 `{"month", "days":
/// {date: {...}}}`，无数据日字段缺省为 0/缺键——调用方以
/// `total_tokens == 0` 判定"这天没有用量"。
pub fn calendar_month(month: &str, codex_home: &Path) -> serde_json::Value {
    use serde_json::Value;
    let _ = codex_home; // 签名兼容 Tauri 调用点（3.5 Tier B 切 SQL 后不再读 fold）
    let mut days: serde_json::Map<String, Value> = serde_json::Map::new();
    fn day_entry<'a>(days: &'a mut serde_json::Map<String, Value>, date: &str) -> &'a mut Value {
        days.entry(date.to_string()).or_insert_with(|| {
            json!({
                "dsh_tokens": 0, "claude_tokens": 0, "codex_tokens": 0,
                "total_tokens": 0,
                "dsh_cost_cny": 0.0, "claude_cost_cny": 0.0,
                "claude_cost_usd": 0.0, "codex_cost_usd": 0.0,
            })
        })
    }

    // v0.9.1 Phase 3.5 Tier B：三宿主数据源统一为 SQL 权威库（与
    // SqlSummaryRepository::monthly_summary 同一条 fetch_windowed 管线）——
    // month.json/ledger/fold 全部退出 product 读面（spec §5.2 禁读清单）。
    // 计价函数与旧路径共用同一批核心（priced_day/claude_day_cost/
    // codex_cost_report），格子里的数字只换来源不换算法。
    let db = SqlSummaryRepository::new().open_db();
    let bounds = agent_vitals_data::authority_query::beijing_month_bounds_ms(month);
    let (dsh_days, by_hour_model, claude_days_map) = fetch_windowed(&db, bounds);

    // Q13：月末时点的历史价卡（`monthly_summary` 用同一时点——两者对同月折出
    // 的总额必须相等，见 `PricingCards` doc）。
    let cards = PricingCards::asof(&db, bounds.map(|(_, end)| end));
    let pricing = cards.main.clone();

    // DSH：peaked_days_map（8 键含 peak_* + by_model）逐日 priced_day。
    if let Some(dsh) = dsh_days.as_object() {
        for (date, day) in dsh {
            let tokens = dsh_day_tokens(day).total;
            let cost = agent_vitals_domain::cost::priced_day(day, &pricing)
                .unwrap_or_else(|| agent_vitals_domain::cost::bucket_cost(day, &pricing));
            let e = day_entry(&mut days, date);
            e["dsh_tokens"] = json!(tokens);
            e["dsh_cost_cny"] = json!(cost.get("total").and_then(|v| v.as_f64()).unwrap_or(0.0));
        }
    }

    // Claude：merged_claude_days（实时事实优先、legacy_aggregate 深历史按
    // 模型补缺）逐日 claude_day_cost 分币 + 四桶 token。
    for (date, day) in &claude_days_map {
        let mut tokens = 0i64;
        if let Some(models) = day.as_object() {
            for (_m, b) in models {
                let g = |k: &str| b.get(k).and_then(|v| v.as_f64()).unwrap_or(0.0) as i64;
                tokens += g("input_tokens")
                    + g("cache_read_input_tokens")
                    + g("cache_creation_input_tokens")
                    + g("output_tokens");
            }
        }
        let (cny, usd) = agent_vitals_domain::cost::claude_day_cost(day, &pricing)
            .and_then(|r| {
                let t = r.get("currency_totals")?;
                Some((
                    t.get("CNY").and_then(|v| v.as_f64()).unwrap_or(0.0),
                    t.get("USD").and_then(|v| v.as_f64()).unwrap_or(0.0),
                ))
            })
            .unwrap_or((0.0, 0.0));
        let e = day_entry(&mut days, date);
        e["claude_tokens"] = json!(tokens);
        e["claude_cost_cny"] = json!(cny);
        e["claude_cost_usd"] = json!(usd);
    }

    // Codex：SQL 小时桶按日聚合 token；逐日钱走 codex_cost_report 的 days[]
    // （cost_usd，untimed 剩余按 per_model 并——与旧路径同一函数同一守恒）。
    for (hour, models) in by_hour_model
        .as_object()
        .expect("by_hour_model is an object")
    {
        let date = &hour[..hour.len().min(10)];
        let mut tokens = 0i64;
        if let Some(models) = models.as_object() {
            for (_m, speeds) in models {
                if let Some(speeds) = speeds.as_object() {
                    for (_s, b) in speeds {
                        let g = |k: &str| b.get(k).and_then(|v| v.as_f64()).unwrap_or(0.0) as i64;
                        tokens += g("uncached_input_tokens")
                            + g("cached_input_tokens")
                            + g("cache_write_input_tokens")
                            + g("output_tokens")
                            + g("reasoning_output_tokens");
                    }
                }
            }
        }
        let e = day_entry(&mut days, date);
        e["codex_tokens"] =
            json!(e.get("codex_tokens").and_then(|v| v.as_i64()).unwrap_or(0) + tokens);
    }
    let by_model = agent_vitals_hosts::codex_usage::codex_by_model_from_hours(&by_hour_model, None);
    if let Some(report) = crate::sessions::codex_cost::codex_cost_report(
        &by_hour_model,
        &by_model,
        &serde_json::Value::Null,
        &serde_json::Value::Null,
        &cards.codex,
        false,
    ) {
        if let Some(report_days) = report.get("days").and_then(|v| v.as_array()) {
            for d in report_days {
                let Some(date) = d.get("date").and_then(|v| v.as_str()) else {
                    continue;
                };
                let cost = d.get("cost_usd").and_then(|v| v.as_f64()).unwrap_or(0.0);
                let e = day_entry(&mut days, date);
                e["codex_cost_usd"] = json!(cost);
            }
        }
    }

    // total_tokens 最后统一算（三宿主都已落位）。
    for (_, e) in days.iter_mut() {
        let g = |k: &str| e.get(k).and_then(|v| v.as_i64()).unwrap_or(0);
        e["total_tokens"] = json!(g("dsh_tokens") + g("claude_tokens") + g("codex_tokens"));
    }
    json!({ "month": month, "days": Value::Object(days) })
}

/// `codex-cost` 的 SQL 权威面（Tier B 收尾，spec §5.2）：codex 用量从
/// `authority_query::codex_by_hour_model` 读，不再全量 fold `~/.codex` rollout。
/// 与 `calendar_month` / `hourly_distribution` 同层同源（runtime，直连
/// `AuthorityDb`——`budget.rs::evaluate_alert_from_sql` 也是这个模式），CLI 只
/// 调不自己开库。
///
/// 返回 `(merged, note)`：`merged` 与旧 rollout fold 同形
/// （`{by_hour_model, by_model, unaccounted, plan}`）供 `codex_report_from_merged`
/// 直接消费——全窗一次查，视图过滤仍由 `codex_report_from_merged` 的
/// `filter_key` 做。`note` 非 `None` 时 = 库缺失/打不开，CLI 应打 stderr 提示，
/// 避免把「空报告」当成「codex 没花钱」端出去（二进制-only 安装从没跑过
/// `sync-facts` 时就是这个形态）。
///
/// **SQL 面降级（如实记）**：
/// - `unaccounted` = `[]`——rollout fold 独有的残差哨兵（「未消费但含 token
///   字段名的事件」），`usage_facts` 是已清洗事实、无此概念。
/// - `plan` = `{}`：SQL token 聚合不保留可按历史窗口证明的套餐证据，不能把
///   开发者机器上的 Plus 观察值编造成所有安装的默认身份。真实会话解析出的
///   `plan_type` 仍可透传；缺失时总额按量估算并标记待确认。
pub fn codex_merged_from_sql(data_home: &Path) -> (serde_json::Value, Option<String>) {
    let empty = || {
        json!({
            "by_hour_model": {}, "by_model": {},
            "unaccounted": [], "plan": {},
        })
    };
    let path = agent_vitals_data::authority::default_authority_path(data_home);
    // `!exists` 必须在 open 之前判：`AuthorityDb::open` 对缺文件会**建库**
    // （全 DDL），之后就分不清「从没同步」和「同步了但 codex 无用量」。
    let missing = !path.exists();
    let by_hour_model =
        match agent_vitals_data::authority::AuthorityDb::open(&path, crate::sql_sync::now_ms()) {
            Ok(db) => {
                agent_vitals_data::authority_query::codex_by_hour_model(db.conn(), 0, i64::MAX)
                    .unwrap_or_else(|_| json!({}))
            }
            Err(e) => {
                return (
                    empty(),
                    Some(format!(
                        "authority DB at {} could not be opened ({e}); reporting empty codex cost",
                        path.display()
                    )),
                );
            }
        };
    let note = missing.then(|| {
        format!(
            "authority DB not found at {} — run `agent-vitals sync-facts` to populate it; reporting empty codex cost",
            path.display()
        )
    });
    let by_model = agent_vitals_hosts::codex_usage::codex_by_model_from_hours(&by_hour_model, None);
    (
        json!({
            "by_hour_model": by_hour_model,
            "by_model": by_model,
            "unaccounted": [],
            "plan": {},
        }),
        note,
    )
}

/// v0.9.1 Phase 3.1（`AGENT_VITALS_V0_9_1_SQL_AUTHORITY_MIGRATION_SPEC.md`
/// §5.2）：`SummaryRepository` 的 SQL 权威库实现——`usage_facts` 取代
/// month.json/ledger/codex fold 作为读源。**计价规则一个字不改**：DSH 走
/// `dsh_host_amount`/`dsh_provider_amount`/`dsh_tokens`/`dsh_day_tokens`
/// （无缝复用，它们本就只认 `{total,peak_total}`/`{date:day}` 这两种
/// `Value` 形状，不关心谁产出的），codex/claude 走上面拆出来的
/// `_from_hours`/`_from_days` 核心——三条计价管线
/// 完全同源，唯一的区别是 [`agent_vitals_data::authority_query`] 从
/// `usage_facts` 反查出同形状的输入，而不是解析 JSON 文件/折叠 rollout。
///
/// **权威库打不开（损坏/新版本）时不 panic、也不报错**——`SummaryRepository`
/// 的 trait 签名不带 `Result`（Stage 0 定的形状，Phase 3 沿用），这里退化
/// 成"这个窗口的三个宿主都没有数据"，与 JSON 路径在 month.json 缺失时的
/// 行为一致（每个宿主的 `_from_hours`/`_from_days` 核心函数本来就把"空
/// 输入"处理成 Unavailable，不是本结构体重新发明的分支）。真正的损坏诊断
/// 走 `data doctor`/`data status`，不是这条查询路径的职责。
#[derive(Default)]
pub struct SqlSummaryRepository {
    /// `None` = 生产路径，库位置来自 `crate::home::data_home()`（进程
    /// `AGENT_VITALS_HOME`）。`Some` = 参数化：Tauri `read_overview_at(dh)`
    /// 组装入口与临时库单测显式指定库根，不受进程 env 影响——ZST 时代
    /// 「组装入口传进来的 dh 被内部忽略、预算卡永远在真机库上跑」是本次
    /// 会话 Tier B 收尾连续 4 次实现失败的根因。
    data_home: Option<std::path::PathBuf>,
}

impl SqlSummaryRepository {
    /// 生产构造：库根 = `crate::home::data_home()`。
    pub fn new() -> Self {
        Self::default()
    }

    /// 参数化构造：显式库根（Tauri 组装入口 / 临时库单测）。
    pub fn at(data_home: impl Into<std::path::PathBuf>) -> Self {
        Self {
            data_home: Some(data_home.into()),
        }
    }

    fn open_db(&self) -> Option<agent_vitals_data::authority::AuthorityDb> {
        let data_home = self
            .data_home
            .clone()
            .unwrap_or_else(crate::home::data_home);
        let path = agent_vitals_data::authority::default_authority_path(&data_home);
        agent_vitals_data::authority::AuthorityDb::open(&path, crate::sql_sync::now_ms()).ok()
    }
}

/// claude 窗口内的账日：实时行级事实优先，`legacy_aggregate` 深历史只填
/// 实时缺席的日期——先铺 legacy 再用实时 `extend` 覆盖同键，`BTreeMap::
/// extend` 后写赢，天然实现"有实时用实时、没有才退回 ledger 深历史"
/// （spec §6.2.3：ledger 是现文件重放不到的那部分账的 store of record，
/// 不是与实时并列的第二份真相——两者本就不该在同一天都有数据）。
fn merged_claude_days(
    conn: &rusqlite::Connection,
    start_ms: i64,
    end_ms: i64,
) -> BTreeMap<String, serde_json::Value> {
    // **模型级合并**（2026-09-07 审查收口）：旧实现 `days.extend(realtime)`
    // 是整日替换——同日只要任一模型有实时行，该日全部 legacy 聚合（含其他
    // 模型的桶）被整体丢弃，「A 实时 + B legacy」表达不了，B 无标记消失。
    // 改为按 (日, 模型) 选源：legacy 铺底，实时按模型键覆盖——同键不双计
    // （每 (日,模型) 只有一个来源），异键互补（轮转掉 B 的会话文件时 B 的
    // 聚合仍可见）。真机核验：ledger days 与 SQL 行级只差 ~1.7%，当前损失
    // 趋近于零，但结构上必须正确——轮转发生时这里就是唯一防线。
    let mut days = agent_vitals_data::authority_query::claude_legacy_days(conn, start_ms, end_ms)
        .unwrap_or_default();
    let realtime =
        agent_vitals_data::authority_query::claude_days(conn, start_ms, end_ms).unwrap_or_default();
    for (day, models) in realtime {
        let entry = days.entry(day).or_insert_with(|| serde_json::json!({}));
        let obj = entry.as_object_mut().expect("claude day entry is object");
        if let Some(models) = models.as_object() {
            for (model, buckets) in models {
                obj.insert(model.clone(), buckets.clone());
            }
        }
    }
    days
}

/// 测试穿透（integration 测试 `q_acceptance.rs` 的分离纪律用例）。
#[doc(hidden)]
pub fn merged_claude_days_for_tests(
    conn: &rusqlite::Connection,
    start_ms: i64,
    end_ms: i64,
) -> BTreeMap<String, serde_json::Value> {
    merged_claude_days(conn, start_ms, end_ms)
}

/// 该月（或该日所属月）的 claude 数据是否带 legacy_aggregate 兜底标记
/// （`data_quality_issues` 里未解决的 `code='legacy_aggregate'` 行，
/// scope_key = 具体月份或 'all'）。命中 → 摘要侧 claude 的 freshness 降为
/// `Partial`——「这个月有聚合兜底的成分」必须在 UI 可见（审查收口：标记
/// 此前只写不读，spec §6.2.3「查询方据此降级」没有消费方，legacy 月份照常
/// 渲染 Fresh）。
fn claude_legacy_backed(conn: &rusqlite::Connection, month: &str) -> bool {
    conn.query_row(
        "SELECT COUNT(*) FROM data_quality_issues
         WHERE resolved_at_ms IS NULL AND code = 'legacy_aggregate'
           AND scope_type = 'month'
           AND (scope_key = ?1 OR scope_key = 'all')",
        rusqlite::params![month],
        |r| r.get::<_, i64>(0),
    )
    .map(|n| n > 0)
    .unwrap_or(false)
}

/// claude 宿主条目的 freshness 按 legacy 兜底标记降级（Fresh/Stale →
/// Partial；Unavailable 保持——「从没观测到」不因标记变成「部分观测到」）。
fn degrade_claude_freshness_if_legacy_backed(
    conn: &rusqlite::Connection,
    month: &str,
    amount: &mut HostAmount,
) {
    if amount.freshness.state == FreshnessState::Unavailable {
        return;
    }
    if claude_legacy_backed(conn, month) {
        amount.freshness.state = FreshnessState::Partial;
    }
}

/// 打开库 + 算好窗口边界后，三宿主共用的原始数据抓取——月/日两条路径都是
/// 「先拿这三份，再喂各自计价函数」，抽出来避免 monthly/daily 各写一份
/// 一模一样的 `match (&db, bounds) { … }`。库打不开或窗口非法（无效
/// 月份/日期字符串）一律退化成空输入，见结构体文档。
fn fetch_windowed(
    db: &Option<agent_vitals_data::authority::AuthorityDb>,
    bounds: Option<(i64, i64)>,
) -> (
    serde_json::Value,
    serde_json::Value,
    BTreeMap<String, serde_json::Value>,
) {
    match (db, bounds) {
        (Some(db), Some((start, end))) => {
            let conn = db.conn();
            (
                agent_vitals_data::authority_query::peaked_days_map(conn, "dsh", start, end)
                    .unwrap_or_else(|_| json!({})),
                agent_vitals_data::authority_query::codex_by_hour_model(conn, start, end)
                    .unwrap_or_else(|_| json!({})),
                merged_claude_days(conn, start, end),
            )
        }
        _ => (json!({}), json!({}), BTreeMap::new()),
    }
}

impl SummaryRepository for SqlSummaryRepository {
    fn monthly_summary(&self, query: &MonthlySummaryQuery) -> MonthlySummary {
        let db = self.open_db();
        let bounds = agent_vitals_data::authority_query::beijing_month_bounds_ms(&query.month);
        let (dsh_days, by_hour_model, claude_days_map) = fetch_windowed(&db, bounds);

        // Q13（spec §5.3）：按查询月的月末时点选历史价卡版本，不拿今天的卡
        // 重算历史。库无第二份快照时 == 当前嵌入卡（no-op）。
        let cards = PricingCards::asof(&db, bounds.map(|(_, end)| end));
        let pricing = cards.main.clone();
        let latest_day = dsh_days
            .as_object()
            .and_then(|m| m.keys().next_back().cloned());
        let dsh_cost = match dsh_days.as_object() {
            Some(m) if !m.is_empty() => {
                Some(agent_vitals_domain::cost::month_cost(&dsh_days, &pricing))
            }
            _ => None,
        };
        let mut by_host = BTreeMap::new();
        by_host.insert(
            "dsh".to_string(),
            dsh_host_amount(dsh_cost.clone(), latest_day.as_deref()),
        );
        let (codex_amount, codex_tk) = codex_host_amount_provider_safe(
            &db, bounds, &by_hour_model, None, &cards,
        );
        by_host.insert("codex".to_string(), codex_amount);
        let (claude_amount, claude_tk) =
            claude_host_amount_with_tokens_from_days(&claude_days_map, &cards);
        by_host.insert("claude-code".to_string(), claude_amount);
        let (wb_amount, wb_tk) = workbuddy_host_amount_with_tokens(&db, bounds);
        by_host.insert("workbuddy".to_string(), wb_amount);
        // legacy 兜底标记的消费方（degrade_claude_freshness_if_legacy_backed）：
        // 被聚合兜底的月份 claude 侧降为 Partial，必须在 aggregate_freshness
        // 之前生效，聚合新鲜度才能反映它。
        if let Some(db) = &db {
            if let Some(claude_entry) = by_host.get_mut("claude-code") {
                degrade_claude_freshness_if_legacy_backed(db.conn(), &query.month, claude_entry);
            }
        }

        let mut tokens_by_host = BTreeMap::new();
        tokens_by_host.insert("dsh".to_string(), dsh_tokens(Some(&dsh_days), &query.month));
        tokens_by_host.insert("codex".to_string(), codex_tk);
        tokens_by_host.insert("claude-code".to_string(), claude_tk);
        tokens_by_host.insert("workbuddy".to_string(), wb_tk);

        let mut by_provider = BTreeMap::new();
        by_provider.insert(
            "dsh/deepseek-official".to_string(),
            dsh_provider_amount(dsh_cost, latest_day.as_deref()),
        );
        by_provider.extend(codex_provider_amounts_from_sql(
            &db, bounds, None, &by_hour_model, &cards,
        ));
        by_provider.extend(claude_provider_amounts_from_days(&claude_days_map, &cards));
        apply_subscription_fees(&mut by_provider, &query.month, &cards);
        // Phase 2.8：用户显式录入的宿主账单（WorkBuddy 积分 / 中转对账单…）→
        // by_provider 对应条目的 basis 桶（`data host-bill set`）。
        if let Some(db) = &db {
            apply_host_bills(&mut by_provider, db, &query.month);
        }

        let freshness = aggregate_freshness(&by_host);
        let last_observed_at = freshness.last_observed_at.clone();
        MonthlySummary {
            month: query.month.clone(),
            by_host,
            tokens_by_host,
            by_provider,
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
        let db = self.open_db();
        let bounds = agent_vitals_data::authority_query::beijing_day_bounds_ms(&query.date);
        let (dsh_days, by_hour_model, claude_days_map) = fetch_windowed(&db, bounds);
        let day_value = dsh_days.get(&query.date).cloned();

        // Q13：按该日的日末时点选历史价卡（月查询用月末——同一 asof 原语）。
        let cards = PricingCards::asof(&db, bounds.map(|(_, end)| end));
        let pricing = cards.main.clone();
        let cost = day_value.as_ref().map(|d| {
            agent_vitals_domain::cost::priced_day(d, &pricing)
                .unwrap_or_else(|| agent_vitals_domain::cost::bucket_cost(d, &pricing))
        });
        let mut by_host = BTreeMap::new();
        by_host.insert(
            "dsh".to_string(),
            dsh_host_amount(
                cost.clone(),
                day_value.as_ref().map(|_| query.date.as_str()),
            ),
        );
        let (codex_amount, codex_tk) = codex_host_amount_provider_safe(
            &db, bounds, &by_hour_model, Some(&query.date), &cards,
        );
        by_host.insert("codex".to_string(), codex_amount);
        let (claude_amount, claude_tk) =
            claude_host_amount_with_tokens_from_days(&claude_days_map, &cards);
        by_host.insert("claude-code".to_string(), claude_amount);
        let (wb_amount, wb_tk) = workbuddy_host_amount_with_tokens(&db, bounds);
        by_host.insert("workbuddy".to_string(), wb_amount);
        // 日粒度的降级标记按「该日所属月」查（标记是 month scope 的）。
        if let Some(db) = &db {
            let month_of_date: String = query.date.chars().take(7).collect();
            if let Some(claude_entry) = by_host.get_mut("claude-code") {
                degrade_claude_freshness_if_legacy_backed(db.conn(), &month_of_date, claude_entry);
            }
        }

        let mut tokens_by_host = BTreeMap::new();
        tokens_by_host.insert(
            "dsh".to_string(),
            day_value.as_ref().map(dsh_day_tokens).unwrap_or_default(),
        );
        tokens_by_host.insert("codex".to_string(), codex_tk);
        tokens_by_host.insert("claude-code".to_string(), claude_tk);
        tokens_by_host.insert("workbuddy".to_string(), wb_tk);

        let mut by_provider = BTreeMap::new();
        by_provider.insert(
            "dsh/deepseek-official".to_string(),
            dsh_provider_amount(cost, day_value.as_ref().map(|_| query.date.as_str())),
        );
        by_provider.extend(codex_provider_amounts_from_sql(
            &db, bounds, Some(&query.date), &by_hour_model, &cards,
        ));
        by_provider.extend(claude_provider_amounts_from_days(&claude_days_map, &cards));

        let freshness = aggregate_freshness(&by_host);
        let last_observed_at = freshness.last_observed_at.clone();
        DailySummary {
            date: query.date.clone(),
            by_host,
            tokens_by_host,
            by_provider,
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

    /// SQL 权威实现：逐 wired 宿主跑 `authority_query::coverage_status`
    /// （三维分母 v1，见该函数 doc）。窗口 = 该月的北京毫秒边界；库打不开
    /// 或窗口非法 → 三维全 0（诚实「测不到覆盖」，不是满覆盖）。
    fn coverage_status(&self, month: &str) -> BTreeMap<String, CoverageStatus> {
        let db = self.open_db();
        let bounds = agent_vitals_data::authority_query::beijing_month_bounds_ms(month);
        let mut out = BTreeMap::new();
        for host in WIRED_HOSTS {
            let (measured, total) = match (&db, bounds) {
                (Some(db), Some((start, end))) => {
                    agent_vitals_data::coverage::status(db, host, start, end)
                        .map(|s| (s.measured_fields, s.total_fields))
                        .unwrap_or((0, 3))
                }
                _ => (0, 3),
            };
            out.insert(
                (*host).to_string(),
                CoverageStatus {
                    measured_fields: measured,
                    total_fields: total,
                    denominator_version:
                        agent_vitals_data::authority_query::COVERAGE_DENOMINATOR_VERSION,
                },
            );
        }
        out
    }
}

#[cfg(test)]
mod tests {
    use super::*;
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
    fn codex_unresolved_rows_read_the_two_layer_by_model_shape() {
        // 真实形状（codex_by_model_from_hours 产物）：model → speed → 桶对象，
        // 桶键 = CODEX_TOKEN_FIELDS（cached_input_tokens 而非 cache_read——
        // 审查 P1-1 的错键名在这里被钉死）。
        use agent_vitals_hosts::codex_usage::codex_by_model_from_hours;
        let by_hour = json!({
            "2026-09-05T10:00:00.000Z": {
                "gpt-5.3-mystery": {
                    "standard": {"uncached_input_tokens": 100, "output_tokens": 20,
                                 "cached_input_tokens": 300, "cache_write_input_tokens": 5,
                                 "reasoning_output_tokens": 0}
                }
            }
        });
        let by_model = codex_by_model_from_hours(&by_hour, None);
        let priced: std::collections::HashSet<String> = Default::default();
        let rows = codex_unresolved_rows(&by_model, &priced);
        assert_eq!(rows.len(), 1, "未计价模型必须浮出——单层/错键读法这里恒空");
        assert_eq!(rows[0]["model"], json!("gpt-5.3-mystery"));
        assert_eq!(rows[0]["reason"], json!("no-price-card"));
        assert_eq!(rows[0]["tokens"], json!(425), "5 桶之和 = 100+20+300+5+0");
        // priced 模型不进下钻。
        let mut priced2 = std::collections::HashSet::new();
        priced2.insert("gpt-5.3-mystery".to_string());
        assert!(codex_unresolved_rows(&by_model, &priced2).is_empty());
    }

    #[test]
    fn unresolved_detail_flags_unrouted_models_from_sql() {
        with_home(|| {
            // no-card 模型（真机 GLM 无价卡同款）：SQL 事实有量、无路由/无卡。
            let db = seed_authority_db();
            let ts = agent_vitals_data::authority_query::beijing_day_bounds_ms("2026-09-02")
                .unwrap()
                .0
                + 12 * 3_600_000;
            seed_fact(
                &db,
                "glm-unpriced",
                "claude-code",
                Some("glm-5.3-flash"),
                "message",
                ts,
                0,
                1_000,
                2_000,
                0,
                100,
            );
            seed_fact(
                &db,
                "synthetic-zero",
                "claude-code",
                Some("<synthetic>"),
                "message",
                ts,
                0,
                0,
                0,
                0,
                0,
            );
            drop(db);
            let detail = unresolved_detail("2026-09");
            let found = detail
                .as_object()
                .unwrap()
                .iter()
                .flat_map(|(_, rows)| rows.as_array().unwrap().iter())
                .find(|r| r["model"] == json!("glm-5.3-flash"))
                .unwrap_or_else(|| panic!("expected glm row, got {detail}"));
            assert_eq!(found["tokens"], json!(3_100));
            // 0-token 哨兵行不进下钻。
            let synthetic = detail
                .as_object()
                .unwrap()
                .iter()
                .flat_map(|(_, rows)| rows.as_array().unwrap().iter())
                .find(|r| r["model"] == json!("<synthetic>"));
            assert!(synthetic.is_none(), "0-token 行不进下钻，got {detail}");
        });
    }

    #[test]
    fn unresolved_billing_groups_carries_real_scope_and_excludes_subscriptions() {
        with_home(|| {
            let db = seed_authority_db();
            let ts = agent_vitals_data::authority_query::beijing_day_bounds_ms("2026-09-02")
                .unwrap().0 + 12 * 3_600_000;
            seed_fact(&db, "group-unknown", "codex", Some("gpt-mystery"), "token_count", ts, 0, 100, 20, 0, 5);
            // seed_fact 不写 session_key，故此行同时钉住 native-session fallback。
            seed_fact(&db, "group-legacy", "codex", Some("gpt-legacy"), "legacy_aggregate", ts, 0, 9_000, 0, 0, 0);
            seed_fact(&db, "group-subscription", "codex", Some("gpt-plan"), "token_count", ts, 0, 900, 0, 0, 0);
            db.conn().execute(
                "UPDATE usage_facts SET billing_mode = 'subscription', pricing_basis = 'subscription' WHERE fact_id = 'group-subscription'", []
            ).unwrap();
            let groups = unresolved_billing_groups("2026-09");
            assert_eq!(groups["status"], json!("ok"));
            let rows = groups["groups"].as_array().unwrap();
            assert_eq!(rows.len(), 1);
            assert_eq!(rows[0]["host"], json!("codex"));
            assert_eq!(rows[0]["model_id"], json!("gpt-mystery"));
            assert_eq!(rows[0]["tokens"], json!(125));
            assert_eq!(rows[0]["session_count"], json!(1));
            assert!(rows[0]["estimated_cost_minor"].is_null(), "no amount may be invented before historical price aggregation");
        });
    }

    /// 组装层：monthly summary 的 by_provider 必含三个宿主的 provider 条目、
    /// 不含 workbuddy（excluded 检查双向成立）、contract_violations 为空、
    /// by_host 与 by_provider 互不串扰。
    /// 当前月的 Beijing 毫秒时点（月首中午，安全在窗内）——转 SQL 后
    /// 各测试种 fact 用同一个。
    fn current_month_noon_ms() -> i64 {
        let m = crate::clock::current_month_beijing();
        agent_vitals_data::authority_query::beijing_month_bounds_ms(&m)
            .unwrap()
            .0
            + 12 * 3_600_000
    }

    #[test]
    fn monthly_summary_fills_by_provider_without_contract_violations() {
        with_home(|| {
            let month = crate::clock::current_month_beijing();
            let ts = current_month_noon_ms();
            let db = seed_authority_db();
            seed_fact(
                &db,
                "d1",
                "dsh",
                Some("deepseek-v4-flash"),
                "turn",
                ts,
                0,
                1_000_000,
                0,
                0,
                100_000,
            );
            seed_fact(
                &db,
                "x1",
                "codex",
                Some("gpt-5.6-sol"),
                "token_count",
                ts,
                0,
                800_000,
                200_000,
                50_000,
                80_000,
            );
            seed_fact(
                &db,
                "c1",
                "claude-code",
                Some("claude-opus-5"),
                "message",
                ts,
                0,
                1_000_000,
                0,
                0,
                100_000,
            );
            drop(db);
            let summary =
                SqlSummaryRepository::new().monthly_summary(&MonthlySummaryQuery { month });
            assert!(
                summary.contract_violations().is_empty(),
                "{:?}",
                summary.contract_violations()
            );
            assert!(
                summary.by_provider.contains_key("dsh/deepseek-official"),
                "{:?}",
                summary.by_provider.keys()
            );
            assert!(summary.by_provider.contains_key("codex/openai")
                || summary.by_provider.contains_key("codex/<unknown>"),
                "Codex facts without provider evidence must remain unresolved: {:?}",
                summary.by_provider.keys());
            // DSH 条目与宿主条目同额同档（同一 provider 镜像）。
            let dsh_host = &summary.by_host["dsh"];
            let dsh_prov = &summary.by_provider["dsh/deepseek-official"];
            assert_eq!(dsh_host.amounts_by_basis, dsh_prov.amounts_by_basis);
            // excluded 宿主不得出现在 by_provider（键的宿主部分）。
            assert!(summary
                .by_provider
                .keys()
                .all(|k| k.split('/').next() != Some("workbuddy")));
            // by_provider 的条目不回灌 total_summable（总额仍只按 by_host 算，
            // 否则同一笔钱进两次——month.json 三倍计数事故的结构镜像）。
            let via_host = summary.total_summable();
            let host_only_sum: f64 = summary
                .by_host
                .values()
                .map(|h| {
                    h.amounts_by_basis
                        .iter()
                        .filter(|(b, _)| b.summable_into_total())
                        .map(|(_, v)| v)
                        .sum::<f64>()
                })
                .sum();
            assert_eq!(via_host, host_only_sum);
        });
    }

    /// 干净安装回归：公共目录只提供原厂价卡，不能自动注入任何用户月费；
    /// 有价卡的未确认用量仍须按量估算并标记待确认。
    #[test]
    fn public_catalog_never_injects_user_subscription_fees() {
        with_home(|| {
            let month = crate::clock::current_month_beijing();
            let db = seed_authority_db();
            seed_fact(
                &db,
                "c1",
                "claude-code",
                Some("claude-opus-5"),
                "message",
                current_month_noon_ms(),
                0,
                1_000_000,
                0,
                0,
                100_000,
            );
            drop(db);
            let summary =
                SqlSummaryRepository::new().monthly_summary(&MonthlySummaryQuery { month });
            assert!(
                summary.contract_violations().is_empty(),
                "{:?}",
                summary.contract_violations()
            );
            let anthropic = &summary.by_provider["claude-code/anthropic"];
            assert!(anthropic
                .amounts_by_basis
                .contains_key(&BillingBasis::MeteredEstimate));
            assert!(anthropic.has_unresolved);
            assert!(!anthropic.amounts_by_basis.contains_key(&BillingBasis::FixedSubscription));
            assert!(!summary.by_provider.contains_key("claude-code/zhipu-glm"),
                    "公共目录不得给新安装补建个人GLM月费");
            // 账期过滤：2020-01 早于一切 period_start → 无任何订阅条目被补建。
            let old = SqlSummaryRepository::new().monthly_summary(&MonthlySummaryQuery {
                month: "2020-01".to_string(),
            });
            assert!(!old.by_provider.contains_key("claude-code/anthropic"));
            assert!(!old.by_provider.contains_key("claude-code/zhipu-glm"));
            // FixedSubscription 可汇总：月度总额现在含订阅费（spec §4「固定
            // 订阅可以按口径汇总」——总额首次等于真实月支出）。
            assert!(BillingBasis::FixedSubscription.summable_into_total());
            let summable = old.total_summable();
            assert_eq!(summable, 0.0, "2020-01 无任何数据，总额不含月费");
        });
    }

    /// 日粒度**不摊**订阅费（月费不是日发生额）。干净安装的 Anthropic
    /// 用量按量估算、待确认，且没有 FixedSubscription。
    #[test]
    fn subscription_fees_never_leak_into_daily() {
        with_home(|| {
            let day = "2026-09-02";
            let ts = agent_vitals_data::authority_query::beijing_day_bounds_ms(day)
                .unwrap()
                .0
                + 12 * 3_600_000;
            let db = seed_authority_db();
            seed_fact(
                &db,
                "c1",
                "claude-code",
                Some("claude-opus-5"),
                "message",
                ts,
                0,
                1_000_000,
                0,
                0,
                100_000,
            );
            drop(db);
            let daily = SqlSummaryRepository::new().daily_summary(&DailySummaryQuery {
                date: day.to_string(),
            });
            assert!(
                daily.contract_violations().is_empty(),
                "{:?}",
                daily.contract_violations()
            );
            let anthropic = &daily.by_provider["claude-code/anthropic"];
            assert!(anthropic
                .amounts_by_basis
                .contains_key(&BillingBasis::MeteredEstimate));
            assert!(anthropic.has_unresolved);
            assert!(
                !anthropic
                    .amounts_by_basis
                    .contains_key(&BillingBasis::FixedSubscription),
                "订阅月费不得摊进日账: {:?}",
                anthropic.amounts_by_basis
            );
        });
    }

    /// 审查 #2 的端到端回归——`dsh_tokens` 对**单日对象**（daily_summary 传
    /// `day_value`）不得再返回恒零：此前按 {date: day} map 的窗口过滤对字段
    /// 名键永假，「今日 tokens」的 DSH 贡献静默归零（假零）。by_model-only
    /// 变形日（跨零点切片）也要经 by_model 回退计入。
    #[test]
    fn dsh_tokens_daily_path_is_not_structurally_zero() {
        let day = json!({
            "by_model": {"deepseek-v4-flash": {
                "uncached_input_tokens": 1_000_000, "output_tokens": 100_000,
                "cache_read_tokens": 250_000, "cache_write_tokens": 0,
                "peak_uncached_input_tokens": 0, "peak_output_tokens": 0,
                "peak_cache_read_tokens": 0, "peak_cache_write_tokens": 0,
            }},
            "cache_read_tokens": 0, "cache_write_tokens": 0,
            "output_tokens": 0, "uncached_input_tokens": 0,
        });
        // 日度路径：单日对象直接进（无窗口过滤语义）。
        let tk = dsh_day_tokens(&day);
        assert_eq!(tk.total, 1_350_000, "by_model-only 变形日不得计零");
        // 月度路径：{date: day} map，变形日在窗口内。
        let days = json!({ "2026-09-05": day });
        let month_tk = dsh_tokens(Some(&days), "2026-09");
        assert_eq!(month_tk.total, 1_350_000);
    }

    /// 上一条测的是私有函数；这条钉住**实际调用点**
    /// （`SqlSummaryRepository::daily_summary`）——`CODE_REVIEW_V0_9_STAGE_
    /// A_D_KPI_BILLING.md` 头部 bug #2 的完整回归：`dsh_day_tokens` 造出来
    /// 之后没有一条测试真的走 `daily_summary` 这条公开路径去断言 DSH 的
    /// `tokens_by_host` 非零，调用点因此漏改，恒零一直没被抓到。
    #[test]
    fn daily_summary_reports_nonzero_dsh_tokens_for_a_real_day() {
        with_home(|| {
            let day = crate::clock::today_beijing();
            let ts = agent_vitals_data::authority_query::beijing_day_bounds_ms(&day)
                .unwrap()
                .0
                + 3_600_000;
            let db = seed_authority_db();
            seed_fact(
                &db,
                "d1",
                "dsh",
                Some("deepseek-v4-flash"),
                "turn",
                ts,
                0,
                1_000_000,
                250_000,
                0,
                100_000,
            );
            drop(db);
            let daily = SqlSummaryRepository::new().daily_summary(&DailySummaryQuery { date: day });
            let dsh_tk = &daily.tokens_by_host["dsh"];
            assert_eq!(dsh_tk.total, 1_350_000, "DSH 今日 token 不得假零");
            assert_eq!(dsh_tk.uncached_input, 1_000_000);
        });
    }

    /// 0.6b 落地的回归——DSH 的 `compute_month` 对"本月有 day 但 token 全
    /// 0"返回 `Some({total: 0,})`。修之前直接进 MeteredActual=0 + Stale
    /// 分支，前端渲染成「实测 0.00 + 过期 YYYY-MM-DD」——数字看着像"测到
    /// 零"、实则是"本月没真实 token 入账"，违反 spec §0.1。修：total=0
    /// 时不入 MeteredActual、保留 freshness；前端自然走到「无可计金额 +
    /// 过期 · 最后观测 YYYY-MM-DD」。
    #[test]
    fn dsh_zero_token_day_does_not_render_as_metered_actual_zero() {
        with_home(|| {
            let month = crate::clock::current_month_beijing();
            // 有 day（观测到）但四桶全 0（MeasuredZero，不是 Unavailable）。
            let db = seed_authority_db();
            seed_fact(
                &db,
                "d0",
                "dsh",
                Some("deepseek-v4-flash"),
                "turn",
                current_month_noon_ms(),
                0,
                0,
                0,
                0,
                0,
            );
            drop(db);
            let summary =
                SqlSummaryRepository::new().monthly_summary(&MonthlySummaryQuery { month });
            let dsh = &summary.by_host["dsh"];
            // total=0 → 不入 MeteredActual（金额表留空）+ freshness 照报（day
            // 存在 = 测到日，不是 Unavailable）。
            assert!(
                dsh.amounts_by_basis.is_empty(),
                "got {:?}",
                dsh.amounts_by_basis
            );
            assert!(!dsh.has_unresolved);
            assert!(dsh.freshness.last_observed_at.is_some());
            assert_ne!(dsh.freshness.state, FreshnessState::Unavailable);
        });
    }

    /// 接线结构（真机）：三宿主全进 `by_host`、不进 `excluded_hosts`；汇总
    /// 新鲜度 = 最新被观测到的宿主（不是硬编码 dsh）；非 summable 的金额
    /// （codex/claude 的 MeteredEstimate）
    /// 不得混进 `total_summable`——可汇总总额必须恰好等于各宿主 summable
    /// 档之和，估算与诊断价再大也不出现。
    #[test]
    fn monthly_summary_wires_all_hosts_without_leaking_into_total() {
        with_home(|| {
            let month = crate::clock::current_month_beijing();
            let ts = current_month_noon_ms();
            let db = seed_authority_db();
            // 三宿主各一笔：dsh 出 MeteredActual（summable），codex 出
            // MeteredEstimate（非 summable），claude 同样为 MeteredEstimate。
            seed_fact(
                &db,
                "d1",
                "dsh",
                Some("deepseek-v4-flash"),
                "turn",
                ts,
                0,
                1_000_000,
                0,
                0,
                100_000,
            );
            seed_fact(
                &db,
                "x1",
                "codex",
                Some("gpt-5.6-sol"),
                "token_count",
                ts,
                0,
                800_000,
                200_000,
                50_000,
                80_000,
            );
            seed_fact(
                &db,
                "c1",
                "claude-code",
                Some("deepseek-v4-flash"),
                "message",
                ts,
                0,
                1_000_000,
                0,
                0,
                100_000,
            );
            drop(db);
            let summary =
                SqlSummaryRepository::new().monthly_summary(&MonthlySummaryQuery { month });
            assert!(
                summary.contract_violations().is_empty(),
                "{:?}",
                summary.contract_violations()
            );
            assert!(summary.by_host.contains_key("codex"));
            assert!(summary.by_host.contains_key("dsh"));
            assert!(summary.by_host.contains_key("claude-code"));
            assert!(summary.by_host.contains_key("workbuddy"));
            assert!(!summary.excluded_hosts.contains("codex"));
            assert!(!summary.excluded_hosts.contains("claude-code"));
            // E4b：四宿主全接线，excluded 是空集。
            assert_eq!(summary.excluded_hosts, BTreeSet::new());
            // 汇总新鲜度 = 宿主里最新的 last_observed_at（字典序=时间序，两处
            // 格式统一 `YYYY-MM-DDT00:00:00Z`）。
            let max_host = summary
                .by_host
                .values()
                .filter_map(|h| h.freshness.last_observed_at.clone())
                .max();
            assert_eq!(summary.freshness.last_observed_at, max_host);
            // spec §4 汇总纪律：总额只收 summable 三档（estimate/诊断价不入）。
            let host_summable = summary
                .by_host
                .values()
                .map(|h| {
                    h.amounts_by_basis
                        .iter()
                        .filter(|(b, _)| b.summable_into_total())
                        .map(|(_, v)| v)
                        .sum::<f64>()
                })
                .sum::<f64>();
            assert_eq!(summary.total_summable(), host_summable);
        });
    }

    #[test]
    fn month_with_data_sums_as_metered_actual() {
        with_home(|| {
            let month = crate::clock::current_month_beijing();
            let day = crate::clock::today_beijing();
            let ts = agent_vitals_data::authority_query::beijing_day_bounds_ms(&day)
                .unwrap()
                .0
                + 3_600_000;
            let db = seed_authority_db();
            seed_fact(
                &db,
                "d1",
                "dsh",
                Some("deepseek-v4-flash"),
                "turn",
                ts,
                0,
                1_000_000,
                0,
                0,
                100_000,
            );
            drop(db);
            let summary =
                SqlSummaryRepository::new().monthly_summary(&MonthlySummaryQuery { month });
            assert!(
                summary.contract_violations().is_empty(),
                "{:?}",
                summary.contract_violations()
            );
            let dsh = &summary.by_host["dsh"];
            assert_eq!(dsh.freshness.state, FreshnessState::Fresh);
            assert!(dsh
                .amounts_by_basis
                .contains_key(&BillingBasis::MeteredActual));
            assert!(summary.total_summable() > 0.0);
        });
    }

    // ── SqlSummaryRepository（Phase 3.1）────────────────────────────────

    /// 每次都在一个**保证干净**的库上开始——`with_home` 的目录清理是尽力而为
    /// （`let _ = remove_dir_all`，失败不追责），残留的 `agent-vitals.sqlite3`
    /// 会让下一个测试的 `fact_id`（PRIMARY KEY，全表唯一，不分宿主）撞车；
    /// 显式先删库文件（含 WAL/SHM 旁路文件）比依赖目录级清理更可靠。
    fn seed_authority_db() -> agent_vitals_data::authority::AuthorityDb {
        let data_home = crate::home::data_home();
        let path = agent_vitals_data::authority::default_authority_path(&data_home);
        for suffix in ["", "-wal", "-shm"] {
            let _ = std::fs::remove_file(format!("{}{suffix}", path.display()));
        }
        agent_vitals_data::authority::AuthorityDb::open(&path, 1).unwrap()
    }

    /// 四张宿主词表必须同表（加宿主一处漏改就是「事实进得来、汇总看不见」）。
    #[test]
    fn wired_hosts_match_fact_hosts() {
        let mut wired: Vec<&str> = WIRED_HOSTS.to_vec();
        wired.sort_unstable();
        let mut facts: Vec<&str> = crate::ingest_service::FACT_HOSTS.to_vec();
        facts.sort_unstable();
        assert_eq!(wired, facts);
        for (host, _) in HOST_PROVIDER_MAP {
            assert!(WIRED_HOSTS.contains(host), "{host} in HOST_PROVIDER_MAP but not wired");
        }
    }

    /// E4b（spec WORKBUDDY_ONBOARDING §9E.5）：WorkBuddy 进 `by_host`/`tokens_by_host`
    /// 但**只有 token、没有金额**——事实 `provider_id: null`（三轨请求级不可判，
    /// §2.1），`amounts_by_basis` 必空、`has_unresolved` 必真、不进 `by_provider`；
    /// 四桶原样出现在 `tokens_by_host`（真桶非零，不再是 §7.2 的「恒 0 冒充」）。
    /// 月/日两个窗口同一契约，`contract_violations` 为空。
    #[test]
    fn workbuddy_row_carries_tokens_but_never_money() {
        with_home(|| {
            let day = crate::clock::today_beijing();
            let month = crate::clock::current_month_beijing();
            let ts = agent_vitals_data::authority_query::beijing_day_bounds_ms(&day)
                .unwrap()
                .0
                + 3_600_000;
            let db = seed_authority_db();
            // 与 fixtures/workbuddy traces 的 s1 两条 generation 同数：
            // (12000-8000, 8000, 0, 300) + (15000-11000, 11000, 0, 450)。
            seed_fact(&db, "wb1", "workbuddy", Some("custom-local:MiniMax-M3"), "assistant-usage",
                ts, 0, 4_000, 8_000, 0, 300);
            seed_fact(&db, "wb2", "workbuddy", Some("hy3"), "assistant-usage",
                ts + 60_000, 0, 4_000, 11_000, 0, 450);
            drop(db);
            let repo = SqlSummaryRepository::new();
            let monthly = repo.monthly_summary(&MonthlySummaryQuery { month });
            let daily = repo.daily_summary(&DailySummaryQuery { date: day });
            assert!(monthly.contract_violations().is_empty(), "{:?}", monthly.contract_violations());
            assert!(daily.contract_violations().is_empty(), "{:?}", daily.contract_violations());
            for (label, wb, tk, by_provider) in [
                ("monthly", &monthly.by_host["workbuddy"], &monthly.tokens_by_host["workbuddy"],
                 &monthly.by_provider),
                ("daily", &daily.by_host["workbuddy"], &daily.tokens_by_host["workbuddy"],
                 &daily.by_provider),
            ] {
                assert!(wb.amounts_by_basis.is_empty(), "{label}: 金额面必须为空");
                assert!(wb.has_unresolved, "{label}");
                assert_eq!(wb.unresolved_reason.as_deref(), Some("billing-route-unknown"), "{label}");
                assert_eq!(wb.freshness.state, FreshnessState::Fresh, "{label}");
                assert_eq!(tk.uncached_input, 8_000, "{label}");
                assert_eq!(tk.cache_read, 19_000, "{label}");
                assert_eq!(tk.cache_write, 0, "{label}");
                assert_eq!(tk.output, 750, "{label}");
                assert_eq!(tk.total, 27_750, "{label}");
                assert!(
                    !by_provider.keys().any(|k| k.starts_with("workbuddy/")),
                    "{label}: provider null 的事实没有 host/provider 键可挂"
                );
            }
            // 没有事实的宿主照旧 Unavailable + 零 token（不是 workbuddy 抢了别人的桶）。
            assert_eq!(monthly.by_host["dsh"].freshness.state, FreshnessState::Unavailable);
            assert_eq!(monthly.tokens_by_host["dsh"].total, 0);
            // total_summable 不受影响（没有钱进来）。
            assert_eq!(monthly.total_summable(), 0.0);
        });
    }

    #[allow(clippy::too_many_arguments)]
    fn seed_fact(
        db: &agent_vitals_data::authority::AuthorityDb,
        fact_id: &str,
        host: &str,
        model_id: Option<&str>,
        observation_kind: &str,
        event_ts_ms: i64,
        event_peak: i64,
        u: i64,
        cr: i64,
        cw: i64,
        o: i64,
    ) {
        db.conn()
            .execute(
                "INSERT INTO sync_runs(run_id, started_at_ms, trigger, status, schema_version)
                 VALUES ('run', 1, 'cli', 'succeeded', 1) ON CONFLICT(run_id) DO NOTHING",
                [],
            )
            .unwrap();
        db.conn()
            .execute(
                "INSERT INTO usage_facts(fact_id, host, machine_namespace, native_session_id,
                     source_event_id, observation_kind, provider_id, model_id, event_ts_ms,
                     event_peak, uncached_input_tokens, cache_read_tokens, cache_write_tokens,
                     output_tokens, ingested_run_id, created_at_ms, updated_at_ms)
                 VALUES (?1, ?2, 'm', 'sess', ?1, ?3, NULL, ?4, ?5, ?6, ?7, ?8, ?9, ?10, 'run', 1, 1)",
                rusqlite::params![
                    fact_id, host, observation_kind, model_id, event_ts_ms, event_peak, u, cr, cw, o
                ],
            )
            .unwrap();
    }

    #[allow(clippy::too_many_arguments)]
    fn seed_provider_fact(
        db: &agent_vitals_data::authority::AuthorityDb,
        fact_id: &str,
        host: &str,
        provider_id: &str,
        model_id: &str,
        event_ts_ms: i64,
        u: i64,
        cr: i64,
        cw: i64,
        o: i64,
    ) {
        db.conn()
            .execute(
                "INSERT INTO sync_runs(run_id, started_at_ms, trigger, status, schema_version)
                 VALUES ('provider-run', 1, 'cli', 'succeeded', 1)
                 ON CONFLICT(run_id) DO NOTHING",
                [],
            )
            .unwrap();
        db.conn()
            .execute(
                "INSERT INTO usage_facts(
                     fact_id, host, machine_namespace, native_session_id,
                     source_event_id, observation_kind, provider_id, model_id, event_ts_ms,
                     event_peak, uncached_input_tokens, cache_read_tokens, cache_write_tokens,
                     output_tokens, ingested_run_id, created_at_ms, updated_at_ms)
                 VALUES (?1, ?2, 'm', 'provider-session', ?1, 'token_count', ?3, ?4,
                         ?5, ?5, ?6, ?7, ?8, ?9, 'provider-run', 1, 1)",
                rusqlite::params![fact_id, host, provider_id, model_id, event_ts_ms, u, cr, cw, o],
            )
            .unwrap();
    }

    #[test]
    fn custom_codex_summary_keeps_fair_market_estimate_out_of_total() {
        with_home(|| {
            let month = crate::clock::current_month_beijing();
            let db = seed_authority_db();
            seed_provider_fact(
                &db,
                "custom-codex-1",
                "codex",
                "cogfoundry.ai",
                "gpt-5.6-sol",
                current_month_noon_ms(),
                1_000_000,
                0,
                0,
                100_000,
            );
            drop(db);

            let summary =
                SqlSummaryRepository::new().monthly_summary(&MonthlySummaryQuery { month });
            let custom = summary
                .by_provider
                .get("codex/cogfoundry.ai")
                .expect("custom provider must remain visible in the read model");
            let estimate = custom
                .amounts_by_basis
                .get(&BillingBasis::MeteredEstimate)
                .copied()
                .unwrap_or(0.0);
            assert!(estimate > 0.0, "custom route estimate was dropped: {custom:?}");
            assert!(custom.has_unresolved);
            assert_eq!(custom.pricing_method.as_deref(), Some("fair-market-fallback"));
            assert_ne!(custom.evidence_basis.as_deref(), Some("session-native"));
            assert!(!custom
                .amounts_by_basis
                .contains_key(&BillingBasis::ApiEquivalent));
            assert_eq!(summary.total_summable(), 0.0);
        });
    }

    #[test]
    fn custom_codex_mixed_provider_rows_stay_separate() {
        with_home(|| {
            let month = crate::clock::current_month_beijing();
            let db = seed_authority_db();
            let ts = current_month_noon_ms();
            seed_provider_fact(
                &db,
                "custom-codex-mixed",
                "codex",
                "cogfoundry.ai",
                "gpt-5.6-sol",
                ts,
                500_000,
                100_000,
                0,
                50_000,
            );
            seed_provider_fact(
                &db,
                "openai-codex-mixed",
                "codex",
                "openai",
                "gpt-5.6-sol",
                ts,
                500_000,
                100_000,
                0,
                50_000,
            );
            drop(db);

            let summary =
                SqlSummaryRepository::new().monthly_summary(&MonthlySummaryQuery { month });
            let custom = summary.by_provider.get("codex/cogfoundry.ai").unwrap();
            let openai = summary.by_provider.get("codex/openai").unwrap();
            assert!(custom.has_unresolved);
            assert!(custom
                .amounts_by_basis
                .contains_key(&BillingBasis::MeteredEstimate));
            assert!(openai
                .amounts_by_basis
                .contains_key(&BillingBasis::MeteredEstimate));
            assert!(openai.has_unresolved);
            assert!(!custom
                .amounts_by_basis
                .contains_key(&BillingBasis::ApiEquivalent));
        });
    }

    #[test]
    fn custom_codex_without_model_card_remains_visible_as_unpriced() {
        with_home(|| {
            let month = crate::clock::current_month_beijing();
            let db = seed_authority_db();
            seed_provider_fact(
                &db,
                "custom-codex-no-card",
                "codex",
                "cogfoundry.ai",
                "gpt-unknown-no-card",
                current_month_noon_ms(),
                1_000_000,
                0,
                0,
                10_000,
            );
            drop(db);

            let summary =
                SqlSummaryRepository::new().monthly_summary(&MonthlySummaryQuery { month });
            let custom = summary.by_provider.get("codex/cogfoundry.ai").unwrap();
            assert!(custom.amounts_by_basis.is_empty());
            assert!(custom.has_unresolved);
            assert_eq!(
                custom.unresolved_reason.as_deref(),
                Some("provider-specific-card-unavailable")
            );
        });
    }

    #[test]
    fn codex_quota_snapshot_reads_authority_without_a_rollout_fallback() {
        with_home(|| {
            let db = seed_authority_db();
            db.conn()
                .execute(
                    "INSERT INTO sync_runs(run_id, started_at_ms, trigger, status, schema_version)
                     VALUES ('quota-run', 1, 'cli', 'succeeded', 2)",
                    [],
                )
                .unwrap();
            db.conn()
                .execute(
                    "INSERT INTO host_runtime_snapshots(
                         host, snapshot_kind, payload_json, observed_at_ms,
                         ingested_run_id, updated_at_ms)
                     VALUES ('codex', 'codex_quota', ?1, 2, 'quota-run', 2)",
                    rusqlite::params![
                        r#"{"plan_type":"plus","has_credits":false,"observed_at":"2026-09-13T00:00:00Z"}"#
                    ],
                )
                .unwrap();
            drop(db);
            let snapshot = codex_quota_snapshot(std::path::Path::new("/missing-rollouts"))
                .expect("SQL snapshot must be readable without raw rollout files");
            assert_eq!(snapshot["plan_type"], "plus");
            assert_eq!(snapshot["has_credits"], false);
        });
    }

    /// Phase 2.8：`data host-bill set` 录入的行进 `by_provider` 的 basis 桶。
    /// 找不到条目就新建（WorkBuddy 从不产 usage_fact），有就叠加；跨币不相加。
    #[test]
    fn apply_host_bills_folds_user_entered_rows_into_by_provider() {
        with_home(|| {
            let db = seed_authority_db();
            db.host_bill_put(
                "wb:wb:2026-09:host_billed:",
                "workbuddy",
                "workbuddy",
                "2026-09",
                "host_billed",
                21_500,
                "CNY",
                "credit_json",
                1,
            )
            .unwrap();
            // 另一档进已存在的 provider 条目（叠加，不覆盖）。
            db.host_bill_put(
                "wb:wb:2026-09:fixed_subscription:",
                "workbuddy",
                "workbuddy",
                "2026-09",
                "fixed_subscription",
                5_000,
                "CNY",
                "",
                1,
            )
            .unwrap();

            let mut by_provider: BTreeMap<String, HostAmount> = BTreeMap::new();
            apply_host_bills(&mut by_provider, &db, "2026-09");

            let e = by_provider.get("workbuddy/workbuddy").expect("新建条目");
            assert_eq!(e.currency.as_deref(), Some("CNY"));
            assert!(!e.has_unresolved);
            assert_eq!(
                e.amounts_by_basis
                    .get(&agent_vitals_domain::data_contract::BillingBasis::HostBilled),
                Some(&215.0)
            );
            assert_eq!(
                e.amounts_by_basis
                    .get(&agent_vitals_domain::data_contract::BillingBasis::FixedSubscription),
                Some(&50.0)
            );

            // 别的月份不串。
            let mut other: BTreeMap<String, HostAmount> = BTreeMap::new();
            apply_host_bills(&mut other, &db, "2026-08");
            assert!(other.is_empty());
        });
    }

    #[test]
    fn apply_host_bills_never_labels_mixed_cny_usd_as_single_currency() {
        with_home(|| {
            let db = seed_authority_db();
            db.host_bill_put(
                "mixed:2026-09:host_billed",
                "workbuddy",
                "gateway",
                "2026-09",
                "host_billed",
                21_500,
                "CNY",
                "credit_json",
                1,
            )
            .unwrap();
            db.host_bill_put(
                "mixed:2026-09:fixed_subscription",
                "workbuddy",
                "gateway",
                "2026-09",
                "fixed_subscription",
                2_000,
                "USD",
                "invoice",
                1,
            )
            .unwrap();
            // A later CNY row must not re-claim CNY after the conflict.
            db.host_bill_put(
                "mixed:2026-09:api_equivalent",
                "workbuddy",
                "gateway",
                "2026-09",
                "api_equivalent",
                5_000,
                "CNY",
                "estimate",
                1,
            )
            .unwrap();

            let mut by_provider = BTreeMap::new();
            apply_host_bills(&mut by_provider, &db, "2026-09");

            let e = by_provider.get("workbuddy/gateway").expect("provider entry");
            assert_eq!(e.currency, None);
            assert!(e.has_unresolved);
            assert!(e.amounts_by_basis.is_empty(), "mixed money must not be summed");
        });
    }

    /// 2026-09-07 审查收口（模型级合并）：同日「A 有实时行 + B 只有 legacy
    /// 聚合」时，整日替换会把 B 无标记丢掉——按 (日, 模型) 选源（实时赢、
    /// 异模型互补）才是既不双计也不漏的结构。
    #[test]
    fn merged_claude_days_keeps_legacy_models_missing_from_realtime() {
        with_home(|| {
            let db = seed_authority_db();
            let (start, end) =
                agent_vitals_data::authority_query::beijing_day_bounds_ms("2026-08-11").unwrap();
            // legacy 聚合：A=100、B=200（event_peak=0 的 base 行）。
            seed_fact(
                &db,
                "lg-a",
                "claude-code",
                Some("model-a"),
                "legacy_aggregate",
                start + 1_000,
                0,
                100,
                0,
                0,
                0,
            );
            seed_fact(
                &db,
                "lg-b",
                "claude-code",
                Some("model-b"),
                "legacy_aggregate",
                start + 2_000,
                0,
                200,
                0,
                0,
                0,
            );
            // 实时行只覆盖 A（B 的会话文件已轮转的场景）。
            seed_fact(
                &db,
                "rt-a",
                "claude-code",
                Some("model-a"),
                "assistant-usage",
                start + 3_000,
                0,
                50,
                0,
                0,
                0,
            );
            let merged = merged_claude_days(db.conn(), start, end);
            drop(db);
            let day = &merged["2026-08-11"];
            assert_eq!(
                day["model-a"]["input_tokens"],
                json!(50),
                "同模型实时行赢，不与 legacy 相加"
            );
            assert_eq!(
                day["model-b"]["input_tokens"],
                json!(200),
                "实时缺席的模型保留 legacy 聚合，不随整日被丢弃"
            );
        });
    }

    /// 2026-09-07 审查收口（标记消费方）：legacy 兜底月份的 claude 条目
    /// freshness 必须降为 Partial——降级标记此前只写不读，spec §6.2.3
    /// 「查询方据此降级」没有消费方，聚合兜底的月份照常渲染 Fresh。
    #[test]
    fn legacy_backed_month_degrades_claude_freshness_to_partial() {
        with_home(|| {
            let month = crate::clock::current_month_beijing();
            let day = crate::clock::today_beijing();
            let db = seed_authority_db();
            let (start, _) =
                agent_vitals_data::authority_query::beijing_day_bounds_ms(&day).unwrap();
            seed_fact(
                &db,
                "rt-a",
                "claude-code",
                Some("claude-opus-5"),
                "assistant-usage",
                start + 1_000,
                0,
                10,
                0,
                0,
                1,
            );
            db.conn()
                .execute(
                    "INSERT INTO data_quality_issues(issue_id, scope_type, scope_key, code,
                         severity, first_seen_at_ms, last_seen_at_ms, detail_json)
                     VALUES ('legacy_aggregate:x', 'month', ?1, 'legacy_aggregate',
                             'info', 1, 1, '{}')",
                    rusqlite::params![month],
                )
                .unwrap();
            drop(db);
            let repo = SqlSummaryRepository::new();
            let summary = repo.monthly_summary(&MonthlySummaryQuery {
                month: month.clone(),
            });
            let claude = &summary.by_host["claude-code"];
            assert_eq!(
                claude.freshness.state,
                FreshnessState::Partial,
                "被 legacy 标记覆盖的月份 claude 侧不得渲染 Fresh"
            );
            assert!(
                claude.freshness.last_observed_at.is_some(),
                "Partial 保留 last_observed_at（观测过，只是部分是聚合兜底）"
            );
            // 其他宿主不受 claude 的标记影响。
            assert_eq!(
                summary.by_host["codex"].freshness.state,
                FreshnessState::Unavailable
            );
        });
    }

    #[test]
    fn sql_repository_reports_unavailable_with_no_facts() {
        with_home(|| {
            let repo = SqlSummaryRepository::new();
            let summary = repo.monthly_summary(&MonthlySummaryQuery {
                month: "2020-01".to_string(),
            });
            assert!(
                summary.contract_violations().is_empty(),
                "{:?}",
                summary.contract_violations()
            );
            for host in WIRED_HOSTS {
                assert_eq!(
                    summary.by_host[*host].freshness.state,
                    FreshnessState::Unavailable,
                    "host={host}"
                );
                assert!(
                    summary.by_host[*host].amounts_by_basis.is_empty(),
                    "host={host}"
                );
            }
            assert!(!summary.excluded_hosts.contains("dsh"));
            // E4b：workbuddy 不再 excluded——它有 token 数据面（金额仍 unresolved）。
            assert!(!summary.excluded_hosts.contains("workbuddy"));
            assert!(summary.excluded_hosts.is_empty());
            assert_eq!(summary.coverage.measured_fields, 4);

            let daily = repo.daily_summary(&DailySummaryQuery {
                date: "2020-01-01".to_string(),
            });
            assert!(
                daily.contract_violations().is_empty(),
                "{:?}",
                daily.contract_violations()
            );
            assert_eq!(
                daily.by_host["dsh"].freshness.state,
                FreshnessState::Unavailable
            );
        });
    }

    #[test]
    fn sql_repository_rejects_a_malformed_window_without_a_guess() {
        with_home(|| {
            let repo = SqlSummaryRepository::new();
            // 格式非法（不是 YYYY-MM/YYYY-MM-DD）不能编数字——`beijing_month_
            // bounds_ms`/`beijing_day_bounds_ms` 返回 None，退化路径与"这个
            // 窗口没有任何事实"完全一样：诚实的 Unavailable，不是 panic。
            let summary = repo.monthly_summary(&MonthlySummaryQuery {
                month: "2026-9".to_string(),
            });
            assert_eq!(
                summary.by_host["dsh"].freshness.state,
                FreshnessState::Unavailable
            );
            let daily = repo.daily_summary(&DailySummaryQuery {
                date: "not-a-date".to_string(),
            });
            assert_eq!(
                daily.by_host["dsh"].freshness.state,
                FreshnessState::Unavailable
            );
        });
    }

    /// codex 侧：真实事实只带 `model_raw`、无 speed 维度——`codex_by_hour_
    /// model` 恒填 "standard"（真机也从未观测到别的值，见模块头 `_note`）。
    /// 缺少用户计费声明时按量估算并保持 unresolved。
    #[test]
    fn sql_repository_codex_day_reports_unconfirmed_metered_estimate() {
        with_home(|| {
            let day = crate::clock::today_beijing();
            let (start_ms, _) =
                agent_vitals_data::authority_query::beijing_day_bounds_ms(&day).unwrap();
            let db = seed_authority_db();
            seed_fact(
                &db,
                "f1",
                "codex",
                Some("gpt-5.6-sol"),
                "token_count",
                start_ms + 3_600_000,
                0,
                800_000,
                200_000,
                50_000,
                80_000,
            );
            drop(db);

            let sql_daily =
                SqlSummaryRepository::new().daily_summary(&DailySummaryQuery { date: day });
            assert!(
                sql_daily.contract_violations().is_empty(),
                "{:?}",
                sql_daily.contract_violations()
            );
            let codex = &sql_daily.by_host["codex"];
            assert!(codex.has_unresolved, "missing provider evidence must not be priced as OpenAI: {codex:?}");
            assert!(sql_daily.tokens_by_host["codex"].total > 0);
        });
    }

    // ─────────── v0.9.1 Q13：价格历史重放（spec §5.3） ───────────

    /// 库里没有任何快照（或时点为 None）→ [`PricingCards::asof`] 退回当前嵌
    /// 入卡，逐字节相同。这是「二进制-only 安装从没 sync 过」和「查询早于第
    /// 一次 sync」的常态，绝不能因为拿不到快照就报错或算零。
    #[test]
    fn pricing_cards_asof_falls_back_to_current_when_no_snapshot() {
        with_home(|| {
            let cur = PricingCards::current();
            assert_eq!(PricingCards::asof(&None, Some(1)).main, cur.main);
            assert_eq!(PricingCards::asof(&None, None).main, cur.main);

            let db = seed_authority_db();
            // 快照表为空 → asof 任何时点都退当前卡。
            let got = PricingCards::asof(&Some(db), Some(crate::sql_sync::now_ms()));
            assert_eq!(got.main, cur.main);
            assert_eq!(got.codex, cur.codex);
        });
    }

    /// 调价后查历史月：`monthly_summary` 必须用**当时的**价卡，不拿今天的卡
    /// 重算历史。构造两份快照（早=便宜、近=当前），断言 2 个月前的 DSH 金额
    /// 按便宜卡折算。
    #[test]
    fn monthly_summary_replays_historical_pricing_snapshot() {
        with_home(|| {
            let past = "2026-07"; // 早于当前月（2026-09）
            let (p_start, p_end) =
                agent_vitals_data::authority_query::beijing_month_bounds_ms(past).unwrap();
            let db = seed_authority_db();
            // 1M uncached、全 off-peak（event_peak=0）、deepseek-v4-flash。
            seed_fact(
                &db,
                "j1",
                "dsh",
                Some("deepseek-v4-flash"),
                "turn",
                p_start + 12 * 3_600_000,
                0,
                1_000_000,
                0,
                0,
                0,
            );

            // 早快照：uncached off_peak 砍到 0.5（当前卡是 1.5）。captured 在
            // 7 月开始之前 → asof(7 月末) 命中它。
            let mut cheap = agent_vitals_domain::cost::load_pricing();
            cheap["providers"]["deepseek-official"]["models"]["deepseek-v4-flash"]
                ["input_uncached"]["off_peak"] = json!(0.5);
            let snap_old = json!({
                "pricing": cheap,
                "codex_pricing": crate::sessions::codex_cost::load_codex_pricing(),
            })
            .to_string();
            db.pricing_snapshot_put("v-old", "test", &snap_old, p_start - 1_000)
                .unwrap();
            // 近快照 = 当前卡，captured 在「现在」→ 只对当前/未来月生效。
            let snap_now = json!({
                "pricing": agent_vitals_domain::cost::load_pricing(),
                "codex_pricing": crate::sessions::codex_cost::load_codex_pricing(),
            })
            .to_string();
            db.pricing_snapshot_put("v-now", "test", &snap_now, crate::sql_sync::now_ms())
                .unwrap();
            drop(db);

            let s = SqlSummaryRepository::new().monthly_summary(&MonthlySummaryQuery {
                month: past.to_string(),
            });
            let dsh = &s.by_host["dsh"];
            let metered = dsh
                .amounts_by_basis
                .get(&BillingBasis::MeteredActual)
                .copied()
                .expect("DSH 按量档");
            // 便宜卡：1.0M * 0.5/M ≈ ¥0.5；当前卡会是 ¥1.5。
            assert!(
                (metered - 0.5).abs() < 0.02,
                "历史月按便宜快照计价，得 {metered}（当前卡会是 ~1.5）"
            );
            let _ = p_end;
        });
    }

    /// Q13 的对账不变式：`calendar_month`（按日轴）与 `monthly_summary`
    /// （按宿主轴）对同一个历史月、在价格重放下，DSH 月度金额仍必须相等
    /// （`usage.rs` 的 `token_by_date_model` 纪律——两条轴一份能力）。
    #[test]
    fn calendar_and_monthly_agree_on_dsh_under_pricing_replay() {
        with_home(|| {
            let past = "2026-06";
            let (p_start, _) =
                agent_vitals_data::authority_query::beijing_month_bounds_ms(past).unwrap();
            let db = seed_authority_db();
            seed_fact(
                &db,
                "a",
                "dsh",
                Some("deepseek-v4-flash"),
                "turn",
                p_start + 5 * 86_400_000 + 3_600_000,
                0,
                600_000,
                0,
                0,
                40_000,
            );
            seed_fact(
                &db,
                "b",
                "dsh",
                Some("deepseek-v4-flash"),
                "turn",
                p_start + 18 * 86_400_000 + 3_600_000,
                0,
                400_000,
                0,
                0,
                20_000,
            );
            let mut cheap = agent_vitals_domain::cost::load_pricing();
            cheap["providers"]["deepseek-official"]["models"]["deepseek-v4-flash"]
                ["input_uncached"]["off_peak"] = json!(0.4);
            cheap["providers"]["deepseek-official"]["models"]["deepseek-v4-flash"]["output"]
                ["off_peak"] = json!(1.2);
            let snap = json!({
                "pricing": cheap,
                "codex_pricing": crate::sessions::codex_cost::load_codex_pricing(),
            })
            .to_string();
            db.pricing_snapshot_put("v-old", "test", &snap, p_start - 1_000)
                .unwrap();
            drop(db);

            let monthly = SqlSummaryRepository::new().monthly_summary(&MonthlySummaryQuery {
                month: past.to_string(),
            });
            let monthly_dsh = monthly.by_host["dsh"]
                .amounts_by_basis
                .get(&BillingBasis::MeteredActual)
                .copied()
                .expect("DSH 按量档");

            let cal = calendar_month(past, &codex_home());
            let cal_dsh: f64 = cal["days"]
                .as_object()
                .unwrap()
                .values()
                .map(|d| d["dsh_cost_cny"].as_f64().unwrap_or(0.0))
                .sum();

            assert!(
                (monthly_dsh - cal_dsh).abs() < 0.01,
                "日轴合计 {cal_dsh} 必须 == 宿主轴 {monthly_dsh}（重放下也不例外）"
            );
            // 且确实用了便宜卡：1.0M*0.4 + 60K*1.2 = 0.4 + 0.072 = 0.472。
            assert!(monthly_dsh < 1.0, "便宜快照生效，得 {monthly_dsh}");
        });
    }
}
