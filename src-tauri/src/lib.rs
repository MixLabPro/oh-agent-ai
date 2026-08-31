//! 菜单栏应用入口：托盘 + 弹出面板。计算全部委托给 core（`overview.rs` 只做 I/O
//! 与组装），本文件只负责 Tauri 胶水：托盘菜单、窗口显隐、IPC 命令。
//!
//! 菜单栏本身也展示「今日/本月/预算」三个数字 —— 那是**同一个** `read_overview`
//! 的文本渲染，不是第二份计算。所有金额格式 `fmt_money` 与 core 的 `format_money`
//! 同 spec（≥100 一位小数、否则两位、去尾零），避免菜单栏和面板对同一份钱报出
//! 两个格式。
mod overview;
mod store;

use serde_json::Value;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::menu::{Menu, MenuBuilder, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Manager, PhysicalPosition, WindowEvent};

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

/// 预算数据是否过期（> 5 分钟）。与面板 `main.js` 的 `> 5*60*1000` 同一阈值——
/// 托盘和面板对同一份 alert.json 必须判同一个「过期」，不能一个绿一个黄。
/// `generated_at` 缺场（没有新鲜度信息）→ 不算过期；解析失败 → 也不算（与面板
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
fn budget_status_text(ov: &Overview) -> String {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);
    budget_status_text_at(ov, now)
}

/// 纯函数版预算状态行——now 由调用方注入，单测不用碰系统时钟。
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
/// 「今日」落在这里（本月/预算在右键菜单与面板里，塞标题太长）。**token + 价格都
/// 显示**：token 是消耗量的直观信号、价格与预算同单位——菜单/面板只显示价格，标题
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

