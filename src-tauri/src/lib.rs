//! 菜单栏应用入口：托盘 + 工作台主窗口。计算全部委托给 core（`overview.rs` 只做 I/O
//! 与组装），本文件只负责 Tauri 胶水：托盘菜单、窗口显隐、IPC 命令。
//!
//! 菜单栏本身也展示「今日/本月/预算」三个数字 —— 那是**同一个** `read_overview`
//! 的文本渲染，不是第二份计算。所有金额格式 `fmt_money` 与 core 的 `format_money`
//! 同 spec（≥100 一位小数、否则两位、去尾零），避免菜单栏和工作台对同一份钱报出
//! 两个格式。
mod overview;
mod store;

use serde_json::Value;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::menu::{Menu, MenuBuilder, MenuItem, PredefinedMenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::{AppHandle, Emitter, Manager, WindowEvent};

use overview::{Overview, SyncStatus};

/// 同步互斥：定时 tick 与「立即同步」（菜单/IPC）共用同一把锁，保证任意时刻至多
/// 一轮 discover→oneline 在跑。oneline 写链本身有 fencing + exactly-once，锁不是
/// 为了防重复写，是防两轮并发白白各折一遍 + 两次托盘重建。
struct SyncLock(Mutex<()>);

/// 独立的 macOS 菜单栏模板图。不能复用彩色 App Icon：模板图只提供 alpha
/// 轮廓，由 AppKit 根据浅色、深色、选中和辅助功能状态自动着色。44×36px 源图按
/// 22×18pt 呈现，横向画布避免啄木鸟在方形透明留白中显得过小，并保留 Retina 细节。
fn tray_template_icon() -> tauri::Result<tauri::image::Image<'static>> {
    tauri::image::Image::from_bytes(include_bytes!("../icons/trayTemplate@2x.png"))
}

