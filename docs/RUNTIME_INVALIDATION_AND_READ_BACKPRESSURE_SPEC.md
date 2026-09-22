# Runtime 失效信号与读侧背压 Spec

> 状态：**Draft v1.0（2026-09-22）**——由 `EVENT_PROCESSING_AND_OBSERVABILITY_REVIEW.md`
> 的 G1/G2/G7/G8/G9 触发；落地事件总线 spec §9 P1 一直未做的
> `AuthorityRevisionAdvanced` 收编，并把「事件→UI 放大」的治理从 React 侧移到 runtime 核心。
> 前置：事件总线 spec v1.5（outbox + Dispatcher 两段式 drain 已落地）；HARDENING spec
> §11.8（watcher 冷却 `e4a27fa` 已落地）；authority `SCHEMA_VERSION = 25`。
> 关联：`AGENT_VITALS_EVENT_BUS_ARCHITECTURE_SPEC.md`（本文是其 §5 `AuthorityRevisionAdvanced`
> 行与 §6 消费者纪律的实施修订）、`EVENT_SYSTEM_ARCHITECTURE_ANALYSIS.md`、
> `RUNTIME_REFACTOR_WATCHER_HOTPLUG_HARDENING_SPEC.md`。

---

## 0. 一句话结论

**领域事件与失效信号是两种东西，runtime 核心必须用类型把它们分开。** `FactsIngested`
是边沿触发的领域事件（每宿主每批一条、at-least-once、给 price reconcile / 配额扫描 /
issue 评估器）；展示层需要的是电平触发的失效信号（幂等、latest-wins、一千次变更与一次
变更的处理结果相同）。今天 `desktop-ui` 消费者把前者逐条透传给 webview，放大倍数等于批次
数。本 spec 做四件事：① 权威库 revision 标量；② 词表分类 + 消费者兴趣集，dispatcher 拒绝
把领域事件投给展示层消费者；③ 合并型消费者原语，一轮 drain 至多发一次失效信号；④ 读侧
revision 键控 memo + 只读打开 + 有界读闸门，让放大即使发生也不烧核。前三件把「事件数」这个
因子压到 1；第四件与 UI 纪律无关，保护托盘、MCP、CLI 三方。

---

## 1. 不可变决策（实施期间不重开）

1. **失效信号是派生投影，不是事实行。** `AuthorityRevisionAdvanced` 不逐次落 outbox（那又变回
   N 行 N 次）；它由 drain 末尾读 revision 标量派生，进程内比较后才发。outbox 只装事实的过去
   时陈述（事件总线 spec §1.1），失效信号不是事实。
2. **合并发生在副作用上，不发生在投递上。** outbox 的 at-least-once 与 `(event_id, consumer_id)`
   幂等键一字不动；合并型消费者的 deliveries 仍逐事件记账。dispatcher 永不丢事件。
3. **revision 由一个共享的提交 helper 维护。** 权威库的业务写事务有两类入口：
   `AuthorityDb::with_immediate_txn`（76 个调用点，`authority.rs:3966`）与四个手写
   `BEGIN IMMEDIATE` 的 billing 写路径（`billing_declaration_revision_save` / `_revoke` /
   `billing_apply_active_declarations` / `billing_recalculation_run`）。两类都改为经
   `commit_advancing_revision(conn)` 提交（§4.1），回滚不加。**允许绕过的站点是闭集**：
   schema 迁移块、`repair_issue_timestamp_units`（一次性修复）、`export.rs` 的只读快照事务
   ——由守卫测试逐一枚举（§10）。不用 SQLite trigger（跨表 trigger 维护成本与 schema 演进
   纪律冲突）。
4. **展示层消费者不读领域事件载荷。** 词表带类别，消费者带角色与兴趣集，dispatcher 按兴趣
   过滤；`Presentation` 角色只能以合并型消费者身份参与 drain（fold 只读 `host` 字段），声明
   任何 `Domain` 类型兴趣由构造期与守卫测试双重拒绝（与 `dependency_budget.rs` 同纪律：边界
   靠测试而不靠评审）。
