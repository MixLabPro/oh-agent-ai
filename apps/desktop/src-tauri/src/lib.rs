//! 菜单栏应用入口：托盘 + 工作台主窗口。计算全部委托给 core（`overview.rs` 只做 I/O
//! 与组装），本文件只负责 Tauri 胶水：托盘菜单、窗口显隐、IPC 命令。
//!
//! 菜单栏本身也展示「今日/本月/预算」三个数字 —— 那是**同一个** `read_overview`
//! 的文本渲染，不是第二份计算。所有金额格式 `fmt_money` 与 core 的 `format_money`
//! 同 spec（≥100 一位小数、否则两位、去尾零），避免菜单栏和工作台对同一份钱报出
//! 两个格式。
mod overview;
mod store;

use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::path::{Path, PathBuf};
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

/// 托盘标题：菜单栏里图标旁那一段常驻文字。原设计「托盘展示 今日/本月/预算」里的
/// 「今日」落在这里（本月/预算在菜单与工作台里，塞标题太长）。**token + 价格都
/// 显示**：token 是消耗量的直观信号、价格与预算同单位——菜单/工作台只显示价格，标题
/// 补 token 不重复。数据源与菜单同一份 `read_overview`，不加第四份拷贝；无今日数据
/// 时诚实显示「—」，不臆造 0。
fn today_title(ov: &Overview) -> String {
    let money = metered_amount(
        ov.today.as_ref().and_then(|t| t["total"].as_f64()),
        claude_currency(&ov.claude_today, "CNY"),
        claude_currency(&ov.claude_today, "USD"),
        fx_rate(ov),
    );
    match money {
        Some(m) => format!("今日 {} · {}", fmt_tokens(today_merged_tokens(ov)), m),
        // 两宿主今天都没有可报的按量钱 → 诚实「—」，不臆造 0。
        None => "今日 —".to_string(),
    }
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
    let tod = (secs + 8 * 3600).rem_euclid(86400);
    format!("{:02}:{:02}", tod / 3600, (tod % 3600) / 60)
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
        let current_year = overview::civil_from_unix_secs(now_secs, 8 * 3600).0;
        let year_is_current = d.len() >= 10
            && d[..4].parse::<i64>().map(|y| y == current_year).unwrap_or(false);
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
fn money_rows_text(ov: &Overview) -> (String, String) {
    let today_money = metered_amount(
        ov.today.as_ref().and_then(|t| t["total"].as_f64()),
        claude_currency(&ov.claude_today, "CNY"),
        claude_currency(&ov.claude_today, "USD"),
        fx_rate(ov),
    );
    let today_text = match today_money {
        Some(m) => format!(
            "今日按量成本：{} · {} tokens",
            m,
            fmt_tokens(today_merged_tokens(ov)),
        ),
        // 两宿主今天都没有可报的按量钱（DSH 没折到账 + claude 无 CNY/USD 价流）
        // → 诚实的 —（缺列报缺）。
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
    let month_money = metered_amount(
        if month_has_days { Some(month_total) } else { None },
        claude_currency(&ov.claude_month, "CNY"),
        claude_currency(&ov.claude_month, "USD"),
        fx_rate(ov),
    );
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
    let today_item = MenuItem::with_id(app, "today", today_text, true, None::<&str>)?;
    let month_item = MenuItem::with_id(app, "month", month_text, true, None::<&str>)?;
    let budget_item = MenuItem::with_id(app, "budget", budget_text, true, None::<&str>)?;
    let mut builder = MenuBuilder::new(app).item(&today_item);
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
    let refresh_item = MenuItem::with_id(app, "refresh", "立即同步", true, None::<&str>)?;
    let menu = builder
        .separator()
        .item(&workbench_item)
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
    let mut child = std::process::Command::new(bin)
        .args([
            "sessions",
            "navigation",
            "--day",
            day,
            "--timezone",
            "Asia/Shanghai",
            "--recent",
            "5",
            "--json",
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
    let initial = perform_sync();
    let folded = should_emit_fold_event(&initial);
    // 一宿主失败不能阻塞其他宿主的导入；共享二进制缺失仍由 resolve 状态报告。
    let (status, facts_ready) = match resolve_binary() {
        Some(bin) => finish_sync_stages(initial, || run_claude_sync(&bin), || run_facts_sync(&bin)),
        None => (initial, false),
    };
    overview::save_sync_status(&status);
    // 宿主区：sessions navigation（20s 硬超时；失败不覆盖 hosts.json——上一轮
    // 快照继续渲染并自然转 stale，spec §6 决策 5）。
    refresh_hosts();
    refresh(app);
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
        "today" | "daily" | "month" | "budget" | "subscription" => Some("overview"),
        "sync" => Some("sources"),
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
#[tauri::command]
fn read_overview() -> Value {
    serde_json::to_value(overview::read_overview()).unwrap_or(Value::Null)
}

/// 工作台总览的权威质量状态。金额仍由 summary DTO 提供；这里仅转发
/// `data_status` 的只读健康、价格快照和 token 归因状态，避免前端自行推断。
#[tauri::command]
fn data_status() -> Value {
    let data_home = overview::data_home();
    let path = agent_vitals_data::authority::default_authority_path(&data_home);
    let Ok(db) = agent_vitals_data::authority::AuthorityDb::open_readonly(&path) else {
        return serde_json::json!({
            "status": "unavailable",
            "reason": "authority database is missing or unreadable"
        });
    };
    let enabled = agent_vitals_runtime::sql_authority::is_enabled(&data_home);
    serde_json::json!({
        "status": "ok",
        "data": agent_vitals_runtime::mcp::data_status_report(db.conn(), true, enabled)
    })
}

/// 升级时从旧公共资产发现的套餐声明。它们是用户核对入口，不是账单：前端
/// 只能拿到展示所需的服务商、金额和起始月份，不能拿到原始价格快照或路径。
#[tauri::command]
fn billing_import_candidates() -> Value {
    let data_home = overview::data_home();
    let path = agent_vitals_data::authority::default_authority_path(&data_home);
    let Ok(db) = agent_vitals_data::authority::AuthorityDb::open_readonly(&path) else {
        return serde_json::json!({ "status": "unavailable", "candidates": [] });
    };
    match db.billing_import_candidates() {
        Ok(rows) => serde_json::json!({
            "status": "ok",
            "candidates": rows.into_iter().map(|(candidate_id, host, provider_id, currency, amount_minor, billing_period_start, status)| {
                serde_json::json!({
                    "candidate_id": candidate_id,
                    "host": host,
                    "provider_id": provider_id,
                    "currency": currency,
                    "amount_minor": amount_minor,
                    "billing_period_start": billing_period_start,
                    "status": status,
                })
            }).collect::<Vec<_>>()
        }),
        Err(error) => serde_json::json!({ "status": "unavailable", "reason": error.to_string(), "candidates": [] }),
    }
}

/// 用户明确核对旧套餐声明后才落下决定。接受的是“这是我的套餐”，不是
/// “我已付款”：actual spend 仍必须来自付款/账单记录。
#[tauri::command]
fn resolve_billing_import_candidate(candidate_id: String, decision: String) -> Result<Value, String> {
    let data_home = overview::data_home();
    let path = agent_vitals_data::authority::default_authority_path(&data_home);
    let db = agent_vitals_data::authority::AuthorityDb::open(&path, agent_vitals_runtime::sql_sync::now_ms())
        .map_err(|error| error.to_string())?;
    let status = match decision.as_str() {
        "accept" => "accepted",
        "dismiss" => "dismissed",
        "reopen" => "pending",
        _ => return Err("invalid billing candidate decision".to_string()),
    };
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

/// 保存一条可追溯的计费关系修订。声明当前态与不可变修订在同一个用户动作中
/// 写入；scope 由前端显式传入，空数组表示只使用宿主/provider/有效期约束。
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
    let data_home = overview::data_home();
    let path = agent_vitals_data::authority::default_authority_path(&data_home);
    let db = agent_vitals_data::authority::AuthorityDb::open(
        &path, agent_vitals_runtime::sql_sync::now_ms(),
    ).map_err(|error| error.to_string())?;
    let now_ms = agent_vitals_runtime::sql_sync::now_ms();
    db.billing_declaration_put(
        &declaration_id, &host, &provider_id, &relationship_kind,
        subscription_name.as_deref(), amount_minor, currency.as_deref(),
        &effective_start, effective_end.as_deref(), source_candidate_id.as_deref(),
        evidence_ref.as_deref(), now_ms,
    ).map_err(|error| error.to_string())?;
    let scope_refs = scopes.iter()
        .map(|scope| (scope.scope_kind.as_str(), scope.scope_value.as_str()))
        .collect::<Vec<_>>();
    let changed = db.billing_declaration_revision_save(
        &revision_id, &declaration_id, supersedes_revision_id.as_deref(),
        &host, &provider_id, &relationship_kind, subscription_name.as_deref(),
        amount_minor, currency.as_deref(), &effective_start, effective_end.as_deref(),
        source_candidate_id.as_deref(), evidence_ref.as_deref(), &scope_refs, now_ms,
    ).map_err(|error| error.to_string())?;
    Ok(serde_json::json!({
        "status": "saved", "revision_id": revision_id,
        "declaration_id": declaration_id, "changed": changed,
    }))
}

/// 读取当前仍有效的计费声明；修订历史由影响预览和重算回执继续追踪。
#[tauri::command]
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
            serde_json::json!({
                "declaration_id": declaration_id, "host": host, "provider_id": provider_id,
                "relationship_kind": relationship_kind, "subscription_name": subscription_name,
                "amount_minor": amount_minor, "currency": currency,
                "effective_start": effective_start, "effective_end": effective_end,
                "source_candidate_id": source_candidate_id,
            })
        }).collect::<Vec<_>>() }),
        Err(error) => serde_json::json!({ "status": "unavailable", "reason": error.to_string(), "declarations": [] }),
    }
}

