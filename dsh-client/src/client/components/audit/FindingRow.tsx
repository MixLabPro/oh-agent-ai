// 证据队列的一行：NoteEditor（FR-10 备注编辑器）+ FindingRow（单行，可展开）
// + FindingGroup（按严重度分组、同级分页）。三者强耦合（NoteEditor 只在
// FindingRow 里用，FindingGroup 只是循环渲染 FindingRow），放一个文件。
import { useState, useEffect, useRef } from 'react'
import { React, h } from '../../react'
import { T, SEVERITY, truncate, formatNumber, formatMoney } from '../../styles'
import { type Lang, t, ruleLabel, severityLabel } from '../../i18n'
import type { FindingGroupedRow, Note } from './types'
import { copySeq, writeClipboard } from './actions'

type NoteProps = {
  notes: Record<string, Note>
  setNote: (key: string, text: string | undefined) => void
  lang: Lang
  openId: string | null
}

// 备注编辑器。**不改变 finding 本身**：不淡化、不置顶、不移出列表——FR-10
// 明令「备注不得删除、修改、隐藏或重排原始 finding」。它只是在这一行下面多
// 挂一段文字。
//
// subject（P1-04）：多行"添加备注"曾经共用同一个可访问名称，屏幕阅读器分
// 不清是哪一行——传入形如"SV613 T31·s2"的短标识，拼进 aria-label。
export function NoteEditor({ noteKey: key, note, setNote, lang, subject }: {
  noteKey: string; note: Note | undefined; setNote: NoteProps['setNote']; lang: Lang; subject: string
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(note?.text || '')
  // 删除要能撤销（FR-10）：把刚删掉的文本先留在手边，撤销就是写回去。
  const [undoable, setUndoable] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  const flash = (msg: string) => { setToast(msg) }
  const btn = (label: string, onClick: () => void, key2: string, ariaLabel?: string) => h('button', {
    key: key2, type: 'button', className: 'sv-linkbtn', onClick,
    ...(ariaLabel ? { 'aria-label': ariaLabel } : {}),
  }, label)

  if (editing) {
    return h('div', { className: 'sv-note sv-note-edit' },
      h('textarea', {
        key: 'ta', className: 'sv-note-input', value: draft, rows: 2,
        'aria-label': t(lang, 'noteLabel'),
        placeholder: t(lang, 'notePlaceholder'),
        onChange: (e: any) => setDraft(e.target.value),
      }),
      h('div', { key: 'act', className: 'sv-note-actions' },
        btn(t(lang, 'noteSave'), () => {
          const text = draft.trim()
          setNote(key, text === '' ? undefined : text)
          setEditing(false)
          flash(t(lang, text === '' ? 'noteDeleted' : 'noteSaved'))
        }, 'save'),
        btn(t(lang, 'noteCancel'), () => { setDraft(note?.text || ''); setEditing(false) }, 'cancel'),
      ),
    )
  }
  const children: any[] = []
  if (note) {
    children.push(h('div', { key: 'body', className: 'sv-note-body' },
      h('span', { key: 'l', className: 'sv-note-tag' }, t(lang, 'noteLabel')), note.text))
  }
  children.push(h('div', { key: 'act', className: 'sv-note-actions' },
    note
      ? btn(t(lang, 'noteEdit'), () => { setDraft(note.text); setEditing(true) }, 'edit', t(lang, 'noteEditFor', { subject }))
      : btn(t(lang, 'noteAdd'), () => { setDraft(''); setEditing(true) }, 'add', t(lang, 'noteAddFor', { subject })),
    note ? btn(t(lang, 'noteDelete'), () => {
      setUndoable(note.text); setNote(key, undefined); flash(t(lang, 'noteDeleted'))
    }, 'del', t(lang, 'noteDeleteFor', { subject })) : null,
    undoable !== null ? btn(t(lang, 'noteUndo'), () => {
      setNote(key, undoable); setUndoable(null); flash(t(lang, 'noteSaved'))
    }, 'undo') : null,
    // aria-live：新增/编辑/删除都要有即时反馈（FR-10），读屏软件也要听得见。
    toast ? h('span', { key: 'toast', className: 'sv-note-toast', role: 'status' }, toast) : null,
  ))
  return h('div', { className: 'sv-note' }, children)
}

// G2（GOVERNANCE_BACKLOG.md）：这段循环真实烧了多少（SV611/612/613 独有）。
// `tokens` 为 null 时区间内没有任何请求行——不展示这行，不是"烧了 0"；
// `tokens` 有值但 `cost` 为 null 时（区间内有请求但都定不了价）只报 token
// 数，不硬凑一个算不出的费用。
// `occurrences`（真实审计 2026-08-25 发现的修复）：这一行可能是**多次独立
// 命中**合并显示的（同一 (rule, evidence) 撞了两次，见 dedupeFindings 的
// ×N 徽章），`loop_tokens`/`loop_cost` 是这些命中的总和——文案必须说清楚
// 是"这 N 次命中累计"而不是"这一段循环"，否则用户会把总和误当成单次数字。
function loopCostLine(
  lang: Lang,
  tokens: number | null | undefined,
  cost: number | null | undefined,
  occurrences: number | undefined,
): string | null {
  if (tokens == null) return null
  const n = formatNumber(tokens) ?? String(tokens)
  const count = occurrences ?? 1
  const multi = count > 1
  if (cost == null) return t(lang, multi ? 'loopCostTokensOnlyMulti' : 'loopCostTokensOnly', { n, count })
  const amount = formatMoney(cost) || ''
  return t(lang, multi ? 'loopCostBothMulti' : 'loopCostBoth', { n, amount, count })
}

export function FindingRow({ f, notes, setNote, lang, openId }: { f: FindingGroupedRow } & NoteProps) {
  const sev = SEVERITY[f.severity as keyof typeof SEVERITY] || SEVERITY.info
  // ruleLabel 查不到映射时会原样返回规则码——那样这一行就会把规则码打两遍
  // （真实会话上看到的「SV-COST-02 SV-COST-02 连续 5 次工具失败…」）。
  const rawLabel = ruleLabel(lang, f.rule)
  const label = rawLabel === f.rule ? null : rawLabel
  // core 的 evidence 有时以规则名开头（SV613 是「进度停滞: 连续 5 个…」），
  // 与左边的标签连起来读成「进度停滞 进度停滞:」。去掉这个重复前缀不丢信息，
  // 完整原文仍在展开详情里。
  const evidence = label && f.evidence.startsWith(label)
    ? f.evidence.slice(label.length).replace(/^[:：]\s*/, '')
    : f.evidence
  const note = notes[f.key]
  // P1-02B（真实审计 2026-08-25 发现）：曾经是 `const [open, setOpen] =
  // useState(false)` + `expanded = open || openId === f.domId`——时间线点开
  // 一条 finding 后 `openId` 永久指向它（AuditView 里设置它的那处从没清空
  // 过），布尔 OR 就永远短路成 true，用户点"收起"只改得动本地 `open`，改不
  // 动这个恒真的 OR，行为上等于关不掉。
  //
  // 换成一个"未覆盖时听 openId、用户操作过就听用户"的三态：`override` 为
  // `null` 时展开状态完全跟随 `openId === f.domId`（时间线怎么定的就怎么显示，
  // 这一步不依赖任何 effect，`renderToStaticMarkup` 的单趟渲染也能拿到正确
  // 结果）；用户点一次开关就把 `override` 钉死成明确的开/关，此后不管
  // `openId` 还指不指着这一行都听用户的。`openId`（外部一次新的"跳转到某一
  // 行"信号）变化时用 effect 把 `override` 收回 `null`——一次新的跳转应该
  // 重新按 openId 展开，不该被上一次跳转时用户对**另一行**的手动关闭卡住
  // （`openId` 是全组件共享的单一值，不加这一步会导致下一次跳转到全新的一
  // 行时，那一行莫名其妙带着别人的"已手动关闭"状态）。
  //
  // 测试覆盖的边界：本仓库不依赖 jsdom（见 verify-render.mjs 头部注释），
  // `renderToStaticMarkup` 只能拿到单趟渲染结果，不会跑 effect、也无法模拟
  // 点击——"openId 匹配时初始展开"这一半能静态断言到（见 verify-render.mjs
  // 的 P1-02A/P1-02B 相关用例），"手动关闭后不再被 openId 拉回去"这一半只能
  // 靠读代码推理正确性 + 真机人工验证，不是自动化测试的盲区被忽略了。
  const [override, setOverride] = useState<boolean | null>(null)
  useEffect(() => { setOverride(null) }, [openId])
  const [copied, setCopied] = useState<string | null>(null)
  // 更多菜单（P0-01/P1-04）：复制证据 / 复制 JSON / 复制 seq 从三个常驻按钮
  // 收进一个菜单——桌面减噪声，小屏不再把整组按钮挤出可视区域。菜单项始终
  // 渲染在 DOM 里、用 `hidden` 属性切换可见性（不是条件渲染），这样
  // renderToStaticMarkup 快照仍能断言到"复制证据"这几个字——和 .sv-fdetail
  // 展开详情同一套纪律。
  const [menuOpen, setMenuOpen] = useState(false)
  // P1-04 菜单键盘模型：role=menu/menuitem 光有 ARIA 角色不够——WAI-ARIA
  // "菜单按钮"模式还要求焦点管理（打开时焦点移进菜单、Esc/选中后焦点还给
  // 触发按钮）和方向键遍历，之前只有 onBlur 关闭 + 鼠标点击，键盘用户能
  // Tab 进菜单项但出不去（Esc 无效）、也没法用方向键在项间移动，只能一路
  // Tab。`moreBtnRef` 记住触发按钮，焦点要还给它；`menuRef` 用来在打开时
  // 找到第一个菜单项、以及方向键时枚举全部菜单项。
  const moreBtnRef = useRef<HTMLButtonElement | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    if (menuOpen) {
      const first = menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]')
      first?.focus()
    }
  }, [menuOpen])
  const closeMenu = (returnFocus: boolean) => {
    setMenuOpen(false)
    if (returnFocus) moreBtnRef.current?.focus()
  }
  const expanded = override !== null ? override : openId === f.domId
  const coords = [
    f.turn != null ? 'T' + f.turn : null,
    f.step != null ? 's' + f.step : null,
    f.latestSeq != null ? '#' + f.latestSeq : null,
    f.call_id,
  ].filter(Boolean).join(' · ')
  // 唯一 aria-label 用的短标识（P1-04 举的例子是"SV613 T31·s2"）：规则码 +
  // turn/step，不含 seq/callId——够短也够唯一，用来区分页面上同名的多个
  // "添加备注"/"展开详情"/"更多操作"按钮。
  const shortCoords = [f.turn != null ? 'T' + f.turn : null, f.step != null ? 's' + f.step : null]
    .filter(Boolean).join('·')
  const subject = shortCoords ? f.rule + ' ' + shortCoords : f.rule
  const toggleRow = () => setOverride(!expanded)
  const stop = (e: any) => e.stopPropagation()
  const loopLine = loopCostLine(lang, f.loop_tokens, f.loop_cost, f.loop_occurrences)

  const detail = h('div', { key: 'detail', className: 'sv-fdetail', hidden: !expanded },
    h('dl', { key: 'dl' },
      h('dt', { key: 'k1' }, t(lang, 'detailEvidence')), h('dd', { key: 'v1' }, f.evidence),
      h('dt', { key: 'k2' }, t(lang, 'detailCoords')), h('dd', { key: 'v2' }, coords || '—'),
      h('dt', { key: 'k3' }, t(lang, 'detailCategory')), h('dd', { key: 'v3' }, f.category),
      f.count > 1 ? h('dt', { key: 'k4' }, t(lang, 'detailOccurrences')) : null,
      f.count > 1 ? h('dd', { key: 'v4' }, f.count + ' · ' + f.seqs.join(', ')) : null,
      f.waste_tokens !== undefined ? h('dt', { key: 'k5' }, t(lang, 'detailWaste')) : null,
      f.waste_tokens !== undefined
        ? h('dd', { key: 'v5' }, t(lang, 'wasteTokens', { n: formatNumber(f.waste_tokens) || f.waste_tokens }))
        : null,
      loopLine ? h('dt', { key: 'k6' }, t(lang, 'detailLoopCost')) : null,
      loopLine ? h('dd', { key: 'v6' }, loopLine) : null,
    ),
    // 交叉引用：浪费与同 turn 的行为 finding 是同一起事件，不加这句用户会
    // 读成出了两件事（原型就是并排两张卡片，没说它们的关系）。
    f.xrefRules && f.xrefRules.length > 0
      ? h('div', { key: 'xref', className: 'sv-xref' },
        t(lang, 'wasteXref', {
          turn: f.turn ?? '?',
          rules: f.xrefRules.map(r => r + ' ' + ruleLabel(lang, r)).join('、'),
        }))
      : null,
    f.suggestion
      ? h('div', { key: 'sug', className: 'sv-suggest' }, t(lang, 'detailSuggest') + '：' + f.suggestion)
      : null,
  )
  // 选中一项之后菜单消失，焦点要还给触发按钮（`closeMenu(true)`）——不还的话
  // 键盘用户选完一项，焦点掉回 <body>，得重新从页面顶部 Tab 找回来。
  const doCopyEvidence = () => {
    writeClipboard(f.evidence, ok => setCopied(t(lang, ok ? 'copyOk' : 'copyFail')))
    closeMenu(true)
  }
  const doCopyJson = () => {
    writeClipboard(JSON.stringify({
      rule: f.rule, severity: f.severity, category: f.category, tool_name: f.tool_name,
      evidence: f.evidence, occurrences: f.count, seqs: f.seqs,
      turn: f.turn, step: f.step, call_id: f.call_id,
      waste_tokens: f.waste_tokens ?? null, suggestion: f.suggestion ?? null,
      loop_tokens: f.loop_tokens ?? null, loop_cost: f.loop_cost ?? null,
      loop_occurrences: f.loop_occurrences ?? null,
    }, null, 2), ok => setCopied(t(lang, ok ? 'copyOk' : 'copyFail')))
    closeMenu(true)
  }
  const doCopySeq = () => {
    copySeq(f.seqs, ok => setCopied(t(lang, ok ? 'copyOk' : 'copyFail')))
    closeMenu(true)
  }
  // row 本身可点（P1-04"整行点击/Enter 展开"的鼠标路径）；键盘路径仍走下面
  // 那个真正的 <button data-key=exp>——一个 role=button 的 div 里嵌真实
  // <button> 是无效的 ARIA 嵌套，所以不把整个 row 变成 role=button，只是
  // 顺手在背景区域挂了 onClick，内部按钮各自 stopPropagation 避免双重触发。
  const row = h('div', {
    key: 'row', className: 'sv-frow-row',
    onClick: toggleRow,
  },
    h('span', { key: 'glyph', 'aria-hidden': 'true', style: { color: sev.color, fontWeight: 700, flexShrink: 0 } }, sev.glyph),
    // data-rule：稳定的测试钩子。行内还有多处 aria-label 也带规则码文本
    // （更多操作/展开详情/添加备注），纯靠"文本里出现过 SVxxx"已经定位不到
    // 唯一是这一处了，要有一个显式标记。
    h('span', { key: 'rule', 'data-rule': f.rule, style: { color: sev.color, fontWeight: 600, flexShrink: 0, fontFamily: T.fontMono } }, f.rule),
    f.count > 1 ? h('span', { key: 'count', title: t(lang, 'dupCountTitle', { n: f.count }), style: { color: T.dimmed, fontWeight: 700, flexShrink: 0 } }, '×' + f.count) : null,
    label ? h('span', { key: 'label', style: { color: T.muted, flexShrink: 0 } }, label) : null,
    f.tool_name ? h('span', { key: 'tool', style: { color: T.dimmed, flexShrink: 0 } }, f.tool_name) : null,
    h('span', { key: 'evidence', className: 'sv-frow-evidence', title: f.evidence }, truncate(evidence)),
    h('span', { key: 'trailing', className: 'sv-frow-trailing' },
      f.latestSeq != null ? h('span', { key: 'seq', style: { color: T.dimmed, fontFamily: T.fontMono } }, '#' + f.latestSeq) : null,
      copied ? h('span', { key: 'copied', role: 'status', style: { color: T.success, font: T.fontSmall } }, copied) : null,
      h('span', { key: 'menuwrap', className: 'sv-frow-menuwrap' },
        h('button', {
          key: 'more', ref: moreBtnRef, type: 'button', className: 'sv-frow-more',
          onClick: (e: any) => { stop(e); setMenuOpen(!menuOpen) },
          'aria-haspopup': 'true',
          'aria-expanded': menuOpen ? 'true' : 'false',
          'aria-label': t(lang, 'moreActionsFor', { subject }),
          title: t(lang, 'moreActions'),
        }, '⋯'),
        h('div', {
          key: 'menu', ref: menuRef, className: 'sv-frow-menu', role: 'menu', hidden: !menuOpen,
          onClick: stop,
          onBlur: (e: any) => {
            if (!e.currentTarget.contains(e.relatedTarget)) setMenuOpen(false)
          },
          // WAI-ARIA 菜单按钮模式：Esc 关闭并把焦点还给触发按钮；↑/↓/Home/End
          // 在菜单项间移动（wrap 到首尾）——之前完全没有，键盘用户只能一路
          // Tab，出不去也跳不动。
          onKeyDown: (e: any) => {
            if (e.key === 'Escape') { e.stopPropagation(); closeMenu(true); return }
            if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return
            e.preventDefault()
            e.stopPropagation()
            const items = Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') || [])
            if (items.length === 0) return
            const idx = items.indexOf(document.activeElement as HTMLElement)
            const next = e.key === 'ArrowDown' ? (idx + 1) % items.length
              : e.key === 'ArrowUp' ? (idx - 1 + items.length) % items.length
              : e.key === 'Home' ? 0
              : items.length - 1
            items[next]?.focus()
          },
        },
          h('button', { key: 'copy-ev', type: 'button', role: 'menuitem', className: 'sv-frow-menuitem', onClick: doCopyEvidence }, t(lang, 'copyEvidence')),
          h('button', { key: 'copy-json', type: 'button', role: 'menuitem', className: 'sv-frow-menuitem', onClick: doCopyJson }, t(lang, 'copyJson')),
          f.seqs.length > 0 ? h('button', {
            key: 'copy-seq', type: 'button', role: 'menuitem', className: 'sv-frow-menuitem', onClick: doCopySeq,
          }, t(lang, f.seqs.length > 1 ? 'copyMany' : 'copyOne', { n: f.seqs.length })) : null,
        ),
      ),
      h('button', {
        key: 'exp', type: 'button', className: 'sv-frow-exp',
        onClick: (e: any) => { stop(e); toggleRow() },
        'aria-expanded': expanded ? 'true' : 'false',
        'aria-label': t(lang, expanded ? 'collapseFor' : 'expandFor', { subject }),
        title: expanded ? t(lang, 'collapseRow') : t(lang, 'expand'),
      }, expanded ? '▾' : '▸'),
    ),
  )
  // id 挂在外层容器上，时间线点击后 scrollIntoView 才有落点。
  return h('div', { key: f.key, id: f.domId, className: note ? 'sv-frow sv-frow-noted' : 'sv-frow' },
    row, detail,
    h(NoteEditor, { key: 'note', noteKey: f.key, note, setNote, lang, subject }),
  )
}

