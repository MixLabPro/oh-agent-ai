//! Stage B（spec §5.1/§3.4）：SQLite **可重建查询索引**。
//!
//! 权威事实永远在 `evidence` 的 JSONL（`<data_home>/facts/<host>.jsonl`）；
//! 本模块的 SQLite 只承担「筛选、排序、分页、跨页面查询」——spec §3.4 的
//! 分层表把它标成 *可重建投影*：**删库 → `rebuild_from_jsonl` → 等价投影**
//! 是本模块的 DoD（spec §8 条款 1），也是它的迁移策略（见下）。
//!
//! 设计决定（每条写明为什么）：
//!
//! 1. **`fact_id` PRIMARY KEY**：JSONL 重放（权威序）+ `INSERT OR IGNORE`
//!    ——索引层的去重与 writer 层（`evidence::FactWriter`）同源同键，两层
//!    不会各说各话。索引永远不充当 `fact_id` 的产生方（spec §3.4：「SQLite
//!    主键……均不能充当 fact_id」——这里的主键只是去重容器，身份仍在契约层）。
//! 2. **迁移 = 整库重建**：schema_version 不匹配 / 库损坏 → drop + 从 JSONL
//!    全量重放。可重建索引的"迁移"就该是这个形状——把增量迁移逻辑写在这里
//!    等于给一个可丢弃的缓存做保值，成本全花在错的地方。旧库文件直接删除。
//! 3. **不派生 day 列**：北京日归属是宿主逻辑（claude 的 UTC+8 日线在
//!    `hosts/claude_code/sessions/usage.rs::day_from_iso_ts`，DSH/Codex 各有
//!    各的），在索引层复制任何一份都违反「单一 wire 解释」。v1 索引只钉
//!    身份 + host + ts + 模型/供应商 + 四桶 token + raw——day 聚合继续走
//!    fold（`token_by_date_model`），那是它已验证的家。
//! 4. **raw 全文列**：每行存原始 fact JSON。索引是投影，投影损坏/列不够用
//!    时能从自己身上读回事实——SQLite 绝不是把事实"压缩丢了"的那一层。

use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

use rusqlite::Connection;
use serde_json::Value;

/// 当前索引 schema 版本。任何不匹配 → 整库重建（决定 2）。
///
/// v2（2026-09-06）：`event_peak` + `source_profile` 两列——**都在插入时从
/// 事实既有字段派生**（peak = `domain::usage::is_peak_slot(event_ts_utc)`，
/// source = fact 自己的 `source_profile`），不要求 emitter 重发：v1 JSONL
/// 重放即得 v2 索引（附录 A evolution 纪律「不破坏 JSONL 重建等价性」）。
/// peak 是预算/告警搬上索引（§5 退休路径第 ③ 步）的分母维度；source 是
/// DSH `by_source` 视角的索引侧落位。
pub const INDEX_SCHEMA_VERSION: u32 = 2;

/// 索引打开/查询错误。`Corrupt` = SQLite 层损坏（重建是修复路径）。
#[derive(Debug)]
pub enum IndexError {
    Sqlite(rusqlite::Error),
    /// facts JSONL 侧的损坏（rebuild 读权威源时）——透传行号。
    Corrupt { line_no: usize },
    Io(std::io::Error),
}

impl From<rusqlite::Error> for IndexError {
    fn from(e: rusqlite::Error) -> Self {
        IndexError::Sqlite(e)
    }
}

impl From<std::io::Error> for IndexError {
    fn from(e: std::io::Error) -> Self {
        IndexError::Io(e)
    }
}

impl std::fmt::Display for IndexError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            IndexError::Sqlite(e) => write!(f, "index sqlite: {e}"),
            IndexError::Corrupt { line_no } => {
                write!(f, "facts jsonl corrupt at line {line_no} — 权威源损坏，先修源再 rebuild")
            }
            IndexError::Io(e) => write!(f, "index io: {e}"),
        }
    }
}

/// rebuild 报告：每宿主重放的事实数 + 跳过的 crash 半行。
#[derive(Debug, Default, serde::Serialize)]
pub struct RebuildReport {
    /// 每宿主插入的事实数（host → count，字典序）。
    pub hosts: BTreeMap<String, usize>,
    pub total: usize,
    /// rebuild 过程中执行的尾面修复次数（crash 残留，与 evidence 同语义）。
    pub repaired_tails: usize,
}

/// ISO 事实时间戳 → 是否高峰（1/0）。派生链：
/// `YYYY-MM-DDTHH:MM:SS` 前缀 → `domain::usage::ms_from_civil`（Hinnant）→
/// `is_peak_slot`（北京 9-12/14-18 工作日，与 fold 侧 peak_* 桶同一把尺）。
///
/// **偏移归一（审查 P2-2）**：`is_peak_slot` 收 UTC ms——Z 结尾照直算；
/// RFC3339 `±HH:MM` 偏移（codex 顶层 timestamp 原样透传，可能带非零偏移）
/// 先减掉偏移再算，否则同一事件在索引与 fold 两侧报不同的 peak（预算
/// 分母会落这个偏差）。偏移格式不齐 → 0（宁可少算峰值不臆造，与
/// usage.rs `is_peak` 的保守方向同款）。
fn peak_of(ts: &str) -> i64 {
    let b = ts.as_bytes();
    if b.len() < 19 || b[4] != b'-' || b[7] != b'-' || b[10] != b'T' {
        return 0;
    }
    let (Some(y), Some(mo), Some(d), Some(hh), Some(mi), Some(ss)) = (
        ts.get(0..4).and_then(|s| s.parse::<i64>().ok()),
        ts.get(5..7).and_then(|s| s.parse::<u32>().ok()),
        ts.get(8..10).and_then(|s| s.parse::<u32>().ok()),
        ts.get(11..13).and_then(|s| s.parse::<i64>().ok()),
        ts.get(14..16).and_then(|s| s.parse::<i64>().ok()),
        ts.get(17..19).and_then(|s| s.parse::<i64>().ok()),
    ) else {
        return 0;
    };
    // 尾部（秒后）：小数秒（`.fff`）任意、`Z`/`z` 收尾 → 偏移 0；
    // `±HH:MM` → 偏移分钟。形如 `.000Z`（claude 真机 100%）与 `.965Z` 都要
    // 认——上一版只认「19 字节后恰好是 Z」，把带毫秒的事实全判成 0。
    let mut rest = &ts[19..];
    let mut offset_min: i64 = 0;
    if rest.ends_with('Z') || rest.ends_with('z') {
        rest = &rest[..rest.len() - 1];
    } else if let Some(pos) = rest.rfind(['+', '-']) {
        let (frac, off) = rest.split_at(pos);
        match (
            off.get(1..3).and_then(|s| s.parse::<i64>().ok()),
            off.get(4..6).and_then(|s| s.parse::<i64>().ok()),
            off.len() == 6,
        ) {
            (Some(oh), Some(om), true) => {
                let sign = if off.starts_with('-') { -1 } else { 1 };
                offset_min = sign * (oh * 60 + om);
                rest = frac;
            }
            _ => return 0,
        }
    }
    // 剩余必须全是小数秒（数字与点）；其余形状（时区缩写等）不猜。
    if !rest.is_empty() && !rest.bytes().all(|c| c.is_ascii_digit() || c == b'.') {
        return 0;
    }
    match agent_vitals_domain::usage::ms_from_civil(y, mo, d, hh as u32, mi as u32, ss as u32) {
        // 偏移减回 UTC：本地钟 18:00+08:00 = UTC 10:00。
        Some(ms) => i64::from(agent_vitals_domain::usage::is_peak_slot(ms - offset_min * 60_000)),
        None => 0,
    }
}

