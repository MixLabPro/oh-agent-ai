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
//! **Stage 0.2 现状**：六个模块目前只是骨架 + 文档；唯一带内容的是
//! `projection`（重新导出 domain 的契约类型，Stage 0.3 会在这里接上只读
//! JSON adapter）。`evidence`/`store`/`billing` 要等 Stage A/B 才有真正的
//! 写入/SQLite 逻辑——这不是遗漏，是 spec §7 阶段安排本身："Stage 0 不要求
//! 先完成 SQLite 迁移"。

pub mod billing;
pub mod coverage;
pub mod evidence;
pub mod projection;
pub mod repository;
pub mod store;
