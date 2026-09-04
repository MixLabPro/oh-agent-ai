// 子代理区块——本会话派出的子代理，逐个列出用量；点进去继续查看目前降级为
// 复制会话 id（DSH 的 conversation.view 契约没有跨会话导航接口，见组件内
// 注释）。默认「列表」视图；「流程图」是同一份数据的图形化呈现（用户要求：
// 把现有列表换成节点-连线的树状图，不是新数据源，只是换一种视觉呈现）。
import { useState, useRef } from 'react'
import { React, h } from '../../react'
import { T, formatNumber, formatMoney, formatDuration, truncate } from '../../styles'
import { type Lang, t } from '../../i18n'
import type { SubagentSpawns } from './types'
import { writeClipboard } from './actions'
import { SectionHeading } from './atoms'
import { formatShare } from './derive'

// 流程图节点用的行形状——`SubagentSpawns['spawns']` 的元素类型（`SubagentSpawn`
// 加上折算出来的 cost/tokens/findings/duration_ms），不单独从 types.ts 导出
// 一个名字，直接从投影形状本身取，避免两处定义漂移。
type SpawnRow = SubagentSpawns['spawns'][number]

// ── 子代理区块 ──────────────────────────────────────────────────────────
// 用户要的是「这个会话总共花了多少」= 本会话 + 各子代理。子代理跑在各自独立
// 的会话里，父会话的事件流里没有它们的用量——宿主去读那几份日志折出来的。
//
// 逐个列出而不是只给一个合计：用户可能想点进某个子代理继续看。DSH 的
// conversation.view 契约目前没有跨会话导航接口（与 F2 的 seq 跳转同一个限制），
// 所以降级为**复制会话 id**，等宿主补上跳转能力再升级。
// G3（GOVERNANCE_BACKLOG.md）扇出可见性——「本次会话派生了 N 个子 Agent，
// 累计消耗 ¥X（占总费用 Y%）」。数据都已经在（total_cost 来自 subagentUsage，
// 分母要拿本会话自己的费用 selfCost 相加）——这里只是把两者拼成一个句子，
// 不新增数据源。selfCost 算不出时（老宿主/投影未就绪）只报金额不报百分比，
// 不能拿一个算不出的分母硬凑一个数字。
function fanoutLine(lang: Lang, n: number, totalCost: number | null, selfCost: number | null): string | null {
  if (totalCost == null) return null
  const amount = formatMoney(totalCost) || ''
  if (selfCost == null) return t(lang, 'subagentFanoutSummaryNoPct', { n, amount })
  const grand = selfCost + totalCost
  if (grand <= 0) return t(lang, 'subagentFanoutSummaryNoPct', { n, amount })
  return t(lang, 'subagentFanoutSummary', { n, amount, pct: formatShare(totalCost / grand) })
}

function spawnLabel(lang: Lang, sp: SpawnRow): string {
  const desc = sp.description || (sp.agent_id ? sp.agent_id.slice(0, 8) : t(lang, 'subagentNoId'))
  return t(lang, 'subagentRow', { turn: sp.turn != null ? 'T' + sp.turn : '—', desc })
}

// ── 流程图节点 + 连线（几何全在这个函数里手算，不引入图表库——只有「根 +
// 一层子节点」这一种拓扑，写一个通用布局引擎是过度设计）───────────────────
// 纵向堆叠子节点、从根节点用三次贝塞尔曲线连过去，同 TimelinePanel 一样
// **不做任何比例尺推算之外的猜测**：节点数量决定画布高度，不裁剪也不重叠。
const NODE_H = 26
const ROW_GAP = 10
const PAD_Y = 14
const ROOT_X = 42
const NODE_X = 150
const NODE_W = 230

