//! v0.9.1 Phase 2（spec §5.1/§7）：`sync_facts` 的 SQL 权威写入集成。
//!
//! `sync_service.rs` 保留「文件发现 → 差量 → emit」；本模块接手其后半程：
//! **不再写 facts/*.jsonl（JSONL 停写，存量为遗留），改为 SQL 权威写入**：
//! `sync_runs` 批次 → `source_files` upsert → `sessions` upsert →
//! `usage_facts` 写入，全部包在一个 `with_immediate_txn` 里（spec §5.1.4）。
//! 差量指纹改查 `source_files` 表（JSON checkpoint `.ingest-checkpoint.json`
//! 退役——首启时迁移，见 [`migrate_json_checkpoint`]）。
//!
//! 时钟注入点（Phase 1.5）：`now_ms()` 是本 crate 唯一读时钟的位置（runtime
//! 允许读时钟；data 不读）——所有 `*_at_ms` 从这里取。

use std::path::Path;

use agent_vitals_data::authority::{AuthorityDb, AuthorityError};

/// 注入时钟（Phase 1.5）：runtime 是唯一读时钟层。
pub fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

/// 生成 run_id（幂等重跑 = 同来源同时段同 id；首版用 `{trigger}:{unix_ms}`）。
pub fn new_run_id(trigger: &str) -> String {
    format!("{trigger}:{}", now_ms())
}

/// JSON checkpoint（`.ingest-checkpoint.json`）→ `source_files` 的一次性
/// 迁移（spec §7 Phase 2：JSON checkpoint 退役）。旧文件迁移后**改名保留**
/// （`.ingest-checkpoint.json.migrated`），不删除（用户可审计）。
/// 幂等：迁移文件不存在 = 无事。
pub fn migrate_json_checkpoint(
    db: &AuthorityDb,
    data_home: &Path,
    now_ms: i64,
) -> Result<usize, AuthorityError> {
    let _ = (db, data_home, now_ms);
    unimplemented!("Phase 2.2：JSON checkpoint → source_files（host 从条目的 host 字段）")
}

/// SQL 版例行同步：发现/差量逻辑复用 `sync_service` 的产物（调用方传差量
/// 文件集），本函数做「`sync_runs` 开批 → source_files/sessions/usage_facts
/// 写入 → 收批」，全程一个 `with_immediate_txn`。
///
/// 返回形状与 `sync_service::HostSyncReport` 对齐（CLI 渲染不变）。
pub struct SqlSyncOutcome {
    pub files_synced: usize,
    pub files_skipped: usize,
    pub inserted: usize,
    pub duplicate: usize,
    pub rejected: usize,
    pub errors: Vec<String>,
}

/// 对单宿主执行 SQL 写入。`dirty` = (路径, 指纹) 差量集（调用方算好）；
/// `emit` 闭包 = 宿主 emitter（与 sync_service 同一函数）。
pub fn sync_host_sql(
    db: &AuthorityDb,
    data_home: &Path,
    host: &str,
    machine_namespace: &str,
    dirty: &[(std::path::PathBuf, (u64, u64))],
    emit: impl Fn(&std::path::Path) -> Result<Vec<serde_json::Value>, String>,
) -> Result<SqlSyncOutcome, String> {
    let _ = (db, data_home, host, machine_namespace, dirty, emit);
    unimplemented!(
        "Phase 2.4：sync_runs + source_files/sessions upsert + insert_facts \
         一个事务；文件级错误不进指纹（重试语义与 JSONL 版一致）"
    )
}

#[cfg(test)]
mod tests {
    // 测试在 Phase 2 实现时补（spec §8.2 矩阵：重放/修改/截断/坏行/并发）。
}
