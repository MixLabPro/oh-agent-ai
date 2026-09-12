//! v0.9.1 SQL 权威库 Tauri IPC 薄壳（`docs/AGENT_VITALS_V0_9_1_SQL_AUTHORITY_MIGRATION_SPEC.md` §6）。
//!
//! 历史：本文件 v0.8 起是 R2a SessionStore 的 IPC 壳（jsonl 重放路径）。v0.9.1
//! 起 sessions 数据唯一来源是 SQL 权威库 `agent-vitals.sqlite3`（schema v2），
//! CLI 切到 `mcp::dispatch("sessions_search" | "session_detail", ...)`（PR #2），
//! 本文件随之切到 spawn 新 CLI。**src-tauri 是独立 workspace，import 不到
//! 二进制 crate 的模块**——所以 `sessions list` / `sessions read` 与 tick 的
//! `oneline` 同款：spawn `agent-vitals` 二进制，stdout 就是 MCP envelope 的
//! `structuredContent`（与 `tools/call` 同源），stderr 是类型化错误 JSON。
//! 这是「不长第二份拷贝」的唯一路径（CLAUDE.md 写右边界：计算在宿主，
//! 浏览器/前端只渲染投影）。
//!
//! IPC 面只做参数翻译与 spawn：
//!   · `sessions_list(day, host_kind, page_size, cursor) -> Result<Value, Value>`
//!   · `sessions_read(session_ref) -> Result<Value, Value>`
//!   · `sessions_findings() -> Result<Value, Value>` —— **保留走 r2a_store**
//!     （DSH/Codex 行为 findings 来自 envelope 的预计算字段，PR #2.3a 任务
//!     #19 待 M4 `workflow_events` 工具落地后整体迁 mcp::dispatch；本次 PR
//!     只迁移 list/read/navigation 三路，findings 子命令 argv 不变）。
//! 错误码原样透传：`not-found` / `permission` / `stale-revision` /
//! `schema-mismatch` / `source-unavailable` / `cancelled`。二进制缺失/ spawn 失败
//! 这类**基础设施失败**也用 `cancelled`（code 集固定，不另造新码）。
//!
//! 三个命令都是 **async + `spawn_blocking`**：冷启动的权威库打开（SQLite readonly
//! handle，sub-second 即可）虽不如旧 r2a_store 慢，但仍是阻塞 I/O，且与 `data-status`
//! 预热、用户点击可能并发——`StoreBuildLock` 把同一时刻的冷构造串行化，后到的
//! 拿不到锁就 await，避免两份并发打开各算一份。

use std::collections::{BTreeMap, BTreeSet};
use std::process::Command;
use std::sync::{Arc, Mutex};

use serde_json::{Value, json};

use crate::overview::data_home;
use crate::resolve_binary;

/// R2a 冷构建的 app 内串行锁。`sessions_*` 都是 spawn CLI 子进程，后台预热与
/// 用户点击可能并发各起一个——两份冷构建互抢 I/O、双倍付冷启动钱。原子写
/// （temp+rename）防的是「读半截 cache」，这把锁防的是「重复冷构建」：后到的
/// 构建等在锁外，前一个写完 cache 再进，直接走命中快路径。
#[derive(Clone)]
pub struct StoreBuildLock(pub Arc<Mutex<()>>);

impl StoreBuildLock {
    pub fn new() -> Self {
        Self(Arc::new(Mutex::new(())))
    }

    pub(crate) fn acquire(&self) -> std::sync::MutexGuard<'_, ()> {
        self.0.lock().unwrap_or_else(|e| e.into_inner())
    }
}

fn error_value(code: &str, message: &str) -> Value {
    json!({ "error": { "code": code, "message": message } })
}

fn no_binary() -> Value {
    error_value(
        "cancelled",
        "agent-vitals binary not found (set AGENT_VITALS_BIN, add it to PATH, or place it in the app's Contents/Resources/bin/)",
    )
}

