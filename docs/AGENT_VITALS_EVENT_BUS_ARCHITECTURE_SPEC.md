# Agent Vitals Runtime Event Bus Architecture Spec

> 状态：**Draft v1（2026-09-20）**——设计经 2026-09-20 架构评审会话收敛（事件判据、候选盘点、trust 传感器边界、hook 禁区）；
> 前置：v0.9.1 SQL 权威库已冻结（单一事实源 + 幂等重放）；trust P1（`FINDINGS_TRUST_EGRESS_MONITORING_SPEC`）已合入，P2 实时传感器未实施；
> 目标：为 runtime 引入**最小事件驱动层**——事务性 outbox + 单管道类型化事件——收编既有的内联反应链与缓存失效土办法，并为 trust P2 传感器预留唯一接入通道。

---

## 0. 一句话结论

事件总线只做一件事：**把"权威库已前进"这一事实可靠地告诉所有想知道的人**。它不承载写路径编排（tick 流水线保持显式）、不承载 RPC（MCP dispatch 保持请求-响应）、不承载事务（billing 写入保持原地事务）。可靠性住在 SQLite 的 outbox 表里（与状态变更同事务），速度住在进程内 `mpsc` 里（丢了由 tailer 补投）——与既有 `sync_runs` + 幂等重放是同一哲学的延伸，不是第二套机制。

## 1. 不可变决策（实施期间不重开）

1. **事件是事实的过去时陈述**。词表一律过去时命名（`FactsIngested`，不是 `IngestFacts`）；事件不携带指令、不携带期望回报。
2. **outbox 事务性是唯一可靠性来源**。事件必须与它描述的状态变更在**同一 SQLite 事务**内落 `event_outbox` 行；进程内通道只优化延迟，永不承担可靠性。禁止"先写库再发事件"的双写。
3. **单一 UI 出口**。对 webview 只有 `app.emit("app-event", typed_event)` 一个出口；`FOLD_EVENT` / `SYNC_STATUS_EVENT` 收编进该出口，去抖收敛到分发层一份。
4. **旁路面永不上总线**：tick 流水线编排、MCP `tools/call`、CLI 查询子进程、billing 事实写入（golden 逐字节面）、`doctor::diagnose` 纯函数。见 §8。
5. **trust 传感器独立于被审计者**。trust P2 的进程外传感器（FSEvents / fd 采样 / 连接轮询）经 `TrustMonitorEvent` 接入总线；**宿主 agentic-loop hook 永不作为 trust 面信号源**（被审计者控制传感器 = 信任面失守），hook 仅可作为 canonical 面的增强源（§9）。
6. **每条事件带 `schema_version` 与 correlation id**（复用 `ingested_run_id` / `sync_runs.run_id`），事件词表按 authority schema 的兼容纪律演进：只增不删不改语义。
7. **at-least-once 投递，消费者幂等**。补投意味着同一条事件可能到达两次；幂等键 = `(event_id, consumer_id)`，由消费侧维护。

## 2. 现状与动机（代码证据）

| 现状 | 证据 | 事件化后 |
|---|---|---|
| 入库后的反应是内联调用链 | `sync_service.rs:499` 尾部内联 `price_discovery::reconcile_unpriced_models`；配额窗口扫描由 tick 顺序编排 | `FactsIngested` 扇出，消费者各自异步 |
| issue 评估是查询时惰性 | `store.rs::sessions_issues` 注释自认"先刷 legacy evaluator 再读表"——消费者（用户点开 tab）替生产者付计算 | 入库后后台评价，查询面只读 |
| 缓存失效是三套土办法 | `calendarLoadedMonth` 月份比对、`FoldEventDebounce` 去抖、skills 扫描时间戳缓存 | `AuthorityRevisionAdvanced` 统一驱动 |
| UI 事件是裸字符串各自去抖 | `lib.rs:1207/1219` 的 `FOLD_EVENT` / `SYNC_STATUS_EVENT` | 收编单一类型化出口 |
| trust observation 过期无人清理 | `expires_at_ms` 靠查询时惰性过滤，无删除动作 | `DayRolled` 时间事件驱动维护 |
| MCP 访问无审计流 | `data_status` 的查询面无时序数据；agents 查了什么无处可查 | `McpToolInvoked` 审计旁路（fire-and-forget） |

