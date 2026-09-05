//! 预算告警的 **I/O + 渲染侧**（CLI `budget show`）。
//!
//! 决策段在 core（`agent_vitals_domain::budget::evaluate_alert`），本模块只做：
//! 读 config.toml / today.json / month.json / month-archive.json / budget.json、
//! 北京日期/now 生成、文本与 JSON 渲染。与 `cost.rs` 同款边界 —— 计算本体
//! 单一真相源在 core，这里不重写任何算术（连 7 日均、自适应 floor 都在 core）。
//!
//! 逐字节一致性由 `tests/test_cli_matrix.py::CliMatrix` 的
//! `budget show` / `budget show --json` / `budget show --month M [--json]`
//! 差分钉住：Python 与 Rust 在同一夹具 HOME 下跑同一条命令，stdout 逐字节相等。
//!
//! R1b 只实现只读路径（show）；`set`/`enable`/`disable`/`snooze`/`unsnooze`
//! 是写路径，随 R1c 的 Rust 状态写链落地（那时 Python 写链退休，R1d）。

use std::path::{Path, PathBuf};

use serde_json::{json, Map, Value};

use crate::clock::{current_month_beijing, today_beijing};
use crate::home::data_home;

/// 数据根 `state/` 目录 —— 与 Python `state.state_dir()` 同路径
/// （`paths.data_home() / "state"`）。这里只读不建目录（纯读路径，不许有写
/// 副作用 —— xbar 每 5 分钟 tick 都调它）。
fn state_dir() -> PathBuf {
    data_home().join("state")
}

fn config_path() -> PathBuf {
    data_home().join("config.toml")
}

fn archive_path() -> PathBuf {
    state_dir().join("month-archive.json")
}

/// 读 JSON 文件；缺文件 / 解析失败 → None（与 Python `state._read` 同款
/// 「缺列 None」语义 —— 不编 0，不崩溃）。
fn read_json(p: &Path) -> Option<Value> {
    let text = std::fs::read_to_string(p).ok()?;
    serde_json::from_str(&text).ok()
}

fn now_unix() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

/// 复刻 Python `str()` 对 bool/int/float/str 的渲染 —— `budget show` 的文本
/// 输出要逐字节一致。
///
/// serde_json 的 `Number` Display 走 ryu（最短可往返表示），与 Python 的
/// `str(float)` / `str(int)` 同算法：`30` 整数给 "30"、`30.0` 浮点给 "30.0"。
/// Bool 需要 Python 风格的大写 `True`/`False`。
fn py_str(v: &Value) -> String {
    match v {
        Value::Bool(b) => {
            if *b {
                "True".to_string()
            } else {
                "False".to_string()
            }
        }
        Value::Number(n) => n.to_string(),
        Value::String(s) => s.clone(),
        _ => v.to_string(),
    }
}

/// 复刻 `budget.py::_parse_scalar`：`'30.0'` → 30.0、`'true'` → True、
/// `'"foo"'` → 'foo'。
///
/// int/float 类型原样保留（`30` 整数、`30.0` 浮点）—— `budget show` 文本输出
/// 的 `%s` 语义（"30" vs "30.0"）依赖它。已知分叉：Python `int()` 吃 `"1_0"`
/// 这类下划线字面量，Rust `parse::<i64>()` 不吃 → 退回字符串；不在任何夹具里。
fn parse_scalar(text: &str) -> Value {
    let s = text.trim();
    if s.len() >= 2 && s.starts_with('"') && s.ends_with('"') {
        return Value::String(s[1..s.len() - 1].to_string());
    }
    match s {
        "true" => return json!(true),
        "false" => return json!(false),
        _ => {}
    }
    if s.contains('.') {
        if let Ok(v) = s.parse::<f64>() {
            return json!(v);
        }
    } else if let Ok(v) = s.parse::<i64>() {
        return json!(v);
    }
    Value::String(s.to_string())
}

