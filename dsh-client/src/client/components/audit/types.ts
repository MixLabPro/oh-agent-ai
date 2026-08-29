// 审计 tab 共享的数据形状 —— 全部来自宿主投影（useProjection），逐个对应
// dsh-client/src/host/index.ts 里注册的一个 projection。拆出来是因为原来
// AuditView.tsx 一个文件 1678 行，这些 interface 散在组件之间，改一个投影的
// 形状要在文件里跳好几处才能找全所有用到它的地方。

export interface Finding {
  rule: string
  severity: string
  category: string
  tool_name: string | null
  evidence: string
  seq: number | null
  time: number | null
  // 定位坐标。三者覆盖率天然不齐（真实日志：tool/call 三者全有，
  // approval/asked 只有 call_id，tool/result 没有 call_id），null 是常态不是异常。
  turn: number | null
  step: number | null
  call_id: string | null
  // 宿主注入（core 看不到 sessionId，它不在事件流里）。标记按它隔离。
  session_id: string
  evidence_recency: string
  // G2（GOVERNANCE_BACKLOG.md）：[seq, run_end_seq] 是这条 finding 真实覆盖
  // 的区间终点，只有 SV611/612/613 填真实值，其余恒为 null——不是"缺失"，
  // 是"这类判定没有区间概念"，见 core `trajectory.rs::finding` 的文档注释。
  // 可选：只有 `behaviorFindings` 投影的 schema 真正声明并保证这个键存在
  // （对应 core 的 12 键 finding 形状）；`structuralWaste`（waste.rs 独立
  // 构造，不经过 match_behavior/match_trajectory）没有这个概念，其 schema
  // 也没声明它——不把这里定成必填，否则 `WasteFinding extends Finding`
  // 会强迫一个 waste finding 真实不存在的字段。
  run_end_seq?: number | null
}

// loopCosts 投影：SV611/612/613 的 [seq, run_end_seq] 区间对齐出来的真实
// token/费用消耗（G2）。宿主按 (rule, seq) 折算好，客户端用同一个 key 拼回
// 对应的 FindingGroupedRow——不直接长在 Finding 上，因为这是宿主的派生值，
// 不是 core finding 本身携带的字段（那份 schema 由 core 的 12 键形状决定）。
export interface LoopCost {
  rule: string
  seq: number
  tokens: number | null
  cost: number | null
}

export interface Usage {
  uncachedInputTokens?: number
  outputTokens?: number
  cacheReadTokens?: number
  cacheWriteTokens?: number
}

export interface ModelBucket {
  uncached_input_tokens: number
  output_tokens: number
  cache_read_tokens: number
  cache_write_tokens: number
  peak_uncached_input_tokens: number
  peak_output_tokens: number
  peak_cache_read_tokens: number
  peak_cache_write_tokens: number
}

export interface TokenByModel {
  by_model: Record<string, ModelBucket>
  sequence: string[]
  // 宿主从未上报过的 usage 字段名。真实会话里 cacheWriteTokens 一次都不出现，
  // 而折叠为了求和仍按 0 累加——显示成「缓存写 0」就是把「宿主不报」伪造成
  // 「测到了 0」。有这个列表，展示层才能写「未上报」。
  unreported_fields?: string[]
}

// costReport 投影的形状（宿主算钱，见 host/index.ts::costReportFrom）。没有
// 可分桶的桶时四个金额字段是 null，不是 0——跟 Rust/Python 的 cost_report
// 返回 None 同一语义，只是 DSH 的 register() 需要固定 schema 才拆成这样。
export interface CostReport {
  currency: string | null
  estimate_disclaimer: string | null
  total: number | null
  peak_total: number | null
  // cache_read_cost 是 total 内部的切面（缓存命中那部分花了多少钱），不是
  // 另一个桶——加起来会重复计算。见 host/index.ts::bucketPrice。
  /** `pricing_basis`：'provider' = 用了这家自己的报价；'fallback' = 回落原厂
   *  报价；'ambiguous' = 同一模型被多家服务过、归属不明。后两者展示层必须
   *  写明依据——按别家的价估出来又不说，就是冒充实价。 */
  per_model: Record<string, {
    short_name: string
    provider: string | null
    pricing_basis: 'provider' | 'fallback' | 'ambiguous'
    priced_with: string
    total: number; peak: number; cache_read_cost: number
  }>
  unpriced_tokens: number
  /** FR-04「费用」纵轴：截至该请求的累计费用（宿主算，浏览器不重算单价）。 */
  series?: { request_seq: number; cumulative: number }[]
  priced_requests?: number
  total_requests?: number
  status?: 'complete' | 'partial'
  missingFields?: string[]
}

// requestMetrics 投影：逐请求一行。这里只用它算上下文峰值——**每个可空字段
// 的 null 都是「宿主没上报」而不是 0**，求最大值时要跳过而不是当 0 参与。
export interface RequestRow {
  request_seq: number
  seq: number | null
  turn: number | null
  step: number | null
  model: string
  context_window: number | null
  context_tokens: number | null
}

