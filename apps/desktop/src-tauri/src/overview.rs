//! 菜单栏后端数据组装：读数据根的 month.json/today.json + 根下 config.toml 预算，
//! 喂给 core 的 cost 折叠，产出一个纯展示 JSON。
//!
//! **计算本体在 core**（`agent_vitals_domain::cost::{priced_day, month_cost,
//! today_cost, bucket_cost}`），这里只有文件 I/O 与组装——CLAUDE.md 教训：同一份
//! month.json 在日历/budget/菜单栏各写一份「有没有 by_model 就……」的判断，报出
//! ¥4.50 vs ¥18.00 两个价。菜单栏不重写任何定价，只调 core 的单一覆盖率校验入口。
//!
//! data_home 解析与北京日期键是**管道不是规则**：Python 侧 `paths.py`/`state.py`
//! 与二进制 `snapshot.rs`/`codex_cost.rs` 各有镜像，这里是菜单栏一份（独立
//! workspace，import 不到二进制模块）。规格与那两份逐字段一致，单测钉住。

use std::path::{Path, PathBuf};

use crate::parse_rfc3339_secs;
use agent_vitals_domain::cost::{
    bucket_cost, claude_day_cost, claude_day_total_tokens, claude_subscription_uncovered_estimate,
    load_pricing, month_cost, cache_counterfactual_cost, priced_day, today_cost,
};
use agent_vitals_domain::state::rollup_by_model;
use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};

#[derive(Serialize)]
pub struct DayRow {
    pub date: String,
    pub total: f64,
    pub peak_total: f64,
    /// "exact" | "partial"，无 by_model 的日子为 None（按 fallback 近似）。
    pub basis: Option<String>,
    pub coverage: Option<f64>,
}

/// alert.json 的预算权威字段（`budget.evaluate()` 落盘）。菜单栏**只读不重算**：
/// level/ratio/日预算/snooze 全部以这里为准——这是迁移要修的 D2 缺口
/// （Tauri 自算 remaining% 与 budget.py 规则无关）。缺场时 `source = "missing"`，
/// UI 走降级文案，不臆造百分比。
#[derive(Serialize, Default)]
pub struct BudgetAlert {
    pub level: Option<String>,
    /// 今日占比（alert.json `ratio`，今日无数据时为 null）。
    pub ratio: Option<f64>,
    /// 本月占比（alert.json `month_ratio`）。
    pub month_ratio: Option<f64>,
    pub effective_daily_budget: Option<f64>,
    pub snoozed_until: Option<String>,
    pub reasons: Option<Vec<String>>,
    pub today_cost: Option<f64>,
    pub month_cost: Option<f64>,
    pub monthly_cny: Option<f64>,
    pub peak_over: Option<bool>,
    pub adaptive_floor_applied: Option<bool>,
    /// 新鲜度源：`budget.evaluate()` 的落盘时刻。
    pub generated_at: Option<String>,
    pub schema_version: Option<String>,
    /// "alert" | "missing" —— 权威来源标记，UI 据此决定展示还是降级。
    pub source: String,
}

/// 菜单栏自身同步回路的状态：每轮 tick（发现未折会话 → oneline 折账）都会落盘
/// 一条，托盘/面板只读展示。这是「同步失败可见、可行动」的数据源——tick 的每一类
/// 结局（二进制缺失/discover 失败/oneline 失败/无未折会话/成功）都必须写成一条
/// 可展示的记录，而不是只进 stderr。`read_overview` 把它放进 Overview，UI 据此
/// 决定主入口要不要示警、给不给「立即同步」入口。
#[derive(Serialize, Deserialize, Clone)]
pub struct SyncStatus {
    /// 本轮同步是否成功结束（无未折会话也是成功——「没活干」不是故障）。
    pub ok: bool,
    /// 卡在哪一步："never" | "resolve" | "discover" | "fold"。前端用 "never"
    /// 区分「从未同步」与「同步失败」，措辞不同。
    pub stage: String,
    /// 人话原因：失败时是错误原因，成功时是「已折入 <session_id>」这类摘要。
    pub message: String,
    /// 本轮尝试的北京时间（`YYYY-MM-DD HH:MM:SS`）。无 chrono 依赖，用 `beijing_timestamp`。
    pub at: Option<String>,
}

impl Default for SyncStatus {
    fn default() -> Self {
        Self { ok: false, stage: "never".into(), message: "尚未同步".into(), at: None }
    }
}

impl SyncStatus {
    pub fn ok(stage: &str, message: String) -> Self {
        Self { ok: true, stage: stage.into(), message, at: Some(beijing_timestamp(now_unix_secs())) }
    }

    pub fn fail(stage: &str, message: String) -> Self {
        Self { ok: false, stage: stage.into(), message, at: Some(beijing_timestamp(now_unix_secs())) }
    }
}

fn now_unix_secs() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

/// 北京时间 `YYYY-MM-DD HH:MM:SS`（UTC+8 无夏令时）。复用 `civil_from_unix_secs`，
/// 不引日期库——与 data_home 解析同款「管道不是规则」的镜像位置。
fn beijing_timestamp(secs: i64) -> String {
    let (y, m, d) = civil_from_unix_secs(secs, 8 * 3600);
    let tod = (secs + 8 * 3600).rem_euclid(86400);
    let (h, mi, s) = (tod / 3600, (tod % 3600) / 60, tod % 60);
    format!("{y:04}-{m:02}-{d:02} {h:02}:{mi:02}:{s:02}")
}

/// tick 每轮结束把同步状态落盘到 `state/last-sync.json`（与 alert.json 同目录——
/// 数据根只有一份，菜单栏和 CLI 读的都是它）。
pub fn save_sync_status(status: &SyncStatus) {
    save_sync_status_at(&data_home(), status);
}

/// 参数化版——数据根由调用方指定，单测往临时目录写就能端到端验证。
pub fn save_sync_status_at(dh: &Path, status: &SyncStatus) {
    let dir = dh.join("state");
    let _ = std::fs::create_dir_all(&dir);
    if let Ok(text) = serde_json::to_string_pretty(status) {
        let _ = std::fs::write(dir.join("last-sync.json"), text);
    }
}

/// 读回上一轮同步状态；文件缺场 → 默认（"never"）。解析失败也走默认——一条坏掉
/// 的 last-sync.json 不该让面板整块红，回退成「尚未同步」即可。
fn load_sync_status(dh: &Path) -> SyncStatus {
    read_json(&dh.join("state").join("last-sync.json"))
        .and_then(|v| serde_json::from_value(v).ok())
        .unwrap_or_default()
}

/// 最近一次被折账的会话（`state/oneline.json`，`oneline` 写链每次结算末尾落盘）。
/// **纯展示，不参与任何汇总**——今日/本月的钱来自 today.json/month.json，这里只是
/// 「上一次跑完的那个会话花了多少」，是个独立问题：刚跑完一个会话的人第一时间想
/// 知道的就是它，而不用打开工作台翻会话列表。
///
/// 字段全部 Option + `present`：文件缺场（一次 oneline 都没跑过）与「跑过但某个
/// 字段是 null」是两回事，前者整条不显示，后者显示已知部分。不拿缺失字段当 0。
#[derive(Serialize, Default)]
pub struct RecentSession {
    pub present: bool,
    pub model: Option<String>,
    pub tokens_total: Option<i64>,
    pub cost_cny: Option<f64>,
    pub findings_total: Option<i64>,
    pub findings_max_severity: Option<String>,
    /// 这次结算的落盘时刻——与 alert.json 的 `generated_at` 同源同刻（两者都由
    /// 同一次 `oneline` 末尾写出），展示层判新鲜度可以复用同一个阈值。
    pub generated_at: Option<String>,
}

/// 读 `state/oneline.json`。缺场/解析失败 → `present: false`（不是全零结构）。
fn read_recent_session(dh: &Path) -> RecentSession {
    let Some(v) = read_json(&dh.join("state").join("oneline.json")) else {
        return RecentSession::default();
    };
    RecentSession {
        present: true,
        model: v.get("model").and_then(|x| x.as_str().map(String::from)),
        tokens_total: v.get("tokens_total").and_then(|x| x.as_i64()),
        cost_cny: v.get("cost_cny").and_then(|x| x.as_f64()),
        findings_total: v.get("findings_total").and_then(|x| x.as_i64()),
        findings_max_severity: v
            .get("findings_max_severity")
            .and_then(|x| x.as_str().map(String::from)),
        generated_at: v.get("generated_at").and_then(|x| x.as_str().map(String::from)),
    }
}

/// 多宿主导航行（spec §5.3）：`sessions navigation` 的宿主快照在托盘侧的落盘
/// 形状。tick 每次查询完写 `state/hosts.json`，`read_overview` 附带返回——托盘
/// 启动时 warm-start 直接渲染上一轮结果，不阻塞在冷查询上（与 today.json/
/// month.json 的持久化同款）。
///
/// **全部字段来自快照，托盘不做任何排序/求和/日界换算**（spec §5.3）——排序、
/// 日界折叠、覆盖率在数据层（`sessions navigation`）完成，这里只是落盘 + 渲染。
/// 诚实降级（spec §8）：`status == "unavailable"` → L1 全 None（「—」）、L2 禁用
/// 「会话数据暂不可用」；**不拿缺失字段当 0**——「今天没跑」是 None，「今天花了
/// 0」才是 0，两者在托盘上是两种文案。
#[derive(Serialize, Deserialize, Clone, PartialEq, Debug)]
pub struct HostRow {
    pub host_kind: String,
    /// 快照 status 原样落盘（"ready" | "partial" | "unavailable"）——L2 渲染
    /// 靠它区分「读不了」（禁用「会话数据暂不可用」）与「真零会话」（禁用
    /// 「尚无会话」），两种状态必须可区分。
    pub status: String,
    pub today_tokens: Option<i64>,
    /// `today_tokens.coverage == "partial"`（折叠 unaccounted > 0）→ L1 token
    /// 加 `≈` 前缀（spec §8）。快照的 coverage 是保守下界标注，托盘渲染时保留，
    /// 不能丢成精确值。
    pub today_partial: bool,
    pub today_sessions: Option<u64>,
    pub recent: Vec<RecentSessionRow>,
}

/// 最近会话行的落盘形状（spec §5.3）。`session_key` 存 `Value`：core `SessionKey`
/// 不 derive Serialize（`r2a.rs` 用 `to_json`/`from_json` 显式往返），这里原样
/// 存 `SessionKey::to_json()` 的四元组 JSON，深链透传给工作台（`sessions read`
/// 期待同形状）——一旦在 `HostRow` 里拆开重排，字节契约就断了。
#[derive(Serialize, Deserialize, Clone, PartialEq, Debug)]
pub struct RecentSessionRow {
    pub session_key: Value,
    pub title: Option<String>,
    /// `date_span.last` 完整日期（`YYYY-MM-DD`）；展示侧再折成 `MM-DD`/带年。
    pub date: Option<String>,
    pub model: Option<String>,
    pub tokens: Option<i64>,
}

impl HostRow {
    /// 查询失败兜底行：L1 字段全 None（托盘显示「—」）、L2 渲染禁用文案。
    /// 不臆造「0 会话 / 0 token」——失败与零是两种诚实。
    pub fn unavailable(kind: &str) -> Self {
        HostRow {
            host_kind: kind.to_string(),
            status: "unavailable".to_string(),
            today_tokens: None,
            today_partial: false,
            today_sessions: None,
            recent: Vec::new(),
        }
    }
}

/// hosts.json 落盘信封（spec §5.1 快照形状的落盘投影）：`generated_at` 是
/// `sessions navigation` 快照的生成时刻（RFC3339 UTC），托盘据此**渲染时**判
/// stale（`now - generated_at > 2 × tick`，spec §6 决策 5）——所以 stale 是派生
/// 值、不入盘（刷新失败不覆盖 hosts.json，旧的 generated_at 自然变旧 → 变 stale，
/// 这正是「保留末次成功快照」的意义）；display_name 同理是托盘侧映射（spec §4），
/// 也不入盘。
#[derive(Serialize, Deserialize, Clone, PartialEq, Debug)]
pub struct HostsSnapshot {
    pub generated_at: Option<String>,
    pub hosts: Vec<HostRow>,
}

impl HostsSnapshot {
    /// 缺场/解析失败兜底：generated_at None（无缓存 → 无 stale footer）、行集
    /// 从 core `host_capability::HOSTS` 派生（v0.6 host-contract spec §6/
    /// §11-M3，G7）——遍历 `fold != None` 的宿主，键序即 `HOSTS` 行序
    /// （dsh→codex→claude-code→workbuddy），今天恰好等于旧硬编码三行（workbuddy
    /// 尚 `fold: None`，M4 补 `HostBillTotals` 后自动出现第四行，不用再改这个
    /// 函数）。托盘永远渲染注册集里有折叠能力的宿主，数据缺失才显示「—」，
    /// spec §8。一条坏掉的 hosts.json 不该让菜单整块消失（同 last-sync.json 的
    /// 「解析失败走默认」哲学）。旧版只落两行的 hosts.json 按字面读出两行
    /// （宽容：不整盘丢弃），下一轮 tick 的新快照覆盖它。
    pub fn unavailable() -> Self {
        HostsSnapshot {
            generated_at: None,
            hosts: agent_vitals_domain::host_capability::HOSTS
                .iter()
                .filter(|h| h.fold.is_some())
                .map(|h| HostRow::unavailable(h.id))
                .collect(),
        }
    }
}

