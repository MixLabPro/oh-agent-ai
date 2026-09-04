# v0.8 Phase C —— 代码调研（搬迁前置）

> 状态：调研 v1（2026-09-04）
> 目的：Phase C = 抽出 `agent-vitals-domain` crate。搬迁前先把 `domain → host`
> 依赖债务的**真实形状**摸清——arch spec §11「拆 `usage.rs` 188KB / `cost.rs`
> 99KB」把两件事混为一谈，本调研拆开。
> 基准：`docs/cost-attribution-and-hour-axis-spec` @ `a034394`（Phase A+B1 已合并）

---

## 0. 结论（TL;DR）

**Phase C 的阻塞性工作量远小于 arch spec 的估计。** 真实的 `domain → host` 生产耦合
是 **6 个点、约 370 行**，分 3 组，每组都是「移动 + 改 import」级别，不是「重写折叠」：

| 组 | 耦合点 | 迁往 | 行数 | 风险 |
|---|---|---|---|---|
| **C1** | `Coords`（struct+impl）、`tool_invocation`（fn）——`domain/{compaction,trajectory,waste}` 用 | `contracts/`（共享时间线/事件原语，本就不是 DSH wire） | ~100 | 极低 |
| **C2** | `match_behavior` / `match_trajectory` 两个 raw-events shim（`domain/{behavior,trajectory}`，唯一调用方是 **wasm**）| `agent-vitals-adapters/hosts/dsh/sessions/audit.rs` | ~30 | 低（需重建 wasm + 重拷 `dsh-client/`） |
| **C3** | canonical 归一层（`canonical_tokens` / `canonical_total_delta` / `CANONICAL_DIMS` / `SHAPE_*`，`domain/usage.rs:1523–1795`）——调 `codex_fold_file` / `total_signature`。**生产代码零调用点**，只有 `test_canonical_cost.py` + `usage.rs` 的 `#[cfg(test)]` 用 | `agent-vitals-adapters`（多宿主 wire 归一，天然 adapter territory），parity 测试一起搬 | ~272 + 测试 | 低（无生产消费方） |

做完 C1–C3，`domain/*.rs` 对 `crate::{dsh_evidence, codex_usage, adapters::hosts}` 的
**生产引用归零**。此后：

- **B2**（arch Phase B 遗留）：`dsh_evidence` + `codex_usage`（core 里的两条 residual）
  物理迁进 `agent-vitals-adapters`，撤掉 core lib.rs 的两条 re-export。
- **抽 `agent-vitals-domain` crate**：`domain/` 整体成 crate，`agent-vitals-core`
  退成 `contracts/` + `compatibility/`（或并入）。

**`cost.rs` 99KB 拆 Model Resolver / Rate Card / BillingContext / Cost Projection
不在 Phase C 阻塞路径上**——`cost.rs` 零 host import（只 `serde_json`），是 domain
**内部**重构，可在 crate 抽出后单独迭代（建议与 Phase D 的 Billing/User Profile
工作合并）。`usage.rs` 里 `token_by_model`/`request_metrics`/`hour_buckets`/
`token_by_date_model` 的「DSH wire 解析混在 domain」也是同类——命名不纯但零跨 crate
耦合，可 as-is 进 `agent-vitals-domain`，wire/fold 分离另开。

---

## 1. 完整耦合清单（穷举，`#[cfg(test)]` 已标注）

`grep` 全 `domain/*.rs` 的 `crate::{dsh_evidence,codex_usage,adapters::hosts}`：

```
domain/behavior.rs:725   [PROD]  build_dsh_evidence(...)          ← match_behavior shim
domain/behavior.rs:1131  [TEST]  build_dsh_evidence(...).canonical
domain/behavior.rs:1151  [TEST]  build_dsh_evidence(...).canonical
domain/behavior.rs:1370  [TEST]  build_dsh_evidence(...)
domain/compaction.rs:22  [PROD]  use crate::dsh_evidence::Coords
domain/trajectory.rs:126 [PROD]  Coords::default()
domain/trajectory.rs:148 [PROD]  build_dsh_evidence(...)          ← match_trajectory shim
domain/usage.rs:1678     [PROD]  codex_fold_file(events)          ← canonical 归一层
domain/usage.rs:1734     [PROD]  total_signature(cur)             ← canonical 归一层
domain/usage.rs:1739     [PROD]  total_signature(prev)            ← canonical 归一层
domain/waste.rs:25       [PROD]  use crate::dsh_evidence::tool_invocation
```

