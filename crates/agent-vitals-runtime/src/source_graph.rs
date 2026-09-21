//! SourceGraph：增量摄取的检查点注册表（AGENT_VITALS_SOURCE_GRAPH_
//! INFRASTRUCTURE_SPEC §4-§6）。
//!
//! 职责（Vite ModuleGraph 的映射）：
//! 1. **检查点管理**：`source_files` 行的 `byte_offset` / `parser_id` / `dirty`
//!    三列的读写封装——谁在什么位置处理到了哪里；
//! 2. **脏集管理**：tick 或（P2 后）watch 事件把文件标脏；调度器查询脏集并清零；
//! 3. **软硬失效判定**：检查点比对的结果决定增量（软）还是全量（硬）。
//!
//! **不装**：宿主 wire 解释（`SourceParser` 插件位）、watcher（P2 notify）、
//! 事实写入路径（`write_flat_facts_with_sources` 原样）。本模块不 emit 事实。
//!
//! 语义纪律（spec §1.3）：offset 只由解析成功的事务推进——半途崩溃 offset 不动，
//! 下轮重读同一段，fact_id 幂等吸收。与 outbox §1.2 同一条教训。

use rusqlite::{Connection, params};
use serde_json::Value;

use agent_vitals_domain::source_identity::fnv1a64_hex;

/// 文件的 SourceGraph 检查点（`source_files` 行的投影，加上 stat 现值）。
#[derive(Clone, Debug, Default, PartialEq)]
pub struct FileCheckpoint {
    pub source_id: String,
    pub host: String,
    pub path_hash: String,
    /// 磁盘当前值（stat）
    pub size_bytes: u64,
    pub mtime_ns: u64,
    /// 上次成功处理的字节位置；`None` = 首见或不支持增量。
    pub byte_offset: Option<u64>,
    /// 负责此文件的解析器身份；`None` = 尚未被 SourceGraph 路径处理。
    pub parser_id: Option<String>,
    pub parser_version: i64,
    pub dirty: bool,
}

/// 软硬失效判定结果（spec §6，映射 Vite 的 graded invalidation）。
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Invalidation {
    /// 软失效（Vite "soft"）：append-only 增量可从 offset 续读。
    Incremental { from_offset: u64 },
    /// 硬失效（Vite "hard"/full-reload）：offset 作废，全量重读。
    Full {
        /// 截断、轮转、parser 升版或首见等原因标记（进 last_error 供诊断）。
        reason: &'static str,
    },
    /// 未变：指纹完全匹配，跳过。
    Unchanged,
}

/// 判定一个文件的失效等级（spec §6 表）。纯函数：只读 checkpoint 与磁盘现值。
///
/// **can_increment 是解析器的申报**（P0 阶段恒 false——没有增量解析器注册时，
/// 所有文件走全量路径）。本函数只把"物理上可增量"与"解析器申报可增量"合取。
pub fn classify(
    checkpoint: &FileCheckpoint,
    on_disk: Option<(u64, u64)>, // (size, mtime_ns)
    can_increment: bool,
    expected_parser_id: &str,
    expected_parser_version: i64,
) -> Invalidation {
    let Some((disk_size, disk_mtime)) = on_disk else {
        return Invalidation::Full { reason: "file-vanished" };
    };
    // F1（P1 接线雷）：parser 升版 → 硬失效，文件字节不变也要全量重放
    // （spec §6 明文行）。旧代码只比 (size, mtime, dirty)，升级会被 Unchanged 吞。
    if checkpoint.parser_version != expected_parser_version {
        return Invalidation::Full { reason: "parser-version-bumped" };
    }
    // F2（P1 交接雷）：parser_id 不匹配（含 full-parse-v0 旧行）→ 硬失效。
    // P0 把 offset 推到 stat size（非换行边界），P1 增量解析器直接按
    // Incremental 续读会从行中间起读、静默丢事实。硬失效一次让 P1 全量
    // 重放对齐（fact_id 幂等吸收，代价一次性）。
    if checkpoint.parser_id.as_deref() != Some(expected_parser_id) {
        return Invalidation::Full { reason: "parser-id-mismatch" };
    }
    if disk_size == checkpoint.size_bytes && disk_mtime == checkpoint.mtime_ns
        && !checkpoint.dirty
    {
        return Invalidation::Unchanged;
    }
    if !can_increment {
        return Invalidation::Full { reason: "parser-refused-increment" };
    }
    // byte_offset None 但 parser_id 匹配（理论上 P1 接管后不该出现——
    // advance 总是写 offset；防御性全量处理）。
    let Some(offset) = checkpoint.byte_offset else {
        return Invalidation::Full { reason: "first-seen" };
    };
    if disk_size < offset {
        return Invalidation::Full { reason: "truncated" };
    }
    Invalidation::Incremental { from_offset: offset }
}