export interface RequestMetrics {
  requests: RequestRow[]
  status?: 'complete' | 'partial'
  missingFields?: string[]
}

export interface ContextPeak {
  tokens: number
  window: number | null
  pct: number | null
  turn: number | null
  requestSeq: number
  /** 参与计算的请求数 / 总请求数——分母缺口要说得清，不能假装全量算过。 */
  measured: number
  total: number
}

// F4: findings sharing a (rule, evidence) pair collapse into one row with a
// ×N badge — the doc's example (14 distinct write/edit paths) never merges,
// only literal repeats (same command run N times) do.
export interface FindingGroupedRow {
  key: string
  rule: string
  severity: string
  category: string
  tool_name: string | null
  evidence: string
  count: number
  seqs: number[]
  latestSeq: number | null
  latestTime: number | null
  evidence_recency: string
  /** 最近一次命中的坐标——时间线定位与展开详情都要它。 */
  turn: number | null
  step: number | null
  call_id: string | null
  /** 结构性浪费独有（SV-COST-*）；行为 finding 上不存在。 */
  waste_tokens?: number
  suggestion?: string
  /** 这段循环真实烧了多少（G2，SV611/612/613 独有）；null 表示区间内算不出。
   *  是这一行合并进来的**全部**命中之和，不是只取最近一次（见 derive.ts::
   *  linkLoopCostToFindings 头部注释——这条曾经是真实审计发现的低估 bug）。 */
  loop_tokens?: number | null
  loop_cost?: number | null
  /** 参与上面求和的命中次数——用于详情文案区分"这段循环"（1 次）与"这 N 次
   *  命中累计"（>1 次），不把多段命中的合计说成一段。 */
  loop_occurrences?: number
  /** DOM id，供时间线点击定位；在 AuditView 里统一分配。 */
  domId?: string
  /** 同 turn 的行为 finding 规则名——浪费行用它标注"同一起事件"。 */
  xrefRules?: string[]
}

// contextComposition 投影：常驻前缀的分类估算。三项都可空——**「日志里没有
// skill-catalog 事件」和「发布了一个空目录」是两回事**，null 要能写成"未知"
// 而不是"0 个技能"。
export interface ContextCompositionData {
  system_tokens: number | null
  tools_tokens: number | null
  catalog_tokens: number | null
  catalog_entries: number | null
  resident_total: number | null
  estimator: string
  status?: 'complete' | 'partial'
  missingFields?: string[]
}

// compactionEvents 投影：✂ 标记 + 宿主实测的被丢弃 token 数。
export interface CompactionReport {
  compactions: { compaction_id: string | null; start_seq: number | null; turn: number | null; has_summary: boolean }[]
  prunes: { seq: number | null; turn: number | null; shadowed_token_count: number | null }[]
  pruned_tokens_total: number
  prunes_without_token_count: number
  status?: 'complete' | 'partial'
  missingFields?: string[]
}

// structuralWaste 投影：finding 的形状 + waste_tokens/suggestion 两个字段。
// 所以它能直接并进同一条队列——**浪费本来就是一种 finding**，单开一个区块
// 会让用户在两个地方找同一起事件。
export interface WasteFinding extends Finding {
  waste_tokens: number
  suggestion: string
}

export interface StructuralWaste {
  findings: WasteFinding[]
  status?: 'complete' | 'partial'
  missingFields?: string[]
}

// preForkUsage 投影：上游会话在分叉点之前已消耗的量。主口径已经把它滤掉了
// （不重复计费），这份数据只用来在展开详情里说清"你看到的数字为什么变小了"。
// forked=false 表示压根没分叉——不是"分叉了但上游花了 0"，两者要分开说。
export interface PreForkUsage {
  forked: boolean
  boundary_seq: number | null
  /** 上游四桶之和；没分叉时 null。 */
  tokens: number | null
  /** 上游金额；上游全是未知模型时 null（估不出来），不是 0。 */
  cost: number | null
  /**
   * 分叉起点继承过来的上下文占用（= 上游最后一次请求当时的 context_tokens）。
   * **不是 `tokens`**——那是上游累计花掉的流量，差着数量级。费用/Token 是
   * 流量不继承，上下文是存量要继承，这两个字段分别代表那条线的两边。
   */
  inherited_context: number | null
  inherited_window: number | null
  status?: 'complete' | 'partial'
  missingFields?: string[]
}

// subagentSpawns 投影：本会话派出的子代理。父子会话的**唯一权威链路**——
// 子会话头里的 parentSession 不可靠（见 core subagent.rs 的模块注释）。
export interface SubagentSpawn {
  seq: number | null
  time: number | null
  turn: number | null
  step: number | null
  call_id: string
  /** 回执没到时为 null：「调用发生了但还没拿到 id」不是「没派活」。 */
  agent_id: string | null
  description: string | null
}

export interface SubagentSpawns {
  spawns: (SubagentSpawn & {
    /** 从子代理自己那份会话日志折出来的；读不到时 null，**不是 0**。 */
    cost: number | null
    tokens: number | null
    findings: number | null
    /** 子会话自己事件流的时间跨度（首尾 time 之差）——原生 DSH UI 会显示
     * 子代理跑了多久，这是同一个数字的来源。读不到日志时 null，不是 0。 */
    duration_ms: number | null
  })[]
  total_cost: number | null
  status?: 'complete' | 'partial'
  missingFields?: string[]
}

