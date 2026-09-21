//! P2 watcher（AGENT_VITALS_SOURCE_GRAPH_INFRASTRUCTURE_SPEC §9-P2；方案 A
//! 2026-09-22 产品拍板，见 P2_WATCHER_PRODUCT_REVIEW.md 决策记录）。
//!
//! 形状（Vite HMR 的 watcher 位，spec §3 机制 1）：**watcher 可插拔**——
//! feature `watcher` 关闭时本模块是 NoopWatcher（Vite `createNoopWatcher`
//! 同款），tick 5min 兜底照常工作；开启时 notify（macOS FSEvents / Linux
//! inotify）文件事件经**去抖合并**后做两件事：
//!
//! 1. **唤醒 tick**：文件发现/失效判定仍由 tick 的目录 walk + 指纹对账
//!    权威完成（spec §7）。watch 事件**不直接 mark_dirty、不碰 DB**——
//!    事件只负责"早点跑对账"。这是对 spec §3-P2 原案（事件 → mark_dirty）
//!    的有意简化：walk 每 tick 本来就全量 stat（实测 ~3ms），mark_dirty
//!    需要 watcher 线程开权威库写连接，引入与 sync 事务的 SQLITE_BUSY
//!    争用面，收益为零。丢事件/合并由既有对账兜底（spec §12），正确性
//!    不依赖 watcher。
//! 2. **watch-only 消费者**：非事实面目录（skills 安装根等）注册回调，
//!    变更即失效对应缓存（如桌面 Skill 体检的进程内报告缓存）。
//!
//! 去抖是有意手搓的（超时驱动单线程，见 [`DEBOUNCE`]):突发写事件在同一
//! 窗口内合并为一次唤醒，不引入 notify-debouncer-full 依赖。路由核（
//! [`WatchRouter`] / [`Debouncer`]）是**纯函数、无 notify 依赖**——没有
//! feature 也能单测；notify 只出现在 feature 门控的适配器里。

use std::collections::BTreeSet;
use std::path::{Path, PathBuf};
#[cfg(not(feature = "watcher"))]
use std::sync::mpsc::Receiver;
#[cfg(feature = "watcher")]
use std::sync::mpsc::{Receiver, RecvTimeoutError};
use std::sync::mpsc::Sender;
use std::sync::Arc;
use std::time::Duration;

#[cfg(feature = "watcher")]
use notify::Watcher;

/// 去抖窗：最后一个事件落定后等这么久再派发（毫秒）。FSEvents 自身延迟
/// ~1s，窗口取 1.2s 吸收同批写入的多条事件；再大只会白白推迟唤醒。
pub const DEBOUNCE: Duration = Duration::from_millis(1_200);

/// tick 唤醒器：watcher 去抖后 `wake()`；tick 循环用
/// `receiver.recv_timeout(TICK_PERIOD)` 代替 `sleep`——事件到 → 立刻醒，
/// 没事件 → 照旧按周期醒。feature 无关（无 watcher 时没人 wake，行为
/// 与纯 sleep 完全一致）。
#[derive(Clone)]
pub struct TickWaker {
    tx: Sender<()>,
}

pub struct WakeChannel {
    pub waker: TickWaker,
    pub receiver: Receiver<()>,
}

impl TickWaker {
    pub fn channel() -> WakeChannel {
        let (tx, receiver) = std::sync::mpsc::channel();
        WakeChannel { waker: TickWaker { tx }, receiver }
    }

    pub fn wake(&self) {
        // 满了/断开都无所谓：tick 周期本身就是兜底，唤醒只是加速。
        let _ = self.tx.send(());
    }
}

/// watch-only 消费者回调（watcher 线程内执行，必须快——只做内存失效）。
pub type WatchCallback = Arc<dyn Fn() + Send + Sync>;

/// 注册表：源目录（事实面，唤醒 tick）+ watch-only 目录（回调面）。
#[derive(Default)]
pub struct WatchRegistry {
    sources: Vec<(String, PathBuf)>,
    watch_only: Vec<(String, PathBuf, WatchCallback)>,
}

