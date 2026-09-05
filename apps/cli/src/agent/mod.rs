//! Agent 行为与成本审计子面：会话执行审计（behavior，吃 core 的轨迹/证据规则）
//! 与成本折叠（cost = DSH ¥、codex_usage_fact/claude_usage_fact/dsh_usage_fact =
//! v0.7 UsageFact 发射器）。
//!
//! 计算本体在 core crate（agent_vitals_domain），本子树只做 I/O 接线与 CLI 适配；
//! wasm 与 CLI 都包同一份 core，绝不在这里长第二份规则。
//!
//! v0.9 Stage 0.3：`codex_cost`/`codex_session_audit`/`discovery`/`r2a_store`
//! 及 `behavior`/`claude_cost` 各自的部分内容逐步迁进
//! `agent_vitals_runtime::sessions`（见 `docs/AGENT_VITALS_V0_9_STAGE0_
//! RESEARCH.md` §6）——本文件的 `pub mod` 清单会随每一步迁移收缩。

pub mod claude_cost;
pub mod claude_usage_fact;
pub mod codex_session_audit;
pub mod codex_usage_fact;
pub mod cost;
pub mod dsh_usage_fact;
pub mod host_runtime_registration;
pub mod oneline;
pub mod plan;
pub mod r2a_store;