/// "YYYY-MM-DD" → (y, m, d)。None = 格式不齐（调用方报错，不猜）。
fn parse_ymd(date: &str) -> Option<(i64, u32, u32)> {
    if date.len() != 10 || date.as_bytes()[4] != b'-' || date.as_bytes()[7] != b'-' {
        return None;
    }
    Some((
        date.get(0..4)?.parse().ok()?,
        date.get(5..7)?.parse().ok()?,
        date.get(8..10)?.parse().ok()?,
    ))
}

/// 默认索引路径：`<data_home>/index.sqlite3`。名字明示"这是个可丢弃索引"。
pub fn default_index_path(data_home: &Path) -> PathBuf {
    data_home.join("index.sqlite3")
}

/// facts 索引连接。**非 Send 边界**：rusqlite `Connection` 不是 Sync，调用方
/// 每线程自开（本机嵌入式用法，spec §5.1——无 App Server）。
pub struct FactsIndex {
    conn: Connection,
}

impl FactsIndex {
    /// 打开（不存在则创建）。返回 `(索引, 是否全新建库)`——全新库由
    /// [`Self::open_or_rebuild`] 立即从权威源播种。版本不匹配 / 库损坏以
    /// `__needs_rebuild__` 前缀的 Sqlite 错误上抛，由 open_or_rebuild 兜住。
    fn open_raw(db_path: &Path) -> Result<(Self, bool), IndexError> {
        if let Some(dir) = db_path.parent() {
            std::fs::create_dir_all(dir)?;
        }
        let conn = Connection::open(db_path)?;
        // WAL：桌面端托盘/CLI 并发读（Tauri 查询 + ingest 写）不互卡。
        // 失败不致命（某些文件系统不支持）——降级默认 journal 继续用。
        let _ = conn.pragma_update(None, "journal_mode", "WAL");
        let fresh = Self::ensure_schema(&conn)?;
        Ok((Self { conn }, fresh))
    }

    /// 建表 + 版本判定。返回是否**全新**建库。
    fn ensure_schema(conn: &Connection) -> Result<bool, IndexError> {
        conn.execute_batch(
            "BEGIN;
             CREATE TABLE IF NOT EXISTS schema_meta(
                 key TEXT PRIMARY KEY, value TEXT NOT NULL);
             COMMIT;",
        )?;
        let version: Option<u32> = conn
            .query_row(
                "SELECT value FROM schema_meta WHERE key = 'schema_version'",
                [],
                |r| r.get::<_, String>(0),
            )
            .ok()
            .and_then(|v| v.parse().ok());
        let facts_exists: bool = conn
            .query_row(
                "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'facts'",
                [],
                |_| Ok(true),
            )
            .unwrap_or(false);
        // 穷尽性按构造成立：guard 不参与 match 穷尽检查，用 if/else 链。
        if let Some(v) = version {
            if v > INDEX_SCHEMA_VERSION {
                // 比本二进制新：库是更新的实现写的，重建只会丢索引新语义——上抛。
                return Err(IndexError::Sqlite(rusqlite::Error::InvalidParameterName(
                    format!(
                        "index schema v{v} is newer than supported v{INDEX_SCHEMA_VERSION} — 升级二进制"
                    ),
                )));
            }
            if v < INDEX_SCHEMA_VERSION {
                // 旧版本 → 重建需求。
                return Err(IndexError::Sqlite(rusqlite::Error::InvalidParameterName(
                    format!("__needs_rebuild__:v{v}"),
                )));
            }
        } else if facts_exists {
            // 有 facts 表但没有版本行：预版本化遗留 → 重建需求。
            return Err(IndexError::Sqlite(rusqlite::Error::InvalidParameterName(
                "__needs_rebuild__:v0".to_string(),
            )));
        }
        let fresh = !facts_exists;
        conn.execute_batch(
            "BEGIN;
             CREATE TABLE IF NOT EXISTS facts(
                 fact_id            TEXT PRIMARY KEY,
                 host               TEXT NOT NULL,
                 machine_namespace  TEXT NOT NULL,
                 native_session_id  TEXT NOT NULL,
                 source_event_id    TEXT NOT NULL,
                 observation_kind   TEXT NOT NULL,
                 event_ts_utc       TEXT,
                 model_id           TEXT,
                 provider_id        TEXT,
                 source_profile     TEXT,
                 event_peak         INTEGER NOT NULL DEFAULT 0,
                 t_uncached_input   INTEGER NOT NULL DEFAULT 0,
                 t_cache_read       INTEGER NOT NULL DEFAULT 0,
                 t_cache_write      INTEGER NOT NULL DEFAULT 0,
                 t_output           INTEGER NOT NULL DEFAULT 0,
                 raw                TEXT NOT NULL
             );
             CREATE INDEX IF NOT EXISTS facts_host_ts ON facts(host, event_ts_utc);
             CREATE INDEX IF NOT EXISTS facts_session ON facts(host, native_session_id);
             COMMIT;",
        )?;
        // execute_batch 不绑参——版本行用静态 SQL 写入。
        conn.execute(
            "INSERT OR REPLACE INTO schema_meta(key, value) VALUES('schema_version', ?1)",
            rusqlite::params![INDEX_SCHEMA_VERSION.to_string()],
        )?;
        Ok(fresh)
    }

