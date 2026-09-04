//! Stage A（spec §7）：`UsageFact`/`CanonicalSession` 的 append-only JSONL
//! 写入、去重、reconciliation、跨进程 writer lease、崩溃恢复（spec §3.5
//! 写入协议：`lease acquired → intent durable → facts/canonical durable →
//! projection durable → manifest commit → checkpoint advance`）。
//!
//! Stage 0 骨架阶段没有实现——先冻结上层查询契约（`super::projection` /
//! `agent_vitals_domain::data_contract`），再决定写入协议的内部形状，避免
//! 为了赶进度反向设计出一个迁就查询 API 的写入层。
