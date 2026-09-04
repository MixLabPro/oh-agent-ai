// 执行时长区块（D7/D8）—— 慢工具调用 / 慢 Turn / 慢 Step / 审批等待延迟。
// 结构仿 SkillSection.tsx：摘要行 + 列表 + 展开抽屉。
//
// Hook 消费面板（D8 的另一半）**不在这里**——D4/D6 已经决定：宿主能不能
// 拿到 hook/* 事件还没验证过，durationAudit 投影压根不携带 hook 数据
// （见 duration.rs::hook_executions 的模块级警告）。渲染一个永远拿不到数据
// 的面板不是"占位"，是假装有一个从没生效过的功能——不如不做，等 D4 的
// 宿主前提验证通过再补。
//
// 审批延迟与 SV609/610 finding 的交叉引用（D8 原文提到的"可以...交叉引用"）
// 也没做：Finding 结构上没有 approval 的 `id` 字段（`call_id` 对审批事件
// 通常是 null，`evidence` 里也不带 id），逐字实现"同一个 approval id"交叉
// 引用在当前数据结构下不成立；退一步做"同 turn 共现"（xrefRules 那种模式）
// 又是一个新维度的猜测关联，不如不做——好过接一个看似精确、实则牵强的引用。
//
// 阈值判断留在客户端，不进 core 规则引擎（DURATION_AUDIT_BACKLOG.md §0 第 2
// 条边界，与 GOVERNANCE_BACKLOG.md G1 同一模式）：超过阈值只变色，**没有任何
// "暂停"/"拦截"按钮**——纯展示。
import { useState } from 'react'
import { React, h } from '../../react'
import { T, tint, formatDuration } from '../../styles'
import { type Lang, t } from '../../i18n'
import type { DurationAudit, ToolCallDuration, TurnDuration, StepDuration, ApprovalLatency } from './types'
import { SectionHeading } from './atoms'

// 同 FindingRow.tsx::GROUP_PAGE_SIZE 一致口径——D1 已经提醒过量级问题
// （一个真实会话可能有几百次工具调用），这里落地成默认只显示 Top N。
const TOP_N = 20

function statusLabel(lang: Lang, status: string): string {
  if (status === 'loaded') return t(lang, 'durationStatusLoaded')
  if (status === 'failed') return t(lang, 'durationStatusFailed')
  if (status === 'decided') return t(lang, 'durationStatusDecided')
  // "待处理"（pending）——确实还没决定，不是配对失败；"未结束"
  // （incomplete）——结构上等到了结束事件却缺字段。两种缺失语义不同，
  // 见 i18n.ts 里各自的注释，UI 措辞必须分开，不能都显示成同一个词。
  if (status === 'pending') return t(lang, 'durationStatusPending')
  return t(lang, 'durationStatusIncomplete')
}

function StatusBadge({ status, lang }: { status: string; lang: Lang }) {
  const isGood = status === 'loaded' || status === 'decided'
  const isBad = status === 'failed'
  // D12：不写死 hex/rgba——'failed' 的颜色是 --sv-status-failed
  // （styles/index.ts 定义，SkillSection.tsx 的 LoadBadge 也在用同一个
  // 变量）；bg/border 统一用 tint() 做透明度混合，不用「hex 字符串 + 十六
  // 进制 alpha 后缀」拼接——那个技巧只对纯 hex 字符串有效，对 T.success/
  // T.warn 这类 var() 引用会拼出无效 CSS 值（SkillSection.tsx 的 LoadBadge
  // 就是这么悄悄坏掉的：`c.color + '40'` 在 color 是 var() 时不生效，这里
  // 不重蹈，用 color-mix 统一处理三种颜色）。
  const color = isBad ? 'var(--sv-status-failed)' : isGood ? T.success : T.warn
  return h('span', {
    style: {
      padding: '1px 6px', borderRadius: 4, fontSize: 11, fontFamily: T.fontMono,
      background: tint(color, 12), color, border: '1px solid ' + tint(color, 40),
    },
  }, statusLabel(lang, status))
}

// duration_ms 降序；null（未结束/缺失）沉底——不是排在最前假装"最快"。
function sortByDurationDesc(rows: any[]): any[] {
  return [...rows].sort((a, b) => {
    if (a.duration_ms == null && b.duration_ms == null) return 0
    if (a.duration_ms == null) return 1
    if (b.duration_ms == null) return -1
    return b.duration_ms - a.duration_ms
  })
}

