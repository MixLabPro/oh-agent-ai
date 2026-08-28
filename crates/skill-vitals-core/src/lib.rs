//! Pure computation core of skill-vitals, shared by the native CLI and the
//! browser wasm build. Only the I/O-free modules live here; anything that
//! touches the filesystem, a subprocess, or the CLI stays in the binary crate.
//!
//! The split is the disk ≠ context boundary from the repo's design: the wasm
//! build can run these pure functions on data already in memory, but it must
//! never read a file.

pub mod behavior;
pub mod codex_evidence;
pub mod compaction;
pub mod dsh_evidence;
pub mod duration;
pub mod evidence;
pub mod skill;
pub mod subagent;
pub mod waste;
pub mod trajectory;
pub mod usage;
pub mod util;
