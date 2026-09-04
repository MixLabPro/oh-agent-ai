//! 状态写链的 **I/O + 时间侧**（R1c）。
//!
//! 纯合并规则在 core（`agent_vitals_domain::state`），本模块只做：state 目录定位、
//! 原子写（递归 sort_keys + indent=2，逐字节复刻 Python `_atomic_write`）、
//! UTC now / 北京日期生成、以及把 core 规则接起来的写入口：
//! `merge_today` / `merge_month` / `write_oneline` / `write_alert` /
//! `append_session_history` / `set_snooze` / `clear_snooze`。
//!
//! 逐字节一致性由 `tests/test_cli_matrix.py::CliMatrix` 的差分钉住（同一 HOME
//! 跑 Python 与 Rust 两边，`generated_at` / `archived_at` 打码后文件逐字节相等）。
//! 与 `budget.rs` 同款边界：这里不重写任何算术。
//!
//! **flock 已知限制**（2026-08 决定，不是 bug）：`std::fs::File::lock` 是 Rust
//! 1.89 才进 std，本 crate MSRV 1.74。Python 用 `fcntl.flock` 防并发
//! read-modify-write 互相覆盖；这里靠「写 tmp → rename」的原子性（Python 自己的
//! 注释也承认 rename 已经原子，锁只防两个并发审计各读各写）。tick 的单写者假设
//! 成立（R1a 起只有一个 tick）；真正的并发防护是 R1d 的 writer_epoch/owner
//! fencing，那才是有明确归宿的下一步，而不是在这里抄一把 std 里没有的 flock。
//!
//! **write_config（config.toml 写）不在本模块** —— 它是 TOML 文本手术（Python
//! `budget.write_config` 的 append/upsert），不是 tick 写链的一环（tick 不写配置，
//! 配置是用户 `budget set` 动作），随 R1d 的 `budget set` CLI 落地。

use std::io::Write;
use std::path::{Path, PathBuf};

use serde_json::{json, Map, Value};

use agent_vitals_domain::util::civil_from_unix_secs;
use crate::clock::{current_month_beijing, today_beijing};
use crate::home::data_home;

use agent_vitals_domain::state as state_core;

/// 数据根 `state/` 目录 —— 与 Python `state.state_dir()` 同路径。
/// `pub(crate)`：R1d 的 `agent::takeover`（fold 驱动）复用同一个根。
pub fn state_dir() -> PathBuf {
    data_home().join("state")
}

fn archive_path() -> PathBuf {
    state_dir().join("month-archive.json")
}

/// 复刻 Python `state._read`：缺文件 / 坏 JSON → None（「缺列不编列」）。
/// `pub(crate)`：R1d 的 `agent::takeover` 读 manifest/ledger/machine.json 复用。
pub fn read_json(p: &Path) -> Option<Value> {
    let text = std::fs::read_to_string(p).ok()?;
    serde_json::from_str(&text).ok()
}

/// 仅测试用（yesterday_bj 等夹具日期）；生产路径用 now_iso_utc 的 SystemTime。
#[cfg(test)]
fn now_unix_secs() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

/// 复刻 Python `_now_iso()` = `datetime.now(timezone.utc).isoformat()`。
///
/// 微秒为 0 时 Python **省略** `.000000`（`datetime(...).isoformat()` 不输出全零
/// 分数）—— 这里也省略，否则亚秒为 0 的那一刻写出的时间戳与 Python 格式不符。
/// 差分测试里 `generated_at` 一律打码，所以这个格式只影响真实写出的文件与
/// Python 读者（`fromisoformat` 两种都吃）。
pub fn now_iso_utc() -> String {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default();
    let secs = now.as_secs() as i64;
    let (y, m, d) = civil_from_unix_secs(secs, 0);
    let micros = now.subsec_micros();
    let hh = (secs % 86400) / 3600;
    let mm = (secs % 3600) / 60;
    let ss = secs % 60;
    let frac = if micros == 0 {
        String::new()
    } else {
        format!(".{micros:06}")
    };
    format!("{y:04}-{m:02}-{d:02}T{hh:02}:{mm:02}:{ss:02}{frac}+00:00")
}

/// 递归按 key 排序 —— 复刻 Python `json.dump(sort_keys=True)` 的**每一层**排序。
/// serde_json 的 `to_string_pretty` 只保证结构，key 顺序由插入顺序（preserve_order）
/// 决定；必须显式排一遍才能与 Python 逐字节一致。
pub fn sort_keys(v: &Value) -> Value {
    match v {
        Value::Object(m) => {
            let mut pairs: Vec<(String, Value)> = m
                .iter()
                .map(|(k, val)| (k.clone(), sort_keys(val)))
                .collect();
            pairs.sort_by(|a, b| a.0.cmp(&b.0));
            let mut out = Map::new();
            for (k, val) in pairs {
                out.insert(k, val);
            }
            Value::Object(out)
        }
        Value::Array(a) => Value::Array(a.iter().map(sort_keys).collect()),
        other => other.clone(),
    }
}