/// tick 每轮把宿主快照落盘到 `state/hosts.json`（与 last-sync.json 同目录）。
/// 镜像 `save_sync_status_at`：数据根只有一份，托盘/面板读的都是它。
pub fn save_hosts_at(dh: &Path, snap: &HostsSnapshot) {
    let dir = dh.join("state");
    let _ = std::fs::create_dir_all(&dir);
    if let Ok(text) = serde_json::to_string_pretty(snap) {
        let _ = std::fs::write(dir.join("hosts.json"), text);
    }
}

/// 读回上一轮 tick 的宿主快照。缺场/解析失败 → `HostsSnapshot::unavailable()`
/// （dsh→codex→claude-code 固定三行——托盘永远渲染固定三行，数据缺失才显示
/// 「—」，spec §8）。
pub fn read_hosts_at(dh: &Path) -> HostsSnapshot {
    read_json(&dh.join("state").join("hosts.json"))
        .and_then(|v| serde_json::from_value::<HostsSnapshot>(v).ok())
        .unwrap_or_else(HostsSnapshot::unavailable)
}

/// `sessions navigation` 快照 JSON → 落盘形状的最后一小段投影（spec §5.2 →
/// §5.3）。**宽容解析**：单字段坏 → None，不整盘丢弃——一条字段报错不该让两个
/// 宿主一起消失。`today_tokens` 整个对象可能是 null（Codex 无计量时），
/// `get("value")` 在 null 上是 None，恰好走诚实降级。宿主顺序原样保留——快照的
/// dsh→codex 序是数据层的字节契约（r2a_store.rs），托盘不重排（§5.3「不做任何
/// 排序」）。hosts 数组缺失/不是数组 → 空 vec（落盘后 read 侧 unavailable 兜底，
/// 与「真零」「失败」都无关，是形状违约的防御）。
pub fn host_rows_from_navigation(snap: &Value) -> Vec<HostRow> {
    let Some(hosts) = snap.get("hosts").and_then(Value::as_array) else {
        return Vec::new();
    };
    hosts
        .iter()
        .map(|h| HostRow {
            host_kind: h["host_kind"].as_str().unwrap_or_default().to_string(),
            // status 缺场 → unavailable（未知状态按「读不了」渲染，不冒充零）。
            status: h["status"].as_str().unwrap_or("unavailable").to_string(),
            today_tokens: h
                .get("today_tokens")
                .and_then(|t| t.get("value"))
                .and_then(Value::as_i64),
            today_partial: h
                .get("today_tokens")
                .and_then(|t| t.get("coverage"))
                .and_then(Value::as_str)
                == Some("partial"),
            today_sessions: h["today_sessions"].as_u64(),
            recent: h
                .get("recent")
                .and_then(Value::as_array)
                .map(|rs| {
                    rs.iter()
                        .map(|r| RecentSessionRow {
                            // 原样透传 SessionKey::to_json 的 4 字段对象——深链时
                            // `sessions read` 期待同形状（字节契约）。
                            session_key: r
                                .get("session_key")
                                .cloned()
                                .unwrap_or(Value::Null),
                            title: r["title"].as_str().map(String::from),
                            date: r["date_last"].as_str().map(String::from),
                            model: r["model"].as_str().map(String::from),
                            tokens: r["tokens_total"].as_i64(),
                        })
                        .collect()
                })
                .unwrap_or_default(),
        })
        .collect()
}

#[derive(Serialize)]
pub struct Overview {
    pub data_home: String,
    pub today: Option<Value>,
    pub month: Value,
    pub days: Vec<DayRow>,
    pub budget_monthly_cny: f64,
    pub budget: BudgetAlert,
    /// 最近一次折账的会话（oneline.json）。托盘菜单展示「上一次跑完花了多少」。
    pub recent: RecentSession,
    /// 菜单栏同步回路状态（tick 落盘）。前端据此示警/给「立即同步」入口。
    pub sync: SyncStatus,
    /// 多宿主导航行（tick 落盘 hosts.json）。托盘据此渲染 L1 宿主行 + L2 最近会话。
    pub hosts: Vec<HostRow>,
    /// hosts.json 的 `generated_at`（RFC3339 UTC）——托盘渲染时据此判 stale
    /// （spec §6 决策 5），与 hosts 同源同刻，拆开是因为 stale 是派生值不入盘。
    pub hosts_generated_at: Option<String>,
    pub estimate_note: String,
    /// Claude Code 成本估（账卡分列，D2）：`claude_today` = core `claude_day_cost`
    /// 折 claude-ledger 当日 flat 直图的整报告；`claude_month` = 当月逐日
    /// currency_totals 聚合。两者 None = 没有可报价的账日（无账文件 / 当日缺场 /
    /// 当月无账——「没账可报」≠「估 0」，托盘不显示那一段）。钱在**读时**算：
    /// ledger 只存 token，价表会变 token 不会（与 DSH month.json 同一条纪律）。
    pub claude_today: Option<Value>,
    pub claude_month: Option<Value>,
    /// Claude Code 当日 4 型 token 总量（ledger 当日存在 → Some，含计价认不出的
    /// unknown 模型——消耗量与价目卡无关）。托盘合并行 `· N tokens` 用它拼
    /// 「今日合并 token」；`claude_today` 的报告只带钱，token 数在 money 之外要
    /// 单独量（v1.3 合并总账，见 MENUBAR spec）。「当日缺场 → None」与
    /// `claude_today` 同语义，但两者独立：全 unknown 日 = 有 token、无钱。
    pub claude_today_tokens: Option<i64>,
    /// v0.7 spec §3 第二行菜单栏视图：month.json by_model 折平后做 DSH 8 桶
    /// → Claude 4 型 snake 适配（peak_* 丢弃、其他键按 catalog 输入约定改名），
    /// 喂 core `claude_subscription_uncovered_estimate`。`pricing_basis` 已被
    /// core 函数改写为 `estimated-subscription-exclusion`，不在这里二次加工。
    /// 月无 by_model → None（不摆全零结构，与 `claude_month` 同款诚实降级）。
    pub claude_uncovered_month: Option<Value>,
    /// v0.7 spec §3 第三行菜单栏视图：month.json by_model 折平后直接喂
    /// core `cache_counterfactual_cost`（月级无 `providers`，各家模型走 fallback
    /// 价卡，与 `priced_day` 对同一份 month.json 的处理一致）。无缓存命中的
    /// 语料下 ratio 恒为 1.0（spec §3 原文引用，2026-09-02 实测值），不是
    /// bug——这是"当前能表达的节约来源只有缓存"这一事实的忠实反映。月无 by_model
    /// → None。
    pub month_savings: Option<Value>,
    /// 展示层货币折算估算（`assets/pricing.json::fx_estimate` → `{usd_cny, as_of}`）
    /// 或 None。**只给速览层**把混币金额并成一个 `≈` 数——预算/导出/对账永远
    /// 分币。前端 hover 据此把 `≈¥X` 展开成原始分币。
    pub fx: Option<Value>,
}

/// 数据根（镜像 `paths.py::data_home` / `snapshot.rs::data_home_from` 的优先序）：
/// `AGENT_VITALS_HOME` → `SKILL_VITALS_HOME` → `~/.agent-vitals`（已存在或 legacy
/// 不存在时）→ `~/.skill-vitals`。
pub fn data_home() -> PathBuf {
    data_home_from(
        &|k| match std::env::var(k) {
            Ok(v) if !v.trim().is_empty() => Some(v),
            _ => None,
        },
        PathBuf::from(std::env::var("HOME").unwrap_or_default()),
    )
}

/// 纯函数版数据根选择——env 源由调用方注入，单测不用碰真实环境变量。
/// 与 `snapshot.rs::data_home_from` 同一组分支（那边有 4 条同值测试）。
fn data_home_from<F>(get_env: &F, home: PathBuf) -> PathBuf
where
    F: Fn(&str) -> Option<String>,
{
    for var in ["AGENT_VITALS_HOME", "SKILL_VITALS_HOME"] {
        if let Some(path) = get_env(var) {
            return PathBuf::from(path);
        }
    }
    let current = home.join(".agent-vitals");
    let legacy = home.join(".skill-vitals");
    if current.exists() || !legacy.exists() {
        current
    } else {
        legacy
    }
}

/// 北京时区（UTC+8，无夏令时）今天 → `YYYY-MM-DD`。算法逐字段镜像二进制
/// `codex_cost.rs::civil_from_unix_secs`（Howard Hinnant 的 civil_from_days，
/// div_euclid 版，负 epoch 也正确）。
pub fn today_beijing() -> String {
    let secs = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);
    let (y, m, d) = civil_from_unix_secs(secs, 8 * 3600);
    format!("{y:04}-{m:02}-{d:02}")
}

/// unix 秒 → 某时区（offset 秒）的 (年, 月, 日)。pub(crate)：lib.rs 的
/// `recent_row_text` 做「date 是否当年」判定（北京年，与导航 day_key 同日界）
/// 复用同一实现，不长第二份历法。
pub(crate) fn civil_from_unix_secs(secs: i64, offset_secs: i64) -> (i64, u32, u32) {
    let days = (secs + offset_secs).div_euclid(86400);
    let z = days + 719468;
    let era = z.div_euclid(146097);
    let doe = z - era * 146097;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = if m <= 2 { y + 1 } else { y };
    (y, m as u32, d as u32)
}

fn read_json(path: &Path) -> Option<Value> {
    let text = std::fs::read_to_string(path).ok()?;
    serde_json::from_str(&text).ok()
}

/// config.toml `[budget] monthly_cny`，缺省 600（与 `budget.py::default_budget` 的
/// monthly_cny 同值）。极简解析镜像 `budget.py` 的 `_parse_scalar` 范围：只认
/// `[budget]` 节里的 snake_case 标量，不引 toml 依赖。
fn monthly_budget_cny(data_home: &Path) -> f64 {
    let Some(text) = std::fs::read_to_string(data_home.join("config.toml")).ok() else {
        return 600.0;
    };
    let mut in_budget = false;
    for line in text.lines() {
        let t = line.trim();
        if t.starts_with('[') && t.ends_with(']') {
            in_budget = t == "[budget]";
            continue;
        }
        if in_budget {
            if let Some(eq) = t.find('=') {
                let key = t[..eq].trim();
                let val = t[eq + 1..].trim();
                if key == "monthly_cny" {
                    if let Ok(x) = val.trim_end_matches(',').parse::<f64>() {
                        return x;
                    }
                }
            }
        }
    }
    600.0
}

/// 展示层货币折算估算（`assets/pricing.json::fx_estimate`）→ `{usd_cny, as_of}`
/// 或 None（价表无此节 / 值非数）。**只给速览层**把混币金额并成一个 `≈` 数给
/// 用户一个感觉——预算 ratio / 实际支出 / 导出 / 对账永远分币不相加。前端
/// hover 用它把 `≈¥X` 展开成「$A 折 + ¥B 实」。
fn fx_estimate(pricing: &Value) -> Option<Value> {
    let fx = pricing.get("fx_estimate")?;
    let usd_cny = fx.get("USD_CNY").and_then(Value::as_f64).filter(|r| *r > 0.0)?;
    Some(json!({
        "usd_cny": usd_cny,
        "as_of": fx.get("as_of").and_then(Value::as_str),
    }))
}

/// 读 alert.json 的预算权威字段（`budget.evaluate()` 落盘）。**只读字段，不重算
/// level/ratio**——这是迁移要修的 D2 缺口（Tauri 自算 remaining% 与 budget.py 规则
/// 无关）。文件缺场或解析失败 → `source = "missing"`、字段全 None，UI 降级文案，
/// 不臆造百分比。
fn read_budget_alert(dh: &Path) -> BudgetAlert {
    let Some(v) = read_json(&dh.join("state").join("alert.json")) else {
        return BudgetAlert { source: "missing".into(), ..Default::default() };
    };
    let get = |k: &str| v.get(k).cloned();
    BudgetAlert {
        level: get("level").and_then(|x| x.as_str().map(String::from)),
        ratio: get("ratio").and_then(|x| x.as_f64()),
        month_ratio: get("month_ratio").and_then(|x| x.as_f64()),
        effective_daily_budget: get("effective_daily_budget").and_then(|x| x.as_f64()),
        snoozed_until: get("snoozed_until").and_then(|x| x.as_str().map(String::from)),
        reasons: get("reasons").and_then(|x| x.as_array().map(|a| {
            a.iter().filter_map(|r| r.as_str().map(String::from)).collect()
        })),
        today_cost: get("today_cost").and_then(|x| x.as_f64()),
        month_cost: get("month_cost").and_then(|x| x.as_f64()),
        monthly_cny: get("monthly_cny").and_then(|x| x.as_f64()),
        peak_over: get("peak_over").and_then(|x| x.as_bool()),
        adaptive_floor_applied: get("adaptive_floor_applied").and_then(|x| x.as_bool()),
        generated_at: get("generated_at").and_then(|x| x.as_str().map(String::from)),
        schema_version: get("schema_version").and_then(|x| x.as_str().map(String::from)),
        source: "alert".into(),
    }
}

