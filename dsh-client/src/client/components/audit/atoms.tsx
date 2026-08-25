// 全局都在用的几个小组件：token 条形图、区块标题、分隔线。太小、太通用，
// 不值得各自开一个文件。
import { React, h } from '../../react'
import { T, TOKEN_SEGMENTS, formatNumber } from '../../styles'
import { type Lang, t } from '../../i18n'
import type { Usage } from './types'

export function TokenBar({ usage, lang }: { usage: Usage; lang: Lang }) {
  const parts = TOKEN_SEGMENTS.map(seg => ({
    ...seg,
    label: t(lang, seg.labelKey),
    value: seg.pick(usage),
  })).filter(p => p.value > 0)
  const total = parts.reduce((s, p) => s + p.value, 0)
  if (total <= 0) return null
  return h('div', {
    'data-audit-tokenbar': '',
    style: { display: 'flex', height: 6, borderRadius: 3, overflow: 'hidden', gap: 2, background: T.trackBg, marginTop: T.space.xs },
  }, parts.map(p => h('div', {
    key: p.key,
    title: p.label + ' ' + formatNumber(p.value),
    style: { width: (p.value / total) * 100 + '%', minWidth: 2, background: T.accent, opacity: p.opacity },
  })))
}

export function SectionHeading({ text }: { text: string }) {
  return h('div', {
    key: 'heading',
    style: { font: T.fontSmall, color: T.muted, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: T.space.sm },
  }, text)
}

// 一级区块标题（P1-06）——比 SectionHeading 视觉权重更高一档，带 1px 分隔
// 线，用来区分"会话资源概览/会话健康时间线/上下文归因与优化线索/Finding
// 队列"这四个一级区块；区块内部的"费用估算/Token 用量/常驻前缀构成/结构
// 性浪费/子代理"仍用 SectionHeading，两级样式故意不同。真实 <h2>（原来
// SectionHeading 只是个 div）——页面此前没有任何标题层级，读屏软件按标题
// 跳转无从跳起。
export function SectionHeader({ text }: { text: string }) {
  return h('div', { className: 'sv-section-header' },
    h('h2', { className: 'sv-section-title' }, text),
  )
}

export function Divider() {
  return h('div', { style: { height: 1, background: T.border, margin: T.space.lg + 'px 0' } })
}