5. **不引入时间去抖。** 时间去抖不确定、不可测；revision 比较是确定的。现有 `FoldEventDebounce`
   200ms 窗随 `FoldCompleted` 退役一并删除（§6）。
6. **读侧缓存键含 revision，永不给陈旧数据。** 与 `codex_merged_cached` 的 60s 时间 memo 不同：
   revision 前进即失效，同 revision 命中返回 `Arc`，锁内不深拷贝（2026-09-05 tab 卡顿事故的
   教训）。
7. **依赖纪律不变。** 本 spec 全部落在 `agent-vitals-data` / `agent-vitals-runtime` / desktop 三层，
   `domain/` 与 `contracts/` 不碰；不引入 tokio、不引入新 crate。

---

## 2. 现状与缺陷（代码证据）

| 缺陷 | 证据 | 本 spec 对应 |
|---|---|---|
| `desktop-ui` 消费者逐事件转发 outbox 行给 webview | `lib.rs:1216` `EventConsumer::new("desktop-ui", \|event\| app.emit(...))` | §4.3 合并型消费者 |
| 每个消费者扫全表，无兴趣过滤 | `events.rs::drain` 反连接 SQL 无 `event_type` 条件 | §4.2 兴趣集 |
| `AuthorityRevisionAdvanced` 在词表里但无生产者 | `events.rs:29` 登记；全仓无 `facts_ingested` 同款构造器 | §4.1 revision 标量 + §4.4 派生发射 |
| `FactsIngested` 载荷缺 spec §5 声明的 `revision` 字段 | `events.rs:104` 只有 run_id + 三计数 | §4.1 补字段 |
| webview 端把载荷剥成只剩 `type` | `ui-dev/react/src/lib/tauri.ts::safeAppEvent` | §6 UI DTO |
| 「变了才发」模式只在 WatcherHealth 一处 | `lib.rs:1459` 手写 `HealthKey` 元组比较；`SyncStatusChanged` 每 tick 必发（`lib.rs:1284`） | §4.5 `ChangePublisher` |
| 每个读命令新开连接 + DDL + 修复扫描 | `query/summary.rs:2182 open_db()` 9 处 → `AuthorityDb::open` 跑 `ensure_schema` + `repair_issue_timestamp_units`（`authority.rs:1365-1368`） | §5.2 只读打开 |
| 阻塞 SQLite 直接跑在 tokio worker | `#[tauri::command(async)]` 同步函数体在 `respond_async_serialized` 的 future 内执行（tauri-macros `body_async`） | §5.3 读闸门 |
| 无 revision 键控读缓存 | 仅 `codex_merged_cached` 时间 memo | §5.1 读 memo |

---

## 3. 架构总图

```
写入面（sync-facts 子进程 / 桌面 IPC / trust 传感）
  └─ AuthorityDb::with_immediate_txn ──▶ 业务写 + insert_outbox(Domain 事件)
                                        + schema_meta.authority_revision += 1   ← §4.1
                                                │
tick 尾部 drain_event_bus                        ▼
  └─ Dispatcher::drain(conn)
        ├─ 领域消费者（price-reconcile / quota / issue-evaluator）
        │     兴趣 = Domain 类，逐事件处理，逐事件记账                  ← §4.2
        └─ 展示消费者 desktop-ui（CoalescingConsumer）
              fold: 收集 hosts 集合（逐事件记账不变）
              flush: revision = db.revision()
                     ChangePublisher<Invalidation>.publish_if_changed  ← §4.3–4.5
                            │ 至多一次 / drain
                            ▼
                 app-event { type: "Invalidated", revision, hosts }
                            │
webview 页面：比 revision → 决定是否拉                                 ← §6
                            │
IPC 读命令 ─▶ ReadGate(permit) ─▶ spawn_blocking ─▶ SqlSummaryRepository
                                                     ├─ memo (key, revision, params) → Arc<Value>   ← §5.1
                                                     └─ open_readonly 连接                            ← §5.2
```