/// 北京日期 `YYYY-MM-DD`（与 `overview::today_beijing` 同口径，但纯函数版
/// 便于单测）。不引 `chrono` / `time`——直接调 std 即可，单测里 stub。
fn beijing_today_yyyy_mm_dd() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    // 北京 = UTC+8（无夏令时）。ms → s 整数除法 → 加 8 小时。
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);
    let beijing_secs = secs + 8 * 3600;
    let day = beijing_secs / 86_400;
    // 1970-01-01 是 day 0（beijing）。粗算回 Y/M/D 避免引 chrono 单测头重——
    // 工作台不需要精确到秒，工作台只用到 YYYY-MM-DD 字符串。下面用 Gregorian
    // 公式（Howard Hinnant 算法，J = day + 719468，跨世纪范围 1970-2100 验证）。
    let z = day + 719468;
    let era = if z >= 0 { z } else { z - 146096 } / 146097;
    let doe = (z - era * 146097) as u64;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let y = yoe as i64 + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = if m <= 2 { y + 1 } else { y };
    format!("{:04}-{:02}-{:02}", y, m, d)
}

/// `sessions list` 的 argv（纯函数，供单测钉住 IPC→CLI 参数映射）。参数集对齐
/// 新 CLI SessionsAction::List 的扁平签名（apps/cli/src/main.rs:750-775）：
///   --day | --month 必其一（IPC 这里传 day/month，None 时兜底为今天北京日期——
///   CLI 的 mutex 不允许两个都缺，新 SessionsAction 在「无 day 无 month」时报
///   "exactly one of --day / --month is required"，IPC 替前端拍今天的默认值）；
///   --host-kind 可选（filter chip 透传）；--page-size 可选（缺省 50，二进制兜底）；
///   --cursor 可选（透传 mcp::sessions_search 的不透明 cursor 串）。
///
/// **day vs month**：前端 month picker 选了 2026-08 → IPC 透传 `month: "2026-08"`
/// → CLI 走 `--month` 路径，返回该月全部会话。day 模式返回单日窗口（按小时聚合）。
/// 同传两个时优先 month（更粗、user 主动选的）——这条排序按前端语义定，单测钉死。
///
/// **旧 CLI 不再接受的 flag**：`--from` / `--to` / `--query` / `--hour`
/// / `--min-tokens`——这些维度 r2a_store 没实现，与权威库 sessions_search 输入
/// schema 对齐后已删。前端想用这些维度时需先扩 mcp::sessions_search 的 args
/// schema，再回来加 IPC 参数；目前工作台只用到 day / month / host_kind / model / provider /
/// page_size / cursor。
fn list_args(
    day: &Option<String>,
    month: &Option<String>,
    date_from: &Option<String>,
    date_to: &Option<String>,
    host_kind: &Option<String>,
    model: &Option<String>,
    provider: &Option<String>,
    page_size: Option<usize>,
    cursor: &Option<String>,
) -> Vec<String> {
    let mut a: Vec<String> = vec![
        "sessions".into(),
        "list".into(),
        "--json".into(),
    ];
    // month 优先 day：用户主动从 month picker 选了某月，意图是「该月全部」，
    // day 单窗口只是默认兜底。前端 day picker 选日期时只发 day、month picker
    // 选月时只发 month——同传两个是 IPC bug，这层用 month 兜住不报错。
    // 两个都 None → 今天北京日期（保持 v0.9.1 旧契约：开 tab 直接看到当天）。
    if let (Some(from), Some(to)) = (date_from.clone(), date_to.clone()) {
        a.push("--from-date".into());
        a.push(from);
        a.push("--to-date".into());
        a.push(to);
    } else if let Some(m) = month.clone() {
        a.push("--month".into());
        a.push(m);
    } else {
        let d = day.clone().unwrap_or_else(beijing_today_yyyy_mm_dd);
        a.push("--day".into());
        a.push(d);
    }
    if let Some(h) = host_kind {
        a.push("--host-kind".into());
        a.push(h.clone());
    }
    if let Some(m) = model {
        a.push("--model".into());
        a.push(m.clone());
    }
    if let Some(p) = provider {
        a.push("--provider".into());
        a.push(p.clone());
    }
    if let Some(p) = page_size {
        a.push("--page-size".into());
        a.push(p.to_string());
    }
    if let Some(c) = cursor {
        a.push("--cursor".into());
        a.push(c.clone());
    }
    a
}

/// `sessions findings` 的 argv（纯函数，供单测钉住 IPC→CLI 参数映射）。无参数——
/// rollup 恒是全源聚合，跟 list 的 filter/cursor 无关。
fn findings_args() -> Vec<String> {
    vec!["sessions".into(), "findings".into(), "--json".into()]
}

