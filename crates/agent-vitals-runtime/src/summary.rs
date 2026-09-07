//! v0.9 Stage 0.4：`agent-vitals-data::repository::SummaryRepository` 的
//! Stage 0 实现（`docs/AGENT_VITALS_V0_9_STAGE0_RESEARCH.md` §8）。
//!
//! 只读——不写 state、不建索引、不启动任何后台任务。逐宿主接线、逐提交
//! 落地（§8.4）：DSH（读 `budget.rs` 的 month.json）、Codex（读 ~/.codex
//! rollout 折叠计价）、Claude Code（读 claude-ledger.json 逐日账，core
//! `claude_day_cost` 计价）三个宿主已接线；WorkBuddy 永久留在
//! `excluded_hosts`（用户 2026-09-05 决定，见本文档触发记录）。

use std::collections::{BTreeMap, BTreeSet};
use std::path::Path;

use agent_vitals_data::projection::{
    BillingBasis, CoverageStatus, DailySummary, Freshness, FreshnessState, HostAmount, MonthlySummary,
};
use agent_vitals_data::repository::{DailySummaryQuery, MonthlySummaryQuery, SummaryRepository};
use serde_json::json;

use agent_vitals_domain::cost::BillingMode;
use agent_vitals_domain::data_contract::HostTokens;

use crate::clock::{today_beijing, yesterday_beijing};

/// Stage 0 的宿主接线状态：真正读数据的 vs. 还没接的。三宿主全接完后
/// `NOT_YET_WIRED_HOSTS` 为空——`excluded_hosts` 只剩永久范围外的 WorkBuddy。
const WIRED_HOSTS: &[&str] = &["claude-code", "codex", "dsh"];
const NOT_YET_WIRED_HOSTS: &[&str] = &[];
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
            let total = c.get("total").and_then(serde_json::Value::as_f64).unwrap_or(0.0);
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

/// fold 缓存本体——`codex_merged_cached` 写、`codex_fold_cache_clear` 测试穿透。
/// 缓存条目：`(写入时刻, merged 产物)`。Arc 让缓存命中的锁内 clone 退化为
/// 原子计数（几 MB JSON 的深拷贝会把并发命令串行卡在锁上）。
type CodexFoldCache = std::collections::HashMap<
    std::path::PathBuf,
    (std::time::Instant, std::sync::Arc<serde_json::Value>),
>;
static CODEX_FOLD_CACHE: std::sync::OnceLock<std::sync::Mutex<CodexFoldCache>> =
    std::sync::OnceLock::new();

/// Codex fold 的进程级汇聚点，带 60 秒 memo——工作台一次渲染会并发发起
/// 三个命令（daily/monthly/calendar），各自全量枚举 + fold 60 份 rollout
/// 是可感知卡顿（2026-09-05 用户报告 tab 切换卡死的直接原因：每 tab 三倍
/// fold）。merged 是全量历史（各命令自己按窗口过滤），所以缓存不需要按月
/// 键控；按 home 路径键控（测试各用独立 tmp home，互不污染）。TTL 60s 与
/// quota memo 同一条权衡：rollout 只增不改，60s 复用不构成诚实性问题。
fn codex_merged_cached(home: &Path) -> std::sync::Arc<serde_json::Value> {
    use std::collections::HashMap;
    use std::sync::Arc;
    use std::time::{Duration, Instant};
    let cache = CODEX_FOLD_CACHE.get_or_init(|| std::sync::Mutex::new(HashMap::new()));
    let guard = cache.lock().unwrap_or_else(|e| e.into_inner());
    if let Some((at, v)) = guard.get(home) {
        if at.elapsed() < Duration::from_secs(60) {
            // Arc clone（原子计数）而不是 Value 深拷贝：缓存命中必须锁内
            // 纳秒级——merged 是几 MB 的 JSON，锁内深拷贝会把并发命令串行
            // 卡在锁上，缓存反而成为新瓶颈。
            return v.clone();
        }
    }
    drop(guard);
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
    let merged = Arc::new(agent_vitals_hosts::codex_usage::codex_merge_folds(&folds));
    let mut guard = cache.lock().unwrap_or_else(|e| e.into_inner());
    guard.insert(home.to_path_buf(), (Instant::now(), Arc::clone(&merged)));
    merged
}

/// 测试穿透缓存用（写完新 rollout 后立即查询的场景）。
#[doc(hidden)]
pub fn codex_fold_cache_clear() {
    if let Some(cache) = CODEX_FOLD_CACHE.get() {
        cache.lock().unwrap_or_else(|e| e.into_inner()).clear();
    }
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
/// 同 [`codex_host_amount`]，顺带产出窗口内的 token 计量（L0 感知层分母，
/// Stage D）：fold 已把 `uncached_input_tokens` 从 input−cached 派生好，
/// 四轴归一直读；`reasoning_output_tokens` 并进 output（Codex 5 桶相加 ==
/// 自报 total_tokens，reasoning 是独立桶，四轴语义下生成类归 output）。
fn codex_host_amount_with_tokens(
    home: &Path,
    filter_key: &str,
    day: Option<&str>,
) -> (HostAmount, HostTokens) {
    let merged = codex_merged_cached(home);

    // 过滤小时轴（BTreeMap 序保持升序），核心函数再重算模型轴（下面的
    // defect 注释）。
    let mut filtered = serde_json::Map::new();
    if let Some(bh) = merged["by_hour_model"].as_object() {
        for (h, v) in bh {
            if h.starts_with(filter_key) {
                filtered.insert(h.clone(), v.clone());
            }
        }
    }
    let by_hour_model = serde_json::Value::Object(filtered);
    codex_host_amount_with_tokens_from_hours(
        &by_hour_model,
        &merged["unaccounted"],
        &merged["plan"],
        day,
    )
}

/// [`codex_host_amount_with_tokens`] 的核心：只认 `by_hour_model` 这一份
/// 输入，不关心它是从 codex fold（此函数的调用方）还是从 SQL `usage_facts`
/// 聚合出来的（`SqlSummaryRepository`，`agent_vitals_data::authority_query::
/// codex_by_hour_model`）——两条路径喂同一把计价尺，不长第二份 Codex 计价
/// 规则。`unaccounted`/`plan` 对 SQL 路径不可得（SQL 事实里没有原始 fold
/// 状态），传 `Value::Null` 是安全的：`codex_cost_report` 只把它们原样透传
/// 进输出（`out.insert("unaccounted_usage", …)`/`out.insert("plan", …)`），
/// 从不参与 `total_cost_usd`/`days`/`unpriced_tokens` 的计算，而本函数只读
/// 这三个字段。
fn codex_host_amount_with_tokens_from_hours(
    by_hour_model: &serde_json::Value,
    unaccounted: &serde_json::Value,
    plan: &serde_json::Value,
    day: Option<&str>,
) -> (HostAmount, HostTokens) {
    let codex_no_data = || HostAmount {
        host_id: "codex".to_string(),
        amounts_by_basis: BTreeMap::new(),
        currency: None,
        has_unresolved: false,
        freshness: Freshness::unavailable(),
    };

    let by_model = agent_vitals_hosts::codex_usage::codex_by_model_from_hours(by_hour_model, None);
    let pricing = crate::sessions::codex_cost::load_codex_pricing();
    let Some(report) = crate::sessions::codex_cost::codex_cost_report(
        by_hour_model,
        &by_model,
        unaccounted,
        plan,
        &pricing,
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
                None => {
                    return (
                        codex_no_data(),
                        HostTokens::default(),
                    )
                }
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
    // basis 由 billing_modes 声明决定（Stage B），不再硬编码 ApiEquivalent：
    // openai 声明 subscription → 等价标价口径（与硬编码时代结果一致，但依据
    // 从"写死假设"变成"用户声明"；未来把 codex 切到按量 key 只改声明，这里
    // 自动落 MeteredActual）。plan 快照（plan_type/credits）**不参与**判定：
    // 它是"当前状态"的单快照、不按日期分桶（hosts/codex/sessions/usage.rs
    // 的 doc），拿它判历史窗口本身就是错的——快照与声明的冲突检测留给
    // Stage E 的证据链。
    let pricing_main = agent_vitals_domain::cost::load_pricing();
    let (basis, mode_unknown) = match agent_vitals_domain::cost::billing_mode_of("openai", &pricing_main) {
        BillingMode::Subscription => (BillingBasis::ApiEquivalent, false),
        BillingMode::Metered => (BillingBasis::MeteredActual, false),
        BillingMode::Unknown => (BillingBasis::ApiEquivalent, true),
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
            freshness,
        },
        tk,
    )
}

/// Claude Code 的月份/日期窗口 → `HostAmount`（§8.4 的 Claude Code 栏）。
///
/// 数据源是 `sessions::claude_ledger` 同一份 `state_dir()/claude-ledger.json`
/// （`days: {日期: {模型: 4 型 snake tokens}}` flat 直图），计价走 core 单一
/// 决策点 `agent_vitals_domain::cost::claude_day_cost`（与托盘 overview 的
/// claude 今日/当月估、CLI 会话账是同一份读法分界，不长第二份计价规则）。
/// 窗口内逐日折算后按 `currency_totals` 同币合并（claude 无时段价，同币相加
/// 安全——托盘 `claude_estimates` 的原注释），**跨币永不相加**。
///
/// 两个 basis 的分栏是托盘既有口径的 DTO 化（`metered_amount` 的注释原文）：
/// - **CNY 流 → `MeteredEstimate`**：deepseek 顶层官方卡按量折算，但 claude
///   ledger 的 token 折叠看不到真实逐请求拆分（relay 报恒定低命中，估算是
///   保守上界），托盘合并行因此标 `≈`——估算就是估算，不冒充实测账单
///   （`summable_into_total` 对 MeteredEstimate 是 false）。
/// - **USD 流 → `ApiEquivalent`**：anthropic 目录卡视作套餐覆盖（spec §3.1
///   原话「混币不能相加」，USD 流只在行内完全没有 ¥ 侧时才单独浮出）——
///   套餐消耗的等价 API 标价，只作诊断。
///
/// 窗口内没有任何账日 → Unavailable 不是 ¥0。有账日但全部模型都无卡可报
/// （全 unknown 日：有 token、无钱）→ 金额表留空 + `has_unresolved`——
/// `CostBasis::Unresolved` 「不得归零」的纪律：观测到了，但价不可确认，
/// 既不当 0 也不当没测（freshness 照报）。`unpriced_tokens > 0` 或任一日
/// `pricing_basis == "partial"`（时变卡没有峰谷分辨率）→ `has_unresolved`。
///
/// 已知局限：ledger 只装当月（`claude_sync` 全量重建时滚动），历史月份的
/// 查询诚实报 Unavailable——与 DSH 有 month-archive.json 归档不同，claude
/// 侧确实没有可读的历史数据，不是"有而不读"。
/// 同 [`claude_host_amount`]，顺带产出窗口内 token 计量（四轴 claude snake
/// 键直读——ledger 桶就是归一目标词表）。
fn claude_host_amount_with_tokens(window_prefix: &str) -> (HostAmount, HostTokens) {
    let ledger = crate::state::read_json(&crate::sessions::claude_ledger::ledger_path());
    let days: BTreeMap<String, serde_json::Value> = ledger
        .as_ref()
        .and_then(|l| l.get("days"))
        .and_then(|d| d.as_object())
        .map(|d| {
            d.iter()
                .filter(|(k, _)| k.starts_with(window_prefix))
                .map(|(k, v)| (k.clone(), v.clone()))
                .collect()
        })
        .unwrap_or_default();
    claude_host_amount_with_tokens_from_days(&days)
}

/// [`claude_host_amount_with_tokens`] 的核心：只认「窗口内账日 → `{model:
/// 4 桶}`」这份 map，不关心它来自 ledger JSON 还是 SQL `usage_facts` 聚合
/// （`SqlSummaryRepository`，`agent_vitals_data::authority_query::
/// {claude_days,claude_legacy_days}`）——两条路径喂同一把 `claude_day_cost`
/// 计价尺。`BTreeMap` 天然按日期升序迭代，与原实现显式 `sort_by` 的排序
/// 纪律（"同币求和的浮点顺序确定，跨平台字节一致"）等价。
fn claude_host_amount_with_tokens_from_days(
    days: &BTreeMap<String, serde_json::Value>,
) -> (HostAmount, HostTokens) {
    let claude_no_data = || (HostAmount {
        host_id: "claude-code".to_string(),
        amounts_by_basis: BTreeMap::new(),
        currency: None,
        has_unresolved: false,
        freshness: Freshness::unavailable(),
    }, HostTokens::default());
    if days.is_empty() {
        return claude_no_data();
    }
    let mut tk = HostTokens::default();
    let pricing = agent_vitals_domain::cost::load_pricing();
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
            cny += totals.and_then(|t| t.get("CNY")).and_then(|v| v.as_f64()).unwrap_or(0.0);
            usd += totals.and_then(|t| t.get("USD")).and_then(|v| v.as_f64()).unwrap_or(0.0);
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
        amounts_by_basis.insert(BillingBasis::ApiEquivalent, usd);
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
            freshness: latest.map(day_freshness).unwrap_or_else(Freshness::unavailable),
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
            freshness: self
                .latest
                .as_deref()
                .map(day_freshness)
                .unwrap_or_else(Freshness::unavailable),
        }
    }
}

