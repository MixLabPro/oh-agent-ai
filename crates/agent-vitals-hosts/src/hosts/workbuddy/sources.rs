//! WorkBuddy 会话审计的 locate → shape → extract（五段式流水线的前三段，I/O 都在
//! 这里）+ 组合层。`workbuddy-session` 子命令的数据层。derive → coverage 在 core 的
//! `workbuddy_evidence::build_workbuddy_evidence`；本模块负责 sqlite db / audit-log /
//! file-history 的读取、会话列表、审计投影与输出组装。
//!
//! 与 Python `scripts/agent_vitals/adapters/workbuddy_session.py` +
//! `agent/workbuddy_session_audit.py` 逐字节对齐——两条实现产出同一份字典，
//! `tests/test_cli_matrix.py::both()` 的差分靠这份一致把关。sqlite 读用 rusqlite
//! bundled（Python 侧 stdlib `sqlite3`，同一份 fixture db 两边都要能读，spec §1.4）。
//!
//! 一个 WorkBuddy 会话横跨三个可 join 表面（spec §2.1 的 4 表面里 traces 会话匿名、
//! 不算 join 表面）：`workbuddy.db` 的 `sessions` 行（会话锚点）、`session_usage` 行
//! （宿主自计费，spec §9，成本直接吃 credit_json，不长第四份价格拷贝）、
//! `audit-log/*.jsonl` 里按 `sessionId` **字段**（不是文件名）分组的决策记录、
//! `file-history/<sessionId>/` 的版本文件数（FileMutations 源）。
//!
//! **降级铁律与 claude_session 同款**：db 文件缺失/损坏 → `(None, None)`（不可读绝不
//! 编成 0 会话）；audit-log 目录缺失 → 空 dict（存在性探测）；一条坏 JSON 行 → 跳过
//! 并记 degraded（坏行属于哪个 session 无法指认，不该编进任何会话）；会话无 audit-log
//! 记录但 db 有行 → 真会话，照审（决策账本为空是诚实结果，不是不可读）。
//!
//! **SV604/605 的 Unavailable 是本模块的 host-capability degradation（spec §3.1），
//! 不是 core 规则改动。** WorkBuddy 的 `tool_calls` timeline 只有 bash（audit-log
//! `commandPreview`）和 web_fetch（`WebFetch` target）两个子集可 join——write/edit
//! 工具调用只存在于会话匿名的 traces（file-history 有内容没路径）。SV604/605 是
//! "是否写过 workspace 文件"的检测器，在只能看见 bash/web_fetch 的 timeline 上会把
//! "看不见写操作"空转成 MeasuredZero——那是对「结构上读不到写维度」撒谎（DSH 的
//! MeasuredZero 是「跑了所有工具、确实没有写」的真测量，WorkBuddy 是「只有两类工具
//! join 得进来」）。所以这里在 WorkBuddy 路径把 SV604/605 从 MeasuredZero 覆盖成
//! Unavailable，理由写进 `reason`。**只在 WorkBuddy 路径生效**——Claude/DSH/Codex 的
//! golden 字节零改动。SV609/610/614 不需要 override：approvals/sandbox timeline 各自
//! 非空时家族①/家族④ 门控正常放行，空时正常 Unavailable。
//!
//! **成本块直接吃宿主账单**（spec §9）：`session_usage.used`（tokens）+ 解析
//! `credit_json` 求和（¥，按厘累计防浮点漂移），`host_billed: true` 标明这不是我们
//! 按 pricing.json 重算的、而是宿主自己记的账。**pricing.json 零参与**——不长第四份
//! 价格拷贝（spec §11 项 6）。

use std::cmp::Ordering;
use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

use rusqlite::types::Value as SqlValue;
use rusqlite::{Connection, OpenFlags};
use serde_json::{json, Value};

use crate::workbuddy_evidence::{
    build_workbuddy_evidence, workbuddy_evidence_json, WorkbuddyEvidence, WorkbuddySessionMeta,
};