/// 读 config.toml 的 `[budget]` 节并与默认值深合并 —— 镜像
/// `budget.py::load_config`（极简 TOML 解析，不引 toml 依赖；merge 段在 core
/// `merged_config`）。缺文件 / 缺节 / 缺字段一律走默认 —— 配置缺失降级而非
/// 崩溃，与「host 能力缺失时不臆造」同一纪律。
fn load_config() -> Value {
    let defaults = agent_vitals_domain::budget::default_budget();
    let Ok(text) = std::fs::read_to_string(config_path()) else {
        return defaults;
    };
    let mut parsed = Map::new();
    let mut in_budget = false;
    // Python 用 `text.splitlines()`；`util::split_lines` 是它的逐字节镜像
    // （CRLF 算一个终止符、末尾终止符不产空元素）。
    for line in agent_vitals_domain::util::split_lines(&text) {
        let s = line.trim();
        if s.is_empty() || s.starts_with('#') {
            continue;
        }
        if s.starts_with('[') && s.ends_with(']') {
            in_budget = s == "[budget]";
            continue;
        }
        if !in_budget {
            continue;
        }
        // `_TOML_KV_RE = ^\s*([a-z_]+)\s*=\s*(.+?)\s*$` —— key 只认 ASCII
        // 小写 + 下划线；`\s` 是 Unicode 空白（Rust 的 trim 家族同语义）。
        // 先剥行首空白，`trim_start` 只整字符地剥，字节偏移必然是字符边界。
        let rest_of_line = line.trim_start();
        let mut key = String::new();
        for c in rest_of_line.chars() {
            if c.is_ascii_lowercase() || c == '_' {
                key.push(c);
            } else {
                break;
            }
        }
        if key.is_empty() {
            continue;
        }
        let rest = rest_of_line[key.len()..].trim_start(); // key 是 ASCII，字节==字符
        if !rest.starts_with('=') {
            continue;
        }
        let val = rest[1..].trim_start().trim_end();
        if val.is_empty() {
            continue; // `.+?` 至少一个字符
        }
        // Python 的 `if key in cfg` 检查的是「默认值 dict 里的已知 key」，
        // 不是「已解析的 key」—— unknown key 交给 `merged_config` 丢弃（它
        // 只认 default_budget 的 8 个 key），这里一律插入，语义与 Python 相同。
        parsed.insert(key, parse_scalar(val));
    }
    agent_vitals_domain::budget::merged_config(&Value::Object(parsed))
}

/// 复刻 `state.py::read_month` —— 返回「已过滤到目标月」的 `days` map。
///
/// `month=None` → 当前真实月（读 month.json 并按 `_month_key(d) == target`
/// 过滤）；历史月读归档（`month-archive.json` 的 `{"months": {"YYYY-MM": {"days"}}}`
/// 包装）。月份无数据 → None（「缺列不编列」—— 不返回空壳让调用方误以为
/// 那个月花了 0 元）。
pub(crate) fn read_month(month: Option<&str>) -> Option<Value> {
    let current = current_month_beijing();
    let target = month.map(str::to_owned).unwrap_or_else(|| current.clone());
    if target == current {
        let data = read_json(&state_dir().join("month.json")).unwrap_or_else(|| json!({}));
        let mut days = Map::new();
        if let Some(obj) = data.get("days").and_then(|v| v.as_object()) {
            for (d, b) in obj {
                // Python `_month_key(d)` = `str(d)[:7]`；字符切片而非字节切片，
                // 对非 ASCII 键安全（日期键总是 ASCII，但保持镜像语义）。
                if d.chars().take(7).collect::<String>() == target {
                    days.insert(d.clone(), b.clone());
                }
            }
        }
        if days.is_empty() {
            return None;
        }
        Some(Value::Object(days))
    } else {
        let archive = read_json(&archive_path())?;
        let entry = archive
            .get("months")
            .and_then(|v| v.as_object())
            .and_then(|m| m.get(&target))
            .and_then(|e| e.as_object())?;
        let days = entry.get("days").and_then(|v| v.as_object())?;
        if days.is_empty() {
            return None;
        }
        let mut out = Map::new();
        for (d, b) in days {
            out.insert(d.clone(), b.clone());
        }
        Some(Value::Object(out))
    }
}

