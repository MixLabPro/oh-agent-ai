//! Explicit, feature-gated local probe. Never starts runtime watchers or opens authority data.
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::{BTreeMap, BTreeSet};
use std::io::Write;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::{Manager, Webview, WebviewBuilder, WebviewUrl, WebviewWindowBuilder};

const HOST: &str = "workbench";
const CITY: &str = "isolation-city-1";
const RESTART: &str = "isolation-city-2";

#[derive(Clone)]
struct ProbeState(Arc<Mutex<ProbeData>>);

struct ProbeData {
    started: Instant,
    host_pulse: Option<Instant>,
    city_pulses: BTreeMap<String, Instant>,
    ready: BTreeSet<String>,
    codes: BTreeSet<String>,
    request_count: u64,
    events: Vec<Value>,
}

#[derive(Clone, Deserialize, Serialize)]
struct Frame {
    asset: String,
    line: u32,
    column: u32,
}

fn record(state: &ProbeState, view: &str, code: &str, frames: Vec<Frame>) {
    let mut data = state.0.lock().unwrap();
    data.codes.insert(code.to_owned());
    let at_ms = data.started.elapsed().as_millis() as u64;
    if data.events.len() == 200 { data.events.remove(0); }
    data.events.push(json!({ "at_ms": at_ms, "instance_id": view, "code": code, "frames": frames }));
}

#[tauri::command]
fn isolation_probe_event(webview: Webview, state: tauri::State<'_, ProbeState>, code: String, frames: Option<Vec<Frame>>) -> Result<(), String> {
    let label = webview.label();
    if ![HOST, CITY, RESTART].contains(&label) && !label.starts_with("plugin-city-") { return Err("probe_sender_unavailable".into()); }
    if code == "heartbeat" {
        let mut data = state.0.lock().unwrap();
        if label == HOST { data.host_pulse = Some(Instant::now()); }
        else { data.city_pulses.insert(label.to_owned(), Instant::now()); }
        return Ok(());
    }
    if !["ui_ready", "runtime_error", "unhandled_rejection", "host_navigation_alive", "host_exit_navigation_alive", "window_seven_ready", "cinema_started", "cinema_stopped", "stale_rejected", "formal_unresponsive", "formal_reload", "formal_disposed"].contains(&code.as_str()) {
        return Err("probe_code_unavailable".into());
    }
    if code == "ui_ready" { state.0.lock().unwrap().ready.insert(label.to_owned()); }
    let frames = frames.unwrap_or_default().into_iter().take(5).filter(|frame| {
        frame.asset.len() <= 100 && frame.asset.ends_with(".js")
            && frame.asset.bytes().all(|byte| byte.is_ascii_alphanumeric() || b"-_.".contains(&byte))
            && frame.line > 0 && frame.column > 0
    }).collect();
    record(&state, label, &code, frames);
    Ok(())
}

#[tauri::command]
async fn plugin_request(app: tauri::AppHandle, webview: Webview, state: tauri::State<'_, ProbeState>, plugin_host: tauri::State<'_, crate::plugin_host::PluginHost>, request: crate::plugin_host::PluginRequestV1) -> Result<crate::plugin_host::PluginResponseV1, String> {
    let sender = webview.label().to_owned();
    if ![CITY, RESTART].contains(&sender.as_str()) { return Err("probe_sender_unavailable".into()); }
    let request_id = {
        let mut data = state.0.lock().unwrap();
        data.request_count += 1;
        format!("request-{}", data.request_count)
    };
    record(&state, &sender, &format!("{request_id}:request_started"), Vec::new());
    let result = crate::plugin_host::plugin_request(app, webview, plugin_host, request).await;
    let code = if result.is_ok() { "request_succeeded" } else { "request_rejected" };
    record(&state, &sender, &format!("{request_id}:{code}"), Vec::new());
    result
}