`contracts/` 干净（只有 doc-comment 里提到 `dsh_evidence.rs`）。
`domain/{budget,state,duration,plan,skill,findings,subagent,takeover,canonical_audit}.rs`
—— **零 host 耦合**。`cost.rs` —— 零 host import。

### 1.1 `canonical_audit.rs → host_capability`（非违规，说明）

`domain_to_host_compatibility_debt_cannot_grow` 把它列进 allowance，但
`host_capability` 在 `contracts/`（不是 host adapter），`degrade_rule_outcomes` 是
契约函数。这是 `domain → contract`，**允许方向**，Phase C 不用动。

---

## 2. C1 —— `Coords` + `tool_invocation` → `contracts/`

### 2.1 现状

`crates/agent-vitals-core/src/adapters/hosts/dsh/sessions/evidence.rs`：
- `pub(crate) fn tool_invocation(event: &Value) -> Option<(&str, String)>`（:82–98，~17 行）
- `pub(crate) struct Coords { … }` + `impl Coords`（:121–205，~85 行）

两者都是「时间线坐标 / 事件 tool-call 形状」的**共享原语**，被两侧用：
- DSH 适配器的 `populate_timelines`（给每条 timeline entry 解坐标）
- domain 检测器：`compaction.rs`（prune 坐标）、`trajectory.rs`（`Coords::default()` 顺延）、`waste.rs`（`tool_invocation` 取 `(name, args)`）

它们放在 `dsh_evidence.rs` 是历史位置（DSH 是第一个宿主），**不是** DSH wire 语义。
`Coords::resolve` 出的坐标已由 differential/goldens 逐字节钉死。

### 2.2 迁移

1. 新增 `contracts/coords.rs`（`Coords` struct + impl）+ `contracts/event_shape.rs`
   （`tool_invocation`；或并入现有 `contracts/evidence.rs`——按 review 口味定）。
2. `contracts/mod.rs` 导出；`agent_vitals_core::contracts::{coords::Coords,
   event_shape::tool_invocation}`。
3. `dsh/sessions/evidence.rs`：`use crate::contracts::coords::Coords` 等，删本地定义。
4. `domain/{compaction,trajectory,waste}.rs`：`crate::dsh_evidence::X` →
   `crate::contracts::…::X`（或经 lib.rs 的 `pub use` 保旧路径，过渡期不动 domain）。
5. lib.rs：加 `pub use contracts::coords::Coords;` 等兼容 re-export（`crate::Coords`
   老路径若有别处用）。

### 2.3 验收

- `cargo test` / `cargo clippy` 全绿——纯类型/函数移动，无行为改动。
- golden 15+15 零漂移（`Coords` 喂的 timeline 坐标已 golden-pinned）。
- Python↔Rust parity 不受影响（Python 侧 `Coords` 等价物在 `dsh_evidence.py`，
  同步移到 Python 的 contracts 层——见 §5 Python 镜像）。
- **风险：极低**。这是 Phase C 里最安全的一步，**先做**。

---

## 3. C2 —— `match_behavior` / `match_trajectory` raw shim → dsh adapter

### 3.1 现状

`domain/behavior.rs::match_behavior(events, workspace_root)` 与
`domain/trajectory.rs::match_trajectory(events)` 是「raw DSH events → findings」的
便捷 shim：

```rust
pub fn match_behavior(events: &[Value], workspace_root: Option<&str>) -> Vec<Value> {
    let events = &crate::util::post_fork(events)[..];
    let evidence = crate::dsh_evidence::build_dsh_evidence(events.to_vec(), Vec::new(),
                       workspace_root.map(str::to_owned), String::new());
    // → match_behavior_canonical(&evidence.canonical)
}
```

**唯一生产调用方是 wasm**（`crates/agent-vitals-wasm/src/lib.rs:26–27`）。
二进制侧 `src/agent/behavior.rs:135–137` 已经走
`agent_vitals_adapters::dsh_evidence::build_dsh_evidence(...)` + `match_*_canonical`
——Phase B1 起就解耦了。

