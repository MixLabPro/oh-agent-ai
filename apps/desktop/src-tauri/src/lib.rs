//! 菜单栏应用入口：托盘 + 工作台主窗口。计算全部委托给 core（`overview.rs` 只做 I/O
//! 与组装），本文件只负责 Tauri 胶水：托盘菜单、窗口显隐、IPC 命令。
//!
//! 菜单栏本身也展示「今日/本月/预算」三个数字 —— 那是**同一个** `read_overview`
//! 的文本渲染，不是第二份计算。所有金额格式 `fmt_money` 与 core 的 `format_money`
//! 同 spec（≥100 一位小数、否则两位、去尾零），避免菜单栏和工作台对同一份钱报出
//! 两个格式。
mod overview;
mod store;
mod budget_alerts;
// Claude Pro 的额度窗口提醒：与预算提醒共用投递账本，但键按窗口取。
mod quota_alerts;

use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri_plugin_notification::NotificationExt;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::{Mutex, atomic::{AtomicU64, Ordering}};
use tauri::menu::{Menu, MenuBuilder, MenuItem, PredefinedMenuItem, Submenu};
use tauri::tray::TrayIconBuilder;
use tauri::{AppHandle, Emitter, Manager, WindowEvent};

use overview::{HostRow, HostsSnapshot, Overview, RecentSessionRow, SyncStatus};

/// 同步互斥：定时 tick 与「立即同步」（菜单/IPC）共用同一把锁，保证任意时刻至多
/// 一轮 discover→oneline 在跑。oneline 写链本身有 fencing + exactly-once，锁不是
/// 为了防重复写，是防两轮并发白白各折一遍 + 两次托盘重建。
struct SyncLock(Mutex<()>);

struct SyncRequests(Mutex<std::collections::BTreeMap<String, bool>>);
static SYNC_REQUEST_SEQ: AtomicU64 = AtomicU64::new(1);
const SYNC_STATUS_EVENT: &str = "sync-status-updated";

/// 只有还没有任何同步回执的启动才主动拉起工作台。后续启动继续保持菜单栏
/// 工具的安静行为；首次用户无需先知道菜单栏入口，能直接看到本机解析说明。
fn should_show_first_value_workspace(sync: &SyncStatus) -> bool {
    sync.stage == "never"
}

fn should_show_workbench_on_start(sync: &SyncStatus, args: &[String]) -> bool {
    should_show_first_value_workspace(sync)
        || args.iter().any(|arg| arg == "--show-workbench")
}

/// 独立的 macOS 菜单栏模板图。不能复用彩色 App Icon：模板图只提供 alpha
/// 轮廓，由 AppKit 根据浅色、深色、选中和辅助功能状态自动着色。44×36px 源图按
/// 22×18pt 呈现，横向画布避免啄木鸟在方形透明留白中显得过小，并保留 Retina 细节。
fn tray_template_icon() -> tauri::Result<tauri::image::Image<'static>> {
    tauri::image::Image::from_bytes(include_bytes!("../icons/trayTemplate@2x.png"))
}

/// 金额修剪 + 符号（`fmt_money`/`fmt_usd` 共享）。尾零与小数点只修剪、不做进位
/// 取舍——精度由上面的档位决定。与 core `cost.rs::format_money` 同 spec。
fn fmt_currency(x: f64, symbol: &str) -> String {
    let s = if x >= 100.0 { format!("{x:.1}") } else { format!("{x:.2}") };
    let s = s.trim_end_matches('0').trim_end_matches('.').to_string();
    format!("{symbol}{s}")
}

/// 金额 → `¥600` / `¥774.7` / `¥6.73`。与 core `cost.rs::format_money` 同 spec。
fn fmt_money(x: f64) -> String {
    fmt_currency(x, "¥")
}

/// USD 金额 → `$3` / `$28` / `$0.52`（Claude 估列用）。¥ 与 $ 分开标、不混加
/// （D2 分币分列）——一个数同时标两种货币是记账错误，两个估分开才是诚实。
fn fmt_usd(x: f64) -> String {
    fmt_currency(x, "$")
}

/// RFC3339 时间戳 → unix 秒。只认 alert.json 的机器格式（`2026-08-30T07:04:38.548588+00:00`
/// 这类）：`YYYY-MM-DDTHH:MM:SS[.frac](Z|±HH:MM)`，小数位任意、可缺省。与
/// `overview::civil_from_unix_secs` 互为逆运算（days_from_civil 是 civil_from_days
/// 的反函数，Howard Hinnant 同一套）。解析失败 → None（调用方决定如何处理——
/// 缺新鲜度信息不等于缺数据）。
fn parse_rfc3339_secs(s: &str) -> Option<i64> {
    let t = s.find('T')?;
    let mut d = s[..t].split('-');
    let y: i64 = d.next()?.parse().ok()?;
    let mo: u32 = d.next()?.parse().ok()?;
    let day: u32 = d.next()?.parse().ok()?;
    let rest = s.get(t + 1..)?;
    let h: u32 = rest.get(0..2)?.parse().ok()?;
    let mi: u32 = rest.get(3..5)?.parse().ok()?;
    let se: u32 = rest.get(6..8)?.parse().ok()?;
    // 范围 sanity（不做完整历法校验）：乱填的月份/日期/时分秒解析出来也是垃圾秒数，
    // 会污染 freshness 判据。机器写的 alert.json 不会走到这里，挡住手填测试而已。
    if !(1..=12).contains(&mo) || !(1..=31).contains(&day)
        || h > 23 || mi > 59 || se > 59 {
        return None;
    }
    let tail = rest.get(8..)?;
    // tail = [".frac"] + 时区。时区从第一个 + / - / Z 起算；小数在前的话跳过。
    let tz = match tail.find(['+', '-', 'Z']) {
        Some(p) => &tail[p..],
        None => "Z",
    };
    let offset = if tz == "Z" {
        0
    } else {
        let sign = if tz.starts_with('+') { 1 } else { -1 };
        let oh: i32 = tz.get(1..3)?.parse().ok()?;
        let om: i32 = tz.get(4..6)?.parse().ok()?;
        sign * (oh * 3600 + om * 60)
    };
    let days = days_from_civil(y, mo, day);
    Some(days * 86400 + (h * 3600 + mi * 60 + se) as i64 - offset as i64)
}

/// civil_from_days 的反函数：`(y,m,d)` → 自 1970-01-01 的天数。验证过的一组锚点：
/// days_from_civil(2026,8,27) = 20692（= 1787788800 秒，2026-08-27T00:00Z）。
fn days_from_civil(y: i64, m: u32, d: u32) -> i64 {
    let y = if m <= 2 { y - 1 } else { y };
    let era = y.div_euclid(400);
    let yoe = y - era * 400;
    let mp = if m > 2 { m as i64 - 3 } else { m as i64 + 9 };
    let doy = (153 * mp + 2) / 5 + d as i64 - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    era * 146097 + doe - 719468
}

/// 同步 tick 周期（start_refresh_tick 的 sleep 与宿主区 stale 判定共用——
/// 「2 × tick」是 spec §6 决策 5 的过期定义，周期改了 stale 窗口跟着改，不能
/// 两处各写一个 5 分钟）。
const TICK_PERIOD: std::time::Duration = std::time::Duration::from_secs(5 * 60);

/// 通用过期判定：`generated_at` 年龄 > window。`stale_from`（预算 5 分钟）与
/// `hosts_stale_from`（宿主区 2 × tick）共用；「无新鲜度信息」→ 不算过期，
/// 解析失败 → 也不算（机器写的文件不会走到，与工作台 `Invalid Date` 走不 stale
/// 的现状一致）。
fn stale_after(generated_at: Option<&str>, now_secs: i64, window_secs: i64) -> bool {
    let Some(at) = generated_at.and_then(parse_rfc3339_secs) else {
        return false;
    };
    now_secs - at > window_secs
}

/// 预算数据是否过期（> 5 分钟）。与工作台 `workbench.js` 的 `> 5*60*1000` 同一阈值——
/// 托盘和工作台对同一份 alert.json 必须判同一个「过期」，不能一个绿一个黄。
fn stale_from(generated_at: Option<&str>, now_secs: i64) -> bool {
    stale_after(generated_at, now_secs, 5 * 60)
}

/// 预算状态行的权威来源：alert.json（`budget.evaluate()` 落盘）。**只读展示，
/// 不重算百分比**——迁移要修的 D2 缺口正是托盘自算 remaining% 与 budget.py 规则
/// 无关。缺场时降级为「等预算数据」，不臆造「预算超支/剩余 X%」。
///
/// now 由调用方注入（`build_menu` 读一次系统时钟，整个菜单的所有行共用同一个
/// "现在"——各行分别读钟会让同一次重建里的新鲜度判定互相不一致），单测因此不用
/// 碰系统时钟。
fn budget_status_text_at(ov: &Overview, now_secs: i64) -> String {
    if let Some(rows) = ov.budget_profiles.as_ref()
        .and_then(|v| v.get("profiles"))
        .and_then(Value::as_array)
        .filter(|rows| !rows.is_empty())
    {
        let summary = rows.iter().filter_map(|row| {
            let id = row.get("profile_id").and_then(Value::as_str)?;
            let currency = row.get("currency").and_then(Value::as_str)?;
            let level = row.get("level").and_then(Value::as_str)?;
            // 已用 = 按量 + 订阅摊派（total_spent_minor，与总览卡同口径）；旧载荷退回 spent。
            let spent = row.get("total_spent_minor").or_else(|| row.get("spent_minor"))
                .and_then(Value::as_i64).unwrap_or(0);
            let limit = row.get("monthly_minor").and_then(Value::as_i64)?;
            let label = if id == "estimate" { "估算" } else { "已确认" };
            let state = match level {
                "exceeded" => "超支",
                "warn" => "接近",
                "incomplete" => "部分覆盖",
                "no_data" => "无数据",
                "disabled" => "未启用",
                _ => "正常",
            };
            Some(format!("{label} {currency} {state} {spent:.2}/{limit:.2}",
                spent = spent as f64 / 100.0, limit = limit as f64 / 100.0))
        }).collect::<Vec<_>>().join("；");
        if !summary.is_empty() {
            return format!("预算：{summary}");
        }
    }
    let b = &ov.budget;
    // 预算分母：alert.json 的 monthly_cny 是 evaluate() 算 ratio 用的那份，
    // 与它同屏显示的必须一致；缺场才退回 config。
    let denom = b.monthly_cny.or(ov.budget_monthly_cny);
    let mc = fmt_money(b.month_cost.unwrap_or(0.0));
    let denom_money = denom.map(fmt_money).unwrap_or_else(|| "未设置".into());
    let base = match (b.source.as_str(), b.level.as_deref()) {
        ("missing", _) => "预算：等预算数据（跑一次 oneline）".to_string(),
        (_, Some("no_budget")) => "预算：未设置（成本仍按实际口径统计）".to_string(),
        (_, Some("over")) => format!("🚨 预算超支：{mc}（月 {denom_money}）"),
        (_, Some("snoozed")) => match &b.snoozed_until {
            Some(u) => format!("🔕 预算静默至 {u}"),
            None => "🔕 预算已静默".to_string(),
        },
        (_, Some("warn")) => {
            // 百分比来自 alert.json 的 month_ratio，不是 (budget - spent)/budget。
            let pct = b.month_ratio.unwrap_or(0.0) * 100.0;
            format!("⚠️ 预算 {pct:.0}%：{mc} / {denom_money}")
        }
        (_, Some("disabled")) => "预算已禁用".to_string(),
        // ok 或未知 level：显示权威数值本身，不添油加醋。
        _ => format!("✓ 预算：{mc} / {denom_money}"),
    };
    // 健康 ≠ 新鲜度（规格 R1）：数据过期时主入口不得呈现「正常」。✓ 是「一切正常」
    // 语义，stale 时绝不显示它——换成明确的过期标记；over/warn/snoozed 本身有非正常
    // 语义、仍要显示，但带过期后缀，避免「过期还绿」。
    if stale_from(b.generated_at.as_deref(), now_secs) {
        if base.starts_with('✓') {
            format!("⚠ 预算（数据过期）：{mc} / {denom_money}")
        } else {
            format!("{base}（数据过期）")
        }
    } else {
        base
    }
}

/// 大数缩写：≥1M → "1.4M"，≥1K → "8.2K"（<10K 留一位小数），<1K 原样。
fn fmt_tokens(n: i64) -> String {
    if n >= 1_000_000 {
        format!("{:.1}M", n as f64 / 1_000_000.0)
    } else if n >= 1_000 {
        let k = n as f64 / 1_000.0;
        if k < 10.0 { format!("{:.1}K", k) } else { format!("{:.0}K", k) }
    } else {
        n.to_string()
    }
}

/// 托盘标题：菜单栏里图标旁那一段常驻文字。**只放今日 token**（「鸟头 + 64.4M」），
/// 与工作台「今日消耗」KPI 对齐、同一个数（SQL daily DTO 的 `tokens_by_host`；库缺席
/// 才退回旧合并）。钱不进标题——用户定向 2026-09-17：状态栏要的是消耗量的直观信号，
/// 价格在菜单与工作台里看。无今日数据诚实「—」，不臆造 0。
fn today_title(ov: &Overview) -> String {
    let tokens = today_tokens(ov);
    if tokens > 0 { fmt_tokens(tokens) } else { "—".to_string() }
}

/// 今日 token：SQL DTO 优先（与 KPI 同源），否则旧的 DSH state + claude ledger 合并。
fn today_tokens(ov: &Overview) -> i64 {
    ov.today_tokens_sql.unwrap_or_else(|| today_merged_tokens(ov))
}

/// 模型短名：`deepseek/deepseek-v4-pro-0813` → `deepseek-v4-pro-0813`。只砍
/// provider 前缀（第一个 `/` 之前），不做别的美化——菜单一行的宽度有限，但把
/// `-0813` 这种版本尾巴也砍掉就会让两个不同版本在菜单里长得一模一样。
fn short_model(name: &str) -> &str {
    name.rsplit('/').next().unwrap_or(name)
}

/// 宿主显示名映射（v0.6 host-contract spec §6/§11-M3，G7）：从 core
/// `host_capability::HOSTS` 行的 `display` 字段读——真相源是 M0 建的注册表，
/// 这里不再是 Tauri 本地字面量表。展示名与数据侧的 `dsh`/`codex` 之类的键值
/// 是两回事——与 `short_model` 同类性质，不落盘、不入快照。未知宿主（含未来
/// 新加但本二进制还没升级到的宿主）原样透传，fail-open，不至于长得像个
/// 错别字（`host_capability::host_profile` 的查询路径本就 fail-open——注册路径
/// 才 fail-closed，见 v0.6 spec §5.3 条款 2）。WorkBuddy 现在也能正确解析出
/// "WorkBuddy"（此前的本地字面量表没收它，因为它没有托盘行——展示名与"有没有
/// 折叠能力"是两件事，工作台的会话浏览面一直支持 workbuddy）。
fn host_display_name(kind: &str) -> String {
    agent_vitals_domain::host_capability::host_profile(kind)
        .map(|h| h.display.to_string())
        .unwrap_or_else(|| kind.to_string())
}

/// 读 claude 估报告（core `claude_day_cost` / 当月聚合 `currency_totals`）的单侧
/// 币种金额。报告缺场 / 该币键缺场 / 值非数 → 0.0。**0 是「这一侧没有钱」的哨兵，
/// 不是测量到的 0**——CNY 0 意为「当日没有 CNY 价流」（纯 anthropic 卡日）。
fn claude_currency(claude: &Option<Value>, key: &str) -> f64 {
    claude
        .as_ref()
        .and_then(|r| r.get("currency_totals"))
        .and_then(|c| c.get(key))
        .and_then(Value::as_f64)
        .unwrap_or(0.0)
}

/// 合并按量总账的一行金额主段（v1.3，MENUBAR spec §3.1/§4）：`Σ 按量流`，CNY 主币。
///
/// 输入：`dsh_cny` = DSH 的**实测** ¥（今日账在 → Some，含 0 = 测到 0 元；今日缺场
/// → None，不是 0）；`claude_cny`/`claude_usd` = Claude Code 的 catalog 折算估
/// （来自 `claude_currency`）。
///
/// 合并口径：**CNY 主账 = dsh(实) + claude(估) 相加**，任何 claude CNY 估分量并入
/// → 整段前缀 `≈`。为什么弃用 v1.2 的「¥ 实 + ` · Claude 估 ≈¥A`」追加列：顶层行
/// 被用户当作「今天按量花了多少钱」读，真机那天 DSH 空转、钱全在 Claude Code 的
/// deepseek 流上，追加列呈出 `¥0 · Claude 估 ≈¥37.17`——读数像「真没花钱」。合并
/// 后估占主导就写 `≈¥37.17`，`≈` 即诚实标注；纯 DSH 段（claude 无 CNY 价流）保持
/// 实测精度、不带 ≈，一笔实测 ¥ 不被标成估。
///
/// anthropic USD 流：**有汇率估算时按 `usd_cny_rate` 折进 ¥ 主账**（整段带 `≈`，
/// hover 里前端把 `¥X` 展开回 `$A 折 + ¥B`）——这是 PM 决策 2026-09-07 的速览层
/// 便利，`fx_estimate` 是估算不是口径，预算/导出/对账仍分币。**无汇率**（价表无
/// `fx_estimate` 节）时退回旧行为：USD 不进 ¥ 主账（混币不能相加），只在整行完全
/// 没有 ¥ 侧时单独浮出 `≈$B`（measured 不消失）。两币皆无 → None：调用方渲染
/// —，不摆 `¥0`（缺列报缺）。
fn metered_amount(
    dsh_cny: Option<f64>,
    claude_cny: f64,
    claude_usd: f64,
    usd_cny_rate: Option<f64>,
) -> Option<String> {
    // USD 折算分量：仅当有汇率且确有 USD 流。无汇率 → None，USD 走旧的
    // 「只在没有任何 ¥ 侧时单独浮出」路径。
    let usd_as_cny = usd_cny_rate.filter(|_| claude_usd > 0.0).map(|r| claude_usd * r);
    // 估算 ¥ 分量 = claude 的 CNY 估 + USD 折算。任一非零 → 整段带 `≈`。
    let cny_est = claude_cny + usd_as_cny.unwrap_or(0.0);
    let has_est = cny_est > 0.0;
    match dsh_cny {
        Some(d) if has_est => Some(format!("≈{}", fmt_money(d + cny_est))),
        Some(d) => Some(fmt_money(d)), // 纯 DSH 实测（无估算分量；无汇率时 USD 在此被丢弃——旧纪律）
        None if has_est => Some(format!("≈{}", fmt_money(cny_est))),
        None if claude_usd > 0.0 => Some(format!("≈{}", fmt_usd(claude_usd))),
        None => None,
    }
}

/// `metered_view`（`{币种: {amount, actual, declared_estimate, default_estimate, label}}`）
/// → 托盘一格钱。CNY 为主账，USD 有汇率就折进来（速览层纪律，带 ≈）、没汇率单独
/// 浮出；全部来自账单才不带 ≈。视图为空（今天/本月没有按量钱：全在套餐内或没用量）
/// → None，由调用方诚实写「—」。旧载荷（None）也 → None，走旧拼法。
fn metered_view_text(view: Option<&serde_json::Value>, usd_cny_rate: Option<f64>) -> Option<String> {
    let view = view?.as_object()?;
    let get = |cur: &str, k: &str| view.get(cur).and_then(|v| v.get(k)).and_then(serde_json::Value::as_f64).unwrap_or(0.0);
    let label_is_actual = |cur: &str| view.get(cur).and_then(|v| v.get("label")).and_then(serde_json::Value::as_str) == Some("actual");
    let cny = get("CNY", "amount");
    let usd = get("USD", "amount");
    if cny <= 0.0 && usd <= 0.0 {
        return None;
    }
    let mut total = cny;
    let mut estimate = cny > 0.0 && !label_is_actual("CNY");
    match (usd > 0.0, usd_cny_rate) {
        (true, Some(rate)) => { total += usd * rate; estimate = true; }
        (true, None) if cny <= 0.0 => {
            return Some(format!("{}{}", if label_is_actual("USD") { "" } else { "≈" }, fmt_usd(usd)));
        }
        _ => {}
    }
    Some(format!("{}{}", if estimate { "≈" } else { "" }, fmt_money(total)))
}

/// 速览层混币折算汇率（`Overview.fx.usd_cny`）——None = 价表无 `fx_estimate` 节，
/// 折算不发生、退回分币旧行为。
fn fx_rate(ov: &Overview) -> Option<f64> {
    ov.fx.as_ref().and_then(|f| f.get("usd_cny")).and_then(serde_json::Value::as_f64)
}

/// 今日合并 token（v1.3）：DSH 当日实测 + Claude Code 当日 ledger（core
/// `claude_day_total_tokens`，Overview 已嵌）。一侧缺场 → 另一侧照常；两侧都缺
/// → 0（调用方反正渲染 —，0 不会被看见）。token 是消耗量的直观信号、与计价无
/// 关——全 unknown 的 claude 日 token 依旧计入（价目卡不认 ≠ 没消耗）。
fn today_merged_tokens(ov: &Overview) -> i64 {
    let dsh = ov.today.as_ref().and_then(|t| t["tokens"].as_i64()).unwrap_or(0);
    dsh + ov.claude_today_tokens.unwrap_or(0)
}

/// L1 宿主行文案（spec §4/§8）：`<显示名> · <tokens|—> · <N 会话|—>`。两个
/// 测量字段都缺 → 单个 `· —`（unavailable 降级矩阵的形态）；只缺一个 → 该槽
/// 位「—」另一个照常。`today_partial`（覆盖率 partial）→ token 加 `≈` 前缀：
/// 快照的 coverage 是保守下界标注，渲染成精确值就是编造。
fn host_row_text(row: &HostRow) -> String {
    let name = host_display_name(&row.host_kind);
    let token_part = row.today_tokens.map(|t| {
        let s = fmt_tokens(t);
        if row.today_partial { format!("≈{s}") } else { s }
    });
    let sess_part = row.today_sessions.map(|n| format!("{n} 会话"));
    let middle = match (token_part, sess_part) {
        (Some(t), Some(s)) => format!("{t} · {s}"),
        (Some(t), None) => format!("{t} · —"),
        (None, Some(s)) => format!("— · {s}"),
        (None, None) => "—".to_string(),
    };
    format!("{name} · {middle}")
}

/// 标题截断（spec §4）：超 24 字符 → 前 23 字符 + `…`。按字符数不是字节数——
/// 中文标题一个字符一个字符地数，按字节截会切成半个字。
fn truncate_title(s: &str, max_chars: usize) -> String {
    let n = s.chars().count();
    if n > max_chars {
        format!("{}…", s.chars().take(max_chars - 1).collect::<String>())
    } else {
        s.to_string()
    }
}

/// 北京时刻的 `HH:MM`（spec §8 stale footer 用）：`generated_at` 是 RFC3339 UTC，
/// 渲染成北京的快照时刻——与日界判定（day_key 北京日）同一时区，早上 8 点前的
/// 快照不会显示成昨天的点。
fn beijing_hhmm(secs: i64) -> String {
    let local = agent_vitals_runtime::clock::local_timestamp_text(secs);
    local[11..16].to_string()
}

/// 多宿主导航快照是否过期（spec §6 决策 5）：`generated_at` 年龄 > 2 × tick
/// （10 分钟）→ 宿主子菜单底部挂「数据更新于 hh:mm · 可能已过期」。与
/// `stale_from`（预算 5 分钟窗口）分开——两处「过期」的定义本来就不同，共用一个
/// 窗口会把预算卡 5 分钟语义硬套到宿主快照上。
fn hosts_stale_from(generated_at: Option<&str>, now_secs: i64) -> bool {
    stale_after(generated_at, now_secs, 2 * TICK_PERIOD.as_secs() as i64)
}

/// L2 最近会话行文案（spec §4）：`<date> · <身份> · <tokens>`。date 折 `MM-DD`
/// （非当年带年 `YYYY-MM-DD`——「8 月 28 日」在当年语境够用，跨年不标年会在
/// 一年后长得一模一样）；身份 = title（截断 24 字符）→ short_model → native_id
/// 的 fallback 链；tokens 缺段省略。date 只做展示层折叠，`RecentSessionRow.date`
/// 里存的完整 `YYYY-MM-DD` 原样保留。「当年」判定用北京年——与导航 day_key 的
/// 日界一致（UTC 12-31 晚的会话在 UTC 年上跨年、北京年上不跨，整个多宿主导航
/// 都按北京日界走）。
fn recent_row_text(row: &RecentSessionRow, now_secs: i64) -> String {
    let mut parts: Vec<String> = Vec::new();
    if let Some(d) = &row.date {
        let current_year = agent_vitals_runtime::clock::local_timestamp_text(now_secs)[..4].to_string();
        let year_is_current = d.len() >= 10
            && d[..4] == current_year;
        parts.push(if year_is_current {
            d[5..10].to_string()
        } else {
            d.clone()
        });
    }
    let identity = row
        .title
        .as_deref()
        .map(|t| truncate_title(t, 24))
        .or_else(|| row.model.as_deref().map(short_model).map(String::from))
        .or_else(|| {
            row.session_key
                .get("native_id")
                .and_then(Value::as_str)
                .map(String::from)
        });
    if let Some(id) = identity {
        parts.push(id);
    }
    if let Some(t) = row.tokens {
        parts.push(fmt_tokens(t));
    }
    parts.join(" · ")
}

/// 日预算一行：**分子与百分比只在可信时显示**。
///
/// 分母 `effective_daily_budget` 来自 alert.json，但它是一个**设置**
/// （config 的 daily_cny 过一遍 adaptive floor），不是测量值——过期的设置仍然
/// 是当前设置，照常显示。分子/百分比是**测量值**，两条都必须成立才显示：
/// ①今天真的有数据（`ov.today` 非 None——`today_cost` 已按北京日期校验过
/// today.json 的 date）；②alert.json 不过期。少任何一条就只显示分母 + 一句
/// 说明。
///
/// **为什么不自己算 `today_cost / daily_budget`**：那正是迁移要修的 D2 缺口
/// ——托盘自算的百分比与 `budget.py` 的规则（adaptive floor、peak_share_max、
/// snooze）无关，`budget show` 里全对、菜单栏上全错。百分比一律读 alert.json
/// 的 `ratio`，不重算。
///
/// **为什么要 ①**：alert.json 的 `today_cost` 是它落盘那一刻的"今日"。日历翻页
/// 之后没再跑过 oneline 时，它说的是**昨天**的今日——真机 2026-09-01 就是这样：
/// today.json 停在 08-31（`ov.today` 正确地为 None），alert.json 停在 08-30 报
/// today_cost ¥0.12。少了这个门，菜单会同时出现"今日成本：—（无数据）"和
/// "今日按量预算：¥0.12 / ¥30（0%）"两行自相矛盾的话。
fn daily_budget_text(ov: &Overview, now_secs: i64) -> Option<String> {
    // 设置页存了 estimate profile 时，这条 legacy（DSH-only，¥1 默认分母）日预算行
    // 只会和上面「本月预算」行打架（真机：「今日按量预算 — / ¥1（今日无数据）」挂在
    // 「预算：估算 CNY 超支 1450.96/500.00」上面）。profile 有日限额就按 profile 报
    // （已用 = 今日按量 + 订阅日摊），没有日限额就整行不显示。
    if let Some(profile) = ov.budget_profiles.as_ref()
        .and_then(|v| v.get("profiles")).and_then(Value::as_array)
        .and_then(|rows| rows.iter().find(|r| r.get("profile_id").and_then(Value::as_str) == Some("estimate")))
    {
        let daily_limit = profile.get("daily_minor").and_then(Value::as_i64)?;
        if daily_limit <= 0 { return None; }
        let spent = profile.get("daily_total_minor").or_else(|| profile.get("daily_spent_minor"))
            .and_then(Value::as_i64).unwrap_or(0);
        let denom = fmt_money(daily_limit as f64 / 100.0);
        return Some(match profile.get("daily_ratio_bp").and_then(Value::as_i64) {
            Some(bp) => format!("今日预算：≈{} / {denom}（{}%）", fmt_money(spent as f64 / 100.0), bp / 100),
            None => format!("今日预算：— / {denom}（今日无数据）"),
        });
    }
    let b = &ov.budget;
    let daily = b.effective_daily_budget?;
    let denom = fmt_money(daily);
    let fresh = !stale_from(b.generated_at.as_deref(), now_secs);
    if ov.today.is_none() {
        return Some(format!("今日按量预算：— / {denom}（今日无数据）"));
    }
    if !fresh {
        return Some(format!("今日按量预算：— / {denom}（数据过期，未重新评估）"));
    }
    match (b.today_cost, b.ratio) {
        (Some(c), Some(r)) => {
            Some(format!("今日按量预算：{} / {denom}（{:.0}%）", fmt_money(c), r * 100.0))
        }
        // alert.json 在场且新鲜，但这两个字段是 null——`evaluate()` 对"今日无
        // 数据"就是这么落盘的。不拿 null 当 0。
        _ => Some(format!("今日按量预算：— / {denom}（今日无数据）")),
    }
}

/// 本月订阅行：`本月订阅：¥232（已付，不计入按量预算）`，或 None（无订阅 →
/// 整行不显示，不摆「¥0」）。PM 决策 2026-09-07：订阅是月初已付的常数，**单
/// 列**在预算行下方——让用户看得见这笔钱、但知道它不是按量预算的闸门（摊进
/// 每 5 分钟刷新的告警分子只会让月初凭空涨一截然后整月杵着）。
fn subscription_line_text(ov: &Overview) -> Option<String> {
    let cny = ov.subscription_cny_month?;
    Some(format!("本月订阅：{}（已付，不计入按量预算）", fmt_money(cny)))
}

