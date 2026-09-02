//! Agent 行为与成本审计子面：会话执行审计（behavior，吃 core 的轨迹/证据规则）
//! 与成本折叠（cost = DSH ¥、codex_cost = Codex $、codex_session = Codex 会话读取）。
//!
//! 计算本体在 core crate（agent_vitals_core），本子树只做 I/O 接线与 CLI 适配；
//! wasm 与 CLI 都包同一份 core，绝不在这里长第二份规则。

pub mod behavior;
pub mod budget;
pub mod claude_cost;
pub mod claude_session;
pub mod codex_cost;
pub mod codex_session;
pub mod codex_session_audit;
pub mod cost;
pub mod discovery;
pub mod oneline;
pub mod plan;
pub mod r2a_store;
pub mod state;
pub mod takeover;
pub mod workbuddy_session;
