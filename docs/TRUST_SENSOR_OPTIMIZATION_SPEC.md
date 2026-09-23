# Trust 传感优化方案

> 状态：**Draft for implementation**（2026-09-23）
> 负责人：runtime、trust、desktop
> 依赖：`CPU_HIGH_LOAD_INVESTIGATION_2026-09-23.md`（归因报告）、
> `FINDINGS_TRUST_EGRESS_MONITORING_SPEC.md` §6.2（传感语义）、
> AGENTS.md 数据保留政策（红acted 观察不出机器）
> 上游：`RUNTIME_TICK_LIGHT_PATH_TARGETED_SYNC_SPEC.md`（watcher 唤醒信号可复用为活动门控）

## 0. Decision summary

关闭实验证实（2026-09-23 02:19–02:23）：trust 传感是稳态 CPU 的最大单一贡献者——
开启时平均 ~120%（每 30s 一次 170–263% 突发），关闭后同等负载场景平均 2.8%。
传感语义（红acted、类型级、opt-in、不出机器）**全部保持**；本方案只改
「什么时候采样、采多宽、怎么关联」，不改「采什么、怎么报」。

三条主线，按 ROI 排序：

1. **活动门控（P0）**：没有 agent 活动就不采样——机器空闲时的传感是纯浪费；
2. **两级采样（P1）**：全量 lsof（50K 行/轮）收窄为「先找候选 PID，再只查候选」；
3. **相关器开窗（P2）**：`correlate_selected` 的全表扫描按时间窗/桶增量收窄。

观测先行原则与 LIGHT-PATH spec 一致：burst 的进程内分解先上子计时，
大头确认后再动结构。

## 1. Baseline（全部真机实测，2026-09-23）

### 1.1 每轮传感的成本构成（30s 周期）

| 步骤 | 实测 | 归属 |
|---|---|---|
| `lsof -n -P -Fpcfn`（全量，无 -i 过滤） | **50,730 行输出 / 0.37–0.58s**（三次 0.58/0.37/0.50） | 子进程 CPU + 父进程管道读取 |
| `parse_lsof_fields`（50K 行字符串解析） | 未单独计时（观测项 §6） | menubar 进程内 |
| `observations_from_samples` + 身份加载 | 微秒–毫秒级（样本量小） | 进程内 |
| `AuthorityDb::open`（含每次 open 的 DDL churn） | 12–22ms（调查报告实测） | 进程内 |
| `with_immediate_txn`：insert + correlate + outbox | 写事务 + WAL + fsync | 进程内 |
| `correlate_selected` | 当前 3 行观察 = 微秒级；**结构为全表扫描**（§4） | 进程内 |
| 每 30s 一轮 × 上述全部 | **稳态突发 170–263%，均值 ~120%** | ps 实测 |

### 1.2 规模现状与悬崖

- `trust_observations` 当前仅 **3 行**（今天短暂开启过）——相关器空转；
- `RETENTION_MS` 保留窗下表会持续增长（30s 一轮 × 每轮 0–N 观察 × 90 天）——
  **每轮全表扫描 + 全量重分组是确定性的规模化悬崖**，现在不痛只是因为没积累。

### 1.3 用户可感知基线

trust 关闭后（同等持续写入负载）：平均 2.8%、轻 tick 1.3–1.7s、无突发。
**传感开启的资源代价需要压到「关不关无感」**，这是本方案的验收口径。

## 2. Problem statement

**P0（空闲浪费）**：传感固定 30s 周期，与机器上有没有 agent 在跑无关。
无会话时 lsof 快照里根本没有候选进程——采样、解析、开库、事务、发射
全部空转，只有观察去重把 inserted 顶在 0。

**P1（采样过宽）**：候选判定只关心「有 git 历史 + 写归档/写索引」的进程，
但采样方式是全系统所有进程的所有 FD。50K 行里与 agent 无关的部分是纯成本。

**P2（相关器全表）**：`correlate_selected` 的 SELECT 无时间条件（仅
`ORDER BY observed_at_ms`），把全部历史观察载入内存重新分组 incident，
再按传入的新观察 ID 过滤——**过滤发生在加载之后**。观察表增长后每轮
成本线性涨。

**P3（burst 未分解）**：170–263% 的进程内构成（管道读取/解析/事务/checkpoint
占比）没有子计时，结构优化前无法证明打到了大头。

## 3. Goals / Non-goals

### Goals

1. 空闲（无 agent 会话活动）时传感 CPU 为零：不 spawn lsof、不开库、不发事件。
2. 活跃时单轮传感的 menubar 进程内成本 <100ms（当前 burst 秒级）。
3. 相关器成本与**新增观察数**挂钩，不与历史总量挂钩。
4. 传感语义逐字节不变：观察字段、dedup 键、issue 指纹、Findings 面、
   事件载荷全部不动（golden/契约零变化）。
5. opt-in 模型不变；设置面增加资源预期说明。

### Non-goals

- 不改证据等级/红action 规则（AGENTS.md 政策面）；
- 不做内核级监控（EndpointSecurity 等需要授权面的路线）；
- 不把传感改成常驻 FSEvents 消费者（那是 FINDINGS spec P3 的 watch-only 面，
  与本传感的进程/FD 语义不同层）；
- 不改 Findings/Trust 的判定与展示。

## 4. 设计

### 4.1 P0 — 活动门控（先做，收益最大）

**信号已存在**：watcher 的唤醒槽（LIGHT-PATH §5.1）天然携带「哪个宿主刚有
写入」。传感循环增加一个共享的「宿主最近活动时刻表」（进程内存，
`Mutex<BTreeMap<HostId, Instant>>`，watcher 派发时刷新）。

