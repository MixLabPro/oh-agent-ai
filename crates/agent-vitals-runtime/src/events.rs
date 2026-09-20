//! 事件总线的 runtime 侧（AGENT_VITALS_EVENT_BUS_ARCHITECTURE_SPEC）。
//!
//! 职责三件，全部围绕「事实的过去时陈述」：
//! 1. [`insert_outbox`] —— 把事件行写进**调用方持有的事务**（与状态变更同
//!    事务提交；本模块永远不自己开事务，那是双写分叉的入口）；
//! 2. [`EVENT_TYPES`] —— 闭集词表。写入与投递两侧都校验；新事件类型先在
//!    规格 §5 登记再加进来（与分类图谱「先登记后写 emitter」同纪律）；
//! 3. [`Dispatcher`] —— 按消费者反连接扫描未投递事件并执行（at-least-once，
//!    幂等键 = `(event_id, consumer_id)`，由 `event_deliveries` 承载）。
//!
//! 投递语义（spec §4.3）：本进程是「事务后显式唤醒 + 周期兜底」；崩溃恢复
//! 靠下一次 drain 重扫 `event_deliveries` 缺行——与 `PARSER_VERSION` 幂等重
//! 放同构。`payload` 只装枚举值、计数与时间戳；原始路径/内容/凭据类字段与
//! `TrustObservation` 同一禁令（spec §4.1）。

use rusqlite::Connection;
use serde_json::{json, Value};

use agent_vitals_domain::source_identity::fnv1a64_hex;
use crate::sql_sync::now_ms;

/// 事件契约版本。与 authority schema 演进纪律同款：只增不删不改语义。
pub const EVENT_SCHEMA_VERSION: i64 = 1;

/// 闭集词表（spec §5 首批冻结）。写入侧与投递侧双双校验——词表外的
/// `event_type` 在 insert 时被拒绝，防漂移进无人认识的行。
pub const EVENT_TYPES: &[&str] = &[
    "FactsIngested",
    "AuthorityRevisionAdvanced",
    "DeclarationSaved",
    "PriceCardSaved",
    "HostSourceFailed",
    "SourceRecovered",
    "McpToolInvoked",
    "TrustMonitorEvent",
    "HourTicked",
    "DayRolled",
];

/// 一条事件的信封（spec §4.1 冻结形状）。
#[derive(Clone, Debug, PartialEq)]
pub struct AppEvent {
    pub event_type: &'static str,
    pub occurred_at_ms: i64,
    /// 宿主域事件携带；全局事件（计时器等）为 `None`。
    pub host: Option<String>,
    /// 来源批次（sync_runs.run_id / IPC 序列），可空。
    pub correlation_id: Option<String>,
    pub producer: &'static str,
    pub payload: Value,
}

impl AppEvent {
    /// `McpToolInvoked`：一次外部 MCP `tools/call` 完成（审计旁路，
    /// fire-and-forget）。生产者是 serve 传输层而非 dispatch 本身——桌面/CLI
    /// 的内部自用调用不是审计对象（spec §5 实施修订）。`args_fingerprint`
    /// 是参数的规范化指纹：**原始参数永不落库**（§4.1 禁令，agents 的查询
    /// 参数可能含敏感内容）。
    pub fn mcp_tool_invoked(
        tool: &str, args_fingerprint: &str, latency_ms: i64, ok: bool, call_seq: u64,
    ) -> Self {
        Self {
            event_type: "McpToolInvoked",
            occurred_at_ms: now_ms(),
            host: None,
            // 进程内调用序号：event_id 唯一性材料（同毫秒同参数的重复调用不得
            // 互吞——审计日志不允许静默少计）+ 消费方的进程内顺序信号。
            correlation_id: Some(call_seq.to_string()),
            producer: "mcp-serve",
            payload: json!({
                "tool": tool,
                "args_fingerprint": args_fingerprint,
                "latency_ms": latency_ms,
                "ok": ok,
            }),
        }
    }

    /// `FactsIngested`：某宿主的事实批次已在权威库事务内落定。
    pub fn facts_ingested(
        host: &str, run_id: &str, inserted: usize, rejected: usize, duplicate: usize,
    ) -> Self {
        Self {
            event_type: "FactsIngested",
            occurred_at_ms: now_ms(),
            host: Some(host.to_string()),
            correlation_id: Some(run_id.to_string()),
            producer: "sync_service",
            // inserted / rejected / duplicate 三个计数分开（独立验证发现：此前
            // 把 rejected 并进 inserted 是契约漂移——payload 字段名必须与语义
            // 一致，消费者迟早会读它们）。
            payload: json!({
                "run_id": run_id, "inserted": inserted,
                "rejected": rejected, "duplicate": duplicate,
            }),
        }
    }