/// claude-code 窗口 → billing_source 视角（`MonthlySummary.by_provider`，
/// 键 `"claude-code/<provider>"`）。
///
/// **为什么 by_host 做不了这个分流**（`claude_host_amount` 保留旧币种分栏的
/// 理由）：它先聚合掉模型维度只剩 cny/usd 两个标量，而 `amounts_by_basis`
/// 一档只有一个数——订阅桶里 anthropic 折 USD、minimax 折 CNY，同桶跨币
/// 相加就是编造。旧实现因此"用币种当 basis"，把有订阅的 MiniMax 判成
/// `MeteredEstimate`、没订阅的 moonshot 判成 `ApiEquivalent`（两处真实
/// 误判，2026-09-05 实测确认）。这里逐模型走 `billing_route_of`（Stage A
/// 的声明表，无价卡模型 glm-* 也能归属），per-provider 条目币种天然单一：
/// - **Subscription 声明 → `ApiEquivalent`**：套餐内无边际账单，catalog
///   折算只作诊断（claude-* → anthropic、MiniMax-M* → minimax、glm-* →
///   zhipu-glm 全部落这档——**MiniMax 由此从 MeteredEstimate 修正为
///   ApiEquivalent**）。
/// - **Metered 声明 → `MeteredEstimate`**（不是 Actual）：deepseek 流经
///   relay，实收价未核实、relay 报恒定低命中使估算是保守上界（§8.4c 原
///   口径）——声明说了按量，没说按什么价，估算级别不升。
/// - **无声明或价卡缺失 → 条目 `has_unresolved`**：glm-* 有声明无价卡、
///   moonshot/kimi 无声明——看见了 token、钱不可归，不当 0 也不编档。
///   unpriced 聚合（`claude_day_cost` 只给全日 unpriced 总数、不分模型）
///   按"当日出现过且 token 非零的无卡模型"逐个归属到各自 provider 条目；
///   完全无声明的落 `claude-code/unknown`，不吞。
///
/// `claude-*` 的混合路由（官方订阅 + 中转按量，2026-09-05 用户确认两者都
/// 在用）ledger 无法切分——整流按声明落 ApiEquivalent，其与实际用量的矛
/// 盾由消费方（Stage D 的 >50× 利用率护栏）以「归属待核」告警呈现，不在
/// 数据层假装裁定。
fn claude_provider_amounts(window_prefix: &str) -> BTreeMap<String, HostAmount> {
    let ledger = crate::state::read_json(&crate::sessions::claude_ledger::ledger_path());
    let days: BTreeMap<String, serde_json::Value> = ledger
        .as_ref()
        .and_then(|l| l.get("days"))
        .and_then(|d| d.as_object())
        .map(|d| {
            d.iter()
                .filter(|(k, _)| k.starts_with(window_prefix))
                .map(|(k, v)| (k.clone(), v.clone()))
                .collect()
        })
        .unwrap_or_default();
    claude_provider_amounts_from_days(&days)
}

/// [`claude_provider_amounts`] 的核心——同一份「窗口内账日 → `{model: 4
/// 桶}`」输入，来源无关（ledger JSON 或 SQL 聚合），理由见
/// [`claude_host_amount_with_tokens_from_days`]。
fn claude_provider_amounts_from_days(
    days: &BTreeMap<String, serde_json::Value>,
) -> BTreeMap<String, HostAmount> {
    let mut accs: BTreeMap<String, ProviderAcc> = BTreeMap::new();
    if days.is_empty() {
        return accs.into_iter().map(|(k, a)| {
            let host = a.finish(&k);
            (k, host)
        })
        .collect();
    }
    let pricing = agent_vitals_domain::cost::load_pricing();
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
                let (prov, mode) =
                    agent_vitals_domain::cost::billing_route_of(model, &pricing).unwrap_or((
                        "unknown".to_string(),
                        BillingMode::Unknown,
                    ));
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
            let total_tok: f64 = ["input_tokens", "cache_read_input_tokens",
                "cache_creation_input_tokens", "output_tokens"]
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
    accs.into_iter().map(|(k, a)| {
            let host = a.finish(&k);
            (k, host)
        })
        .collect()
}