    /// 生产入口：健康库直接开；全新库立即从权威 JSONL 播种；版本旧/损坏 →
    /// 删库重建。`bool` = 本次调用是否执行了 rebuild（调用方如实上报）。
    pub fn open_or_rebuild(db_path: &Path, facts_root: &Path) -> Result<(Self, bool), IndexError> {
        match Self::open_raw(db_path) {
            Ok((idx, true)) => {
                idx.rebuild_from_jsonl(facts_root)?;
                Ok((idx, true))
            }
            Ok((idx, false)) => Ok((idx, false)),
            Err(IndexError::Sqlite(e))
                if e.to_string().starts_with("__needs_rebuild__")
                    || e.to_string().contains("newer than supported") =>
            {
                if e.to_string().contains("newer than supported") {
                    return Err(IndexError::Sqlite(e)); // 新 schema 是升级问题，重建丢语义
                }
                Self::drop_and_rebuild(db_path, facts_root).map(|(idx, _)| (idx, true))
            }
            // **审查发现 4（损坏自愈）**：SQLITE_CORRUPT / NOTADB / 其他 open
            // 期 Sqlite 错误——权威 JSONL 完好时索引可丢弃重建，这是 DoD #1
            // 的日常形态，不该让用户手跑 data-rebuild-index。重建失败才上抛
            // （磁盘级问题）。
            Err(IndexError::Sqlite(_)) => {
                Self::drop_and_rebuild(db_path, facts_root).map(|(idx, _)| (idx, true))
            }
            Err(e) => Err(e),
        }
    }

    /// 删库 → 重建（决定 2 的迁移路径；也 [`Self::rebuild_from_jsonl`] 的外壳）。
    /// 返回 (索引, 重建报告)——调用方（CLI `data-rebuild-index`、ingest 自愈）
    /// 都要把报告如实上呈。
    pub fn drop_and_rebuild(
        db_path: &Path,
        facts_root: &Path,
    ) -> Result<(Self, RebuildReport), IndexError> {
        // WAL 的 -wal/-shm 残留一并清（旧连接的尾巴不该污染新库）。
        for suffix in ["", "-wal", "-shm"] {
            let p = PathBuf::from(format!("{}{suffix}", db_path.display()));
            if p.exists() {
                std::fs::remove_file(&p)?;
            }
        }
        let (idx, _fresh) = Self::open_raw(db_path)?;
        let report = idx.rebuild_from_jsonl(facts_root)?;
        Ok((idx, report))
    }

    /// 全量重建：清空 facts 表 → 重放 `<facts_root>/<host>.jsonl` → 逐条
    /// 插入。**JSONL 是权威**：重放读回什么就是什么；crash 半行按 evidence
    /// 同款修复语义计数（`RebuildReport::repaired_tails`）。
    pub fn rebuild_from_jsonl(&self, facts_root: &Path) -> Result<RebuildReport, IndexError> {
        let mut report = RebuildReport::default();
        // **事务包裹（DoD #2：投影提交点注入崩溃可恢复）**：DELETE 与插入
        // 同事务——rebuild 中途崩溃回滚到旧索引，绝不会留下「空索引装健康」
        // 的半提交态（那会让 open 判健康、查询静默返回 0 条——假零）。
        let outcome = (|| -> Result<RebuildReport, IndexError> {
            self.conn.execute_batch("BEGIN IMMEDIATE")?;
            self.conn.execute("DELETE FROM facts", [])?;
            let known: Vec<String> = std::fs::read_dir(facts_root)
                .map(|entries| {
                    entries
                        .filter_map(|e| e.ok())
                        .filter_map(|e| {
                            let name = e.file_name().to_string_lossy().to_string();
                            name.strip_suffix(".jsonl").map(String::from)
                        })
                        .collect()
                })
                .unwrap_or_default();
            for host in known {
                let path = facts_root.join(format!("{host}.jsonl"));
                let rep = crate::evidence::replay(&path).map_err(|e| match e {
                    crate::evidence::AppendError::Corrupt { line_no } => {
                        IndexError::Corrupt { line_no }
                    }
                    crate::evidence::AppendError::Io(e) => IndexError::Io(e),
                    crate::evidence::AppendError::Invalid(_) => {
                        unreachable!("replay() never validates facts")
                    }
                })?;
                let mut inserted = 0usize;
                for fact in &rep.facts {
                    if self.insert_fact(fact)? {
                        inserted += 1;
                    }
                }
                report.repaired_tails += rep.tail_repair.is_some() as usize;
                report.hosts.insert(host, inserted);
                report.total += inserted;
            }
            Ok(report)
        })();
        match outcome {
            Ok(r) => {
                self.conn.execute_batch("COMMIT")?;
                Ok(r)
            }
            Err(e) => {
                // 回滚到 rebuild 前的索引内容——崩溃安全的关键半边（另一半
                // 是进程死亡时 SQLite journal 自己回滚）。
                let _ = self.conn.execute_batch("ROLLBACK");
                Err(e)
            }
        }
    }