/// 复刻 `budget.py::_read_snooze` 的「读串」部分：budget.json 里非空字符串的
/// `snoozed_until` 原样返回（解析/过期判断交给 core `parse_iso`）。
///
/// Python 侧在这里用 `datetime.fromisoformat` 校验（ValueError → None），core
/// 的 `parse_iso` 承担同一校验 —— 解析不了的串等价于「没有 snooze」。已知
/// 分叉：Python `fromisoformat` 接受空格分隔的 `"2026-08-28 14:53:00"`，core
/// 只认 `T` 分隔；写链 `set_snooze` 永远写 `isoformat()`（`T`），不在夹具里。
fn read_snooze() -> Option<String> {
    let data = read_json(&state_dir().join("budget.json"))?;
    let s = data.get("snoozed_until").and_then(Value::as_str)?;
    if s.is_empty() {
        return None; // `if not s` —— 空串 / 缺场等价
    }
    Some(s.to_string())
}

/// `budget show` 文本输出 —— 逐字节镜像 `cli.py` 的 show handler（不含
/// `--month`，那走 `render_budget_month`）。
fn render_budget_show(cfg: &Value, alert: &Value) -> String {
    let mut w = String::new();
    let p = |v: &Value| py_str(v);
    w.push_str(&format!("enabled:           {}\n", p(&cfg["enabled"])));
    w.push_str(&format!("daily_cny:         {}\n", p(&cfg["daily_cny"])));
    w.push_str(&format!("weekly_cny:        {}\n", p(&cfg["weekly_cny"])));
    w.push_str(&format!("monthly_cny:       {}\n", p(&cfg["monthly_cny"])));
    w.push_str(&format!("peak_share_max:    {}\n", p(&cfg["peak_share_max"])));
    w.push_str(&format!("adaptive_floor:    {}\n", p(&cfg["adaptive_floor"])));
    w.push_str(&format!(
        "adaptive_window:   {} days\n",
        p(&cfg["adaptive_window_days"])
    ));
    w.push_str(&format!(
        "adaptive_multiplier: {}\n",
        p(&cfg["adaptive_multiplier"])
    ));
    w.push('\n');
    w.push_str("─── today ───\n");
    w.push_str(&format!(
        "today_cost:        {}\n",
        match alert["today_cost"].clone() {
            Value::Null => "(no data)".to_string(),
            v => format!("¥{:.2}", v.as_f64().unwrap_or(0.0)),
        }
    ));
    let eff = alert["effective_daily_budget"].as_f64().unwrap_or(0.0);
    let floor_applied = alert["adaptive_floor_applied"].clone();
    w.push_str(&format!(
        "effective_daily:   ¥{:.2} (adaptive_floor_applied={})\n",
        eff,
        p(&floor_applied)
    ));
    w.push_str(&format!(
        "ratio:             {}\n",
        match alert["ratio"].clone() {
            Value::Null => "(no data)".to_string(),
            v => format!("{:.1}%", v.as_f64().unwrap_or(0.0) * 100.0),
        }
    ));
    w.push_str(&format!(
        "peak_share:        {}\n",
        match alert["peak_share"].clone() {
            Value::Null => "(no data)".to_string(),
            v => format!("{:.1}%", v.as_f64().unwrap_or(0.0) * 100.0),
        }
    ));
    w.push('\n');
    w.push_str("─── month ───\n");
    w.push_str(&format!(
        "month_cost:        {}\n",
        match alert["month_cost"].clone() {
            Value::Null => "(no data)".to_string(),
            v => format!("¥{:.2}", v.as_f64().unwrap_or(0.0)),
        }
    ));
    w.push_str(&format!(
        "month_ratio:       {}\n",
        match alert["month_ratio"].clone() {
            Value::Null => "(no data)".to_string(),
            v => format!("{:.1}%", v.as_f64().unwrap_or(0.0) * 100.0),
        }
    ));
    w.push('\n');
    w.push_str(&format!(
        "alert level:       {}\n",
        alert["level"].as_str().unwrap_or("")
    ));
    if let Some(snooze) = alert["snoozed_until"].as_str() {
        w.push_str(&format!("snoozed_until:     {snooze}\n"));
    }
    if let Some(reasons) = alert["reasons"].as_array() {
        if !reasons.is_empty() {
            w.push('\n');
            w.push_str("reasons:\n");
            for r in reasons {
                w.push_str(&format!("  • {}\n", r.as_str().unwrap_or("")));
            }
        }
    }
    w
}