/// 同步状态一行：**成功也显示**，不是只在失败时才出现。
///
/// "上次成功同步是几点"是判断菜单里这些数字新不新的最直接信号——比预算行末尾
/// 那个「（数据过期）」后缀更直白，也覆盖了预算行不涉及的部分（今日/本月/最近
/// 会话都来自同一轮 tick）。原来只在 `!ok` 时显示，成功时菜单里没有任何时间戳，
/// 用户没法区分"数字是刚更新的"和"app 静默卡住半天了"。
fn sync_line_text(sync: &SyncStatus) -> String {
    if !sync.ok {
        return if sync.stage == "never" {
            "尚未同步".to_string()
        } else {
            format!("⚠ 上次同步失败：{}", sync.message)
        };
    }
    // `at` 是北京时间 `YYYY-MM-DD HH:MM:SS`，菜单只要 HH:MM。成功形态加
    // 「（DSH 折叠 + Claude 账）」后缀（spec §4）：同步回路折 DSH 会话 + 尾折
    // Claude 账（2026-09-02 起，tick 顺序见 sync_tick），Codex 没有同步循环——
    // 时间戳的覆盖范围必须说清楚，不能让人以为它是全宿主的新鲜度。
    match sync.at.as_deref().and_then(|s| s.get(11..16)) {
        Some(hhmm) => format!("上次同步：{hhmm} 成功（DSH 折叠 + Claude 账）"),
        None => "上次同步：成功（DSH 折叠 + Claude 账）".to_string(),
    }
}

/// 托盘菜单的宿主区行树（spec §4/§5.3/§8）。纯数据——`build_menu_at` 只做
/// `MenuRow` → Tauri `MenuItem/Submenu` 的机械翻译，菜单结构可以单测钉住，
/// 不用起 AppHandle。只有 Item 与 Submenu：宿主区内的分隔线由 build_menu_at
/// 在区块之间直接加，不属于行树（host_menu_rows 从不产 Separator）。
#[derive(Debug, PartialEq)]
enum MenuRow {
    Item { id: String, text: String, enabled: bool },
    Submenu { id: String, text: String, rows: Vec<MenuRow> },
}

/// 宿主区菜单行（spec §4/§8 降级矩阵逐格）：
/// · `status == "unavailable"` → L2 单行禁用「会话数据暂不可用」（空子菜单无
///   任何用户可操作物，禁用文案严格更有信息量——spec §8 原文对 cancelled 说不
///   渲染 L2，这里渲染禁用文案是**计划里注明的偏离**，更诚实）；
/// · ready 且 recent 空 → 禁用「尚无会话」（真零，不是失败——两种状态必须
///   可区分）；
/// · 其余 → 最近会话行（id `session:{kind}:{i}`，排序/截取在数据层已完成，
///   这里只按序渲染）。
/// stale（spec §6 决策 5）→ 每个宿主子菜单底部禁用项「数据更新于 hh:mm ·
/// 可能已过期」（hh:mm 是北京时刻，`generated_at` UTC 转北京渲染）。
fn host_menu_rows(
    hosts: &[HostRow],
    generated_at: Option<&str>,
    now_secs: i64,
) -> Vec<MenuRow> {
    let mut out = Vec::new();
    for row in hosts {
        let mut l2 = if row.status == "unavailable" {
            vec![MenuRow::Item {
                id: format!("session:unavailable:{}", row.host_kind),
                text: "会话数据暂不可用".into(),
                enabled: false,
            }]
        } else if row.recent.is_empty() {
            vec![MenuRow::Item {
                id: format!("session:none:{}", row.host_kind),
                text: "尚无会话".into(),
                enabled: false,
            }]
        } else {
            row.recent
                .iter()
                .enumerate()
                .map(|(i, r)| MenuRow::Item {
                    id: format!("session:{}:{}", row.host_kind, i),
                    text: recent_row_text(r, now_secs),
                    enabled: true,
                })
                .collect()
        };
        if hosts_stale_from(generated_at, now_secs) {
            l2.push(MenuRow::Item {
                id: format!("session:stale:{}", row.host_kind),
                text: format!(
                    "数据更新于 {} · 可能已过期",
                    generated_at
                        .and_then(parse_rfc3339_secs)
                        .map(beijing_hhmm)
                        .unwrap_or_else(|| "??:??".into())
                ),
                enabled: false,
            });
        }
        out.push(MenuRow::Submenu {
            id: format!("host:{}", row.host_kind),
            text: host_row_text(row),
            rows: l2,
        });
    }
    out
}

/// MenuRow 树 → Tauri 菜单项数组（机械翻译，`dyn IsMenuItem` trait 对象）。
/// Submenu 用 `Submenu::with_id_and_items`（items 是 `&[&dyn IsMenuItem]`
/// 切片）：子菜单带 id（`host:{kind}`），菜单事件才拿得到动态 id 做深链分发。
/// 递归翻译 L2 项。
fn menu_row_items<M: tauri::Manager<tauri::Wry>>(
    app: &M,
    rows: &[MenuRow],
) -> tauri::Result<Vec<Box<dyn tauri::menu::IsMenuItem<tauri::Wry>>>> {
    let mut out: Vec<Box<dyn tauri::menu::IsMenuItem<tauri::Wry>>> = Vec::new();
    for row in rows {
        match row {
            MenuRow::Item { id, text, enabled } => {
                out.push(Box::new(MenuItem::with_id(
                    app, id, text, *enabled, None::<&str>,
                )?));
            }
            MenuRow::Submenu { id, text, rows } => {
                let children = menu_row_items(app, rows)?;
                let refs: Vec<&dyn tauri::menu::IsMenuItem<tauri::Wry>> =
                    children.iter().map(|b| b.as_ref()).collect();
                out.push(Box::new(Submenu::with_id_and_items(
                    app, id, text, true, &refs,
                )?));
            }
        }
    }
    Ok(out)
}

/// MenuRow 树 → 追加进 MenuBuilder（`menu_row_items` 的一层薄壳：builder 一次
/// item 一个，翻译逻辑都在上面，这里只管把 trait 对象逐个放进去）。
fn append_menu_rows<'a, M: tauri::Manager<tauri::Wry>>(
    builder: tauri::menu::MenuBuilder<'a, tauri::Wry, M>,
    app: &'a M,
    rows: &[MenuRow],
) -> tauri::Result<tauri::menu::MenuBuilder<'a, tauri::Wry, M>> {
    let items = menu_row_items(app, rows)?;
    let refs: Vec<&dyn tauri::menu::IsMenuItem<tauri::Wry>> =
        items.iter().map(|b| b.as_ref()).collect();
    let mut b = builder;
    for r in refs {
        b = b.item(r);
    }
    Ok(b)
}

fn build_menu(app: &AppHandle, ov: &Overview) -> tauri::Result<Menu<tauri::Wry>> {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);
    build_menu_at(app, ov, now)
}

/// 账卡两行（今日/本月按量成本）的文案。纯函数拆出来给 build_menu 拼行、给单测钉
/// 每一格——用户最先看到的菜单文案不能只靠人工核对。
///
/// v1.3 起钱段 = **合并按量总账**（`metered_amount`：DSH 实测 + Claude catalog 估
/// 的 CNY 相加，估分量并入就标 ≈），不是 v1.2 的 DSH-only + 追加「Claude 估」列。
/// 为什么弃追加列：真机那天 DSH 空转、钱全在 Claude Code 的 deepseek 流上，v1.2
/// 呈现成「¥0 · Claude 估 ≈¥37.17」，顶层行读起来像真没花钱——用户以为「按量成本
/// 无数据」是坏的。合并后估占主导就写 `≈¥37.17`，`≈` 即诚实标注。
///
/// 今日行 = 钱 + token 量（两者不是一回事——缓存命中率变化时钱不动 token 动，只
/// 报钱会让"今天明明干了很多活却几乎没花钱"看起来像没数据；标题 `today_title` 里
/// 本来就是并排显示，菜单第一行跟它对齐）。token 同源合并 `today_merged_tokens`。
/// 本月行只显示金额（同款合并）。
///
/// 前缀「按量」与日预算/月成本同口径（spec §4）：这些是**按量计费**的钱，不是预算
/// 卡里那笔评估额。预算行是 DSH-only 的（bottom budget_item + 日预算行），不在这
/// 两行里——spec §4 按量/套餐按 supplier 分，DSH 预算不管 Claude Code 的流。
/// 菜单首行「今日消耗」：与标题、工作台 KPI 同一个 token 数（用户定向 2026-09-17：
/// 今日消耗放首位，钱行其次）。无数据 → 「今日消耗：—」。
fn today_tokens_row_text(ov: &Overview) -> String {
    let tokens = today_tokens(ov);
    if tokens > 0 { format!("今日消耗：{} tokens", fmt_tokens(tokens)) } else { "今日消耗：—".to_string() }
}

fn money_rows_text(ov: &Overview) -> (String, String) {
    // 2026-09-17 起先读 SQL 的 `metered_view`（账单 > 归因估算 > 默认估算，与工作台
    // 总览卡同一个数）；库缺席才退回旧的 DSH state + claude ledger 拼法。
    let today_money = metered_view_text(ov.metered_today.as_ref(), fx_rate(ov)).or_else(|| metered_amount(
        ov.today.as_ref().and_then(|t| t["total"].as_f64()),
        claude_currency(&ov.claude_today, "CNY"),
        claude_currency(&ov.claude_today, "USD"),
        fx_rate(ov),
    ));
    // token 不再挂在这一行（首行「今日消耗」已经是它），这里只剩钱。
    let today_text = match today_money {
        Some(m) => format!("今日按量成本：{m}"),
        // 今天没有可报的按量钱（全在套餐内 / 没用量）→ 诚实的 —（缺列报缺）。
        None => "今日按量成本：—（无数据）".to_string(),
    };
    // 本月行：同款合并，但 **只显示金额、去掉 `/ ¥600` 分母**（v1.3）。分母是 DSH
    // 预算——合并后 ¥ 主账已跨宿主，拿 DSH 预算给整个合并总账当分母是把「本月花
    // 了多少」和「DSH 预算还剩多少」绑成一行；DSH 预算状态常驻在底部预算行
    // （budget_item）照常显示，这里不需要第二遍。
    //
    // DSH 侧本月是否「有折到账」：当月过滤后**有日**才算（镜像今日 None 语义——
    // 当月空 / 全是上月残留 = 本月没折到账，不是花了 0）。有日但金额 ¥0（只折到
    // 免费 token 的日子）→ Some(0)，「测到 0」不是「没测」。
    let month_total = ov.month["total"].as_f64().unwrap_or(0.0);
    // `ov.days` = read_overview_at 当月过滤后的逐日行（同款 cur_month 过滤）——
    // 非空 ⇔ DSH 本月确实折到过账。month_cost 聚合本身不带日数，不能从
    // `ov.month` 里看。
    let month_has_days = !ov.days.is_empty();
    let month_money = metered_view_text(ov.metered_month.as_ref(), fx_rate(ov)).or_else(|| metered_amount(
        if month_has_days { Some(month_total) } else { None },
        claude_currency(&ov.claude_month, "CNY"),
        claude_currency(&ov.claude_month, "USD"),
        fx_rate(ov),
    ));
    // month_money 只在两宿主当月都没有任何按量钱时是 None → ¥0（当月还没花，
    // 「月初 ¥0」是现状不是编造；预算行挂了过期标记兜底）。
    let month_text = format!(
        "本月按量成本：{}",
        month_money.unwrap_or_else(|| fmt_money(month_total)),
    );
    (today_text, month_text)
}

/// 参数化版——now 由调用方注入，单测钉住每一行文案不用碰系统时钟。
fn build_menu_at(app: &AppHandle, ov: &Overview, now_secs: i64) -> tauri::Result<Menu<tauri::Wry>> {
    let (today_text, month_text) = money_rows_text(ov);
    let budget_text = budget_status_text_at(ov, now_secs);
    // 信息行一律 enabled=true：macOS 对 disabled 菜单项强制灰色渲染，作为常驻
    // 信息几乎不可读；enabled 后文字是系统默认黑。代价是悬停高亮 + 点击会触发
    // MenuEvent——handler 的 `_ => {}` 兜底这些 id，点击什么也不做，只有菜单
    // 关闭。黑字可读 > 不可点态的视觉暗示，值得。
    // 「今日按量成本」行已去掉（用户定向 2026-09-17）：首行只放今日消耗 token，钱看
    // 本月行与预算行。`today_text` 仍由 money_rows_text 算出并有单测钉住，只是不上菜单。
    let _ = today_text;
    let tokens_item = MenuItem::with_id(app, "today_tokens", today_tokens_row_text(ov), true, None::<&str>)?;
    let month_item = MenuItem::with_id(app, "month", month_text, true, None::<&str>)?;
    let budget_item = MenuItem::with_id(app, "budget", budget_text, true, None::<&str>)?;
    let mut builder = MenuBuilder::new(app).item(&tokens_item);
    // 日预算：紧跟今日成本，回答"今天这些钱占日额度多少"。缺 alert.json 时整条
    // 不显示——预算行本身已经说了「等预算数据」，不用再空一行。
    if let Some(t) = daily_budget_text(ov, now_secs) {
        builder = builder.item(&MenuItem::with_id(app, "daily", t, true, None::<&str>)?);
    }
    builder = builder.item(&month_item);
    // 宿主区（spec §4）：每宿主一个子菜单——L1 = 显示名 · 今日 token · 会话数，
    // L2 = 最近会话跳转行（结构由 host_menu_rows 纯函数钉住，§9.2）。平铺的
    // 「最近会话」行随面板一起删除（2026-09-01 spec 修订）——最近会话入口收敛
    // 到宿主子菜单里，顶层菜单只剩钱行与操作项。
    builder = builder.separator();
    builder = append_menu_rows(
        builder,
        app,
        &host_menu_rows(&ov.hosts, ov.hosts_generated_at.as_deref(), now_secs),
    )?;
    builder = builder.separator().item(&budget_item);
    // 本月订阅（PM 决策 2026-09-07）：紧跟按量预算行，单列——「已付、不计入
    // 按量预算」。无订阅 → 整行不显示。
    if let Some(t) = subscription_line_text(ov) {
        builder = builder.item(&MenuItem::with_id(app, "subscription", t, true, None::<&str>)?);
    }
    // 同步状态常驻（成功也显示）——托盘是主入口，"数字是什么时候的"必须在这里
    // 一眼可见，不该等到打开工作台才发现同步早就断了。
    builder = builder.item(&MenuItem::with_id(
        app,
        "sync",
        sync_line_text(&ov.sync),
        true,
        None::<&str>,
    )?);
    // 工作台主窗口入口（任务 #5）：独立可缩放窗口，五页 总览/日历/会话/Findings/
    // 数据源。**没有"打开面板…"菜单项**，面板本身也已经整体删除（2026-09-01）
    // ——面板展示的今日/本月/预算/本月逐日本来就是工作台"总览"tab 的严格子集，
    // 一个字段不多；用户先反馈两者"功能重合"（菜单项先删），又反馈左右键该跟
    // 大多数状态栏图标一样统一弹菜单（右键的专属"弹面板"手势也删），面板到此
    // 已经没有任何入口——留着 `toggle_window`/独立 HTML+JS+CSS 就是纯粹的死
    // 代码，一并删除，不留一份没人能打开的界面。
    let workbench_item = MenuItem::with_id(app, "workbench", "打开工作台…", true, None::<&str>)?;
    let skill_health_item = MenuItem::with_id(app, "skill_health", "Skill 体检", true, None::<&str>)?;
    let refresh_item = MenuItem::with_id(app, "refresh", "立即同步", true, None::<&str>)?;
    let menu = builder
        .separator()
        .item(&workbench_item)
        .item(&skill_health_item)
        .item(&refresh_item)
        .separator()
        .item(&PredefinedMenuItem::quit(app, Some("退出"))?)
        .build()?;
    // HostsCache：深链分发的映射依据（spec §9.2 #12）——缓存必须等于刚构建的
    // 菜单用的宿主行，否则 `session:{kind}:{i}` 会查到错行。写在这里而不是
    // refresh 里：startup warm-start（read_overview 带 hosts.json 旧快照）与
    // 每轮 tick 的 build_menu 都经过同一写入点，缓存不会停在旧菜单。
    app.state::<HostsCache>().0.lock().unwrap_or_else(|e| e.into_inner()).clone_from(&ov.hosts);
    Ok(menu)
}

/// 重算 overview 并重建托盘 —— 标题（今日成本）与菜单里的数字不是静态文案，每次
/// 刷新都重新读 state 文件走 core 折叠。
fn refresh(app: &AppHandle) {
    let ov = overview::read_overview();
    if let Some(tray) = app.tray_by_id("main") {
        let _ = tray.set_title(Some(today_title(&ov)));
        if let Ok(menu) = build_menu(app, &ov) {
            let _ = tray.set_menu(Some(menu));
        }
    }
}

/// `sessions navigation` 一轮查询的硬超时（spec §6 决策 5）：20 秒后 kill。
/// 冷 store 首建 30s+ 时首轮会超时——宿主区退化为上一轮快照（或 unavailable），
/// 下一轮 tick（5 分钟后）重试，不阻塞托盘。工作台 IPC 的 `sessions list`
/// 故意**没有**超时（冷构建 30s+ 是合法的，前端有 loading banner）——这里是
/// tick 内的阻塞点，必须有界，否则一轮同步能把 SyncLock 占死 30 秒。
const NAVIGATION_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(20);

/// spawn `sessions navigation` 并等 stdout，带 20s 硬超时：`try_wait` 50ms 轮询，
/// 超时 → `child.kill()` + `wait()`（回收，不留僵尸）→ None。非零退出/spawn
/// 失败/超时一律 None——调用方决定是保留旧快照还是 degraded，这里不编造。
fn run_navigation(bin: &Path, day: &str) -> Option<Value> {
    let timezone = agent_vitals_runtime::statistics_timezone::timezone_name(&overview::data_home())
        .ok()
        .unwrap_or_else(agent_vitals_runtime::clock::system_timezone_name);
    let mut child = std::process::Command::new(bin)
        .args([
            "sessions".to_string(),
            "navigation".to_string(),
            "--day".to_string(),
            day.to_string(),
            "--timezone".to_string(),
            timezone,
            "--recent".to_string(),
            "5".to_string(),
            "--json".to_string(),
        ])
        .env("AGENT_VITALS_HOME", overview::data_home())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .ok()?;
    let start = std::time::Instant::now();
    loop {
        match child.try_wait().ok()? {
            Some(status) if status.success() => {
                let mut out = String::new();
                use std::io::Read;
                child.stdout.as_mut()?.read_to_string(&mut out).ok()?;
                return serde_json::from_str(&out).ok();
            }
            Some(_) => return None,
            None => {
                if start.elapsed() > NAVIGATION_TIMEOUT {
                    let _ = child.kill();
                    let _ = child.wait();
                    return None;
                }
                std::thread::sleep(std::time::Duration::from_millis(50));
            }
        }
    }
}

/// 一轮 tick 的宿主区刷新（spec §6 决策 5）：spawn `sessions navigation` →
/// 快照落盘 hosts.json。**刷新失败不覆盖 hosts.json**——保留末次成功快照，它靠
/// generated_at 变旧自然转 stale，托盘显示「数据更新于 hh:mm · 可能已过期」
/// 而不是整块消失或摆 0。二进制缺失同样静默（顶层钱行有自己的降级文案，宿主
/// 区上一轮快照继续服务）。单飞由 SyncLock 保证——只在 sync_tick 里被调用，
/// tick 与「立即同步」都持锁。
fn refresh_hosts() {
    let Some(bin) = resolve_binary() else { return };
    let Some(snap) = run_navigation(&bin, &overview::today_beijing()) else {
        return;
    };
    let hosts = overview::host_rows_from_navigation(&snap);
    overview::save_hosts_at(
        &overview::data_home(),
        &HostsSnapshot {
            generated_at: snap
                .get("generated_at")
                .and_then(Value::as_str)
                .map(String::from),
            hosts,
        },
    );
}

/// `agent-vitals` 二进制解析：`AGENT_VITALS_BIN` env 覆盖 → 与自身同目录 / 兄弟
/// `Resources/bin`（把 CLI 打进 .app 部署时用）→ PATH。tick 靠它做发现与折账
/// （discovery/oneline 是二进制 crate 的模块，src-tauri 是独立 workspace import
/// 不到——spawn 是「不长第二份拷贝」的唯一路径）。
///
/// **PATH 只放最后**：登录项/launchd 启动的 app PATH 是极简的（没有 ~/.local/bin），
/// 真机 last-sync 报「未找到二进制」正是这个——部署必须不依赖登录 shell 的 PATH。
fn resolve_binary() -> Option<PathBuf> {
    resolve_binary_from(
        &|k| std::env::var(k).ok(),
        std::env::var("PATH").unwrap_or_default(),
        std::env::current_exe().ok(),
        &|p: &Path| p.is_file(),
    )
}

/// 读取实际会被桌面同步回路使用的 CLI 版本。诊断只读探测：二进制缺失、
/// 启动失败或输出无法识别时返回 `None`，不把 App 版本冒充 CLI 版本。
fn resolved_cli_version() -> Option<String> {
    let binary = resolve_binary()?;
    let output = Command::new(binary).arg("--version").output().ok()?;
    if !output.status.success() {
        return None;
    }
    let text = String::from_utf8_lossy(&output.stdout);
    text.lines()
        .map(str::trim)
        .find(|line| !line.is_empty())
        .map(ToOwned::to_owned)
}

/// 纯函数版二进制解析——env、自身可执行文件、文件判断由调用方注入，单测不碰真实
/// 环境变量。优先序：AGENT_VITALS_BIN > 自身目录（含 `../Resources/bin`）> PATH。
fn resolve_binary_from(
    get_env: &dyn Fn(&str) -> Option<String>,
    path: String,
    exe: Option<PathBuf>,
    is_file: &dyn Fn(&Path) -> bool,
) -> Option<PathBuf> {
    if let Some(b) = get_env("AGENT_VITALS_BIN") {
        let p = PathBuf::from(b);
        if is_file(&p) {
            return Some(p);
        }
    }
    // 自身目录：`Contents/MacOS/agent-vitals`（与 menubar 同目录）或
    // `Contents/Resources/bin/agent-vitals`（打包版放 CLI 的规范位置）。用
    // parent 遍历而不是字面 `..`——返回的路径不含 `..`，对 display/spawn 都干净。
    if let Some(macos) = exe.as_deref().and_then(|e| e.parent()) {
        let sibling = macos.join("agent-vitals");
        if is_file(&sibling) {
            return Some(sibling);
        }
        if let Some(contents) = macos.parent() {
            let bundled = contents.join("Resources").join("bin").join("agent-vitals");
            if is_file(&bundled) {
                return Some(bundled);
            }
        }
    }
    for dir in std::env::split_paths(&path) {
        let cand = dir.join("agent-vitals");
        if is_file(&cand) {
            return Some(cand);
        }
    }
    None
}

/// 跑 `agent-vitals discover`，解析 stdout JSON。失败 → None（tick 只记日志，
/// 不让托盘崩）。discover 是只读子命令，不需要 owner 是 rust。
fn run_discover(bin: &Path) -> Option<Value> {
    let out = std::process::Command::new(bin).arg("discover").output().ok()?;
    if !out.status.success() {
        return None;
    }
    serde_json::from_slice(&out.stdout).ok()
}

/// 从 discover 报告里取最新未折会话（`unfolded` 已按 mtime 降序，首条即最新）。
/// 返回 (path, session_id)；报告为空 → None。
fn latest_unfolded(report: &Value) -> Option<(String, String)> {
    let first = report.get("unfolded")?.as_array()?.first()?;
    let path = first.get("path")?.as_str()?.to_string();
    let sid = first.get("session_id").and_then(Value::as_str).unwrap_or("").to_string();
    Some((path, sid))
}

/// 一轮同步的实际工作：发现最新未折 DSH 会话 → spawn `agent-vitals oneline` 折进
/// state → 返回本轮 `SyncStatus`。**每一类结局都返回一条可落盘的状态**——不是只
/// 进 stderr。oneline 的写链本身有 fencing + exactly-once，这里不在 spawn 之外
/// 再叠一层保险。
fn perform_sync() -> SyncStatus {
    let Some(bin) = resolve_binary() else {
        return SyncStatus::fail(
            "resolve",
            "未找到 agent-vitals 二进制（设 AGENT_VITALS_BIN、加入 PATH，或放进 app 的 Contents/Resources/bin/）".into(),
        );
    };
    let Some(report) = run_discover(&bin) else {
        return SyncStatus::fail("discover", "agent-vitals discover 失败".into());
    };
    let Some((path, session_id)) = latest_unfolded(&report) else {
        // 无未折会话不是失败——是「没活干」的正常态；但 tick 仍要 refresh，把
        // 外部/手动改过的 state 重读进托盘。
        return SyncStatus::ok(
            "discover",
            format!(
                "无未折 DSH 会话（bare={}, zstd_only={}）",
                report["bare_jsonl"], report["zstd_only"]
            ),
        );
    };
    // 折进 app 自己的数据根——子进程继承其余环境，这里显式钉死 AGENT_VITALS_HOME
    // 与 overview::data_home() 一致（future-proof：哪天 data_home 加 legacy 分支
    // 也不至于把账折到 app 读不到的地方）。
    let home = overview::data_home();
    let out = std::process::Command::new(&bin)
        .arg("oneline")
        .arg(&path)
        .arg("--session-id")
        .arg(&session_id)
        .env("AGENT_VITALS_HOME", &home)
        .output();
    match out {
        Ok(o) if o.status.success() => SyncStatus::ok("fold", format!("已折入 {session_id}")),
        Ok(o) => SyncStatus::fail(
            "fold",
            format!(
                "oneline 失败（{}）：{}",
                o.status,
                String::from_utf8_lossy(&o.stderr).trim()
            ),
        ),
        Err(e) => SyncStatus::fail("fold", format!("oneline spawn 失败：{e}")),
    }
}

/// Claude 账尾折（tick 顺序 §8：DSH discover/oneline → `claude-sync` → 宿主区
/// 刷新）。best-effort：返回 `None` = 成功、`Some(错误)` = 失败——失败不 abort
/// tick（claude-code 宿主行照常刷新：ledger 缺当日 → null 三元组，诚实形态），
/// 但 SyncStatus 必须留痕，托盘说「同步成功」时用户有权认为 claude-code 行的
/// 数字也是新的。claude-sync 幂等（size/mtime 指纹，重跑零变化），每轮 tick 都
/// 跑没有副作用。owner fencing 与 oneline 同款（本二进制 = rust owner，直跑）。
fn run_claude_sync(bin: &std::path::Path) -> Option<String> {
    let home = overview::data_home();
    let out = std::process::Command::new(bin)
        .arg("claude-sync")
        .env("AGENT_VITALS_HOME", &home)
        .output();
    match out {
        Ok(o) if o.status.success() => None,
        Ok(o) => Some(format!(
            "claude-sync 失败（{}）：{}",
            o.status,
            String::from_utf8_lossy(&o.stderr).trim()
        )),
        Err(e) => Some(format!("claude-sync spawn 失败：{e}")),
    }
}

/// Facts 例行 ingest（tick 顺序：DSH discover/oneline → claude-sync →
/// `sync-facts` → 宿主区刷新）——退休路径第 ① 步的「常态化」半步：托盘
/// tick 是 facts 平面的生产驱动源。best-effort 同 claude-sync：失败留痕不
/// abort（facts 是新增平面，state 链照常刷新）。幂等双保险：checkpoint
/// 指纹跳过未变文件 + fact_id exactly-once（重跑零变化）。
fn run_facts_sync(bin: &std::path::Path) -> Option<String> {
    let home = overview::data_home();
    let out = std::process::Command::new(bin)
        .arg("sync-facts")
        .env("AGENT_VITALS_HOME", &home)
        .output();
    match out {
        Ok(o) if o.status.success() => None,
        Ok(o) => Some(format!(
            "sync-facts 失败（{}）：{}",
            o.status,
            String::from_utf8_lossy(&o.stderr).trim()
        )),
        Err(e) => Some(format!("sync-facts spawn 失败：{e}")),
    }
}

/// fold 完成事件名。与工作台 `src-tauri/ui/workbench.js` 顶部的
/// `listen("usage-fold-updated", …)` 一一对应——改名/改负载字段必须两处同步改
/// （workbench.js 的事件桥注释里反向引用了这个名字与负载）。
const FOLD_EVENT: &str = "usage-fold-updated";

/// fold 事件去抖窗口：200ms 内多轮同步完成只广播一次。
const FOLD_EVENT_DEBOUNCE: std::time::Duration = std::time::Duration::from_millis(200);

/// fold 完成事件的去抖状态（经 `app.manage` 注册，tick/手动两个线程共享——emit
/// 在 `sync_tick` 里，tick 与「立即同步」都可能走到，必须是跨线程共享状态）。
/// 只记「上次广播时刻」：leading-edge 去抖在「是否该发」这件事上是**无状态的**
/// （距上次 ≥ 窗口就发、< 窗口就吞），不需要 Rust 侧的 pending 标志——「有完成
/// 被吞、还欠一次重拉」这个 pending 语义在 JS 侧落地（workbench.js 的
/// `makePullMerger`，`queued` 就是那个真正起作用的 pending 标志）。
///
/// 为什么需要去抖：fold 是**整批一次完成**（discover → oneline → 落盘），不是
/// 高频事件流——去抖不是为削峰，是为「手动点同步 + tick 恰好同时完成」时把两轮
/// 挨着的完成合并成一次广播，避免工作台对同几毫秒的数据双拉。SyncLock 已经保证
/// 任意时刻至多一轮同步在跑，但一轮可能在另一轮结束后立刻补位（手动按钮在 tick
/// 的锁上阻塞、tick 一放锁就抢进去），两轮完成的时间差就是第二轮整轮耗时——
/// 秒级、通常远超窗口；去抖真正的兜底场景是 oneline 极快（小会话 + 热 CLI）时
/// 两轮完成挤进 200ms。窗口内再次完成只更新 last_emit，不重复 emit。
struct FoldEventDebounce(Mutex<Option<std::time::Instant>>);

/// 菜单栏「信息行」点击产生的导航目标（工作台 tab 名）。持久存目标是因为窗口未建/未
/// 可见时 `emit` 是空操作（`emit_fold_event` 注释，lib.rs:521）——目标要留到工作台下次
/// init/focus 时 pull 出来消费；`focus-tab` 事件只是通知，pull 是最终仲裁。工作台 apply
/// 成功后调 `clear_nav_target` 清除，防陈旧目标在下次 focus 重复应用。
struct NavTarget(Mutex<Option<String>>);