    /// 插入一条事实。`Ok(true)` = 新插入；`Ok(false)` = fact_id 已在索引
    /// （重放幂等 / ingest 与索引竞速时的自然去重）。
    pub fn insert_fact(&self, fact: &Value) -> Result<bool, IndexError> {
        let get = |k: &str| fact.get(k).and_then(Value::as_str);
        let tok = |k: &str| fact.get(k).and_then(Value::as_i64).unwrap_or(0);
        let fact_id = get("fact_id").unwrap_or_default();
        if fact_id.is_empty() {
            // 没有身份的事实不该进索引——它是坏事实（ingest 层已计数），
            // 索引层拒绝是第二道闸。
            return Ok(false);
        }
        let n = self.conn.execute(
            "INSERT OR IGNORE INTO facts(
                 fact_id, host, machine_namespace, native_session_id,
                 source_event_id, observation_kind, event_ts_utc,
                 model_id, provider_id, source_profile, event_peak,
                 t_uncached_input, t_cache_read, t_cache_write, t_output, raw)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16)",
            rusqlite::params![
                fact_id,
                get("host").unwrap_or_default(),
                get("machine_namespace").unwrap_or_default(),
                get("native_session_id").unwrap_or_default(),
                get("source_event_id").unwrap_or_default(),
                get("observation_kind").unwrap_or_default(),
                get("event_ts_utc"),
                get("model_id").or(get("model_raw")),
                get("provider_id").or(get("billing_source")),
                get("source_profile"),
                peak_of(get("event_ts_utc").unwrap_or_default()),
                tok("uncached_input_tokens"),
                tok("cache_read_tokens"),
                tok("cache_write_tokens"),
                tok("output_tokens"),
                fact.to_string(),
            ],
        )?;
        Ok(n > 0)
    }

    /// 每宿主四桶 token 总和——`evidence::reconcile_tokens` 的索引侧对账面。
    /// 键 = host，值 = `{uncached_input, cache_read, cache_write, output, total}`。
    ///
    /// `month: Some("YYYY-MM")` 按事实的 `event_ts_utc` 前缀过滤（ISO 时间
    /// 串的月份前缀匹配就是月窗）。**审查 P1-3**：不过滤的版本拿全量累计
    /// 对账按月 DTO，跨月后必然恒 mismatch——对账语义必须是同窗口对同窗口。
    pub fn tokens_by_host(&self, month: Option<&str>) -> Result<Value, IndexError> {
        let mut stmt = match month {
            Some(_) => self.conn.prepare(
                "SELECT host,
                        SUM(t_uncached_input), SUM(t_cache_read),
                        SUM(t_cache_write), SUM(t_output)
                 FROM facts WHERE event_ts_utc LIKE ?1 || '%'
                 GROUP BY host ORDER BY host",
            )?,
            None => self.conn.prepare(
                "SELECT host,
                        SUM(t_uncached_input), SUM(t_cache_read),
                        SUM(t_cache_write), SUM(t_output)
                 FROM facts GROUP BY host ORDER BY host",
            )?,
        };
        fn sum_row() -> impl Fn(&rusqlite::Row<'_>) -> rusqlite::Result<(String, i64, i64, i64, i64)> {
            |r| {
                Ok((
                    r.get::<_, String>(0)?,
                    r.get::<_, i64>(1)?,
                    r.get::<_, i64>(2)?,
                    r.get::<_, i64>(3)?,
                    r.get::<_, i64>(4)?,
                ))
            }
        }
        let rows = match month {
            Some(m) => stmt.query_map(rusqlite::params![m], sum_row())?,
            None => stmt.query_map([], sum_row())?,
        };
        let mut out = serde_json::Map::new();
        for row in rows {
            let (host, a, b, c, d) = row?;
            out.insert(
                host,
                serde_json::json!({
                    "uncached_input": a, "cache_read": b,
                    "cache_write": c, "output": d, "total": a + b + c + d,
                }),
            );
        }
        Ok(Value::Object(out))
    }

    /// 单日 × 每宿主的按小时 token 总和（北京小时）——hourly UI 的事实索引
    /// 查询面。**小时在读取时现算**：事实只带 UTC ISO `event_ts_utc`，北京
    /// 日 D 的 UTC 窗 = [D-1T16:00Z, DT16:00Z)，窗口内每行 +8h 归小时。ISO
    /// 零填充格式的字符串序比较即窗口过滤（emitter 恒产 Z 后缀定宽 ts）。
    ///
    /// 返回 `{host: {"HH": tokens}}`——只含有量小时；某宿主键缺席 = 该日该
    /// 宿主没有任何已 ingest 事实（消费方据此回退既有生产面，不渲染假零）。
    pub fn hours_by_host(&self, date: &str) -> Result<serde_json::Value, IndexError> {
        // 北京日 D 的 UTC 窗起点 = 前一日的 "T16"。prev 日用 civil/days
        // round-trip（domain 的 Hinnant 算法），不做字符串手拆。
        let (y, m, d) = parse_ymd(date).ok_or_else(|| {
            IndexError::Sqlite(rusqlite::Error::InvalidParameterName(format!(
                "invalid date `{date}` (want YYYY-MM-DD)"
            )))
        })?;
        let days = agent_vitals_domain::usage::days_from_civil(y, m, d);
        let prev = agent_vitals_domain::usage::civil_date_from_days(days - 1);
        let window_start = format!("{prev}T16");
        let window_end = format!("{date}T16");

        let mut stmt = self.conn.prepare(
            "SELECT host, event_ts_utc,
                    SUM(t_uncached_input + t_cache_read + t_cache_write + t_output)
             FROM facts
             WHERE event_ts_utc >= ?1 AND event_ts_utc < ?2
             GROUP BY host, event_ts_utc",
        )?;
        fn hour_row(r: &rusqlite::Row<'_>) -> rusqlite::Result<(String, String, i64)> {
            Ok((r.get(0)?, r.get(1)?, r.get(2)?))
        }
        let rows = stmt.query_map(rusqlite::params![window_start, window_end], hour_row)?;
        let mut out: std::collections::BTreeMap<String, [i64; 24]> = Default::default();
        for row in rows {
            let (host, ts, total) = row?;
            // UTC 小时 → 北京小时（+8 取模；窗口已保证落在北京日 D 内）。
            let utc_hour: i64 = ts.get(11..13).and_then(|s| s.parse().ok()).unwrap_or(0);
            let bj = (utc_hour + 8) % 24;
            out.entry(host).or_insert([0i64; 24])[bj as usize] += total;
        }
        let mut obj = serde_json::Map::new();
        for (host, hours) in out {
            let m: serde_json::Map<String, Value> = hours
                .iter()
                .enumerate()
                .filter(|(_, v)| **v > 0)
                .map(|(i, v)| (format!("{i:02}"), Value::from(*v)))
                .collect();
            obj.insert(host, Value::Object(m));
        }
        Ok(Value::Object(obj))
    }