/// 一条注册项的路由命中。
#[derive(Debug, PartialEq, Eq)]
pub enum RouteHit {
    /// 命中某宿主的源目录 → 唤醒 tick。
    SourceHost(String),
    /// 命中第 i 个 watch-only 消费者（按注册序）。
    WatchOnly(usize),
}

impl WatchRegistry {
    pub fn new() -> Self {
        Self::default()
    }

    /// 注册宿主源目录（递归监听）。路径不存在也允许注册——进 pending
    /// 集合，出现后由 watcher 超时循环补挂。
    pub fn register_source(&mut self, host: &str, path: PathBuf) {
        self.sources.push((host.to_string(), path));
    }

    /// 注册 watch-only 消费者（回调在 watcher 线程执行，必须快——
    /// 只做内存失效/置位，慢活交给对应轮询循环）。
    pub fn register_watch_only(
        &mut self,
        name: &str,
        path: PathBuf,
        on_change: WatchCallback,
    ) {
        self.watch_only.push((name.to_string(), path, on_change));
    }

    pub fn is_empty(&self) -> bool {
        self.sources.is_empty() && self.watch_only.is_empty()
    }

    #[cfg(any(test, feature = "watcher"))]
    fn router(&self) -> WatchRouter {
        WatchRouter {
            sources: self.sources.clone(),
            watch_only: self
                .watch_only
                .iter()
                .enumerate()
                .map(|(i, (_, p, _))| (p.clone(), i))
                .collect(),
        }
    }
}

/// 纯路由核：事件路径 → 命中列表。与 notify 无关，两态可测。
///
/// watch_only 条目显式携带回调下标（`register_watch_only` 的注册序）——
/// 平台适配器可能为同一个根追加**规范化路径别名**（macOS FSEvents 把
/// `/var/…` 上报为 `/private/var/…`），别名必须映射到同一回调，追加
/// 条目不得移动既有下标。
pub struct WatchRouter {
    sources: Vec<(String, PathBuf)>,
    watch_only: Vec<(PathBuf, usize)>,
}

pub fn is_noise_path(path: &Path) -> bool {
    let Some(name) = path.file_name().and_then(|n| n.to_str()) else {
        return true;
    };
    // 编辑器/系统残渣——进了也只是多唤醒一次 tick（幂等），滤掉省 CPU。
    name == ".DS_Store" || name.ends_with(".tmp") || name.ends_with(".swp") || name.ends_with('~')
}

impl WatchRouter {
    /// 路径 → 所有命中（一个路径可能同时是源目录与 watch-only 成员；
    /// 前缀比较按组件边界，`/foo/bar2` 不算 `/foo/bar` 的成员）。
    pub fn route(&self, path: &Path) -> Vec<RouteHit> {
        if is_noise_path(path) {
            return Vec::new();
        }
        let mut hits = Vec::new();
        for (host, root) in &self.sources {
            if starts_within(path, root) {
                hits.push(RouteHit::SourceHost(host.clone()));
            }
        }
        for (root, cb_index) in &self.watch_only {
            if starts_within(path, root) {
                hits.push(RouteHit::WatchOnly(*cb_index));
            }
        }
        hits
    }

    /// 追加同一宿主源根的路径别名（规范化形式）。命中同一宿主，幂等
    /// 语义不变（去抖合并）。
    pub fn add_source_alias(&mut self, host: &str, path: PathBuf) {
        self.sources.push((host.to_string(), path));
    }

    /// 追加同一 watch-only 根（回调下标不变）的路径别名。
    pub fn add_watch_only_alias(&mut self, cb_index: usize, path: PathBuf) {
        self.watch_only.push((path, cb_index));
    }
}

/// 组件边界感知的前缀判定（`std::path::starts_with` 本身就是按组件的，
/// 包一层只为语义命名与空路径防御）。
fn starts_within(path: &Path, root: &Path) -> bool {
    !root.as_os_str().is_empty() && path.starts_with(root)
}

/// 去抖收集器：窗口内offer 的命中合并成一批。纯状态机，无时钟依赖
/// （时钟在调用方：超时到了才 take_batch）。
#[derive(Default)]
pub struct Debouncer {
    hosts: BTreeSet<String>,
    watch_only: BTreeSet<usize>,
}