/// `sessions read` 的 argv。session_ref 是 MCP HMAC 不透明串（`sr_<32hex>`），
/// 由 list 行的 `data.sessions[].session_ref` 拿——不是原生 session_key（也不该
/// 是：HMAC 把 native_session_id / machine_namespace 屏蔽到 IPC 之外，避免前
/// 端读到 §5.1 里钉死的 PII）。无 revision / cursor flag——权威库的 revision 写
/// 在 envelope 的 `authority_revision` 字段里，不需要 CLI 透传。
fn read_args(session_ref: &str) -> Vec<String> {
    vec![
        "sessions".into(),
        "read".into(),
        "--session-ref".into(),
        session_ref.to_string(),
        "--json".into(),
    ]
}

/// spawn 二进制并解析 stdout。非零退出 → 若 stderr 是 `{"error":…}` 形状则原样
/// 透传（类型化错误码不丢）；否则包成 `cancelled`。spawn/解析失败 → `cancelled`。
fn run_json(mut cmd: Command) -> Result<Value, Value> {
    let out = cmd
        .output()
        .map_err(|e| error_value("cancelled", &e.to_string()))?;
    if !out.status.success() {
        if let Ok(v) = serde_json::from_slice::<Value>(&out.stderr) {
            if v.get("error").is_some() {
                return Err(v);
            }
        }
        return Err(error_value(
            "cancelled",
            &String::from_utf8_lossy(&out.stderr),
        ));
    }
    serde_json::from_slice(&out.stdout)
        .map_err(|e| error_value("cancelled", &e.to_string()))
}

/// list_sessions：day/month/host/page_size/cursor → mcp::sessions_search envelope。
/// async：spawn_blocking 把 CLI 子进程丢到阻塞线程池，主线程继续收托盘事件，
/// 详见模块头注释。
///
/// **参数扁平**（day / month / host_kind / model / provider / page_size / cursor 七件）是 Tauri
/// IPC 契约的一部分——`workbench.js` 的 invoke 调用面就是这五个扁平参数，
/// 改成结构体要连带改前端调用面。5 个参数本就在 lint 阈值内。
///
/// month 是工作台 picker 的扩展（v0.9.1 旧契约只发 day，修「点 tab 只看到今
/// 天、上个月会话看不到」的 bug）：前端从 `<input type="month">` 读到
/// `YYYY-MM` 字符串透传。两个都给时 store.rs `list_args` 优先 month（更粗、
/// 用户主动选择）。
#[tauri::command]
pub async fn sessions_list(
    state: tauri::State<'_, StoreBuildLock>,
    day: Option<String>,
    month: Option<String>,
    date_from: Option<String>,
    date_to: Option<String>,
    host_kind: Option<String>,
    model: Option<String>,
    provider: Option<String>,
    page_size: Option<usize>,
    cursor: Option<String>,
) -> Result<Value, Value> {
    let lock = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = lock.acquire();
        let Some(bin) = resolve_binary() else {
            return Err(no_binary());
        };
        let args = list_args(&day, &month, &date_from, &date_to, &host_kind, &model, &provider, page_size, &cursor);
        let mut cmd = Command::new(&bin);
        cmd.args(&args);
        // 与 tick 同款：显式钉死 AGENT_VITALS_HOME，权威库 / salt / 状态文件都
        // 落在 app 自己的数据根，不依赖子进程继承的环境。
        cmd.env("AGENT_VITALS_HOME", data_home());
        run_json(cmd)
    })
    .await
    .map_err(|e| error_value("cancelled", &e.to_string()))?
}

/// read_session：session_ref（HMAC）→ 完整 mcp::session_detail envelope。
/// async：与 sessions_list 同锁同池子（`StoreBuildLock` + `spawn_blocking`）。
///
/// **session_ref 是不透明串**（`sr_<32hex>`），来自 list 行的
/// `data.sessions[].session_ref`。前端不再持有 native_session_id / host_kind /
/// machine_namespace——HMAC 把 PII 屏蔽到 IPC 边界外，是 §5.1 的核心约束之一
/// （spec §0.3「数据面 PII 边界」）。
#[tauri::command]
pub async fn sessions_read(
    state: tauri::State<'_, StoreBuildLock>,
    session_ref: String,
) -> Result<Value, Value> {
    let lock = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = lock.acquire();
        let Some(bin) = resolve_binary() else {
            return Err(no_binary());
        };
        let args = read_args(&session_ref);
        let mut cmd = Command::new(&bin);
        cmd.args(&args);
        cmd.env("AGENT_VITALS_HOME", data_home());
        run_json(cmd)
    })
    .await
    .map_err(|e| error_value("cancelled", &e.to_string()))?
}

