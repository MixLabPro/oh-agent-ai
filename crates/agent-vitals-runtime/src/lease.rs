//! Stage B（spec §3.5/§7）：writer lease —— 双进程写互斥（DoD #3）。
//!
//! **冲突面**（R4 §7 Stage B）：托盘 tick 与 CLI 并写 `month.json`——
//! `atomic_write_json` 只保**单文件**原子（rename），不保 merge_month 的
//! read-modify-write **序列**（两个进程都读到旧 existing、各自 merge、各自
//! 写回 = 后写者吃掉前写者的合并，正是 2026-08 三倍计数事故的进程间版本）。
//! 本模块给「读状态 → 改 → 写回」的临界区一把跨进程锁。
//!
//! 机制：锁文件 `<dir>/.<name>.lock`（O_EXCL 原子创建）+ JSON 内容
//! `{holder, pid, acquired_at_ms, ttl_ms}`。
//!
//! - **TTL 陈旧偷取**：持锁进程 crash 会留下锁文件；过了 TTL 的锁视为
//!   陈旧，可被下一个获取者偷走。P0 不做 pid 存活探测（std 无 pid 存在性
//!   API，引 libc/sysinfo 违反本仓库依赖纪律）——代价是 crash 后最长阻塞
//!   一个 TTL，对毫秒级临界区这是可接受的保守值。
//! - **临界区必须短**：TTL 要覆盖最坏临界区时长。状态写（merge_today/
//!   merge_month）的临界区是毫秒级（两次 rename），TTL 2s；ingest 的
//!   临界区是 JSONL 追加 + 索引插入（毫秒级——**慢的 fold/emit 在锁外**），
//!   同 TTL。把 fold 关进锁里是错误用法。
//! - **等待语义**：`acquire_blocking` 每 10ms 重试至 max_wait，然后报
//!   `Held`。调用方（CLI/Tauri）拿到 `Held` 就如实失败——锁不是拿来排队
//!   长任务的，是保护短临界区的。
//!
//! **覆盖范围（如实）**：v0.9 的 lease 收口的是 **Rust 侧双进程**（托盘 +
//! CLI，spec 点名的冲突面）。Python 实现的 month.json 写入方（ClawHub
//! 发布形态）不认识这把锁——按 §7.1 Phased Python Diminishment，Python
//! 逐步退役，且 v0.9 DoD #7 明令 Python 不新增 writer；跨实现租约不在
//! 本版范围。

use std::io::Write;
use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

/// 单次获取的结果。`Held` 携带持有者信息——调用方的错误消息要能回答
/// 「谁在占」。
#[derive(Debug)]
pub enum LeaseError {
    /// 被别的进程持有且未过期。
    Held { holder: String, ttl_remaining_ms: u64 },
    /// I/O 错误（目录不可写等）。
    Io(std::io::Error),
}

impl std::fmt::Display for LeaseError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            LeaseError::Held { holder, ttl_remaining_ms } => write!(
                f,
                "writer lease held by `{holder}` ({ttl_remaining_ms}ms remaining)"
            ),
            LeaseError::Io(e) => write!(f, "lease io: {e}"),
        }
    }
}

fn now_ms() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0)
}

/// 单次尝试获取。成功返回守护（Drop = 释放）；被持有且未过期 → `Held`；
/// 过期锁被偷走重试一次。
pub fn acquire(path: &Path, holder: &str, ttl_ms: u64) -> Result<FileLease, LeaseError> {
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir).map_err(LeaseError::Io)?;
    }
    let body = serde_json::json!({
        "holder": holder,
        "pid": std::process::id(),
        "acquired_at_ms": now_ms() as u64,
        "ttl_ms": ttl_ms,
    });
    let write_lock = |p: &Path| -> Result<(), std::io::Error> {
        // O_EXCL：create_new 只在文件不存在时成功——原子性的全部来源。
        let mut f = std::fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(p)?;
        f.write_all(body.to_string().as_bytes())?;
        f.sync_all()?;
        Ok(())
    };
    match write_lock(path) {
        Ok(()) => Ok(FileLease { path: path.to_path_buf() }),
        Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => {
            // 已有锁文件：过期 → 偷；未过期 → Held。读不出内容（半行 crash）
            // 的锁按「无 ttl 信息」处理——保守视为陈旧可偷（空/坏锁文件
            // 永远等不到合法释放）。
            let (lock_holder, ttl_remaining) = std::fs::read_to_string(path)
                .ok()
                .and_then(|s| serde_json::from_str::<serde_json::Value>(&s).ok())
                .map(|v| {
                    let acquired = v.get("acquired_at_ms").and_then(|x| x.as_u64()).unwrap_or(0);
                    let ttl = v.get("ttl_ms").and_then(|x| x.as_u64()).unwrap_or(0);
                    let holder = v
                        .get("holder")
                        .and_then(|x| x.as_str())
                        .unwrap_or("unknown")
                        .to_string();
                    let elapsed = now_ms().saturating_sub(acquired as u128) as u64;
                    (holder, ttl.saturating_sub(elapsed))
                })
                .unwrap_or(("unreadable-lock".to_string(), 0));
            if ttl_remaining > 0 {
                return Err(LeaseError::Held { holder: lock_holder, ttl_remaining_ms: ttl_remaining });
            }
            // 陈旧（或读不出）：偷。先删再抢——两个偷取者竞争时 O_EXCL 仍
            // 保证只有一个成功，失败的拿到的锁文件是赢家的（未过期 → Held）。
            let _ = std::fs::remove_file(path);
            write_lock(path).map_err(LeaseError::Io)?;
            Ok(FileLease { path: path.to_path_buf() })
        }
        Err(e) => Err(LeaseError::Io(e)),
    }
}