// skillAudit 投影（T5/T6）：Skill 执行审计的聚合数据。
export interface SkillInvocation {
  name: string | null
  trigger_mode: 'explicit' | 'model_selected'
  load_status: 'loaded' | 'failed' | 'incomplete'
  duration_ms: number | null
  seq: number | null
  time: number | null
  turn: number | null
  step: number | null
  call_id: string | null
  request_seq: number | null
  missing_fields: string[]
  /** T6：子 Agent 关联——这次调用有没有进一步派生出一个子 Agent。
   *  model_selected 有 call_id → agent_id；explicit 无。 */
  agent_id: string | null
  /** P0-01：这条调用是在哪个会话里发现的——`null` 是主会话；否则是发现它
   *  的那个子会话的 agent_id。跟上面的 `agent_id` 是两个不同的问题（那个
   *  问的是"这次调用有没有派生出子 Agent"，这个问的是"这次调用本身在哪"）。 */
  source_agent_id: string | null
  /** 0 = 主会话，1 = 直接子会话。当前只支持这一层，不递归到孙子代理
   *  （见 host/index.ts::subagentUsage 头部注释的范围说明）。 */
  depth: number
}

export interface SkillAudit {
  invocations: SkillInvocation[]
  sessions_discovered: number
  /** null = 还没有任何子代理，或 projection 未就绪。 */
  sessions_covered: number | null
  missing_sessions: string[]
  /** P0-01：key 是真实 skill 名（缺名的调用归进 'unknown'），value 是跨
   *  主会话与全部已覆盖子会话的调用次数之和。 */
  coverage_by_skill: Record<string, number>
  status?: 'complete' | 'partial'
  missingFields?: string[]
}

// skillAttribution 投影（阶段 B-3）：本会话（source_agent_id === null）
// 每次 Skill 调用按 [本次.seq, 下一次.seq) 区间归因出的 finding 数/工具
// 调用数/token/费用（host/index.ts 的注释有完整的边界定义与近似说明）。
// 用 `seq` 跟 `SkillInvocation.seq` 拼回——**只能对 source_agent_id ===
// null 的调用查这张表**，子会话调用的 seq 来自另一条独立事件流，数值
// 偶然相同不代表同一个位置。
export interface SkillAttribution {
  seq: number
  findings: number
  tool_calls: number
  tokens: number | null
  cost: number | null
}

// durationAudit 投影（D1–D3/D6）：执行时长审计。四路各自独立配对，字段形状
// 见 crates/agent-vitals-core/src/duration.rs 的模块文档——core 是单一真相源。
export interface ToolCallDuration {
  call_id: string
  tool_name: string | null
  load_status: 'loaded' | 'failed' | 'incomplete'
  duration_ms: number | null
  seq: number | null
  turn: number | null
  step: number | null
  missing_fields: string[]
}

export interface TurnDuration {
  turn: number
  duration_ms: number | null
  seq_start: number | null
  seq_end: number | null
  ended_reason: string | null
  load_status: 'loaded' | 'incomplete'
  missing_fields: string[]
}

export interface StepDuration {
  turn: number
  step: number
  duration_ms: number | null
  seq_start: number | null
  seq_end: number | null
  load_status: 'loaded' | 'incomplete'
  missing_fields: string[]
}

export interface ApprovalLatency {
  id: string
  tool_name: string | null
  wait_ms: number | null
  outcome: string | null
  status: 'decided' | 'pending'
  turn: number | null
  step: number | null
  seq: number | null
  missing_fields: string[]
}

export interface DurationAudit {
  tool_calls: ToolCallDuration[]
  turns: TurnDuration[]
  steps: StepDuration[]
  approvals: ApprovalLatency[]
  status?: 'complete' | 'partial'
  missingFields?: string[]
}

// FR-10 个人复核备注。**这里曾经是「安全 / 高危 / 忽略」三态标记**，是照着
// docs/AUDIT_TAB_DESIGN.md §6.3 的 F3 做的——那份设计稿已被 V1.6 PRD 取代。
// PRD §3.2 把「把个人备注当作风险已解决的证明」列进了明确不做的事，§3.3 又
// 写死「任何控制按钮存在的前提是它背后有真实生效的能力」：审计 Tab 不能暂停
// Agent、不能拦工具、不能改审批策略，那么「忽略」「安全」这种读起来像已处置
// 的按钮就是在暗示一种并不存在的干预能力。换成纯粹的阅读记录。
//
// 与旧标记的三条硬性差别（FR-10）：
//   - 备注**不得**删除、修改、隐藏或重排原始 finding（旧的三态会把 ignored
//     移出主列表、把 high-risk 置顶、把 safe 淡化并沉底——全部取消）；
//   - 删除要能撤销；
//   - 只属于当前 session + 当前浏览器资料，不跨会话继承。
export type Note = { text: string; updatedAt: number }