/// path → path_hash（与 sql_sync 的 source_file_fingerprint 同一哈希——
/// 不暴露本地路径进 SQL 索引）。
pub fn path_hash(path: &std::path::Path) -> String {
    fnv1a64_hex(path.to_string_lossy().as_bytes())
}

/// 读一个文件的检查点（按 host + path_hash 查 source_files）。无行 = 首见。
pub fn read_checkpoint(
    conn: &Connection,
    host: &str,
    hash: &str,
) -> Result<Option<FileCheckpoint>, rusqlite::Error> {
    conn.query_row(
        "SELECT source_id, host, path_hash, size_bytes, mtime_ns,
                byte_offset, parser_id, parser_version, dirty
         FROM source_files WHERE host = ?1 AND path_hash = ?2",
        params![host, hash],
        |row| {
            Ok(FileCheckpoint {
                source_id: row.get(0)?,
                host: row.get(1)?,
                path_hash: row.get(2)?,
                size_bytes: row.get::<_, i64>(3)? as u64,
                mtime_ns: row.get::<_, i64>(4)? as u64,
                byte_offset: row.get::<_, Option<i64>>(5)?.map(|v| v as u64),
                parser_id: row.get(6)?,
                parser_version: row.get(7)?,
                dirty: row.get::<_, i64>(8)? != 0,
            })
        },
    )
    .map(Some)
    .or_else(|e| match e {
        rusqlite::Error::QueryReturnedNoRows => Ok(None),
        other => Err(other),
    })
}

/// 推进检查点（spec §1.3 / §12：offset 只由解析成功的事务推进——调用方
/// 必须在持有与事实写入相同的 `with_immediate_txn` 里调本函数）。
pub fn advance_checkpoint(
    conn: &Connection,
    host: &str,
    hash: &str,
    new_offset: Option<u64>,
    parser_id: &str,
    size: u64,
    mtime_ns: u64,
) -> Result<(), rusqlite::Error> {
    conn.execute(
        "UPDATE source_files
         SET byte_offset = ?3, parser_id = ?4, size_bytes = ?5, mtime_ns = ?6,
             dirty = 0
         WHERE host = ?1 AND path_hash = ?2",
        params![host, hash, new_offset.map(|v| v as i64), parser_id,
                size as i64, mtime_ns as i64],
    )?;
    Ok(())
}

/// 标脏（watch 事件或 tick 发现差异时）。幂等。
pub fn mark_dirty(
    conn: &Connection,
    host: &str,
    hash: &str,
) -> Result<(), rusqlite::Error> {
    conn.execute(
        "UPDATE source_files SET dirty = 1 WHERE host = ?1 AND path_hash = ?2",
        params![host, hash],
    )?;
    Ok(())
}

/// 查询脏集（调度器用）。返回 (host, path_hash) 列表。
pub fn dirty_set(conn: &Connection) -> Result<Vec<(String, String)>, rusqlite::Error> {
    let mut stmt = conn.prepare(
        "SELECT host, path_hash FROM source_files WHERE dirty = 1
         ORDER BY host, path_hash",
    )?;
    let rows = stmt.query_map([], |row| Ok((row.get(0)?, row.get(1)?)))?;
    rows.collect()
}

