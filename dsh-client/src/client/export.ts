// FR-12 JSON 导出 —— 纯函数部分。
//
// 为什么单独一个模块：导出按钮此前是「点了没反应」（P0-02）——`window.open('',
// '_blank')` 写个 `<pre>` 根本不是下载，失败也不吭声，直接违反本文件其它地方
// 已经在遵守的「FR-11 不得静默失败」。修的时候顺手把「组装导出内容」和「触发
// 浏览器下载」拆开：前者是纯函数，能直接下断言；后者要碰 DOM/Blob，交给
// AuditView.tsx 里薄薄一层。
//
// 字段完整性按 FR-12 的契约：
//   sessionId / exportedAt / ruleVersion / findings / reviews / usage /
//   costEstimate / pricingVersion / assumptions / missingFields
// 「导出不得省略估算假设和缺失字段」——assumptions 和 missingFields 不是
// 摆设，是把页面上散落各处的「约」「未上报」「估算不是账单」收拢成一份
// 可离线核对的清单。

export interface ExportFindingRow {
  key: string
  rule: string
  severity: string
  category: string
  tool_name: string | null
  evidence: string
  count: number
  seqs: number[]
  turn: number | null
  step: number | null
  call_id: string | null
  waste_tokens?: number
  suggestion?: string
  /** G2（GOVERNANCE_BACKLOG.md）：这段循环（SV611/612/613）真实烧了多少，
   *  是这一行合并进来的全部命中之和。 */
  loop_tokens?: number | null
  loop_cost?: number | null
  loop_occurrences?: number
}

export interface ExportNote {
  text: string
  updatedAt: number
}

export interface ExportPayload {
  sessionId: string
  exportedAt: string
  /** 阶段 A-5（真实审计 2026-08-25 发现，AC-12"导出是否经过 redact 管道"）：
   *  evidence/备注文本里的会话工作区根路径是否被替换成 `<workspace>`。
   *  `false` 不代表"这次没脱敏、不安全"——是"当时不知道工作区根在哪
   *  （sessionCwd 投影未就绪），没有可替换的锚点"，诚实说明比悄悄跳过更
   *  重要。范围只到路径本身：不做内容扫描（找 API key/token 那类），
   *  evidence 原文该是什么样还是什么样，只是不带着本机用户名的绝对路径
   *  一起分享出去。 */
  pathsRedacted: boolean
  /** 当前没有版本号来源——core 的行为规则（SV601–614）不带版本字段。留 null
   *  不是遗漏，assumptions 里会说明。 */
  ruleVersion: string | null
  findings: Array<{
    rule: string
    severity: string
    category: string
    tool_name: string | null
    evidence: string
    occurrences: number
    seqs: number[]
    turn: number | null
    step: number | null
    call_id: string | null
    waste_tokens: number | null
    suggestion: string | null
    loop_tokens: number | null
    loop_cost: number | null
    loop_occurrences: number | null
    note: string | null
  }>
  reviews: Array<{ rule: string; evidence: string; note: string; updatedAt: number }>
  usage: unknown
  costEstimate: unknown
  /** 同 ruleVersion：`pricing.json` 本身没有版本字段，不编一个出来。 */
  pricingVersion: string | null
  /** T10：Skill 执行审计数据——每次调用的触发方式/加载状态/耗时/位置，覆盖率。 */
  skill: unknown
  /** 阶段 B-3：Skill → Finding/工具/费用归因（skillAttribution 投影原样
   *  透传，与 skill/duration 同一种"host 投影直接搬进导出"的模式）。数组
   *  按 seq 与 skill.invocations 里 source_agent_id===null 的调用对应，
   *  边界定义与近似说明见 assumptions（AC-SK-ATTR）。 */
  skillAttribution: unknown
  /** D10：执行时长审计数据——{tool_calls, turns, steps, approvals}（durationAudit
   *  投影的原样透传，与 skill 同一种"host 投影直接搬进导出"的模式）。 */
  duration: unknown
  assumptions: string[]
  missingFields: string[]
}

/**
 * 把 evidence/备注文本里出现的会话工作区根路径换成 `<workspace>`（阶段 A-5，
 * 真实审计 2026-08-25 发现）。SV604/SV605 这类规则的 evidence 本来就是路径
 * 本身（"写入 /Users/dev/项目/.../file"），原样导出等于把本机用户名一
 * 起分享了出去。用 `split/join` 做全量替换而不是正则——`cwd` 是任意文件系统
 * 路径，可能带正则特殊字符（`.`、`(` 之类），拿去构造 RegExp 有注入风险。
 * `cwd` 为空（未知）时原样返回，不臆造一个占位符——诚实说明见 `pathsRedacted`。
 */
