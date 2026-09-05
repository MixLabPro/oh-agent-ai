//! v0.9 Stage 0.3：CLI application-layer extraction
//! （`docs/AGENT_VITALS_V0_9_STAGE0_RESEARCH.md` §6）。
//!
//! 这里装的是"读已存在的宿主证据/state/ledger，折成 CLI 要渲染的 Summary/
//! SessionStore 缓存"这类**本机取数逻辑**——之前历史原因长在 `apps/cli` 顶层，
//! 现在按 spec §5.2 的门槛（"CLI 不再拥有宿主 wire 解释或事实写入"）迁到这个
//! 本机机器 crate。逐文件迁移记录见 STAGE0_RESEARCH §6，一个文件一个提交。

pub mod codex_cost;