function SubagentFlowDiagram({
  spawns, lang, activeIdx, setActiveIdx, rovingIdx, setRovingIdx,
}: {
  spawns: SpawnRow[]
  lang: Lang
  activeIdx: number | null
  setActiveIdx: (i: number | null) => void
  rovingIdx: number
  setRovingIdx: (i: number) => void
}) {
  const nodeRefs = useRef<(SVGGElement | null)[]>([])
  const n = spawns.length
  const rowH = NODE_H + ROW_GAP
  // 最小高度留出根节点标签（画在圆点正上方）需要的空间——n=1 时朴素算法会
  // 把画布压得很矮，根标签在 y<0 处被裁掉一截。
  const height = Math.max(70, n * rowH - ROW_GAP + PAD_Y * 2)
  const width = NODE_X + NODE_W + 16
  const rootY = height / 2

  // 焦点/选中/固定十字游标同一套语义都挪到这里：Enter/点击「选中」一个节点，
  // 方向键在节点间移动焦点——跟 TimelinePanel 的 moveEventFocus 是同一个
  // 模式（焦点、显示内容一起同步），这里再实现一遍而不是抽公共函数，是因为
  // 两处的「事件」形状（时间线事件 vs 子代理）完全不同，抽出来的公共部分
  // 只剩下几行 clamp 逻辑，收益抵不过多一层间接。
  const moveFocus = (next: number) => {
    if (n === 0) return
    const clamped = Math.max(0, Math.min(n - 1, next))
    setRovingIdx(clamped)
    setActiveIdx(clamped)
    ;(nodeRefs.current[clamped] as any)?.focus()
  }

  const edges = spawns.map((_, i) => {
    const y = PAD_Y + i * rowH + NODE_H / 2
    const x0 = ROOT_X + 20
    const x1 = NODE_X
    const midX = (x0 + x1) / 2
    return h('path', {
      key: 'edge' + i,
      className: 'sv-flow-edge',
      d: `M${x0} ${rootY} C${midX} ${rootY}, ${midX} ${y}, ${x1} ${y}`,
      fill: 'none',
    })
  })

  const nodes = spawns.map((sp, i) => {
    const y = PAD_Y + i * rowH + NODE_H / 2
    const hasFindings = sp.findings != null && sp.findings > 0
    const label = truncate(sp.description || (sp.agent_id ? sp.agent_id.slice(0, 8) : t(lang, 'subagentNoId')), 26)
    const ariaLabel = spawnLabel(lang, sp)
      + (sp.cost != null ? ' · ' + formatMoney(sp.cost) : '')
      + (hasFindings ? ' · ' + t(lang, 'subagentFindingBadge', { n: sp.findings as number }) : '')
    return h('g', {
      key: 'node' + i,
      ref: (el: SVGGElement | null) => { nodeRefs.current[i] = el },
      className: 'sv-flow-node' + (activeIdx === i ? ' sv-flow-node-active' : ''),
      tabIndex: i === Math.min(rovingIdx, n - 1) ? 0 : -1,
      role: 'button',
      'aria-label': ariaLabel,
      'aria-pressed': activeIdx === i ? 'true' : 'false',
      onClick: () => { setActiveIdx(i); setRovingIdx(i) },
      onFocus: () => setActiveIdx(i),
      onKeyDown: (ev: any) => {
        if (ev.key === 'ArrowDown' || ev.key === 'ArrowRight') { ev.preventDefault(); ev.stopPropagation(); moveFocus(i + 1) }
        else if (ev.key === 'ArrowUp' || ev.key === 'ArrowLeft') { ev.preventDefault(); ev.stopPropagation(); moveFocus(i - 1) }
        else if (ev.key === 'Home') { ev.preventDefault(); ev.stopPropagation(); moveFocus(0) }
        else if (ev.key === 'End') { ev.preventDefault(); ev.stopPropagation(); moveFocus(n - 1) }
        else if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); setActiveIdx(i) }
        else if (ev.key === 'Escape') { ev.stopPropagation(); setActiveIdx(null) }
      },
    },
      h('title', { key: 't' }, ariaLabel),
      h('rect', {
        key: 'r', x: NODE_X, y: y - NODE_H / 2, width: NODE_W, height: NODE_H, rx: 6,
        className: 'sv-flow-node-rect' + (hasFindings ? ' sv-flow-node-rect-warn' : ''),
      }),
      h('text', { key: 'lbl', x: NODE_X + 10, y: y + 4, className: 'sv-flow-node-text' }, label),
      hasFindings ? h('circle', { key: 'dot', cx: NODE_X + NODE_W - 12, cy: y, r: 4, className: 'sv-flow-node-dot' }) : null,
    )
  })

  return h('svg', {
    className: 'sv-flow-chart', viewBox: `0 0 ${width} ${height}`,
    role: 'group', 'aria-label': t(lang, 'subagentFlowHint', { n }),
  },
    h('g', { key: 'root' },
      h('circle', { key: 'c', cx: ROOT_X, cy: rootY, r: 14, className: 'sv-flow-root' }),
      // 标签放在圆点正上方而不是塞进圆里——"本会话"/"This session" 长度差
      // 很多，圆的半径固定，塞进去要么截断中文要么英文溢出，不如干脆放外面。
      h('text', { key: 't', x: ROOT_X, y: rootY - 22, textAnchor: 'middle', className: 'sv-flow-root-text' },
        t(lang, 'subagentFlowRoot')),
    ),
    edges, nodes,
  )
}