// 这不是 FR-03"不得仅以 finding 数量决定展开状态"要管的那个阈值——那条针对
// 的是会话健康时间线（单个事件是否默认展开，折叠可能藏住不同严重度的风险）。
// 这里是**同一严重度分组内**的长列表分页：组内条目严重度全同（按 sev 分组
// 本身保证的），折叠不可能藏起更高严重度，退化成普通的"先显示 N 条，点击看
// 全部"，是正常的可读性节流，不是风险隐藏。之前把这条和 FR-03 那条混为一谈，
// 是记录"还有哪些工作"时的误判——事后核对两者管的是不同组件才发现。
const GROUP_PAGE_SIZE = 20

export function FindingGroup({ sev, items, notes, setNote, lang, openId }: { sev: string; items: FindingGroupedRow[] } & NoteProps) {
  const cfg = SEVERITY[sev as keyof typeof SEVERITY]!
  const [collapsed, setCollapsed] = useState(items.length > GROUP_PAGE_SIZE)
  const shown = collapsed ? items.slice(0, GROUP_PAGE_SIZE) : items
  return h('div', { style: { marginBottom: T.space.lg } },
    h('div', { key: 'gh', style: { display: 'flex', alignItems: 'center', gap: 6, color: cfg.color, fontWeight: 600, font: T.fontSmall, marginBottom: T.space.xs } },
      cfg.glyph + ' ' + severityLabel(lang, sev) + ' · ' + items.length),
    h('div', { key: 'rows' }, shown.map(f => h(FindingRow, { key: f.key, f, notes, setNote, lang, openId }))),
    items.length > GROUP_PAGE_SIZE && h('button', {
      key: 'toggle', onClick: () => setCollapsed(!collapsed),
      style: { marginTop: T.space.xs, padding: '6px 0', background: 'none', border: 'none', color: T.accent, cursor: 'pointer', font: T.fontSmall },
    }, collapsed ? t(lang, 'showAll', { n: items.length }) : t(lang, 'collapse')),
  )
}
