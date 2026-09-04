//! Stage 0.3 起：把宿主只读来源（DSH `today`/`month`、Claude ledger、Codex
//! 折叠）组装成 [`agent_vitals_domain::data_contract`] 的版本化 DTO——WorkBuddy
//! 在这一步显式落进 `excluded_hosts`，不读它的任何真实数据源（用户 2026-09-05
//! 决定："workbuddy 的问题先不处理"，见
//! `docs/AGENT_VITALS_V0_9_STAGE0_RESEARCH.md` 触发记录）。
//!
//! Stage 0.2 骨架阶段只重新导出契约类型，方便上层（Stage 0.5 的 CLI/Tauri
//! 改接）提前对齐 import 路径；本模块尚未做任何 I/O 或组装逻辑。

pub use agent_vitals_domain::data_contract::{
    BillingBasis, CostBasis, CoverageStatus, DailySummary, Freshness, FreshnessState, HostAmount,
    MonthlySummary,
};
