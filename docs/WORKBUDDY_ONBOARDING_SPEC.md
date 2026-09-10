# WorkBuddy 接入规格（Phase A–D）

> 撰写 2026-09-10。真机语料实测基线见 §2（本次重测，非引用旧数字）。
> 关联：[WORKBUDDY_INTEGRATION.md](./WORKBUDDY_INTEGRATION.md)（2026-09-02 调研 +
> 会话行为适配器，**已落地**）· [ATTRIBUTABLE_WASTE.md](./ATTRIBUTABLE_WASTE.md)
> §6/§6.6/§6.7（成本词表与名义口径）· [AGENT_VITALS_V0_9_DATA_VALUE_ARCHITECTURE_SPEC.md](./AGENT_VITALS_V0_9_DATA_VALUE_ARCHITECTURE_SPEC.md)
> （数据面本体）· [PROVIDER_ROUTE_ATTRIBUTION_SPEC.md](./PROVIDER_ROUTE_ATTRIBUTION_SPEC.md)
> §6.4 · memory `workbuddy-data-facts`（真机词表与积分口径的权威记录）。
>
> **与 WORKBUDDY_INTEGRATION.md 的分工**：那篇管「WorkBuddy 的一次会话怎么变成
> CanonicalSession + SV601–614 findings」，已实现并被六条差分钉住。本篇管**它之后
> 的三件事**——已落地部分的口径纠错、会话面接进统一查询、金额面归属到哪一栏。
> 本篇**勘误**那篇的 §9 与 §2.1（见 §6.3）。

## 修订记录

**v2（2026-09-10 当日修订）——两处结构性错误，均为初稿写错、经代码核实推翻：**

1. **初稿 §6 把 Phase B 写成「新增 `SessionStore::workbuddy` + 翻 `session_store`
   声明」，全部作废。** `r2a_store.rs` 自 v0.9.1 PR #4 起标记 DEPRECATED、整文件
   behind `legacy-r2a` feature gate、计划 v0.9.3 由 PR #5 删除，删除清单**逐字包含**
   「删 `host_runtime_registration.rs::session_store` 字段」。初稿是在一个正在被
   删除的模块上加宿主、翻一个正在被删除的字段。正确形状见新 §7。
2. **初稿 §4.2 第 1 条「禁止 credit 折算进任何汇总面」过严。** `ATTRIBUTABLE_WASTE.md`
   §6.7 原文：「名义是度量衡（厘米可换英寸），实际是账（美元不能当人民币加进账本）」
   ——名义栏**允许**按显式声明、带日期的汇率折算。禁止的只是折算结果进**实付栏与
   预算分子**。正确形状见新 §5。

初稿另有两处小错一并修正：CLI 子命令是 `data-host-bill`（连字符）不是 `data host-bill`；
`sessions list --host-kind` 早已是自由字符串，不存在需要放开的词表。

## 0. 结论

1. **WorkBuddy 已接了一半**：静态 skill 体检 + 会话行为审计已落地；v0.9 数据面是
   刻意的「声明但排除」（用户 2026-09-05 决定，`fixtures/v09/workbuddy/EXCLUDED.md`）。
2. **已落地的那一半现在报错误的数字**（§3 三条实测缺陷）：`cost.cny` 把积分当人民币
   （约 20× 高估）、`date_span` 真机恒 null、fixture 是纸面 schema。**与接不接数据面
   无关，是既有代码的 bug**，Phase A 独立修。
3. **「会话面」与「事实面」在当前架构下不可分**（§7.1 的 SQL 证据）：统一
   `sessions list` 是对 `usage_facts` 的 GROUP BY，一个会话出现在统一面**当且仅当**
   它有至少一条带时间戳的非聚合 UsageFact。所以「先接会话、再谈成本」的分层没有落点。
4. **成本能统一，统一在名义栏**（§5）：WorkBuddy 的积分按公开兑换价折算 ¥215.39，
   单位名义成本 **¥194.2/M tokens**（积分轨分母），可与 Codex/Claude/DSH 横比。
   实付栏它贡献 0（积分为套餐赠送）；若用户在付 WorkBuddy/CodeBuddy 月费，那笔才是
   它的真实现金成本，走 `fixed_subscription` 手工录入，与积分数无关。
