# Runtime Evidence 收敛 Spec —— 让实现追上 §10

> 状态：spec（待评审）。配套：`ARCHITECTURE.md` §10（结构）、
> `RUNTIME_EVIDENCE_CONTRACT.md` §17（P1–P6 阶段记录）。本文是 §17 之后
> 的第二轮落地：**不再是加新宿主适配器，而是把已有的 DSH + Codex 两条路径
> 真正接到 `CanonicalSession` 上，兑现 §10.2「L2 是唯一收口」和 §10.5
> 「wasm 边界上移」两条当时只画、没做的承诺。**

---

## 0. 现状纠正（写 spec 前先对齐事实）

`ARCHITECTURE.md` §10 头还写着 `状态：设计，未实施` —— **这句已经过时**。
§17 的阶段记录显示：

| 阶段 | 内容 | 状态 |
|---|---|---|
| P1 | `evidence.rs` 类型层（`CanonicalSession`/`Signal`/`Coverage`/`RuleSpec`）+ §12 无宿主标识测试 | ✅ 已落地 |
| P2 | `dsh_evidence.rs`（`build_dsh_evidence` + 临时桥 `reverse_project`） | ✅ 已落地 |
| P3 | 规则 declare `requires` + coverage 注解（五组全过） | ✅ 已落地，**但 `reverse_project` 保留未删**（见下） |
| P4 | `codex_evidence.rs` / `codex_session.rs`（两种不兼容形态吸进共享类型层） | ✅ 已落地 |
| P4.5 | `RolloutItem` schema-drift sentinel | ❌ 未做 |
| P5/P6 | Claude Code / WorkBuddy 适配器 | ❌ 未做（本文不碰） |

**P3 末尾那条 note 是本文的根因**：

> 「detector 们仍消费 `reverse_project` 重建的原始事件，**不直接迭代
> `CanonicalSession`/`Signal` 数据**……改写 detector 内部被判定为
> *对单宿主（DSH）系统而言不成比例*，故 `reverse_project` 保留未删。」

这句话在只有 DSH 一个宿主时成立。**现在 Codex 已经是第二宿主**，且它的 cost
fold 已经写进 core（`codex_usage.rs`）却进不了 wasm、上不了审计 tab——正是
「单宿主」这个前提失效的信号。本文要做的三件事，就是把当时「不成比例」的事，
在第二宿主出现后变成「成比例」：

1. **统一时间轴**：`BEIJING_OFFSET` 与「UTC→北京」各写了两份（DSH 用 epoch 毫秒、
   Codex 用 ISO 串），本应是一套。
2. **DSH 词表清退到 L1**：core 里仍有 55 处硬编码 `"tool/call"`/`"approval/asked"`，
   散布 9 个模块。§10.2 白纸黑字「L3 以上不许出现宿主词表」。
3. **wasm 边界上移**：wasm 面 11 个函数全是 DSH、全吃原始事件
   （`audit_events(events, ws)`），Codex 折叠一个没导出。§10.5 要求
   `audit_session(canonical)`。

---

## 1. 三阶段（依赖序，不可乱）

```
阶段 A：统一时间轴 timeaxis          ← 纯抽取，无行为变化，独立可 ship
   │
阶段 B：DSH 词表清退 + 删除 reverse_project  ← 大改，golden corpus 是唯一等价证明
   │
阶段 C：wasm 边界上移 + 审计 tab 多宿主化    ← 依赖 B，解锁 codex 上同一引擎
```

**依赖关系**：C 需要规则读 `Signal`（B 的产物）才能接 `audit_session(canonical)`；
A 独立，但 A 先做能消掉 B/C 改动里会重复撞上的时区重复。

---

## 2. 阶段 A —— 统一时间轴 `timeaxis`

### 目标
把「北京时间轴」收成一模块，DSH 与 Codex 折叠都调它，删掉两处重复。

### 现状（已核实）
- `crates/agent-vitals-core/src/usage.rs:72` `BEIJING_OFFSET_SECS: i64 = 8*3600` +
  `beijing_hour(time_ms)` + `hour_buckets`（输入 epoch 毫秒）
