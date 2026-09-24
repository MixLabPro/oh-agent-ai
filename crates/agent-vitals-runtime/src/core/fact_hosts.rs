//! 事实宿主封闭词表。
//!
//! W3 从 `ingest::ingest_service` 下沉到 core：`query::export` 只为枚举宿主就
//! 依赖了写入侧 ingest，拆 crate 时是一条环。词表是全 crate 的底层事实，放 core。

/// 事实宿主封闭词表（与四个 emitter 的 `host` stamp 同源；`trace_service::
/// TRACE_HOSTS` / `reimport_verify::HOSTS` / `summary::WIRED_HOSTS` 与本表同步
/// 维护——加宿主四处一起改）。
pub const FACT_HOSTS: [&str; 4] = ["claude-code", "codex", "dsh", "workbuddy"];