---

## 4. 核心层契约

### 4.1 权威 revision 标量（`agent-vitals-data`，schema v26）

- `schema_meta` 新增行 `('authority_revision', '<u64>')`；迁移 v25→v26 插入初值 `0`，
  幂等（`INSERT OR IGNORE`）。
- 新增私有 helper `commit_advancing_revision(conn: &Connection) -> rusqlite::Result<()>`：
  执行 `UPDATE schema_meta SET value = CAST(value AS INTEGER) + 1 WHERE key = 'authority_revision'`
  后 `COMMIT`。`with_immediate_txn` 的 `Ok` 分支与四个手写 billing 写路径的 `COMMIT` 语句全部
  替换为调用它；回滚路径不经过它。**只读事务不走这些入口**，读不会推进 revision。
- **空事务不推进**：是否推进由 `Connection::total_changes()` 在事务前后的差值判定——无增量
  则不 bump、直接 COMMIT。否则 REVIEW G2 的「无变化 tick 零发射」在核心层就落不下来。测试
  钉住：`with_immediate_txn(|_| Ok(()))` 后 revision 不变。
- **记账写不算状态变更**：`begin_run` / `finish_run` / `record_delivery` 都是自动提交单语句，
  不经上述 helper，天然不推进——这是现状，写进 spec 是为了防止将来有人把它们「规范化」进
  `with_immediate_txn`。唯一的例外在 `sql_sync.rs:636`：**全重复重放**当前仍在事实事务内落一
  行 `FactsIngested`（注释明写是故意的，「消费者幂等、计数如实进 payload」），这一行会让
  `total_changes` 非零、revision 被推进、无变化 tick 照样发失效。本 spec **推翻该决策**：
  `inserted == 0 && rejected == 0` 时不落 outbox 行（与上方空批短路同款），注释与事件总线
  spec §1.2 同 PR 改写；领域消费者失去的只是「重放发生过」这条通知，而它们本来就对此 no-op。
- 新增 `AuthorityDb::revision(&self) -> Result<u64, AuthorityError>`，单语句读；`open_readonly`
  连接同样可读。
- `AppEvent::facts_ingested` 增加 `revision: u64` 参数，进 payload（补齐事件总线 spec §5
  声明的 `FactsIngested{host, run_id, revision}`）。生产者在同一事务内先读 revision 再 +1
  会引入顺序依赖，故 payload 携带的是**本事务提交后**的值 = 读到的当前值 + 1；测试钉住
  「payload.revision == 提交后 db.revision()」。
- 跨进程语义：CLI `sync-facts` 子进程与桌面 tick 走同一入口，revision 在库内，桌面 drain
  时读到的就是子进程提交后的值。MCP serve 进程可轮询同一标量做自己的缓存失效（§5.1 的 memo
  对它同样可用）。

### 4.2 词表分类与消费者兴趣集（`agent-vitals-runtime::events`）

```rust
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum EventClass { Domain, Audit }

/// 闭集词表：类型 + 类别。`Invalidation` 不在此表——它不是 outbox 行（§1.1）。
pub const EVENT_TYPES: &[(&str, EventClass)] = &[
    ("FactsIngested",            EventClass::Domain),
    ("AuthorityRevisionAdvanced", EventClass::Domain), // 保留位：见 §4.4 注
    ("DeclarationSaved",         EventClass::Domain),
    ("PriceCardSaved",           EventClass::Domain),
    ("HostSourceFailed",         EventClass::Domain),
    ("SourceRecovered",          EventClass::Domain),
    ("McpToolInvoked",           EventClass::Audit),
    ("TrustMonitorEvent",        EventClass::Domain),
    ("HourTicked",               EventClass::Domain),
    ("DayRolled",                EventClass::Domain),
];

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum ConsumerRole { Domain, Presentation, Audit }

pub struct ConsumerInterest {
    pub role: ConsumerRole,
    /// 订阅的事件类型闭集子集；空 = 该角色允许的全部类别。
    pub types: &'static [&'static str],
}
```

