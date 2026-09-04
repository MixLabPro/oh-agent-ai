//! Stage B（spec §5.1）：SQLite schema / migration / transaction——可删除、
//! 可重建的本地查询索引。权威事实永远是 `evidence` 模块的 JSONL；SQLite
//! 损坏或删除后必须能从 JSONL + canonical snapshot 重建等价投影（spec §3.4）。
//!
//! Stage 0 骨架阶段未实现，也**不引入 `rusqlite` 依赖**——见
//! `Cargo.toml` 顶部注释与 `tests/dependency_budget.rs`。