export function SubagentSection({ data, lang, selfCost }: { data: SubagentSpawns; lang: Lang; selfCost: number | null }) {
  const [copied, setCopied] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<'list' | 'flow'>('list')
  const [activeIdx, setActiveIdx] = useState<number | null>(null)
  const [rovingIdx, setRovingIdx] = useState(0)
  if (data.spawns.length === 0) {
    return h('div', { 'data-audit-subagents': '', className: 'sv-panel' },
      SectionHeading({ text: t(lang, 'subagentHeading') }),
      h('div', { className: 'sv-insight', style: { color: T.dimmed } }, t(lang, 'subagentNone')))
  }
  const fanout = fanoutLine(lang, data.spawns.length, data.total_cost, selfCost)
  const active = activeIdx != null ? data.spawns[activeIdx] : null
  return h('div', { 'data-audit-subagents': '', className: 'sv-panel' },
    h('div', {
      key: 'head', style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' },
    },
      SectionHeading({ text: t(lang, 'subagentHeading') + ' · ' + data.spawns.length }),
      // 「列表 / 流程图」切换——同一份 spawns 数据，两种呈现。默认列表
      // （不改变既有行为），流程图是新增的可选视图。
      h('div', { key: 'seg', className: 'sv-seg', role: 'group', 'aria-label': t(lang, 'subagentHeading') },
        (['list', 'flow'] as const).map(m => h('button', {
          key: m, type: 'button',
          'aria-pressed': viewMode === m ? 'true' : 'false',
          onClick: () => setViewMode(m),
        }, t(lang, m === 'list' ? 'subagentViewList' : 'subagentViewFlow'))),
      ),
    ),
    fanout ? h('div', { key: 'fanout', className: 'sv-insight', style: { marginTop: 4, fontWeight: 600 } }, fanout) : null,
    h('div', { key: 'scope', className: 'sv-insight', style: { marginTop: 0 } }, t(lang, 'subagentScope')),
    // 列表视图：内容和结构原样保留，只是用 `hidden` 属性切换（同 P1-04/G2
    // 的既定纪律：内容留在标记里，renderToStaticMarkup 断言得到，不靠条件
    // 挂载）。
    h('div', { key: 'rows', className: 'sv-sublist', hidden: viewMode !== 'list' },
      data.spawns.map((sp, i) => h('div', { key: 'sa' + i, className: 'sv-subrow' },
        h('span', { key: 't', className: 'sv-subturn' }, sp.turn != null ? 'T' + sp.turn : '—'),
        h('span', { key: 'd', className: 'sv-subdesc', title: sp.description || '' },
          sp.description || (sp.agent_id ? sp.agent_id.slice(0, 8) : t(lang, 'subagentNoId'))),
        // 读不到就写「—」，不写 ¥0——「没读到」和「花了 0 块」是两回事。
        h('span', { key: 'k', className: 'sv-subnum' }, sp.tokens != null ? formatNumber(sp.tokens) : '—'),
        h('span', { key: 'c', className: 'sv-subnum' }, sp.cost != null ? formatMoney(sp.cost) : '—'),
        // 子代理跑了多久（原生 DSH UI 会显示，见 host/index.ts::eventSpanMs
        // 的模块注释）；读不到子会话日志时同样写「—」，不是 0ms。
        h('span', { key: 'du', className: 'sv-subnum', title: t(lang, 'subagentDuration') },
          sp.duration_ms != null ? formatDuration(sp.duration_ms) : '—'),
        // P2-01（真实审计 2026-08-25 发现）：`findings` 字段一直都在
        // （host/index.ts::subagentUsage 早就算了），只是没有哪个组件把它
        // 渲染出来——用户没法不点开每一个子代理就看出哪个高风险。>0 时
        // 用 T.warn 提示，不新增一个独立的"风险"图标体系。
        h('span', {
          key: 'f', className: 'sv-subnum', title: t(lang, 'subagentFindings'),
          style: sp.findings != null && sp.findings > 0 ? { color: T.warn, fontWeight: 600 } : undefined,
        }, sp.findings != null ? String(sp.findings) : '—'),
        sp.agent_id
          ? h('button', {
            key: 'id', type: 'button', className: 'sv-linkbtn',
            title: sp.agent_id,
            onClick: () => writeClipboard(sp.agent_id as string, ok => setCopied(t(lang, ok ? 'copyOk' : 'copyFail'))),
          }, t(lang, 'copySessionId'))
          : null,
      ))),
    // 流程图视图：节点-连线的树状图 + 常驻详情面板（同 TimelinePanel 的
    // cursorinfo 模式——面板固定在图下方，键盘/点击都能驱动，不用浮层，
    // 触屏也摸得到）。跟列表一样用 `hidden` 切换，保持在标记里。
    h('div', { key: 'flow', hidden: viewMode !== 'flow' },
      h('div', { key: 'chartwrap', className: 'sv-flow-chartwrap' },
        h(SubagentFlowDiagram, { spawns: data.spawns, lang, activeIdx, setActiveIdx, rovingIdx, setRovingIdx })),
      h('div', { key: 'detail', className: 'sv-flow-detail', role: 'status' },
        active
          ? [
            h('div', { key: 'title', className: 'sv-flow-detail-title' }, spawnLabel(lang, active)),
            h('div', { key: 'stats', className: 'sv-insight' },
              [
                active.tokens != null ? formatNumber(active.tokens) : '—',
                active.cost != null ? formatMoney(active.cost) : '—',
                active.duration_ms != null ? formatDuration(active.duration_ms) : '—',
                active.findings != null ? t(lang, 'subagentFindingBadge', { n: active.findings }) : '—',
              ].join(' · ')),
            active.agent_id
              ? h('button', {
                key: 'id', type: 'button', className: 'sv-linkbtn',
                title: active.agent_id,
                onClick: () => writeClipboard(active.agent_id as string, ok => setCopied(t(lang, ok ? 'copyOk' : 'copyFail'))),
              }, t(lang, 'copySessionId'))
              : null,
          ]
          : t(lang, 'subagentFlowSelectHint'),
      ),
    ),
    copied ? h('div', { key: 'toast', role: 'status', className: 'sv-insight', style: { color: T.success } }, copied) : null,
    // 有 id 却读不到日志时总额是低估——必须说出来。
    data.status === 'partial' && (data.missingFields || []).includes('subagent_cost')
      ? h('div', { key: 'warn', className: 'sv-insight', style: { color: T.warn } }, t(lang, 'subagentUnreadable'))
      : null,
  )
}
