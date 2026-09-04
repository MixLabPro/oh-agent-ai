//! Skill Surface（静态 SKILL.md 体检）的纯计算——**不是** `domain::skill`（单数，
//! Session Surface 的 skill 执行审计，两者刻意分开，见 `docs/
//! AGENT_VITALS_V0_8_PHASE_E7_RESEARCH.md`）。
//!
//! v0.8 Phase E7（收口 D4/D5 遗漏的 Skill Surface 宿主归位）：把
//! `apps/cli/src/skills/` 里零 I/O、零宿主专有逻辑的纯函数迁进来。
//! E7.1 迁 `frontmatter`；E7.2 迁 `analysis`/`overlap`/`ranking`（冲突/覆盖
//! 优先级排序，原 main.rs 顶层的 `level_rank`/`severity_rank`/…）。
//! `security_rules` 等在后续子步骤加入。

pub mod analysis;
pub mod frontmatter;
pub mod overlap;
pub mod ranking;