5. **发 UsageFact ≠ 编造 token 桶**（§7.2 vs §9）：为进统一会话面而发四桶全 0 的
   逐请求事实是诚实的（表达"此宿主不报分桶"）；把会话级聚合 `used` 拆进四桶冒充
   token 计量是编造，明确不做。

## 1. 现状清单（代码核实 2026-09-10）

| 面 | 状态 | 落点 |
|---|---|---|
| 静态 skill 扫描 | ✅ | `hosts/workbuddy/sources/skills.rs` · `golden/host-workbuddy.json` |
| 会话证据（CanonicalSession） | ✅ | `hosts/workbuddy/sessions/evidence.rs` |
| 会话 I/O + CLI `workbuddy-session` | ✅ | `hosts/workbuddy/sources/mod.rs` · Python 镜像 · 六条差分 |
| capability 声明面 | ✅ | `host_capability::HOSTS` 有 workbuddy 行（`session_store: false, fold: None`） |
| 统一 `sessions list/read` | ❌ | 走 SQL（`mcp::sessions_search` / `session_detail`）；库里无 workbuddy 行 |
| facts → SQL 权威库 | ❌ 刻意排除 | `ingest_service::FACT_HOSTS` 三宿主封闭词表 |
| 金额面（by_host / by_provider / 预算 / 日历） | ❌ 刻意排除 | `summary.rs:29 PERMANENTLY_EXCLUDED_HOSTS` |
| ~~`SessionStore`~~ | ⚠️ **待删** | `r2a_store.rs` DEPRECATED（PR #4）→ v0.9.3 删除（PR #5）；**不要在此加宿主** |

「排除」不是遗漏：`tests/test_v09_onboarding_fixtures.py::test_workbuddy_is_declared_but_excluded`
**双向**钉死——注册表必须有它的行，`by_host` 必须没有它。任何一侧的擅自变更都是回归。

## 2. 真机语料实测基线（2026-09-10）

`~/.workbuddy/` 本机重测：

| 项 | 实测 |
|---|---|
| 会话 | 22（`sessions` / `session_usage` 各 22 行） |
| **积分轨** | **11 会话 · 1,109,007 token · 4,307.76 credit** |
| **非积分轨** | **11 会话 · 962,116 token · 0 credit**（自配 API key + 端点，花费在用户自己的账户，本机不可观测） |
| 语料跨度 | **2026-07-29 → 2026-08-23**（北京日）；**2026-09 零活动** |
| audit-log | **21 个文件**（2026-09-02 时为 23）——账本在轮转 |
| `requestId` → audit-log 时间戳 join | **64/100**；**10/11** 个有积分的会话至少命中一条 |
| **跨北京日的会话** | **9/22**（有积分的 8/11）；最长 `9e4b26f5` 08-04 → 08-17，**13 天** |
| audit 词表 | 仍是 `(category, eventType)` 对：sandbox-executed 2391 · WebFetch 75 · bulk-delete 68 · Bash 审批 12 · 段标记 17 |

三条与旧记录不符、以本次为准：

- **`requestId` join 率是 64%，不是 memory 里的 13%**。旧数字应是词表漂移事故期间的产物。
- **audit-log 文件从 23 掉到 21**：轮转是活的，「最老记录可能被轮转」不是理论风险。
- **双轨的 token 几乎各占一半**（1,109,007 vs 962,116）——这个比例直接决定 §5.2 的分母口径。

**语料已停止增长**是排期依据（§12），不是不接的理由：行为证据的价值是历史性的。

## 3. 三条实测缺陷（Phase A 的对象）

### 3.1 `cost.cny` 把积分当人民币报

```
$ agent-vitals workbuddy-session --session ad447428-… --json -
"cost": { "tokens": 133966, "cny": 1763.88, "host_billed": true }
```

`1763.88` 是**积分**。按官方加量包公开价（1,000 积分 = ¥50，2026-07-01 起）折算约
**¥88.19**。字段名叫 `cny`、旁边站着 `host_billed: true`，任何下游只会当钱读。

落点：`hosts/workbuddy/sources/mod.rs::cost_of`（Rust）↔
`agent/workbuddy_session_audit.py:155`（Python）——两侧字面相同，差分门禁全绿，因为
**两边错得一模一样**。

