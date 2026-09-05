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
    BillingBasis, DailySummary, Freshness, FreshnessState, HostAmount, MonthlySummary,
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
    let codex_no_data = || HostAmount {
        host_id: "codex".to_string(),
        amounts_by_basis: BTreeMap::new(),
        currency: None,
        has_unresolved: false,
        freshness: Freshness::unavailable(),
    };

    let merged = codex_merged_cached(home);

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
    let claude_no_data = || (HostAmount {
        host_id: "claude-code".to_string(),
        amounts_by_basis: BTreeMap::new(),
        currency: None,
        has_unresolved: false,
        freshness: Freshness::unavailable(),
    }, HostTokens::default());
    let ledger = crate::state::read_json(&crate::sessions::claude_ledger::ledger_path());
    let days = ledger
        .as_ref()
        .and_then(|l| l.get("days"))
        .and_then(|d| d.as_object())
        .map(|d| {
            let mut in_window: Vec<(&String, &serde_json::Value)> = d
                .iter()
                .filter(|(k, _)| k.starts_with(window_prefix))
                .collect();
            // 账日升序：同币求和的浮点顺序确定，跨平台字节一致。
            in_window.sort_by(|a, b| a.0.cmp(b.0));
            in_window
        })
        .unwrap_or_default();
    if days.is_empty() {
        return claude_no_data();
    }
    let mut tk = HostTokens::default();
    let pricing = agent_vitals_domain::cost::load_pricing();
    let mut cny = 0.0f64;
    let mut usd = 0.0f64;
    let mut unpriced = 0i64;
    let mut any_partial = false;
    for (date, day) in &days {
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
        let _ = date; // 排序键，循环里不用
    }
    // freshness 的观测日 = 窗口内**最晚的账日**（含全 unknown 日——观测到
    // token 就是观测，与有没有折出钱无关）。
    let latest = days.last().map(|(k, _)| k.as_str());
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
    let mut accs: BTreeMap<String, ProviderAcc> = BTreeMap::new();
    let ledger = crate::state::read_json(&crate::sessions::claude_ledger::ledger_path());
    let days = ledger
        .as_ref()
        .and_then(|l| l.get("days"))
        .and_then(|d| d.as_object())
        .map(|d| {
            let mut in_window: Vec<(&String, &serde_json::Value)> = d
                .iter()
                .filter(|(k, _)| k.starts_with(window_prefix))
                .collect();
            in_window.sort_by(|a, b| a.0.cmp(b.0));
            in_window
        })
        .unwrap_or_default();
    if days.is_empty() {
        return accs.into_iter().map(|(k, a)| {
            let host = a.finish(&k);
            (k, host)
        })
        .collect();
    }
    let pricing = agent_vitals_domain::cost::load_pricing();
    for (date, day) in &days {
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
/// token 总量，token 才是跨宿主可加的量）。返回 `{"month", "days":
/// {date: {...}}}`，无数据日字段缺省为 0/缺键——调用方以
/// `total_tokens == 0` 判定"这天没有用量"。
pub fn calendar_month(month: &str, codex_home: &Path) -> serde_json::Value {
    use serde_json::Value;
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

    // DSH：month.json（当月窗口由 read_month 过滤）逐日四桶 + priced_day
    // （认不出的旧壳形状回落 bucket_cost，与 daily_summary 同一读法）。
    let pricing = agent_vitals_domain::cost::load_pricing();
    if let Some(dsh_days) = crate::budget::read_month(Some(month)).as_ref().and_then(|d| d.as_object()) {
        for (date, day) in dsh_days {
            let tokens = dsh_day_tokens(day).total;
            let cost = agent_vitals_domain::cost::priced_day(day, &pricing)
                .unwrap_or_else(|| agent_vitals_domain::cost::bucket_cost(day, &pricing));
            let cost_val = cost
                .get("total")
                .and_then(|v| v.as_f64())
                .unwrap_or(0.0);
            let e = day_entry(&mut days, date);
            e["dsh_tokens"] = json!(tokens);
            e["dsh_cost_cny"] = json!(cost_val);
        }
    }

    // Claude：ledger 当月逐日（4 型 snake = 归一词表直读）+ claude_day_cost
    // 的 currency_totals 分币。
    if let Some(ledger) = crate::state::read_json(&crate::sessions::claude_ledger::ledger_path())
        .and_then(|l| l.get("days").and_then(|d| d.as_object()).cloned())
    {
        for (date, day) in &ledger {
            if !date.starts_with(month) {
                continue;
            }
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
    }

    // Codex：fold → merge → 月过滤小时桶（键 `YYYY-MM-DDTHH`，按日前缀聚合
    // 5 桶 token）；逐日钱取 codex_cost_report 的 days[]（cost_usd，untimed
    // 不混进某一天——codex_host_amount 同一条纪律）。
    let merged = codex_merged_cached(codex_home);
    let mut filtered = serde_json::Map::new();
    if let Some(bh) = merged["by_hour_model"].as_object() {
        for (h, v) in bh {
            if h.starts_with(month) {
                filtered.insert(h.clone(), v.clone());
            }
        }
    }
    let by_hour_model = serde_json::Value::Object(filtered);
    for (hour, models) in by_hour_model.as_object().expect("filtered is an object") {
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
        &merged["unaccounted"],
        &merged["plan"],
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
        tokens_by_host.insert("dsh".to_string(), dsh_tokens(day_value, &query.date));
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
}
