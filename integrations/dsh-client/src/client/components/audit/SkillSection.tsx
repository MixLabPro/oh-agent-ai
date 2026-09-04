// Skill 执行审计区块（T8）—— Skill 摘要 + 列表 + 抽屉。
//
// 摘要一行紧凑统计（FR-SK-02），**不新增 KPI 卡**（PRD 明确）。
// 列表默认排序：失败 → 有 Finding → 关联费用高 → 最近触发 → 名称。
// 「未触发」文案限定当前范围，不得暗示「无用」。
//
// 抽取自 AuditView：原来 skillAudit 数据存在但从未被消费（backlog T5 之前
// 的占位状态），T8 才真正把它渲染出来。
import { useState, useEffect } from 'react'
import { React, h } from '../../react'
import { T, tint, formatNumber, formatMoney, truncate } from '../../styles'
import { type Lang, t } from '../../i18n'
import type { SkillAudit, SkillInvocation, SkillAttribution } from './types'
import { SectionHeading } from './atoms'

// ── 触发方式徽章 ──────────────────────────────────────────────────────
function TriggerBadge({ mode, lang }: { mode: string; lang: Lang }) {
  const isExplicit = mode === 'explicit'
  return h('span', {
    key: 'badge',
    style: {
      padding: '1px 6px',
      borderRadius: 4,
      fontSize: 11,
      fontFamily: T.fontMono,
      background: isExplicit ? 'rgba(59,130,246,0.15)' : 'rgba(168,85,247,0.15)',
      color: isExplicit ? 'var(--sv-skill-explicit)' : 'var(--sv-skill-model)',
      border: '1px solid',
      borderColor: isExplicit ? 'rgba(59,130,246,0.3)' : 'rgba(168,85,247,0.3)',
    },
  }, t(lang, isExplicit ? 'skillExplicit' : 'skillModel'))
}

// ── 加载状态徽章 ────────────────────────────────────────────────────
function LoadBadge({ status, lang }: { status: string; lang: Lang }) {
  // D12：不写死 hex——'#f87171' 提成 --sv-status-failed（styles/index.ts
  // 定义），DurationSection.tsx（D7）的 StatusBadge 也在用同一个变量，不是
  // 两处各写一份同一个颜色的十六进制字面量。
  const cfg: Record<string, { color: string; labelKey: string }> = {
    loaded: { color: T.success, labelKey: 'skillLoaded' },
    failed: { color: 'var(--sv-status-failed)', labelKey: 'skillFailed' },
    incomplete: { color: T.warn, labelKey: 'skillIncomplete' },
  }
  const found = cfg[status]
  // 未知状态没有对应的 i18n key 可查——原样显示 status 本身（通常是一个还没
  // 建模的枚举值），比查不到 key 时 t() 回退成 key 名本身更诚实。
  const c = found
    ? { color: found.color, label: t(lang, found.labelKey) }
    : { color: T.dimmed, label: status }
  // bg/border 统一用 tint() 做透明度混合，不用「hex 字符串 + 十六进制 alpha
  // 后缀」拼接——那个技巧只对纯 hex 字符串有效，T.success/T.warn/
  // --sv-status-failed 都是 var() 引用，`c.color + '40'` 拼出来是无效 CSS
  // （这条就是这么悄悄坏掉的：只有 status 恰好还是原来的裸 hex 字面量时才
  // 生效，改成变量后 border 颜色会静默失效——用 color-mix 统一处理不会有
  // 这个坑）。
  return h('span', {
    style: {
      padding: '1px 6px',
      borderRadius: 4,
      fontSize: 11,
      fontFamily: T.fontMono,
      background: tint(c.color, 12),
      color: c.color,
      border: '1px solid ' + tint(c.color, 40),
    },
  }, c.label)
}