- `crates/agent-vitals-core/src/codex_usage.rs:151` `BEIJING_OFFSET_HOURS: i64 = 8` +
  `codex_hour_of(event)`（输入 ISO 串）
- `days_from_civil`/`civil_date_from_days`（Hinnant）已在 `usage.rs`，且
  `codex_usage.rs` 已 `super::usage::` 引用——时间轴收敛已走了一半。

### 改动
- 新 `crates/agent-vitals-core/src/timeaxis.rs`（`pub mod timeaxis;` 挂进 `lib.rs`）：
  - `pub const BEIJING_OFFSET_HOURS: i64 = 8;`（单一常量，删掉上面两个）
  - `pub fn beijing_hour_key_from_epoch_ms(ms: i64) -> Option<(String /*date*/, i32 /*hour*/)>`
  - `pub fn beijing_hour_key_from_iso(ts: &str) -> Option<String /*YYYY-MM-DDTHH*/>`
  - `pub fn hour_key_to_date(hour_key: &str) -> &str`（`YYYY-MM-DDTHH` → 前 10 位）
  - `pub fn hour_to_date_model(hours: &Value) -> Value`（小时→日聚合，供守恒断言）
  - 内部用现有 `days_from_civil`/`civil_date_from_days`，**不引 chrono**（同
    `usage.rs` 既有注释的「无第三方供应链」理由）。
- `usage.rs` / `codex_usage.rs` 改为调 `timeaxis`，各自的 `BEIJING_OFFSET_*` 与
  `beijing_hour`/`codex_hour_of` 的日期算术删掉。
- Python 镜像 `scripts/agent_vitals/timeaxis.py`，`usage.py`/`codex_usage.py` 改调。

### 验收
- `cargo test` 全绿；`cargo clippy -D warnings` 干净。
- Python 全量 + `AGENT_VITALS_BIN=<rust> python3 -m unittest tests.test_cli_matrix`
  逐字节一致（`usage` 与 `codex-cost` 两条都跑）。
- **行为零变化**：`behavior --json` / `codex-cost --json` 与改动前逐字节 diff
  为 IDENTICAL。goldens 15/15。
- 新增 characterization 钉住：同一时刻的 epoch 毫秒与 ISO 串，经
  `timeaxis` 折出的北京小时键**精确相等**（这是两套实现合并后唯一的等价性风险点）。

### 回滚
纯抽取，`git revert` 即回。无 wasm / dsh-client 重拷（不碰行为）。

---

## 3. 阶段 B —— DSH 词表清退 + 删除 `reverse_project`

### 目标
core 规则不再直接读宿主事件，改读 `Signal` 数据；删掉 `reverse_project` 临时桥，
兑现 §10.2「L2 是唯一收口，L3 以上不许出现宿主词表」。

### 现状（已核实）
55 处硬编码 DSH 词表，散布 9 个模块：
`behavior.rs` / `compaction.rs` / `duration.rs` / `dsh_evidence.rs` /
`subagent.rs` / `trajectory.rs` / `skill.rs` / `waste.rs` / `util.rs`。

典型：
- `subagent.rs:65` `e.get("type") == "tool/call"`
- `trajectory.rs:397` `e.get("type") == "approval/asked"`

这些 detector 目前吃的是 `reverse_project`（`dsh_evidence.rs:197`）从
`CanonicalSession` 反投影回原始事件流的形状。

### 改动（这是三阶段里最重、风险最高的一步，必须分 PR、每 PR 一个规则族）

沿用 P3 的「一个规则族一个 PR」节奏，但这次**真的改 detector 内部**（P3 只做了
additive 的 coverage 注解，没动 detector）：

