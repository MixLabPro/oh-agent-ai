/**
 * dsh-agent-vitals-audit — Client half (browser bundle entry).
 *
 * Renders the "审计" tab: reads behaviorFindings / tokenUsage / tokenByModel
 * from the standard kit's useProjection hook and formats them as a severity-
 * ordered findings list + token composition bar + per-model price estimate.
 *
 * Built with tsup (external: react/*), not tsdown — tree-external compatible.
 * All React components use the JSX automatic runtime (jsxImportSource: react).
 */

import { React, h } from './react'
import { useState } from 'react'
import type { ConvViewProps } from '@deepseek-ai/dsh-client-ui-conversation/client'
import { AuditView } from './components/AuditView'
import { STYLES } from './styles'
import { buildTimeline, modelSwitchEvents, nearestPoint, requestOrdinal } from './timeline'
import { buildExportPayload, redactPath } from './export'
import { t, loadLang, type Lang, setHostLang } from './i18n'

const NS = 'dsh-agent-vitals-audit'

function apply(ctx: { slots: any; effect: (fn: () => void | (() => void), tag: string) => void; locale?: any }) {
  // Initialize lang from DSH's Language setting (ctx.locale).
  // Fallback chain: DSH setting > localStorage user choice > navigator.language > zh-CN
  if (ctx.locale) {
    try {
      // DSH locale object might have: language, lang, t(), etc.
      // Try to extract a language string and normalize it to our supported set.
      let langStr: string | undefined
      if (typeof ctx.locale.language === 'string') {
        langStr = ctx.locale.language
      } else if (typeof ctx.locale === 'string') {
        langStr = ctx.locale
      } else if (typeof ctx.locale.lang === 'string') {
        langStr = ctx.locale.lang
      }

      if (langStr) {
        // Normalize to 'zh-CN' or 'en' — anything zh-* → zh-CN, else → en
        const hostLang: Lang = langStr.toLowerCase().startsWith('zh') ? 'zh-CN' : 'en'
        setHostLang(hostLang)
      }
    } catch {
      // If DSH locale is present but shape unknown, just ignore it and fall back
    }
  }

  // Inject styles as a plugin-owned <style> tag (removed on unload).
  ctx.effect(() => {
    const tag = document.createElement('style')
    tag.setAttribute('data-plugin', 'dsh-agent-vitals-audit')
    tag.textContent = STYLES
    document.head.appendChild(tag)
    return () => { tag.remove() }
  }, 'dsh-agent-vitals-audit: styles')

  ctx.slots.inject('conversation.view', () => {
    return ctx.slots.register(
      {
        name: 'conversation.view',
        id: 'audit',
        order: 20,
        // Tab label reads from DSH setting (via setHostLang above), with fallback
        // to localStorage user choice or navigator.language.
        label: () => t(loadLang(), 'tabLabel'),
        inject: () => ({}),
      },
      (props: ConvViewProps) => h(AuditView, props),
    )
  })
}

// `__pure` 是**只给 scripts/verify-*.mjs 用的**纯函数出口：浏览器侧没有任何
// 代码读它。挂出来是为了能直接对聚合数学下断言——通过渲染结果反推比例尺算得
// 对不对，等于一次测两件事，红了也说不清坏的是哪一件。
module.exports = {
  name: 'dsh-agent-vitals-audit',
  inject: ['slots', 'locale'],
  apply,
  __pure: { buildTimeline, modelSwitchEvents, nearestPoint, requestOrdinal, buildExportPayload, redactPath, STYLES },
}