/// 会话深链目标（spec §7.1）：强类型（serde tag `type` + camelCase 变体名），
/// 不再是裸 `Value`。`sessionDetail`（L2 行 → 会话详情）与 `sessionList`（打开
/// 会话列表按 host 过滤，为「查看全部会话」回归预留——v1 菜单只发射前者，
/// §7.1）由 `type` 字段区分，工作台前端据此分发。v1 前端只消费（peek 回来 +
/// apply 后 clear），不从前端发射。
#[derive(Serialize, Deserialize, Clone, PartialEq, Debug)]
#[serde(tag = "type", rename_all = "camelCase")]
enum WorkbenchTarget {
    SessionList { host_kind: Option<String> },
    SessionDetail { session_key: SessionKeyJson },
}

/// core `SessionKey::to_json()` 的 4 字段镜像（spec §7.1）。**两处与 spec 代码块
/// 字面不同，都是 prose/字节契约压过字面，理由写死在这里防回退**：
/// · 不加 `rename_all = "camelCase"`——`to_json()` 发 snake_case 键，前端把同一
///   对象原样回传 `sessions_read`（store.rs 透传 `--session-key`），而
///   `SessionKey::from_json` 只认 4 个 snake_case 键；camelCase 会让回传打到
///   解析不了的对象上（not-found）。
/// · 字段用非 Option `String`——`to_json()` 恒发 4 个 string（`from_json` 也只要
///   string，任一缺/非 string → None）。Option 会让 null 反序列化通过、序列化回
///   null，回传时 from_json 失败——类型自己堵死这条路，比运行时检查诚实。
#[derive(Serialize, Deserialize, Clone, PartialEq, Debug)]
struct SessionKeyJson {
    host_kind: String,
    native_id: String,
    source_profile: String,
    machine_namespace: String,
}

/// 会话深链的待消费目标（spec §7.2）：菜单 L2 点击 → `focus_session` 覆盖式存入、
/// 推 `focus-target` 事件、`show_workbench`；工作台在 init / window focus /
/// `visibilitychange`(visible) 时 pull（`peek_focus_target`，**非破坏性**），
/// **成功应用后**才 `clear_focus_target`（应用失败也 clear——错误横幅已向用户
/// 说明，菜单再点会覆盖新目标，不无限重试）。持久是因为窗口未建/未可见时
/// emit 是空操作，目标要留到工作台下次可见；事件只是通知，pull 是最终仲裁
/// （§7.2 末句）。与 `NavTarget` 并存：那是信息行→tab 名（另一维度），spec §7
/// 只描述深链机制，未要求取代信息行通路。
struct FocusTarget(Mutex<Option<WorkbenchTarget>>);

impl FocusTarget {
    fn set(&self, target: WorkbenchTarget) {
        *self.0.lock().unwrap_or_else(|e| e.into_inner()) = Some(target);
    }

    fn peek(&self) -> Option<WorkbenchTarget> {
        self.0.lock().unwrap_or_else(|e| e.into_inner()).clone()
    }

    fn clear(&self) {
        *self.0.lock().unwrap_or_else(|e| e.into_inner()) = None;
    }
}

/// 最近一次托盘菜单构建用的宿主行（spec §9.2 #12 的映射依据）：动态菜单 id
/// `session:{kind}:{i}` 按 id 查行 → 行内 session_key → `SessionDetail`。由
/// `build_menu_at` 每次构建后写入——缓存 == 刚构建的菜单；startup warm-start
/// （read_overview 带 hosts.json 旧快照）与每轮 tick 都经过同一写入点，缓存
/// 不会停在旧菜单。
struct HostsCache(Mutex<Vec<HostRow>>);

/// 去抖判定（纯函数，单测钉住）：距上次广播 ≥ 窗口（或从未发过）→ 广播；
/// < 窗口 → 吞掉（不发，避免工作台双拉）。用「距上次多久」而不是绝对 Instant，
/// 让单测能自由构造时长（Instant 造不出任意值）。
fn fold_debounce_step(elapsed: Option<std::time::Duration>) -> bool {
    match elapsed {
        None => true,
        Some(e) => e >= FOLD_EVENT_DEBOUNCE,
    }
}

/// 是否该广播 fold 事件：oneline 成功折账（stage=="fold" 且 ok）。「无未折会话」
/// （stage=="discover"）不是 fold——没有新数据落盘，广播只会让工作台拉一遍旧数字。
fn should_emit_fold_event(status: &SyncStatus) -> bool {
    status.ok && status.stage == "fold"
}

/// fold 成功落盘后广播给工作台（200ms 去抖合并）。负载只有 `at`（fold 完成时刻，
/// unix 秒）——工作台重拉 `read_overview` 拿权威数据，负载里不放 month/数字，
/// 最小化。`at` 与 `SyncStatus::at`（北京时间）同源（同一时刻）；JS 侧当前只把
/// 事件当触发信号、不读负载，字段语义见 workbench.js 的事件桥注释。
///
/// **webview 未就绪/没打开时 `emit` 是空操作**：事件发出去了但没有 webview 收到，
/// 静默丢弃。这正是「事件桥失败不比现在更差」的兜底面——工作台下一次聚焦、
/// 5 分钟 tick、或手动同步都会重新拉，丢一两个事件不会让工作台停在旧数据上
/// 超过一个同步周期。
fn emit_fold_event(app: &AppHandle) {
    let now = std::time::Instant::now();
    let should_emit = {
        // 先 bind state 再 .lock()：`app.state()` 返回的是临时 State，直接在一句
        // 里 .lock() 会让 MutexGuard 借用一个即将析构的临时值（E0716）。
        let deb = app.state::<FoldEventDebounce>();
        let mut last_emit = deb.0.lock().unwrap_or_else(|e| e.into_inner());
        let elapsed = last_emit.map(|t| now.duration_since(t));
        let emit = fold_debounce_step(elapsed);
        if emit {
            *last_emit = Some(now);
        }
        emit
    };
    if should_emit {
        let at = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0);
        let _ = app.emit(FOLD_EVENT, serde_json::json!({ "at": at }));
    }
}

/// 一轮同步 + 落盘状态 + 重建托盘。**每一条路径都走到这里**——没有提前 return
/// 跳过托盘更新的分支（这正是「多数正常路径连 state 重读都不做」的修复：无未折
/// 会话/二进制缺失/discover 失败也要刷新，把外部更新带进托盘）。
fn sync_tick(app: &AppHandle) {
    match overview::sync_is_paused() {
        Ok(true) => {
            let status = SyncStatus::ok("paused", "已按你的选择暂停本机解析".into());
            overview::save_sync_status(&status);
            let _ = app.emit(SYNC_STATUS_EVENT, serde_json::json!({
                "ok": status.ok, "stage": status.stage, "message": status.message,
            }));
            refresh(app);
            return;
        }
        Err(error) => {
            let status = SyncStatus::fail("control", format!("同步控制状态不可读：{error}"));
            overview::save_sync_status(&status);
            let _ = app.emit(SYNC_STATUS_EVENT, serde_json::json!({
                "ok": status.ok, "stage": status.stage, "message": status.message,
            }));
            refresh(app);
            return;
        }
        Ok(false) => {}
    }
    let initial = perform_sync();
    let folded = should_emit_fold_event(&initial);
    // 一宿主失败不能阻塞其他宿主的导入；共享二进制缺失仍由 resolve 状态报告。
    let (status, facts_ready) = match resolve_binary() {
        Some(bin) => finish_sync_stages(initial, || run_claude_sync(&bin), || run_facts_sync(&bin)),
        None => (initial, false),
    };
    overview::save_sync_status(&status);
    // 首次扫描即使没有新增 facts，也要让已打开的工作台结束“正在整理”的状态。
    // `usage-fold-updated` 只代表有新折账，不能承担这个生命周期事件。
    let _ = app.emit(SYNC_STATUS_EVENT, serde_json::json!({
        "ok": status.ok, "stage": status.stage, "message": status.message,
    }));
    // 宿主区：sessions navigation（20s 硬超时；失败不覆盖 hosts.json——上一轮
    // 快照继续渲染并自然转 stale，spec §6 决策 5）。
    refresh_hosts();
    refresh(app);
    budget_alerts::maybe_notify(app);
    quota_alerts::maybe_notify(app);
    // DSH fold 或事实同步成功后广播；其他来源的失败不隐藏本轮可用结果。
    // sync-facts 暂未返回新增计数，因此成功扫描也会刷新；webview 未就绪时由
    // 下一次加载读取最新结果，事件桥不承担持久化。
    if folded || facts_ready {
        emit_fold_event(app);
    }
}

/// 按序执行独立导入阶段并保留全部失败原因。成功导入的 facts 即使处于部分
/// 失败的一轮，也需要通知工作台读取新结果。
fn finish_sync_stages(
    initial: SyncStatus,
    claude: impl FnOnce() -> Option<String>,
    facts: impl FnOnce() -> Option<String>,
) -> (SyncStatus, bool) {
    let mut failures = Vec::new();
    if !initial.ok { failures.push(format!("{}: {}", initial.stage, initial.message)); }
    if let Some(err) = claude() { failures.push(format!("claude-sync: {err}")); }
    let facts_error = facts();
    let facts_ready = facts_error.is_none();
    if let Some(err) = facts_error { failures.push(format!("sync-facts: {err}")); }
    let status = if failures.is_empty() { initial }
        else { SyncStatus::fail("partial", failures.join("；")) };
    (status, facts_ready)
}

/// 每 5 分钟一轮：发现最新未折 DSH 会话 → spawn `agent-vitals oneline` 折账 →
/// 重建托盘。启动先跑一轮（托盘一亮就是新数据，不用等 5 分钟）。detached 线程
/// 即可：Tauri 的 tray 操作线程安全，AppHandle 可跨线程调用。互斥锁保证定时轮
/// 与「立即同步」不并发叠跑。
fn start_refresh_tick(app: AppHandle) {
    std::thread::spawn(move || loop {
        let lock = app.state::<SyncLock>();
        if let Ok(_guard) = lock.0.try_lock() {
            sync_tick(&app);
        } else {
            eprintln!("[agent-vitals] 同步进行中，跳过本轮");
        }
        std::thread::sleep(TICK_PERIOD);
    });
}

/// 「立即同步」（托盘菜单 / 工作台按钮共用）：受控 tick 一次。跑在后台线程，菜单
/// 事件处理器不阻塞；互斥锁阻塞等待在途同步结束，保证用户点的这一次真的执行。
fn sync_now(app: &AppHandle) {
    sync_now_tracked(app, None);
}

fn sync_now_tracked(app: &AppHandle, request_id: Option<String>) {
    let app = app.clone();
    std::thread::spawn(move || {
        let lock = app.state::<SyncLock>();
        let _guard = lock.0.lock().unwrap_or_else(|e| e.into_inner());
        sync_tick(&app);
        if let Some(id) = request_id {
            let requests = app.state::<SyncRequests>();
            let mut requests = requests.0.lock().unwrap_or_else(|e| e.into_inner());
            requests.insert(id, true);
        }
    });
}

/// 后台预热 SQL 权威库 readonly handle：app 启动就 spawn 一轮 `data-status --json`，
/// 让权威库 SQLite 文件句柄在用户点会话/findings tab 之前就绪——v0.9.1 起
/// sessions 数据唯一来源是 SQL 权威库（`agent-vitals.sqlite3` schema v2），
/// 旧 r2a_store jsonl 重放路径已退役（PR #3 收口，PR #4 feature gate，
/// PR #5 整文件删除）。
///
/// **data-status 比 sessions list 更轻**——它只读 schema 版本 + 跑
/// `PRAGMA integrity_check` + 计数 facts / sessions，不返回大 list DTO；
/// 权威库 readonly open 本就 sub-second，预热目的是让权威库的 SQLite
/// 文件预热进 page cache 与（若有）wal checkpoint 落盘，避免首次
/// sessions list 头几页的 PRAGMA / planner 抖动。
///
/// best-effort：二进制缺失/数据根不可写静默吞掉，用户点击时再正常走
/// async 路径；`StoreBuildLock` 保证与用户点击并发时后者等前者写完——
/// 这里没有可写的 cache，但锁依然有意义：避免 cold open 与
/// mcp_sessions_search 同时打开各跑一次 `PRAGMA integrity_check` 触发
/// 不必要的临时连接抖动）。
fn warm_authority_db(app: &AppHandle) {
    let app = app.clone();
    std::thread::spawn(move || {
        let lock = app.state::<store::StoreBuildLock>().inner().clone();
        let _guard = lock.acquire();
        let Some(bin) = resolve_binary() else { return };
        let mut cmd = std::process::Command::new(&bin);
        cmd.args(["data-status", "--json"]);
        cmd.env("AGENT_VITALS_HOME", overview::data_home());
        let _ = cmd.output();
    });
}

/// 打开工作台主窗口：显示 + 聚焦。**不做 toggle**——工作台是常驻主窗口，× 只
/// 隐藏不销毁（`on_window_event` 拦截 prevent_close + hide），再开保留当前
/// tab/月/分页状态，不是重建一个空白窗口。
fn show_workbench(app: &AppHandle) {
    let Some(w) = app.get_webview_window("workbench") else { return };
    let _ = w.show();
    let _ = w.set_focus();
}

/// 信息行菜单 id → 工作台 tab 名。纯函数，单测钉住映射——切错 tab 的回归靠它挡。
/// `session:{kind}:{i}` / `host:{kind}` 深链 id 不在这里（#11 的 WorkbenchTarget
/// 分发）；平铺「最近会话」行已删，「recent」id 不再存在。
fn tab_for_menu_id(id: &str) -> Option<&'static str> {
    match id {
        // 首行「今日消耗」→ 用量页（今天那格 + 按小时面板就是它的下钻）；此前这个 id
        // 落进 `_ => None`，点了没有任何反馈（2026-09-17 反馈）。
        "today_tokens" => Some("calendar"),
        "today" | "daily" | "month" | "budget" | "subscription" => Some("overview"),
        "sync" => Some("sources"),
        // 托盘「Skill 体检」→ Skill tab（WORKBENCH_SKILL_HEALTH_TAB_SPEC §4.1）。
        "skill_health" => Some("skills"),
        _ => None,
    }
}

/// 菜单信息行点击 → 跳工作台对应 tab。双通路：持久目标（managed state，窗口不可见时
/// 下次 pull 命中）+ `focus-tab` 事件（窗口已可见时一戳就跳）。**写目标先于 show**——
/// 避免「emit 早于 listen、show 的 focus 事件又没触发」的窗口期把目标丢掉。块作用域
/// 先释放锁再 emit（与 `emit_fold_event` 同款 E0716 规避）。
fn focus_tab(app: &AppHandle, tab: &str) {
    {
        let nav = app.state::<NavTarget>();
        let mut g = nav.0.lock().unwrap_or_else(|e| e.into_inner());
        *g = Some(tab.to_string());
    }
    show_workbench(app);
    let _ = app.emit("focus-tab", tab);
}

/// 系统预算提醒的唯一点击目标。只接受预算页，避免通知 payload 变成任意
/// 工作台导航入口；写目标先于显示，工作台隐藏时也能在下次聚焦时消费。
#[tauri::command]
fn focus_budget_from_notification(app: AppHandle) -> Result<(), String> {
    focus_tab(&app, "budget");
    Ok(())
}

/// 动态菜单 id → 会话深链目标（spec §9.2 #12）。纯函数，单测钉住映射：
/// · `session:{kind}:{i}` → 该宿主第 i 行 recent 的 `SessionDetail`。session_key
///   从 hosts.json 里 `SessionKey::to_json()` 形状的 Value 反序列化——失败即该行
///   key 不完整/形状漂移 → None，不发一个回传不了的目标（L2 行仍渲染，只是
///   点了不动，比跳到 not-found 详情诚实）。
/// · `host:{kind}` → `SessionList{host_kind: Some(kind)}`（v1 点击子菜单本身不产
///   事件，发射点留给「查看全部会话」回归，§7.1）。
/// · 禁用 id（`session:unavailable:{kind}` / `session:none:{kind}` /
///   `session:stale:{kind}`）→ None——禁用项点不到，事件即便到达也不该有目标。
fn workbench_target_for_menu_id(id: &str, hosts: &[HostRow]) -> Option<WorkbenchTarget> {
    let mut parts = id.splitn(3, ':');
    let head = parts.next()?;
    let kind = parts.next()?;
    match (head, kind) {
        ("host", k) => Some(WorkbenchTarget::SessionList {
            host_kind: Some(k.to_string()),
        }),
        ("session", k) if k == "unavailable" || k == "none" || k == "stale" => None,
        ("session", k) => {
            let i: usize = parts.next()?.parse().ok()?;
            let row = hosts.iter().find(|r| r.host_kind == k)?;
            let session_key = serde_json::from_value(row.recent.get(i)?.session_key.clone()).ok()?;
            Some(WorkbenchTarget::SessionDetail { session_key })
        }
        _ => None,
    }
}

/// 会话深链的核心动作（spec §7.2 的 focus_session 语义）：**覆盖式**存入
/// FocusTarget（写先于 show——窗口不可见时 emit 是空操作，目标必须已落持久
/// slot）→ show_workbench → `focus-target` 事件（窗口已可见时一戳就跳）。事件
/// 只是通知，pull 是最终仲裁。命令与菜单分发共用这一条路径，语义只写一处。
fn focus_session_target(app: &AppHandle, target: WorkbenchTarget) {
    app.state::<FocusTarget>().set(target);
    show_workbench(app);
    let _ = app.emit("focus-target", ());
}

/// 工作台前端请求当前 overview —— 与托盘菜单同一份数据源，前端只渲染。
///
/// 2026-09-01 之前这里还有一份面板（`ui/index.html`/`main.js`，弹出层 popover
/// 窗口，label "overview"）共用同一个命令；面板已整体删除——左右键统一弹菜单
/// 之后它连入口都没有了，面板展示的字段本来就是工作台"总览"tab 的严格子集，
/// 没有理由为一份没有入口、内容更少的旧界面继续维护 `toggle_window`/
/// `hide_window`/一份独立的 HTML+JS+CSS。命令名留作 `read_overview` 不改，
/// 只是现在唯一的调用方是工作台。
#[tauri::command(async)]
fn read_overview() -> Value {
    serde_json::to_value(overview::read_overview()).unwrap_or(Value::Null)
}

/// 工作台总览的权威质量状态。金额仍由 summary DTO 提供；这里仅转发
/// `data_status` 的只读健康、价格快照和 token 归因状态，避免前端自行推断。
#[tauri::command(async)]
fn data_status() -> Value {
    let data_home = overview::data_home();
    let path = agent_vitals_data::authority::default_authority_path(&data_home);
    let db = match agent_vitals_data::authority::AuthorityDb::open_readonly(&path) {
        Ok(db) => db,
        Err(error) => {
            use agent_vitals_data::authority::AuthorityError;
            let (code, action) = match error {
                AuthorityError::MissingFile => ("database_missing", "retry_sync"),
                AuthorityError::NewerSchema { .. } => ("schema_too_new", "upgrade_app"),
                AuthorityError::OlderSchema { .. } => ("schema_migration_required", "upgrade_app"),
                AuthorityError::Corrupt => ("database_unreadable", "restore_backup"),
                AuthorityError::Io(_) | AuthorityError::Sqlite(_) => ("database_unreadable", "restore_backup"),
            };
            return serde_json::json!({
                "status": "unavailable",
                "code": code,
                "reason": error.to_string(),
                "recovery_action": { "kind": action, "label": if action == "restore_backup" { "选择备份恢复" } else { "查看恢复选项" } }
            });
        }
    };
    let enabled = agent_vitals_runtime::sql_authority::is_enabled(&data_home);
    serde_json::json!({
        "status": "ok",
        // 热路径用 quick_check 深度：工作台每次切 tab 都会走到这里，全量
        // integrity_check 在大库上要 0.5–1.2s，是刷新的唯一长杆。CLI/MCP 的
        // doctor 面仍是全量检查（见 runtime::mcp::data_status_report_quick 注释）。
        "data": agent_vitals_runtime::mcp::data_status_report_quick(db.conn(), true, enabled)
    })
}

/// 从用户明确选择的备份恢复权威库。恢复顺序是：先验证备份、保留当前文件、写入同目录
/// 临时文件、再次验证临时文件，最后原子替换；任何中间步骤失败都不触碰当前库。
/// 不接受前端传入路径，避免把任意路径写入权限伪装成恢复动作。
fn restore_authority_backup_file(
    backup: &Path,
    target: &Path,
    stamp: i64,
) -> Result<Option<PathBuf>, String> {
    agent_vitals_data::authority::AuthorityDb::open_readonly(backup)
        .map_err(|error| format!("selected backup is not readable: {error}"))?;
    let parent = target.parent().ok_or_else(|| "authority path has no parent".to_string())?;
    std::fs::create_dir_all(parent)
        .map_err(|error| format!("create authority directory failed: {error}"))?;
    let preserved = parent.join(format!("authority.sqlite.pre-restore-{stamp}.bak"));
    if target.exists() {
        std::fs::copy(target, &preserved)
            .map_err(|error| format!("preserve current authority database failed: {error}"))?;
    }
    let temporary = parent.join(format!("authority.sqlite.restore-{stamp}-{}.tmp", std::process::id()));
    if temporary.exists() {
        return Err("restore temporary file already exists; please retry".into());
    }
    let result = (|| {
        std::fs::copy(backup, &temporary)
            .map_err(|error| format!("stage selected backup failed: {error}"))?;
        std::fs::File::open(&temporary)
            .and_then(|file| file.sync_all())
            .map_err(|error| format!("flush staged backup failed: {error}"))?;
        agent_vitals_data::authority::AuthorityDb::open_readonly(&temporary)
            .map_err(|error| format!("staged backup validation failed: {error}"))?;
        std::fs::rename(&temporary, target)
            .map_err(|error| format!("replace authority database failed: {error}"))?;
        Ok::<(), String>(())
    })();
    if result.is_err() {
        let _ = std::fs::remove_file(&temporary);
    }
    result.map(|()| target.exists().then_some(preserved))
}

#[tauri::command]
fn restore_authority_backup() -> Result<Value, String> {
    let Some(backup) = rfd::FileDialog::new()
        .add_filter("SQLite database", &["sqlite", "db", "sqlite3"])
        .pick_file() else {
        return Ok(serde_json::json!({ "status": "cancelled" }));
    };
    let data_home = overview::data_home();
    let target = agent_vitals_data::authority::default_authority_path(&data_home);
    let stamp = agent_vitals_runtime::sql_sync::now_ms();
    let preserved = restore_authority_backup_file(&backup, &target, stamp)?;
    Ok(serde_json::json!({
        "status": "restored",
        "preserved_current": preserved.is_some(),
        "backup_path": backup.to_string_lossy(),
    }))
}

/// 升级时从旧公共资产发现的套餐声明。它们是用户核对入口，不是账单：前端
/// 只能拿到展示所需的服务商、金额和起始月份，不能拿到原始价格快照或路径。
#[tauri::command(async)]
fn billing_import_candidates() -> Value {
    let data_home = overview::data_home();
    let path = agent_vitals_data::authority::default_authority_path(&data_home);
    let Ok(db) = agent_vitals_data::authority::AuthorityDb::open_readonly(&path) else {
        return serde_json::json!({ "status": "unavailable", "candidates": [] });
    };
    let window = agent_vitals_data::authority_query::beijing_month_bounds_ms(
        &overview::current_month_beijing(),
    );
    match db.billing_import_candidates() {
        Ok(rows) => serde_json::json!({
            "status": "ok",
            "candidates": rows.into_iter().map(|(candidate_id, host, provider_id, currency, amount_minor, billing_period_start, status)| {
                let impact = window.and_then(|(window_start_ms, window_end_ms)| {
                    db.billing_declaration_impact_preview_for(
                        &host, &provider_id, &billing_period_start, None, &[],
                        Some((window_start_ms, window_end_ms)),
                    ).ok()
                });
                serde_json::json!({
                    "candidate_id": candidate_id,
                    "host": host,
                    "provider_id": provider_id,
                    "currency": currency,
                    "amount_minor": amount_minor,
                    "billing_period_start": billing_period_start,
                    "status": status,
                    "impact": impact.map(|preview| serde_json::json!({
                        "status": "ok", "fact_count": preview.fact_count,
                        "session_count": preview.session_count,
                        "total_tokens": preview.total_tokens,
                    })).unwrap_or_else(|| serde_json::json!({"status": "unavailable"})),
                })
            }).collect::<Vec<_>>()
        }),
        Err(error) => serde_json::json!({ "status": "unavailable", "reason": error.to_string(), "candidates": [] }),
    }
}

/// 「确认计费方式」面板的待确认组（REQ-023）：宿主 × provider × 模型 × 路由证据 ×
/// 计价依据，带分币估算金额、按金额降序。数据来自
/// `runtime::billing_preview::confirmation_groups`（组 SQL 与待处理投影同一份，
/// 金额与 MCP `cost_breakdown` 同一条计价路径）。此前面板只从旧资产迁移候选出发，
/// 没有旧资产的用户永远看不到待确认组（计费主链规格 G5）。
#[tauri::command(async)]
fn billing_confirmation_groups(month: String) -> Value {
    let path = agent_vitals_data::authority::default_authority_path(&overview::data_home());
    let Ok(db) = agent_vitals_data::authority::AuthorityDb::open_readonly(&path) else {
        return serde_json::json!({ "status": "unavailable", "month": month, "groups": [] });
    };
    agent_vitals_runtime::billing_preview::confirmation_groups(&db, &month)
}

/// 候选只有「不是我的」与「重新打开」两个直接决定。「接受」不再是独立动作：
/// 它曾经只把候选翻成 accepted 而不写声明、不重算，用量继续按量估算，与提示
/// 文案「确认后就能分清哪些在套餐内」相反（计费主链规格 G1）。接受现在只能
/// 由 `save_billing_declaration_revision` 在同一事务内完成。
fn candidate_decision_status(decision: &str) -> Result<&'static str, String> {
    match decision {
        "dismiss" => Ok("dismissed"),
        "reopen" => Ok("pending"),
        "accept" => Err("accepting a candidate requires saving a billing declaration".to_string()),
        _ => Err("invalid billing candidate decision".to_string()),
    }
}

#[tauri::command]
fn resolve_billing_import_candidate(candidate_id: String, decision: String) -> Result<Value, String> {
    let status = candidate_decision_status(&decision)?;
    let data_home = overview::data_home();
    let path = agent_vitals_data::authority::default_authority_path(&data_home);
    let db = agent_vitals_data::authority::AuthorityDb::open(&path, agent_vitals_runtime::sql_sync::now_ms())
        .map_err(|error| error.to_string())?;
    let changed = db.with_immediate_txn(|_| {
        let now_ms = agent_vitals_runtime::sql_sync::now_ms();
        if status == "pending" {
            db.billing_import_candidate_reopen(&candidate_id, now_ms)
        } else {
            db.billing_import_candidate_resolve(&candidate_id, status, now_ms)
        }
    }).map_err(|error| error.to_string())?;
    Ok(serde_json::json!({ "status": status, "changed": changed }))
}

#[derive(Deserialize)]
struct BillingScopeInput {
    scope_kind: String,
    scope_value: String,
}

#[derive(Deserialize)]
struct HostBillInput {
    bill_id: String,
    host: String,
    provider_id: String,
    billing_period: String,
    billing_basis: String,
    amount_minor: i64,
    currency: String,
    evidence_ref: String,
}

/// 桌面端预算表单的窄 DTO。金额仍是 CNY 最小单位，避免 UI 浮点数进入权威库。
#[derive(Deserialize)]
struct BudgetConfigInput {
    monthly_cny_minor: i64,
    daily_cny_minor: i64,
    warning_ratio_bp: i64,
}

#[derive(Deserialize)]
struct BudgetProfileInput {
    profile_id: String,
    currency: String,
    monthly_minor: i64,
    daily_minor: Option<i64>,
    warning_ratio_bp: i64,
}

#[derive(Deserialize)]
struct PriceRouteInput {
    /// 型号**前缀**（与价目表 `billing_modes` 同一套匹配语义：全等或前缀）。
    model_prefix: String,
    provider_id: String,
    /// `metered` 或 `subscription`。
    mode: String,
}

#[derive(Deserialize)]
struct PriceCardInput {
    provider_id: String,
    model_id: String,
    /// 每档是 `{off_peak, peak}`；三个维度都必须给（半张卡拒绝）。
    input_uncached: Value,
    input_cached: Value,
    output: Value,
    /// 第四维可选（2026-09-17：胜算云把所有非命中输入都记作"写入"，没有这一档的中转
    /// 卡会把缓存写入静默算成 0）。不给 → 卡里没有这个键，沿用 catalog 平费率；给了
    /// 必须两档齐全，与三个必填维同一条 sanitize 纪律。
    #[serde(default)]
    cache_write: Option<Value>,
}

#[derive(Deserialize)]
struct RetentionConfigInput {
    months: u32,
}

#[derive(Deserialize)]
struct CustomSourceRootInput {
    host: String,
    root: String,
}

#[derive(Deserialize)]
struct SourceHostControlInput {
    host: String,
    excluded: bool,
}

#[tauri::command(async)]
fn custom_source_roots() -> Value {
    let data_home = overview::data_home();
    match agent_vitals_runtime::custom_sources::custom_source_roots(&data_home) {
        Ok(sources) => serde_json::json!({ "status": "ok", "sources": sources }),
        Err(error) => serde_json::json!({ "status": "unavailable", "reason": error }),
    }
}

/// 用户发起的原生目录选择。选择的是宿主根目录（包含 `.claude` / `.codex`
/// 或 `sessions` 的目录），取消不是错误；不会在此处读取或写入会话内容。
#[tauri::command]
fn pick_custom_source_root() -> Option<String> {
    rfd::FileDialog::new().pick_folder()
        .map(|path| path.to_string_lossy().into_owned())
}

#[tauri::command]
fn add_custom_source_root(input: CustomSourceRootInput) -> Result<Value, String> {
    let data_home = overview::data_home();
    let changed = agent_vitals_runtime::custom_sources::add_custom_source_root(
        &data_home, &input.host, Path::new(&input.root),
    )?;
    Ok(serde_json::json!({ "status": "saved", "changed": changed }))
}

#[tauri::command]
fn remove_custom_source_root(input: CustomSourceRootInput) -> Result<Value, String> {
    let data_home = overview::data_home();
    let changed = agent_vitals_runtime::custom_sources::remove_custom_source_root(
        &data_home, &input.host, Path::new(&input.root),
    )?;
    Ok(serde_json::json!({ "status": "removed", "changed": changed }))
}

