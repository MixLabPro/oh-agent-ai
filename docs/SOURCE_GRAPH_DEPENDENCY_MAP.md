# SourceGraph + Events 依赖关系图

> 状态：**P0 实施后快照（2026-09-21）**——基于 `feat/source-graph` 分支 fa14c67..b63a8c5 的 12 个提交。
> 本文回答两个问题：**这些文件的依赖关系是什么？如果有新的事件要接入，如何遵守契约？**

---

## 一、依赖关系图

### 模块级依赖（箭头 = 依赖方向）

```
                    lib.rs
                      |
      +-------+-------+-------+-------+
      v       v       v       v       v
   core/  events.rs  source_graph.rs  billing/  ingest/  query/  trust/  sources/
              |              |                    |
              |              | (advance,          |
              |              |  classify,          |
              |              |  mark_dirty,       |
              |              |  read_checkpoint,  |
              |              |  dirty_set,        |
              |              |  path_hash,        |
              |              |  SourceCheckpointOverride)
              |              |
              +----- F5 -----+
              sync_service --> events::insert_outbox
              sync_service --> source_graph::{classify,read_checkpoint,mark_dirty,path_hash}
              sql_sync ------ source_graph::{path_hash,advance_checkpoint,SourceCheckpointOverride,FULL_PARSE_V0}
              sql_sync ------ events::{insert_outbox, AppEvent::facts_ingested}
              trust --------- events::{insert_outbox, AppEvent::trust_monitor_event}
              plugin_ingest - source_graph::{path_hash,advance_checkpoint,SourceCheckpointOverride}
```

### 文件级依赖明细