/// 一批合并后的派发动作。
#[derive(Debug, Default, PartialEq, Eq)]
pub struct WatchBatch {
    pub hosts: Vec<String>,
    pub watch_only: Vec<usize>,
}

impl Debouncer {
    pub fn offer(&mut self, hit: RouteHit) {
        match hit {
            RouteHit::SourceHost(host) => {
                self.hosts.insert(host);
            }
            RouteHit::WatchOnly(i) => {
                self.watch_only.insert(i);
            }
        }
    }

    pub fn is_empty(&self) -> bool {
        self.hosts.is_empty() && self.watch_only.is_empty()
    }

    /// 取走并清空当前批。
    pub fn take_batch(&mut self) -> WatchBatch {
        // BTreeSet 没有 drain——整体 mem::take（调用方拿走后 self 归零）。
        let hosts = std::mem::take(&mut self.hosts);
        let watch_only = std::mem::take(&mut self.watch_only);
        WatchBatch { hosts: hosts.into_iter().collect(), watch_only: watch_only.into_iter().collect() }
    }
}

/// skills 安装根（`scanner::DEFAULT_ROOTS` 里 home 相对的那部分）→
/// watch-only 注册用。`./` 开头的项目本地根**不监听**：桌面 app 的
/// cwd 无产品语义，监听它会做出随启动目录变化的怪行为。
pub fn default_skill_watch_roots(user_home: &Path) -> Vec<(String, PathBuf)> {
    let mut out = Vec::new();
    for (host, root) in crate::skills::scanner::DEFAULT_ROOTS.iter() {
        let Some(rel) = root.strip_prefix("~/") else {
            continue; // "./…" 项目本地根跳过
        };
        out.push((host.to_string(), user_home.join(rel)));
    }
    out.sort();
    out.dedup();
    out
}

/// 四宿主事实面的监听根——**与 `sync_facts` 的发现根同一来源**
/// （ingest/sync_service.rs 的 batches 枚举）：watcher 只是那趟 walk 的
/// 「早点跑」触发器，不是第二个真相源。根不存在也返回（注册进 pending，
/// watcher 超时循环补挂）。
pub fn default_source_watch_roots(user_home: &Path) -> Vec<(&'static str, PathBuf)> {
    let mut roots: Vec<(&'static str, PathBuf)> = vec![
        ("claude-code", user_home.join(".claude").join("projects")),
        ("codex", crate::summary::codex_home()),
        (
            "workbuddy",
            agent_vitals_hosts::workbuddy_session::workbuddy_root(user_home),
        ),
    ];
    if let Some(dsh) = crate::home::dsh_home() {
        roots.push(("dsh", dsh));
    }
    roots
}

/// watcher 句柄。`is_noop()` = feature 关闭（或注册表为空），什么都没起。
pub struct WatcherHandle {
    pub noop: bool,
}

impl WatcherHandle {
    /// join 留给进程退出（daemon 线程不 join——桌面 app 生命周期即
    /// watcher 生命周期，无优雅停机需求）。
    pub fn is_noop(&self) -> bool {
        self.noop
    }
}

/// 启动 watcher。注册表为空或 feature `watcher` 关闭 → 返回 noop 句柄，
/// 零线程零依赖（NoopWatcher 语义）。
pub fn spawn_watcher(registry: WatchRegistry, waker: TickWaker) -> WatcherHandle {
    if registry.is_empty() {
        return WatcherHandle { noop: true };
    }
    spawn_platform_watcher(registry, waker)
}