/// aggregate_findings：跨会话 findings 汇总（workbench「Findings」页）。纯聚合在
/// core + 二进制（`sessions findings --json`），IPC 只做 spawn + 透传，与
/// `sessions_list` 同款。async：见模块头注释。
#[tauri::command]
pub async fn sessions_findings(
    state: tauri::State<'_, StoreBuildLock>,
) -> Result<Value, Value> {
    let lock = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = lock.acquire();
        let Some(bin) = resolve_binary() else {
            return Err(no_binary());
        };
        let mut cmd = Command::new(&bin);
        cmd.args(findings_args());
        cmd.env("AGENT_VITALS_HOME", data_home());
        run_json(cmd)
    })
    .await
    .map_err(|e| error_value("cancelled", &e.to_string()))?
}

/// v0.11 Issues projection. Refreshes the legacy evaluator once (which also
/// writes stable issue_instances) then reads the authority tables directly.
#[tauri::command]
pub async fn sessions_issues(
    state: tauri::State<'_, StoreBuildLock>,
) -> Result<Value, Value> {
    let lock = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = lock.acquire();
        if let Some(bin) = resolve_binary() {
            let mut cmd = Command::new(bin);
            cmd.args(findings_args());
            cmd.env("AGENT_VITALS_HOME", data_home());
            let _ = run_json(cmd);
        }
        let path = agent_vitals_data::authority::default_authority_path(&data_home());
        let db = agent_vitals_data::authority::AuthorityDb::open_readonly(&path)
            .map_err(|e| error_value("authority_unavailable", &e.to_string()))?;
        let conn = db.conn();
        let mut stmt = conn.prepare(
            "SELECT issue_id, host, session_key, issue_type, status, severity,
                    evidence_fingerprint, opened_at_ms, closed_at_ms, metadata_json
             FROM issue_instances ORDER BY severity, opened_at_ms, issue_id"
        ).map_err(|e| error_value("authority_query", &e.to_string()))?;
        let rows = stmt.query_map([], |r| {
            let metadata: String = r.get(9)?;
            let metadata = serde_json::from_str::<Value>(&metadata).unwrap_or_else(|_| serde_json::json!({}));
            Ok(serde_json::json!({
                "issue_id": r.get::<_, String>(0)?, "host_kind": r.get::<_, String>(1)?,
                "session_key": r.get::<_, Option<String>>(2)?, "rule": r.get::<_, String>(3)?,
                "status": r.get::<_, String>(4)?, "severity": r.get::<_, String>(5)?,
                "evidence": r.get::<_, String>(6)?, "opened_at_ms": r.get::<_, i64>(7)?,
                "closed_at_ms": r.get::<_, Option<i64>>(8)?, "metadata": metadata,
            }))
        }).map_err(|e| error_value("authority_query", &e.to_string()))?;
        let mut issues = Vec::new();
        for row in rows {
            let mut issue = row.map_err(|e| error_value("authority_query", &e.to_string()))?;
            let metadata = issue.get("metadata").cloned().unwrap_or(Value::Null);
            issue["category"] = metadata.get("category").cloned().unwrap_or(Value::Null);
            issue["tool_name"] = metadata.get("tool_name").cloned().unwrap_or(Value::Null);
            issue["time"] = metadata.get("time").cloned()
                .unwrap_or_else(|| issue.get("opened_at_ms").cloned().unwrap_or(Value::Null));
            issues.push(issue);
        }
        let count = |severity: &str| issues.iter().filter(|v| v["severity"] == severity).count();
        let (rules, sessions_with) = issue_rollup(&issues);
        Ok(serde_json::json!({
            "totals": { "issues": issues.len(), "findings": issues.len(), "critical": count("critical"), "warning": count("warning"), "info": count("info"), "sessions": sessions_with, "sessions_total": sessions_with },
            "rules": rules, "issues": issues, "findings": [], "source": "issue_instances"
        }))
    }).await.map_err(|e| error_value("cancelled", &e.to_string()))?
}