| 文件 | 依赖 | 被依赖 |
|---|---|---|
| `core/home.rs` | 无 | 所有（通过 `data_home()` 解析路径） |
| `core/clock.rs` | 无 | billing/ingest/query（时间口径） |
| `core/state.rs` | core/home | takeover、budget |
| `core/takeover.rs` | core/home、core/state | ingest/sync_service |
| `core/statistics_timezone.rs` | 无 | billing、query、trust |
| `core/retention.rs` | 无 | ingest/sync_service（retention months） |
| `events.rs` | core/clock（now_ms）、ingest/sql_sync（now_ms） | sql_sync（FactsIngested 发射）、trust_runtime_monitor（TrustMonitorEvent 发射）、apps/cli/mcp.rs（McpToolInvoked 发射）、apps/desktop/lib.rs（drain_event_bus） |
| `source_graph.rs` | 无（纯函数 + rusqlite） | sql_sync（advance_checkpoint）、sync_service（classify/read_checkpoint/mark_dirty/dirty_set/path_hash）、plugin_ingest（path_hash/advance_checkpoint） |
| `ingest/sql_sync.rs` | events（insert_outbox/AppEvent）、source_graph（path_hash/advance_checkpoint/FULL_PARSE_V0/SourceCheckpointOverride） | 无（叶子写入） |
| `ingest/sync_service.rs` | events、source_graph、sql_sync、core/* | 无（叶子编排） |
| `trust/trust_runtime_monitor.rs` | events（TrustMonitorEvent 发射）、data/trust（insert_observations）、data/trust_correlator（correlate_selected） | 无（叶子传感） |
| `apps/cli/src/mcp.rs` | events（McpToolInvoked 发射）、data/authority（open/begin_run） | 无（叶子传输） |
| `apps/desktop/lib.rs` | events（drain_event_bus 消费） | 无（叶子 UI） |

### 依赖纪律（不可变决策的推导）

```
core/*        <- 无依赖（叶子原语）
events.rs     <- 依赖 core/clock、ingest/sql_sync（now_ms 复用）
source_graph.rs <- 无依赖（纯函数 + rusqlite 参数传入）
ingest/sql_sync <- events（发事件）、source_graph（推检查点）
trust/*       <- events（发事件）、source_graph（不依赖）
query/*       <- 无直接依赖（读权威库）
billing/      <- core/*（时间/retention）
```

**关键不变量**：`events.rs` 和 `source_graph.rs` 都是**叶子**（不依赖任何领域目录）——这就是它们能被所有领域安全调用的原因。任何新模块如果需要往 outbox 发事件或推检查点，只 import `events.rs` 或 `source_graph.rs`，不 import 领域模块。

---

## 二、新事件接入契约

### 接入流程（五步）

#### 第 1 步：词表登记

在 `crates/agent-vitals-runtime/src/events.rs` 的 `EVENT_TYPES` 数组追加新类型。

#### 第 2 步：构造器

在 `impl AppEvent` 里加构造器方法。

#### 第 3 步：发射

在**持有状态变更事务**的调用方里调 `insert_outbox(conn, &event, &run_id)`。

#### 第 4 步：消费者注册（可选）

在 `Dispatcher::new` 的消费者列表里追加 `EventConsumer::new("id", handler)`。

#### 第 5 步：spec 登记

在架构 spec §5 词表表追加一行。

### 接入的禁止事项

| 禁止 | 理由 |
|---|---|
| 不在 `SourceParser` trait 实现里直接调 `insert_outbox` | 解析器只产出 facts+offset；事件发射是调度器（写事务内）的职责 |
| 不绕过 `insert_outbox` 直接写 `event_outbox` 表 | 绕过词表校验和 event_id 生成 |
| 不在同一文件里定义 >1 个 `SourceParser` 实现 | 一个解析器一个文件、一个 impl 块 |
| 不在 `source_graph.rs` 里 `use crate::events` | source_graph 是叶子（不依赖任何领域模块）——它只提供 classify/checkpoint/dirty_set |

---

## 三、事件类型生命周期

```
          +---------------------------------------------------+
          |         词表登记 -> 构造器 -> 发射 -> 投递            |
          |              |                                     |
          |    +---------+-----------+                         |
          |    v                     v                         |
          |  已发射（outbox 行）    已投递（deliveries 行）       |
          |    |                     |                         |
          |    | 成功                | 失败                     |
          |    v                     v                         |
          |  已投递 <--- 重试（指数退避，最多 3 次）             |
          |              |                                     |
          |              | 穷尽（retry_count >= MAX_RETRIES）   |
          |              v                                     |
          |         永久死信（next_retry_at_ms = NULL）         |
          |              |                                     |
          |              | 保留期到期                           |
          |              v                                     |
          |         retention 清理                              |
          +---------------------------------------------------+
```

---

## 四、当前已实现 vs 待实现的事件类型

| 事件类型 | 构造器 | 发射点 | 消费者 | 端到端测试 |
|---|---|---|---|---|
| FactsIngested | 是 | sql_sync.rs 事务内 | price-reconcile + desktop-ui | 差分门 + 端到端 |
| McpToolInvoked | 是 | mcp.rs serve 传输层 | 审计旁路 | 端到端 |
| TrustMonitorEvent | 是 | trust_runtime_monitor 事务内 | desktop-ui | 端到端 |
| AuthorityRevisionAdvanced | 词表占位 | 未实现 | 未实现 | - |
| DeclarationSaved | 词表占位 | 未实现 | 未实现 | - |
| PriceCardSaved | 词表占位 | 未实现 | 未实现 | - |
| HostSourceFailed | 词表占位 | 未实现 | 未实现 | - |
| SourceRecovered | 词表占位 | 未实现 | 未实现 | - |
| HourTicked | 词表占位 | 未实现 | 未实现 | - |
| DayRolled | 词表占位 | 未实现 | 未实现 | - |

**7 个词表占位类型的接入前提**：
- AuthorityRevisionAdvanced：需要 authority revision 计数器暴露（当前 revision 在 schema_meta）
- DeclarationSaved / PriceCardSaved：桌面 IPC handler 里调 insert_outbox
- HostSourceFailed / SourceRecovered：sync_service 的源错误/恢复分支
- HourTicked / DayRolled：需要独立 timer 线程（与 tick 分离——tick 是 pipeline 不是 timer）
