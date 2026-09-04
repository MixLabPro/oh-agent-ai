//! Pure host protocol adapters + 跨宿主 wire 归一。
//!
//! Adapters receive data already loaded in memory. File discovery, decoding,
//! persistence and process orchestration remain runtime responsibilities.
//!
//! Phase C（B2）起 Codex fold（`codex_usage`）与跨宿主 `canonical_usage` 物理
//! 住这个 crate。**Phase D1** 把 DSH 的 wire 解析（`evidence`/`audit`/
//! `compaction`/`waste`）从 `agent-vitals-domain::domain::dsh` 迁进
//! `hosts/dsh/sessions/`——`domain/` 不再有任何 DSH raw 事件形状知识。

pub mod canonical_usage;
pub mod hosts;

// Flat compatibility facade——调用方一个 crate 一个入口。
pub use hosts::claude_code::sessions::evidence as claude_code_evidence;
pub use hosts::codex::sessions::{evidence as codex_evidence, usage as codex_usage};
pub use hosts::dsh::sessions::{
    audit, compaction, evidence as dsh_evidence, waste,
};
pub use hosts::workbuddy::sessions::evidence as workbuddy_evidence;
