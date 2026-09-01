# 可归因浪费定义(北极星指标的真相源)

> 状态:**修订稿 v2**(2026-09-01)。v1 被评审推翻三处 P0,本文是修订结果:
> ①「98.7%→1.3%」不是浪费率;②四类归因粒度不同,不能相加;③「必须 measured」
> 与各定义实际证据属性冲突,需 basis 分离 + 覆盖率护栏。**评审原文即本文件的
> 「defect 记录」**——v1 的每个错误都在这版有对应的修复说明。
>
> 关联:[COST_BASELINE.md](./COST_BASELINE.md)(实测快照,含语料期纪律)·
> [CLAUDE_CODE_CORPUS.md](./CLAUDE_CODE_CORPUS.md)(Claude Code 快照,四模型族分栏)·
> [WINGLET_CAVEMAN_BENCHMARK.md](./WINGLET_CAVEMAN_BENCHMARK.md)(单边收据论证)·
> [PRODUCT.md](./PRODUCT.md) · [plan.rs](../crates/agent-vitals-core/src/plan.rs)(诚实性规则先行者)·
> [waste.rs](../crates/agent-vitals-core/src/waste.rs)(SV-COST-01/02 已落地)。
>
> **一句话**:北极星 = **确认可归因浪费率** = 确认浪费成本 ÷ **eligible audited cost**;
> 护栏 = **审计覆盖率** = eligible audited cost ÷ observed priced cost。本文钉死
> 「确认浪费 / 估算机会 / 待复核异常」三块如何区分,以及哪些**不许**进分子。

---

## 1. 为什么是「一主一护栏」

完整论证见 `WINGLET_CAVEMAN_BENCHMARK.md` 与 `COST_BASELINE.md`。决定本定义的三条硬约束不变:

1. **不是「省了多少钱」**——省多少要么反事实、要么基准差,都不可复核;且 Codex 订阅制、DSH 按量,绝对钱数不可统一。
2. **必须是 measured 的**——每一笔浪费点名、带证据,不许估算冒充测量。
3. **必须跨宿主可比**——无量纲比例,币种隔离。

v2 新增第四条,直接来自评审:**分母必须诚实**。用总成本作分母,一个什么都测不到的宿主会得到漂亮的 0% 浪费率——所以「确认浪费 ÷ eligible audited cost」必须与「审计覆盖率 = eligible audited cost ÷ observed priced cost」同屏展示。**eligible** 的定义:usage 四桶完整、事件流可归因的请求成本;缺列即不合格(缺列不编列)。

产品层三栏呈现:

```
确认浪费率       2.8%     ← 进北极星(仅 measured / 稳定 human-confirmed)
审计覆盖率      71.4%     ← 护栏,同屏
估算优化机会    184K tokens ← 展示金额与 token,不进北极星
待复核异常       3 sessions ← 只展示会话与证据
单位 token 成本  ¥x.xx / M ← 效率视角,不进分子(§6)
```

---

## 2. 为什么四类不能相加(v1 最核心的修订)

v1 的 `W1+W2+W3+W4` 可加总假设**不成立**,因为归因粒度不同:

| 类别 | 归因粒度 |
|---|---|
| W1 缓存 | 请求级输入 token |
| W2 重复调用 | 工具执行 / 工具结果 |
| W3 长尾 | 整个 session |
| W4 常驻僵尸 | 跨 session 的常驻上下文 |

重复工具结果会进入后续输入(同时落入 W1);skill 描述也可能属于 cached/uncached 输入。**当前日志没有 token-span 级血缘**,无法知道某一段输入成本究竟属于哪一类,因此 `W1→W2→W3→W4` 优先扣减顺序无法实现。

所以:**四类并列诊断,不相加**。可加总需要统一声明,并证明多个 claim 不占用同一笔 request/token amount(互斥证明):

```rust
WasteClaim {
    request_id,         // 命中的请求 / usage 证据
    category,           // 类别
    token_bucket,       // input / cache_read / output / …
    amount,
    pricing_basis,      // priced-at-catalog / estimated / unpriced
    measurement_basis,  // 数量怎么测的(§3)
    attribution_basis,  // 归因是否被证明(§3)
    source_refs,        // SV 码 / 事件流引用
}
```