/// DSH 单月的 days map（北京日 × 顶层 8 桶：4 基础 + 4 peak）——**与
/// month.json 的 days 同形**，喂给同一个 `domain::cost::month_cost` 就得到
/// 同一把尺的月成本（退休路径 ③：预算/告警的索引数据面。state 链的
/// month.json days 无 by_model，走 `bucket_cost`——本投影刻意同形，不做
/// by_model 精化，两边差一分钱都是对账事故）。
///
/// 北京日行滚：UTC 小时 ≥16 → 次日（UTC+8 日线，与 hours_by_host 同款）。
/// 月窗 = UTC [前月末 16:00, 本月末 16:00)（审查 F1 收口）。
///
/// **前提：本查询只喂 host='dsh'**——DSH 事实的 `event_ts_utc` 恒为 Z 结尾
/// 定宽（`dsh_usage_fact` 的源保证）；本函数的日行滚与窗口都按 UTC 串直读，
/// 不解析偏移（`peak_of` 才做偏移归一）。若未来要复用给带偏移的宿主，必须
/// 先归一偏移，否则日归属会静默错一天。
pub fn dsh_days_map(&self, month: &str) -> Result<Value, IndexError> {
    // month 是 7 字符 "YYYY-MM"（parse_ymd 是 10 字符日期——别混）。
    if month.len() != 7 || month.as_bytes()[4] != b'-' {
        return Err(IndexError::Sqlite(rusqlite::Error::InvalidParameterName(
            format!("invalid month `{month}` (want YYYY-MM)"),
        )));
    }
    let (y, m) = match (
        month.get(0..4).and_then(|s| s.parse::<i64>().ok()),
        month.get(5..7).and_then(|s| s.parse::<u32>().ok()),
    ) {
        (Some(y), Some(m)) => (y, m),
        _ => {
            return Err(IndexError::Sqlite(rusqlite::Error::InvalidParameterName(
                format!("invalid month `{month}` (want YYYY-MM)"),
            )))
        }
    };
    let first = agent_vitals_domain::usage::days_from_civil(y, m, 1);
    let prev_day = agent_vitals_domain::usage::civil_date_from_days(first - 1);
    let next_first = agent_vitals_domain::usage::days_from_civil(
        if m == 12 { y + 1 } else { y },
        if m == 12 { 1 } else { m + 1 },
        1,
    );
    // 北京月 M = UTC [M-1 的 T16, M 的月末 T16)。**上界是本月末日 T16**
    // （= 北京次月 1 日 00:00）——写成次月 1 日 T00 会把北京次月 1 日
    // 00:00–08:00 的用量划进本月 map（+1 day 行滚），同批事件又在次月
    // map 里 = 跨月双计（审查 F1；hours_by_host 的单日窗同款边界）。
    let month_last = agent_vitals_domain::usage::civil_date_from_days(next_first - 1);
    let window_start = format!("{prev_day}T16");
    let window_end = format!("{month_last}T16");

    // **必须带 model_id 分组**：state 归档日的 by_model 用 provider 前缀
    // 模型名（`deepseek/deepseek-v4-pro-0813` 专属贵卡），facts 的 model_id
    // 同词表——priced_day 走 cost_report 逐模型计价。不带 by_model 会落到
    // bucket_cost 的 fallback flash 价（双轨对账当场抓到：同 token、钱差
    // 2.9×）。
    let mut stmt = self.conn.prepare(
        "SELECT CASE WHEN CAST(substr(event_ts_utc,12,2) AS INTEGER) >= 16
                      THEN date(substr(event_ts_utc,1,10), '+1 day')
                      ELSE substr(event_ts_utc,1,10) END AS bj_day,
                COALESCE(model_id, 'unknown'), event_peak,
                SUM(t_uncached_input), SUM(t_cache_read),
                SUM(t_cache_write), SUM(t_output)
         FROM facts
         WHERE host = 'dsh' AND event_ts_utc >= ?1 AND event_ts_utc < ?2
         GROUP BY bj_day, model_id, event_peak
         ORDER BY bj_day, model_id, event_peak",
    )?;
    fn day_row(
        r: &rusqlite::Row<'_>,
    ) -> rusqlite::Result<(String, String, i64, i64, i64, i64, i64)> {
        Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?, r.get(5)?, r.get(6)?))
    }
    let rows = stmt.query_map(rusqlite::params![window_start, window_end], day_row)?;
    let mut days: serde_json::Map<String, Value> = serde_json::Map::new();
    let base = ["uncached_input_tokens", "cache_read_tokens", "cache_write_tokens", "output_tokens"];
    let peakk = ["peak_uncached_input_tokens", "peak_cache_read_tokens", "peak_cache_write_tokens", "peak_output_tokens"];
    for row in rows {
        let (day, model, peak, a, b, c, d) = row?;
        let e = days.entry(day).or_insert_with(|| {
            serde_json::json!({
                "uncached_input_tokens": 0, "cache_read_tokens": 0,
                "cache_write_tokens": 0, "output_tokens": 0,
                "peak_uncached_input_tokens": 0, "peak_cache_read_tokens": 0,
                "peak_cache_write_tokens": 0, "peak_output_tokens": 0,
                "by_model": {},
            })
        });
        // by_model：per-model 桶（8 键同形）——priced_day 的精确计价输入。
        {
            let bm = e.get_mut("by_model").and_then(Value::as_object_mut).expect("by_model is object");
            let m = bm.entry(model).or_insert_with(|| {
                serde_json::json!({
                    "uncached_input_tokens": 0, "cache_read_tokens": 0,
                    "cache_write_tokens": 0, "output_tokens": 0,
                    "peak_uncached_input_tokens": 0, "peak_cache_read_tokens": 0,
                    "peak_cache_write_tokens": 0, "peak_output_tokens": 0,
                })
            });
            for (i, v) in [a, b, c, d].iter().enumerate() {
                let cur = m.get(base[i]).and_then(Value::as_i64).unwrap_or(0);
                m[base[i]] = Value::from(cur + v);
                if peak == 1 {
                    let cur = m.get(peakk[i]).and_then(Value::as_i64).unwrap_or(0);
                    m[peakk[i]] = Value::from(cur + v);
                }
            }
        }
        // 顶层：base 恒加，peak 行再进 peak_ 子桶（state 链语义「base = 全量、
        // peak_ ⊆ base」，fold add_buckets 同款——把 peak 行只写 peak_ 会让
        // (base − peak) 拆分错）。
        for (i, v) in [a, b, c, d].iter().enumerate() {
            let cur = e.get(base[i]).and_then(Value::as_i64).unwrap_or(0);
            e[base[i]] = Value::from(cur + v);
            if peak == 1 {
                let cur = e.get(peakk[i]).and_then(Value::as_i64).unwrap_or(0);
                e[peakk[i]] = Value::from(cur + v);
            }
        }
    }
    Ok(Value::Object(days))
}

    pub fn fact_count(&self) -> Result<u64, IndexError> {
        Ok(self.conn.query_row("SELECT COUNT(*) FROM facts", [], |r| r.get(0))?)
    }

    /// 按 host 分页列出事实（spec §3.4：筛选/排序/分页的最小查询面）。
    /// 返回 raw JSON 行（保持 fact 原文，消费方按契约字段读）。
    pub fn facts_page(
        &self,
        host: Option<&str>,
        limit: u32,
        offset: u64,
    ) -> Result<Vec<Value>, IndexError> {
        // host 提升成 owned：match 分支里借 &str 会随分支作用域蒸发
        // （query_map 需要的参数活得比 match 臂长）。
        let host_owned = host.map(String::from);
        let mut stmt = match &host_owned {
            Some(_) => self.conn.prepare(
                "SELECT raw FROM facts WHERE host = ?1 ORDER BY event_ts_utc, fact_id \
                 LIMIT ?2 OFFSET ?3",
            )?,
            None => self.conn.prepare(
                "SELECT raw FROM facts ORDER BY event_ts_utc, fact_id LIMIT ?1 OFFSET ?2",
            )?,
        };
        // 闭包字面量各自成类型——两个 match 臂要用同一个 fn 才能统一。
        fn raw_col(r: &rusqlite::Row<'_>) -> rusqlite::Result<String> {
            r.get(0)
        }
        let rows = match &host_owned {
            Some(h) => stmt.query_map(rusqlite::params![h, limit, offset], raw_col)?,
            None => stmt.query_map(rusqlite::params![limit, offset], raw_col)?,
        };
        let mut out = Vec::new();
        for row in rows {
            out.push(serde_json::from_str(&row?).unwrap_or(Value::Null));
        }
        Ok(out)
    }
}

