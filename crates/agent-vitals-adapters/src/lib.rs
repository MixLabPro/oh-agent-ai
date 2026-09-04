//! Pure host protocol adapters + 跨宿主 wire 归一。
//!
//! Adapters receive data already loaded in memory. File discovery, decoding,
//! persistence and process orchestration remain runtime responsibilities.
//!
//! Phase C（B2）起 Codex fold（`codex_usage`）与跨宿主 `canonical_usage` 物理
//! 住这个 crate。DSH 的 `evidence`/`audit`/`compaction`/`waste` 因 domain 测试
//! 的 fixture 依赖仍暂住 `agent-vitals-domain::domain::dsh`（layer-2 债，见 core
//! `lib.rs` 注释），本 crate 经 re-export 提供 `dsh_evidence`。

pub mod canonical_usage;
pub mod hosts;

// Flat compatibility facade——调用方一个 crate 一个入口。
pub use hosts::claude_code::sessions::evidence as claude_code_evidence;
pub use hosts::codex::sessions::{evidence as codex_evidence, usage as codex_usage};
pub use hosts::dsh::sessions::evidence as dsh_evidence;
pub use hosts::workbuddy::sessions::evidence as workbuddy_evidence;