pub(crate) const OBSERVER: &str = r#"
(() => {
  window.__CITY_ISOLATION_FIXTURE__ = true;
  const send = (code, frames = []) => {
    const invoke = window.__TAURI__?.core?.invoke ?? window.__TAURI_INTERNALS__?.invoke;
    if (invoke) void invoke('isolation_probe_event', {code, frames}).catch(() => {});
  };
  const frames = (error) => [...String(error?.stack ?? '').matchAll(/assets\/([A-Za-z0-9_.-]+\.js):(\d+):(\d+)/g)]
    .slice(0, 5).map(match => ({asset: match[1], line: Number(match[2]), column: Number(match[3])}));
  addEventListener('error', event => send('runtime_error', frames(event.error)));
  addEventListener('unhandledrejection', event => send('unhandled_rejection', frames(event.reason)));
  let ready = false;
  let seven = false;
  let cinema = false;
  const faults = new Set();
  setInterval(() => {
    send('heartbeat');
    const host = document.querySelector('.sidebar .nav-item');
    const city = document.querySelector('.city-summary-trigger');
    const summary = city?.textContent?.trim() ?? '';
    if (!ready && (host || (summary.startsWith('3 会话') && window.__CITY_ISOLATION_FAULTS__))) {
      ready = true; send('ui_ready');
    }
    if (!seven && summary.startsWith('2 会话')) { seven = true; send('window_seven_ready'); }
    const playing = [...document.querySelectorAll('.plugin-toolbar button')].some(b=>b.textContent==='停止航拍');
    if (playing && !cinema) { cinema = true; send('cinema_started'); }
    if (!playing && cinema) { cinema = false; send('cinema_stopped'); }
    const fault = document.querySelector('.plugin-fallback[role=alert] p')?.textContent;
    if (fault && !faults.has(fault)) {
      faults.add(fault);
      if (fault === 'plugin_unresponsive') send('formal_unresponsive');
      if (fault === 'plugin_reloaded') send('formal_reload');
    }
  }, 150);
})();
"#;