纯入口 `match_behavior_canonical` / `match_trajectory_canonical`（吃
`&CanonicalSession`）**留 domain 不动**——它们零 host 依赖，是 canonical 检测器本体。

### 3.2 迁移

1. `agent-vitals-adapters/src/hosts/dsh/sessions/audit.rs`（新）：
   ```rust
   pub fn dsh_behavior_findings(events: &[Value], workspace_root: Option<&str>) -> Vec<Value>
   pub fn dsh_trajectory_findings(events: &[Value]) -> Vec<Value>
   ```
   实现 = 当前 shim 体（`post_fork` + `build_dsh_evidence` + `match_*_canonical`）。
   `build_dsh_evidence` 此时若还在 core（B2 未做）→ 经 adapters facade 的 re-export 调；
   B2 后 → 直接本 crate。
2. 删 `domain/{behavior,trajectory}.rs` 的 `match_behavior` / `match_trajectory`
   （raw 版）。`#[cfg(test)]` 里 3 处 `build_dsh_evidence` 调用见 §3.3。
3. wasm `lib.rs`：
   ```rust
   let mut findings = agent_vitals_adapters::hosts::dsh::sessions::audit::dsh_behavior_findings(&events, ws);
   findings.extend(agent_vitals_adapters::hosts::dsh::sessions::audit::dsh_trajectory_findings(&events));
   ```
   → wasm 加 `agent-vitals-adapters` 依赖（arch §3.1 的 `wasm ─► adapters` 未来边，
   **带真实调用点一起加**，兑现 B1 note 的承诺）。
4. `agent-vitals-wasm/Cargo.toml` 加 `agent-vitals-adapters = { path = "../agent-vitals-adapters" }`。

### 3.3 `agent-vitals-core` 测试对 `build_dsh_evidence` 的依赖（决策点）

`domain/behavior.rs` 的 3 处 `#[cfg(test)]` 用 `build_dsh_evidence` 造 fixture。
crate 拆分后 `agent-vitals-domain` 的单测**不能**调 `agent_vitals_adapters`（lib 依赖
方向是 adapters → domain）。三个选项：

| 选项 | 说明 | 取舍 |
|---|---|---|
| **(a) `[dev-dependencies]`** | `agent-vitals-domain` 的 `Cargo.toml` 加 `agent-vitals-adapters` 为 **dev-dep**。Cargo 允许 dev-dep 成环（不影响 lib 构建图） | 最省事，行为零改；但「domain 测试 import adapter」读着别扭 |
| **(b) 手搓 `CanonicalSession` fixture** | 测试改用 `contracts::evidence` 手拼 canonical，不经 `build_dsh_evidence` | 最干净，但要重写 ~3 个测试的 fixture，且失去「测的就是 adapter 产的形状」 |
| **(c) 测试移到 adapters crate** | 这些行为测试搬去 `agent-vitals-adapters/tests/`（它能同时 import domain + 自己的 evidence） | 测试归属跟着「被测行为的入口」走，最符合分层；工作量中等 |

**推荐 (c)**——`match_behavior` 整个入口都搬去 adapters 了，它的行为测试跟着搬是
一致的。domain 只留 `match_behavior_canonical` 的纯 canonical 测试（手搓 fixture）。

### 3.4 验收

- `cargo test` / `clippy` 全绿。
- **wasm 重建 + 重拷**：`(cd crates/agent-vitals-wasm && wasm-pack build --target web)`
  → `pkg/agent_vitals_wasm{.js,_bg.wasm}` 拷进 `dsh-client/`（CLAUDE.md：wasm↔CLI
  drift 只能靠重跑 wasm 构建抓）。
- wasm 输出对同一批 fixture 逐字节不变（shim 只换了住址，`post_fork` + evidence +
  canonical 三步一模一样）——`scripts/verify-timeline.mjs` / dsh-client 差分脚本。
- golden 15+15 零漂移（wasm 不进 golden，但 CLI `behavior` 走 canonical 路径不变）。
- **风险：低**，主要是别忘了重建 wasm。

---

## 4. C3 —— canonical 归一层 → `agent-vitals-adapters`

