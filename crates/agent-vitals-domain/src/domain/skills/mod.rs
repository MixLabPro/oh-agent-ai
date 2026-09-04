//! Skill Surface（静态 SKILL.md 体检）的纯计算——**不是** `domain::skill`（单数，
//! Session Surface 的 skill 执行审计，两者刻意分开，见 `docs/
//! AGENT_VITALS_V0_8_PHASE_E7_RESEARCH.md`）。
//!
//! v0.8 Phase E7（收口 D4/D5 遗漏的 Skill Surface 宿主归位）第一步：把
//! `apps/cli/src/skills/` 里零 I/O、零宿主专有逻辑的纯解析函数迁进来。目前只有
//! `frontmatter`；`analysis`/`overlap`/`security_rules` 等在后续子步骤加入。

pub mod frontmatter;