**动机排序**：①消灭"加一个反应就要改一次生产者"的扇出耦合（`FactsIngested` 五消费者）；②缓存失效统一（替换三套土办法）；③为 trust P2 预留唯一接入点，防止届时用裸 `app.emit` 拼装。

## 3. 架构总图

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│  ① 写路径（显式编排，不上总线——顺序与失败语义必须可判定）                          │
│                                                                                 │
│  tick / 手动同步                                                                 │
│    discover ──► oneline fold ──► claude-sync ──► sync-facts ──► plugin_ingest   │
│                                          │                                      │
│                                          ▼                                      │
│                    ┌──────────────────────────────────────┐                     │
│                    │   authority SQLite（唯一事实源）        │                     │
│                    │   usage_facts / workflow_events /      │                    │
│                    │   issue_instances / trust_observations │                     │
│                    │   … + event_outbox（新） ◄─────────────┼─── 同一事务         │
│                    └──────────────────────────────────────┘                     │
│                                          │ 事务提交                              │
│                                          ▼                                      │
│  ┌──────────────────────────── ② 事件总线核心（双通道）────────────────────────┐ │
│  │   快通道：tokio::sync::mpsc<AppEvent>（有界，过载丢低优先级，只管低延迟）      │ │
│  │   慢通道：outbox tailer（读 event_outbox，崩溃后补投，与幂等重放同构）         │ │
│  │                                                                             │ │
│  │   事件词表（过去时，全部带 schema_version + ingested_run_id 作 correlation）   │ │
│  │   ├─ FactsIngested{host, run_id, revision}                                   │ │
│  │   ├─ AuthorityRevisionAdvanced{revision}                                     │ │
│  │   ├─ DeclarationSaved / PriceCardSaved                                        │ │
│  │   ├─ HostSourceFailed{host,error} / SourceRecovered{host}                     │ │
│  │   ├─ McpToolInvoked{tool, args_fingerprint, latency_ms, ok}   ◄── 审计旁路    │ │
│  │   ├─ TrustMonitorEvent{actor, stage, evidence_level}          ◄── P2 传感器   │ │
│  │   └─ HourTicked / DayRolled（statistics_timezone 口径）                       │ │
│  └─────────────────────────────────────────────────────────────────────────────┘ │
│                                          ▼                                      │
│  ┌────────────────────────── ③ 消费者（各自异步反应，互不阻塞）──────────────────┐ │
│  │  派生重算扇出                  缓存失效                    审计流              │ │
│  │  ├─ price reconcile           ├─ webview tab 缓存重验      ├─ MCP 访问日志    │ │
│  │  ├─ 配额窗口扫描               ├─ 托盘标题重算             └─ 慢查询/失败率    │ │
│  │  ├─ 预算状态重估               └─ codex_merged 等进程内缓存                     │ │
│  │  ├─ issue 评估器              通知（去重窗口内）          时间性维护             │ │
│  │  └─ trust correlate           ├─ 预算/配额提醒            ├─ expires_at 清理   │ │
│  │                                └─ trust 报警（§7.2 门槛） └─ 价格快照 stale   │ │
│  └─────────────────────────────────────────────────────────────────────────────┘ │
│                                          ▼                                      │
│                    单一 UI 出口：app.emit("app-event", typed_event)               │
└─────────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────────┐
│  旁路（永不上总线）：MCP dispatch═══RPC═══>直接返回（完成后发审计事件）              │
│                      billing 写入 / golden 面 ── 事务一致性红线                    │
│                      doctor::diagnose 纯函数 ── 确定性 + 差分门                    │
└─────────────────────────────────────────────────────────────────────────────────┘
```

事务边界（outbox 可靠性来源）：

```
   sync_service 事务（既有）                          消费端
  ┌────────────────────────┐
  │ BEGIN IMMEDIATE        │
  │  INSERT usage_facts    │      ┌──────────────┐
  │  INSERT workflow_evts  │      │ dispatcher   │   快通道命中 → ms 级投递
  │  INSERT event_outbox ──┼─────►│ mpsc + tailer│   崩溃/丢件 → tailer 从
  │ COMMIT                 │      └──────────────┘   outbox 补投（幂等键 =
  └────────────────────────┘                          event_id + consumer_id）
