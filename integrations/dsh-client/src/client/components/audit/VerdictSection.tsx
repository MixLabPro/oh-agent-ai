// 结论区——首屏四栏：费用 / Token / 上下文峰值 / 异常。四个数都是算出来的，
// 不是摆设；见各字段旁的注释。
import { useState } from 'react'
import { React, h } from '../../react'
import { T, SEVERITY, SEVERITY_ORDER, formatNumber, formatMoney, modelShort, truncate } from '../../styles'
import { type Lang, t, ruleLabel, severityLabel } from '../../i18n'
import type {
  Finding, CostReport, ContextPeak, RequestMetrics, FindingGroupedRow, Usage, ContextCompositionData,
  PreForkUsage,
} from './types'
import { topFinding, topFindings, formatPct, formatShare, UNREPORTED_LABEL, budgetStatus } from './derive'

// ── G1 预算编辑器 ────────────────────────────────────────────────────────
// 嵌进费用卡的展开面板，不新增 KPI 卡（PRD 明确"不新增 KPI 卡"这条纪律同样
// 适用于 G1）。写法照抄 FindingRow.tsx 的 NoteEditor：编辑态用受控 input +
// 保存/取消，非编辑态显示当前值 + 编辑/清除入口。**只读展示，没有任何"暂停/
// 拦截"按钮**——GOVERNANCE_BACKLOG.md G1 明确边界。
function BudgetEditor({ budget, onSetBudget, lang }: {
  budget: number | null; onSetBudget: (n: number | null) => void; lang: Lang
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(budget != null ? String(budget) : '')

  if (editing) {
    return h('div', { 'data-audit-budget': '', style: { marginTop: 8, paddingTop: 8, borderTop: '1px solid ' + T.border } },
      h('div', { key: 'edit', style: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' } },
        h('label', { key: 'l', htmlFor: 'sv-budget-input' }, t(lang, 'budgetLabel')),
        h('input', {
          key: 'in', id: 'sv-budget-input', type: 'number', min: '0', step: '0.01',
          className: 'sv-note-input', style: { width: 100 },
          value: draft,
          placeholder: t(lang, 'budgetPlaceholder'),
          onChange: (e: any) => setDraft(e.target.value),
        }),
        h('button', {
          key: 'save', type: 'button', className: 'sv-linkbtn', onClick: () => {
            const n = parseFloat(draft)
            onSetBudget(isFinite(n) && n > 0 ? n : null)
            setEditing(false)
          },
        }, t(lang, 'noteSave')),
        h('button', {
          key: 'cancel', type: 'button', className: 'sv-linkbtn', onClick: () => {
            setDraft(budget != null ? String(budget) : ''); setEditing(false)
          },
        }, t(lang, 'noteCancel')),
      ))
  }
  return h('div', { 'data-audit-budget': '', style: { marginTop: 8, paddingTop: 8, borderTop: '1px solid ' + T.border } },
    h('div', { key: 'view', style: { display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' } },
      h('span', { key: 't', style: { color: T.dimmed } },
        budget != null ? t(lang, 'budgetSet', { amount: formatMoney(budget) || '' }) : t(lang, 'budgetUnset')),
      h('button', {
        key: 'edit', type: 'button', className: 'sv-linkbtn',
        onClick: () => { setDraft(budget != null ? String(budget) : ''); setEditing(true) },
      }, t(lang, budget != null ? 'budgetEdit' : 'budgetAdd')),
      budget != null
        ? h('button', { key: 'clear', type: 'button', className: 'sv-linkbtn', onClick: () => onSetBudget(null) }, t(lang, 'budgetClear'))
        : null,
    ),
    h('div', { key: 'disclaimer', style: { marginTop: 4, color: T.dimmed, font: T.fontSmall } }, t(lang, 'budgetDisclaimer')),
  )
}

// ── 结论区 ──────────────────────────────────────────────────────────────────
// 首屏第一件事回答「这次要不要紧」。三个指标各对应用户真正带着的一个问题：
// 花了多少钱 / 上下文有没有逼近上限 / 最严重的一条是什么。
//
// 只有「上下文峰值」带展开说明：费用和 finding 的含义望文生义，而「上下文
// 占用」是个派生概念——不写清楚 uncached+cacheRead 这个定义，用户没法判断
// 这个百分比可不可信。成本明细不折在这里，它自己就是下面一整块。
export function VerdictSection({
  rows, pending, cost, subCost, subCount, peak, peakMeta, tokenUsage, unreported, composition, lang,
  costIsZero, costAllUnpriced, unpricedTokens, preFork, budget, onSetBudget,
  onDrillTokens, onDrillContext, onDrillAnomaly,
}: {
  /** 去重后的行——与下方列表、筛选器、标题同一套口径（AC-01）。 */
  rows: FindingGroupedRow[]
  /** 投影尚未就绪（区别于「算完了，0 条」）。 */
  pending: boolean
  cost: CostReport | null
  /** 各子代理费用之和；读不到时 null（不是 0）。 */
  subCost: number | null
  subCount: number
  peak: ContextPeak | null
  peakMeta: RequestMetrics | undefined
  tokenUsage: Usage | undefined
  unreported: string[] | undefined
  /** 上下文峰值卡内联展开要顺带给出常驻前缀构成（P1-05）。 */
  composition: ContextCompositionData | undefined
  lang: Lang
  /** 「一个请求都没发过」≠「估不出来」：前者是 ¥0，后者才是不可用。 */
  costIsZero: boolean
  /** 有用量但一笔都算不出（供应商不在价目表里）→ 不可估算，**绝不显示 ¥0**。 */
  costAllUnpriced: boolean
  unpricedTokens: number
  /** 上游（分叉前）已消耗量，只进展开详情，不进 KPI 主数值。 */
  preFork: PreForkUsage | undefined
  /** G1：本地存储的预算阈值，null = 未设置。 */
  budget: number | null
  onSetBudget: (n: number | null) => void
  // P1-02：三张卡（Token/上下文/异常）的钻取回调——切时间线纵轴 + 应用
  // 筛选，具体行为都在 AuditView 里（跨区块状态只能在共同的父组件协调）。
  // **不做滚动**（P1-05 之后取消）：卡片自己的内联展开面板就是详情，滚走
  // 反而看不见刚展开的内容。费用卡没有别处状态要预置，不需要这个回调。
  onDrillTokens: () => void
  onDrillContext: () => void
  onDrillAnomaly: () => void
}) {
  const [detail, setDetail] = useState<string | null>(null)

  // 四栏：费用 / Token / 上下文峰值 / 异常。
  //
  // 原来这里还有一行判词「本次发现 8 个异常信号，含 3 严重 · 3 警告 · 2 提示」，
  // 已删除——它和「最严重发现」那张卡是**同一个职能说了两遍**，而严重度分布
  // 又和下方的严重度筹码第三次重复。现在的分工：异常卡说"多少条、最严重的是
  // 哪条"，筹码说"按级别怎么分布"，findings 列表说"具体是什么"。
  //
  // 判词删掉后，"一眼看出要不要紧"的信号由**异常卡数值本身的颜色**承载
  // （按最高严重度着色），不靠一个单独的圆点。
  const counts: Record<string, number> = { critical: 0, warning: 0, info: 0 }
  for (const f of rows) if (counts[f.severity] !== undefined) counts[f.severity]++
  const worst = SEVERITY_ORDER.find(s => counts[s] > 0)

  // ── 指标 1：费用 ──
  // 副标题放**解释这张账单的两件事**：高峰时段占了多少、缓存命中那部分占了
  // 多少。原来放的是"几个模型·切换几次"——描述性的，帮不上任何决策，而模型
  // 切换序列在下方成本表里本来就有一整行 chip。
  //
  // 缓存这一项给的是**实付**金额，不是"省下了多少"。省下多少要拿同一批 token
  // 按未命中价重算，那是反事实，这里不做。实付 + 占比自己会说话：命中占了
  // 18.1% 的输入 token，却只占账单的 0.5%。
  // 顶部数字按用户的口径：**这个会话总共花了多少 = 本会话 + 各子代理**。
  // 子代理跑在各自独立的会话里，父会话事件流里没有它们的用量，是宿主去读
  // 那几份日志折出来的。读不到时不并进总数（宁可少算也不猜），并在副标题里
  // 只显示本会话那部分。
  const selfCost = cost?.total ?? null
  const grandTotal = selfCost != null && subCost != null ? selfCost + subCost : selfCost

  const costNoteParts: string[] = []
  // 零请求（多见于刚分叉出来的新会话）：显示 ¥0 而不是"不可用"——我们有完整
  // 的事件流，只是里面确实一个请求都没有。副标题点明"尚未产生请求"，避免
  // 一个孤零零的 ¥0 被读成"这个功能坏了"。
  if (costIsZero) costNoteParts.push(t(lang, 'costZero'))
  // 「不可估算」必须把原因和量级一起说出来，否则跟"投影没就绪"看起来一样。
  if (costAllUnpriced) {
    costNoteParts.push(t(lang, 'costAllUnpricedNote', {
      n: formatNumber(unpricedTokens) || unpricedTokens,
    }))
  }
  if (cost && cost.total) {
    const total = cost.total
    // 有子代理时先拆本会话/子代理——这是用户最想知道的那一层拆分。
    if (subCost != null && subCount > 0) {
      costNoteParts.push(t(lang, 'metricCostSelf', { amount: formatMoney(selfCost as number) || '' }))
      costNoteParts.push(t(lang, 'metricCostSubs', { n: subCount, amount: formatMoney(subCost) || '' }))
    }
    if (cost.peak_total) {
      costNoteParts.push(t(lang, 'metricCostPeak', {
        amount: formatMoney(cost.peak_total) || '', pct: formatShare(cost.peak_total / total),
      }))
    }
    // 只在**至少有一个模型报了这个字段**时才显示。老宿主没有 cache_read_cost，
    // 求和会得到 0——那是"没上报"不是"测到了 0"，摆一个 ¥0（0%）出去等于替
    // 宿主编了一次测量。（真机上就撞见过：宿主是旧进程，这里显示 ¥0。）
    const priced = Object.values(cost.per_model).filter(m => typeof m.cache_read_cost === 'number')
    if (priced.length > 0) {
      const cacheCost = priced.reduce((s, m) => s + m.cache_read_cost, 0)
      costNoteParts.push(t(lang, 'metricCostCache', {
        amount: formatMoney(cacheCost) || '', pct: formatShare(cacheCost / total),
      }))
    }
  }

  // ── G1 预算阈值（对齐的是 grandTotal——KPI 卡实际显示的那个"总共花了多少"，
  // 不是 cost.total，否则子代理费用会被漏算进比例里）──
  const bstatus = budgetStatus(grandTotal, budget)
  // 'ok'（<70%）不发声——恒真的"预算充足"是零信息，常驻只会占版面（同
  // coverageNote"覆盖率只在<100%时出现"那条纪律）。
  if (bstatus && bstatus.level !== 'ok') {
    costNoteParts.push(t(lang, bstatus.level === 'over' ? 'budgetOverNote' : 'budgetNearNote', {
      pct: formatPct(bstatus.ratio), amount: formatMoney(budget as number) || '',
    }))
  }
  const costColor = bstatus?.level === 'over' ? T.error : bstatus?.level === 'near' ? T.warn : undefined

  // ── 指标 2：Token 用量 ──
  // 卡片给总量，下方 Token 区块给分项 + 条形图 + 「未上报」处理。这是与费用
  // 卡/成本表相同的"摘要在上、明细在下"分工，不是重复。
  //
  // **合计时跳过 unreported_fields 里的字段**：DSH 的 tokenUsage 把宿主没上报
  // 的字段填成 0，直接相加等于替宿主编了一次测量。真实会话里 cacheWriteTokens
  // 一次都没出现过。
  const tokenFields: [string, number | undefined][] = [
    ['inputTokens', tokenUsage?.uncachedInputTokens],
    ['outputTokens', tokenUsage?.outputTokens],
    ['cacheReadTokens', tokenUsage?.cacheReadTokens],
    ['cacheWriteTokens', tokenUsage?.cacheWriteTokens],
  ]
  const isUnreported = (f: string) => Array.isArray(unreported) && unreported.indexOf(f) !== -1
  const reported = tokenFields.filter(([f, v]) => v !== undefined && !isUnreported(f))
  const tokenTotal = reported.length > 0 ? reported.reduce((s, [, v]) => s + (v as number), 0) : null
  const tokenNoteParts: string[] = []
  if (tokenUsage) {
    for (const [field, labelKey] of [
      ['inputTokens', 'inputLabel'], ['outputTokens', 'outputLabel'], ['cacheReadTokens', 'cacheReadLabel'],
    ] as const) {
      const v = tokenFields.find(([f]) => f === field)?.[1]
      if (v === undefined || isUnreported(field)) continue
      tokenNoteParts.push(t(lang, labelKey) + ' ' + formatNumber(v))
    }
  }

  // ── 指标 3：上下文峰值 ──
  // 上下文是**存量**：分叉把上游历史整段拷进新会话的上下文，第一个请求就带着
  // 它发出去。所以分叉后还没发请求时，正确答案不是"不可用"，而是"继承了多少"
  // ——这恰恰是分叉会话最该先看到的数（决定要不要先压缩再干活）。
  //
  // 有实测峰值时一律以实测为准：一旦发出过请求，provider 报的 context_tokens
  // 本身就已经包含了继承来的那一段，不需要也不应该再叠加。
  const inherited = preFork?.forked ? (preFork.inherited_context ?? null) : null
  const inheritedPct = inherited != null && preFork?.inherited_window
    ? inherited / preFork.inherited_window : null
  // 分母缺失时只报绝对值不报百分比——没有上限就没有"占了多少"这回事。
  const peakValue = peak
    ? (peak.pct != null
      ? formatNumber(peak.tokens) + ' / ' + formatNumber(peak.window as number)
      : formatNumber(peak.tokens) ?? t(lang, 'unavailable'))
    : inherited != null
      ? t(lang, 'contextInheritedValue', {
        n: formatNumber(inherited) || inherited,
        win: preFork?.inherited_window ? (formatNumber(preFork.inherited_window) || '') : '—',
      })
      : t(lang, 'unavailable')
  const peakNoteParts: string[] = []
  if (peak) {
    if (peak.pct != null) peakNoteParts.push(formatPct(peak.pct))
    else peakNoteParts.push(t(lang, 'metricContextNoWindow'))
    if (peak.turn != null) peakNoteParts.push(t(lang, 'metricContextAt', { turn: peak.turn }))
  } else if (inherited != null) {
    // 说清这个数是**继承来的起点**、不是本会话测出来的峰值——两者含义不同，
    // 不标注会被读成"本会话已经占到 81% 了"。
    peakNoteParts.push(inheritedPct != null
      ? t(lang, 'contextInheritedNote', { pct: formatPct(inheritedPct) })
      : t(lang, 'contextInheritedNoWindow'))
  }

  // ── 指标 4：异常 ──
  // 值 = 总条数，按最高严重度着色（判词行删掉后，"要不要紧"的信号靠它承载）；
  // 副标题 = 最严重的那条是什么。严重度分布不放这里——那是下方筹码的职能，
  // 放进来就又变成一件事说两遍。
  const top = rows.length > 0 ? topFinding(rows) : null
  const anomalyColor = pending
    ? T.dimmed
    : rows.length === 0
      ? T.success
      : worst ? SEVERITY[worst as keyof typeof SEVERITY].color : T.accent
  const anomalyValue = pending
    ? t(lang, 'unavailable')
    : rows.length === 0 ? '✓' : t(lang, 'metricAnomalyCount', { n: rows.length })
  const anomalyNoteParts: string[] = []
  if (top) {
    anomalyNoteParts.push(t(lang, 'metricAnomalyTop', { label: ruleLabel(lang, top.f.rule) }))
    if (top.f.turn != null) anomalyNoteParts.push(t(lang, 'metricTopAt', { turn: top.f.turn }))
  } else if (!pending) {
    anomalyNoteParts.push(t(lang, 'verdictClean'))
  }

  const toggle = (id: string) => setDetail(detail === id ? null : id)
  // P1-02：会话健康时间线用请求点数据画，「Token 用量」「上下文峰值」两张
  // 卡能不能钻取到它，看的是同一个信号——peakMeta 有没有请求行。
  const hasTimeline = !!(peakMeta && peakMeta.requests.length > 0)

  // 空字符串要过滤掉再判断有没有内容——`['']` 长度是 1，直接判 length 会渲染
  // 出一个空的 note div（第一版就是这样，在一次失败输出里看到才发现）。
  //
  // drill 存在时整卡变成一个真实 <button>——桌面端"整卡可点击"（P1-02）。
  // aria-label 只描述钻取目标（PRD 给的例子"查看 Token 用量时间线"不含数
  // 字），数值本身用 aria-describedby 挂回去，屏幕阅读器两者都拿得到，不是
  // 二选一。数据不可用时 drill 传 null，退回原来的纯展示 div——钻取一个
  // 不存在的目标只会让用户觉得点了没反应。
  const metric = (
    key: string, label: string, value: string, mono: boolean, note: any[], color?: string,
    drill?: { onClick: () => void; ariaLabel: string; expandId: string } | null,
  ) => {
    const parts = note.filter(x => x !== '' && x != null)
    const valueId = 'sv-metric-v-' + key
    const body = [
      h('div', { key: 'l', className: 'sv-metric-label' }, label),
      h('div', {
        key: 'v', id: valueId, className: 'sv-metric-value' + (mono ? ' sv-num' : ''),
        title: value, style: color ? { color } : undefined,
      }, value),
      parts.length > 0 ? h('div', { key: 'n', className: 'sv-metric-note' }, parts) : null,
      drill ? h('div', { key: 'chev', className: 'sv-metric-chevron', 'aria-hidden': 'true' }, t(lang, 'drillChevron')) : null,
    ]
    if (drill) {
      return h('button', {
        key, type: 'button', className: 'sv-metric sv-metric-btn',
        'aria-label': drill.ariaLabel, 'aria-describedby': valueId,
        'aria-expanded': detail === drill.expandId ? 'true' : 'false',
        onClick: drill.onClick,
      }, body)
    }
    return h('div', { key, className: 'sv-metric' }, body)
  }

  // ── 内联展开面板（P1-05）──────────────────────────────────────────────
  // 点「查看详情」不只跳到下方已有区块，卡片所在的结论区自己先给一份摘要——
  // 四块面板一次只开一个（复用同一个 detail state），挂在 .sv-metrics 网格
  // **外面**而不是塞进某张卡的 <button> 里：CSS grid 逐行等高，单张卡片自
  // 己变高会把同一行其它卡挤歪；而且面板内容本身是纯文本，塞进 <button> 也
  // 不允许再放任何可点击的子控件（HTML 不允许 button 套 button）。
  const expandPanel = (id: string, content: any[]) =>
    h('div', { key: 'd-' + id, className: 'sv-detail', hidden: detail !== id }, content)

  // 分叉口径说明（只在真的分叉过时出现）。**"上游花了多少"和"本会话花了
  // 多少"必须并排给出**——只说一个数，用户没法判断上方那个变小的数字是对
  // 的还是坏的。上游金额估不出来（全是未知模型）时说 token 数，不编金额。
  const forkNote = (kind: 'cost' | 'tokens') => {
    if (!preFork || !preFork.forked) return []
    const out: any[] = [
      h('div', { key: 'scope', style: { marginTop: 8 } },
        t(lang, kind === 'cost' ? 'forkScopeCost' : 'forkScopeTokens')),
    ]
    if (kind === 'cost') {
      out.push(h('div', { key: 'up', style: { marginTop: 4 } },
        preFork.cost != null
          ? t(lang, 'forkUpstreamCost', { amount: formatMoney(preFork.cost) || '—' })
          : t(lang, 'forkUpstreamUnpriced', { n: formatNumber(preFork.tokens ?? 0) || '0' })))
      out.push(h('div', { key: 'self' },
        t(lang, 'forkThisSessionCost', {
          amount: selfCost != null ? (formatMoney(selfCost) || '—') : (formatMoney(0) || '¥0'),
        })))
    } else {
      out.push(h('div', { key: 'up', style: { marginTop: 4 } },
        t(lang, 'forkUpstreamTokens', { n: formatNumber(preFork.tokens ?? 0) || '0' })))
      out.push(h('div', { key: 'self' },
        t(lang, 'forkThisSessionTokens', { n: formatNumber(tokenTotal ?? 0) || '0' })))
    }
    if (preFork.boundary_seq != null) {
      out.push(h('div', { key: 'b', style: { color: T.dimmed } },
        t(lang, 'forkBoundary', { seq: preFork.boundary_seq })))
    }
    return out
  }

  // 面板在「零请求」时也要渲染——那正是分叉说明最该出现的时刻（cost 为 null，
  // 但 costIsZero 为真）。
  const costPanel = (cost || costIsZero) ? [
    ...(cost && cost.per_model && Object.keys(cost.per_model).length > 0 ? [
      h('div', { key: 'h', style: { marginBottom: 4 } }, t(lang, 'expandCostNote')),
      ...Object.entries(cost.per_model).map(([model, c]) => h('div', { key: model },
        modelShort(model) + '：' + (formatMoney(c.total) || '—')
        + (c.total > 0 ? '（' + t(lang, 'colPeakShare') + ' ' + formatPct(c.peak / c.total, 0) + '）' : ''))),
    ] : []),
    cost && cost.unpriced_tokens > 0
      ? h('div', { key: 'unpriced', style: { marginTop: 6 } },
        t(lang, 'unpricedNote', { n: formatNumber(cost.unpriced_tokens) || cost.unpriced_tokens }))
      : null,
    h('div', { key: 'disc', style: { marginTop: 6 } }, t(lang, 'costDisclaimer')),
    ...forkNote('cost'),
  ] : []

  const tokenPanel = tokenUsage ? [
    h('div', { key: 'h', style: { marginBottom: 4 } }, t(lang, 'expandTokensNote')),
    ...tokenFields.map(([field, value]) => h('div', { key: field },
      t(lang, UNREPORTED_LABEL[field]) + ' ' + (isUnreported(field) ? t(lang, 'unreportedValue') : (value !== undefined ? formatNumber(value) : t(lang, 'unreportedValue'))))),
    ...forkNote('tokens'),
  ] : []

  // 「计算方法」原来是卡片内的一个真实 <button>——现在挪进这个共用面板，
  // 有时间线可钻取时由整卡点击驱动同一个 detail 状态；没有时间线时保留一个
  // 独立的小按钮（下面 m-ctx 卡自己判断），效果一样，入口从"卡内小按钮"变成
  // "点这张卡"或"点这行文字"。
  const ctxMethod = [
    h('div', { key: 'm' }, h('b', { key: 't' }, t(lang, 'contextMethodTitle')), ' ', t(lang, 'contextMethodBody')),
    peak && peak.measured < peak.total
      ? h('div', { key: 'p', style: { marginTop: 6 } },
        t(lang, 'contextMethodPartial', {
          fields: (peakMeta?.missingFields || ['context_tokens']).join(', '),
        }) + ' (' + peak.measured + ' / ' + peak.total + ')')
      : null,
  ]
  const compRows: [string, number | null][] = composition
    ? [['compSystem', composition.system_tokens], ['compTools', composition.tools_tokens], ['compCatalog', composition.catalog_tokens]]
    : []
  const ctxPanel = [
    ...ctxMethod,
    ...(compRows.length > 0 ? [
      h('div', { key: 'ch', style: { marginTop: 8 } }, t(lang, 'compHeading') + '：'),
      ...compRows.map(([labelKey, v]) => h('div', { key: labelKey },
        t(lang, labelKey) + ' ' + (v != null ? t(lang, 'estimatePrefix') + (formatNumber(v) || v) : t(lang, 'unreportedValue')))),
    ] : []),
  ]

  const top3 = topFindings(rows, 3)
  const anomalyPanel = top3.length > 0 ? [
    h('div', { key: 'h', style: { marginBottom: 4 } }, t(lang, 'topFindingsHeading', { n: top3.length })),
    ...top3.map(f => h('div', { key: f.key, style: { display: 'flex', gap: 6, alignItems: 'baseline' } },
      h('span', { key: 'g', style: { color: SEVERITY[f.severity as keyof typeof SEVERITY]?.color, fontWeight: 700 } },
        SEVERITY[f.severity as keyof typeof SEVERITY]?.glyph),
      h('span', { key: 'r', style: { fontFamily: T.fontMono } }, f.rule),
      h('span', { key: 'l' }, ruleLabel(lang, f.rule)),
      h('span', { key: 'e', style: { color: T.dimmed } }, truncate(f.evidence, 40)),
    )),
  ] : []

  return h('div', { 'data-audit-verdict': '', className: 'sv-verdict' },
    h('div', { key: 'metrics', className: 'sv-metrics' },
      metric('m-cost', t(lang, 'metricCost'),
        grandTotal != null ? (formatMoney(grandTotal) || '')
          : costIsZero ? (formatMoney(0) || '¥0')
            : costAllUnpriced ? t(lang, 'costNotEstimable')
              : t(lang, 'unavailable'),
        true,
        costNoteParts.length > 0 ? [costNoteParts.join(' · ')] : [],
        costColor,
        // 零请求的分叉会话也要能展开——面板里那句"上游已消耗多少"正是这时候
        // 最该说的话（否则用户只看到 ¥0，不知道上游烧掉的那笔去哪了）。
        grandTotal != null || costIsZero || costAllUnpriced
          ? { onClick: () => toggle('cost'), ariaLabel: t(lang, 'drillCostLabel'), expandId: 'cost' }
          : null),
      metric('m-tok', t(lang, 'tokenUsageHeading'),
        tokenTotal != null ? (formatNumber(tokenTotal) || '') : t(lang, 'unavailable'),
        true,
        tokenNoteParts.length > 0 ? [tokenNoteParts.join(' · ')] : [],
        undefined,
        hasTimeline
          ? { onClick: () => { onDrillTokens(); toggle('tok') }, ariaLabel: t(lang, 'drillTokensLabel'), expandId: 'tok' }
          : null),
      metric('m-ctx', t(lang, 'metricContext'), peakValue, true, [
        peakNoteParts.length > 0 ? peakNoteParts.join(' · ') + ' · ' : null,
        // 没有时间线可钻取时，卡片仍是纯展示 div——保留一个独立的小按钮才能
        // 打开「计算方法」（不然这份说明就再也够不着了）。
        !hasTimeline ? h('button', {
          key: 'how', type: 'button', className: 'sv-linkbtn',
          'aria-expanded': detail === 'ctx' ? 'true' : 'false',
          onClick: () => toggle('ctx'),
        }, detail === 'ctx' ? t(lang, 'collapseDetail') : t(lang, 'howComputed')) : null,
      ], undefined,
        hasTimeline
          ? { onClick: () => { onDrillContext(); toggle('ctx') }, ariaLabel: t(lang, 'drillContextLabel'), expandId: 'ctx' }
          : null),
      metric('m-anomaly', t(lang, 'metricAnomaly'), anomalyValue, false,
        anomalyNoteParts.length > 0 ? [anomalyNoteParts.join(' · ')] : [], anomalyColor,
        !pending && rows.length > 0
          ? { onClick: () => { onDrillAnomaly(); toggle('anomaly') }, ariaLabel: t(lang, 'drillAnomalyLabel'), expandId: 'anomaly' }
          : null),
    ),
    // hidden 属性而不是条件渲染：读屏软件跟着一起隐藏，且展开态切换不会重建
    // DOM。同时 T2 的区域提取仍然能看到它——折叠不等于不存在。
    // G1 预算编辑器挂在费用卡的展开面板里，不是独立 KPI 卡——设置入口本身
    // 也要能通过这张卡展开，与"计算方法"这类说明并列。
    expandPanel('cost', [...costPanel, h(BudgetEditor, { key: 'budget', budget, onSetBudget, lang })]),
    expandPanel('tok', tokenPanel),
    expandPanel('ctx', ctxPanel),
    expandPanel('anomaly', anomalyPanel),
  )
}