---

## 3. Basis 体系:「必须 measured」与具体定义的和解

v1 声称「必须 measured」,但四类里严格 measured 的部分很少。**单个 basis 字段不够**,分离成三个维度:

```text
measurement_basis: measured | derived | estimated | suspected | unavailable
attribution_basis:  measured | inferred | human-confirmed
pricing_basis:      priced-at-catalog | estimated | unpriced
```

basis 取值表(当前证据属性,诚实标出):

| 类别 | measurement | attribution | 能否进确认分子 |
|---|---|---|---|
| W1 缓存低命中 | suspected | —(事故证实后 confirmed) | 否,默认告警 |
| SV-COST-01 重复相同结果 | **estimated**(`est_tokens × (n−1)`——est_tokens 是估算器,量出的不是实付 token) | inferred(「第一次是必要」是假设) | 否,估算机会 |
| SV-COST-02 失败重试上下文增长 | **measured**(request_metrics 前后差值) | **inferred**(期间还含 assistant 输出等,不能证明全部由失败造成) | 否,估算机会 |
| W3 长尾 session | observed anomaly | **human-confirmed**(复核后) | 复核确认的具体请求/金额才进 |
| W4 常驻上下文 | estimated | — | 否,估算机会 |
| 真实重复计费请求(两份 usage 证据) | measured | attributable | **是** |

只有 `measured`(且 attribution 可证明)或带稳定复核记录的 `human-confirmed` 才能进入「确认浪费」分子。

---

## 4. 分类定义(六类 + 一条会计排除)

### W1 Cache Inefficiency Suspect(原名「缓存未命中」,降级为嫌疑)

| 项 | 定义 |
|---|---|
| **是什么** | 命中率低于阈值**只产生告警**,不直接归因。改名为嫌疑——「本可命中」是推测,不是测量 |
| **eligibility(全部满足才可评估)** | provider 缓存语义已知;排除首次请求;按模型族分别计算;排除模型切换边界;最小请求数;usage 四桶完整;会话路径已线性化 |
| **阈值** | 90% 是**默认告警阈值**,不是归因阈值——DSH 93% / Codex 95.7% 两个总体值推不出所有模型/任务/宿主共用 90%;按宿主+模型族校准 |
| **升级为 attributable 的路径** | 已知缓存事故 / 稳定前缀证据 / 受控前后实验 |
| **金额公式(即使估算,也是增量价差,不是全部未缓存费用)** | `excess_miss = max(0, uncached − (1−target_hit_rate) × eligible_input)`;`estimated_waste_cost = excess_miss × (uncached_price − cache_read_price)`;结果标 `estimated` |
| **诚实性边界** | 首次请求、模型切换、provider 差异、分支/恢复、compaction、TTL、system prompt/工具列表变化、正常新增上下文——全部**不是**浪费,是数据属性 |

### W2 拆四(不再是一个可相加类别)

v1 把三个不同概念混在一个 W2 里,拆开:

| 概念 | 语义 | 进分子? |
|---|---|---|
| **AccountingShadow** | Codex `custom_tool_call{exec}` ↔ `CommandExecution` 是同一逻辑执行的两种日志表示,不是第二次计费。**ingestion 去重**,浪费成本为零 | 永远不算 |
| **RepeatedToolCall**(SV611) | 连续相同 `(name, args)` 签名 ≥3 次(代码现状,`trajectory.rs`)。行为告警:不证明调用无必要,**不计算费用** | 否 |
| **RepeatedIdenticalResult**(SV-COST-01) | 跨 turn 同名同参得到**完全相同结果**(`waste.rs` 已落地)。结构性浪费机会:`waste_tokens = est_tokens(内容) × (次数−1)`——第一次是必要工作,后续每次是纯浪费 | estimated,进估算机会 |
| **DuplicateProviderRequest** | 两个真实 usage/request 证据指向同一逻辑计费(Codex shadow 之外的双份)。**只有证据齐全才算 confirmed waste** | 是(measured) |

工具调用本身通常不是 LLM 计费原子——**不能直接把「第二个 tool call」折算成模型成本**,必须关联到后续 request usage。