### 4.1 现状

`domain/usage.rs:1523–1795`（~272 行生产代码 + `:1796` 起的 `#[cfg(test)]`）：
`CANONICAL_DIMS` / `SHAPE_{DSH,CODEX,CODEX_TOTAL,UNKNOWN}` / `canonical_total_delta` /
`canonical_tokens`。按 `source` 分派：DSH 形状走 `token_by_model` 的 4 桶，Codex 形状
调 `crate::codex_usage::{codex_fold_file, total_signature}`。

**代码自己的注释（:1529）**：「`SOURCE_CODEX` 在生产代码里没有一个调用点」。
穷举 `grep`：`canonical_tokens` / `canonical_total_delta` 的调用方**全是测试**——
`tests/test_canonical_cost.py` + `usage.rs` 的 `#[cfg(test)]`。Python 侧 `usage.py`
也只**定义**、无生产调用。这一层是给未来「#6 事件桥」（把 DSH+Codex 用量并进
同一行）预留的，那个消费方不存在。

### 4.2 迁移

canonical 归一层是「多宿主 wire 归一」——每条来源显式注册 `(source, field) →
canonical 桶` 白名单，然后求和 + 守卫。这是 **adapter 的活**，不是 domain。

1. `agent-vitals-adapters/src/canonical_usage.rs`（新，crate 根级——它跨宿主，
   不属单个 `hosts/<h>/`）：搬 `CANONICAL_DIMS` / `SHAPE_*` / `canonical_total_delta`
   / `canonical_tokens`。
2. Codex 分支直接 `use agent_vitals_core::codex_usage`（B2 前）或本 crate 的
   `hosts::codex::sessions::usage`（B2 后）；DSH 分支调 `agent_vitals_core::domain::
   usage::token_by_model`（domain → adapters 反向 OK：adapters 依赖 domain）。
3. `domain/usage.rs`：删 :1523–1795 + 对应 `#[cfg(test)]`。`SOURCE_*` 常量若别处
   还用则留（`token_by_date_model` 的 `source` 参数用 `SOURCE_DSH_LIVE` 等——查一下
   归属，大概率留 `contracts/` 或 domain）。
4. `test_canonical_cost.py` + Rust parity 测试 → 跟着搬去 adapters 的测试。
5. `test_classification.py` / clawhub allow-list：`canonical_usage` 模块登记进
   adapters family（Python 侧同步——见 §5）。

### 4.3 验收

- `cargo test` / `clippy` / Python `unittest` 全绿。
- **golden 零漂移**（canonical 层无生产消费方，golden 本就不碰它）。
- `test_canonical_cost.py` 的 Python↔Rust byte-parity 在新位置继续绿
  （`usage.rs::canonical_tokens_python_rust_byte_for_byte_parity` 硬编码串跟着搬）。
- **风险：低**——无生产消费方，纯搬 + parity 测试跟随。

---

## 5. Python 镜像（同步，不可漏）

Rust 侧每动一处，Python 侧对应动，`AGENT_VITALS_BIN` 差分 + `test_cli_matrix.py`
`both()` 看守：

| Rust | Python 对应 | Phase C 动作 |
|---|---|---|
| `contracts/coords.rs`、`contracts/event_shape.rs` | `scripts/agent_vitals/` 里 `Coords` 等价物（现在 `agent/dsh_evidence.py` 内）| C1：抽到 Python 的 contracts 层（或顶层共享模块，同 `source_identity.py` 的先例）|
| `agent-vitals-adapters/hosts/dsh/sessions/audit.rs` | `agent/behavior.py` / `agent/trajectory.py` 的 raw 入口 | C2：Python 侧 raw 入口归属跟 Rust——但 Python 无 crate 边界，**保持文件不动、只更 `test_classification.py` family 归类**（§3.3 的 Python 侧就是「登记」不是「搬 crate」）|
| `agent-vitals-adapters/canonical_usage.rs` | `agent/usage.py:1340/1377` 的 `canonical_*` | C3：Python 侧同样只登记归类，函数留 `usage.py`（Python 不拆 crate，B1 review §3.3 已定 Phase A–D 不改 Python 分层）|

