//! Agent Vitals 的跨宿主领域 crate——**纯计算 + 词表契约的单一真相源**，由原生
//! CLI、wasm 构建和 Tauri 菜单栏共用。
//!
//! - `contracts/` — 宿主无关词表（`evidence`/`host_capability`/`source_identity`/
//!   `usage_fact`/`r2a`）：身份与序列化事实形状，只依赖 `serde_json`、不解释任何
//!   宿主 wire、不碰 I/O。纯净度由 `tests/dependency_budget.rs` 的
//!   `contracts_module_stays_vocabulary_only` 钉住。
//! - `domain/` — 跨宿主业务计算（behavior/trajectory/cost/usage/detectors/plan/…）。
//!   `domain/dsh/` 是登记的 layer-2 DSH-wire 债（`build_dsh_evidence` fixture 依赖，
//!   见 `domain/dsh/mod.rs`），wire/fold 分离排 Phase D 之后。
//! - `compatibility/` — 通往 `vitals-core` 引擎的兼容桥。
//!
//! v0.8 Phase C：Phase A 在 core 内建 `contracts/domain/compatibility` 逻辑目录；
//! Step 3 把 Codex fold + canonical 归一层迁进 `agent-vitals-adapters`；Step 4 把
//! `domain/` + `compatibility/` + `contracts/` 整体抽成本 crate，`agent-vitals-core`
//! 曾作一个版本周期的薄 facade、随即撤销——调用方直接 `use agent_vitals_domain::*`。
//! `lib.rs` 同时暴露嵌套（`agent_vitals_domain::{contracts,domain}::X`）与扁平
//! （`agent_vitals_domain::{evidence,behavior,cost,…}::X`）两套路径。

pub mod compatibility;
pub mod contracts;
pub mod domain;

// 词表扁平别名——`domain/*.rs` 与 `compatibility/*.rs` 用 `crate::evidence` /
// `crate::host_capability` 等引契约。
pub use contracts::{evidence, host_capability, r2a, source_identity, usage_fact};

// DSH-wire 债（`domain/dsh/`）——扁平别名与迁出前一致。
pub use domain::dsh::{audit, compaction, evidence as dsh_evidence, waste};

// domain 计算模块的扁平别名——Phase C 迁出前 `agent_vitals_domain::behavior::*` 等。
pub use domain::{
    behavior, budget, canonical_audit, coords, cost, detectors, duration, findings, plan, skill,
    state, subagent, takeover, trajectory, usage, util,
};
