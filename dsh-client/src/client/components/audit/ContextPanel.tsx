// 常驻前缀构成（FR-04a）——只画测到的三行，不出现原型编造的"历史消息/其余
// 未分类"。
import { React, h } from '../../react'
import { T, formatNumber } from '../../styles'
import { type Lang, t } from '../../i18n'
import type { ContextCompositionData, ContextPeak } from './types'
import { formatPct } from './derive'
import { SectionHeading } from './atoms'

// ── 上下文构成：只画测到的三行 ───────────────────────────────────────────
// 原型画了五行，其中最大的两行「历史消息」「其余未分类」我们从来没测过，
// 也**不能用减法补**——requests[].context_tokens 是 provider 实测，
// context.* 是 est_tokens 估算，两个不同估算器相减的差值不是"历史消息的
// 大小"。所以只画三行实测，再给一句真正有用的结论：常驻前缀只占峰值的
// 1.5%，瓶颈在对话历史，别去优化技能目录。
export function ContextPanel({
  comp, peak, lang,
}: {
  comp: ContextCompositionData
  peak: ContextPeak | null
  lang: Lang
}) {
  const rows: { label: string; value: number | null }[] = [
    { label: t(lang, 'compSystem'), value: comp.system_tokens },
    { label: t(lang, 'compTools'), value: comp.tools_tokens },
    { label: t(lang, 'compCatalog'), value: comp.catalog_tokens },
  ]
  const present = rows.filter(r => r.value != null)
  if (present.length === 0) {
    return h('div', { 'data-audit-composition': '', className: 'sv-panel' },
      SectionHeading({ text: t(lang, 'compHeading') }),
      h('div', { className: 'sv-insight', style: { color: T.dimmed } },
        t(lang, 'compUnavailable', { fields: (comp.missingFields || []).join(', ') || '—' })))
  }
  // 条宽按三项里的最大值归一——不按 resident_total，那样三条都会很短且
  // 彼此看不出差别（真实数据里 tools 是 system 的 4 倍，这个差别要看得见）。
  const max = Math.max(...present.map(r => r.value as number))
  const total = comp.resident_total

  return h('div', { 'data-audit-composition': '', className: 'sv-panel' },
    SectionHeading({ text: t(lang, 'compHeading') }),
    h('div', { key: 'rows', className: 'sv-comp' },
      rows.map((r, i) => h('div', { key: 'r' + i, className: 'sv-comp-row' },
        h('span', { key: 'l' }, r.label),
        h('span', { key: 'tr', className: 'sv-comp-track' },
          r.value != null ? h('i', { style: { width: (max > 0 ? (r.value / max) * 100 : 0) + '%' } }) : null),
        // 没测到写「未上报」，**不写 0**——「日志里没有这个事件」和「测到了 0」
        // 是两回事（与 token 区块同一条纪律）。
        // 逐值标注估算，不是只在段末写一句"这三项是估算"——数字会被单独
        // 截图、单独引用，标注必须跟着数字走。
        h('b', { key: 'v' }, r.value != null
          ? t(lang, 'estimatePrefix') + formatNumber(r.value)
          : t(lang, 'unreportedValue')),
      ))
    ),
    total != null ? h('div', { key: 'sum', className: 'sv-insight' },
      peak && peak.tokens > 0
        ? t(lang, 'compTotalOfPeak', { total: t(lang, 'estimatePrefix') + (formatNumber(total) || total), pct: formatPct(total / peak.tokens, 2) })
        : t(lang, 'compTotalNoPeak', { total: t(lang, 'estimatePrefix') + (formatNumber(total) || total), entries: comp.catalog_entries ?? '—' })
    ) : null,
    h('div', { key: 'est', className: 'sv-insight', style: { color: T.dimmed } }, t(lang, 'compEstimate')),
  )
}