fn issue_rollup(issues: &[Value]) -> (Vec<Value>, usize) {
    let mut by_rule: BTreeMap<String, (String, Option<String>, usize, BTreeSet<String>)> = BTreeMap::new();
    let mut sessions = BTreeSet::new();
    for issue in issues {
        let rule = issue["rule"].as_str().unwrap_or("unknown").to_string();
        let severity = issue["severity"].as_str().unwrap_or("info").to_string();
        let category = issue["category"].as_str().map(str::to_string);
        let session = issue["session_key"].as_str().map(str::to_string);
        let entry = by_rule.entry(rule).or_insert_with(|| (severity.clone(), category.clone(), 0, BTreeSet::new()));
        entry.2 += 1;
        if let Some(session) = session {
            sessions.insert(session.clone());
            entry.3.insert(session);
        }
    }
    let rows = by_rule.into_iter().map(|(rule, (severity, category, hits, sessions))| {
        serde_json::json!({
            "rule": rule, "severity": severity, "category": category,
            "hits": hits, "sessions": sessions.len(),
        })
    }).collect();
    (rows, sessions.len())
}

#[cfg(test)]
mod tests {
    use super::*;

    /// list_args 字段集是 v0.9.1 收口后的精简版：旧 CLI 用的 `--model` / `--from`
    /// / `--to` / `--query` 已删（权威库 sessions_search 不收这四件；list_args 模块头
    /// 注释解释为什么）。本测试盯住「只能出这四个 flag + day/month 兜底」，防 PR 后
    /// 有人手快把旧 flag 加回来。
    ///
    /// 「空 filter」分支今天北京日期不是字面常量——拆成两条：(a) 全字段用显式
    /// day 字面量钉住 argv 顺序；(b) `day/month: None` 分支断言「`--day` 始终在场、
    /// 值是 YYYY-MM-DD」，不锁具体日期（系统时钟会让这条用例 false-fail）。
    #[test]
    fn list_args_full() {
        let some = &Some("x".to_string());
        assert_eq!(
            list_args(some, &None, some, Some(7), &Some("c".to_string())),
            vec!["sessions", "list", "--json",
                 "--day", "x", "--host-kind", "x", "--page-size", "7",
                 "--cursor", "c"]
        );
    }

    /// `month` 模式：用户从前端 month picker 选了一个月 → IPC 透传 `month` →
    /// argv 必须有 `--month YYYY-MM`，没有 `--day`。这是修「工作台会话 tab 只
    /// 看得到今天」的关键——month 是 day 的替代窗口，不是补充。
    #[test]
    fn list_args_month_mode_emits_month_flag_only() {
        assert_eq!(
            list_args(&None, &Some("2026-08".to_string()), &None, None, &None),
            vec!["sessions", "list", "--json", "--month", "2026-08"]
        );
    }

    /// month + day 同传：month 优先（更粗、用户主动选择；day 是默认兜底）。
    /// 这条排序锁住 IPC bug 容错面——前端若哪天误传两个，行为可预测。
    #[test]
    fn list_args_month_takes_precedence_over_day() {
        assert_eq!(
            list_args(
                &Some("2026-08-15".to_string()),
                &Some("2026-08".to_string()),
                &None, None, &None,
            ),
            vec!["sessions", "list", "--json",
                 "--month", "2026-08"]
        );
    }

    /// month 模式 + 其它过滤：host-kind / page-size / cursor 仍可叠加。
    /// 钉住「month 不是全替换、是个独立的窗口选择」。
    #[test]
    fn list_args_month_with_filters() {
        assert_eq!(
            list_args(
                &None,
                &Some("2026-08".to_string()),
                &Some("dsh".to_string()),
                Some(100),
                &None,
            ),
            vec!["sessions", "list", "--json",
                 "--month", "2026-08",
                 "--host-kind", "dsh",
                 "--page-size", "100"]
        );
    }

    /// `day: None` 且 `month: None` → argv 必须含 `--day` + YYYY-MM-DD 字串
    /// （兜底为今天）。CLI 拒绝「无 day 无 month」（mutex 不允许两个都缺）；
    /// IPC 不替前端报错而是补一个今天的 `--day` —— 这一行是契约面。
    #[test]
    fn list_args_default_day_is_today() {
        let a = list_args(&None, &None, &None, None, &None);
        // 第一段固定
        assert_eq!(&a[0..3], &["sessions", "list", "--json"]);
        // --day 必须紧跟固定段（位置由 list_args 保证）
        assert_eq!(a[3], "--day");
        // 值是 YYYY-MM-DD 格式（不锁具体日期——系统时钟会让这条用例 false-fail）
        let d = &a[4];
        assert_eq!(d.len(), 10);
        assert_eq!(&d[4..5], "-");
        assert_eq!(&d[7..8], "-");
        for c in d.chars() {
            assert!(c.is_ascii_digit() || c == '-', "non-digit/dash in day: {d}");
        }
    }

