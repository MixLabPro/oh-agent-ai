// 用一份真实会话报告渲染 AuditView，产出静态预览页 + 关键数字对账。
//
// 为什么需要它：verify-render.mjs 的夹具是手搭的小数据（4 行 requests），
// 证明得了逻辑对不对，证明不了**真实规模下是否还成立**——687 行 requests、
// 2.26 亿 token、¥1,113 这种量级下的格式化、版面、性能，只有真数据能验。
// 第三期的时间线（687 点聚合）尤其需要这条路径。
//
// 用法：
//   skill-vitals behavior <session.jsonl> --json report.json
//   node scripts/preview-real.mjs report.json [out.html]
//
// 报告 JSON 里没有 session_id（core 看不到它，是宿主注入的），这里补一个
// 占位值——findings 的按会话隔离标记逻辑需要它非空。
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const reportPath = process.argv[2]
if (!reportPath) {
  console.error('用法: node scripts/preview-real.mjs <report.json> [out.html]')
  process.exit(2)
}
const outPath = process.argv[3] || resolve(ROOT, 'audit-preview.html')
const report = JSON.parse(readFileSync(resolve(reportPath), 'utf8'))

// 与 verify-render.mjs 同一套 __ModuleLoader__ 取件方式
const code = readFileSync(resolve(ROOT, 'lib/client.cjs'), 'utf8')
let handoff
globalThis.window = globalThis
globalThis.window.__ModuleLoader__ = { load: (h) => { handoff = h } }
new Function(code)()
const exports_ = handoff.factory((spec) => { if (spec === 'react') return React; throw new Error(spec) })
globalThis.document = { createElement: () => ({ setAttribute() {}, set textContent(_) {} }), head: { appendChild() {} } }
Object.defineProperty(globalThis, 'localStorage', {
  value: { getItem: () => null, setItem: () => {} }, configurable: true,
})
const calls = []
exports_.apply({ effect: (fn) => fn(), slots: { inject: (n, fn) => fn(), register: (o, c) => { calls.push({ o, c }); return () => {} } } })
const AuditView = calls[0].c({}).type
const STYLES = (exports_.__pure && exports_.__pure.STYLES) || ''

// ── 真实数据 → 投影形状 ──────────────────────────────────────────────
const SESSION = 'preview'
const findings = report.findings.map(f => ({ ...f, session_id: SESSION }))

const u = report.usage
const totals = Object.values(u.by_model).reduce((a, b) => ({
  uncachedInputTokens: a.uncachedInputTokens + b.uncached_input_tokens,
  outputTokens: a.outputTokens + b.output_tokens,
  cacheReadTokens: a.cacheReadTokens + b.cache_read_tokens,
  cacheWriteTokens: a.cacheWriteTokens + b.cache_write_tokens,
}), { uncachedInputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 })

const missingCtx = report.requests.some(r => r.context_tokens === null)
const projections = {
  behaviorFindings: findings,
  tokenUsage: totals,
  tokenByModel: u,
  costReport: { ...report.cost, status: 'complete', missingFields: [] },
  requestMetrics: {
    requests: report.requests,
    status: missingCtx ? 'partial' : 'complete',
    missingFields: missingCtx ? ['context_tokens'] : [],
  },
  contextComposition: { ...report.context, status: 'complete', missingFields: [] },
  compactionEvents: { ...report.compaction, status: 'complete', missingFields: [] },
  structuralWaste: { findings: report.waste.map(w => ({ ...w, session_id: SESSION })), status: 'complete', missingFields: [] },
}
const useProjection = (k) => projections[k]

const t0 = Date.now()
const body = renderToStaticMarkup(React.createElement(AuditView, { useProjection }))
const ms = Date.now() - t0

// 把组件算出来的关键数字抠出来，跟 CLI 的 --json 对一遍
const grab = (re) => (body.match(re) || [])[1] ?? '(未找到)'
const peakReal = Math.max(...report.requests.filter(r => r.context_tokens !== null).map(r => r.context_tokens))
const measured = report.requests.filter(r => r.context_tokens !== null).length
console.log('渲染耗时           :', ms, 'ms （687 行 requests）')
console.log('结论区总费用       :', grab(/费用估算<\/div><div class="sv-metric-value sv-num" title="([^"]+)"/))
console.log('  CLI cost.total   : ¥' + report.cost.total.toFixed(2))
console.log('上下文峰值         :', grab(/上下文峰值<\/div><div class="sv-metric-value sv-num" title="([^"]+)"/))
console.log('  CLI 实测峰值     :', peakReal.toLocaleString(), '/', report.requests[0].context_window.toLocaleString(),
  '=', (peakReal / report.requests[0].context_window * 100).toFixed(1) + '%')
