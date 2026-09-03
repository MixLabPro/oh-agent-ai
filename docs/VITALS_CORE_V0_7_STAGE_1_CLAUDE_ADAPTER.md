# Vitals Core v0.7 —— Stage 1 细化分析：claude ledger adapter emit UsageFact

> 状态：**待审（提案 v0.0.1）**——本文是 `docs/VITALS_CORE_V0_7_ADAPTER_DECISIONS.md`
> 决策 C「Stage 1：claude ledger」启动前的细化分析，**不是代码**。待用户
> 审核拍板后才进 commit。每条改动建议列三选项 + 推荐 + 影响面，与决策
> 文档同款纪律。
>
> 关联：
> - 立项决策：`docs/VITALS_CORE_V0_7_ADAPTER_DECISIONS.md`（commit e88d68a + b1220b3）
> - 契约骨架：`crates/agent-vitals-core/src/usage_fact.rs` +
>   `scripts/agent_vitals/agent/usage_fact.py`（commit b806762）
> - 既有 fold 流水线：`scripts/agent_vitals/agent/claude_cost.py::claude_sync`
> - v0.6.x 热修：归日转正 + 残差哨兵（commit 1ec98af，本 Stage 1 **不动**）

## 0. 范围与不动边界

### 0.1 本 Stage 1 = 机制骨架

按 commit b806762 同款"机制骨架"模式（fact_id 公式 + build_usage_fact +
migrate_chain walker 三件套）——本 Stage 1 给 claude ledger 一个
**emit 机制骨架**：

1. **新增**：`claude_session_to_usage_facts(sessions, machine_namespace)`
   把 `claude-fold.json` 的聚合 session 折平成 UsageFact 列表（**内存**
   emit，**不写盘**）
2. **不新增**：UsageFact 持久化、schema_version 升级、文件级原子写入
3. **不修改**：cost-state baseline 对账锚、tail_days 归日逻辑、残差哨兵、
   `_rebuild_days` 聚合路径（v0.6.x 热修已落地）

### 0.2 决策 C 推荐值的实际落地

决策 C 推荐（a）「每个 assistant row → emit 一个 UsageFact」是**理想**
形态——per-message 粒度。但 v0.6.x 热修后的 `claude-fold.json` 是**聚合后**
的 session dict（`{sid: {baseline, tail_days, sentinels}}`），**原始 row
metadata（message.id、原始 ts、raw usage）已被 `_apply_record` 聚合成
`tail_days[day][model]` 桶**。

直接拿聚合后的 `tail_days` emit → 粒度退化为 per-(day, model)，**与
spec §2.1「一行 = 一个宿主原生 usage observation」有偏差**。

### 0.3 三选项 + 推荐

| 选项 | 粒度 | 改动量 | 与 spec §2.1 一致性 |
|---|---|---|---|
| **(a) 从聚合 tail_days emit，per-(day, model) [推荐]** | 粗 | ~30 行 + 5 测试 | 部分一致：粒度粗于 spec，但仍是诚实聚合（不是伪造消息粒度） |
| (b) 改造 `_apply_record` 保留 raw row metadata，per-message emit | 细 | ~80 行 + 8 测试 | 完全一致：需要 fold.json 增字段、改 schema_version=2、动 v0.6.x 不动边界 |
| (c) 读 JSONL 两次（fold + emit） | 细 | ~50 行 + 6 测试 | 完全一致：性能成本可接受（I/O 一次会话文件读两遍），但语义双源 |

**推荐 (a)**：spec §2.1 是远期目标，骨架阶段允许粒度退化（标注
`identity_basis="derived-hash"` 即可）。Stage 2/3 推进时再统一细化
（如果需要，**可以**让 codex/DSH 直接 per-message，因为 codex/DSH
的 fold 路径里 row metadata 还保留）。

---

## 1. 函数签名与数据流

### 1.1 推荐 (a) 的接口