#[tauri::command]
fn source_host_controls() -> Value {
    let data_home = overview::data_home();
    match agent_vitals_runtime::source_controls::excluded_hosts(&data_home) {
        Ok(excluded_hosts) => serde_json::json!({ "status": "ok", "excluded_hosts": excluded_hosts }),
        Err(error) => serde_json::json!({ "status": "unavailable", "reason": error }),
    }
}

/// 仅工作台本机显示的标准读取目录；不混入 MCP/导出 DTO，避免路径离开桌面。
#[tauri::command(async)]
fn source_read_locations() -> Value {
    let home = PathBuf::from(
        std::env::var("HOME").or_else(|_| std::env::var("USERPROFILE")).unwrap_or_default(),
    );
    let dsh = agent_vitals_runtime::home::dsh_home().map(|path| path.join("sessions"));
    serde_json::json!({
        "status": "ok",
        "locations": {
            "claude-code": home.join(".claude").join("projects").to_string_lossy(),
            "codex": agent_vitals_runtime::summary::codex_home().join("sessions").to_string_lossy(),
            "dsh": dsh.map(|path| path.to_string_lossy().into_owned()),
        }
    })
}

#[tauri::command]
fn set_source_host_excluded(input: SourceHostControlInput) -> Result<Value, String> {
    let changed = agent_vitals_runtime::source_controls::set_host_excluded(
        &overview::data_home(), &input.host, input.excluded,
    )?;
    Ok(serde_json::json!({ "status": "saved", "changed": changed, "excluded": input.excluded }))
}

#[tauri::command]
fn delete_imported_source_data(host: String) -> Result<Value, String> {
    if !agent_vitals_runtime::ingest_service::FACT_HOSTS.contains(&host.as_str()) {
        return Err("source host is not supported".to_string());
    }
    let data_home = overview::data_home();
    // 先禁止未来读取；若数据库清理失败，宁可维持排除也不能让下一次同步
    // 立即把用户刚要求移除的数据重新导入。
    agent_vitals_runtime::source_controls::set_host_excluded(&data_home, &host, true)?;
    let db = agent_vitals_data::authority::AuthorityDb::open(
        &agent_vitals_data::authority::default_authority_path(&data_home),
        agent_vitals_runtime::sql_sync::now_ms(),
    ).map_err(|error| format!("authority database unavailable: {error}"))?;
    let deleted = db.delete_imported_host_data(&host, agent_vitals_runtime::sql_sync::now_ms())
        .map_err(|error| format!("delete imported data failed: {error}"))?;
    Ok(serde_json::json!({
        "status": "deleted", "host": host, "facts": deleted.facts,
        "sessions": deleted.sessions, "source_files": deleted.source_files,
    }))
}

#[tauri::command(async)]
fn retention_config() -> Value {
    let data_home = overview::data_home();
    match agent_vitals_runtime::retention::retention_months(&data_home) {
        Ok(months) => serde_json::json!({
            "status": "ok", "months": months,
            "default_months": agent_vitals_runtime::retention::DEFAULT_RETENTION_MONTHS,
            "minimum_months": agent_vitals_runtime::retention::MIN_RETENTION_MONTHS,
            "maximum_months": agent_vitals_runtime::retention::MAX_RETENTION_MONTHS,
        }),
        Err(error) => serde_json::json!({ "status": "unavailable", "reason": error }),
    }
}

#[tauri::command]
fn save_retention_config(input: RetentionConfigInput) -> Result<Value, String> {
    let data_home = overview::data_home();
    agent_vitals_runtime::retention::save_retention_months(&data_home, input.months)?;
    Ok(serde_json::json!({ "status": "saved", "months": input.months }))
}

#[tauri::command(async)]
fn statistics_timezone_config() -> Value {
    let data_home = overview::data_home();
    match agent_vitals_runtime::statistics_timezone::timezone_name(&data_home) {
        Ok(timezone) => serde_json::json!({
            "status": "ok",
            "timezone": timezone,
            "system_timezone": agent_vitals_runtime::clock::system_timezone_name(),
        }),
        Err(error) => serde_json::json!({ "status": "unavailable", "reason": error }),
    }
}

#[tauri::command]
fn save_statistics_timezone_config(app: AppHandle, timezone: String) -> Result<Value, String> {
    let data_home = overview::data_home();
    let saved = agent_vitals_runtime::statistics_timezone::save_timezone(&data_home, &timezone)?;
    agent_vitals_runtime::statistics_timezone::apply(&data_home)?;
    // The Workbench refreshes its active tab after the IPC returns, but the
    // tray is a separate consumer and its host rows come from hosts.json. A
    // plain menu rebuild would therefore retain the old day's navigation
    // snapshot. Re-run the bounded navigation refresh off the command thread,
    // then rebuild the tray from the newly written snapshot.
    let background_app = app.clone();
    std::thread::spawn(move || {
        refresh_hosts();
        refresh(&background_app);
    });
    refresh(&app);
    Ok(serde_json::json!({ "status": "saved", "timezone": saved }))
}

const PUBLIC_PRICING_CATALOG_URL: &str =
    "https://raw.githubusercontent.com/MixLabPro/agent-vitals/main/assets/pricing.json";
const PRICING_UPDATE_STATUS_FILE: &str = "pricing-catalog-update.json";
const PRICING_UPDATE_POLICY_FILE: &str = "pricing-catalog-policy.json";

#[derive(Debug, Serialize, Deserialize, Default)]
struct PricingCatalogUpdateStatus {
    state: String,
    source_url: String,
    last_checked_at_ms: Option<i64>,
    last_success_at_ms: Option<i64>,
    source_version: Option<String>,
    model_count: Option<usize>,
    failure_reason: Option<String>,
    #[serde(default)]
    failure_count: u32,
    #[serde(default)]
    next_check_at_ms: Option<i64>,
}

#[derive(Debug, Serialize, Deserialize, Default)]
struct PricingCatalogPolicy {
    network_enabled: bool,
}

fn pricing_catalog_status_path(data_home: &Path) -> PathBuf {
    data_home.join(PRICING_UPDATE_STATUS_FILE)
}

fn pricing_catalog_policy_path(data_home: &Path) -> PathBuf {
    data_home.join(PRICING_UPDATE_POLICY_FILE)
}

fn read_pricing_catalog_policy(data_home: &Path) -> PricingCatalogPolicy {
    std::fs::read(pricing_catalog_policy_path(data_home))
        .ok()
        .and_then(|bytes| serde_json::from_slice(&bytes).ok())
        .unwrap_or_default()
}

fn write_pricing_catalog_policy(
    data_home: &Path,
    policy: &PricingCatalogPolicy,
) -> Result<(), String> {
    std::fs::create_dir_all(data_home).map_err(|e| format!("create data home failed: {e}"))?;
    let bytes = serde_json::to_vec_pretty(policy)
        .map_err(|e| format!("serialize pricing policy failed: {e}"))?;
    let tmp = data_home.join("pricing-catalog-policy.json.tmp");
    std::fs::write(&tmp, bytes).map_err(|e| format!("write pricing policy failed: {e}"))?;
    std::fs::rename(&tmp, pricing_catalog_policy_path(data_home))
        .map_err(|e| format!("commit pricing policy failed: {e}"))
}

fn read_pricing_catalog_status(data_home: &Path) -> PricingCatalogUpdateStatus {
    let path = pricing_catalog_status_path(data_home);
    std::fs::read(&path)
        .ok()
        .and_then(|bytes| serde_json::from_slice(&bytes).ok())
        .unwrap_or_else(|| PricingCatalogUpdateStatus {
            state: "never_checked".into(),
            source_url: PUBLIC_PRICING_CATALOG_URL.into(),
            ..Default::default()
        })
}

fn write_pricing_catalog_status(
    data_home: &Path,
    status: &PricingCatalogUpdateStatus,
) -> Result<(), String> {
    std::fs::create_dir_all(data_home).map_err(|e| format!("create data home failed: {e}"))?;
    let bytes = serde_json::to_vec_pretty(status)
        .map_err(|e| format!("serialize pricing status failed: {e}"))?;
    let tmp = data_home.join("pricing-catalog-update.json.tmp");
    std::fs::write(&tmp, bytes).map_err(|e| format!("write pricing status failed: {e}"))?;
    std::fs::rename(&tmp, pricing_catalog_status_path(data_home))
        .map_err(|e| format!("commit pricing status failed: {e}"))
}

fn fail_pricing_catalog_update(
    data_home: &Path,
    status: &mut PricingCatalogUpdateStatus,
    state: &str,
    reason: String,
) -> Result<Value, String> {
    status.state = state.into();
    status.failure_reason = Some(reason.clone());
    status.failure_count = status.failure_count.saturating_add(1);
    let backoff_hours = 1_i64 << status.failure_count.min(7);
    status.next_check_at_ms = Some(
        status
            .last_checked_at_ms
            .unwrap_or_else(agent_vitals_runtime::sql_sync::now_ms)
            .saturating_add(backoff_hours.saturating_mul(60 * 60 * 1000)),
    );
    write_pricing_catalog_status(data_home, status)?;
    Err(reason)
}

#[tauri::command(async)]
fn public_pricing_catalog_status() -> Value {
    let data_home = overview::data_home();
    let mut status = serde_json::to_value(read_pricing_catalog_status(&data_home))
        .unwrap_or_else(|_| serde_json::json!({ "state": "unavailable" }))
        ;
    status["network_enabled"] = Value::Bool(read_pricing_catalog_policy(&data_home).network_enabled);
    status
}

#[tauri::command]
fn save_public_pricing_catalog_policy(network_enabled: bool) -> Result<Value, String> {
    let data_home = overview::data_home();
    write_pricing_catalog_policy(&data_home, &PricingCatalogPolicy { network_enabled })?;
    Ok(serde_json::json!({ "status": "saved", "network_enabled": network_enabled }))
}

/// 手动检查维护者发布的公共价格目录。请求只访问固定 HTTPS 公共地址，不携带
/// AGENT_VITALS_HOME、日志内容、会话、账户或任何本地数据；下载失败/校验失败
/// 只写检查状态，绝不删除或替换当前有效价卡。
#[tauri::command]
async fn update_public_pricing_catalog_internal(enforce_schedule: bool) -> Result<Value, String> {
    let data_home = overview::data_home();
    let policy = read_pricing_catalog_policy(&data_home);
    if !policy.network_enabled {
        return Err("公共价格联网检查未开启；请先明确允许访问公共价格服务".into());
    }
    let now = agent_vitals_runtime::sql_sync::now_ms();
    let mut status = read_pricing_catalog_status(&data_home);
    if enforce_schedule
        && (status.next_check_at_ms.is_some_and(|next| now < next)
            || status
                .last_checked_at_ms
                .is_some_and(|last| now.saturating_sub(last) < 24 * 60 * 60 * 1000))
    {
        return Ok(serde_json::json!({ "status": "skipped", "reason": "daily_check_window" }));
    }
    status.source_url = PUBLIC_PRICING_CATALOG_URL.into();
    status.last_checked_at_ms = Some(now);
    status.failure_reason = None;

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .user_agent("agent-vitals-public-pricing-check/1")
        .build()
        .map_err(|e| format!("create public pricing client failed: {e}"));
    let client = match client {
        Ok(client) => client,
        Err(reason) => return fail_pricing_catalog_update(&data_home, &mut status, "failed", reason),
    };
    let response = client
        .get(PUBLIC_PRICING_CATALOG_URL)
        .send()
        .await;
    let response = match response {
        Ok(response) => response,
        Err(error) => {
            return fail_pricing_catalog_update(
                &data_home,
                &mut status,
                "failed",
                format!("public pricing request failed: {error}"),
            )
        }
    };
    if !response.status().is_success() {
        return fail_pricing_catalog_update(
            &data_home,
            &mut status,
            "failed",
            format!("public pricing returned HTTP {}", response.status()),
        );
    }
    if response.content_length().is_some_and(|length| length > 2 * 1024 * 1024) {
        return fail_pricing_catalog_update(
            &data_home,
            &mut status,
            "failed",
            "public pricing response exceeds 2 MiB limit".into(),
        );
    }
    let bytes = match response.bytes().await {
        Ok(bytes) => bytes,
        Err(error) => {
            return fail_pricing_catalog_update(
                &data_home,
                &mut status,
                "failed",
                format!("read public pricing response failed: {error}"),
            )
        }
    };
    if bytes.len() > 2 * 1024 * 1024 {
        return fail_pricing_catalog_update(
            &data_home,
            &mut status,
            "failed",
            "public pricing response exceeds 2 MiB limit".into(),
        );
    }
    let validated = match agent_vitals_runtime::pricing_catalog::validate(&bytes) {
        Ok(validated) => validated,
        Err(reason) => return fail_pricing_catalog_update(&data_home, &mut status, "rejected", reason),
    };
    let authority_path = agent_vitals_data::authority::default_authority_path(&data_home);
    let db = agent_vitals_data::authority::AuthorityDb::open(&authority_path, now)
        .map_err(|e| format!("open authority database failed: {e}"))?;
    db.pricing_catalog_snapshot_put(
        &validated.version,
        &validated.version,
        "public-maintainer-https",
        &validated.canonical_json,
        now,
        None,
    )
    .map_err(|e| format!("save public catalog and pricing atomically failed: {e}"))?;
    status.state = "ok".into();
    status.last_success_at_ms = Some(now);
    status.source_version = Some(validated.version.clone());
    status.model_count = Some(validated.model_count);
    status.failure_count = 0;
    status.next_check_at_ms = Some(now.saturating_add(24 * 60 * 60 * 1000));
    write_pricing_catalog_status(&data_home, &status)?;
    Ok(serde_json::json!({
        "status": "updated",
        "source_url": PUBLIC_PRICING_CATALOG_URL,
        "source_version": validated.version,
        "model_count": validated.model_count,
        "last_success_at_ms": now,
    }))
}

#[tauri::command]
async fn update_public_pricing_catalog() -> Result<Value, String> {
    update_public_pricing_catalog_internal(false).await
}

fn start_public_pricing_catalog_tick() {
    tauri::async_runtime::spawn(async {
        loop {
            tokio::time::sleep(std::time::Duration::from_secs(5 * 60)).await;
            let data_home = overview::data_home();
            if !read_pricing_catalog_policy(&data_home).network_enabled {
                continue;
            }
            let _ = update_public_pricing_catalog_internal(true).await;
        }
    });
}

/// 「发现」tab 新鲜度条的数据面（WORKBENCH_FINDINGS_TAB_SPEC §4.8）。
/// 只读一个数：上次成功同步时刻 + stale 宿主名单（runtime 与 MCP envelope
/// 同源），DB 打不开就如实报 unavailable，不编一个空名单。
#[tauri::command]
fn findings_freshness() -> Value {
    let data_home = overview::data_home();
    let path = agent_vitals_data::authority::default_authority_path(&data_home);
    match agent_vitals_data::authority::AuthorityDb::open_readonly(&path) {
        Ok(db) => serde_json::json!({
            "status": "ok",
            "freshness": agent_vitals_runtime::mcp::data_freshness_report(db.conn()),
        }),
        Err(_) => serde_json::json!({ "status": "unavailable" }),
    }
}

/// 生成用户主动选择保存的脱敏诊断包。只组合现有的状态 DTO；不读取会话正文、
/// 原始日志、绝对路径或账户标识，也不执行上传。取消保存对用户来说是 no-op。
#[tauri::command]
fn export_diagnostic_package() -> Result<Value, String> {
    let Some(path) = rfd::FileDialog::new()
        .set_file_name("agent-vitals-diagnostics.json")
        .save_file() else {
        return Ok(serde_json::json!({ "status": "cancelled" }));
    };
    let status = data_status();
    let package = serde_json::json!({
        "diagnostic_contract": "agent-vitals-diagnostic/v1",
        "versions": {
            "app": env!("CARGO_PKG_VERSION"),
            "cli": resolved_cli_version(),
            "engine": agent_vitals_domain::r2a::ENGINE_VERSION,
            "architecture": std::env::consts::ARCH,
            "authority_schema": agent_vitals_data::authority::SCHEMA_VERSION,
            "query_envelope": agent_vitals_runtime::mcp::ENVELOPE_SCHEMA_VERSION,
            "statistics_timezone": agent_vitals_runtime::clock::statistics_timezone_name(),
            "pricing": status.get("data")
                .and_then(|data| data.get("pricing"))
                .and_then(|pricing| pricing.get("version"))
                .cloned()
                .unwrap_or(Value::Null),
        },
        "privacy": {
            "contains_session_content": false,
            "contains_absolute_paths": false,
            "contains_account_identifiers": false,
            "upload_performed": false,
        },
        "data_status": status,
        "source_status": data_source_status(),
        "sync_pause": sync_pause_state(),
        "retention": retention_config(),
        "budget": budget_config(),
        "budget_profiles": budget_profiles_status(overview::current_month_beijing()),
    });
    let bytes = serde_json::to_vec_pretty(&package)
        .map_err(|error| format!("diagnostic serialization failed: {error}"))?;
    std::fs::write(&path, bytes)
        .map_err(|error| format!("diagnostic write failed: {error}"))?;
    Ok(serde_json::json!({
        "status": "saved",
        "path": path.to_string_lossy(),
        "upload_performed": false,
    }))
}

#[tauri::command(async)]
fn about_diagnostics() -> Value {
    let data_home = overview::data_home();
    let authority_path = agent_vitals_data::authority::default_authority_path(&data_home);
    let pricing = agent_vitals_data::authority::AuthorityDb::open_readonly(&authority_path)
        .ok()
        .and_then(|db| db.pricing_snapshot_latest().ok().flatten())
        .map(|(version, captured_at_ms)| serde_json::json!({
            "version": version,
            "captured_at_ms": captured_at_ms,
        }));
    serde_json::json!({
        "status": "ok",
        "app_version": env!("CARGO_PKG_VERSION"),
        "cli_version": resolved_cli_version(),
        "engine_version": agent_vitals_domain::r2a::ENGINE_VERSION,
        "architecture": std::env::consts::ARCH,
        "authority_schema": agent_vitals_data::authority::SCHEMA_VERSION,
        "statistics_timezone": agent_vitals_runtime::clock::statistics_timezone_name(),
        "pricing": pricing,
        "pricing_update": read_pricing_catalog_status(&data_home),
        // 只要 last-sync.json 这一份状态，不必为它把整份 overview 重算一遍
        // （read_overview 会跑 SQL bundle + 预算 profile 聚合，≈130–360ms）。
        "sync": overview::load_sync_status(&data_home),
    })
}

const TRUSTED_RELEASES_URL: &str = "https://github.com/MixLabPro/agent-vitals/releases";
const LATEST_RELEASE_API: &str = "https://api.github.com/repos/MixLabPro/agent-vitals/releases/latest";

fn parse_latest_release_tag(payload: &Value) -> Result<String, String> {
    let tag = payload
        .get("tag_name")
        .and_then(Value::as_str)
        .ok_or_else(|| "trusted release response has no tag_name".to_string())?;
    if !tag.starts_with("app-v") {
        return Err(format!("trusted release tag is not an app release: {tag}"));
    }
    Ok(tag.to_string())
}

#[tauri::command]
async fn check_for_updates() -> Result<Value, String> {
    let client = reqwest::Client::builder()
        .user_agent(format!("agent-vitals/{}", env!("CARGO_PKG_VERSION")))
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|error| format!("build update client failed: {error}"))?;
    let response = client
        .get(LATEST_RELEASE_API)
        .send()
        .await
        .map_err(|error| format!("check updates failed: {error}"))?;
    let status = response.status();
    if status == reqwest::StatusCode::NOT_FOUND {
        return Ok(serde_json::json!({
            "status": "no_release",
            "current_version": env!("CARGO_PKG_VERSION"),
            "url": TRUSTED_RELEASES_URL,
            "automatic_install": false,
        }));
    }
    if !status.is_success() {
        return Err(format!("check updates returned HTTP {status}"));
    }
    let payload: Value = response
        .json()
        .await
        .map_err(|error| format!("parse update response failed: {error}"))?;
    let tag = parse_latest_release_tag(&payload)?;
    Ok(serde_json::json!({
        "status": "ok",
        "current_version": env!("CARGO_PKG_VERSION"),
        "latest_tag": tag,
        "url": TRUSTED_RELEASES_URL,
        "automatic_install": false,
    }))
}

#[tauri::command]
fn open_trusted_releases_page() -> Result<Value, String> {
    #[cfg(target_os = "macos")]
    let status = std::process::Command::new("open")
        .arg(TRUSTED_RELEASES_URL)
        .status()
        .map_err(|e| format!("open trusted releases page failed: {e}"))?;
    #[cfg(target_os = "linux")]
    let status = std::process::Command::new("xdg-open")
        .arg(TRUSTED_RELEASES_URL)
        .status()
        .map_err(|e| format!("open trusted releases page failed: {e}"))?;
    #[cfg(target_os = "windows")]
    let status = std::process::Command::new("rundll32")
        .args(["url.dll,FileProtocolHandler", TRUSTED_RELEASES_URL])
        .status()
        .map_err(|e| format!("open trusted releases page failed: {e}"))?;
    if !status.success() {
        return Err(format!("open trusted releases page exited with {status}"));
    }
    Ok(serde_json::json!({
        "status": "opened",
        "url": TRUSTED_RELEASES_URL,
        "automatic_install": false,
    }))
}

#[tauri::command(async)]
fn budget_config() -> Value {
    let data_home = overview::data_home();
    let path = agent_vitals_data::authority::default_authority_path(&data_home);
    let Ok(db) = agent_vitals_data::authority::AuthorityDb::open_readonly(&path) else {
        return serde_json::json!({ "status": "unavailable" });
    };
    match db.budget_config_get() {
        Ok(Some(config)) => serde_json::json!({
            "status": "ok",
            "monthly_cny_minor": config.monthly_cny_minor,
            "daily_cny_minor": config.daily_cny_minor,
            "warning_ratio_bp": config.warning_ratio_bp,
            "updated_at_ms": config.updated_at_ms,
            "origin": agent_vitals_runtime::budget::budget_config_origin(&data_home),
        }),
        Ok(None) => serde_json::json!({ "status": "missing" }),
        Err(error) => serde_json::json!({ "status": "unavailable", "reason": error.to_string() }),
    }
}

#[tauri::command(async)]
fn budget_profiles_status(month: String) -> Value {
    agent_vitals_runtime::budget::budget_profiles_status_sql_at(
        &overview::data_home(), &month,
    ).unwrap_or_else(|| serde_json::json!({
        "status": "unavailable", "reason": "budget profile status unavailable",
    }))
}

#[tauri::command]
fn save_budget_profile(app: AppHandle, input: BudgetProfileInput) -> Result<Value, String> {
    let data_home = overview::data_home();
    let path = agent_vitals_data::authority::default_authority_path(&data_home);
    let now_ms = agent_vitals_runtime::sql_sync::now_ms();
    let db = agent_vitals_data::authority::AuthorityDb::open(&path, now_ms)
        .map_err(|error| error.to_string())?;
    db.budget_profile_set(
        &input.profile_id, &input.currency, input.monthly_minor,
        input.daily_minor, input.warning_ratio_bp, now_ms,
    ).map_err(|error| error.to_string())?;
    let notification_permission = app.notification().request_permission()
        .map(|state| format!("{state:?}"))
        .unwrap_or_else(|error| format!("unavailable: {error}"));
    Ok(serde_json::json!({
        "status": "saved", "profile_id": input.profile_id, "currency": input.currency,
        "notification_permission": notification_permission,
    }))
}

#[tauri::command]
fn save_budget_config(app: AppHandle, input: BudgetConfigInput) -> Result<Value, String> {
    if input.monthly_cny_minor < 0 || input.daily_cny_minor < 0
        || !(0..=10_000).contains(&input.warning_ratio_bp)
    {
        return Err("budget amounts must be non-negative and warning ratio must be 0..=10000".to_string());
    }
    let data_home = overview::data_home();
    let path = agent_vitals_data::authority::default_authority_path(&data_home);
    let now_ms = agent_vitals_runtime::sql_sync::now_ms();
    let db = agent_vitals_data::authority::AuthorityDb::open(&path, now_ms)
        .map_err(|error| error.to_string())?;
    db.budget_config_set(
        input.monthly_cny_minor, input.daily_cny_minor, input.warning_ratio_bp, now_ms,
    ).map_err(|error| error.to_string())?;
    let origin_recorded = agent_vitals_runtime::budget::mark_budget_config_user_owned(&data_home).is_ok();
    // 预算金额均为 0 表示明确停用兼容预算；停用时不应触发 macOS
    // 通知权限请求。只有用户真正启用至少一个预算周期时才申请权限（REQ-039）。
    let notification_permission = budget_notifications_enabled(
        input.monthly_cny_minor, input.daily_cny_minor,
    ).then(|| app.notification().request_permission()
        .map(|state| format!("{state:?}"))
        .unwrap_or_else(|error| format!("unavailable: {error}")));
    Ok(serde_json::json!({
        "status": "saved", "updated_at_ms": now_ms,
        "origin": "user", "origin_recorded": origin_recorded,
        "notification_permission": notification_permission,
    }))
}

fn budget_notifications_enabled(monthly_minor: i64, daily_minor: i64) -> bool {
    monthly_minor > 0 || daily_minor > 0
}

#[tauri::command]
fn snooze_budget_until(until_ms: i64) -> Result<Value, String> {
    let now_ms = agent_vitals_runtime::sql_sync::now_ms();
    if until_ms <= now_ms {
        return Err("budget snooze must end in the future".to_string());
    }
    let data_home = overview::data_home();
    let path = agent_vitals_data::authority::default_authority_path(&data_home);
    let db = agent_vitals_data::authority::AuthorityDb::open(&path, now_ms)
        .map_err(|error| error.to_string())?;
    db.budget_snooze_set(until_ms, now_ms)
        .map_err(|error| error.to_string())?;
    Ok(serde_json::json!({ "status": "snoozed", "until_ms": until_ms }))
}

fn budget_period_end_ms_for_month(month: &str) -> Option<i64> {
    let mut parts = month.split('-');
    let year: i64 = parts.next()?.parse().ok()?;
    let month_number: u32 = parts.next()?.parse().ok()?;
    if parts.next().is_some() || !(1..=12).contains(&month_number) {
        return None;
    }
    let (next_year, next_month) = if month_number == 12 {
        (year + 1, 1)
    } else {
        (year, month_number + 1)
    };
    // 预算周期按系统统计时区自然月；由 authority query 生成下月一日的
    // 民历午夜，自动处理 DST 的 23/25 小时自然日。
    let next_month_key = format!("{next_year:04}-{next_month:02}");
    agent_vitals_data::authority_query::beijing_month_bounds_ms(&next_month_key)
        .map(|(start_ms, _)| start_ms)
}

#[tauri::command]
fn snooze_budget_current_period() -> Result<Value, String> {
    let now_ms = agent_vitals_runtime::sql_sync::now_ms();
    let month = overview::current_month_beijing();
    let until_ms = budget_period_end_ms_for_month(&month)
        .ok_or_else(|| format!("invalid current budget month: {month}"))?;
    if until_ms <= now_ms {
        return Err("current budget period has already ended".to_string());
    }
    snooze_budget_until(until_ms)
}

/// 补卡表单的「按原厂官方价预填」：目录里（优先 `provider_id` 自己的卡、其次原厂
/// 官方卡）找 `model_id` 的六个价。USD 卡按 `fx_estimate` 折成 CNY（表单只收 CNY）
/// 并如实带出 `converted_from` / `rate`。找不到 → `{found: false}`，不猜。
#[tauri::command]
fn official_price_card(provider_id: String, model_id: String) -> Value {
    let pricing = agent_vitals_runtime::price_overrides::merged_main(&overview::data_home());
    let preferred = agent_vitals_domain::cost::canonical_provider_id(&provider_id, &pricing);
    let Some((from_provider, key, currency, mut six)) = agent_vitals_domain::cost::official_card_body(
        &model_id, &pricing, (!preferred.is_empty()).then_some(preferred.as_str()),
    ) else {
        return serde_json::json!({ "found": false });
    };
    let mut converted_from = Value::Null;
    let mut rate = Value::Null;
    if currency != "CNY" {
        let Some(r) = pricing.pointer("/fx_estimate/USD_CNY").and_then(Value::as_f64).filter(|_| currency == "USD") else {
            return serde_json::json!({ "found": false, "reason": format!("official card is in {currency} and no conversion rate is available") });
        };
        for dim in ["input_uncached", "input_cached", "output"] {
            for tariff in ["off_peak", "peak"] {
                if let Some(v) = six.get(dim).and_then(|d| d.get(tariff)).and_then(Value::as_f64) {
                    six[dim][tariff] = serde_json::json!((v * r * 10_000.0).round() / 10_000.0);
                }
            }
        }
        converted_from = serde_json::json!(currency);
        rate = serde_json::json!(r);
    }
    serde_json::json!({
        "found": true, "provider": from_provider, "card_key": key, "rates": six,
        "converted_from": converted_from, "rate": rate,
    })
}

/// 设置 › MCP 子板块的数据：本机 CLI 路径（与托盘同步用的是同一份解析，
/// `resolve_binary`）、版本、可用工具清单（直接从运行时的 `tool_specs()` 取——
/// 页面上的清单不能是手抄的第二份）。CLI 找不到 → `cli_path: null`，页面照实说
/// 「未找到」而不是给一条不存在的路径。
#[tauri::command]
fn mcp_setup_info() -> Value {
    let cli_path = resolve_binary().map(|p| p.display().to_string());
    let tools = agent_vitals_runtime::mcp::tool_specs().into_iter().map(|t| serde_json::json!({
        "name": t.name,
        "description": t.description,
    })).collect::<Vec<_>>();
    serde_json::json!({
        "cli_path": cli_path,
        "cli_version": resolved_cli_version(),
        "data_home": overview::data_home().display().to_string(),
        "tools": tools,
    })
}

