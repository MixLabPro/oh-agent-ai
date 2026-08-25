/**
 * AuditView — the main "审计" tab component.
 * Reads behaviorFindings / tokenUsage / tokenByModel / costReport from
 * useProjection and renders a cost estimate + severity-grouped findings list.
 * Cost itself is computed host-side (costReport) — this component only
 * formats it; see host/index.ts::costReportFrom for the pricing math.
 *
 * 拆分自原 1678 行的单文件版本：各区块搬进 ./audit/*，这里只做编排
 * （拿投影数据、算派生值、按条件拼 children）。纯代码搬移，行为不变。
 */

import { useState } from 'react'
import { React, h } from '../react'
import type { ConvViewProps } from '@deepseek-ai/dsh-client-ui-conversation/client'
import { T, tint, SEVERITY, SEVERITY_ORDER, formatNumber, formatDuration } from '../styles'
import { type Lang, t, ruleLabel, severityLabel, loadLang } from '../i18n'
import {
  modelSwitchEvents,
  type TimelineRow, type TimelineEventInput, type TimelineMode,
} from '../timeline'
import { buildExportPayload, type ExportFindingRow } from '../export'
import type {
  Finding, Usage, TokenByModel, CostReport, RequestMetrics,
  ContextCompositionData, CompactionReport, StructuralWaste, SubagentSpawns,
  PreForkUsage, Note, FindingGroupedRow, SkillAudit, DurationAudit, LoopCost, SkillAttribution,
} from './audit/types'
import { loadNotes, persistNotes } from './audit/notes'
import { loadBudget, persistBudget } from './audit/budget'
import { loadSlowThreshold, persistSlowThreshold } from './audit/slowThreshold'
import { DurationSection } from './audit/DurationSection'
import { sessionIdOf, downloadJson } from './audit/actions'
import { contextPeak, formatTokens, dedupeFindings, linkWasteToFindings, linkLoopCostToFindings } from './audit/derive'
import { TokenBar, SectionHeading, SectionHeader, Divider } from './audit/atoms'
import { FindingGroup } from './audit/FindingRow'
import { TimelinePanel } from './audit/TimelinePanel'
import { ContextPanel } from './audit/ContextPanel'
import { SubagentSection } from './audit/SubagentSection'
import { SkillSection } from './audit/SkillSection'
import { VerdictSection } from './audit/VerdictSection'
import { CostSection } from './audit/CostSection'

