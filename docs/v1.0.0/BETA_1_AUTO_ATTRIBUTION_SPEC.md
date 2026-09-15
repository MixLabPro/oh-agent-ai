# v1.0.0-beta.1 自动归因优先规格（程序先定，用户只补程序不知道的）

**状态：** Draft v1（2026-09-16，基于本机权威库只读副本与本地配置的实测证据写成）  
**关系：** 是 [计费确认主链规格](BETA_1_BILLING_CONFIRMATION_CHAIN_SPEC.md) v1.2 的上游——它决定「明确计费方式」列表里**该剩多少组**、弹窗里**该问几步**。PRD REQ-018「存在明确官方订阅/路由证据时自动应用并展示依据；没有明确信号时保留未知」、REQ-022「机器能确认的字段预填，每次只确认一条会改变结果的关系」、REQ-031「不能为了去掉黄色状态强迫用户猜测」是本文的边界。  
**关联：** [发布规格](BETA_1_RELEASE_SPEC.md) B06；[Provider 路由归属规格](../PROVIDER_ROUTE_ATTRIBUTION_SPEC.md)；`crates/agent-vitals-provider/src/lib.rs`（`EvidenceBasis` / `resolve_billing_attribution`）；`docs/CLINE_HOST_ASSESSMENT.md` 等宿主评估。

## 0. 结论

截图里「待明确的计费方式」的 30 组，按本机证据分四类：

| 类 | 组成 | 本月 tokens | 程序能定到哪一步 | 只能问用户 |
|---|---|---|---|---|
| A | claude-code · `claude-*`（sonnet / opus / haiku） | ≈4.5B（45%） | 模型厂商 anthropic、**官方路由**（每条记录 `requestId=req_01…`+`message.id=msg_01…`）、**Claude Pro 订阅**（`oauthAccount.organizationType=claude_pro`）、扣款日 20 号（`subscriptionCreatedAt=2025-07-20`）、Apple 内购 | 月费金额确认（预填 $20） |
| B | codex · `provider_raw=openai`（terra / sol / luna / astra） | ≈2.2B（22%） | 厂商 openai、官方路由（rollout `model_provider=openai`）、**ChatGPT 订阅**（`~/.codex/auth.json auth_mode=chatgpt`，无 API key）、套餐等级（已有配额快照 `plan_type`） | 月费金额确认 |
| C | claude-code · 第三方厂商模型（deepseek 系 / MiniMax / glm、moonshot） | ≈2.7B（27%） | 模型厂商（名族映射）；**不是 Anthropic 官方**（无 `requestId`、`message.id` 是各厂商自己的形状：GLM `msg_20…`、MiniMax/DeepSeek 32 位 hex、moonshot `chatcmpl-…`）；计费按量 | 走的是该厂商官方 Anthropic 兼容端点，还是中转（每个**厂商**问一次，不是每个模型）；中转的价卡（D02） |
| D | codex · `model_provider=custom`（`openai/gpt-5.6-*`、`MiniMax-M3`） | ≈0.5B（5%） | 模型厂商（`openai/` 前缀 = OpenRouter 式命名 → 中转已确定）、按量 | 当时 custom 指向哪家（`config.toml` 里已没有 `[model_providers.custom]`，无法追溯）、价卡 |
| E | workbuddy | ≈1M | 积分制，不是货币（E4b） | 无——**不该出现在待确认列表** |

**A+B 共 66% 程序可以完整判定到计费方式；C 只差一个按厂商问一次的路由问题；真正只有用户知道的是 D 和月费金额。** 现在 30 组全部落到用户头上，根因不是证据不存在，而是：