- `EventConsumer` 增加 `interest: ConsumerInterest`；`Dispatcher::drain` 的反连接 SQL 增加
  `AND o.event_type IN (…)`（按兴趣展开，空集按角色允许类别展开）。
- **角色约束**（构造期 + 守卫测试双重）：`Presentation` 角色的 `types` 只允许为空且类别解析为
  空集——即展示消费者**不消费任何 outbox 行的载荷**，它只以合并型消费者身份参与 drain 以拿到
  「本轮有事发生 + 哪些宿主」（§4.3）。`Domain` 角色可订阅 `Domain` 类；`Audit` 角色可订阅
  `Audit` 类。
- 守卫测试 `presentation_consumer_cannot_subscribe_domain_events`：以 `Presentation` 角色构造
  含 `"FactsIngested"` 兴趣的消费者 → `Dispatcher::new` 返回 `Err(RoleViolation)`。
- 兼容：现有三个领域消费者显式声明兴趣（price-reconcile: `FactsIngested`, `PriceCardSaved`；
  quota: `FactsIngested`；issue-evaluator: `FactsIngested`, `TrustMonitorEvent`）。不声明的消费者
  编译不过（字段必填，无 Default）。

### 4.3 合并型消费者（`CoalescingConsumer`）

```rust
pub struct CoalescingConsumer<S> {
    pub consumer_id: &'static str,
    pub interest: ConsumerInterest,
    /// 逐事件调用；只累积，不产生副作用。返回 Err 视作该事件投递失败（记账 last_error，
    /// 与普通消费者同语义）。
    pub fold: Box<dyn Fn(&mut S, &AppEvent) -> Result<(), String> + Send + Sync>,
    /// 每轮 drain 结束调用**一次**（本轮该消费者有 ≥1 条事件 fold 成功时）。
    pub flush: Box<dyn Fn(S) + Send + Sync>,
}
```

- `Dispatcher` 内部把 `EventConsumer` 与 `CoalescingConsumer` 统一为 `enum ConsumerKind`；drain
  对合并型：物化 → 逐行 fold → 逐行 `record_delivery`（成功/失败与普通消费者同）→ 循环结束
  `flush(state)`。**flush 不在 record_delivery 之前**：崩溃于 flush 前，事件已记账、失效信号
  丢失——这是可接受的，因为失效信号是电平语义，下一轮 drain 的 flush 或页面挂载时的主动拉都会
  重新对齐（§6）。反过来（先 flush 后记账）会在崩溃时重复投递领域事件，不可接受。
- `DispatchReport` 增加 `flushed: usize`（本轮 flush 次数，测试与诊断面用）。
- `desktop-ui` 消费者改为 `CoalescingConsumer<BTreeSet<String>>`：fold 收集 `event.host`；
  flush 见 §4.4。它的 `interest` 为 `Presentation` 角色、空类型集——drain 的 SQL 对它按
  「所有 Domain 类」展开（它需要看到行才能收集 hosts），但 fold 闭包**只读 `host` 字段**，
  载荷不透传。守卫测试 `presentation_fold_never_forwards_payload`：用含敏感占位 payload 的合成
  事件驱动 drain，断言 app-event 发射体中不含该占位。

### 4.4 失效信号的派生与发射

```rust
#[derive(Clone, PartialEq, Eq, Debug)]
pub struct Invalidation {
    pub revision: u64,
    /// 本轮 drain 触及的宿主（闭集词表 claude-code/codex/dsh/workbuddy）；空 = 全局。
    pub hosts: BTreeSet<String>,
}
```

