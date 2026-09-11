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
//! **成本块直接吃宿主账单**（spec §6.1/§9）：`session_usage.used`（tokens）+ 解析
//! `credit_json` 求和——但那求和是**积分（credit），不是人民币**。旧字段名 `cny`
//! 把积分当货币，1000 积分才 ¥50、单请求积分中位 ~22，约 20× 高估（spec §3.1）。
//! 新契约：`credits`（诚实单位名，取代旧 `cny` 的同一求和值）+ `cash_cny`（现金口径
//! 实付，**恒 null**——本机无支付证据，填 0 是断言「确实没花」，我们不知道，§11 第
//! 12 条）+ `nominal_cny`（`credits × 0.05`，公开加量包兑换价折算，落**名义栏**，
//! §5.1；永不进实付栏/预算分子）+ `nominal_basis`（可追溯的「什么价、什么日期」串）。
//! `host_billed: true` 标明这不是我们按 pricing.json 重算的、而是宿主自己记的账。
//! **pricing.json 零参与**——兑换价不是模型价卡，不长第四份价格拷贝（spec §11 项 6）。

use std::cmp::Ordering;
use std::collections::BTreeMap;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use agent_vitals_domain::util::civil_from_unix_secs;
use rusqlite::types::Value as SqlValue;
use rusqlite::{Connection, OpenFlags};
use serde_json::{json, Value};

use crate::workbuddy_evidence::{
    build_workbuddy_evidence, workbuddy_evidence_json, WorkbuddyEvidence, WorkbuddySessionMeta,
};

// v0.8 Phase E7.6：Skill 配置 I/O（marketplace.json/welcomeMode 日志读取）与
// 本文件的会话 I/O 是两条独立证据线，分文件放。
pub mod skills;

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

/// epoch 秒（2000-01-01 起）的合法性下界——`946684800`。
const WB_TS_MIN_SECS: i64 = 946_684_800;

/// 读时钟：当前 unix 秒。合法性窗口的上界是 `now + 24h`（spec §6.2 rule 3）。
/// 只在 `/sources` 层读时钟（`io_tokens_only_appear_under_sources` 守卫允许）。
fn now_unix_secs() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

/// epoch 秒 → `YYYY-MM-DDTHH:MM:SSZ`（UTC，秒精度）。Hinnant civil-from-days
/// （`agent_vitals_domain::util`），不引 chrono；Python 镜像用 `time.gmtime`，
/// 合法窗口内（2000..now+24h）两者是同一套 proleptic Gregorian，逐字节一致。
fn epoch_secs_to_iso(secs: i64) -> String {
    let (y, mo, d) = civil_from_unix_secs(secs, 0);
    let sod = secs.rem_euclid(86_400);
    format!(
        "{:04}-{:02}-{:02}T{:02}:{:02}:{:02}Z",
        y,
        mo,
        d,
        sod / 3600,
        (sod % 3600) / 60,
        sod % 60
    )
}

/// 一处时间戳归一的三态结果（spec §6.2）。
enum TsNorm {
    /// 可用的 ISO 串：字符串**原样**（走既有路径，不回归其他宿主/旧形状），
    /// 或整数/浮点按毫秒归一且落在合法窗口内。
    Value(String),
    /// 整数/浮点，归一后落在合法窗口 `[2000-01-01T00:00:00Z, now+24h]` 之外
    /// —— 报 `null`，且必须在 `attempts` 里留一条痕迹（§14.4）。
    OutOfWindow,
    /// 其余类型（bool/null/object）或字段缺失 —— 报 `null`，**不进 attempts**
    /// （那不是「试过但失败」，是「这个位置根本没有时间戳」）。
    Absent,
}