#[cfg(feature = "watcher")]
fn spawn_platform_watcher(registry: WatchRegistry, waker: TickWaker) -> WatcherHandle {
    let (event_tx, event_rx) = std::sync::mpsc::channel();
    let mut watcher = match notify::RecommendedWatcher::new(event_tx, notify::Config::default()) {
        Ok(w) => w,
        Err(e) => {
            // 平台监听器起不来（罕见）——tick 兜底，诚实降级不装死。
            eprintln!("[agent-vitals] watcher 初始化失败，tick 兜底照常: {e}");
            return WatcherHandle { noop: true };
        }
    };
    // 路由器挂 RwLock：挂载成功时补规范化路径别名（FSEvents 上报
    // /private/var/...，注册用的是 /var/...——std::env::temp_dir 一类
    // 符号链接路径上必然发生）。别名映射回同一宿主/回调下标。
    let router = Arc::new(std::sync::RwLock::new(registry.router()));
    let callbacks: Vec<WatchCallback> =
        registry.watch_only.iter().map(|(_, _, cb)| Arc::clone(cb)).collect();

    // 根 → (宿主 或 回调下标) 的身份表，供别名追加。
    let mut root_identities: Vec<(PathBuf, RootIdentity)> = Vec::new();
    for (host, path) in &registry.sources {
        root_identities.push((path.clone(), RootIdentity::Source(host.clone())));
    }
    for (i, (_, path, _)) in registry.watch_only.iter().enumerate() {
        root_identities.push((path.clone(), RootIdentity::WatchOnly(i)));
    }

    /// 一个监听根在路由器里的身份（别名追加时用）。
    #[derive(Clone)]
    enum RootIdentity {
        Source(String),
        WatchOnly(usize),
    }

    fn add_canonical_alias(
        router: &std::sync::RwLock<WatchRouter>,
        identity: &RootIdentity,
        path: &Path,
    ) {
        let Ok(canon) = path.canonicalize() else { return };
        if canon == path {
            return;
        }
        if let Ok(mut r) = router.write() {
            match identity {
                RootIdentity::Source(host) => r.add_source_alias(host, canon),
                RootIdentity::WatchOnly(i) => r.add_watch_only_alias(*i, canon),
            }
        }
    }

    // pending = 还没挂上的根（注册时目录不存在，或 NotFound）。挂上的
    // 根移出 pending，绝不重复 watch（重复挂 = 重复事件）。每轮超时把
    // pending 全部重试一遍；永久失败的根打一次日志后放弃（tick 兜底）。
    let mut roots: Vec<PathBuf> = registry.sources.iter().map(|(_, p)| p.clone()).collect();
    roots.extend(registry.watch_only.iter().map(|(_, p, _)| p.clone()));
    roots.sort();
    roots.dedup();
    // 首轮就把已存在根的规范化别名挂上（目录存在 → canonicalize 成功）。
    for (path, identity) in &root_identities {
        add_canonical_alias(&router, identity, path);
    }

    let try_attach = |watcher: &mut notify::RecommendedWatcher,
                      pending: &mut Vec<PathBuf>,
                      router: &std::sync::RwLock<WatchRouter>,
                      root_identities: &[(PathBuf, RootIdentity)],
                      path: &Path| {
        match watcher.watch(path, notify::RecursiveMode::Recursive) {
            Ok(()) => {} // 挂上：调用方不再放回 pending；别名由调用方补
            Err(e) => {
                let not_found = matches!(e.kind, notify::ErrorKind::PathNotFound)
                    || matches!(&e.kind, notify::ErrorKind::Io(io)
                        if io.kind() == std::io::ErrorKind::NotFound);
                if not_found {
                    pending.push(path.to_path_buf()); // 目录未出现，留待重试
                } else {
                    // 挂载成功（或平台性失败）——能 canonicalize 就补别名。
                    if let Some((_, identity)) =
                        root_identities.iter().find(|(p, _)| p == path)
                    {
                        add_canonical_alias(router, identity, path);
                    }
                    eprintln!("[agent-vitals] watch {} 失败（该根 tick 兜底）: {e}", path.display());
                }
            }
        }
    };

    std::thread::Builder::new()
        .name("source-watcher".into())
        .spawn(move || {
            let mut deb = Debouncer::default();
            let mut pending: Vec<PathBuf> = Vec::new();
            // 开轮先挂一遍已存在的根（不等第一个超时窗）。
            for path in &roots {
                try_attach(&mut watcher, &mut pending, &router, &root_identities, path);
            }
            loop {
                match event_rx.recv_timeout(DEBOUNCE) {
                    Ok(Ok(event)) => {
                        let guard = router.read().unwrap_or_else(|e| e.into_inner());
                        for path in &event.paths {
                            for hit in guard.route(path) {
                                deb.offer(hit);
                            }
                        }
                    }
                    Ok(Err(e)) => {
                        // in-band 错误（如环形缓冲溢出）：记日志继续；丢的
                        // 事件由 tick 指纹对账兜底（spec §12），正确性不依赖。
                        eprintln!("[agent-vitals] watcher 事件错误（tick 兜底）: {e}");
                    }
                    Err(RecvTimeoutError::Timeout) => {
                       
                        // 超时双职责：①补挂 pending 根（目录晚于 app 启动
                        // 出现的场景）；②去抖窗落定派发一批。
                        let old = std::mem::take(&mut pending);
                        for path in &old {
                            try_attach(&mut watcher, &mut pending, &router, &root_identities, path);
                        }

                        let batch = deb.take_batch();
                        if !batch.hosts.is_empty() {
                            waker.wake();
                        }
                        for i in batch.watch_only {
                            if let Some(cb) = callbacks.get(i) {
                                cb();
                            }
                        }
                    }
                    Err(RecvTimeoutError::Disconnected) => {
                        // 事件通道断开（不会发生——RecommendedWatcher 由本
                        // 线程持住）；真发生时线程退出，tick 兜底接管。
                        return;
                    }
                }
            }
        })
        .map(|_| WatcherHandle { noop: false })
        .unwrap_or_else(|e| {
            eprintln!("[agent-vitals] watcher 线程启动失败，tick 兜底照常: {e}");
            WatcherHandle { noop: true }
        })
}