### 3.2 `date_span` 在真机恒为 null——在新架构下这是致命的

```
$ agent-vitals workbuddy-session --list
1586b156-…  打招呼  custom-local:deepseek/…  - → -      ← 日期列全空
```

根因：真机 `audit-log.timestamp` 是 **epoch-ms 整数**，`sessions.created_at` /
`updated_at` 是 **INTEGER** 列；而 `date_span_of` 只收字符串（Rust `Value::as_str`、
Python `_is_iso_ts`），整数一律读成 None，兜底路径同样是 `str_field` → 也 None。

初稿把这条评为「列表排序难看」，**低估了**。统一会话面的 SQL 硬条件是
`event_ts_ms IS NOT NULL`（§7.1）——**没有时间戳的事实等于不存在**。这条从可用性
缺陷升级为 Phase B 的存亡前提。

### 3.3 fixture 是纸面 schema，与真机形状不一致

`fixtures/workbuddy/build_workbuddy_fixture.py`：

```python
"CREATE TABLE sessions (id TEXT PRIMARY KEY, title TEXT, model TEXT, "
"cwd TEXT, permission_mode TEXT, use_sandbox_cli INTEGER, "
"created_at TEXT, updated_at TEXT);"          # 真机：INTEGER，且该表有 30 列
...
("s1", 5000, 12345, '{"r1":0.02,"r2":0.03}')  # 真机单请求积分中位 22.06
```

audit-log 的 `timestamp` 同样写成 ISO 串。**这是 2026-09-02 词表漂移事故的同款复刻**
——fixture 与实现同错互证，六条差分全绿却测不到真机形状。那次的教训（memory 原文）
是「fixture 是『真机形状』的代理，写错词就是让门禁测错东西；词表以真机审计为准，
不认文档」。这次错的不是词表是**类型**，纪律同一条。

> **不修 fixture 就修不了 §3.2**：在 ISO 串 fixture 上做整数时间戳兼容，测试既无法
> 转红也无法转绿。Phase A 的工作项因此以 fixture 先行（§10 项 1）。

## 4. 目标 / 非目标

### 4.1 目标

- **A**：`workbuddy-session` 的成本块与时间轴对真机说真话；fixture 承载真机形状。
- **B**：WorkBuddy 会话进入统一 `sessions list/read/navigation`——或明确选择不进。
- **C**（拍板后）：名义栏归属 + 真实现金账单的手工录入通路。

### 4.2 非目标（写死，防后续滑坡）

1. **不把 credit 折算值写进实付栏或预算分子**。名义栏可进（§5，须带 basis 串与日期）；
   `metered_spend` / `summable_total` / `budget_status_sql` 的分子**不可**。
   ——初稿此条写成「禁止进任何汇总面」，过严，见修订记录 2。
2. **不把会话级聚合 `used` 拆进 usage_facts 四桶**（§9）。
3. **不动 `assets/pricing.json`**：积分兑换价不是模型价卡，不长第四份价格拷贝。
4. **不新增 `BillingBasis` 档**。五档词表有硬常量 `variant_count()` 与 `as_str`/
   `from_wire` 双向映射，为一个宿主开第六档是把口径问题伪装成类型问题。
5. **不在 `r2a_store.rs` 上加任何 WorkBuddy 代码**（该模块待删，§7.1）。
6. **不重建 wasm、不碰 DSH tab**；**不用 traces 猜 session**（`WORKBUDDY_INTEGRATION` §6/§12.2 延续）。

## 5. 成本口径：WorkBuddy 在四条栏里各占什么

`CLAUDE.md` 的成本词表：「花了多少钱」是**四个互不相加的量**，且分币分栏永不相加。
所以不存在一个「因为拒绝折算而被打破的统一总数」——那个总数按设计就不存在。

### 5.1 四栏归属

| 栏 | WorkBuddy 贡献 | 依据 |
|---|---|---|
| `nominal_cost`（名义，可比度量尺） | **¥215.39** = 4,307.76 credit × ¥0.05 | §6.7「名义**允许**按显式声明、带日期的汇率折算」 |
| `metered_spend`（按量实付） | **0**（积分为套餐/活动赠送，无按量付费流） | 用户裁决 2026-09-02 |
| `FixedSubscription` | **若用户在付 WorkBuddy/CodeBuddy 月费，那才是它的真实现金成本** | 走 `data-host-bill --basis fixed_subscription`，**与积分数无关** |
| `unpriced_tokens` | 非积分轨的 **962,116** token | 其花费在用户自有 API 账户，本机不可观测 |

