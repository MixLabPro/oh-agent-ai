// 会话健康时间线（P3/FR-03/FR-04）。全部算术在 ../../timeline.ts（纯函数，
// 由 scripts/verify-timeline.mjs 直接下断言）——这个文件只画 buildTimeline
// 的返回值 + 处理交互，不做任何比例尺计算。
import { useRef, useState } from 'react'
import { React, h } from '../../react'
import { T, formatNumber, formatMoney, modelShort } from '../../styles'
import { type Lang, t, severityLabel } from '../../i18n'
import {
  buildTimeline, nearestPoint, requestOrdinal,
  type TimelineRow, type TimelineMode, type TimelineEventInput,
} from '../../timeline'

// ── 会话健康时间线（P3）────────────────────────────────────────────────────
// 全部算术在 ../timeline.ts（纯函数，由 scripts/verify-timeline.mjs 直接下
// 断言）。这个组件只负责把 buildTimeline 的返回值画出来 + 处理交互，**不做
// 任何比例尺计算**——那正是手写 SVG 最容易错且不报错的地方。
//
// 三个纵轴：上下文 / Token / 费用。**费用这条曲线的单价不在这里算**——
// 哪笔请求算高峰由 core 的 is_peak 定、乘价格由宿主的 costReport.series 做，
// 这里只按 request_seq 对齐宿主给的累计值。在客户端重算一遍就是那套规则的
// 第四份拷贝。（早先这段注释写「没有费用模式」，是费用纵轴加进来之前的话，
// 已被实现推翻。）
export const EVENT_STYLE: Record<string, { color: string; labelKey: string }> = {
  risk: { color: T.error, labelKey: 'legendRisk' },
  waste: { color: T.accent, labelKey: 'legendWaste' },
  compaction: { color: T.success, labelKey: 'legendCompaction' },
  model: { color: T.dimmed, labelKey: 'legendModel' },
  subagent: { color: T.success, labelKey: 'legendSubagent' },
  // T9：skill 事件用形状区分，不只靠颜色（色盲可读）。显式=菱形，模型选择=圆点。
  // T12：颜色通过 CSS 变量注入（--sv-skill-explicit），方便主题化。
  skill: { color: 'var(--sv-skill-explicit)', labelKey: 'legendSkill' },
  // D9：慢工具调用/慢 turn，用户在 DurationSection 设了阈值才会出现——
  // 十字形状，颜色用 T.warn（跟 SkillSection 的失败态一样是"要留意但不是
  // 严重故障"这一档，严重度色已经被 risk 的 T.error 占用）。
  slow: { color: T.warn, labelKey: 'legendSlow' },
}