/// 设置 › MCP 的可下载 Agent Skill（`SKILL.md`）：接入命令 + 诚实规则 + 工具清单
/// （运行时 `tool_specs()`，不手抄）+ 常用任务。同一份文本也给「复制全部」用——
/// 用户把它贴给 Agent 或装成 skill，两条路一个来源。
fn mcp_skill_markdown() -> String {
    let bin = resolve_binary().map(|p| p.display().to_string()).unwrap_or_else(|| "/path/to/agent-vitals".to_string());
    let shell_bin = if bin.contains(' ') { format!("\"{bin}\"") } else { bin.clone() };
    let tools = agent_vitals_runtime::mcp::tool_specs().into_iter().map(|t| {
        let first = t.description.split(". ").next().unwrap_or(t.description).trim_end_matches('.');
        format!("- `{}` — {first}.", t.name)
    }).collect::<Vec<_>>().join("\n");
    format!(r#"---
name: agent-vitals-mcp
description: Query the user's local Agent Vitals data over MCP — AI tool token usage, spend (bills vs subscriptions vs estimates), budgets, billing attribution, missing price cards, sessions and data quality. Use when the user asks how much they spent on AI coding tools, which provider or model costs most, whether a budget is exceeded, what usage is still unattributed or unpriced, or asks you to fill in price cards. 查询本机 Agent Vitals 的用量、花费、预算、归因与价卡；用户问「这个月 AI 工具花了多少」「哪家最贵」「预算超了没」「哪些用量还没归因/没价卡」「帮我补价卡」时使用。
---

# Agent Vitals MCP

Agent Vitals runs on the user's machine and reads their AI coding tools' session logs (Claude Code, Codex, DeepSeek Harness, WorkBuddy) into a local SQLite authority. This skill talks to it over MCP. The server is local, zero-network, read-only by default.

## Setup (once)

Claude Code:

```bash
claude mcp add agent-vitals -- {shell_bin} data-mcp serve --allow-local-writes
```

Codex CLI (`~/.codex/config.toml`):

```toml
[mcp_servers.agent-vitals]
command = "{bin}"
args = ["data-mcp", "serve", "--allow-local-writes"]
```

Any MCP client (`mcpServers` JSON):

```json
{{ "mcpServers": {{ "agent-vitals": {{ "command": "{bin}", "args": ["data-mcp", "serve", "--allow-local-writes"] }} }} }}
```

Drop `--allow-local-writes` for a strictly read-only server. With it, the only writes are typed local actions (price cards, billing declarations, budget settings, source controls) — never SQL, never files, never URLs.

## Ground rules — keep the numbers honest

1. **Three kinds of money, never merged.** `metered_actual` / `host_billed` = real bills; `fixed_subscription` = declared monthly fees; `metered_estimate` / `metered_declared` = price card × tokens. Carry the `≈` / "estimate" label into your answer. Never call an estimate a bill.
2. **Currencies are never added.** Report CNY and USD side by side. Only the overview's `metered_view` may show a converted `≈` figure, and it says so.
3. **Gaps are gaps, not zero.** `unresolved`, `unpriced_tokens`, `has_unresolved`, `coverage.partial` mean "unknown". Say so; do not fill with 0.
4. **Never invent prices.** `price_cards.card_put` only with a real source (a pricing page URL or the user's own statement) recorded in `source`. If you cannot find a price, skip that model and say so.
5. **Do not read the user's logs or database yourself.** The server already did; everything you need is a tool call. Never suggest SQL or file access.
6. **Attribution is the user's decision.** `billing_workflow` declarations change what counts as subscription-covered; propose, show the impact preview, and let the user confirm.

## Tools

{tools}

Every response is an envelope with `data`, `coverage`, `freshness` and `warnings`; read `coverage`/`freshness` before quoting a number as current.

## Common tasks

**Monthly spend review** — `control_plane` `monthly_summary` (by provider: subscription fees, metered estimates, unresolved) + `cost_breakdown` for the split; call out the largest line and which lines are estimates. Then `budget_profiles` for budget status (spent = metered three-tier view + subscription fees amortised by day).

**Fill missing price cards** — `price_cards` `missing_list`; for each row with `covered=false`, look up that provider's official price for the model (input / cached input / output, per million tokens, in the provider's settlement currency); `card_put` with `source`. Rows with `covered=true` are inside a subscription and only affect the nominal reference — mention, don't chase.

**Data health** — `data_status` (sync, integrity, `unresolved_tokens_month`, `unpriced_metered_tokens_month`) + `data_quality_issues`; list what needs the user's hand, most valuable first.

**Session drill-down** — `sessions_search` (window / host / model) → `session_detail` / `session_trace` by `session_ref`. Never ask for or echo native session ids or paths.

**Hourly pattern** — `usage_hourly` for one day (tokens only; cost per hour lives in `cost_breakdown`).

## Install this file as a skill

- Claude Code: save as `~/.claude/skills/agent-vitals-mcp/SKILL.md`.
- Codex: save as `~/.codex/skills/agent-vitals-mcp/SKILL.md`.
- Other hosts: any skills directory that reads `SKILL.md` frontmatter.

安装后把上面的 MCP 接入命令执行一次即可；skill 只负责教 Agent 怎么用这些工具、怎么诚实地说数字。
"#, shell_bin = shell_bin, bin = bin, tools = tools)
}

/// 「复制全部」用：整份 skill 文本。
#[tauri::command]
fn mcp_skill_text() -> String {
    mcp_skill_markdown()
}

/// 「下载 SKILL.md」：系统保存对话框，默认文件名 SKILL.md。取消 → cancelled。
#[tauri::command]
fn export_mcp_skill() -> Result<Value, String> {
    let Some(path) = rfd::FileDialog::new()
        .set_file_name("SKILL.md")
        .save_file() else {
        return Ok(serde_json::json!({ "status": "cancelled" }));
    };
    std::fs::write(&path, mcp_skill_markdown()).map_err(|e| e.to_string())?;
    Ok(serde_json::json!({ "status": "saved", "file_name": path.file_name().map(|f| f.to_string_lossy().to_string()) }))
}

#[tauri::command]
fn clear_budget_snooze() -> Result<Value, String> {
    let data_home = overview::data_home();
    let path = agent_vitals_data::authority::default_authority_path(&data_home);
    let db = agent_vitals_data::authority::AuthorityDb::open(
        &path, agent_vitals_runtime::sql_sync::now_ms(),
    ).map_err(|error| error.to_string())?;
    db.budget_snooze_clear().map_err(|error| error.to_string())?;
    Ok(serde_json::json!({ "status": "cleared" }))
}

/// 桌面端声明的 Beta 范围纪律（计费主链规格 §5.4 / B3；2026-09-16 按产品决策
/// 放开结束日期）。数据层 `billing_declaration_revision_save` 故意保持通用（内部
/// MCP 仍可写开放期），这里是用户面：`unknown` 不是声明；`effective_start` 必填且
/// 不晚于今天（北京时间）；`effective_end` **选填**——留空表示「持续有效」（按量
/// 充值 / 长期付费没有结束日），填了则必须不早于起始、不晚于今天。
///
/// 留空在这里为什么不再需要堵（规格 §3 事实 3 担心的"一次 retry 把之后同步进来的
/// 事实扫进订阅覆盖"）：归因只在重算 COMMIT 时按当时存在的事实写入，而成功任务
/// 是终态（`UNIQUE(revision_id)`，`billing_recalculation_retry` 只收 failed /
/// cancelled），没有任何周期性重跑——所以留空只是「这个关系还没结束」的记录，
/// 不是「自动扩展到未来」的开关。真是那条路径要重建，属于独立的决定。
fn validate_desktop_declaration(
    relationship_kind: &str, effective_start: &str, effective_end: Option<&str>,
) -> Result<(), String> {
    if relationship_kind == "unknown" {
        return Err("\"unknown\" is not a billing declaration; keep the group pending instead".to_string());
    }
    let start_date = agent_vitals_data::authority::billing_boundary_date(effective_start, false)
        .ok_or_else(|| "effective_start must be YYYY-MM-DD (YYYY-MM is accepted for legacy data)".to_string())?;
    // 空串与 None 同义：前端把清空的日期输入框发成 null，但脚本/历史调用可能发 ""。
    let Some(end) = effective_end.map(str::trim).filter(|end| !end.is_empty()) else {
        return Ok(());
    };
    let end_date = agent_vitals_data::authority::billing_boundary_date(end, true)
        .ok_or_else(|| "effective_end must be YYYY-MM-DD (YYYY-MM is accepted for legacy data)".to_string())?;
    if end_date < start_date {
        return Err("effective_end must not be earlier than effective_start".to_string());
    }
    let today = overview::today_beijing();
    if end_date > today {
        return Err("effective_end must not be later than today (Beijing date)".to_string());
    }
    Ok(())
}

/// 保存一条可追溯的计费关系修订。声明当前态与不可变修订在同一个用户动作中
/// 写入；scope 由前端显式传入，空数组表示只使用宿主/provider/有效期约束。
/// 官方订阅在保存成功后立即入队重算并返回 `job`——「保存」与「应用」曾是
/// 两次点击，只保存不应用会留下声明已存在、数字未变、待处理也不显示的半状态
/// （规格 G6）。入队失败不回滚修订（修订是不可变事实），回执如实带出。
#[tauri::command]
#[allow(clippy::too_many_arguments)]
fn save_billing_declaration_revision(
    revision_id: String,
    declaration_id: String,
    supersedes_revision_id: Option<String>,
    host: String,
    provider_id: String,
    relationship_kind: String,
    subscription_name: Option<String>,
    amount_minor: Option<i64>,
    currency: Option<String>,
    effective_start: String,
    effective_end: Option<String>,
    source_candidate_id: Option<String>,
    evidence_ref: Option<String>,
    scopes: Vec<BillingScopeInput>,
) -> Result<Value, String> {
    validate_desktop_declaration(
        &relationship_kind, &effective_start, effective_end.as_deref(),
    )?;
    // 计费方归一到目录 id：程序判定给的是端点主机名（`shengsuanyun.com`），目录是
    // `shengsuanyun`——两种拼法各存一份就是两个 provider，价卡永远对不上后者
    // （2026-09-16 真机 9 条重复声明里两种拼法混存）。
    let provider_id = agent_vitals_domain::cost::canonical_provider_id(
        &provider_id, &agent_vitals_domain::cost::load_pricing(),
    );
    let data_home = overview::data_home();
    let path = agent_vitals_data::authority::default_authority_path(&data_home);
    let db = agent_vitals_data::authority::AuthorityDb::open(
        &path, agent_vitals_runtime::sql_sync::now_ms(),
    ).map_err(|error| error.to_string())?;
    let now_ms = agent_vitals_runtime::sql_sync::now_ms();
    let scope_refs = scopes.iter()
        .map(|scope| (scope.scope_kind.as_str(), scope.scope_value.as_str()))
        .collect::<Vec<_>>();
    let changed = db.billing_declaration_revision_save(
        &revision_id, &declaration_id, supersedes_revision_id.as_deref(),
        &host, &provider_id, &relationship_kind, subscription_name.as_deref(),
        amount_minor, currency.as_deref(), &effective_start, effective_end.as_deref(),
        source_candidate_id.as_deref(), evidence_ref.as_deref(), &scope_refs, now_ms,
    ).map_err(|error| error.to_string())?;
    // **所有关系种类都入队重算**（2026-09-16 放开，此前只有官方订阅）。非订阅关系的
    // 重算写 `user_declared` 归因行——金额排除谓词不认它（D02：不改金额），但待确认
    // 组的谓词认它：确认经中转/按量/组织后，那组事实标成"已回答"、行从待确认关掉。
    // 不入队的后果是真机踩过的：third_party 声明存下了，可没有任何东西消费它，
    // 行永远留在待确认里（axis 规格 F6 的发作面）。
    let job = {
        let job_id = format!("billing-{revision_id}");
        match db.billing_recalculation_enqueue(&job_id, &declaration_id, &revision_id, now_ms) {
            Ok(queued) => {
                drop(db);
                if queued {
                    spawn_billing_recalculation_worker(path, job_id.clone());
                }
                serde_json::json!({ "job_id": job_id, "status": "queued", "changed": queued })
            }
            Err(error) => serde_json::json!({
                "job_id": job_id, "status": "enqueue_failed", "error": error.to_string(),
            }),
        }
    };
    Ok(serde_json::json!({
        "status": "saved", "revision_id": revision_id,
        "declaration_id": declaration_id, "changed": changed, "job": job,
    }))
}

/// 读取当前仍有效的计费声明；修订历史由影响预览和重算回执继续追踪。
#[tauri::command(async)]
fn billing_declarations() -> Value {
    let data_home = overview::data_home();
    let path = agent_vitals_data::authority::default_authority_path(&data_home);
    let Ok(db) = agent_vitals_data::authority::AuthorityDb::open_readonly(&path) else {
        return serde_json::json!({ "status": "unavailable", "declarations": [] });
    };
    match db.billing_declarations() {
        Ok(rows) => serde_json::json!({ "status": "ok", "declarations": rows.into_iter().map(|row| {
            let (declaration_id, host, provider_id, relationship_kind, subscription_name,
                amount_minor, currency, effective_start, effective_end, source_candidate_id) = row;
            let current_revision_id = db.billing_declaration_revisions(&declaration_id)
                .ok().and_then(|revisions| revisions.last().map(|revision| revision.0.clone()));
            // 当前修订的作用域：修改订阅必须原样带回，否则修订会悄悄把声明范围
            // 从"这几个模型"放宽成"该服务商全部模型"（B13）。
            let scopes = current_revision_id.as_deref()
                .and_then(|revision_id| db.billing_declaration_scopes(revision_id).ok())
                .map(|rows| rows.into_iter().map(|(_, kind, value)| serde_json::json!({
                    "scope_kind": kind, "scope_value": value,
                })).collect::<Vec<_>>())
                .unwrap_or_default();
            serde_json::json!({
                "declaration_id": declaration_id, "host": host, "provider_id": provider_id,
                "relationship_kind": relationship_kind, "subscription_name": subscription_name,
                "amount_minor": amount_minor, "currency": currency,
                "effective_start": effective_start, "effective_end": effective_end,
                "source_candidate_id": source_candidate_id,
                "current_revision_id": current_revision_id,
                "scopes": scopes,
            })
        }).collect::<Vec<_>>() }),
        Err(error) => serde_json::json!({ "status": "unavailable", "reason": error.to_string(), "declarations": [] }),
    }
}

/// 撤销只追加不可变修订，不删除已有影响、历史或证据；聚合查询仅认当前 saved
/// 修订，因此撤销完成后读取端会立即恢复按量/未定归类。
#[tauri::command]
fn revoke_billing_declaration(
    revision_id: String, declaration_id: String, supersedes_revision_id: String,
) -> Result<Value, String> {
    let data_home = overview::data_home();
    let path = agent_vitals_data::authority::default_authority_path(&data_home);
    let db = agent_vitals_data::authority::AuthorityDb::open(
        &path, agent_vitals_runtime::sql_sync::now_ms(),
    ).map_err(|error| error.to_string())?;
    let changed = db.billing_declaration_revision_revoke(
        &revision_id, &declaration_id, &supersedes_revision_id,
        agent_vitals_runtime::sql_sync::now_ms(),
    ).map_err(|error| error.to_string())?;
    Ok(serde_json::json!({
        "status": "revoked", "revision_id": revision_id,
        "declaration_id": declaration_id, "changed": changed,
    }))
}

/// 对尚未保存的声明做只读影响预览。参数就是保存时的参数（宿主、provider、
/// 关系、起止月、作用域）——不再由前端另传统计月窗口：预览范围必须等于写入范围
/// （计费主链规格 G2/R1）。三组数字与分币金额由 `runtime::billing_preview` 用与重算
/// 归因同一条谓词、与 MCP `cost_breakdown` 同一条计价路径算出。
#[tauri::command(async)]
fn billing_candidate_impact_preview(
    host: String, provider_id: String, relationship_kind: String, effective_start: String,
    effective_end: Option<String>, scopes: Vec<BillingScopeInput>,
) -> Value {
    let path = agent_vitals_data::authority::default_authority_path(&overview::data_home());
    let Ok(db) = agent_vitals_data::authority::AuthorityDb::open_readonly(&path) else {
        return serde_json::json!({"status": "unavailable", "reason": "authority database is unavailable"});
    };
    // 预览范围必须等于写入范围（G2/R1）：provider 归一与保存路径同一条规则。
    let provider_id = agent_vitals_domain::cost::canonical_provider_id(
        &provider_id, &agent_vitals_domain::cost::load_pricing(),
    );
    let scope_refs = scopes.iter()
        .map(|scope| (scope.scope_kind.as_str(), scope.scope_value.as_str()))
        .collect::<Vec<_>>();
    agent_vitals_runtime::billing_preview::declaration_impact_preview(
        &db, &host, &provider_id, &relationship_kind, &effective_start,
        effective_end.as_deref(), &scope_refs,
    )
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
fn save_host_bill(
    bill_id: String, host: String, provider_id: String, billing_period: String,
    billing_basis: String, amount_minor: i64, currency: String, evidence_ref: String,
) -> Result<Value, String> {
    let data_home = overview::data_home();
    let path = agent_vitals_data::authority::default_authority_path(&data_home);
    let db = agent_vitals_data::authority::AuthorityDb::open(
        &path, agent_vitals_runtime::sql_sync::now_ms(),
    ).map_err(|error| error.to_string())?;
    db.host_bill_put(
        &bill_id, &host, &provider_id, &billing_period, &billing_basis,
        amount_minor, &currency, &evidence_ref, agent_vitals_runtime::sql_sync::now_ms(),
    ).map_err(|error| error.to_string())?;
    Ok(serde_json::json!({ "status": "saved", "bill_id": bill_id }))
}

#[tauri::command]
fn save_host_bills(rows: Vec<HostBillInput>) -> Result<Value, String> {
    if rows.is_empty() {
        return Err("no bill rows to import".to_string());
    }
    let data_home = overview::data_home();
    let path = agent_vitals_data::authority::default_authority_path(&data_home);
    let db = agent_vitals_data::authority::AuthorityDb::open(
        &path, agent_vitals_runtime::sql_sync::now_ms(),
    ).map_err(|error| error.to_string())?;
    let now_ms = agent_vitals_runtime::sql_sync::now_ms();
    db.with_immediate_txn(|_| {
        for row in &rows {
            db.host_bill_put(
                &row.bill_id, &row.host, &row.provider_id, &row.billing_period,
                &row.billing_basis, row.amount_minor, &row.currency, &row.evidence_ref, now_ms,
            )?;
        }
        Ok(())
    }).map_err(|error| error.to_string())?;
    Ok(serde_json::json!({ "status": "saved", "count": rows.len() }))
}

#[tauri::command(async)]
fn host_bills_for_period(billing_period: String) -> Value {
    let data_home = overview::data_home();
    let path = agent_vitals_data::authority::default_authority_path(&data_home);
    let Ok(db) = agent_vitals_data::authority::AuthorityDb::open_readonly(&path) else {
        return serde_json::json!({ "status": "unavailable", "bills": [] });
    };
    match db.host_bill_details_for_period(&billing_period) {
        Ok(rows) => serde_json::json!({ "status": "ok", "bills": rows.into_iter().map(|(bill_id, host, provider_id, billing_basis, amount_minor, currency, evidence_ref)| {
            serde_json::json!({ "bill_id": bill_id, "host": host, "provider_id": provider_id, "billing_basis": billing_basis, "amount_minor": amount_minor, "currency": currency, "evidence_ref": evidence_ref })
        }).collect::<Vec<_>>() }),
        Err(error) => serde_json::json!({ "status": "unavailable", "reason": error.to_string(), "bills": [] }),
    }
}

#[tauri::command]
fn delete_host_bill(bill_id: String) -> Result<Value, String> {
    let data_home = overview::data_home();
    let path = agent_vitals_data::authority::default_authority_path(&data_home);
    let db = agent_vitals_data::authority::AuthorityDb::open(
        &path, agent_vitals_runtime::sql_sync::now_ms(),
    ).map_err(|error| error.to_string())?;
    let deleted = db.host_bill_delete(
        &bill_id, agent_vitals_runtime::sql_sync::now_ms(),
    ).map_err(|error| error.to_string())?;
    Ok(serde_json::json!({ "status": "deleted", "bill_id": bill_id, "deleted": deleted }))
}

/// 声明保存后创建重算任务；这里只入队，不在 IPC 调用线程执行重算。
fn spawn_billing_recalculation_worker(path: PathBuf, job_id: String) {
    std::thread::spawn(move || {
        let lease_path = path
            .parent()
            .map(|parent| parent.join(".billing-recalculation.lock"))
            .unwrap_or_else(|| PathBuf::from(".billing-recalculation.lock"));
        let holder = format!("billing-recalculation-{job_id}");
        let Ok(_lease) = agent_vitals_runtime::lease::acquire_blocking(
            &lease_path, &holder, 60_000, 60_000,
        ) else {
            if let Ok(db) = agent_vitals_data::authority::AuthorityDb::open(
                &path, agent_vitals_runtime::sql_sync::now_ms(),
            ) {
                let _ = db.billing_recalculation_set_status(
                    &job_id, "failed", Some("worker_busy"),
                    Some("recalculation worker lock was held"),
                    agent_vitals_runtime::sql_sync::now_ms(),
                );
            }
            return;
        };
        let Ok(worker_db) = agent_vitals_data::authority::AuthorityDb::open(
            &path, agent_vitals_runtime::sql_sync::now_ms(),
        ) else { return };
        for attempt in 0..3 {
            if attempt > 0 {
                std::thread::sleep(std::time::Duration::from_millis(250 * (1_u64 << (attempt - 1))));
                let _ = worker_db.billing_recalculation_retry(
                    &job_id, agent_vitals_runtime::sql_sync::now_ms(),
                );
            }
            match worker_db.billing_recalculation_run(
                &job_id, agent_vitals_runtime::sql_sync::now_ms(),
            ) {
                Ok(true) => return,
                Ok(false) => {
                    // false means the job was missing or no longer queued; it is
                    // never a successful recalculation receipt. A terminal job
                    // remains untouched by the final failure update below.
                }
                Err(_) => {
                    // The data layer records failures after entering `running`.
                    // Keep the retry loop here for transient database/worker errors.
                }
            }
        }
        let _ = worker_db.billing_recalculation_set_status(
            &job_id, "failed", Some("worker_failed"),
            Some("recalculation worker failed after retries"),
            agent_vitals_runtime::sql_sync::now_ms(),
        );
    });
}

fn recover_billing_recalculations(path: PathBuf) {
    let Ok(db) = agent_vitals_data::authority::AuthorityDb::open(
        &path, agent_vitals_runtime::sql_sync::now_ms(),
    ) else { return };
    let queued = db.billing_recalculation_recover(
        agent_vitals_runtime::sql_sync::now_ms(),
    ).unwrap_or_default();
    drop(db);
    for job_id in queued {
        spawn_billing_recalculation_worker(path.clone(), job_id);
    }
}

#[tauri::command]
fn enqueue_billing_recalculation(
    job_id: String, declaration_id: String, revision_id: String,
) -> Result<Value, String> {
    let data_home = overview::data_home();
    let path = agent_vitals_data::authority::default_authority_path(&data_home);
    let db = agent_vitals_data::authority::AuthorityDb::open(
        &path, agent_vitals_runtime::sql_sync::now_ms(),
    ).map_err(|error| error.to_string())?;
    let changed = db.billing_recalculation_enqueue(
        &job_id, &declaration_id, &revision_id, agent_vitals_runtime::sql_sync::now_ms(),
    ).map_err(|error| error.to_string())?;
    drop(db);
    if changed {
        spawn_billing_recalculation_worker(path.clone(), job_id.clone());
    }
    Ok(serde_json::json!({ "status": "queued", "job_id": job_id, "changed": changed }))
}

/// 失败/取消任务的显式重试入口；重试仍在后台执行，不阻塞 IPC 调用线程。
#[tauri::command]
fn retry_billing_recalculation(job_id: String) -> Result<Value, String> {
    let data_home = overview::data_home();
    let path = agent_vitals_data::authority::default_authority_path(&data_home);
    let db = agent_vitals_data::authority::AuthorityDb::open(
        &path, agent_vitals_runtime::sql_sync::now_ms(),
    ).map_err(|error| error.to_string())?;
    let changed = db.billing_recalculation_retry(
        &job_id, agent_vitals_runtime::sql_sync::now_ms(),
    ).map_err(|error| error.to_string())?;
    drop(db);
    if !changed {
        return Err("only failed or cancelled recalculation jobs can be retried".to_string());
    }
    spawn_billing_recalculation_worker(path, job_id.clone());
    Ok(serde_json::json!({ "status": "queued", "job_id": job_id, "changed": true }))
}

/// 查询重算任务回执；未找到和数据库不可用均返回可识别的业务错误。
#[tauri::command]
fn billing_recalculation_job_status(job_id: String) -> Result<Value, String> {
    let data_home = overview::data_home();
    let path = agent_vitals_data::authority::default_authority_path(&data_home);
    let db = agent_vitals_data::authority::AuthorityDb::open_readonly(&path)
        .map_err(|error| error.to_string())?;
    let Some((job_id, declaration_id, revision_id, status, requested_at_ms, started_at_ms,
        completed_at_ms, error_code, error_detail)) = db.billing_recalculation_job(&job_id)
        .map_err(|error| error.to_string())? else {
        return Err("unknown recalculation job".to_string());
    };
    Ok(serde_json::json!({
        "status": status, "job_id": job_id, "declaration_id": declaration_id,
        "revision_id": revision_id, "requested_at_ms": requested_at_ms,
        "started_at_ms": started_at_ms, "completed_at_ms": completed_at_ms,
        "error_code": error_code, "error_detail": error_detail,
    }))
}

/// 查询重算待处理列表；用于工作台重启后展示「重算待重试」而不丢失旧结果。
#[tauri::command(async)]
fn billing_recalculation_jobs() -> Result<Value, String> {
    let data_home = overview::data_home();
    let path = agent_vitals_data::authority::default_authority_path(&data_home);
    let db = agent_vitals_data::authority::AuthorityDb::open_readonly(&path)
        .map_err(|error| error.to_string())?;
    let jobs = db.billing_recalculation_jobs_needing_attention()
        .map_err(|error| error.to_string())?;
    Ok(serde_json::json!({
        "status": "ok",
        "jobs": jobs.into_iter().map(|(job_id, declaration_id, revision_id, status,
            requested_at_ms, started_at_ms, completed_at_ms, error_code, error_detail)| {
            serde_json::json!({
                "job_id": job_id, "declaration_id": declaration_id, "revision_id": revision_id,
                "status": status, "requested_at_ms": requested_at_ms, "started_at_ms": started_at_ms,
                "completed_at_ms": completed_at_ms, "error_code": error_code, "error_detail": error_detail,
            })
        }).collect::<Vec<_>>()
    }))
}

/// 工作台「数据源」页的独立契约。会话搜索只回答时间窗内的会话，不能再被
/// 借来承载扫描健康；这里从 SQL authority 的 source_files / usage_facts 读取
/// 每个已接线宿主的扫描、导入和失败范围。宿主集合复用 ingest registry，前端
/// 不再硬编码两个卡片。路径只以 source_id/path_hash 留在库内，本 DTO 不泄露。
#[tauri::command(async)]
fn data_source_status() -> Value {
    let data_home = overview::data_home();
    let path = agent_vitals_data::authority::default_authority_path(&data_home);
    let Ok(db) = agent_vitals_data::authority::AuthorityDb::open_readonly(&path) else {
        return serde_json::json!({
            "status": "unavailable",
            "reason": "authority database is missing or unreadable",
            "sources": []
        });
    };
    let mut report = agent_vitals_runtime::mcp::source_status_report(db.conn()).unwrap_or_else(|reason| {
        serde_json::json!({ "status": "unavailable", "reason": reason, "sources": [] })
    });
    let excluded_hosts = match agent_vitals_runtime::source_controls::excluded_hosts(&data_home) {
        Ok(hosts) => hosts,
        Err(error) => return serde_json::json!({ "status": "unavailable", "reason": error, "sources": [] }),
    };
    if let Some(sources) = report.get_mut("sources").and_then(Value::as_array_mut) {
        for source in sources {
            let host = source.get("host").and_then(Value::as_str).unwrap_or("");
            if excluded_hosts.contains(host) {
                source["connection_state"] = Value::String("excluded".into());
                source["recovery_action"] = serde_json::json!({
                    "kind": "include_source", "label": "恢复读取"
                });
            }
        }
    }
    merge_source_sync_failure(&mut report, &overview::read_overview().sync);
    if matches!(overview::sync_is_paused(), Ok(true)) {
        if let Some(sources) = report.get_mut("sources").and_then(Value::as_array_mut) {
            for source in sources {
                if source.get("connection_state").and_then(Value::as_str) == Some("excluded") { continue; }
                source["connection_state"] = Value::String("paused".into());
                source["recovery_action"] = serde_json::json!({
                    "kind": "resume_sync", "label": "恢复同步"
                });
            }
        }
    }
    report
}

#[tauri::command(async)]
fn sync_pause_state() -> Value {
    match overview::sync_is_paused() {
        Ok(paused) => serde_json::json!({ "status": "ok", "paused": paused }),
        Err(error) => serde_json::json!({ "status": "unavailable", "reason": error }),
    }
}

#[tauri::command]
fn set_sync_paused(paused: bool) -> Result<Value, String> {
    overview::save_sync_paused(paused)?;
    Ok(serde_json::json!({ "status": "saved", "paused": paused }))
}

/// 扫描器在发现目录权限/解析失败时可能尚未写出 source_files 行；最近同步状态
/// 是这类失败的生产证据。把能明确归属的宿主标为需要处理；无法归属的 facts
/// 同步失败影响全部宿主，不能伪装成三个“已连接”。
fn merge_source_sync_failure(report: &mut Value, sync: &SyncStatus) {
    if sync.ok || sync.stage == "never" { return; }
    let message = sync.message.to_lowercase();
    let Some(sources) = report.get_mut("sources").and_then(Value::as_array_mut) else { return };
    let explicitly_scoped = ["claude", "codex", "dsh", "deepseek"]
        .iter().any(|marker| message.contains(marker));
    for source in sources {
        if source.get("connection_state").and_then(Value::as_str) == Some("excluded") { continue; }
        let host = source.get("host").and_then(Value::as_str).unwrap_or("");
        let affected = if explicitly_scoped {
            (host == "claude-code" && message.contains("claude"))
                || (host == "codex" && message.contains("codex"))
                || (host == "dsh" && (message.contains("dsh") || message.contains("deepseek")))
        } else { true };
        if !affected { continue; }
        source["connection_state"] = Value::String("needs_attention".into());
        source["authorization"] = Value::String("unknown_or_failed".into());
        let error_code = if message.contains("permission") || message.contains("denied") {
            "permission_denied"
        } else if message.contains("disk full") || message.contains("no space") {
            "disk_full"
        } else if message.contains("parse") || message.contains("json") || message.contains("malformed") {
            "source_parse_failed"
        } else {
            "source_read_failed"
        };
        let prior_failed = source["failed_scope"]["sources"].as_u64().unwrap_or(0);
        source["failed_scope"]["sources"] = serde_json::json!(prior_failed.max(1));
        let mut error_codes = source["failed_scope"]["error_codes"]
            .as_array()
            .cloned()
            .unwrap_or_default();
        if !error_codes.iter().any(|code| code.as_str() == Some(error_code)) {
            error_codes.push(Value::String(error_code.into()));
        }
        source["failed_scope"]["error_codes"] = Value::Array(error_codes);
        source["failed_scope"]["sync"] = serde_json::json!({
            "stage": sync.stage, "message": sync.message
        });
        source["recovery_action"] = serde_json::json!({
            "kind": "retry_sync", "label": "重新同步"
        });
    }
}


/// v0.9 Stage 0.6 工作台 Data Query API（spec §7 目标态"Tauri 只调
/// monthly_summary 等 API"）：经 `SummaryRepository` trait 调 runtime 的
/// repository——Phase 3.5 Tier A 起读 SQL 权威库
/// （`SqlSummaryRepository`，含 legacy_aggregate 深历史），与 CLI `data
/// coverage` 同源。薄转发，无定价/无直读 state JSON。`--json` 与
/// CLI `data coverage` 是**同一份冻结 DTO**（`data_contract.rs::to_json`），
/// 工作台总览/日历两页的诚实字段（freshness/coverage/excluded_hosts）都从
/// 这里取，不许前端自己从金额反推"有没有数据"。
#[tauri::command(async)]
fn data_monthly_summary(month: String) -> Value {
    use agent_vitals_data::repository::{MonthlySummaryQuery, SummaryRepository};
    let repo = agent_vitals_runtime::summary::SqlSummaryRepository::new();
    repo.monthly_summary(&MonthlySummaryQuery { month }).to_json()
}

/// v0.9 Stage 0.6 单日版（北京日 YYYY-MM-DD）。与 `data_monthly_summary`
/// 同一条 trait 路径、同一份 DTO 契约（同为 SQL 权威库读源）。
#[tauri::command(async)]
fn data_daily_summary(date: String) -> Value {
    use agent_vitals_data::repository::{DailySummaryQuery, SummaryRepository};
    let repo = agent_vitals_runtime::summary::SqlSummaryRepository::new();
    repo.daily_summary(&DailySummaryQuery { date }).to_json()
}

/// Claude Pro 额度提醒的开关（默认关）。
///
/// **为什么自带开关**：系统通知权限必须由一次用户动作触发申请；额度提醒与预算
/// 提醒是两件事，从不用预算的用户不该因此永远收不到窗口提醒。读不出开关时一律
/// 按"关"处理（fail-closed）。
#[tauri::command]
fn quota_reminder_config() -> Value {
    let enabled = agent_vitals_runtime::quota_reminder::enabled_or_default(&overview::data_home());
    serde_json::json!({ "status": "ok", "enabled": enabled })
}

/// 写入开关；**打开的那一刻才申请系统通知权限**（REQ-039：权限在用户启用提醒时申请）。
#[tauri::command]
fn save_quota_reminder_config(app: AppHandle, enabled: bool) -> Result<Value, String> {
    let data_home = overview::data_home();
    let notification_permission = enabled.then(|| {
        app.notification()
            .request_permission()
            .map(|state| format!("{state:?}"))
            .unwrap_or_else(|error| format!("unavailable: {error}"))
    });
    agent_vitals_runtime::quota_reminder::set_enabled(&data_home, enabled)?;
    Ok(serde_json::json!({
        "status": "saved",
        "enabled": enabled,
        "notification_permission": notification_permission,
    }))
}

/// 用户补的价卡（`state/pricing-overrides.json`）。
///
/// **为什么有这一层**：价目表 `assets/pricing.json` 是 `include_str!` 编进二进制的，
/// 运行时改不了；而"厂商出了新型号、价目表里还没有"是必然反复发生的事
/// （2026-09-14 的 `deepseek/deepseek-v4.1-flash`）。这一层让用户能自己补一张卡，
/// 把"算不出来"变成"按他填的价算得出来"。
#[tauri::command]
fn price_cards() -> Value {
    let data_home = overview::data_home();
    serde_json::json!({
        "status": "ok",
        "cards": agent_vitals_runtime::price_overrides::cards(&data_home),
    })
}

/// 写入/替换一张用户补的价卡。三个维度（未命中输入/命中输入/输出）各两档峰谷，
/// **必须齐全**——半张卡会让计价按缺档静默算出一个看似正常的错数字。第四维
/// `cache_write` 可选（中转把缓存写入单独计价时才需要）。
#[tauri::command]
fn save_price_card(input: PriceCardInput) -> Result<Value, String> {
    let data_home = overview::data_home();
    let mut card = serde_json::json!({
        "input_uncached": input.input_uncached,
        "input_cached": input.input_cached,
        "output": input.output,
    });
    if let Some(cache_write) = input.cache_write {
        card["cache_write"] = cache_write;
    }
    agent_vitals_runtime::price_overrides::save_card(
        &data_home, &input.provider_id, &input.model_id, &card,
    )?;
    Ok(serde_json::json!({
        "status": "saved",
        "provider_id": input.provider_id,
        "model_id": input.model_id,
    }))
}

/// 用户声明的**型号归属**（"这个型号算哪个服务商的账"）。
///
/// **与补价卡是两件事，且有先后**：`billing_route_of` 只读价目表里的
/// `catalog_2026_09.billing_modes`（模型名前缀 → 服务商），公共目录只声明了少数
/// 几条。归属没定 → 整批用量 `billing-route-unknown`（**不是"怎么付"的问题，是
/// "算谁的"**，所以计费声明解决不了）；归属定了但没价卡 → `no-price-card`。
/// 声明归属后状态会前进到缺价卡，那时才轮到补价卡。
#[tauri::command]
fn price_routes() -> Value {
    let data_home = overview::data_home();
    serde_json::json!({
        "status": "ok",
        "routes": agent_vitals_runtime::price_overrides::routes(&data_home),
    })
}

#[tauri::command]
fn save_price_route(input: PriceRouteInput) -> Result<Value, String> {
    let data_home = overview::data_home();
    agent_vitals_runtime::price_overrides::save_route(
        &data_home, &input.model_prefix, &input.provider_id, &input.mode,
    )?;
    Ok(serde_json::json!({
        "status": "saved",
        "model_prefix": input.model_prefix,
        "provider_id": input.provider_id,
    }))
}

#[tauri::command]
fn delete_price_route(model_prefix: String) -> Result<Value, String> {
    let data_home = overview::data_home();
    agent_vitals_runtime::price_overrides::remove_route(&data_home, &model_prefix)?;
    Ok(serde_json::json!({ "status": "removed" }))
}

#[tauri::command]
fn delete_price_card(provider_id: String, model_id: String) -> Result<Value, String> {
    let data_home = overview::data_home();
    agent_vitals_runtime::price_overrides::remove_card(&data_home, &provider_id, &model_id)?;
    Ok(serde_json::json!({ "status": "removed" }))
}

/// 决策卡「现在该用谁」的 Claude Pro 窗口状态（2026-09-14）。
///
/// 与 Codex 那行**不等价**：Claude 的本地日志里没有正向余量（42/42 条
/// `quotaLimits` 全是 `status:"rejected"`，无 `used_percent`），所以只可能给出
/// `unknown` 或 `exhausted`（+ 重置时刻），**永远不会有"剩余 N%"**——
/// `ROUTE_UNIT_COST_DECISION_SPEC` §8.3.2 明令不得显示百分比。
#[tauri::command(async)]
fn data_claude_quota() -> Option<Value> {
    // 窗口状态由同步管线扫 ~/.claude 的 quotaLimits 落库，这里只读快照 ——
    // 读面不现扫（与 data_codex_quota 同一条纪律）。`now` 在这里取一次并注入
    // 状态机，保证卡片/待处理/通知拿到同一个"现在"。
    let now_secs = agent_vitals_runtime::sql_sync::now_ms() / 1_000;
    agent_vitals_runtime::summary::claude_quota_status(now_secs)
}

/// 决策卡「现在该用谁」的 Codex 窗口余量（v0.9 Stage D）。plan 是"当前
/// 状态"的单快照、不按日期分桶——独立命令而不是塞进月/日 summary，语义
/// 才不混。无 rollout / 无 plan 事件 → null（无 ChatGPT 订阅证据，不得编
/// 造余量）。
#[tauri::command(async)]
fn data_codex_quota() -> Option<Value> {
    // codex rollout 根在 ~/.codex，不在数据根——解析复用 runtime 的 codex_home
    // （HOME → USERPROFILE → 空串，审查 #4：手写 HOME-only 在 Windows 上静默假
    // Unavailable）。
    agent_vitals_runtime::summary::codex_quota_snapshot(
        &agent_vitals_runtime::summary::codex_home(),
    )
}

/// Token 日历的逐日跨宿主数据（v0.9 Stage D——此前日历只画 DSH 日轴，
/// DSH 零用量月份让 claude/codex 的真实用量在日历上不可见）。每天三宿主
/// 各自 token + 耗费，钱不跨宿主不跨币合并（口径各异，格子副行分币并列）。
#[tauri::command(async)]
fn read_calendar_month(month: String) -> Value {
    agent_vitals_runtime::summary::calendar_month(
        &month,
        &agent_vitals_runtime::summary::codex_home(),
    )
}

/// 单日按小时分布（北京小时）——旧 calendar.html「小时格热力」组件接入
/// 工作台。来源矩阵见 `summary::hourly_distribution`：codex=fold 全量、
/// dsh=今日 today-json / 历史日 facts-index、claude=facts-index（该日
/// 会话被 ingest 过才有——来源标注让部分覆盖在 UI 上可见）。
#[tauri::command(async)]
fn read_hourly_distribution(date: String) -> Value {
    agent_vitals_runtime::summary::hourly_distribution(
        &date,
        &agent_vitals_runtime::summary::codex_home(),
    )
}

/// 工作台「立即同步」按钮：返回本次请求的单调 ID。后台完成后由
/// sync_request_status 精确确认，不再用秒级时间戳猜测是否是本次同步。
#[tauri::command]
fn trigger_sync(app: AppHandle) -> String {
    let id = format!("sync-{}", SYNC_REQUEST_SEQ.fetch_add(1, Ordering::Relaxed));
    {
        let requests = app.state::<SyncRequests>();
        let mut requests = requests.0.lock().unwrap_or_else(|e| e.into_inner());
        if requests.len() > 32 { requests.retain(|_, completed| !*completed); }
        requests.insert(id.clone(), false);
    }
    sync_now_tracked(&app, Some(id.clone()));
    id
}

#[tauri::command]
fn sync_request_status(app: AppHandle, request_id: String) -> Value {
    let requests = app.state::<SyncRequests>();
    let requests = requests.0.lock().unwrap_or_else(|e| e.into_inner());
    match requests.get(&request_id) {
        Some(completed) => serde_json::json!({ "request_id": request_id, "completed": completed }),
        None => serde_json::json!({ "request_id": request_id, "error": "unknown_request" }),
    }
}

/// v0.10.0 Traces tab 的数据面（spec §7 门槛 3 的 Tauri IPC 消费面）：薄转发到
/// runtime 的 MCP `session_trace` 工具——**in-process** 而非 store.rs 的 spawn
/// CLI，两个理由：(1) 数据面是纯函数 + memo（常驻进程里同会话反复下钻命中同
/// 一份 `Arc<TraceGraph>`，spawn 每次冷启动反而更慢）；(2) envelope 形状与 MCP
/// / CLI 三面同源（`mcp::build_envelope`），door-3 parity 由构造保证。
///
/// 错误面：MCP `ToolError` → `{error: {code, message}}`（与 store.rs 的类型化
/// 错误透传同形状），前端按 code 分支展示。`spawn_blocking`：首次权威库打开是
/// 冷 IO（与 sessions_* 同一条纪律）。
#[tauri::command]
async fn session_trace(
    session_ref: String,
    output: Option<String>,
) -> Value {
    let args = serde_json::json!({
        "session_ref": session_ref,
        "output": output.unwrap_or_else(|| "timeline_series".to_string()),
    });
    let data_home = overview::data_home();
    tauri::async_runtime::spawn_blocking(move || {
        match agent_vitals_runtime::mcp::dispatch("session_trace", &args, &data_home) {
            Ok(v) => v,
            Err(e) => serde_json::json!({"error": {"code": e.code, "message": e.message}}),
        }
    })
    .await
    .unwrap_or_else(|_| serde_json::json!({"error": {"code": "cancelled", "message": "join error"}}))
}

/// 工作台 pull：**非破坏性**读导航目标（窗口未建/未可见时菜单点击的目标留在这里，等
/// init/focus 时消费；`peek` 不消费，apply 成功后由 `clear_nav_target` 显式清）。
#[tauri::command]
fn peek_nav_target(state: tauri::State<'_, NavTarget>) -> Option<String> {
    state.0.lock().unwrap_or_else(|e| e.into_inner()).clone()
}

/// 工作台 apply 成功后清除导航目标——陈旧目标不清会在下次 focus 时重复跳一次 tab。
#[tauri::command]
fn clear_nav_target(state: tauri::State<'_, NavTarget>) {
    *state.0.lock().unwrap_or_else(|e| e.into_inner()) = None;
}

/// 会话深链发射点（spec §7.2 的 focus_session）：覆盖式存入 + `focus-target`
/// 事件 + show_workbench。前端 v1 不发射（消费侧是 peek/clear），这个命令是给
/// 菜单分发与未来「查看全部会话」回归共用的 IPC 面。
#[tauri::command]
fn focus_session(app: AppHandle, target: WorkbenchTarget) {
    focus_session_target(&app, target);
}

/// 工作台 pull：**非破坏性**读深链目标（窗口未建/未可见时菜单点击的目标留在
/// 这里，等 init/focus/visibilitychange 时消费；`peek` 不消费，apply 成功后由
/// `clear_focus_target` 显式清——失败也清，不无限重试，spec §7.2）。
#[tauri::command]
fn peek_focus_target(state: tauri::State<'_, FocusTarget>) -> Option<WorkbenchTarget> {
    state.peek()
}

/// 工作台 apply 成功后清除深链目标（失败也清——错误横幅已向用户说明，菜单再点
/// 会覆盖新目标）。
#[tauri::command]
fn clear_focus_target(state: tauri::State<'_, FocusTarget>) {
    state.clear();
}

/// 工作台"截图"按钮：把窗口内容直接拷进系统剪贴板，省得用户手动截图裁剪再贴过来。
/// 用 `screencapture -l<windowNumber>`（按窗口 ID 截）而不是拿 outer_position/
/// outer_size 算区域再 `-R x,y,w,h`——后者要在物理像素和 Retina scale factor 之间
/// 换算，前者让系统自己按窗口分辨率截，不用算。
/// 注意：这是 macOS 系统权限，不是这段代码能探测的——第一次调用如果没有"屏幕录制"
/// 权限，`screencapture` 仍然 exit 0，只是拷贝出一张黑图/空图；这里不做静默降级。
#[tauri::command]
fn capture_workbench_screenshot(app: AppHandle) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        use objc::{msg_send, sel, sel_impl};
        let window = app
            .get_webview_window("workbench")
            .ok_or_else(|| "工作台窗口未打开".to_string())?;
        let ns_window = window.ns_window().map_err(|e| e.to_string())? as *mut objc::runtime::Object;
        if ns_window.is_null() {
            return Err("拿不到窗口句柄".to_string());
        }
        // objc `msg_send!` 宏内部的 cfg 会被 clippy 的 unexpected_cfgs 误报
        // （宏展开跨 crate 的已知噪音，非本仓库代码）——桌面 crate 自身要能
        // 过 -D warnings gate，必须在这里压掉。
        #[allow(unexpected_cfgs)]
        let win_num: i64 = unsafe { msg_send![ns_window, windowNumber] };
        let status = std::process::Command::new("screencapture")
            .args(["-x", "-c", "-o", &format!("-l{}", win_num)])
            .status()
            .map_err(|e| e.to_string())?;
        if !status.success() {
            return Err("screencapture 失败".to_string());
        }
        Ok(())
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = app;
        Err("截图功能目前只支持 macOS".to_string())
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .manage(SyncLock(Mutex::new(())))
        .manage(SyncRequests(Mutex::new(std::collections::BTreeMap::new())))
        // fold 事件去抖状态：tick/手动线程共享（见 FoldEventDebounce 注释）。
        .manage(FoldEventDebounce(Mutex::new(None)))
        // 菜单信息行导航目标：菜单点击 → 工作台（见 NavTarget 注释）。
        .manage(NavTarget(Mutex::new(None)))
        // 会话深链待消费目标（spec §7.2）：菜单 L2 → 工作台详情。与 NavTarget
        // 并存——不同维度（会话目标 vs tab 名），见 FocusTarget 注释。
        .manage(FocusTarget(Mutex::new(None)))
        // 最近一次菜单构建用的宿主行（spec §9.2 #12 映射依据，见 build_menu_at）。
        .manage(HostsCache(Mutex::new(Vec::new())))
        // R2a 冷构建串行锁：后台预热与用户点击并发 spawn CLI 时，后到者等锁 →
        // 直接命中 cache（见 store.rs StoreBuildLock 注释）。
        .manage(store::StoreBuildLock::new())
        // Skill 体检 tab 的扫描缓存 + 取消把手（store.rs SkillsScanState 注释）。
        .manage(store::SkillsScanState::new())
        .on_window_event(|window, event| {
            // 工作台 × 按钮 → 隐藏不销毁。config-created 窗口被 × 关掉会 destroy，
            // 之后 reopen 是 no-op（get_webview_window 返回 None）；hide 保状态——
            // 当前 tab/月/分页游标都在，再开就是上次的样子。
            if let WindowEvent::CloseRequested { api, .. } = event {
                if window.label() == "workbench" {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            read_overview,
            data_status,
            billing_import_candidates,
            billing_confirmation_groups,
            resolve_billing_import_candidate,
            save_billing_declaration_revision,
            billing_declarations,
            revoke_billing_declaration,
            billing_candidate_impact_preview,
            custom_source_roots,
            pick_custom_source_root,
            add_custom_source_root,
            remove_custom_source_root,
            source_host_controls,
            source_read_locations,
            set_source_host_excluded,
            delete_imported_source_data,
            retention_config,
            save_retention_config,
            statistics_timezone_config,
            save_statistics_timezone_config,
            public_pricing_catalog_status,
            save_public_pricing_catalog_policy,
            update_public_pricing_catalog,
            restore_authority_backup,
            export_diagnostic_package,
            about_diagnostics,
            check_for_updates,
            open_trusted_releases_page,
            budget_config,
            budget_profiles_status,
            save_budget_profile,
            save_budget_config,
            snooze_budget_until,
            snooze_budget_current_period,
            clear_budget_snooze,
            official_price_card,
            mcp_setup_info,
            mcp_skill_text,
            export_mcp_skill,
            save_host_bill,
            save_host_bills,
            host_bills_for_period,
            delete_host_bill,
            enqueue_billing_recalculation,
            retry_billing_recalculation,
            billing_recalculation_job_status,
            billing_recalculation_jobs,
            sync_pause_state,
            set_sync_paused,
            data_source_status,
            data_monthly_summary,
            data_daily_summary,
            data_codex_quota,
            data_claude_quota,
            quota_reminder_config,
            price_cards,
            save_price_card,
            delete_price_card,
            price_routes,
            save_price_route,
            delete_price_route,
            save_quota_reminder_config,
            read_calendar_month,
            read_hourly_distribution,
            trigger_sync,
            sync_request_status,
            session_trace,
                store::probe_routes_list,
                store::probe_current_hint,
                store::routes_quality,
            store::probe_run_start,
            store::probe_run_result,
            store::probe_report,
        store::sessions_list,
            store::sessions_read,
            store::sessions_findings,
            store::sessions_issues,
            store::decision_matrix,
            findings_freshness,
            store::skills_doctor_report,
            store::skills_scan_cancel,
            store::skills_snapshot_save,
            store::skills_diff_latest,
            store::skills_export_pick_path,
            store::skills_export_redacted,
            store::skills_scan_settings,
            store::save_skills_scan_settings,
            store::issue_transition,
            store::issue_groups_list,
            store::issue_group_instances,
            store::issue_instance_read,
            peek_nav_target,
            clear_nav_target,
            focus_session,
            peek_focus_target,
            clear_focus_target,
            focus_budget_from_notification,
            capture_workbench_screenshot,
        ])
        .setup(|app| {
            if let Err(error) = agent_vitals_runtime::statistics_timezone::apply(
                &overview::data_home(),
            ) {
                eprintln!("statistics timezone unavailable: {error}");
            }
            start_public_pricing_catalog_tick();
            // 菜单栏工具：必须在代码里显式 `.accessory`，光靠 Info.plist 的 LSUIElement
            // 不够——tao 的事件循环启动时会显式 setActivationPolicy(Regular) 把 plist
            // 值盖掉（2026-09-14：删掉这行改用 plist 后，release 包 open 起来鸟头落进
            // Dock、状态栏项不出现）。skipTaskbar/visible:false 只藏窗口，藏不住进程
            // 的 Dock 图标。show_workbench 已负责 show+set_focus，accessory 下窗口照常成为 key。
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);
            recover_billing_recalculations(
                agent_vitals_data::authority::default_authority_path(&overview::data_home()),
            );
            let authority_path = agent_vitals_data::authority::default_authority_path(&overview::data_home());
            match agent_vitals_data::authority::AuthorityDb::open(
                &authority_path,
                agent_vitals_runtime::sql_sync::now_ms(),
            ) {
                Ok(db) => {
                    if let Err(error) = agent_vitals_data::issues::repair_issue_timestamp_units(db.conn()) {
                        eprintln!("issue timestamp migration failed: {error}");
                    }
                }
                Err(error) => eprintln!("issue timestamp migration database unavailable: {error}"),
            }
            let ov = overview::read_overview();
            let menu = build_menu(app.handle(), &ov)?;
            TrayIconBuilder::with_id("main")
                .icon(tray_template_icon()?)
                .icon_as_template(true)
                .title(today_title(&ov))
                .menu(&menu)
                .show_menu_on_left_click(true)
                .on_menu_event(|app, event| {
                    let id = event.id().as_ref();
                    match id {
                        "workbench" => show_workbench(app),
                        "refresh" => sync_now(app),
                        _ => {
                            let hosts = app
                                .state::<HostsCache>()
                                .0
                                .lock()
                                .unwrap_or_else(|e| e.into_inner())
                                .clone();
                            if let Some(target) = workbench_target_for_menu_id(id, &hosts) {
                                focus_session_target(app, target);
                            } else if let Some(tab) = tab_for_menu_id(id) {
                                focus_tab(app, tab);
                            }
                        }
                    }
                })
                .build(app)?;
            start_refresh_tick(app.handle().clone());
            let args: Vec<String> = std::env::args().collect();
            if should_show_workbench_on_start(&ov.sync, &args) {
                show_workbench(app.handle());
            }
            // SQL 权威库后台预热：app 启动就 spawn 一轮 data-status（sub-second）
            // 让权威库 SQLite handle + page cache 在用户点会话/findings tab 之前
            // 就绪，避免首点 PRAGMA / planner 抖动（见 warm_authority_db 函数注释）。
            warm_authority_db(app.handle());
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running agent-vitals menubar");
}

#[cfg(test)]
mod tests {
    use super::*;

    /// 规格 R6：「接受」不再是候选的直接决定——它曾经只翻状态、不归因、不重算，
    /// 用户以为确认了而数字没变。dismiss/reopen 照旧。
    #[test]
    fn candidate_accept_is_no_longer_a_direct_decision() {
        assert!(candidate_decision_status("accept").is_err());
        assert_eq!(candidate_decision_status("dismiss"), Ok("dismissed"));
        assert_eq!(candidate_decision_status("reopen"), Ok("pending"));
        assert!(candidate_decision_status("approve").is_err());
    }

    /// 规格 R4 + B3（2026-09-16 起结束日期改为选填）：`unknown` 不是声明；起始必填
    /// 且真实存在；结束留空＝开放到未来，填了则不早于起始、不晚于今天。
    #[test]
    fn desktop_declaration_is_bounded_when_dated_and_open_ended_when_blank() {
        // `unknown` 永远不是声明；起始必须是一个真实存在的日期。
        assert!(validate_desktop_declaration("unknown", "2026-07", Some("2026-09-30")).is_err());
        assert!(validate_desktop_declaration("official_api", "", None).is_err());
        assert!(validate_desktop_declaration("official_api", "2026-13-01", None).is_err());
        assert!(validate_desktop_declaration("official_api", "2026-07", None).is_ok());
        // 结束是选填的：None / 空串 / 纯空白都表示「持续有效」（按量充值没有结束日）。
        assert!(validate_desktop_declaration("official_subscription", "2026-07-01", None).is_ok());
        assert!(validate_desktop_declaration("official_subscription", "2026-07-01", Some("")).is_ok());
        assert!(validate_desktop_declaration("official_subscription", "2026-07-01", Some("  ")).is_ok());
        // 填了就必须是一段真实可行的区间：不早于起始、不晚于今天（北京时间）。
        assert!(validate_desktop_declaration("official_subscription", "2026-08-15", Some("2026-08-14")).is_err());
        assert!(validate_desktop_declaration("official_subscription", "2026-07-01", Some("2026-10-01")).is_err());
        assert!(validate_desktop_declaration("official_subscription", "2026-07-01", Some("2026-09-15")).is_ok());
        assert!(validate_desktop_declaration("organization", "2026-09-01", Some("2026-09-15")).is_ok());
    }

    #[test]
    fn independent_sync_stages_continue_after_source_failure() {
        let called = std::cell::RefCell::new(Vec::new());
        let (status, ready) = finish_sync_stages(
            SyncStatus::fail("discover", "DSH unavailable".into()),
            || { called.borrow_mut().push("claude"); Some("permission denied".into()) },
            || { called.borrow_mut().push("facts"); None },
        );
        assert_eq!(*called.borrow(), vec!["claude", "facts"]);
        assert!(!status.ok);
        assert_eq!(status.stage, "partial");
        assert!(status.message.contains("DSH unavailable"));
        assert!(status.message.contains("permission denied"));
        assert!(ready);
    }

    #[test]
    fn first_value_workspace_only_opens_before_any_sync_receipt() {
        assert!(should_show_first_value_workspace(&SyncStatus::fail("never", "尚未同步".into())));
        assert!(!should_show_first_value_workspace(&SyncStatus::ok("discover", "no records".into())));
        assert!(!should_show_first_value_workspace(&SyncStatus::fail("partial", "disk full".into())));
    }

    #[test]
    fn independent_sync_stages_retain_facts_failure() {
        let (status, ready) = finish_sync_stages(
            SyncStatus::ok("discover", "no DSH records".into()),
            || None,
            || Some("disk full".into()),
        );
        assert!(!status.ok);
        assert!(status.message.contains("sync-facts: disk full"));
        assert!(!ready);
    }

    #[test]
    fn independent_sync_stages_preserve_success_status() {
        let (status, ready) = finish_sync_stages(
            SyncStatus::ok("fold", "imported".into()), || None, || None,
        );
        assert!(status.ok);
        assert_eq!(status.stage, "fold");
        assert!(ready);
    }

    #[test]
    fn source_status_applies_real_scanner_failure_only_to_named_host() {
        let mut report = serde_json::json!({ "sources": [
            { "host": "claude-code", "connection_state": "connected", "failed_scope": {} },
            { "host": "codex", "connection_state": "connected", "failed_scope": {} },
            { "host": "dsh", "connection_state": "not_detected", "failed_scope": {} }
        ]});
        let sync = SyncStatus::fail("partial", "DSH permission denied".into());
        merge_source_sync_failure(&mut report, &sync);
        assert_eq!(report["sources"][0]["connection_state"], "connected");
        assert_eq!(report["sources"][1]["connection_state"], "connected");
        assert_eq!(report["sources"][2]["connection_state"], "needs_attention");
        assert_eq!(report["sources"][2]["failed_scope"]["sync"]["stage"], "partial");
        assert_eq!(report["sources"][2]["failed_scope"]["sources"], 1);
        assert_eq!(report["sources"][2]["failed_scope"]["error_codes"], serde_json::json!(["permission_denied"]));
    }

    #[test]
    fn source_status_applies_unscoped_facts_failure_to_all_hosts() {
        let mut report = serde_json::json!({ "sources": [
            { "host": "claude-code", "connection_state": "connected", "failed_scope": {} },
            { "host": "codex", "connection_state": "connected", "failed_scope": {} },
            { "host": "dsh", "connection_state": "connected", "failed_scope": {} }
        ]});
        merge_source_sync_failure(&mut report, &SyncStatus::fail("facts", "disk full".into()));
        assert!(report["sources"].as_array().unwrap().iter()
            .all(|s| s["connection_state"] == "needs_attention"));
    }

    /// Stage 0.6 的 Data Query API 面是薄转发，但"薄"也要钉住：DTO 与 CLI
    /// `data coverage` 同一份 `to_json()`（四宿主 by_host——WorkBuddy 自 E4b 起
    /// 接线，只有 token 没有金额，见 docs/WORKBUDDY_ONBOARDING_SPEC.md §9E.5——
    /// excluded 空 + coverage 4/4），托盘侧不许长出第二种形状。真机结构性断言
    /// （金额值随机器变，形状不随）。
    #[test]
    fn data_monthly_summary_dto_matches_the_frozen_contract_shape() {
        let d = data_monthly_summary(overview::current_month_beijing());
        let keys: Vec<&String> = d["by_host"].as_object().unwrap().keys().collect();
        assert_eq!(keys, ["claude-code", "codex", "dsh", "workbuddy"]);
        assert_eq!(d["excluded_hosts"], serde_json::json!([]));
        assert_eq!(d["coverage"]["measured_fields"], 4);
        assert_eq!(d["coverage"]["total_fields"], 4);
        // WorkBuddy 行永远没有金额（三轨请求级不可判，§2.1）。
        assert_eq!(d["by_host"]["workbuddy"]["amounts_by_basis"], serde_json::json!({}));
        // 冻结契约的三条不变式之一在托盘侧同样成立：excluded 与 by_host 不相交。
        for host in d["excluded_hosts"].as_array().unwrap() {
            assert!(d["by_host"].get(host.as_str().unwrap()).is_none());
        }
    }

    /// Stage D 决策卡的数据面：`data_codex_quota` 返回 plan 快照原样
    /// （`plan_type` 必在——本机 Codex 60 份 rollout 全带 ChatGPT plan 字段）
    /// 或 null（无 rollout/无 plan 事件，不得编造余量）。函数级断言；invoke
    /// 路由由真实 app 的决策卡目视验收。
    #[test]
    fn data_codex_quota_returns_plan_snapshot_or_null() {
        let q = data_codex_quota();
        if let Some(p) = q {
            assert!(p.get("plan_type").and_then(|v| v.as_str()).is_some(),
                    "plan 快照缺 plan_type: {p}");
        }
        // null 分支 = 无证据，同样合法（不得编造）。
    }

    /// Token 日历的跨宿主数据面（真机形状）：本机 2026-09 claude/codex 有
    /// 真实用量（DSH 才全零），日历聚合不得全零；钱的键分币齐全。
    #[test]
    fn read_calendar_month_is_cross_host_not_dsh_only() {
        let v = read_calendar_month(overview::current_month_beijing());
        let days = v["days"].as_object().expect("days map");
        let total: i64 = days.values().map(|d| d["total_tokens"].as_i64().unwrap_or(0)).sum();
        assert!(total > 0, "本机 2026-09 claude/codex 有真实用量，日历不得全零（got {total}）");
        // 有用量的日子 token 与钱键齐全（分币），形状=日历格子渲染的输入。
        for (date, d) in days {
            assert!(d.get("dsh_tokens").is_some() && d.get("claude_tokens").is_some()
                && d.get("codex_tokens").is_some(), "{date} 缺宿主 token 键");
            assert!(d.get("dsh_cost_cny").is_some() && d.get("claude_cost_cny").is_some()
                && d.get("claude_cost_usd").is_some() && d.get("codex_cost_usd").is_some(),
                "{date} 缺分币耗费键");
        }
    }

    /// 当日按小时（旧 calendar.html 小时格组件接入）的数据面：真机形状 +
    /// 跨面守恒。codex 的小时来自 fold by_hour_model（全量历史），日历格里
    /// 同一天的 codex_tokens 来自同一 fold 的 by_model——小时和 ≤ 日总量
    /// （无时间样本的量只在 by_model，usage.rs 头注释），且来源标注合法。
    #[test]
    fn read_hourly_distribution_matches_calendar_codex_day() {
        let month = overview::current_month_beijing();
        let cal = read_calendar_month(month.clone());
        let days = cal["days"].as_object().expect("days map");
        // 找一个 codex 有用量的日子（本机 2026-09 codex 3.27 亿 token，必有）。
        let (date, day_row) = days.iter()
            .find(|(_, d)| d["codex_tokens"].as_i64().unwrap_or(0) > 0)
            .map(|(k, v)| (k.clone(), v.clone()))
            .expect("本机当月必有 codex 用量日");
        let v = read_hourly_distribution(date.clone());
        assert_eq!(v["date"], serde_json::json!(date));
        let hours = v["hours"].as_array().expect("hours array");
        assert_eq!(hours.len(), 24, "24 小时全量输出（空小时 = null，不裁剪）");
        // 小时轴之和 ≤ 日历日总量（差 = 无时间样本，usage.rs 诚实缺口）。
        let hour_sum: i64 = hours.iter()
            .map(|h| h["codex_tokens"].as_i64().unwrap_or(0)).sum();
        let cal_total = day_row["codex_tokens"].as_i64().unwrap_or(0);
        assert!(hour_sum <= cal_total,
                "codex 小时和 {hour_sum} 不得超过日历日总量 {cal_total}");
        assert!(hour_sum > 0, "codex 用量日的小时图不得全空（fold 全量历史）");
        // 来源标注合法（消费方按这个渲染覆盖面提示）。Phase 3.5 Tier B：
        // 三宿主统一 `sql-facts`（hourly_distribution 切权威库后唯一来源）。
        let src = &v["hosts_available"];
        assert_eq!(src["codex"], serde_json::json!("sql-facts"), "codex 来源切 SQL 后统一标注");
        assert!(src["dsh"].is_null() || src["dsh"] == "sql-facts",
                "dsh 来源非法: {src}");
        assert!(src["claude"].is_null() || src["claude"] == "sql-facts",
                "claude 来源非法: {src}");
    }

    fn ov_with(budget: overview::BudgetAlert) -> Overview {
        Overview {
            data_home: "/tmp".into(),
            today: None,
            month: serde_json::json!({"total": 0.0}),
            days: vec![],
            budget_monthly_cny: Some(600.0),
            budget,
            budget_profiles: None,
            metered_today: None,
            metered_month: None,
            today_tokens_sql: None,
            recent: overview::RecentSession::default(),
            sync: SyncStatus::default(),
            hosts: vec![
                overview::HostRow::unavailable("dsh"),
                overview::HostRow::unavailable("codex"),
                overview::HostRow::unavailable("claude-code"),
            ],
            hosts_generated_at: None,
            estimate_note: String::new(),
            claude_today: None,
            claude_month: None,
            claude_today_tokens: None,
            claude_uncovered_month: None,
            month_savings: None,
            // 镜像 read_overview 在真机上的产物（pricing.json 有 fx_estimate 节）：
            // 速览层混币折算按此汇率。`fx: None` 的降级路径由专门用例钉。
            fx: Some(serde_json::json!({"usd_cny": 7.15, "as_of": "2026-09"})),
            subscription_cny_month: None,
        }
    }

    #[test]
    fn today_title_is_tokens_only_and_aligned_with_kpi() {
        // 用户定向 2026-09-17：标题 = 「鸟头 + 64.4M」，不带价格；数字与工作台
        // 「今日消耗」KPI 同源（SQL daily DTO），库缺席退回旧合并。
        let mut ov = ov_with(overview::BudgetAlert::default());
        assert_eq!(today_title(&ov), "—", "无今日数据不得臆造 0");
        ov.today_tokens_sql = Some(64_400_000);
        assert_eq!(today_title(&ov), "64.4M");
        // 有钱也不进标题。
        ov.metered_today = Some(serde_json::json!({ "CNY": { "amount": 41.77, "actual": 0.0, "declared_estimate": 41.77, "default_estimate": 0.0, "label": "estimate" } }));
        assert_eq!(today_title(&ov), "64.4M");
        assert_eq!(today_tokens_row_text(&ov), "今日消耗：64.4M tokens");
        // SQL 缺席：退回 DSH state + claude ledger 合并。
        let mut legacy = ov_with(overview::BudgetAlert::default());
        legacy.today = Some(serde_json::json!({"total": 12.34, "tokens": 1_398_214}));
        legacy.claude_today_tokens = Some(100_000);
        assert_eq!(today_title(&legacy), "1.5M");
        // SQL 报「今天 0」是事实：标题「—」（不是缺席，但也不摆 0）。
        let mut zero = ov_with(overview::BudgetAlert::default());
        zero.today_tokens_sql = Some(0);
        zero.claude_today_tokens = Some(100_000);
        assert_eq!(today_title(&zero), "—");
    }

    /// 本月订阅行（PM 决策 2026-09-07）：有 CNY 订阅 → 单列「已付、不计入按量
    /// 预算」；无订阅 → None（整行不显示，不摆 ¥0）。
    #[test]
    fn subscription_line_shows_paid_note_or_hides() {
        let mut ov = ov_with(overview::BudgetAlert::default());
        assert_eq!(subscription_line_text(&ov), None, "无订阅 → 整行不显示");
        ov.subscription_cny_month = Some(232.0);
        assert_eq!(
            subscription_line_text(&ov).unwrap(),
            "本月订阅：¥232（已付，不计入按量预算）"
        );
        ov.subscription_cny_month = Some(0.0); // (total>0).then_some 保证不会是这个，防御性
        assert_eq!(subscription_line_text(&ov), Some("本月订阅：¥0（已付，不计入按量预算）".into()));
    }

    #[test]
    fn fmt_tokens_abbreviates_large_counts() {
        assert_eq!(fmt_tokens(0), "0");
        assert_eq!(fmt_tokens(999), "999");
        assert_eq!(fmt_tokens(8238), "8.2K");
        assert_eq!(fmt_tokens(10000), "10K");
        assert_eq!(fmt_tokens(1398214), "1.4M");
    }

    #[test]
    fn short_model_strips_provider_prefix_only() {
        assert_eq!(short_model("deepseek/deepseek-v4-pro-0813"), "deepseek-v4-pro-0813");
        assert_eq!(short_model("deepseek-v4-flash"), "deepseek-v4-flash");
        // 版本尾巴保留——砍掉它，两个不同版本在菜单里就长得一模一样了。
        assert_ne!(short_model("a/m-0813"), short_model("a/m-0901"));
    }

    /// 日预算行的分子/百分比只在「今天真有数据 + alert 新鲜」时出现。这条钉的是
    /// 真机 2026-09-01 的形态：today.json 停在昨天（`ov.today` 为 None），
    /// alert.json 仍报着上一次评估的 today_cost —— 菜单绝不能同时说
    /// 「今日成本：—（无数据）」和「今日按量预算：¥0.12 / ¥30（0%）」。
    #[test]
    fn daily_budget_line_hides_numerator_when_today_has_no_data() {
        let ov = ov_with(overview::BudgetAlert {
            source: "alert".into(),
            level: Some("ok".into()),
            effective_daily_budget: Some(30.0),
            today_cost: Some(0.1224042),
            ratio: Some(0.00408014),
            generated_at: Some(FIXTURE_AT.into()),
            ..Default::default()
        });
        assert!(ov.today.is_none());
        assert_eq!(
            daily_budget_text(&ov, FIXTURE_AT_SECS).unwrap(),
            "今日按量预算：— / ¥30（今日无数据）",
            "今天没有数据时，alert.json 里那个属于别的一天的 today_cost 不得冒充今日"
        );
    }

    /// 今天有数据 + alert 新鲜 → 显示权威分子与百分比（`ratio` 直接来自
    /// alert.json，不是 today_cost/daily 自算——那是 D2 缺口）。
    #[test]
    fn daily_budget_line_uses_alert_ratio_when_fresh_and_today_has_data() {
        let mut ov = ov_with(overview::BudgetAlert {
            source: "alert".into(),
            level: Some("warn".into()),
            effective_daily_budget: Some(30.0),
            today_cost: Some(24.0),
            // 故意不等于 24/30=80%：证明这里读的是 alert 的 ratio，没有自算。
            ratio: Some(0.93),
            generated_at: Some(FIXTURE_AT.into()),
            ..Default::default()
        });
        ov.today = Some(serde_json::json!({"total": 24.0, "peak_total": 0.0, "tokens": 100}));
        assert_eq!(daily_budget_text(&ov, FIXTURE_AT_SECS).unwrap(), "今日按量预算：¥24 / ¥30（93%）");
    }

    /// alert 过期时不报旧的分子/百分比，只留分母（分母是设置，不是测量值，过期
    /// 的设置仍然是当前设置）。
    #[test]
    fn daily_budget_line_drops_stale_numerator_but_keeps_the_setting() {
        let mut ov = ov_with(overview::BudgetAlert {
            source: "alert".into(),
            level: Some("ok".into()),
            effective_daily_budget: Some(30.0),
            today_cost: Some(24.0),
            ratio: Some(0.8),
            generated_at: Some(FIXTURE_AT.into()),
            ..Default::default()
        });
        ov.today = Some(serde_json::json!({"total": 24.0, "peak_total": 0.0, "tokens": 100}));
        assert_eq!(
            daily_budget_text(&ov, FIXTURE_AT_SECS + 3600).unwrap(),
            "今日按量预算：— / ¥30（数据过期，未重新评估）"
        );
    }

    /// 没有 alert.json（拿不到日预算这个设置）→ 整行不显示，不空占一行；预算行
    /// 本身已经说了「等预算数据」。
    #[test]
    fn daily_budget_line_absent_without_alert() {
        let ov = ov_with(overview::BudgetAlert { source: "missing".into(), ..Default::default() });
        assert!(daily_budget_text(&ov, FIXTURE_AT_SECS).is_none());
    }

    /// host 显示名映射（spec §4）：dsh → DeepSeek Harness、codex → Codex、
    /// claude-code → Claude Code（第三宿主行，D5）；未知宿主原样显示（未来加宿主
    /// 不硬编码）。
    #[test]
    fn host_display_name_maps_three_hosts_and_unknown() {
        assert_eq!(host_display_name("dsh"), "DeepSeek Harness");
        assert_eq!(host_display_name("codex"), "Codex");
        assert_eq!(host_display_name("claude-code"), "Claude Code");
        assert_eq!(host_display_name("future-host"), "future-host");
    }

    /// v0.6 host-contract spec §6/§11-M3：改从 `HOSTS` 行派生后，WorkBuddy
    /// 也能正确解析——它没有托盘行（`fold: None`），但工作台的会话浏览面
    /// 一直支持它，展示名不该因为没有折叠能力就缺席。
    #[test]
    fn host_display_name_resolves_workbuddy_even_though_it_has_no_tray_row() {
        assert_eq!(host_display_name("workbuddy"), "WorkBuddy");
    }

    /// 合并按量总账金额主段（v1.3，spec §3.1/§4）真值表。核心语义：
    /// · CNY = DSH 实测 + Claude catalog 估 相加，任何估分量并入 → 整段 `≈`；
    /// · 纯 DSH 段（claude 无价流）实测精度、不带 ≈——同一笔实测 ¥ 不标成估；
    /// · anthropic USD：**有 fx_estimate 汇率 → 按率折进 ¥ 主账（带 ≈，hover 展开
    ///   原始分币）**（PM 决策 2026-09-07 速览层便利，非口径）；**无汇率 → 退回
    ///   旧行为**（USD 不进 ¥ 主账，只在整行没有 ¥ 侧时单独浮出 ≈$）；
    /// · 两币皆无 → None（调用方渲染 —，不摆 ¥0）。
    /// 2026-09-17：归因把钱搬进 metered_declared 后托盘变「今日 —」——标题/两行改读 SQL
    /// 的 metered_view，旧拼法只做兜底。
    #[test]
    fn metered_view_text_prefers_sql_view_and_marks_estimates() {
        let r = Some(7.15);
        let est = serde_json::json!({ "CNY": { "amount": 41.77, "actual": 0.0, "declared_estimate": 41.77, "default_estimate": 0.0, "label": "estimate" } });
        assert_eq!(metered_view_text(Some(&est), r), Some("≈¥41.77".to_string()));
        let actual = serde_json::json!({ "CNY": { "amount": 12.34, "actual": 12.34, "declared_estimate": 0.0, "default_estimate": 0.0, "label": "actual" } });
        assert_eq!(metered_view_text(Some(&actual), r), Some("¥12.34".to_string()));
        let mixed = serde_json::json!({
            "CNY": { "amount": 10.0, "actual": 10.0, "declared_estimate": 0.0, "default_estimate": 0.0, "label": "actual" },
            "USD": { "amount": 2.0, "actual": 0.0, "declared_estimate": 2.0, "default_estimate": 0.0, "label": "estimate" } });
        assert_eq!(metered_view_text(Some(&mixed), r), Some("≈¥24.3".to_string()), "USD 折进主账后整段带 ≈");
        let usd_only = serde_json::json!({ "USD": { "amount": 3.0, "actual": 0.0, "declared_estimate": 3.0, "default_estimate": 0.0, "label": "estimate" } });
        assert_eq!(metered_view_text(Some(&usd_only), None), Some(format!("≈{}", fmt_usd(3.0))), "无汇率时 USD 单独浮出");
        assert_eq!(metered_view_text(Some(&serde_json::json!({})), r), None, "视图为空 → 调用方写「—」");
        assert_eq!(metered_view_text(None, r), None, "旧载荷 → 退回旧拼法");
    }

    /// 设置 › MCP 的 SKILL.md：frontmatter 合法（name/description 两行、`---` 围栏），
    /// 工具清单来自运行时 `tool_specs()`（每个注册的工具都出现，页面不手抄）。
    #[test]
    fn mcp_skill_markdown_has_frontmatter_and_every_tool() {
        let md = mcp_skill_markdown();
        assert!(md.starts_with("---\nname: agent-vitals-mcp\ndescription: "), "frontmatter 开头");
        let fence_end = md[4..].find("\n---\n").expect("frontmatter 围栏闭合") + 4;
        let front = &md[..fence_end];
        assert_eq!(front.matches("\ndescription: ").count(), 1);
        for t in agent_vitals_runtime::mcp::tool_specs() {
            assert!(md.contains(&format!("- `{}` — ", t.name)), "工具 {} 不在清单里", t.name);
        }
        assert!(md.contains("data-mcp serve --allow-local-writes"));
        assert!(md.contains("Never invent prices"), "诚实规则必须在");
    }

    #[test]
    fn metered_amount_truth_table() {
        let r = Some(7.15); // fx_estimate.USD_CNY
        // 纯 DSH 实测：claude 无价流 → 不带 ≈（实测不标成估）；含测到 0。
        assert_eq!(metered_amount(Some(12.34), 0.0, 0.0, r), Some("¥12.34".to_string()));
        assert_eq!(metered_amount(Some(0.0), 0.0, 0.0, r), Some("¥0".to_string()));
        // DSH 缺场 + claude CNY 估 → 估占主导，≈¥X。
        assert_eq!(metered_amount(None, 37.17, 0.0, r), Some("≈¥37.17".to_string()));
        // 混合：DSH 实测 ¥12.34 + claude 估 ¥6 → 相加 + ≈（含估分量）。
        assert_eq!(metered_amount(Some(12.34), 6.0, 0.0, r), Some("≈¥18.34".to_string()));
        assert_eq!(metered_amount(Some(0.0), 6.0, 0.0, r), Some("≈¥6".to_string()));

        // ── USD 折算（PM 决策 2026-09-07：速览层有汇率 → 折进 ¥ 主账，带 ≈）──
        // 纯 anthropic USD 日、DSH 缺场：3 × 7.15 = 21.45 折进主账。
        assert_eq!(metered_amount(None, 0.0, 3.0, r), Some("≈¥21.45".to_string()));
        // CNY 侧有内容（DSH 测到 ¥0）+ USD → 不再丢 USD：¥0 + 21.45。
        assert_eq!(metered_amount(Some(0.0), 0.0, 3.0, r), Some("≈¥21.45".to_string()));
        // DSH 实测 + claude USD → 全部折成一个 ≈¥（12.34 + 21.45 = 33.79）。
        assert_eq!(metered_amount(Some(12.34), 0.0, 3.0, r), Some("≈¥33.79".to_string()));
        // 三分量齐：DSH 实 + claude CNY 估 + claude USD 折。
        assert_eq!(metered_amount(Some(12.34), 6.0, 3.0, r), Some("≈¥39.79".to_string()));

        // ── 无汇率（价表无 fx_estimate 节）→ 退回分币旧行为 ──
        // USD 只在没有任何 ¥ 侧时单独浮出；有 ¥ 侧则 USD 被丢弃（混币不能相加）。
        assert_eq!(metered_amount(None, 0.0, 3.0, None), Some("≈$3".to_string()));
        assert_eq!(metered_amount(Some(0.0), 0.0, 3.0, None), Some("¥0".to_string()));
        assert_eq!(metered_amount(Some(12.34), 0.0, 3.0, None), Some("¥12.34".to_string()));

        // 两币皆无 → None，不摆 ¥0。
        assert_eq!(metered_amount(None, 0.0, 0.0, r), None);
        assert_eq!(metered_amount(None, 0.0, 0.0, None), None);
        // 数字走 fmt_money/fmt_usd 同款修剪。
        assert_eq!(metered_amount(None, 200.0, 0.0, r), Some("≈¥200".to_string()));
        assert_eq!(metered_amount(None, 0.0, 0.52, None), Some("≈$0.52".to_string()));
    }

    /// claude_currency 读报告的 currency_totals 单侧金额：缺场/该币键缺场/值非数
    /// → 0.0。坏数据不 panic。
    #[test]
    fn claude_currency_reads_one_side_of_the_report() {
        let none: Option<Value> = None;
        assert_eq!(claude_currency(&none, "CNY"), 0.0);
        assert_eq!(claude_currency(&none, "USD"), 0.0);
        let r = Some(serde_json::json!({"currency_totals": {"CNY": 6.0}}));
        assert_eq!(claude_currency(&r, "CNY"), 6.0);
        assert_eq!(claude_currency(&r, "USD"), 0.0);
        // currency_totals 缺场（坏数据）→ 0，不 panic。
        assert_eq!(claude_currency(&Some(serde_json::json!({"days": 3})), "CNY"), 0.0);
    }

    /// 账卡两行（money_rows_text）：真机那天（2026-09-02）的三种形态逐格钉住——
    /// 这是用户直接看的文案，字符串本身必须有测试，不能只靠人工核对。
    #[test]
    fn money_rows_merge_dsh_and_claude_never_say_no_data_when_metered() {
        // ① 真机形态：DSH 空转（今日 None）+ Claude deepseek 全在账 → 合并 ≈¥，token
        // 全量并排。这正是用户报「按量成本无数据」的那天——修复后必须是有数的。
        let mut ov = ov_with(overview::BudgetAlert::default());
        ov.claude_today = Some(serde_json::json!({"currency_totals": {"CNY": 37.17, "USD": 0.0}}));
        ov.claude_today_tokens = Some(188_213_789);
        ov.claude_month = Some(serde_json::json!({"currency_totals": {"CNY": 106.1, "USD": 0.0}}));
        let (today, month) = money_rows_text(&ov);
        assert_eq!(today, "今日按量成本：≈¥37.17");
        assert_eq!(month, "本月按量成本：≈¥106.1", "DSH 本月无日键 → 纯 claude 估主导");
        // ② 纯 DSH 日（claude 无 CNY 价流）：实测精度，无 ≈；月行带实测 ¥。
        ov = ov_with(overview::BudgetAlert::default());
        ov.today = Some(serde_json::json!({"total": 12.34, "tokens": 1_398_214}));
        ov.month = serde_json::json!({"total": 612.5});
        ov.days = vec![overview::DayRow {
            date: "2026-09-01".into(),
            total: 612.5,
            peak_total: 0.0,
            basis: None,
            coverage: None,
        }];
        let (today, month) = money_rows_text(&ov);
        assert_eq!(today, "今日按量成本：¥12.34");
        assert_eq!(month, "本月按量成本：¥612.5", "分母已移除——预算只活在底部预算行");
        // ③ 两宿主今天都无按量钱 → 今日诚实的 —；本月空 → ¥0 兜底。
        let ov = ov_with(overview::BudgetAlert::default());
        let (today, month) = money_rows_text(&ov);
        assert_eq!(today, "今日按量成本：—（无数据）");
        assert_eq!(month, "本月按量成本：¥0");
    }

    /// fmt_usd 与 fmt_money 同修剪 spec：整美元不拖 `.0`，小数保留非零尾。
    #[test]
    fn fmt_currency_symbols_share_trim_spec() {
        assert_eq!(fmt_usd(28.0), "$28");
        assert_eq!(fmt_usd(0.52), "$0.52");
        assert_eq!(fmt_usd(123.4), "$123.4");
        assert_eq!(fmt_money(6.0), "¥6");
        assert_eq!(fmt_money(0.05), "¥0.05");
    }

    /// L1 宿主行（spec §4/§8 矩阵逐格）：完整 → `显示名 · token · N 会话`；
    /// 全缺 → 单个 `· —`（unavailable 形态）；只缺一个 → 该槽位「—」；
    /// partial 覆盖率 → token 加 `≈` 前缀（保守下界标注不能渲染成精确值）。
    #[test]
    fn host_row_text_renders_values_dashes_and_approx() {
        let full = HostRow {
            host_kind: "dsh".into(),
            status: "ready".into(),
            today_tokens: Some(1398214),
            today_partial: false,
            today_sessions: Some(3),
            recent: vec![],
        };
        assert_eq!(host_row_text(&full), "DeepSeek Harness · 1.4M · 3 会话");
        let partial = HostRow { today_partial: true, ..full.clone() };
        assert_eq!(host_row_text(&partial), "DeepSeek Harness · ≈1.4M · 3 会话");
        assert_eq!(host_row_text(&HostRow::unavailable("codex")), "Codex · —");
        let no_sessions = HostRow {
            today_tokens: Some(500),
            today_sessions: None,
            ..full.clone()
        };
        assert_eq!(host_row_text(&no_sessions), "DeepSeek Harness · 500 · —");
        let no_tokens = HostRow {
            today_tokens: None,
            today_sessions: Some(2),
            ..full.clone()
        };
        assert_eq!(host_row_text(&no_tokens), "DeepSeek Harness · — · 2 会话");
    }

    /// L2 最近会话行（spec §4）：`MM-DD · 身份 · tokens`；title 超 24 字符截断；
    /// 无 title → short_model → native_id 的 fallback 链；跨年显示完整日期；
    /// tokens 缺段省略。
    #[test]
    fn recent_row_text_formats_date_identity_and_tokens() {
        // FIXTURE_AT_SECS = 2026-08-30 → 北京年 2026。
        let row = RecentSessionRow {
            session_key: serde_json::json!({"host_kind": "dsh", "native_id": "s1"}),
            title: Some("重构 r2a 查询".into()),
            date: Some("2026-08-28".into()),
            model: Some("deepseek/deepseek-v4-flash".into()),
            tokens: Some(88000),
        };
        assert_eq!(
            recent_row_text(&row, FIXTURE_AT_SECS),
            "08-28 · 重构 r2a 查询 · 88K"
        );
        // 跨年（2025 的会话在 2026 年看）→ 完整日期，不折 MM-DD。
        let last_year = RecentSessionRow { date: Some("2025-12-31".into()), ..row.clone() };
        assert_eq!(
            recent_row_text(&last_year, FIXTURE_AT_SECS),
            "2025-12-31 · 重构 r2a 查询 · 88K"
        );
        // 超长 title（27 字符）→ 前 23 字符 + …（按字符数截，中文不会切成半个字）。
        let long = RecentSessionRow {
            title: Some("这是一个非常长的会话标题它绝对超过二十四个字符必须截断".into()),
            ..row.clone()
        };
        assert_eq!(
            recent_row_text(&long, FIXTURE_AT_SECS),
            "08-28 · 这是一个非常长的会话标题它绝对超过二十四个字符… · 88K"
        );
        // 无 title → short_model；再无 model → native_id；tokens 缺 → 省略。
        let no_title = RecentSessionRow { title: None, ..row.clone() };
        assert_eq!(recent_row_text(&no_title, FIXTURE_AT_SECS), "08-28 · deepseek-v4-flash · 88K");
        let no_model = RecentSessionRow { title: None, model: None, ..row.clone() };
        assert_eq!(recent_row_text(&no_model, FIXTURE_AT_SECS), "08-28 · s1 · 88K");
        let no_tokens = RecentSessionRow { tokens: None, ..row.clone() };
        assert_eq!(recent_row_text(&no_tokens, FIXTURE_AT_SECS), "08-28 · 重构 r2a 查询");
    }

    /// 宿主区结构（spec §4/§9.2）：固定两宿主子菜单（hosts 数组序 = dsh→codex），
    /// L2 行 id `session:{kind}:{i}` 按序编号；unavailable 宿主 → L2 单行禁用
    /// 「会话数据暂不可用」。平铺「最近会话」行已删——结构里只有宿主子菜单。
    #[test]
    fn host_menu_rows_builds_two_submenus_dsh_first() {
        let hosts = vec![
            HostRow {
                host_kind: "dsh".into(),
                status: "ready".into(),
                today_tokens: Some(15000),
                today_partial: false,
                today_sessions: Some(1),
                recent: vec![
                    RecentSessionRow {
                        session_key: serde_json::json!({"native_id": "s1"}),
                        title: Some("会话甲".into()),
                        date: Some("2026-08-28".into()),
                        model: None,
                        tokens: Some(5000),
                    },
                    RecentSessionRow {
                        session_key: serde_json::json!({"native_id": "s2"}),
                        title: Some("会话乙".into()),
                        date: Some("2026-08-27".into()),
                        model: None,
                        tokens: Some(3000),
                    },
                ],
            },
            HostRow::unavailable("codex"),
        ];
        let rows = host_menu_rows(&hosts, None, FIXTURE_AT_SECS);
        assert_eq!(rows.len(), 2);
        match &rows[0] {
            MenuRow::Submenu { id, text, rows: l2 } => {
                assert_eq!(id, "host:dsh");
                assert_eq!(text, "DeepSeek Harness · 15K · 1 会话");
                assert_eq!(
                    *l2,
                    vec![
                        MenuRow::Item {
                            id: "session:dsh:0".into(),
                            // fmt_tokens：<10K 留一位小数 → 5.0K（与既有钉住的
                            // fmt_tokens_abbreviates_large_counts 同规则）。
                            text: "08-28 · 会话甲 · 5.0K".into(),
                            enabled: true,
                        },
                        MenuRow::Item {
                            id: "session:dsh:1".into(),
                            text: "08-27 · 会话乙 · 3.0K".into(),
                            enabled: true,
                        },
                    ]
                );
            }
            other => panic!("rows[0] 应是 Submenu，实际 {other:?}"),
        }
        match &rows[1] {
            MenuRow::Submenu { id, text, rows: l2 } => {
                assert_eq!(id, "host:codex");
                assert_eq!(text, "Codex · —");
                assert_eq!(
                    *l2,
                    vec![MenuRow::Item {
                        id: "session:unavailable:codex".into(),
                        text: "会话数据暂不可用".into(),
                        enabled: false,
                    }]
                );
            }
            other => panic!("rows[1] 应是 Submenu，实际 {other:?}"),
        }
    }

    /// 降级矩阵（spec §8）：ready + 零会话 → 禁用「尚无会话」（真零不是失败——
    /// 与 unavailable 的「会话数据暂不可用」必须可区分）；stale 快照（年龄 >
    /// 2 × tick）→ 宿主子菜单底部「数据更新于 hh:mm · 可能已过期」，hh:mm 是
    /// 北京时刻（UTC +8）。
    #[test]
    fn host_menu_rows_degradation_and_stale_footer() {
        let zero = vec![HostRow {
            host_kind: "codex".into(),
            status: "ready".into(),
            today_tokens: Some(0),
            today_partial: false,
            today_sessions: Some(0),
            recent: vec![],
        }];
        let rows = host_menu_rows(&zero, None, FIXTURE_AT_SECS);
        assert_eq!(
            rows[0],
            MenuRow::Submenu {
                id: "host:codex".into(),
                text: "Codex · 0 · 0 会话".into(),
                rows: vec![MenuRow::Item {
                    id: "session:none:codex".into(),
                    text: "尚无会话".into(),
                    enabled: false,
                }],
            }
        );

        // stale 窗口 = 2 × tick = 10 分钟：+9 分钟仍新鲜、+11 分钟过期。
        let fresh_now = FIXTURE_AT_SECS + 9 * 60;
        let stale_now = FIXTURE_AT_SECS + 11 * 60;
        let hosts = vec![HostRow {
            host_kind: "dsh".into(),
            status: "ready".into(),
            today_tokens: Some(100),
            today_partial: false,
            today_sessions: Some(1),
            recent: vec![RecentSessionRow {
                session_key: serde_json::json!({"native_id": "s"}),
                title: Some("t".into()),
                date: Some("2026-08-28".into()),
                model: None,
                tokens: None,
            }],
        }];
        let fresh = host_menu_rows(&hosts, Some(FIXTURE_AT), fresh_now);
        assert!(!matches!(
            &fresh[0],
            MenuRow::Submenu { rows, .. }
                if rows.iter().any(|r| matches!(r, MenuRow::Item { id, .. } if id == "session:stale:dsh"))
        ));
        let stale = host_menu_rows(&hosts, Some(FIXTURE_AT), stale_now);
        match &stale[0] {
            MenuRow::Submenu { rows, .. } => assert_eq!(
                rows.last(),
                Some(&MenuRow::Item {
                    id: "session:stale:dsh".into(),
                    // FIXTURE_AT = 08-30 07:04:38Z → +8h = 15:04 北京。
                    text: "数据更新于 15:04 · 可能已过期".into(),
                    enabled: false,
                })
            ),
            other => panic!("stale[0] 应是 Submenu，实际 {other:?}"),
        }
    }

    /// 同步行常驻：成功时也显示（带 HH:MM），不是只在失败时才出现——用户要能一眼
    /// 看出菜单里的数字是什么时候的。
    #[test]
    fn sync_line_shows_time_on_success_not_only_on_failure() {
        let ok = SyncStatus {
            ok: true,
            stage: "discover".into(),
            message: "无未折 DSH 会话".into(),
            at: Some("2026-09-01 09:50:52".into()),
        };
        assert_eq!(sync_line_text(&ok), "上次同步：09:50 成功（DSH 折叠 + Claude 账）");
        let never = SyncStatus::default();
        assert_eq!(sync_line_text(&never), "尚未同步");
        let failed = SyncStatus {
            ok: false,
            stage: "fold".into(),
            message: "oneline 失败".into(),
            at: Some("2026-09-01 09:50:52".into()),
        };
        assert_eq!(sync_line_text(&failed), "⚠ 上次同步失败：oneline 失败");
        // at 缺场（老状态文件）也不能崩，退化成不带时间的成功。
        let ok_no_at = SyncStatus { at: None, ..ok };
        assert_eq!(sync_line_text(&ok_no_at), "上次同步：成功（DSH 折叠 + Claude 账）");
    }

    #[test]
    /// 信息行点击 → 工作台 tab 的映射钉死。today/daily/month/budget 都是总览页的
    /// 数字，sync 是数据源页；workbench/refresh 不是导航行；`recent` 已随平铺行
    /// 删除（宿主导航的 L2 深链走 WorkbenchTarget，不走 tab 映射）。
    fn tab_for_menu_id_maps_info_rows_to_workbench_tabs() {
        for id in ["today", "daily", "month", "budget", "subscription"] {
            assert_eq!(tab_for_menu_id(id), Some("overview"), "id={id} 应跳总览");
        }
        assert_eq!(tab_for_menu_id("sync"), Some("sources"));
        assert_eq!(tab_for_menu_id("today_tokens"), Some("calendar"), "首行今日消耗点击要有去处");
        assert_eq!(tab_for_menu_id("skill_health"), Some("skills"), "托盘 Skill 体检点击要有去处");
        for id in ["workbench", "refresh", "recent", "host:dsh", "session:dsh:0", "nope", ""] {
            assert_eq!(tab_for_menu_id(id), None, "id={id} 不是信息行导航");
        }
    }

    /// 夹具：alert.json 真机形态的 generated_at（2026-08-30 实测），以及用它作
    /// 「现在」的固定秒数——单测不碰系统时钟。
    const FIXTURE_AT: &str = "2026-08-30T07:04:38.548588+00:00";
    const FIXTURE_AT_SECS: i64 = 1788073478;

    /// 缺场降级：没有 alert.json 不臆造百分比，直说「等预算数据」。
    #[test]
    fn budget_line_missing_alert_is_honest() {
        let ov = ov_with(overview::BudgetAlert { source: "missing".into(), ..Default::default() });
        assert_eq!(budget_status_text_at(&ov, FIXTURE_AT_SECS), "预算：等预算数据（跑一次 oneline）");
    }

    /// over：百分比与剩余都由 alert.json 的权威字段而来，这里只是翻译成一行字。
    #[test]
    fn budget_line_over_uses_alert_authority() {
        let ov = ov_with(overview::BudgetAlert {
            source: "alert".into(),
            level: Some("over".into()),
            month_cost: Some(612.5),
            monthly_cny: Some(600.0),
            ..Default::default()
        });
        assert_eq!(budget_status_text_at(&ov, FIXTURE_AT_SECS), "🚨 预算超支：¥612.5（月 ¥600）");
    }

    /// snoozed：显示静默截止时间；月占比不显示（被静默盖过）。
    #[test]
    fn budget_line_snoozed_shows_until() {
        let ov = ov_with(overview::BudgetAlert {
            source: "alert".into(),
            level: Some("snoozed".into()),
            snoozed_until: Some("2026-08-31T00:00:00".into()),
            month_ratio: Some(0.5),
            ..Default::default()
        });
        assert_eq!(budget_status_text_at(&ov, FIXTURE_AT_SECS), "🔕 预算静默至 2026-08-31T00:00:00");
    }

    /// warn：百分比直接取 alert.json 的 month_ratio，绝不再用 (budget-spent)/budget
    /// 自算——那是 D2 缺口。
    #[test]
    fn budget_line_warn_uses_alert_ratio_not_recomputed() {
        let ov = ov_with(overview::BudgetAlert {
            source: "alert".into(),
            level: Some("warn".into()),
            month_ratio: Some(0.021314526166666667),
            month_cost: Some(12.7887157),
            monthly_cny: Some(600.0),
            ..Default::default()
        });
        assert_eq!(budget_status_text_at(&ov, FIXTURE_AT_SECS), "⚠️ 预算 2%：¥12.79 / ¥600");
    }

    /// ok / 未知 level：显示权威数值本身，不添油加醋。
    #[test]
    fn budget_line_ok_prints_authority_numbers() {
        let ov = ov_with(overview::BudgetAlert {
            source: "alert".into(),
            level: Some("ok".into()),
            month_cost: Some(12.7887157),
            monthly_cny: Some(600.0),
            ..Default::default()
        });
        assert_eq!(budget_status_text_at(&ov, FIXTURE_AT_SECS), "✓ 预算：¥12.79 / ¥600");
    }

    #[test]
    fn budget_line_lists_profiles_without_combining_currencies() {
        let mut ov = ov_with(overview::BudgetAlert::default());
        ov.budget_profiles = Some(serde_json::json!({
            "profiles": [
                {"profile_id": "estimate", "currency": "CNY", "level": "warn", "spent_minor": 8100, "monthly_minor": 10000},
                {"profile_id": "confirmed", "currency": "USD", "level": "ok", "spent_minor": 2500, "monthly_minor": 10000}
            ]
        }));
        assert_eq!(budget_status_text_at(&ov, FIXTURE_AT_SECS), "预算：估算 CNY 接近 81.00/100.00；已确认 USD 正常 25.00/100.00");
    }

    #[test]
    fn budget_line_no_budget_never_prints_a_default_amount_or_percent() {
        let budget = overview::BudgetAlert {
            source: "sql".into(),
            level: Some("no_budget".into()),
            month_cost: Some(42.0),
            ..Default::default()
        };
        let mut ov = ov_with(budget);
        ov.budget_monthly_cny = None;
        let line = budget_status_text_at(&ov, 0);
        assert_eq!(line, "预算：未设置（成本仍按实际口径统计）");
        assert!(!line.contains("600"));
        assert!(!line.contains('%'));
    }

    /// AGENT_VITALS_BIN 优先于自身目录与 PATH（env 指向的文件存在就用它）。
    #[test]
    fn resolve_binary_prefers_env_override() {
        let get = |k: &str| match k {
            "AGENT_VITALS_BIN" => Some("/opt/av/agent-vitals".into()),
            _ => None,
        };
        let is_file = |p: &Path| p.to_string_lossy() == "/opt/av/agent-vitals";
        assert_eq!(
            resolve_binary_from(&get, "/usr/bin:/opt/av".into(), None, &is_file),
            Some(PathBuf::from("/opt/av/agent-vitals"))
        );
    }

    /// 无 env、无自身目录 → PATH 查找。
    #[test]
    fn resolve_binary_falls_back_to_path() {
        let none = |_: &str| None;
        let is_file = |p: &Path| p.to_string_lossy() == "/usr/local/bin/agent-vitals";
        assert_eq!(
            resolve_binary_from(&none, "/usr/bin:/usr/local/bin".into(), None, &is_file),
            Some(PathBuf::from("/usr/local/bin/agent-vitals"))
        );
    }

    /// env 指向的文件不存在 → 不硬用，退回自身目录/PATH（宁可 PATH 也不起一个
    /// 不存在的）。
    #[test]
    fn resolve_binary_env_must_exist() {
        let get = |k: &str| match k {
            "AGENT_VITALS_BIN" => Some("/gone/agent-vitals".into()),
            _ => None,
        };
        let is_file = |p: &Path| p.to_string_lossy() == "/usr/local/bin/agent-vitals";
        assert_eq!(
            resolve_binary_from(&get, "/usr/local/bin".into(), None, &is_file),
            Some(PathBuf::from("/usr/local/bin/agent-vitals"))
        );
    }

    /// 自身目录解析：CLI 放进 .app 的 `Contents/MacOS/`（与 menubar 同目录）时，
    /// 无 env 无 PATH 也能找到——登录项启动的 app 不必依赖登录 shell 的 PATH。
    #[test]
    fn resolve_binary_finds_sibling_next_to_exe() {
        let none = |_: &str| None;
        let exe = Some(PathBuf::from(
            "/Applications/agent-vitals.app/Contents/MacOS/agent-vitals-menubar",
        ));
        let is_file = |p: &Path| {
            p.to_string_lossy() == "/Applications/agent-vitals.app/Contents/MacOS/agent-vitals"
        };
        assert_eq!(
            resolve_binary_from(&none, "".into(), exe, &is_file),
            Some(PathBuf::from(
                "/Applications/agent-vitals.app/Contents/MacOS/agent-vitals"
            ))
        );
    }

    /// 兄弟目录优先于 PATH：即使 PATH 里也有，app 自带的 CLI 必须赢（部署版不该
    /// 被 PATH 上另一份不同版本的二进制劫持）。
    #[test]
    fn resolve_binary_bundle_wins_over_path() {
        let none = |_: &str| None;
        let exe = Some(PathBuf::from(
            "/Applications/agent-vitals.app/Contents/MacOS/agent-vitals-menubar",
        ));
        let is_file = |p: &Path| {
            let s = p.to_string_lossy();
            s == "/Applications/agent-vitals.app/Contents/Resources/bin/agent-vitals"
                || s == "/usr/local/bin/agent-vitals"
        };
        assert_eq!(
            resolve_binary_from(&none, "/usr/local/bin".into(), exe, &is_file),
            Some(PathBuf::from(
                "/Applications/agent-vitals.app/Contents/Resources/bin/agent-vitals"
            ))
        );
    }

    /// 自身目录里的候选都不存在 → 退回 PATH。
    #[test]
    fn resolve_binary_bundle_missing_falls_back_to_path() {
        let none = |_: &str| None;
        let exe = Some(PathBuf::from(
            "/Applications/agent-vitals.app/Contents/MacOS/agent-vitals-menubar",
        ));
        let is_file = |p: &Path| p.to_string_lossy() == "/usr/local/bin/agent-vitals";
        assert_eq!(
            resolve_binary_from(&none, "/usr/local/bin".into(), exe, &is_file),
            Some(PathBuf::from("/usr/local/bin/agent-vitals"))
        );
    }

    /// 解析 `agent-vitals discover` 的报告：unfolded 首条（mtime 最新）= 要折的。
    #[test]
    fn latest_unfolded_takes_first_row() {
        let report = serde_json::json!({
            "bare_jsonl": 2,
            "zstd_only": 0,
            "unfolded": [
                {"path": "/dsh/s/b/sess-bbb/session.jsonl", "session_id": "sess-bbb"},
                {"path": "/dsh/s/b/sess-aaa/session.jsonl", "session_id": "sess-aaa"},
            ],
        });
        assert_eq!(
            latest_unfolded(&report),
            Some(("/dsh/s/b/sess-bbb/session.jsonl".into(), "sess-bbb".into()))
        );
    }

    /// 空报告（没发现未折会话）→ None，tick 走「没有可折」分支不硬折。
    #[test]
    fn latest_unfolded_empty_is_none() {
        let empty = serde_json::json!({"bare_jsonl": 0, "zstd_only": 58, "unfolded": []});
        assert_eq!(latest_unfolded(&empty), None);
        let missing = serde_json::json!({"bare_jsonl": 0});
        assert_eq!(latest_unfolded(&missing), None);
    }

    /// days_from_civil 锚点：2026-08-27T00:00Z = 1787788800 秒（= 20692 天）。与
    /// overview.rs 的 civil_from_unix_secs 互为逆运算，锚点对上了两个方向都信得过。
    #[test]
    fn days_from_civil_matches_known_epoch_anchor() {
        assert_eq!(days_from_civil(2026, 8, 27), 20692);
        assert_eq!(days_from_civil(2026, 8, 27) * 86400, 1787788800);
        // 纪元起点：1970-01-01 = 0 天。
        assert_eq!(days_from_civil(1970, 1, 1), 0);
    }

    #[test]
    fn budget_period_end_uses_next_beijing_month_boundary() {
        assert_eq!(
            budget_period_end_ms_for_month("2026-09"),
            Some((days_from_civil(2026, 10, 1) * 86_400 - 8 * 3_600) * 1_000)
        );
        assert_eq!(
            budget_period_end_ms_for_month("2026-12"),
            Some((days_from_civil(2027, 1, 1) * 86_400 - 8 * 3_600) * 1_000)
        );
        assert_eq!(budget_period_end_ms_for_month("2026-13"), None);
    }

    /// RFC3339 解析钉住 alert.json 真机夹具：`2026-08-30T07:04:38.548588+00:00`
    /// = 1788073478 秒。同一瞬间用 Z / +08:00 / -05:00 三种写法必须解析出同一秒——
    /// 时区换算不对，freshness 判据会跟着错。
    #[test]
    fn parse_rfc3339_pins_fixture_and_offsets() {
        assert_eq!(parse_rfc3339_secs(FIXTURE_AT), Some(FIXTURE_AT_SECS));
        assert_eq!(parse_rfc3339_secs("2026-08-30T07:04:38Z"), Some(FIXTURE_AT_SECS));
        assert_eq!(parse_rfc3339_secs("2026-08-30T15:04:38+08:00"), Some(FIXTURE_AT_SECS));
        assert_eq!(parse_rfc3339_secs("2026-08-30T02:04:38-05:00"), Some(FIXTURE_AT_SECS));
        // 无小数位也认；负 epoch 前后（1970-01-01T00:00:00Z）→ 0。
        assert_eq!(parse_rfc3339_secs("2026-08-30T07:04:38+00:00"), Some(FIXTURE_AT_SECS));
        assert_eq!(parse_rfc3339_secs("1970-01-01T00:00:00Z"), Some(0));
    }

    /// 烂输入 → None（调用方按「无新鲜度信息」处理，不 panic 不臆造）。
    #[test]
    fn parse_rfc3339_garbage_is_none() {
        assert_eq!(parse_rfc3339_secs("not-a-timestamp"), None);
        assert_eq!(parse_rfc3339_secs("2026-08-30"), None);
        assert_eq!(parse_rfc3339_secs(""), None);
        assert_eq!(parse_rfc3339_secs("2026-13-40T25:61:61Z"), None);
    }

    /// stale 判据：> 5 分钟算过期（与工作台 workbench.js 同一阈值）；5 分钟内新鲜；
    /// generated_at 缺场 / 解析失败 → 不算过期（没有新鲜度信息 ≠ 过期）。
    #[test]
    fn stale_from_uses_5min_window() {
        assert!(!stale_from(Some(FIXTURE_AT), FIXTURE_AT_SECS + 120));
        assert!(stale_from(Some(FIXTURE_AT), FIXTURE_AT_SECS + 301));
        // 恰在边界内（300s）还算新鲜。
        assert!(!stale_from(Some(FIXTURE_AT), FIXTURE_AT_SECS + 300));
        assert!(!stale_from(None, FIXTURE_AT_SECS + 99999));
        assert!(!stale_from(Some("garbage"), FIXTURE_AT_SECS + 99999));
    }

    /// disabled 预算：alert.json 明确判禁用，托盘直说「已禁用」，绝不落入
    /// 「已用 xx%」的通用文案（review fix 6 的托盘侧）。
    #[test]
    fn budget_line_disabled_is_explicit() {
        let ov = ov_with(overview::BudgetAlert {
            source: "alert".into(),
            level: Some("disabled".into()),
            ..Default::default()
        });
        assert_eq!(budget_status_text_at(&ov, 0), "预算已禁用");
    }

    /// stale + ok：主入口绝不显示 ✓ —— 数据过期必须呈现为过期，不能假装正常
    /// （review fix 3：health 与 freshness 正交）。
    #[test]
    fn budget_line_stale_ok_never_shows_checkmark() {
        let ov = ov_with(overview::BudgetAlert {
            source: "alert".into(),
            level: Some("ok".into()),
            generated_at: Some(FIXTURE_AT.into()),
            month_cost: Some(12.7887157),
            monthly_cny: Some(600.0),
            ..Default::default()
        });
        // 新鲜（+60s）→ ✓；过期（+1h）→ ⚠ 数据过期。
        assert_eq!(budget_status_text_at(&ov, FIXTURE_AT_SECS + 60), "✓ 预算：¥12.79 / ¥600");
        assert_eq!(
            budget_status_text_at(&ov, FIXTURE_AT_SECS + 3600),
            "⚠ 预算（数据过期）：¥12.79 / ¥600"
        );
    }

    /// stale + over：超支语义仍要显示，但带过期后缀——「过期还绿」和「过期还超支
    /// 却不标过期」一样都是欺骗。
    #[test]
    fn budget_line_stale_over_keeps_alert_semantics_with_suffix() {
        let ov = ov_with(overview::BudgetAlert {
            source: "alert".into(),
            level: Some("over".into()),
            generated_at: Some(FIXTURE_AT.into()),
            month_cost: Some(612.5),
            monthly_cny: Some(600.0),
            ..Default::default()
        });
        assert_eq!(
            budget_status_text_at(&ov, FIXTURE_AT_SECS + 3600),
            "🚨 预算超支：¥612.5（月 ¥600）（数据过期）"
        );
    }

    /// 去抖窗口：首轮必发；200ms 内再完成 → 吞掉；窗口外再完成 → 再发。为什么有
    /// 这个窗口：SyncLock 保证至多一轮同步在跑，但「手动先完成、tick 补位完成」
    /// 可能挤在 200ms 内（oneline 极快时），不去抖工作台会对同几毫秒的数据双拉。
    #[test]
    fn fold_debounce_coalesces_back_to_back_folds() {
        let win = FOLD_EVENT_DEBOUNCE;
        // 首轮：从未发过 → 必发。
        assert!(fold_debounce_step(None));
        // 100ms 后又一轮完成 → 窗口内 → 吞掉（不发，避免双拉）。
        assert!(!fold_debounce_step(Some(win / 2)));
        // 恰 200ms → 窗口边界，视为窗口外 → 再发。
        assert!(fold_debounce_step(Some(win)));
        // 250ms → 再发。
        assert!(fold_debounce_step(Some(win + win / 2)));
    }

    /// 只有 fold 成功才广播：「无未折会话」/失败/其他阶段不广播（没有新数据落盘，
    /// 工作台重拉也是旧数字）。
    #[test]
    fn should_emit_fold_event_only_on_fold_success() {
        assert!(should_emit_fold_event(&SyncStatus::ok("fold", "已折入 s1".into())));
        assert!(!should_emit_fold_event(&SyncStatus::ok("discover", "无未折 DSH 会话".into())));
        assert!(!should_emit_fold_event(&SyncStatus::fail("fold", "oneline 失败".into())));
        assert!(!should_emit_fold_event(&SyncStatus::default()));
    }

    #[test]
    fn explicit_show_workbench_flag_overrides_existing_sync_receipt() {
        let ready = SyncStatus::ok("discover", "ready".into());
        assert!(!should_show_workbench_on_start(&ready, &[]));
        assert!(should_show_workbench_on_start(&ready, &["--show-workbench".into()]));
    }

    /// spec §9.2 #11 深链 slot 语义：peek 连续读两次返回同一目标（持久、
    /// 非破坏性——窗口未建/不可见时菜单点击的目标要留到工作台下次消费）；
    /// clear 后 None；set 覆盖旧目标。命令体（peek/clear）只是 slot 方法的
    /// 一层薄壳，语义直接钉在 slot 上。
    #[test]
    fn focus_target_peek_persists_clear_resets_and_set_overwrites() {
        let a = WorkbenchTarget::SessionDetail {
            session_key: SessionKeyJson {
                host_kind: "dsh".into(),
                native_id: "s1".into(),
                source_profile: "work".into(),
                machine_namespace: "mac-a".into(),
            },
        };
        let b = WorkbenchTarget::SessionList { host_kind: Some("codex".into()) };
        let slot = FocusTarget(Mutex::new(None));
        // 未设置 → None。
        assert_eq!(slot.peek(), None);
        // set 后 peek 两次 → 同一目标（持久）。
        slot.set(a.clone());
        assert_eq!(slot.peek(), Some(a.clone()));
        assert_eq!(slot.peek(), Some(a.clone()));
        // 覆盖式存入 → 旧目标消失，新目标生效。
        slot.set(b.clone());
        assert_eq!(slot.peek(), Some(b.clone()));
        // clear → None。
        slot.clear();
        assert_eq!(slot.peek(), None);
    }

    /// spec §9.2 #11 serde round-trip：外层 `type` tag + camelCase 变体名
    /// （sessionDetail/sessionList）；`session_key` 字段名保持 snake_case，内层
    /// 4 键与 core `SessionKey::to_json()` **字节一致**（键序也是契约，
    /// `r2a.rs::to_json` 注释）——回传 sessions_read 的前提，见 SessionKeyJson
    /// 注释里「两处偏离 spec 代码块」的说明。
    #[test]
    fn workbench_target_serde_round_trip_camelcase_tag_snakecase_key() {
        let key = SessionKeyJson {
            host_kind: "dsh".into(),
            native_id: "s1".into(),
            source_profile: "work".into(),
            machine_namespace: "mac-a".into(),
        };
        // 内层与 core to_json 逐字节一致（字符串比较钉住键序）。
        let core_key =
            agent_vitals_domain::r2a::SessionKey::new("dsh", "s1", "work", "mac-a");
        assert_eq!(
            serde_json::to_string(&key).unwrap(),
            serde_json::to_string(&core_key.to_json()).unwrap()
        );
        // 外层：type tag + camelCase 变体名 + snake_case 字段名。
        let detail = WorkbenchTarget::SessionDetail { session_key: key };
        let v = serde_json::to_value(&detail).unwrap();
        assert_eq!(
            v,
            serde_json::json!({
                "type": "sessionDetail",
                "session_key": {
                    "host_kind": "dsh",
                    "native_id": "s1",
                    "source_profile": "work",
                    "machine_namespace": "mac-a",
                }
            })
        );
        // round-trip 闭合：同一 JSON 解析回原目标。
        let back: WorkbenchTarget = serde_json::from_value(v).unwrap();
        assert_eq!(back, detail);
        // SessionList 变体：host_kind 可空（None = 全部，§7.1）。
        let list = WorkbenchTarget::SessionList { host_kind: None };
        let lv = serde_json::to_value(&list).unwrap();
        assert_eq!(lv, serde_json::json!({"type": "sessionList", "host_kind": null}));
        let back: WorkbenchTarget = serde_json::from_value(lv).unwrap();
        assert_eq!(back, list);
    }

    /// spec §9.2 #12 动态菜单 id → WorkbenchTarget 映射：`session:{kind}:{i}` →
    /// SessionDetail（key 与行内一致）；`host:{kind}` → SessionList；禁用 id
    /// （unavailable/none/stale）→ None（禁用项点不到，事件即便到达也不该有
    /// 目标）；越界索引/未知宿主 → None。
    #[test]
    fn menu_ids_map_to_workbench_targets_and_disabled_ids_are_inert() {
        let hosts = vec![
            HostRow {
                host_kind: "dsh".into(),
                status: "ready".into(),
                today_tokens: Some(1500),
                today_partial: false,
                today_sessions: Some(2),
                recent: vec![
                    RecentSessionRow {
                        session_key: serde_json::json!({
                            "host_kind": "dsh", "native_id": "s1",
                            "source_profile": "work", "machine_namespace": "mac-a",
                        }),
                        title: Some("title".into()),
                        date: Some("2026-09-01".into()),
                        model: Some("m".into()),
                        tokens: Some(100),
                    },
                    // session_key 不完整（容错投影会保留这种行，overview.rs）：
                    // 该行仍渲染，但点了不动——不发一个回传不了的目标。
                    RecentSessionRow {
                        session_key: Value::Null,
                        title: Some("bad-key".into()),
                        date: None,
                        model: None,
                        tokens: None,
                    },
                ],
            },
            HostRow::unavailable("codex"),
        ];
        // 正常 L2 → SessionDetail，key 原样带出。
        match workbench_target_for_menu_id("session:dsh:0", &hosts) {
            Some(WorkbenchTarget::SessionDetail { session_key }) => {
                assert_eq!(session_key.native_id, "s1");
            }
            other => panic!("session:dsh:0 应映射 SessionDetail，得 {other:?}"),
        }
        // 越界索引 → None。
        assert_eq!(workbench_target_for_menu_id("session:dsh:5", &hosts), None);
        // session_key 不可回传（null）→ None。
        assert_eq!(workbench_target_for_menu_id("session:dsh:1", &hosts), None);
        // 未知宿主 → None。
        assert_eq!(workbench_target_for_menu_id("session:other:0", &hosts), None);
        // host:{kind} → SessionList（v1 子菜单点击不产事件，发射点留给将来）。
        assert_eq!(
            workbench_target_for_menu_id("host:codex", &hosts),
            Some(WorkbenchTarget::SessionList { host_kind: Some("codex".into()) })
        );
        // 禁用 id 一律 None。
        assert_eq!(
            workbench_target_for_menu_id("session:unavailable:codex", &hosts),
            None
        );
        assert_eq!(workbench_target_for_menu_id("session:none:codex", &hosts), None);
        assert_eq!(workbench_target_for_menu_id("session:stale:dsh", &hosts), None);
    }

    #[test]
    fn disabled_budget_does_not_enable_notification_permission_flow() {
        assert!(!budget_notifications_enabled(0, 0));
        assert!(budget_notifications_enabled(1, 0));
        assert!(budget_notifications_enabled(0, 1));
    }

    #[test]
    fn authority_backup_restore_validates_and_preserves_current_file() {
        let root = std::env::temp_dir().join(format!(
            "sv-menubar-restore-test-{}-{}",
            std::process::id(),
            agent_vitals_runtime::sql_sync::now_ms()
        ));
        std::fs::create_dir_all(&root).unwrap();
        let backup = root.join("backup.sqlite");
        let target = root.join("authority.sqlite");
        drop(agent_vitals_data::authority::AuthorityDb::open(&backup, 1).unwrap());
        std::fs::write(&target, b"old-current").unwrap();

        let preserved = restore_authority_backup_file(&backup, &target, 42).unwrap();
        let preserved_path = root.join("authority.sqlite.pre-restore-42.bak");
        assert_eq!(preserved.as_deref(), Some(preserved_path.as_path()));
        assert_eq!(std::fs::read(preserved.unwrap()).unwrap(), b"old-current");
        assert!(agent_vitals_data::authority::AuthorityDb::open_readonly(&target).is_ok());
        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn invalid_authority_backup_does_not_replace_current_file() {
        let root = std::env::temp_dir().join(format!(
            "sv-menubar-invalid-restore-test-{}-{}",
            std::process::id(),
            agent_vitals_runtime::sql_sync::now_ms()
        ));
        std::fs::create_dir_all(&root).unwrap();
        let backup = root.join("bad.sqlite");
        let target = root.join("authority.sqlite");
        std::fs::write(&backup, b"not-a-database").unwrap();
        std::fs::write(&target, b"keep-current").unwrap();

        assert!(restore_authority_backup_file(&backup, &target, 43).is_err());
        assert_eq!(std::fs::read(&target).unwrap(), b"keep-current");
        assert!(!root.join("authority.sqlite.pre-restore-43.bak").exists());
        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn latest_release_parser_accepts_only_app_tags() {
        assert_eq!(
            parse_latest_release_tag(&serde_json::json!({"tag_name": "app-v1.0.0"})).unwrap(),
            "app-v1.0.0"
        );
        assert!(parse_latest_release_tag(&serde_json::json!({})).is_err());
        assert!(parse_latest_release_tag(&serde_json::json!({"tag_name": "v1.0.0"})).is_err());
    }
}