/// `budget show --month M` 文本输出 —— 逐字节镜像 `cli.py` 的 month handler。
fn render_budget_month(month: &str, result: Option<&Value>) -> String {
    match result {
        None => format!("(no data for {month})"),
        Some(r) => format!(
            "month:      {month}\ncost:       ¥{:.2} (peak ¥{:.2})",
            r["total"].as_f64().unwrap_or(0.0),
            r["peak_total"].as_f64().unwrap_or(0.0)
        ),
    }
}

/// 指定月 cost —— 读 `read_month`，交给 core `cost::month_cost`。
/// 镜像 `budget.py::compute_month_cost` 的 I/O 段。
pub(crate) fn compute_month(month: Option<&str>) -> Option<Value> {
    let days = read_month(month)?;
    let pricing = agent_vitals_domain::cost::load_pricing();
    Some(agent_vitals_domain::cost::month_cost(&days, &pricing))
}

/// `budget show` 主入口：读齐输入 → core `evaluate_alert` → 文本/JSON。
///
/// `json` 时输出 `evaluate()` 的完整 alert dict（Python `json.dumps(indent=2)`，
/// serde_json `to_string_pretty` 逐字节同形）。
pub fn budget_show(json_out: bool) {
    let cfg = load_config();
    let today_data = read_json(&state_dir().join("today.json"));
    let month_days = read_month(None);
    let pricing = agent_vitals_domain::cost::load_pricing();
    let snooze = read_snooze();
    let alert = agent_vitals_domain::budget::evaluate_alert(
        &cfg,
        today_data.as_ref(),
        month_days.as_ref(),
        &pricing,
        &today_beijing(),
        snooze.as_deref(),
        now_unix(),
    );
    if json_out {
        println!("{}", serde_json::to_string_pretty(&alert).unwrap_or_default());
    } else {
        print!("{}", render_budget_show(&cfg, &alert));
    }
}

/// `budget.evaluate()` 的 I/O 组装（不渲染、不 print）—— oneline 生产者用它
/// 落盘 alert.json，与 `budget_show` 同一份组装，只有一个调用面，不各写一份
/// 互相不一致（R1a 的 xbar「阈值改了菜单栏不生效」教训）。
pub fn evaluate_alert_from_state() -> Value {
    let cfg = load_config();
    let today_data = read_json(&state_dir().join("today.json"));
    let month_days = read_month(None);
    let pricing = agent_vitals_domain::cost::load_pricing();
    let snooze = read_snooze();
    agent_vitals_domain::budget::evaluate_alert(
        &cfg,
        today_data.as_ref(),
        month_days.as_ref(),
        &pricing,
        &today_beijing(),
        snooze.as_deref(),
        now_unix(),
    )
}