**第三行是初稿完全漏掉的**：memory 记着「套餐费按基础设施成本不按积分摊销」——
若确实在付月费，WorkBuddy 的现金成本不是 0，只是它跟积分数无关，不能由积分推出。

### 5.2 名义单位成本与分母陷阱

§6.7 的可比量是 `nominal_cost / processed_tokens × 1M`。WorkBuddy 无逐桶单价、无逐
模型 token，走不了标准的 `Σ 桶 × 单价`，但「积分 × 兑换价」是同性质的 list-price
派生量，落进同一栏：

```
积分轨分母（正确）:  ¥215.39 / 1,109,007 tok = ¥194.2/M
全量分母（错误）:    ¥215.39 / 2,071,123 tok = ¥104.0/M   ← 被稀释 46%
```

非积分轨的 962,116 token 花的是用户自己 API 账户的钱，**不在 `credit_json` 里**。
把它算进分母，等于让另一条轨的 token 免费搭车、把积分轨的单位成本压低 46%。与 §6.6
「两个 coverage 不得合并成一个看似精确的数字」同一形状。

**规格**：WorkBuddy 名义单位成本的分母**只含积分轨 token**（`credit_json` 求和 > 0
的会话）；非积分轨单列 `unpriced_tokens: 962,116`，不进分母也不计 0。

**两把尺不能相加**：其他宿主的名义是 `token × 官方卡`，WorkBuddy 的是
`积分 × 兑换价`。并列可比，求和无意义——展示层必须并列不合计。

### 5.3 `nominal / actual` 倍数护栏

§6.7 规定倍数 > 50× 时报「计费声明与实际用量不符」而非「值 N 倍」。WorkBuddy 的
`actual = 0` 使倍数**无定义**：展示层必须走「**无实付证据，不计算倍数**」分支，
不得显示 ∞，更不得显示「省了 N 倍」。这与 anthropic 族 380× 是同一个自检信号。

## 6. Phase A：口径与时间轴修复

**独立价值，不依赖任何后续 Phase，是 §7 两条路径的共同前置，可立即执行。**

### 6.1 `cost` 块新契约

```json
"cost": {
  "tokens": 133966,
  "credits": 1763.88,
  "cash_cny": null,
  "nominal_cny": 88.19,
  "nominal_basis": "pack-price-public:1000cr=50CNY@2026-07-01",
  "host_billed": true
}
```

| 字段 | 语义 | 纪律 |
|---|---|---|
| `tokens` | `session_usage.used`（会话级聚合） | 无逐请求 token，不拆桶 |
| `credits` | `credit_json` 各 requestId 之和，**单位 = 积分** | 按厘累计防浮点漂移（既有实现保留） |
| `cash_cny` | 现金口径实付 | **恒 `null`**——本机无支付证据。缺失报缺，**绝不填 0**（0 是「确实没花」的真测量，我们不知道） |
| `nominal_cny` | `credits × 0.05`，**名义栏**输入（§5.1） | 可进名义汇总，**不可**进实付栏/预算分子 |
| `nominal_basis` | 折算依据 + 日期的可追溯串 | 兑换价变更时改这里，不改静默数字 |
| `host_billed` | 保留 | 宿主自己记账、非我方重计价 |

**破坏性变更**：`cny` 键消失（改为语义明确的 `cash_cny` / `nominal_cny` 二分）。
全仓库消费方只有两处（Rust/Python 各一），无外部读者。

`credits` 为 0 且 `used` 缺失 → 整个 `cost` 为 `null`（既有降级纪律不变）。
**非积分轨会话** → `credits: 0.0` + `nominal_cny: 0.0` 是**真测量**（平台积分轨确实
未消耗），其真实开销在用户自有 API 账户、本机不可见——由 `notes` 一条说明，
**不由数字冒充**（§11 第 14 条）。

### 6.2 时间戳解析规则

`audit-log.timestamp`、`sessions.created_at` / `updated_at` 三处统一：