- flush 流程：`revision = db.revision()`（自持只读连接，spec §6 消费者自持资源纪律）→
  `Invalidation { revision, hosts }` → `ChangePublisher::publish_if_advanced`（§4.5）。
- **电平比较**：进程内保存 `last_published: Option<u64>`；仅当 `revision > last_published`
  才发射。同一轮 drain 无论 fold 了多少事件，至多一次；revision 未前进的 tick 零发射
  （REVIEW P3 的验收「空转 5 分钟不产生 app-event」在此实现，不需要 SyncStatus 逐字段比较）。
- **顺序注记**：drain 时读到的 revision 可能超前于本轮 fold 的事件（另一写者刚提交）。对失效
  信号安全（latest-wins，多失效无害）；对领域消费者无影响（它们仍逐条处理）。写进 spec 的
  原因：将来有人想用 `Invalidation.hosts` 做精确差量时会踩到——`hosts` 是「至少这些」，不是
  「恰好这些」。
- **`AuthorityRevisionAdvanced` 词表行的处置**：保留为 outbox 词表的保留位（与 `HourTicked` 同
  待遇，事件总线 spec §5 备注同款措辞），**不发射**。理由：它若逐次落 outbox 就违反 §1.1；
  它若不落 outbox 就不是该词表的成员。UI 面的类型名为 `Invalidated`（过去时，事件总线 spec
  §1.1），登记进 §5 表的「直发 UI 的 app-event 类型」组。
- 重启语义：`last_published` 只在内存，重启后首轮 drain 必发一次——幂等无害，且正好覆盖
  「webview 未就绪时 emit 是空操作」的丢失窗口（`lib.rs:1189` 注释）。

### 4.5 `ChangePublisher<T>`（runtime 通用原语）

```rust
pub struct ChangePublisher<T: PartialEq + Clone> {
    last: Mutex<Option<T>>,
}
impl<T: PartialEq + Clone> ChangePublisher<T> {
    /// 与上次发布值不同才调 `emit`；返回是否发布。锁内只比较与替换，emit 在锁外。
    pub fn publish_if_changed(&self, next: T, emit: impl FnOnce(&T)) -> bool;
}
impl ChangePublisher<Invalidation> {
    /// revision 严格前进才发（`>` 而非 `!=`）。
    pub fn publish_if_advanced(&self, next: Invalidation, emit: impl FnOnce(&Invalidation)) -> bool;
}
```

- 从 `lib.rs:1459` 的 WatcherHealth 发布器抽出（`HealthKey` 元组即 `T`）；`SyncStatusChanged`
  改为 `ChangePublisher<(bool, String, String)>`（ok/stage/message）；`Invalidation` 用
  `publish_if_advanced`。三处共用，REVIEW G2 收口。
- **`SyncStatusChanged` 首发陷阱**：`lib.rs:1281` 注释「首次扫描即使没有新增 facts 也要让工作
  台结束『正在整理』」——依赖每 tick 必发。改为变了才发后，这个需求由页面挂载时主动
  `readSyncStatus` 满足（所有页面已在 mount 时拉一次），注释同 PR 改写；`ChangePublisher`
  在进程启动时 `last = None`，首轮必发，覆盖「窗口先开、tick 后到」的情形。

---

## 5. 读侧背压（与 UI 纪律无关的硬保护）

### 5.1 revision 键控读 memo（`agent-vitals-runtime::query`）

```rust
pub struct ReadMemo {
    inner: Mutex<HashMap<MemoKey, (u64 /*revision*/, Arc<Value>)>>,
}
pub struct MemoKey { pub query: &'static str, pub params: String /*canonical_json*/ }

impl ReadMemo {
    /// revision 相同则返回缓存 Arc；否则在锁外计算，写回时若 revision 已前进则不写入。
    pub fn get_or_compute(&self, key: MemoKey, revision: u64,
                          compute: impl FnOnce() -> Value) -> Arc<Value>;
}
```