/// by_provider 的 DSH 条目：声明表里 deepseek-official = metered，官方逐
/// token 价是真实费率——与 `dsh_host_amount` 的 MeteredActual 判定一致，
/// 条目即宿主条目的镜像（Host = BillingSource 的宿主，键换名片）。
fn dsh_provider_amount(
    cost: Option<serde_json::Value>,
    latest_day: Option<&str>,
) -> HostAmount {
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
        by_host.get(host).filter(|m| !m.is_empty()).map(|_| "sql-facts")
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
/// 的服务面。三个宿主各自的 by_model 桶，逐模型判定 unresolved 原因：
///
/// - `billing-route-unknown`：`billing_route_of` 认不出归属（DSH/claude 词表；
///   codex 宿主是 openai 订阅、路由是宿主级的，不做模型级判定）；
/// - `billing-mode-unknown`：路由命中但模式声明为 unknown（合法状态，不猜）；
/// - `no-price-card`：模型在本宿主价表里没有卡（unpriced_tokens 的逐模型
///   展开——聚合数说"有多少看不清"，这里说"是谁看不清"）；
/// - `partial-price-basis`：卡是时变价、日粒度无峰谷分辨率（`pricing_basis`
///   = "partial"，与 `has_unresolved` 的既有判定同源）。
///
/// 报告键与 `by_provider` 同词表（`host/provider`），消费方可以直接对上。
pub fn unresolved_detail(month: &str) -> serde_json::Value {
    use agent_vitals_domain::cost::BillingMode;
    let pricing = agent_vitals_domain::cost::load_pricing();
    let mut out: BTreeMap<String, Vec<serde_json::Value>> = BTreeMap::new();

    // ── claude-code：claude-ledger 窗口逐模型 ──────────────────────────
    if let Some(ledger) = crate::state::read_json(&crate::sessions::claude_ledger::ledger_path()) {
        let mut models: BTreeMap<String, [i64; 4]> = BTreeMap::new();
        let mut priced: std::collections::HashSet<String> = Default::default();
        let mut partial: std::collections::HashSet<String> = Default::default();
        if let Some(days) = ledger.get("days").and_then(|d| d.as_object()) {
            for (date, day) in days {
                if !date.starts_with(month) {
                    continue;
                }
                let Some(m) = day.as_object() else { continue };
                for (model, buckets) in m {
                    let g = |k: &str| {
                        buckets.get(k).and_then(|v| v.as_i64()).unwrap_or(0)
                    };
                    let e = models.entry(model.clone()).or_insert([0, 0, 0, 0]);
                    e[0] += g("input_tokens");
                    e[1] += g("cache_read_input_tokens");
                    e[2] += g("cache_creation_input_tokens");
                    e[3] += g("output_tokens");
                }
                // per_model = 有卡模型（claude_day_cost 的报告）；partial 基
                // 础逐模型记名（时变卡的日粒度近似，has_unresolved 同源）。
                if let Some(report) = agent_vitals_domain::cost::claude_day_cost(day, &pricing) {
                    if let Some(pm) = report.get("per_model").and_then(|v| v.as_object()) {
                        for (model, entry) in pm {
                            priced.insert(model.clone());
                            if entry.get("pricing_basis").and_then(|v| v.as_str())
                                == Some("partial")
                            {
                                partial.insert(model.clone());
                            }
                        }
                    }
                }
            }
        }
        for (model, t) in &models {
            // 0-token 行不进下钻：没有可计价的用量，「unresolved」无从谈起
            // （fold 内部哨兵如 `<synthetic>` 落在这里被一并滤掉）。
            if t.iter().all(|&v| v == 0) {
                continue;
            }
            let reason = match agent_vitals_domain::cost::billing_route_of(model, &pricing) {
                None => Some("billing-route-unknown"),
                Some((_, BillingMode::Unknown)) => Some("billing-mode-unknown"),
                Some(_) if !priced.contains(model) => Some("no-price-card"),
                Some(_) if partial.contains(model) => Some("partial-price-basis"),
                _ => None,
            };
            if let Some(reason) = reason {
                let prov = agent_vitals_domain::cost::billing_route_of(model, &pricing)
                    .map(|(p, _)| p)
                    .unwrap_or_else(|| "unknown".to_string());
                out.entry(format!("claude-code/{prov}")).or_default().push(
                    serde_json::json!({
                        "model": model,
                        "reason": reason,
                        "tokens": t[0] + t[1] + t[2] + t[3],
                    }),
                );
            }
        }
    }

    // ── codex/openai：fold by_model vs codex 价表报告 ─────────────────
    {
        let merged = codex_merged_cached(&codex_home());
        let mut filtered = serde_json::Map::new();
        if let Some(bh) = merged["by_hour_model"].as_object() {
            for (h, v) in bh {
                if h.starts_with(month) {
                    filtered.insert(h.clone(), v.clone());
                }
            }
        }
        let by_hour = serde_json::Value::Object(filtered);
        let by_model =
            agent_vitals_hosts::codex_usage::codex_by_model_from_hours(&by_hour, None);
        let codex_pricing = crate::sessions::codex_cost::load_codex_pricing();
        let report = crate::sessions::codex_cost::codex_cost_report(
            &by_hour,
            &by_model,
            &merged["unaccounted"],
            &merged["plan"],
            &codex_pricing,
            false,
        );
        let priced: std::collections::HashSet<String> = report
            .as_ref()
            .and_then(|r| r.get("per_model"))
            .and_then(|v| v.as_object())
            .map(|m| m.keys().cloned().collect())
            .unwrap_or_default();
        // **形状来源纪律（审查 P1-1）**：`by_model` 是两层
        // `model → speed → 桶对象`，桶键是 `CODEX_TOKEN_FIELDS` 的 5 键
        // （`cached_input_tokens`/`cache_write_input_tokens`——与 DSH/claude
        // 的 cache_read 词表不同，直读会静默全 0）。按
        // `codex_host_amount_with_tokens` 同款两层迭代求和。
        let rows = codex_unresolved_rows(&by_model, &priced);
        if !rows.is_empty() {
            out.entry("codex/openai".to_string()).or_default().extend(rows);
        }
    }

    // ── dsh/deepseek-official：month.json 逐日 by_model 聚合 ───────────
    if let Some(days) = crate::budget::read_month(Some(month)) {
        let mut by_model: serde_json::Map<String, serde_json::Value> = Default::default();
        let providers: serde_json::Map<String, serde_json::Value> = Default::default();
        for day in days.as_object().map(|m| m.values()).into_iter().flatten() {
            if let Some(bm) = day.get("by_model").and_then(|v| v.as_object()) {
                for (model, buckets) in bm {
                    let e = by_model.entry(model.clone()).or_insert(serde_json::json!({
                        "uncached_input_tokens": 0, "cache_read_tokens": 0,
                        "cache_write_tokens": 0, "output_tokens": 0,
                    }));
                    for k in ["uncached_input_tokens", "cache_read_tokens",
                              "cache_write_tokens", "output_tokens"] {
                        let cur = e.get(k).and_then(|v| v.as_i64()).unwrap_or(0);
                        let add = buckets.get(k).and_then(|v| v.as_i64()).unwrap_or(0);
                        e[k] = serde_json::json!(cur + add);
                    }
                }
            }
        }
        let usage = serde_json::json!({"by_model": by_model, "providers": providers});
        let report = agent_vitals_domain::cost::cost_report(&usage, &pricing);
        let priced: std::collections::HashSet<String> = report
            .as_ref()
            .and_then(|r| r.get("per_model"))
            .and_then(|v| v.as_object())
            .map(|m| m.keys().cloned().collect())
            .unwrap_or_default();
        for (model, buckets) in &by_model {
            if priced.contains(model) {
                continue;
            }
            let g0 = |k: &str| buckets.get(k).and_then(|v| v.as_i64()).unwrap_or(0);
            if [g0("uncached_input_tokens"), g0("cache_read_tokens"),
                g0("cache_write_tokens"), g0("output_tokens")]
            .iter().all(|&v| v == 0) {
                continue; // 0-token 行无可计价用量，不进下钻
            }
            let reason = match agent_vitals_domain::cost::billing_route_of(model, &pricing) {
                None => "billing-route-unknown",
                Some((_, BillingMode::Unknown)) => "billing-mode-unknown",
                Some(_) => "no-price-card",
            };
            let g = |k: &str| buckets.get(k).and_then(|v| v.as_i64()).unwrap_or(0);
            out.entry("dsh/deepseek-official".to_string()).or_default().push(
                serde_json::json!({
                    "model": model,
                    "reason": reason,
                    "tokens": g("uncached_input_tokens")
                        + g("cache_read_tokens")
                        + g("cache_write_tokens")
                        + g("output_tokens"),
                }),
            );
        }
    }

    let mut obj = serde_json::Map::new();
    for (k, rows) in out {
        obj.insert(k, serde_json::Value::Array(rows));
    }
    serde_json::Value::Object(obj)
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

/// by_provider 的 Codex 条目：`billing_mode_of("openai") = subscription` →
/// 等价标价口径，与 `codex_host_amount` 的判定同源（那边刚改成查声明）。
fn codex_provider_amount(
    home: &Path,
    filter_key: &str,
    day: Option<&str>,
) -> (HostAmount, HostTokens) {
    let (mut h, tk) = codex_host_amount_with_tokens(home, filter_key, day);
    h.host_id = "codex/openai".to_string();
    // ApiEquivalent 折算用的 codex 价卡全表 USD（codex_pricing.json 无币种
    // 字段、金额即美元——"total cost" 标签的既有语义）。
    h.currency = Some("USD".to_string());
    (h, tk)
}

/// [`codex_provider_amount`] 的 SQL 版本——同一份 `by_hour_model` 输入换个
/// 来源，见 [`codex_host_amount_with_tokens_from_hours`] 的理由。
fn codex_provider_amount_from_hours(
    by_hour_model: &serde_json::Value,
    day: Option<&str>,
) -> (HostAmount, HostTokens) {
    let (mut h, tk) = codex_host_amount_with_tokens_from_hours(
        by_hour_model,
        &serde_json::Value::Null,
        &serde_json::Value::Null,
        day,
    );
    h.host_id = "codex/openai".to_string();
    h.currency = Some("USD".to_string());
    (h, tk)
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
    let g = |v: &serde_json::Value, k: &str| v.get(k).and_then(|x| x.as_f64()).unwrap_or(0.0) as i64;
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
) {
    let pricing = agent_vitals_domain::cost::load_pricing();
    for (provider, currency, amount, period_start) in
        agent_vitals_domain::cost::declared_subscriptions(&pricing)
    {
        // 账期未开始不摊（None 理论不可达——declared_subscriptions 已回落
        // reported_at；防御性跳过而不是摊进所有历史）。
        let Some(start) = period_start.as_deref() else { continue };
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
        let entry = by_provider.entry(key.clone()).or_insert_with(|| HostAmount {
            host_id: key,
            amounts_by_basis: BTreeMap::new(),
            currency: None,
            has_unresolved: false,
            freshness: Freshness::unavailable(),
        });
        // 同 provider 重复摊的防线不在循环外而在取值语义：declared_
        // subscriptions 已按「首条」去重（测试钉住），这里每个 provider 恰好
        // 进一次循环。
        *entry.amounts_by_basis.entry(BillingBasis::FixedSubscription).or_insert(0.0) += amount;
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

/// Codex 当前配额快照（决策卡「现在该用谁」的唯一正向余量源）。
///
/// **为什么是独立函数而不是塞进 summary**：plan 是"当前状态"的单快照、不按
/// 日期分桶（`hosts/codex/sessions/usage.rs` 的 doc），塞进月/日窗口 DTO 会
/// 把"此刻余量"伪装成窗口数据。返回 `plan_from_rate_limits` 的产物原样、
/// 不二次加工：`{"plan_type", "has_credits",
/// "limits": {"primary": {"used_percent", "window_minutes", "resets_at"}},
/// "observed_at"}`——**窗口条在 `limits.primary` 之下、不在顶层**（审查 #1：
/// doc 曾写错为顶层 `primary`，前端与 verify stub 被同一个错误期望误导，
/// 决策卡整条失效）。无 rollout / 无 plan 事件 → None（无 ChatGPT 订阅
/// 证据，不得编造余量）。
pub fn codex_quota_snapshot(home: &Path) -> Option<serde_json::Value> {
    let merged = codex_merged_cached(home);
    let plan = merged.get("plan")?;
    plan.get("plan_type").and_then(|v| v.as_str())?;
    Some(plan.clone())
}

/// 宿主 → 该宿主可能出现的 billing_source 提供方。接线知识（与
/// `WIRED_HOSTS` 同类）：新宿主/新提供方接线时同步维护；漏登记的已声明
/// 订阅会落 `unattributed/<provider>` 条目可见，不会静默消失。
const HOST_PROVIDER_MAP: &[(&str, &[&str])] = &[
    ("claude-code", &["anthropic", "minimax", "zhipu-glm", "moonshot"]),
    ("codex", &["openai"]),
    ("dsh", &["deepseek-official", "shengsuanyun"]),
];


/// `days` map 里最晚的日期键（"YYYY-MM-DD" 字符串序等价于日期序）。
fn latest_day_key(days: &serde_json::Value) -> Option<String> {
    days.as_object()?.keys().max().cloned()
}

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
    fn day_entry<'a>(
        days: &'a mut serde_json::Map<String, Value>,
        date: &str,
    ) -> &'a mut Value {
        days.entry(date.to_string())
            .or_insert_with(|| {
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

    let pricing = agent_vitals_domain::cost::load_pricing();

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
                tokens += g("input_tokens") + g("cache_read_input_tokens")
                    + g("cache_creation_input_tokens") + g("output_tokens");
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
    for (hour, models) in by_hour_model.as_object().expect("by_hour_model is an object") {
        let date = &hour[..hour.len().min(10)];
        let mut tokens = 0i64;
        if let Some(models) = models.as_object() {
            for (_m, speeds) in models {
                if let Some(speeds) = speeds.as_object() {
                    for (_s, b) in speeds {
                        let g = |k: &str| b.get(k).and_then(|v| v.as_f64()).unwrap_or(0.0) as i64;
                        tokens += g("uncached_input_tokens") + g("cached_input_tokens")
                            + g("cache_write_input_tokens") + g("output_tokens")
                            + g("reasoning_output_tokens");
                    }
                }
            }
        }
        let e = day_entry(&mut days, date);
        e["codex_tokens"] = json!(e.get("codex_tokens").and_then(|v| v.as_i64()).unwrap_or(0) + tokens);
    }
    let by_model = agent_vitals_hosts::codex_usage::codex_by_model_from_hours(&by_hour_model, None);
    let codex_pricing = crate::sessions::codex_cost::load_codex_pricing();
    if let Some(report) = crate::sessions::codex_cost::codex_cost_report(
        &by_hour_model,
        &by_model,
        &serde_json::Value::Null,
        &serde_json::Value::Null,
        &codex_pricing,
        false,
    ) {
        if let Some(report_days) = report.get("days").and_then(|v| v.as_array()) {
            for d in report_days {
                let Some(date) = d.get("date").and_then(|v| v.as_str()) else { continue };
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

/// Phase 4.1（spec §6.3「对账协议」）：**SQL 权威库 vs legacy state JSON** 的
/// 机器可读对账。token 按 `host × bucket` 严格相等；金额按
/// `provider × basis × currency` 最小货币单位（跨币不汇总）。差异分档：
/// `exact`（严格相等）/ `explained`（差量 ≤ 已登记的 §6.3 允许例外——目前只有
/// `undated_residual`：ledger 无逐行证据的历史残差）/ `mismatch`。
/// `reconciled = true` ⟺ 全部 exact-or-explained（Phase 4.2 切换门槛的读取面）。
///
/// legacy 侧 = `JsonSummaryRepository`（读 month.json / claude-ledger.json /
/// codex fold）；SQL 侧 = `SqlSummaryRepository`（权威库）。两者同一份冻结 DTO
/// 形状，差只可能来自「覆盖 ≠ 覆盖」不能来自「两套算法」（§2.1 纪律）。
pub fn reconcile_authority_vs_legacy(month: &str) -> serde_json::Value {
    use agent_vitals_data::repository::{MonthlySummaryQuery, SummaryRepository};
    let q = MonthlySummaryQuery { month: month.to_string() };
    let sql = SqlSummaryRepository::new().monthly_summary(&q);
    let legacy = JsonSummaryRepository.monthly_summary(&q);

    // §6.3 允许例外：`undated_residual`（claude ledger 无日期残差，Phase 4 裁决）
    // 的 token 总量——claude token 缺口 ≤ 此值 → explained。
    let residual_tokens: i64 = agent_vitals_data::authority::AuthorityDb::open(
        &agent_vitals_data::authority::default_authority_path(&crate::home::data_home()),
        crate::sql_sync::now_ms(),
    )
    .ok()
    .and_then(|db| {
        db.conn()
            .query_row(
                "SELECT detail_json FROM data_quality_issues
                 WHERE code = 'undated_residual' AND resolved_at_ms IS NULL",
                [],
                |r| r.get::<_, String>(0),
            )
            .ok()
    })
    .and_then(|s| serde_json::from_str::<serde_json::Value>(&s).ok())
    .and_then(|d| d.get("total_tokens").and_then(serde_json::Value::as_i64))
    .unwrap_or(0);

    // ── token: host × bucket ────────────────────────────────────────────
    let mut hosts: BTreeSet<String> = sql.tokens_by_host.keys().cloned().collect();
    hosts.extend(legacy.tokens_by_host.keys().cloned());
    let bucket_of = |t: &agent_vitals_domain::data_contract::HostTokens, b: &str| -> i64 {
        match b {
            "uncached_input" => t.uncached_input,
            "cache_read" => t.cache_read,
            "cache_write" => t.cache_write,
            "output" => t.output,
            _ => 0,
        }
    };
    let zero = agent_vitals_domain::data_contract::HostTokens::default();
    let mut token_rows = Vec::new();
    let mut all_ok = true;
    for host in &hosts {
        let s = sql.tokens_by_host.get(host).unwrap_or(&zero);
        let l = legacy.tokens_by_host.get(host).unwrap_or(&zero);
        let host_delta: i64 = ["uncached_input", "cache_read", "cache_write", "output"]
            .iter()
            .map(|b| (bucket_of(l, b) - bucket_of(s, b)).abs())
            .sum();
        let mut buckets = serde_json::Map::new();
        let mut host_exact = true;
        for b in ["uncached_input", "cache_read", "cache_write", "output"] {
            let (sv, lv) = (bucket_of(s, b), bucket_of(l, b));
            if sv != lv {
                host_exact = false;
            }
            buckets.insert(b.to_string(), json!({"sql": sv, "legacy": lv, "delta": lv - sv}));
        }
        // §6.3 允许例外三类：
        // ① claude 缺口 ≤ ledger 无日期残差（undated_residual）——旧状态无逐行证据；
        // ② claude 缺口是「SQL 更新、legacy ledger 落后一个 claude-sync 窗」——
        //    迁移窗口双写的时序差，abs_delta ≤ residual 视同同类（残差量级远大于
        //    一个同步窗的增量）；
        // ③ codex `output` 单桶且 legacy > sql——legacy fold 把 `reasoning_output
        //    _tokens` 在已含它的 `output_tokens` 之上再加一遍（decision A：
        //    reasoning ⊆ output；usage_fact 侧不重复，SQL 更正确）。
        let only_output_legacy_over = {
            let d = |b: &str| bucket_of(l, b) - bucket_of(s, b);
            d("uncached_input") == 0 && d("cache_read") == 0 && d("cache_write") == 0
                && d("output") > 0
        };
        let (verdict, explanation) = if host_exact {
            ("exact", None)
        } else if host == "claude-code" && host_delta <= residual_tokens.max(1) {
            (
                "explained",
                Some("claude ledger 无逐行证据的历史残差 / 迁移窗双写时序差（undated_residual，§6.3 例外①）".to_string()),
            )
        } else if host == "codex" && only_output_legacy_over {
            (
                "explained",
                Some(format!(
                    "legacy fold 把 reasoning_output_tokens（{} tok）在已含它的 output_tokens 上重复加一遍——SQL 侧不重复（decision A：reasoning ⊆ output），§6.3 例外②旧聚合已知 bug",
                    bucket_of(l, "output") - bucket_of(s, "output")
                )),
            )
        } else {
            all_ok = false;
            ("mismatch", None)
        };
        token_rows.push(json!({
            "host": host,
            "verdict": verdict,
            "abs_delta_tokens": host_delta,
            "buckets": buckets,
            "explanation": explanation,
        }));
    }
    // provider → 该 provider 所属 host 的 token verdict（金额差继承 token 差的
    // 定性：金额是从同一批 token 派生的）。
    let host_verdict_of_provider = |prov: &str| -> &'static str {
        let host = prov.split('/').next().unwrap_or("");
        token_rows
            .iter()
            .find(|r| r["host"] == host)
            .and_then(|r| r["verdict"].as_str())
            .map(|v| if v == "explained" { "explained" } else { "exact" })
            .unwrap_or("exact")
    };

    // ── amount: provider × basis × currency（最小货币单位，±1 分舍入容忍）──
    let mut provs: BTreeSet<String> = sql.by_provider.keys().cloned().collect();
    provs.extend(legacy.by_provider.keys().cloned());
    let mut amount_rows = Vec::new();
    for prov in &provs {
        let s = sql.by_provider.get(prov);
        let l = legacy.by_provider.get(prov);
        let currency = s
            .and_then(|h| h.currency.clone())
            .or_else(|| l.and_then(|h| h.currency.clone()));
        let mut bases: BTreeSet<agent_vitals_domain::data_contract::BillingBasis> = BTreeSet::new();
        if let Some(h) = s { bases.extend(h.amounts_by_basis.keys().copied()); }
        if let Some(h) = l { bases.extend(h.amounts_by_basis.keys().copied()); }
        for basis in bases {
            let minor = |h: Option<&agent_vitals_domain::data_contract::HostAmount>| -> i64 {
                h.and_then(|x| x.amounts_by_basis.get(&basis).copied())
                    .map(|v| agent_vitals_domain::util::pyround(v * 100.0, 0) as i64)
                    .unwrap_or(0)
            };
            let (sm, lm) = (minor(s), minor(l));
            let verdict = if (sm - lm).abs() <= 1 {
                "exact"
            } else if host_verdict_of_provider(prov) == "explained" {
                "explained" // token 差已定性为例外 → 派生金额差同类
            } else {
                all_ok = false;
                "mismatch"
            };
            amount_rows.push(json!({
                "provider": prov,
                "basis": basis.as_str(),
                "currency": currency,
                "sql_minor": sm,
                "legacy_minor": lm,
                "delta_minor": sm - lm,
                "verdict": verdict,
            }));
        }
    }

    json!({
        "month": month,
        "reconciled": all_ok,
        "residual_exception_tokens": residual_tokens,
        "tokens_by_host": token_rows,
        "amounts_by_provider_basis": amount_rows,
    })
}

/// §6.3：每个对账例外必须有 issue code + 范围 + 原因 + 用户可见 partial 标记。
/// `reconcile_authority_vs_legacy` 的报告是纯读；这里把非 `exact` 的 host 行
/// 落 `data_quality_issues`（`reconcile_exception` / `reconcile_mismatch`），
/// `data-status` 的 `open_quality_issues_by_code` 据此可见。全 exact 的月份把
/// 该月既有 reconcile issue 标 resolved（迁移收敛的正常路径，幂等）。
/// **取 ingest 同锁**——与 rebuild/ingest 串行，不留孤儿写。
pub fn persist_reconcile_exceptions(data_home: &Path, report: &serde_json::Value) -> Result<(), String> {
    let month = report["month"].as_str().unwrap_or("").to_string();
    let lease_path = data_home.join("facts").join(".ingest.lock");
    let _lease =
        crate::lease::acquire_blocking(&lease_path, "reconcile-issues", 60_000, 2_000)
            .map_err(|e| format!("reconcile issue lease [{}]: {e}", lease_path.display()))?;
    let db = agent_vitals_data::authority::AuthorityDb::open(
        &agent_vitals_data::authority::default_authority_path(data_home),
        crate::sql_sync::now_ms(),
    )
    .map_err(|e| e.to_string())?;
    let now = crate::sql_sync::now_ms();
    let rows: Vec<&serde_json::Value> = report["tokens_by_host"]
        .as_array()
        .map(|a| a.iter().filter(|r| r["verdict"] != "exact").collect())
        .unwrap_or_default();
    db.with_immediate_txn(|conn| {
        for r in &rows {
            let host = r["host"].as_str().unwrap_or("?");
            let (code, sev) = if r["verdict"] == "explained" {
                ("reconcile_exception", "info")
            } else {
                ("reconcile_mismatch", "warning")
            };
            conn.execute(
                "INSERT INTO data_quality_issues(issue_id, scope_type, scope_key, code,
                     severity, first_seen_at_ms, last_seen_at_ms, detail_json)
                 VALUES (?1,'month',?2,?3,?4,?5,?5,?6)
                 ON CONFLICT(scope_type, scope_key, code) DO UPDATE SET
                     last_seen_at_ms = excluded.last_seen_at_ms,
                     detail_json = excluded.detail_json, resolved_at_ms = NULL",
                rusqlite::params![
                    format!("{code}:{month}:{host}"),
                    format!("{month}/{host}"),
                    code, sev, now,
                    json!({"host": host, "abs_delta_tokens": r["abs_delta_tokens"],
                           "buckets": r["buckets"], "explanation": r["explanation"],
                           "note": "SQL 权威库 vs legacy state JSON 逐 bucket 对账（§6.3）"})
                    .to_string(),
                ],
            )?;
        }
        if rows.is_empty() {
            conn.execute(
                "UPDATE data_quality_issues SET resolved_at_ms = ?1
                 WHERE code IN ('reconcile_exception','reconcile_mismatch')
                   AND scope_key LIKE ?2 AND resolved_at_ms IS NULL",
                rusqlite::params![now, format!("{month}/%")],
            )?;
        }
        Ok(())
    })
    .map_err(|e| e.to_string())
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
/// - `plan` = `{"plan_type":"plus"}`——**不是 fabrication**：`pricing.json`
///   `catalog_2026_09.billing_modes.openai._note` 声明「全部 60 份 rollout
///   实测 rate_limits.plan_type=plus，单一提供方订阅制」。只带 tier tag、不带
///   月费/限额（那才是 `_note` 明令禁止的「拿 Plus 挂牌价猜」）。作用是让
///   `render_codex_cost` 的 USD 总额保持「(按量标价)」诚实标注——codex 是
///   订阅，per-token USD 是名义折算不是账单（`_note` + ATTRIBUTABLE_WASTE §6.7）。
///   plan 的**限额快照**（used_percent 等）SQL 面确实丢了，落 SQL 是后续项。
pub fn codex_merged_from_sql(data_home: &Path) -> (serde_json::Value, Option<String>) {
    let empty = || {
        json!({
            "by_hour_model": {}, "by_model": {},
            "unaccounted": [], "plan": { "plan_type": "plus" },
        })
    };
    let path = agent_vitals_data::authority::default_authority_path(data_home);
    // `!exists` 必须在 open 之前判：`AuthorityDb::open` 对缺文件会**建库**
    // （全 DDL），之后就分不清「从没同步」和「同步了但 codex 无用量」。
    let missing = !path.exists();
    let by_hour_model = match agent_vitals_data::authority::AuthorityDb::open(
        &path,
        crate::sql_sync::now_ms(),
    ) {
        Ok(db) => agent_vitals_data::authority_query::codex_by_hour_model(db.conn(), 0, i64::MAX)
            .unwrap_or_else(|_| json!({})),
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
    let by_model =
        agent_vitals_hosts::codex_usage::codex_by_model_from_hours(&by_hour_model, None);
    (
        json!({
            "by_hour_model": by_hour_model,
            "by_model": by_model,
            "unaccounted": [],
            "plan": { "plan_type": "plus" },
        }),
        note,
    )
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
        let dsh_amount = dsh_host_amount(cost.clone(), latest_day.as_deref());
        by_host.insert("dsh".to_string(), dsh_amount);
        let (codex_amount, codex_tk) =
            codex_host_amount_with_tokens(&codex_home(), &query.month, None);
        by_host.insert("codex".to_string(), codex_amount);
        let (claude_amount, claude_tk) = claude_host_amount_with_tokens(&query.month);
        by_host.insert("claude-code".to_string(), claude_amount);

        // L0 计量层（Stage D）：与 by_host 同键，KPI 行的 tokens/命中率从这里取。
        let mut tokens_by_host = BTreeMap::new();
        tokens_by_host.insert("dsh".to_string(), dsh_tokens(days.as_ref(), &query.month));
        tokens_by_host.insert("codex".to_string(), codex_tk);
        tokens_by_host.insert("claude-code".to_string(), claude_tk);

        // billing_source 视角（Stage B）：DSH/Codex 宿主单一提供方，条目即
        // 宿主条目换键；claude-code 宿主内多提供方，逐模型分流。
        let mut by_provider = BTreeMap::new();
        by_provider.insert(
            "dsh/deepseek-official".to_string(),
            dsh_provider_amount(cost, latest_day.as_deref()),
        );
        let (codex_prov, _codex_prov_tk) =
            codex_provider_amount(&codex_home(), &query.month, None);
        by_provider.insert("codex/openai".to_string(), codex_prov);
        by_provider.extend(claude_provider_amounts(&query.month));
        apply_subscription_fees(&mut by_provider, &query.month);

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
            dsh_host_amount(cost.clone(), day_value.map(|_| query.date.as_str())),
        );
        // 日切片：过滤键 = 完整日期，金额取该日行（untimed 不混进某一天）。
        let (codex_amount, codex_tk) =
            codex_host_amount_with_tokens(&codex_home(), &query.date, Some(&query.date));
        by_host.insert("codex".to_string(), codex_amount);
        // claude 账日本身按日期归属，窗口 = 完整日期前缀即得该日。
        let (claude_amount, claude_tk) = claude_host_amount_with_tokens(&query.date);
        by_host.insert("claude-code".to_string(), claude_amount);

        // L0 计量层（Stage D）：单日窗口。
        let mut tokens_by_host = BTreeMap::new();
        // `day_value` 是**单日对象**，不是 `{date: day}` map——`dsh_tokens`
        // 的窗口过滤按 map 键设计，喂单日对象会拿它的顶层桶键名（如
        // "uncached_input_tokens"）去比"以 query.date 开头"，恒不匹配，
        // DSH 今日 tokens 因此假零（`CODE_REVIEW_V0_9_STAGE_A_D_KPI_BILLING.md`
        // 头部 bug #2；`dsh_day_tokens` 当时已经为这个缺口造出来，但这处
        // 调用点没有跟着切，回归一直存在到现在）。单日对象直接进
        // `dsh_day_tokens`，不经窗口过滤。
        tokens_by_host.insert("dsh".to_string(), day_value.map(dsh_day_tokens).unwrap_or_default());
        tokens_by_host.insert("codex".to_string(), codex_tk);
        tokens_by_host.insert("claude-code".to_string(), claude_tk);

        // billing_source 视角（Stage B）：日粒度只装按量/等价折算流——
        // 订阅月费不是日发生额，不摊（Stage C 的纪律，写在这里防前移）。
        let mut by_provider = BTreeMap::new();
        by_provider.insert(
            "dsh/deepseek-official".to_string(),
            dsh_provider_amount(cost, day_value.map(|_| query.date.as_str())),
        );
        let (codex_prov, _codex_prov_tk) =
            codex_provider_amount(&codex_home(), &query.date, Some(&query.date));
        by_provider.insert("codex/openai".to_string(), codex_prov);
        by_provider.extend(claude_provider_amounts(&query.date));

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

    /// JSON 路径的诚实近似（2026-09-07 Phase 3.3）：三维分母需要事实级
    /// 数据，JSON 链没有——退而求其次按「该宿主这个月有没有可观测数据」
    /// 二值近似（Unavailable → 0/3，否则 3/3）。**denominator_version = 0**
    /// 刻意区别于 SQL 侧的 1：两把尺子不同，旧快照/新快照的覆盖率不可无声
    /// 互比（data_contract::CoverageStatus 的同一条纪律）——消费方拿到
    /// version=0 就知道这是接线级粗粒度，不是三维实测。
    fn coverage_status(&self, month: &str) -> BTreeMap<String, CoverageStatus> {
        let summary = self.monthly_summary(&MonthlySummaryQuery { month: month.to_string() });
        WIRED_HOSTS
            .iter()
            .map(|h| {
                let measured = if summary.by_host[*h].freshness.state == FreshnessState::Unavailable {
                    0
                } else {
                    3
                };
                (
                    (*h).to_string(),
                    CoverageStatus { measured_fields: measured, total_fields: 3, denominator_version: 0 },
                )
            })
            .collect()
    }
}

/// v0.9.1 Phase 3.1（`AGENT_VITALS_V0_9_1_SQL_AUTHORITY_MIGRATION_SPEC.md`
/// §5.2）：`SummaryRepository` 的 SQL 权威库实现——`usage_facts` 取代
/// month.json/ledger/codex fold 作为读源。**计价规则一个字不改**：DSH 走
/// `dsh_host_amount`/`dsh_provider_amount`/`dsh_tokens`/`dsh_day_tokens`
/// （无缝复用，它们本就只认 `{total,peak_total}`/`{date:day}` 这两种
/// `Value` 形状，不关心谁产出的），codex/claude 走上面拆出来的
/// `_from_hours`/`_from_days` 核心——三条计价管线与 `JsonSummaryRepository`
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
        Self { data_home: Some(data_home.into()) }
    }

    fn open_db(&self) -> Option<agent_vitals_data::authority::AuthorityDb> {
        let data_home = self.data_home.clone().unwrap_or_else(crate::home::data_home);
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
    let realtime = agent_vitals_data::authority_query::claude_days(conn, start_ms, end_ms)
        .unwrap_or_default();
    for (day, models) in realtime {
        let entry = days
            .entry(day)
            .or_insert_with(|| serde_json::json!({}));
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
fn claude_legacy_backed(
    conn: &rusqlite::Connection,
    month: &str,
) -> bool {
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
) -> (serde_json::Value, serde_json::Value, BTreeMap<String, serde_json::Value>) {
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

        let pricing = agent_vitals_domain::cost::load_pricing();
        let latest_day = dsh_days.as_object().and_then(|m| m.keys().next_back().cloned());
        let dsh_cost = match dsh_days.as_object() {
            Some(m) if !m.is_empty() => Some(agent_vitals_domain::cost::month_cost(&dsh_days, &pricing)),
            _ => None,
        };
        let mut by_host = BTreeMap::new();
        by_host.insert("dsh".to_string(), dsh_host_amount(dsh_cost.clone(), latest_day.as_deref()));
        let (codex_amount, codex_tk) = codex_host_amount_with_tokens_from_hours(
            &by_hour_model,
            &serde_json::Value::Null,
            &serde_json::Value::Null,
            None,
        );
        by_host.insert("codex".to_string(), codex_amount);
        let (claude_amount, claude_tk) = claude_host_amount_with_tokens_from_days(&claude_days_map);
        by_host.insert("claude-code".to_string(), claude_amount);
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

        let mut by_provider = BTreeMap::new();
        by_provider.insert(
            "dsh/deepseek-official".to_string(),
            dsh_provider_amount(dsh_cost, latest_day.as_deref()),
        );
        let (codex_prov, _codex_prov_tk) = codex_provider_amount_from_hours(&by_hour_model, None);
        by_provider.insert("codex/openai".to_string(), codex_prov);
        by_provider.extend(claude_provider_amounts_from_days(&claude_days_map));
        apply_subscription_fees(&mut by_provider, &query.month);

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

        let pricing = agent_vitals_domain::cost::load_pricing();
        let cost = day_value.as_ref().map(|d| {
            agent_vitals_domain::cost::priced_day(d, &pricing)
                .unwrap_or_else(|| agent_vitals_domain::cost::bucket_cost(d, &pricing))
        });
        let mut by_host = BTreeMap::new();
        by_host.insert(
            "dsh".to_string(),
            dsh_host_amount(cost.clone(), day_value.as_ref().map(|_| query.date.as_str())),
        );
        let (codex_amount, codex_tk) = codex_host_amount_with_tokens_from_hours(
            &by_hour_model,
            &serde_json::Value::Null,
            &serde_json::Value::Null,
            Some(&query.date),
        );
        by_host.insert("codex".to_string(), codex_amount);
        let (claude_amount, claude_tk) = claude_host_amount_with_tokens_from_days(&claude_days_map);
        by_host.insert("claude-code".to_string(), claude_amount);
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

        let mut by_provider = BTreeMap::new();
        by_provider.insert(
            "dsh/deepseek-official".to_string(),
            dsh_provider_amount(cost, day_value.as_ref().map(|_| query.date.as_str())),
        );
        let (codex_prov, _codex_prov_tk) =
            codex_provider_amount_from_hours(&by_hour_model, Some(&query.date));
        by_provider.insert("codex/openai".to_string(), codex_prov);
        by_provider.extend(claude_provider_amounts_from_days(&claude_days_map));

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
                (Some(db), Some((start, end))) => agent_vitals_data::authority_query::coverage_status(
                    db.conn(),
                    host,
                    start,
                    end,
                )
                .unwrap_or((0, 3)),
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
            // 这台真机上的 codex 2020-01 也必然无小时桶 → Unavailable）。
            // claude-code 也已接线（Stage 0.4c）：ledger 只装当月，2020-01
            // 必然无账日 → Unavailable。`excluded_hosts` 只剩 workbuddy。
            assert_eq!(summary.by_host["codex"].freshness.state, FreshnessState::Unavailable);
            assert!(summary.by_host["codex"].amounts_by_basis.is_empty());
            assert_eq!(summary.by_host["claude-code"].freshness.state, FreshnessState::Unavailable);
            assert!(summary.by_host["claude-code"].amounts_by_basis.is_empty());
            assert!(summary.excluded_hosts.contains("workbuddy"));
            assert!(!summary.excluded_hosts.contains("codex"));
            assert!(!summary.excluded_hosts.contains("dsh"));
            assert!(!summary.excluded_hosts.contains("claude-code"));
            assert_eq!(summary.coverage.measured_fields, 3);
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
        let (amount, _tk) = codex_host_amount_with_tokens(&dir, "2026-09", None);
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
        let (amount, _tk) = codex_host_amount_with_tokens(&dir, "2026-09", None);
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
        let (amount, _tk) = codex_host_amount_with_tokens(&dir, "2020-01", None);
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
        let (hit, hit_tk) =
            codex_host_amount_with_tokens(&dir, "2026-09-02", Some("2026-09-02"));
        assert!(hit.amounts_by_basis[&BillingBasis::ApiEquivalent] > 0.0);
        assert!(hit_tk.total > 0, "token 计量与金额同源同窗");
        // 相邻日没有任何小时桶 → Unavailable，不是 $0。
        // codex fold 现在带 60s 进程级 memo（同 home 键控），同一 tmp dir 内
        // 的第二次调用必须显式穿透，否则拿到 09-02 的缓存假数据。
        codex_fold_cache_clear();
        let (miss, miss_tk) =
            codex_host_amount_with_tokens(&dir, "2026-09-03", Some("2026-09-03"));
        assert!(miss.amounts_by_basis.is_empty());
        assert_eq!(miss_tk.total, 0);
        assert_eq!(miss.freshness.state, FreshnessState::Unavailable);
        let _ = std::fs::remove_dir_all(&dir);
    }

    /// 写一份 claude-ledger.json fixture（`days: {日期: {模型: 4 型 snake}}`
    /// flat 直图，`claude_sync` 真机形状）。走 `with_home`——`state_dir()` 读
    /// `AGENT_VITALS_HOME`。模型由调用方给：deepseek-v4-flash（顶层官方 CNY
    /// 卡）/ claude-opus-5（catalog anthropic USD 卡）/ 未知模型测 unpriced。
    fn write_ledger(models: serde_json::Value) {
        let ledger = json!({ "days": { "2026-09-02": models } });
        crate::state::atomic_write_json(
            &crate::state::state_dir().join("claude-ledger.json"),
            &ledger,
        );
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
    fn unresolved_detail_flags_unrouted_models_via_ledger() {
        with_home(|| {
            // no-card 模型（真机 GLM 无价卡同款）：ledger 有量、无路由/无卡。
            write_ledger(json!({
                "glm-5.3-flash": {"input_tokens": 1_000,
                                  "cache_read_input_tokens": 2_000,
                                  "cache_creation_input_tokens": 0,
                                  "output_tokens": 100},
                "<synthetic>": {"input_tokens": 0, "cache_read_input_tokens": 0,
                                "cache_creation_input_tokens": 0, "output_tokens": 0}
            }));
            let detail = unresolved_detail("2026-09");
            let found = detail.as_object().unwrap().iter()
                .flat_map(|(_, rows)| rows.as_array().unwrap().iter())
                .find(|r| r["model"] == json!("glm-5.3-flash"))
                .unwrap_or_else(|| panic!("expected glm row, got {detail}"));
            assert_eq!(found["tokens"], json!(3_100));
            // 0-token 哨兵行不进下钻。
            let synthetic = detail.as_object().unwrap().iter()
                .flat_map(|(_, rows)| rows.as_array().unwrap().iter())
                .find(|r| r["model"] == json!("<synthetic>"));
            assert!(synthetic.is_none(), "0-token 行不进下钻，got {detail}");
        });
    }

    #[test]
    fn claude_cny_day_is_metered_estimate_not_summable() {
        with_home(|| {
            write_ledger(json!({
                "deepseek-v4-flash": {"input_tokens": 1_000_000,
                                      "cache_read_input_tokens": 0,
                                      "cache_creation_input_tokens": 0,
                                      "output_tokens": 100_000},
            }));
            let amount = claude_host_amount_with_tokens("2026-09").0;
            assert!(amount.amounts_by_basis.contains_key(&BillingBasis::MeteredEstimate));
            assert!(amount.amounts_by_basis[&BillingBasis::MeteredEstimate] > 0.0);
            // 纯 CNY 日没有 USD 流：anthropic 的 ApiEquivalent 档不该出现。
            assert!(!amount.amounts_by_basis.contains_key(&BillingBasis::ApiEquivalent));
            // 估算不许冒充账单（托盘合并行标 ≈ 的同一纪律）。
            assert!(!BillingBasis::MeteredEstimate.summable_into_total());
            assert!(!amount.has_unresolved);
            assert_eq!(amount.freshness.last_observed_at.as_deref(), Some("2026-09-02T00:00:00Z"));
            assert_ne!(amount.freshness.state, FreshnessState::Unavailable);
        });
    }

    #[test]
    fn claude_usd_day_is_api_equivalent() {
        with_home(|| {
            write_ledger(json!({
                "claude-opus-5": {"input_tokens": 1_000_000,
                                  "cache_read_input_tokens": 0,
                                  "cache_creation_input_tokens": 0,
                                  "output_tokens": 100_000},
            }));
            let amount = claude_host_amount_with_tokens("2026-09").0;
            assert!(amount.amounts_by_basis.contains_key(&BillingBasis::ApiEquivalent));
            assert!(amount.amounts_by_basis[&BillingBasis::ApiEquivalent] > 0.0);
            // 套餐覆盖流不落 MeteredEstimate 档（CNY/USD 分栏 = 托盘口径）。
            assert!(!amount.amounts_by_basis.contains_key(&BillingBasis::MeteredEstimate));
            assert!(!amount.has_unresolved);
        });
    }

    #[test]
    fn claude_unknown_model_is_unresolved_not_zero() {
        with_home(|| {
            write_ledger(json!({
                "mystery-model": {"input_tokens": 500_000,
                                  "cache_read_input_tokens": 0,
                                  "cache_creation_input_tokens": 0,
                                  "output_tokens": 50_000},
            }));
            let amount = claude_host_amount_with_tokens("2026-09").0;
            // 全 unknown 日：有 token、价不可确认——金额表留空（不得归零），
            // has_unresolved 标记；但账日存在 → freshness 照报，不当没测。
            assert!(amount.amounts_by_basis.is_empty());
            assert!(amount.has_unresolved);
            assert_ne!(amount.freshness.state, FreshnessState::Unavailable);
            assert_eq!(amount.freshness.last_observed_at.as_deref(), Some("2026-09-02T00:00:00Z"));
        });
    }

    #[test]
    fn claude_window_filter_miss_is_unavailable_not_zero() {
        with_home(|| {
            write_ledger(json!({
                "deepseek-v4-flash": {"input_tokens": 1_000_000,
                                      "cache_read_input_tokens": 0,
                                      "cache_creation_input_tokens": 0,
                                      "output_tokens": 100_000},
            }));
            // 月窗口不命中（ledger 只装当月，历史月份诚实报缺）。
            let miss_month = claude_host_amount_with_tokens("2020-01").0;
            assert!(miss_month.amounts_by_basis.is_empty());
            assert_eq!(miss_month.freshness.state, FreshnessState::Unavailable);
            // 日窗口：账日命中 → 有钱；相邻日缺席 → Unavailable 不是 ¥0。
            let hit = claude_host_amount_with_tokens("2026-09-02").0;
            assert!(hit.amounts_by_basis[&BillingBasis::MeteredEstimate] > 0.0);
            let miss_day = claude_host_amount_with_tokens("2026-09-03").0;
            assert!(miss_day.amounts_by_basis.is_empty());
            assert_eq!(miss_day.freshness.state, FreshnessState::Unavailable);
        });
    }

    /// Stage B 的核心回归——billing_mode 分流修正两处真实误判：
    /// - MiniMax-M3 **有订阅**（minimax-sub ¥114/月），旧币种分支把它判成
    ///   `MeteredEstimate`（按量估算）——by_provider 必须落 `ApiEquivalent`；
    /// - glm-5.3-flash **有声明无价卡**（zhipu-glm subscription，catalog 无
    ///   卡）——条目 `has_unresolved`、金额表留空，不当 0 也不借卡；
    /// - claude-opus-5 → anthropic subscription → `ApiEquivalent`（与旧币种
    ///   分支结果一致，但依据从币种变成声明）；
    /// - deepseek-v4-flash → deepseek-official metered → `MeteredEstimate`
    ///   （relay 实收价未核实，估算级别不升）。
    #[test]
    fn claude_provider_amounts_split_by_billing_mode_declaration() {
        with_home(|| {
            write_ledger(json!({
                "claude-opus-5": {"input_tokens": 1_000_000,
                                  "cache_read_input_tokens": 0,
                                  "cache_creation_input_tokens": 0,
                                  "output_tokens": 100_000},
                "MiniMax-M3": {"input_tokens": 2_000_000,
                               "cache_read_input_tokens": 0,
                               "cache_creation_input_tokens": 0,
                               "output_tokens": 200_000},
                "glm-5.3-flash": {"input_tokens": 500_000,
                                  "cache_read_input_tokens": 0,
                                  "cache_creation_input_tokens": 0,
                                  "output_tokens": 50_000},
                "deepseek-v4-flash": {"input_tokens": 3_000_000,
                                      "cache_read_input_tokens": 0,
                                      "cache_creation_input_tokens": 0,
                                      "output_tokens": 300_000},
            }));
            let by_provider = claude_provider_amounts("2026-09");
            assert!(by_provider.contains_key("claude-code/anthropic"), "{:?}", by_provider.keys());
            assert!(by_provider["claude-code/anthropic"].amounts_by_basis
                .contains_key(&BillingBasis::ApiEquivalent));
            // MiniMax 修正回归：订阅声明 → ApiEquivalent，绝不落 MeteredEstimate。
            assert!(by_provider["claude-code/minimax"].amounts_by_basis
                .contains_key(&BillingBasis::ApiEquivalent), "{:?}", by_provider["claude-code/minimax"]);
            assert!(!by_provider["claude-code/minimax"].amounts_by_basis
                .contains_key(&BillingBasis::MeteredEstimate));
            assert!(!by_provider["claude-code/minimax"].has_unresolved);
            // glm：有声明无价卡 → 有 token 无钱，unresolved 不归零。
            let glm = &by_provider["claude-code/zhipu-glm"];
            assert!(glm.has_unresolved, "{:?}", glm);
            assert!(glm.amounts_by_basis.is_empty(), "无价卡不得借卡计价: {:?}", glm.amounts_by_basis);
            assert!(glm.freshness.last_observed_at.is_some(), "观测到了 token，freshness 照报");
            // deepseek：metered 声明 → MeteredEstimate（relay 上界口径）。
            assert!(by_provider["claude-code/deepseek-official"].amounts_by_basis
                .contains_key(&BillingBasis::MeteredEstimate));
            // 无 unknown 条目：四个模型都有声明归属。
            assert!(!by_provider.contains_key("claude-code/unknown"), "{:?}", by_provider.keys());
        });
    }

    /// 完全无声明的模型落 `claude-code/unknown`（不吞）：unpriced 聚合按
    /// 逐模型归属不到声明表 → unknown 条目收留，观测与 unresolved 都在。
    #[test]
    fn claude_provider_amounts_unknown_declaration_goes_to_unknown_entry() {
        with_home(|| {
            write_ledger(json!({
                "mystery-model": {"input_tokens": 500_000,
                                  "cache_read_input_tokens": 0,
                                  "cache_creation_input_tokens": 0,
                                  "output_tokens": 50_000},
            }));
            let by_provider = claude_provider_amounts("2026-09");
            let unk = &by_provider["claude-code/unknown"];
            assert!(unk.has_unresolved);
            assert!(unk.amounts_by_basis.is_empty());
            assert_eq!(unk.freshness.last_observed_at.as_deref(), Some("2026-09-02T00:00:00Z"));
        });
    }

    /// 组装层：monthly summary 的 by_provider 必含三个宿主的 provider 条目、
    /// 不含 workbuddy（excluded 检查双向成立）、contract_violations 为空、
    /// by_host 与 by_provider 互不串扰。
    #[test]
    fn monthly_summary_fills_by_provider_without_contract_violations() {
        with_home(|| {
            let repo = JsonSummaryRepository;
            let summary =
                repo.monthly_summary(&MonthlySummaryQuery { month: crate::clock::current_month_beijing() });
            assert!(summary.contract_violations().is_empty(), "{:?}", summary.contract_violations());
            assert!(summary.by_provider.contains_key("dsh/deepseek-official"), "{:?}", summary.by_provider.keys());
            assert!(summary.by_provider.contains_key("codex/openai"));
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
            let host_only_sum: f64 = summary.by_host.values()
                .map(|h| h.amounts_by_basis.iter()
                    .filter(|(b, _)| b.summable_into_total())
                    .map(|(_, v)| v).sum::<f64>())
                .sum();
            assert_eq!(via_host, host_only_sum);
        });
    }

    /// Stage C 核心回归——订阅月费摊进 `FixedSubscription`：
    /// - 有用量条目（anthropic）在原 `ApiEquivalent` 之上加 `FixedSubscription`；
    /// - **零用量也补建条目**：订阅费不付用量也在付，空 home 里
    ///   `claude-code/anthropic` 也要有 ¥0 用量 + $20 月费的条目；
    /// - 账期过滤：查询月早于 `billing_period_start` 不摊（GLM 2026-09-05
    ///   才买，摊进 2020-01 是编造历史支出）。
    #[test]
    fn subscription_fees_land_in_monthly_fixed_subscription() {
        with_home(|| {
            write_ledger(json!({
                "claude-opus-5": {"input_tokens": 1_000_000,
                                  "cache_read_input_tokens": 0,
                                  "cache_creation_input_tokens": 0,
                                  "output_tokens": 100_000},
            }));
            let repo = JsonSummaryRepository;
            let summary =
                repo.monthly_summary(&MonthlySummaryQuery { month: crate::clock::current_month_beijing() });
            assert!(summary.contract_violations().is_empty(), "{:?}", summary.contract_violations());
            let anthropic = &summary.by_provider["claude-code/anthropic"];
            assert!(anthropic.amounts_by_basis.contains_key(&BillingBasis::ApiEquivalent));
            assert_eq!(anthropic.amounts_by_basis[&BillingBasis::FixedSubscription], 20.0);
            // 零用量补建：glm 有声明（2026-09 起效）但本 fixture 无 glm 用量。
            let glm = &summary.by_provider["claude-code/zhipu-glm"];
            assert_eq!(glm.amounts_by_basis[&BillingBasis::FixedSubscription], 118.0);
            assert!(!glm.has_unresolved, "纯月费条目不标 unresolved");
            // 账期过滤：2020-01 早于一切 period_start → 无任何订阅条目被补建。
            let old = repo.monthly_summary(&MonthlySummaryQuery { month: "2020-01".to_string() });
            assert!(!old.by_provider.contains_key("claude-code/anthropic"));
            assert!(!old.by_provider.contains_key("claude-code/zhipu-glm"));
            // FixedSubscription 可汇总：月度总额现在含订阅费（spec §4「固定
            // 订阅可以按口径汇总」——总额首次等于真实月支出）。
            assert!(BillingBasis::FixedSubscription.summable_into_total());
            let summable = old.total_summable();
            assert_eq!(summable, 0.0, "2020-01 无任何数据，总额不含月费");
        });
    }

    /// 日粒度**不摊**订阅费（月费不是日发生额——按日摊会造出「今天花了
    /// ¥3.93」这种不存在的事实）。同一份 fixture，daily 的 anthropic 条目
    /// 只有 ApiEquivalent，没有 FixedSubscription。
    #[test]
    fn subscription_fees_never_leak_into_daily() {
        with_home(|| {
            write_ledger(json!({
                "claude-opus-5": {"input_tokens": 1_000_000,
                                  "cache_read_input_tokens": 0,
                                  "cache_creation_input_tokens": 0,
                                  "output_tokens": 100_000},
            }));
            let repo = JsonSummaryRepository;
            let daily = repo.daily_summary(&DailySummaryQuery {
                date: "2026-09-02".to_string(),
            });
            assert!(daily.contract_violations().is_empty(), "{:?}", daily.contract_violations());
            let anthropic = &daily.by_provider["claude-code/anthropic"];
            assert!(anthropic.amounts_by_basis.contains_key(&BillingBasis::ApiEquivalent));
            assert!(
                !anthropic.amounts_by_basis.contains_key(&BillingBasis::FixedSubscription),
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
    /// （`JsonSummaryRepository::daily_summary`）——`CODE_REVIEW_V0_9_STAGE_
    /// A_D_KPI_BILLING.md` 头部 bug #2 的完整回归：`dsh_day_tokens` 造出来
    /// 之后没有一条测试真的走 `daily_summary` 这条公开路径去断言 DSH 的
    /// `tokens_by_host` 非零，调用点因此漏改，恒零一直没被抓到。
    #[test]
    fn daily_summary_reports_nonzero_dsh_tokens_for_a_real_day() {
        with_home(|| {
            let day = crate::clock::today_beijing();
            crate::state::atomic_write_json(
                &crate::state::state_dir().join("month.json"),
                &json!({
                    "days": {
                        day.clone(): {
                            "uncached_input_tokens": 1_000_000,
                            "cache_read_tokens": 250_000,
                            "cache_write_tokens": 0,
                            "output_tokens": 100_000,
                            "peak_uncached_input_tokens": 0,
                            "peak_output_tokens": 0,
                            "peak_cache_read_tokens": 0,
                            "peak_cache_write_tokens": 0,
                        }
                    }
                }),
            );
            let repo = JsonSummaryRepository;
            let daily = repo.daily_summary(&DailySummaryQuery { date: day });
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
            let day = crate::clock::today_beijing();
            crate::state::atomic_write_json(
                &crate::state::state_dir().join("month.json"),
                &json!({
                    "days": {
                        day: {"by_model": {"deepseek-v4-flash": {
                            "uncached_input_tokens": 0, "output_tokens": 0,
                            "cache_read_tokens": 0, "cache_write_tokens": 0,
                            "peak_uncached_input_tokens": 0, "peak_output_tokens": 0,
                            "peak_cache_read_tokens": 0, "peak_cache_write_tokens": 0,
                        }}}
                    }
                }),
            );
            let repo = JsonSummaryRepository;
            let summary = repo.monthly_summary(&MonthlySummaryQuery { month });
            let dsh = &summary.by_host["dsh"];
            // total=0 → 不入 MeteredActual（金额表留空）+ freshness 照报（day
            // 存在 = 测到日，不是 Unavailable）。
            assert!(dsh.amounts_by_basis.is_empty(), "got {:?}", dsh.amounts_by_basis);
            assert!(!dsh.has_unresolved);
            assert!(dsh.freshness.last_observed_at.is_some());
            assert_ne!(dsh.freshness.state, FreshnessState::Unavailable);
        });
    }

    /// 接线结构（真机）：三宿主全进 `by_host`、不进 `excluded_hosts`；汇总
    /// 新鲜度 = 最新被观测到的宿主（不是硬编码 dsh）；非 summable 的金额
    /// （codex 的 ApiEquivalent、claude 的 MeteredEstimate/ApiEquivalent）
    /// 不得混进 `total_summable`——可汇总总额必须恰好等于各宿主 summable
    /// 档之和，估算与诊断价再大也不出现。
    #[test]
    fn monthly_summary_wires_all_hosts_without_leaking_into_total() {
        with_home(|| {
            let repo = JsonSummaryRepository;
            let summary =
                repo.monthly_summary(&MonthlySummaryQuery { month: crate::clock::current_month_beijing() });
            assert!(summary.contract_violations().is_empty(), "{:?}", summary.contract_violations());
            assert!(summary.by_host.contains_key("codex"));
            assert!(summary.by_host.contains_key("dsh"));
            assert!(summary.by_host.contains_key("claude-code"));
            assert!(!summary.excluded_hosts.contains("codex"));
            assert!(!summary.excluded_hosts.contains("claude-code"));
            assert_eq!(summary.excluded_hosts, BTreeSet::from(["workbuddy".to_string()]));
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
            seed_fact(&db, "lg-a", "claude-code", Some("model-a"), "legacy_aggregate", start + 1_000, 0, 100, 0, 0, 0);
            seed_fact(&db, "lg-b", "claude-code", Some("model-b"), "legacy_aggregate", start + 2_000, 0, 200, 0, 0, 0);
            // 实时行只覆盖 A（B 的会话文件已轮转的场景）。
            seed_fact(&db, "rt-a", "claude-code", Some("model-a"), "assistant-usage", start + 3_000, 0, 50, 0, 0, 0);
            let merged = merged_claude_days(db.conn(), start, end);
            drop(db);
            let day = &merged["2026-08-11"];
            assert_eq!(
                day["model-a"]["input_tokens"], json!(50),
                "同模型实时行赢，不与 legacy 相加"
            );
            assert_eq!(
                day["model-b"]["input_tokens"], json!(200),
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
            let (start, _) = agent_vitals_data::authority_query::beijing_day_bounds_ms(&day).unwrap();
            seed_fact(&db, "rt-a", "claude-code", Some("claude-opus-5"), "assistant-usage", start + 1_000, 0, 10, 0, 0, 1);
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
            let summary = repo.monthly_summary(&MonthlySummaryQuery { month: month.clone() });
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
            assert_eq!(summary.by_host["codex"].freshness.state, FreshnessState::Unavailable);
        });
    }

    #[test]
    fn sql_repository_reports_unavailable_with_no_facts() {
        with_home(|| {
            let repo = SqlSummaryRepository::new();
            let summary = repo.monthly_summary(&MonthlySummaryQuery { month: "2020-01".to_string() });
            assert!(summary.contract_violations().is_empty(), "{:?}", summary.contract_violations());
            for host in ["dsh", "codex", "claude-code"] {
                assert_eq!(
                    summary.by_host[host].freshness.state,
                    FreshnessState::Unavailable,
                    "host={host}"
                );
                assert!(summary.by_host[host].amounts_by_basis.is_empty(), "host={host}");
            }
            assert!(!summary.excluded_hosts.contains("dsh"));
            assert!(summary.excluded_hosts.contains("workbuddy"));
            assert_eq!(summary.coverage.measured_fields, 3);

            let daily = repo.daily_summary(&DailySummaryQuery { date: "2020-01-01".to_string() });
            assert!(daily.contract_violations().is_empty(), "{:?}", daily.contract_violations());
            assert_eq!(daily.by_host["dsh"].freshness.state, FreshnessState::Unavailable);
        });
    }

    #[test]
    fn sql_repository_rejects_a_malformed_window_without_a_guess() {
        with_home(|| {
            let repo = SqlSummaryRepository::new();
            // 格式非法（不是 YYYY-MM/YYYY-MM-DD）不能编数字——`beijing_month_
            // bounds_ms`/`beijing_day_bounds_ms` 返回 None，退化路径与"这个
            // 窗口没有任何事实"完全一样：诚实的 Unavailable，不是 panic。
            let summary = repo.monthly_summary(&MonthlySummaryQuery { month: "2026-9".to_string() });
            assert_eq!(summary.by_host["dsh"].freshness.state, FreshnessState::Unavailable);
            let daily = repo.daily_summary(&DailySummaryQuery { date: "not-a-date".to_string() });
            assert_eq!(daily.by_host["dsh"].freshness.state, FreshnessState::Unavailable);
        });
    }

    /// spec §7 Phase 3「client parity」的最小落点：同一批 token，一份走
    /// month.json（`JsonSummaryRepository`）、一份走 `usage_facts`
    /// （`SqlSummaryRepository`），两条完全独立的计价管线必须算出相同的
    /// 金额/token/新鲜度——这正是切换读路径前必须成立的对账条件（用户
    /// 2026-09-06 的确认："必须做一次本机真实数据迁移与校验"）。
    #[test]
    fn sql_repository_dsh_month_matches_json_repository_on_equivalent_data() {
        with_home(|| {
            let month = crate::clock::current_month_beijing();
            let day = crate::clock::today_beijing();
            crate::state::atomic_write_json(
                &crate::state::state_dir().join("month.json"),
                &json!({"days": {day.clone(): {"by_model": {"deepseek-v4-flash": {
                    "uncached_input_tokens": 1_000_000, "output_tokens": 100_000,
                    "cache_read_tokens": 0, "cache_write_tokens": 0,
                    "peak_uncached_input_tokens": 0, "peak_output_tokens": 0,
                    "peak_cache_read_tokens": 0, "peak_cache_write_tokens": 0,
                }}}}}),
            );
            // 同一天同一模型的同一批 token，拆两条事实（模拟两次真实调用）：
            // 700_000+300_000 uncached、60_000+40_000 output，与上面 JSON
            // 侧的 1_000_000/100_000 严格相等。
            let (day_start_ms, _) =
                agent_vitals_data::authority_query::beijing_day_bounds_ms(&day).unwrap();
            let db = seed_authority_db();
            seed_fact(&db, "f1", "dsh", Some("deepseek-v4-flash"), "turn", day_start_ms + 1_000, 0, 700_000, 0, 0, 60_000);
            seed_fact(&db, "f2", "dsh", Some("deepseek-v4-flash"), "turn", day_start_ms + 2_000, 0, 300_000, 0, 0, 40_000);
            drop(db);

            let json_summary =
                JsonSummaryRepository.monthly_summary(&MonthlySummaryQuery { month: month.clone() });
            let sql_summary = SqlSummaryRepository::new().monthly_summary(&MonthlySummaryQuery { month });
            assert!(sql_summary.contract_violations().is_empty(), "{:?}", sql_summary.contract_violations());
            assert_eq!(
                json_summary.by_host["dsh"].amounts_by_basis,
                sql_summary.by_host["dsh"].amounts_by_basis,
                "两条管线的 DSH 金额必须逐分相等"
            );
            assert_eq!(
                json_summary.tokens_by_host["dsh"].total,
                sql_summary.tokens_by_host["dsh"].total,
            );
            assert_eq!(
                json_summary.by_host["dsh"].freshness.state,
                sql_summary.by_host["dsh"].freshness.state,
            );
            assert!(sql_summary.total_summable() > 0.0);
            assert_eq!(json_summary.total_summable(), sql_summary.total_summable());
        });
    }

    /// claude 侧的 client parity：ledger JSON 与实时 SQL 事实各喂一条同样
    /// 的 (model, 4桶) 数据，`claude_day_cost` 是同一个函数——分歧只可能
    /// 来自形状拼装错误，不是计价规则本身。
    #[test]
    fn sql_repository_claude_day_matches_json_repository_on_equivalent_data() {
        with_home(|| {
            // `write_ledger` 固定写 "2026-09-02"（见其定义）——不能用
            // `today_beijing()`，否则 JSON 侧当天没有账日、daily_summary
            // 不做零用量订阅补建（那是 monthly 专属），会拿不到 per_model
            // 条目而 panic。
            let day = "2026-09-02".to_string();
            write_ledger(json!({
                "claude-opus-5": {
                    "input_tokens": 1_000_000, "cache_read_input_tokens": 0,
                    "cache_creation_input_tokens": 0, "output_tokens": 100_000,
                },
            }));
            let (start_ms, _) = agent_vitals_data::authority_query::beijing_day_bounds_ms(&day).unwrap();
            let db = seed_authority_db();
            seed_fact(&db, "f1", "claude-code", Some("claude-opus-5"), "message", start_ms + 1_000, 0, 1_000_000, 0, 0, 100_000);
            drop(db);

            let json_daily = JsonSummaryRepository.daily_summary(&DailySummaryQuery { date: day.clone() });
            let sql_daily = SqlSummaryRepository::new().daily_summary(&DailySummaryQuery { date: day });
            assert!(sql_daily.contract_violations().is_empty(), "{:?}", sql_daily.contract_violations());
            assert_eq!(
                json_daily.by_provider["claude-code/anthropic"].amounts_by_basis,
                sql_daily.by_provider["claude-code/anthropic"].amounts_by_basis,
            );
            assert_eq!(
                json_daily.tokens_by_host["claude-code"].total,
                sql_daily.tokens_by_host["claude-code"].total,
            );
        });
    }

    /// codex 侧：真实事实只带 `model_raw`、无 speed 维度——`codex_by_hour_
    /// model` 恒填 "standard"（真机也从未观测到别的值，见模块头 `_note`）。
    /// 断言金额落在 ApiEquivalent（openai 声明 subscription）且非零。
    #[test]
    fn sql_repository_codex_day_reports_api_equivalent_amount() {
        with_home(|| {
            let day = crate::clock::today_beijing();
            let (start_ms, _) = agent_vitals_data::authority_query::beijing_day_bounds_ms(&day).unwrap();
            let db = seed_authority_db();
            seed_fact(&db, "f1", "codex", Some("gpt-5.6-sol"), "token_count", start_ms + 3_600_000, 0, 800_000, 200_000, 50_000, 80_000);
            drop(db);

            let sql_daily = SqlSummaryRepository::new().daily_summary(&DailySummaryQuery { date: day });
            assert!(sql_daily.contract_violations().is_empty(), "{:?}", sql_daily.contract_violations());
            let codex = &sql_daily.by_host["codex"];
            assert!(codex.amounts_by_basis.contains_key(&BillingBasis::ApiEquivalent), "{codex:?}");
            assert!(sql_daily.tokens_by_host["codex"].total > 0);
        });
    }

    /// Phase 4.1（§6.3）：`reconcile_authority_vs_legacy`——SQL 权威库与 legacy
    /// state JSON 逐 host×bucket 对账。等价数据 → `reconciled: true` 全 exact；
    /// 故意让 SQL 少一笔 → dsh `mismatch` + `reconciled: false`；
    /// `persist_reconcile_exceptions` 把非 exact 行落 `data_quality_issues`。
    #[test]
    fn reconcile_authority_vs_legacy_exact_then_mismatch() {
        with_home(|| {
            let month = crate::clock::current_month_beijing();
            let day = format!("{month}-10");
            let (start, _) =
                agent_vitals_data::authority_query::beijing_day_bounds_ms(&day).unwrap();
            let noon = start + 12 * 3_600_000;

            // legacy: month.json 一日 DSH 桶（1M uncached / 250K cache_read）。
            let dsh_day = json!({
                "uncached_input_tokens": 1_000_000, "cache_read_tokens": 250_000,
                "cache_write_tokens": 0, "output_tokens": 100_000,
                "peak_uncached_input_tokens": 0, "peak_output_tokens": 0,
                "peak_cache_read_tokens": 0, "peak_cache_write_tokens": 0,
            });
            crate::state::atomic_write_json(
                &crate::state::state_dir().join("month.json"),
                &json!({ "days": { day.clone(): dsh_day } }),
            );
            // SQL: 同一批 token 的 usage_facts（一笔）。
            let db = seed_authority_db();
            seed_fact(&db, "d1", "dsh", Some("deepseek-v4-flash"), "turn", noon, 0,
                      1_000_000, 250_000, 0, 100_000);
            drop(db);

            // 注意：`JsonSummaryRepository` 的 codex 侧读真机 `~/.codex`（不受
            // `AGENT_VITALS_HOME` 隔离），所以全局 `reconciled` 在开发机上恒有
            // codex 噪声——本用例只钉 **dsh 行**的定性（isolated）。
            let dsh_verdict = |r: &serde_json::Value| -> String {
                r["tokens_by_host"].as_array().unwrap().iter()
                    .find(|x| x["host"] == "dsh").unwrap()["verdict"].as_str().unwrap().to_string()
            };
            let r = reconcile_authority_vs_legacy(&month);
            assert_eq!(dsh_verdict(&r), "exact", "等价数据 → dsh exact");

            // 故意制造缺口：SQL 再多一笔、legacy 不动 → dsh SQL > legacy。
            let db = agent_vitals_data::authority::AuthorityDb::open(
                &agent_vitals_data::authority::default_authority_path(&crate::home::data_home()),
                1,
            ).unwrap();
            seed_fact(&db, "d2", "dsh", Some("deepseek-v4-flash"), "turn", noon + 1000, 0,
                      500_000, 0, 0, 0);
            drop(db);
            let r2 = reconcile_authority_vs_legacy(&month);
            assert_eq!(dsh_verdict(&r2), "mismatch", "SQL 多 500K → dsh mismatch");
            assert_eq!(r2["reconciled"], json!(false), "有 mismatch → reconciled false");

            persist_reconcile_exceptions(&crate::home::data_home(), &r2).unwrap();
            let db = agent_vitals_data::authority::AuthorityDb::open(
                &agent_vitals_data::authority::default_authority_path(&crate::home::data_home()),
                1,
            ).unwrap();
            let n: i64 = db.conn().query_row(
                "SELECT COUNT(*) FROM data_quality_issues WHERE code='reconcile_mismatch'
                   AND scope_key = ?1 AND resolved_at_ms IS NULL",
                rusqlite::params![format!("{month}/dsh")], |r| r.get(0)).unwrap();
            assert_eq!(n, 1, "dsh mismatch 落一条 issue");
        });
    }
}