**关键**：Python 包 **不跟着拆 crate**（feasibility review §3.3 已拍）。Phase C 的
Python 工作 = ①C1 的 `Coords`/`tool_invocation` 下沉成共享模块（真实代码移动，因为
`compaction.py`/`waste.py` 要 import 它）②C2/C3 只改 `test_classification.py` 的
family set 归类 + clawhub allow-list，函数不搬文件。

---

## 6. 建议执行顺序（每步独立提交、golden 绿）

```
C1  Coords + tool_invocation → contracts/（Rust + Python 共享模块）        [极低风险，先做]
     └─ gate: cargo test/clippy + golden 15+15 + parity

C2  match_behavior/match_trajectory raw shim → adapters/hosts/dsh/audit    [低风险 + wasm 重建]
     ├─ 行为测试按 §3.3(c) 搬去 adapters/tests
     ├─ wasm lib.rs 改道 + Cargo.toml 加 adapters dep
     └─ gate: 上述 + wasm-pack build + 重拷 dsh-client/ + dsh-client 差分

C3  canonical 归一层 → adapters/canonical_usage.rs                         [低风险，无生产消费方]
     ├─ test_canonical_cost.py + Rust parity 测试跟随
     └─ gate: cargo test + Python unittest + parity

── 至此 domain/*.rs 生产代码零 host 引用 ──

B2  dsh_evidence + codex_usage residual 物理迁进 agent-vitals-adapters     [中风险，文件大]
     ├─ core lib.rs 撤 2 条 re-export；adapters lib.rs 改直接 mod
     ├─ residual_host_adapter_directories_are_explicit_phase_c_debt → assert_eq!([]，或删测
     ├─ codex/sessions/usage.rs (1547 行) + dsh/sessions/evidence.rs (684 行) 搬
     └─ gate: 全量 + 二进制/wasm import 路径更新 + Python 登记

抽 agent-vitals-domain crate                                              [中风险，机械但面大]
     ├─ domain/ 整体成 crate；agent-vitals-core 退成 contracts + compatibility（或合并进新 crate + 顶层留 facade）
     ├─ 二进制/wasm/adapters 的 agent_vitals_core::domain::X → agent_vitals_domain::X（或经 core facade 过渡）
     ├─ dependency_budget.rs 拆成 domain 版 + 更新 adapters 版
     └─ gate: 全量 golden/parity/clippy 零漂移
```

**`cost.rs` 拆分 / `usage.rs` wire-fold 分离** = 独立迭代，建议并入 Phase D
（Model Catalog / BillingContext / User Profile 一起做，那时 `cost.rs` 的
Rate Card / Billing Route 拆分才有真实需求驱动）。

---

## 7. Phase C 明确不做

- 不拆 `cost.rs`（零 host 耦合，domain 内部重构，非阻塞）。
- 不把 `token_by_model`/`request_metrics`/`hour_buckets`/`token_by_date_model` 的
  「DSH wire 解析」从 domain 剥出——命名不纯但零跨 crate 耦合，as-is 进
  `agent-vitals-domain`，wire/fold 分离另开。
- 不接 Runtime（Phase D）、不动 Python crate 分层、不碰 MCP。
- 不改任何折叠语义 / `fact_id` / resume 契约 / 计价数学——Phase C 是**搬家**，
  一行行为逻辑都不改；任一 golden/parity/reconcile 变红即停。

---

## 8. 待确认（执行前）

1. C1 的 `Coords`/`tool_invocation` 落 `contracts/coords.rs`+`event_shape.rs` 两个新
   文件，还是并进 `contracts/evidence.rs`？（倾向两个新文件，`evidence.rs` 已 769 行）
2. §3.3 的 `agent-vitals-core` 测试依赖：选 (c) 测试搬去 adapters —— 确认？
3. 抽 `agent-vitals-domain` 时 `agent-vitals-core` 的最终形态：
   (a) 退成 `contracts` + `compatibility` 两模块的薄 crate；
   (b) 干脆改名/合并，顶层留 `pub use` facade 一个版本周期。
   （倾向 (a)，与 arch spec §0「拆完前保留 crate 名」一致）
4. Phase C 用独立分支 `codex/v0.8-phase-c`（同 A/B 惯例），Codex 执行、本会话审阅/验收/合并 —— 确认？