/// `~/.workbuddy/`（真实语料实测位置；测试用 isolated_home_env 把 HOME 指到 fixture
/// root，根就是 `<root>/.workbuddy/`）。main.rs 解析 `HOME`/`USERPROFILE` 传入。
pub fn workbuddy_root(home: &Path) -> PathBuf {
    home.join(".workbuddy")
}

/// db 两表（sessions/usage）读回的类型别名——clippy `type_complexity` 门禁要别名。
pub type DbTables = (
    Option<BTreeMap<String, Value>>,
    Option<BTreeMap<String, Value>>,
);

/// audit-log 读回的三元组（记录分组 / 主账本文件指认 / degraded 缺口）。
pub type AuditLog = (
    BTreeMap<String, Vec<Value>>,
    BTreeMap<String, PathBuf>,
    Vec<(PathBuf, String)>,
);

fn sqlite_val_to_json(v: SqlValue) -> Value {
    match v {
        SqlValue::Null => Value::Null,
        SqlValue::Integer(i) => Value::from(i),
        SqlValue::Real(f) => serde_json::Number::from_f64(f)
            .map(Value::Number)
            .unwrap_or(Value::Null),
        SqlValue::Text(t) => Value::String(t),
        // BLOB → null：Python sqlite3 给 bytes，`_val(rec, key, str/int)` 的类型检查
        // 会把它判成 None——序列化进 Value 再走同一套类型提取，两边一致。
        SqlValue::Blob(_) => Value::Null,
    }
}

/// 读一张表 → `{key_col → 行 dict}`；表缺失/读失败 → None（调用方决定是降级整库还是
/// 只降这一列）。**`SELECT *` + 按列名取**——真实 schema 会漂移，硬编码列清单一漂就
/// 全灭；缺列由调用方的类型提取报 None。key_col 非字符串（整数 id / 空值）的行跳过
/// ——session_id 锚点永远是 TEXT，非字符串 key 查不进来，留着只会让列表出现
/// 不可指认的会话。
fn read_table(conn: &Connection, table: &str, key_col: &str) -> Option<BTreeMap<String, Value>> {
    let sql = format!("SELECT * FROM {table}");
    let mut stmt = conn.prepare(&sql).ok()?;
    let col_names: Vec<String> = stmt.column_names().iter().map(|s| s.to_string()).collect();
    let mut rows = stmt.query([]).ok()?;
    let mut out = BTreeMap::new();
    while let Some(row) = rows.next().ok()? {
        let mut rec = serde_json::Map::new();
        for (i, name) in col_names.iter().enumerate() {
            let v: SqlValue = row.get(i).unwrap_or(SqlValue::Null);
            rec.insert(name.clone(), sqlite_val_to_json(v));
        }
        match rec.get(key_col) {
            Some(Value::String(s)) => {
                out.insert(s.clone(), Value::Object(rec));
            }
            _ => continue,
        }
    }
    Some(out)
}

/// 读 `workbuddy.db` 的 `sessions` / `session_usage` 两表 → `(sessions, usage)`，各自是
/// `{id → 行 dict}` / `{session_id → 行 dict}`。
///
/// 降级（与 Python 逐字节对齐）：db 文件缺失 → `(None, None)`；`sessions` 表读不出来
/// （文件不是 sqlite / 损坏 / 表被改名）→ 整个 db 不可信，`(None, None)`（**不是**
/// `({}, {})`——空表是「确实 0 会话」的真测量，读不出来是「不知道」）；`sessions`
/// 可读但 `session_usage` 表读不出来 → `(sessions, {})`（usage 列缺，会话照审、成本
/// Unavailable）。
pub fn read_workbuddy_db(root: &Path) -> DbTables {
    let db_path = root.join("workbuddy.db");
    if !db_path.is_file() {
        return (None, None);
    }
    let conn = match Connection::open_with_flags(&db_path, OpenFlags::SQLITE_OPEN_READ_ONLY) {
        Ok(c) => c,
        Err(_) => return (None, None),
    };
    let sessions = read_table(&conn, "sessions", "id");
    let Some(sessions) = sessions else {
        return (None, None);
    };
    let usage = read_table(&conn, "session_usage", "session_id").unwrap_or_default();
    (Some(sessions), Some(usage))
}