```

## 4. 数据契约

### 4.1 `AppEvent` 信封（runtime 层冻结 DTO）

```text
event_id            稳定哈希 ID（幂等键成分）
event_type          §5 词表的闭集值
schema_version      事件契约版本（与 authority schema 演进纪律同款：只增不删）
occurred_at_ms      事实发生时刻（非投递时刻）
correlation_id      可空；来源批次（sync_runs.run_id / IPC 序列）
producer            模块标识（sync_service / mcp::dispatch / trust_monitor / timer）
payload_json        仅枚举值、计数、哈希与时间戳
```

禁止字段：与 `TrustObservation` 同一禁令——原始路径、文件内容、prompt/messages、tool 参数/结果原文、请求体、凭据。审计旁路（`McpToolInvoked`）只带参数**指纹**。

### 4.2 `event_outbox` 表（下一 authority schema 版本追加）

```sql
CREATE TABLE event_outbox (
  event_id        TEXT PRIMARY KEY,
  event_type      TEXT NOT NULL,
  schema_version  INTEGER NOT NULL,
  occurred_at_ms  INTEGER NOT NULL,
  correlation_id  TEXT,
  producer        TEXT NOT NULL,
  payload_json    TEXT NOT NULL,
  ingested_run_id TEXT NOT NULL REFERENCES sync_runs(run_id),
  created_at_ms   INTEGER NOT NULL
);
CREATE INDEX event_outbox_pending ON event_outbox(created_at_ms);
```

配套 `event_deliveries(event_id, consumer_id, delivered_at_ms, PRIMARY KEY(event_id, consumer_id))` 记录消费进度；tailer 按 `created_at_ms` 顺序扫未投递行。**retention**：事件体保留 7 天（与 trust 高频 observation 同窗口）；`event_deliveries` 保留 30 天。`delete_imported_host_data(host)` 级联同步清理 outbox 中该宿主 correlation 的行。

### 4.3 投递语义

- 快通道：`mpsc::channel(1024)` 有界；满时按 `event_type` 优先级丢弃（audit < maintenance < derived < notification），并计数 `dropped_count`（沿 trust 规格 §6.2 的过载纪律）；
- 慢通道：tailer 每 5 秒或进程启动时扫 outbox 补投；
- **不保证顺序跨事件类型**；同类事件按 `occurred_at_ms` 有序。消费者不得假设跨类型顺序。

## 5. 事件词表（首批冻结）

| 事件 | 生产者 | 触发时机 | 首批消费者 |
|---|---|---|---|
| `FactsIngested{host, run_id, revision}` | sync_service / plugin_ingest | 某宿主事实批次事务提交 | price reconcile、配额窗口扫描、issue 评估器、（P2）trust correlate |
| `AuthorityRevisionAdvanced{revision}` | authority 写入面（含 billing 重算完成） | 权威 revision 前进 | webview 缓存重验、托盘重算、进程内缓存失效 |
| `DeclarationSaved{scope}` | 桌面 IPC（计费声明保存） | 声明/修订落库 | billing 重算入队、（预留）影响预览 |
| `PriceCardSaved{provider, model_fingerprint}` | 桌面 IPC（补卡保存） | 价卡落库 | 未计价重算 |
| `HostSourceFailed{host, error_code}` / `SourceRecovered{host}` | sync_service | 源读取失败/恢复 | 通知、MTTR 时序（审计流） |
| `McpToolInvoked{tool, args_fingerprint, latency_ms, ok}` | mcp::dispatch | dispatch 返回后（旁路） | MCP 访问日志、慢查询/失败率 |
| `HourTicked` / `DayRolled` | timer（statistics_timezone 口径） | 时区日界/时界 | expires 清理、通知去重窗口滚动、价格快照 stale 检查 |
| `TrustMonitorEvent{actor_id, stage, evidence_level}` | trust P2 传感器（进程外） | 聚合窗口产出 | trust correlate → Finding、通知（§7.2 门槛） |

新增事件类型必须先在本表登记（与分类图谱"先登记后写 emitter"同纪律）。

## 6. 消费者纪律

1. 消费者**只读权威库 + 各自既有写入面**，不直接回写 `event_outbox`；
2. 幂等：处理前查 `event_deliveries`，处理后登记——重复到达为 no-op；
3. 消费者崩溃不影响投递（tailer 下轮补投），投递失败不阻塞生产者；
4. 派生重算类消费者产出仍走各自的事务写入（如 issue upsert 的既有幂等键），事件层不新增第二种写路径；
5. 通知类消费者实现去重窗口（trust 规格 §7.2：24h 内同 Finding 去重，除非阶段/严重度/证据等级升级）。

## 7. 明确不上总线的面（负面清单）

| 面 | 理由 |
|---|---|
| tick 流水线（discover → fold → claude-sync → facts） | 有顺序与失败语义的 pipeline，编排保持显式（2026-09-05 卡顿事故的排查依赖显式阶段）；事件只挂反应，不挂步骤 |
| MCP `tools/call` | 请求-响应，客户端在等；事件只是完成后的审计旁路 |
| billing 事实写入 / golden 逐字节面 | 事务一致性 + Python/Rust parity 红线，事件化引入双写 |
| `doctor::diagnose` / `report` | 纯函数 + 差分门的价值在确定性 |
| CLI 查询子进程 | stdout + 退出码契约（CI 语义） |

## 8. trust 传感器接入（P2 对接点）

```
FSEvents watcher（宿主根目录写事件，无归属）─┐
fd 表采样（libproc，同 uid，类别化后即丢）───┼─► 聚合窗口(10–60s，削峰) ─► TrustMonitorEvent ─► 总线
连接/字节轮询 ──────────────────────────────┘
```

- 传感器是 `TrustMonitorEvent` 的**唯一**生产者；correlator 与通知是普通消费者；
- 采样缺口写入事件 payload（`sample_interval_ms`），消费者据此知道"未见 ≠ 未发生"的置信边界；
- **宿主 agentic-loop hook 不接**：hook 配置在宿主 settings 内，被审计者可摘除传感器——trust 面的传感器必须住在被审计进程之外。hook 仅可作为 canonical 面（SV601–614）的增强源，带 `collector_id` provenance 与双源指纹去重。该边界同时登记进 `AGENT_EXECUTION_PROBLEM_TAXONOMY.md`。

## 9. 分期

- **P0（基础设施 + 第一个扇出）**：`AppEvent` DTO + `event_outbox`/`event_deliveries` 迁移 + dispatcher（双通道）+ `FactsIngested` 三消费者（price reconcile、配额扫描、issue 评估器）。验收 = 既有内联调用链删除后，行为等价（golden 不变）。
- **P1（缓存统一 + 审计旁路）**：`AuthorityRevisionAdvanced` 收编三套缓存失效；`McpToolInvoked` 落访问日志；`app-event` 单一 UI 出口收编 `FOLD_EVENT`/`SYNC_STATUS_EVENT`。
- **P2（时间事件 + trust 接入）**：timer 事件 + expires 清理；trust P2 传感器接入（本规格是其唯一通道）。
- **P3（可选）**：FSEvents 写事件作为 sync 差量的低延迟触发（指纹差量兜底自愈）。

## 10. 验收标准

1. 事件与状态变更同事务：kill -9 于事务后、投递前，重启后 tailer 补投成功；
2. 同一事件投递两次，所有消费者 no-op（幂等键生效）；
3. 快通道满载丢弃只影响 audit/maintenance 级事件，`dropped_count` 可查；
4. P0 完成后 `sync_service.rs:499` 的内联 reconcile 调用消失，price reconcile 由事件驱动，golden 15/16 全绿（行为等价）；
5. webview 侧只存在 `app-event` 一个 listen 入口；
6. `delete_imported_host_data` 后无悬空 outbox 行；
7. 词表外事件类型在 dispatcher 层被拒绝并计数（闭集校验）。

## 11. 风险与守卫

| 风险 | 守卫 |
|---|---|
| 双写分叉（事件与库不一致） | §1.2 outbox 同事务；代码评审检查项：凡 INSERT 事实处必有同事务 outbox 行 |
| 隐式流难调试 | 事件带 correlation_id；`--build-info` 同款诊断面（`event-outbox status` CLI 子命令） |
| 总线蠕变（万物互联） | §7 负面清单 + 词表闭集 + "新事件先登记"纪律 |
| 消费者拖垮投递 | 有界通道 + 消费者独立任务 + 超时丢弃计数 |
| 与 Python twin 的关系 | 事件层是 Rust-only 的进程内管道，无 Python twin 需求（parity 边界按 AGENTS.md 计费/skills 核心划定） |

---

**关联文档**：`AGENT_VITALS_V0_9_1_SQL_AUTHORITY_MIGRATION_SPEC.md`（权威库哲学）、`FINDINGS_TRUST_EGRESS_MONITORING_SPEC.md` §6.2（P2 传感器的窗口与过载纪律）、`AGENT_EXECUTION_PROBLEM_TAXONOMY.md`（canonical/trust 证据等级分界）。