/// 保存前影响预览：只读返回事实/会话/token 范围，不提前改变汇总或账单。
#[tauri::command]
fn billing_declaration_impact_preview(
    revision_id: String, window_start_ms: i64, window_end_ms: i64,
) -> Value {
    agent_vitals_runtime::summary::billing_declaration_impact_preview(
        &revision_id, window_start_ms, window_end_ms,
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
fn host_bills_for_period(billing_period: String) -> Value {
    let data_home = overview::data_home();
    let path = agent_vitals_data::authority::default_authority_path(&data_home);
    let Ok(db) = agent_vitals_data::authority::AuthorityDb::open_readonly(&path) else {
        return serde_json::json!({ "status": "unavailable", "bills": [] });
    };
    match db.host_bills_for_period(&billing_period) {
        Ok(rows) => serde_json::json!({ "status": "ok", "bills": rows.into_iter().map(|(host, provider_id, billing_basis, amount_minor, currency)| {
            serde_json::json!({ "host": host, "provider_id": provider_id, "billing_basis": billing_basis, "amount_minor": amount_minor, "currency": currency })
        }).collect::<Vec<_>>() }),
        Err(error) => serde_json::json!({ "status": "unavailable", "reason": error.to_string(), "bills": [] }),
    }
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
            if worker_db.billing_recalculation_run(
                &job_id, agent_vitals_runtime::sql_sync::now_ms(),
            ).is_ok() {
                return;
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

/// 工作台「数据源」页的独立契约。会话搜索只回答时间窗内的会话，不能再被
/// 借来承载扫描健康；这里从 SQL authority 的 source_files / usage_facts 读取
/// 每个已接线宿主的扫描、导入和失败范围。宿主集合复用 ingest registry，前端
/// 不再硬编码两个卡片。路径只以 source_id/path_hash 留在库内，本 DTO 不泄露。
#[tauri::command]
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
    merge_source_sync_failure(&mut report, &overview::read_overview().sync);
    report
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
        let host = source.get("host").and_then(Value::as_str).unwrap_or("");
        let affected = if explicitly_scoped {
            (host == "claude-code" && message.contains("claude"))
                || (host == "codex" && message.contains("codex"))
                || (host == "dsh" && (message.contains("dsh") || message.contains("deepseek")))
        } else { true };
        if !affected { continue; }
        source["connection_state"] = Value::String("needs_attention".into());
        source["authorization"] = Value::String("unknown_or_failed".into());
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
#[tauri::command]
fn data_monthly_summary(month: String) -> Value {
    use agent_vitals_data::repository::{MonthlySummaryQuery, SummaryRepository};
    let repo = agent_vitals_runtime::summary::SqlSummaryRepository::new();
    repo.monthly_summary(&MonthlySummaryQuery { month }).to_json()
}

/// v0.9 Stage 0.6 单日版（北京日 YYYY-MM-DD）。与 `data_monthly_summary`
/// 同一条 trait 路径、同一份 DTO 契约（同为 SQL 权威库读源）。
#[tauri::command]
fn data_daily_summary(date: String) -> Value {
    use agent_vitals_data::repository::{DailySummaryQuery, SummaryRepository};
    let repo = agent_vitals_runtime::summary::SqlSummaryRepository::new();
    repo.daily_summary(&DailySummaryQuery { date }).to_json()
}

/// 决策卡「现在该用谁」的 Codex 窗口余量（v0.9 Stage D）。plan 是"当前
/// 状态"的单快照、不按日期分桶——独立命令而不是塞进月/日 summary，语义
/// 才不混。无 rollout / 无 plan 事件 → null（无 ChatGPT 订阅证据，不得编
/// 造余量）。
#[tauri::command]
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
#[tauri::command]
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
#[tauri::command]
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
            resolve_billing_import_candidate,
            save_billing_declaration_revision,
            billing_declarations,
            billing_declaration_impact_preview,
            save_host_bill,
            host_bills_for_period,
            enqueue_billing_recalculation,
            retry_billing_recalculation,
            billing_recalculation_job_status,
            data_source_status,
            data_monthly_summary,
            data_daily_summary,
            data_codex_quota,
            read_calendar_month,
            read_hourly_distribution,
            trigger_sync,
            sync_request_status,
            session_trace,
            store::sessions_list,
            store::sessions_read,
            store::sessions_findings,
            store::sessions_issues,
            peek_nav_target,
            clear_nav_target,
            focus_session,
            peek_focus_target,
            clear_focus_target,
            capture_workbench_screenshot,
        ])
        .setup(|app| {
            // 菜单栏工具:必须 .accessory,否则 macOS 把它当普通 App 常驻 Dock
            // (Info.plist 无 LSUIElement → 缺省 .regular)。skipTaskbar/visible:false
            // 只藏窗口,藏不住进程的 Dock 图标。show_workbench 已负责 show+set_focus,
            // accessory 下窗口照常成为 key。
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);
            recover_billing_recalculations(
                agent_vitals_data::authority::default_authority_path(&overview::data_home()),
            );
            let ov = overview::read_overview();
            let menu = build_menu(app.handle(), &ov)?;
            // 左右键都弹菜单（今日/本月/预算/打开工作台/立即同步/退出）——统一到
            // 大多数状态栏图标的通用手势，不再区分"左键菜单/右键面板"。这是
            // macOS 的缺省行为本身：`.menu(&menu)` 挂上之后两个键天然都弹菜单，
            // 之前是特意用 `with_inner_tray_icon` 关掉右键菜单、改绑
            // `on_tray_icon_event` 的右键分支去做 `toggle_window`，现在两处都删掉，
            // 直接吃缺省行为，不再自定义（2026-09-01 用户反馈"很多图标左右键都是
            // 弹菜单，我们也一样"）。
            TrayIconBuilder::with_id("main")
                .icon(tray_template_icon()?)
                .icon_as_template(true)
                .menu(&menu)
                .show_menu_on_left_click(true)
                .on_menu_event(|app, event| {
                    let id = event.id().as_ref();
                    match id {
                        "workbench" => show_workbench(app),
                        // 「立即同步」不是重读本地 state，而是受控 tick：discover →
                        // oneline 折账 → 刷新托盘（review fix 1）。
                        "refresh" => sync_now(app),
                        // 深链优先（spec §7.2）：session:/host: id → 映射
                        // WorkbenchTarget → focus_session_target（写目标 + 事件 +
                        // show，双通路）。映射失败（未知 id/禁用 id/回传不了的
                        // session_key）回退信息行 tab 导航（tab_for_menu_id 钉住）。
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
            // 初始标题：托盘一亮就带今日消耗，不用等第一个 tick（线程刚 spawn、
            // 首轮 sync 前有窗口期）。
            if let Some(t) = app.tray_by_id("main") {
                let _ = t.set_title(Some(today_title(&ov)));
            }
            start_refresh_tick(app.handle().clone());
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
    /// `data coverage` 同一份 `to_json()`（三宿主 by_host + workbuddy 永久
    /// excluded + coverage 3/3），托盘侧不许长出第二种形状。真机结构性断言
    /// （金额值随机器变，形状不随）。
    #[test]
    fn data_monthly_summary_dto_matches_the_frozen_contract_shape() {
        let d = data_monthly_summary(overview::current_month_beijing());
        let keys: Vec<&String> = d["by_host"].as_object().unwrap().keys().collect();
        assert_eq!(keys, ["claude-code", "codex", "dsh"]);
        assert_eq!(d["excluded_hosts"], serde_json::json!(["workbuddy"]));
        assert_eq!(d["coverage"]["measured_fields"], 3);
        assert_eq!(d["coverage"]["total_fields"], 3);
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
    fn today_title_renders_tokens_cost_or_honest_dash() {
        let mut ov = ov_with(overview::BudgetAlert::default());
        assert_eq!(today_title(&ov), "今日 —", "两宿主都无今日账不得臆造 0");
        ov.today = Some(serde_json::json!({"total": 12.34, "peak_total": 0.0, "tokens": 1398214}));
        assert_eq!(today_title(&ov), "今日 1.4M · ¥12.34");
        // 真机那天（2026-09-02）：DSH 空转 + Claude deepseek 全在账 → 标题必须给
        // 有数的合并行，绝不能还是「今日 —」（用户报的正是这个——DSH 无数据 ≠
        // 全局无数据）。
        let mut cl = ov_with(overview::BudgetAlert::default());
        cl.claude_today = Some(serde_json::json!({"currency_totals": {"CNY": 37.17, "USD": 0.0}}));
        cl.claude_today_tokens = Some(188_213_789);
        assert_eq!(today_title(&cl), "今日 188.2M · ≈¥37.17");
        // 混合：DSH 实测 + Claude 估并存 → token 合并、¥ 相加带 ≈。
        let mut mix = ov_with(overview::BudgetAlert::default());
        mix.today = Some(serde_json::json!({"total": 12.34, "tokens": 1_398_214}));
        mix.claude_today = Some(serde_json::json!({"currency_totals": {"CNY": 6.0, "USD": 0.0}}));
        mix.claude_today_tokens = Some(100_000);
        assert_eq!(today_title(&mix), "今日 1.5M · ≈¥18.34");
        // 纯 anthropic USD 日、DSH 缺场：有 fx_estimate（ov_with 默认 7.15）→ 折进
        // ¥ 主账，速览层给一个统一「≈¥」数（原始分币在 DTO 里供 hover）。
        let mut usd = ov_with(overview::BudgetAlert::default());
        usd.claude_today = Some(serde_json::json!({"currency_totals": {"CNY": 0.0, "USD": 3.0}}));
        usd.claude_today_tokens = Some(500_000);
        assert_eq!(today_title(&usd), "今日 500K · ≈¥21.45", "3 USD × 7.15 折算");
        // 无 fx_estimate（价表旧版 / 缺节）→ 退回分币旧行为：USD 单独浮出，不折算。
        usd.fx = None;
        assert_eq!(today_title(&usd), "今日 500K · ≈$3", "无汇率不折算，USD 原样");
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
        assert_eq!(today, "今日按量成本：≈¥37.17 · 188.2M tokens");
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
        assert_eq!(today, "今日按量成本：¥12.34 · 1.4M tokens");
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
}