```python
# scripts/agent_vitals/agent/usage_fact.py（已存在）或新文件
# scripts/agent_vitals/agent/claude_usage_fact.py

def claude_session_to_usage_facts(
    sessions: Dict[str, Dict[str, Any]],
    *,
    machine_namespace: str,
    host: str = "claude-code",
    source_profile: Optional[str] = None,  # 见 §1.4
) -> List[Dict[str, Any]]:
    """claude-fold.json 的聚合 sessions → UsageFact 列表（per-(day, model)）。

    粒度退化（spec §2.1「一行 = 一个宿主原生 usage observation」）：
    每个 UsageFact 对应「一个会话在一天里某个模型的聚合」，不是单个
    message。每条 UsageFact 的 `identity_basis="derived-hash"`、
    `source_event_id = f"{sid}:{day}:{model}"`（合成 id，原始
    message.id 已在 `_apply_record` 阶段聚合时丢失）。

    空 sessions / 无 tail_days → 返回空列表，**不**返回 [None] 或
    抛错。空列表 = 「这个 fold 周期没有任何 usage observation」，
    与 `_rebuild_days` 返回 `(empty, empty, empty)` 同款诚实降级。
    """
```

### 1.2 数据流

```text
claude_sync (existing)
  ├─ claude_project_files → 文件清单
  ├─ _fold_one × N → sessions dict（已聚合，v0.6.x 不动）
  ├─ _rebuild_days → ledger_days + archive + unaccounted
  ├─ write ledger.json + archive.json + fold.json
  │
  └─ 【新增】claude_session_to_usage_facts(sessions, machine_namespace) → List[UsageFact]
       └─ 内存返回，**不写盘**（Stage 1 不引入 schema_version=2 / 持久化）
```

### 1.3 Rust 镜像（同形 + byte-parity 钉测）

```rust
// crates/agent-vitals-core/src/usage_fact.rs（新增 fn）
pub fn claude_session_to_usage_facts(
    sessions: &Map<String, Value>,
    machine_namespace: &str,
    host: Option<&str>,  // default "claude-code"
    source_profile: Option<&str>,
) -> Vec<Value>
```

### 1.4 `source_profile` 从哪来

claude ledger 当前**不存 source_profile**（不像 R2a 有 source_profile 字段）。
三选项：

| 选项 | 描述 | 影响面 |
|---|---|---|
| **(a) 默认 None [推荐]** | `source_profile = None`，UsageFact 里 `source_profile=null` | 不动 fold.json schema；与 R2a 不一致但 UsageFact 接受 None（fact_id 公式里 source_profile 为 null 用空串代替） |
| (b) 从 `claude-fold.json` 顶层字段读 | 给 fold.json 加 `source_profile` 字段 | 改 schema_version=2，触发候选 #4 真实迁移，**Stage 1 不应做** |
| (c) 从 R2a SessionStore 反查 | `session_key(host, sid, machine_namespace)` 查 R2a | 跨模块依赖（fold 阶段不该 import R2a） |

**推荐 (a)**：Stage 1 不引入 schema 变更，`source_profile` 留 None。
spec §2.1 字段表允许 `source_profile` 可空。

---

## 2. fact_id 的精确算法（Python↔Rust 字节相等钉测）

### 2.1 公式（与决策 D 一致）

```text
fact_id(machine_namespace, host, source_profile, native_session_id,
        source_event_id, observation_kind)
  = uf1-{fnv1a_64_hex(
      unit_separator.join([
        machine_namespace,
        host,                                # "claude-code"
        source_profile or "",                # None → 空串
        native_session_id,                   # sessions 的 sid（path.stem）
        source_event_id,                      # f"{sid}:{day}:{model}"（合成）
        observation_kind,                     # "ledger-rollup"（新常量）
      ])
    )}
```

### 2.2 `observation_kind` 三选项

| 选项 | 描述 | 影响面 |
|---|---|---|
| **(a) `"ledger-rollup"` [推荐]** | 明确标记这是从 ledger 聚合层 emit，不是原始 message 事件 | 字符串常量；不与 codex/DSH 撞名 |
| (b) `"message"` | 假装是单 message emit | 撒谎——违反「与 spec §2.1 字段粒度一致」纪律 |
| (c) `"assistant"` | 复用 Claude 原生类型名 | 与 message 事件撞名；下游分不清 |

**推荐 (a)**：明确区分 Stage 1 聚合层 emit 与未来 per-message emit。