export function AuditView({ useProjection }: ConvViewProps) {
  const findings: Finding[] | undefined = useProjection?.('behaviorFindings')
  // **宿主自带的投影，不经过我们的分叉过滤**——见下面 tokenUsage 的推导。
  const hostTokenUsage: Usage | undefined = useProjection?.('tokenUsage')
  const tokenByModel: TokenByModel | undefined = useProjection?.('tokenByModel')
  const costReport: CostReport | undefined = useProjection?.('costReport')
  const requestMetrics: RequestMetrics | undefined = useProjection?.('requestMetrics')
  const composition: ContextCompositionData | undefined = useProjection?.('contextComposition')
  const compaction: CompactionReport | undefined = useProjection?.('compactionEvents')
  const waste: StructuralWaste | undefined = useProjection?.('structuralWaste')
  const subagents: SubagentSpawns | undefined = useProjection?.('subagentSpawns')
  const skillAudit: SkillAudit | undefined = useProjection?.('skillAudit')
  // 阶段 B-3：按 [调用.seq, 下一次调用.seq) 归因出的 finding/工具/费用——
  // 只对 source_agent_id === null 的调用有效（见 SkillSection.tsx 的查表
  // 守卫和 host/index.ts 投影注释）。
  const skillAttribution: SkillAttribution[] | undefined = useProjection?.('skillAttribution')
  const durationAudit: DurationAudit | undefined = useProjection?.('durationAudit')
  // 阶段 A-5：导出脱敏的替换锚点（见 export.ts::redactPath 的文档注释）。
  const sessionCwd: { cwd: string } | undefined = useProjection?.('sessionCwd')
  // G2：SV611/612/613 的 [seq, run_end_seq] 区间对齐出来的真实消耗，宿主算好
  // 才拿到这里拼回对应的 finding 行（见 derive.ts::linkLoopCostToFindings）。
  const loopCosts: LoopCost[] | undefined = useProjection?.('loopCosts')
  // 上游（分叉前）已消耗的量——只在展开详情里出现，不进 KPI 主数值。
  const preFork: PreForkUsage | undefined = useProjection?.('preForkUsage')
  const [notes, setNotesState] = useState<Record<string, Note>>(() => loadNotes())
  // G1 预算阈值：不按 session 隔离（见 audit/budget.ts 头部注释），全局一份。
  const [budget, setBudgetState] = useState<number | null>(() => loadBudget())
  const setBudget = (n: number | null) => { setBudgetState(n); persistBudget(n) }
  // D9：慢阈值提到这一层——DurationSection 的列表高亮和时间线的"慢"标记
  // 必须读同一个数字，状态只能有一份。
  const [slowThreshold, setSlowThresholdState] = useState<number | null>(() => loadSlowThreshold())
  const setSlowThreshold = (ms: number | null) => { setSlowThresholdState(ms); persistSlowThreshold(ms) }
  // 时间线点击定位过来的行 id。一次性驱动展开——行本身仍可自己开合。
  const [focusId, setFocusId] = useState<string | null>(null)
  // FR-07 过滤与搜索。severity 为 null 表示"全部"；noted 单独一档。
  const [filter, setFilter] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  // FR-12 导出反馈（P0-02）。三态而不是布尔：「下载了」「退到剪贴板了」
  // 「两条都没成」需要说不同的话，压成 ok/fail 两态会把"文件其实没存到磁盘"
  // 说成了成功。
  const [exportStatus, setExportStatus] = useState<'downloaded' | 'clipboard' | 'failed' | null>(null)
  // P1-02 KPI 钻取：时间线纵轴模式提到这层，让「Token 用量」「上下文峰值」
  // 两张 KPI 卡能从外部驱动它——纵轴选择器本身仍在 TimelinePanel 里，两处
  // 共同读写同一个状态。默认 'context' 就是"概览"态，drillTimeline 里"再次
  // 点击已激活的卡片会切回这个默认值"就是 PRD 要的"支持恢复概览"。
  const [timelineMode, setTimelineMode] = useState<TimelineMode>('context')
  const setNote = (key: string, text: string | undefined) => {
    setNotesState(prev => {
      const next = { ...prev }
      if (text === undefined) delete next[key]
      // Date.now() 在这里是对的：setNote 是事件处理器（不纯的边界），不是
      // 那些要求可重放的纯函数。此前恒写 0 是把「纯函数不碰时钟」这条规矩
      // 误推到了这里，结果导出的 reviews[].updatedAt 永远是 0——字段在、内容
      // 是假的，比没有这个字段更糟（与 exportedAt 当初同一个误判）。
      else next[key] = { text, updatedAt: Date.now() }
      persistNotes(next)
      return next
    })
  }

  const lang = loadLang()
  // ── Token 口径必须与费用同源（分叉一致性）─────────────────────────────
  // `tokenUsage` 是 **DSH 宿主自带**的投影，不是我们注册的，所以 seedLength
  // 分叉过滤对它不生效：从上游 branch 出来的新会话里，它把上游那一整段历史
  // 也算进来（真机实测：新分叉一个请求都还没发，它显示 277.2M——全是上游的）。
  // 结果是同一屏上费用说"本会话还没花钱"、Token 说"用了 277.2M"，两个数在
  // 打架，而打架的根源是它们统计的根本不是同一批事件。
  //
  // tokenByModel 是我们自己折的，已按 seedLength 过滤，四个桶与宿主那份
  // 字段一一对应——直接从它求和即可，不需要新增任何计算。宿主那份只在
  // tokenByModel 尚未就绪时兜底（老宿主 / 投影还没算完）。
  const tokenUsage: Usage | undefined = tokenByModel
    ? Object.values(tokenByModel.by_model).reduce<Usage>((acc, b) => ({
      uncachedInputTokens: (acc.uncachedInputTokens || 0) + b.uncached_input_tokens,
      outputTokens: (acc.outputTokens || 0) + b.output_tokens,
      cacheReadTokens: (acc.cacheReadTokens || 0) + b.cache_read_tokens,
      cacheWriteTokens: (acc.cacheWriteTokens || 0) + b.cache_write_tokens,
    }), { uncachedInputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 })
    : hostTokenUsage
  const tokenText = formatTokens(tokenUsage, lang, tokenByModel?.unreported_fields)
  // ── 费用的三种「没有数」必须分开说 ────────────────────────────────────
  // 判据一律看 **per_model 有没有内容**，不看 total：一分钱都没计出来时
  // cost_report 给的 total 是 0.0（不是 null），照着 total 判会把「全都没能
  // 计价」显示成「¥0」——读起来是"免费"，而实际意思是"我们拒绝给它估价"。
  // 真机撞到过：整段跑在 shengsuanyun 上的会话，2.76 亿 token 显示成 ¥0。
  const pricedModels = costReport ? Object.keys(costReport.per_model).length : 0
  const cost = costReport && pricedModels > 0 ? costReport : null
  //   ① 零请求（分叉出来还没干活）：完整事件流里确实没有请求 → ¥0 才诚实，
  //      说"不可用"是在声称一种我们并不具有的无知。
  const costIsZero = !!costReport && pricedModels === 0 && costReport.unpriced_tokens === 0
  //   ② 有用量但一笔都算不出（供应商不在价目表里）→ **不可估算**，并把
  //      未计价的量说出来。绝不显示 ¥0。
  const costAllUnpriced = !!costReport && pricedModels === 0 && costReport.unpriced_tokens > 0
  //   ③ 部分计价（cost 非空 + unpriced > 0）由成本表的覆盖率行披露，见 CostSection。
  // 老宿主 / 投影未就绪（costReport 本身 undefined）是第四种：未知。
  const peak = contextPeak(requestMetrics)

  const containerStyle = { padding: T.space.xl + 'px ' + T.space.xl + 'px', color: T.fg, font: T.fontProse, lineHeight: 1.5 }

  if (findings === undefined && tokenText === null && !cost) {
    return h('div', { 'data-audit-view': '', style: containerStyle },
      h('span', { key: 'empty', style: { color: T.muted } }, t(lang, 'noDataYet')))
  }

  // ── 队列行先算出来：时间线要用它们的 domId 做点击落点，所以必须先于
  //    时间线构造。**浪费并进同一条队列**——SV-COST-* 本来就是 finding 的
  //    形状，单开一个区块会让用户在两个地方找同一起事件。
  const mergedFindings: Finding[] = (findings || []).concat(waste?.findings || [])
  const deduped = findings !== undefined || waste !== undefined ? dedupeFindings(mergedFindings) : []
  deduped.forEach((f, i) => { f.domId = 'sv-f-' + i })
  linkWasteToFindings(deduped)
  linkLoopCostToFindings(deduped, loopCosts)

  // ── 时间线事件：风险 / 浪费 / 压缩 / 模型切换 四类 ──
  // 把宿主算好的逐请求累计费用挂到行上（FR-04 的「费用」纵轴）。**浏览器不
  // 重算任何单价**：哪笔算高峰是 core 的 is_peak 定的，乘价格是宿主做的，
  // 这里只做一次按 request_seq 的对齐。
  const costByReq = new Map<number, number>()
  for (const p of costReport?.series || []) costByReq.set(p.request_seq, p.cumulative)
  const timelineRows = (requestMetrics?.requests || []).map(r => ({
    ...r, cumulative_cost: costByReq.has(r.request_seq) ? costByReq.get(r.request_seq) : null,
  })) as unknown as TimelineRow[]
  const timelineEvents: TimelineEventInput[] = []
  for (const f of deduped) {
    // info 级不上时间线：8 条 finding 里有 2 条是审批记录，画上去只会挤占
    // 那几个真正要看的标记。它们仍在下方队列里。
    if (f.waste_tokens === undefined && f.severity === 'info') continue
    timelineEvents.push({
      kind: f.waste_tokens !== undefined ? 'waste' : 'risk',
      severity: f.severity, seq: f.latestSeq, turn: f.turn,
      label: f.rule + ' ' + ruleLabel(lang, f.rule),
      targetId: f.domId as string,
    })
  }
  for (const p of compaction?.prunes || []) {
    timelineEvents.push({
      kind: 'compaction', seq: p.seq, turn: p.turn,
      label: t(lang, 'legendCompaction'), targetId: null,
    })
  }
  for (const c of compaction?.compactions || []) {
    timelineEvents.push({
      kind: 'compaction', seq: c.start_seq, turn: c.turn,
      label: t(lang, 'legendCompaction'), targetId: null,
    })
  }
  // 子代理启动：不是异常，但确实是关键事件——一个 turn 里派出去的活会在别处
  // 烧掉真金白银。用方块+成功色与风险点区分开，视觉权重介于风险与模型切换之间。
  for (const sp of subagents?.spawns || []) {
    timelineEvents.push({
      kind: 'subagent', seq: sp.seq, turn: sp.turn,
      label: sp.description || t(lang, 'legendSubagent'), targetId: null,
    })
  }
  // T9：Skill 时间线事件。显式调用用菱形（shape='explicit'），模型选择用圆点。
  // P1-01（真实审计 2026-08-25 发现）：targetId 曾经恒为 null——Skill 标记
  // 画在时间线上却点不动、Enter 也是空操作，用户定位不到对应的 Skill 详情。
  // `'sv-sk-' + i` 必须跟 SkillSection.tsx 的 `domIdOf` 用同一个索引基准
  // （按 `skillAudit.invocations` 的原始顺序，不是它内部排序后的显示顺序）
  // ——两边独立算，算法必须完全一致，否则点中的是另一条调用。
  (skillAudit?.invocations || []).forEach((inv, i) => {
    timelineEvents.push({
      kind: 'skill', seq: inv.seq, turn: inv.turn,
      label: inv.name || t(lang, 'skillUnknown') || '(unknown)',
      targetId: 'sv-sk-' + i,
      skillMode: inv.trigger_mode as 'explicit' | 'model_selected',
    })
  })
  // D9：慢工具调用/慢 turn 标记——只在用户设了阈值时才出现（阈值判断留在
  // 客户端，不进 core 规则引擎，同 §0 第 2 条边界）。十字形状区分（同 T9
  // 的纪律：颜色已经被严重度占用，"慢"这个新维度不能只靠颜色）。
  if (slowThreshold != null) {
    for (const tc of durationAudit?.tool_calls || []) {
      if (tc.duration_ms != null && tc.duration_ms >= slowThreshold) {
        timelineEvents.push({
          kind: 'slow', seq: tc.seq, turn: tc.turn,
          label: (tc.tool_name || t(lang, 'skillUnknown') || '?') + ' · ' + (formatDuration(tc.duration_ms) || ''),
          targetId: null,
        })
      }
    }
    for (const tn of durationAudit?.turns || []) {
      if (tn.duration_ms != null && tn.duration_ms >= slowThreshold) {
        timelineEvents.push({
          kind: 'slow', seq: tn.seq_start, turn: tn.turn,
          label: 'T' + tn.turn + ' · ' + (formatDuration(tn.duration_ms) || ''),
          targetId: null,
        })
      }
    }
  }
  timelineEvents.push(...modelSwitchEvents(timelineRows))

  // P1-02/P1-05 KPI 卡钻取：只帮下面对应区块**预置状态**（纵轴模式/筛选），
  // **不滚动**——"查看详情"展开的是卡片自己位置的内联面板（P1-05），用户
  // 正在看那块内容，这时候把视口滚走等于展开了也看不见，跟"计算方法"一直
  // 以来的无滚动行为不一致（用户反馈过这个问题）。真要去看下面的完整区块，
  // 用户自己滚下去，到时候纵轴/筛选已经是对的。
  const onDrillTokens = () => {
    if (timelineRows.length === 0) return
    setTimelineMode(prev => (prev === 'tokens' ? 'context' : 'tokens'))
  }
  const onDrillContext = () => {
    if (timelineRows.length === 0) return
    setTimelineMode('context')
  }
  const onDrillAnomaly = () => {
    if (deduped.length === 0) return
    const worst = SEVERITY_ORDER.find(sv => deduped.some(f => f.severity === sv)) ?? null
    setFilter(prev => (prev === worst ? null : worst))
  }

  // ── P1-06 页面固定分四个一级区块——会话资源概览 / 会话健康时间线 / 上下文
  // 归因与优化线索 / Finding 队列，各自一个 <section>，标题统一用
  // SectionHeader（带 1px 分隔线），区块间用 .sv-section 的外边距（32px）
  // 而不再靠 dividerNeeded 手动记账要不要插一条线。
  const sections: any[] = []

  // ── 区块 1：会话资源概览 —— 结论区 KPI + 费用明细 + Token 用量 ──
  const overview: any[] = [
    h(SectionHeader, { key: 'h', text: t(lang, 'resourceOverviewHeading') }),
    h(VerdictSection, {
      key: 'verdict', rows: deduped, pending: findings === undefined, cost,
      subCost: subagents?.total_cost ?? null, subCount: subagents?.spawns.length ?? 0,
      peak, peakMeta: requestMetrics,
      tokenUsage, unreported: tokenByModel?.unreported_fields, composition, lang,
      costIsZero, costAllUnpriced, unpricedTokens: costReport?.unpriced_tokens ?? 0, preFork,
      budget, onSetBudget: setBudget,
      onDrillTokens, onDrillContext, onDrillAnomaly,
    }),
  ]
  // 严重度筹码已升级成 findings 区块里**可点击的过滤器**（FR-07），不再单独
  // 摆一排只读的筹码——两处都显示严重度分布就又是一件事说两遍，而且只读那排
  // 还会和过滤器的选中态打架。data-audit-summary 锚点移到过滤器 chips 上。
  if (cost) {
    overview.push(h(CostSection, {
      key: 'cost', cost, byModel: tokenByModel?.by_model,
      sequence: tokenByModel?.sequence || [], lang,
    }))
  }
  if (tokenText !== null) {
    if (cost) overview.push(h(Divider, { key: 'div-tokens' }))
    overview.push(h('div', { key: 'tokens', 'data-audit-tokens': '' },
      SectionHeading({ text: t(lang, 'tokenUsageHeading') }),
      h('div', { key: 'tokens-text', style: { color: T.muted, fontVariantNumeric: 'tabular-nums' } }, tokenText),
      tokenUsage ? h(TokenBar, { key: 'bar', usage: tokenUsage, lang }) : null,
    ))
  }
  sections.push(h('section', { key: 's-overview', className: 'sv-section' }, overview))

  // ── 区块 2：会话健康时间线 ──
  if (timelineRows.length > 0) {
    sections.push(h('section', { key: 's-timeline', className: 'sv-section' },
      h(SectionHeader, { key: 'h', text: t(lang, 'timelineHeading') }),
      h(TimelinePanel, {
        key: 'timeline', rows: timelineRows, events: timelineEvents, lang,
        costMeta: costReport && costReport.total_requests != null && costReport.priced_requests != null
          ? { priced: costReport.priced_requests, total: costReport.total_requests } : null,
        mode: timelineMode, onModeChange: setTimelineMode,
        inheritedContext: preFork?.forked ? preFork.inherited_context : null,
        onFocus: (id: string) => {
          setFocusId(id)
          // scrollIntoView 在静态渲染 / 无 DOM 环境里不存在，守一下再调。
          try {
            const el = typeof document !== 'undefined' ? document.getElementById(id) : null
            if (el && typeof (el as any).scrollIntoView === 'function') {
              ;(el as any).scrollIntoView({ block: 'center', behavior: 'smooth' })
            }
          } catch { /* 定位失败不该让整个 tab 崩掉 */ }
        },
      }),
    ))
  }

  // ── 区块 3：执行拓扑与能力调用 —— 子代理 / Skill 执行 / 执行时长 ────────
  // 三者共同回答"这个会话调了哪些能力、派了多少活、花了多久"——排在"上下文
  // 归因"之前（§5 推荐信息架构的顺序），先说清楚"跑了什么"，再往下钻"token
  // 去哪了"。
  //
  // P2-01（真实审计 2026-08-25 发现）：这三者曾经跟常驻前缀构成/结构性浪费
  // 挤在同一个"上下文归因与优化线索"标题下——但它们回答的是"派出去多少
  // 活、调了什么能力、跑了多久"，不是"token 去哪了"，那个标题覆盖不住它们，
  // 读起来像是把不相关的诊断硬凑进一个筐。现在拆成独立区块。
  const execTopology: any[] = []
  if (subagents) {
    execTopology.push(h('div', { key: 'subagents', className: 'sv-subcard' },
      h(SubagentSection, { data: subagents, lang, selfCost: cost?.total ?? null })))
  }
  if (skillAudit) {
    execTopology.push(h('div', { key: 'skills', className: 'sv-subcard' },
      h(SkillSection, { data: skillAudit, lang, focusId, attribution: skillAttribution })))
  }
  if (durationAudit) {
    execTopology.push(h('div', { key: 'duration', className: 'sv-subcard' },
      h(DurationSection, { data: durationAudit, lang, threshold: slowThreshold, onSetThreshold: setSlowThreshold })))
  }
  if (execTopology.length > 0) {
    sections.push(h('section', { key: 's-exec-topology', className: 'sv-section' },
      h(SectionHeader, { key: 'h', text: t(lang, 'execTopologyHeading') }),
      execTopology,
    ))
  }

  // ── 区块 4：上下文归因与优化线索 —— 常驻前缀构成 / 结构性浪费 ──────────
  // 两者各自一个 .sv-subcard（弱背景 + 8px 圆角，不加阴影），同属一个一级
  // 区块但仍是两件各自独立的事——构成回答"token 去哪了"，浪费回答"哪些浪
  // 费了"，故意不揉成一个通栏。
  const contextInsights: any[] = []
  if (composition) {
    contextInsights.push(h('div', { key: 'composition', className: 'sv-subcard' },
      h(ContextPanel, { comp: composition, peak, lang })))
  }
  // FR-04b 结构性浪费：命中的条目并进下方证据队列（SV-COST-* 本来就是
  // finding 的形状），**但空态要显式说出来**——整块消失会让人分不清"没有
  // 浪费"和"这个功能没做"。投影本身没就绪时才不渲染。
  if (waste) {
    const n = waste.findings.length
    contextInsights.push(h('div', { key: 'waste', className: 'sv-subcard' },
      h('div', { 'data-audit-waste': '' },
        SectionHeading({ text: t(lang, 'wasteHeading') }),
        n === 0
          ? h('div', { className: 'sv-insight', style: { color: T.dimmed } }, t(lang, 'wasteNone'))
          : h('div', { className: 'sv-insight' },
            waste.findings.map((w, i) => h('div', { key: 'w' + i },
              w.rule + ' ' + ruleLabel(lang, w.rule) + ' · '
              + t(lang, 'wasteTokens', { n: formatNumber(w.waste_tokens) || w.waste_tokens })
              + (w.turn != null ? ' · T' + w.turn : '')
              + ' — ' + w.suggestion))),
      )))
  }
  if (contextInsights.length > 0) {
    sections.push(h('section', { key: 's-context-insights', className: 'sv-section' },
      h(SectionHeader, { key: 'h', text: t(lang, 'contextInsightsHeading') }),
      contextInsights,
    ))
  }

  // ── 区块 5：Finding 队列 —— pending / clean / 列表三态都在同一个区块里，
  // 边界始终可见，不是只在有数据时才"冒出来"一块。
  let findingsHeaderText: string
  let findingsBody: any

  if (findings === undefined) {
    findingsHeaderText = t(lang, 'findingsQueueHeading')
    findingsBody = h('div', { key: 'pending', style: { color: T.muted } }, t(lang, 'computing'))
  } else if (deduped.length === 0) {
    findingsHeaderText = t(lang, 'findingsHeading', { n: 0 })
    findingsBody = h('div', { key: 'clean', style: { display: 'flex', alignItems: 'center', gap: 6, color: T.success, fontWeight: 600 } },
      t(lang, 'clean'))
  } else {
    // ── FR-07 过滤与搜索 ──
    // **全部计数一律用去重后的口径**（AC-01：顶部、过滤器、标题、列表必须
    // 同一套）。之前标题用的是合并前的原始条数（9），列表却是去重后的行（7），
    // 两个数当场打架——`SV610 ×2` 是一次 finding 的两次 occurrence，不该再被
    // 当成两条独立 finding 计数。occurrence 数只出现在行内的 ×N 徽标和展开
    // 详情里。
    const matchesQuery = (f: FindingGroupedRow) => {
      const q = query.trim().toLowerCase()
      if (q === '') return true
      return f.rule.toLowerCase().includes(q)
        || f.evidence.toLowerCase().includes(q)
        || ruleLabel(lang, f.rule).toLowerCase().includes(q)
        || f.seqs.some(n => String(n).includes(q))
    }
    const matchesFilter = (f: FindingGroupedRow) =>
      filter === null ? true : filter === 'noted' ? notes[f.key] !== undefined : f.severity === filter
    const visible = deduped.filter(f => matchesFilter(f) && matchesQuery(f))

    const sevCounts: Record<string, number> = { critical: 0, warning: 0, info: 0 }
    for (const f of deduped) if (sevCounts[f.severity] !== undefined) sevCounts[f.severity]++
    const notedCount = deduped.filter(f => notes[f.key] !== undefined).length

    // FR-07 要求 chips 是 PRD 最小集合的**固定五个**：全部/严重/警告/提示/
    // 有备注（P1-03：之前 0 条时整个 chip 消失，用户在只有 warning 的会话
    // 里根本看不到"critical"这个筛选维度存在过）。0 条时禁用而不是不渲染，
    // disabled 原生语义自带不可点击 + 不可 focus，不需要额外 aria-disabled。
    const chip = (key: string, label: string, n: number, color?: string) => {
      const disabled = key !== 'all' && n === 0
      return h('button', {
        key, type: 'button', className: 'sv-chip', disabled,
        'aria-pressed': (filter === key || (key === 'all' && filter === null)) ? 'true' : 'false',
        style: color ? { color, borderColor: tint(color, 45) } : undefined,
        onClick: disabled ? undefined : () => setFilter(key === 'all' ? null : key),
      }, label + ' ' + n)
    }

    const groups: Record<string, FindingGroupedRow[]> = { critical: [], warning: [], info: [] }
    for (const f of visible) (groups[f.severity] || groups.info).push(f)
    for (const sev of SEVERITY_ORDER) {
      // 备注**不参与排序**（FR-10：不得重排原始 finding）。纯按 seq 降序。
      groups[sev].sort((a, b) => (b.latestSeq || 0) - (a.latestSeq || 0))
    }

    // FR-12 导出。**组装是纯函数**（buildExportPayload，在 ../export.ts），
    // 这里只做两件不纯的事：拿当前时间、把结果推给 downloadJson。
    //
    // assumptions/missingFields 是把页面上散落各处的「约」「未上报」「估算不是
    // 账单」收拢成一份能离线核对的清单——FR-12 原文「导出不得省略估算假设和
    // 缺失字段」，不是摆设。ruleVersion/pricingVersion 目前确实没有版本号
    // 来源（行为规则不带版本字段、pricing.json 没有版本字段），留 null 而不是
    // 编一个，assumptions 里说明这不是遗漏。
    const doExport = () => {
      const assumptions: string[] = [
        t(lang, 'assumptionEstimate'),
        t(lang, 'assumptionPeak'),
        t(lang, 'assumptionComposition'),
        t(lang, 'assumptionSubagentScope'),
        t(lang, 'assumptionSkillScope'),
        // 阶段 B-3：归因区间用"下一次 Skill 调用开始"当边界，不是精确因果——
        // 两次调用之间夹杂的无关工作会被计入前一次调用的账。
        t(lang, 'assumptionSkillAttribution'),
        t(lang, 'assumptionNoVersion'),
        // 阶段 A-5：诚实说明这次导出到底脱没脱敏，不让读者自己猜。
        t(lang, sessionCwd?.cwd ? 'assumptionRedacted' : 'assumptionNotRedacted'),
      ]
      const missingFields: string[] = []
      for (const f of tokenByModel?.unreported_fields || []) missingFields.push('usage.' + f)
      for (const f of requestMetrics?.missingFields || []) missingFields.push('requests.' + f)
      for (const f of composition?.missingFields || []) missingFields.push('context.' + f)
      for (const f of compaction?.missingFields || []) missingFields.push('compaction.' + f)
      for (const f of waste?.missingFields || []) missingFields.push('waste.' + f)
      for (const f of cost?.missingFields || []) missingFields.push('cost.' + f)
      for (const f of subagents?.missingFields || []) missingFields.push('subagents.' + f)
      for (const f of skillAudit?.missingFields || []) missingFields.push('skill.' + f)
      for (const f of durationAudit?.missingFields || []) missingFields.push('duration.' + f)

      const payload = buildExportPayload({
        rows: deduped as unknown as ExportFindingRow[],
        notes,
        sessionId: sessionIdOf(mergedFindings),
        nowIso: new Date().toISOString(),
        usage: tokenByModel ?? null,
        costEstimate: cost ?? null,
        skillAudit: skillAudit ?? null,
        skillAttribution: skillAttribution ?? null,
        durationAudit: durationAudit ?? null,
        assumptions,
        missingFields,
        cwd: sessionCwd?.cwd ?? null,
      })
      downloadJson(payload, 'skill-vitals-audit-' + (payload.sessionId || 'session') + '.json', setExportStatus)
    }

    const toolbar = h('div', { key: 'toolbar', className: 'sv-toolbar' },
      h('div', { key: 'chips', className: 'sv-chips', 'data-audit-summary': '', role: 'group', 'aria-label': t(lang, 'findingsHeading', { n: deduped.length }) },
        chip('all', t(lang, 'filterAll'), deduped.length),
        ...SEVERITY_ORDER.map(sv => chip(sv, severityLabel(lang, sv), sevCounts[sv], SEVERITY[sv as keyof typeof SEVERITY].color)),
        chip('noted', t(lang, 'filterNoted'), notedCount),
        ...(filter !== null || query !== '' ? [h('button', {
          key: 'clear', type: 'button', className: 'sv-linkbtn', style: { marginLeft: 4 },
          onClick: () => { setFilter(null); setQuery('') },
        }, t(lang, 'filterClear'))] : []),
      ),
      h('div', { key: 'right', className: 'sv-toolbar-right' },
        h('input', {
          key: 'q', type: 'search', className: 'sv-search', value: query,
          'aria-label': t(lang, 'searchPlaceholder'),
          placeholder: t(lang, 'searchPlaceholder'),
          onChange: (e: any) => setQuery(e.target.value),
        }),
        h('button', {
          key: 'exp', type: 'button', className: 'sv-linkbtn',
          onClick: doExport,
        }, t(lang, 'exportJson')),
        // role=status：三种结果都要能被读屏软件播报，不只是视觉上闪一下
        // （与 FR-11 的复制反馈同一套纪律）。
        exportStatus ? h('span', { key: 'exp-status', role: 'status', className: 'sv-export-status sv-export-' + exportStatus },
          t(lang, exportStatus === 'downloaded' ? 'exportDownloaded'
            : exportStatus === 'clipboard' ? 'exportFellBackToClipboard' : 'exportFailed')) : null,
      ),
    )

    findingsHeaderText = t(lang, 'findingsHeading', { n: deduped.length })
    findingsBody = h('div', { key: 'list' },
      toolbar,
      // 备注的性质要说在明处，不能让一堆「添加备注」按钮自己去暗示什么。
      h('div', { key: 'disc', className: 'sv-insight', style: { color: T.dimmed, marginTop: 0 } },
        t(lang, 'noteDisclaimer')),
      ...(visible.length === 0
        ? [h('div', { key: 'nomatch', className: 'sv-insight' }, t(lang, 'searchNoMatch', { n: deduped.length }))]
        : SEVERITY_ORDER.filter(sev => groups[sev].length > 0).map(sev =>
          h(FindingGroup, { key: sev, sev, items: groups[sev], notes, setNote, lang, openId: focusId })
        )),
    )
  }

  sections.push(h('section', {
    key: 's-findings', 'data-audit-findings': '', id: 'sv-section-findings',
    className: 'sv-section',
  },
    h(SectionHeader, { key: 'h', text: findingsHeaderText }),
    findingsBody,
  ))

  return h('div', { 'data-audit-view': '', style: containerStyle }, sections)
}