    fn event_id(&self) -> String {
        // 身份 = 类型 + 事实键（时间戳 + correlation + payload 指纹）。同一次
        // 事实（同 run_id、同计数）重放得到同一 event_id → INSERT OR IGNORE
        // 吸收，生产者侧幂等不需要额外协议。
        // 材料包含 host（独立验证发现）：同类型、同毫秒、同 correlation 的
        // 两个不同宿主事件必须互不吸收——计时器类事件（correlation 为 NULL）
        // 尤其依赖这一维度。
        let material = format!(
            "{}\0{}\0{}\0{}\0{}",
            self.event_type,
            self.host.as_deref().unwrap_or(""),
            self.occurred_at_ms,
            self.correlation_id.as_deref().unwrap_or(""),
            self.payload,
        );
        format!("event:{}", fnv1a64_hex(material.as_bytes()))
    }
}

#[derive(Debug)]
pub enum EventError {
    UnknownType(String),
    Db(rusqlite::Error),
}

impl std::fmt::Display for EventError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            EventError::UnknownType(t) => {
                write!(f, "event type `{t}` not in the frozen vocabulary (spec §5)")
            }
            EventError::Db(e) => write!(f, "event outbox write failed: {e}"),
        }
    }
}

/// 把事件写进调用方持有的事务。**本函数不开事务、不提交**——调用方必须
/// 在与状态变更相同的 `with_immediate_txn` 里调它（spec §1.2）。
pub fn insert_outbox(conn: &Connection, event: &AppEvent, run_id: &str) -> Result<(), EventError> {
    if !EVENT_TYPES.contains(&event.event_type) {
        return Err(EventError::UnknownType(event.event_type.to_string()));
    }
    conn.execute(
        "INSERT OR IGNORE INTO event_outbox(
             event_id, event_type, schema_version, occurred_at_ms, host,
             correlation_id, producer, payload_json, ingested_run_id, created_at_ms)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)",
        rusqlite::params![
            event.event_id(),
            event.event_type,
            EVENT_SCHEMA_VERSION,
            event.occurred_at_ms,
            event.host,
            event.correlation_id,
            event.producer,
            event.payload.to_string(),
            run_id,
            now_ms(),
        ],
    )
    .map(|_| ())
    .map_err(EventError::Db)
}

/// 一个消费者：稳定 id + 处理函数。处理函数拿到的是**已脱离数据库行**的
/// 事件投影。**禁止**在处理函数里使用 drain 正在遍历的那条连接——消费者自
/// 持资源（如按路径自开 AuthorityDb）；drain 在自动提交模式下逐行调用，
/// 不持事务（spec §6「先处理、后记账」的崩溃语义依赖这一点）。
pub type EventHandler = Box<dyn Fn(&AppEvent) -> Result<(), String> + Send + Sync>;

pub struct EventConsumer {
    pub consumer_id: &'static str,
    pub handle: EventHandler,
}

impl EventConsumer {
    pub fn new(
        consumer_id: &'static str,
        handle: impl Fn(&AppEvent) -> Result<(), String> + Send + Sync + 'static,
    ) -> Self {
        Self { consumer_id, handle: Box::new(handle) }
    }
}

/// 一轮投递的报表（诊断面与测试用）。
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct DispatchReport {
    pub delivered: usize,
    /// 处理函数返回 Err 的行数——投递照记（带 last_error），下一轮不重试
    /// 本事件（at-least-once 的「至少一次」已满足；重试语义属于消费者）。
    pub failed: usize,
    /// 词表/schema_version 不认识的行（前向兼容：只跳过并计数）。
    pub skipped: usize,
}

/// 事件分发器：按消费者反连接扫描 outbox 并执行。
///
/// P0 形态（spec §9）：**事务后显式 drain**——CLI 同步尾部调用一次，新事件
/// 与崩溃残留（deliveries 缺行）在同一轮补齐。唤醒通道与 update_hook 快路
/// 属于 P1 桌面常驻 dispatcher 的接线，此处不实现（避免无消费者的死线程）。
pub struct Dispatcher {
    consumers: Vec<EventConsumer>,
}