export function TimelinePanel({
  rows, events, costMeta, lang, onFocus, mode, onModeChange, inheritedContext,
}: {
  rows: TimelineRow[]
  events: TimelineEventInput[]
  /** 费用纵轴的计价覆盖率——缺时间戳的请求不计价，累计是下限。 */
  costMeta: { priced: number; total: number } | null
  lang: Lang
  onFocus: (domId: string) => void
  /** 纵轴模式提到 AuditView：KPI 卡钻取（P1-02）要能从外部把「Token 用量」
      卡切换到 [Token] 纵轴，「上下文峰值」卡切到 [上下文]，状态得在组件外
      才能被两处共同驱动。 */
  mode: TimelineMode
  onModeChange: (m: TimelineMode) => void
  /** 分叉起点继承的上下文占用；非分叉会话为 null。只用于脚注说明。 */
  inheritedContext?: number | null
}) {
  // 游标：hover 跟随，点击固定。**固定态优先于 hover**——PRD 要求「点击固定
  // 选中，再次点击取消固定」，固定之后鼠标划过不该把它顶掉。
  const [hover, setHover] = useState<number | null>(null)
  const [pinned, setPinned] = useState<number | null>(null)
  // 图例开关（FR-03「图例可控制事件类型显隐」）。
  const [hidden, setHidden] = useState<Record<string, boolean>>({})
  // P1-07 事件级 roving tabindex + 统一 tooltip：
  // - rovingIndex：Tab 键会落到的那个事件（只有它 tabIndex=0），只被键盘移动
  //   更新，不跟着鼠标 hover 跑——否则鼠标划过会悄悄改掉下一次 Tab 的落点，
  //   对键盘用户来说是个陷阱。
  // - activeEvent：当前要在信息面板里显示哪个事件的 tooltip，hover 和
  //   focus 都会更新它，两种输入方式共享同一份展示逻辑（之前只有原生
  //   <title>，鼠标 hover 才有、键盘 focus 完全够不着）。
  const [rovingIndex, setRovingIndex] = useState(0)
  const [activeEvent, setActiveEvent] = useState<number | null>(null)
  const markerRefs = useRef<(SVGGElement | null)[]>([])
  // P1-07 问题 3：小屏默认摘要 + 明确的"展开时间线"入口，不是靠容器查询
  // 单方面决定——用户手动展开后即使容器仍窄也保持展开（见下面
  // .sv-timeline-expanded 的 CSS 优先级）。
  const [expanded, setExpanded] = useState(false)
  const visibleEvents = events.filter(e => !hidden[e.kind])
  const tl = buildTimeline({ rows, events: visibleEvents, mode })

  // 标题（"会话健康时间线"）现在由 AuditView 包这个组件的一级 SectionHeader
  // 提供（P1-06）——这里只留副标题，不再重复打印一遍标题文字。
  const head = h('div', { key: 'head', className: 'sv-panel-head' },
    h('div', { key: 'l' },
      h('div', { key: 'sub', className: 'sv-panel-sub' }, t(lang, 'timelineSub')),
    ),
    h('div', { key: 'seg', className: 'sv-seg', role: 'group', 'aria-label': t(lang, 'timelineHeading') },
      // FR-04：三个纵轴。事件标记在任意纵轴下保持相同的 requestSeq 位置——
      // buildTimeline 的事件定位只看行下标，与 mode 无关，天然满足。
      (['context', 'tokens', 'cost'] as TimelineMode[]).map(m => h('button', {
        key: m, type: 'button',
        'aria-pressed': mode === m ? 'true' : 'false',
        onClick: () => onModeChange(m),
      }, t(lang, m === 'context' ? 'modeContext' : m === 'tokens' ? 'modeTokens' : 'modeCost'))),
    ),
  )

  if (tl === null) {
    return h('div', { 'data-audit-timeline': '', id: 'sv-section-timeline', className: 'sv-panel' }, head,
      h('div', { key: 'na', className: 'sv-insight', style: { color: T.dimmed } }, t(lang, 'timelineUnavailable')))
  }

  const g = tl.geometry
  const yFor = (frac: number) => g.curveBottom - frac * (g.curveBottom - g.curveTop)
  const gridLines = [0, 0.5, 1].map((frac, i) => h('line', {
    key: 'g' + i, className: 'sv-grid',
    x1: g.x0, x2: g.x1, y1: yFor(frac), y2: yFor(frac),
  }))
  const axisLabels = [
    h('text', { key: 'a1', className: 'sv-axis', x: g.x0, y: yFor(1) - 4 },
      mode === 'cost' ? (formatMoney(tl.yMax) || '') : formatNumber(tl.yMax)),
    h('text', { key: 'a0', className: 'sv-axis', x: g.x0, y: g.curveBottom + 11 }, '0'),
  ]
  const tickLabels = tl.turnTicks.map((tk, i) => h('text', {
    key: 'tk' + i, className: 'sv-axis', x: tk.x, y: g.h - 1,
    textAnchor: i === 0 ? 'start' : i === tl.turnTicks.length - 1 ? 'end' : 'middle',
  }, tk.label))

  // 移动到第 next 个事件：焦点、固定态（十字游标）、live region 和下方关联
  // Finding 一起同步（P1-07）——之前方向键只移动请求级游标，事件本身的
  // DOM 焦点、显示内容都不会跟着走，是这条整改的直接起因。
  const moveEventFocus = (next: number) => {
    if (tl.events.length === 0) return
    const clamped = Math.max(0, Math.min(tl.events.length - 1, next))
    setRovingIndex(clamped)
    setActiveEvent(clamped)
    // tsconfig 没有 "lib": ["dom"]（见仓库其它 document.* 调用同一套处理），
    // SVGGElement 在这个环境下解不出 focus——运行时它就是真的 DOM 元素。
    ;(markerRefs.current[clamped] as any)?.focus()
    const ev = tl.events[clamped]
    const pIdx = nearestPoint(tl.points, ev.x)
    if (pIdx >= 0) { setPinned(pIdx); setHover(pIdx) }
    if (ev.targetId !== null) onFocus(ev.targetId)
  }

  const markers = tl.events.map((e, i) => {
    const style = EVENT_STYLE[e.kind] || EVENT_STYLE.model
    const color = e.kind === 'risk' && e.severity === 'warning' ? T.warn : style.color
    const label = e.label + (e.count > 1 ? ' ×' + e.count : '') + (e.turn != null ? ' · T' + e.turn : '')
    const clickable = e.targetId !== null
    // roving tabindex：只有一个事件是当前 Tab 落点，其余 -1；但**全部**事件
    // 都能通过它拿到焦点后再用方向键遍历到——不只是可点击的那些，压缩/模型
    // 切换标记同样要能被 hover/focus 读出内容（§8.1"所有事件标记及其键盘
    // 可达性必须保留"），只是 Enter 对它们是空操作（没有 targetId 可跳转）。
    return h('g', {
      key: 'e' + i,
      ref: (el: SVGGElement | null) => { markerRefs.current[i] = el },
      className: 'sv-event',
      tabIndex: i === Math.min(rovingIndex, tl.events.length - 1) ? 0 : -1,
      role: clickable ? 'button' : undefined,
      'aria-label': label,
      onClick: clickable ? () => { setActiveEvent(i); onFocus(e.targetId as string) } : undefined,
      onFocus: () => setActiveEvent(i),
      onMouseEnter: () => setActiveEvent(i),
      onMouseLeave: () => setActiveEvent(prev => (prev === i ? null : prev)),
      onBlur: () => setActiveEvent(prev => (prev === i ? null : prev)),
      onKeyDown: (ev: any) => {
        if (ev.key === 'ArrowRight') { ev.preventDefault(); ev.stopPropagation(); moveEventFocus(i + 1) }
        else if (ev.key === 'ArrowLeft') { ev.preventDefault(); ev.stopPropagation(); moveEventFocus(i - 1) }
        else if (ev.key === 'Home') { ev.preventDefault(); ev.stopPropagation(); moveEventFocus(0) }
        else if (ev.key === 'End') { ev.preventDefault(); ev.stopPropagation(); moveEventFocus(tl.events.length - 1) }
        else if ((ev.key === 'Enter' || ev.key === ' ') && clickable) {
          ev.preventDefault(); setActiveEvent(i); onFocus(e.targetId as string)
        } else if (ev.key === 'Escape') {
          ev.stopPropagation(); setPinned(null); setHover(null); setActiveEvent(null)
        }
      },
    },
      h('title', { key: 't' }, label),
      // 形状本身携带类别，不只靠颜色（色盲可读）：
      //   压缩 = 方块；模型切换 = 细刻度；风险/浪费 = 圆点；
      //   子代理 = 三角；skill = 显式用菱形 / 模型选择用圆点（T9）。
      // **模型切换是细刻度而不是同尺寸圆点**（FR-03）：正常切换本身不是异常，
      // 跟风险事件同一视觉优先级只会制造噪声。
      // T12：skill 事件颜色统一用 CSS 变量（--sv-skill-explicit），形状区分
      // 显式/模型选择，不依赖两种不同颜色——主题变量就位后只需改一处。
      e.kind === 'compaction'
        ? h('rect', { key: 's', x: e.x - 3.5, y: g.eventY - 3.5, width: 7, height: 7, fill: color })
        : e.kind === 'model'
          ? h('rect', { key: 's', x: e.x - 0.75, y: g.eventY - 5, width: 1.5, height: 10, fill: color })
          : e.kind === 'subagent'
            ? h('path', { key: 's', d: 'M' + e.x + ' ' + (g.eventY - 5) + 'l4.5 8h-9z', fill: color })
            : e.kind === 'skill'
              ? e.skillMode === 'explicit'
                  // 菱形
                  ? h('path', { key: 's', d: 'M' + e.x + ' ' + (g.eventY - 5) + 'l4.5 5l-4.5 5l-4.5-5z', fill: color })
                  // 圆点
                  : h('circle', { key: 's', cx: e.x, cy: g.eventY, r: e.count > 1 ? 5 : 4, fill: color })
              // D9：慢工具调用/慢 turn——十字（"+"），颜色已经被严重度占用，
              // 这个新维度也不能只靠颜色区分（同 T9 的纪律）。
              : e.kind === 'slow'
                ? h('g', { key: 's' },
                    h('rect', { key: 'h', x: e.x - 4, y: g.eventY - 1, width: 8, height: 2, fill: color }),
                    h('rect', { key: 'v', x: e.x - 1, y: g.eventY - 4, width: 2, height: 8, fill: color }),
                  )
                : h('circle', { key: 's', cx: e.x, cy: g.eventY, r: e.count > 1 ? 5 : 4, fill: color }),
    )
  })

  // ── 游标（hover / 键盘）────────────────────────────────────────────────
  // **吸附到已画出的点**，不按鼠标 x 插值——曲线画的是桶内最大值，停在两点
  // 之间再插一个数出来，等于报一个从没测过的值。
  const cursor = pinned !== null ? pinned : hover
  const cur = cursor !== null && cursor >= 0 && cursor < tl.points.length ? tl.points[cursor] : null
  const curRow = cur ? rows[cur.idx] : null
  // **必须用函数式更新**：连按方向键时多次 keydown 落在同一个 tick 里，
  // 直接读闭包里的 `cursor` 会让第二次拿到陈旧值——真机上按 ← ← 只退一格
  // 就是这么来的。函数式更新读的是 React 的最新值，连按多少次都对。
  const moveCursor = (delta: number) => {
    const last = tl.points.length - 1
    setPinned(prev => {
      const base = prev ?? hover ?? 0
      const next = Math.max(0, Math.min(last, base + delta))
      setHover(next)
      return next
    })
  }
  const onPointer = (ev: any) => {
    if (pinned !== null) return
    const svg = ev.currentTarget?.ownerSVGElement || ev.currentTarget
    const box = svg?.getBoundingClientRect?.()
    if (!box || box.width === 0) return
    // 屏幕坐标 → viewBox 坐标
    const vx = ((ev.clientX - box.left) / box.width) * g.w
    const i = nearestPoint(tl.points, vx)
    if (i >= 0) setHover(i)
  }

  // 信息面板：PRD FR-04 要求 tooltip 显示 `turn · request n/m · requestSeq`。
  // 做成图表**下方的常驻面板**而不是浮层：AC-06 要求小屏不依赖 hover，浮层
  // 在触屏上根本摸不到；面板用键盘/点击也能驱动，且不会被图表边缘裁掉。
  const cursorParts: any[] = []
  if (curRow) {
    const ord = requestOrdinal(rows, cur!.idx)
    cursorParts.push(ord && curRow.turn != null
      ? t(lang, 'cursorAt', { turn: curRow.turn, n: ord.n, m: ord.m, seq: curRow.seq ?? '—' })
      : t(lang, 'cursorAtNoTurn', { req: curRow.request_seq, seq: curRow.seq ?? '—' }))
    // 当前纵轴上的值
    const v = mode === 'context' ? curRow.context_tokens
      : mode === 'cost' ? (curRow as any).cumulative_cost
        : null
    if (mode === 'cost' && v != null) cursorParts.push(formatMoney(v as number) || '')
    else if (v != null) cursorParts.push((formatNumber(v as number) || '') + (curRow.context_window ? ' / ' + formatNumber(curRow.context_window) : ''))
    cursorParts.push(modelShort(curRow.model))
    // 聚合点要说清它代表了几次请求——PRD：不得掩盖内部峰值。
    const k = cur!.hi - cur!.lo
    if (k > 1) cursorParts.push(t(lang, 'cursorAggregated', { k }))
    // 这个位置上的事件
    const here = tl.events.filter(e => Math.abs(e.x - cur!.x) < 3)
    if (here.length > 0) {
      cursorParts.push(t(lang, 'cursorEvents', { list: here.map(e => e.label + (e.count > 1 ? ' ×' + e.count : '')).join('、') }))
    }
    if (pinned !== null) cursorParts.push(t(lang, 'cursorPinned'))
  }

  // 事件级 tooltip（P1-07）：鼠标 hover 和键盘 focus 共用同一份内容——规则
  // （label 已经是"SVxxx 规则名"）、严重度、turn/request n/m/seq、操作提示。
  // 优先于普通请求游标：同一时刻要么在看"这个事件"要么在看"这个请求"，不
  // 叠加成两行，跟这个面板一贯"同一时刻只显示一条"的原则一致。
  const activeEv = activeEvent !== null && activeEvent < tl.events.length ? tl.events[activeEvent] : null
  const eventParts: any[] = []
  if (activeEv) {
    eventParts.push(activeEv.label + (activeEv.count > 1 ? ' ×' + activeEv.count : ''))
    if (activeEv.severity) eventParts.push(severityLabel(lang, activeEv.severity))
    const pIdx = nearestPoint(tl.points, activeEv.x)
    const rowIdx = pIdx >= 0 ? tl.points[pIdx].idx : null
    const evRow = rowIdx != null ? rows[rowIdx] : null
    const ord = rowIdx != null ? requestOrdinal(rows, rowIdx) : null
    if (ord && activeEv.turn != null) {
      eventParts.push(t(lang, 'cursorAt', { turn: activeEv.turn, n: ord.n, m: ord.m, seq: evRow?.seq ?? '—' }))
    } else if (activeEv.turn != null) {
      eventParts.push('T' + activeEv.turn)
    }
    eventParts.push(activeEv.targetId !== null ? t(lang, 'eventClickHint') : t(lang, 'eventNoJumpHint'))
  }

  const footParts: string[] = [
    tl.buckets < tl.total
      ? t(lang, 'chartAggregated', { total: tl.total, buckets: tl.buckets })
      : t(lang, 'chartFull', { total: tl.total }),
  ]
  // 「有几行没测到」和「曲线断没断」是**两件事**，必须分开说。
  // 真实会话踩到过：687 行里 13 行缺 context_tokens，但聚合成 220 桶后没有
  // 任何一桶全空，曲线其实是连通的——初版脚注却写着「已留缺口」，在陈述一件
  // 没发生的事。数字对、对这个数字做了什么的说法是错的，一样是不诚实。
  if (tl.measured < tl.total) footParts.push(t(lang, 'chartGap', { n: tl.total - tl.measured }))
  if (tl.gaps > 0) footParts.push(t(lang, 'chartBroken', { n: tl.gaps }))
  if (mode === 'context' && tl.yMaxIsData) footParts.push(t(lang, 'chartNoWindow'))
  // 分叉会话的上下文曲线**一上来就在高位**——因为 provider 报的 context_tokens
  // 本身就含继承来的那一段。不说清楚，前面没有爬升过程的曲线看着像故障。
  // 只在「上下文」纵轴说：Token/费用是流量，从分叉点重新从 0 累计，没有这回事。
  if (mode === 'context' && inheritedContext != null) {
    footParts.push(t(lang, 'chartForkStart', { n: formatNumber(inheritedContext) || inheritedContext }))
  }
  // 费用模式的缺口有它自己的原因（缺时间戳 → 判不出高峰/空闲 → 那笔不计价），
  // 跟"缺 context_tokens"不是一回事，要分开说清楚。
  if (mode === 'cost' && costMeta && costMeta.priced < costMeta.total) {
    footParts.push(t(lang, 'chartCostGap', { n: costMeta.total - costMeta.priced }))
  }

  // 小屏摘要（P1-07 问题 3）：请求数 / 峰值 / 异常事件数三个数，加一份"异常
  // 事件列表"作为图表收起时的替代访问路径——不靠图形也能看到规则名并跳转到
  // 对应 finding。异常数按**原始未合并**的 events 数（不是 tl.events 里同
  // turn 合并后的标记数），跟结论区异常卡的口径更接近，不因合并而看似变少。
  const anomalyEvents = events.filter(e => e.kind === 'risk')
  const summaryLine = t(lang, 'timelineSummaryLine', {
    requests: tl.total,
    peak: mode === 'cost' ? (formatMoney(tl.yMax) || '') : (formatNumber(tl.yMax) || String(tl.yMax)),
    anomalies: anomalyEvents.length,
  })
  const summary = h('div', { key: 'summary', className: 'sv-chart-summary' },
    h('div', { key: 'line', className: 'sv-insight' }, summaryLine),
    h('button', {
      key: 'expand', type: 'button', className: 'sv-linkbtn',
      'aria-expanded': expanded ? 'true' : 'false',
      onClick: () => setExpanded(!expanded),
    }, t(lang, expanded ? 'collapseTimeline' : 'expandTimeline')),
    tl.events.filter(e => e.targetId !== null).length > 0 ? h('div', { key: 'list' },
      h('div', { key: 'h', className: 'sv-insight', style: { marginTop: 10 } }, t(lang, 'timelineEventListHeading')),
      h('div', { key: 'items', className: 'sv-event-list' },
        tl.events.filter(e => e.targetId !== null).map((e, i) => h('button', {
          key: i, type: 'button', className: 'sv-event-list-item',
          onClick: () => onFocus(e.targetId as string),
        }, e.label + (e.count > 1 ? ' ×' + e.count : '') + (e.turn != null ? ' · T' + e.turn : ''))),
      ),
    ) : null,
  )

  return h('div', {
    'data-audit-timeline': '', id: 'sv-section-timeline',
    className: 'sv-panel sv-timeline-cq' + (expanded ? ' sv-timeline-expanded' : ''),
  }, head, summary,
    h('div', { key: 'full', className: 'sv-chart-full' },
    // 图例是**可点击的开关**（FR-03）。可选类型取自原始 events 而不是过滤后的
    // tl.events——否则关掉一类之后它自己就从图例里消失了，再也开不回来。
    h('div', { key: 'legend', className: 'sv-legend', title: t(lang, 'legendToggleHint') },
      h('span', { key: 'c' }, h('i', { style: { background: T.accent } }), t(lang, 'legendCurve')),
      // 'skill' 原来漏在这个数组外——legend 里没有它的色键/开关，图表上却一直
      // 在画（visibleEvents 只看 hidden[e.kind]，默认 falsy=可见），T9 的测试
      // 只断言过"图例是可切换按钮"，没断言过"每种出现的 kind 都在图例里"，
      // 这个缺口一直没被测出来。这次跟 D9 的 'slow' 一起补上，不是新引入的。
      (['risk', 'waste', 'compaction', 'model', 'subagent', 'skill', 'slow'] as const)
        .filter(k => events.some(e => e.kind === k))
        .map(k => h('button', {
          key: k, type: 'button', className: 'sv-legend-btn',
          'aria-pressed': hidden[k] ? 'false' : 'true',
          onClick: () => setHidden({ ...hidden, [k]: !hidden[k] }),
        },
          h('i', { style: { background: hidden[k] ? T.dimmed : EVENT_STYLE[k].color } }),
          t(lang, EVENT_STYLE[k].labelKey))),
    ),
    h('div', { key: 'chart', className: 'sv-chartwrap' },
      h('svg', {
        className: 'sv-chart', viewBox: '0 0 ' + g.w + ' ' + g.h,
        preserveAspectRatio: 'none', role: 'img',
        tabIndex: 0,
        'aria-label': t(lang, 'chartAlt', {
          mode: t(lang, mode === 'context' ? 'modeContext' : mode === 'tokens' ? 'modeTokens' : 'modeCost'),
          total: tl.total, events: tl.events.length,
        }),
        onMouseMove: onPointer,
        onMouseLeave: () => setHover(null),
        // 点击固定 / 再次点击同一点取消固定（FR-03）。
        onClick: (ev: any) => {
          const svg = ev.currentTarget
          const box = svg?.getBoundingClientRect?.()
          if (!box || box.width === 0) return
          const i = nearestPoint(tl.points, ((ev.clientX - box.left) / box.width) * g.w)
          setPinned(pinned === i ? null : i)
          setHover(i)
        },
        // 方向键在**请求点**间移动；事件间跳转由事件标记自身的 tabIndex 承担。
        onKeyDown: (ev: any) => {
          if (ev.key === 'ArrowRight') { ev.preventDefault(); moveCursor(1) }
          else if (ev.key === 'ArrowLeft') { ev.preventDefault(); moveCursor(-1) }
          else if (ev.key === 'Home') { ev.preventDefault(); setPinned(0); setHover(0) }
          else if (ev.key === 'End') { ev.preventDefault(); const l = tl.points.length - 1; setPinned(l); setHover(l) }
          else if (ev.key === 'Escape') { setPinned(null); setHover(null) }
        },
      },
        gridLines, axisLabels,
        tl.area ? h('path', { key: 'area', className: 'sv-area', d: tl.area }) : null,
        h('path', { key: 'line', className: 'sv-line', d: tl.path }),
        // 十字游标：竖线贯穿曲线区 + 曲线上的实心点。固定态用实线、hover 用
        // 虚线——**选中状态不能只依赖颜色**（FR-03）。
        cur ? h('g', { key: 'cursor', className: 'sv-cursor', 'aria-hidden': 'true' },
          h('line', {
            key: 'v', x1: cur.x, x2: cur.x, y1: g.curveTop, y2: g.eventY + 8,
            strokeDasharray: pinned !== null ? undefined : '3 3',
          }),
          h('circle', { key: 'd', cx: cur.x, cy: cur.y, r: pinned !== null ? 4.5 : 3.5 }),
        ) : null,
        markers, tickLabels,
      )
    ),
    // 信息面板：常驻一行，hover / 点击 / 键盘都能驱动。role=status 让读屏
    // 软件跟着游标播报（AC-07）。事件 tooltip 优先于普通请求游标。
    h('div', {
      key: 'cursorinfo', className: 'sv-cursorinfo' + (pinned !== null ? ' sv-cursorinfo-pinned' : ''),
      role: 'status',
    }, eventParts.length > 0 ? eventParts.join(' · ')
      : cursorParts.length > 0 ? cursorParts.join(' · ') : t(lang, 'cursorHint')),
    h('div', { key: 'foot', className: 'sv-chartfoot' },
      footParts.map((p, i) => h('span', { key: 'f' + i }, p))),
    ),
  )
}