1. **字符串** → 走现有 ISO 路径（其他宿主与旧 fixture 的既有形状不回归）。
2. **整数 / 浮点** → **按毫秒解释**（真机三处均为 13 位 epoch-ms），归一成
   `YYYY-MM-DDTHH:MM:SSZ` UTC 串。
3. **合法性窗口**：归一结果落在 `[2000-01-01T00:00:00Z, now + 24h]` 之外 → 视为
   不可解析，报 `null` 并计入 `attempts`。**不做「10 位当秒、13 位当毫秒」的自动
   嗅探**——那是在一个只观测到毫秒的宿主上发明一条无证据支撑的规则。
4. 其余类型（bool / null / object）→ `null`。

`date_span` 的排序在归一后按串字典序（= 时间序）进行，与既有实现一致。

### 6.3 文档勘误

`WORKBUDDY_INTEGRATION.md` 三处按 §3.1/§5 改写，并加一行指回本篇：

- §9 首句「`credit_json` = `{requestId: ¥}`」→ `{requestId: credit}`；
  「TOTAL ¥4307.76」→「TOTAL 4,307.76 credit（名义 ¥215.39；现金口径无实付证据）」。
- §2.1 表 `session_usage` 行的「`credit_json`(宿主计费)」→「(宿主**积分**账单)」。
- §9 输出契约段的 `{tokens, cny, host_billed}` → §6.1 的新形状。

### 6.4 Phase A 验收

1. `workbuddy-session --list` 在**真机**上日期列非空（当前全 `-`）。
2. `workbuddy-session --session <top-credit> --json -` 的 `cost` 是 §6.1 形状，
   `cash_cny` 为 `null`，`nominal_cny` 与 `credits × 0.05` 一致到分。
3. fixture 的 db schema 列类型与真机一致（`created_at`/`updated_at` INTEGER、
   `session_usage` 含 `updated_at`），audit-log `timestamp` 为 epoch-ms 整数，
   credit 值改真机量级；builder 自校验数字同步更新。
4. 六条既有差分（`test_cli_matrix.py`）在新 fixture 上重新逐字节一致。
5. 新增回归：整数时间戳能解析、越界时间戳报 null 且进 attempts、`cost` 不含 `cny`
   键、`nominal_cny` 不出现在任何**实付**汇总 DTO 里。

## 7. Phase B：统一会话面——两条路径二选一

### 7.1 决定性的架构事实

统一 `sessions list` 不是「列 sessions 表」，是**对 `usage_facts` 做 GROUP BY**：

```sql
-- crates/agent-vitals-data/src/authority_query.rs:907 SQL_SESSIONS_IN_WINDOW
SELECT session_key, host, MIN(event_ts_ms), MAX(event_ts_ms), COUNT(*),
       SUM(uncached_input_tokens), … GROUP_CONCAT(DISTINCT COALESCE(model_id,'<unknown>'))
FROM usage_facts
WHERE host = ?1 AND observation_kind != 'legacy_aggregate'
  AND deleted_at_ms IS NULL AND event_ts_ms IS NOT NULL AND session_key IS NOT NULL
  AND event_ts_ms >= ?2 AND event_ts_ms < ?3
GROUP BY session_key
```

`hosts` 为空时的宿主枚举同样是 `SELECT DISTINCT host FROM usage_facts`（同文件 :943）。

**推论**：一个会话出现在统一面，**当且仅当**它有至少一条带时间戳的非聚合 UsageFact。
因此：

- 「先接会话面、后谈成本面」的分层**没有落点**——它描述的是 r2a 时代的形状。
- `sessions list --host-kind` 是自由 `Vec<String>`（`main.rs:809`）、`hosts` 过滤是
  自由字符串数组（`sessions_search.rs:31`）：**门早就开着**，无词表需要放开。
- `sessions read` 已无逐宿主分支（`main.rs:3226` 直接 `dispatch("session_detail")`
  按 `session_ref` 查 SQL），**没有 branch 可加**。
- `SessionStore::workbuddy` 是往待删模块里加宿主（§1 末行），**不做**。

### 7.2 路径 1：发逐请求 UsageFact，进统一面

**粒度 = 逐 `requestId`**（`credit_json` 的 100 条），不是逐会话。逐会话方案已被
实测否决：**9/22 会话跨北京日（有积分的 8/11），最长跨 13 天**——把整个会话的用量
记在 `updated_at` 那一天，是把 13 天的花费砸进一格日历。

