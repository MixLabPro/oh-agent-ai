//! Skill Vitals 静态体检子面：SKILL.md 扫描器（discovery / doctor / security /
//! inventory / diff / explain / redact / render / report）。宿主适配器
//! （codex / openclaw / workbuddy / host 的配置解释与探测，作为 scanner 的
//! 证据源）v0.8 Phase E7.6 起迁进 `agent-vitals-hosts::hosts::<h>::{skills,
//! sources::skills}`——`discovery.rs`/`inventory.rs` 仍在本子树，通过重命名
//! import（`use agent_vitals_hosts::hosts::<h>::… as <h>;`）保持调用形态。
//!
//! 与 `agent/` 的边界：**「skill 体检」是静态资产审计**（本子树），**「skill
//! 执行」是会话内审计**（core 的 `skill.rs`，经 `agent::behavior` 折叠）——
//! 两者都叫 skill，但一个是扫描器、一个是轨迹检测器，永远不该混在一个子树里
//! （分类守卫测试 tests/test_classification.py 钉住这条边界）。

pub mod discovery;
pub mod diff;
pub mod doctor;
pub mod explain;
pub mod inventory;
pub mod redact;
pub mod render;
pub mod report;
pub mod security;