/// 测试与调用方共用的列名清单守卫（决定 3：不许悄悄加 day 之类的派生列）。
#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn tmp_db(tag: &str) -> PathBuf {
        std::env::temp_dir().join(format!(
            "avd-store-{tag}-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ))
    }

    fn fact(host: &str, event: &str, uncached: i64) -> Value {
        json!({
            "fact_id": format!("uf1-{host}-{event}"),
            "host": host,
            "machine_namespace": "ns-test",
            "native_session_id": "sess-1",
            "source_event_id": event,
            "observation_kind": "token_count",
            "event_ts_utc": "2026-09-05T10:00:00.000Z",
            "model_id": "glm-5.3",
            "uncached_input_tokens": uncached,
            "cache_read_tokens": 900,
            "cache_write_tokens": 10,
            "output_tokens": 5,
        })
    }

    #[test]
    fn insert_is_idempotent_by_fact_id() {
        let db = tmp_db("idem");
        let (idx, _fresh) = FactsIndex::open_raw(&db).unwrap();
        assert!(idx.insert_fact(&fact("codex", "e1", 100)).unwrap());
        assert!(!idx.insert_fact(&fact("codex", "e1", 100)).unwrap(), "同 fact_id 不二次插入");
        assert_eq!(idx.fact_count().unwrap(), 1);
        let _ = std::fs::remove_file(&db);
    }

    #[test]
    fn rebuild_from_jsonl_is_equivalent_after_delete() {
        // DoD #1 的形状：写 JSONL → 建索引 → 删库 → 重建 → 查询等价。
        let home = tmp_db("rebuild");
        let facts_root = home.join("facts");
        std::fs::create_dir_all(&facts_root).unwrap();
        let line = |v: &Value| format!("{v}\n");
        std::fs::write(
            facts_root.join("codex.jsonl"),
            format!("{}{}", line(&fact("codex", "e1", 100)), line(&fact("codex", "e2", 200))),
        )
        .unwrap();
        std::fs::write(facts_root.join("dsh.jsonl"), line(&fact("dsh", "e3", 300))).unwrap();

        let db = home.join("index.sqlite3");
        // 首开：全新库 + 权威源在 → 立即播种（这是"索引反映权威"的诚实形状）。
        let (idx, rebuilt) = FactsIndex::open_or_rebuild(&db, &facts_root).unwrap();
        assert!(rebuilt, "全新库必须从 JSONL 播种");
        let before = idx.tokens_by_host(None).unwrap();
        assert_eq!(idx.fact_count().unwrap(), 3);
        drop(idx);

        // 再开：健康库（版本匹配）不再 rebuild。
        let (idx, rebuilt) = FactsIndex::open_or_rebuild(&db, &facts_root).unwrap();
        assert!(!rebuilt, "健康库直接开");
        assert_eq!(idx.fact_count().unwrap(), 3);
        drop(idx);

        // 删库 → open_or_rebuild 必须自己重建出等价投影。
        std::fs::remove_file(&db).unwrap();
        let (idx, rebuilt) = FactsIndex::open_or_rebuild(&db, &facts_root).unwrap();
        assert!(rebuilt, "库被删后必须走 rebuild");
        assert_eq!(idx.tokens_by_host(None).unwrap(), before, "重建后投影等价");
        assert_eq!(idx.fact_count().unwrap(), 3);
        // 每宿主计数如实。
        let rep = idx.rebuild_from_jsonl(&facts_root).unwrap();
        assert_eq!(rep.hosts.get("codex"), Some(&2));
        assert_eq!(rep.hosts.get("dsh"), Some(&1));
        let _ = std::fs::remove_dir_all(&home);
    }

    #[test]
    fn corrupted_database_self_heals_from_the_authority() {
        // 审查发现 4：DoD #1 的日常形态——索引损坏（不是删除）也必须能
        // 自愈，不该让用户手跑 data-rebuild-index。
        let home = tmp_db("corrupt");
        let facts_root = home.join("facts");
        std::fs::create_dir_all(&facts_root).unwrap();
        std::fs::write(
            facts_root.join("codex.jsonl"),
            format!("{}\n", fact("codex", "e1", 100)),
        )
        .unwrap();
        let db = home.join("index.sqlite3");
        let (idx, _) = FactsIndex::open_or_rebuild(&db, &facts_root).unwrap();
        assert_eq!(idx.fact_count().unwrap(), 1);
        drop(idx);

        // 写坏库文件（SQLite 头魔数破坏 → SQLITE_NOTADB/CORRUPT）。
        std::fs::write(&db, b"NOT A SQLITE DATABASE AT ALL____garbage bytes").unwrap();
        let (idx, rebuilt) = FactsIndex::open_or_rebuild(&db, &facts_root).unwrap();
        assert!(rebuilt, "损坏库必须走重建自愈");
        assert_eq!(idx.fact_count().unwrap(), 1, "自愈后从权威源拿回等价投影");
        let _ = std::fs::remove_dir_all(&home);
    }

    #[test]
    fn month_filter_scopes_the_reconcile_window() {
        // 审查 P1-3：tokens_by_host 按月过滤——全量累计对按月 DTO 跨月恒红。
        let home = tmp_db("month");
        let facts_root = home.join("facts");
        std::fs::create_dir_all(&facts_root).unwrap();
        let mut sep = fact("codex", "sep", 100);
        sep["event_ts_utc"] = serde_json::json!("2026-09-20T10:00:00.000Z");
        let mut oct = fact("codex", "oct", 100);
        oct["event_ts_utc"] = serde_json::json!("2026-10-02T10:00:00.000Z");
        std::fs::write(
            facts_root.join("codex.jsonl"),
            format!("{}\n{}\n", sep, oct),
        )
        .unwrap();
        let db = home.join("index.sqlite3");
        let (idx, _) = FactsIndex::open_or_rebuild(&db, &facts_root).unwrap();
        assert_eq!(idx.tokens_by_host(Some("2026-09")).unwrap()["codex"]["total"],
                   serde_json::json!(1015), "9 月窗只含 9 月事实（uncached 100 + cache 900/10 + output 5）");
        assert_eq!(idx.tokens_by_host(Some("2026-10")).unwrap()["codex"]["total"],
                   serde_json::json!(1015), "10 月窗只含 10 月事实");
        assert_eq!(idx.tokens_by_host(None).unwrap()["codex"]["total"],
                   serde_json::json!(2030), "不过滤 = 全量累计");
        let _ = std::fs::remove_dir_all(&home);
    }

    #[test]
    fn failed_rebuild_rolls_back_to_the_previous_index() {
        // DoD #2 投影提交点：rebuild 中途失败（权威源损坏）→ 事务回滚 →
        // 索引保持 rebuild 前内容，绝不留下「空索引装健康」的假零态。
        let home = tmp_db("rollback");
        let facts_root = home.join("facts");
        std::fs::create_dir_all(&facts_root).unwrap();
        std::fs::write(
            facts_root.join("codex.jsonl"),
            format!("{}\n", fact("codex", "e1", 100)),
        )
        .unwrap();
        let db = home.join("index.sqlite3");
        let (idx, _) = FactsIndex::open_or_rebuild(&db, &facts_root).unwrap();
        assert_eq!(idx.fact_count().unwrap(), 1);
        drop(idx);

        // 权威源加入一个损坏文件 → rebuild 必败。
        std::fs::write(facts_root.join("dsh.jsonl"), "{good\nGARBAGE\n{bad\n").unwrap();
        let (idx, _) = FactsIndex::open_or_rebuild(&db, &facts_root).unwrap();
        assert!(idx.rebuild_from_jsonl(&facts_root).is_err());
        // 回滚后旧内容完好。
        assert_eq!(idx.fact_count().unwrap(), 1, "失败 rebuild 回滚，不空索引");
        assert_eq!(
            idx.tokens_by_host(None).unwrap()["codex"]["total"],
            serde_json::json!(1015)
        );
        let _ = std::fs::remove_dir_all(&home);
    }

    #[test]
    fn v2_derives_peak_and_source_profile_at_insert() {
        let db = tmp_db("v2");
        let idx = FactsIndex::open_raw(&db).unwrap().0;
        let mut peak = fact("dsh", "peak", 10);
        peak["event_ts_utc"] = json!("2026-09-03T02:00:00.000Z"); // 周四；02:00Z = 北京 10 点 = 高峰（is_peak_slot 收 UTC ms，内部转北京）
        peak["source_profile"] = json!("--Users-admin-proj--");
        let mut off = fact("dsh", "off", 10);
        off["event_ts_utc"] = json!("2026-09-04T23:00:00.000Z"); // 深夜 = 空闲
        idx.insert_fact(&peak).unwrap();
        idx.insert_fact(&off).unwrap();
        // 坏 ts → 0（宁可少算峰值不臆造）。
        let mut bad = fact("dsh", "bad", 10);
        bad["event_ts_utc"] = json!("not-a-ts");
        idx.insert_fact(&bad).unwrap();
        // event_peak/source_profile 是**投影列**（不在 raw fact JSON 里）——
        // 直接查列。
        let conn = rusqlite::Connection::open(&db).unwrap();
        let mut stmt = conn
            .prepare("SELECT source_event_id, event_peak, source_profile FROM facts ORDER BY source_event_id")
            .unwrap();
        let rows: Vec<(String, i64, Option<String>)> = stmt
            .query_map([], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))
            .unwrap()
            .filter_map(Result::ok)
            .collect();
        let get = |e: &str| rows.iter().find(|(id, _, _)| id == e).unwrap();
        assert_eq!(get("peak").1, 1, "02:00Z = 北京周四 10 点 = 高峰（9-3 周四；9-4 周五全天空闲）");
        assert_eq!(get("peak").2.as_deref(), Some("--Users-admin-proj--"));
        assert_eq!(get("off").1, 0, "深夜 = 空闲");
        assert_eq!(get("bad").1, 0, "坏 ts 宁可少算峰值不臆造");
        // 偏移归一（审查 P2-2）：+08:00 的 18:00 = UTC 10:00（周四非高峰——
        // 北京 02:00 周五？不对：18:00-08:00=10:00Z=北京 18:00=非高峰窗）；
        // 与同 UTC 时刻的 Z 形式必须报同一个 peak。
        let mut with_off = fact("dsh", "withoff", 10);
        with_off["event_ts_utc"] = json!("2026-09-03T18:00:00+08:00");
        idx.insert_fact(&with_off).unwrap();
        let mut as_z = fact("dsh", "asz", 10);
        as_z["event_ts_utc"] = json!("2026-09-03T10:00:00Z");
        idx.insert_fact(&as_z).unwrap();
        // 毫秒形态（claude 真机 100% 是 .965Z / .000Z）——上一版 tail 校验
        // 把它们全判 0，这里钉住。
        let mut msz = fact("dsh", "msz-peak", 10);
        msz["event_ts_utc"] = json!("2026-09-03T02:00:00.965Z");
        idx.insert_fact(&msz).unwrap();
        let rows2: Vec<(String, i64)> = {
            let conn = rusqlite::Connection::open(&db).unwrap();
            let mut stmt = conn
                .prepare("SELECT source_event_id, event_peak FROM facts WHERE source_event_id IN ('withoff','asz','msz-peak')")
                .unwrap();
            stmt.query_map([], |r| Ok((r.get(0)?, r.get(1)?)))
                .unwrap()
                .filter_map(Result::ok)
                .collect()
        };
        let p1 = rows2.iter().find(|(id, _)| id == "withoff").unwrap().1;
        let p2 = rows2.iter().find(|(id, _)| id == "asz").unwrap().1;
        assert_eq!(p1, p2, "同 UTC 时刻的偏移形式与 Z 形式必须同 peak");
        let p3 = rows2.iter().find(|(id, _)| id == "msz-peak").unwrap().1;
        assert_eq!(p3, 1, "带毫秒的 Z 形式照常派生 peak");
        let _ = std::fs::remove_file(&db);
    }

    #[test]
    fn v1_database_is_rebuilt_to_v2_from_the_authority() {
        let home = tmp_db("v1v2");
        let facts_root = home.join("facts");
        std::fs::create_dir_all(&facts_root).unwrap();
        std::fs::write(
            facts_root.join("codex.jsonl"),
            format!("{}\n", fact("codex", "e1", 100)),
        )
        .unwrap();
        let db = home.join("index.sqlite3");
        let (idx, _) = FactsIndex::open_or_rebuild(&db, &facts_root).unwrap();
        assert_eq!(idx.fact_count().unwrap(), 1);
        drop(idx);
        // 手工把版本行降回 1 → open_or_rebuild 必须走重建，且重建后 v2 列
        // 由重放重新派生（v1 JSONL 不需要重发）。
        let conn = rusqlite::Connection::open(&db).unwrap();
        conn.execute("UPDATE schema_meta SET value='1' WHERE key='schema_version'", []).unwrap();
        drop(conn);
        let (idx, rebuilt) = FactsIndex::open_or_rebuild(&db, &facts_root).unwrap();
        assert!(rebuilt, "旧版本必须触发重建");
        assert_eq!(idx.fact_count().unwrap(), 1);
        // v2 列由重放重新派生——查投影列而不是 raw（raw 是事实原文）。
        let conn = rusqlite::Connection::open(&db).unwrap();
        let has_col: bool = conn
            .query_row(
                "SELECT COUNT(*) FROM pragma_table_info('facts') WHERE name = 'event_peak'",
                [],
                |r| r.get::<_, i64>(0),
            )
            .map(|n| n > 0)
            .unwrap_or(false);
        assert!(has_col, "重建后的表必须是 v2 形状");
        let ver: String = conn
            .query_row(
                "SELECT value FROM schema_meta WHERE key = 'schema_version'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(ver, "2");
        let _ = std::fs::remove_dir_all(&home);
    }

    #[test]
    fn dsh_days_map_month_window_ends_at_month_last_t16() {
        // 审查 F1：北京月的 UTC 窗终点是本月末日 T16（不是次月 1 日 T00）
        // ——跨月凌晨用量只归次月，不得双计。
        let home = tmp_db("monthwin");
        let facts_root = home.join("facts");
        std::fs::create_dir_all(&facts_root).unwrap();
        // 北京 09-01 02:00 = UTC 08-31T18 → 归 09-01，只进 9 月 map。
        let mut aug31 = fact("dsh", "edge", 100);
        aug31["event_ts_utc"] = json!("2026-08-31T18:00:00.000Z");
        std::fs::write(
            facts_root.join("dsh.jsonl"),
            format!("{}\n", aug31),
        )
        .unwrap();
        let db = home.join("index.sqlite3");
        let (idx, _) = FactsIndex::open_or_rebuild(&db, &facts_root).unwrap();
        let aug = idx.dsh_days_map("2026-08").unwrap();
        assert!(aug.as_object().map(|m| m.is_empty()).unwrap_or(true),
                "08-31T18Z = 北京 09-01，不得落进 8 月 map：{aug}");
        let sep = idx.dsh_days_map("2026-09").unwrap();
        assert_eq!(sep["2026-09-01"]["uncached_input_tokens"], json!(100),
                   "跨月凌晨用量归北京日 09-01：{sep}");
        let _ = std::fs::remove_dir_all(&home);
    }

    #[test]
    fn facts_without_identity_are_refused_by_the_second_gate() {
        let db = tmp_db("noid");
        let (idx, _fresh) = FactsIndex::open_raw(&db).unwrap();
        assert!(!idx.insert_fact(&json!({"host": "codex"})).unwrap(), "无 fact_id 拒入");
        assert_eq!(idx.fact_count().unwrap(), 0);
        let _ = std::fs::remove_file(&db);
    }

    #[test]
    fn pagination_is_ordered_and_sliced() {
        let db = tmp_db("page");
        let (idx, _fresh) = FactsIndex::open_raw(&db).unwrap();
        for e in ["e3", "e1", "e2"] {
            idx.insert_fact(&fact("codex", e, 1)).unwrap();
        }
        let page = idx.facts_page(Some("codex"), 2, 0).unwrap();
        assert_eq!(page.len(), 2);
        let ids: Vec<String> = page
            .iter()
            .map(|f| f["source_event_id"].as_str().unwrap().to_string())
            .collect();
        assert_eq!(ids, vec!["e1", "e2"], "按 (ts, fact_id) 确定序");
        let _ = std::fs::remove_file(&db);
    }
}
