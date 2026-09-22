//! 同步与入库域。


pub mod ingest_service;
pub mod lease;
pub mod plugin_ingest;
pub mod reimport_verify;
// 自看护（REVIEW P4，G5）：读自身 CPU、超阈值持续一段时间就把 watcher 冷却
// 指数拉长。与 `watch` 同级——它是 watch 触发路径的节流阀，不是 watch 内部
// 机制，watcher 关闭时（feature 关闭/无根）也一样能读 CPU、一样能生效。
pub mod self_monitor;
pub mod sql_authority;
pub mod sql_sync;
pub mod sync_control;
pub mod sync_service;
// P2 watcher（spec §9-P2）：文件事件 → 去抖 → 唤醒 tick + watch-only 消费者。
pub mod watch;