/// SourceParser trait（spec §5.2 冻结接口）。P0 阶段无实现——所有文件走
/// 全量路径；P1 起 claude-code 注册首个增量解析器。
/// `Vec<Value>` 是**与 emit 产出的 flat fact JSON 同构**的——与
/// `write_flat_facts_with_sources` 的 `facts: &[Value]` 同一形态（sql_sync.rs:436），
/// 调度器直接把解析结果交给既有写入路径，不需要形状转换。返回的 `u64` 是
/// 新的续读 offset（**换行边界**，不是 stat size——与 P0 的 full-parse-v0
/// 语义不同，见 classify 的 F2 注释）。
pub trait SourceParser: Send + Sync {
    fn host(&self) -> &'static str;
    fn parser_id(&self) -> &'static str;
    /// 当前解析器版本（classify 的 parser-version 判定输入）。
    fn parser_version(&self) -> i64;
    /// 增量能力申报（按文件当前状态判定，不许猜测）。
    fn can_increment(&self, state: &FileCheckpoint) -> bool;
    /// 从 offset 读到 EOF、停在最后完整换行。
    fn parse_increment(
        &self,
        path: &std::path::Path,
        from_offset: u64,
    ) -> Result<(Vec<Value>, u64), String>;
    /// 全量路径（首见/硬失效/不支持增量）。
    fn parse_full(&self, path: &std::path::Path) -> Result<(Vec<Value>, u64), String>;
}

#[cfg(test)]
mod tests {
    use super::*;
    use agent_vitals_data::authority::AuthorityDb;

