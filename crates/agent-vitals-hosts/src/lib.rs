//! `agent-vitals-hosts` —— 一个 crate 装所有宿主的 wire 适配（v0.8 §4 v3.1）。
//!
//! 目录第一维按宿主（`hosts/<h>/`），第二维分证据面：`sessions/`（会话行为/
//! 轨迹/usage/cost 事实——**纯**，wasm 可链）、`skills/`（SKILL.md 体检——纯）、
//! `sources/`（定位/读取/解压/指纹——I/O，`#[cfg(feature = "sources")]`）。
//! D3（本 crate 由 `agent-vitals-adapters` 改名）只做骨架；`sources/` 与
//! `skills/` 的填充是 D4/D5。
//!
//! **纯（内存输入）**：`sessions/` 与 `skills/` 收到的是已加载好的数据。文件
//! 发现、解码、持久化和进程编排属 `agent-vitals-runtime` / `hosts/<h>/sources/`。
//!
//! Phase C（B2）起 Codex fold（`codex_usage`）+ 跨宿主 `canonical_usage` 住这里；
//! **Phase D1** 把 DSH wire 解析（`evidence`/`audit`/`compaction`/`waste`）从
//! `agent-vitals-domain` 迁进 `hosts/dsh/sessions/`——`domain/` 对宿主 wire 形状
//! 彻底不知情。

pub mod canonical_usage;
pub mod hosts;

// Flat compatibility facade——调用方一个 crate 一个入口。
pub use hosts::claude_code::sessions::evidence as claude_code_evidence;
pub use hosts::codex::sessions::{evidence as codex_evidence, usage as codex_usage};
pub use hosts::dsh::sessions::{
    audit, compaction, evidence as dsh_evidence, waste,
};
pub use hosts::workbuddy::sessions::evidence as workbuddy_evidence;