/// 读 `audit-log/*.jsonl`（顶层文件，不含 `spool/` 待落盘缓冲）→
/// `(records_by_session, file_of, degraded)`：
///
/// - `records_by_session`：`{sessionId → [记录 dict]}`——按 `sessionId` **字段**分组
///   （spec §2.1：join 锚点是字段不是文件名；一个文件可能横跨多个会话）。
/// - `file_of`：`{sessionId → 首个出现的文件路径}`（`file` 字段用它指认主账本文件；
///   多文件会话罕见，首文件够诚实）。
/// - `degraded`：`[(path, n_or_reason), ...]`——坏 JSON 行 / 无 sessionId 的记录 /
///   不可读文件（无法指认归属的账本缺口，记下来由组合层 surface，绝不吞掉）。
///
/// 记录跨文件拼接后交给 evidence 层按 `sequence` 排序（并发 spool 写的跳号由
/// sequence 救回来，spec §2.3）。读取用 `std::fs::read` + `String::from_utf8_lossy`
/// ——Python 的 `read_text(errors="replace")` 对非法 UTF-8 也是替换，`read_to_string`
/// 会直接失败，不能用。
pub fn read_workbuddy_audit_log(root: &Path) -> AuditLog {
    let audit_dir = root.join("audit-log");
    let mut records_by_session: BTreeMap<String, Vec<Value>> = BTreeMap::new();
    let mut file_of: BTreeMap<String, PathBuf> = BTreeMap::new();
    let mut degraded: Vec<(PathBuf, String)> = Vec::new();
    if !audit_dir.is_dir() {
        return (records_by_session, file_of, degraded);
    }
    let mut files: Vec<PathBuf> = match std::fs::read_dir(&audit_dir) {
        Ok(rd) => rd
            .filter_map(Result::ok)
            .map(|e| e.path())
            .filter(|p| p.is_file() && p.extension().map(|x| x == "jsonl").unwrap_or(false))
            .collect(),
        Err(_) => return (records_by_session, file_of, degraded),
    };
    // 全局按路径字符串排序——Python 的 `sorted(glob, key=str)` 同款，deterministic。
    files.sort_by(|a, b| a.to_string_lossy().cmp(&b.to_string_lossy()));
    for path in &files {
        let bytes = match std::fs::read(path) {
            Ok(b) => b,
            Err(_) => {
                degraded.push((path.clone(), "unreadable".to_string()));
                continue;
            }
        };
        let text = String::from_utf8_lossy(&bytes).into_owned();
        let mut bad = 0_u64;
        for line in text.split('\n') {
            if line.trim().is_empty() {
                continue;
            }
            let rec: Value = match serde_json::from_str(line) {
                Ok(v) => v,
                Err(_) => {
                    bad += 1;
                    continue;
                }
            };
            if !rec.is_object() {
                bad += 1;
                continue;
            }
            let sid = rec.get("sessionId").and_then(Value::as_str).unwrap_or("");
            if sid.is_empty() {
                bad += 1;
                continue;
            }
            if !file_of.contains_key(sid) {
                file_of.insert(sid.to_string(), path.clone());
            }
            records_by_session.entry(sid.to_string()).or_default().push(rec);
        }
        if bad > 0 {
            degraded.push((path.clone(), format!("malformed: {bad} record(s) skipped")));
        }
    }
    (records_by_session, file_of, degraded)
}

/// `file-history/<sessionId>/` 下的文件数 = FileMutations 源（spec §3 Measured 行：
/// `<contentHash>@v<n>` 版本快照数）。目录缺失 → 0（无文件快照是诚实测量，不是
/// 不可读）。
pub fn count_workbuddy_file_history(root: &Path, session_id: &str) -> u64 {
    let fh = root.join("file-history").join(session_id);
    if !fh.is_dir() {
        return 0;
    }
    let mut count = 0_u64;
    if let Ok(rd) = std::fs::read_dir(&fh) {
        for e in rd.filter_map(Result::ok) {
            if e.path().is_file() {
                count += 1;
            }
        }
    }
    count
}