- 进程级单例（`OnceLock`），按 `data_home` 键控（多库并存的测试场景）。
- **接入点**：`SqlSummaryRepository` 的重查询——首批 `calendar_month`、`monthly_summary`、
  `daily_summary`、`hourly_distribution`、`day_freshness`、`claude_provider_amounts`、
  `billing_declarations`（REVIEW §1 热栈全部命中）。每个接入点先 `db.revision()`（一条
  单语句读）再 `get_or_compute`。
- `params` 必须含影响结果的全部输入：月份/日期、`statistics_timezone`、计费视图参数。缺一项就
  是跨参数串缓存，测试 `memo_key_covers_all_inputs` 用参数化查询逐参数变异断言 miss。
- **锁纪律**：锁内只做 HashMap 查/插，`compute` 在锁外；命中返回 `Arc`，调用方序列化时不再深
  拷贝 Map（沿用 `codex_merged_cached` 已修的教训）。并发 miss 允许重复计算（写回时 revision
  校验保证不写陈旧值），不引入 per-key 条件变量——简单优先。
- 容量：LRU 上限 64 项，超限按插入序淘汰；单项 `Value` 大小不设上限（月历一份几十 KB）。
- 与 `codex_merged_cached`（时间 memo）的关系：codex 面的数据源是 rollout 文件 fold 而非权威
  库，revision 对它无意义，保留时间 memo；两者并存，各自的键空间不相交。

### 5.2 读路径只读打开与连接复用

- `SqlSummaryRepository::open_db` 拆为 `open_db_rw`（现有语义，仅写入面用）与 `open_db_ro`
  （`AuthorityDb::open_readonly`，`authority.rs:1381`，不跑 DDL、不跑修复扫描、不取 WAL 写锁）。
  9 处 `open_db()` 调用点按语义分流；读命令全部走 ro。
- `open_readonly` 在库缺席时返回 `database_missing`，读命令按现有「首装未同步」空态渲染，
  不建库（与 MCP serve 同纪律）。
- `repair_issue_timestamp_units` 只保留在 `open`（写入口）——它本来就是一次性迁移修复，跟着
  读命令跑是历史遗留。
- 连接复用不在本 spec 范围：只读连接的 open 成本在去掉 DDL 与修复扫描后 < 1ms，先测再决定。

### 5.3 有界读闸门与阻塞执行（desktop 层，runtime 提供原语）

```rust
pub struct ReadGate { permits: std::sync::Semaphore-equivalent（Mutex<usize> + Condvar，无 tokio） }
impl ReadGate {
    pub fn acquire(&self) -> ReadPermit;           // 阻塞
    pub fn try_acquire(&self) -> Option<ReadPermit>;
}
```

- 常量 `HEAVY_READ_PERMITS = 2`（真机 8 核；两路并发足够让工作台四命令并发不串行，又把
  最坏情况钉在 2 核）。
- desktop 的重读命令改为 `#[tauri::command] async fn` + `tauri::async_runtime::spawn_blocking`
  包裹同步体，进入 blocking 线程后先 `gate.acquire()`。tokio worker 只等 JoinHandle，不再被
  SQLite 钉死；update check、价目拉取、`session_trace` 不再饿死。
- MCP serve 的 `tools/call` 复用同一 `ReadGate`（进程各自实例）。
- 健康面：`ReadGate` 暴露 `waiting: usize` 与 `held: usize` 计数，进 `watcher_health` 同款
  健康 DTO（REVIEW P4 的「自看护」在此有了可读信号，不必读 CPU）。

---

## 6. UI 面配套（最小改动）

- `app-event` 新类型 `Invalidated { revision: u64, hosts: string[] }`，登记进事件总线 spec §5
  「直发 UI」组；`safeAppEvent` 的白名单解析它的两个字段（revision 限幅 u53，hosts 按宿主
  闭集过滤），其余类型仍只透 `type`。
