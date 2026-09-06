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

/// `config.toml` 位置，库根显式传入（Tier B 预算卡参数化：Tauri
/// `read_overview_at(dh)` 组装入口不走进程 `AGENT_VITALS_HOME`）。生产路径
/// 的调用方各自传 `data_home()`。
fn config_path_at(dh: &Path) -> PathBuf {
    dh.join("config.toml")
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
    load_config_at(&data_home())
}

/// `load_config` 的参数化体：库根显式传入。
fn load_config_at(dh: &Path) -> Value {
    let defaults = agent_vitals_domain::budget::default_budget();
    let Ok(text) = std::fs::read_to_string(config_path_at(dh)) else {
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
/// 退休路径 ③：**索引数据面**的 DSH 月成本——days map 从 facts 索引投影
/// （`store::dsh_days_map`，与 month.json days 同形），喂同一个
/// `domain::cost::month_cost`。零新计价数学：两轨的差只能来自「事实覆盖 ≠
/// fold 覆盖」，不能来自两套算法。
///
/// None = 索引里该月 DSH 没有任何事实（不是「花了 0 元」）。
pub fn compute_month_from_index(month: &str) -> Option<Value> {
    let data_home = crate::home::data_home();
    let (idx, _seeded) = agent_vitals_data::store::FactsIndex::open_or_rebuild(
        &agent_vitals_data::store::default_index_path(&data_home),
        &data_home.join("facts"),
    )
    .ok()?;
    let days = idx.dsh_days_map(month).ok()?;
    // MSRV 1.74：is_none_or 是 1.82 的——用 is_some_and 反写。
    if days.as_object().is_some_and(|m| m.is_empty()) {
        return None;
    }
    let pricing = agent_vitals_domain::cost::load_pricing();
    Some(agent_vitals_domain::cost::month_cost(&days, &pricing))
}

/// **双轨对账（③ 的验收证据）**：state 链账（month.json）vs 索引账（facts）
/// 同月同尺。`reconciled = true` 是 ④（state JSON 退役）的前置条件——退役
/// 之前这条必须连续为真。差值的已知来源（如实）：fold 只折「当月新会话」、
/// 事实重放覆盖全部会话文件，跨月补折/会话删除的窗口期两轨会有临时差。
pub fn reconcile_budget_sources(month: &str) -> Value {
    let state = compute_month(Some(month));
    let index = compute_month_from_index(month);
    let num = |v: &Option<Value>, k: &str| {
        v.as_ref().and_then(|x| x.get(k)).and_then(Value::as_f64)
    };
    let (s_total, i_total) = (num(&state, "total"), num(&index, "total"));
    // **显式零 vs 无事实的两态语义**：state 链会给「测到过但零 token」的日
    // 子留显式行（MeasuredZero），索引只装事实（没用量 = 没 slot = 没行，
    // Unavailable）——两者经济相等（都是 0 元），结构不同，对账时相等成立
    // 但带 note；state 有账（非零）而索引无事实 = **覆盖缺口**（会话没被
    // ingest），对不上，如实 false。
    let (reconciled, note) = match (s_total, i_total) {
        (Some(a), Some(b)) => ((a - b).abs() < 0.01, None), // 分级定价浮点和，厘差容忍
        (Some(0.0), None) => (
            true,
            Some("索引无该月事实（无已测 DSH 用量，或该月会话尚未 ingest——跑 sync-facts 后复查）；state 链为显式零日行——经济相等".to_string()),
        ),
        (Some(_), None) => (false, Some("state 有账而索引无事实——facts 覆盖缺口".to_string())),
        (None, Some(_)) => (false, Some("索引有账而 state 无——fold 覆盖缺口".to_string())),
        (None, None) => (true, None),
    };
    let note = if !reconciled && note.is_none() {
        Some(format!(
            "state={} index={} 差超容忍（厘级）",
            s_total.map(|v| format!("{v:.2}")).unwrap_or_default(),
            i_total.map(|v| format!("{v:.2}")).unwrap_or_default(),
        ))
    } else {
        note
    };
    serde_json::json!({
        "month": month,
        "state_cost": state,
        "index_cost": index,
        "reconciled": reconciled,
        "note": note,
    })
}

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

// ────────────────── v0.9.1 Phase 3.4：budget_status_sql ──────────────────
// 预算/告警从 `budget_config` + `usage_facts` 聚合计算（spec §7 Phase 3）。
// 与上面的 `budget_show`（Python 差分看守的 legacy 链）是**并行新面**：
// 配置源自权威库 `budget_config` 单行表（首次使用时从旧 config.toml 一次性
// seed），支出源自 `SqlSummaryRepository::monthly_summary` 的真实支出 CNY
// 列。**判断全部 minor 整数比较**（纪律 2「金额不落浮点」——pyround 一次
// 之后不再回浮点）。

/// 旧配置一次性 seed（Phase 3.4 设计定稿）：`budget_config` 行缺失且旧
/// `config.toml` 存在 → 读 `[budget]` 节映射 seed（monthly_cny/daily_cny/
/// warn_at_ratio×10000→bp），幂等——行存在后不再读旧文件。spec §6.2.4
/// 「today/alert 不迁移」不适用于**配置**：配置是用户输入，不是派生数据。
/// 返回是否执行了 seed（供 CLI 输出提示）。库根显式传入——`budget_status_
/// sql_at` 的组装入口（Tauri 预算卡）不走进程 `AGENT_VITALS_HOME`。
fn seed_budget_config_from_legacy(
    data_home: &Path,
    db: &agent_vitals_data::authority::AuthorityDb,
) -> bool {
    match db.budget_config_get() {
        Ok(Some(_)) => return false, // 已配置，旧文件永远退役
        Ok(None) => {}
        Err(_) => return false,
    }
    // 只有**旧文件真实存在**才 seed——`load_config()` 对缺文件返回默认值
    // （差分链需要），拿默认值当 seed 源会给从未配置过的机器凭空装上
    // ¥600 预算（no_budget 测试抓出的第一版缺陷：defaults ≠ 用户输入）。
    let cfg_path = config_path_at(data_home);
    if !cfg_path.exists() {
        return false;
    }
    // 审查收口（F2）：`load_config()` 的 merged 产物里 monthly_cny/daily_cny
    // 恒有默认值（600/30），「残缺不 seed」的守卫对 merged 永不可达——
    // config.toml 存在但不含 [budget] 节的机器仍会被装上 ¥600。改为看
    // **原始 TOML 文本**里这两个键是否真实出现；键不齐 = 用户没配过预算，
    // 报 no_budget 比替用户编一份诚实。
    let text = std::fs::read_to_string(&cfg_path).unwrap_or_default();
    let has = |key: &str| {
        text.lines().any(|l| {
            let l = l.trim();
            l.starts_with(key) && l[key.len()..].trim_start().starts_with('=')
        })
    };
    if !has("monthly_cny") || !has("daily_cny") {
        return false;
    }
    let cfg = load_config_at(data_home);
    let monthly = cfg.get("monthly_cny").and_then(Value::as_f64);
    let daily = cfg.get("daily_cny").and_then(Value::as_f64);
    let warn_ratio = cfg.get("warn_at_ratio").and_then(Value::as_f64);
    let (Some(m), Some(d)) = (monthly, daily) else {
        return false; // 防御性（上面 has 门后理论不可达）
    };
    // pyround(×100)：银行家舍入与全仓一致（util::pyround 的同一理由——预算
    // 百分比恰好落在半分点是真实场景）。
    let m_minor = agent_vitals_domain::util::pyround(m * 100.0, 0) as i64;
    let d_minor = agent_vitals_domain::util::pyround(d * 100.0, 0) as i64;
    let bp = agent_vitals_domain::util::pyround(warn_ratio.unwrap_or(0.8) * 10_000.0, 0) as i64;
    db.budget_config_set(m_minor, d_minor, bp, crate::sql_sync::now_ms())
        .is_ok()
}

/// ISO 日期时间串 → epoch 毫秒（snooze 的 until 参数）。**直接复用 domain
/// `budget::parse_iso`**（2026-09-07 审查收口：第一版自制解析只看前 19 字节
/// 并一律按北京时间减 8h，对 `Z`/`+08:00`/`-05:00` 后缀静默错位 8 小时）。
/// parse_iso 的语义已完整：无后缀按**北京挂钟**解释（offset=+8h 已内扣，
/// 返回值即真实 UTC ms，与 Python 链 `_read_snooze` 的
/// `replace(tzinfo=_BEIJING)` 同语义）、Z=0、显式 ±HH:MM 原样——本函数
/// 只做转发，不再二次偏移。
fn iso_to_ms_beijing(s: &str) -> Option<i64> {
    agent_vitals_domain::budget::parse_iso(s).map(|(ms, _)| ms)
}

/// 预算状态（Phase 3.4）：SQL 权威面。`None` 输出仅当库打不开（诊断走
/// `data status`，这条查询路径不做损坏恢复）。返回 shape 见模块头：
/// `level ∈ no_budget | ok | warn | exceeded`（词表与 legacy 链 ok/warn/over
/// 对齐但 exceeded 用全称——新面自有一份词表，不与差分看守的旧链混）。
pub fn budget_status_sql(month: &str) -> Option<Value> {
    budget_status_sql_at(&crate::home::data_home(), month)
}

/// `budget_status_sql` 的**参数化体**（Tier B 预算卡收尾）：库根显式传入，
/// 不碰进程 `AGENT_VITALS_HOME`。Tauri `read_overview_at(dh)` 组装入口与
/// 临时库单测据此对指定库跑预算判定，无需持 `ENV_LOCK`。失败历史：ZST
/// `SqlSummaryRepository` 只认 `crate::home::data_home()`，组装入口传进来的
/// `dh` 被内部忽略，预算卡永远在真机库上跑（本次会话连续 4 次实现失败的
/// 直接原因）。
pub fn budget_status_sql_at(data_home: &Path, month: &str) -> Option<Value> {
    let db = agent_vitals_data::authority::AuthorityDb::open(
        &agent_vitals_data::authority::default_authority_path(data_home),
        crate::sql_sync::now_ms(),
    )
    .ok()?;
    seed_budget_config_from_legacy(data_home, &db);
    let cfg = db.budget_config_get().ok().flatten();

    let summary = {
        use agent_vitals_data::repository::SummaryRepository;
        crate::summary::SqlSummaryRepository::at(data_home)
            .monthly_summary(&agent_vitals_data::repository::MonthlySummaryQuery {
                month: month.to_string(),
            })
    };
    // 真实支出 = by_provider summable 桶的 CNY 列（FixedSubscription +
    // MeteredActual + HostBilled；Money 用分币分栏，跨币不相加——USD 订阅
    // 费不能冒充 CNY 预算的消耗）。零条目 → 0（不编造币桶）。
    let spent_cny_f64: f64 = summary
        .by_provider
        .values()
        .filter(|h| h.currency.as_deref() == Some("CNY"))
        .map(|h| h.summable_total())
        .sum();
    let spent_minor = agent_vitals_domain::util::pyround(spent_cny_f64 * 100.0, 0) as i64;

    // snooze：snoozes 行存在且 until_ms > now → 抑制告警输出标记。
    let now_ms = crate::sql_sync::now_ms();
    let snooze_until = db.budget_snooze_get().ok().flatten().filter(|&until| until > now_ms);

    let (level, ratio_bp) = match &cfg {
        None => ("no_budget", None),
        Some(c) => {
            if c.monthly_cny_minor <= 0 {
                // 配置了 0/负预算 = 语法上合法但无判断意义，同 no_budget
                // 语义但 config 字段照报（消费方能区分「没配」和「配了 0」）。
                ("no_budget", None)
            } else {
                let r = spent_minor * 10_000 / c.monthly_cny_minor;
                let lvl = if r >= 10_000 {
                    "exceeded"
                } else if r >= c.warning_ratio_bp {
                    "warn"
                } else {
                    "ok"
                };
                (lvl, Some(r))
            }
        }
    };

    Some(json!({
        "month": month,
        "level": level,
        "monthly_cny_minor": cfg.as_ref().map(|c| c.monthly_cny_minor),
        "daily_cny_minor": cfg.as_ref().map(|c| c.daily_cny_minor),
        "warning_ratio_bp": cfg.as_ref().map(|c| c.warning_ratio_bp),
        "spent_cny_minor": spent_minor,
        "ratio_bp": ratio_bp,
        "snoozed_until_ms": snooze_until,
        "coverage": summary.coverage.to_json(),
        "freshness": summary.freshness.to_json(),
        "data_source": "sql_authority",
    }))
}

/// snooze 写入口（CLI `budget-sql snooze-set` 用）：解析 ISO 串 → 落库。
/// 解析失败 = `Err(串)`（CLI 报错 exit 2，不猜时区不编默认）。
pub fn budget_snooze_set_sql(until_iso: &str) -> Result<i64, String> {
    let until_ms = iso_to_ms_beijing(until_iso)
        .ok_or_else(|| format!("unparseable --until `{until_iso}` (want YYYY-MM-DDTHH:MM:SS)"))?;
    let db = agent_vitals_data::authority::AuthorityDb::open(
        &agent_vitals_data::authority::default_authority_path(&crate::home::data_home()),
        crate::sql_sync::now_ms(),
    )
    .map_err(|e| e.to_string())?;
    let now = crate::sql_sync::now_ms();
    db.budget_snooze_set(until_ms, now).map_err(|e| e.to_string())?;
    Ok(until_ms)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    /// 退休路径 ③ 的验收证据（真机）：索引账 ≡ state 链账。月度双账都有
    /// 数据的月份（本机 2026-08：DSH 8/14–8/30 有真实用量，state 侧在
    /// month-archive）两轨必须对上。month.json 缺该月 → 跳过（无 state 账
    /// 可对，非失败）。失败时打印两轨明细。
    #[test]
    fn budget_index_matches_state_chain_on_real_machine() {
        let _g = crate::ENV_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        // 找一个 state 链有账的月份：当前月 + 归档月（month-archive.json 的
        // months 键），取「双轨都有数据」的最新一个月对账。
        let mut months: Vec<String> = Vec::new();
        let current = current_month_beijing();
        months.push(current.clone());
        if let Some(archive) = crate::state::read_json(&archive_path()) {
            if let Some(ms) = archive.get("months").and_then(Value::as_object) {
                months.extend(ms.keys().cloned());
            }
        }
        months.sort();
        months.dedup();
        // 倒序找第一个 state **非零**账的月份（零月是显式零日行，对账走
        // note 规则——真证据是非零月双轨等值）。
        let mut month: Option<String> = None;
        for m in months.iter().rev() {
            if let Some(c) = compute_month(Some(m)) {
                if c["total"].as_f64().unwrap_or(0.0) > 0.0 {
                    month = Some(m.clone());
                    break;
                }
            }
        }
        let Some(month) = month else {
            return; // 真机无非零月账 → 无真对账样本，通过（零月规则另有单测）
        };
        let month = month.as_str();
        let state = compute_month(Some(month));
        let index = compute_month_from_index(month);
        let report = reconcile_budget_sources(month);
        eprintln!("reconcile {}: {}", month, serde_json::to_string(&report).unwrap_or_default());
        let Some(s) = state else {
            return; // state 链读不到该月（archive 形状漂移等）——单独修，不归本测试
        };
        let Some(i) = index else {
            panic!("state 有账（{month}）而索引无账——facts 覆盖缺口：{report}");
        };
        // 容差断言（审查 F2）：两轨独立 float 求和，插入序变化可差
        // last-ulp——用与 reconcile 相同的厘级容忍，不比位相等。
        let st = s["total"].as_f64().unwrap_or(0.0);
        let it = i["total"].as_f64().unwrap_or(0.0);
        assert!((st - it).abs() < 0.01, "state 链账 ≠ 索引账：{report}");
        let sp = s["peak_total"].as_f64().unwrap_or(0.0);
        let ip = i["peak_total"].as_f64().unwrap_or(0.0);
        assert!((sp - ip).abs() < 0.01, "peak 拆分不一致：{report}");
    }


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

    // ── Phase 3.4：budget_status_sql ────────────────────────────────────

    /// env guard + ENV_LOCK 的合并持有：TestEnvGuard 改的是进程 env，并发
    /// 测试各拿各的 guard 会互相踩；锁必须**与 guard 同生命周期**——放进
    /// 同一个 RAII 结构（曾试过 `mem::forget(lock)` 把锁永久钉死，整个测试
    /// 进程所有用 env 的测试全部挂起——错误解法留此存照）。guard 必须活到
    /// 断言结束：`AGENT_VITALS_HOME` 是进程级 env，提前 drop 就回到真机
    /// HOME，`budget_status_sql` 会在真机库上跑（第一版红的三连）。
    struct BudgetEnvGuard {
        // **Drop 顺序 = 声明顺序**：`_env` 声明在前 → 先恢复 AGENT_VITALS_
        // HOME，之后才放进程级 ENV_LOCK。反过来的话，并发测试线程会在
        // 「锁已放、env 未恢复」的子窗口抢到锁读到上一个测试的临时 home
        // （审查 F4 的真实竞态）。
        _env: TestEnvGuard,
        _lock: std::sync::MutexGuard<'static, ()>,
    }

    /// 每 case 都从一个**保证干净**的权威库开始（`seed_authority_db` 同款
    /// 纪律——with_home 的目录清理是尽力而为，残留库会让 config seed 幂等
    /// 语义失效）。
    fn fresh_budget_env(
        tag: &str,
    ) -> (
        BudgetEnvGuard,
        agent_vitals_data::authority::AuthorityDb,
        String,
    ) {
        let lock = crate::ENV_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        let dir = std::env::temp_dir().join(format!("av-budget-{tag}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let env = TestEnvGuard::set(&dir);
        let month = crate::clock::current_month_beijing();
        let path =
            agent_vitals_data::authority::default_authority_path(&crate::home::data_home());
        for suffix in ["", "-wal", "-shm"] {
            let _ = std::fs::remove_file(format!("{}{suffix}", path.display()));
        }
        let db = agent_vitals_data::authority::AuthorityDb::open(&path, 1).unwrap();
        (BudgetEnvGuard { _env: env, _lock: lock }, db, month)
    }

    fn seed_fact_min(
        db: &agent_vitals_data::authority::AuthorityDb,
        fact_id: &str,
        host: &str,
        model: &str,
        ts_ms: i64,
        u: i64,
        o: i64,
    ) {
        db.conn()
            .execute(
                "INSERT INTO sync_runs(run_id, started_at_ms, trigger, status, schema_version)
                 VALUES ('run', 1, 'cli', 'succeeded', 1) ON CONFLICT(run_id) DO NOTHING",
                [],
            )
            .unwrap();
        db.conn()
            .execute(
                "INSERT INTO usage_facts(fact_id, host, machine_namespace, native_session_id,
                     source_event_id, observation_kind, provider_id, model_id, event_ts_ms,
                     event_peak, uncached_input_tokens, cache_read_tokens, cache_write_tokens,
                     output_tokens, ingested_run_id, created_at_ms, updated_at_ms)
                 VALUES (?1, ?2, 'm', 's', ?1, 'turn', NULL, ?3, ?4, 0, ?5, 0, 0, ?6, 'run', 1, 1)",
                rusqlite::params![fact_id, host, model, ts_ms, u, o],
            )
            .unwrap();
    }

    #[test]
    fn budget_status_no_budget_without_config_or_legacy() {
        let (_guard, _db, month) = fresh_budget_env("nobudget");
        let v = budget_status_sql(&month).expect("库可开");
        assert_eq!(v["level"], "no_budget");
        assert_eq!(v["monthly_cny_minor"], Value::Null);
        assert_eq!(v["data_source"], "sql_authority");
    }

    #[test]
    fn budget_status_seeds_once_from_legacy_config_and_is_idempotent() {
        let (_guard, _db, month) = fresh_budget_env("seed");
        // 旧 config.toml：monthly ¥600.00 / daily ¥30.00 / warn 0.8。
        let cfg = crate::home::data_home().join("config.toml");
        std::fs::write(
            &cfg,
            "[budget]\nmonthly_cny = 600.0\ndaily_cny = 30.0\nwarn_at_ratio = 0.8\n",
        )
        .unwrap();
        // 第一次 status：seed 发生（600.00 → 60000 minor；0.8 → 8000 bp）。
        let v1 = budget_status_sql(&month).unwrap();
        assert_eq!(v1["monthly_cny_minor"], json!(60_000));
        assert_eq!(v1["daily_cny_minor"], json!(3_000));
        assert_eq!(v1["warning_ratio_bp"], json!(8_000));
        // 改旧文件再查：行已存在 → 不再读旧文件（幂等 seed 的语义）。
        std::fs::write(&cfg, "[budget]\nmonthly_cny = 1.0\ndaily_cny = 1.0\n").unwrap();
        let v2 = budget_status_sql(&month).unwrap();
        assert_eq!(v2["monthly_cny_minor"], json!(60_000), "行存在后旧文件退役");
    }

    #[test]
    fn budget_status_levels_cross_warn_and_exceeded_on_minor_integers() {
        // CNY 桶：DSH（deepseek-official 声明 metered → MeteredActual 落
        // summable）+ 月费摊销会混入（GLM/MiniMax/anthropic 订阅在价表里
        // 有声明），所以用「无订阅声明影响的月份」+ 精确控制 spent 的方式
        // 不稳——这里直接对 dsh 宿主 seed 大额事实，档位断言用「随事实增长
        // 跨档」的相对断言，不硬编码金额对 600 的绝对比例。
        let (_guard, db, month) = fresh_budget_env("levels");
        // 预算 ¥600 → 无订阅月份 dsh MeteredActual ≈ 事实折算。
        let (start, _) = agent_vitals_data::authority_query::beijing_month_bounds_ms(&month).unwrap();
        seed_fact_min(&db, "f1", "dsh", "deepseek-v4-flash", start + 1_000, 100_000_000, 10_000_000);
        db.budget_config_set(60_000, 3_000, 8_000, 1).unwrap();
        let v_low = budget_status_sql(&month).unwrap();
        // 事实量大到把 DSH 支出顶过 warn（≥80%）与 exceeded（≥100%）：
        // flash 卡便宜，直接 seed 巨量 cache_read（峰值单价不参与，这里走
        // priced_day 需要 by_model 形状——直接给足量级即可跨档）。
        for i in 0..40 {
            seed_fact_min(
                &db,
                &format!("bulk{i}"),
                "dsh",
                "deepseek-v4-flash",
                start + 2_000 + i,
                900_000_000,
                90_000_000,
            );
        }
        let v_high = budget_status_sql(&month).unwrap();
        let spent_low = v_low["spent_cny_minor"].as_i64().unwrap();
        let spent_high = v_high["spent_cny_minor"].as_i64().unwrap();
        assert!(spent_high > spent_low, "更多事实 → 更多支出");
        assert!(
            v_high["level"].as_str() == Some("exceeded")
                || v_high["level"].as_str() == Some("warn"),
            "大额支出必须落 warn/exceeded 档，got {}",
            v_high["level"]
        );
        assert!(v_low["level"].as_str() == Some("ok") || v_low["level"].as_str() == Some("warn"));
        // minor 判断链：ratio_bp 与 spent/monthly 的整数关系自洽。
        if let (Some(sp), Some(rb)) = (
            v_high["spent_cny_minor"].as_i64(),
            v_high["ratio_bp"].as_i64(),
        ) {
            assert_eq!(rb, sp * 10_000 / 60_000, "ratio_bp = spent*10000/monthly 整数除法");
        }
        let _ = std::fs::remove_dir_all(std::env::temp_dir().join(format!("av-budget-levels-{}", std::process::id())));
    }

    /// 档位阈值**精确钉界**（审查 F3：levels 的 OR 断言连 2000bp 的错误
    /// warn 阈值都能过——直接调 `budget_config_set` 配一个极小月预算，用
    /// 实测 spent 反推三个精确边界：恰 warn 阈值下/上、恰 100% 下/上）。
    #[test]
    fn budget_status_level_thresholds_are_exact() {
        let (_guard, _db, month) = fresh_budget_env("exact");
        // 不 seed 事实（spent=0），用**月预算本身**控制 spent/monthly 比例：
        // spent 恒 0 → ratio_bp 恒 0 → level 恒 ok——不够。反过来：spent
        // 来自 facts，这里 seed 一笔**已知折算价**的事实再调 budget_config
        // _set 把 monthly 拨到 spent 的边界倍数上，四次查询钉四个档位。
        let (start, _) = agent_vitals_data::authority_query::beijing_month_bounds_ms(&month).unwrap();
        seed_fact_min(&_db, "e1", "dsh", "deepseek-v4-flash", start + 1_000, 1_000_000, 100_000);
        drop(_db);
        let v = budget_status_sql(&month).unwrap();
        let spent = v["spent_cny_minor"].as_i64().unwrap();
        assert!(spent > 0, "seed 事实必须折出正支出（否则本测试失效）");
        // 四次配置 × 查询：spent/warn 下（ok）、恰 warn 上（warn）、
        // spent 恰 100% 下（warn）、恰 100% 上（exceeded）。monthly 取值
        // 让 spent*10000/monthly 落在每档边界两侧各一次。
        let cases = [
            (spent * 10_000 / 7_999, "warn 以下（ratio < 8000bp）", "ok"),
            (spent * 10_000 / 8_000, "恰 warn 阈值（ratio == 8000bp）", "warn"),
            (spent * 10_000 / 9_999, "超 warn 未满额", "warn"),
            (spent * 10_000 / 10_000, "恰 100%", "exceeded"),
        ];
        for (monthly_minor, label, want) in cases {
            if monthly_minor <= 0 {
                continue;
            }
            let db = agent_vitals_data::authority::AuthorityDb::open(
                &agent_vitals_data::authority::default_authority_path(&crate::home::data_home()),
                crate::sql_sync::now_ms(),
            )
            .unwrap();
            db.budget_config_set(monthly_minor, 3_000, 8_000, 1).unwrap();
            drop(db);
            let v = budget_status_sql(&month).unwrap();
            assert_eq!(
                v["level"].as_str(),
                Some(want),
                "{label}: monthly={monthly_minor} spent={spent} got {}",
                v["level"]
            );
        }
    }

    #[test]
    fn budget_status_snooze_suppresses_but_reports() {
        // 两段 env 必须**串行**（先整体 drop 第一组的 guard 再进第二组）：
        // fresh_budget_env 拿进程级 ENV_LOCK，_guard 活着时再调就是自己锁
        // 自己（本测试第一版挂死的直接原因，sample 栈钉在
        // pthread_mutex_lock_wait 上）。
        let far = crate::sql_sync::now_ms() + 86_400_000;
        {
            let (_guard, db, month) = fresh_budget_env("snooze");
            db.budget_config_set(60_000, 3_000, 8_000, 1).unwrap();
            // snooze 到远未来：status 报 snoozed_until_ms；snooze 行优先于
            // 超支判断的呈现（level 仍如实，抑制由消费方决定）。
            db.budget_snooze_set(far, 1).unwrap();
            drop(db);
            // guard 还活着：budget_status_sql 在同一 env 内重开库。
            let v = budget_status_sql(&month).unwrap();
            assert_eq!(v["snoozed_until_ms"], json!(far));
        }
        // 过期 snooze（过去时刻）不抑制：独立 env。
        {
            let (_guard, db, month) = fresh_budget_env("snooze2");
            db.budget_config_set(60_000, 3_000, 8_000, 1).unwrap();
            db.budget_snooze_set(crate::sql_sync::now_ms() - 1_000, 1).unwrap();
            drop(db);
            let v = budget_status_sql(&month).unwrap();
            assert_eq!(v["snoozed_until_ms"], Value::Null, "过期 snooze 视同无");
        }
    }

    /// 参数化入口（Tier B 预算卡收尾）：`budget_status_sql_at` 显式收
    /// `data_home`，**不碰进程 env**——Tauri `read_overview_at(dh)` 组装入口和
    /// 临时库单测据此对指定库跑预算判定，不必持 `ENV_LOCK`、不受并发测试改
    /// `AGENT_VITALS_HOME` 影响。失败历史：ZST `SqlSummaryRepository` 只认
    /// `crate::home::data_home()`，组装入口传进来的 `dh` 被内部忽略，预算卡
    /// 永远在真机库上跑（本次会话连续 4 次实现失败的直接原因）。
    ///
    /// **本用例故意不取 `ENV_LOCK`**：若 `budget_status_sql_at` 真的只读传入
    /// 的 `dir`，并发测试改不改 `AGENT_VITALS_HOME` 都不影响它——能无锁跑通
    /// 本身就是「参数化到位」的证明。
    #[test]
    fn budget_status_sql_at_reads_the_passed_data_home_without_touching_env() {
        let month = crate::clock::current_month_beijing();
        let (start, _) =
            agent_vitals_data::authority_query::beijing_month_bounds_ms(&month).unwrap();

        // 两个独立库、同一份预算配置——只有 `spender` 库里 seed 了 DSH 事实。
        let fresh = |tag: &str| -> std::path::PathBuf {
            let d = std::env::temp_dir()
                .join(format!("av-budget-status-at-{tag}-{}", std::process::id()));
            let _ = std::fs::remove_dir_all(&d);
            std::fs::create_dir_all(&d).unwrap();
            let db = agent_vitals_data::authority::AuthorityDb::open(
                &agent_vitals_data::authority::default_authority_path(&d),
                1,
            )
            .unwrap();
            db.budget_config_set(60_000, 3_000, 8_000, 1).unwrap(); // ¥600 / ¥30 / 80%
            if tag == "spender" {
                seed_fact_min(
                    &db, "at1", "dsh", "deepseek-v4-flash", start + 1_000, 1_000_000, 100_000,
                );
            }
            d
        };
        let dir_spender = fresh("spender");
        let dir_empty = fresh("empty");

        // **本用例故意不取 `ENV_LOCK`**：若两次调用都只读各自传入的 dir，并发
        // 测试改不改 `AGENT_VITALS_HOME` 都不影响结果。若 `SqlSummaryRepository
        // ::at()` 有 bug、内部退回 env 库，则两次调用读同一个（真机）库、spent
        // 必然相等，`>` 断言当场翻红——与真机本月有无 DSH 消费无关。
        let v_spender = budget_status_sql_at(&dir_spender, &month).expect("库可开");
        let v_empty = budget_status_sql_at(&dir_empty, &month).expect("库可开");
        assert_eq!(v_spender["data_source"], "sql_authority");
        assert_eq!(v_spender["monthly_cny_minor"], json!(60_000), "配置读自传入的 dir");
        // 注意：`spent_empty` 不是 0——`apply_subscription_fees` 会把声明的
        // CNY 订阅月费（GLM/MiniMax）按月摊进 by_provider，零用量月份照摊
        // （§6.7「不付用量也在付」）。断言只看**相对量**：seed 了 DSH 事实的
        // 库必须严格更大。
        let spent_spender = v_spender["spent_cny_minor"].as_i64().unwrap();
        let spent_empty = v_empty["spent_cny_minor"].as_i64().unwrap();
        assert!(
            spent_spender > spent_empty,
            "seed 了 DSH 事实的库 spent 必须严格更大——传入的 data_home 被真正使用\
             （spender={spent_spender} empty={spent_empty}）"
        );
        let _ = std::fs::remove_dir_all(&dir_spender);
        let _ = std::fs::remove_dir_all(&dir_empty);
    }
}