/// 把一个会话的跨表面数据组装成 evidence 层的 `session_meta`。db 行缺失 → 相关列
/// None（audit-log 独苗会话照审，元数据降级）；`db_usage is None`（db 整库降级）→
/// used/credit_json None。`file_mutations` 永远有个 u64（0 或真实计数）。类型提取即
/// `_val` 的纪律：列不存在 / 类型不符 → None（缺列报缺——编个假类型出来反而会把
/// 覆盖计数喂错）。
pub fn workbuddy_session_meta(
    root: &Path,
    session_id: &str,
    db_rec: Option<&Value>,
    db_usage: Option<&BTreeMap<String, Value>>,
) -> WorkbuddySessionMeta {
    let str_field = |key: &str| {
        db_rec
            .and_then(|r| r.get(key))
            .and_then(Value::as_str)
            .map(str::to_owned)
    };
    let int_field = |key: &str| {
        db_rec
            .and_then(|r| r.get(key))
            .and_then(Value::as_i64)
    };
    let mut meta = WorkbuddySessionMeta {
        permission_mode: str_field("permission_mode"),
        use_sandbox_cli: int_field("use_sandbox_cli"),
        model: str_field("model"),
        cwd: str_field("cwd"),
        title: str_field("title"),
        created_at: str_field("created_at"),
        updated_at: str_field("updated_at"),
        used: None,
        credit_json: None,
        file_mutations: 0,
    };
    if let Some(usage) = db_usage {
        if let Some(usage_rec) = usage.get(session_id) {
            meta.used = usage_rec.get("used").and_then(Value::as_i64);
            meta.credit_json = usage_rec
                .get("credit_json")
                .and_then(Value::as_str)
                .map(str::to_owned);
        }
    }
    meta.file_mutations = count_workbuddy_file_history(root, session_id);
    meta
}

/// 会话活动时间跨度：audit-log 记录 timestamp 的 min/max（跨文件全取，ISO 串字典序 =
/// 时间序）；无记录 → db 行 created_at/updated_at 兜底。都没有 → `{"first": null,
/// "last": null}`。
pub fn date_span_of(records: &[Value], meta: &WorkbuddySessionMeta) -> Value {
    let mut stamps: Vec<&str> = records
        .iter()
        .filter_map(|r| r.get("timestamp").and_then(Value::as_str))
        .collect();
    if !stamps.is_empty() {
        stamps.sort_unstable();
        return json!({ "first": stamps[0], "last": stamps[stamps.len() - 1] });
    }
    json!({ "first": meta.created_at, "last": meta.updated_at })
}

/// family① + family④ 的审计投影：findings + 三态 rule_outcomes + summary。薄
/// 封装 core 共享求值器（v0.6 host-contract spec §7-C，M1）——三份 dispatcher
/// 的公共部分（含 SV604/605 的 host-capability degrade 与覆盖后重算
/// `summary.rules_unavailable`）塌缩进 `canonical_audit::audit_projection`，
/// 这里只剩「传哪个 host_id」。
fn workbuddy_audit_projection(evidence: &WorkbuddyEvidence) -> Value {
    agent_vitals_domain::canonical_audit::audit_projection(&evidence.canonical, "workbuddy")
}

/// `workbuddy-session --list` 的排序：`updated_at` 降序（最新在前），平局按 session_id
/// 升序；无时间样本排最后（`unwrap_or("")` 兜底成空串——空串恒排最后）。
fn session_cmp(a: &Value, b: &Value) -> Ordering {
    let al = a.get("last").and_then(Value::as_str).unwrap_or("");
    let bl = b.get("last").and_then(Value::as_str).unwrap_or("");
    if bl != al {
        return if bl < al { Ordering::Less } else { Ordering::Greater };
    }
    a.get("session_id")
        .and_then(Value::as_str)
        .unwrap_or("")
        .cmp(b.get("session_id").and_then(Value::as_str).unwrap_or(""))
}