/// 金额 → `¥600` / `¥774.7` / `¥6.73`。与 core `cost.rs::format_money` 同 spec。
fn fmt_money(x: f64) -> String {
    let s = if x >= 100.0 { format!("{x:.1}") } else { format!("{x:.2}") };
    let s = s.trim_end_matches('0').trim_end_matches('.').to_string();
    format!("¥{s}")
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

/// 预算数据是否过期（> 5 分钟）。与工作台 `workbench.js` 的 `> 5*60*1000` 同一阈值——
/// 托盘和工作台对同一份 alert.json 必须判同一个「过期」，不能一个绿一个黄。
/// `generated_at` 缺场（没有新鲜度信息）→ 不算过期；解析失败 → 也不算（与工作台
/// `Invalid Date` 走不 stale 的现状一致，机器写的 alert.json 不会走到这里）。
fn stale_from(generated_at: Option<&str>, now_secs: i64) -> bool {
    let Some(at) = generated_at.and_then(parse_rfc3339_secs) else {
        return false;
    };
    now_secs - at > 5 * 60
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
    let denom = b.monthly_cny.unwrap_or(ov.budget_monthly_cny);
    let mc = fmt_money(b.month_cost.unwrap_or(0.0));
    let denom_money = fmt_money(denom);
    let base = match (b.source.as_str(), b.level.as_deref()) {
        ("missing", _) => "预算：等预算数据（跑一次 oneline）".to_string(),
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
    match &ov.today {
        Some(t) => format!(
            "今日 {} · {}",
            fmt_tokens(t["tokens"].as_i64().unwrap_or(0)),
            fmt_money(t["total"].as_f64().unwrap_or(0.0)),
        ),
        None => "今日 —".to_string(),
    }
}

/// 模型短名：`deepseek/deepseek-v4-pro-0813` → `deepseek-v4-pro-0813`。只砍
/// provider 前缀（第一个 `/` 之前），不做别的美化——菜单一行的宽度有限，但把
/// `-0813` 这种版本尾巴也砍掉就会让两个不同版本在菜单里长得一模一样。
fn short_model(name: &str) -> &str {
    name.rsplit('/').next().unwrap_or(name)
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
/// "今日预算：¥0.12 / ¥30（0%）"两行自相矛盾的话。
fn daily_budget_text(ov: &Overview, now_secs: i64) -> Option<String> {
    let b = &ov.budget;
    let daily = b.effective_daily_budget?;
    let denom = fmt_money(daily);
    let fresh = !stale_from(b.generated_at.as_deref(), now_secs);
    if ov.today.is_none() {
        return Some(format!("今日预算：— / {denom}（今日无数据）"));
    }
    if !fresh {
        return Some(format!("今日预算：— / {denom}（数据过期，未重新评估）"));
    }
    match (b.today_cost, b.ratio) {
        (Some(c), Some(r)) => {
            Some(format!("今日预算：{} / {denom}（{:.0}%）", fmt_money(c), r * 100.0))
        }
        // alert.json 在场且新鲜，但这两个字段是 null——`evaluate()` 对"今日无
        // 数据"就是这么落盘的。不拿 null 当 0。
        _ => Some(format!("今日预算：— / {denom}（今日无数据）")),
    }
}

/// 最近一次会话一行：`最近会话：deepseek-v4-flash · 15.3K · ¥0.02`。findings
/// 非零时补 `· N 个发现`——0 个不显示（"没有发现"不值得占一行宽度，而且
/// `findings_total: 0` 与"这次没跑规则"在 oneline.json 里同形，不该说得像后者
/// 已被排除）。整条只在 oneline.json 在场时出现。
fn recent_session_text(ov: &Overview) -> Option<String> {
    let r = &ov.recent;
    if !r.present {
        return None;
    }
    let mut parts: Vec<String> = Vec::new();
    if let Some(m) = &r.model {
        parts.push(short_model(m).to_string());
    }
    if let Some(t) = r.tokens_total {
        parts.push(fmt_tokens(t));
    }
    if let Some(c) = r.cost_cny {
        parts.push(fmt_money(c));
    }
    if let Some(n) = r.findings_total {
        if n > 0 {
            parts.push(format!("{n} 个发现"));
        }
    }
    if parts.is_empty() {
        return None;
    }
    Some(format!("最近会话：{}", parts.join(" · ")))
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
    // `at` 是北京时间 `YYYY-MM-DD HH:MM:SS`，菜单只要 HH:MM。
    match sync.at.as_deref().and_then(|s| s.get(11..16)) {
        Some(hhmm) => format!("上次同步：{hhmm} 成功"),
        None => "上次同步：成功".to_string(),
    }
}

fn build_menu(app: &AppHandle, ov: &Overview) -> tauri::Result<Menu<tauri::Wry>> {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);
    build_menu_at(app, ov, now)
}

/// 参数化版——now 由调用方注入，单测钉住每一行文案不用碰系统时钟。
fn build_menu_at(app: &AppHandle, ov: &Overview, now_secs: i64) -> tauri::Result<Menu<tauri::Wry>> {
    // 今日一行：钱 + token 量。两者不是一回事——缓存命中率变化时钱不动 token 动，
    // 只报钱会让"今天明明干了很多活却几乎没花钱"这种情况看起来像没数据。托盘
    // 标题里本来就是这么并排显示的（`today_title`），菜单第一行跟它对齐。
    let today_text = match &ov.today {
        Some(t) => format!(
            "今日成本：{} · {} tokens",
            fmt_money(t["total"].as_f64().unwrap_or(0.0)),
            fmt_tokens(t["tokens"].as_i64().unwrap_or(0)),
        ),
        None => "今日成本：—（无数据）".to_string(),
    };
    let month_total = ov.month["total"].as_f64().unwrap_or(0.0);
    let budget = ov.budget.monthly_cny.unwrap_or(ov.budget_monthly_cny);
    let month_text = format!("本月成本：{} / {}", fmt_money(month_total), fmt_money(budget));
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
    if let Some(t) = recent_session_text(ov) {
        builder = builder.item(&MenuItem::with_id(app, "recent", t, true, None::<&str>)?);
    }
    builder = builder.item(&budget_item);
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
    builder
        .separator()
        .item(&workbench_item)
        .item(&refresh_item)
        .separator()
        .item(&PredefinedMenuItem::quit(app, Some("退出"))?)
        .build()
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
    let status = perform_sync();
    overview::save_sync_status(&status);
    refresh(app);
    // fold 成功落盘 → 广播给工作台（去抖合并，见 emit_fold_event）。只覆盖真正
    // 的 fold：discover 成功但「无未折会话」没有新数据落盘，广播只会让工作台
    // 白拉一遍旧数字；失败同理。webview 未就绪时 emit 是空操作，由下一次
    // tick/手动同步兜底——事件桥不是唯一通路，只是让工作台「立刻」更新的加速带。
    if should_emit_fold_event(&status) {
        emit_fold_event(app);
    }
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
        std::thread::sleep(std::time::Duration::from_secs(5 * 60));
    });
}