function DurationDrawer({ fields }: { fields: [string, string][] }) {
  return h('div', {
    style: { padding: '12px 16px', borderTop: '1px solid ' + T.border, background: T.trackBg },
  },
    h('table', { style: { width: '100%', borderCollapse: 'collapse', fontSize: 13 } },
      h('tbody', null,
        fields.map(([label, value]) => h('tr', { key: label },
          h('td', { style: { padding: '3px 8px 3px 0', color: T.dimmed, whiteSpace: 'nowrap', width: '40%' } }, label),
          h('td', { style: { padding: '3px 0', fontFamily: T.fontMono, wordBreak: 'break-all' } }, value),
        )),
      )),
  )
}

function DurationList({ heading, rows, lang, threshold, openId, setOpenId, rowLabel, drawerFields, keyOf }: {
  heading: string
  rows: any[]
  lang: Lang
  threshold: number | null
  openId: string | null
  setOpenId: (id: string | null) => void
  rowLabel: (row: any) => string
  drawerFields: (row: any) => [string, string][]
  keyOf: (row: any) => string
}) {
  const [collapsed, setCollapsed] = useState(rows.length > TOP_N)
  if (rows.length === 0) return null
  const sorted = sortByDurationDesc(rows)
  const shown = collapsed ? sorted.slice(0, TOP_N) : sorted
  return h('div', { style: { marginTop: 12 } },
    SectionHeading({ text: heading + ` · ${rows.length}` }),
    h('div', { className: 'sv-sublist', style: { marginTop: 8 } },
      shown.map((row, i) => {
        const key = keyOf(row)
        const isOpen = openId === key
        const ms = row.duration_ms as number | null
        const slow = threshold != null && ms != null && ms >= threshold
        return h('div', { key: 'r' + i, className: 'sv-skill-row' },
          h('button', {
            type: 'button',
            className: 'sv-skill-row-btn',
            'aria-expanded': isOpen ? 'true' : 'false',
            onClick: () => setOpenId(isOpen ? null : key),
            style: {
              width: '100%', display: 'flex', alignItems: 'center', gap: 8,
              padding: '6px 8px', background: isOpen ? T.trackBg : 'transparent',
              border: 'none', borderRadius: 6, cursor: 'pointer', textAlign: 'left' as const,
            },
          },
            h('span', { style: { flex: 1, fontFamily: T.fontMono, fontSize: 13 } }, rowLabel(row)),
            h('span', {
              style: {
                flexShrink: 0, fontFamily: T.fontMono, fontSize: 13,
                color: slow ? T.error : T.dimmed, fontWeight: slow ? 700 : 400,
              },
            }, formatDuration(ms) ?? '—'),
            h('span', { style: { flexShrink: 0 } }, h(StatusBadge, { status: row.load_status, lang })),
          ),
          isOpen ? h(DurationDrawer, { fields: drawerFields(row) }) : null,
        )
      }),
    ),
    rows.length > TOP_N ? h('button', {
      type: 'button',
      onClick: () => setCollapsed(!collapsed),
      style: { marginTop: 8, padding: '6px 0', background: 'none', border: 'none', color: T.accent, cursor: 'pointer', font: T.fontSmall },
    }, collapsed ? t(lang, 'showAll', { n: rows.length }) : t(lang, 'collapse')) : null,
  )
}

