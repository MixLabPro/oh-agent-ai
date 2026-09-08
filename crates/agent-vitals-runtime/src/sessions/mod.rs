//! v0.9 Stage 0.3：CLI application-layer extraction
//! （`docs/AGENT_VITALS_V0_9_STAGE0_RESEARCH.md` §6）。
//!
//! 这里装的是"读已存在的宿主证据/state/ledger，折成 CLI 要渲染的 Summary/
//! SessionStore 缓存"这类**本机取数逻辑**——之前历史原因长在 `apps/cli` 顶层，
//! 现在按 spec §5.2 的门槛（"CLI 不再拥有宿主 wire 解释或事实写入"）迁到这个
//! 本机机器 crate。逐文件迁移记录见 STAGE0_RESEARCH §6，一个文件一个提交。

pub mod behavior;
pub mod claude_ledger;
pub mod codex_cost;
pub mod codex_session_audit;
pub mod discovery;
// v0.9.1 PR #4：jsonl 回放路径（SessionStore / cache_v2 / 旧 sessions_list/read/
// findings/navigation）behind `legacy-r2a` feature。CLI 显式 enable（task #19
// M4 落地前的过渡）；desktop / wasm 不开（已迁 mcp::dispatch）。整文件不进
// `--no-default-features` 编译；Rust 0.74+ `#[cfg]` 不允许挂 `mod` 关键字
// 的非 `unsafe` 形式，但挂 `pub mod` 是 OK 的——`#[cfg(...)] pub mod r2a_store;`
// 在 feature 关闭时整个模块不编入，没有任何 `dead_code` / `unused` 噪音。
#[cfg(feature = "legacy-r2a")]
pub mod r2a_store;
