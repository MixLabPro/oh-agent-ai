//! Skill Vitals 静态体检子面：SKILL.md 扫描器（discovery / host / security /
//! inventory / analysis / report / …）与安装时宿主适配器（codex / openclaw /
//! workbuddy，作为 scanner 的证据源）。
//!
//! 与 `agent/` 的边界：**「skill 体检」是静态资产审计**（本子树），**「skill
//! 执行」是会话内审计**（core 的 `skill.rs`，经 `agent::behavior` 折叠）——
//! 两者都叫 skill，但一个是扫描器、一个是轨迹检测器，永远不该混在一个子树里
//! （分类守卫测试 tests/test_classification.py 钉住这条边界）。

pub mod analysis;
pub mod codex;
pub mod discovery;
pub mod diff;
pub mod doctor;
pub mod explain;
pub mod host;
pub mod inventory;
pub mod openclaw;
pub mod overlap;
pub mod redact;
pub mod render;
pub mod report;
pub mod security;
pub mod snapshot;
pub mod workbuddy;