/// oneline 的 alert：Python `evaluate()` 读的是 **merge 完之后**的
/// today.json / month.json（cli.py 先 merge 再 evaluate），而 fold-req 在
/// fold_session 落盘之前组装 —— 所以用 core 的纯 state 函数在内存里模拟这一次
/// fold 的 merge（rotate → merge_today_state；stale 迁档 → merge_month_body），
/// 再评估。模拟用的就是 fold_session 落盘时同一个函数，不是第二份规则。
///
/// `by_model_today` = `token_by_date_model(events)[今天]`（可能 None）；`by_date_model`
/// = 整份多日 dict。与 fold-req 传给 fold_session 的同一对切片。
pub fn evaluate_alert_after_fold(
    hb: &Value,
    by_model_today: Option<&Value>,
    by_date_model: &Value,
) -> Value {
    let cfg = load_config();
    let pricing = agent_vitals_domain::cost::load_pricing();
    let snooze = read_snooze();
    let today_key = today_beijing();
    let current = current_month_beijing();
    let now = crate::state::now_iso_utc();

    // 模拟 merge_today：rotate（跨 BJ 0:00）→ merge_today_state。
    let existing_today = read_json(&state_dir().join("today.json")).unwrap_or_else(|| json!({}));
    let rotated = match agent_vitals_domain::state::rotate_today_state(&existing_today, &today_key, &now)
    {
        Some(r) => r,
        None => existing_today,
    };
    let merged_today =
        agent_vitals_domain::state::merge_today_state(&rotated, hb, by_model_today, &today_key, &now);

    // 模拟 merge_month：stale 先迁档，再 merge_month_body → 新的月 days。
    let existing_month = read_json(&state_dir().join("month.json")).unwrap_or_else(|| json!({}));
    let mut archive = read_json(&state_dir().join("month-archive.json")).unwrap_or_else(|| json!({}));
    let stale = agent_vitals_domain::state::stale_days(&existing_month, &current);
    if stale.as_object().is_some_and(|m| !m.is_empty()) {
        archive = agent_vitals_domain::state::add_days_to_archive(&archive, &stale, &now);
    }
    let body = agent_vitals_domain::state::merge_month_body(
        &existing_month,
        hb,
        Some(by_date_model),
        &current,
        &now,
        &archive,
    );
    // merge_month_body 已经把历史月拆进 backfill、month_json["days"] 只剩当前月；
    // 空月 → None（`read_month` 的「缺列 None」语义，空壳与 None 在 evaluate 里
    // 不同：None → month_cost None，空壳 → 0 元）。
    let month_days = match body.month_json.get("days") {
        Some(Value::Object(m)) if !m.is_empty() => Some(Value::Object(m.clone())),
        _ => None,
    };

    agent_vitals_domain::budget::evaluate_alert(
        &cfg,
        Some(&merged_today),
        month_days.as_ref(),
        &pricing,
        &today_key,
        snooze.as_deref(),
        now_unix(),
    )
}