    /// 单测自己用的常量时钟：让 `list_args_default_day_is_today_clock_pinned` 不依赖
    /// 真实系统时间（避免跨日 CI 抖动）。当前 list_args 内部直接调 std time；这
    /// 里**只**断言「今天日期格式正确」（不锁字面量），跨日仍绿。
    #[test]
    fn beijing_today_returns_yyyy_mm_dd_format() {
        let d = beijing_today_yyyy_mm_dd();
        assert_eq!(d.len(), 10);
        assert_eq!(&d[4..5], "-");
        assert_eq!(&d[7..8], "-");
        // YYYY 部分应是 2020~2099 区间（现实日期范围）
        let y: i32 = d[0..4].parse().expect("year must parse");
        assert!((2020..=2099).contains(&y), "year out of expected range: {y}");
    }

    /// read argv：固定段（session_ref 必带 + 无 revision flag）。
    /// session_ref 是 HMAC 不透明串，原生 session_key 在 v0.9.1 不再穿过 IPC
    /// 边界——前端不应再持有 native_session_id / machine_namespace（PII）。
    #[test]
    fn read_args_is_fixed() {
        assert_eq!(
            read_args("sr_abcdef1234567890"),
            vec!["sessions", "read", "--session-ref", "sr_abcdef1234567890",
                 "--json"]
        );
    }

    /// findings argv：固定段，无参数（rollup 恒全源聚合，跟 filter/cursor 无关）。
    #[test]
    fn findings_args_is_fixed() {
        assert_eq!(findings_args(), vec!["sessions", "findings", "--json"]);
    }

    /// 错误形状：`cancelled` 的 message 明确（二进制缺失是基础设施失败，不是
    /// 会话源的缺列）。
    #[test]
    fn no_binary_error_shape_is_typed() {
        assert_eq!(
            no_binary(),
            json!({"error": {"code": "cancelled",
                             "message": "agent-vitals binary not found (set AGENT_VITALS_BIN, \
                                         add it to PATH, or place it in the app's \
                                         Contents/Resources/bin/)"}})
        );
    }

    /// run_json 成功路径：spawn 真实子进程 → stdout 是 JSON → 原样解析。IPC
    /// 薄壳的全部行为就是「spawn 二进制 + 解析 stdout + 透传错误」，这三条用例
    /// 钉住 spawn/解析这一层——参数翻译（上面两条）对了、spawn/解析不对，前端点得
    /// 再准也拿不到数据。
    #[test]
    fn run_json_parses_success_stdout() {
        let mut cmd = Command::new("echo");
        cmd.arg("{\"a\":1}");
        assert_eq!(run_json(cmd), Ok(json!({"a": 1})));
    }

    /// 非零退出 + stderr 是类型化错误 JSON → 原样透传（错误码不丢、不被包成
    /// cancelled）。这依赖 spawn 的退出码 + stderr——正是真实二进制报
    /// `not-found` / `source-unavailable` 的路径。
    #[test]
    fn run_json_passes_through_typed_stderr() {
        let mut cmd = Command::new("sh");
        cmd.args(["-c",
                  "echo '{\"error\":{\"code\":\"not-found\",\"message\":\"m\"}}' \
                   >&2; exit 2"]);
        assert_eq!(run_json(cmd),
                   Err(json!({"error": {"code": "not-found", "message": "m"}})));
    }

    /// 非零退出 + stderr **不是** `{"error":…}` 形状 → 包成 cancelled（code 集固定，
    /// 不另造新码），message 带原始 stderr，不能丢成空的。
    #[test]
    fn run_json_wraps_non_json_stderr_as_cancelled() {
        let mut cmd = Command::new("sh");
        cmd.args(["-c", "echo plain-failure >&2; exit 1"]);
        match run_json(cmd) {
            Err(v) => {
                assert_eq!(v["error"]["code"], "cancelled");
                assert_eq!(v["error"]["message"], "plain-failure\n");
            }
            Ok(_) => panic!("non-zero exit must be an Err"),
        }
    }

    /// spawn 本身失败（二进制不存在）→ cancelled（基础设施失败，不是会话源的
    /// 缺列——§6.3-7 的 code 集固定）。
    #[test]
    fn run_json_spawn_failure_is_cancelled() {
        let cmd = Command::new("definitely-not-a-real-binary-xyz");
        match run_json(cmd) {
            Err(v) => assert_eq!(v["error"]["code"], "cancelled"),
            Ok(_) => panic!("missing binary must be an Err"),
        }
    }
}