```
传感 tick 到点：
  候选宿主集 = 活动时刻在 cooldown 窗（如 120s）内的宿主
  if 候选集为空 && 距上次非空采样 < 空闲确认窗（如 10 分钟）:
      跳过本轮（不 lsof、不开库、不发事件）
  else:
      执行既有 snapshot_and_store（逐字节不变）
```

- 空闲确认窗兜底「活动表漏记」（如 app 重启后表为空）：每隔 10 分钟
  强制采样一轮校准，防止把「没有信号」误当「没有活动」；
- 手动触发（Findings 页的立即快照）不走门控，永远执行；
- 门控决策记 `log_info`（跳过轮静默，执行轮照旧）。

**预期**：用户不开 agent 时传感归零——本方案最大的单项收益。

### 4.2 P1 — 两级采样（收窄 lsof）

当前：`lsof -n -P -Fpcfn`（全系统全 FD，50K 行）。

两级：

1. **候选发现**：`libproc` 的 `proc_listallpids` + `proc_pidinfo`（PID、
   可执行名、启动时间）——微秒级，零子进程。按可执行名/路径白名单
   （claude、codex、node/python 等 agent 运行时）筛出候选 PID 集；
   白名单存 runtime 常量，新增宿主时随解析器注册表一起维护。
2. **定向采样**：对候选 PID 集跑 `lsof -n -P -Fpcfn -p pid1,pid2,...`
   ——输出量从 50K 行降到与 agent 进程数成正比（典型 <2K 行）。

- 候选发现是纯 `libc` 调用（仓库已有 `libc` 依赖，无新依赖）；非 macOS
  平台保持现有「unavailable」降级；
- 候选集为空时直接短路（与 P0 门控协同）；
- **诚实边界**：白名单漏掉的进程会不被采样——这是能力声明的一部分，
  capability 串从 `macos_lsof_partial` 改为 `macos_targeted_partial`，
  在报告与 Findings 面如实展示（不假装覆盖不变）。

**预期**：单轮 lsof 成本从 ~0.5s/50K 行降到 <50ms/<2K 行。

### 4.3 P2 — 相关器开窗

`correlate_selected` 两处收窄（不改输出）：

1. **SQL 开窗**：SELECT 加时间下界（`observed_at_ms >= now - 关联窗`，
   关联窗 = incident 分组所需的最大跨度 + 缓冲，从 `incidents()` 的
   分桶键推导，常量化）；已关闭且早于窗口的 incident 不再参与重算——
   它们的 issue 已落库，重算结果幂等。
2. **按桶增量**：新观察的 `(machine, host, actor, bucket)` 先在进程内算出
   涉及的桶集合，SQL 只取这些桶的历史行（等值/IN 条件），不再全表
   载入后过滤。

- 幂等性测试钉住：同一批新观察，「全量重算」与「开窗增量」产出的
  findings_upserted / notification_candidates 完全一致（对拍测试，
  fixture 覆盖跨窗边界 incident）。

### 4.4 P3 — 子计时（与 P0 同批落地）

`snapshot_and_store` 内分段计时进日志（与 `66db5c3` 同款手法）：
`lsof_spawn / lsof_parse / open / txn_insert / correlate / emit` 六段。
burst 分解有了数据面，P1/P2 的效果验证与后续回归都有基线。

## 5. 实施分期

| 期 | 内容 | 改动量 | 验收 |
|---|---|---|---|
| **A** | P0 门控 + P3 子计时 | ~100 行 | 空闲 30 分钟传感 CPU=0、零 lsof spawn；执行轮六段计时可见 |
| **B** | P1 两级采样 | ~200 行（libproc 发现 + 定向 lsof + 白名单） | 活跃期单轮进程内 <100ms；capability 更名与展示同步 |
| **C** | P2 相关器开窗 | ~150 行 | 对拍测试全绿；观察表 10 万行 fixture 下开窗轮 <50ms |

每期独立可回滚（门控布尔、采样开关、开窗开关各一个）。

## 6. 测试矩阵

| 领域 | 测试 | 期望 |
|---|---|---|
| 门控 | 活动表空 + 空闲确认窗内 | 不采样（lsof 不被调用，用注入式 spied 计数） |
| 门控 | 活动表刚刷新 | 立即恢复采样 |
| 门控 | 空闲确认窗到期 | 强制校准轮执行 |
| 白名单 | libproc 发现注入假 PID 表 | 候选集正确；空集短路 |
| 定向采样 | `lsof -p` 参数拼接 | 仅候选 PID；候选为空不 spawn |
| 相关器 | 全量 vs 开窗对拍 | findings/通知计数逐字段相等 |
| 相关器 | 跨窗边界 incident fixture | 开窗不丢跨窗关联 |
| 语义 | 采样→观察→issue 全链 fixture | 输出与现状逐字节一致（capability 串除外） |
| 回归 | golden 双世界 + Python | 零变化 |

## 7. 隐私与诚实边界复查（AGENTS.md 政策）

- 观察仍是类型级、红acted、只落本机权威库——本方案零新增外发面；
- capability 串随覆盖变化如实更名（`macos_lsof_partial` →
  `macos_targeted_partial`），Findings 面措辞同步——**不静默缩小覆盖**；
- 白名单本身不含用户数据，进代码常量不进任何存储。

## 8. 发布决策

- 期 A 可独立发布（空闲归零是用户可直接感知的改善）；
- 期 B 发布前在 Findings 设置文案中说明定向采样的覆盖边界；
- 期 C 随下一个常规迭代合入。