fn host_script() -> String {
    // Host UI uses synthetic fixtures. Only probe events go through native IPC here.
    let preview = include_str!("../../ui-dev/public/tauri-mock.js")
        .replace("if (window.__TAURI__) return;", "")
        .replace("window.__TAURI__ = {", "window.__ISOLATION_PREVIEW__ = {");
    format!(r#"
const nativeInvoke = window.__TAURI__.core.invoke;
{preview}
const previewInvoke = window.__ISOLATION_PREVIEW__.core.invoke;
window.__TAURI__.core.invoke = (command, args) => command === 'isolation_probe_event' || command.startsWith('plugin_') ? nativeInvoke(command, args) : previewInvoke(command, args);
window.__TAURI__.event.listen = window.__ISOLATION_PREVIEW__.event.listen;
{OBSERVER}
"#)
}

fn create_city(app: &tauri::AppHandle, state: &ProbeState, label: &str) -> Result<Webview, String> {
    record(state, label, "create_started", Vec::new());
    let page_state = state.clone();
    let view = app.get_window(HOST).ok_or("probe_host_missing")?.add_child(
        WebviewBuilder::new(label, WebviewUrl::App("plugins/AgentCity.plugin/ui/index.html".into()))
            .incognito(true)
            .initialization_script(OBSERVER)
            .on_page_load(move |view, payload| {
                let code = match payload.event() { tauri::webview::PageLoadEvent::Started => "load_started", tauri::webview::PageLoadEvent::Finished => "load_finished" };
                record(&page_state, view.label(), code, Vec::new());
            }),
        tauri::LogicalPosition::new(190.0, 48.0), tauri::LogicalSize::new(910.0, 712.0),
    ).map_err(|_| "probe_view_create_failed")?;
    record(state, label, "create_succeeded", Vec::new());
    Ok(view)
}

fn wait_until(state: &ProbeState, code: &str, predicate: impl Fn(&ProbeData) -> bool) -> Result<(), String> {
    let deadline = Instant::now() + Duration::from_secs(20);
    while Instant::now() < deadline {
        if predicate(&state.0.lock().unwrap()) { return Ok(()); }
        std::thread::sleep(Duration::from_millis(40));
    }
    Err(code.into())
}

fn host_alive(data: &ProbeData) -> bool {
    data.host_pulse.is_some_and(|pulse| pulse.elapsed() < Duration::from_millis(800))
}

#[allow(unexpected_cfgs)]
fn renderer_pid(view: &Webview) -> Result<i32, String> {
    use objc::{msg_send, sel, sel_impl};
    let (tx, rx) = std::sync::mpsc::channel();
    view.with_webview(move |platform| {
        let view = platform.inner() as *mut objc::runtime::Object;
        let supported: bool = unsafe { msg_send![view, respondsToSelector: sel!(_webProcessIdentifier)] };
        let pid: i32 = if supported { unsafe { msg_send![view, _webProcessIdentifier] } } else { 0 };
        let _ = tx.send(pid);
    }).map_err(|_| "probe_pid_query_failed")?;
    rx.recv_timeout(Duration::from_secs(3)).map_err(|_| "probe_pid_query_timeout".to_owned())
}

fn exercise(app: &tauri::AppHandle, state: &ProbeState) -> Result<Value, String> {
    wait_until(state, "host_boot_timeout", |data| data.ready.contains(HOST))?;
    formal_exercise(app, state)?;
    let city = create_city(app, state, CITY)?;
    wait_until(state, "city_boot_timeout", |data| data.ready.contains(CITY))?;
    let host = app.get_webview(HOST).ok_or("probe_host_missing")?;
    let host_pid = renderer_pid(&host)?;
    let city_pid = renderer_pid(&city)?;
    record(state, CITY, "process_identity_checked", Vec::new());
    if host_pid <= 1 || city_pid <= 1 { return Err("renderer_pid_unavailable".into()); }
    if host_pid == city_pid { return Err("renderer_process_shared".into()); }
    if city_pid == std::process::id() as i32 { return Err("renderer_identity_conflict".into()); }

    city.eval("window.__CITY_ISOLATION_FAULTS__.runtimeError()").map_err(|_| "fault_injection_failed")?;
    wait_until(state, "runtime_error_not_captured", |data| data.events.iter().any(|e| e["instance_id"] == CITY && e["code"] == "runtime_error"))?;
    city.eval("window.__CITY_ISOLATION_FAULTS__.rejection()").map_err(|_| "fault_injection_failed")?;
    wait_until(state, "rejection_not_captured", |data| data.events.iter().any(|e| e["instance_id"] == CITY && e["code"] == "unhandled_rejection"))?;
    city.eval("window.__TAURI__.core.invoke('plugin_request', {request:{version:1,instanceId:'stale',requestId:'probe-invalid',method:'data.read',payload:{}}}).catch(() => {})").map_err(|_| "fault_injection_failed")?;
    wait_until(state, "request_error_not_captured", |data| data.events.iter().any(|event| event["code"].as_str().unwrap_or("").ends_with(":request_rejected")))?;
    record(state, CITY, "hang_injected", Vec::new());
    city.eval("window.__CITY_ISOLATION_FAULTS__.hang()").map_err(|_| "fault_injection_failed")?;
    std::thread::sleep(Duration::from_millis(1800));
    // A single timer sample is not a responsiveness challenge. Require fresh
    // heartbeats within the same bounded wait used for other async probe stages.
    wait_until(state, "host_blocked_by_plugin_hang", host_alive)?;
    if state.0.lock().unwrap().city_pulses.get(CITY).is_some_and(|pulse| pulse.elapsed() < Duration::from_millis(800)) {
        return Err("plugin_hang_not_observed".into());
    }
    record(state, CITY, "unresponsive_detected", Vec::new());
    host.eval("document.querySelector('.sidebar .nav-item').click(); setTimeout(() => window.__TAURI__.core.invoke('isolation_probe_event', {code:'host_navigation_alive'}), 50)")
        .map_err(|_| "host_navigation_failed")?;
    wait_until(state, "host_navigation_timeout", |data| data.codes.contains("host_navigation_alive"))?;
    // PID was read from this probe's own WKWebView and checked against its host.
    let status = std::process::Command::new("/bin/kill").args(["-TERM", &city_pid.to_string()]).status().map_err(|_| "renderer_termination_failed")?;
    if !status.success() { return Err("renderer_termination_failed".into()); }
    record(state, CITY, "renderer_terminated", Vec::new());
    std::thread::sleep(Duration::from_millis(600));
    host.eval("document.querySelector('.sidebar .nav-item').click(); setTimeout(()=>{if(document.querySelector('.header-actions')) window.__TAURI__.core.invoke('isolation_probe_event',{code:'host_exit_navigation_alive'});},50)")
        .map_err(|_| "host_exit_navigation_failed")?;
    wait_until(state, "host_affected_by_plugin_exit", |data| data.codes.contains("host_exit_navigation_alive"))?;
    city.close().map_err(|_| "probe_view_close_failed")?;
    record(state, CITY, "instance_disposed", Vec::new());
    let restarted = create_city(app, state, RESTART)?;
    wait_until(state, "city_restart_timeout", |data| data.ready.contains(RESTART))?;
    let restarted_pid = renderer_pid(&restarted)?;
    if restarted_pid <= 1 || restarted_pid == host_pid { return Err("restart_process_not_isolated".into()); }
    record(state, RESTART, "restart_succeeded", Vec::new());
    Ok(json!({ "host_renderer_pid": host_pid, "city_renderer_pid": city_pid, "restarted_renderer_pid": restarted_pid,
        "independent_renderer": true, "host_alive_after_hang": true, "host_alive_after_exit": true, "city_restarted": true,
        "formal_plugin_toolbar": true, "formal_runtime_recovery": true, "stale_message_rejected": true,
        "formal_hang_recovery": true, "formal_renderer_exit_recovery": true }))
}

fn formal_exercise(app: &tauri::AppHandle, state: &ProbeState) -> Result<(), String> {
    let host = app.get_webview(HOST).ok_or("probe_host_missing")?;
    host.eval("document.querySelectorAll('.sidebar .nav-item')[1].click()").map_err(|_| "formal_navigation_failed")?;
    wait_until(state, "formal_city_boot_timeout", |data| data.ready.contains("plugin-city-1"))?;
    let city = app.get_webview("plugin-city-1").ok_or("formal_city_missing")?;
    if renderer_pid(&host)? == renderer_pid(&city)? { return Err("formal_renderer_shared".into()); }
    std::thread::sleep(Duration::from_millis(600));
    host.eval("const picker = document.querySelector('.plugin-toolbar select'); picker.value='7'; picker.dispatchEvent(new Event('change', {bubbles:true}));")
        .map_err(|_| "formal_window_command_failed")?;
    wait_until(state, "formal_projection_window_timeout", |data| data.codes.contains("window_seven_ready"))?;
    std::thread::sleep(Duration::from_millis(600));
    host.eval("(() => { const timer=setInterval(()=>{const b=[...document.querySelectorAll('.plugin-toolbar button')].find(b=>b.textContent==='重置视角');if(b&&!b.disabled){clearInterval(timer);b.click();}},50);setTimeout(()=>clearInterval(timer),10000);})()")
        .map_err(|_| "formal_reset_failed")?;
    std::thread::sleep(Duration::from_millis(600));
    host.eval("(() => { const timer=setInterval(()=>{const b=[...document.querySelectorAll('.plugin-toolbar button')].find(b=>b.textContent==='航拍');if(b&&!b.disabled){clearInterval(timer);b.click();}},50);setTimeout(()=>clearInterval(timer),10000);})()")
        .map_err(|_| "formal_cinema_failed")?;
    wait_until(state, "formal_cinema_start_timeout", |data| data.codes.contains("cinema_started"))?;
    host.eval("(() => { const timer=setInterval(()=>{const b=[...document.querySelectorAll('.plugin-toolbar button')].find(b=>b.textContent==='停止航拍');if(b&&!b.disabled){clearInterval(timer);b.click();}},50);setTimeout(()=>clearInterval(timer),10000);})()")
        .map_err(|_| "formal_cinema_failed")?;
    wait_until(state, "formal_cinema_stop_timeout", |data| data.codes.contains("cinema_stopped"))?;
    city.eval("window.__CITY_ISOLATION_FAULTS__.runtimeError()").map_err(|_| "formal_fault_failed")?;
    std::thread::sleep(Duration::from_millis(1000));
    host.eval("if(document.querySelector('.plugin-fallback[role=alert]')) document.querySelector('.plugin-fallback button').click();")
        .map_err(|_| "formal_retry_failed")?;
    wait_until(state, "formal_retry_timeout", |data| data.ready.contains("plugin-city-2"))?;
    let next = app.get_webview("plugin-city-2").ok_or("formal_retry_missing")?;
    next.eval("window.__TAURI__.core.invoke('plugin_message',{message:{version:1,instanceId:'plugin-city-1',type:'toolbar.update',revision:999,items:[]}}).catch(()=>window.__TAURI__.core.invoke('isolation_probe_event',{code:'stale_rejected'}))")
        .map_err(|_| "formal_stale_test_failed")?;
    wait_until(state, "formal_stale_not_rejected", |data| data.codes.contains("stale_rejected"))?;
    next.eval("window.__CITY_ISOLATION_FAULTS__.hang()").map_err(|_| "formal_hang_failed")?;
    wait_until(state, "formal_hang_not_detected", |data| data.codes.contains("formal_unresponsive"))?;
    host.eval("document.querySelector('.plugin-fallback button').click()").map_err(|_| "formal_retry_failed")?;
    wait_until(state, "formal_hang_retry_timeout", |data| data.ready.contains("plugin-city-3"))?;
    let crash_view = app.get_webview("plugin-city-3").ok_or("formal_retry_missing")?;
    let crash_pid = renderer_pid(&crash_view)?;
    if crash_pid <= 1 || crash_pid == renderer_pid(&host)? || crash_pid == std::process::id() as i32 { return Err("formal_renderer_identity_conflict".into()); }
    let status = std::process::Command::new("/bin/kill").args(["-TERM", &crash_pid.to_string()]).status().map_err(|_| "formal_renderer_termination_failed")?;
    if !status.success() { return Err("formal_renderer_termination_failed".into()); }
    wait_until(state, "formal_exit_not_detected", |data| data.codes.contains("formal_reload"))?;
    host.eval("document.querySelector('.plugin-fallback button').click()").map_err(|_| "formal_retry_failed")?;
    wait_until(state, "formal_exit_retry_timeout", |data| data.ready.contains("plugin-city-4"))?;
    host.eval("document.querySelector('.sidebar .nav-item').click()").map_err(|_| "formal_navigation_failed")?;
    std::thread::sleep(Duration::from_millis(700));
    if app.get_webview("plugin-city-4").is_none() { return Err("formal_suspended_instance_missing".into()); }
    let snapshot = crate::plugin_host::plugin_snapshot(host.clone(), app.state())?;
    if !snapshot["events"].as_array().is_some_and(|events| events.iter().any(|event| event["code"] == "suspended")) {
        return Err("formal_instance_not_suspended".into());
    }
    record(state, HOST, "formal_instance_suspended", Vec::new());
    host.eval("document.querySelectorAll('.sidebar .nav-item')[1].click()").map_err(|_| "formal_navigation_failed")?;
    std::thread::sleep(Duration::from_millis(700));
    let snapshot = crate::plugin_host::plugin_snapshot(host.clone(), app.state())?;
    if snapshot["instanceId"] != "plugin-city-4" { return Err("formal_instance_not_reused".into()); }
    if !snapshot["events"].as_array().is_some_and(|events| events.iter().any(|event| event["code"] == "resumed")) {
        return Err("formal_instance_not_resumed".into());
    }
    record(state, HOST, "formal_instance_reused", Vec::new());
    host.eval("window.__TAURI__.core.invoke('plugin_close',{instanceId:'plugin-city-4'}).then(()=>window.__TAURI__.core.invoke('isolation_probe_event',{code:'formal_disposed'}))")
        .map_err(|_| "formal_dispose_failed")?;
    wait_until(state, "formal_dispose_timeout", |data| data.codes.contains("formal_disposed"))?;
    if app.get_webview("plugin-city-4").is_some() { return Err("formal_instance_not_disposed".into()); }
    record(state, HOST, "formal_plugin_flow_passed", Vec::new());
    Ok(())
}

pub fn report_argument() -> Option<PathBuf> {
    let args: Vec<String> = std::env::args().collect();
    args.windows(2).find(|pair| pair[0] == "--plugin-isolation-probe").map(|pair| PathBuf::from(&pair[1]))
}

pub fn run(report: PathBuf, mut context: tauri::Context<tauri::Wry>) {
    let state = ProbeState(Arc::new(Mutex::new(ProbeData { started: Instant::now(), host_pulse: None, city_pulses: BTreeMap::new(),
        ready: BTreeSet::new(), codes: BTreeSet::new(), request_count: 0, events: Vec::new() })));
    let setup_state = state.clone();
    context.config_mut().app.windows.clear();
    tauri::Builder::default().manage(state).manage(crate::plugin_host::PluginHost::default())
        .invoke_handler(tauri::generate_handler![isolation_probe_event, plugin_request,
            crate::plugin_host::plugin_open, crate::plugin_host::plugin_close, crate::plugin_host::plugin_snapshot,
            crate::plugin_host::plugin_command, crate::plugin_host::plugin_message,
            crate::plugin_host::plugin_invalidate])
        .setup(move |app| {
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);
            let page_state = setup_state.clone();
            WebviewWindowBuilder::new(app, HOST, WebviewUrl::App("index.html".into()))
                .title("Oh Agent · plugin isolation probe").inner_size(1100.0, 760.0)
                .incognito(true).initialization_script(host_script())
                .on_page_load(move |view, payload| {
                    let code = match payload.event() { tauri::webview::PageLoadEvent::Started => "load_started", tauri::webview::PageLoadEvent::Finished => "load_finished" };
                    record(&page_state, view.label(), code, Vec::new());
                }).build()?;
            let app = app.handle().clone();
            let state = setup_state.clone();
            std::thread::spawn(move || {
                let result = exercise(&app, &state);
                let (status, code, checks) = match result {
                    Ok(checks) => ("passed", "probe_complete".to_owned(), checks),
                    Err(code) => ("failed", code, Value::Null),
                };
                record(&state, HOST, &code, Vec::new());
                let plugin_diagnostics = app.get_webview(HOST).and_then(|view|
                    crate::plugin_host::plugin_snapshot(view, app.state()).ok());
                let report_data = json!({ "schema": "plugin-isolation-probe/v1", "status": status, "code": code,
                    "native_process_pid": std::process::id(), "host_data": "synthetic_preview", "city_data": "native_rust_fixture",
                    "checks": checks, "plugin_diagnostics": plugin_diagnostics, "events": state.0.lock().unwrap().events });
                let saved = std::fs::OpenOptions::new().write(true).create_new(true).open(&report)
                    .and_then(|mut file| file.write_all(serde_json::to_string_pretty(&report_data).unwrap().as_bytes()));
                if saved.is_err() { eprintln!("plugin isolation report write failed"); }
                app.exit(if status == "passed" && saved.is_ok() { 0 } else { 1 });
            });
            Ok(())
        }).run(context).expect("plugin isolation probe setup failed");
}
