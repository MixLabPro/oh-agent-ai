//! `agent-vitals-data` —— v0.9 Data Foundation 的事实写入 + 可重建查询投影层
//! （`docs/AGENT_VITALS_V0_9_DATA_VALUE_ARCHITECTURE_SPEC.md` §3.1/§5，拆分
//! 计划见 `docs/AGENT_VITALS_V0_9_STAGE0_RESEARCH.md`）。
//!
//! 这是一个**嵌入式本地数据层**，不是独立服务：不开网络端口、不起 daemon，
//! 也不让 Tauri/CLI 绕过它直读 SQLite（spec §3.1 表："不允许承担的职责"一列
//! 明写 UI 呈现/同步调度不归这里管）。六个子模块对应 spec §5 的目录树：
//!
//! - [`evidence`]   —— append / replay / reconciliation（Stage A）
//! - [`store`]      —— SQLite schema / migration / transaction（Stage B）
//! - [`repository`] —— typed query/mutation 边界，上层唯一入口
//! - [`billing`]    —— `BillingContext` / cost basis（Stage B）
//! - [`coverage`]   —— source/denominator coverage 的跨宿主汇总
//! - [`projection`] —— 组装 `agent_vitals_domain::data_contract` 的
//!   `MonthlySummary`/`DailySummary` 等版本化 DTO
//!
//! **Stage B 现状**：`evidence`（Stage A：append/replay/尾面修复）、
//! `store`（Stage B：SQLite 可重建索引——schema_version 不匹配/删库 →
//! 从 JSONL 全量重放）已落地；`repository` 仍是 trait 签名（SQLite 实现
//! 与 Stage 0 JSON adapter 的换位是 Stage B 后续步），`billing`/`coverage`
//! 等待 Stage B 的 P2 批。
//!
//! **`SummaryRepository` 的实现不在这个 crate 里**：spec §3.1 的依赖表把
//! 本 crate 的允许依赖限定在 Domain（+ 未来的 SQLite 驱动），不包括
//! `agent-vitals-hosts`——Stage 0 唯一能读到宿主数据（`SessionStore`/
//! `budget` 状态）的地方是 `agent-vitals-runtime`，所以 trait 的具体实现
//! 住在那边（`docs/AGENT_VITALS_V0_9_STAGE0_RESEARCH.md` §8.1/§8.4）。

pub mod authority;
pub mod fact_writer_sql;
pub mod legacy_import;
pub mod billing;
pub mod coverage;
pub mod evidence;
pub mod projection;
pub mod repository;
pub mod store;