/// WorkBuddy 时间戳归一（spec §6.2）——`audit-log.timestamp` /
/// `sessions.created_at` / `updated_at` 三处同一规则。
///
/// 曾经三处都只收字符串（`Value::as_str` / `_is_iso_ts`），真机三处却都是 13 位
/// epoch-ms 整数（2026-09-10 实测），于是 `date_span` 恒 null、`--list` 日期列
/// 全空——统一会话面的 SQL 硬条件是 `event_ts_ms IS NOT NULL`，没有时间戳的事实
/// 等于不存在（spec §3.2）。
///
/// **不做「10 位当秒、13 位当毫秒」的位数嗅探**（spec §6.2 rule 5）：真机只观测
/// 到毫秒，在没有证据的地方发明一条秒/毫秒判别规则会把 2001 年的毫秒戳
/// （10 位）误当成 1970 年的秒戳。
fn normalize_wb_ts(v: Option<&Value>, now_secs: i64) -> TsNorm {
    match v {
        Some(Value::String(s)) => TsNorm::Value(s.clone()),
        Some(Value::Number(n)) => {
            // 按毫秒解释。整数走 `i64` 精确路径，浮点向下取整——两者都与
            // Python 的 `int // 1000` / `math.floor(f / 1000.0)` 对齐。
            let secs = match n.as_i64() {
                Some(i) => i.div_euclid(1000),
                None => match n.as_f64() {
                    Some(f) if f.is_finite() => (f / 1000.0).floor() as i64,
                    _ => return TsNorm::OutOfWindow,
                },
            };
            if secs < WB_TS_MIN_SECS || secs > now_secs + 86_400 {
                TsNorm::OutOfWindow
            } else {
                TsNorm::Value(epoch_secs_to_iso(secs))
            }
        }
        _ => TsNorm::Absent,
    }
}

/// spec §6.2 rule 3：db `created_at`/`updated_at` 与 audit-log `timestamp` 里
/// 归一后越界的 epoch-ms 值——报 null 之外还要留一条 `attempts` 痕迹
/// （§14.4：skipped and recorded, never treated as corruption）。**只有
/// OutOfWindow 进 attempts**：字符串照走 ISO，其它类型静默 null。
fn timestamp_attempts(db_rec: Option<&Value>, records: &[Value], now_secs: i64) -> Vec<Value> {
    let mut out = Vec::new();
    let mk = |source_id: &str, kind: &str, field: &str, raw: &Value| {
        json!({
            "source_id": source_id,
            "kind": kind,
            "surface": "SessionLog",
            "available": false,
            "error": format!(
                "{field}: epoch-ms timestamp {raw} normalizes outside the validity \
                 window [2000-01-01T00:00:00Z, now+24h]; treated as unparseable"
            ),
            "observed_span": Value::Null,
        })
    };
    for field in ["created_at", "updated_at"] {
        let raw = db_rec.and_then(|r| r.get(field));
        if matches!(normalize_wb_ts(raw, now_secs), TsNorm::OutOfWindow) {
            out.push(mk(
                "workbuddy.db",
                "Sqlite",
                &format!("sessions.{field}"),
                raw.unwrap_or(&Value::Null),
            ));
        }
    }
    for rec in records {
        let raw = rec.get("timestamp");
        if matches!(normalize_wb_ts(raw, now_secs), TsNorm::OutOfWindow) {
            out.push(mk(
                "workbuddy.audit-log",
                "LogFile",
                "audit-log timestamp",
                raw.unwrap_or(&Value::Null),
            ));
        }
    }
    out
}

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