字段映射：

| UsageFact 字段 | 取值 |
|---|---|
| `host` | `workbuddy`（需进 `ingest_service::FACT_HOSTS`） |
| `native_session_id` | db `sessions.id` |
| `source_event_id` | `requestId`（宿主原生稳定 id） |
| `observation_kind` | `host-credit-entry`（新值，非 `legacy_aggregate`，故不被 §7.1 查询排除） |
| `event_ts_utc` | 同会话 audit-log 里该 requestId 的**最早**时间戳（实测 64/100 可得） |
| `time_basis` | `native`；**无时间戳的 36 条写 `null`** |
| 四桶 token | **全 0** |
| `amount_decimal` / `amount_basis` | credits / `host_billed` |
| `source_usage_semantics` | 声明宿主原生粒度 |

三条纪律：

1. **四桶全 0 是诚实的**，表达「此宿主不报分桶」；在 `sessions list` 里表现为该会话
   total=0、按 total 降序沉底。把 `used` 塞进 `uncached_input_tokens` 凑总量是编造桶
   （§9），**不可**。
2. **36% 无时间戳的行写 `time_basis: null` 且 `event_ts_utc: null`**，与 DSH emitter
   的既有惯例一致（`dsh/sources/usage_fact.rs:112`「epoch 0 是真时间、不是无时间」）。
   **不发明会话级回退时间**——那是在没有分辨率的地方发明分辨率。代价如实：这些行
   入库但不进时间窗口查询。
3. **`tokens_by_host["workbuddy"]` 必须继续被排除**。四桶全 0 会让它报 0 token，
   那是 MeasuredZero 冒充真测量——workbuddy 留在 token DTO 的排除名单里。

**可见性代价（如实）**：22 个会话里 **10 个**会出现在统一面（10/11 个有积分的会话
至少有一条带时间戳的行；另 1 个有积分会话的 requestId 全部 join 不上；11 个非积分轨
会话没有任何用量事实，诚实缺席——它们的用量本机确实不可观测）。

前置：Phase A 全部三项。

### 7.3 路径 2：维持现状，`workbuddy-session` 保持独立子命令

行为审计价值（真机 2,463 次工具调用、80 条审批决策、hash 链账本）**已经拿到了**，
只是不在统一列表里。代价：工作台看不到 WorkBuddy 会话。

考虑到语料**已停止增长**（2026-09 零活动）且 audit-log 正在轮转（23 → 21 文件），
这条的性价比不差。

### 7.4 选择建议

**推荐路径 2，除非 WorkBuddy 恢复活跃使用。** 路径 1 的收益是 10/22 个历史会话出现
在一个按 token 排序的列表里，而它们的 token 恒为 0（沉底）；成本是一个新
`observation_kind`、一次 `FACT_HOSTS` 词表放开、以及在每个消费方逐一审计
「workbuddy 是否该被排除」。**收益与成本不成比例**——除非语料重新增长。

### 7.5 Phase B 验收（若选路径 1）

1. `sessions list --host-kind workbuddy --day <有数据的日>` 列出该日会话，
   token 列为 0，排序沉底。
2. 其余三宿主的 `sessions list` 输出**逐字节不变**。
3. `tokens_by_host` **无** workbuddy 键；`monthly_summary.excluded_hosts` 仍含它。
4. 无时间戳的 36 条事实**在库里可查**（`data-status` 计数含它们）但**不进**任何
   时间窗口查询。
5. `data-reimport-verify` 通过（幂等重放逐字节一致）。

## 8. Phase C：名义栏与真实账单（需拍板）

### 8.1 名义栏（可做，风险低）

把 §5.2 的 `¥194.2/M`（积分轨分母）接进名义成本视图，**并列不合计**（§5.2 末段），
并遵守 §5.3 的倍数护栏。这一步不碰 `metered_spend`、不碰预算、不碰 `pricing.json`。

### 8.2 真实现金账单（用户提供证据时）

两类，都走**既有**手工录入面，**零新代码**：

