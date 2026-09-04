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
//! 住 `domain/dsh/`，`dependency_budget.rs` 显式允许。
//!
//! **这是 Phase C 遗留的一处债，不是完结态**——`domain/` 因此还**不是**完全
//! wire-pure。把这 4 个模块迁进 `hosts/dsh/sessions/`（`build_dsh_evidence`
//! fixture 改由 adapters crate 的 integration test 承载）是 **Phase D 的第一项**，
//! 那时 `hosts/<h>/sources/` 已落地、`sessions/` 收 wire 解析顺理成章。在此之前
//! `dependency_budget.rs` 把它钉为**唯一**登记债、不许扩张。

pub mod audit;
pub mod compaction;
pub mod evidence;
pub mod waste;
