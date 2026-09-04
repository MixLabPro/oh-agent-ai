//! **DSH 会话 wire 解释——过渡住 `domain/`（layer-2 债）。**
//!
//! 按 arch v0.8 这些属 `agent-vitals-hosts/dsh/sessions/`：`evidence`（raw DSH
//! 事件 → `CanonicalSession`）、`audit`（raw → findings shim）、`compaction` /
//! `waste`（raw DSH 事件 → findings）都在解析 DSH 的 `"tool/call"`/`"turn/start"`
//! 形状。**但它们没法迁进独立 adapter crate**：`domain/{behavior,trajectory}.rs`
//! 的 `#[cfg(test)]` 用 `build_dsh_evidence` 造 `CanonicalSession` fixture，跨 crate
//! 边界传 core 类型 + `[dev-dependencies]` 成环 → Cargo「multiple versions of
//! crate」（见 `AGENT_VITALS_V0_8_PHASE_C_RESEARCH.md` §6ter）。
//!
//! 所以与 `coords` / `usage` 里的 inline DSH 解析同一处理：登记为 layer-2 债、
//! 住 `domain/dsh/`，`dependency_budget.rs` 显式允许。终态是 per-host
//! `sessions/evidence` 产出的 `CanonicalSession` 时间线自带一切、`domain/dsh/`
//! 整个退场（wire/fold 分离，Phase D 之后）。

pub mod audit;
pub mod compaction;
pub mod evidence;
pub mod waste;
