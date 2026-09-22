# 事件处理与可观测性：问题分析与调研说明

> 状态：**调研与整改建议（2026-09-22）**——由当日真机验收发现的 CPU 风暴事故触发
> （持续 ~3 核自旋，`feat/watcher-hardening` 分支 `e4a27fa` 修复后复验干净）。
> 本文回答三个问题：**其他产品如何处理事件风暴？我们的架构有缺陷吗？
> 我们有日志系统吗？** 并给出分期整改建议。
>
> 关联：`RUNTIME_REFACTOR_WATCHER_HOTPLUG_HARDENING_SPEC.md` §11.8（本次事故的
> as-built 记录）、`AGENT_VITALS_EVENT_BUS_ARCHITECTURE_SPEC.md`（事件总线契约）、
> `AGENT_VITALS_SOURCE_GRAPH_INFRASTRUCTURE_SPEC.md`（watcher 架构）。

---

## 0. 一句话结论

**架构有一个真实缺陷（事件→UI 是「直推全量刷新」而非「失效化+调度拉取」，
风暴时无背压），日志系统事实上不存在**（无日志框架、42 个 stderr 打点在
GUI 语境下全部落入 launchd 空洞、诊断包只含配置状态不含任何运行时数据）。
前者是本次事故的放大器，后者是把定位时间从几分钟拉长到几小时的根因。

---

## 1. 事故复盘摘要（证据链）

2026-09-22 真机验收发现托盘主进程持续 ~284% CPU（六线程各自 ~75%）。
定位过程与证据：

| 步骤 | 手段 | 发现 |
|---|---|---|
| 1 | `ps`/`top` 差分 | 烧的是主进程自身线程，非子进程 |
| 2 | `sample` + `ps -M` | 六个 `tokio-rt-worker` 在跑**我们的 async IPC 命令** |
| 3 | 符号化（临时关 `strip` 重建诊断版） | 热栈 = `InvokeResolver::respond_async_serialized_inner` → `calendar_month` / `day_freshness` / `claude_provider_amounts` / `billing_declarations` → `sqlite3VdbeExec`，混有 `env_read_lock` + stderr 写 |
| 4 | 行为二分 | 空闲（含 watcher 全开）= 0.0%；开窗+受控写入流 = ~8%；**风暴只在验收会话开窗交互时出现** |
| 5 | 修复后复验 | 30s 冷却版：空闲 0.0%、压测 ~8% |

**因果链**：活动 agent 会话持续追加被监听目录 → 每个去抖窗（1.2s）合法唤醒
sync tick → 每 tick 发射多个 app-event（SyncStatusChanged + 每宿主
FactsIngested + FoldCompleted）→ **每个挂载页面的监听器收到任何事件都
立即全量刷新**（Settings 一轮 = 7 个重 SQL invoke；多页并存则相乘）→
重 SQL 在 tokio worker 上排队执行 → 多核钉死。

已落的修复（`e4a27fa`，HARDENING spec §11.8）：watcher 唤醒→tick 执行率
加 30s 冷却下限（睡满不丢弃，尾批仍被服务）。这砍掉了**输入端**速率；
但「事件→页面」的放大回路本身仍在（见 §4 G1/G2）。

---

## 2. 现状盘点

### 2.1 事件处理链路（as-built）

```
FS 事件（FSEvents）
  └─ watcher worker：去抖 1.2s 合并 ──▶ TickWaker（单槽，Phase A）
        └─ sync_tick（冷却 ≥30s，e4a27fa）
              ├─ 子进程：discover / oneline / sync-facts
              ├─ 进程内：overview/tray 的 SQLite 聚合
              └─ app-event 发射：SyncStatusChanged（每 tick）、
                 FactsIngested（每宿主每批）、FoldCompleted、
                 TrustMonitorEvent/Invalidated、WatcherHealthChanged(仅变化时)
                      └─ webview 每页监听器
                            └─ 【缺陷在此】收到事件 → 立即 invoke 重 SQL 全量刷新
```

### 2.2 可观测性现状（事实）

| 项 | 现状 | 证据 |
|---|---|---|
| 日志框架 | **无**（无 tracing/log/os_log/任何 crate） | 全仓 grep 零命中 |
| 生产日志通道 | `eprintln!`/`println!` 共 ~42 处 | GUI 经 `open`/launchd 启动，stderr 落入系统空洞——**生产环境一条也看不到** |
| 文件日志 | **无** | `~/.agent-vitals/` 无 logs 目录 |
| 运行时计数 | 部分：watcher health（coalesced/last_event/last_wake）、outbox 的 `last_error`/`retry_count`（DB 落盘，这点是对的） | 仅经 IPC/SQL 可查，无时间序列 |
| 诊断包（`export_diagnostic_package`） | 版本/配置/源状态快照 | **不含**运行时日志、事件计数、watcher 健康、CPU/资源信息 |
| 结构化 trace（span） | 无 | 本次事故靠 `sample` + 手工去 strip 符号化，耗时 ~2 小时 |