### 2.3 `identity_basis` 三选项

| 选项 | 描述 |
|---|---|
| **(a) 恒 `"derived-hash"` [推荐]** | spec §2.1 原文「没有原生 id 时，adapter 才可用 hash fallback，并必须标 identity_basis=derived-hash」——Stage 1 的合成 source_event_id 正是这条规则的应用 |
| (b) 恒 `"native"` | 假装是原生 id | 撒谎 |
| (c) 按 sid 动态判：有 message.id 则 native，否则 derived | Stage 1 拿不到 message.id（全在聚合时被丢了）——不可行 |

**推荐 (a)**：spec §2.1 明文允许，诚实标注。

---

## 3. 错误处理与边界

### 3.1 输入边界

- `sessions = {}` 或 `sessions[sid].tail_days = {}` → 返回空列表（**不**抛）
- `sessions[sid]` 不是 dict → 跳过该 sid，继续下一个
- `sessions[sid].tail_days[day][model]` 缺 4 个 token 字段中的任意一个 → 跳过该 fact，继续下一个（**不抛**——与 `build_usage_fact` 自身的字段校验分开：Stage 1 emit 函数只做聚合层到事实行的映射，缺字段跳过是聚合层语义，不是「emit 失败」）

### 3.2 与 build_usage_fact 的责任划分

- `claude_session_to_usage_facts`：聚合层 → 字段填好（`input_tokens` / `cache_read_input_tokens` / `cache_creation_input_tokens` / `output_tokens`、identity_basis、observation_kind）+ 调用 `build_usage_fact`
- `build_usage_fact`：校验字段合法性（identity 非空、token 非负、hash 覆盖）
- **Stage 1 不重复实现 build_usage_fact 的校验**——那是 b806762 已落地的契约

### 3.3 machine_namespace 缺场

`machine_namespace` 必须由 caller 提供（从 R2a `takeover.machine_namespace()` 读）。
三选项：

| 选项 | 描述 |
|---|---|
| **(a) 必传，缺场 → 抛 ValueError [推荐]** | caller bug 应该早期暴露；spec §2.1 identity 字段不能为空 |
| (b) 缺场 → None → fact_id 公式用空串 | 与 §2.1 「machine_namespace 不能空」不一致 |
| (c) 缺场 → 静默 return [] | 丢失事实——违反 spec §2「事实 cache 可重建」 |

**推荐 (a)**：与 `build_usage_fact` 自身的 identity 校验一致。

### 3.4 与 v0.6.x 热修的兼容性

v0.6.x 把 `tail_days` 从「cost-state 到来就清空」改为「只增不清」。
Stage 1 emit 读 `tail_days` 时——**emit 数 = 聚合后行数，不是原始行数**。

含义：
- Stage 1 emit 不参与残差哨兵（`unaccounted` 那是 cost-state baseline
  对账锚的差额，不是 row 缺漏）
- Stage 1 emit 不知道「这一行是 message 还是 cost-state 残留」——
  tail_days 已经是聚合后产物
- v0.6.x 的归日转正让 `tail_days[day][model]` 反映**真实 ts 归日**，
  Stage 1 emit 出来的 `source_event_id = f"{sid}:{day}:{model}"`
  里 day 就是真实归日——这条路径是诚实的，不是聚合污染

### 3.5 不写盘的纪律

Stage 1 函数返回 `List[Dict]`，**调用方拿到后**：
- `claude_sync` 不消费这个 list（写代码里就当不存在）
- 未来 Stage 5+ 持久化时单独接一个 writer 函数
- 现在唯一的「消费方」是测试（assert fact_id 一致性、assert 数 = 期望）

这避免了在 Stage 1 里把 list 接到 `claude_sync` 写链上、然后忘了拆。

---

## 4. 测试布局（5 测 + Rust inline 镜像）

### 4.1 Python（`tests/test_usage_fact.py` 续 / 新文件 `test_claude_usage_fact.py`）