pub fn read_overview() -> Overview {
    read_overview_at(&data_home())
}

/// 参数化的组装入口——数据根由调用方指定，单测往临时目录写 month.json/today.json
/// 就能端到端验证组装（读文件 → core 折叠 → 展示 JSON），不必碰真实环境变量。
fn read_overview_at(dh: &Path) -> Overview {
    let state = dh.join("state");
    let pricing = load_pricing();
    let today = today_beijing();

    // 今日：date 必须真的是今天 —— core 的 `today_cost` 判（stale → None，不是
    // 把昨天的账当今天的报）。date 缺场的老数据也交给 core 决定。
    let today_val = read_json(&state.join("today.json"))
        .and_then(|d| today_cost(&d, &pricing, &today));

    // 本月：month.json 的 days map → core `month_cost`；读不到/无 days → {0,0}，
    // 不臆造。**必须按当月过滤**——`month.json` 只在下一次真的有新数据要写时
    // 才会把跨月的旧内容迁进 `month-archive.json`（`merge_month` 的迁移是
    // 写触发的，不是时间触发的）；如果日历月已经翻页但还没有任何新会话被折过
    // 一次账，`month.json` 会原封不动停在上个月，不过滤就会把上个月的总额当
    // "本月"展示。真实事故（2026-09-01）：当天 DSH 无新会话可折，`month.json`
    // 仍是 8 月内容，总览把 ¥1752.4 标成"本月"、预算卡片显示 292% 超支——数字
    // 全部真实存在，只是贴错了月份标签。`read_month_days_at`（日历 tab 的 IPC）
    // 早就有这条"读哪个月只认哪个月的键"的防御性过滤（见其文档注释），这里之前
    // 没有——现在共用同一个 `filter_days_to_month`，不再各写一份判断。
    let cur_month = current_month_beijing();
    let month_val = read_json(&state.join("month.json"))
        .and_then(|m| m.get("days").cloned())
        .map(|d| filter_days_to_month(&d, &cur_month))
        .unwrap_or_else(|| json!({}));
    let month = month_cost(&month_val, &pricing);
    let month_total = month.get("total").and_then(|x| x.as_f64()).unwrap_or(0.0);

    // 逐日行：`priced_day`（唯一覆盖率校验入口）→ 无 by_model 的日子退回
    // `bucket_cost` 的 fallback 近似。与 core `month_cost` 内部同一套判断。
    let mut days = Vec::new();
    if let Some(map) = month_val.as_object() {
        for (date, day) in map {
            days.push(day_to_row(date, day, &pricing));
        }
        days.sort_by(|a, b| a.date.cmp(&b.date));
    }

    // 预算卡的"本月"数字必须跟"本月"卡片同一个口径（当月过滤后的 month.total）。
    // alert.json 是**评估时所在月份**的快照——日历翻页但没有新会话触发过重新评估
    // 时（真实事故 2026-09-01：alert.json 停在 8 月最后一次 oneline 的 292% 超支，
    // 本月卡片同一时刻已经因当月过滤显示 ¥0），原样端出去就是把上个月的判定贴成
    // 这个月的现状，两个卡片自相矛盾。这里把 month 字段换成当月真实值、level 退成
    // 中性 "ok"——不是臆造一个"一切正常"的判定（真正的判定要等这个月第一次折账后
    // 由 budget.evaluate() 重新给出；UI 的 5 分钟过期标记照常挂上），而是不把上月的
    // "over" 错判成这个月超支。alert 是当月评估（北京月 == cur_month）则原样权威。
    let mut budget = read_budget_alert(dh);
    if budget.level.is_some()
        && budget.generated_at.as_deref().and_then(alert_beijing_month).as_deref()
            != Some(cur_month.as_str())
    {
        budget.month_cost = Some(month_total);
        budget.month_ratio =
            budget.monthly_cny.filter(|c| *c > 0.0).map(|c| month_total / c);
        budget.level = Some("ok".to_string());
    }

    // 多宿主导航快照：读一次 hosts.json，拆成 hosts + generated_at 两个字段
    //（后者供托盘判 stale）。**不做任何排序**——快照的 dsh→codex 序是数据层的
    // 字节契约，托盘只渲染（spec §5.3「托盘不做任何排序/求和/日界换算」）。
    let hosts_snap = read_hosts_at(dh);

    // Claude Code 估（账卡分列，D2）：读 claude-ledger.json 逐日账 → core
    // `claude_day_cost`（flat 直图，rebuild_days 真机形状）折钱。账文件缺/解析
    // 失败 → (None, None)（诚实「无账可报」，不把缺账当估 0）。当月聚合按
    // `cur_month` 过滤——ledger 写时已滚动只装当月（claude_sync 全量重建），读时
    // 仍只认当月键：日历翻页但还没跑过新一轮 claude-sync 时 ledger 可能还停在上
    // 个月，不过滤就会把上个月的折算当"本月"贴标签（month.json month-stale 事故
    // 的同款纪律；flat 日结构不同，`filter_days_to_month` 不适用）。
    let claude_days = read_json(&state.join("claude-ledger.json"))
        .and_then(|l| l.get("days").cloned())
        .and_then(|d| d.as_object().cloned())
        .unwrap_or_default();
    let (claude_today, claude_month, claude_today_tokens) =
        claude_estimates(&claude_days, &today, &cur_month, &pricing);

    // v0.7 spec §3 第二/三行菜单栏视图：month.json by_model 折平后分别喂
    // `claude_subscription_uncovered_estimate` 与 `cache_counterfactual_cost`。
    // 共用 `core::state::rollup_by_model`（与 CLI `state by-model` 同源字节），
    // 同一份已按 `cur_month` 过滤的 `month_val`——避免在 Tauri 层重复实现
    // 折平逻辑、与 `month_cost` 等核心计算口径不同源就是漂移。两视图输入形状
    // 略不同：uncovered 要 8 桶 → 4 型 snake 适配（peak_* 丢弃 + 键改名），
    // savings 直接吃 8 桶 by_model（DSH 计价面语义）。两者都喂 core 单一
    // 决策点；月无 by_model → (None, None) 同款诚实降级。
    let month_rollup = rollup_by_model(&json!({"days": &month_val}));
    let month_rollup_empty = month_rollup
        .as_object().is_none_or(|m| m.is_empty());
    let (claude_uncovered_month, month_savings) = if month_rollup_empty {
        (None, None)
    } else {
        // DSH 8 桶 → Claude 4 型 snake 适配（与 Python `cli.py` 走同一套）。
        let mut claude_models = Map::new();
        if let Some(obj) = month_rollup.as_object() {
            for (model, buckets) in obj {
                let Some(b) = buckets.as_object() else { continue };
                claude_models.insert(
                    model.clone(),
                    json!({
                        "input_tokens": b.get("uncached_input_tokens").cloned().unwrap_or(json!(0)),
                        "cache_read_input_tokens": b.get("cache_read_tokens").cloned().unwrap_or(json!(0)),
                        "cache_creation_input_tokens": b.get("cache_write_tokens").cloned().unwrap_or(json!(0)),
                        "output_tokens": b.get("output_tokens").cloned().unwrap_or(json!(0)),
                    }),
                );
            }
        }
        let uncovered = claude_subscription_uncovered_estimate(&claude_models, &pricing);
        let savings = cache_counterfactual_cost(&json!({"by_model": month_rollup}), &pricing);
        (uncovered, savings)
    };

    Overview {
        data_home: dh.display().to_string(),
        today: today_val,
        month,
        days,
        budget_monthly_cny: monthly_budget_cny(dh),
        budget,
        recent: read_recent_session(dh),
        sync: load_sync_status(dh),
        hosts: hosts_snap.hosts,
        hosts_generated_at: hosts_snap.generated_at,
        estimate_note: "估算值，不是账单；覆盖率不足的日子按 fallback 价补齐并标注".to_string(),
        claude_today,
        claude_month,
        claude_today_tokens,
        claude_uncovered_month,
        month_savings,
        fx: fx_estimate(&pricing),
    }
}

/// claude-ledger 的逐日 flat 账（`{date: {model: 4 型 snake}}`）→ (今日估报告,
/// 当月聚合, 今日 token 总量)。纯函数——today/cur_month 由调用方注入，单测不碰
/// 系统钟。
///
/// · 今日 = core `claude_day_cost` 直出的整报告（per_model 也在，哪天面板想画
///   模型分列不用改这里的契约）；
/// · 当月 = 各账日 `currency_totals` 逐日合并（claude 无时段价、同币相加安全；
///   只算 cur_month 前缀的日子）；
/// · 今日 token = `claude_day_total_tokens`（core，与 `claude_day_cost` 同一对日
///   形状嗅探），当日存在 → Some——包括全 unknown 的「有量无量价」日。
/// 今日缺场 / 当月没有任何可报价账日 → 对应侧 None。`days` 为空 map → (None,
/// None, None)。
fn claude_estimates(
    days: &serde_json::Map<String, Value>,
    today: &str,
    cur_month: &str,
    pricing: &Value,
) -> (Option<Value>, Option<Value>, Option<i64>) {
    let today_report = days.get(today).and_then(|day| claude_day_cost(day, pricing));
    let today_tokens = days.get(today).map(claude_day_total_tokens);
    let mut cny = 0.0f64;
    let mut usd = 0.0f64;
    let mut n = 0u32;
    for (date, day) in days {
        if !date.starts_with(cur_month) {
            continue;
        }
        if let Some(r) = claude_day_cost(day, pricing) {
            cny += r
                .get("currency_totals")
                .and_then(|c| c.get("CNY"))
                .and_then(Value::as_f64)
                .unwrap_or(0.0);
            usd += r
                .get("currency_totals")
                .and_then(|c| c.get("USD"))
                .and_then(Value::as_f64)
                .unwrap_or(0.0);
            n += 1;
        }
    }
    let month_report = if n > 0 {
        Some(json!({
            "currency_totals": {"CNY": cny, "USD": usd},
            "days": n,
            "estimate_disclaimer": "按模型族官方卡折算的估算，不是账单",
        }))
    } else {
        None
    };
    (today_report, month_report, today_tokens)
}

/// 一天的成本行：`priced_day`（唯一覆盖率校验入口）→ 无 by_model 的日子退回
/// `bucket_cost` 的 fallback 近似。与 core `month_cost` 内部同一套判断。面板逐日
/// 列表与工作台日历共用这一份映射——同一份 month.json 只允许有一个「有没有
/// by_model 就……」的判断（CLAUDE.md 的 cost 教训：日历/budget/菜单栏各写一份，
/// 报出 ¥4.50 vs ¥18.00）。
fn day_to_row(date: &str, day: &Value, pricing: &Value) -> DayRow {
    let (total, peak, basis, coverage) = match priced_day(day, pricing) {
        Some(c) => (
            c["total"].as_f64().unwrap_or(0.0),
            c["peak_total"].as_f64().unwrap_or(0.0),
            c["pricing_basis"].as_str().map(|s| s.to_string()),
            c["coverage"].as_f64(),
        ),
        None => {
            let c = bucket_cost(day, pricing);
            (c["total"].as_f64().unwrap_or(0.0), c["peak_total"].as_f64().unwrap_or(0.0), None, None)
        }
    };
    DayRow { date: date.to_string(), total, peak_total: peak, basis, coverage }
}

/// 北京当前月 `YYYY-MM`（`today_beijing()` 的前 7 位）。工作台日历默认落在当月。
pub fn current_month_beijing() -> String {
    today_beijing()[..7].to_string()
}

/// alert.json `generated_at`（RFC3339 UTC）落进的北京月 `YYYY-MM`，与
/// `current_month_beijing()` 同口径（UTC+8 无夏令时）。必须按北京时区翻转：
/// 9 月 1 日凌晨 01:00 的折账写的是 `2026-08-31T17:00:00+00:00`，UTC 月还是
/// 8 月、北京已经进 9 月——直接取字符串前 7 位会把一条全新的当月评估误判成
/// 上月残留（错误触发 budget 的 month-stale 覆盖）。解析失败 → None（没有
/// 新鲜度信息 = 没有月份归属，调用方按保守口径处理）。
fn alert_beijing_month(gen: &str) -> Option<String> {
    let secs = parse_rfc3339_secs(gen)?;
    Some(beijing_timestamp(secs)[..7].to_string())
}

/// 月键合法性：`YYYY-MM`（len 7、第 5 字符 '-'、余为数字）。IPC 是外部面，一个
/// 乱串不该 panic、也不该被当成有数据处理——非法键与「该月无数据」同形。
fn is_month_key(s: &str) -> bool {
    let b = s.as_bytes();
    b.len() == 7
        && b[4] == b'-'
        && b[..4].iter().all(|c| c.is_ascii_digit())
        && b[5..].iter().all(|c| c.is_ascii_digit())
}