// ── 慢阈值编辑器——同 GOVERNANCE_BACKLOG.md G1 的 BudgetEditor 同一模式。
function ThresholdEditor({ threshold, onSetThreshold, lang }: {
  threshold: number | null; onSetThreshold: (ms: number | null) => void; lang: Lang
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(threshold != null ? String(threshold) : '')

  if (editing) {
    return h('div', { 'data-audit-duration-threshold': '', style: { marginTop: 12, paddingTop: 8, borderTop: '1px solid ' + T.border } },
      h('div', { style: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' } },
        h('label', { htmlFor: 'sv-duration-threshold-input' }, t(lang, 'durationThresholdLabel')),
        h('input', {
          id: 'sv-duration-threshold-input', type: 'number', min: '0', step: '1',
          className: 'sv-note-input', style: { width: 100 },
          value: draft,
          placeholder: t(lang, 'durationThresholdPlaceholder'),
          onChange: (e: any) => setDraft(e.target.value),
        }),
        h('button', {
          type: 'button', className: 'sv-linkbtn', onClick: () => {
            const n = parseFloat(draft)
            onSetThreshold(isFinite(n) && n > 0 ? n : null)
            setEditing(false)
          },
        }, t(lang, 'noteSave')),
        h('button', {
          type: 'button', className: 'sv-linkbtn', onClick: () => {
            setDraft(threshold != null ? String(threshold) : ''); setEditing(false)
          },
        }, t(lang, 'noteCancel')),
      ))
  }
  return h('div', { 'data-audit-duration-threshold': '', style: { marginTop: 12, paddingTop: 8, borderTop: '1px solid ' + T.border } },
    h('div', { style: { display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' } },
      h('span', { style: { color: T.dimmed } },
        threshold != null ? t(lang, 'durationThresholdSet', { ms: threshold }) : t(lang, 'durationThresholdUnset')),
      h('button', {
        type: 'button', className: 'sv-linkbtn',
        onClick: () => { setDraft(threshold != null ? String(threshold) : ''); setEditing(true) },
      }, t(lang, threshold != null ? 'durationThresholdEdit' : 'durationThresholdAdd')),
      threshold != null
        ? h('button', { type: 'button', className: 'sv-linkbtn', onClick: () => onSetThreshold(null) }, t(lang, 'durationThresholdClear'))
        : null,
    ),
    h('div', { style: { marginTop: 4, color: T.dimmed, font: T.fontSmall } }, t(lang, 'durationThresholdDisclaimer')),
  )
}

function toolCallDrawer(lang: Lang, r: ToolCallDuration): [string, string][] {
  const fields: [string, string][] = [
    [t(lang, 'durationToolName'), r.tool_name ?? '—'],
    [t(lang, 'durationCallId'), r.call_id],
    [t(lang, 'skillDuration'), formatDuration(r.duration_ms) ?? '—'],
    [t(lang, 'skillTurnStep') || '位置', r.turn != null ? `T${r.turn}${r.step != null ? '·S' + r.step : ''}` : '—'],
    [t(lang, 'skillSeq') || 'seq', r.seq != null ? String(r.seq) : '—'],
  ]
  if (r.missing_fields.length > 0) fields.push([t(lang, 'skillMissing') || '缺失字段', r.missing_fields.join(', ')])
  return fields
}

function turnDrawer(lang: Lang, r: TurnDuration): [string, string][] {
  const fields: [string, string][] = [
    ['turn', 'T' + r.turn],
    [t(lang, 'skillDuration'), formatDuration(r.duration_ms) ?? '—'],
    [t(lang, 'durationEndedReason'), r.ended_reason ?? '—'],
    [t(lang, 'durationSeqStart'), r.seq_start != null ? String(r.seq_start) : '—'],
    [t(lang, 'durationSeqEnd'), r.seq_end != null ? String(r.seq_end) : '—'],
  ]
  if (r.missing_fields.length > 0) fields.push([t(lang, 'skillMissing') || '缺失字段', r.missing_fields.join(', ')])
  return fields
}

function stepDrawer(lang: Lang, r: StepDuration): [string, string][] {
  const fields: [string, string][] = [
    ['turn·step', `T${r.turn}·S${r.step}`],
    [t(lang, 'skillDuration'), formatDuration(r.duration_ms) ?? '—'],
    [t(lang, 'durationSeqStart'), r.seq_start != null ? String(r.seq_start) : '—'],
    [t(lang, 'durationSeqEnd'), r.seq_end != null ? String(r.seq_end) : '—'],
  ]
  if (r.missing_fields.length > 0) fields.push([t(lang, 'skillMissing') || '缺失字段', r.missing_fields.join(', ')])
  return fields
}

function approvalDrawer(lang: Lang, r: ApprovalLatency): [string, string][] {
  const fields: [string, string][] = [
    [t(lang, 'durationToolName'), r.tool_name ?? '—'],
    [t(lang, 'durationApprovalId'), r.id],
    [t(lang, 'durationWaitMs'), formatDuration(r.wait_ms) ?? '—'],
    [t(lang, 'durationOutcome'), r.outcome ?? '—'],
    [t(lang, 'skillTurnStep') || '位置', r.turn != null ? `T${r.turn}${r.step != null ? '·S' + r.step : ''}` : '—'],
    [t(lang, 'skillSeq') || 'seq', r.seq != null ? String(r.seq) : '—'],
  ]
  if (r.missing_fields.length > 0) fields.push([t(lang, 'skillMissing') || '缺失字段', r.missing_fields.join(', ')])
  return fields
}

// 阶段 C-3（真实审计 2026-08-25 发现）：标题的"条记录"只解决了"这数字不是
// 时长"的歧义，没回答用户真正想知道的"跑得慢不慢"。补一行摘要——最长的
// 一个 turn 花了多久、按已设阈值算有几个慢调用。
//
// "慢调用"只数 tool_calls + turns，不含 steps/approvals——必须跟
// AuditView.tsx 时间线"慢"标记（D9）用同一个范围，否则这里说 18 个，时间
// 线上数出来是另一个数，两处对不上比不说更糟。没设阈值时这半句不出现
// （阈值判断留客户端，没设就没有"慢"这个概念，不能编一个默认值出来）。
function longestTurnOf(data: DurationAudit): { turn: number; ms: number } | null {
  let longest: { turn: number; ms: number } | null = null
  for (const t of data.turns) {
    if (t.duration_ms == null) continue
    if (longest === null || t.duration_ms > longest.ms) longest = { turn: t.turn, ms: t.duration_ms }
  }
  return longest
}
function durationSlowCount(data: DurationAudit, threshold: number): number {
  let n = 0
  for (const r of data.tool_calls) if (r.duration_ms != null && r.duration_ms >= threshold) n++
  for (const r of data.turns) if (r.duration_ms != null && r.duration_ms >= threshold) n++
  return n
}

// 阈值状态提到 AuditView（D9）：时间线要用同一个阈值筛"慢"标记，两处必须
// 读同一个数字——状态只能有一份，不能各存各的（G1 预算阈值同一处境）。
export function DurationSection({ data, lang, threshold, onSetThreshold }: {
  data: DurationAudit; lang: Lang; threshold: number | null; onSetThreshold: (ms: number | null) => void
}) {
  // 四个列表共用一个展开态——同一时刻只开一行，同 VerdictSection 的
  // detail 状态是同一种"只展开一处"的克制。
  const [openId, setOpenId] = useState<string | null>(null)

  const total = data.tool_calls.length + data.turns.length + data.steps.length + data.approvals.length

  if (!data || total === 0) {
    return h('div', { 'data-audit-duration': '', className: 'sv-panel' },
      SectionHeading({ text: t(lang, 'durationHeading') }),
      h('div', { className: 'sv-insight', style: { color: T.dimmed } }, t(lang, 'durationNone')))
  }

  // 审批延迟复用同一套 DurationList/StatusBadge——把 wait_ms 别名成
  // duration_ms、status 别名成 load_status，字段名对齐即可，不必给 DurationList
  // 另开一套只服务审批的渲染逻辑（值语义仍是各自的：'decided'/'pending'
  // 不会被误当成 'loaded'/'incomplete'，StatusBadge 认的是原始字符串）。
  const approvalRows = data.approvals.map(r => ({ ...r, duration_ms: r.wait_ms, load_status: r.status }))
  const longestTurn = longestTurnOf(data)
  const slowCount = threshold != null ? durationSlowCount(data, threshold) : null
  const summaryParts = [
    longestTurn ? t(lang, 'durationLongestTurn', { turn: longestTurn.turn, dur: formatDuration(longestTurn.ms) || '' }) : null,
    slowCount != null ? t(lang, 'durationSlowCount', { n: slowCount }) : null,
  ].filter((s): s is string => s != null)

  return h('div', { 'data-audit-duration': '', className: 'sv-panel' },
    // P2-01（真实审计 2026-08-25 发现）：曾经是"执行时长 · 1125"——那个数是
    // 工具调用/turn/step/审批四类记录数之和，不是任何意义上的时长，读起来
    // 却像"1125 [某个时间单位]"。加上"条记录"消掉这个歧义，不改变数字本身
    // （四类计数之和这个统计口径没变，只是说清楚它是什么）。
    SectionHeading({ text: t(lang, 'durationHeading') + ` · ${total}` + t(lang, 'durationRecordsSuffix') }),
    summaryParts.length > 0
      ? h('div', { key: 'summary', className: 'sv-insight', style: { marginTop: 0, color: T.muted } }, summaryParts.join(' · '))
      : null,
    h(DurationList, {
      heading: t(lang, 'durationToolCallsHeading'), rows: data.tool_calls, lang, threshold, openId, setOpenId,
      keyOf: (r: ToolCallDuration) => 'tc:' + r.call_id,
      rowLabel: (r: ToolCallDuration) => r.tool_name ?? '—',
      drawerFields: (r: ToolCallDuration) => toolCallDrawer(lang, r),
    }),
    h(DurationList, {
      heading: t(lang, 'durationTurnsHeading'), rows: data.turns, lang, threshold, openId, setOpenId,
      keyOf: (r: TurnDuration) => 'tn:' + r.turn,
      rowLabel: (r: TurnDuration) => 'T' + r.turn,
      drawerFields: (r: TurnDuration) => turnDrawer(lang, r),
    }),
    h(DurationList, {
      heading: t(lang, 'durationStepsHeading'), rows: data.steps, lang, threshold, openId, setOpenId,
      keyOf: (r: StepDuration) => 'st:' + r.turn + '.' + r.step,
      rowLabel: (r: StepDuration) => `T${r.turn}·S${r.step}`,
      drawerFields: (r: StepDuration) => stepDrawer(lang, r),
    }),
    h(DurationList, {
      heading: t(lang, 'durationApprovalsHeading'), rows: approvalRows, lang, threshold, openId, setOpenId,
      keyOf: (r: ApprovalLatency) => 'ap:' + r.id,
      rowLabel: (r: ApprovalLatency) => r.tool_name ?? '—',
      drawerFields: (r: ApprovalLatency) => approvalDrawer(lang, r),
    }),
    h(ThresholdEditor, { threshold, onSetThreshold, lang }),
  )
}