```python
class ClaudeSessionToUsageFactsCase(unittest.TestCase):
    def test_empty_sessions_returns_empty_list(self):
        """sessions={} → []，与 _rebuild_days 空 dict 同款诚实降级"""
        self.assertEqual(claude_session_to_usage_facts({}, machine_namespace="ns1"), [])

    def test_one_session_one_day_one_model_emits_one_fact(self):
        """单 session 单 day 单 model → 1 个 fact，4 桶 token 正确填入，
        identity_basis="derived-hash", observation_kind="ledger-rollup" """
        sessions = {"s1": {"tail_days": {"2026-09-02": {"deepseek-v4-flash": {
            "input_tokens": 100, "cache_read_input_tokens": 50,
            "cache_creation_input_tokens": 0, "output_tokens": 10}}}}}
        facts = claude_session_to_usage_facts(sessions, machine_namespace="ns1")
        self.assertEqual(len(facts), 1)
        f = facts[0]
        self.assertEqual(f["input_tokens"], 100)
        self.assertEqual(f["cache_read_input_tokens"], 50)
        self.assertEqual(f["cache_creation_input_tokens"], 0)
        self.assertEqual(f["output_tokens"], 10)
        self.assertEqual(f["identity_basis"], "derived-hash")
        self.assertEqual(f["observation_kind"], "ledger-rollup")

    def test_source_event_id_is_synthetic_per_day_model(self):
        """source_event_id = f"{sid}:{day}:{model}"，Stage 1 粒度退化的诚实标注"""
        f = claude_session_to_usage_facts(
            {"s1": {"tail_days": {"2026-09-02": {"m1": _bucket(1)}}}},
            machine_namespace="ns1")[0]
        self.assertEqual(f["source_event_id"], "s1:2026-09-02:m1")

    def test_fact_id_is_stable_across_calls(self):
        """同一输入两次调用 → fact_id 字节相等（FNV-1a 决定性）"""
        sessions = {"s1": {"tail_days": {"2026-09-02": {"m1": _bucket(1)}}}}
        a = claude_session_to_usage_facts(sessions, machine_namespace="ns1")[0]["fact_id"]
        b = claude_session_to_usage_facts(sessions, machine_namespace="ns1")[0]["fact_id"]
        self.assertEqual(a, b)

    def test_missing_machine_namespace_raises(self):
        """machine_namespace=None → ValueError，与 build_usage_fact 校验一致"""
        with self.assertRaises(ValueError):
            claude_session_to_usage_facts({"s1": {"tail_days": {"d": {"m": _bucket(1)}}}},
                                          machine_namespace=None)

    def test_python_rust_byte_equal(self):
        """Python↔Rust：同一 sessions dict → 输出列表逐 fact 字节相等（fact_id
        + 所有 4 桶字段 + identity_basis + observation_kind）。受
        AGENT_VITALS_BIN 守门，与既有 byte-parity 钉测同款。
        """
        ...
```

### 4.2 Rust inline 镜像

`crates/agent-vitals-core/src/usage_fact.rs::tests` 加 6 个 inline 测试，
与 Python 侧 1:1 镜像（含 byte-parity pinned 值）。

### 4.3 与既有测试矩阵的对齐

- `tests/test_usage_fact.py`（b806762 落地）已有 5 测：fact_id / build_usage_fact /
  migrate_chain / USAGE_FACT_FIELDS
- `tests/test_claude_cost.py`（v0.6.x + 6421f2a 落地）已有 21 测：fold 语义 +
  残差哨兵 + 197.5M 真机 fixture + byte-parity diff
- **新增** `tests/test_claude_usage_fact.py` 与 `usage_fact.rs::tests::claude_*`
  互守——**不**侵入既有 `test_claude_cost.py`（那是 fold 语义测试，不是
  emit 测试）

---

## 5. 不动边界复盘（与决策文档 §0 一致）

### 5.1 不动

- `claude_cost.py::_fold_one`、`_apply_record`、`_row_tokens`、`_camel_entry_tokens`、
  `_rebuild_days`、`claude_sync`（fold 流水线本体）
- `claude-fold.json` schema（不写 facts_emit 字段、不升 schema_version）
- `claude-ledger.json` / `claude-ledger-archive.json`（输出层）
- baseline / tail_days / 哨兵 / 残差（v0.6.x 已落地）
- cost-state 处理（modelUsage 累计自报对账锚）

### 5.2 新增