/// 任意月逐日数据。当月 → `state/month.json` 的 days（防御性按 month 过滤——
/// month.json 理论上只装当月，但历史遗留可能混入外月行，读哪个月就只认哪个月的
/// 键，镜像二进制 `budget.rs::read_month` 的语义）；历史 → `state/month-archive.json`
/// 的 `/months/{month}/days`。返回（当月 days map，逐日行）——map 已过滤到该月，
/// 所以 `month_cost(map)` 与逐行求和必然一致。没有该月数据 → `None`（不是
/// `Some+空`：前端据此显示「该月暂无数据」，不摆全零结构）。
///
/// **第三份镜像**：二进制 `budget.rs::read_month` 私有且 src-tauri 是独立
/// workspace import 不到，这里与 data_home/北京日期键同款「管道不是规则」的镜像
/// 位置，单测钉死，后续可收进 core。
pub fn read_month_days_at(dh: &Path, month: &str, pricing: &Value) -> Option<(Value, Vec<DayRow>)> {
    if !is_month_key(month) {
        return None;
    }
    let state = dh.join("state");
    let raw = if month == current_month_beijing() {
        read_json(&state.join("month.json"))
            .and_then(|m| m.get("days").cloned())
            .unwrap_or_else(|| json!({}))
    } else {
        read_json(&state.join("month-archive.json"))
            .and_then(|a| {
                a.get("months")
                    .and_then(|ms| ms.get(month))
                    .and_then(|mo| mo.get("days"))
                    .cloned()
            })
            .unwrap_or_else(|| json!({}))
    };
    let filtered = filter_days_to_month(&raw, month);
    let mut rows = Vec::new();
    if let Some(map) = filtered.as_object() {
        for (date, day) in map {
            rows.push(day_to_row(date, day, pricing));
        }
    }
    rows.sort_by(|a, b| a.date.cmp(&b.date));
    if rows.is_empty() {
        None
    } else {
        Some((filtered, rows))
    }
}

/// 把一份 days map 过滤到只保留属于 `month`（"YYYY-MM"）的键。两种情况会让
/// `month.json`/`month-archive.json` 混入不属于目标月的行：①历史遗留脏数据；
/// ②日历月已经翻页，但 `merge_month` 的滚档迁移是写触发的，还没有新数据落盘
/// 就不会迁移，`month.json` 会原样停在上个月（真实事故见 `read_overview_at`
/// 的调用点注释）。`read_overview_at`（总览"本月"卡片）与 `read_month_days_at`
/// （日历 tab IPC）现在共用这一份"读哪个月只认哪个月的键"的判断，不再各写一份
/// ——这正是本文件顶部注释警告过的"同一份 month.json 各写一份判断，报出两个价"
/// 在读侧的镜像版本。
fn filter_days_to_month(raw: &Value, month: &str) -> Value {
    let mut filtered = serde_json::Map::new();
    if let Some(map) = raw.as_object() {
        for (date, day) in map {
            if date.starts_with(month) {
                filtered.insert(date.clone(), day.clone());
            }
        }
    }
    Value::Object(filtered)
}

/// 工作台日历 IPC 的响应组装。Some → `{month, days, total, peak_total,
/// has_data:true}`，月总额走 core `month_cost`（与总览同一入口，不重加行）；
/// None → `{month, days:[], total:null, peak_total:null, has_data:false}`——
/// 诚实空，前端显示「该月暂无数据」，不出现 ¥0 格子。
pub fn month_response(month: &str, result: Option<(Value, Vec<DayRow>)>, pricing: &Value) -> Value {
    match result {
        Some((raw, rows)) => {
            let totals = month_cost(&raw, pricing);
            json!({
                "month": month,
                "days": rows,
                "total": totals["total"].as_f64().unwrap_or(0.0),
                "peak_total": totals["peak_total"].as_f64().unwrap_or(0.0),
                "has_data": true,
            })
        }
        None => json!({
            "month": month,
            "days": [],
            "total": Value::Null,
            "peak_total": Value::Null,
            "has_data": false,
        }),
    }
}