    fn tmp_db(tag: &str) -> std::path::PathBuf {
        std::env::temp_dir().join(format!(
            "avd-sg-{tag}-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ))
    }

    fn seed_source_file(db: &AuthorityDb, host: &str, hash: &str) -> String {
        let source_id = format!("src-{hash}");
        db.with_immediate_txn(|conn| {
            conn.execute(
                "INSERT INTO source_files(source_id, host, path_hash, size_bytes,
                     mtime_ns, parser_version, first_seen_at_ms, last_seen_at_ms)
                 VALUES (?1, ?2, ?3, 100, 1000, 5, 1, 1)",
                params![source_id, host, hash],
            ).map(|_| ())
            .map_err(agent_vitals_data::authority::AuthorityError::Sqlite)
        }).unwrap();
        source_id
    }

    /// 软/硬/未变三路判定（spec §6 表逐行覆盖 + F1/F2 P1 接线雷钉死）。
    #[test]
    fn classify_covers_incremental_full_unchanged() {
        let cp = FileCheckpoint {
            size_bytes: 100,
            mtime_ns: 1000,
            byte_offset: Some(100),
            parser_id: Some("jsonl".into()),
            parser_version: 5,
            dirty: false,
            ..FileCheckpoint::default()
        };
        let args = ("jsonl", 5i64); // (expected_parser_id, expected_parser_version)
        // 未变（含 dirty=false）
        assert_eq!(classify(&cp, Some((100, 1000)), true, args.0, args.1),
            Invalidation::Unchanged);
        // 软：size 增长 + can_increment + offset 已建
        assert_eq!(classify(&cp, Some((200, 2000)), true, args.0, args.1),
            Invalidation::Incremental { from_offset: 100 });
        // 硬：size < offset（截断）
        assert_eq!(classify(&cp, Some((50, 2000)), true, args.0, args.1),
            Invalidation::Full { reason: "truncated" });
        // 硬：can_increment = false（F5 分拆：与首见不同 reason）
        assert_eq!(classify(&cp, Some((200, 2000)), false, args.0, args.1),
            Invalidation::Full { reason: "parser-refused-increment" });
        // 硬：文件消失
        assert_eq!(classify(&cp, None, true, args.0, args.1),
            Invalidation::Full { reason: "file-vanished" });
        // 硬：首见（无 offset，F5 分拆：独立 reason）
        let first_seen = FileCheckpoint { parser_version: 5, ..FileCheckpoint::default() };
        // 首见 + 旧库 None 行在 classify 眼里同判 parser-id-mismatch（都是「不知道
// 谁负责此文件」→ 交给请求者全量处理）；与「有 id 但不是我的」共用同一 reason
// 语义等价——动作都是全量、由请求者接管。
assert_eq!(classify(&first_seen, Some((100, 1000)), true, args.0, args.1),
            Invalidation::Full { reason: "parser-id-mismatch" });
        // dirty=true 即便指纹相同也不算 Unchanged
        let dirty_cp = FileCheckpoint { dirty: true, ..cp.clone() };
        assert_eq!(classify(&dirty_cp, Some((100, 1000)), true, args.0, args.1),
            Invalidation::Incremental { from_offset: 100 });
        // F1：parser_version 不匹配 → 硬失效（即便指纹全同、非 dirty）
        let bumped = FileCheckpoint { parser_version: 4, ..cp.clone() };
        assert_eq!(classify(&bumped, Some((100, 1000)), true, args.0, args.1),
            Invalidation::Full { reason: "parser-version-bumped" },
            "解析器升版必须硬失效，Unchanged 不得吞掉（spec §6 明文行）");
        // F2：parser_id 不匹配（含 full-parse-v0 旧行）→ 硬失效
        let v0_row = FileCheckpoint {
            parser_id: Some("full-parse-v0".into()),
            ..cp.clone()
        };
        assert_eq!(classify(&v0_row, Some((200, 2000)), true, args.0, args.1),
            Invalidation::Full { reason: "parser-id-mismatch" },
            "P0 旧行的 offset 是 stat size 非换行边界，增量解析器不得直接续读");
        // F2 补：parser_id 为 None（旧库 v23 行）同样硬失效
        let none_id = FileCheckpoint { parser_id: None, ..cp.clone() };
        assert_eq!(classify(&none_id, Some((200, 2000)), true, args.0, args.1),
            Invalidation::Full { reason: "parser-id-mismatch" });
    }

    /// 检查点往返：写入 → 读回 → 推进 → 脏集查询 → 清零。
    #[test]
    fn checkpoint_roundtrip_and_dirty_set() {
        let path = tmp_db("roundtrip");
        let db = AuthorityDb::open(&path, 1).unwrap();
        let host = "claude-code";
        let hash = "abc123";

        // 首见：无行
        assert!(read_checkpoint(db.conn(), host, hash).unwrap().is_none());

        // seed + 读回
        seed_source_file(&db, host, hash);
        let cp = read_checkpoint(db.conn(), host, hash).unwrap().unwrap();
        assert_eq!(cp.size_bytes, 100);
        assert!(cp.byte_offset.is_none(), "首见 byte_offset 为 NULL");
        assert!(!cp.dirty);

        // 标脏 → 脏集可见
        mark_dirty(db.conn(), host, hash).unwrap();
        let dirty = dirty_set(db.conn()).unwrap();
        assert_eq!(dirty.len(), 1);
        assert_eq!(dirty[0].1, hash);

        // 推进检查点（模拟解析成功）→ dirty 清零、offset 写入
        advance_checkpoint(db.conn(), host, hash, Some(200), "claude-jsonl", 200, 2000).unwrap();
        let cp2 = read_checkpoint(db.conn(), host, hash).unwrap().unwrap();
        assert_eq!(cp2.byte_offset, Some(200));
        assert_eq!(cp2.parser_id.as_deref(), Some("claude-jsonl"));
        assert_eq!(cp2.size_bytes, 200);
        assert!(!cp2.dirty, "advance 必须清 dirty");

        // 脏集空
        assert!(dirty_set(db.conn()).unwrap().is_empty());

        drop(db);
        let _ = std::fs::remove_file(&path);
    }
}
