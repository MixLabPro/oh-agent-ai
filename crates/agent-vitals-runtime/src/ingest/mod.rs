//! 同步与入库域。


pub mod ingest_service;
pub mod lease;
pub mod plugin_ingest;
pub mod reimport_verify;
pub mod sql_authority;
pub mod sql_sync;
pub mod sync_control;
pub mod sync_service;
// P2 watcher（spec §9-P2）：文件事件 → 去抖 → 唤醒 tick + watch-only 消费者。
pub mod watch;