**结论：出问题时，我们在生产机器上几乎是盲的。** 这次能定位，靠的是
macOS 系统工具（`sample`/`ps -M`）+ 临时重建带符号二进制——不可复制到
用户场景。

---

## 3. 业界调研

### 3.1 文件事件风暴的防护（与我们同层的产品）

| 产品/系统 | 做法 | 对我们的启示 |
|---|---|---|
| **Vite dev server**（chokidar） | watcher 可插拔（NoopWatcher）；事件只标脏 ModuleGraph，转换按需（pull）；full-reload 永远在场兜底 | 我们 P2 已抄「失效化」，但 UI 面抄漏了：事件应当**只失效**，不应当触发立即重取 |
| **VS Code 文件监听** | 严格去抖 + 事件在处理期间到达则合并；递归监听有目录数上限与降级 | 「处理期间的到达合并」正是我们缺的：刷新在途时新事件应并入而非叠发 |
| **watchexec / 编译守护** | grace-period 去抖（安静 N 毫秒才动）+ 单飞（上一轮没跑完不启动下一轮） | 单飞我们已有（SyncLock）；grace 去抖我们有（1.2s 窗）；缺的是下游 |
| **Telegraf / node_exporter 等监控代理** | **按固定间隔采样，不做事件驱动**——明知道事件会带来不可控成本 | 我们的周期 tick（5min）就是这类基线；watcher 是加速器。方向正确，但加速器必须带速率预算（我们补了 30s 冷却） |
| **Dropbox 同步引擎** | journal+checkpoint、批量提交、变更合并 | 与 SourceGraph 检查点同型；无新启示 |
| **macOS Spotlight** | 事件驱动索引但系统级预算限流，worker 低优先级 | 「预算限流」思想 = 我们的冷却；「低优先级」我们没有（QoS 可作后续优化） |

### 3.2 UI 数据刷新模式（放大回路的行业解法）

React Query / SWR / RTK Query 已把这套变成事实标准，核心三条：

1. **失效化而非直推（invalidate, don't fetch）**：事件只把对应投影标记为
   stale，**不**立即发请求；
2. **在途去重（in-flight dedup）**：同一 key 的请求在途时，后续触发**合并
   进同一个 promise**，不叠加新请求；
3. **每 key 最小刷新间隔（TTL/min-refetch interval）**：无论事件多密，
   同一投影的取数频率有下限（典型 5-15s）。

对照我们：三条全缺。React 面收到 app-event 直接调 fetch 函数，Settings
一个 else 分支连刷 7 个命令，多页并存相乘——事件率 × 页面数 × 每页命令数
= 无界放大。

### 3.3 桌面应用的可观测性

| 层 | 业界标准 | 我们 |
|---|---|---|
| 结构化日志 | Rust: `tracing` + `tracing-subscriber`（分级、span、字段）；Apple 生态: `os_log`/Unified Logging（`log show` 可查、支持隐私标注） | 无 |
| 日志落盘 | 滚动文件（size/time），固定保留期 | 无 |
| 运行时指标 | 进程内计数器 + 周期快照；桌面常做本地环形缓冲（如 Chromium net-log：环形 + 导出按钮） | 仅 3 组孤立计数 |
| 诊断包 | 崩溃报告 + 近期日志尾 + 指标快照（本地生成、用户主动分享） | 只有配置快照，无运行时数据 |
| 自看护 | 守护进程普遍有资源自监控（CPU/内存超阈值降级或告警） | 无 |

隐私约束下的行业标准做法（与我们 2026-09-19 数据政策完全兼容）：
**本地日志可以含路径与细节（不出机器）；任何导出面（诊断包/复制）做
脱敏投影。** Apple 的 `%{public}`/`%{private}` 标注就是这个纪律。

---

## 4. 架构缺陷判定

| # | 缺陷 | 严重度 | 证据 | 业界对应 |
|---|---|---|---|---|
| **G1** | **事件→UI 是直推全量刷新，无失效化/在途去重/每投影最小间隔**——放大倍数 = 事件率 × 挂载页数 × 每页命令数，无上界 | **高**（本次事故的放大器；冷却只是砍了输入端） | 热栈全是刷新命令的 SQL；SettingsPage else 分支连刷 7 命令 | §3.2 三件套全缺 |
| **G2** | **发射侧无变化去重**：SyncStatusChanged 每 tick 必发（内容可能完全没变）；FactsIngested 每宿主每批发（无变化时也发） | 中 | lib.rs sync_tick 尾部无条件 emit；对照 WatcherHealthChanged 已实现「仅变化时发」——正确模式已存在，未推广 | UI 框架的状态推送普遍带 equality 去重 |
| **G3** | 全链路无统一速率预算：输入端（wake→tick）现在有了 30s 冷却，但 tick→events→pages 无预算 | 中 | G1+G2 的合成表述 | 令牌桶/预算是守护进程标配 |
| **G4** | **无日志系统**：无框架、无落盘、生产 stderr 不可见 | **高**（把 G1-G3 的发现成本从分钟级抬到小时级） | §2.2 全表 | §3.3 |
| **G5** | 无自看护：进程烧 6 核自己不知道，UI 也看不到 | 中 | 事故持续到人工发现 | 守护进程资源自监控 |
| G6 | 采样考古成本高（发布版 strip、无 span） | 低（诊断手段，非缺陷） | 本次需重建符号版定位 | symbol server / debug builds |