- `scripts/agent_vitals/agent/usage_fact.py::claude_session_to_usage_facts`（新函数）
  或新文件 `claude_usage_fact.py`（与 §5.3 文件归属决策二选一）
- `crates/agent-vitals-core/src/usage_fact.rs::claude_session_to_usage_facts`（Rust 镜像）
- `tests/test_claude_usage_fact.py`（新文件，~6 测）
- `crates/agent-vitals-core/src/usage_fact.rs::tests::claude_*`（5-6 inline 镜像）

### 5.3 文件归属决策

新函数放 `usage_fact.py` 还是新文件 `claude_usage_fact.py`？

| 选项 | 描述 |
|---|---|
| **(a) 放现有 `usage_fact.py` [推荐]** | 同一文件聚集所有 UsageFact 相关函数（fact_id / build_usage_fact / migrate_chain / claude_session_to_usage_facts），Rust 镜像同理放 `usage_fact.rs` |
| (b) 新文件 `claude_usage_fact.py` | 隔离 host-specific emit，未来 Stage 2/3 各加一份（codex_usage_fact.py / dsh_usage_fact.py） |

**推荐 (a)**：host-specific emit 不是逻辑独立的模块（它们共享 build_usage_fact
和 fact_id），放一起减少 import 链。Stage 2/3 新增时**也放同一文件**，
用 `claude_*` / `codex_*` / `dsh_*` 前缀函数名区分。

---

## 6. 与既有纪律的对照

- ✅ **零新持久化**：emit 内存返回，不写盘
- ✅ **零 schema 变更**：claude-fold.json / ledger.json / archive.json schema 不动
- ✅ **Python↔Rust byte-parity**：5 测含 byte-parity 钉测，Rust inline 镜像
- ✅ **不动 v0.6.x 热修**：fold 流水线 / baseline / 残差哨兵全不动
- ✅ **不动 workbuddy 流**：本文件不覆盖
- ✅ **不引新依赖**：core crate 不新增依赖（与决策文档 §6 一致）
- ✅ **诚实粒度退化**：`identity_basis="derived-hash"` 明确标注 source_event_id 是合成的
- ✅ **spec §5 逐项评审**：本文件本身是 Stage 1 启动前的细化评审；拍板后才动代码

---

## 7. 后续 Stage 接口（供 Stage 1 commit 完后再看）

- **Stage 2**：codex static fold emit UsageFact（决策 A mapping：
  `output_tokens + reasoning_output_tokens`）
- **Stage 3**：dsh state chain emit UsageFact（决策 B replay：
  从 `usage_events` 原始流 replay）
- **Stage 4**：UsageFact 持久化（schema_version=2 + 真实持久化调用点）
  ——**不在 v0.7 spec §3「明确仍未开始」清单内**，属候选 #4 真实迁移
- **Stage 5**：file-level atomic write/fsync/fault injection（候选 #4）
  ——同上

---

## 8. 决策汇总（待拍板）

| 子决策 | 推荐 | 拍板值 |
|---|---|---|
| 粒度选择 | (a) per-(day, model) emit | ? |
| `observation_kind` 字符串 | (a) `"ledger-rollup"` | ? |
| `identity_basis` 字符串 | (a) 恒 `"derived-hash"` | ? |
| `machine_namespace` 缺场 | (a) 抛 ValueError | ? |
| `source_profile` 默认 | (a) None | ? |
| 函数归属文件 | (a) 现有 `usage_fact.py` | ? |
| 接入 `claude_sync` 写链 | (a) **不接**（Stage 1 emit 不写盘） | ? |

**用户决策点**：以上 7 项默认值是否拍板？如修改任何一项请直接说
「§8 第 X 行改 (b)」等，本文件即时修订。**拍板后**：

1. 决策拍板 commit（独立 doc-only commit）
2. 启动 Stage 1 代码工作（commit 含 Python + Rust + 测试）

## 9. 工作量估计

- 函数实现：~30 行 Python + ~30 行 Rust
- 测试：~80 行 Python（6 测）+ ~80 行 Rust inline（5-6 测）
- 文档：本文 + 拍板 commit
- 验证：cargo test + clippy + Python unittest + golden_runner（零漂移确认）
