//! v0.9.1 Phase 2（spec §5.1）：SQL 事实写入面——`usage_facts` 的唯一写入口。
//!
//! **接口契约已钉死**（`docs/AGENT_VITALS_V0_9_1_IMPLEMENTATION_PLAN.md`
//! Phase 2 节）：实现 agent 按 §5.1 四步协议填充，不得改签名。
//!
//! 事务边界：`SqlFactWriter` **不开事务**——调用方（runtime sync）用
//! `AuthorityDb::with_immediate_txn` 包「upsert sources/sessions +
//! insert_facts」整段（spec §5.1.4）；嵌套 BEGIN 是 SQLite 错误。
//!
//! 校验纪律（spec §5.1.3）：不合格 candidate **不静默丢**——写
//! `data_quality_issues`（scope_type="fact"，code 如 `invalid_fact`），
//! 合格项才进 `usage_facts`。幂等键 = 既有 `fact_id`；第二道防线 =
//! 表上的 UNIQUE 五元组（`INSERT ON CONFLICT DO NOTHING`）。

use std::path::Path;

use rusqlite::Connection;

use crate::authority::AuthorityError;

/// 一次 insert_facts 的结果（spec §5.1.4 的可观测结果）。
#[derive(Debug, Default, Clone, PartialEq, Eq)]
pub struct SqlInsertReport {
    /// 新插入的事实数。
    pub inserted: usize,
    /// fact_id 已存在（幂等吸收：重放/双管道/重复事件）。
    pub duplicate: usize,
    /// 契约校验失败、已写 `data_quality_issues` 的事实数。
    pub rejected: usize,
}

/// SQL 事实写入器。绑定一个 `sync_runs.run_id`（`ingested_run_id` 外键）与
/// 注入时钟（data crate 不读时钟——与 authority.rs 同款纪律）。
#[derive(Debug)]
pub struct SqlFactWriter<'a> {
    conn: &'a Connection,
    run_id: String,
    now_ms: i64,
}

impl<'a> SqlFactWriter<'a> {
    /// 绑定连接 + 批次 + 注入时钟。`run_id` 必须已存在（调用方先
    /// `AuthorityDb::begin_run`——外键约束会拒绝未知的 run_id）。
    pub fn new(
        conn: &'a Connection,
        run_id: &str,
        now_ms: i64,
    ) -> Result<Self, AuthorityError> {
        let _ = (conn, run_id, now_ms);
        unimplemented!("Phase 2.1：校验 run_id 存在（外键预检），绑定字段")
    }

    /// `source_files` upsert（spec §3.2）。`path_hash` = 路径的 fnv1a64 十六
    /// 进制（**不存明文路径**——路径属隐私面）。返回 source_id（= path_hash，
    /// 同 (host, path_hash) 下唯一）。首见写 `first_seen_at_ms`，再见更新
    /// `last_seen_at_ms`/指纹字段。`source_id` 生成规则：`{host}:{path_hash}`。
    pub fn upsert_source_file(
        &self,
        host: &str,
        path: &Path,
        size_bytes: u64,
        mtime_ns: u64,
        native_session_id: Option<&str>,
        parser_version: i64,
    ) -> Result<String, AuthorityError> {
        let _ = (
            host, path, size_bytes, mtime_ns, native_session_id, parser_version,
        );
        unimplemented!("Phase 2.2：source_files upsert——首次 INSERT，再见 UPDATE last_seen_at_ms/指纹")
    }

    /// `sessions` upsert（spec §3.2 最小 CanonicalSession 索引）。
    /// `session_key` = r2a 键构造 `{host}:{ns}:{profile}:{native_id}`（与
    /// 既有 SessionKey 展示串同形）。`last_observed_at_ms` 恒更新。
    pub fn upsert_session(
        &self,
        host: &str,
        machine_namespace: &str,
        native_session_id: &str,
        source_profile: Option<&str>,
        last_observed_ms: i64,
    ) -> Result<String, AuthorityError> {
        let _ = (host, machine_namespace, native_session_id, source_profile, last_observed_ms);
        unimplemented!("Phase 2.3：sessions upsert——ON CONFLICT(host, machine_namespace, native_session_id) DO UPDATE")
    }

    /// 事实批写入（spec §5.1.3/5.1.4）。每个 candidate：
    /// 1. 契约校验（`build_usage_fact` 同款 + 身份字段在场 + token 非负——
    ///    DDL CHECK 是最后防线，这里先拦）；
    /// 2. 不合格 → 写 `data_quality_issues`（scope_type="fact"、
    ///    scope_key=fact_id 或 candidate 摘要、code="invalid_fact"、
    ///    detail_json=问题清单）→ `rejected += 1`；
    /// 3. 合格 → `INSERT INTO usage_facts ... ON CONFLICT DO NOTHING`
    ///    （列映射见本文件下方常量 `FACT_COLUMN_MAPPING` 的文档）。
    ///
    /// `native_session_id` 按事实批的会话维度传（调用方按会话分批调用；
    /// 单批内混多会话 = 调用方 bug，这里按批断言）。
    pub fn insert_facts(
        &self,
        facts: &[serde_json::Value],
        source_id: &str,
        native_session_id: &str,
    ) -> Result<SqlInsertReport, AuthorityError> {
        let _ = (facts, source_id, native_session_id);
        unimplemented!(
            "Phase 2.1：校验→quality issues→INSERT OR CONFLICT DO NOTHING→报告"
        )
    }
}

// fact JSON → `usage_facts` 列映射（插入时使用）：
// | fact 字段 | 列 | 说明 |
// |---|---|---|
// | `fact_id` | fact_id | 契约层 6 元组 fnv1a64 |
// | `host` / `machine_namespace` / `native_session_id` / `source_event_id` / `observation_kind` | 同名列 | UNIQUE 五元组 |
// | `source_profile` | source_profile | |
// | `model_id` ?? `model_raw` | model_id | 与旧 store 同款回退 |
// | `provider_id` ?? `billing_source` | provider_id | |
// | `event_ts_utc`（ISO） | event_ts_ms | 解析为 UTC 毫秒——ISO→ms helper 从 store.rs 提升复用 |
// | （`event_ts_utc` 经 `peak_of`） | event_peak | 三尾部形态已钉测 |
// | `uncached_input_tokens` 等 4 桶 | t_* 4 列 | 负值在校验层拒绝（DDL CHECK 兜底） |
//
// `session_key`/`source_id`/`ingested_run_id`/`created_at_ms`/`updated_at_ms`
// 由 writer 绑定值填；`deleted_at_ms` 恒 NULL（soft delete 是 Phase 2 后续）。