fn build_menu(app: &AppHandle, ov: &Overview) -> tauri::Result<Menu<tauri::Wry>> {
    let today_text = match &ov.today {
        Some(t) => format!("今日成本：{}", fmt_money(t["total"].as_f64().unwrap_or(0.0))),
        None => "今日成本：—（无数据）".to_string(),
    };
    let month_total = ov.month["total"].as_f64().unwrap_or(0.0);
    let budget = ov.budget.monthly_cny.unwrap_or(ov.budget_monthly_cny);
    let month_text = format!("本月成本：{} / {}", fmt_money(month_total), fmt_money(budget));
    let budget_text = budget_status_text(ov);
    let today_item = MenuItem::with_id(app, "today", today_text, false, None::<&str>)?;
    let month_item = MenuItem::with_id(app, "month", month_text, false, None::<&str>)?;
    let budget_item = MenuItem::with_id(app, "budget", budget_text, false, None::<&str>)?;
    let mut builder = MenuBuilder::new(app)
        .item(&today_item)
        .item(&month_item)
        .item(&budget_item);
    // 上次同步失败也要在托盘可见——不是只进 stderr。托盘是主入口，同步断了用户
    // 应该一眼看到「该动手了」，而不是等到打开面板才发现数字是旧的。
    if !ov.sync.ok {
        let sync_text = if ov.sync.stage == "never" {
            "尚未同步".to_string()
        } else {
            format!("⚠ 上次同步失败：{}", ov.sync.message)
        };
        builder = builder.item(&MenuItem::with_id(app, "sync", sync_text, false, None::<&str>)?);
    }
    let open_item = MenuItem::with_id(app, "open", "打开面板…", true, None::<&str>)?;
    // 工作台主窗口入口（任务 #5）：独立可缩放窗口，三页 总览/日历/会话。
    // 与「打开面板…」并列但语义不同——面板是托盘旁的弹出层，工作台是常驻主窗口。
    let workbench_item = MenuItem::with_id(app, "workbench", "打开工作台…", true, None::<&str>)?;
    let refresh_item = MenuItem::with_id(app, "refresh", "立即同步", true, None::<&str>)?;
    builder
        .separator()
        .item(&open_item)
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

/// 一轮同步 + 落盘状态 + 重建托盘。**每一条路径都走到这里**——没有提前 return
/// 跳过托盘更新的分支（这正是「多数正常路径连 state 重读都不做」的修复：无未折
/// 会话/二进制缺失/discover 失败也要刷新，把外部更新带进托盘）。
fn sync_tick(app: &AppHandle) {
    let status = perform_sync();
    overview::save_sync_status(&status);
    refresh(app);
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

/// 「立即同步」（托盘菜单 / 面板按钮共用）：受控 tick 一次。跑在后台线程，菜单
/// 事件处理器不阻塞；互斥锁阻塞等待在途同步结束，保证用户点的这一次真的执行。
fn sync_now(app: &AppHandle) {
    let app = app.clone();
    std::thread::spawn(move || {
        let lock = app.state::<SyncLock>();
        let _guard = lock.0.lock().unwrap_or_else(|e| e.into_inner());
        sync_tick(&app);
    });
}

/// 面板显隐切换：隐藏时直接 hide；显示时先摆到主屏右上角（托盘下方）再 show。
fn toggle_window(app: &AppHandle) {
    let Some(w) = app.get_webview_window("overview") else { return };
    if w.is_visible().unwrap_or(false) {
        let _ = w.hide();
        return;
    }
    if let Ok(Some(m)) = app.primary_monitor() {
        let wa = m.work_area();
        let size = w.outer_size().unwrap_or_default();
        let right = wa.position.x + wa.size.width as i32;
        let x = (right - size.width as i32 - 16).max(wa.position.x);
        let _ = w.set_position(PhysicalPosition::new(x, wa.position.y + 16));
    }
    let _ = w.show();
    let _ = w.set_focus();
}

/// 打开工作台主窗口：显示 + 聚焦。**不做 toggle**——工作台是常驻主窗口（与面板
/// 「点了再点收起」不同），× 只隐藏不销毁（`on_window_event` 拦截 prevent_close +
/// hide），再开保留当前 tab/月/分页状态，不是重建一个空白窗口。
fn show_workbench(app: &AppHandle) {
    let Some(w) = app.get_webview_window("workbench") else { return };
    let _ = w.show();
    let _ = w.set_focus();
}

/// 面板前端请求当前 overview —— 与托盘菜单同一份数据源，前端只渲染。
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

#[tauri::command]
fn hide_window(app: AppHandle) {
    if let Some(w) = app.get_webview_window("overview") {
        let _ = w.hide();
    }
}

/// 面板「立即同步」按钮：受控 tick 一次（与托盘菜单同一路径）。立即返回，不
/// 阻塞 IPC；面板自己在同步结束后重拉 overview。
#[tauri::command]
fn trigger_sync(app: AppHandle) {
    sync_now(&app);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(SyncLock(Mutex::new(())))
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
            hide_window,
            trigger_sync,
            store::sessions_list,
            store::sessions_read,
            store::sessions_findings,
        ])
        .setup(|app| {
            // 菜单栏工具:必须 .accessory,否则 macOS 把它当普通 App 常驻 Dock
            // (Info.plist 无 LSUIElement → 缺省 .regular)。skipTaskbar/visible:false
            // 只藏窗口,藏不住进程的 Dock 图标。toggle_window 已负责 show+set_focus,
            // accessory 下窗口照常成为 key。
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);
            let ov = overview::read_overview();
            let menu = build_menu(app.handle(), &ov)?;
            // 左键 → 弹菜单（今日/本月/预算/打开面板/立即同步/退出）；右键 → 弹面板。
            // macOS 缺省两个键都弹菜单：左键经 show_menu_on_left_click(true) 走原生
            // performClick；右键菜单必须显式关掉——Tauri builder 没透出 menu_on_right_click，
            // 得经 with_inner_tray_icon 直达 tray-icon 底层，否则右键会又弹菜单又切面板。
            TrayIconBuilder::with_id("main")
                .icon(tray_template_icon()?)
                .icon_as_template(true)
                .menu(&menu)
                .show_menu_on_left_click(true)
                .on_menu_event(|app, event| match event.id().as_ref() {
                    "open" => toggle_window(app),
                    "workbench" => show_workbench(app),
                    // 「立即同步」不是重读本地 state，而是受控 tick：discover →
                    // oneline 折账 → 刷新托盘（review fix 1）。
                    "refresh" => sync_now(app),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Right,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        toggle_window(tray.app_handle());
                    }
                })
                .build(app)?;
            // 初始标题：托盘一亮就带今日消耗，不用等第一个 tick（线程刚 spawn、
            // 首轮 sync 前有窗口期）。右键菜单一并关掉（见上注释）——菜单只在左键弹。
            if let Some(t) = app.tray_by_id("main") {
                let _ = t.set_title(Some(today_title(&ov)));
                let _ = t.with_inner_tray_icon(|inner| {
                    inner.set_show_menu_on_right_click(false);
                });
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

    /// 夹具：alert.json 真机形态的 generated_at（2026-08-30 实测），以及用它作
    /// 「现在」的固定秒数——单测不碰系统时钟。
    const FIXTURE_AT: &str = "2026-08-30T07:04:38.548588+00:00";
    const FIXTURE_AT_SECS: i64 = 1788073478;

    /// 缺场降级：没有 alert.json 不臆造百分比，直说「等预算数据」。
    #[test]
    fn budget_line_missing_alert_is_honest() {
        let ov = ov_with(overview::BudgetAlert { source: "missing".into(), ..Default::default() });
        assert_eq!(budget_status_text(&ov), "预算：等预算数据（跑一次 oneline）");
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
        assert_eq!(budget_status_text(&ov), "🚨 预算超支：¥612.5（月 ¥600）");
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
        assert_eq!(budget_status_text(&ov), "🔕 预算静默至 2026-08-31T00:00:00");
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
        assert_eq!(budget_status_text(&ov), "⚠️ 预算 2%：¥12.79 / ¥600");
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
        assert_eq!(budget_status_text(&ov), "✓ 预算：¥12.79 / ¥600");
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

    /// stale 判据：> 5 分钟算过期（与面板 main.js 同一阈值）；5 分钟内新鲜；
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
}
