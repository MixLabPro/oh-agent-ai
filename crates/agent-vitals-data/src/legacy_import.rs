//! v0.9.1 Phase 3.2（spec §6.2.3）：**legacy_aggregate 导入**——claude ledger
//! 深历史进权威库。
//!
//! 背景结论（R4 §5.2a，实测定案）：claude 客户端会压缩/轮转会话文件，历史行
//! 物理消失后 ledger 里仍有账——**claude 深历史不可从现文件重放，ledger 是
//! 这部分账的 store of record**。按 spec §6.2.3，把 ledger 的逐日 by_model
//! 作为 `source_kind=legacy_aggregate` 的记录导入，并标记 coverage 降级
//! （`data_quality_issues` 写 `legacy_aggregate` code），**不伪造为行级
//! 事实**。
//!
//! 存储形状：ledger 的一个 (day, model) 聚合 = 一行 `usage_facts`，
//! `observation_kind = "legacy_aggregate"`，`native_session_id = "day:{day}"`，
//! `source_event_id = "{day}:{model}:{peak}"`（peak 两行：base 与 peak 子桶
//! 各一行，`event_peak` 标位），`event_ts_ms` = 北京日 12:00 的 UTC ms
//! （日内代表点；小时分布查询按 observation_kind 排除本类行——Phase 3 的
//! 查询面契约）。
//!
//! 幂等：fact_id 由契约层身份字段派生，同键重跑 = 幂等吸收；ledger 日桶
//! 变化（同键不同值）→ **不覆盖**，写 `data_quality_issues`
//! （code="legacy_aggregate_conflict"）——§6.2.5「旧 JSON 永不覆盖更具体的
//! SQL fact」。

use std::path::Path;

use rusqlite::Connection;

use crate::authority::AuthorityError;

/// 一次 legacy 导入的报告。
#[derive(Debug, Default, Clone, PartialEq, Eq)]
pub struct LegacyImportReport {
    /// 导入的聚合行数（(day, model, peak) 粒度）。
    pub imported: usize,
    /// 幂等吸收（同 fact_id 已在库且值一致）。
    pub duplicate: usize,
    /// 同键不同值（ledger 变化）→ 记 data_quality_issues，不覆盖。
    pub conflicts: usize,
}

/// 导入 claude ledger（当前月文件 + month-archive 形状的月表）的逐日 by_model
/// 到 `usage_facts`（observation_kind="legacy_aggregate"）。
///
/// `days` 形状 = `{"YYYY-MM-DD": {"<model>": {4 snake 桶 + 4 peak_ 桶}}}`
/// （claude-ledger.json / claude-ledger-archive.json 的 days 原样）。
/// 调用方负责从 ledger/archive 组装（本函数纯：只碰给到的 days）。
///
/// 事务：调用方 `with_immediate_txn` 包整段（与 fact_writer_sql 同纪律）。
pub fn import_claude_ledger_days(
    conn: &Connection,
    run_id: &str,
    now_ms: i64,
    days: &serde_json::Value,
) -> Result<LegacyImportReport, AuthorityError> {
    let _ = (conn, run_id, now_ms, days);
    unimplemented!(
        "Phase 3.2：days → (day, model, peak) 行 → usage_facts（legacy_aggregate）\
         + 值冲突走 data_quality_issues"
    )
}

/// 读取 claude ledger 两个文件的 days 并合并（当前月 + 归档月；同日同模型
/// 以 ledger 当前月文件优先——archive 是滚动前的旧值）。形状见上。
/// I/O 层（读文件）在这里，纯组装逻辑归 `import_claude_ledger_days`。
pub fn load_claude_ledger_days(state_dir: &Path) -> Result<serde_json::Value, AuthorityError> {
    let _ = state_dir;
    unimplemented!(
        "Phase 3.2：读 claude-ledger.json + claude-ledger-archive.json，合并 days"
    )
}
