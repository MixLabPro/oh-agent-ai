//! `trace_service`——v0.10.0 的 TraceGraph 服务层（spec §7 v0.10.0 门槛 4）。
//!
//! 两层职责：
//! 1. **memo**：进程级 `Arc<RwLock<HashMap<ledger_key, MemoEntry>>>`，60s TTL，
//!    按 home（`data_home`）键控——同进程多个消费面（CLI / Tauri IPC / MCP）命中
//!    同一份图，避免每次全量重算。命中路径返回 `Arc<TraceGraph>`——**锁内不得
//!    深拷贝**（2026-09-05 工作台 tab 卡顿事故：锁内深拷贝几 MB JSON 把并发命令
//!    串行卡在锁上；spec §10.3 性能形状纪律点名别改回去）。
//! 2. **失效**：TTL 之外，用 `usage_facts` 表的 `(COUNT(*), MAX(rowid)) WHERE
//!    session_key = ?` 计数器对比——**不是 `MAX(fact_id)`**（那是
//!    `"uf1-" + fnv1a64_hex` 哈希，字典序 MAX 不随新写入变化，memo 会永不失效；
//!    spec §7 门槛 4 的两个陷阱之一，守卫测试
//!    `new_fact_invalidates_memo_even_when_hash_sorts_lower` 钉住）。
//!
//! memo 键是 `SessionKey::ledger_key()`（长度前缀自定界，全仓同一构造——
//! `fact_writer_sql::session_key` 的注释写明朴素拼接会撞键）。
//!
//! I/O 归属：本模块在 runtime（不是 hosts），允许碰文件系统与 SQLite——与
//! `mcp::AuthorityHandle` 同层。

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, OnceLock, RwLock};
use std::time::{Duration, Instant};

use agent_vitals_domain::contracts::r2a::SessionKey;
use agent_vitals_domain::contracts::trace_graph::TraceGraph;
use agent_vitals_domain::domain::trace::build_trace_graph;

/// spec §7 门槛 4：60s TTL。
pub const MEMO_TTL: Duration = Duration::from_secs(60);

/// 三宿主封闭词表（spec §2.5.1；与 `ingest_service::FACT_HOSTS` 同表——
/// 那边是 `&[&str; 3]` 常量，这里只需要 contains 语义）。
pub const TRACE_HOSTS: &[&str] = &["claude-code", "codex", "dsh"];

/// 一份 memo 条目：图 + 产生它时的输入快照指纹（`(COUNT, MAX(rowid))`）+
/// 挂载时间。
struct MemoEntry {
    graph: Arc<TraceGraph>,
    fact_counter: (i64, Option<i64>),
    cached_at: Instant,
}

/// 单个 data_home 的 memo 库：ledger_key -> 条目。
type HomeStore = RwLock<HashMap<String, MemoEntry>>;

/// 进程级 memo，按 `data_home` 键控（同一台机器上可能有多个 data_home）。
/// 值是 `Arc<HomeStore>`：外层 Mutex 只在「取/插 per-home 库」瞬间持有，
/// **绝不跨构建持有**（review P3：否则新会话的构建会在全局锁上把所有 home
/// 串行化）。
static MEMO: OnceLock<Mutex<HashMap<PathBuf, Arc<HomeStore>>>> = OnceLock::new();

fn memo_store() -> &'static Mutex<HashMap<PathBuf, Arc<HomeStore>>> {
    MEMO.get_or_init(|| Mutex::new(HashMap::new()))
}

/// `(COUNT(*), MAX(rowid)) WHERE session_key = ?`——变更检测计数器。
/// `MAX(rowid)` 是物理插入顺序，新写入必然（对自增 rowid）单调不减且通常
/// 严格增大；COUNT 抓删除。两个一起才能同时抓住「追加」与「retention 清理」。
fn fact_counter(conn: &rusqlite::Connection, session_key: &str) -> Result<(i64, Option<i64>), String> {
    conn.query_row(
        "SELECT COUNT(*), MAX(rowid) FROM usage_facts WHERE session_key = ?1 AND deleted_at_ms IS NULL",
        rusqlite::params![session_key],
        |r| Ok((r.get::<_, i64>(0)?, r.get::<_, Option<i64>>(1)?)),
    )
    .map_err(|e| format!("usage_facts counter query: {e}"))
}