/// `workbuddy-session --list`：db `sessions` 表是会话索引（真实语料 22 行）——每行的
/// id/title/model/cwd/created/updated，按 `session_cmp` 排序。audit-log 独苗会话（db
/// 无行）不进列表（列表是索引不是账本；单会话深挖仍可按 id 审）。
pub fn workbuddy_session_list(home: &Path) -> Value {
    let root = workbuddy_root(home);
    let (db_sessions, db_usage) = read_workbuddy_db(&root);
    let mut sessions: Vec<Value> = Vec::new();
    if let Some(db_sessions) = db_sessions {
        for (sid, rec) in &db_sessions {
            let meta = workbuddy_session_meta(&root, sid, Some(rec), db_usage.as_ref());
            sessions.push(json!({
                "session_id": sid,
                "title": meta.title,
                "model": meta.model,
                "cwd": meta.cwd,
                "first": meta.created_at,
                "last": meta.updated_at,
            }));
        }
    }
    sessions.sort_by(session_cmp);
    json!({ "host": "workbuddy", "sessions": sessions })
}

/// `workbuddy-session --list` 的人读呈现。缺席的字段一律 `-`（诚实缺失，不编造）；
/// session_id 缺失 → 空串（`{sid:<28}` 留白，同 Python）。与 Python
/// `_render_list` 逐字节对齐。
pub fn render_workbuddy_session_list(out: &Value) -> String {
    let mut s = String::from("host: workbuddy\n");
    let sessions = out
        .get("sessions")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();
    s.push_str(&format!("sessions: {}\n\n", sessions.len()));
    for row in &sessions {
        let sid = row.get("session_id").and_then(|v| v.as_str()).unwrap_or("");
        let title = row.get("title").and_then(|v| v.as_str()).unwrap_or("-");
        let model = row.get("model").and_then(|v| v.as_str()).unwrap_or("-");
        let first = row.get("first").and_then(|v| v.as_str()).unwrap_or("-");
        let last = row.get("last").and_then(|v| v.as_str()).unwrap_or("-");
        s.push_str(&format!("{sid:<28}  {title}  {model}  {first} → {last}\n"));
    }
    s
}

/// credit_json 单条 ¥ → 厘（i64）。按厘累计再除 100，规避浮点逐条相加的漂移；
/// int/float/数字字符串都认（真实 credit_json 里值可能是字符串），布尔与非数字 → 0
/// （记账缺口报缺，不把垃圾算进成本）。Python `round` 是银行家舍入、Rust `.round()`
/// 是四舍五入——差异只在 x.5 上，fixture 与真实账单都没有，可接受。
fn to_cents(value: &Value) -> i64 {
    match value {
        // Python `isinstance(True, int)` 为真，所以布尔必须显式短路成 0。
        Value::Bool(_) => 0,
        Value::Number(n) => {
            let f = n.as_f64().unwrap_or(f64::NAN);
            if f.is_nan() || f.is_infinite() {
                0
            } else {
                (f * 100.0).round() as i64
            }
        }
        Value::String(s) => match s.parse::<f64>() {
            Ok(f) if !f.is_nan() && !f.is_infinite() => (f * 100.0).round() as i64,
            _ => 0,
        },
        _ => 0,
    }
}