- `FoldCompleted` 退役：它的语义（「有新折账」）被 `Invalidated` 完全覆盖；`FoldEventDebounce`
  同删。`SyncStatusChanged` 保留（它是 UI 状态，不是数据失效）。
- 页面最小纪律（不引入 React Query）：每个订阅者保存 `seenRevision`；收到 `Invalidated` 且
  `revision > seenRevision` 才拉；拉完更新。App 壳层、Usage、Sessions、Findings、Settings 主
  effect 五处改法相同。**即使页面一行不改**，§4 已把每 tick 的 UI 事件从「≈2 + 宿主数」压到
  1，§5 把重复拉的成本压到 memo 命中。
- 事件类型过滤：`SettingsPage` 主 effect 与 `UsagePage`/`SessionsPage` 只对 `Invalidated`
  与 `SourceDataDeleted` 刷新，`WatcherHealthChanged`/`TrustMonitor*` 交给已按类型过滤的局部
  订阅者（`CustomSourceSection`、`TrustPage`）。

---

## 7. 明确不做

| 不做 | 理由 |
|---|---|
| dispatcher 内时间去抖 | §1.5；确定性优先 |
| dispatcher 丢事件 / 按类型优先级丢弃 | outbox 是账务契约；事件总线 spec §4.3 的 mpsc 丢弃条款只针对进程内快通道，P0/P1 形态下该通道尚不存在 |
| `Invalidation.hosts` 做精确差量刷新 | §4.4 顺序注记：hosts 是下界不是精确集 |
| 把 FactsIngested 改成 UI 友好形状 | 领域事件形状是消费者契约；补 `revision` 字段即止 |
| revision 走 SQLite trigger | §1.3 |
| 引入 tokio Semaphore / React Query | 依赖纪律；std 原语与 20 行 hook 足够 |
| 读连接池 | §5.2 先测 open 成本再议 |

---

## 8. 分期

- **P0（revision 标量 + 词表分类）**：schema v26 迁移；`with_immediate_txn` bump；
  `AuthorityDb::revision`；`FactsIngested.revision`；`EventClass`/`ConsumerRole`/兴趣集 +
  drain SQL 过滤 + 守卫测试。验收：现有 events.rs 全部测试绿 + 新增 5 条（§9.1-9.5）；
  golden 15 条不变（outbox 行不进 golden 面，但 `sync-facts` 的 stdout 契约要复核）；§9.15-9.17。
- **P1（合并型消费者 + Invalidated 发射 + ChangePublisher）**：`CoalescingConsumer`；
  `desktop-ui` 改写；`Invalidated` app-event；`SyncStatusChanged`/`WatcherHealthChanged` 迁到
  `ChangePublisher`；`FoldCompleted` 与 `FoldEventDebounce` 退役；React 五处 `seenRevision`。
  验收：§9.6-9.9；真机 1s/次受控写入 + Settings 页挂载，每 tick UI 事件数 ≤ 2
  （`Invalidated` + 可能的 `SyncStatusChanged`）。
- **P2（读侧背压）**：`ReadMemo` 接入七个重查询；`open_db_ro` 分流；`ReadGate` +
  `spawn_blocking`。验收：§9.10-9.13；真机同压测下稳态 CPU < 15%、tokio worker 无 SQLite 栈帧
  （`sample` 验证一次，之后靠 `ReadGate` 计数）。
- **P3（可选）**：MCP serve 轮询 revision 接 `ReadMemo`；诊断包 v2 带 `ReadGate`/memo 命中率
  快照（与 REVIEW P1 日志系统合并做）。

---

## 9. 验收标准（核心层可钉死的测试）