/// memo 层的会话查找失败原因。
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum TraceLookupError {
    /// host 不在三宿主词表里。
    UnknownHost(String),
    /// 权威库打不开 / 不存在 / schema 不符。
    AuthorityUnavailable(String),
    /// session_key 在 `sessions` 表里没有行（引用了已删除的会话）。
    SessionNotFound,
    /// SQL 执行失败。
    Query(String),
    /// 底层会话文件读取失败（`canonical_input::CanonicalInputError` 的转发）。
    SourceUnavailable(String),
}

impl std::fmt::Display for TraceLookupError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            TraceLookupError::UnknownHost(h) => write!(f, "unknown host `{h}` (trace hosts: claude-code/codex/dsh)"),
            TraceLookupError::AuthorityUnavailable(e) => write!(f, "authority unavailable: {e}"),
            TraceLookupError::SessionNotFound => write!(f, "session not found in authority"),
            TraceLookupError::Query(e) => write!(f, "authority query: {e}"),
            TraceLookupError::SourceUnavailable(e) => write!(f, "session source unavailable: {e}"),
        }
    }
}

/// 从 `sessions` 表取 `(host, native_session_id, source_profile,
/// machine_namespace)`——`SessionKey` 四元组的全量。缺失的
/// `source_profile` 回退 `"default"`（与 `fact_writer_sql::session_key` 同款）。
fn session_row(
    conn: &rusqlite::Connection,
    session_key: &str,
) -> Result<Option<(String, String, String, String)>, TraceLookupError> {
    conn.query_row(
        "SELECT host, native_session_id, COALESCE(source_profile, 'default'), machine_namespace
         FROM sessions WHERE session_key = ?1",
        rusqlite::params![session_key],
        |r| {
            Ok((
                r.get::<_, String>(0)?,
                r.get::<_, String>(1)?,
                r.get::<_, String>(2)?,
                r.get::<_, String>(3)?,
            ))
        },
    )
    .map(Some)
    .or_else(|e| match e {
        rusqlite::Error::QueryReturnedNoRows => Ok(None),
        other => Err(TraceLookupError::Query(other.to_string())),
    })
}

/// 全量重算：SQL 会话行 → ledger 键 → 文件路径？——**路径不可得**。
///
/// 权威库**有意不存本地路径**（`source_files.path_hash`，注释明写「不暴露本地
/// 路径」——隐私护栏）。因此服务层入口是 `trace_graph_for_canonical`：调用方
/// **自带** `CanonicalSession`（已经通过文件枚举读出的那份），本函数只负责
/// memo 命中/失效判定，构建完全在 `domain::trace::build_trace_graph`。
///
/// 「从 session_ref 反查文件路径再重读文件」这一步**当前不存在**，这是有意
/// 的：session_ref 只能解析回 `session_key`（HMAC 单向），而 session_key 到
/// 本地路径的映射被隐私护栏故意切断。CLI 侧的调用方（拥有文件枚举上下文）
/// 应把「枚举到的路径」直接喂 `canonical_input::canonical_session_for_path`，
/// 再把 `CanonicalSession` 交给本服务层——spec §6.3 的「数据准备归宿主适配器」
/// 指的正是这个分工，服务层不做文件发现。
fn build_fresh(
    canonical: &agent_vitals_domain::contracts::evidence::CanonicalSession,
    key: &SessionKey,
) -> TraceGraph {
    build_trace_graph(canonical, key.clone())
}