```bash
# 加量包实际购买
agent-vitals data-host-bill set --host workbuddy --provider workbuddy \
  --month 2026-08 --basis host_billed --amount-minor <分> --currency CNY \
  --evidence-ref "receipt:<订单号>"

# 订阅月费（§5.1 第三行——与积分数无关）
agent-vitals data-host-bill set --host workbuddy --provider workbuddy \
  --month 2026-08 --basis fixed_subscription --amount-minor <分> --currency CNY \
  --evidence-ref "subscription:<账期>"
```

`apply_host_bills`（`summary.rs:1153`）已把这类行折进 `by_provider["workbuddy/workbuddy"]`；
`data-host-bill` 的 CLI help 原文即写着「Host bills (**WorkBuddy credit**, subscription
invoices…) are **user-entered, not derived from our price cards**」。

此时且仅此时需同步：从 `PERMANENTLY_EXCLUDED_HOSTS` 摘除 workbuddy（否则
`contract_violations()` 会正确地报「排除的宿主不能同时贡献数据」），并改写
`test_v09_onboarding_fixtures.py` 的金额面断言。

**系统永不自动生成这两行**：`amount_minor` 必须来自用户提供的收据/账期，不能来自
`credits × 0.05`。前者是账，后者是尺——§6.7 的词表陷阱条款在这里逐字适用。

## 9. Phase D：把 `used` 拆进四桶冒充 token 计量——明确不做

与 §7.2 的「四桶全 0」划清界限：**发事实是诚实的，编桶不是。**

1. **无逐请求 token**：只有会话级 `used`。四桶任填其一都是编造构成。
2. **无四桶语义**：WorkBuddy 不暴露缓存读写，`cache_hit_ratio` 无源。
3. **借用其他宿主的卡计价**：§6.7 实测同一模型按不同卡计价相差 **46 倍**，借卡等于编价。

工程面附注：WorkBuddy 是**单文件 sqlite + 目录账本**，与 `source_files` 的
(size, mtime) 逐文件指纹模型不匹配——db 每写一次全库 mtime 就变，**文件指纹层面做
不到「只重建受影响的会话」**（r2a v2 的逐 session 依赖指纹对 DSH/Codex 成立，是因为
1 文件 ≈ 1 会话）。若将来确需增量，只能读 db 的 `sessions.updated_at` /
`session_usage.updated_at`（真机确认均为 INTEGER 列）做**内容级**逐会话指纹。

## 10. 工作项（依赖序 · 执行清单）

> 分支 `feat/workbuddy-adapter`（worktree，基线 main@88ae4a7）。每项一个滚动内循环：
> **分析 → 编码 → 测试 → 通过后 commit**。勾选 = 该项已 commit 且门禁通过。

**Phase A**（§7 两条路径的共同前置，独立可交付；修的是既有 bug，不依赖任何口径决策）

- [x] **A1 · fixture 承载真机形状**（§3.3/§6.4-3）
      `fixtures/workbuddy/build_workbuddy_fixture.py`：`sessions.created_at`/`updated_at`
      改 INTEGER、`session_usage` 补 `updated_at` 列、audit-log `timestamp` 改 epoch-ms
      整数、credit 值改真机量级；builder 自校验数字同步。**必须最先做**——在 ISO 串
      fixture 上做整数兼容，测试既无法转红也无法转绿。
- [x] **A2 · 时间戳归一**（§6.2）
      `hosts/workbuddy/sources/mod.rs` 的 `date_span_of` + `workbuddy_session_meta`
      ↔ `adapters/workbuddy_session.py` / `agent/workbuddy_session_audit.py`。
      字符串走旧路径、整数按毫秒、越界报 null 并进 attempts、不做秒/毫秒嗅探。
      **双侧同一 commit**。
- [x] **A3 · `cost` 块改契约**（§6.1）
      `cost_of` ↔ Python 镜像：`cny` → `cash_cny`(恒 null) + `nominal_cny` +
      `nominal_basis`；`credits` 取代原 `cny` 的求和值。键序两侧逐字节一致。
      非积分轨会话多发一条 `notes`（真实开销在用户自配 API 账户、本机不可见）。
      A4 的部分交付：`nominal_cny` 只活在 workbuddy 会话适配器、`PERMANENTLY_
      EXCLUDED_HOSTS` 仍含 workbuddy——回归钉住（`TestNominalCnyNeverEntersASpendSummaryDto`）。
      evidence.rs 的整数时间戳 fold-in **推迟**：`TimelineEntry.time` 实际会进
      `audit` 投影输出，单改 Rust 会打破 Python↔Rust 差分，需 `workbuddy_evidence.py`
      的 `_parse_time` 同步——超出 A3 范围，留作独立项。
