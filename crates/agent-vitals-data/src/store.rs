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
pub const INDEX_SCHEMA_VERSION: u32 = 1;

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
        self.conn.execute_batch("BEGIN IMMEDIATE")?;
        self.conn.execute("DELETE FROM facts", [])?;
        let outcome = (|| -> Result<RebuildReport, IndexError> {
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
                 model_id, provider_id,
                 t_uncached_input, t_cache_read, t_cache_write, t_output, raw)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14)",
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
