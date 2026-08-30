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
use tauri::menu::{Menu, MenuBuilder, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Manager, PhysicalPosition};

use overview::Overview;

/// 金额 → `¥600` / `¥774.7` / `¥6.73`。与 core `cost.rs::format_money` 同 spec。
fn fmt_money(x: f64) -> String {
    let s = if x >= 100.0 { format!("{x:.1}") } else { format!("{x:.2}") };
    let s = s.trim_end_matches('0').trim_end_matches('.').to_string();
    format!("¥{s}")
}

/// 预算状态行的权威来源：alert.json（`budget.evaluate()` 落盘）。**只读展示，
/// 不重算百分比**——迁移要修的 D2 缺口正是托盘自算 remaining% 与 budget.py 规则
/// 无关。缺场时降级为「等预算数据」，不臆造「预算超支/剩余 X%」。
fn budget_status_text(ov: &Overview) -> String {
    let b = &ov.budget;
    // 预算分母：alert.json 的 monthly_cny 是 evaluate() 算 ratio 用的那份，
    // 与它同屏显示的必须一致；缺场才退回 config。
    let denom = b.monthly_cny.unwrap_or(ov.budget_monthly_cny);
    let mc = fmt_money(b.month_cost.unwrap_or(0.0));
    let denom_money = fmt_money(denom);
    match (b.source.as_str(), b.level.as_deref()) {
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
        // ok 或未知 level：显示权威数值本身，不添油加醋。
        _ => format!("✓ 预算：{mc} / {denom_money}"),
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
    MenuBuilder::new(app)
        .item(&MenuItem::with_id(app, "today", today_text, false, None::<&str>)?)
        .item(&MenuItem::with_id(app, "month", month_text, false, None::<&str>)?)
        .item(&MenuItem::with_id(app, "budget", budget_text, false, None::<&str>)?)
        .separator()
        .item(&MenuItem::with_id(app, "open", "打开面板…", true, None::<&str>)?)
        .item(&MenuItem::with_id(app, "refresh", "刷新", true, None::<&str>)?)
        .separator()
        .item(&PredefinedMenuItem::quit(app, Some("退出"))?)
        .build()
}

/// 重算 overview 并重建托盘菜单 —— 菜单里的三个数字不是静态文案，每次刷新都
/// 重新读 state 文件走 core 折叠。
fn refresh(app: &AppHandle) {
    let ov = overview::read_overview();
    if let Ok(menu) = build_menu(app, &ov) {
        if let Some(tray) = app.tray_by_id("main") {
            let _ = tray.set_menu(Some(menu));
        }
    }
}

/// `agent-vitals` 二进制解析：`AGENT_VITALS_BIN` env 覆盖，否则 PATH 上找。
/// tick 靠它做发现与折账（discovery/oneline 是二进制 crate 的模块，src-tauri
/// 是独立 workspace import 不到——spawn 是「不长第二份拷贝」的唯一路径）。
fn resolve_binary() -> Option<PathBuf> {
    resolve_binary_from(
        &|k| std::env::var(k).ok(),
        std::env::var("PATH").unwrap_or_default(),
        &|p: &Path| p.is_file(),
    )
}

/// 纯函数版二进制解析——env 与文件判断由调用方注入，单测不碰真实环境变量。
fn resolve_binary_from(
    get_env: &dyn Fn(&str) -> Option<String>,
    path: String,
    is_file: &dyn Fn(&Path) -> bool,
) -> Option<PathBuf> {
    if let Some(b) = get_env("AGENT_VITALS_BIN") {
        let p = PathBuf::from(b);
        if is_file(&p) {
            return Some(p);
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

/// 一轮 tick：发现最新未折 DSH 会话 → spawn `agent-vitals oneline` 折进 state →
/// 重建托盘。**所有失败只记日志不崩托盘**（菜单照常显示当前 state）；oneline 的
/// 写链本身有 fencing + exactly-once，这里不在 spawn 之外再叠一层保险。
fn tick_once(app: &AppHandle) {
    let Some(bin) = resolve_binary() else {
        eprintln!("[agent-vitals tick] agent-vitals binary not found (set AGENT_VITALS_BIN or put it on PATH)");
        return;
    };
    let Some(report) = run_discover(&bin) else {
        eprintln!("[agent-vitals tick] agent-vitals discover failed");
        return;
    };
    // zstd-only 会话（真机全是）是 R2a SessionStore 的缺口——数出来记日志，
    // 别让「读不了」静默成「没事做」（缺列不编列，但缺口要如实报）。
    if report.get("zstd_only").and_then(Value::as_u64).unwrap_or(0) > 0 {
        eprintln!(
            "[agent-vitals tick] {} zstd-only DSH sessions not decoded (R2a SessionStore gap)",
            report["zstd_only"]
        );
    }
    let Some((path, session_id)) = latest_unfolded(&report) else {
        eprintln!(
            "[agent-vitals tick] no unfolded DSH session to fold (bare={}, zstd_only={})",
            report["bare_jsonl"], report["zstd_only"]
        );
        return;
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
        Ok(o) if o.status.success() => eprintln!("[agent-vitals tick] folded {session_id} ({path})"),
        Ok(o) => eprintln!(
            "[agent-vitals tick] oneline failed ({}): {}",
            o.status,
            String::from_utf8_lossy(&o.stderr).trim()
        ),
        Err(e) => eprintln!("[agent-vitals tick] oneline spawn failed: {e}"),
    }
    refresh(app);
}

/// 每 5 分钟一轮：发现最新未折 DSH 会话 → spawn `agent-vitals oneline` 折账 →
/// 重建托盘。启动先跑一轮（托盘一亮就是新数据，不用等 5 分钟）。detached 线程
/// 即可：Tauri 的 tray 操作线程安全，AppHandle 可跨线程调用。
fn start_refresh_tick(app: AppHandle) {
    std::thread::spawn(move || loop {
        tick_once(&app);
        std::thread::sleep(std::time::Duration::from_secs(5 * 60));
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

/// 面板前端请求当前 overview —— 与托盘菜单同一份数据源，前端只渲染。
#[tauri::command]
fn read_overview() -> Value {
    serde_json::to_value(overview::read_overview()).unwrap_or(Value::Null)
}

#[tauri::command]
fn hide_window(app: AppHandle) {
    if let Some(w) = app.get_webview_window("overview") {
        let _ = w.hide();
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            read_overview,
            hide_window,
            store::sessions_list,
            store::sessions_read,
        ])
        .setup(|app| {
            let ov = overview::read_overview();
            let menu = build_menu(app.handle(), &ov)?;
            // 左键单击 → 切换面板（不弹菜单）；右键单击 → 菜单。macOS 惯例：
            // 菜单栏工具的左键是主操作，菜单放右键。
            TrayIconBuilder::with_id("main")
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id().as_ref() {
                    "open" => toggle_window(app),
                    "refresh" => refresh(app),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        toggle_window(tray.app_handle());
                    }
                })
                .build(app)?;
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
            estimate_note: String::new(),
        }
    }

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

    /// AGENT_VITALS_BIN 优先于 PATH（env 指向的文件存在就用它）。
    #[test]
    fn resolve_binary_prefers_env_override() {
        let get = |k: &str| match k {
            "AGENT_VITALS_BIN" => Some("/opt/av/agent-vitals".into()),
            _ => None,
        };
        let is_file = |p: &Path| p.to_string_lossy() == "/opt/av/agent-vitals";
        assert_eq!(
            resolve_binary_from(&get, "/usr/bin:/opt/av".into(), &is_file),
            Some(PathBuf::from("/opt/av/agent-vitals"))
        );
    }

    /// 无 AGENT_VITALS_BIN → PATH 查找。
    #[test]
    fn resolve_binary_falls_back_to_path() {
        let none = |_: &str| None;
        let is_file = |p: &Path| p.to_string_lossy() == "/usr/local/bin/agent-vitals";
        assert_eq!(
            resolve_binary_from(&none, "/usr/bin:/usr/local/bin".into(), &is_file),
            Some(PathBuf::from("/usr/local/bin/agent-vitals"))
        );
    }

    /// env 指向的文件不存在 → 不硬用，退回 PATH（宁可 PATH 也不起一个不存在的）。
    #[test]
    fn resolve_binary_env_must_exist() {
        let get = |k: &str| match k {
            "AGENT_VITALS_BIN" => Some("/gone/agent-vitals".into()),
            _ => None,
        };
        let is_file = |p: &Path| p.to_string_lossy() == "/usr/local/bin/agent-vitals";
        assert_eq!(
            resolve_binary_from(&get, "/usr/local/bin".into(), &is_file),
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
}