/// 原子写 —— 复刻 Python `state._atomic_write`：写 `<file>.tmp.<pid>` → fsync →
/// `rename`。POSIX rename 原子：任何读者要么见旧版要么见新版。出错清理 tmp，
/// 不给 state 目录留垃圾。
pub fn atomic_write_json(path: &Path, data: &Value) {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).expect("cannot create state dir");
    }
    let sorted = sort_keys(data);
    let text = serde_json::to_string_pretty(&sorted)
        .expect("state values are always serializable (no datetime/NaN)");
    // serde_json 的 pretty 输出与 Python indent=2 的 `", "`/`": "` 逐字节一致；
    // to_string_pretty 不补尾换行，Python json.dump 也不补 —— 一致。
    let file_name = path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("state.json");
    let tmp_path = path.with_file_name(format!("{file_name}.tmp.{}", std::process::id()));
    let write_result = (|| -> std::io::Result<()> {
        let mut f = std::fs::File::create(&tmp_path)?;
        f.write_all(text.as_bytes())?;
        f.sync_all()?; // Python 的 flush + fsync
        std::fs::rename(&tmp_path, path)?; // atomic on POSIX
        Ok(())
    })();
    if let Err(e) = write_result {
        let _ = std::fs::remove_file(&tmp_path);
        panic!("atomic write to {path:?} failed: {e}");
    }
}

/// 复刻 `merge_today(hb, by_model)`：先跨 BJ 0:00 滚动（rotate），再把今天的小时
/// 桶合并进 today.json。`by_model` 必须是**已经按今天切好片**的那一份
/// （`token_by_date_model(events)[今天]`），否则整段会话的账会被收进今天
/// （70× 事故，见 core `merge_today_state` 注释）。
pub fn merge_today(hb: &Value, by_model: Option<&Value>) -> PathBuf {
    let path = state_dir().join("today.json");
    let now = now_iso_utc();
    let today_key = today_beijing();
    let existing = read_json(&path).unwrap_or_else(|| json!({}));
    let existing = match state_core::rotate_today_state(&existing, &today_key, &now) {
        Some(rotated) => {
            atomic_write_json(&path, &rotated);
            rotated
        }
        None => existing,
    };
    let merged = state_core::merge_today_state(&existing, hb, by_model, &today_key, &now);
    atomic_write_json(&path, &merged);
    path
}

/// 复刻 `merge_month(hb, by_date_model)`：先迁旧月进归档（逐日替换、幂等），再落
/// 新数据（当前月进 month.json、历史月累加进归档）。**month.json 只保存当前自然
/// 月** —— 跨月的日子进 month-archive.json，这是 201× 月总账事故的修复。
///
/// 两阶段顺序有意为之：迁移写回归档**之后**，回填的 `prev` 才能看到刚迁入的
/// 完整一天（core `merge_month_body` 头注释），跨月后重跑上个月的 oneline 不会
/// 丢账。
pub fn merge_month(hb: &Value, by_date_model: Option<&Value>) -> PathBuf {
    let path = state_dir().join("month.json");
    let now = now_iso_utc();
    let current = current_month_beijing();
    let existing = read_json(&path).unwrap_or_else(|| json!({}));
    let mut archive = read_json(&archive_path()).unwrap_or_else(|| json!({}));

    // ① 先迁旧月（`_archive_days(stale)` —— 逐日替换，幂等）
    let stale = state_core::stale_days(&existing, &current);
    if stale.as_object().is_some_and(|m| !m.is_empty()) {
        archive = state_core::add_days_to_archive(&archive, &stale, &now);
        atomic_write_json(&archive_path(), &archive);
    }
    // ② 再落新数据 —— 回填拿**迁移之后**的归档当 prev（Python 二次 `_read` 同点）
    let body = state_core::merge_month_body(&existing, hb, by_date_model, &current, &now, &archive);
    if body.backfill_days.as_object().is_some_and(|m| !m.is_empty()) {
        let archive2 = state_core::add_days_to_archive(&archive, &body.backfill_days, &now);
        atomic_write_json(&archive_path(), &archive2);
    }
    atomic_write_json(&path, &body.month_json);
    path
}

