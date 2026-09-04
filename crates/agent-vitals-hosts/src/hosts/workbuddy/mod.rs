//! WorkBuddy adapter surfaces.
//!
//! `sessions/` = 会话证据（纯，wasm 可链）。`sources.rs` = 会话文件定位 / 读取
//! （I/O，`#[cfg(feature = "sources")]`——纯构建 / wasm 不编译）。v0.8 Phase D5
//! 把二进制 `src/agent/workbuddy_session.rs` 迁进 `sources`。

pub mod sessions;

#[cfg(feature = "sources")]
pub mod sources;