| # | 测试 | 断言 |
|---|---|---|
| 9.1 | `with_immediate_txn` 提交 | revision 恰 +1；回滚不变；只读事务不变 |
| 9.2 | `FactsIngested.payload.revision` | 等于提交后 `db.revision()` |
| 9.3 | `Presentation` 角色订阅 `"FactsIngested"` | `Dispatcher::new` 返回 `RoleViolation` |
| 9.4 | 兴趣集过滤 | 只订阅 `PriceCardSaved` 的消费者对 `FactsIngested` 行零投递、零记账 |
| 9.5 | 迁移 v25→v26 幂等 | 两次迁移 revision 仍为 0，不重复插行 |
| 9.6 | 合成 1000 条 FactsIngested 一轮 drain | `flushed == 1`，deliveries 1000 行，`Invalidation.hosts` = 合成宿主集 |
| 9.7 | revision 未前进的连续两轮 drain | 第二轮 `publish_if_advanced` 返回 false，零 emit |
| 9.8 | fold 中途一条返回 Err | 该行记 last_error，其余记成功，flush 仍恰一次 |
| 9.9 | `presentation_fold_never_forwards_payload` | 敏感占位不出现在 emit 体 |
| 9.10 | 同 revision 连拉 100 次 `calendar_month` | SQL 执行计数 1（注入计数器） |
| 9.11 | revision 前进后再拉 | miss 一次并返回新值；旧 Arc 不被就地修改 |
| 9.12 | `memo_key_covers_all_inputs` | 逐参数变异各产生一次 miss |
| 9.13 | `ReadGate` 3 路并发 acquire（permits=2） | 第三路阻塞直到一路释放；`waiting` 计数 1 |
| 9.14 | `open_db_ro` 在库缺席 | 返回 `database_missing`，不建文件 |
| 9.15 | 同一批事实重放两次 | 第二次 revision 不变、outbox 无新行、`sync_runs` 照记 |
| 9.16 | 四个 billing 写路径各提交一次 | revision 各 +1（它们不经 `with_immediate_txn`，单独钉） |
| 9.17 | `begin_immediate_sites_are_enumerated` | 见 §10 |

---

## 10. 风险与守卫

| 风险 | 守卫 |
|---|---|
| revision bump 漏掉某条手写 `BEGIN IMMEDIATE` 的写路径 | 守卫测试 `begin_immediate_sites_are_enumerated`：grep `agent-vitals-data/src` 与 `agent-vitals-runtime/src` 非测试代码中的 `BEGIN IMMEDIATE` 字面量，命中集合必须等于闭集清单（`with_immediate_txn`、四个 billing 写路径、迁移块、`repair_issue_timestamp_units`）；新增站点要么改走 `with_immediate_txn`，要么同 PR 进清单并说明为何不推进 revision。`unchecked_transaction`（`export.rs` 只读快照）另列只读清单 |
| 全重复重放仍推进 revision | §4.1 推翻 `sql_sync.rs:636` 的「全重复也发」决策；测试 9.15 |
| 展示消费者被人改回逐事件 emit | §4.2 角色约束 + §9.3/9.9 守卫 |
| `Invalidated` 丢失（webview 未就绪） | 电平语义：页面挂载主动拉 + 重启首轮必发 + 5 分钟周期 tick |
| memo 跨参数串缓存 | §9.12 |
| memo 返回陈旧值 | 键含 revision；写回校验 revision 未前进 |
| `open_db_ro` 分流错把写路径改成只读 | rusqlite 在只读连接上写会报 `ReadOnly`，现有写入面测试立刻红 |
| `spawn_blocking` 改写漏掉某个重命令 | `sample` 一次性验证 + `ReadGate.held` 在压测下 ≤ permits |
| 与事件总线 spec 的措辞冲突（§5 `AuthorityRevisionAdvanced` 行、§6 消费者纪律） | 本 spec 落地 PR 同改该 spec：§5 该行标「保留位，见 INVALIDATION spec §4.4」；§6 增第 6 条「展示层消费者只经合并型消费者拿失效信号，不读领域事件载荷」 |