console.log('峰值参与行数       :', measured, '/', report.requests.length)
console.log('缺口是否披露       :', body.includes(`${measured} / ${report.requests.length}`) ? '是' : '否 ← 有问题')
console.log('判词               :', grab(/sv-verdict-copy">([^<]+)</))
console.log('副标题             :', grab(/sv-verdict-sub">([^<]+)</))
console.log('最严重发现         :', grab(/最严重发现<\/div><div class="sv-metric-value" title="([^"]+)"/))
console.log('成本表行数         :', ((body.match(/<tr/g) || []).length - 1), '（应等于模型数', Object.keys(report.cost.per_model).length, '）')
const insight = grab(/class="sv-insight">([^<]+)</)
console.log('洞察               :', insight)
const evCount = (body.match(/class="sv-event"/g) || []).length
const segs = (body.match(/ d="M/g) || []).length
console.log('时间线事件标记     :', evCount, '个（曲线段：', (body.match(/class="sv-line" d="([^"]*)"/) || ['',''])[1].split('M').length - 1, '段）')
console.log('时间线脚注         :', (body.match(/class="sv-chartfoot">(.*?)<\/div>/s) || [])[1]?.replace(/<[^>]+>/g, ' | ') ?? '(无)')
console.log('常驻前缀结论       :', grab(/data-audit-composition[\s\S]*?class="sv-insight">([^<]+)</))
const xref = grab(/class="sv-xref">([^<]+)</)
console.log('浪费交叉引用       :', xref)

const page = `<title>审计 tab · P1+P2 真实数据预览</title>
<style>
:root{
  --dsw-alias-bg-base:#f6f7fa; --dsw-alias-bg-layer-1:#fff; --dsw-alias-bg-layer-2:#f2f4f7;
  --dsw-alias-label-primary:#182230; --dsw-alias-label-secondary:#667085; --dsw-alias-label-tertiary:#98a2b3;
  --dsw-alias-border-l1:#e4e7ec; --dsw-alias-state-business-primary:#1677ff;
  --dsw-alias-state-success-primary:#039855; --dsw-alias-state-error-primary:#d92d20; --dsw-alias-state-warn-primary:#dc6803;
  --dsw-font-s-14:14px/1.5 -apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif;
  --dsw-font-xs-13:13px/1.5 -apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif;
  --dsw-font-markdown-code-block:ui-monospace,SFMono-Regular,Menlo,monospace;
}
:root:not([data-theme="light"]){}
@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){
  --dsw-alias-bg-base:#0d1117; --dsw-alias-bg-layer-1:#161b22; --dsw-alias-bg-layer-2:#1c2128;
  --dsw-alias-label-primary:#e6edf3; --dsw-alias-label-secondary:#8b949e; --dsw-alias-label-tertiary:#6e7681;
  --dsw-alias-border-l1:#30363d; --dsw-alias-state-business-primary:#58a6ff;
  --dsw-alias-state-success-primary:#3fb950; --dsw-alias-state-error-primary:#f85149; --dsw-alias-state-warn-primary:#d29922;
}}
:root[data-theme="dark"]{
  --dsw-alias-bg-base:#0d1117; --dsw-alias-bg-layer-1:#161b22; --dsw-alias-bg-layer-2:#1c2128;
  --dsw-alias-label-primary:#e6edf3; --dsw-alias-label-secondary:#8b949e; --dsw-alias-label-tertiary:#6e7681;
  --dsw-alias-border-l1:#30363d; --dsw-alias-state-business-primary:#58a6ff;
  --dsw-alias-state-success-primary:#3fb950; --dsw-alias-state-error-primary:#f85149; --dsw-alias-state-warn-primary:#d29922;
}
body{margin:0;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);}
.frame{max-width:900px;margin:0 auto;padding:20px 16px 60px;}
.note{font:var(--dsw-font-xs-13);color:var(--dsw-alias-label-tertiary);padding:10px 24px 0;line-height:1.7;}
.note b{color:var(--dsw-alias-label-secondary);}
${STYLES}
</style>
<div class="frame">
  <div class="note"><b>这是「审计」tab 重构后的真实数据渲染</b>——数据来自 session ${report.session_id || SESSION}（687 次请求 / 106 turns / ¥${report.cost.total.toFixed(2)}），由 AuditView 组件经 React 静态渲染产出，不是设计稿。<br>结论区 · 成本明细 · 会话健康时间线 · 常驻前缀构成 · 证据队列，全部为组件真实输出。</div>
  ${body}
</div>`
writeFileSync(outPath, page)
console.log('\n预览已写入', outPath)