### W3 Review Queue(原名「长尾异常」,移出分子)

- 长尾 ≠ 浪费,复核前不计数——v1 已承认,本版**贯彻到底**:不存在 `W3_flag_cost`。
- `median × 10` 必须按宿主、模型、时间段、请求数或任务规模**分组**,否则一个合法的大型 session 必然被标异常。
- 人工确认后记录的是**明确的浪费请求或金额**,不是「整个异常 session」:

```text
session_key | session_revision | confirmed_request_ids | confirmed_amount
| reviewer | reviewed_at | rationale
```

不带 revision 与 reviewer 的确认记录,在 session 更新、价格表更新或重复审核后无法复现。

### W4 Resident Opportunity(原名「常驻僵尸资源」,降级为估算机会)

| 项 | 定义 |
|---|---|
| **展示形式** | `estimated resident opportunity = estimated tier1 tokens × observed/declared exposure count`(启动次数取 plan.rs 的 `startup_rate`——只有用户显式提供,没有可靠月度数据就填 `unavailable`) |
| **为什么不进 measured** | `tier1_tokens` 是 tokenizer 估算;`loaded` 只证明 **catalog-visible**,不证明正文被读(`HOST_ADAPTER_CONTRACT.md` 的 `body_loaded_state: null` / `runtime_status: catalog-visible`);`skillUsage=0` 是终身零触发,不证明该 skill 没有发现/约束/安全价值 |
| **升级为 measured 的路径** | 请求头能明确测出该 skill 的实际常驻片段时才可能 |
| **诚实性边界** | 只算 `loaded` 的僵尸(`enabledPlugins` 判定);盘上未 loaded 副本不计 |

### SV-COST-02 失败重试上下文增长(补进四分类的缺口)

v1 四分类完全没提它,但代码已落地(`waste.rs`):连续 ≥3 次工具失败后,通过 `request_metrics` 前后两次请求的 `context_tokens` 差值衡量上下文实际增长。

- **amount = measured**(来自 provider usage 差值);**attribution = inferred**(增长期间还包含 assistant 输出、其他消息,不能证明全部由失败结果造成)——正是「单 basis 不够」的活例,必须拆 `measurement_basis` / `attribution_basis`。
- 与 `waste.rs` docstring 同源的分界:SV-COST-01/02 是**结构性浪费**(规则可直接判定、不需要历史基线);缓存命中率是**相对浪费**(需要基线才能判断)。混进来会破坏 FR-05「**无基线不告警**」——这也是 W1 只能告警、不能进分子的代码侧理由。

---

## 5. 实证修正(v1 的错误解释)

v1 原文:「可归因浪费从占成本的 98.7% 掉到 1.3%——一个修复把浪费率打下来」。

**这是错的。** `COST_BASELINE.md` §2 的 98.7% / 1.3% 是:

```text
bug 前时段成本 / 两个时段总成本
bug 后时段成本 / 两个时段总成本
```

是**时段成本占比**,不是各时段内部的浪费率;两个时段的请求量、任务量未控制一致。

可表述为:

> 缓存修复前时段贡献了全样本 98.7% 的成本,显示缓存异常与高成本高度相关。

**不可**表述为「浪费率从 98.7% 降到 1.3%」。

当前状态:两宿主(Codex / DSH post-08-18)都**还没有可进分子的确认浪费数据**——北极星暂无实测值,这是诚实的现状;`COST_BASELINE.md` / `CLAUDE_CODE_CORPUS.md` 的快照数字全部是「估算机会/告警」级。

---

## 6. 单位 token 成本(效率指标,与浪费率互补,不进分子)

用户的第二个直观数字:「这个月花了多少钱、干多少 token 的活」。它与浪费率是两个不同的问题——浪费率问**浪费了多少**,单位成本问**基础单价多贵**;两者相乘 = 每 token 的浪费成本,同屏呈现。

```
单位 token 成本 = 当月确认成本 ÷ 当月计费口径 token
```

| 宿主形态 | 分子来源 | pricing_basis |
|---|---|---|
| 订阅(Codex / Claude Code 套餐) | 用户填写/确认套餐金额 | **confirmed**(用户确认,从 estimated catalog 升级) |
| 按量(DSH) | 现有 `priced_day` 月成本 | measured(计价引擎) |
| 无确认无账单 | — | unavailable(缺列不编列,绝不拿 catalog 价冒充实测) |