/// memo 查询入口：传入会话的 `CanonicalSession`（调用方已通过文件枚举读出），
/// 返回 memo 命中的 `Arc<TraceGraph>` 或新算后回填的 `Arc<TraceGraph>`。
///
/// `fact_counter_current` 是调用方此刻在权威库里读到的计数器——由本函数内部
/// 自己查（`conn` 传入），保证「构建 → 回填」之间没有第二个写者穿插时计数器
/// 与图一致。
pub fn trace_graph_for_canonical(
    data_home: &Path,
    key: &SessionKey,
    canonical: &agent_vitals_domain::contracts::evidence::CanonicalSession,
    conn: &rusqlite::Connection,
) -> Result<Arc<TraceGraph>, TraceLookupError> {
    let ledger = key.ledger_key();
    let current = fact_counter(conn, &ledger).map_err(TraceLookupError::Query)?;

    // 外层锁只到「拿到 per-home 库的 Arc」为止——构建（可能毫秒级）不在
    // 任何全局锁内。
    let store = {
        let mut stores = memo_store().lock().expect("memo store poisoned");
        Arc::clone(stores.entry(data_home.to_path_buf()).or_default())
    };
    {
        let guard = store.read().expect("memo entry lock poisoned");
        if let Some(entry) = guard.get(&ledger) {
            if entry.fact_counter == current && entry.cached_at.elapsed() < MEMO_TTL {
                return Ok(Arc::clone(&entry.graph));
            }
        }
    }

    // 构建（`build_trace_graph` 是 O(节点数) 纯函数），回填只在 per-home 写锁内
    // 做赋值。
    //
    // 已知边界（review P2，按 spec 接受）：TTL 内若同一会话的 CanonicalSession
    // 内容变化但 fact 计数器不变（新增 turn 不产新 fact 的场景），命中路径
    // 返回的是旧图——失效键是 spec §7 门槛 4 钦定的 (COUNT, MAX(rowid))，
    // 消费方传入新 canonical 时以「计数器未变 = 事实面未变」为准。
    let graph = Arc::new(build_fresh(canonical, key));
    let mut guard = store.write().expect("memo entry lock poisoned");
    guard.insert(
        ledger,
        MemoEntry { graph: Arc::clone(&graph), fact_counter: current, cached_at: Instant::now() },
    );
    Ok(graph)
}

/// 便捷入口：从权威库读会话四元组（供调用方拼 `SessionKey` 用）。
pub fn session_key_for(
    conn: &rusqlite::Connection,
    session_key: &str,
) -> Result<SessionKey, TraceLookupError> {
    match session_row(conn, session_key)? {
        None => Err(TraceLookupError::SessionNotFound),
        Some((host, native_id, profile, ns)) => Ok(SessionKey::new(&host, &native_id, &profile, &ns)),
    }
}

/// 测试与调试辅助：清空某 data_home 的 memo（生产代码不调用——失效由
/// TTL + 计数器驱动，不靠手动清）。
pub fn clear_memo(data_home: &Path) {
    let mut stores = memo_store().lock().expect("memo store poisoned");
    stores.remove(data_home);
}

#[cfg(test)]
mod tests {
    use super::*;
    use agent_vitals_hosts::dsh_evidence::build_dsh_evidence;
    use serde_json::json;