**判定「不是缺陷」的部分（避免过度整改）**：outbox 的
last_error/retry_count 落库、watcher 单槽合并 + 冷却、SyncLock 单飞、
WatcherHealthChanged 的变化才发——这些模式正确，问题是**没有推广成
全链路的统一纪律**。

---

## 5. 整改建议（分期，含验收判据）

### P1：日志系统（先做——它是发现其余一切问题的前提）

- `tracing` + `tracing-subscriber`，分层：runtime/desktop 各自初始化；
- **落盘**：`~/.agent-vitals/logs/app.log`（滚动 5×2MB，保留 ~10MB）——
  本地文件允许路径与细节（不出机器）；**导出面（诊断包）做脱敏投影**
  （沿用 2026-09-19 政策的 per-face 纪律）；
- 事件链路打点（info 级）：tick 开始/结束与耗时、每次 emit 的类型与
  目标、watcher wake/冷却命中、子进程 spawn 与退出码；
- 诊断包 v2 增补：日志尾（脱敏后）+ watcher 健康 + 事件计数快照；
- CLI 侧 `RUST_LOG` 走同一 subscriber（dev 用）。
- **验收**：复现一次写入→刷新，`log show`-equivalent（`tail app.log`）
  能看到完整链路时间线；诊断包含上述增补项；默认等级 info 下日志量
  < 1MB/天（空转场景）。

### P2：刷新语义改造（治 G1）

- React 侧引入最小化的 invalidate+schedule 层（不必引 React Query 全家
  桶，但抄它的三件套）：事件 → `invalidate(key)`；每 key 有
  `minRefetchInterval`（建议 10s）与在途去重；页面卸载即停；
- 桌面侧配合：高频事件（FactsIngested/FoldCompleted/SyncStatusChanged）
  的载荷只带「什么变了」，不带全量状态。
- **验收**：1s/次的受控写入 + 全页挂载，稳态 CPU < 15%、每投影 SQL
  频率 ≤ 1/10s；事件风暴单测（合成 1000 事件/秒）不放大到任何 invoke。

### P3：发射侧去重（治 G2，小改动）

- SyncStatusChanged 仅在状态实质变化（ok/stage/message 变更）时发射
  ——照抄 WatcherHealthChanged 发布器的 key-compare 模式；
- FactsIngested 载荷已有增量语义，保留；评估空批不发射。
- **验收**：空转 5 分钟（无变化 tick）不产生任何 app-event。

### P4：自看护（治 G5）

- 健康巡检线程（复用 2s publisher 的骨架）读自身 CPU（`proc_pidinfo`）；
  超 50% 持续 30s → 记 warn 日志 + 自动延长 watcher 冷却（指数退避，
  上限 5min）+ WatcherHealth 增加 `throttled` 原因码；UI 文案如实呈现。
- **验收**：注入式单测（伪造 CPU 读数）触发节流与恢复；真机写入风暴
  下稳态 CPU 有硬顶。

### 明确不做（纪律）

- 不上传任何日志/指标（离线政策红线，2026-09-19）；
- 不为日志引入 tokio/async（std 线程 + 环形缓冲足够，依赖纪律不变）；
- 不做崩溃报告外发；诊断包永远本地生成、用户主动分享。

---

## 6. 与既有 spec 的关系

- HARDENING spec §11.8 已记录本次事故与冷却修复；本文的 P2-P4 落地时
  应在其 §11 追加对应条目（或另立 spec）；
- 事件总线 spec 的「消费者纪律」§6 增补第 6 条：**消费者刷新必须带
  在途去重与最小间隔**（把 P2 的纪律写进总线契约）；
- 诊断包契约 `agent-vitals-diagnostic/v1` → v2（增补项见 P1），走
  reviewed 契约变更流程。

---

**结论重申**：事件总线的**骨干**（outbox、闭集词表、单槽唤醒、冷却、
监督式 watcher）是健康的；缺陷集中在**末端放大**（G1/G2）与**盲飞**
（G4/G5）。P1 立即做，P2/P3 随下个迭代，P4 可缓。