impl Dispatcher {
    pub fn new(consumers: Vec<EventConsumer>) -> Self {
        Self { consumers }
    }

    /// 扫描并投递所有 `(event, consumer)` 缺行组合。逐事件逐消费者执行：
    /// 查（反连接）→ 调 handler（自持连接）→ 记账——处理成功才写
    /// deliveries，崩溃于两者之间表现为「未投递」，下一轮重扫（幂等键语义，
    /// spec §1.7）。**不要包在 `with_immediate_txn` 里调**：handler 需要能自
    /// 开连接写库，本方法自身只做自动提交级的单语句读写。
    pub fn drain(&self, conn: &Connection) -> Result<DispatchReport, rusqlite::Error> {
        let mut report = DispatchReport::default();
        for consumer in &self.consumers {
            let mut stmt = conn.prepare(
                "SELECT event_id, event_type, schema_version, occurred_at_ms, host,
                        correlation_id, producer, payload_json
                 FROM event_outbox o
                 WHERE NOT EXISTS (
                   SELECT 1 FROM event_deliveries d
                   WHERE d.event_id = o.event_id AND d.consumer_id = ?1)
                 ORDER BY o.created_at_ms, o.event_id",
            )?;
            let rows = stmt.query_map([consumer.consumer_id], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, i64>(2)?,
                    row.get::<_, i64>(3)?,
                    row.get::<_, Option<String>>(4)?,
                    row.get::<_, Option<String>>(5)?,
                    row.get::<_, String>(6)?,
                    row.get::<_, String>(7)?,
                ))
            })?;
            for row in rows {
                let (event_id, event_type, schema_version, occurred_at_ms, host,
                     correlation_id, _producer, payload_json) = row?;
                // 前向兼容：未来的 schema_version / 词表外类型只跳过并计数，
                // 不让一条不认识的行卡住整个队列（spec §10.7 的闭集校验是
                // 「拒绝并计数」，不是崩溃）。
                if schema_version > EVENT_SCHEMA_VERSION
                    || !EVENT_TYPES.contains(&event_type.as_str())
                {
                    record_delivery(conn, &event_id, consumer.consumer_id, now_ms(),
                        Some("skipped: unknown event_type or newer schema_version".to_string()))?;
                    report.skipped += 1;
                    continue;
                }
                let event = AppEvent {
                    // 词表校验已过，leak-free 的 &'static 从闭集取回。
                    event_type: EVENT_TYPES
                        .iter()
                        .find(|t| **t == event_type)
                        .copied()
                        .unwrap_or(""),
                    occurred_at_ms,
                    host,
                    correlation_id,
                    producer: "",
                    payload: serde_json::from_str(&payload_json).unwrap_or(Value::Null),
                };
                let error = match (consumer.handle)(&event) {
                    Ok(()) => {
                        report.delivered += 1;
                        None
                    }
                    Err(message) => {
                        report.failed += 1;
                        Some(message)
                    }
                };
                record_delivery(conn, &event_id, consumer.consumer_id, now_ms(), error)?;
            }
        }
        Ok(report)
    }
}

fn record_delivery(
    conn: &Connection,
    event_id: &str,
    consumer_id: &str,
    at_ms: i64,
    error: Option<String>,
) -> Result<(), rusqlite::Error> {
    conn.execute(
        "INSERT OR REPLACE INTO event_deliveries(event_id, consumer_id, delivered_at_ms, last_error)
         VALUES (?1, ?2, ?3, ?4)",
        rusqlite::params![event_id, consumer_id, at_ms, error],
    )
    .map(|_| ())
}

#[cfg(test)]
mod tests {
    use super::*;
    use agent_vitals_data::authority::AuthorityDb;
    use std::sync::atomic::{AtomicUsize, Ordering};

    fn tmp_db(tag: &str) -> std::path::PathBuf {
        std::env::temp_dir().join(format!(
            "avd-events-{tag}-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .expect("clock")
                .as_nanos()
        ))
    }

    fn seed(db: &AuthorityDb) -> String {
        db.begin_run("run-1", "cli", 1).expect("seed run");
        "run-1".to_string()
    }

    fn db_err(e: EventError) -> agent_vitals_data::authority::AuthorityError {
        agent_vitals_data::authority::AuthorityError::Sqlite(
            rusqlite::Error::InvalidParameterName(format!("__event__:{e}")),
        )
    }

    fn emit(db: &AuthorityDb, event: &AppEvent, run_id: &str) {
        db.with_immediate_txn(|conn| insert_outbox(conn, event, run_id).map_err(db_err))
            .expect("emit event in txn");
    }