1. **先定义 detector 的新输入契约**：一个规则族的 detector 从
   `fn detect(&[Value]) -> Vec<Finding>`（原始事件）改成
   `fn detect(&CanonicalSession) -> Vec<Finding>`（Signal 数据）。`CanonicalSession`
   里 `signals: SignalSet` + `coverage: Coverage` 已经有「哪些信号存在」，
   但**没有逐事件的 payload**——而 `SkillInvocations`/`SubagentSpawns` 这类
   detector 需要读到具体的 `data.name`/`callId`。所以这一步会暴露一个当前
   `CanonicalSession` **缺的东西：Signal 的逐事件明细（`Timeline<Observed<T>>`）**。

   ⚠️ 这是本阶段真正的设计决策点，不是机械搬移：`evidence.rs` 的
   `CanonicalSession.signals` 现在是 `SignalSet`（只答「有没有」），而 detector
   要「有哪些、每个长什么样」。**方案是扩 `CanonicalSession` 挂
   `Timeline<Observed<T>>`（§10.2 图里本来就画了 `Signal → Timeline<Observed<T>>`，
   只是 P1 落地时没实装这个字段）**，还是保留一个宿主无关的「规范化事件」
   中间层让 detector 读——两者择一，先在这份 spec 评审时定，不拍脑袋。

2. **按族清退**，顺序（沿用 P3 已验证的顺序）：
   ① command/path（SV601–610）② cost fold ③ duration ④ trajectory ⑤
   skill/subagent/compaction/waste。
   每族：detector 改读 Signal 数据 → 删该族在 `reverse_project` 里的对应段 →
   golden 不变。

3. **`reverse_project` 的删除是最后一步**：五族全清退完、golden 全绿后，
   删 `reverse_project` 本身 + 它的单测。

### 验收（比 P3 更硬，因为动了 detector 内部）
- **byte-identical `behavior --json`**，三种证明（P2 同款）：
  `cargo test`、`AGENT_VITALS_BIN=<rust> python3 -m unittest tests.test_cli_matrix`
  （Python↔Rust 差分）、手动 `fixtures/dsh/behavior.jsonl` before/after diff。
- **§10.4 三态落地为可观测**：`RuleOutcome` 从「additive 注解」变成「detector
  真按 `requires ⊆ coverage` 决定跑不跑」。Claude Code/Codex 语料喂进去，
  审批类规则必须报 `Unavailable`，**绝不允许安静报 `[]`**——这条要有专门测试
  （§17.1 的 anti-fabrication assertion，从「应有」变「实装」）。
- §12 测试 `shared_type_layer_has_no_host_identifiers_in_code` 全程绿（扩
  `CanonicalSession` 时尤其不能把宿主字段塞进共享层）。

### 风险 & 回滚
- golden corpus **只讲 DSH**，等价性只能靠 DSH 证——所以每族一个 PR、每 PR 三证，
  任一证红即回退该 PR。
- 扩 `CanonicalSession` 若违反 §12（把 DSH 的 `data.toolName` 之类塞进共享层），
  §12 测试会红——这是**护栏，不是障碍**，红了说明方案错了。

---

## 4. 阶段 C —— wasm 边界上移 + 审计 tab 多宿主化

### 目标
wasm 从「吃原始 DSH 事件」升到「吃 `CanonicalSession`」；codex 能进同一套
规则引擎 + 同一个审计 tab 骨架。

### 改动
1. **wasm 新面**（`crates/agent-vitals-wasm/src/lib.rs`）：
   - `audit_session(canonical_json) -> String`：输入 `CanonicalSession`（不是事件流），
     跑 §10.4 的三态裁决。**旧 `audit_events(events, ws)` 保留为兼容别名**，
     内部改成「`dsh_evidence::build_dsh_evidence` → `audit_session`」，让
     dsh-client 现有投影无感过渡（字段只增不删不改语义）。
   - `codex_usage(canonical_or_fold_json) -> String`：导出 codex 折叠，供
     codex 侧投影用。**顺带把 P4.5 的 schema-drift sentinel 补上**（§14.4）。
2. **审计 tab 外壳多宿主化**（`dsh-client/`）：
   - `timeline.ts` 的 `TimelineRow`/`EventKind` 从 DSH 4 桶 / DSH 事件泛化成
     host-neutral（token 向量字段 + `host` 维度；`EventKind` 去掉 DSH 专属的
     `compaction`/`subagent`/`skill`，改成宿主各自声明支持的事件 kind）。
   - i18n 的 label 集拆成「骨架 key」+「每宿主 label 集」。
   - host 侧投影：现有 DSH 投影不动；新增 codex 投影集
     （`codexFindings`/`codexTokenByModel`/`codexCostReport`），折 rollout →
     wasm → 计价（USD）。**只做 token + 时间线 + 成本，行为 findings 诚实显示
     「无行为审计」**（codex 暂无行为规则，见 §10.4 三态，不伪造）。