#[cfg(not(feature = "watcher"))]
fn spawn_platform_watcher(_registry: WatchRegistry, _waker: TickWaker) -> WatcherHandle {
    // NoopWatcher（Vite server/index.ts createNoopWatcher 同款）：无
    // notify 依赖、无线程；tick 周期发现照常（spec §1.5 可插拔条款）。
    WatcherHandle { noop: true }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn root(p: &str) -> PathBuf {
        PathBuf::from(p)
    }

    /// 路由：源宿主命中、watch-only 命中、跨根互不串、边界按组件。
    #[test]
    fn router_routes_by_component_prefix() {
        let mut reg = WatchRegistry::new();
        reg.register_source("claude-code", root("/home/u/.claude/projects"));
        reg.register_source("codex", root("/home/u/.codex"));
        let cb: Arc<dyn Fn() + Send + Sync> = Arc::new(|| {});
        reg.register_watch_only("skills", root("/home/u/.claude/skills"), cb);
        let router = reg.router();

        let hits = router.route(Path::new("/home/u/.claude/projects/p-x/sess.jsonl"));
        assert_eq!(hits, vec![RouteHit::SourceHost("claude-code".into())]);

        let hits = router.route(Path::new("/home/u/.claude/skills/foo/SKILL.md"));
        assert_eq!(hits, vec![RouteHit::WatchOnly(0)]);

        // 组件边界：/home/u/.claude/projects-x 不是 projects 的成员
        let hits = router.route(Path::new("/home/u/.claude/projects-x/sess.jsonl"));
        assert!(hits.is_empty(), "前缀必须按组件边界: {hits:?}");

        // 注册表外的路径
        let hits = router.route(Path::new("/etc/hosts"));
        assert!(hits.is_empty());
    }

    /// 噪声文件过滤：.DS_Store / *.tmp / 编辑器备份不产生命中。
    #[test]
    fn noise_paths_are_filtered() {
        let mut reg = WatchRegistry::new();
        reg.register_source("claude-code", root("/home/u/.claude/projects"));
        let router = reg.router();
        for junk in ["/home/u/.claude/projects/.DS_Store", "/home/u/.claude/projects/sess.jsonl.tmp", "/home/u/.claude/projects/sess.jsonl~"] {
            assert!(router.route(Path::new(junk)).is_empty(), "{junk} 应被滤掉");
        }
    }

    /// 去抖：窗口内多命中合并、宿主去重、take 后清空。
    #[test]
    fn debouncer_coalesces_bursts() {
        let mut deb = Debouncer::default();
        for _ in 0..5 {
            deb.offer(RouteHit::SourceHost("claude-code".into()));
        }
        deb.offer(RouteHit::SourceHost("codex".into()));
        deb.offer(RouteHit::WatchOnly(2));
        deb.offer(RouteHit::WatchOnly(2));
        let batch = deb.take_batch();
        assert_eq!(batch.hosts, vec!["claude-code".to_string(), "codex".to_string()],
            "BTreeSet 保证去重 + 稳定序");
        assert_eq!(batch.watch_only, vec![2]);
        assert!(deb.take_batch() == WatchBatch::default(), "take 后清空");
        assert!(deb.is_empty());
    }

    /// skills 根派生：只收 home 相对根、展开 ~、排序去重；`./` 项目根
    /// 不出现（桌面 cwd 无语义）。
    #[test]
    fn skill_watch_roots_are_home_relative_only() {
        let home = PathBuf::from("/home/u");
        let roots = default_skill_watch_roots(&home);
        assert!(!roots.is_empty(), "DEFAULT_ROOTS 里有 ~/ 根");
        for (host, path) in &roots {
            assert!(path.starts_with(&home), "{host}: {path:?} 应在 home 下");
            let s = path.to_string_lossy();
            assert!(!s.contains("/./"), "项目本地根不得出现: {s}");
        }
        let claude = roots.iter().find(|(h, _)| h == "claude-code").unwrap();
        assert_eq!(claude.1, home.join(".claude/skills"));
        // 幂等：再派生一次结果一致
        assert_eq!(default_skill_watch_roots(&home), roots);
    }

    /// waker：wake 落进 receiver；断开/满不影响调用方。
    #[test]
    fn tick_waker_delivers_and_never_panics() {
        let WakeChannel { waker, receiver } = TickWaker::channel();
        waker.wake();
        waker.wake();
        assert_eq!(receiver.try_recv(), Ok(()));
        assert_eq!(receiver.try_recv(), Ok(()));
        assert!(receiver.try_recv().is_err());
    }

    /// 空注册表 → noop 句柄（两种 feature 态都成立）。
    #[test]
    fn empty_registry_is_noop() {
        let WakeChannel { waker, receiver: _ } = TickWaker::channel();
        let handle = spawn_watcher(WatchRegistry::new(), waker);
        assert!(handle.is_noop(), "空注册表不得起线程");
    }

    /// 真实 FS 事件端到端（macOS FSEvents / Linux inotify）：注册临时
    /// 目录为源根 → 写文件 → 去抖窗内收到 wake。依赖平台事件时序，
    /// **不进常规门禁**（spec §12：事件时序测试允许手跑）：
    /// `cargo test -p agent-vitals-runtime --features watcher watch_real_fs_event_wakes -- --ignored --nocapture`
    #[test]
    #[cfg(feature = "watcher")]
    #[ignore = "真实 FS 事件时序；本地手跑"]
    fn watch_real_fs_event_wakes() {
        let dir = std::env::temp_dir().join(format!(
            "avd-watch-it-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir_all(&dir).unwrap();
        let WakeChannel { waker, receiver } = TickWaker::channel();
        let mut reg = WatchRegistry::new();
        reg.register_source("claude-code", dir.clone());
        let handle = spawn_watcher(reg, waker);
        assert!(!handle.is_noop());

        // FSEvents 流是「从现在起」语义：spawn 返回 ≠ 流已建立。先留挂载
        // 窗，写一轮没动静就再写一轮（新文件名），总窗 20s。
        std::thread::sleep(Duration::from_millis(400));
        let mut woke = false;
        for round in 0..2 {
            let name = format!("sess-{round}.jsonl");
            std::fs::write(dir.join(&name), "{\"type\":\"assistant\"}\n").unwrap();
            if receiver.recv_timeout(Duration::from_secs(10)).is_ok() {
                woke = true;
                break;
            }
        }
        assert!(woke, "20s 内未收到 wake（检查平台 watcher 与挂载时序）");
        let _ = std::fs::remove_dir_all(&dir);
    }
}