/// WAL 快照标注（spec §10 B3，`docs/WORKBUDDY_OBSERVABILITY_ASK.md` P0-1「若不做」
/// 降级路径）：`journal_mode`/`db_bytes`/`wal_bytes`，让读者看见"这是一次时点快照"
/// 而不是把它当成稳定通道。**防御性约束（spec §2 实测行）钉在这里**：绝不能把打开
/// 方式改成 `immutable=1`、也绝不能裸拷主库文件——WAL 模式下已提交数据大半在
/// `-wal` 文件里（真机 155KB 主库 vs 630KB WAL），`immutable=1` 会静默忽略 WAL、
/// 读到上一次 checkpoint 的陈旧状态（真机实测因此少读到 1 个会话：22 vs 23）；
/// 裸拷主库同理会撕裂或漏 WAL。现有 `SQLITE_OPEN_READ_ONLY` 连接已参与 WAL、读到
/// 最新状态——这里另开一个同样只读的连接只为查 pragma，不改变、不影响主查询的
/// 打开方式。**不含 mtime**——fixture 上非确定，会破坏逐字节差分（spec 明令）。
/// db 缺失/不可读 → `None`（与 `read_workbuddy_db` 的 `(None, None)` 同一降级
/// 纪律：不可读绝不编成一个假快照）。
fn read_workbuddy_source_snapshot(root: &Path) -> Option<Value> {
    let db_path = root.join("workbuddy.db");
    let db_bytes = std::fs::metadata(&db_path).ok()?.len();
    let conn = Connection::open_with_flags(&db_path, OpenFlags::SQLITE_OPEN_READ_ONLY).ok()?;
    // `PRAGMA journal_mode` 只读当前模式、不触发 checkpoint 或切换模式——单纯查询。
    let journal_mode: String = conn
        .query_row("PRAGMA journal_mode", [], |row| row.get(0))
        .ok()?;
    let wal_path = root.join("workbuddy.db-wal");
    let wal_bytes = std::fs::metadata(&wal_path).map(|m| m.len()).unwrap_or(0);
    Some(json!({
        "journal_mode": journal_mode,
        "db_bytes": db_bytes,
        "wal_bytes": wal_bytes,
    }))
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
    // 时间戳列按 spec §6.2 归一：真机 created_at/updated_at 是 epoch-ms 整数，
    // `str_field` 会把它们读成 None（这就是 `--list` 日期列全空的根因）。
    let now_secs = now_unix_secs();
    let ts_field = |key: &str| match normalize_wb_ts(db_rec.and_then(|r| r.get(key)), now_secs) {
        TsNorm::Value(s) => Some(s),
        TsNorm::OutOfWindow | TsNorm::Absent => None,
    };
    let mut meta = WorkbuddySessionMeta {
        permission_mode: str_field("permission_mode"),
        use_sandbox_cli: int_field("use_sandbox_cli"),
        model: str_field("model"),
        cwd: str_field("cwd"),
        title: str_field("title"),
        created_at: ts_field("created_at"),
        updated_at: ts_field("updated_at"),
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
    // spec §6.2：字符串原样，整数按毫秒归一，越界/其它类型丢弃（越界另由
    // `timestamp_attempts` 记进 attempts）。`meta.{created_at,updated_at}` 已在
    // `workbuddy_session_meta` 归一过，兜底路径直接用。
    let now_secs = now_unix_secs();
    let mut stamps: Vec<String> = records
        .iter()
        .filter_map(|r| match normalize_wb_ts(r.get("timestamp"), now_secs) {
            TsNorm::Value(s) => Some(s),
            TsNorm::OutOfWindow | TsNorm::Absent => None,
        })
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
    let source_snapshot = read_workbuddy_source_snapshot(&root);
    json!({ "host": "workbuddy", "sessions": sessions, "source_snapshot": source_snapshot })
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

/// credit_json 单条**积分**值 → 厘（i64）。按厘累计再除 100，规避浮点逐条相加的漂移；
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

/// credit_json 里所有 requestId 值求和 → 厘（i64）。空串/空格串/非法 JSON/非对象
/// → 0。`cost_of` 与 `is_unbilled_to_credits` 共用这一把求和，别各写一份。
fn credit_cents(cj: Option<&str>) -> i64 {
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
    cents
}

/// 公开加量包兑换价：1000 积分 = 50 CNY，2026-07-01 起。只是**名义栏**的度量换算
/// （§5.1/§6.1）——不是价卡，不进实付栏或预算分子。汇率变了改这个串，不改静默数字。
const WB_NOMINAL_BASIS: &str = "pack-price-public:1000cr=50CNY@2026-07-01";

/// 非积分轨会话（`used` 有值、credit 求和为 0）的诚实注记。`credits: 0.0` 是**真
/// 测量**（平台积分轨确实没消耗），不是「没花钱」——该会话在用户自配 API 账户上的
/// 真实花费本机不可观测，这条 note 承担那层意思（spec §6.1、§11 第 14 条）。
// spec §2.1：**绝不指认成因**。旧串断言「钱花在用户自有 API 账户」——真机
// 当场证伪：`hy3` 是平台内置模型、根本没有自配路由可走，却有零积分会话，
// 用户 2026-09-11 给出真相是**平台推广自家模型的限免**（真免费，不存在那笔
// 支出）。零积分至少三种成因（自配路由 / 限免促销 / 宿主未记账）且本机不可
// 分辨，适配器的职责到「未计入积分」为止，再往下是用户声明的领域。
const WB_UNBILLED_TO_CREDITS_NOTE: &str =
    "session not billed to credits: the platform credit ledger recorded no consumption \
(credits: 0.0 is a real measurement). The cause is NOT determinable from this machine \
— a self-configured route, a promotional free tier, and host-side non-billing are \
indistinguishable here.";

/// spec §6.1 成本块，键序 `{tokens, credits, cash_cny, nominal_cny, nominal_basis,
/// host_billed}`（字节一致，Python 镜像逐字节对齐，不能重排）。tokens = `used`
/// （聚合 token，无逐请求 Usage）；credits = credit_json 求和（**积分**，不是货币）；
/// cash_cny 恒 null（本机无支付证据，绝不填 0）；nominal_cny = credits × 0.05
/// （名义栏输入，不可进实付栏/预算分子）。usage 行缺失且 credit_json 空 → None
/// （诚实缺失，不编 0）。`credit_json` 空串算「没有」，空格串算「有但解析出 0」。
fn cost_of(meta: &WorkbuddySessionMeta) -> Option<Value> {
    let cj = meta.credit_json.as_deref();
    if meta.used.is_none() && cj.map(|s| s.is_empty()).unwrap_or(true) {
        return None;
    }
    let tokens = match meta.used {
        Some(u) if u >= 0 => u,
        _ => 0,
    };
    let cents = credit_cents(cj);
    // 名义人民币 = credits × 0.05；按厘累计（cents × 0.05）再 round，与 credit 求和
    // 同一防浮点漂移手法。Python `round` 是银行家舍入、Rust `.round()` 半数向上——
    // 差异只在 x.5，兑换价 × 整数厘不落 x.5（fixture 与真实账单均无），可接受。
    let nominal_cents = (cents as f64 * 0.05).round() as i64;
    Some(json!({
        "tokens": tokens,
        "credits": cents as f64 / 100.0,
        "cash_cny": Value::Null,
        "nominal_cny": nominal_cents as f64 / 100.0,
        "nominal_basis": WB_NOMINAL_BASIS,
        "host_billed": true,
    }))
}

/// 非积分轨判定：`used` 有值但 credit 求和为 0（credit_json 空/缺/空对象）。与
/// `cost_of` 的「整块 None」降级互斥——那条还要求 `used` 也缺失。
fn is_unbilled_to_credits(meta: &WorkbuddySessionMeta) -> bool {
    meta.used.is_some() && credit_cents(meta.credit_json.as_deref()) == 0
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
    // spec §6.2 rule 3：越界 epoch-ms 时间戳报 null 之外，留一条 attempts 痕迹。
    // 必须在 `records` 被 `build_workbuddy_evidence` move 走之前算。
    let ts_attempts = timestamp_attempts(db_rec, &records, now_unix_secs());
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
    attempts.extend(ts_attempts);

    // `file` = 主账本文件（审计据以计算的 audit-log）；db 独苗会话无审计记录 → db
    // 路径兜底（会话锚点所在）。
    let file = if let Some(fpath) = fpath {
        Some(fpath.to_string_lossy().to_string())
    } else if db_rec.is_some() {
        Some(root.join("workbuddy.db").to_string_lossy().to_string())
    } else {
        None
    };

    // 非积分轨会话：`credits: 0.0` 是真测量，但真实开销在用户自配 API 账户、本机
    // 不可见——由 note 承担那层意思，不由数字冒充（spec §11 第 14 条）。
    let mut notes = ev["notes"].as_array().cloned().unwrap_or_default();
    if is_unbilled_to_credits(&meta) {
        notes.push(json!(WB_UNBILLED_TO_CREDITS_NOTE));
    }

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
        "notes": notes,
        "source_snapshot": read_workbuddy_source_snapshot(&root),
    }))
}