/// 阻塞式获取：每 10ms 重试直至 `max_wait_ms`，随后如实报 `Held`。
/// 短临界区专用——不要用这个 API 排队长任务。
pub fn acquire_blocking(
    path: &Path,
    holder: &str,
    ttl_ms: u64,
    max_wait_ms: u64,
) -> Result<FileLease, LeaseError> {
    let deadline = now_ms() + max_wait_ms as u128;
    loop {
        match acquire(path, holder, ttl_ms) {
            Ok(lease) => return Ok(lease),
            Err(LeaseError::Held { .. }) if now_ms() < deadline => {
                std::thread::sleep(Duration::from_millis(10));
            }
            Err(e) => return Err(e),
        }
    }
}

/// 持有的租约。Drop 兜底释放（ best-effort：释放失败只能静默——TTL 会
/// 兜住陈旧锁）；正常路径应显式 `release()` 拿到删除结果。
#[derive(Debug)]
pub struct FileLease {
    path: PathBuf,
}

impl FileLease {
    /// 显式释放（删除锁文件）。临界区结束即调——不等 Drop。
    pub fn release(self) -> Result<(), std::io::Error> {
        let path = self.path.clone();
        std::mem::forget(self); // release 自己负责，别让 Drop 再删一次
        std::fs::remove_file(&path)
    }

    pub fn path(&self) -> &Path {
        &self.path
    }
}

impl Drop for FileLease {
    fn drop(&mut self) {
        let _ = std::fs::remove_file(&self.path);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tmp_lock(tag: &str) -> PathBuf {
        std::env::temp_dir().join(format!(
            "avd-lease-{tag}-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ))
    }

    #[test]
    fn mutual_exclusion_between_two_holders() {
        let path = tmp_lock("mutex");
        let a = acquire(&path, "proc-a", 60_000).unwrap();
        let err = acquire(&path, "proc-b", 60_000).unwrap_err();
        match err {
            LeaseError::Held { holder, .. } => assert_eq!(holder, "proc-a"),
            other => panic!("expected Held, got {other:?}"),
        }
        a.release().unwrap();
        // 释放后立即可获取。
        let b = acquire(&path, "proc-b", 60_000).unwrap();
        b.release().unwrap();
        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn stale_lease_is_stolen_after_ttl() {
        let path = tmp_lock("stale");
        // 模拟 crash 残留：手工写一把早已过期的锁（holder 进程已死）。
        std::fs::write(
            &path,
            serde_json::json!({
                "holder": "dead-process",
                "pid": 999_999_999,
                "acquired_at_ms": now_ms() as u64 - 10_000,
                "ttl_ms": 1_000,
            })
            .to_string(),
        )
        .unwrap();
        let stolen = acquire(&path, "new-proc", 60_000).unwrap();
        stolen.release().unwrap();
        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn unreadable_lock_file_is_treated_as_stale() {
        let path = tmp_lock("garbage");
        // crash 半行锁文件：读不出 ttl 信息 → 保守可偷（等不到合法释放）。
        std::fs::write(&path, "{\"holder\": \"crash").unwrap();
        let stolen = acquire(&path, "new-proc", 60_000).unwrap();
        stolen.release().unwrap();
        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn blocking_acquire_waits_then_reports_holder() {
        let path = tmp_lock("block");
        let a = acquire(&path, "slow-holder", 60_000).unwrap();
        let started = std::time::Instant::now();
        let err = acquire_blocking(&path, "waiter", 60_000, 60).unwrap_err();
        assert!(started.elapsed() >= Duration::from_millis(50), "至少等了一轮重试");
        match err {
            LeaseError::Held { holder, .. } => assert_eq!(holder, "slow-holder"),
            other => panic!("expected Held, got {other:?}"),
        }
        // 持有者释放后，等待者能拿到。
        a.release().unwrap();
        let b = acquire_blocking(&path, "waiter", 60_000, 1_000).unwrap();
        b.release().unwrap();
        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn drop_releases_the_lock_as_a_safety_net() {
        let path = tmp_lock("drop");
        {
            let _lease = acquire(&path, "leaky", 60_000).unwrap();
            // 不显式 release——Drop 兜底。
        }
        let next = acquire(&path, "next", 60_000).unwrap();
        next.release().unwrap();
        let _ = std::fs::remove_file(&path);
    }
}