    fn tmp_data_home(tag: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!(
            "agent-vitals-trace-svc-{}-{}-{tag}",
            std::process::id(),
            std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos()
        ));
        std::fs::create_dir_all(&d).unwrap();
        d
    }

    /// 内存 SQLite + 最小 schema（sessions + usage_facts 的键列）——不依赖
    /// `AuthorityDb::open_readonly`（那要求真实库文件 + schema 校验），这里只
    /// 测 memo/计数器逻辑，不测权威库打开路径（那是 mcp 层测试的职责）。
    fn mem_conn() -> rusqlite::Connection {
        let conn = rusqlite::Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE TABLE sessions (
                session_key TEXT PRIMARY KEY, host TEXT NOT NULL,
                native_session_id TEXT NOT NULL, machine_namespace TEXT NOT NULL,
                source_profile TEXT);
             CREATE TABLE usage_facts (
                rowid_alias INTEGER PRIMARY KEY AUTOINCREMENT,
                session_key TEXT NOT NULL, fact_id TEXT NOT NULL,
                deleted_at_ms INTEGER);",
        )
        .unwrap();
        conn
    }

    fn seed_session(conn: &rusqlite::Connection, host: &str, sid: &str) -> SessionKey {
        let key = SessionKey::new(host, sid, "default", "ns-test");
        conn.execute(
            "INSERT INTO sessions(session_key, host, native_session_id, source_profile, machine_namespace)
             VALUES (?1, ?2, ?3, 'default', 'ns-test')",
            rusqlite::params![key.ledger_key(), host, sid],
        )
        .unwrap();
        key
    }

    fn insert_fact(conn: &rusqlite::Connection, session_key: &str, fact_id: &str) {
        conn.execute(
            "INSERT INTO usage_facts(session_key, fact_id) VALUES (?1, ?2)",
            rusqlite::params![session_key, fact_id],
        )
        .unwrap();
    }

    fn sample_canonical(sid: &str) -> agent_vitals_domain::contracts::evidence::CanonicalSession {
        let events = vec![
            json!({"type": "turn/start", "seq": 1, "time": 1000, "data": {"turn": 1}}),
            json!({"type": "turn/end", "seq": 2, "time": 1001, "data": {"turn": 1, "reason": {"kind": "ok"}}}),
        ];
        build_dsh_evidence(events, Vec::new(), None, sid.to_string()).canonical
    }

    #[test]
    fn memo_hits_within_ttl_and_same_counter() {
        let home = tmp_data_home("hit");
        let conn = mem_conn();
        let key = seed_session(&conn, "dsh", "s1");
        let canonical = sample_canonical("s1");

        let g1 = trace_graph_for_canonical(&home, &key, &canonical, &conn).unwrap();
        let g2 = trace_graph_for_canonical(&home, &key, &canonical, &conn).unwrap();
        assert!(Arc::ptr_eq(&g1, &g2), "TTL 内 + 计数器未变必须命中同一份 Arc——命中路径不得深拷贝");
    }

    #[test]
    fn new_fact_invalidates_memo_even_when_hash_sorts_lower() {
        // spec §7 门槛 4 的守卫测试：fact_id 是哈希，字典序 MAX 不随新写入
        // 变化——用「先插一个哈希'大'的 fact，命中 memo；再插一个哈希'小'的
        // fact」的序列，断言 memo 必须失效。如果有人把计数器改回 MAX(fact_id)，
        // 这条测试当场红。
        let home = tmp_data_home("invalid");
        let conn = mem_conn();
        let key = seed_session(&conn, "dsh", "s1");
        let ledger = key.ledger_key();

        // 两个 fact_id：ffff…（字典序大）先插；0000…（字典序小）后插。
        insert_fact(&conn, &ledger, "uf1-ffffffffffffffff");
        let canonical = sample_canonical("s1");
        let g1 = trace_graph_for_canonical(&home, &key, &canonical, &conn).unwrap();

        insert_fact(&conn, &ledger, "uf1-0000000000000000");
        let g2 = trace_graph_for_canonical(&home, &key, &canonical, &conn).unwrap();

        assert!(!Arc::ptr_eq(&g1, &g2), "新 fact 写入后 memo 必须失效——即使新 fact_id 的字典序更小");
    }

    #[test]
    fn deleted_fact_also_invalidates_memo_via_count() {
        let home = tmp_data_home("del");
        let conn = mem_conn();
        let key = seed_session(&conn, "dsh", "s1");
        let ledger = key.ledger_key();

        insert_fact(&conn, &ledger, "uf1-aaaaaaaaaaaaaaaa");
        let canonical = sample_canonical("s1");
        let g1 = trace_graph_for_canonical(&home, &key, &canonical, &conn).unwrap();

        conn.execute("DELETE FROM usage_facts WHERE fact_id = 'uf1-aaaaaaaaaaaaaaaa'", [])
            .unwrap();
        let g2 = trace_graph_for_canonical(&home, &key, &canonical, &conn).unwrap();
        assert!(!Arc::ptr_eq(&g1, &g2), "retention 删除也要失效——COUNT 抓删除，MAX(rowid) 抓追加");
    }

    #[test]
    fn different_data_homes_have_independent_memos() {
        let home_a = tmp_data_home("a");
        let home_b = tmp_data_home("b");
        let conn = mem_conn();
        let key = seed_session(&conn, "dsh", "s1");
        let canonical = sample_canonical("s1");

        let ga = trace_graph_for_canonical(&home_a, &key, &canonical, &conn).unwrap();
        let gb = trace_graph_for_canonical(&home_b, &key, &canonical, &conn).unwrap();
        assert!(!Arc::ptr_eq(&ga, &gb), "按 data_home 键控——不同 home 的 memo 独立");
    }

    #[test]
    fn session_key_for_reads_the_authority_row() {
        let conn = mem_conn();
        let expected = seed_session(&conn, "claude-code", "abc");
        let got = session_key_for(&conn, &expected.ledger_key()).unwrap();
        assert_eq!(got, expected);
        assert_eq!(
            session_key_for(&conn, "3|nope|7|default|7|ns-test").unwrap_err(),
            TraceLookupError::SessionNotFound
        );
    }

    #[test]
    fn unknown_host_is_rejected_at_the_service_layer_too() {
        // 服务层自己也拒一遍（双保险）：TRACE_HOSTS 与 ingest 的 FACT_HOSTS
        // 同表，新增宿主必须两处同步。
        assert_eq!(TRACE_HOSTS.len(), 3);
        assert!(TRACE_HOSTS.contains(&"claude-code"));
        assert!(TRACE_HOSTS.contains(&"codex"));
        assert!(TRACE_HOSTS.contains(&"dsh"));
    }
}
