//! Skill Surface 的本机 state（不是宿主 wire 解释，`agent-vitals-hosts` 不装
//! 这个；也不是纯规则计算，`agent-vitals-domain` 不装这个——是"把体检结果
//! 可靠地存到本机磁盘、下次能比对"这件运行时职责）。v0.8 Phase E7.4 从
//! `apps/cli/src/skills/snapshot.rs` 迁来。

pub mod snapshot;