/// spec §9 成本块：`{tokens, cny, host_billed: true}`。tokens = `used`（聚合 token，
/// 无逐请求 Usage）；cny = credit_json 求和（宿主自身账单，¥）。usage 行缺失 → None
/// （诚实缺失，不编 0——0 是「确实没花」的真测量，只在 usage 行存在时才可能）。
/// `credit_json` 空串算「没有」，空格串算「有但解析出 0」——与 Python truthiness 一致。
fn cost_of(meta: &WorkbuddySessionMeta) -> Option<Value> {
    let cj = meta.credit_json.as_deref();
    if meta.used.is_none() && cj.map(|s| s.is_empty()).unwrap_or(true) {
        return None;
    }
    let tokens = match meta.used {
        Some(u) if u >= 0 => u,
        _ => 0,
    };
    let mut cents = 0_i64;
    if let Some(cj) = cj {
        if !cj.trim().is_empty() {
            if let Ok(parsed) = serde_json::from_str::<Value>(cj) {
                if let Some(obj) = parsed.as_object() {
                    for v in obj.values() {
                        cents += to_cents(v);
                    }
                }
            }
        }
    }
    Some(json!({ "tokens": tokens, "cny": cents as f64 / 100.0, "host_billed": true }))
}

/// `workbuddy-session` 单会话审计：coverage（§13 逐信号）+ SV601–614 findings + 成本
/// 块。`None` = db 无该会话行 **且** audit-log 无该 sessionId 的记录（两面都没有 →
/// 不存在，不可审）。**db 有行但 audit-log 无记录 → 照审**（真会话、决策账本为空是
/// 诚实结果；不是不可读）。audit-log 独苗会话（db 无行）→ 照审，元数据降级 None（缺
/// 列报缺）。
///
/// 输出键序是字节一致的一部分（Python 镜像逐字节对齐），不能重排。
pub fn workbuddy_session_audit_json(home: &Path, session_id: &str) -> Option<Value> {
    let root = workbuddy_root(home);
    let (db_sessions, db_usage) = read_workbuddy_db(&root);
    let (recs_by_session, file_of, degraded) = read_workbuddy_audit_log(&root);
    let db_rec = db_sessions.as_ref().and_then(|m| m.get(session_id));
    let records = recs_by_session.get(session_id).cloned().unwrap_or_default();
    if db_rec.is_none() && records.is_empty() {
        return None;
    }

    let meta = workbuddy_session_meta(&root, session_id, db_rec, db_usage.as_ref());
    let date_span = date_span_of(&records, &meta);
    let evidence = build_workbuddy_evidence(records, session_id.to_string(), &meta);
    let ev = workbuddy_evidence_json(&evidence);
    let audit = workbuddy_audit_projection(&evidence);
    let roots = ev["workspace_roots"].as_array().cloned().unwrap_or_default();
    let cwd = roots.first().cloned();

    // degraded 的 audit-log 文件若正是本会话的主账本文件，把账本缺口 surface 进
    // attempts（§14.4：skipped and recorded, never treated as corruption）。
    let mut attempts: Vec<Value> = ev["attempts"].as_array().cloned().unwrap_or_default();
    let fpath = file_of.get(session_id);
    if let Some(fpath) = fpath {
        for (path_str, reason) in &degraded {
            if *path_str == *fpath {
                let file_name = path_str
                    .file_name()
                    .map(|n| n.to_string_lossy().into_owned())
                    .unwrap_or_default();
                attempts.push(json!({
                    "source_id": "workbuddy.audit-log",
                    "kind": "LogFile",
                    "surface": "SessionLog",
                    "available": false,
                    "error": format!("audit-log/{file_name}: {reason}"),
                    "observed_span": Value::Null,
                }));
                break;
            }
        }
    }

    // `file` = 主账本文件（审计据以计算的 audit-log）；db 独苗会话无审计记录 → db
    // 路径兜底（会话锚点所在）。
    let file = if let Some(fpath) = fpath {
        Some(fpath.to_string_lossy().to_string())
    } else if db_rec.is_some() {
        Some(root.join("workbuddy.db").to_string_lossy().to_string())
    } else {
        None
    };

    Some(json!({
        "host": "workbuddy",
        "session_id": session_id,
        "title": meta.title,
        "model": ev["model"].clone(),
        "cwd": cwd,
        "file": file,
        "date_span": date_span,
        "audit": audit,
        "coverage": ev["coverage"].clone(),
        "signals": ev["signals"].clone(),
        "attempts": attempts,
        "cost": cost_of(&meta),
        "notes": ev["notes"].clone(),
    }))
}
