//! 菜单栏应用入口：托盘 + 弹出面板。计算全部委托给 core（`overview.rs` 只做 I/O
//! 与组装），本文件只负责 Tauri 胶水：托盘菜单、窗口显隐、IPC 命令。
//!
//! 菜单栏本身也展示「今日/本月/预算」三个数字 —— 那是**同一个** `read_overview`
//! 的文本渲染，不是第二份计算。所有金额格式 `fmt_money` 与 core 的 `format_money`
//! 同 spec（≥100 一位小数、否则两位、去尾零），避免菜单栏和面板对同一份钱报出
//! 两个格式。
mod overview;

use serde_json::Value;
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

fn build_menu(app: &AppHandle, ov: &Overview) -> tauri::Result<Menu<tauri::Wry>> {
    let today_text = match &ov.today {
        Some(t) => format!("今日成本：{}", fmt_money(t["total"].as_f64().unwrap_or(0.0))),
        None => "今日成本：—（无数据）".to_string(),
    };
    let month_total = ov.month["total"].as_f64().unwrap_or(0.0);
    let budget = ov.budget_monthly_cny;
    let month_text = format!("本月成本：{} / {}", fmt_money(month_total), fmt_money(budget));
    let budget_text = if budget > 0.0 {
        let remaining = budget - month_total;
        if remaining >= 0.0 {
            format!("预算剩余：{}（{}%）", fmt_money(remaining), (remaining / budget * 100.0).round() as i64)
        } else {
            format!("预算超支：{}", fmt_money(-remaining))
        }
    } else {
        "预算：未配置".to_string()
    };
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
        .invoke_handler(tauri::generate_handler![read_overview, hide_window])
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
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running agent-vitals menubar");
}