1. claude-code 适配器把 `provider_id/provider_raw/evidence_basis` 一律写成 `null/null/missing`（`crates/agent-vitals-hosts/src/hosts/claude_code/sources/usage_fact.rs:209-214`，注释「never infer Anthropic from the model name」——这条纪律对**计费方**是对的，但它连**模型厂商**和**每条记录里现成的路由证据**也一起放弃了）；
2. 账户级证据（Claude 订阅类型、Codex 登录方式）没有任何读取路径；
3. 公共目录 `catalog_2026_09.billing_modes` 只声明了 `deepseek-v4*` 两条（`assets/pricing.json`），模型名族 → 厂商这层事实没有数据；
4. `route_evidence` 表本月对 claude-code / codex 为空（实测：2026-09 claude-code 25,455 条事实、codex 18,295 条，`route_evidence_id` 全为 NULL；表里只有 8 月 dsh 的 53 行和 codex 的 1 行 config-current）。

## 1. 真机证据（2026-09-16，只读）

### 1.1 事实表现状（`usage_facts`，本月，排除 subscription）

所有待确认组共同形状：`evidence_basis = missing`、`route_evidence_id = NULL`、`billing_mode = metered`、`pricing_basis = metered_estimate`。区别只在：

| host | provider_id | provider_raw | 说明 |
|---|---|---|---|
| claude-code | NULL | NULL | 适配器不产 provider（§0 根因 1） |
| codex | `openai` | `openai` | rollout 自报 `model_provider=openai`，路由证据仍缺（`resolve_billing_attribution` 的 `official_route_missing` 分支，`provider/src/lib.rs:166`） |
| codex | NULL | `custom` | rollout `model_provider=custom`，`config.toml` 现已无该 provider |
| workbuddy | NULL | NULL | 设计如此 |

### 1.2 每条记录里现成的路由证据（claude-code 会话 JSONL，最近 600 个文件抽样）