/// `budget show --month M` 主入口：直接问 `compute_month`，跟阈值/告警无关。
pub fn budget_show_month(month: &str, json_out: bool) {
    let result = compute_month(Some(month));
    if json_out {
        match &result {
            // None 用 Python 的**紧凑**形式（`json.dumps` 无 indent 时 separators
            // 是 `(", ", ": ")`，带空格）；serde_json 的 `to_string` 是无空格紧凑
            // 形式，逐字节不一致 —— 就两个键，手拼。
            None => println!(
                r#"{{"month": {}, "cost": null}}"#,
                serde_json::to_string(month).unwrap_or_default()
            ),
            Some(r) => println!(
                "{}",
                serde_json::to_string_pretty(&json!({"month": month, "cost": r}))
                    .unwrap_or_default()
            ),
        }
    } else {
        print!("{}", render_budget_month(month, result.as_ref()));
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    /// 环境锁是进程级的（util::ENV_LOCK），不是本模块局部的 —— state 的测试
    /// 也改 AGENT_VITALS_HOME，各自一把锁就互相踩踏（见 util.rs 注释）。
    ///
    /// 把 AGENT_VITALS_HOME 指到夹具根，Drop 时恢复原值。
    ///
    /// `data_home()` 走同一套环境解析（AGENT_VITALS_HOME → …），测试夹具
    /// 用临时根隔离，跑完不污染调用方环境。
    struct TestEnvGuard {
        prev: Option<String>,
    }
    impl TestEnvGuard {
        fn set(home: &Path) -> Self {
            let prev = std::env::var("AGENT_VITALS_HOME").ok();
            std::env::set_var("AGENT_VITALS_HOME", home);
            TestEnvGuard { prev }
        }
    }
    impl Drop for TestEnvGuard {
        fn drop(&mut self) {
            match &self.prev {
                Some(p) => std::env::set_var("AGENT_VITALS_HOME", p),
                None => std::env::remove_var("AGENT_VITALS_HOME"),
            }
        }
    }

    fn tmp_home(t: &std::path::Path) -> PathBuf {
        let home = t.join("home");
        std::fs::create_dir_all(home.join("state")).unwrap();
        home
    }

    fn write(p: &Path, text: &str) {
        std::fs::create_dir_all(p.parent().unwrap()).unwrap();
        std::fs::write(p, text).unwrap();
    }

    /// `_parse_scalar` 的类型保留是 `budget show` 文本 `%s` 语义的根：`30` 是
    /// int（"30"）、`30.0` 是 float（"30.0"）、`true` 是 bool（"True"）。
    #[test]
    fn parse_scalar_keeps_types() {
        assert_eq!(parse_scalar("30"), json!(30));
        assert_eq!(parse_scalar("30.0"), json!(30.0));
        assert_eq!(parse_scalar("true"), json!(true));
        assert_eq!(parse_scalar("\"foo\""), json!("foo"));
        assert_eq!(parse_scalar("abc"), json!("abc")); // 解析失败 → 字符串
        assert_eq!(parse_scalar("30."), json!(30.0)); // float("30.") → 30.0
    }

    /// TOML 极简解析只认 `[budget]` 节里已知 key；缺文件走默认。
    #[test]
    fn load_config_mirrors_python() {
        let _env = crate::ENV_LOCK.lock().unwrap();
        let dir = std::env::temp_dir().join(format!("av-budget-test-{}", std::process::id()));
        let home = tmp_home(&dir);
        let _guard = TestEnvGuard::set(&home);
        write(&home.join("config.toml"), "[budget]\ndaily_cny = 50\npeak_share_max = 0.6\n");
        let cfg = load_config();
        assert_eq!(cfg["daily_cny"], 50); // int 保留
        assert_eq!(cfg["peak_share_max"], 0.6);
        assert_eq!(cfg["enabled"], true); // 缺字段走默认
        assert_eq!(cfg["monthly_cny"], 600.0);
        // 非 [budget] 节的 key 忽略
        write(&home.join("config.toml"), "[scan]\nmax_depth = 5\n");
        let cfg2 = load_config();
        assert_eq!(cfg2["daily_cny"], 30.0); // 默认回来
        drop(_guard);
        let _ = std::fs::remove_dir_all(&dir);
    }

    /// 日期过滤、缺月 None —— 与 `state.read_month` 同语义。
    #[test]
    fn read_month_filters_to_target_and_returns_none_for_empty() {
        let _env = crate::ENV_LOCK.lock().unwrap();
        let dir = std::env::temp_dir().join(format!("av-budget-rm-{}", std::process::id()));
        let home = tmp_home(&dir);
        let _guard = TestEnvGuard::set(&home);
        let current = current_month_beijing();
        let write_month = |days: &str| write(&state_dir().join("month.json"), days);
        // 当月一天 + 上/下月一天 → 只留当月
        let d_cur = format!("{current}-15");
        let (y, m) = current.split_once('-').unwrap();
        let prev = if m == "01" {
            format!("{}-12", y.parse::<i64>().unwrap() - 1)
        } else {
            format!("{}-{:02}", y, m.parse::<i64>().unwrap() - 1)
        };
        write_month(&format!(
            r#"{{"month": "{current}", "days": {{"{d_cur}": {{}}, "{prev}-20": {{}}}}}}"#
        ));
        let days = read_month(None).unwrap();
        let obj = days.as_object().unwrap();
        assert_eq!(obj.len(), 1);
        assert!(obj.contains_key(&d_cur));
        // 无数据 → None（不是空壳）
        write_month(r#"{"days": {}}"#);
        assert!(read_month(None).is_none());
        // 历史月：归档包装
        write(
            &archive_path(),
            &format!(r#"{{"months": {{"{prev}": {{"days": {{"{prev}-20": {{}}}}}}}}}}"#),
        );
        let days = read_month(Some(&prev)).unwrap();
        assert!(days.as_object().unwrap().contains_key(&format!("{prev}-20")));
        drop(_guard);
        let _ = std::fs::remove_dir_all(&dir);
    }

    /// 文本输出是纯渲染 —— 给一个手工 alert，断言关键行。
    #[test]
    fn render_show_text_matches_shape() {
        let cfg = agent_vitals_domain::budget::default_budget();
        let alert = json!({
            "level": "warn",
            "ratio": 0.85,
            "peak_share": 0.6,
            "peak_over": true,
            "reasons": [
                "today at 85% of daily budget (¥25.50 / ¥30.00)",
                "peak share 60% exceeds max 50%"
            ],
            "snoozed_until": Value::Null,
            "effective_daily_budget": 30.0,
            "monthly_cny": 600.0,
            "month_ratio": 0.2,
            "adaptive_floor_applied": false,
            "today_cost": 25.5,
            "today_peak_cost": 15.3,
            "month_cost": 120.0,
        });
        let text = render_budget_show(&cfg, &alert);
        assert!(text.contains("enabled:           True\n"));
        assert!(text.contains("daily_cny:         30.0\n"));
        assert!(text.contains("adaptive_window:   7 days\n"));
        assert!(text.contains("today_cost:        ¥25.50\n"));
        assert!(text.contains("effective_daily:   ¥30.00 (adaptive_floor_applied=False)\n"));
        assert!(text.contains("ratio:             85.0%\n"));
        assert!(text.contains("peak_share:        60.0%\n"));
        assert!(text.contains("alert level:       warn\n"));
        assert!(text.contains("  • today at 85% of daily budget (¥25.50 / ¥30.00)\n"));
    }

    /// snoozed 状态下的文本：snoozed_until 行 + 无 reasons 段落。
    #[test]
    fn render_show_text_with_snooze() {
        let cfg = agent_vitals_domain::budget::default_budget();
        let alert = json!({
            "level": "snoozed",
            "ratio": 1.2,
            "peak_share": Value::Null,
            "peak_over": false,
            "reasons": ["today at 120% of daily budget (¥36.00 / ¥30.00)"],
            "snoozed_until": "2999-12-31T23:59:59+08:00",
            "effective_daily_budget": 30.0,
            "monthly_cny": 600.0,
            "month_ratio": Value::Null,
            "adaptive_floor_applied": false,
            "today_cost": 36.0,
            "today_peak_cost": 0.0,
            "month_cost": Value::Null,
        });
        let text = render_budget_show(&cfg, &alert);
        assert!(text.contains("snoozed_until:     2999-12-31T23:59:59+08:00\n"));
        assert!(text.contains("alert level:       snoozed\n"));
    }

    /// 紧凑 month-None JSON 必须带空格（Python `json.dumps` 无 indent 的
    /// separators 是 `(", ", ": ")`）—— 与 serde_json 的无空格紧凑形式逐字节
    /// 不同，`budget show --month M --json` 的 None 分支必须手拼这个形状。
    #[test]
    fn month_none_json_is_compact_with_spaces() {
        let _env = crate::ENV_LOCK.lock().unwrap();
        let month = "1999-01";
        let s = format!(
            r#"{{"month": {}, "cost": null}}"#,
            serde_json::to_string(month).unwrap_or_default()
        );
        assert_eq!(s, r#"{"month": "1999-01", "cost": null}"#);
        // 无数据月 → None（compute_month 直接给 None，不是空壳）
        let dir = std::env::temp_dir().join(format!("av-budget-mn-{}", std::process::id()));
        let home = tmp_home(&dir);
        let _guard = TestEnvGuard::set(&home);
        assert!(compute_month(Some("1999-01")).is_none());
        drop(_guard);
        let _ = std::fs::remove_dir_all(&dir);
    }
}