    /// 验收 #2：同一事件投递两次，消费者 no-op（幂等键生效）。
    #[test]
    fn drain_is_idempotent_per_consumer() {
        let path = tmp_db("idem");
        let db = AuthorityDb::open(&path, 1).expect("open");
        let run = seed(&db);
        let event = AppEvent::facts_ingested("zcode", &run, 3, 0, 1);
        emit(&db, &event, &run);

        static CALLS: AtomicUsize = AtomicUsize::new(0);
        let dispatcher = Dispatcher::new(vec![EventConsumer::new(
            "test-counter",
            |_| { CALLS.fetch_add(1, Ordering::SeqCst); Ok(()) },
        )]);
        let first = dispatcher.drain(db.conn()).expect("drain 1");
        let second = dispatcher.drain(db.conn()).expect("drain 2");
        assert_eq!((first.delivered, first.failed, first.skipped), (1, 0, 0));
        assert_eq!((second.delivered, second.failed, second.skipped), (0, 0, 0),
            "重复 drain 不得重复投递");
        assert_eq!(CALLS.load(Ordering::SeqCst), 1);
        drop(db);
        cleanup(&path);
    }

    /// 验收 #1（崩溃恢复等价）：事件落库后进程死亡（无 deliveries），
    /// 新 Dispatcher 重扫补投。
    #[test]
    fn crash_between_emit_and_deliver_recovers_on_next_drain() {
        let path = tmp_db("crash");
        let db = AuthorityDb::open(&path, 1).expect("open");
        let run = seed(&db);
        let event = AppEvent::facts_ingested("claude-code", &run, 7, 0, 0);
        emit(&db, &event, &run);
        drop(db); // 模拟崩溃：事件已提交、投递未发生

        let db2 = AuthorityDb::open(&path, 1).expect("reopen");
        let dispatcher = Dispatcher::new(vec![EventConsumer::new("test-recovery", |_| Ok(()))]);
        let report = dispatcher.drain(db2.conn()).expect("recover");
        assert_eq!(report.delivered, 1, "崩溃残留事件由重开后的 drain 补投");
        drop(db2);
        cleanup(&path);
    }

    /// 词表外类型在写入侧被拒（闭集校验的前半）。
    #[test]
    fn unknown_event_type_is_rejected_at_insert() {
        let path = tmp_db("vocab");
        let db = AuthorityDb::open(&path, 1).expect("open");
        let run = seed(&db);
        let bad = AppEvent {
            event_type: "NotARealEvent",
            occurred_at_ms: 1,
            host: None,
            correlation_id: None,
            producer: "test",
            payload: serde_json::json!({}),
        };
        let err = db.with_immediate_txn(|conn| insert_outbox(conn, &bad, &run).map_err(db_err));
        let message = format!("{err:?}");
        assert!(message.contains("NotARealEvent"), "词表外类型要被拒绝: {message}");
        drop(db);
        cleanup(&path);
    }

    /// 消费者失败：投递照记（带 last_error），下一轮不重试本事件。
    #[test]
    fn failed_handler_records_error_and_does_not_retry() {
        let path = tmp_db("fail");
        let db = AuthorityDb::open(&path, 1).expect("open");
        let run = seed(&db);
        let event = AppEvent::facts_ingested("dsh", &run, 1, 0, 0);
        emit(&db, &event, &run);
        let dispatcher = Dispatcher::new(vec![EventConsumer::new("test-failer", |_| Err("boom".to_string()))]);
        let first = dispatcher.drain(db.conn()).expect("drain 1");
        let second = dispatcher.drain(db.conn()).expect("drain 2");
        assert_eq!((first.delivered, first.failed), (0, 1));
        assert_eq!((second.delivered, second.failed), (0, 0), "失败行不重试");
        let last_error: String = db.conn().query_row(
            "SELECT COALESCE(last_error, '') FROM event_deliveries",
            [], |r| r.get(0),
        ).expect("read error");
        assert!(last_error.contains("boom"), "回收原因留痕（spec §12.1-5）: {last_error}");
        drop(db);
        cleanup(&path);
    }

    fn cleanup(path: &std::path::PathBuf) {
        let _ = std::fs::remove_file(path);
        let _ = std::fs::remove_file(path.with_extension("sqlite3-shm"));
        let _ = std::fs::remove_file(path.with_extension("sqlite3-wal"));
    }
}
