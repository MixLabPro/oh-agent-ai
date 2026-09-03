//! Pure host protocol adapters.
//!
//! Adapters receive data already loaded in memory. File discovery, decoding,
//! persistence and process orchestration remain runtime responsibilities.

pub mod hosts;

// Phase B compatibility facade. Callers get one adapter crate even while the
// two reverse-dependency seams (`dsh_evidence`, `codex_usage`) remain physically
// in core until Phase C separates their domain consumers.
pub use hosts::claude_code::sessions::evidence as claude_code_evidence;
pub use hosts::codex::sessions::{evidence as codex_evidence, usage as codex_usage};
pub use hosts::dsh::sessions::evidence as dsh_evidence;
pub use hosts::workbuddy::sessions::evidence as workbuddy_evidence;