/// `state by-source` 的读路径：month.json 的**逐日** by_source（`days[date]
/// ["by_source"]`）折平成 `{source: {model: 8桶}}`（core `rollup_by_source`），
/// 再按主账单同一套 `cost_report` 计价成 `{source: {total, peak_total,
/// unpriced_tokens}}`。
///
/// 输出 JSON 两个键：`by_source`（token 形状，人眼核对来源）与
/// `by_source_cost`（钱）。month.json 没有 by_source（老数据）→ 两个键都空，
/// **不摆全零结构**——「这个月还没有按来源记账」和「全来源花了 0 元」是两件事。
/// 计价来源一律回落原厂价（month.json 不存 providers），与 `priced_day` 对同一
/// 份 month.json 的处理一致，同一个来源的钱在两个 surface 上不会算岔。
pub fn by_source_report() {
    let path = state_dir().join("month.json");
    let Some(month) = read_json(&path) else {
        println!(r#"{{"by_source": {{}}, "by_source_cost": null}}"#);
        return;
    };
    let rollup = state_core::rollup_by_source(&month);
    if rollup.as_object().map_or(true, |m| m.is_empty()) {
        println!(r#"{{"by_source": {{}}, "by_source_cost": null}}"#);
        return;
    }
    let pricing = agent_vitals_domain::cost::load_pricing();
    let cost = agent_vitals_domain::cost::cost_report(&json!({"by_source": rollup}), &pricing);
    println!(
        "{}",
        serde_json::to_string_pretty(&json!({
            "by_source": rollup,
            "by_source_cost": cost,
        }))
        .unwrap_or_default()
    );
}

/// v0.7 spec §3「按 provider/model 月成本」的首个落地输出面：零新数据、零新
/// 持久化——把 month.json 逐日 by_model 折平成月度粒度（`state_core::rollup_by_model`），
/// 复用既有 `cost::cost_report` 计价。与 `by_source_report` 同一套读法，只是
/// 折平的键换成模型名（镜像 `cli.py` 的 `state by-model` 分支）。
pub fn by_model_report() {
    let path = state_dir().join("month.json");
    let Some(month) = read_json(&path) else {
        println!(r#"{{"by_model": {{}}, "by_model_cost": null}}"#);
        return;
    };
    let rollup = state_core::rollup_by_model(&month);
    if rollup.as_object().map_or(true, |m| m.is_empty()) {
        println!(r#"{{"by_model": {{}}, "by_model_cost": null}}"#);
        return;
    }
    let pricing = agent_vitals_domain::cost::load_pricing();
    let cost = agent_vitals_domain::cost::cost_report(&json!({"by_model": rollup}), &pricing);
    println!(
        "{}",
        serde_json::to_string_pretty(&json!({
            "by_model": rollup,
            "by_model_cost": cost,
        }))
        .unwrap_or_default()
    )
}

/// v0.7 spec §3「未落入已声明订阅覆盖范围（估算）」的 CLI 接线：把 month.json
/// 逐日 by_model 折平成月度粒度后，再做一次 **8 桶 DSH 形状 → Claude 4 型
/// snake 形状** 的薄适配（`uncached_input_tokens`→`input_tokens`、
/// `cache_read_tokens`→`cache_read_input_tokens`、`cache_write_tokens`→
/// `cache_creation_input_tokens`、`output_tokens`→`output_tokens`，丢弃
/// `peak_*`），然后喂 core 的 `claude_subscription_uncovered_estimate`。
///
/// month.json 缺 / 没 by_model → `{"by_model": {}, "uncovered": null}`，
/// 不摆全零结构（与 `by_model_report` 同款诚实降级）。`uncovered` 顶层
/// `pricing_basis` 已被 core 函数改写成 `"estimated-subscription-exclusion"`，
/// 不在这里二次加工——core 是单一定价决策点，不长第二份改写。
pub fn uncovered_report() {
    let path = state_dir().join("month.json");
    let Some(month) = read_json(&path) else {
        println!(r#"{{"by_model": {{}}, "uncovered": null}}"#);
        return;
    };
    let rollup = state_core::rollup_by_model(&month);
    if rollup.as_object().map_or(true, |m| m.is_empty()) {
        println!(r#"{{"by_model": {{}}, "uncovered": null}}"#);
        return;
    }
    // DSH 8 桶 → Claude 4 型 snake 适配：peak_* 丢弃、其他键按 catalog 输入
    // 约定改名（与 `cost.py::claude_subscription_uncovered_estimate` 的输入
    // 形状逐字段对齐）。未知模型 token 字段缺失 → 该模型不进入 uncovered 视图
    // （core 的 `resolve_card_catalog` 返回 None 即丢弃）。
    let mut claude_models = Map::new();
    if let Some(obj) = rollup.as_object() {
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
    let pricing = agent_vitals_domain::cost::load_pricing();
    let uncovered = agent_vitals_domain::cost::claude_subscription_uncovered_estimate(
        &claude_models, &pricing);
    println!(
        "{}",
        serde_json::to_string_pretty(&json!({
            "by_model": Value::Object(claude_models),
            "uncovered": uncovered,
        }))
        .unwrap_or_default()
    )
}

/// v0.7 spec §3「名义 vs 实际单位成本（节约因子）」的 CLI 接线：把 month.json
/// 逐日 by_model 折平成月度粒度后，喂 core 的 `nominal_vs_actual_cost`——
/// 月级数据没有 `providers`（month.json 不存），各家模型自然走 fallback 价卡，
/// 与 `priced_day` 对同一份 month.json 的处理一致，同一个模型的"实际"和
/// "名义"在两种 surface 上不会算岔。
///
/// month.json 缺 / 没 by_model → `{"by_model": {}, "savings": null}`，不摆
/// 全零结构。`savings` 顶层 `ratio = actual / nominal`；无缓存命中的语料下
/// 恒为 1.0（spec §3 原文引用，2026-09-02 实测值），不是 bug——这是"当前能
/// 表达的节约来源只有缓存"这一事实的忠实反映。
pub fn savings_report() {
    let path = state_dir().join("month.json");
    let Some(month) = read_json(&path) else {
        println!(r#"{{"by_model": {{}}, "savings": null}}"#);
        return;
    };
    let rollup = state_core::rollup_by_model(&month);
    if rollup.as_object().map_or(true, |m| m.is_empty()) {
        println!(r#"{{"by_model": {{}}, "savings": null}}"#);
        return;
    }
    let pricing = agent_vitals_domain::cost::load_pricing();
    let savings = agent_vitals_domain::cost::nominal_vs_actual_cost(
        &json!({"by_model": rollup}), &pricing);
    println!(
        "{}",
        serde_json::to_string_pretty(&json!({
            "by_model": rollup,
            "savings": savings,
        }))
        .unwrap_or_default()
    )
}

/// 复刻 `write_oneline(audit)`：单次审计快照，原地覆盖 + schema_version + generated_at。
pub fn write_oneline(audit: &Value) -> PathBuf {
    let path = state_dir().join("oneline.json");
    let mut data = audit.clone();
    data["schema_version"] = json!(state_core::SCHEMA_VERSION);
    data["generated_at"] = json!(now_iso_utc());
    atomic_write_json(&path, &data);
    path
}

/// 复刻 `write_alert(alert)`：`budget.evaluate()` 结果落盘，xbar 只读消费者。
pub fn write_alert(alert: &Value) -> PathBuf {
    let path = state_dir().join("alert.json");
    let mut data = alert.clone();
    data["schema_version"] = json!(state_core::SCHEMA_VERSION);
    data["generated_at"] = json!(now_iso_utc());
    atomic_write_json(&path, &data);
    path
}

/// Python `json.dumps` 默认（无 indent）分隔符：`", "` 与 `": "`。serde_json 内置
/// compact 是 `,` `:`（无空格），与 Python **逐字节不一致** —— sessions.jsonl 的
/// 行格式是 Python 读者还在用的契约，必须一致。用自定义 Formatter 复刻。
struct PyCompact;

impl serde_json::ser::Formatter for PyCompact {
    fn begin_object<W>(&mut self, writer: &mut W) -> std::io::Result<()>
    where
        W: ?Sized + std::io::Write,
    {
        writer.write_all(b"{")
    }
    fn end_object<W>(&mut self, writer: &mut W) -> std::io::Result<()>
    where
        W: ?Sized + std::io::Write,
    {
        writer.write_all(b"}")
    }
    fn begin_array<W>(&mut self, writer: &mut W) -> std::io::Result<()>
    where
        W: ?Sized + std::io::Write,
    {
        writer.write_all(b"[")
    }
    fn end_array<W>(&mut self, writer: &mut W) -> std::io::Result<()>
    where
        W: ?Sized + std::io::Write,
    {
        writer.write_all(b"]")
    }
    fn begin_object_key<W>(&mut self, writer: &mut W, first: bool) -> std::io::Result<()>
    where
        W: ?Sized + std::io::Write,
    {
        if !first {
            writer.write_all(b", ")?;
        }
        Ok(())
    }
    // 这个 serde_json 版本里分隔符的归属：`end_object_key` 默认**什么都不写**，
    // 冒号由 `begin_object_value` 负责（旧版是 end_object_key 写 `:`）。两边都覆写
    // 会把冒号写两遍 —— `{...": :"}` 就是这么来的。改成了 Python 的分隔符
    // （`", "` / `": "`）必须只写一次，所以 key 分隔放在 `begin_object_value`。
    fn end_object_key<W>(&mut self, _writer: &mut W) -> std::io::Result<()>
    where
        W: ?Sized + std::io::Write,
    {
        Ok(())
    }
    fn begin_object_value<W>(&mut self, writer: &mut W) -> std::io::Result<()>
    where
        W: ?Sized + std::io::Write,
    {
        writer.write_all(b": ")
    }
    fn begin_array_value<W>(&mut self, writer: &mut W, first: bool) -> std::io::Result<()>
    where
        W: ?Sized + std::io::Write,
    {
        if !first {
            writer.write_all(b", ")?;
        }
        Ok(())
    }
    fn end_array_value<W>(&mut self, _writer: &mut W) -> std::io::Result<()>
    where
        W: ?Sized + std::io::Write,
    {
        Ok(())
    }
}

/// 用 Python 分隔符序列化（不 sort_keys —— Python 的 JSONL 行也不排）。
fn py_compact_json(v: &Value) -> String {
    let mut out = Vec::new();
    {
        use serde::Serialize;
        let mut ser = serde_json::Serializer::with_formatter(&mut out, PyCompact);
        v.serialize(&mut ser).expect("state values are serializable");
    }
    String::from_utf8(out).expect("JSON output is valid UTF-8")
}

/// 复刻 `append_session_history(summary)`：append 一行到 sessions.jsonl，自动补
/// generated_at（已有则不覆盖）。JSONL 用 Python 默认分隔符（`,` + `:` 带空格），
/// 不 sort_keys —— 与 `state.py` 的 `json.dumps(payload, ensure_ascii=False)` 一致。
pub fn append_session_history(summary: &Value) -> PathBuf {
    let path = state_dir().join("sessions.jsonl");
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).expect("cannot create state dir");
    }
    let mut payload = summary.clone();
    if payload.get("generated_at").is_none() {
        payload["generated_at"] = json!(now_iso_utc());
    }
    let line = py_compact_json(&payload);
    let mut f = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)
        .expect("cannot open sessions.jsonl for append");
    f.write_all(line.as_bytes())
        .expect("cannot append to sessions.jsonl");
    f.write_all(b"\n").expect("cannot append to sessions.jsonl");
    path
}

/// 复刻 `budget.py::set_snooze(until_iso, reason)`：把 snoozed_until 规整成
/// Python `datetime.fromisoformat(...).isoformat()` 的形状（裸时间戳按北京时区，
/// 见 `_read_snooze` 同一约定）写进 budget.json。`until_iso` 不是合法 ISO → None
/// （Python 抛 ValueError，CLI 层负责报错）。
pub fn set_snooze(until_iso: &str, reason: &str) -> Option<PathBuf> {
    let normalized = snooze_iso_normalize(until_iso)?;
    let path = state_dir().join("budget.json");
    let payload = json!({
        "snoozed_until": normalized,
        "snooze_reason": reason,
        "schema_version": "1.0.0",
    });
    atomic_write_json(&path, &payload);
    Some(path)
}

/// 复刻 `budget.py::clear_snooze()`：删除 budget.json。
pub fn clear_snooze() {
    let p = state_dir().join("budget.json");
    if p.is_file() {
        std::fs::remove_file(&p).ok();
    }
}

/// 规整 ISO 时间串为 Python `datetime.fromisoformat(s).isoformat()` 形状。
///
/// 只处理 tick / CLI 会喂进来的形状（`_read_snooze` 的注释也承认：写链永远写
/// `T` 分隔）：`YYYY-MM-DD`、`YYYY-MM-DD[T| ]HH:MM:SS`、可选 `.fraction`、可选
/// offset（`±HH` / `±HHMM` / `±HH:MM` / `Z`）。裸时间戳补 `+08:00`（BJ 约定）；
/// date-only 补 `T00:00:00`；分数截到 6 位微秒、不足补零（Python 存储语义）。
fn snooze_iso_normalize(s: &str) -> Option<String> {
    let s = s.trim();
    let b = s.as_bytes();
    if b.len() < 10 || b[4] != b'-' || b[7] != b'-' {
        return None;
    }
    let y: i64 = s[0..4].parse().ok()?;
    let m: u32 = s[5..7].parse().ok()?;
    let d: u32 = s[8..10].parse().ok()?;
    if !(1..=12).contains(&m) || !(1..=31).contains(&d) {
        return None;
    }
    let rest = &s[10..];
    if rest.is_empty() {
        return Some(format!("{y:04}-{m:02}-{d:02}T00:00:00+08:00"));
    }
    let sep = rest.as_bytes()[0];
    if sep != b'T' && sep != b' ' {
        return None;
    }
    if rest.len() < 9 {
        return None; // 至少 HH:MM:SS
    }
    let hh: u32 = rest[1..3].parse().ok()?;
    let mm: u32 = rest[4..6].parse().ok()?;
    let ss: u32 = rest[7..9].parse().ok()?;
    if hh > 23 || mm > 59 || ss > 59 {
        return None;
    }
    let mut tail = &rest[9..];
    let mut frac = String::new();
    if tail.starts_with('.') {
        let digits: String = tail[1..].chars().take_while(|c| c.is_ascii_digit()).collect();
        if digits.is_empty() {
            return None;
        }
        let digits_len = digits.len();
        let mut f = digits;
        if f.len() > 6 {
            f.truncate(6);
        }
        while f.len() < 6 {
            f.push('0');
        }
        frac = format!(".{f}");
        tail = &tail[1 + digits_len..];
    }
    let offset = if tail.is_empty() {
        "+08:00".to_string()
    } else if tail == "Z" || tail == "z" {
        "+00:00".to_string()
    } else {
        if !(tail.starts_with('+') || tail.starts_with('-')) {
            return None;
        }
        let sign = tail[0..1].to_string();
        let digits = &tail[1..];
        let (oh, om): (i32, i32) = if digits.len() == 2 {
            (digits.parse().ok()?, 0)
        } else if digits.len() == 5 && digits.as_bytes()[2] == b':' {
            (digits[0..2].parse().ok()?, digits[3..5].parse().ok()?)
        } else if digits.len() == 4 {
            (digits[0..2].parse().ok()?, digits[2..4].parse().ok()?)
        } else {
            return None;
        };
        if oh > 23 || om > 59 {
            return None;
        }
        format!("{sign}{oh:02}:{om:02}")
    };
    Some(format!("{y:04}-{m:02}-{d:02}T{hh:02}:{mm:02}:{ss:02}{frac}{offset}"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicUsize, Ordering};

    /// 环境锁是进程级的（util::ENV_LOCK），不是本模块局部的 —— budget 的测试
    /// 也改 AGENT_VITALS_HOME，各自一把锁就互相踩踏（见 util.rs 注释）。
    /// tmp_home 的唯一化计数器（每个测试独立 home，见 tmp_home 注释）。
    static HOME_SEQ: AtomicUsize = AtomicUsize::new(0);

    /// 把 AGENT_VITALS_HOME 指到夹具根，Drop 时恢复原值。
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
        // 每个测试一个**唯一**子目录：所有测试共用同一 base（`av-state-test-<pid>`），
        // 若都写同一个 `home`，today.json/month.json/archive 会在测试间泄漏 ——
        // 前一个测试留下的桶被后一个合并，`merge_today_writes_filtered_buckets`
        // 的 150 变 160 就是这么来的（上一测试 hour9=10 残留）。序列号保证隔离。
        let seq = HOME_SEQ.fetch_add(1, Ordering::Relaxed);
        let home = t.join(format!("home-{seq}"));
        std::fs::create_dir_all(home.join("state")).unwrap();
        home
    }

    fn write(p: &Path, text: &str) {
        std::fs::create_dir_all(p.parent().unwrap()).unwrap();
        std::fs::write(p, text).unwrap();
    }

    fn yesterday_bj() -> String {
        let (y, m, d) = civil_from_unix_secs(now_unix_secs() - 86400, 8 * 3600);
        format!("{y:04}-{m:02}-{d:02}")
    }

    /// 上月（YYYY-MM），带年借位。
    fn prev_month_bj() -> String {
        let cur = current_month_beijing();
        let y: i32 = cur[0..4].parse().unwrap();
        let m: u32 = cur[5..7].parse().unwrap();
        if m == 1 {
            format!("{}-12", y - 1)
        } else {
            format!("{y:04}-{:02}", m - 1)
        }
    }

    #[test]
    fn now_iso_utc_is_python_shape() {
        // Python `datetime.now(timezone.utc).isoformat()`：UTC `+00:00` 后缀。
        let s = now_iso_utc();
        let has_t = s.contains('T');
        let has_offset = s.ends_with("+00:00");
        let date_ok = s.len() >= 19 && s.as_bytes()[4] == b'-' && s.as_bytes()[7] == b'-';
        assert!(has_t && has_offset && date_ok, "unexpected shape: {s}");
    }

    #[test]
    fn sort_keys_recursive() {
        // Python `sort_keys=True` 排每一层；数组不排序（保持顺序）。
        let v = json!({"b": 1, "a": {"d": 2, "c": 3}, "arr": [{"y": 1, "x": 2}]});
        let sorted = sort_keys(&v);
        assert_eq!(
            sorted,
            json!({"a": {"c": 3, "d": 2}, "arr": [{"x": 2, "y": 1}], "b": 1})
        );
        let text = serde_json::to_string_pretty(&sorted).unwrap();
        assert!(text.find("\"a\": {").is_some());
    }

    #[test]
    fn atomic_write_sorts_keys_and_no_trailing_newline() {
        let _env = crate::ENV_LOCK.lock().unwrap();
        let home = tmp_home(&std::env::temp_dir().join(format!("av-state-test-{}", std::process::id())));
        let _guard = TestEnvGuard::set(&home);
        let p = state_dir().join("probe.json");
        atomic_write_json(&p, &json!({"z": 1, "a": {"m": 2, "l": 3}}));
        let text = std::fs::read_to_string(&p).unwrap();
        // 与 Python json.dump(indent=2, sort_keys=True) 逐字节：2 空格缩进 + 排序 + 无尾换行
        assert_eq!(
            text,
            "{\n  \"a\": {\n    \"l\": 3,\n    \"m\": 2\n  },\n  \"z\": 1\n}"
        );
    }

    #[test]
    fn merge_today_writes_filtered_buckets() {
        // 全部桶都属今天 → 直接合并；by_model 与 buckets 并列写入。
        let _env = crate::ENV_LOCK.lock().unwrap();
        let home = tmp_home(&std::env::temp_dir().join(format!("av-state-test-{}", std::process::id())));
        let _guard = TestEnvGuard::set(&home);
        let today = today_beijing();
        let hb = json!({"buckets": [
            {"date": today, "hour": 9, "uncached_input_tokens": 100},
            {"date": today, "hour": 9, "uncached_input_tokens": 50},
        ]});
        let bm = json!({"deepseek-v4-flash": {
            "uncached_input_tokens": 150, "output_tokens": 0,
            "cache_read_tokens": 0, "cache_write_tokens": 0,
            "peak_uncached_input_tokens": 150, "peak_output_tokens": 0,
            "peak_cache_read_tokens": 0, "peak_cache_write_tokens": 0}});
        merge_today(&hb, Some(&bm));
        let f = read_json(&state_dir().join("today.json")).unwrap();
        assert_eq!(f["date"], today);
        assert_eq!(f["buckets"]["9"]["uncached_input_tokens"], 150);
        assert_eq!(f["by_model"]["deepseek-v4-flash"]["uncached_input_tokens"], 150);
        assert_eq!(f["schema_version"], state_core::SCHEMA_VERSION);
        assert!(f.get("generated_at").is_some());
    }

    #[test]
    fn merge_today_rotates_across_midnight() {
        // today.json 里是昨天 → 合并前先滚动成空桶 + 新日期 + rotated_from。
        let _env = crate::ENV_LOCK.lock().unwrap();
        let home = tmp_home(&std::env::temp_dir().join(format!("av-state-test-{}", std::process::id())));
        let _guard = TestEnvGuard::set(&home);
        let today = today_beijing();
        let yesterday = yesterday_bj();
        write(
            &state_dir().join("today.json"),
            &serde_json::to_string_pretty(&json!({
                "schema_version": "1.0.0", "date": yesterday,
                "buckets": {"21": {"uncached_input_tokens": 500}},
                "generated_at": "old",
            }))
            .unwrap(),
        );
        let hb = json!({"buckets": [
            {"date": today, "hour": 9, "uncached_input_tokens": 10},
        ]});
        merge_today(&hb, None);
        let f = read_json(&state_dir().join("today.json")).unwrap();
        assert_eq!(f["date"], today);
        assert_eq!(f["rotated_from"], yesterday);
        // rotate 把旧桶清空了，只留今天的新桶 —— 旧数据不搬 month（merge_month 独家）
        assert_eq!(f["buckets"].as_object().unwrap().len(), 1);
        assert_eq!(f["buckets"]["9"]["uncached_input_tokens"], 10);
    }

    #[test]
    fn merge_month_migrates_stale_then_merges_current() {
        // month.json 里是上个月的日子 → 迁进归档；新数据（当前月）折进 days。
        let _env = crate::ENV_LOCK.lock().unwrap();
        let home = tmp_home(&std::env::temp_dir().join(format!("av-state-test-{}", std::process::id())));
        let _guard = TestEnvGuard::set(&home);
        let cur = current_month_beijing();
        let prev = prev_month_bj();
        let prev_date = format!("{prev}-15");
        write(
            &state_dir().join("month.json"),
            &serde_json::to_string_pretty(&json!({
                "month": cur,  // 盖的戳是新的 —— 不按它过滤
                "days": {prev_date.clone(): {"uncached_input_tokens": 10}},
                "schema_version": "1.0.0", "generated_at": "old",
            }))
            .unwrap(),
        );
        let today = today_beijing();
        let hb = json!({"buckets": [
            {"date": today, "hour": 9, "uncached_input_tokens": 7},
        ]});
        merge_month(&hb, None);
        let f = read_json(&state_dir().join("month.json")).unwrap();
        let days = f["days"].as_object().unwrap();
        assert_eq!(days.len(), 1);
        assert!(days.contains_key(&today), "current-month day missing: {today}");
        assert_eq!(days[today.as_str()]["uncached_input_tokens"], 7);
        assert_eq!(f["month"], cur);
        // 上个月的日子进了归档
        let ar = read_json(&archive_path()).unwrap();
        let months = ar["months"].as_object().unwrap();
        assert!(months.contains_key(prev.as_str()));
        assert_eq!(months[prev.as_str()]["days"][prev_date.as_str()]["uncached_input_tokens"], 10);
    }

    #[test]
    fn write_oneline_and_alert_stamp_metadata() {
        let _env = crate::ENV_LOCK.lock().unwrap();
        let home = tmp_home(&std::env::temp_dir().join(format!("av-state-test-{}", std::process::id())));
        let _guard = TestEnvGuard::set(&home);
        let summary = json!({"session_id": "s1", "tokens_total": 100});
        let p = write_oneline(&summary);
        assert!(p.is_file());
        let f = read_json(&p).unwrap();
        assert_eq!(f["session_id"], "s1");
        assert_eq!(f["schema_version"], state_core::SCHEMA_VERSION);
        assert!(f.get("generated_at").is_some());

        let alert = json!({"level": "ok", "today_cost": 0.5});
        let a = write_alert(&alert);
        let fa = read_json(&a).unwrap();
        assert_eq!(fa["level"], "ok");
        assert_eq!(fa["schema_version"], state_core::SCHEMA_VERSION);
    }

    #[test]
    fn append_session_history_appends_with_py_separators() {
        // 行格式与 Python `json.dumps(payload, ensure_ascii=False)` 逐字节一致
        // （`, ` 与 `: ` 分隔符，非 serde 默认的 `,` `:`）。
        let _env = crate::ENV_LOCK.lock().unwrap();
        let home = tmp_home(&std::env::temp_dir().join(format!("av-state-test-{}", std::process::id())));
        let _guard = TestEnvGuard::set(&home);
        let summary = json!({"session_id": "s1", "cost_cny": 0.5});
        append_session_history(&summary);
        append_session_history(&summary);
        let lines: Vec<String> = std::fs::read_to_string(state_dir().join("sessions.jsonl"))
            .unwrap()
            .lines()
            .map(|s| s.to_string())
            .collect();
        assert_eq!(lines.len(), 2);
        assert!(lines[0].contains("\": \"s1\", \"cost_cny\": 0.5"), "got: {}", lines[0]);
        // generated_at 已自动补上
        let parsed: Value = serde_json::from_str(&lines[0]).unwrap();
        assert!(parsed.get("generated_at").is_some());
    }

    #[test]
    fn set_snooze_normalizes_and_writes() {
        let _env = crate::ENV_LOCK.lock().unwrap();
        let home = tmp_home(&std::env::temp_dir().join(format!("av-state-test-{}", std::process::id())));
        let _guard = TestEnvGuard::set(&home);
        // 带 offset 的输入往返不变（Python isoformat 保留原 offset）
        set_snooze("2026-08-28T14:53:00+08:00", "user-set").unwrap();
        let f = read_json(&state_dir().join("budget.json")).unwrap();
        assert_eq!(f["snoozed_until"], "2026-08-28T14:53:00+08:00");
        assert_eq!(f["snooze_reason"], "user-set");
        assert_eq!(f["schema_version"], "1.0.0");

        // 裸时间戳按北京时区解释（`_read_snooze` 同约定），分数补到 6 位微秒
        set_snooze("2026-08-28T14:53:00.5", "test").unwrap();
        let f2 = read_json(&state_dir().join("budget.json")).unwrap();
        assert_eq!(f2["snoozed_until"], "2026-08-28T14:53:00.500000+08:00");

        // date-only → T00:00:00+08:00
        set_snooze("2026-08-28", "test").unwrap();
        let f3 = read_json(&state_dir().join("budget.json")).unwrap();
        assert_eq!(f3["snoozed_until"], "2026-08-28T00:00:00+08:00");

        // 非法输入 → None（Python 抛 ValueError，CLI 层报错）
        assert!(set_snooze("not-a-date", "x").is_none());

        clear_snooze();
        assert!(!state_dir().join("budget.json").is_file());
    }
}