// ── 展开详情抽屉 ─────────────────────────────────────────────────────
// 阶段 B-3：`attr` 是宿主按 [本次调用.seq, 下一次调用.seq) 归因出的
// finding/工具/费用；`undefined` 表示这条调用当前不在归因范围内（子会话
// 调用，或本身缺 seq），要跟"归因算出来正好是 0"分开说，不能用 `null`
// 混同——见 SkillSection 组件里 `attributionFor` 的查表守卫。
function InvocationDrawer({ inv, lang, attr }: { inv: SkillInvocation; lang: Lang; attr: SkillAttribution | undefined }) {
  const fields: [string, string][] = [
    [t(lang, 'skillName') || '技能名', inv.name ?? '—'],
    [t(lang, 'skillTrigger') || '触发方式', t(lang, inv.trigger_mode === 'explicit' ? 'skillExplicit' : 'skillModel')],
    [t(lang, 'skillLoadStatus') || '加载状态', inv.load_status],
    [t(lang, 'skillDuration') || '耗时', inv.duration_ms != null ? `${inv.duration_ms}ms` : '—'],
    [t(lang, 'skillTurnStep') || '位置', inv.turn != null ? `T${inv.turn}${inv.step != null ? '·S' + inv.step : ''}` : '—'],
    [t(lang, 'skillSeq') || 'seq', inv.seq != null ? String(inv.seq) : '—'],
    ['request_seq', inv.request_seq != null ? String(inv.request_seq) : '—'],
    ['call_id', inv.call_id ?? '—'],
    ['agent_id (T6)', inv.agent_id ?? '—'],
    // P0-01：这条调用是在主会话里发生的，还是在某个子会话里——不是同一件
    // 事的换个说法，是"这条调用的坐标属于哪个事件流"，drill-down（P1-01）
    // 落地前，这是用户唯一能核实"是哪个子代理调的"的地方。
    [t(lang, 'skillSourceAgent') || '来源会话',
      inv.source_agent_id ? `${t(lang, 'skillSourceSubagent') || '子代理'} ${inv.source_agent_id.slice(0, 8)}` : (t(lang, 'skillSourceMain') || '主会话')],
  ]
  if (inv.missing_fields.length > 0) {
    fields.push([t(lang, 'skillMissing') || '缺失字段', inv.missing_fields.join(', ')])
  }
  if (attr) {
    fields.push(
      [t(lang, 'skillAttrFindings'), String(attr.findings)],
      [t(lang, 'skillAttrToolCalls'), String(attr.tool_calls)],
      [t(lang, 'skillAttrTokens'), attr.tokens != null ? (formatNumber(attr.tokens) ?? '—') : '—'],
      [t(lang, 'skillAttrCost'), attr.cost != null ? (formatMoney(attr.cost) ?? '—') : '—'],
    )
  } else {
    // 区分两种"没有归因"：子会话调用（范围收窄，故意不做）vs 主会话调用
    // 但缺 seq（没法定位区间）——两者都不是"算出来是 0"，说法不能含糊。
    const reason = inv.source_agent_id !== null
      ? t(lang, 'skillAttrSubagentScope')
      : t(lang, 'skillAttrNoSeq')
    fields.push([t(lang, 'skillAttrFindings'), reason])
  }
  return h('div', {
    style: {
      padding: '12px 16px',
      borderTop: '1px solid ' + T.border,
      background: T.trackBg,
    },
  },
    h('table', {
      style: { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
    },
      h('tbody', null,
        fields.map(([label, value]) => h('tr', { key: label },
          h('td', {
            style: { padding: '3px 8px 3px 0', color: T.dimmed, whiteSpace: 'nowrap', width: '40%' },
          }, label),
          h('td', {
            style: { padding: '3px 0', fontFamily: T.fontMono, wordBreak: 'break-all' },
          }, value),
        )),
      )),
    attr ? h('div', {
      style: { marginTop: 8, fontSize: 12, color: T.dimmed },
    }, t(lang, 'skillAttrCaveat')) : null,
  )
}

// ── Skill 区块 ───────────────────────────────────────────────────────
// P1-01（真实审计 2026-08-25 发现）：`focusId` 是时间线点击 Skill 标记后
// 传进来的外部定位信号（跟 FindingGroup 的 `openId` 同一种机制），可选是
// 因为独立单测/旧调用点不一定会传。展开状态的受控/手动切换逻辑跟
// FindingRow.tsx 的 P1-02B 修复是同一个模式：`manualId` 为 `undefined` 时
// 完全听 `focusId`（时间线怎么定的就怎么显示），用户手动点开关一次就把它
// 钉死成明确的行 id 或 `null`，此后不再跟着 `focusId` 变化——直到
// `focusId` 本身又变了（一次新的跳转）才用 effect 收回 `undefined`，重新
// 交给外部信号。
export function SkillSection(
  { data, lang, focusId, attribution }:
  { data: SkillAudit; lang: Lang; focusId?: string | null; attribution?: SkillAttribution[] },
) {
  const [manualId, setManualId] = useState<string | null | undefined>(undefined)
  useEffect(() => { setManualId(undefined) }, [focusId])

  // 阶段 B-3：宿主只对本会话自己触发的调用（source_agent_id === null）算过
  // 归因——子会话调用的 seq 来自另一条独立事件流，数值偶然相同不代表同一
  // 个位置，绝不能拿它去查这张表（那会把归因张冠李戴地按到一条子会话调用
  // 上）。这个守卫必须在客户端也做一遍，不能只信宿主"没往表里塞子会话数据"
  // ——两边各自守一次同一个不变量才安全。
  const attributionBySeq = new Map<number, SkillAttribution>()
  if (attribution) for (const a of attribution) attributionBySeq.set(a.seq, a)
  const attributionFor = (inv: SkillInvocation): SkillAttribution | undefined => {
    if (inv.source_agent_id !== null || inv.seq == null) return undefined
    return attributionBySeq.get(inv.seq)
  }

  if (!data || data.invocations.length === 0) {
    // P0-02（真实审计 2026-08-25 发现）：曾经不分青红皂白一律说"未触发"——
    // 父会话确实 0 次调用，但子 Agent 日志读不到/解析不完整时（`status ===
    // 'partial'` 且 `missing_sessions` 非空），"未触发"是把"没读到"说成了
    // "读到了、确实没有"，两者是完全不同的确定性。
    //
    // 没有实现的那两态（loading/error）：DSH 的 ProjectionMeta 目前只有
    // `status: 'complete'|'partial'`，没有异步 loading/error 生命周期信号
    // 传到这一层（见 host/index.ts 顶部 ProjectionMeta 注释——那是"下一轮
    // UI 接线"才做的 P2 债，不是这里能补的）；`useProjection` 返回 undefined
    // 时 AuditView 已经整段不渲染（对应"还没有数据"），跟这里能区分的
    // complete/partial 不是同一层信号，不在这个分支里假装补上。
    const partial = data.status === 'partial' && data.missing_sessions.length > 0
    return h('div', { 'data-audit-skills': '', className: 'sv-panel' },
      SectionHeading({ text: t(lang, 'skillHeading') || 'Skill 执行' }),
      h('div', { className: 'sv-insight', style: { color: T.dimmed } },
        partial
          ? t(lang, 'skillNonePartial', { n: data.missing_sessions.length })
          : t(lang, 'skillNone') || '本次会话未触发任何 Skill。'))
  }

  const invs = data.invocations
  // P1-01：稳定 DOM id，按 `data.invocations` 的**原始顺序**分配（不是排序
  // 后的显示顺序）——AuditView 给时间线 Skill 事件算 targetId 时，走的是
  // 同一个数组、同一条 `'sv-sk-' + i` 公式，两边必须用同一个索引基准，否则
  // 排序把第 3 条挪到第 1 位显示时，时间线点击定位到的就是另一条调用。
  // 用对象引用当 Map 的 key——`sorted` 只是重新排列同一批引用，不是深拷贝。
  const domIdOf = new Map<SkillInvocation, string>(invs.map((inv, i) => [inv, 'sv-sk-' + i]))

  // 统计
  const byMode = { explicit: 0, model_selected: 0 }
  const byStatus = { loaded: 0, failed: 0, incomplete: 0 }
  // P2-01（真实审计 2026-08-25 发现）：标题的 N 曾经直接用 `invs.length`——
  // 那是"调用次数"，不是"不同 Skill 数"，同一个 Skill 被调 5 次会读成"5 个
  // Skill"。用 name 去重（缺名的调用归进同一个"未知"桶——它们仍然代表某个
  // Skill，只是没能识别出名字，不该各自算一个"种"）。
  const distinctSkills = new Set<string>()
  for (const inv of invs) {
    byMode[inv.trigger_mode] = (byMode[inv.trigger_mode] || 0) + 1
    byStatus[inv.load_status] = (byStatus[inv.load_status] || 0) + 1
    distinctSkills.add(inv.name ?? ' unknown')
  }

  // 排序：失败 → 有 Finding（暂用 load_status=failed 代表）→ 最近触发(seq desc) → 名称
  const sorted = [...invs].sort((a, b) => {
    const priority = { failed: 0, incomplete: 1, loaded: 2 }
    const pa = priority[a.load_status] ?? 3
    const pb = priority[b.load_status] ?? 3
    if (pa !== pb) return pa - pb
    const seqA = a.seq ?? -1
    const seqB = b.seq ?? -1
    if (seqB !== seqA) return seqB - seqA // 最近触发在前
    const nameA = a.name ?? ''
    const nameB = b.name ?? ''
    return nameA.localeCompare(nameB)
  })

  // 覆盖率。P2-01：`sessions_covered` 类型上是 `number | null`——`?? 0` 会把
  // "还没算出来"显示成"已测量、恰好是 0"，两者是不同的确定性（当前宿主的
  // view() 实际总是给一个真实数字，这里按类型契约防御，不依赖那条实现细节）。
  // 阶段 B-3 顺带发现：这两句一直是硬编码中文，没走 t()——之前没有任何渲染
  // 测试在 sessions_discovered > 0 的英文 locale 下跑过这条分支，所以一直
  // 没被抓到。
  const coverageLine = data.sessions_discovered > 0
    ? data.sessions_covered != null
      ? t(lang, 'skillCoverageLine', { covered: data.sessions_covered, discovered: data.sessions_discovered })
      : t(lang, 'skillCoverageUnknown', { n: data.sessions_discovered })
    : null

  return h('div', { 'data-audit-skills': '', className: 'sv-panel' },
    // P2-01：标题的 N 改成"不同 Skill 数"，调用总次数挪进摘要行第一句
    // （下面的 `${invs.length}${t(lang,'skillInvocations')}`），避免"Skill
    // 执行 · 9"读成"9 个 Skill"。
    SectionHeading({ text: (t(lang, 'skillHeading') || 'Skill 执行') + ` · ${distinctSkills.size}` }),

    // 摘要行（FR-SK-02：不新增 KPI 卡，紧凑统计）
    h('div', {
      key: 'summary',
      className: 'sv-insight',
      style: { marginTop: 4, display: 'flex', flexWrap: 'wrap', gap: 12, fontSize: 13 },
    },
      h('span', null, `${invs.length}${t(lang, 'skillInvocations') || '次调用'}`),
      h('span', null,
        `${byMode.explicit}${t(lang, 'skillExplicit') || '显式'} / ${byMode.model_selected}${t(lang, 'skillModel') || '模型'}`),
      h('span', null,
        `${byStatus.loaded}${t(lang, 'skillLoaded') || '已加载'} / ${byStatus.failed}${t(lang, 'skillFailed') || '失败'} / ${byStatus.incomplete}${t(lang, 'skillIncomplete') || '未完成'}`),
      coverageLine ? h('span', { style: { color: T.muted } }, coverageLine) : null,
    ),

    // 列表
    h('div', { key: 'list', className: 'sv-sublist', style: { marginTop: 12 } },
      sorted.map((inv, i) => {
        // P1-02A（真实审计 2026-08-25 发现）：曾经用 `inv.seq` 当展开身份——
        // `openId` 初值是 `null`，`seq` 也常常是 `null`（缺失字段，同一条纪律
        // 见 skill.rs 头部注释），`null === null` 从渲染起就为真，导致每一条
        // 缺 seq 的调用初始即"已展开"且点不动关闭。现在用上面按原始顺序分配
        // 的稳定字符串 id（`domIdOf`），同时兼作 P1-01 的时间线钻取落点——
        // 两个问题用同一个 id 解决，不是两套机制并存。
        const myId = domIdOf.get(inv) as string
        const isOpen = manualId !== undefined ? manualId === myId : focusId === myId
        const attr = attributionFor(inv)
        return h('div', { key: myId, id: myId, className: 'sv-skill-row' },
          h('button', {
            type: 'button',
            className: 'sv-skill-row-btn',
            'aria-expanded': isOpen ? 'true' : 'false',
            onClick: () => setManualId(isOpen ? null : myId),
            style: {
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '6px 8px',
              background: isOpen ? T.trackBg : 'transparent',
              border: 'none',
              borderRadius: 6,
              cursor: 'pointer',
              textAlign: 'left' as const,
            },
          },
            h('span', { style: { flex: 1, fontFamily: T.fontMono, fontSize: 13 } },
              inv.name ?? (t(lang, 'skillUnknown') || '（未知技能）')),
            // P0-01：子会话自己的 Skill 调用现在会混进同一个列表——不加这个
            // 标记，用户没法分清哪条是主会话自己触发的、哪条是子代理内部
            // 触发的（两者的 seq/turn/step 属于不同的事件流，不能直接比较）。
            inv.source_agent_id
              ? h('span', {
                key: 'src', title: inv.source_agent_id,
                style: {
                  flexShrink: 0, fontSize: 11, padding: '1px 6px', borderRadius: 4,
                  color: T.dimmed, border: '1px solid ' + T.border,
                },
              }, (t(lang, 'skillSourceSubagent') || '子代理') + ' ' + inv.source_agent_id.slice(0, 8))
              : null,
            h('span', { style: { flexShrink: 0 } }, h(TriggerBadge, { mode: inv.trigger_mode, lang })),
            h('span', { style: { flexShrink: 0 } }, h(LoadBadge, { status: inv.load_status, lang })),
            // 阶段 B-3：只在归因算出来真的 > 0 时才占版面——0 条 finding 不
            // 值得在每一行都刷一遍，跟 SubagentSection（P2-01）的 findings
            // 列同一条纪律：只在有信号时发声。
            attr && attr.findings > 0
              ? h('span', {
                key: 'attrf',
                title: t(lang, 'skillAttrFindings'),
                style: { flexShrink: 0, fontSize: 12, fontWeight: 600, color: T.warn },
              }, t(lang, 'skillAttrFindingBadge', { n: attr.findings }))
              : null,
            h('span', {
              style: { color: T.dimmed, fontSize: 12, flexShrink: 0, fontFamily: T.fontMono },
            },
              inv.turn != null ? `T${inv.turn}` : '',
              inv.step != null ? `.${inv.step}` : '',
            ),
          ),
          // FindingRow.tsx（G2）同款：用 `hidden` 属性而不是条件挂载——内容
          // 一直在 DOM 里，只是视觉隐藏，静态渲染（renderToStaticMarkup）才
          // 断言得到抽屉内容；`isOpen` 只控制这一个属性，不控制"渲不渲染"。
          h('div', { hidden: !isOpen }, h(InvocationDrawer, { inv, lang, attr })),
        )
      }),
    ),
  )
}