- [ ] **A4 · 差分重新冻结 + 新增回归**（§6.4-4/5）
      `tests/test_cli_matrix.py` 六条 workbuddy 差分在新 fixture 上重新逐字节一致；
      新增回归：整数时间戳可解析 · 越界时间戳报 null 且进 attempts · `cost` 不含
      `cny` 键 · `nominal_cny` 不出现在任何**实付**汇总 DTO 里。
- [ ] **A5 · 文档勘误**（§6.3）
      `WORKBUDDY_INTEGRATION.md` §9 两处 + §2.1 表一处 + §9 输出契约段；
      本篇状态行更新。
- [x] **A6 · evidence.rs 整数时间戳 lockstep**（A3 推迟项）
      `hosts/workbuddy/sessions/evidence.rs::parse_time` ↔
      `packages/agent-vitals-python/agent_vitals/agent/workbuddy_evidence.py::_parse_time`：
      整数/浮点按毫秒归一，固定上下界 `[2000-01-01, 2100-01-01)`（纯 crate 读不了时钟，
      不用 now 窗口）。`TimelineEntry.time` 会进 `audit` 投影，**双侧同一 commit** 且
      会移动差分——A4 的最终重冻覆盖它。

**验收门禁**（每项 commit 前必跑，A5 仅需前两条）

```bash
cargo test -p agent-vitals-hosts                    # workbuddy evidence + sources
python3 -m unittest discover tests                  # Python 全量
AGENT_VITALS_BIN=target/release/agent-vitals python3 -m unittest tests.test_cli_matrix
python3 tests/golden_runner.py                      # 15 张快照不得漂移
```

### 不在本清单内（不是待办，是决策门）

- **Phase B**：需先按 §7.4 选路径；spec 的建议是**路径 2（不做）**——收益是 10/22 个
  历史会话进入一个按 token 排序的列表而它们 token 恒为 0，成本是新
  `observation_kind` + 词表放开 + 逐消费方审计。语料 2026-09 已零活动。
- **Phase C**：需用户拍板 §5 的非现金口径；账单录入通路已存在（§8.2），零新代码。
- **Phase D**：§9 明确不做。

## 11. 诚实性纪律（继承 + 新增）

继承 `WORKBUDDY_INTEGRATION.md` §12 全部十条。本篇新增五条：

11. **credit 是积分不是货币**：任何把 credit 显示成 ¥ 的字段必须自带 `basis` 串与
    日期，且只能落名义栏（§5.1）。
12. **`cash_cny` 缺失报 `null`**：本机没有支付证据。填 0 是断言「确实没花钱」，
    我们不知道这件事。
13. **fixture 必须承载真机形状**：schema 列类型、时间戳类型、数值量级三项与真机
    对齐；纸面 schema 让差分门禁测错东西（§3.3，与 2026-09-02 词表漂移同一教训）。
14. **自配轨不可见不等于零开销**：`credits: 0.0` 只说明平台积分轨未消耗，该会话在
    用户自有 API 账户上的花费本机不可观测——由 `notes` 说明，不由数字冒充。
15. **名义单位成本的分母只含积分轨 token**（§5.2）：全量分母会把单位成本压低 46%，
    那是让另一条轨的 token 免费搭车。

## 12. 与 v1.0.0 的关系

`AGENT_VITALS_APP_V1_0_0_PRD.md` 首发宿主明写 **Codex / Claude Code / DSH**，全文零处
提及 WorkBuddy。因此：

- **Phase A 与 v1.0.0 正交**，随时可做——它修的是既有代码正在输出的错误金额与空日期。
- **Phase B 排在 v1.0.0 之后**，且优先按 §7.4 选路径 2（不做）。
- **Phase C 的名义栏**（§8.1）可与 v1.0.0 的「公私价目隔离」缺口一并考虑——两者都是
  「哪些钱算谁的」问题；**Phase C 的账单录入**（§8.2）已有通路，无需排期。
- **Phase D 不做。**