/// 工作台日历 IPC 的 Rust 侧一次性组装：读月 + 定价 + 响应。命令只薄转发这里，
/// pricing 的加载留在 overview（`load_pricing` 已在这层 import）——IPC 命令不
/// 碰定价细节。
pub fn read_month_json(month: &str) -> Value {
    let pricing = load_pricing();
    month_response(month, read_month_days_at(&data_home(), month, &pricing), &pricing)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// v0.6 host-contract spec §6/§11-M3（G7）：托盘的兜底行不再是本文件的
    /// 硬编码三行，而是从 core `host_capability::HOSTS` 派生——遍历
    /// `fold != None` 的宿主。今天恰好等于旧硬编码（workbuddy 仍
    /// `fold: None`），行为零变化；M4 给 workbuddy 补 `HostBillTotals` 后，
    /// 这条测试的期望需要同步改成四行——那正是"注册集派生"要买的东西：
    /// 加宿主不用回来改这个函数，只需要改 HOSTS 行。
    #[test]
    fn hosts_snapshot_unavailable_derives_from_hosts_registry_fold_capability() {
        let snap = HostsSnapshot::unavailable();
        let kinds: Vec<&str> = snap.hosts.iter().map(|h| h.host_kind.as_str()).collect();
        assert_eq!(kinds, vec!["dsh", "codex", "claude-code"]);
        for h in &snap.hosts {
            assert_eq!(h.status, "unavailable");
        }
        assert!(snap.generated_at.is_none());
        // workbuddy 声明 fold: None，不该出现在兜底行里。
        assert!(!kinds.contains(&"workbuddy"));
    }

    /// 北京日期键与二进制 `codex_cost.rs` 同一算法：给出固定 epoch 秒，断言
    /// 产出的 YYYY-MM-DD。1787846400 = 2026-08-28 00:00 北京（= 2026-08-27T16:00Z，
    /// 用 civil_from_days 反算核过：1787788800 = 2026-08-27T00:00Z）。
    #[test]
    fn civil_from_unix_secs_pins_beijing_date() {
        let (y, m, d) = civil_from_unix_secs(1787846400, 8 * 3600);
        assert_eq!((y, m, d), (2026, 8, 28));
        // 再退 1 秒 → 北京 2026-08-27 23:59:59，日期不应进位。
        let (y, m, d) = civil_from_unix_secs(1787846399, 8 * 3600);
        assert_eq!((y, m, d), (2026, 8, 27));
    }

    /// 负 epoch（1970 年前）也正确 —— div_euclid 而不是截断除法。
    #[test]
    fn civil_from_unix_secs_handles_negative_epoch() {
        // -1 = 1969-12-31T23:59:59Z，北京 = 1970-01-01 07:59:59。
        let (y, m, d) = civil_from_unix_secs(-1, 8 * 3600);
        assert_eq!((y, m, d), (1970, 1, 1));
    }

    /// data_home 优先序（纯函数版，env 由测试注入）：显式 env 覆盖 > ~/.agent-vitals
    /// （存在或 legacy 不存在）> ~/.skill-vitals。与 snapshot.rs 的同名测试同一组断言。
    #[test]
    fn data_home_prefers_explicit_env() {
        let tmp = std::env::temp_dir().join("sv-menubar-data-home-test");
        let _ = std::fs::remove_dir_all(&tmp);
        std::fs::create_dir_all(&tmp).unwrap();
        let get = |k: &str| match k {
            "AGENT_VITALS_HOME" => Some(tmp.join("explicit-a").to_string_lossy().into_owned()),
            "SKILL_VITALS_HOME" => Some(tmp.join("explicit-b").to_string_lossy().into_owned()),
            _ => None,
        };
        // AGENT_VITALS_HOME 优先于 SKILL_VITALS_HOME。
        assert_eq!(
            data_home_from(&get, tmp.clone()),
            tmp.join("explicit-a")
        );
        // 只设 SKILL_VITALS_HOME → 用它。
        let get_b = |k: &str| match k {
            "SKILL_VITALS_HOME" => Some(tmp.join("explicit-b").to_string_lossy().into_owned()),
            _ => None,
        };
        assert_eq!(data_home_from(&get_b, tmp.clone()), tmp.join("explicit-b"));
        // 无 env：~/.agent-vitals 存在 → 用它。
        std::fs::create_dir_all(tmp.join(".agent-vitals")).unwrap();
        let none = |_: &str| None;
        assert_eq!(data_home_from(&none, tmp.clone()), tmp.join(".agent-vitals"));
        // 无 env、~/.agent-vitals 不存在、~/.skill-vitals 存在 → 用 legacy。
        std::fs::remove_dir_all(tmp.join(".agent-vitals")).unwrap();
        std::fs::create_dir_all(tmp.join(".skill-vitals")).unwrap();
        assert_eq!(data_home_from(&none, tmp.clone()), tmp.join(".skill-vitals"));
        // 两个都不存在 → 默认 ~/.agent-vitals。
        std::fs::remove_dir_all(tmp.join(".skill-vitals")).unwrap();
        assert_eq!(data_home_from(&none, tmp.clone()), tmp.join(".agent-vitals"));
        let _ = std::fs::remove_dir_all(&tmp);
    }

    /// config.toml 缺省预算 = 600（与 budget.py 的 default_budget.monthly_cny）。
    /// 临时目录名带用途后缀——cargo test 并行执行，两条预算测试必须各用各的目录，
    /// 否则一条 remove_dir_all 会删掉另一条刚写好的 config.toml。
    #[test]
    fn monthly_budget_defaults_to_600() {
        let tmp = std::env::temp_dir().join("sv-menubar-budget-default-test");
        let _ = std::fs::remove_dir_all(&tmp);
        std::fs::create_dir_all(&tmp).unwrap();
        assert_eq!(monthly_budget_cny(&tmp), 600.0);
        let _ = std::fs::remove_dir_all(&tmp);
    }

    /// config.toml 里 `[budget] monthly_cny` 生效，其他节的同名字段不算。
    #[test]
    fn monthly_budget_reads_budget_section_only() {
        let tmp = std::env::temp_dir().join("sv-menubar-budget-read-test");
        let _ = std::fs::remove_dir_all(&tmp);
        std::fs::create_dir_all(&tmp).unwrap();
        std::fs::write(
            tmp.join("config.toml"),
            "[other]\nmonthly_cny = 1\n[budget]\nmonthly_cny = 888\n",
        )
        .unwrap();
        assert_eq!(monthly_budget_cny(&tmp), 888.0);
        let _ = std::fs::remove_dir_all(&tmp);
    }

    /// 组装级测试：临时数据根里放 month.json（exact 日 + legacy 日）+ today.json
    /// （今天的 date）+ config.toml，`read_overview_at` 应该产出与 core 单测同一组
    /// 数字——今日 1.5、本月 4.5（1.5 + 3.0）、两行逐日（按日期排序）、预算 888。
    /// 夹具逐字来自 core `cost.rs` 的 `month_cost_sums_exact_and_legacy_days`。
    ///
    /// 日期用 `current_month_beijing()` 动态拼，不写死 "2026-08"——写死过一次，
    /// 真实时钟从 2026-08 跳到 2026-09 之后这条测试本该跟着 `read_overview_at`
    /// 新加的当月过滤一起变红（月份不匹配 → 过滤成 0），但夹具本来就该跟着"今天"
    /// 走，不是钉在某个写死的月份上（`read_month_days_at_filters_current_month`
    /// 已经是这个写法，这里补齐）。
    #[test]
    fn read_overview_assembles_state_into_expected_numbers() {
        let tmp = std::env::temp_dir().join("sv-menubar-overview-test");
        let _ = std::fs::remove_dir_all(&tmp);
        std::fs::create_dir_all(tmp.join("state")).unwrap();

        let cm = current_month_beijing();
        let legacy = serde_json::json!({
            "uncached_input_tokens": 1000000, "output_tokens": 0,
            "cache_read_tokens": 0, "cache_write_tokens": 0,
            "peak_uncached_input_tokens": 0, "peak_output_tokens": 0,
            "peak_cache_read_tokens": 0, "peak_cache_write_tokens": 0,
        });
        let exact_day = serde_json::json!({
            "uncached_input_tokens": 1000000, "output_tokens": 0,
            "cache_read_tokens": 0, "cache_write_tokens": 0,
            "peak_uncached_input_tokens": 0, "peak_output_tokens": 0,
            "peak_cache_read_tokens": 0, "peak_cache_write_tokens": 0,
            "by_model": {"deepseek-v4-flash": legacy},
        });
        let month = serde_json::json!({
            "month": cm,
            "days": {
                format!("{cm}-01"): exact_day,
                format!("{cm}-02"): serde_json::json!({ "uncached_input_tokens": 2000000, "output_tokens": 0,
                    "cache_read_tokens": 0, "cache_write_tokens": 0,
                    "peak_uncached_input_tokens": 0, "peak_output_tokens": 0,
                    "peak_cache_read_tokens": 0, "peak_cache_write_tokens": 0 }),
            },
        });
        std::fs::write(tmp.join("state").join("month.json"), month.to_string()).unwrap();

        // today.json 的 date 用 today_beijing()（与 app 运行时同一个「今天」）。
        let today = today_beijing();
        let today_json = serde_json::json!({
            "date": today,
            "by_model": {"deepseek-v4-flash": legacy},
        });
        std::fs::write(tmp.join("state").join("today.json"), today_json.to_string()).unwrap();
        std::fs::write(tmp.join("config.toml"), "[budget]\nmonthly_cny = 888\n").unwrap();

        let ov = read_overview_at(&tmp);
        let today_total = ov.today.expect("today.json 的 date 就是今天").get("total").unwrap().as_f64().unwrap();
        assert!((today_total - 1.5).abs() < 1e-9, "今日应 1.5，got {today_total}");
        let month_total = ov.month.get("total").unwrap().as_f64().unwrap();
        assert!((month_total - 4.5).abs() < 1e-9, "本月应 4.5（1.5+3.0），got {month_total}");
        assert_eq!(ov.days.len(), 2);
        assert_eq!(ov.days[0].date, format!("{cm}-01"));
        assert_eq!(ov.days[0].basis.as_deref(), Some("exact"));
        assert_eq!(ov.days[1].date, format!("{cm}-02"));
        assert_eq!(ov.days[1].basis, None);
        assert!((ov.days[1].total - 3.0).abs() < 1e-9);
        assert_eq!(ov.budget_monthly_cny, 888.0);

        let _ = std::fs::remove_dir_all(&tmp);
    }

    /// **真机回归**（2026-09-01）：`month.json` 停在上个月（日历翻页了，但还没
    /// 有新数据触发过 `merge_month` 的滚档迁移），`read_overview_at` 必须把
    /// "本月"过滤成空，不能把上个月的总额当本月展示——之前正是这样：8 月账目
    /// ¥1752.4、预算卡片显示 292% 超支，而当天其实还没有任何一笔本月支出。
    #[test]
    fn read_overview_does_not_show_last_months_total_as_this_month() {
        let tmp = std::env::temp_dir().join("sv-menubar-overview-stale-month-test");
        let _ = std::fs::remove_dir_all(&tmp);
        std::fs::create_dir_all(tmp.join("state")).unwrap();

        // 拿"上个月"造一份还停在原地的 month.json——不管真实当前月是几月，
        // 上一个日历月总能算出来，不用写死具体年月。
        let cm = current_month_beijing();
        let (y, m): (i64, i64) = {
            let mut it = cm.split('-');
            (it.next().unwrap().parse().unwrap(), it.next().unwrap().parse().unwrap())
        };
        let (py, pm) = if m == 1 { (y - 1, 12) } else { (y, m - 1) };
        let prev_month = format!("{py:04}-{pm:02}");

        let day = serde_json::json!({
            "uncached_input_tokens": 1000000, "output_tokens": 0,
            "cache_read_tokens": 0, "cache_write_tokens": 0,
            "peak_uncached_input_tokens": 0, "peak_output_tokens": 0,
            "peak_cache_read_tokens": 0, "peak_cache_write_tokens": 0,
        });
        let month = serde_json::json!({
            "month": prev_month,
            "days": { format!("{prev_month}-15"): day },
        });
        std::fs::write(tmp.join("state").join("month.json"), month.to_string()).unwrap();

        let ov = read_overview_at(&tmp);
        let month_total = ov.month.get("total").unwrap().as_f64().unwrap();
        assert_eq!(month_total, 0.0, "上月滚存的 month.json 不该被当成本月总额展示");
        assert!(ov.days.is_empty(), "上月的逐日行不该出现在本月逐日列表里");

        let _ = std::fs::remove_dir_all(&tmp);
    }

    /// **真机回归**（2026-09-01）：日历翻页、当月还没有任何会话触发过 oneline
    /// 重新评估时，alert.json 停在**上个月**最后一次评估（level "over"、month_cost
    /// ¥1752.4、month_ratio 2.92）。`read_overview_at` 之前把它原样端给预算卡——
    /// 工作台显示 292% 超支、日预算 ¥30，旁边"本月"卡片同一时刻因当月过滤显示
    /// ¥0，两个数字自相矛盾（上面那条回归只修了 month 卡片，预算卡的月份标签当时
    /// 漏了——这就是用户看到「预算 292% ⚠ 超支 ¥1752.4」时的真实状态）。预算卡的
    /// month 字段必须换成当月真实值（core 当月过滤的 month.total）、level 退成中性
    /// "ok"——不把上月的 "over" 错判成这个月超支，真正的判定等这个月第一次折账后
    /// 由 budget.evaluate() 重新给出。
    #[test]
    fn read_overview_does_not_apply_last_months_alert_to_this_month() {
        let tmp = std::env::temp_dir().join("sv-menubar-overview-stale-alert-test");
        let _ = std::fs::remove_dir_all(&tmp);
        std::fs::create_dir_all(tmp.join("state")).unwrap();

        // "上个月"（不管真实当前月是几月都能算出来，不写死具体年月）。
        let cm = current_month_beijing();
        let (y, m): (i64, i64) = {
            let mut it = cm.split('-');
            (it.next().unwrap().parse().unwrap(), it.next().unwrap().parse().unwrap())
        };
        let (py, pm) = if m == 1 { (y - 1, 12) } else { (y, m - 1) };
        let prev_month = format!("{py:04}-{pm:02}");

        // month.json 停在上一月（没有新数据触发过 merge_month 滚档迁移）。
        let day = serde_json::json!({
            "uncached_input_tokens": 1000000, "output_tokens": 0,
            "cache_read_tokens": 0, "cache_write_tokens": 0,
            "peak_uncached_input_tokens": 0, "peak_output_tokens": 0,
            "peak_cache_read_tokens": 0, "peak_cache_write_tokens": 0,
        });
        let month = serde_json::json!({
            "month": prev_month,
            "days": { format!("{prev_month}-15"): day },
        });
        std::fs::write(tmp.join("state").join("month.json"), month.to_string()).unwrap();

        // alert.json 停在上一月的判定：level over、month_cost ¥1752.4、month_ratio 2.92。
        // generated_at 落在上一月（UTC 中午 +8h 仍在当月，稳，不碰月末/月初翻转）。
        let alert = serde_json::json!({
            "level": "over",
            "ratio": null,
            "month_ratio": 2.92,
            "effective_daily_budget": 30.0,
            "snoozed_until": null,
            "reasons": ["month at 292% of monthly budget (¥1752.40 / ¥600.00)"],
            "today_cost": 22.4,
            "month_cost": 1752.4,
            "monthly_cny": 600.0,
            "peak_over": false,
            "adaptive_floor_applied": false,
            "generated_at": format!("{prev_month}-15T04:00:00+00:00"),
            "schema_version": "1.0.0",
        });
        std::fs::write(tmp.join("state").join("alert.json"), alert.to_string()).unwrap();

        let ov = read_overview_at(&tmp);
        // 本月卡片：上月的 month.json 被过滤成空 → ¥0。
        assert_eq!(ov.month.get("total").unwrap().as_f64().unwrap(), 0.0);
        // 预算卡：不再端上月的 292% 超支——month 字段换成本月真实值、level 中性。
        let b = &ov.budget;
        assert_eq!(b.source, "alert");
        assert_eq!(b.month_cost, Some(0.0), "预算卡不得显示上月的 ¥1752.4");
        assert_eq!(b.month_ratio, Some(0.0), "预算卡不得显示上月的 292%");
        assert_eq!(b.level.as_deref(), Some("ok"), "上月的 over 不得当本月超支");
        // generated_at 保留——UI 的 5 分钟过期标记照常挂，不误显"一切正常"。
        assert_eq!(
            b.generated_at.as_deref(),
            Some(format!("{prev_month}-15T04:00:00+00:00").as_str())
        );

        let _ = std::fs::remove_dir_all(&tmp);
    }

    /// 方向守卫：alert.json 是**当月**评估的 → month_cost/month_ratio/level 原样
    /// 权威，不覆盖。防把修复写反——一旦月份匹配判错（比如拿 UTC 月当北京月，
    /// 或者漏了 +8h 翻转），当月真实超支会被中性化成 "ok"，超支告警就静默丢了。
    /// 故意不写 month.json：空月下也绝不能误伤当月评估。
    #[test]
    fn read_overview_keeps_current_month_alert_authoritative() {
        let tmp = std::env::temp_dir().join("sv-menubar-overview-current-alert-test");
        let _ = std::fs::remove_dir_all(&tmp);
        std::fs::create_dir_all(tmp.join("state")).unwrap();

        let cm = current_month_beijing();
        let alert = serde_json::json!({
            "level": "warn",
            "ratio": null,
            "month_ratio": 0.1667,
            "effective_daily_budget": 30.0,
            "snoozed_until": null,
            "reasons": ["month at 17% of monthly budget (¥100.00 / ¥600.00)"],
            "today_cost": null,
            "month_cost": 100.0,
            "monthly_cny": 600.0,
            "peak_over": false,
            "adaptive_floor_applied": false,
            "generated_at": format!("{cm}-15T04:00:00+00:00"),
            "schema_version": "1.0.0",
        });
        std::fs::write(tmp.join("state").join("alert.json"), alert.to_string()).unwrap();

        let ov = read_overview_at(&tmp);
        let b = &ov.budget;
        assert_eq!(b.level.as_deref(), Some("warn"), "当月评估的 level 必须原样权威");
        assert_eq!(b.month_cost, Some(100.0), "当月评估的 month_cost 不得被覆盖成 ¥0");
        assert_eq!(b.month_ratio, Some(0.1667), "当月评估的 month_ratio 不得被重算");

        let _ = std::fs::remove_dir_all(&tmp);
    }

    /// 空态诚实：数据根没有任何 state 文件 → today None（不是 0 元）、month {0,0}、
    /// days 空、预算回默认 600。不摆全零结构冒充「今天花了 0 元」。
    #[test]
    fn read_overview_empty_state_is_honest() {
        let tmp = std::env::temp_dir().join("sv-menubar-overview-empty-test");
        let _ = std::fs::remove_dir_all(&tmp);
        std::fs::create_dir_all(tmp.join("state")).unwrap();
        let ov = read_overview_at(&tmp);
        assert!(ov.today.is_none());
        assert_eq!(ov.month.get("total").unwrap().as_f64().unwrap(), 0.0);
        assert!(ov.days.is_empty());
        assert_eq!(ov.budget_monthly_cny, 600.0);
        // alert.json 缺场 → budget.source == "missing"（UI 走「等预算数据」降级）。
        assert_eq!(ov.budget.source, "missing");
        assert!(ov.budget.level.is_none() && ov.budget.month_ratio.is_none());
        // 无 claude-ledger.json → claude 估两侧 None（诚实「没账可报」，不摆估 0）。
        assert!(ov.claude_today.is_none());
        assert!(ov.claude_month.is_none());
        assert!(ov.claude_today_tokens.is_none());
        // fx 来自 pricing.json（内嵌，与 state 无关）——空 state 也有。
        assert_eq!(
            ov.fx.as_ref().and_then(|f| f.get("usd_cny")).and_then(Value::as_f64),
            Some(7.15),
        );
        let _ = std::fs::remove_dir_all(&tmp);
    }

    /// `fx_estimate` 提取：pricing.json 有 `fx_estimate` 节 → `{usd_cny, as_of}`；
    /// 缺节 / 值非正 → None（展示层据此退回分币旧行为，不折算）。
    #[test]
    fn fx_estimate_reads_rate_or_degrades() {
        let p = load_pricing();
        let fx = fx_estimate(&p).expect("pricing.json 有 fx_estimate 节");
        assert_eq!(fx["usd_cny"].as_f64(), Some(7.15));
        assert_eq!(fx["as_of"].as_str(), Some("2026-09"));
        assert!(fx_estimate(&json!({})).is_none(), "无节 → None");
        assert!(fx_estimate(&json!({"fx_estimate": {"USD_CNY": 0}})).is_none(), "非正汇率 → None");
        assert!(fx_estimate(&json!({"fx_estimate": {"as_of": "x"}})).is_none(), "缺 USD_CNY → None");
    }

    /// claude_estimates 纯函数：flat 直图日（rebuild_days 真机形状，含全零的
    /// `<synthetic>` 未知模型键）→ 今日整报告 + 当月聚合。今日缺场 / 当月无任何
    /// 可报价账日 → None；上个月的账不进当月聚合（ledger 读时仍只认当月键）。
    #[test]
    fn claude_estimates_mix_currencies_and_filter_month() {
        let pricing = load_pricing();
        let zero_day = json!({"<synthetic>": {
            "input_tokens": 0, "cache_read_input_tokens": 0,
            "cache_creation_input_tokens": 0, "output_tokens": 0}});
        let day_1 = json!({"deepseek-v4-flash": {
            "input_tokens": 2_000_000, "cache_read_input_tokens": 10_000_000,
            "cache_creation_input_tokens": 0, "output_tokens": 400_000},
            "claude-sonnet-5": {
                "input_tokens": 1_000_000, "cache_read_input_tokens": 2_000_000,
                "cache_creation_input_tokens": 0, "output_tokens": 100_000}});
        let day_2 = json!({"claude-sonnet-5": {
            "input_tokens": 100_000, "cache_read_input_tokens": 0,
            "cache_creation_input_tokens": 0, "output_tokens": 20_000}});
        let mut days = serde_json::Map::new();
        days.insert("2026-09-01".into(), day_1.clone());
        days.insert("2026-09-02".into(), day_2);
        days.insert("2026-08-31".into(), day_1); // 上月：不进当月聚合
        days.insert("2026-09-03".into(), zero_day); // 全零未知模型日：不可报价
        let (today, month, today_tokens) =
            claude_estimates(&days, "2026-09-02", "2026-09", &pricing);
        assert_eq!(today_tokens, Some(120_000), "今日 token = 当日全部模型 4 型求和");

        let today_r = today.expect("当日 flat 直图必须可报价");
        let tcny = today_r["currency_totals"]["CNY"].as_f64().unwrap();
        let tusd = today_r["currency_totals"]["USD"].as_f64().unwrap();
        assert!(tcny == 0.0, "当日只有 claude-sonnet-5 → CNY 侧应为 0，got {tcny}");
        assert!(tusd > 0.0, "claude-sonnet-5 按 anthropic USD 卡折算");

        let month_r = month.expect("当月两天可报价");
        assert_eq!(month_r["days"].as_u64().unwrap(), 2, "上月 08-31 与全零日不计入");
        // 聚合 = 当月各可报价日的 currency_totals 逐项相加
        let d1_r = claude_day_cost(&days["2026-09-01"], &pricing).unwrap();
        let expect_cny = d1_r["currency_totals"]["CNY"].as_f64().unwrap();
        let expect_usd = d1_r["currency_totals"]["USD"].as_f64().unwrap()
            + today_r["currency_totals"]["USD"].as_f64().unwrap();
        assert!((month_r["currency_totals"]["CNY"].as_f64().unwrap() - expect_cny).abs() < 1e-9);
        assert!((month_r["currency_totals"]["USD"].as_f64().unwrap() - expect_usd).abs() < 1e-9);

        // 缺今日 / 空 map → 对应 None（token 总量同日缺席 → None）
        let (t_missing, m_ok, tk_missing) = claude_estimates(&days, "2026-09-09", "2026-09", &pricing);
        assert!(t_missing.is_none() && m_ok.is_some() && tk_missing.is_none());
        let empty = serde_json::Map::new();
        let (t_e, m_e, tk_e) = claude_estimates(&empty, "2026-09-02", "2026-09", &pricing);
        assert!(t_e.is_none() && m_e.is_none() && tk_e.is_none());
    }

    /// 端到端：claude-ledger.json（写当日 flat 直图 + 当月 + 上月残留）→
    /// read_overview_at 的 claude_today/claude_month 落位，上月残留不进"本月"。
    #[test]
    fn read_overview_embeds_claude_ledger_estimates() {
        let tmp = std::env::temp_dir().join("sv-menubar-claude-ledger-overview-test");
        let _ = std::fs::remove_dir_all(&tmp);
        std::fs::create_dir_all(tmp.join("state")).unwrap();
        let today = today_beijing();
        let other_month = if &today[5..7] == "01" {
            format!("{}-12", &today[..4])
        } else {
            format!("{:04}-{:02}", today[..4].parse::<i32>().unwrap(),
                    today[5..7].parse::<u32>().unwrap() - 1)
        };
        let day = json!({"claude-sonnet-5": {
            "input_tokens": 500_000, "cache_read_input_tokens": 0,
            "cache_creation_input_tokens": 0, "output_tokens": 50_000}});
        let mut days_map = serde_json::Map::new();
        days_map.insert(today.clone(), day.clone());
        days_map.insert(format!("{other_month}-15"), day);
        let ledger = json!({"days": days_map});
        std::fs::write(
            tmp.join("state").join("claude-ledger.json"),
            serde_json::to_string(&ledger).unwrap(),
        )
        .unwrap();
        let ov = read_overview_at(&tmp);
        let today_r = ov.claude_today.expect("当日 ledger 必须折出估");
        assert!(today_r["currency_totals"]["USD"].as_f64().unwrap() > 0.0);
        assert_eq!(ov.claude_today_tokens, Some(550_000), "token 与钱同源同日结构");
        let month_r = ov.claude_month.expect("当月必须有一日");
        assert_eq!(month_r["days"].as_u64().unwrap(), 1, "上月残留 15 日不进本月");
        assert!((month_r["currency_totals"]["CNY"].as_f64().unwrap() - 0.0).abs() < 1e-9);
        let _ = std::fs::remove_dir_all(&tmp);
    }

    /// alert.json 解析：真机形态（2026-08-30 实测 schema）的字段逐个落位，
    /// source == "alert"。generated_at 保留为新鲜度源，UI 只读不重算百分比。
    #[test]
    fn read_budget_alert_parses_real_shaped_alert() {
        let tmp = std::env::temp_dir().join("sv-menubar-alert-parse-test");
        let _ = std::fs::remove_dir_all(&tmp);
        std::fs::create_dir_all(tmp.join("state")).unwrap();
        std::fs::write(
            tmp.join("state").join("alert.json"),
            r#"{
              "adaptive_floor_applied": false,
              "effective_daily_budget": 30.0,
              "generated_at": "2026-08-30T07:04:38.548588+00:00",
              "level": "ok",
              "month_cost": 12.7887157,
              "month_ratio": 0.021314526166666667,
              "monthly_cny": 600.0,
              "peak_over": false,
              "peak_share": null,
              "ratio": null,
              "reasons": ["month at 2% of monthly budget (¥12.79 / ¥600.00)"],
              "schema_version": "1.0.0",
              "snoozed_until": null,
              "today_cost": null,
              "today_peak_cost": null
            }"#,
        )
        .unwrap();

        let a = read_budget_alert(&tmp);
        assert_eq!(a.source, "alert");
        assert_eq!(a.level.as_deref(), Some("ok"));
        assert_eq!(a.effective_daily_budget, Some(30.0));
        assert_eq!(a.month_ratio, Some(0.021314526166666667));
        assert!(a.ratio.is_none(), "今日无数据 → ratio 应为 null");
        assert_eq!(a.snoozed_until, None);
        assert_eq!(a.reasons.as_ref().unwrap().len(), 1);
        assert_eq!(
            a.generated_at.as_deref(),
            Some("2026-08-30T07:04:38.548588+00:00")
        );
        assert_eq!(a.schema_version.as_deref(), Some("1.0.0"));
        assert_eq!(a.month_cost, Some(12.7887157));

        let ov = read_overview_at(&tmp);
        assert_eq!(ov.budget.source, "alert");
        assert_eq!(ov.budget.level.as_deref(), Some("ok"));
        let _ = std::fs::remove_dir_all(&tmp);
    }

    /// alert.json 是合法 JSON 但缺关键字段 → 该字段 None、source 仍为 "alert"
    /// （文件在，只是不全）；UI 据此可以显示部分权威值，不退回整行降级。
    #[test]
    fn read_budget_alert_tolerates_partial_alert() {
        let tmp = std::env::temp_dir().join("sv-menubar-alert-partial-test");
        let _ = std::fs::remove_dir_all(&tmp);
        std::fs::create_dir_all(tmp.join("state")).unwrap();
        std::fs::write(tmp.join("state").join("alert.json"), r#"{"level":"ok"}"#).unwrap();
        let a = read_budget_alert(&tmp);
        assert_eq!(a.source, "alert");
        assert_eq!(a.level.as_deref(), Some("ok"));
        assert!(a.month_ratio.is_none() && a.snoozed_until.is_none());
        let _ = std::fs::remove_dir_all(&tmp);
    }

    /// SyncStatus::ok/fail 构造函数：ok 标志对、stage 对、at 是北京时间（非 None）。
    /// at 的格式由 `beijing_timestamp` 单独钉住，这里只钉「落盘的是可展示时刻」。
    #[test]
    fn sync_status_constructors_flag_and_stage() {
        let ok = SyncStatus::ok("fold", "已折入 s1".into());
        assert!(ok.ok && ok.stage == "fold" && ok.message == "已折入 s1");
        assert!(ok.at.is_some());
        let fail = SyncStatus::fail("discover", "agent-vitals discover 失败".into());
        assert!(!fail.ok && fail.stage == "discover");
        assert!(fail.at.is_some());
    }

    /// 北京时间戳：1787846400 = 2026-08-28 00:00 北京（civil_from_unix_secs 同款
    /// 夹具）。格式 `YYYY-MM-DD HH:MM:SS`，面板可直接展示。
    #[test]
    fn beijing_timestamp_pins_known_epoch() {
        assert_eq!(beijing_timestamp(1787846400), "2026-08-28 00:00:00");
        // +8h → 同日 08:00:00；跨天进位也正确（再 +24h → 08-29）。
        assert_eq!(beijing_timestamp(1787846400 + 8 * 3600), "2026-08-28 08:00:00");
        assert_eq!(beijing_timestamp(1787846400 + 32 * 3600), "2026-08-29 08:00:00");
    }

    /// 缺场默认：没有 last-sync.json → "never / 尚未同步"，ok=false——这是「首次
    /// 启动、还没跑过 tick」的诚实空态，不是失败也不是成功。
    #[test]
    fn sync_status_defaults_to_never_when_missing() {
        let tmp = std::env::temp_dir().join("sv-menubar-sync-missing-test");
        let _ = std::fs::remove_dir_all(&tmp);
        std::fs::create_dir_all(tmp.join("state")).unwrap();
        let s = load_sync_status(&tmp);
        assert!(!s.ok && s.stage == "never" && s.message == "尚未同步" && s.at.is_none());
        let _ = std::fs::remove_dir_all(&tmp);
    }

    /// 落盘↔读回往返：save_sync_status_at 写的 JSON 能被 load_sync_status 原样读回
    /// （stage/message/at 不丢）。这是「同步结果可展示」的存储侧契约。
    #[test]
    fn save_then_load_sync_status_round_trips() {
        let tmp = std::env::temp_dir().join("sv-menubar-sync-roundtrip-test");
        let _ = std::fs::remove_dir_all(&tmp);
        std::fs::create_dir_all(tmp.join("state")).unwrap();
        let status = SyncStatus::fail("oneline", "oneline 失败（exit 1）：boom".into());
        save_sync_status_at(&tmp, &status);
        let back = load_sync_status(&tmp);
        assert!(!back.ok && back.stage == "oneline");
        assert_eq!(back.message, "oneline 失败（exit 1）：boom");
        assert!(back.at.is_some());
        let _ = std::fs::remove_dir_all(&tmp);
    }

    /// Overview 组装包含 sync：往临时数据根写 last-sync.json，read_overview_at 的
    /// ov.sync 应该原样带出——面板/托盘读 Overview 就能拿到同步状态，不需要第二条
    /// IPC 或第二个文件读取。
    #[test]
    fn read_overview_embeds_sync_status() {
        let tmp = std::env::temp_dir().join("sv-menubar-sync-overview-test");
        let _ = std::fs::remove_dir_all(&tmp);
        std::fs::create_dir_all(tmp.join("state")).unwrap();
        save_sync_status_at(&tmp, &SyncStatus::ok("fold", "已折入 sess-x".into()));
        let ov = read_overview_at(&tmp);
        assert!(ov.sync.ok && ov.sync.stage == "fold");
        assert_eq!(ov.sync.message, "已折入 sess-x");
        let _ = std::fs::remove_dir_all(&tmp);
    }

    /// hosts.json 往返：save_hosts_at 写的快照（generated_at + 两行，含 partial
    /// 态）能由 read_hosts_at 原样读回。session_key 用 `SessionKey::to_json()` 的
    /// 真实形状构造——这是「深链透传给工作台」的字节契约：读回后必须仍能过
    /// `SessionKey::from_json`，一旦在 HostRow 里拆开重排，`sessions read` 就认
    /// 不出它了。
    #[test]
    fn hosts_save_then_read_round_trips() {
        use agent_vitals_domain::r2a::SessionKey;
        let tmp = std::env::temp_dir().join("sv-menubar-hosts-roundtrip-test");
        let _ = std::fs::remove_dir_all(&tmp);
        std::fs::create_dir_all(tmp.join("state")).unwrap();
        let key = SessionKey::new("dsh", "sess-1", "default", "m1").to_json();
        let saved = HostsSnapshot {
            generated_at: Some("2026-09-01T02:31:00Z".into()),
            hosts: vec![
                HostRow {
                    host_kind: "dsh".into(),
                    status: "partial".into(),
                    today_tokens: Some(1234),
                    today_partial: true,
                    today_sessions: Some(2),
                    recent: vec![RecentSessionRow {
                        session_key: key.clone(),
                        title: Some("重构 r2a 查询".into()),
                        date: Some("2026-08-28".into()),
                        model: Some("deepseek-v4-flash".into()),
                        tokens: Some(88000),
                    }],
                },
                HostRow::unavailable("codex"),
            ],
        };
        save_hosts_at(&tmp, &saved);
        let back = read_hosts_at(&tmp);
        assert_eq!(back, saved);
        assert!(
            SessionKey::from_json(&back.hosts[0].recent[0].session_key).is_some(),
            "落盘的 session_key 必须仍是 SessionKey::to_json 形状"
        );
        let _ = std::fs::remove_dir_all(&tmp);
    }

    /// 缺场兜底：没有 hosts.json → generated_at None + 固定三行 unavailable
    /// （dsh→codex→claude-code，status "unavailable"），L1 全 None——托盘永远
    /// 渲染三行，「—」是缺失不是 0；无 generated_at 也就无 stale footer（从未
    /// 成功过）。
    #[test]
    fn hosts_missing_falls_back_to_three_unavailable_rows() {
        let tmp = std::env::temp_dir().join("sv-menubar-hosts-missing-test");
        let _ = std::fs::remove_dir_all(&tmp);
        std::fs::create_dir_all(tmp.join("state")).unwrap();
        let snap = read_hosts_at(&tmp);
        assert!(snap.generated_at.is_none());
        let hosts = &snap.hosts;
        assert_eq!(hosts.len(), 3);
        assert_eq!(hosts[0].host_kind, "dsh");
        assert_eq!(hosts[1].host_kind, "codex");
        assert_eq!(hosts[2].host_kind, "claude-code");
        assert!(hosts
            .iter()
            .all(|h| h.status == "unavailable"
                && h.today_tokens.is_none()
                && h.today_sessions.is_none()
                && h.recent.is_empty()));
        let _ = std::fs::remove_dir_all(&tmp);
    }

    /// 解析失败兜底：hosts.json 是合法 JSON 但形状不对（数组而不是信封对象）→
    /// 同缺场回退。一条坏文件不该让菜单整块消失。
    #[test]
    fn hosts_parse_failure_falls_back_to_unavailable() {
        let tmp = std::env::temp_dir().join("sv-menubar-hosts-corrupt-test");
        let _ = std::fs::remove_dir_all(&tmp);
        std::fs::create_dir_all(tmp.join("state")).unwrap();
        std::fs::write(tmp.join("state").join("hosts.json"), r#"["dsh"]"#).unwrap();
        let snap = read_hosts_at(&tmp);
        assert!(snap.generated_at.is_none());
        let hosts = &snap.hosts;
        assert_eq!(hosts.len(), 3);
        assert_eq!(hosts[0].host_kind, "dsh");
        assert_eq!(hosts[1].host_kind, "codex");
        assert_eq!(hosts[2].host_kind, "claude-code");
        assert!(hosts.iter().all(|h| h.status == "unavailable"));
        let _ = std::fs::remove_dir_all(&tmp);
    }

    /// Overview 组装包含 hosts：往临时数据根写 hosts.json，read_overview_at 的
    /// ov.hosts 原样带出 + ov.hosts_generated_at 同源；空态（无 hosts.json）→
    /// generated_at None + 固定两行 unavailable。托盘读 Overview 一次就拿到宿主
    /// 行，不需要第二条 IPC 或第二个文件读取。
    #[test]
    fn read_overview_embeds_hosts() {
        let tmp = std::env::temp_dir().join("sv-menubar-hosts-overview-test");
        let _ = std::fs::remove_dir_all(&tmp);
        std::fs::create_dir_all(tmp.join("state")).unwrap();
        save_hosts_at(
            &tmp,
            &HostsSnapshot {
                generated_at: Some("2026-09-01T02:31:00Z".into()),
                hosts: vec![
                    HostRow::unavailable("dsh"),
                    HostRow::unavailable("codex"),
                ],
            },
        );
        let ov = read_overview_at(&tmp);
        assert_eq!(ov.hosts.len(), 2);
        assert_eq!(ov.hosts[0].host_kind, "dsh");
        assert!(ov.hosts[0].status == "unavailable");
        assert_eq!(
            ov.hosts_generated_at.as_deref(),
            Some("2026-09-01T02:31:00Z")
        );

        let tmp2 = std::env::temp_dir().join("sv-menubar-hosts-overview-empty-test");
        let _ = std::fs::remove_dir_all(&tmp2);
        std::fs::create_dir_all(tmp2.join("state")).unwrap();
        let ov2 = read_overview_at(&tmp2);
        // hosts.json 缺场 → 固定三行 unavailable（dsh→codex→claude-code）。
        assert_eq!(ov2.hosts.len(), 3);
        assert_eq!(ov2.hosts[0].host_kind, "dsh");
        assert_eq!(ov2.hosts[1].host_kind, "codex");
        assert_eq!(ov2.hosts[2].host_kind, "claude-code");
        assert!(ov2.hosts_generated_at.is_none());
        let _ = std::fs::remove_dir_all(&tmp);
        let _ = std::fs::remove_dir_all(&tmp2);
    }

    /// `sessions navigation` 快照 → HostRow 映射：完整形状逐字段落位、null 的
    /// today_tokens 对象（Codex 无计量）诚实 None、status 缺场 → unavailable、
    /// hosts 数组缺失 → 空 vec。映射规则全在这——托盘菜单只渲染不重算。
    #[test]
    fn host_rows_from_navigation_maps_snapshot_fields() {
        let snap = serde_json::json!({
            "schema_version": 1,
            "generated_at": "2026-09-01T02:31:00Z",
            "hosts": [
                {
                    "host_kind": "dsh",
                    "status": "ready",
                    "today_tokens": {"value": 1398214, "basis": "state-file", "coverage": "complete"},
                    "today_sessions": 3,
                    "recent": [{
                        "session_key": {"host_kind": "dsh", "native_id": "s1", "source_profile": null, "machine_namespace": null},
                        "title": "重构 r2a 查询",
                        "model": "deepseek-v4-flash",
                        "tokens_total": 88000,
                        "date_first": "2026-08-27",
                        "date_last": "2026-08-28",
                        "revision": "2026-08-28"
                    }],
                    "store_revision": 7
                },
                {
                    "host_kind": "codex",
                    "status": "partial",
                    // Codex 无计量时 today_tokens 是整对象 null——get("value") 为
                    // None，恰好走诚实降级（「—」），不把 null 当成 0。
                    "today_tokens": null,
                    "today_sessions": null,
                    "recent": [],
                    "store_revision": 0
                }
            ]
        });
        let rows = host_rows_from_navigation(&snap);
        assert_eq!(rows.len(), 2);
        assert_eq!(rows[0].host_kind, "dsh");
        assert_eq!(rows[0].status, "ready");
        assert_eq!(rows[0].today_tokens, Some(1398214));
        assert!(!rows[0].today_partial, "coverage=complete → 无 ≈");
        assert_eq!(rows[0].today_sessions, Some(3));
        assert_eq!(rows[0].recent.len(), 1);
        assert_eq!(rows[0].recent[0].title.as_deref(), Some("重构 r2a 查询"));
        assert_eq!(rows[0].recent[0].date.as_deref(), Some("2026-08-28"));
        assert_eq!(rows[0].recent[0].tokens, Some(88000));
        // session_key 原样透传（4 字段对象）——深链 `sessions read` 的字节契约。
        assert_eq!(
            rows[0].recent[0].session_key["native_id"],
            serde_json::json!("s1")
        );
        assert_eq!(rows[1].host_kind, "codex");
        assert_eq!(rows[1].status, "partial");
        assert_eq!(rows[1].today_tokens, None, "null 对象 → None，不编 0");
        assert_eq!(rows[1].today_sessions, None);
        assert!(rows[1].recent.is_empty());
    }

    /// 宽容解析的两个防御面：partial 覆盖率 → today_partial（≈ 前缀的数据来源），
    /// hosts 数组缺失 → 空 vec（不 panic、不整盘丢弃）。
    #[test]
    fn host_rows_from_navigation_partial_coverage_and_missing_hosts() {
        let partial = serde_json::json!({
            "hosts": [{
                "host_kind": "codex",
                "status": "ready",
                "today_tokens": {"value": 15000, "basis": "events", "coverage": "partial"},
                "today_sessions": 1,
                "recent": [],
                "store_revision": 3
            }]
        });
        let rows = host_rows_from_navigation(&partial);
        assert_eq!(rows.len(), 1);
        assert!(rows[0].today_partial, "unaccounted>0 → coverage=partial → ≈15K");

        let no_hosts = serde_json::json!({"schema_version": 1, "generated_at": "2026-09-01T02:31:00Z"});
        assert!(host_rows_from_navigation(&no_hosts).is_empty());
    }

    /// day_to_row 三态：exact（by_model 覆盖完整 → basis "exact"、coverage 1.0）、
    /// partial（覆盖 30% → basis "partial"、coverage 0.3）、无 by_model（→ basis
    /// None、bucket_cost fallback）。夹具与 core `cost.rs` 的 `priced_day_*` 三测
    /// 同一组——菜单栏逐日行不许给同一份日桶报出另一个价。
    #[test]
    fn day_to_row_pins_exact_partial_and_legacy_states() {
        let pricing = load_pricing();
        let bucket = |uncached: u64| serde_json::json!({
            "uncached_input_tokens": uncached, "output_tokens": 0,
            "cache_read_tokens": 0, "cache_write_tokens": 0,
            "peak_uncached_input_tokens": 0, "peak_output_tokens": 0,
            "peak_cache_read_tokens": 0, "peak_cache_write_tokens": 0,
        });
        let exact = serde_json::json!({
            "uncached_input_tokens": 1000000, "output_tokens": 0,
            "cache_read_tokens": 0, "cache_write_tokens": 0,
            "peak_uncached_input_tokens": 0, "peak_output_tokens": 0,
            "peak_cache_read_tokens": 0, "peak_cache_write_tokens": 0,
            "by_model": {"deepseek-v4-flash": bucket(1000000)},
        });
        let partial = serde_json::json!({
            "uncached_input_tokens": 1000000, "output_tokens": 0,
            "cache_read_tokens": 0, "cache_write_tokens": 0,
            "peak_uncached_input_tokens": 0, "peak_output_tokens": 0,
            "peak_cache_read_tokens": 0, "peak_cache_write_tokens": 0,
            "by_model": {"deepseek-v4-flash": bucket(300000)},
        });
        let legacy = serde_json::json!({
            "uncached_input_tokens": 1000000, "output_tokens": 0,
            "cache_read_tokens": 0, "cache_write_tokens": 0,
            "peak_uncached_input_tokens": 0, "peak_output_tokens": 0,
            "peak_cache_read_tokens": 0, "peak_cache_write_tokens": 0,
        });

        let e = day_to_row("2026-08-01", &exact, &pricing);
        assert_eq!(e.basis.as_deref(), Some("exact"));
        assert_eq!(e.coverage, Some(1.0));
        assert!((e.total - 1.5).abs() < 1e-9);

        let p = day_to_row("2026-08-02", &partial, &pricing);
        assert_eq!(p.basis.as_deref(), Some("partial"));
        assert!((p.coverage.unwrap() - 0.3).abs() < 1e-9);

        let l = day_to_row("2026-08-03", &legacy, &pricing);
        assert_eq!(l.basis, None);
        assert_eq!(l.coverage, None);
        assert!((l.total - 1.5).abs() < 1e-9);
    }

    /// 当月读取：month.json 里混进外月行也要被滤掉——读哪个月就只认哪个月的键
    /// （镜像二进制 read_month 的防御语义）。行按日期排序，过滤后的 map 只含当月
    /// 两日 → `month_cost(raw)` 与逐行求和必然一致。
    #[test]
    fn read_month_days_at_filters_current_month() {
        let cm = current_month_beijing();
        let tmp = std::env::temp_dir().join("sv-menubar-read-month-current-test");
        let _ = std::fs::remove_dir_all(&tmp);
        std::fs::create_dir_all(tmp.join("state")).unwrap();
        let day = serde_json::json!({
            "uncached_input_tokens": 1000000, "output_tokens": 0,
            "cache_read_tokens": 0, "cache_write_tokens": 0,
            "peak_uncached_input_tokens": 0, "peak_output_tokens": 0,
            "peak_cache_read_tokens": 0, "peak_cache_write_tokens": 0,
        });
        let month = serde_json::json!({
            "month": cm,
            "days": {
                format!("{cm}-01"): day.clone(),
                format!("{cm}-15"): day.clone(),
                "1999-01-01": day.clone(),
            },
        });
        std::fs::write(tmp.join("state").join("month.json"), month.to_string()).unwrap();
        let pricing = load_pricing();
        let (raw, rows) = read_month_days_at(&tmp, &cm, &pricing).expect("当月有数据");
        assert_eq!(rows.len(), 2);
        assert_eq!(rows[0].date, format!("{cm}-01"));
        assert_eq!(rows[1].date, format!("{cm}-15"));
        assert_eq!(raw.as_object().unwrap().len(), 2, "过滤后 map 只含当月两日");
        let _ = std::fs::remove_dir_all(&tmp);
    }

    /// partial 保真：日历逐日行对 partial 日必须保留 basis=="partial" 与 coverage
    /// 数值，不许把部分覆盖抹平成 exact——这是 8 月账目的原 bug。走历史分支
    /// （1999-01 ≠ 当前月）验证归档读取也保真。
    #[test]
    fn read_month_days_at_preserves_partial_coverage() {
        let tmp = std::env::temp_dir().join("sv-menubar-read-month-partial-test");
        let _ = std::fs::remove_dir_all(&tmp);
        std::fs::create_dir_all(tmp.join("state")).unwrap();
        let partial_day = serde_json::json!({
            "uncached_input_tokens": 1000000, "output_tokens": 0,
            "cache_read_tokens": 0, "cache_write_tokens": 0,
            "peak_uncached_input_tokens": 0, "peak_output_tokens": 0,
            "peak_cache_read_tokens": 0, "peak_cache_write_tokens": 0,
            "by_model": {"deepseek-v4-flash": {
                "uncached_input_tokens": 300000, "output_tokens": 0,
                "cache_read_tokens": 0, "cache_write_tokens": 0,
                "peak_uncached_input_tokens": 0, "peak_output_tokens": 0,
                "peak_cache_read_tokens": 0, "peak_cache_write_tokens": 0,
            }},
        });
        let archive = serde_json::json!({
            "months": {"1999-01": {"days": {"1999-01-05": partial_day}, "archived_at": "x"}},
        });
        std::fs::write(tmp.join("state").join("month-archive.json"), archive.to_string()).unwrap();
        let pricing = load_pricing();
        let (_, rows) = read_month_days_at(&tmp, "1999-01", &pricing).expect("历史月有数据");
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].date, "1999-01-05");
        assert_eq!(rows[0].basis.as_deref(), Some("partial"));
        assert!((rows[0].coverage.unwrap() - 0.3).abs() < 1e-9);
        let _ = std::fs::remove_dir_all(&tmp);
    }

    /// 历史月读取：month-archive.json 的 `/months/{month}/days` 读得到；缺月 → None
    /// （不是 Some+空）。
    #[test]
    fn read_month_days_at_reads_archive_and_missing_is_none() {
        let tmp = std::env::temp_dir().join("sv-menubar-read-month-archive-test");
        let _ = std::fs::remove_dir_all(&tmp);
        std::fs::create_dir_all(tmp.join("state")).unwrap();
        let day = serde_json::json!({
            "uncached_input_tokens": 1000000, "output_tokens": 0,
            "cache_read_tokens": 0, "cache_write_tokens": 0,
            "peak_uncached_input_tokens": 0, "peak_output_tokens": 0,
            "peak_cache_read_tokens": 0, "peak_cache_write_tokens": 0,
        });
        let archive = serde_json::json!({
            "schema_version": "1",
            "months": {
                "1999-01": {"days": {"1999-01-10": day.clone()}, "archived_at": "x"},
            },
        });
        std::fs::write(tmp.join("state").join("month-archive.json"), archive.to_string()).unwrap();
        let pricing = load_pricing();
        let (raw, rows) = read_month_days_at(&tmp, "1999-01", &pricing).expect("归档月有数据");
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].date, "1999-01-10");
        assert_eq!(raw.as_object().unwrap().len(), 1);
        assert!(read_month_days_at(&tmp, "1999-02", &pricing).is_none(), "缺月 → None");
        let _ = std::fs::remove_dir_all(&tmp);
    }

    /// 空月诚实：days 为空 → None（不是 Some+空）。当月与历史各测一条。
    #[test]
    fn read_month_days_at_empty_month_is_none() {
        let tmp = std::env::temp_dir().join("sv-menubar-read-month-empty-test");
        let _ = std::fs::remove_dir_all(&tmp);
        std::fs::create_dir_all(tmp.join("state")).unwrap();
        std::fs::write(tmp.join("state").join("month.json"), r#"{"month":"x","days":{}}"#).unwrap();
        let pricing = load_pricing();
        assert!(read_month_days_at(&tmp, &current_month_beijing(), &pricing).is_none());
        let archive = r#"{"months":{"1999-03":{"days":{},"archived_at":"x"}}}"#;
        std::fs::write(tmp.join("state").join("month-archive.json"), archive).unwrap();
        assert!(read_month_days_at(&tmp, "1999-03", &pricing).is_none());
        let _ = std::fs::remove_dir_all(&tmp);
    }

    /// month_response 形状：Some → total 等于对过滤后 map 的 month_cost、has_data
    /// true；None → has_data false、total null——前端据此显示「该月暂无数据」，
    /// 绝不出现 ¥0 格子。
    #[test]
    fn month_response_shape_some_and_none() {
        let pricing = load_pricing();
        let none = month_response("2026-08", None, &pricing);
        assert_eq!(none["has_data"], serde_json::json!(false));
        assert_eq!(none["total"], serde_json::Value::Null);
        assert_eq!(none["peak_total"], serde_json::Value::Null);
        assert_eq!(none["days"].as_array().unwrap().len(), 0);

        let day = serde_json::json!({
            "uncached_input_tokens": 1000000, "output_tokens": 0,
            "cache_read_tokens": 0, "cache_write_tokens": 0,
            "peak_uncached_input_tokens": 0, "peak_output_tokens": 0,
            "peak_cache_read_tokens": 0, "peak_cache_write_tokens": 0,
        });
        let raw = serde_json::json!({"2026-08-01": day.clone(), "2026-08-02": day});
        let mut rows = Vec::new();
        for (date, d) in raw.as_object().unwrap() {
            rows.push(day_to_row(date, d, &pricing));
        }
        rows.sort_by(|a, b| a.date.cmp(&b.date));
        let some = month_response("2026-08", Some((raw.clone(), rows)), &pricing);
        assert_eq!(some["has_data"], serde_json::json!(true));
        let expect = month_cost(&raw, &pricing);
        assert!((some["total"].as_f64().unwrap() - expect["total"].as_f64().unwrap()).abs() < 1e-9);
        assert_eq!(some["days"].as_array().unwrap().len(), 2);
    }

    /// is_month_key 防御：合法 `YYYY-MM` 通过；长度不对/分隔符错/含非数字 → 拒绝。
    #[test]
    fn is_month_key_accepts_valid_rejects_garbage() {
        assert!(is_month_key("2026-08"));
        assert!(is_month_key("1999-01"));
        assert!(!is_month_key("2026-8"));
        assert!(!is_month_key("2026-081"));
        assert!(!is_month_key("2026/08"));
        assert!(!is_month_key("202608"));
        assert!(!is_month_key("abc-def"));
        assert!(!is_month_key(""));
        assert!(!is_month_key("2026-"));
    }

    /// current_month_beijing 就是 today_beijing() 的月键——日历默认月跟着「北京
    /// 今天」走，不引日期库。
    #[test]
    fn current_month_beijing_matches_today_prefix() {
        assert_eq!(current_month_beijing(), today_beijing()[..7].to_string());
    }

    // ── v0.7 spec §3 第二/三行菜单栏视图接线钉测 ────────────────────────
    // 与 CLI `state uncovered`/`state savings`（commit a577497）同源字节——
    // Tauri 侧走的是 `core::state::rollup_by_model` + `core::cost::{
    // claude_subscription_uncovered_estimate, cache_counterfactual_cost}` 同一条
    // 路径，月无 by_model → (None, None) 同款诚实降级（不摆全零结构）。

    /// 月份没有 by_model（老数据 / 当月无会话）→ 两视图都 None，与
    /// `claude_month` 的诚实降级一致。
    #[test]
    fn read_overview_v07_uncovered_and_savings_both_null_when_no_by_model() {
        let tmp = std::env::temp_dir().join("sv-menubar-v07-empty-test");
        let _ = std::fs::remove_dir_all(&tmp);
        std::fs::create_dir_all(tmp.join("state")).unwrap();
        let cm = current_month_beijing();
        // 只有 8 桶顶层字段、没 by_model（老形状）
        let month = serde_json::json!({
            "month": cm,
            "days": {
                format!("{cm}-01"): {
                    "uncached_input_tokens": 1000000, "output_tokens": 0,
                    "cache_read_tokens": 0, "cache_write_tokens": 0,
                    "peak_uncached_input_tokens": 0, "peak_output_tokens": 0,
                    "peak_cache_read_tokens": 0, "peak_cache_write_tokens": 0,
                },
            },
        });
        std::fs::write(tmp.join("state").join("month.json"), month.to_string()).unwrap();
        let ov = read_overview_at(&tmp);
        assert!(ov.claude_uncovered_month.is_none(),
                "无 by_model 时 uncovered 必须 None，不摆全零结构");
        assert!(ov.month_savings.is_none(),
                "无 by_model 时 savings 必须 None，不摆全零结构");
        let _ = std::fs::remove_dir_all(&tmp);
    }

    /// anthropic 在 catalog_2026_09.subscriptions 登记 → claude-opus-5 不进
    /// uncovered 视图（整 provider 视为已订阅覆盖，spec §3 原文措辞）。deepseek
    /// 未订阅 → 全 provider 进 uncovered。
    #[test]
    fn read_overview_v07_uncovered_excludes_subscribed_provider() {
        let tmp = std::env::temp_dir().join("sv-menubar-v07-uncovered-test");
        let _ = std::fs::remove_dir_all(&tmp);
        std::fs::create_dir_all(tmp.join("state")).unwrap();
        let cm = current_month_beijing();
        let month = serde_json::json!({
            "month": cm,
            "days": {
                format!("{cm}-01"): {
                    "uncached_input_tokens": 0, "output_tokens": 0,
                    "cache_read_tokens": 0, "cache_write_tokens": 0,
                    "peak_uncached_input_tokens": 0, "peak_output_tokens": 0,
                    "peak_cache_read_tokens": 0, "peak_cache_write_tokens": 0,
                    "by_model": {
                        "claude-opus-5": {
                            "uncached_input_tokens": 1000000, "output_tokens": 0,
                            "cache_read_tokens": 0, "cache_write_tokens": 0,
                            "peak_uncached_input_tokens": 0, "peak_output_tokens": 0,
                            "peak_cache_read_tokens": 0, "peak_cache_write_tokens": 0,
                        },
                        "deepseek-v4-flash": {
                            "uncached_input_tokens": 1000000, "output_tokens": 0,
                            "cache_read_tokens": 0, "cache_write_tokens": 0,
                            "peak_uncached_input_tokens": 0, "peak_output_tokens": 0,
                            "peak_cache_read_tokens": 0, "peak_cache_write_tokens": 0,
                        },
                    },
                },
            },
        });
        std::fs::write(tmp.join("state").join("month.json"), month.to_string()).unwrap();
        let ov = read_overview_at(&tmp);
        let uncovered = ov.claude_uncovered_month.expect(
            "deepseek 未订阅 → uncovered 必须存在（anthropic 订阅的 claude-opus-5 不出现）");
        assert_eq!(uncovered["pricing_basis"], "estimated-subscription-exclusion");
        // anthropic 订阅的 claude-opus-5 不在 per_model 里（已订阅覆盖）
        assert!(uncovered["per_model"].get("claude-opus-5").is_none(),
                "claude-opus-5 已订阅 → 不应出现在 uncovered.per_model");
        // deepseek 未订阅 → 必须在
        assert!(uncovered["per_model"].get("deepseek-v4-flash").is_some(),
                "deepseek-v4-flash 未订阅 → 必须出现在 uncovered.per_model");
        let _ = std::fs::remove_dir_all(&tmp);
    }

    /// 全 1M cache_read → ratio = 1/30（cached 0.05 vs uncached 1.5，spec §3
    /// 原文引用的具体信号）。月级无 providers、各家模型走 fallback 价卡——与
    /// `priced_day` 对同一份 month.json 的处理一致。
    #[test]
    fn read_overview_v07_savings_ratio_is_1_over_30_for_cache_only() {
        let tmp = std::env::temp_dir().join("sv-menubar-v07-savings-test");
        let _ = std::fs::remove_dir_all(&tmp);
        std::fs::create_dir_all(tmp.join("state")).unwrap();
        let cm = current_month_beijing();
        // 全 cache_read、其它 8 桶字段 0：ratio = 1/30。`uncached_input_tokens`
        // 必须显式 0（不是默认 100），否则 uncached 残余贡献会偏离 1/30。
        let month = serde_json::json!({
            "month": cm,
            "days": {
                format!("{cm}-01"): {
                    "uncached_input_tokens": 0, "output_tokens": 0,
                    "cache_read_tokens": 1000000, "cache_write_tokens": 0,
                    "peak_uncached_input_tokens": 0, "peak_output_tokens": 0,
                    "peak_cache_read_tokens": 0, "peak_cache_write_tokens": 0,
                    "by_model": {
                        "deepseek-v4-flash": {
                            "uncached_input_tokens": 0, "output_tokens": 0,
                            "cache_read_tokens": 1000000, "cache_write_tokens": 0,
                            "peak_uncached_input_tokens": 0, "peak_output_tokens": 0,
                            "peak_cache_read_tokens": 0, "peak_cache_write_tokens": 0,
                        },
                    },
                },
            },
        });
        std::fs::write(tmp.join("state").join("month.json"), month.to_string()).unwrap();
        let ov = read_overview_at(&tmp);
        let savings = ov.month_savings.expect(
            "by_model 存在 → savings 必须 Some");
        assert_eq!(savings["currency"], "CNY");
        let ratio = savings["ratio"].as_f64().expect("ratio 必须是数字");
        assert!((ratio - 1.0 / 30.0).abs() < 1e-9,
                "全 cache_read → ratio 必须 = 1/30，got {ratio}");
        let _ = std::fs::remove_dir_all(&tmp);
    }
}
