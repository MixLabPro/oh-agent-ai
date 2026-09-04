//! 成本计算的二进制侧薄封装。
//!
//! 纯计算（`cost_report`/`cost_block`/`priced_day`/`load_pricing`）住在
//! `crates/agent-vitals-domain`（单一真相源，CLI / Python / Tauri 菜单栏共用），
//! 这里只 re-export，让既有调用点（`main.rs` 的 `agent::cost::*`）不改一行。
//! 与 `behavior.rs` 的封装同款——core 是规则的家，二进制只做 I/O 接线。

pub use agent_vitals_domain::cost::{cost_block, cost_report, cost_series, load_pricing};