export function redactPath(text: string, cwd: string): string {
  if (!cwd) return text
  return text.split(cwd).join('<workspace>')
}

/**
 * 组装导出内容。**不在这里调用任何时钟/剪贴板/DOM API**——`nowIso` 由调用方
 * 传入，纯函数本身可重放、可直接下断言（与 core 侧「pure 函数不碰
 * Date.now()」是同一条纪律，只是这里是为了可测，不是为了 workflow resume）。
 *
 * `rows` 传的是**去重后**的口径（与页面上 AC-01 显示的条数一致）——occurrence
 * 数放在 `occurrences`/`seqs` 里，不会被再当成独立 finding 计数一次。
 *
 * `cwd`（阶段 A-5）：只对 `evidence` 和备注文本做工作区根路径替换——不做
 * 内容扫描（找 API key/密码那类），也不碰 `usage`/`costEstimate`/`skill`/
 * `duration` 这几块不透明的投影透传数据（形状未知，盲目做字符串替换有
 * 破坏其内部结构的风险，且这几块本身很少携带完整路径）。这是一个刻意收窄
 * 的范围，不是"已经全面脱敏"——`pathsRedacted` 只承诺这一件事。
 */
export function buildExportPayload(opts: {
  rows: ExportFindingRow[]
  notes: Record<string, ExportNote>
  sessionId: string
  nowIso: string
  usage: unknown
  costEstimate: unknown
  /** T10：Skill 执行审计数据（coverage_by_skill / sessions_discovered 等
   *  host 侧才有的字段——core 的 skill_invocations 只出聚合，coverage 依赖
   *  子代理日志读取，是 host 侧专属计算）。 */
  skillAudit: unknown
  /** 阶段 B-3：skillAttribution 投影的原样透传。 */
  skillAttribution: unknown
  /** D10：durationAudit 投影的原样透传。 */
  durationAudit: unknown
  assumptions: string[]
  missingFields: string[]
  /** 阶段 A-5：会话工作区根路径，来自 sessionCwd 投影。null/空串 = 未知，
   *  这次导出不做路径替换（`pathsRedacted` 会诚实报 false，不是悄悄跳过）。 */
  cwd: string | null
}): ExportPayload {
  const { rows, notes, sessionId, nowIso, usage, costEstimate, skillAudit, skillAttribution, durationAudit, assumptions, missingFields, cwd } = opts
  const redact = (text: string) => redactPath(text, cwd || '')
  return {
    sessionId,
    exportedAt: nowIso,
    pathsRedacted: !!cwd,
    ruleVersion: null,
    findings: rows.map(f => ({
      rule: f.rule,
      severity: f.severity,
      category: f.category,
      tool_name: f.tool_name,
      evidence: redact(f.evidence),
      occurrences: f.count,
      seqs: f.seqs,
      turn: f.turn,
      step: f.step,
      call_id: f.call_id,
      waste_tokens: f.waste_tokens ?? null,
      suggestion: f.suggestion ?? null,
      loop_tokens: f.loop_tokens ?? null,
      loop_cost: f.loop_cost ?? null,
      loop_occurrences: f.loop_occurrences ?? null,
      note: notes[f.key]?.text != null ? redact(notes[f.key].text) : null,
    })),
    // reviews 与 findings 同源但独立成一份列表——FR-12 的契约把两者分开写，
    // 这里照做，即使内容能从 findings[].note 推出来也不去重（导出格式跟着
    // 契约走，不跟着「怎么省一点字节」走）。
    reviews: rows.filter(f => notes[f.key]).map(f => ({
      rule: f.rule, evidence: redact(f.evidence),
      note: redact(notes[f.key].text), updatedAt: notes[f.key].updatedAt,
    })),
    usage,
    costEstimate,
    pricingVersion: null,
    skill: skillAudit,
    skillAttribution,
    duration: durationAudit,
    assumptions,
    // 去重——同一个字段可能被多个投影各自报一次（例如缺时间戳会同时体现在
    // requestMetrics 和 costReport 上），导出里只列一次。
    missingFields: [...new Set(missingFields)],
  }
}
