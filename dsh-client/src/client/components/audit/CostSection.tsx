// 成本明细表——逐模型五列，token 数来自 tokenByModel、金额来自 costReport，
// 这里不做任何算术，只格式化。
import { React, h } from '../../react'
import { T, modelShort, formatNumber, formatMoney } from '../../styles'
import { type Lang, t } from '../../i18n'
import type { CostReport, ModelBucket } from './types'
import { formatShare, formatPct } from './derive'
import { SectionHeading } from './atoms'

// 成本明细表：逐模型一行，把总额拆成「未命中输入 / 命中缓存 / 输出 / 高峰
// 占比 / 小计」。**token 数来自 tokenByModel，金额来自 costReport**——两份
// 数据同源于宿主的同一次 usage 折叠，客户端只负责摆在一行里，不做任何算术
// （占比除外，那是纯展示换算）。
//
// sequence 单独传入（来自 tokenByModel），不是 costReport 自己的字段——切换
// 序列是"这次会话按什么顺序用了哪些模型"，跟"这些用量值多少钱"是两个不同的
// 派生视图，没理由揉进金额投影里。
export function CostSection({
  cost, byModel, sequence, lang,
}: {
  cost: CostReport
  byModel: Record<string, ModelBucket> | undefined
  sequence: string[]
  lang: Lang
}) {
  const children: any[] = [
    SectionHeading({ text: t(lang, 'costHeading') }),
  ]

  // 模型切换序列。总额已经在结论区给过了，这里不重复——**全页只有一处总费用**，
  // 再打印一遍会被读成第二个数字。
  if (sequence.length === 1) {
    children.push(h('div', { key: 'single-model', style: { color: T.muted, font: T.fontSmall } }, modelShort(sequence[0])))
  } else if (sequence.length > 1) {
    children.push(h('div', { key: 'seq', style: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 4 } },
      sequence.map((m, i) => h('span', { key: 'seq-' + i, style: { display: 'inline-flex', alignItems: 'center', gap: 4 } },
        h('span', {
          key: 'chip',
          style: { padding: '2px 8px', borderRadius: 999, border: '1px solid ' + T.border, color: T.muted, font: T.fontSmall },
        }, modelShort(m)),
        i < sequence.length - 1 ? h('span', { key: 'arrow', style: { color: T.dimmed } }, '→') : null,
      ))
    ))
  }

  // 表格行顺序跟着 per_model 的插入序（= 宿主 by_model 的遍历序），与 CLI 的
  // cost_block 一致，不另排序。
  const modelKeys = Object.keys(cost.per_model)
  const num = (v: string | null) => h('td', { className: 'sv-num' }, v ?? '—')
  const rows = modelKeys.map(model => {
    const c = cost.per_model[model]
    const b = byModel?.[model]
    // 高峰占比 = 高峰那部分的钱 / 这个模型的总钱。用金额而不是 token 数算：
    // 高峰价是空闲价的两倍，按 token 数算出来的比例会低估高峰的钱包冲击。
    const peakShare = c.total > 0 ? formatPct(c.peak / c.total, 0) : null
    return h('tr', { key: model },
      // 供应商随行给出：同一会话可能横跨两家，只给模型名的话这张表跟任何
      // 一家的账单都对不上。
      h('td', { title: model },
        c.short_name,
        c.provider ? h('span', { key: 'p', style: { color: T.dimmed, marginLeft: 6 } }, c.provider) : null),
      num(b ? formatNumber(b.uncached_input_tokens) : null),
      num(b ? formatNumber(b.cache_read_tokens) : null),
      num(b ? formatNumber(b.output_tokens) : null),
      num(peakShare),
      h('td', { className: 'sv-num sv-total' }, formatMoney(c.total)),
    )
  })

  if (rows.length > 0) {
    children.push(h('div', { key: 'table', className: 'sv-costwrap' },
      h('table', { className: 'sv-costtable' },
        h('thead', { key: 'h' }, h('tr', null,
          h('th', null, t(lang, 'colModel')),
          h('th', null, t(lang, 'colUncached')),
          h('th', null, t(lang, 'colCacheRead')),
          h('th', null, t(lang, 'colOutput')),
          h('th', null, t(lang, 'colPeakShare')),
          h('th', null, t(lang, 'colSubtotal')),
        )),
        h('tbody', { key: 'b' }, rows),
      )
    ))
  }

  // ── 洞察：缓存命中率 ──
  // 这是这张表真正要说的话。¥1,113 本身不可操作，"命中率 18%、命中部分只
  // 省下 ¥6" 才指向一个动作。命中率按 token 算（输入侧口径），花费按
  // cache_read_cost 汇总——后者是 total 内部的切面，不能和 total 相加。
  if (byModel) {
    let hit = 0, uncached = 0
    for (const m of modelKeys) {
      const b = byModel[m]
      if (!b) continue
      hit += b.cache_read_tokens
      uncached += b.uncached_input_tokens
    }
    const allInput = hit + uncached
    const cacheCost = modelKeys.reduce((s, m) => s + (cost.per_model[m]?.cache_read_cost || 0), 0)
    if (allInput > 0) {
      children.push(h('div', { key: 'insight', className: 'sv-insight' },
        hit > 0
          ? t(lang, 'cacheHitInsight', {
            rate: formatPct(hit / allInput),
            hit: formatNumber(hit) || String(hit),
            all: formatNumber(allInput) || String(allInput),
            amount: formatMoney(cacheCost) || '',
          })
          : t(lang, 'cacheHitNone')
      ))
    }
  }

  // 回落到原厂报价的行必须**点名**说出来——一个按别家价估出来的数字，不说清楚
  // 就是在冒充实价。只在真的发生回落时出现，不恒常占版面。
  // 两种依据分开说：fallback = 这家没报价；ambiguous = 报价有但归属不明。
  // 共用一句会把后者说成"供应商没报价"，那是错的。
  for (const [basis, key] of [
    ['fallback', 'pricingFallbackNote'], ['ambiguous', 'pricingAmbiguousNote'],
  ] as const) {
    const hit = modelKeys.filter(m => cost.per_model[m]?.pricing_basis === basis)
    if (hit.length > 0) {
      children.push(h('div', { key: 'basis-' + basis, className: 'sv-insight' },
        t(lang, key, { models: hit.map(m => cost.per_model[m].short_name).join('、') })))
    }
  }

  // **口径必须写在明处**：宿主的投影折的是当前这一份会话日志，子代理跑在各自
  // 独立的 session 文件里（delegationDepth=1、parentSession 指回父会话），它们
  // 的 usage 事件根本不在这个事件流里。实测 session-e4b0be69：父会话 ¥1113.66，
  // 5 个子会话另有 ¥69.74——少算 5.9%。不说清楚，这个数字就是在假装自己是全账。
  children.push(h('div', { key: 'scope', className: 'sv-insight', style: { color: T.dimmed } },
    t(lang, 'costScope')))

  // 高峰计价口径只在真的产生了高峰费用时才解释，没高峰就不占版面。
  if ((cost.peak_total || 0) > 0) {
    children.push(h('div', { key: 'peak-rule', className: 'sv-insight' },
      t(lang, 'peakPortion', { amount: formatMoney(cost.peak_total) || '' }) + '。' + t(lang, 'peakRule')))
  }

  // 覆盖率只在 < 100% 时出现。恒真的「覆盖率 100%」是零信息，常驻只会占版面
  // 并稀释真正有内容的那几行。
  if (cost.unpriced_tokens > 0) {
    const priced = modelKeys.reduce((s, m) => {
      const b = byModel?.[m]
      return s + (b ? b.uncached_input_tokens + b.cache_read_tokens + b.cache_write_tokens : 0)
    }, 0)
    const denom = priced + cost.unpriced_tokens
    children.push(h('div', { key: 'unpriced', className: 'sv-insight', style: { color: T.dimmed } },
      denom > 0
        ? t(lang, 'coverageNote', {
          pct: formatPct(priced / denom),
          n: formatNumber(cost.unpriced_tokens) || String(cost.unpriced_tokens),
        })
        : t(lang, 'unpricedNote', { n: formatNumber(cost.unpriced_tokens) || cost.unpriced_tokens })))
  }

  return h('div', { 'data-audit-cost': '', id: 'sv-section-cost' }, children)
}
