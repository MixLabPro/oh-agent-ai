//! Agent 行为与成本审计子面：会话执行审计（behavior，吃 core 的轨迹/证据规则）
//! 与成本折叠（cost = DSH ¥、codex_cost = Codex $、codex_session = Codex 会话读取）。
//!
//! 计算本体在 core crate（agent_vitals_domain），本子树只做 I/O 接线与 CLI 适配；
//! wasm 与 CLI 都包同一份 core，绝不在这里长第二份规则。

pub mod behavior;
pub mod budget;
pub mod claude_cost;
pub mod claude_usage_fact;
pub mod codex_cost;
pub mod codex_session_audit;
pub mod codex_usage_fact;
pub mod cost;
pub mod dsh_usage_fact;
pub mod discovery;
pub mod host_runtime_registration;
pub mod oneline;
pub mod plan;
pub mod r2a_store;
pub mod session_sources;
pub mod state;
pub mod takeover;