**四条纪律:**

1. **订阅金额输入解决 pricing 缺失**——`CLAUDE_CODE_CORPUS.md` 说「要出钱,先要有四族价格表」;用户确认的套餐金额是**实测月花费**,比 catalog 估算更真,且天然覆盖全家族(Claude Code 四模型族一份套餐全包)。
2. **订阅下省 token ≠ 省套餐钱**(`WINGLET_CAVEMAN_BENCHMARK.md` 论证的镜像):套餐费固定,省 token 让**单位成本下降**——同一套餐干更多活,是**价值指标**不是省钱指标。呈现时必须标注,否则用户看到「浪费率 20%」会误以为「该退订」——错,那是机会成本,不是账单差额。
3. **分母口径跟随账单**:按宿主账单口径计 token(`token_by_date_model` 的 by_model 总和),四桶 raw 总和可并列展示,但不得同名「单位成本」。月份间对比时:token 结构看占比、钱看单位成本——价格表随 LLMflation 漂移,原始 token 不漂。
4. **落地路径**:`month.json` 状态层已有月 token 与按量月成本;新增输入位 = **套餐金额**(用户显式提供,`plan.rs` 的 `startup_rate` 模式:没有就 `unavailable`,不编)。

---

## 7. 诚实性铁律(写进实现,像 `plan.rs` 的 docstring)

1. **证据不足 = 不计**。分子只收 `measured`(attribution 可证明)或带稳定复核记录的 `human-confirmed`;其余进「估算机会」「待复核」两块,永远不在分子。
2. **触发证据缺失 ≠ 零触发**(W4);**首个请求无前缀 ≠ 缓存 bug**(W1);**长尾 ≠ 全浪费**(W3);**影子记录 ≠ 双倍计费**(AccountingShadow)。
3. **标签不因措辞转化**——basis 三字段分离(measurement / attribution / pricing),「命中率低」是观察,「缓存坏了」是结论,互相不许代写。
4. **无反事实数字**。绝不报「若不优化会花 X」。
5. **baseline 必须带语料期标签**:DSH 08-18 前数据(bug 期)不进任何计算(`COST_BASELINE.md` §2);Claude Code 语料缺日期分界,只做 token 结构不做前后对照(`CLAUDE_CODE_CORPUS.md` §6)。
6. **无基线不告警(FR-05)**——结构性浪费(SV-COST)与相对浪费(缓存)分开;混进来用户会觉得系统冤枉自己的正常行为。
7. **分母诚实**——总成本不可作分母,审计覆盖率必须同屏;eligible 缺列即不合格。

---

## 8. 落地状态与动作

**已落地(代码,2026-09-01 核实)**:

- SV-COST-01(重复相同工具结果)与 SV-COST-02(失败重试上下文增长):core `waste.rs` ↔ Python `waste.py` 字节级 parity;wasm 导出 `structural_waste`;behavior 报告集成 `waste` + `waste_coverage`(三态门控,同 SV613/614 的 OR 覆盖)。
- 月 token(`token_by_date_model`)与按量月成本(`priced_day`):`month.json` 状态层,单位成本指标的分母与按量分子已就位。

**未落地(本文定义的需求,按序)**:

1. `WasteClaim` 统一声明(core 类型 + 互斥证明测试)——可加总分子的前提。
2. 审计覆盖率计算:eligible audited cost 的判定(usage 四桶完整 + 事件可归因)进 core。
3. W1 eligibility 实现(按模型族、排除首请求/切换边界、最小请求数)+ 90% 阈值降级为**告警阈值**,按宿主/模型族可配。
4. W3 人工确认记录结构(`reviewer`/`reviewed_at`/`confirmed_request_ids`),复核结果写入带 revision 的记录,可复现。
5. W4 exposure count 来源(启动次数)与 `catalog-visible ≠ body loaded` 的展示拆分。
6. **套餐金额输入位**:订阅宿主每月确认金额(state 层新输入,`startup_rate` 同款「没有就 unavailable」模式)→ 单位 token 成本分子(§6)。