3. **CLI**：`codex-cost`/`codex-evidence` 已存在，无需新子命令；补一个
   `codex behavior` 类入口（可选，用于验证 codex 喂同一引擎诚实报 Unavailable）。

### 验收
- wasm 重建 + 重拷 `dsh-client/`；`dsh-client` 全量 `npm test`（含
  `verify-host.mjs`）绿——证明 DSH 走新面行为不变。
- codex 语料喂 `audit_session`：审批/沙箱类规则报 `Unavailable`（不是 `[]`）。
- 新 codex 投影在真实 rollout 上 byte-identical Python↔Rust（`test_cli_matrix`）。
- `TimelineRow` 泛化后，DSH 的 `eventsIn === eventsOut` 与「缺数据留缺口」两条
  timeline 不变量测试仍绿。

### 风险 & 回滚
- wasm 面改动波及 dsh-client，回滚 = revert + 重拷旧 wasm。旧 `audit_events`
  保留别名使回滚只需重拷 wasm，不动投影代码。

---

## 5. 必须守住的不变量（三阶段全程）

1. **§12**：共享类型层（`evidence.rs` 及其新增字段）不许出现宿主名
   （`shared_type_layer_has_no_host_identifiers_in_code`）。
2. **golden 只讲 DSH**：任何改动以 `behavior --json` / goldens 逐字节不变为
   等价证明；等价性无法用 codex 语料自证。
3. **三态 > 安静零**：拿不到的格子报 `Unavailable{missing[], reason}`，
   绝不 `[]`/`0`。anti-fabrication 有专门测试，不靠 review。
4. **窄进宽出，绝不静默漏算**：残差哨兵（`unaccounted`/`unreported_fields`）
   与 permissive 过滤器仍分层，不被 B/C 的收口破坏。
5. **字段只增不删不改语义**：wasm 面的 `audit_events` 旧签名保留为别名，不是
   直接改签名让 dsh-client 崩。

---

## 6. 明确不做（本文范围外）

- **P5 Claude Code / P6 WorkBuddy 适配器**：那是「加宿主」，本文是「让已有宿主
  真用上 CanonicalSession」。两者正交，P5/P6 会**受益于** B 的收口（新宿主进来
  不用再造一套原始事件接口），但不在本文做。
- **跨宿主「总花费」一个数**：¥ vs USD 不可加，汇率换算仍不做（`cli.py:713`）。
- **codex 的行为规则（SV 码）**：B/C 只让 codex 能**诚实报 Unavailable**，
  不给 codex 发明 DSH 那套 SV601–614 的行为规则。codex 该有自己的规则是另一个
  需求。
- **timeaxis 之外的折叠统一**：DSH 4 桶 vs Codex 5 桶的桶宽、计价维度**保持分叉**
  （`ARCHITECTURE.md` §8.2「Bucket sets are per host」），本文只统一时间轴，不统一桶宽。

---

## 7. 里程碑与排期建议

| 阶段 | 规模 | 风险 | 独立可 ship |
|---|---|---|---|
| A timeaxis | 小（1 新模块 + 2 处改调） | 低（纯抽取） | ✅ |
| B 清退词表 | 大（9 模块、55 处、5 族 PR） | 高（动 detector 内部） | ❌ 需分 PR |
| C wasm + 审计 tab | 中（wasm 新面 + 投影 + TimelineRow 泛化） | 中（波及 dsh-client） | 依赖 B |

建议：A 先做（快、独立、消重复）→ 评审 B 的「detector 新输入契约」设计决策
（第 3 节 ⚠️ 那个 `Timeline<Observed<T>>` vs 规范化事件中间层的二选一）→ 再按
族落地 B → 最后 C。
