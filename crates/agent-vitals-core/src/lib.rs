//! Pure computation core of agent-vitals, shared by the native CLI and the
//! browser wasm build. Only the I/O-free modules live here; anything that
//! touches the filesystem, a subprocess, or the CLI stays in the binary crate.
//!
//! The split is the disk ≠ context boundary from the repo's design: the wasm
//! build can run these pure functions on data already in memory, but it must
//! never read a file.

pub mod behavior;
pub mod budget;
pub mod codex_evidence;
pub mod codex_usage;
pub mod compaction;
// M2 兼容桥（docs/VITALS_CORE_V0_5_IMPLEMENTATION_SPEC.md §14）+ 第一批迁移
// 规则的 vitals-core Detector 实现（§14.4）。两者都是这次迁移新增的，其余
// 模块不受影响——旧 `behavior::match_behavior_canonical` 路径原样保留。
pub mod compatibility;
pub mod cost;
pub mod detectors;
pub mod dsh_evidence;
pub mod duration;
pub mod evidence;
pub mod findings;
pub mod r2a;
pub mod skill;
pub mod state;
pub mod subagent;
pub mod takeover;
pub mod waste;
pub mod trajectory;
pub mod usage;
pub mod util;