| 模型 | `requestId` | `message.id` 形状 | 判定 |
|---|---|---|---|
| claude-sonnet-5 / claude-opus-5 / claude-haiku-4-5 | `req_01…`（400/400） | `msg_01…` | **Anthropic 官方 API**（两个 ID 都是 Anthropic 文档格式） |
| `anthropic/claude-opus-5` | 无 | `msg_bd…` | 厂商前缀命名 + 无 `req_` → **中转**（OpenRouter 式）；证明「不能从模型名推计费方」是对的，但形状证据能把它和官方分开 |
| glm-5.3 / glm-5.3-flash / bigmodel/glm-5.3-flash | 无 | `msg_20…`（时间戳式） | 智谱端点 |
| MiniMax-M3 / M2.7 | 无 | 32 位 hex | MiniMax 端点 |
| deepseek-v4-* / deepseek/* | 无 | 32 位 hex | DeepSeek 端点 |
| moonshot/kimi-k3 | 无 | `chatcmpl-…` | OpenAI 兼容端点 |

### 1.3 账户级证据（本地配置，非凭据）

| 来源 | 字段 | 本机值 | 用途 |
|---|---|---|---|
| `~/.claude.json` → `oauthAccount` | `organizationType` | `claude_pro` | 计费方式 = 订阅，套餐 Claude Pro |
| | `billingType` | `apple_subscription` | 付款渠道（Apple 内购，月费可能≠$20） |
| | `subscriptionCreatedAt` | `2025-07-20T22:26:59Z` | 账期锚点：每月 **20 日** |
| `~/.claude/settings.json` → `env` | `ANTHROPIC_BASE_URL` | 未设置 | 无全局中转配置（第三方模型的 BASE_URL 是启动时环境变量，日志不记） |
| `~/.codex/auth.json` | `auth_mode` | `chatgpt`；无 `OPENAI_API_KEY` | codex openai 路由 = **ChatGPT 订阅** |
| `~/.codex/config.toml` | `[model_providers.*]` | 无；`model_provider` 未设 | D 类的 custom 端点已不可追溯 |

`oauthAccount` 同时含 `emailAddress`、`accountUuid`、`organizationUuid`——本规格**只读上表三个字段**，其余不读、不存、不进任何 DTO/导出（§7 P1）。这触及此前暂停的「读凭据文件」评审（memory `network-credential-boundary`）：这里读的是账户**属性**不是令牌，作为单独例外拍板（§8 D1）。

## 2. 证据阶梯：什么算「程序能定」

把「归因」拆成四个独立事实，各有各的证据来源与强度（复用 `agent_vitals_provider::EvidenceBasis`，不新增枚举）：

| 层 | 事实 | 证据 | 强度 | 谁能定 |
|---|---|---|---|---|
| **L0 模型厂商** `model_vendor` | 这个模型是谁家的 | 模型名族（`claude-`→anthropic、`gpt-`/`o`→openai、`deepseek`→deepseek、`MiniMax`→minimax、`glm`/`bigmodel/`→zhipu-glm、`moonshot/`/`kimi`→moonshot、`hy`→hunyuan） | 确定性（目录数据） | **程序** |
| **L1 路由** `route` | 请求打到了谁的端点 | 每条记录：Anthropic `req_01…`+`msg_01…` → `SessionNative`；codex `model_provider=openai` + 有 endpoint → `SessionNative`；厂商 ID 形状匹配 L0 厂商 → `Inferred`（能说"不是 Anthropic 官方、是 X 家形状"，不能分官方端点/中转）；`model_provider=custom` 或 `vendor/` 前缀命名 → 中转（`Inferred`）；配置 `BASE_URL`/`[model_providers]` → `ConfigCurrent` | 见左 | **程序**（A/B 到 SessionNative；C/D 到 Inferred） |
| **L2 计费方式** `billing_mode` | 订阅 / 按量 / 组织 | 账户级：`oauthAccount.organizationType∈{claude_pro,claude_max,…}` → 订阅（`AccountTimeBound`，锚点 `subscriptionCreatedAt`）；codex `auth_mode=chatgpt` → 订阅、`apikey` → 按量；L1=中转 → 按量 | AccountTimeBound / 推导 | **程序**（A/B）；C/D 推导为按量 |
| **L3 用户补充** | 月费金额、中转是哪家、组织承担、价卡、冲突裁决 | 只有用户知道 | — | **用户** |

规则：**L1 的 `Inferred` 永远不能单独把一批用量判成"官方订阅"**（这正是 `usage_fact.rs:206-214` 注释守的边界）；它只用来把选项收窄到"该厂商官方端点 / 中转"，并把问题从"按模型问"变成"按厂商问一次"。`Conflict`（例如 L0 说 anthropic、L1 形状不是 Anthropic 的）保持现有 E207 处理：单列，不归因。

## 3. 词表修正：`provider_id` 是「计费方」，不是「模型厂商」

现状把两个概念塞在一个字段里，所以列表里 `<unknown>` 既可能是"不知道谁家的模型"（从来不是）也可能是"不知道谁收的钱"（才是真问题）。本规格：

- `provider_id` 语义**不变**（计费方/路由方，`by_provider` 键、MCP 输出都不动——避免 MISMATCH）。
- 新增**派生**字段 `model_vendor`（L0），由目录在读取时计算（`billing_route_of` 同一处，`domain/cost/billing.rs:57`），**不写进 `usage_facts`**（DATA_PLANE §2.1 raw 不可改；派生不入库也不需要 schema）。
- 列表与弹窗一律展示 `model_vendor`，`provider_id` 只在"计费方已定"时出现；`<unknown>` 不再上卡面，改成"计费方待定（模型厂商：deepseek）"。

## 4. 现有表单的问题（对照截图）

| 现象 | 问题 | 本规格 |
|---|---|---|
| 列表按 **模型** 一行一行（同厂商 6 行 deepseek） | 用户要做的决定是按厂商/路由的，不是按模型的 | 行的主键改成 `host × model_vendor × route_state`；一个厂商一行，模型作为折叠清单 |
| 每行都要点「明确计费方式」 | A/B 类程序已能判定，用户只该**确认** | 行内直接展示「程序判定：anthropic · 官方 · Claude Pro（依据：账号类型 claude_pro · 请求 ID req_01…）」+ 单键「确认」；「不对，我来改」才进弹窗 |
| 弹窗第 1 步问"哪家服务商" | L0 永远不该问 | 删除；预填并只读展示 |
| 第 2 步问"官方还是中转" | A/B 有 SessionNative 证据不该问；C 该问但按厂商问一次 | 有 L1≥SessionNative 时隐藏并展示依据；`Inferred` 时才问 |
| 第 3 步默认「官方订阅」 | 对 C/D 是错误默认（它们是按量） | 默认值由 L2 推导：账户订阅证据 → 订阅；中转 → 按量；无证据 → 不预选 |
| 第 5 步让填起止日期 | 订阅用户想的是"哪天订的、每月扣多少"（用户原话） | 订阅：只确认「套餐 · 扣款日 · 月费」（锚点来自 `subscriptionCreatedAt`）；适用范围由程序给：从订阅开始日到今天，回执写明；非订阅才有起止 |
| workbuddy 行 | 积分制无法折算 | 不进列表，标「积分制」 |

## 5. 目标形态

### 5.1 列表（设置 › 计费与套餐 › 待明确的计费方式）

每行 = `host × model_vendor × route_state`，三种状态：

1. **程序已判定**（A/B）：`claude-code · anthropic · 官方 · Claude Pro 订阅 · 每月 20 日 · 3 个模型 · 4.5B tokens` + 依据链（`账号 claude_pro · 请求 ID req_01… · 订阅自 2025-07-20`）+ 按钮「确认（$20/月）」「不对」。确认 = 一次点击写声明 + 重算（主链 §5.6），弹窗不出现。
2. **差一问**（C）：`claude-code · deepseek · 3 个模型 · 1.57B tokens · 按量` + 「走的是 DeepSeek 官方端点还是中转？」两个按钮直接在行内；选官方 → 立即写声明（official_api，deepseek 价卡）；选中转 → 弹窗只剩"哪家 + 价卡（可暂不清楚）"。
3. **需要补充**（D）：进弹窗，只显示缺的步骤。

排序：按估算金额降序，程序已判定的组置顶（一键确认清掉最多）。

### 5.2 弹窗（主链规格 §5.3a 的收敛）

只保留 L3 问题：中转是哪家（可选「暂不清楚」）、月费、组织承担、订阅确认。步骤编号继续只给可见项。日期：订阅 → 确认扣款日与开始日（预填）；按量 → 起止（预填组的首尾日）。

### 5.3 自动归因的落地边界（REQ-018 vs 声明是「用户的回答」）

两阶段，先 1 后 2：

- **阶段 1（Beta.1）— 判定但不自动写**：程序算出 verdict 并展示依据，写入需要用户一次点击「确认」。声明的 `evidence_ref` 记 `auto:<basis>`（如 `auto:account.claude_pro+request_id.req_01`），可追溯是程序判定用户确认的。
- **阶段 2（Beta.2）— 自动应用 + 撤销**：对 L1≥SessionNative 且 L2=AccountTimeBound 的组，同步管线在 `sync_facts` 后自动写系统声明（`evidence_ref=auto:…`）并入队重算；列表显示「已自动归因（依据…）[撤销]」。系统声明的 `effective_end` 每次同步刷新到当天——这解决了主链 G3 对**用户**声明"不扩展到未来"的限制与订阅"持续生效"之间的矛盾：用户声明有界，系统声明由系统按证据续。

## 6. 改动清单

| ID | 位置 | 改动 | 对应 |
|---|---|---|---|
| A1 | `assets/pricing.json` `catalog_2026_09` 新增 `model_vendors`（前缀 → 厂商）与 `id_shapes`（厂商 → `requestId`/`message.id` 形状） | 数据，不是规则；`tests/test_pricing_lockstep.py` 守三处副本 | L0 / L1 |
| A2 | `crates/agent-vitals-domain/src/domain/cost/billing.rs` | `model_vendor_of(model) -> Option<&str>`；`billing_route_of` 不变 | L0 |
| A3 | `crates/agent-vitals-hosts/src/hosts/claude_code/sources/usage_fact.rs` | 每条记录按 §1.2 形状产 `RouteEvidence`：`req_01`+`msg_01` → `provider_raw="anthropic"`, `endpoint_host="api.anthropic.com"`, `SessionNative`；厂商形状 → `provider_raw=<vendor>`, `Inferred`；`anthropic/`/`openai/` 前缀且无 `req_` → `Inferred` + `provider_raw="relay"`；写 `route_evidence` 行并回填 `route_evidence_id`。`provider_id` 仍由 `resolve_billing_attribution` 决定（不再是常量 null） | L1 |
| A4 | `crates/agent-vitals-provider/src/lib.rs::resolve_billing_attribution` | 增加 anthropic 官方分支（与 openai 分支对称：`provider_raw=anthropic` + `SessionNative` + 账户订阅证据 → `Subscription`/`session-provider`；无账户证据 → `Metered`/`route-observed`，`has_unresolved=false`） | L1+L2 |
| A5 | 新 `crates/agent-vitals-hosts/src/hosts/claude_code/sources/account.rs` + `codex/sources/account.rs` | 读 §1.3 的字段（白名单三个 + `auth_mode`），产 `AccountEvidence{plan, billing_channel, anchor_date, basis=AccountTimeBound}`；**不读、不存、不序列化** email/accountUuid/token；feature-gated `sources` | L2 |
| A6 | `crates/agent-vitals-runtime/src/billing_preview.rs::confirmation_groups` | 组键改 `host × model_vendor × route_state`；每组带 `auto_verdict{provider_id, route, billing_mode, plan, anchor_day, basis[], confidence}`；workbuddy 直接排除 | §5.1 |
| A7 | `crates/agent-vitals-data/src/authority_query.rs::SQL_UNRESOLVED_BILLING_GROUPS` | 分组列去掉 `model_id`（模型进 `models[]` 子列表），加 `provider_raw`；待处理投影同步 | §5.1 |
| A8 | `apps/desktop/src-tauri/ui/workbench.js` | 列表三态渲染；「确认」直写声明（`evidence_ref=auto:…`）；弹窗只剩 L3 步骤；订阅步改为确认扣款日/月费；`<unknown>` 不上卡面 | §4/§5 |
| A9 | `apps/desktop/src-tauri/src/lib.rs::validate_desktop_declaration` | 系统判定确认的声明允许 `effective_start = subscriptionCreatedAt`（早于本月）；`effective_end` 仍 ≤ 今天 | §5.2 |
| A10 | `tests/`：`test_pricing_lockstep.py`（新目录段）、hosts 单测（每种 ID 形状一条 fixture）、`billing_preview` R-测（verdict 三态）、隐私测（任何 DTO/导出/日志不含 email/accountUuid） | | §7 |

阶段 2（A11）：`sync_service` 在 ingest 后跑 `auto_attribute()`，对满足 §5.3 条件的组写系统声明并入队；撤销与用户声明同一机制。

## 7. 不变量与验收

- P1 隐私：`oauthAccount` 只读 `organizationType/billingType/subscriptionCreatedAt`；测试 grep 所有 DTO、`data-export-*`、诊断包不出现 `emailAddress`/`accountUuid`/`organizationUuid`。
- P2 `Inferred` 不产订阅：任何 `evidence_basis=inferred` 的事实在没有用户确认前 `billing_mode` 只能是 `metered`。
- P3 冲突不吞：L0 厂商与 L1 形状矛盾 → `Conflict`，进「仍待确认」，不进自动判定。
- P4 词表不漂：`provider_id`/`by_provider`/MCP `cost_breakdown` 键与语义不变；`model_vendor` 是新增派生字段，`test_host_contract` 与 MCP 冒烟 0 MISMATCH。
- P5 数字守恒：自动归因只写 `billing_fact_attributions`，`usage_facts` 计数与 token 总量不变（`data-reimport-verify`）。
- 本机验收目标：待明确列表 30 组 → **≤ 7 行**（A 1 行确认、B 1 行确认、C 3 个厂商各 1 行一问、D 2 行）；A+B 确认后本月未归属 tokens 从 10.1B 降到 ≤ 3.3B。

## 8. 待拍板

- **D1 读 `oauthAccount` 三字段**：属于此前暂停的凭据文件评审范围；本规格建议作为白名单例外放行（只读属性、不读令牌、不出 DTO）。不放行则 A 类退化为"官方路由已定、订阅需用户点一次"——仍比现在少 44 个问题。
- **D2 阶段 2 的自动写声明**：REQ-018 允许"自动应用并展示依据"，主链规格 §2.3 把声明定义为用户回答；建议用 `evidence_ref=auto:` 前缀区分系统声明，且系统声明可被用户声明 supersede。
- **D3 `model_vendor` 派生 vs 入库**：建议派生（无 schema 变更、无 raw 改写）；代价是每次读要跑一次前缀匹配（目录 < 20 条，可忽略）。
- **D4 C 类的"官方端点 vs 中转"**：能否再从 `message.id` 形状更细分（例如 DeepSeek 官方 vs 胜算云的 hex 长度/前缀）？本规格不承诺，留作 Inferred；若真机样本能证明形状唯一，可升到 `SessionNative`。

## 9. 顺序

1. A1 + A2 + A6/A7 + A8 的列表三态（先让列表**显示**程序能判定什么，但确认仍手动）——这一步不碰适配器与账户读取，零隐私风险，列表立刻从 30 行收敛到按厂商的 ≤ 10 行。
2. A3 + A4（claude-code 路由证据）——A 类变成"官方路由已定"。
3. D1 拍板后 A5（账户证据）——A/B 变成一键确认。
4. A9 + 弹窗收敛 + 测试。
5. 阶段 2（A11）单独评审。

## 10. 可扩展性：归因特征模板化，让新宿主 / 新厂商 / 新模型快速接入

### 10.1 先看七个宿主各自给了什么（本仓库已评估的宿主）

| 特征 | claude-code | codex | dsh | workbuddy | pi | hermes | cline |
|---|---|---|---|---|---|---|---|
| 模型名（raw） | ✅ | ✅ | ✅ | ✅ | ✅ `modelId` | ✅ | ✅ `metadata.modelId`（带厂商前缀 `anthropic/…`） |
| 宿主自报 provider | ✗ | `model_provider`（openai / custom） | `provider_raw` | ✗（设计如此） | `model_change.provider` | `billing_provider`（`minimax-cn` / `auto`） | `provider` + `modelInfo` |
| 端点 / base_url | 启动环境变量，日志不记 | `config.toml [model_providers.*].base_url` | ✗ | ✗ | `models-store.json` | `.env`（凭据文件，**不读**） | `providers.json` |
| 请求 / 响应 ID 形状 | ✅ `requestId` + `message.id`（§1.2） | 部分 | ? | ✗ | ? | ? | ? |
| 账户 / 套餐证据 | `oauthAccount.{organizationType,billingType,subscriptionCreatedAt}` | `auth.json auth_mode` + 配额快照 `plan_type` | ✗ | credit 积分 | ✗ | ✗ | ✗ |
| 宿主自报成本 | ✗ | ✗ | ✗ | credit（非货币） | ✅ per-message `usage.cost`（provider-reported） | 列全 0 | ✅ `totalCost` + per-message |
| 本地价卡缓存 | ✗ | ✗ | ✗ | ✗ | `models-store.json` | `models_dev_cache.json`（213 provider / 7,126 带价） | 4 个网关的 `*_models.json` |

结论：**没有一个特征是七个宿主都有的，但每个宿主都至少有两个**——所以归因不能是"每个宿主一套写死的 if"，也不能是"一套字段人人必填"，而应是一条**证据阶梯 + 可插拔的证据提取器**：宿主声明它能提供哪些提取器，缺的就是 `missing`，不猜。

### 10.2 三层拆分：什么必须写代码，什么能做成模板（数据）

| 层 | 内容 | 形态 | 新宿主接入要做的 | 新厂商 / 新模型接入要做的 |
|---|---|---|---|---|
| **① 线格式适配器**（已有） | 文件发现、JSONL/SQLite/zstd 解析、会话身份、token 桶语义与去重（`(turn,step)` vs `total_token_usage` 签名等） | **代码**（`hosts/<h>/sources`），不可模板化——每个宿主的去重规则都是踩过坑的 | 写一个（现状不变） | 不需要 |
| **② 证据提取器**（本规格新增） | 从 ① 的记录/配置里取出 `AttributionEvidence` 候选：厂商前缀、ID 形状、端点、provider_raw、账户属性、自报成本 | **模板 + 少量代码**：一份宿主 `AttributionProfile`（声明用哪些提取器、字段在哪个 JSON 指针/文件），提取器本身是通用实现 | 填一份 profile（大多数宿主 5–10 行） | 不需要 |
| **③ 判定器**（`agent-vitals-provider`） | 证据阶梯 L0–L3 的合成规则：强度比较、冲突判定、订阅判定 | **代码，宿主无关**；厂商知识全部外置到签名目录 | 不需要 | 不需要 |
| **④ 厂商签名目录**（本规格新增数据） | 每个厂商：模型名前缀/正则、`vendor/` 前缀命名约定、请求/响应 ID 形状、官方端点主机名、套餐标记、价卡引用 | **纯数据**（`assets/attribution_signatures.json`，与 `pricing.json` 同一 lockstep 纪律） | 不需要 | 加一条签名（新模型通常只是前缀已覆盖，零改动） |

现状对照：③ 里现在混着厂商知识——`provider/src/lib.rs` 的 `is_cogfoundry_host` / `is_openai_host` / `Some("openai") =>` / `model_provider == Some("openai")` 全是写死的（`:85-99`、`:140-156`）；`billing_route_of` 只认 `catalog_2026_09.billing_modes` 里的两条 deepseek。**模板化的第一步就是把这些常量搬进 ④**，判定器只剩阶梯规则。

### 10.3 有普适性的特征（可以进 ④ 的签名目录）

按"跨厂商稳定、跨宿主可得"排序：

1. **模型名族**（L0）：每家厂商的命名前缀稳定多年（`claude-`、`gpt-`/`o`、`deepseek`、`MiniMax-`、`glm-`、`kimi`/`moonshot`、`hy`/`hunyuan`、`qwen`、`gemini`、`llama`）。普适性最高；新模型 95% 落在已有前缀里。
2. **`vendor/model` 前缀命名**：OpenRouter / 胜算云 / Vercel Gateway / Cline 的通用约定——**名字本身就说明走了网关**，且前缀 = 模型厂商。这是"中转"最廉价的判定特征，七个宿主里 codex-custom、cline、hermes 都能用。
3. **请求 / 响应 ID 形状**（L1）：每家 API 的 `id` 格式是文档级稳定的（Anthropic `msg_01…` / `req_01…`、OpenAI 兼容 `chatcmpl-…`、智谱 `msg_20…` 时间戳式、MiniMax/DeepSeek 32 位 hex）。只要宿主把原始响应写进日志就能用（claude-code 已证实；cline/pi 待核）。
4. **官方端点主机名**：`api.anthropic.com`、`api.openai.com`、`api.deepseek.com`、`open.bigmodel.cn`、`api.minimax.chat`……配置里出现即 `ConfigCurrent`，会话里出现即 `SessionNative`。`normalize_host` 的边界匹配逻辑已有，只是主机名表要外置。
5. **宿主自报 provider 的词表映射**：`minimax-cn` → minimax、`auto` → unknown、`custom` → 中转——每个宿主一张小表，放 profile。
6. **账户 / 套餐标记**：形状各异（claude 的 `organizationType`、codex 的 `auth_mode`、hermes/cline 是"配置里有该 provider 的 key 存在"→ 按量），但**抽象一致**：`AccountEvidence{plan_kind: subscription|api_key|credits|unknown, anchor_date?, channel?}`。profile 里声明"文件 + 字段白名单 + 取值映射"，读取器通用；**白名单之外一律不读**（隐私守卫跨宿主一次写好）。
7. **宿主自报成本**：`provider-reported`（pi）> `host-reported`（cline totalCost）> `credits`（workbuddy）> `none`（hermes 全 0）；这是 `ATTRIBUTABLE_WASTE` §3 的 basis 分级，已有，只需 profile 声明字段位置。

### 10.4 不能模板化、也不该模板化的

- **去重与 token 语义**（①）：Codex 的 `total_token_usage` 签名去重、DSH 的 `(turn,step)`、Claude 的 message.id 去重——错一个就是 2–3 倍重复计数（memory：claude ledger 重复计数事故）。这是代码 + 回归测试，不是配置。
- **冲突裁决**：L0 说 anthropic、L1 形状不是 Anthropic 的 → 只能 `Conflict` 进待确认；模板不能替用户裁决（REQ-031）。
- **中转的价卡**：网关的价格是商业信息，可以从 models.dev 快照给 `catalog-fallback` 档，但不能冒充 `provider-reported`（Hermes 评估 §5）。

### 10.5 新厂商 / 新模型怎么"自己归因"

三条来源，按可信度：

1. **签名目录快照**（④）：随版本发布的 `attribution_signatures.json`；models.dev 的本地镜像（Hermes 已缓存 7,126 带价模型）可以作为**生成**这份快照的上游——离线生成、进仓库、走 `test_pricing_lockstep` 守卫，不在扫描时联网（CLAUDE.md 供应链约束不变）。
2. **本地学习**：用户在弹窗里答过一次"`openai/gpt-5.6-*` 走的是胜算云"，系统把它写成本地签名（`pricing-overrides.json` 的 `routes` 已经是这个机制——`model_prefix → provider`；扩展成 `signatures: {model_prefix|id_shape|endpoint → provider}`），下次同厂商新模型直接命中，不再问。
3. **启发式兜底**：未知前缀 + 无 ID 形状 + 无端点 → 诚实 `missing`，进待确认；**不做"看起来像 X"的猜测**。

### 10.6 与现有架构的落点

- ④ 签名目录：`assets/attribution_signatures.json`（Rust `include_str!`、Python `json.load`、dsh-client 复制），三方 lockstep 测试与 `pricing.json` 同款。
- ② `AttributionProfile`：放进已有的 `contracts/host_capability.rs::HostProfile`（它已经按宿主声明 `signals`、`degraded_rules`、`fold`），新增 `attribution: &'static AttributionProfile { extractors: &[…], provider_raw_map: &[…], account_evidence: Option<AccountSource>, cost_report: CostBasis }`。注册路径 fail-closed 的纪律不变：不在 `HOSTS` 里的宿主任何提取器都不跑。
- ③ 判定器：`agent-vitals-provider::resolve_billing_attribution` 改为接收 `&[AttributionEvidence]` + `&SignatureCatalog`，删除所有厂商常量；现有 `EvidenceBasis` 强度表不变。
- 通用提取器实现放 `crates/agent-vitals-hosts/src/attribution/`（宿主无关，纯函数，wasm 可链）；I/O 型提取器（读配置/账户文件）挂 `sources` feature。

### 10.7 一个新宿主的接入清单（目标：半天）

1. ①：线格式适配器（已有流程，不变）。
2. ②：在 `HostProfile` 里填 `attribution`：模型字段路径、provider_raw 字段 + 映射表、ID 字段路径（如有）、端点来源（会话字段 or 配置文件 + 键）、账户证据文件 + 字段白名单（如有）、自报成本字段 + basis。
3. 跑同一套 `attribution` 夹具测试：每个提取器一条"有 → 命中 / 无 → missing"的用例；隐私测试自动覆盖新白名单。
4. 不用改判定器、不用改 UI——列表三态和弹窗读的是 `auto_verdict`，宿主无关。

Cline 就是现成的验证对象：`metadata.modelId = anthropic/claude-sonnet-4.6` 命中 10.3 第 2 条（网关命名），`providers.json` 命中第 4 条，`totalCost` 命中第 7 条——三条都是模板层就能吃下的，不需要为 Cline 写一行归因代码。