/// 「立即同步」（托盘菜单 / 工作台按钮共用）：受控 tick 一次。跑在后台线程，菜单
/// 事件处理器不阻塞；互斥锁阻塞等待在途同步结束，保证用户点的这一次真的执行。
fn sync_now(app: &AppHandle) {
    let app = app.clone();
    std::thread::spawn(move || {
        let lock = app.state::<SyncLock>();
        let _guard = lock.0.lock().unwrap_or_else(|e| e.into_inner());
        sync_tick(&app);
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

/// 工作台日历：任意月逐日 + 月总额。薄转发 `overview::read_month_json`——定价与
/// 月读取边界都在 overview/core，命令不碰。非法 month 与「该月无数据」同形
/// （has_data:false），前端据此显示「该月暂无数据」。
#[tauri::command]
fn read_month(month: String) -> Value {
    overview::read_month_json(&month)
}

/// 工作台「立即同步」按钮：受控 tick 一次（与托盘菜单同一路径）。立即返回，不
/// 阻塞 IPC；工作台自己在同步结束后重拉 overview。
#[tauri::command]
fn trigger_sync(app: AppHandle) {
    sync_now(&app);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(SyncLock(Mutex::new(())))
        // fold 事件去抖状态：tick/手动线程共享（见 FoldEventDebounce 注释）。
        .manage(FoldEventDebounce(Mutex::new(None)))
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
            read_month,
            trigger_sync,
            store::sessions_list,
            store::sessions_read,
            store::sessions_findings,
        ])
        .setup(|app| {
            // 菜单栏工具:必须 .accessory,否则 macOS 把它当普通 App 常驻 Dock
            // (Info.plist 无 LSUIElement → 缺省 .regular)。skipTaskbar/visible:false
            // 只藏窗口,藏不住进程的 Dock 图标。show_workbench 已负责 show+set_focus,
            // accessory 下窗口照常成为 key。
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);
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
                .on_menu_event(|app, event| match event.id().as_ref() {
                    "workbench" => show_workbench(app),
                    // 「立即同步」不是重读本地 state，而是受控 tick：discover →
                    // oneline 折账 → 刷新托盘（review fix 1）。
                    "refresh" => sync_now(app),
                    _ => {}
                })
                .build(app)?;
            // 初始标题：托盘一亮就带今日消耗，不用等第一个 tick（线程刚 spawn、
            // 首轮 sync 前有窗口期）。
            if let Some(t) = app.tray_by_id("main") {
                let _ = t.set_title(Some(today_title(&ov)));
            }
            start_refresh_tick(app.handle().clone());
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running agent-vitals menubar");
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ov_with(budget: overview::BudgetAlert) -> Overview {
        Overview {
            data_home: "/tmp".into(),
            today: None,
            month: serde_json::json!({"total": 0.0}),
            days: vec![],
            budget_monthly_cny: 600.0,
            budget,
            recent: overview::RecentSession::default(),
            sync: SyncStatus::default(),
            estimate_note: String::new(),
        }
    }

    #[test]
    fn today_title_renders_tokens_cost_or_honest_dash() {
        let mut ov = ov_with(overview::BudgetAlert::default());
        assert_eq!(today_title(&ov), "今日 —", "无今日数据不得臆造 0");
        ov.today = Some(serde_json::json!({"total": 12.34, "peak_total": 0.0, "tokens": 1398214}));
        assert_eq!(today_title(&ov), "今日 1.4M · ¥12.34");
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
    /// 「今日成本：—（无数据）」和「今日预算：¥0.12 / ¥30（0%）」。
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
            "今日预算：— / ¥30（今日无数据）",
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
        assert_eq!(daily_budget_text(&ov, FIXTURE_AT_SECS).unwrap(), "今日预算：¥24 / ¥30（93%）");
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
            "今日预算：— / ¥30（数据过期，未重新评估）"
        );
    }

    /// 没有 alert.json（拿不到日预算这个设置）→ 整行不显示，不空占一行；预算行
    /// 本身已经说了「等预算数据」。
    #[test]
    fn daily_budget_line_absent_without_alert() {
        let ov = ov_with(overview::BudgetAlert { source: "missing".into(), ..Default::default() });
        assert!(daily_budget_text(&ov, FIXTURE_AT_SECS).is_none());
    }

    /// 最近会话行：oneline.json 在场 → 模型短名 · token · 钱；findings 为 0 时
    /// 不显示「0 个发现」。
    #[test]
    fn recent_session_line_renders_model_tokens_cost() {
        let mut ov = ov_with(overview::BudgetAlert::default());
        assert!(recent_session_text(&ov).is_none(), "oneline.json 缺场 → 整行不显示");
        ov.recent = overview::RecentSession {
            present: true,
            model: Some("deepseek/deepseek-v4-flash".into()),
            tokens_total: Some(15305),
            cost_cny: Some(0.0230385),
            findings_total: Some(0),
            ..Default::default()
        };
        assert_eq!(recent_session_text(&ov).unwrap(), "最近会话：deepseek-v4-flash · 15K · ¥0.02");
        ov.recent.findings_total = Some(3);
        assert_eq!(
            recent_session_text(&ov).unwrap(),
            "最近会话：deepseek-v4-flash · 15K · ¥0.02 · 3 个发现"
        );
    }

    /// present 但字段全 null（oneline.json 写了个空壳）→ 不显示一行只有前缀的
    /// 「最近会话：」。
    #[test]
    fn recent_session_line_absent_when_every_field_is_null() {
        let mut ov = ov_with(overview::BudgetAlert::default());
        ov.recent = overview::RecentSession { present: true, ..Default::default() };
        assert!(recent_session_text(&ov).is_none());
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
        assert_eq!(sync_line_text(&ok), "上次同步：09:50 成功");
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
        assert_eq!(sync_line_text(&ok_no_at), "上次同步：成功");
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
}
