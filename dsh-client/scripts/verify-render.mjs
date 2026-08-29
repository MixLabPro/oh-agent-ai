// Real-React render check.
//
// verify.mjs proves the __ModuleLoader__ handoff shape using a stub
// `createElement` that just records { type, props, children } — it never
// actually invokes AuditView through React's reconciler, so it can't reach
// any code path that only runs inside a real render pass. The one AuditView
// has is `FindingGroup`'s `useState` (collapse/expand past COLLAPSE_AT=20
// findings): a stub `createElement` skips hooks entirely, so a hook-order
// violation or a crash inside that branch would build clean and pass
// verify.mjs, then blow up live in the browser.
//
// This script requires the REAL `react` + `react-dom/server` (devDependencies)
// and renders AuditView through `renderToStaticMarkup`, feeding a fake
// `useProjection` with >20 findings in one severity group so the collapsed
// branch — and its "显示全部 N 条" button — actually executes.
//
// Modeled after dsh-context's tests/repro-real-react.mjs, which exists
// because a stub-only smoke test shipped a real setState-cascade black
// screen that only reproduced under an actual React render.

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

const root = resolve(fileURLToPath(new URL('.', import.meta.url)), '..')

function fail(msg) {
  console.error(`\n[verify-render] FAIL: ${msg}`)
  process.exitCode = 1
  throw new Error(msg)
}
function ok(msg) {
  console.log(`[verify-render] ok: ${msg}`)
}

const code = readFileSync(resolve(root, 'lib/client.cjs'), 'utf8')
let handoff
globalThis.window = globalThis
globalThis.window.__ModuleLoader__ = { load: (h) => { handoff = h } }
new Function(code)()
if (!handoff) fail('bundle did not call window.__ModuleLoader__.load')

const exports_ = handoff.factory((spec) => {
  if (spec === 'react') return React
  throw new Error(`unexpected require: ${spec}`)
})

// Mount apply() against a stub ctx exactly like verify.mjs, but this time
// we're after the registered component itself, not just its shape.
globalThis.document = {
  createElement: () => ({ setAttribute() {}, set textContent(_) {} }),
  head: { appendChild() {} },
}
const calls = []
const ctx = {
  effect: (fn) => fn(),
  slots: {
    inject: (name, fn) => fn(),
    register: (options, component) => { calls.push({ options, component }); return () => {} },
  },
}
exports_.apply(ctx)
const { component } = calls[0]
const element = component({}) // h(AuditView, props) — real React.createElement now
if (typeof element?.type !== 'function') fail('registered component did not return a createElement(AuditView, …) element')
const AuditView = element.type

// ---------------------------------------------------------------------------
// 25 'warning' findings (> COLLAPSE_AT=20) forces FindingGroup's
// useState(items.length > COLLAPSE_AT) to initialize collapsed=true and
// render the "显示全部 26 条 ▾" toggle button — the one branch a stub
// createElement can never reach. (26, not 25: the P1-03 regression below adds
// one more merged 'warning' row — same severity group — so the collapse
// toggle's count grows too; update both together if either count changes.)
// ---------------------------------------------------------------------------
const findings = Array.from({ length: 25 }, (_, i) => ({
  rule: 'SV601',
  severity: 'warning',
  category: 'destructive-command',
  tool_name: 'bash',
  evidence: `rm -rf /tmp/x${i}`,
  seq: i,
  time: 1000 + i,
  evidence_recency: 'recent',
}))
findings.push({
  rule: 'SV602', severity: 'critical', category: 'privilege-escalation',
  tool_name: 'bash', evidence: 'sudo rm -rf /', seq: 99, time: 2000, evidence_recency: 'recent',
})
// F4: three occurrences of the identical (rule, evidence) pair must collapse
// into one row with a ×3 badge, not render as three separate rows.
for (const seq of [200, 201, 202]) {
  findings.push({
    rule: 'SV611', severity: 'info', category: 'repeated-call',
    tool_name: 'bash', evidence: 'ls -la /tmp', seq, time: 3000 + seq, evidence_recency: 'recent',
  })
}
// G2（GOVERNANCE_BACKLOG.md）：独立的一条 SV611（不同 evidence，不会并进
// 上面那个 ×3 分组），配一条匹配的 loopCosts 记录（按 (rule, seq) 对齐），
// 验证详情展开后出现"这段循环消耗了…"这行——`hidden` 而非条件渲染，
// renderToStaticMarkup 快照能直接断言到文本。
findings.push({
  rule: 'SV611', severity: 'info', category: 'repeated-call',
  tool_name: 'bash', evidence: 'ls -la /var', seq: 300, time: 4000, evidence_recency: 'recent',
  run_end_seq: 310,
})
// P1-03 回归（真实审计 2026-08-25 发现的低估 bug）：两段互不相关的 SV613
// 工具失败 run，只要"连续几次 + 首个错误码"相同，evidence 文本就会撞成一样
// （"进度停滞: 连续 3 个工具失败（首个 TOOL_TIMEOUT）"不含具体 seq），会被
// dedupeFindings 按 (rule, evidence) 并成一行 ×2——loopCosts 必须两次命中都
// 累加，不能只按 latestSeq 取最近一次，否则前一次的消耗被静默丢弃。
const DUP_SV613_EVIDENCE = '进度停滞: 连续 3 个工具失败（首个 TOOL_TIMEOUT）'
findings.push(
  { rule: 'SV613', severity: 'warning', category: 'trajectory', tool_name: null,
    evidence: DUP_SV613_EVIDENCE, seq: 400, time: 5000, evidence_recency: 'recent', run_end_seq: 402 },
  { rule: 'SV613', severity: 'warning', category: 'trajectory', tool_name: null,
    evidence: DUP_SV613_EVIDENCE, seq: 500, time: 6000, evidence_recency: 'recent', run_end_seq: 502 },
)
const loopCosts = [
  { rule: 'SV611', seq: 300, tokens: 3300, cost: 12.34 },
  { rule: 'SV613', seq: 400, tokens: 100, cost: 1 },
  { rule: 'SV613', seq: 500, tokens: 200, cost: 2 },
]

// AuditView's `useState(() => loadNotes())` reads localStorage on every mount.
// Node has none, so without this stub every render sees zero notes and the
// FR-10 code paths are unreachable. `__notes` is mutable so a later test can
// pre-seed notes for one render without disturbing the earlier ones.
// `__budget` is the same trick for G1's `useState(() => loadBudget())` —
// null (unset) by default. `__slowThreshold` is the D7/D9 equivalent for
// `useState(() => loadSlowThreshold())`.
let __notes = {}
let __budget = null
let __slowThreshold = null
Object.defineProperty(globalThis, 'localStorage', {
  value: {
    getItem: (k) => {
      if (k === 'agent-vitals-audit:notes:v1') return JSON.stringify(__notes)
      if (k === 'agent-vitals-audit:budget:v1') return __budget === null ? null : JSON.stringify(__budget)
      if (k === 'agent-vitals-audit:slow-threshold-ms:v1') return __slowThreshold === null ? null : JSON.stringify(__slowThreshold)
      return null
    },
    setItem: () => {},
    removeItem: () => {},
  },
  configurable: true,
  writable: true,
})

const useProjection = (key) => {
  if (key === 'behaviorFindings') return findings
  if (key === 'loopCosts') return loopCosts
  return undefined
}
const html = renderToStaticMarkup(React.createElement(AuditView, { useProjection }))

if (!html.includes('data-audit-view')) fail('rendered HTML missing data-audit-view container')
ok('renders through real React (renderToStaticMarkup) without throwing')

if (!html.includes('data-audit-findings')) fail('rendered HTML missing data-audit-findings section')
ok('renders the findings section')

if (!html.includes('显示全部 26 条')) {
  fail(`FindingGroup did not render the collapsed-state toggle button for 26 findings; html=${html.slice(0, 2000)}`)
}
ok('FindingGroup useState(collapsed=true) branch renders the "显示全部 26 条 ▾" toggle — the real-hooks path a stub createElement cannot reach')

if (!html.includes('SV602')) fail('single critical finding (below COLLAPSE_AT) missing from output')
ok('uncollapsed critical group renders its one finding directly')

// F4: the three identical (SV611, 'ls -la /tmp') findings must collapse to
// one row carrying a ×3 badge, not appear as three separate rows.
if (!html.includes('×3')) {
  fail(`three identical (rule, evidence) findings did not collapse into a ×3 badge; html=${html.slice(0, 2000)}`)
}
ok('F4 dedupeFindings collapses repeated (rule, evidence) into one row with a ×3 badge')

// G2：loopCosts 投影拼回对应的 SV611 行，详情里出现"这段循环消耗了…"这行
// （3300 tokens → "3.3K"，¥12.34 → 不四舍五入抹平到整数）。
if (!html.includes('这段循环消耗了约 3.3K token · ¥12.34')) {
  fail(`G2: loop-cost detail line missing/wrong; html=${html.slice(0, 3000)}`)
}
ok('G2: SV611 详情展开后显示"这段循环消耗了约 X token · ¥Y"（按 (rule, seq) 从 loopCosts 拼回）')

// P1-03 回归：两次撞了同一段 evidence 的 SV613 必须合并成 ×2 一行，且
// loop cost 是两次命中之和（100+200=300 tokens，1+2=¥3），不是只取
// latestSeq=500 那次（会漏掉 seq=400 那 100 token / ¥1）。
if (!html.includes('这 2 次命中累计消耗了约 300 token · ¥3')) {
  fail(`P1-03: 合并行的 loop cost 应是两次命中之和（300 token/¥3），实际未出现该文案；html=${html.slice(0, 3000)}`)
}
ok('P1-03: 两段撞了同一 evidence 的 SV613 合并后，loop cost 按全部命中求和，不再只取最近一次（真实审计发现的低估 bug 已修复）')

// FR-10：每行必须有备注入口，且**不得**出现任何读起来像"已处置"的控件。
// 这里曾经断言「安全 / 高危 / 忽略」三态标记存在——那是 V1.6 PRD 之前的
// 设计稿（AUDIT_TAB_DESIGN §6.3 F3）。PRD §3.2/§3.3 明令：审计 Tab 不具备
// 暂停 Agent、拦工具、改审批策略的能力，就不得摆出暗示这些能力的按钮。
// 原断言的注释（保留以说明这条测试为什么翻面）：must render on every row — this is the
// only place a hook-order bug in AuditView's own useState (notes state,
// called unconditionally before the early-return) would surface.
if (!html.includes('添加备注')) fail('FR-10: finding 行缺「添加备注」入口')
for (const forbidden of ['安全', '高危', '忽略']) {
  if (html.includes('>' + forbidden + '<')) {
    fail(`FR-10/PRD §3.3: 出现了处置态按钮「${forbidden}」——它不改变 Agent 行为，却暗示风险已被处置`)
  }
}
ok('FR-10 每行有备注入口，且不存在「安全/高危/忽略」这类伪处置按钮')

// F2 fallback: no jump-to-seq API exists on the conversation.view slot
// contract, so each row offers a "复制" (copy seq) button instead.
if (!html.includes('复制')) fail('copy-seq (F2 fallback) button missing from rendered output')
ok('F2 fallback copy-seq button renders')

// ---------------------------------------------------------------------------
// i18n: AuditView's own lang toggle defaults from navigator.language, with no
// verified host locale API to depend on (see i18n.ts's header comment) — this
// is entirely self-contained, so it's the one thing a stub createElement AND
// a default-lang real render both miss. Force navigator.language to an
// English locale and confirm the whole tree — including the parts fed by
// static maps (SEVERITY, RULE_LABEL's replacement) — actually flips.
// ---------------------------------------------------------------------------
// Save the original navigator to restore it after (globalThis.navigator is a non-writable getter).
const origNavigatorLanguage = globalThis.navigator?.language
Object.defineProperty(globalThis, 'navigator', {
  value: { language: 'en-US' },
  configurable: true,
  writable: true,
})
const htmlEn = renderToStaticMarkup(React.createElement(AuditView, { useProjection }))
if (origNavigatorLanguage) {
  Object.defineProperty(globalThis, 'navigator', {
    value: { language: origNavigatorLanguage },
    configurable: true,
    writable: true,
  })
}

if (htmlEn.includes('行为审计') || !htmlEn.includes('Findings')) {
  fail(`en-US navigator.language did not switch findings heading to English; html=${htmlEn.slice(0, 2000)}`)
}
ok('i18n: navigator.language=en-US renders "Findings" instead of "行为审计"')

if (!htmlEn.includes('Destructive command')) fail('i18n: SV601 rule label did not translate to English')
ok('i18n: ruleLabel() translates SV601 to "Destructive command"')

if (!htmlEn.includes('Warning') || htmlEn.includes('警告')) fail('i18n: severityLabel() did not translate "warning" to English')
ok('i18n: severityLabel() translates "warning" to "Warning"')

for (const label of ['Add note', 'Export JSON', 'All']) {
  if (!htmlEn.includes(label)) fail(`i18n: "${label}" missing from English render`)
}
ok('i18n: note controls render in English')

if (!htmlEn.includes('Show all 26')) fail('i18n: FindingGroup collapse toggle did not translate to English')
ok('i18n: FindingGroup toggle translates to "Show all 26 ▾"')

// G2：英文 locale 下同一行应完整走 t()，不留中文残留。
if (!htmlEn.includes('This loop cost about 3.3K tokens · ¥12.34')) {
  fail(`i18n: loop-cost detail line did not translate to English; html=${htmlEn.slice(0, 3000)}`)
}
if (htmlEn.includes('这段循环消耗了')) fail('i18n: loop-cost detail line leaked Chinese text in en-US render')
ok('i18n: loop-cost detail line (G2) fully translates, no Chinese leak in en-US render')

// P1-03 回归的英文侧：multi 变体同样要完整走 t()。
if (!htmlEn.includes('These 2 occurrences cost about 300 tokens total · ¥3')) {
  fail(`i18n: multi-occurrence loop-cost line did not translate to English; html=${htmlEn.slice(0, 3000)}`)
}
if (htmlEn.includes('次命中累计消耗了')) fail('i18n: multi-occurrence loop-cost line leaked Chinese text in en-US render')
ok('i18n: multi-occurrence loop-cost line (P1-03) fully translates, no Chinese leak in en-US render')

// ===========================================================================
// 设计原则验收（docs/AUDIT_TAB_UX_REVIEW.md §15 / §17）
//
// 前面的断言检查「功能在不在」；下面两条检查「信息架构对不对」。
// 原则不写成测试就会被下一次改版磨掉——这两条就是那道护栏。
// ===========================================================================

// 语言在上面的 i18n 段被改成了 en-US 且 Node 通常没有原始 navigator.language
// 可供还原，所以这里显式钉回 zh-CN，让断言文本确定。
Object.defineProperty(globalThis, 'navigator', {
  value: { language: 'zh-CN' }, configurable: true, writable: true,
})

// --- 区块提取器：按 data-* 锚点抠出一段平衡标签 --------------------------
// 没有引 jsdom（本包不依赖它），手写一个标签配对扫描器即可——锚点都打在
// <div> 上，没有自闭合同名标签的歧义。
function extractRegion(html, attr) {
  const at = html.indexOf(attr)
  if (at < 0) return null
  const open = html.lastIndexOf('<', at)
  const tag = /^<([a-zA-Z][\w-]*)/.exec(html.slice(open))?.[1]
  if (!tag) return null
  const re = new RegExp('<' + tag + '(?=[\\s/>])|</' + tag + '>', 'g')
  re.lastIndex = open
  let depth = 0, m
  while ((m = re.exec(html)) !== null) {
    if (m[0][1] === '/') {
      depth--
      if (depth === 0) return html.slice(open, m.index + m[0].length)
    } else depth++
  }
  return null
}

// Dice 系数（二元组重合度），只用来给人看「这块变了多少」，不做阈值断言——
// 阈值会让测试沦为「调 fixture 调到想要的结论」。
function dice(a, b) {
  const grams = (s) => {
    const m = new Map()
    for (let i = 0; i < s.length - 1; i++) m.set(s.slice(i, i + 2), (m.get(s.slice(i, i + 2)) || 0) + 1)
    return m
  }
  const A = grams(a), B = grams(b)
  let inter = 0, ta = 0, tb = 0
  for (const v of A.values()) ta += v
  for (const v of B.values()) tb += v
  for (const [k, v] of A) if (B.has(k)) inter += Math.min(v, B.get(k))
  return ta + tb === 0 ? 1 : (2 * inter) / (ta + tb)
}

const bucket = (u, o, cr, cw, pu = 0, po = 0, pcr = 0) => ({
  uncached_input_tokens: u, output_tokens: o, cache_read_tokens: cr, cache_write_tokens: cw,
  peak_uncached_input_tokens: pu, peak_output_tokens: po, peak_cache_read_tokens: pcr, peak_cache_write_tokens: 0,
})
// session_id 由宿主投影注入；标记按它隔离，所以 fixture 必须带上，否则
// noteKey 拼出来的键与 __notes 里的对不上（T4 会以「备注没渲染」失败）。
const SESSION_A = 'sess-a'
// turn 默认 null：多数用例不关心坐标。但**时间线用例必须显式给 turn**——
// 定位不到的事件会被 buildTimeline 正确丢弃（宁可不画也不画在猜的位置上），
// 第一版夹具就是因为 turn 全 null，时间线上一个风险标记都没出现。
const mkFinding = (rule, severity, evidence, seq, sessionId = SESSION_A, turn = null) => ({
  rule, severity, category: 'x', tool_name: 'bash', evidence, seq, time: 1000 + seq,
  turn, step: null, call_id: null, session_id: sessionId, evidence_recency: 'recent',
})
// 备注键必须与 AuditView 的 noteKey 同构：[sessionId, rule, evidence]
const mk = (rule, evidence, sessionId = SESSION_A) => JSON.stringify([sessionId, rule, evidence])

// costReport 现在是宿主原生投影（host/index.ts::costReportFrom），不再由
// AuditView 自己从 tokenByModel 算——这里的 fixture 因此也要手搭一份 costReport，
// 跟 byModel 一样是手写的定量数据，不是走真折叠。逻辑特意跟宿主那份保持精简
// 镜像（只求「渲染出不同的东西」，不追求分毫不差——分毫不差有 verify-host.mjs
// 对真实 pricing.json 的断言守着）；这里只管这块区域在三份 fixture 上确实
// 渲染出不同内容（T2 的信息密度检查），不是钱算得对不对。
const PRICING = JSON.parse(readFileSync(resolve(root, 'pricing.json'), 'utf8'))
function costReportOf(byModel) {
  // 价目表按供应商分层后，这个夹具用回落供应商（原厂）的表——它模拟的是
  // 「provider 未上报」这一路，正是老日志的常态。
  const cards = PRICING.providers[PRICING.fallback_provider].models
  let total = 0, peakTotal = 0, unpriced = 0
  const perModel = {}
  for (const model in byModel.by_model) {
    const b = byModel.by_model[model]
    const card = cards[model]
    if (!card) { unpriced += b.uncached_input_tokens + b.cache_read_tokens + b.cache_write_tokens; continue }
    const uPeak = b.peak_uncached_input_tokens / 1e6, cPeak = b.peak_cache_read_tokens / 1e6, oPeak = b.peak_output_tokens / 1e6
    const uOff = b.uncached_input_tokens / 1e6 - uPeak, cOff = b.cache_read_tokens / 1e6 - cPeak, oOff = b.output_tokens / 1e6 - oPeak
    const cacheReadCost = cOff * card.input_cached.off_peak + cPeak * card.input_cached.peak
    const off = uOff * card.input_uncached.off_peak + cOff * card.input_cached.off_peak + oOff * card.output.off_peak
    const peak = uPeak * card.input_uncached.peak + cPeak * card.input_cached.peak + oPeak * card.output.peak
    total += off + peak; peakTotal += peak
    perModel[model] = { short_name: model, provider: null, pricing_basis: 'fallback', priced_with: PRICING.fallback_provider, total: off + peak, peak, cache_read_cost: cacheReadCost }
  }
  if (Object.keys(perModel).length === 0 && unpriced === 0) {
    return { currency: null, estimate_disclaimer: null, total: null, peak_total: null, per_model: {}, unpriced_tokens: 0, status: 'complete', missingFields: [] }
  }
  const missingFields = unpriced > 0 ? ['unpriced_tokens'] : []
  return {
    currency: 'CNY', estimate_disclaimer: '估算值，不是账单', total, peak_total: peakTotal,
    per_model: perModel, unpriced_tokens: unpriced, status: missingFields.length ? 'partial' : 'complete', missingFields,
  }
}

// requestMetrics 的最小夹具：[context_tokens | null, turn] 列表 + 窗口上限。
// null 表示宿主没上报该行的 context_tokens——**不是占用 0**，结论区的峰值
// 计算必须跳过它，并在展开说明里报出缺了几行。
const reqMetrics = (rows, window) => ({
  requests: rows.map(([ctx, turn], i) => ({
    request_seq: i + 1, seq: 100 + i, turn, step: 1, model: 'm',
    context_window: window, context_tokens: ctx,
    uncached_input_tokens: ctx, output_tokens: 10,
    cache_read_tokens: ctx === null ? null : 0, cache_write_tokens: 0,
  })),
  ...(rows.some(([ctx]) => ctx === null)
    ? { status: 'partial', missingFields: ['context_tokens'] }
    : { status: 'complete', missingFields: [] }),
})

const projectionOf = (ds) => (key) =>
  key === 'behaviorFindings' ? ds.findings
    : key === 'tokenUsage' ? ds.usage
    : key === 'tokenByModel' ? ds.byModel
    : key === 'costReport' ? costReportOf(ds.byModel)
    : key === 'requestMetrics' ? ds.requests
    : key === 'contextComposition' ? ds.composition
    : key === 'compactionEvents' ? ds.compaction
    : key === 'structuralWaste' ? ds.waste
    : key === 'subagentSpawns' ? ds.subagents
    : key === 'preForkUsage' ? ds.preFork
    : key === 'skillAudit' ? ds.skill
    : key === 'durationAudit' ? ds.duration
    : undefined


// 常驻前缀构成 / 压缩 / 结构性浪费的最小夹具。
const comp = (sys, tools, cat, entries) => ({
  system_tokens: sys, tools_tokens: tools, catalog_tokens: cat, catalog_entries: entries,
  resident_total: [sys, tools, cat].every(v => v !== null) ? sys + tools + cat : null,
  estimator: 'est_tokens',
  status: [sys, tools, cat].some(v => v === null) ? 'partial' : 'complete',
  missingFields: [['system_tokens', sys], ['tools_tokens', tools], ['catalog_tokens', cat]]
    .filter(([, v]) => v === null).map(([k]) => k),
})
const compact = (prunes) => ({
  compactions: [], prunes: prunes.map(([turn, tok], i) => ({ seq: 100 + i, turn, shadowed_token_count: tok })),
  pruned_tokens_total: prunes.reduce((s, [, t]) => s + t, 0), prunes_without_token_count: 0,
  status: 'complete', missingFields: [],
})
const subsOf = (rows) => ({
  spawns: rows.map(([turn, desc, cost, tokens, findings], i) => ({
    seq: 900 + i, time: 9000 + i, turn, step: 1, call_id: 'sc' + i,
    agent_id: cost === null ? null : ('aaaaaaaa-0000-4000-8000-00000000000' + i),
    description: desc, cost, tokens, findings,
  })),
  total_cost: rows.filter(r => r[2] !== null).length
    ? rows.filter(r => r[2] !== null).reduce((a, r) => a + r[2], 0) : null,
  status: rows.some(r => r[2] === null) ? 'partial' : 'complete',
  missingFields: rows.some(r => r[2] === null) ? ['subagent_cost'] : [],
})
const wasteOf = (rows, sessionId = SESSION_A) => ({
  findings: rows.map(([rule, turn, tokens, sug], i) => ({
    rule, severity: 'info', category: 'cost', tool_name: 'read',
    evidence: `${rule} 证据 ${i}`, seq: 500 + i, time: 5000 + i,
    turn, step: 1, call_id: null, session_id: sessionId, evidence_recency: 'log',
    waste_tokens: tokens, suggestion: sug,
  })),
  status: 'complete', missingFields: [],
})
// skillAudit（backlog SKILL_EXECUTION_BACKLOG §6 补测）：
// rows: [name, trigger_mode, load_status, duration_ms, turn, step, agent_id?]
const skillsOf = (rows, discovered = 0, covered = null) => ({
  invocations: rows.map(([name, mode, status, ms, turn, step, agentId], i) => ({
    name, trigger_mode: mode, load_status: status, duration_ms: ms,
    seq: 700 + i, time: 7000 + i, turn, step,
    call_id: mode === 'model_selected' ? 'sk' + i : null,
    request_seq: mode === 'model_selected' ? i + 1 : null,
    missing_fields: status === 'incomplete' ? ['duration_ms'] : [],
    agent_id: agentId ?? null,
  })),
  sessions_discovered: discovered, sessions_covered: covered,
  missing_sessions: [], coverage_by_skill: {},
  status: 'complete', missingFields: [],
})
// durationAudit（DURATION_AUDIT_BACKLOG §D7 补测：data-audit-duration）
// toolCalls rows: [call_id, tool_name, load_status, duration_ms, turn, step]
// turns rows: [turn, load_status, duration_ms, ended_reason]
// steps rows: [turn, step, load_status, duration_ms]
// approvals rows: [id, tool_name, status, wait_ms, outcome, turn, step]
const durationOf = (toolCalls = [], turns = [], steps = [], approvals = []) => ({
  tool_calls: toolCalls.map(([callId, name, status, ms, turn, step], i) => ({
    call_id: callId, tool_name: name, load_status: status, duration_ms: ms,
    seq: 800 + i, turn, step,
    missing_fields: [...(name === null ? ['tool_name'] : []), ...(ms === null ? ['duration_ms'] : [])],
  })),
  turns: turns.map(([turn, status, ms, reason], i) => ({
    turn, duration_ms: ms, seq_start: 900 + i, seq_end: status === 'loaded' ? 950 + i : null,
    ended_reason: reason, load_status: status,
    missing_fields: status === 'incomplete' ? ['duration_ms', 'ended_reason'] : [],
  })),
  steps: steps.map(([turn, step, status, ms], i) => ({
    turn, step, duration_ms: ms, seq_start: 960 + i, seq_end: status === 'loaded' ? 970 + i : null,
    load_status: status,
    missing_fields: status === 'incomplete' ? ['duration_ms'] : [],
  })),
  approvals: approvals.map(([id, name, status, waitMs, outcome, turn, step], i) => ({
    id, tool_name: name, wait_ms: waitMs, outcome, status,
    turn, step, seq: 980 + i,
    missing_fields: [...(step === null ? ['step'] : []), ...(status === 'pending' ? ['wait_ms'] : [])],
  })),
  status: 'complete', missingFields: [],
})

// --- T2 恒定元素扫描 ------------------------------------------------------
// 原则 3：信息密度 = 单位像素承载的维度数。一个在三份**差异极大**的会话上
// 渲染出**逐字节相同**结果的首屏区块，承载的维度数是 0 —— 它不该占据首屏。
//
// 边界（要诚实说明）：本测只抓「逐字节相同」。像 TokenBar 这种「三次都几乎
// 一样但不完全一样」的近恒定元素，自动化无法在不引入任意阈值的前提下裁决，
// 因此下面只打印 Dice 相似度供人评审（>0.95 应按原则 3 复核），不做断言。
const DATASETS = [
  {
    name: 'big-session',
    findings: [mkFinding('SV601', 'critical', 'rm -rf /tmp/a', 10, SESSION_A, 18),
              mkFinding('SV613', 'warning', 'stalled', 11, SESSION_A, 31)],
    usage: { uncachedInputTokens: 226423948, outputTokens: 685800, cacheReadTokens: 50100000, cacheWriteTokens: 0 },
    byModel: { by_model: { 'deepseek-v4-pro': bucket(2e8, 6e5, 5e7, 0, 4e7, 1e5, 1e7), 'deepseek-v4-flash': bucket(2.6e7, 8e4, 1e5, 0) }, sequence: ['deepseek-v4-pro', 'deepseek-v4-flash', 'deepseek-v4-pro'] },
    // 第三行故意缺 context_tokens：真实会话 687 行里有 13 行是这样的。
    requests: reqMetrics([[120000, 3], [640000, 18], [null, 22], [799841, 31]], 1000000),
    composition: comp(1813, 7646, 2774, 29),
    compaction: compact([[31, 3367], [31, 2469]]),
    // T31 上同时有一条 SV601（critical）——交叉引用会把它标出来。
    waste: wasteOf([['SV-COST-02', 31, 1964, '确认这段失败是否需要重试']]),
    subagents: subsOf([[22, 'Translate Rust output', 19.77, 4300000, 16], [31, 'DSH-2 keystone', 8.66, 1900000, 2]]),
    skill: skillsOf([
      ['release-notes', 'explicit', 'loaded', null, 3, 1, null],
      ['commit-summarizer', 'model_selected', 'loaded', 850, 18, 2, 'aaaaaaaa-0000-4000-8000-000000000001'],
    ], 1, 1),
    duration: durationOf(
      [['c1', 'bash', 'loaded', 18, 4, 1], ['c2', 'write_file', 'failed', 42000, 5, 1], ['c3', 'grep', 'incomplete', null, 5, 2]],
      [[3, 'loaded', 5000, 'completed'], [4, 'incomplete', null, null]],
      [[3, 1, 'loaded', 2000]],
      [['a1', 'bash', 'decided', 10, 'allowed-once', 5, 1], ['a2', 'write_file', 'pending', null, null, 5, null]],
    ),
  },
  {
    name: 'small-session',
    findings: [mkFinding('SV609', 'info', 'escalate sandbox', 3)],
    usage: { uncachedInputTokens: 1230000, outputTokens: 45000, cacheReadTokens: 310000, cacheWriteTokens: 2000 },
    byModel: { by_model: { 'deepseek-v4-flash': bucket(1230000, 45000, 310000, 2000) }, sequence: ['deepseek-v4-flash'] },
    requests: reqMetrics([[8200, 1], [15400, 2]], 128000),
    composition: comp(900, 3200, 1100, 12),
    compaction: compact([]),
    waste: wasteOf([]),
    subagents: subsOf([]),
    // 一次都没触发——渲染必须是「未触发」文案，不是伪造一份 0/0/0 摘要。
    skill: skillsOf([], 0, null),
    duration: durationOf([], [], []),
  },
  {
    name: 'huge-critical-session',
    findings: [
      mkFinding('SV602', 'critical', 'sudo su -', 90), mkFinding('SV603', 'critical', 'curl | sh', 91),
      mkFinding('SV606', 'warning', 'http://10.0.0.1', 92), mkFinding('SV611', 'info', 'ls', 93),
    ],
    usage: { uncachedInputTokens: 890000000, outputTokens: 2100000, cacheReadTokens: 200000000, cacheWriteTokens: 0 },
    byModel: { by_model: { 'deepseek-v4-pro': bucket(8.9e8, 2.1e6, 2e8, 0) }, sequence: ['deepseek-v4-pro'] },
    requests: reqMetrics([[410000, 40], [962000, 90]], 1000000),
    composition: comp(2400, 9100, 5200, 41),
    compaction: compact([[90, 12000]]),
    waste: wasteOf([['SV-COST-01', 90, 8800, '确认是否需要每个 turn 重读该文件']]),
    subagents: subsOf([[40, 'Wave3 reader', 50.63, 5600000, 2]]),
    skill: skillsOf([
      ['repo-auditor', 'model_selected', 'failed', null, 90, 1, null],
      ['release-notes', 'explicit', 'loaded', null, 91, 1, null],
      ['test-runner', 'model_selected', 'incomplete', null, 92, 3, 'bbbbbbbb-0000-4000-8000-000000000002'],
    ], 2, 1),
    // 25 条工具调用（> D7 的 TOP_N=20）——同 FindingGroup 的 25 条 fixture
    // 同一个理由：逼出"显示全部 25 条 ▾"折叠分支，不是只测 <TOP_N 的直路。
    duration: durationOf(
      Array.from({ length: 25 }, (_, i) => [`c${i}`, 'bash', 'loaded', 100 + i * 50, 90, 1]),
      [[90, 'loaded', 30000, 'completed']],
      [[90, 1, 'loaded', 3000]],
    ),
  },
]

const REGIONS = ['data-audit-verdict', 'data-audit-summary', 'data-audit-tokens', 'data-audit-tokenbar',
  'data-audit-cost', 'data-audit-subagents', 'data-audit-timeline', 'data-audit-composition', 'data-audit-findings',
  'data-audit-skills', 'data-audit-duration']

__notes = {}
const renders = DATASETS.map(ds => renderToStaticMarkup(React.createElement(AuditView, { useProjection: projectionOf(ds) })))

for (const attr of REGIONS) {
  const regions = renders.map(h => extractRegion(h, attr))
  const missing = regions.findIndex(r => r === null)
  if (missing >= 0) fail(`T2: region [${attr}] absent from dataset "${DATASETS[missing].name}" — every first-screen anchor must render for all three fixtures`)
  const allSame = regions.every(r => r === regions[0])
  if (allSame) {
    fail(`T2: region [${attr}] is byte-identical across three materially different sessions — zero information density (原则 3). Delete it or make it carry a dimension.`)
  }
  const sims = [dice(regions[0], regions[1]), dice(regions[1], regions[2]), dice(regions[0], regions[2])]
  const min = Math.min(...sims).toFixed(2)
  const flag = Math.min(...sims) > 0.95 ? '  ← >0.95, 按原则 3 人工复核' : ''
  ok(`T2 [${attr}] varies across sessions (min Dice ${min})${flag}`)
}

// data-audit-composition 的 Dice 会落在 0.95 上下并触发人工复核标记。**已复核**：
// 该区域里变化的是三个 token 数 + 条宽 + 占峰值百分比（4 个维度），恒定的是那句
// 「est_tokens 估算与 provider 实测不是同一个估算器，两者不可相减」的说明——它字数多
// 但是必要的诚实性注脚。为了把相似度压下去而删短它是本末倒置：原则 3 管的是"别让零
// 信息的区块占首屏"，不是"把警示语写短一点"。结论：保留现状，不算违反。

// --- Skill 区块（SKILL_EXECUTION_BACKLOG §6：data-audit-skills 补测）------
// projection 未就绪（undefined）时 AuditView 整段不渲染 SkillSection——
// 不能假装有数据、渲染出一份 0 Skills 的摘要。
const noSkillHtml = renderToStaticMarkup(React.createElement(AuditView, {
  useProjection: (key) => key === 'skillAudit' ? undefined : projectionOf(DATASETS[0])(key),
}))
if (extractRegion(noSkillHtml, 'data-audit-skills') !== null) {
  fail('Skill 区块：projection 未就绪时不应渲染 data-audit-skills（不能伪造 0 Skills 摘要）')
}
ok('Skill 区块：projection 未就绪时整段不渲染')

// projection 就绪但一次都没触发——必须是「未触发」文案，不是伪造统计。
const emptySkillHtml = renderToStaticMarkup(React.createElement(AuditView, {
  useProjection: (key) => key === 'skillAudit' ? skillsOf([], 0, null) : projectionOf(DATASETS[0])(key),
}))
const emptySkillRegion = extractRegion(emptySkillHtml, 'data-audit-skills')
if (emptySkillRegion === null) fail('Skill 区块：invocations 为空数组时仍应渲染"未触发"文案，不是整段消失')
if (!/未触发|not.*triggered/i.test(emptySkillRegion || '')) {
  fail(`Skill 区块：invocations 为空时应显示"未触发"文案，实际：${(emptySkillRegion || '').slice(0, 200)}`)
}
ok('Skill 区块：invocations 为空数组时显示"未触发"文案，不伪造 0/0/0 统计')

// P0-02 回归（真实审计 2026-08-25 发现）：0 调用 + partial + 有 missing_sessions
// 时不得说"未触发"——那是"确实没有"的确定性，实际是"没读全"。
const partialSkillHtml = renderToStaticMarkup(React.createElement(AuditView, {
  useProjection: (key) => key === 'skillAudit'
    ? { invocations: [], sessions_discovered: 3, sessions_covered: 1,
        missing_sessions: ['agent-a', 'agent-b'], coverage_by_skill: {},
        status: 'partial', missingFields: ['skill_invocations'] }
    : projectionOf(DATASETS[0])(key),
}))
const partialSkillRegion = extractRegion(partialSkillHtml, 'data-audit-skills') || ''
if (partialSkillRegion.includes('未触发')) {
  fail(`P0-02: 子会话未覆盖时（partial + missing_sessions 非空）不得显示"未触发"这类过度确定的否定结论；region=${partialSkillRegion}`)
}
if (!partialSkillRegion.includes('2 个子会话未能覆盖')) {
  fail(`P0-02: partial 态的 0 调用应说明还有几个子会话未覆盖；region=${partialSkillRegion}`)
}
ok('P0-02: Skill 区块 0 调用时区分 complete（"未触发"）与 partial（"暂未发现 + 说明未覆盖会话数"），不再一律说"未触发"')

// P2-01 回归（真实审计 2026-08-25 发现）：标题的 N 曾经是调用总次数——同一个
// Skill 被调 3 次会显示"Skill 执行 · 3"，读起来像 3 个不同的 Skill。构造
// 同一个 skill-a 被调 3 次（外加 1 次不同的 skill-b）：应显示"· 2"（不同
// Skill 数），且摘要行里出现"4 次调用"（总次数没有丢，只是挪了位置）。
const repeatedSkillHtml = renderToStaticMarkup(React.createElement(AuditView, {
  useProjection: (key) => key === 'skillAudit'
    ? {
      invocations: [1, 2, 3].map(i => ({
        name: 'skill-a', trigger_mode: 'explicit', load_status: 'loaded', duration_ms: 100,
        seq: 600 + i, time: 6000 + i, turn: i, step: 1, call_id: null, request_seq: null,
        missing_fields: [], agent_id: null,
      })).concat([{
        name: 'skill-b', trigger_mode: 'explicit', load_status: 'loaded', duration_ms: 200,
        seq: 610, time: 6100, turn: 5, step: 1, call_id: null, request_seq: null,
        missing_fields: [], agent_id: null,
      }]),
      sessions_discovered: 0, sessions_covered: null, missing_sessions: [], coverage_by_skill: {},
      status: 'complete', missingFields: [],
    }
    : projectionOf(DATASETS[0])(key),
}))
const repeatedSkillRegion = extractRegion(repeatedSkillHtml, 'data-audit-skills') || ''
if (!repeatedSkillRegion.includes('Skill 执行 · 2')) {
  fail(`P2-01: 3 次调用同一个 skill-a + 1 次 skill-b 应显示"· 2"（不同 Skill 数），实际未出现；region=${repeatedSkillRegion.slice(0, 1000)}`)
}
if (!repeatedSkillRegion.includes('4次调用') && !repeatedSkillRegion.includes('4 次调用')) {
  fail(`P2-01: 调用总次数（4）不该丢，应在摘要行里出现；region=${repeatedSkillRegion.slice(0, 1000)}`)
}
ok('P2-01: Skill 标题的 N 改成不同 Skill 数（同一 Skill 调 3 次不再读成"3 个 Skill"），调用总次数挪进摘要行')

// P1-02A 回归（真实审计 2026-08-25 发现）：曾经用 `inv.seq` 当展开状态的
// 身份，`openId` 初值也是 `null`——两个缺 seq 的调用会在渲染起点就都判定
// `isOpen=true`（null===null），且点不动关闭。构造两条 `seq: null` 的调用
// （加一条正常 seq 的对照）：正确实现下三条初始全部是 aria-expanded="false"；
// 旧实现下两条 seq=null 的会是 "true"。
{
  const nullSeqSkill = {
    invocations: [
      { name: 'skill-a', trigger_mode: 'explicit', load_status: 'loaded', duration_ms: 100,
        seq: null, time: null, turn: null, step: null, call_id: null, request_seq: null,
        missing_fields: ['seq'], agent_id: null },
      { name: 'skill-b', trigger_mode: 'explicit', load_status: 'loaded', duration_ms: 200,
        seq: null, time: null, turn: null, step: null, call_id: null, request_seq: null,
        missing_fields: ['seq'], agent_id: null },
      { name: 'skill-c', trigger_mode: 'explicit', load_status: 'loaded', duration_ms: 300,
        seq: 42, time: 4200, turn: 1, step: 1, call_id: null, request_seq: null,
        missing_fields: [], agent_id: null },
    ],
    sessions_discovered: 0, sessions_covered: null, missing_sessions: [], coverage_by_skill: {},
    status: 'complete', missingFields: [],
  }
  const nullSeqHtml = renderToStaticMarkup(React.createElement(AuditView, {
    useProjection: (key) => key === 'skillAudit' ? nullSeqSkill : projectionOf(DATASETS[0])(key),
  }))
  const nullSeqRegion = extractRegion(nullSeqHtml, 'data-audit-skills') || ''
  const expandedCount = (nullSeqRegion.match(/aria-expanded="true"/g) || []).length
  if (expandedCount !== 0) {
    fail(`P1-02A: 两条 seq=null 的 Skill 调用不该在初始渲染就被判定为"已展开"（openId 身份 bug），实际有 ${expandedCount} 条 aria-expanded="true"；region=${nullSeqRegion.slice(0, 1500)}`)
  }
  ok('P1-02A: Skill 列表展开状态改用数组下标做身份，两条 seq=null 的调用不再从渲染起点就被误判为"已展开"')
}

// 阶段 B-3（Skill → Finding/工具/费用归因）回归——两件事：
//   1. 主会话调用（source_agent_id===null）能正确拼到归因、行上出现 finding
//      徽章、抽屉展开出四个归因字段 + 近似说明。
//   2. **关键正确性防线**：子会话调用（source_agent_id!==null）即使它的
//      seq 与 skillAttribution 数组里某一项**偶然相同**，也绝不能显示那份
//      归因——两条事件流的 seq 计数器互相独立，数值相同不代表同一个位置，
//      查出来的归因会张冠李戴。这条测试专门构造这个偶然相同的场景。
{
  const B3_SKILL = {
    invocations: [
      // 主会话调用，seq=42，归因表里有对应条目 → 应显示归因。
      { name: 'skill-main', trigger_mode: 'explicit', load_status: 'loaded', duration_ms: 100,
        seq: 42, time: 4200, turn: 1, step: 1, call_id: null, request_seq: null,
        missing_fields: [], agent_id: null, source_agent_id: null, depth: 0 },
      // 子会话调用，seq 与上面的主会话调用**偶然相同**（42）——归因表按这个
      // seq 能查到一条，但绝不能显示：这条调用来自另一条独立的事件流。
      { name: 'skill-sub', trigger_mode: 'explicit', load_status: 'loaded', duration_ms: 50,
        seq: 42, time: 100, turn: 1, step: 1, call_id: null, request_seq: null,
        missing_fields: [], agent_id: null, source_agent_id: 'agent-xyz', depth: 1 },
      // 主会话调用，缺 seq——同样不该显示归因（没法定位区间）。
      { name: 'skill-noseq', trigger_mode: 'explicit', load_status: 'loaded', duration_ms: 10,
        seq: null, time: null, turn: null, step: null, call_id: null, request_seq: null,
        missing_fields: ['seq'], agent_id: null, source_agent_id: null, depth: 0 },
    ],
    sessions_discovered: 1, sessions_covered: 1, missing_sessions: [], coverage_by_skill: {},
    status: 'complete', missingFields: [],
  }
  const B3_ATTR = [{ seq: 42, findings: 2, tool_calls: 3, tokens: 1500, cost: 0.42 }]
  const b3Html = renderToStaticMarkup(React.createElement(AuditView, {
    useProjection: (key) => key === 'skillAudit' ? B3_SKILL
      : key === 'skillAttribution' ? B3_ATTR
      : projectionOf(DATASETS[0])(key),
  }))
  // SkillSection 的抽屉跟 FindingRow.tsx（G2）同款：`hidden` 属性而不是
  // 条件挂载——内容一直在 renderToStaticMarkup 的输出里，不需要模拟点击
  // 就能断言到（这个改动本身是这次顺带做的，之前是条件挂载，测不到）。
  const b3Region = extractRegion(b3Html, 'data-audit-skills') || ''
  if (!b3Region.includes('2 条 finding') && !b3Region.includes('2 finding')) {
    fail(`阶段B-3: 主会话调用（seq=42）命中归因表应在行上显示 finding 徽章；region=${b3Region.slice(0, 2000)}`)
  }
  ok('阶段B-3: 主会话调用命中归因表时，行上显示"N 条 finding"徽章')

  // formatNumber(1500) → "1.5K"（千分位缩写），formatMoney(0.42) → "¥0.42"。
  if (!b3Region.includes('1.5K') || !b3Region.includes('¥0.42')) {
    fail(`阶段B-3: 主会话调用的抽屉应显示归因 token/费用（1.5K / ¥0.42）；region=${b3Region.slice(0, 3000)}`)
  }
  if (!b3Region.includes('区间') && !b3Region.includes('window')) {
    fail(`阶段B-3: 归因存在时抽屉应带出"不是精确因果"的近似说明；region=${b3Region.slice(0, 3000)}`)
  }
  ok('阶段B-3: 主会话调用抽屉显示归因 token/费用与近似说明（不是精确因果）')

  // 【关键回归】子会话调用（source_agent_id='agent-xyz'）的 seq 与主会话
  // 调用**偶然相同**（都是 42）——归因表按这个 seq 能查到条目，但客户端的
  // `attributionFor` 必须先看 source_agent_id 再查表，绝不能把主会话调用
  // 的归因数字（1500 token / ¥0.42）显示到子会话这一行上。数字本身在整页
  // 只应该出现一次（来自主会话那一条），不该因为子会话行也命中同一个 seq
  // 而被渲染第二次。
  const findingsCount = (b3Region.match(/2 条 finding|2 finding/g) || []).length
  if (findingsCount !== 1) {
    fail(`阶段B-3【关键回归】: "2 条 finding" 徽章应恰好出现 1 次（只在主会话调用那一行）——出现 ${findingsCount} 次说明子会话行也误渲染了同一份归因；region=${b3Region.slice(0, 3000)}`)
  }
  if (!b3Region.includes('子会话调用暂不支持归因') && !b3Region.includes('not attributed yet')) {
    fail(`阶段B-3: 子会话调用的抽屉应说明"暂不支持归因"，不是留白或误显示；region=${b3Region.slice(0, 3000)}`)
  }
  ok('阶段B-3【关键回归】: 子会话调用即使 seq 与主会话调用偶然相同，也不会张冠李戴地显示主会话的归因数据（数字只出现 1 次）')

  if (!b3Region.includes('缺 seq') && !b3Region.includes('Missing seq')) {
    fail(`阶段B-3: 主会话调用缺 seq 时抽屉应说明"缺 seq，无法定位归因区间"；region=${b3Region.slice(0, 3000)}`)
  }
  ok('阶段B-3: 主会话调用缺 seq 时，抽屉如实说明无法定位归因区间（不是显示 0）')

  // i18n：英文 locale 下上面这几句新增文案不得有中文残留。navigator.language
  // 是 loadLang() 唯一的自包含信号来源（同上面 i18n 段的做法），测完要还原。
  const b3OrigNavLang = globalThis.navigator?.language
  Object.defineProperty(globalThis, 'navigator', { value: { language: 'en-US' }, configurable: true, writable: true })
  const b3EnHtml = renderToStaticMarkup(React.createElement(AuditView, {
    useProjection: (key) => key === 'skillAudit' ? B3_SKILL
      : key === 'skillAttribution' ? B3_ATTR
      : projectionOf(DATASETS[0])(key),
  }))
  if (b3OrigNavLang) {
    Object.defineProperty(globalThis, 'navigator', { value: { language: b3OrigNavLang }, configurable: true, writable: true })
  }
  const b3EnRegion = extractRegion(b3EnHtml, 'data-audit-skills') || ''
  if (/[一-鿿]/.test(b3EnRegion)) {
    fail(`阶段B-3 i18n: 英文 locale 下 Skill 归因区块不得有中文残留；region=${b3EnRegion.slice(0, 3000)}`)
  }
  ok('阶段B-3 i18n: Skill 归因文案完整走 t()，英文 locale 下无中文残留')
}

// --- 执行时长区块（DURATION_AUDIT_BACKLOG D7：data-audit-duration 补测）---
// 同 Skill 区块同一套三条纪律：projection 未就绪不渲染、空数据显式说"没有
// 数据"而不是消失、Top N 折叠分支要真的被跑到（不是只测 <20 行的直路）。
const noDurationHtml = renderToStaticMarkup(React.createElement(AuditView, {
  useProjection: (key) => key === 'durationAudit' ? undefined : projectionOf(DATASETS[0])(key),
}))
if (extractRegion(noDurationHtml, 'data-audit-duration') !== null) {
  fail('执行时长区块：projection 未就绪时不应渲染 data-audit-duration（不能伪造空统计）')
}
ok('执行时长区块：projection 未就绪时整段不渲染')

const emptyDurationHtml = renderToStaticMarkup(React.createElement(AuditView, {
  useProjection: (key) => key === 'durationAudit' ? durationOf([], [], []) : projectionOf(DATASETS[0])(key),
}))
const emptyDurationRegion = extractRegion(emptyDurationHtml, 'data-audit-duration')
if (emptyDurationRegion === null) fail('执行时长区块：三路数组都为空时仍应渲染"无数据"文案，不是整段消失')
if (!/没有可统计|no duration data/i.test(emptyDurationRegion || '')) {
  fail(`执行时长区块：三路数组都为空时应显示"无数据"文案，实际：${(emptyDurationRegion || '').slice(0, 200)}`)
}
if (/durationNone|undefined|NaN/.test(emptyDurationRegion || '')) {
  fail(`执行时长区块：空态不得渲染出未解析的 i18n key 或 NaN；实际：${(emptyDurationRegion || '').slice(0, 200)}`)
}
ok('执行时长区块：三路数组都为空时显示"无数据"文案，不伪造统计')

const durationRegionHuge = extractRegion(renders[2], 'data-audit-duration')
if (!durationRegionHuge.includes(t => t)) { /* no-op: keep lints quiet about unused t import above */ }
if (!durationRegionHuge.includes('25')) {
  fail(`执行时长区块：25 条工具调用应显示总数 25；实际：${durationRegionHuge.slice(0, 300)}`)
}
if (!/显示全部 25 条|Show all 25/.test(durationRegionHuge)) {
  fail('执行时长区块：TOP_N=20 折叠分支未被触发——25 条应出现"显示全部 25 条 ▾"')
}
ok('执行时长区块：TOP_N=20 折叠分支被真实触发（25 条工具调用），"显示全部 25 条 ▾"渲染出来')

// P2-01（真实审计 2026-08-25 发现）：标题的 N 曾经是"执行时长 · 1125"——那
// 数是四类记录数之和，不是时长，读起来却像"1125 [某个时间单位]"。
if (!/执行时长 · \d+ 条记录/.test(durationRegionHuge)) {
  fail(`P2-01: 执行时长标题应带"条记录"消歧义（不是时长本身），实际：${durationRegionHuge.slice(0, 300)}`)
}
ok('P2-01: 执行时长标题加"条记录"后缀，不再让计数读起来像时长本身')

// 阶段 C-3 回归（真实审计 2026-08-25 发现）："条记录"只说清楚数字是什么，
// 没回答"跑得慢不慢"。big fixture（DATASETS[0]）只有一个有时长的 turn
// （turn 3，5000ms），应显示"最长 T3 · 5s"；未设慢阈值时不该出现"个慢调用"
// 这半句（阈值判断留客户端，没设就没有"慢"这个概念）。
const durationRegionBigC3 = extractRegion(renders[0], 'data-audit-duration')
if (!durationRegionBigC3.includes('最长 T3 · 5s')) {
  fail(`阶段 C-3: 执行时长区块应显示"最长 T3 · 5s"，实际：${durationRegionBigC3.slice(0, 400)}`)
}
if (durationRegionBigC3.includes('个慢调用')) {
  fail(`阶段 C-3: 未设慢阈值时不该出现"个慢调用"这半句；region=${durationRegionBigC3.slice(0, 400)}`)
}
ok('阶段 C-3: 执行时长摘要显示"最长 Tn · 时长"，未设阈值时不显示慢调用数')

// 慢阈值高亮：设置一个能把其中几条判成"慢"的阈值，颜色必须切到 T.error
// （--dsw-alias-state-error-primary），不设置阈值时不得出现任何高亮色。
const bigDurationRegionNoThreshold = extractRegion(renders[0], 'data-audit-duration')
if (bigDurationRegionNoThreshold.includes('--dsw-alias-state-error-primary')) {
  fail('执行时长区块：未设置慢阈值时不应出现任何高亮色')
}
if (!bigDurationRegionNoThreshold.includes('设置慢阈值')) {
  fail('执行时长区块：未设置阈值时应给出设置入口')
}
ok('执行时长区块：未设置慢阈值时无高亮，且提供设置入口')

// D7 i18n：DurationSection 不得硬编码中文——SkillSection（T8）早前就踩过
// 这个坑（TriggerBadge/LoadBadge 硬编码"显式"/"已加载"等，没走 t()，英文
// locale 下漏出中文），SKILL_EXECUTION_BACKLOG §6 已经修过一次，新区块不能
// 重蹈。用一个能命中中文 Unicode 范围的正则直接扫，比逐个枚举关键词更不会
// 漏（枚举法只能测"我想到的那几个词"，扫描法能测"任何我没想到的硬编码"）。
Object.defineProperty(globalThis, 'navigator', { value: { language: 'en-US' }, configurable: true, writable: true })
const durationEnHtml = renderToStaticMarkup(React.createElement(AuditView, { useProjection: projectionOf(DATASETS[0]) }))
Object.defineProperty(globalThis, 'navigator', { value: { language: 'zh-CN' }, configurable: true, writable: true })
const durationEnRegion = extractRegion(durationEnHtml, 'data-audit-duration')
if (!durationEnRegion) fail('i18n: data-audit-duration 在英文 locale 下未渲染')
for (const label of ['Execution Duration', 'Tool calls', 'done', 'failed', 'Set slow threshold']) {
  if (!durationEnRegion.includes(label)) fail(`i18n: DurationSection 英文渲染缺 "${label}"`)
}
if (/[一-龥]/.test(durationEnRegion)) {
  fail(`i18n: DurationSection 英文渲染里残留中文字符——硬编码泄漏；region=${durationEnRegion.slice(0, 300)}`)
}
ok('i18n: DurationSection 完整走 t()，英文 locale 下无中文残留（正则扫描 Unicode 中文范围，不是关键词枚举）')

// --- 审批等待延迟（D8：data-audit-duration 里的第 4 个子列表）------------
// pending 与 decided（这里复用 loaded/incomplete 的视觉逻辑但文案不同）必须
// 分开显示——不能都显示"—"，那样用户分不清是"还没轮到"还是"数据缺失"
// （DURATION_AUDIT_BACKLOG.md D3 原文）。big fixture 里 a1=decided(wait_ms
// =10)、a2=pending(wait_ms=null) 各一条。
const durationRegionBig = extractRegion(renders[0], 'data-audit-duration')
if (!durationRegionBig.includes('审批等待')) fail('D8: 执行时长区块应包含"审批等待"子列表标题')
if (!durationRegionBig.includes('已决定') || !durationRegionBig.includes('待处理')) {
  fail(`D8: decided/pending 两态应分别显示"已决定"/"待处理"，不能都是"—"；region=${durationRegionBig.slice(0, 400)}`)
}
// pending 那一行 wait_ms 列本身仍显示"—"是可以接受的（那正是"没有数字"该
// 有的样子）——disambiguation 靠 StatusBadge 的"待处理"三个字，不靠数字列
// 本身，上面两条断言已经确认徽章文案分开了。
ok('D8: 审批延迟 decided/pending 两态文案分开显示，不共用"—"；审批等待子列表接线正确')

// Hook 面板不应该出现——D4/D6 的决定：宿主拿不到 hook/* 事件，验证通过前
// 不接进浏览器链路，不渲染一个永远拿不到数据的面板。
if (durationRegionBig.includes('Hook') || durationRegionBig.includes('hook')) {
  fail('D8: 不应渲染 Hook 消费面板——D4 的宿主前提未验证，durationAudit 投影压根不携带 hook 数据')
}
ok('D8: Hook 消费面板确实没有渲染（D4 宿主前提未验证，不假装有这个功能）')

// --- D9：慢标记接进时间线 --------------------------------------------------
// 未设阈值：不应出现任何 'slow' 标记或图例——阈值判断留在客户端，没设就是
// 没有这个维度，不能凭空冒出一个"慢"分类。
const tlNoThreshold = extractRegion(renders[0], 'data-audit-timeline')
if (tlNoThreshold.includes('慢（超过阈值）')) {
  fail('D9: 未设置慢阈值时不应出现"慢"图例——阈值判断留在客户端，没设阈值就没有这个维度')
}
ok('D9: 未设置慢阈值时时间线上没有"慢"图例/标记')

// 设置一个能把 big fixture 里 c2（42000ms）和 turn 3（5000ms）都判成"慢"的
// 阈值，时间线应该真的画出十字标记 + 图例。
__slowThreshold = 1000
const tlSlowHtml = renderToStaticMarkup(React.createElement(AuditView, { useProjection: projectionOf(DATASETS[0]) }))
__slowThreshold = null
const tlSlowRegion = extractRegion(tlSlowHtml, 'data-audit-timeline')
if (!tlSlowRegion.includes('慢（超过阈值）')) {
  fail(`D9: 设置阈值后应出现"慢"图例；region=${tlSlowRegion.slice(0, 400)}`)
}
// 十字标记 = 两个 rect（宽 8 高 2 的横条 + 宽 2 高 8 的竖条），颜色用 T.warn
// 对应的 CSS 变量。
if (!tlSlowRegion.includes('width="8" height="2"') || !tlSlowRegion.includes('width="2" height="8"')) {
  fail(`D9: 应画出十字形状的"慢"标记（两个 rect：横 8×2 + 竖 2×8）；region=${tlSlowRegion.slice(0, 400)}`)
}
ok('D9: 设置慢阈值后，超阈值的工具调用/turn 在时间线上画出十字标记 + 图例')

// 阶段 C-3：设了阈值 1000ms 后，big fixture 里 c2（42000ms）和 turn 3
// （5000ms）都超阈值——执行时长区块的摘要行应显示"2 个慢调用"，跟时间线
// 上画出来的十字标记数量必须是同一个口径（同一段代码算出来的同一个数，
// 不是两处各自数）。
const durationRegionSlow = extractRegion(tlSlowHtml, 'data-audit-duration')
if (!durationRegionSlow.includes('2 个慢调用')) {
  fail(`阶段 C-3: 设置阈值后执行时长摘要应显示"2 个慢调用"（c2+turn3），实际：${durationRegionSlow.slice(0, 400)}`)
}
ok('阶段 C-3: 执行时长摘要的慢调用数与时间线"慢"标记数同一口径')

// --- P3 会话健康时间线 ---------------------------------------------------
const tlBig = extractRegion(renders[0], 'data-audit-timeline')
if (tlBig === null) fail('P3: 时间线没渲染')
// 曲线：4 行里第 3 行缺 context_tokens → 必须断成两段，不能连一条没测过的斜线。
const lineD = (tlBig.match(/class="sv-line" d="([^"]*)"/) || [])[1] || ''
if ((lineD.match(/M/g) || []).length !== 2) {
  fail(`P3: 中间缺一行，曲线应断成两段，实际 ${(lineD.match(/M/g) || []).length} 段; d=${lineD}`)
}
// 「有几行没测到」与「曲线断没断」是两件事，脚注必须分开说。这份夹具只有
// 4 行、其中 1 行缺，桶数=行数 → 那一行自成一桶且全空 → 两句话都该出现。
if (!tlBig.includes('未参与曲线')) fail(`P3: 缺行数必须在脚注里说出来; region=${tlBig}`)
if (!tlBig.includes('曲线在 1 处断开')) fail(`P3: 整桶全缺时必须说明曲线断开; region=${tlBig}`)
// 事件标记：风险×2 + 浪费×1 + 压缩（同 turn 合并）×1 + 子代理启动×2 + skill×2
// （T9：explicit/model_selected 两条 invocation 各推进一个 timelineEvent）= 8
const markers = (tlBig.match(/class="sv-event"/g) || []).length
if (markers !== 8) fail(`P3: 期望 8 个事件标记（风险×2 + 浪费 + 压缩合并 + 子代理×2 + skill×2），实际 ${markers}; region=${tlBig}`)
if (!tlBig.includes('aria-label')) fail('P3: 事件标记必须带 aria-label（键盘/读屏可达）')
if (!tlBig.includes('tabindex="0"')) fail('P3: 可点击的事件标记必须可聚焦')
ok('P3 时间线：缺口断成两段并披露，5 类事件标记齐全且键盘可达')

// P1-07 问题 1（键盘 roving）：**每一个**事件标记都要能被聚焦读出内容
// （不只是可点击的那几个——压缩/子代理这类没有对应 finding 的事件之前
// tabIndex 恒为 -1，键盘用户完全够不着，读不出它的存在），但同一时刻只有
// 一个是 Tab 键的落点——roving tabindex：8 个标记里必须恰好 1 个
// tabindex="0"、7 个 tabindex="-1"，不是"可点击的是 0，不可点击的是 -1"
// 这种旧的两分法。
// 只数 sv-event 标记自己的 tabindex——<svg> 根节点也有 tabindex="0"（承接
// 请求级方向键导航，P1-07 之前就有），混进同一个正则会把计数搅乱。
const eventTags = tlBig.match(/<g class="sv-event"[^>]*>/g) || []
if (eventTags.length !== 8) fail(`P1-07: 应有 8 个 sv-event 标记，实际 ${eventTags.length}`)
const tabZero = eventTags.filter(tag => tag.includes('tabindex="0"')).length
const tabNegOne = eventTags.filter(tag => tag.includes('tabindex="-1"')).length
if (tabZero !== 1 || tabNegOne !== 7) {
  fail(`P1-07: roving tabindex 应该恰好 1 个 tabindex="0" + 7 个 tabindex="-1"（8 个事件标记轮流做 Tab 落点），实际 ${tabZero} 个 0、${tabNegOne} 个 -1`)
}
// 可点击（risk×2 + waste×1 + skill×2 = 5，P1-01 之后 skill 的 targetId 不再
// 恒为 null）用 role="button"；不可点击的（compaction 合并×1 + subagent×2
// = 3）不再假装成 role="img"——它们本来就不是纯装饰，是可聚焦读取内容、
// 只是 Enter 没有目标可跳的事件，硬套 img 语义不准确。
const roleButtonCount = eventTags.filter(tag => tag.includes('role="button"')).length
if (roleButtonCount !== 5) fail(`P1-07: 可点击事件标记应有 role="button"（期望 5 个：risk×2+waste×1+skill×2），实际 ${roleButtonCount}`)
if (eventTags.some(tag => tag.includes('role="img"'))) fail('P1-07: 事件标记不应再用 role="img"——它们现在是可聚焦读取内容的对象，不是纯装饰')
ok('P1-07 事件级 roving tabindex：8 个标记（含无法跳转的压缩/子代理）都可聚焦，同一时刻只有 1 个是 Tab 落点')

// P1-07 问题 3：小屏默认摘要 + 展开入口。摘要块和完整图表块**都要渲染进
// markup**（容器查询只切 display，不是条件渲染）——静态快照才断言得到；
// 可见性交给 CSS 容器查询在真实浏览器里判断，这里只验证内容和入口都在。
if (!tlBig.includes('class="sv-chart-summary"')) fail('P1-07: 缺小屏摘要块')
if (!tlBig.includes('class="sv-chart-full"')) fail('P1-07: 缺完整图表块（容器查询切换的另一半）')
if (!tlBig.includes('sv-timeline-cq')) fail('P1-07: 时间线根节点应声明 container-type，容器查询才有依据')
// 摘要文案三个数：请求数、峰值、异常事件数——big fixture 4 个请求点、
// 2 个 risk 事件（SV601 + SV613），不该是别的数字凑出来的占位符。
if (!tlBig.includes('4 个请求') || !tlBig.includes('2 个异常事件')) {
  fail(`P1-07: 摘要行应给出真实请求数/异常数，不是占位; region=${tlBig}`)
}
if (!tlBig.includes('展开时间线')) fail('P1-07: 缺"展开时间线"入口')
// 事件列表替代路径：可跳转的事件（risk×2 + waste×1 + skill×2 = 5，P1-01
// 之后 skill 的 targetId 不再恒为 null）在摘要里也要能逐条点开，不依赖看
// 得懂图表。
const eventListItems = (tlBig.match(/class="sv-event-list-item"/g) || []).length
if (eventListItems !== 5) fail(`P1-07: 摘要态的事件列表替代路径应有 5 项（risk×2+waste×1+skill×2），实际 ${eventListItems}`)

// P1-01 回归（真实审计 2026-08-25 发现）：Skill 时间线事件的 targetId 曾经
// 恒为 null——画在时间线上却点不动、Enter 是空操作，小屏文本替代路径里也
// 找不到它们（那个列表本身就是按 targetId !== null 过滤的，上面 eventListItems
// 从 3 变成 5 已经间接证明了这点，这里直接断言两个 skill 调用的名字真的出
// 现在这条"可跳转"列表里，不是巧合凑出来的数字）。
const eventListRegion = (tlBig.match(/<div class="sv-event-list">[\s\S]*?<\/div>/) || [''])[0]
if (!eventListRegion.includes('release-notes') || !eventListRegion.includes('commit-summarizer')) {
  fail(`P1-01: 小屏事件列表替代路径应包含两个 Skill 调用的名字（release-notes/commit-summarizer），实际：${eventListRegion.slice(0, 800)}`)
}
ok('P1-01: Skill 时间线事件不再是 targetId 恒为 null 的死标记，小屏文本替代路径里能看到并点开')

// 主结论：SkillSection 的行必须真的有稳定 DOM id（sv-sk-N），时间线点击后
// 才有落点可跳（跟 P4 的 Finding sv-f-N 是同一条纪律）。
const skillsRegionForId = extractRegion(renders[0], 'data-audit-skills')
if (!skillsRegionForId || !/id="sv-sk-\d+"/.test(skillsRegionForId)) {
  fail(`P1-01: Skill 行应带稳定 DOM id（sv-sk-N），时间线点击才有落点可跳；region=${(skillsRegionForId || '').slice(0, 500)}`)
}
ok('P1-01: Skill 行带稳定 DOM id（sv-sk-N），与时间线 Skill 事件的 targetId 用同一套索引公式对得上')
ok('P1-07 小屏摘要（请求数/峰值/异常数）+ 展开入口 + 事件列表替代路径均已接线')

// FR-04：三个纵轴，且**切换纵轴时事件标记位置不变**。
const modeBtns = (tlBig.match(/class="sv-seg"[\s\S]*?<\/div>/) || [tlBig])[0]
for (const m of ['上下文', 'Token', '费用']) {
  if (!modeBtns.includes('>' + m + '<')) fail(`FR-04: 时间线缺「${m}」纵轴; seg=${modeBtns.slice(0,300)}`)
}
ok('FR-04 时间线三个纵轴齐备：[上下文] [Token] [费用]')

// FR-03 交互层。静态渲染看不到 hover 的效果，但**能验证接线在不在**：
// 事件处理器、可聚焦性、常驻信息面板、可点击图例。
if (!tlBig.includes('sv-cursorinfo')) fail('FR-04: 缺 tooltip/信息面板（PRD 要求显示 turn · request n/m · requestSeq）')
// 面板是**常驻一行**而不是浮层：AC-06 要求小屏不依赖 hover，浮层在触屏上
// 根本摸不到。未选中时显示操作提示，选中后才显示明细。
if (!tlBig.includes('鼠标悬停或用') ) fail('FR-04: 未选中时信息面板应给出操作提示')
if (!tlBig.includes('role="status"')) fail('AC-07: 信息面板应可被读屏软件播报')
if (!tlBig.includes('tabindex="0"')) fail('AC-07: 图表本身应可聚焦（方向键导航的落点）')
// 图例必须是**真实按钮**（FR-03「图例可控制事件类型显隐」）
const legend = (tlBig.match(/class="sv-legend"[\s\S]*?<\/div>/) || [''])[0]
if (!legend.includes('sv-legend-btn') || !legend.includes('aria-pressed')) {
  fail(`FR-03: 图例应是可切换显隐的真实按钮; legend=${legend.slice(0,240)}`)
}
ok('FR-03 交互接线：常驻信息面板（role=status）、图表可聚焦、图例是可切换的真实按钮')

// 模型切换必须是**低视觉权重的细刻度**，不能和风险事件同样是圆点——
// 正常切换本身不是异常，同级视觉只会制造噪声（FR-03 默认规则）。
const modelMarker = tlBig.match(/aria-label="[^"]*deepseek[^"]*"[\s\S]{0,200}?<(rect|circle)/)
if (modelMarker && modelMarker[1] !== 'rect') {
  fail(`FR-03: 模型切换标记应是细刻度（rect），不是与风险同级的圆点`)
}
ok('FR-03 模型切换是低视觉权重的细刻度，不与风险事件同一视觉优先级')

// ── 子代理 ────────────────────────────────────────────────────────────────
// 启动子代理是关键事件（一个 turn 里派出去的活会在别处烧掉真金白银），
// 但**不是异常**——所以它是时间线事件，不是 finding。
if (!tlBig.includes('子代理启动')) fail('子代理启动应作为一类时间线事件出现在图例里')
const subRegion = extractRegion(renders[0], 'data-audit-subagents')
if (subRegion === null) fail('缺子代理区块')
if (!subRegion.includes('Translate Rust output')) fail(`子代理应逐个列出，不只给合计; region=${subRegion}`)
if (!subRegion.includes('复制会话 id')) fail('用户可能想点进子代理会话——至少要能复制它的 id')
ok('子代理：时间线标记 + 逐个列出用量 + 可复制会话 id')

// P2-01（真实审计 2026-08-25 发现）：`findings` 字段早就在数据里
// （big fixture 里两个子代理分别是 16、2 条），曾经就是没有哪个组件把它
// 渲染出来，用户没法不点开每个子代理就分辨哪个是高风险的。
if (!subRegion.includes('>16<') || !subRegion.includes('>2<')) {
  fail(`P2-01: 子代理列表应渲染 findings 列（16、2），实际未出现；region=${subRegion.slice(0, 1500)}`)
}
ok('P2-01: 子代理列表新增 findings 列，数据早就有、现在真的渲染出来了')

// ── G3（GOVERNANCE_BACKLOG.md）Subagent 扇出可见性 ──────────────────────
// 「本次会话派生了 N 个子 Agent，累计消耗 ¥X（占总费用 Y%）」——数据本来就
// 都在（total_cost 来自 subagentUsage，分母是本会话费用 + total_cost），
// 这里断言这句话真的拼出来了，不是只有个别数字。
if (!subRegion.includes('派生了 2 个子 Agent')) {
  fail(`G3: 应显示"派生了 N 个子 Agent"汇总行; region=${subRegion.slice(0, 300)}`)
}
if (!subRegion.includes('占总费用')) {
  fail(`G3: 本会话费用可算时应显示占总费用的百分比; region=${subRegion.slice(0, 300)}`)
}
ok('G3: Subagent 扇出汇总行（N 个子 Agent + 累计消耗 + 占总费用百分比）')

// 本会话自己的费用算不出时（老宿主/投影未就绪）：只报子代理金额，不能拿一个
// 算不出的分母硬凑百分比——费用卡本身已经在测"不可估算"这条路径，这里额外
// 断言 SubagentSection 的汇总行同步降级，不是自己算出一个假百分比。
const noCostFanoutHtml = renderToStaticMarkup(React.createElement(AuditView, {
  useProjection: (key) => key === 'costReport'
    ? { per_model: {}, total: null, peak_total: null, unpriced_tokens: 0, currency: null, estimate_disclaimer: null }
    : projectionOf(DATASETS[0])(key),
}))
const noCostFanoutRegion = extractRegion(noCostFanoutHtml, 'data-audit-subagents')
if (noCostFanoutRegion === null) fail('G3: 本会话费用算不出时子代理区块不应整段消失')
if (!noCostFanoutRegion.includes('派生了 2 个子 Agent')) {
  fail(`G3: 本会话费用算不出时仍应报出子代理数量和金额; region=${(noCostFanoutRegion || '').slice(0, 300)}`)
}
if (noCostFanoutRegion.includes('占总费用')) {
  fail(`G3: 本会话费用算不出时不应显示百分比（分母不可用，不能硬凑）; region=${(noCostFanoutRegion || '').slice(0, 300)}`)
}
ok('G3: 本会话费用算不出时汇总行降级为"仅金额"，不编一个假百分比')

// G3 i18n：同 D7 的纪律——扫描整段区域有没有残留中文字符，不是逐个关键词
// 枚举（SkillSection 当初就是被漏掉的关键词躲过去的）。
Object.defineProperty(globalThis, 'navigator', { value: { language: 'en-US' }, configurable: true, writable: true })
const subEnHtml = renderToStaticMarkup(React.createElement(AuditView, { useProjection: projectionOf(DATASETS[0]) }))
Object.defineProperty(globalThis, 'navigator', { value: { language: 'zh-CN' }, configurable: true, writable: true })
const subEnRegion = extractRegion(subEnHtml, 'data-audit-subagents')
if (!subEnRegion.includes('spawned 2 subagents') || !subEnRegion.includes('of total cost')) {
  fail(`i18n: SubagentSection 扇出汇总行英文渲染缺失; region=${(subEnRegion || '').slice(0, 300)}`)
}
if (/[一-龥]/.test(subEnRegion)) {
  fail(`i18n: SubagentSection 英文渲染里残留中文字符；region=${subEnRegion.slice(0, 300)}`)
}
ok('i18n: SubagentSection 扇出汇总行完整走 t()，英文 locale 下无中文残留')

// ── 子代理"流程图"二级视图（用户要求：现有列表数据换成图形化树，不是新
// 数据源）── 同 SkillSection 的 `hidden` 纪律：列表/流程图都在标记里，
// 只是默认视图（列表）之外那份也断言得到，不用真的切换视图。
if (!subRegion.includes('role="group"') || !subRegion.includes('aria-pressed')) {
  fail(`P1-06 后续: 子代理区块应有"列表/流程图"切换（role=group + aria-pressed 按钮）; region=${subRegion.slice(0, 500)}`)
}
if (!subRegion.includes('流程图')) fail('子代理区块缺"流程图"切换按钮')
// 流程图节点：本会话根节点标签 + 每个子代理一个 role="button" 节点，
// aria-label 带出 turn/描述——SVG 元素的 role 通过 h(...) 直接下发，
// renderToStaticMarkup 会把它序列化成 role="button" 字符串属性。
if (!subRegion.includes('本会话')) fail('流程图缺根节点标签"本会话"')
// 精确匹配节点的 <g class="sv-flow-node"> 本身——不能用 `sv-flow-node` 前缀
// 松匹配，节点内部的 rect/text/dot 子元素类名也以这个前缀开头
// （sv-flow-node-rect/-text/-dot），松匹配会把它们也数进去。
const flowNodeCount = (subRegion.match(/class="sv-flow-node( sv-flow-node-active)?"/g) || []).length
if (flowNodeCount !== 2) fail(`流程图应有 2 个子代理节点（对应 2 次 spawn），实际 ${flowNodeCount}；region=${subRegion.slice(0, 2000)}`)
// findings=16 的那个子代理节点应带警示描边类（sv-flow-node-rect-warn）。
if (!subRegion.includes('sv-flow-node-rect-warn')) {
  fail('流程图: findings>0 的子代理节点应带警示样式（sv-flow-node-rect-warn），跟列表模式的 T.warn 高亮同一条纪律')
}
// 常驻详情面板：默认未选中任何节点，显示"选择一个节点查看详情"提示。
if (!subRegion.includes('选择一个节点查看详情')) fail('流程图缺常驻详情面板的默认提示文案')
if (!subRegion.includes('sv-flow-detail')) fail('流程图缺常驻详情面板（role=status，同 TimelinePanel 的 cursorinfo 模式）')
ok('子代理流程图: 列表/流程图切换、根节点+2 个子代理节点、findings>0 警示样式、常驻详情面板骨架均已接线')

// i18n：英文 locale 下流程图这几句新增文案不得有中文残留（同上面 G3 的做法）。
Object.defineProperty(globalThis, 'navigator', { value: { language: 'en-US' }, configurable: true, writable: true })
const flowEnHtml = renderToStaticMarkup(React.createElement(AuditView, { useProjection: projectionOf(DATASETS[0]) }))
Object.defineProperty(globalThis, 'navigator', { value: { language: 'zh-CN' }, configurable: true, writable: true })
const flowEnRegion = extractRegion(flowEnHtml, 'data-audit-subagents') || ''
if (!flowEnRegion.includes('This session') || !flowEnRegion.includes('Select a node')) {
  fail(`i18n: 子代理流程图英文渲染缺失; region=${flowEnRegion.slice(0, 500)}`)
}
if (/[一-龥]/.test(flowEnRegion)) {
  fail(`i18n: 子代理流程图英文渲染里残留中文字符；region=${flowEnRegion.slice(0, 2000)}`)
}
ok('i18n: 子代理流程图完整走 t()，英文 locale 下无中文残留')



// **真实会话上抓到的 bug**：687 行里 13 行缺 context_tokens，但聚合成 220 桶后
// 没有任何一桶全空，曲线其实是连通的——初版脚注却照写「已留缺口」，在陈述一件
// 没发生的事。这里用同样的形状钉住：缺行分散、桶数远小于行数时，只能说
// 「未参与曲线」，不能说「断开」。
// 复刻真实比例：687 行、13 个分散的 null（约 1.9%）。687/220 ≈ 3.1 行一桶，
// 相邻的 null 之间隔了 52 行，不可能凑出一整桶全空。
const scattered = []
for (let i = 0; i < 687; i++) scattered.push([i % 52 === 7 ? null : 1000 + i, i + 1])
const sparseDs = { ...DATASETS[0], requests: reqMetrics(scattered, 1000000) }
const sparseHtml = renderToStaticMarkup(React.createElement(AuditView, { useProjection: projectionOf(sparseDs) }))
const sparseTl = extractRegion(sparseHtml, 'data-audit-timeline')
if (!sparseTl.includes('未参与曲线')) fail('P3: 分散缺行仍应报出未参与的行数')
if (sparseTl.includes('处断开')) {
  fail(`P3: 没有任何一桶全空时不得声称曲线断开——数字对但对它做了什么的说法错了，一样是不诚实; region=${sparseTl}`)
}
const sparseD = (sparseTl.match(/class="sv-line" d="([^"]*)"/) || [])[1] || ''
if ((sparseD.match(/M/g) || []).length !== 1) fail('P3: 该夹具下曲线应当是连通的（对照组）')
ok('P3 时间线：缺行分散但没有整桶全空时，只说「未参与曲线」，不谎称「断开」')

// 没有 requestMetrics 时报"暂不可用"，不画一条空曲线。
const noTl = renderToStaticMarkup(React.createElement(AuditView, {
  useProjection: projectionOf({ ...DATASETS[0], requests: undefined }),
}))
const noTlRegion = extractRegion(noTl, 'data-audit-timeline')
if (noTlRegion !== null) fail('P3: 没有逐请求数据时不该渲染时间线区块')
ok('P3 时间线：没有逐请求数据时整块不渲染，不画空曲线')

// --- P3b 常驻前缀构成 ----------------------------------------------------
const compRegion = extractRegion(renders[0], 'data-audit-composition')
if (compRegion === null) fail('P3b: 常驻前缀构成没渲染')
for (const label of ['系统提示词', '工具定义', '技能目录']) {
  if (!compRegion.includes(label)) fail(`P3b: 缺「${label}」行`)
}
// **只画测到的三行**：原型那两行编造的「历史消息 / 其余未分类」绝不能出现。
for (const forbidden of ['历史消息', '其余未分类']) {
  if (compRegion.includes(forbidden)) {
    fail(`P3b: 出现了我们从来没测过的「${forbidden}」行——那是原型编的数据`)
  }
}
// 结论必须是"占峰值多少"，把"别去优化技能目录"这件事说出来。
if (!compRegion.includes('占本次峰值的')) fail(`P3b: 缺"常驻前缀占峰值多少"的结论; region=${compRegion}`)
if (!compRegion.includes('不可相减')) fail(`P3b: 必须写明两个估算器不可相减; region=${compRegion}`)
ok('P3b 常驻前缀：只画三行实测，不出现原型编造的两行，且给出占峰值的结论')

// 三项全缺时报"暂不可用"，不以 0 替代。
const noComp = renderToStaticMarkup(React.createElement(AuditView, {
  useProjection: projectionOf({ ...DATASETS[0], composition: comp(null, null, null, null) }),
}))
const noCompRegion = extractRegion(noComp, 'data-audit-composition')
if (!noCompRegion.includes('暂不可用') || !noCompRegion.includes('不以 0 替代')) {
  fail(`P3b: 三项全缺时应报"暂不可用"且声明不以 0 替代; region=${noCompRegion}`)
}
// 只看**文本内容**：标签属性里的 letter-spacing:0.04em 之类会误伤
// （第一版断言就是这么假红的）。
const compText = noCompRegion.replace(/<[^>]*>/g, ' ').replace(/不以 0 替代/, '')
if (/(^|[^\d.])0([^\d.]|$)/.test(compText)) {
  fail(`P3b: 三项全缺时正文里不得出现任何 0; text=${compText}`)
}
ok('P3b 常驻前缀：三项全缺时报「暂不可用」，不以 0 替代')

// --- P4 证据队列 ---------------------------------------------------------
const fRegion = extractRegion(renders[0], 'data-audit-findings')
// 浪费并进同一条队列——不单开区块，否则用户要在两个地方找同一起事件。
if (!fRegion.includes('SV-COST-02')) fail(`P4: 结构性浪费应并进同一条 findings 队列; region=${fRegion}`)
// 每行可展开，展开后给出结构化证据
if (!fRegion.includes('sv-fdetail')) fail('P4: finding 行缺展开详情')
for (const k of ['证据', '位置', '类别']) {
  if (!fRegion.includes(k)) fail(`P4: 展开详情缺「${k}」`)
}
if (!fRegion.includes('影响量级')) fail('P4: 浪费行展开后应给出影响量级')
if (!fRegion.includes('确认这段失败是否需要重试')) fail('P4: 浪费行应带出可执行建议')
ok('P4 证据队列：浪费并进同一条队列，行可展开给出证据/位置/类别/影响量级/建议')

// 交叉引用：**只陈述共现，不断言因果**。第一版写的是「是同一起事件」，
// 真实数据里 T31 同时有一条 SV601，跟那段浪费没有因果关系——turn 相邻
// 支撑不起因果断言，只支撑得起"同一个 turn 里还有这些"。
if (!fRegion.includes('同一 turn')) fail(`P4: 浪费行应标出同 turn 的其它 finding; region=${fRegion}`)
if (fRegion.includes('是同一起事件，不是两个独立问题')) {
  fail('P4: 不得仅凭 turn 相邻就断言因果——共现不是同一起事件')
}
ok('P4 交叉引用：只陈述"同一 turn 内还有哪些"，不凭 turn 相邻断言因果')

// finding 行必须带 DOM id——时间线点击定位的落点。
if (!fRegion.includes('id="sv-f-')) fail('P4: finding 行缺 DOM id，时间线点击无处可落')
ok('P4 finding 行带 DOM id，时间线点击有落点')

// --- FR-10 个人复核备注 ---------------------------------------------------
// 取代原来的 T3/T3b「已忽略折叠区」测试——三态标记连同「已忽略」区块一起
// 删除了（PRD §3.2/§3.3）。折叠隐藏风险那条原则本身仍然成立，只是现在没有
// 任何按严重度折叠的区块，它转由 FindingGroup 的同级分页承担（组内严重度
// 相同，折叠不可能藏起更高的级别，见 GROUP_PAGE_SIZE 注释）。
const t3 = DATASETS[2]
__notes = { [mk('SV602', 'sudo su -')]: { text: '这条是我手动跑的清理脚本', updatedAt: 0 } }
const htmlNote = renderToStaticMarkup(React.createElement(AuditView, { useProjection: projectionOf(t3) }))
__notes = {}
const noteRegion = extractRegion(htmlNote, 'data-audit-findings')
if (!noteRegion.includes('这条是我手动跑的清理脚本')) fail('FR-10: 备注文本未渲染')
if (!noteRegion.includes('编辑备注') || !noteRegion.includes('删除备注')) {
  fail('FR-10: 有备注的行应给出编辑/删除入口')
}
// **备注不得重排、隐藏或淡化原始 finding**（FR-10）。带备注的 SV602 是
// critical，必须仍在 critical 组、仍在原位（按 seq 降序），不因为有备注而
// 置顶或沉底——旧的三态标记就是这么干的，那是被 PRD 否掉的行为。
// data-rule 是每行唯一的规则码钩子——直接扫 "SV\d{3}" 子串已经不可靠：
// P1-04 之后同一行的「更多操作/展开详情/添加备注」几个 aria-label 也会
// 带上规则码文本，纯文本扫描数出来的次数不再等于行数。
const RULE_RE = /data-rule="([^"]+)"/g
const orderNoted = [...noteRegion.matchAll(RULE_RE)].map(m => m[1])
const htmlPlain = renderToStaticMarkup(React.createElement(AuditView, { useProjection: projectionOf(t3) }))
const orderPlain = [...extractRegion(htmlPlain, 'data-audit-findings').matchAll(RULE_RE)].map(m => m[1])
if (JSON.stringify(orderNoted) !== JSON.stringify(orderPlain)) {
  fail(`FR-10: 加备注改变了 finding 顺序——备注不得重排原始 finding\n有备注: ${orderNoted}\n无备注: ${orderPlain}`)
}
ok('FR-10 备注渲染 + 编辑/删除入口，且不重排/不隐藏原始 finding')

// 备注的性质必须写在明处，不能让一堆按钮自己去暗示。
if (!noteRegion.includes('不代表风险已处置')) {
  fail('FR-10/PRD §3.2: 缺"备注不等于风险已处置"的说明')
}
ok('FR-10 页面显式声明备注只是本地阅读记录，不代表风险已处置')

// --- FR-07 过滤与搜索 -----------------------------------------------------
const filterRegion = extractRegion(renders[0], 'data-audit-summary')
if (filterRegion === null) fail('FR-07: 缺过滤器 chips')
for (const want of ['全部', '严重', '警告']) {
  if (!filterRegion.includes(want)) fail(`FR-07: 过滤器缺「${want}」; region=${filterRegion}`)
}
if (!filterRegion.includes('aria-pressed')) fail('FR-07: chips 必须是真实按钮（带 aria-pressed）')
// AC-01：过滤器的计数必须与去重后的列表条数一致。
const bigRows = (extractRegion(renders[0], 'data-audit-findings').match(/id="sv-f-/g) || []).length
const allCount = parseInt((filterRegion.match(/全部 (\d+)/) || [])[1], 10)
if (allCount !== bigRows) {
  fail(`AC-01: 过滤器「全部 ${allCount}」与列表实际 ${bigRows} 行不一致——两处口径必须相同`)
}
ok(`FR-07 过滤器 chips 是真实按钮，且「全部 ${allCount}」与列表 ${bigRows} 行口径一致`)
if (!renders[0].includes('导出 JSON')) fail('FR-12: 缺 JSON 导出入口')
if (!renders[0].includes('复制证据')) fail('FR-11: 缺「复制证据」入口')
ok('FR-11/FR-12 复制证据 / 复制 finding JSON / 导出 JSON 入口齐备')

// P1-04（这次补的菜单键盘模型）：role=menu 光有 ARIA 角色，光靠
// renderToStaticMarkup 静态断言不到 Esc/方向键的运行时行为（同一份「不依赖
// jsdom」的边界见 P1-02B 那条注释）——这里能静态验证的是"骨架具备了让键盘
// 模型工作的前提"：菜单项确实标了 role="menuitem"（方向键靠 querySelectorAll
// 找它们）、菜单和触发按钮都在标记里存在。运行时行为（Esc 关闭还焦点、↑/↓
// 循环移动）留给读代码 + 真机验证，不是自动化盲区被忽略了。
const menuRegion = extractRegion(renders[0], 'data-audit-findings') || ''
const menuItemCount = (menuRegion.match(/role="menuitem"/g) || []).length
if (menuItemCount === 0) fail('P1-04: 一个 role="menuitem" 都没有——菜单键盘模型的方向键遍历找不到目标')
if (!menuRegion.includes('role="menu"')) fail('P1-04: 缺 role="menu" 容器')
ok(`P1-04: 菜单骨架就位（${menuItemCount} 个 role="menuitem"），键盘模型（Esc 关闭还焦点、↑/↓/Home/End 遍历）的运行时行为留给真机验证`)

// --- P1 结论区 -------------------------------------------------------------
// 首屏第一件事必须回答"这次要不要紧"：判词 + 三个指标。判词的严重度、上下文
// 峰值的百分比、最严重发现的规则名，三者都得是**真算出来的**，不是占位。
const big = DATASETS[0]
const htmlVerdict = renderToStaticMarkup(React.createElement(AuditView, { useProjection: projectionOf(big) }))
const verdictRegion = extractRegion(htmlVerdict, 'data-audit-verdict')
if (verdictRegion === null) fail('P1: 结论区没渲染')
// 四栏：费用 / Token / 上下文峰值 / 异常。原来还有一行判词「本次发现 N 个
// 异常信号，含 X 严重…」，已删除——它和「最严重发现」那张卡是同一个职能说了
// 两遍，严重度分布又和下方筹码第三次重复。现在异常卡说"多少条 + 最严重的是
// 哪条"，筹码说"按级别怎么分布"，两者不重叠。
const cardLabels = [...verdictRegion.matchAll(/class="sv-metric-label">([^<]*)</g)].map(m => m[1])
if (cardLabels.length !== 4) fail(`P1: 结论区应有 4 栏，实际 ${cardLabels.length}：${cardLabels}`)
for (const want of ['费用估算', 'Token 用量', '上下文峰值', '异常']) {
  if (!cardLabels.includes(want)) fail(`P1: 结论区缺「${want}」栏；实际 ${cardLabels}`)
}
if (verdictRegion.includes('本次发现') || verdictRegion.includes('sv-verdict-head')) {
  fail('P1: 判词行应已移除（与异常卡职能重复）')
}
// big-session：1 critical + 1 warning + 1 结构性浪费 = 去重后 3 行。异常卡、
// 标题、过滤器「全部」必须都是 3——**含并进队列的浪费**（AC-01 要的是同一套
// 口径，不是"行为 finding 一套、浪费另一套"）。
const vRows = (extractRegion(renders[0], 'data-audit-findings').match(/id="sv-f-/g) || []).length
if (!verdictRegion.includes(vRows + ' 条')) {
  fail(`P1/AC-01: 异常卡应与列表同为 ${vRows} 条; region=${verdictRegion}`)
}
if (!verdictRegion.includes('最严重 破坏性命令')) {
  fail(`P1: 异常卡副标题应给出最严重的那条是什么; region=${verdictRegion}`)
}
// 严重度分布**不该**出现在结论区——那是下方筹码的职能，放进来就是第三次重复。
if (/含 \d+ 严重/.test(verdictRegion)) fail('P1: 严重度分布不应重复出现在结论区')
// Token 卡：合计要跳过 unreported 的字段（DSH 把没上报的填成 0，直接相加
// 等于替宿主编了一次测量）。
if (!verdictRegion.includes('输入')) fail(`P1: Token 卡副标题应给出分项; region=${verdictRegion}`)
// 上下文峰值：fixture 里最大的是 799841 / 1000000 = 80%，且第三行的 null
// **不能**被当成 0 参与——若被当成 0，峰值不变但"算了几行"会说成 4/4。
if (!verdictRegion.includes('799.8K / 1M')) {
  fail(`P1: 上下文峰值应取实测最大值并带上限; region=${verdictRegion}`)
}
if (!verdictRegion.includes('80%')) fail(`P1: 上下文峰值应算出占比; region=${verdictRegion}`)
if (!verdictRegion.includes('峰值在 T31')) fail(`P1: 峰值应定位到 turn; region=${verdictRegion}`)
// 最严重发现 = critical 那条（SV601 破坏性命令），不是 seq 最大的那条
ok('P1 结论区四栏：费用 / Token / 上下文峰值 80% / 异常，四个数都是算出来的')

// 费用卡副标题放的是**解释这张账单的两件事**：高峰占多少、缓存命中那部分占
// 多少。缓存给的是**实付**金额而不是"省下多少"（后者是反事实，不做）。
if (!verdictRegion.includes('高峰时段')) fail(`P1: 费用卡副标题应给出高峰时段占比; region=${verdictRegion}`)
if (!verdictRegion.includes('命中缓存总')) fail(`P1: 费用卡副标题应给出命中缓存实付金额; region=${verdictRegion}`)
// 小占比不能被四舍五入抹平——那正是这一项最想说的话（命中占 18% 的输入
// token，只占账单的零点几个百分点）。固定取整会显示成「0%」或「1%」。
const bigCost = costReportOf(big.byModel)
const cacheShare = Object.values(bigCost.per_model).reduce((s, m) => s + m.cache_read_cost, 0) / bigCost.total
if (cacheShare < 0.1) {
  const oneDecimal = (cacheShare * 100).toFixed(1).replace(/\.0$/, '') + '%'
  if (!verdictRegion.includes('（' + oneDecimal + '）')) {
    fail(`P1: 小于 10% 的占比应保留一位小数（期望 ${oneDecimal}），否则被取整抹平; region=${verdictRegion}`)
  }
}
ok('P1 费用卡副标题：高峰占比 + 命中缓存实付，且小占比不被取整抹平')

// 老宿主没有 cache_read_cost 字段时**不得**显示 ¥0（0%）——那是「没上报」
// 不是「测到了 0」。真机上撞见过：dsh web 是旧进程，这里就显示了 ¥0。
const legacyCost = costReportOf(big.byModel)
for (const k of Object.keys(legacyCost.per_model)) delete legacyCost.per_model[k].cache_read_cost
const legacyHtml = renderToStaticMarkup(React.createElement(AuditView, {
  useProjection: (key) => (key === 'costReport' ? legacyCost : projectionOf(big)(key)),
}))
const legacyRegion = extractRegion(legacyHtml, 'data-audit-verdict')
if (legacyRegion.includes('命中缓存总')) {
  fail(`P1: 宿主没上报 cache_read_cost 时不得显示该项（会把"没上报"伪造成"测到了 0"）; region=${legacyRegion}`)
}
if (!legacyRegion.includes('高峰时段')) fail('P1: 缺 cache_read_cost 不应连带把高峰那项也吞掉')
ok('P1 费用卡副标题：宿主没上报 cache_read_cost 时整项省略，不显示 ¥0')

// 费用卡按用户的口径：**这个会话总共花了多少 = 本会话 + 各子代理**。
const bigSelf = costReportOf(big.byModel).total
const bigSubs = subsOf([[22, 'Translate Rust output', 19.77, 4300000, 16], [31, 'DSH-2 keystone', 8.66, 1900000, 2]]).total_cost
const grand = bigSelf + bigSubs
const money = (n) => '¥' + (n >= 100 ? n.toFixed(1) : n.toFixed(2)).replace(/\.0+$/, '')
if (!verdictRegion.includes(money(grand))) {
  fail(`费用卡应显示本会话+子代理的合计 ${money(grand)}; region=${verdictRegion}`)
}
if (!verdictRegion.includes('本会话') || !verdictRegion.includes('个子代理')) {
  fail(`费用卡副标题应拆出「本会话 / N 个子代理」; region=${verdictRegion}`)
}
ok(`费用卡口径 = 本会话 + 各子代理（${money(grand)}），副标题拆开两部分`)

// 子代理会话读不到时**不得**并进总数，也不得写成 ¥0——「没读到」≠「花了 0」。
const unreadable = { ...big, subagents: subsOf([[22, '读不到的那个', null, null, null]]) }
const unreadHtml = renderToStaticMarkup(React.createElement(AuditView, { useProjection: projectionOf(unreadable) }))
const unreadSub = extractRegion(unreadHtml, 'data-audit-subagents')
if (!unreadSub.includes('—')) fail('读不到的子代理应显示「—」，不是 ¥0')
if (!unreadSub.includes('合计是下限')) fail('有读不到的子代理时必须声明总额是下限')
ok('子代理读不到时显示「—」而非 ¥0，并声明合计是下限')

// ── G1: 预算阈值 + 告警展示（GOVERNANCE_BACKLOG.md G1）───────────────────
// 费用卡的值 div 紧跟在「费用估算」标签 div 之后；抓它的属性串，style 里有
// 没有 --dsw-alias-state-{warn,error}-primary 就是有没有按阈值上色。
function costCardAttrs(region) {
  const m = region && region.match(/费用估算<\/div><div([^>]*)>/)
  return m ? m[1] : null
}
// `money` above only strips a full ".0"/".00" tail, not formatMoney()'s second
// pass (a lone trailing zero after one decimal, e.g. "12.50" → "12.5") — it
// happens to not matter for `grand`'s specific value but would silently
// mismatch for arbitrary budget numbers below, so mirror formatMoney() exactly.
const budgetMoney = (n) => '¥' + (n >= 100 ? n.toFixed(1) : n.toFixed(2)).replace(/\.0+$/, '').replace(/(\.\d)0$/, '$1')

// 未设置预算（htmlVerdict/verdictRegion 就是这个默认态，__budget 尚未被
// 后面的用例改写过）：不产生任何高亮，但设置入口必须在（面板 hidden 不等
// 于不存在，见上面「折叠不等于不存在」的注释）。
const noBudgetAttrs = costCardAttrs(verdictRegion)
if (noBudgetAttrs === null) fail('G1: 费用卡未渲染')
if (noBudgetAttrs.includes('style=')) fail(`G1: 未设置预算时费用卡不应带任何颜色高亮; attrs=${noBudgetAttrs}`)
if (!verdictRegion.includes('设置预算提醒')) fail('G1: 未设置预算时应给出设置入口')
if (verdictRegion.includes('已用预算') || verdictRegion.includes('已超出预算')) {
  fail('G1: 未设置预算时不应出现任何预算文案')
}
ok('G1: 未设置预算——费用卡无高亮，面板给出设置入口，不产生任何预算文案')

// 超预算（grand 是 total 的 2 倍，即 ratio=200%）：标红 + "已超出预算" 文案。
__budget = grand / 2
const overHtml = renderToStaticMarkup(React.createElement(AuditView, { useProjection: projectionOf(big) }))
const overRegion = extractRegion(overHtml, 'data-audit-verdict')
const overAttrs = costCardAttrs(overRegion)
if (!overAttrs || !overAttrs.includes('--dsw-alias-state-error-primary')) {
  fail(`G1: 超预算（200%）费用卡应标红; attrs=${overAttrs}`)
}
if (!overRegion.includes('已超出预算')) fail(`G1: 超预算时应有"已超出预算"文案; region=${overRegion}`)
if (!overRegion.includes(budgetMoney(__budget))) fail(`G1: 超预算文案应带出预算金额 ${budgetMoney(__budget)}; region=${overRegion}`)
ok('G1: 超预算（>=100%）费用卡标红，展开面板给出"已超出预算"文案与金额')

// 接近预算（grand 占预算 80%，落在 70%–100% 区间）：告警色，但不是红色，
// 文案是"已用预算"而不是"已超出预算"。
__budget = grand / 0.8
const nearHtml = renderToStaticMarkup(React.createElement(AuditView, { useProjection: projectionOf(big) }))
const nearRegion = extractRegion(nearHtml, 'data-audit-verdict')
const nearAttrs = costCardAttrs(nearRegion)
if (!nearAttrs || !nearAttrs.includes('--dsw-alias-state-warn-primary')) {
  fail(`G1: 接近预算（80%）费用卡应显示告警色; attrs=${nearAttrs}`)
}
if (nearAttrs.includes('--dsw-alias-state-error-primary')) fail('G1: 80% 不应被误判为超预算（标红）')
if (!nearRegion.includes('已用预算')) fail(`G1: 接近预算时应有"已用预算"文案; region=${nearRegion}`)
if (nearRegion.includes('已超出预算')) fail('G1: 80% 不应显示"已超出预算"文案')
ok('G1: 接近预算（70%–100%）费用卡显示告警色（非红），文案为"已用预算"')

// 远低于预算（grand 只占预算的 10%）：不高亮，不发声——"预算充足"是零信息。
__budget = grand * 10
const okBudgetHtml = renderToStaticMarkup(React.createElement(AuditView, { useProjection: projectionOf(big) }))
const okBudgetRegion = extractRegion(okBudgetHtml, 'data-audit-verdict')
const okBudgetAttrs = costCardAttrs(okBudgetRegion)
if (!okBudgetAttrs) fail('G1: 费用卡未渲染（远低于预算场景）')
if (okBudgetAttrs.includes('style=')) fail(`G1: 远低于预算（10%）时不应高亮; attrs=${okBudgetAttrs}`)
if (okBudgetRegion.includes('已用预算') || okBudgetRegion.includes('已超出预算')) {
  fail('G1: 花费远低于预算时不应出现预算文案（"充足"是零信息，不占版面）')
}
if (!okBudgetRegion.includes(budgetMoney(__budget))) fail(`G1: 已设置的预算金额本身仍应在面板可见; region=${okBudgetRegion}`)
ok('G1: 花费远低于预算（<70%）时不高亮、不发声，但已设置的预算金额仍在面板可查')

__budget = null

// Token 卡合计**必须跳过 unreported_fields 里的字段**，且**必须从
// tokenByModel 取数**（不是宿主自带的 tokenUsage）。两条纪律一个夹具一起守：
//
//   - 桶放在 tokenByModel.by_model 里，因为那是我们自己折的、已按 seedLength
//     过滤分叉的那一份。宿主的 tokenUsage 不经过分叉过滤，在 branch 出来的
//     新会话里会把上游历史一起算进来（真机实测 277.2M 全是上游的，而同屏的
//     费用卡显示"本会话还没花钱"——两个数当场打架）。
//   - 宿主那份在这里是**诱饵**：数字故意设成 7，与正确答案 1.5K 差着量级。
//     哪天有人把卡片改回去读它，这条断言会立刻红，而不是悄悄多算一段上游。
const unrepTok = { uncachedInputTokens: 7, outputTokens: 7, cacheReadTokens: 7, cacheWriteTokens: 7 }
const unrepBM = {
  by_model: { 'deepseek-v4-pro': bucket(1000, 200, 300, 999) },
  sequence: ['deepseek-v4-pro'],
  unreported_fields: ['cacheWriteTokens'],
}
const tokHtml = renderToStaticMarkup(React.createElement(AuditView, {
  useProjection: (key) => key === 'tokenUsage' ? unrepTok : key === 'tokenByModel' ? unrepBM : projectionOf(big)(key),
}))
// class 不一定是标签里第一个属性——P1-02 之后这个 value div 还带 id（供
// aria-describedby 用），属性顺序不是这个断言该锁定的东西。
const tokCard = (extractRegion(tokHtml, 'data-audit-verdict').match(/Token 用量<\/div><div[^>]*class="sv-metric-value sv-num"[^>]*>([^<]*)</) || [])[1]
// 1000+200+300 = 1.5K；把未上报的 999 也算进去会变成 2.5K，读了宿主诱饵会是 21。
if (tokCard !== '1.5K') {
  fail(`P1: Token 合计应取自 tokenByModel 且跳过未上报的 cacheWriteTokens（期望 1.5K），实际 ${tokCard}`)
}
ok('P1 Token 卡：取自已过滤分叉的 tokenByModel，且合计跳过 unreported_fields')

// --- 分叉会话的口径一致性 ----------------------------------------------------
// 真机场景：刚从上游 branch 出来、还没发过请求的新会话。
//   - costReport 的 total 为 null 且 unpriced_tokens 为 0 → 这是「零请求」，
//     **不是**「估不出来」。我们有完整的事件流，里面确实没有请求，¥0 才是
//     诚实答案；"不可用"是在声称一种我们并不具有的无知。
//   - Token 卡必须同步是 0，不能一个说"没花钱"另一个说"用了 277M"。
const freshFork = {
  ...big,
  findings: [], waste: wasteOf([]),
  byModel: { by_model: {}, sequence: [], unreported_fields: [] },
  // 宿主 tokenUsage 仍然带着上游的一大坨——正是真机上那个 277.2M 的来源。
  // 修好之后它不该影响任何一个显示值。
  usage: { uncachedInputTokens: 226400000, outputTokens: 685800, cacheReadTokens: 50100000, cacheWriteTokens: 0 },
  // requests 置空：分叉后还没发过请求 → 没有实测峰值，卡片该退回"继承值"。
  requests: { requests: [], status: 'complete', missingFields: [] },
  // tokens（累计 277.2M）与 inherited_context（812.4K）**故意差着数量级**——
  // 卡片必须显示后者。拿错会把 81% 的占用显示成 27700%。
  preFork: {
    forked: true, boundary_seq: 420384, tokens: 277200000, cost: 680.36,
    inherited_context: 812400, inherited_window: 1000000,
    status: 'complete', missingFields: [],
  },
}
const forkHtml = renderToStaticMarkup(React.createElement(AuditView, { useProjection: projectionOf(freshFork) }))
const forkVerdict = extractRegion(forkHtml, 'data-audit-verdict')
const forkCostCard = (forkVerdict.match(/费用估算<\/div><div[^>]*class="sv-metric-value sv-num"[^>]*>([^<]*)</) || [])[1]
if (forkCostCard === '不可用') {
  fail('分叉一致性：零请求（有完整数据、确实没有请求）应显示 ¥0，不是"不可用"')
}
if (!/^¥0/.test(forkCostCard || '')) {
  fail(`分叉一致性：零请求时费用卡应是 ¥0，实际 ${forkCostCard}`)
}
if (!forkVerdict.includes('尚未产生请求')) {
  fail('分叉一致性：孤零零一个 ¥0 会被读成"功能坏了"，必须带"尚未产生请求"的说明')
}
const forkTokCard = (forkVerdict.match(/Token 用量<\/div><div[^>]*class="sv-metric-value sv-num"[^>]*>([^<]*)</) || [])[1]
if (forkTokCard !== '0') {
  fail(`分叉一致性：费用说 ¥0、Token 就不能说 ${forkTokCard}——两张卡必须同一批事件（宿主未过滤的 226.4M 不得泄漏进来）`)
}
ok('分叉一致性：零请求的新分叉会话，费用 ¥0 + Token 0 同源，不出现"不可用"，也不泄漏上游用量')

// 「一笔都算不出」必须与「¥0」分开。真机撞到的场景：整段跑在 shengsuanyun
// 上的会话，供应商不在价目表白名单里 → per_model 为空、unpriced_tokens 是
// 2.76 亿。cost_report 这时给的 total 是 **0.0（不是 null）**，照着 total 判
// 会把「我们拒绝给它估价」显示成「¥0」——读起来是"免费"，正好把最需要说清楚
// 的那件事说反了。
const allUnpriced = {
  ...big,
  findings: [], waste: wasteOf([]),
  byModel: { by_model: {}, sequence: [], unreported_fields: [] },
  costOverride: {
    currency: 'CNY', estimate_disclaimer: '估算值，不是账单',
    total: 0, peak_total: 0, per_model: {}, unpriced_tokens: 276498567,
    series: [], priced_requests: 0, total_requests: 0,
    status: 'partial', missingFields: ['unpriced_tokens'],
  },
}
const unpricedHtml = renderToStaticMarkup(React.createElement(AuditView, {
  useProjection: (key) => key === 'costReport' ? allUnpriced.costOverride : projectionOf(allUnpriced)(key),
}))
const unpricedVerdict = extractRegion(unpricedHtml, 'data-audit-verdict')
const unpricedCard = (unpricedVerdict.match(/费用估算<\/div><div[^>]*class="sv-metric-value sv-num"[^>]*>([^<]*)</) || [])[1]
if (/^¥/.test(unpricedCard || '')) {
  fail(`一笔都算不出时不得显示金额（更不能是 ¥0，那读起来是"免费"），实际 ${unpricedCard}`)
}
if (unpricedCard !== '不可估算') {
  fail(`应显示「不可估算」，实际 ${unpricedCard}`)
}
// 光说"不可估算"跟"投影还没就绪"看起来一样——必须把原因和量级一起给出。
if (!unpricedVerdict.includes('276.5M') || !unpricedVerdict.includes('未计价')) {
  fail(`「不可估算」必须说清原因与量级（期望含 276.5M + 未计价）; region=${unpricedVerdict}`)
}
ok('费用：一笔都算不出时显示「不可估算」+ 未计价量级，不显示 ¥0（¥0 只留给真的零请求）')

// 上游的量**不进主数值，但必须在展开详情里说清楚**——只说"本会话 ¥0"而不
// 说上游烧了多少，用户会以为数据坏了（core pre_fork_usage 的模块注释同一动机）。
if (!forkVerdict.includes('分叉前')) fail('分叉一致性：展开详情应给出"分叉前（上游已消耗）"')
if (!forkVerdict.includes('本会话实际产生')) fail('分叉一致性：展开详情应与上游并排给出"本会话实际产生"')
if (!forkVerdict.includes(money(680.36))) {
  fail(`分叉一致性：展开详情应给出上游实际金额 ${money(680.36)}; region=${forkVerdict}`)
}
if (!forkVerdict.includes('420384')) fail('分叉一致性：应给出分叉边界 seq，便于用户自己核对')
ok('分叉一致性：展开详情并排给出「分叉前上游已消耗」与「本会话实际产生」+ 边界 seq')

// 上下文是**存量**，与费用/Token（流量）性质相反：分叉把上游历史整段拷进新
// 会话的上下文，第一个请求就带着它发出去。所以还没发请求时，正确答案不是
// "不可用"，而是"继承了多少"——这是分叉会话最该先看到的数。
const forkCtxCard = (forkVerdict.match(/上下文峰值<\/div><div[^>]*class="sv-metric-value sv-num"[^>]*>([^<]*)</) || [])[1]
if (forkCtxCard === '不可用') {
  fail('分叉一致性：上下文是存量会随分叉继承，还没发请求时应显示继承值而不是"不可用"')
}
if (!/812\.4K/.test(forkCtxCard || '')) {
  fail(`分叉一致性：上下文卡应显示继承的 812.4K，实际 ${forkCtxCard}`)
}
// **最关键的一条**：继承的上下文（812.4K）与上游累计花费（277.2M）差着数量级，
// 拿错会把 81% 的占用显示成 27700%。
if (/277\.2M/.test(forkCtxCard || '')) {
  fail('分叉一致性：上下文卡拿成了上游累计花费（277.2M）——那是流量不是存量，差着数量级')
}
if (!forkVerdict.includes('81.2%')) {
  fail(`分叉一致性：应给出继承占比 81.2%（812.4K / 1M）; region=${forkVerdict}`)
}
if (!forkVerdict.includes('尚未发出请求')) {
  fail('分叉一致性：必须标明这是继承来的起点、不是本会话测出的峰值，否则会被读成"本会话已占 81%"')
}
ok('分叉一致性：上下文卡显示继承起点 812.4K / 1M（81.2%），且不与上游累计花费 277.2M 混用')

// 对照组：**没分叉的会话一个字都不该提分叉**——否则每个普通会话都会平白
// 多出一段看不懂的说明。forked:false 与"分叉了但上游是 0"是两回事。
const noForkHtml = renderToStaticMarkup(React.createElement(AuditView, {
  useProjection: projectionOf({ ...big, preFork: { forked: false, boundary_seq: null, tokens: null, cost: null, inherited_context: null, inherited_window: null, status: 'complete', missingFields: [] } }),
}))
if (extractRegion(noForkHtml, 'data-audit-verdict').includes('分叉前')) {
  fail('对照组：没分叉的会话不该出现任何分叉口径说明')
}
ok('对照组：未分叉会话不出现分叉说明（forked:false ≠ 上游为 0）')

// 缺 context_tokens 的行必须"留缺口并说出来"，不是悄悄按全量算。
if (!verdictRegion.includes('3 / 4')) {
  fail(`P1: 4 行里有 1 行缺 context_tokens，展开说明应报出 3 / 4; region=${verdictRegion}`)
}
if (!verdictRegion.includes('context_tokens')) {
  fail(`P1: 应点名缺的是哪个字段; region=${verdictRegion}`)
}
ok('P1 结论区：缺字段的请求行不参与峰值，且在展开说明里报出 3 / 4 的缺口')

// 没有 requestMetrics 投影时（老宿主 / 投影未就绪）：报"不可用"，不能编一个
// 百分比出来，也不能整个结论区崩掉。
const noRm = { ...big, requests: undefined }
const htmlNoRm = renderToStaticMarkup(React.createElement(AuditView, { useProjection: projectionOf(noRm) }))
const noRmRegion = extractRegion(htmlNoRm, 'data-audit-verdict')
if (noRmRegion === null) fail('P1: 没有 requestMetrics 时结论区不该消失')
if (!noRmRegion.includes('不可用')) {
  fail(`P1: 没有 requestMetrics 时上下文峰值应报"不可用"; region=${noRmRegion}`)
}
// 只看**上下文那张卡**：费用卡的高峰/缓存占比来自 cost_report，与
// requestMetrics 无关，早先那条"整个结论区不得出现百分比"的断言写宽了。
const ctxCard = (noRmRegion.match(/上下文峰值<\/div>[\s\S]*?<\/div><\/div>/) || [''])[0]
if (/\d+(\.\d+)?%/.test(ctxCard)) {
  fail(`P1: 拿不到 requestMetrics 时上下文卡不得出现百分比（那会是编的）; card=${ctxCard}`)
}
ok('P1 结论区：拿不到 requestMetrics 时报「不可用」，不编百分比')

// --- P1-02 KPI 钻取 ---------------------------------------------------------
// big fixture 四项数据都齐（费用/Token/上下文/异常），四张卡都应该钻取得
// 到——渲染成真实 <button>，而不是原来纯展示的 <div>。
const drillBtnCount = (verdictRegion.match(/class="sv-metric sv-metric-btn"/g) || []).length
if (drillBtnCount !== 4) {
  fail(`P1-02: 数据齐全时四张 KPI 卡都应可钻取（真实 <button>），实际 ${drillBtnCount} 张; region=${verdictRegion}`)
}
// aria-label 必须描述钻取目标而不是重复卡片上的数字，且四张卡互不相同——
// PRD §11"行操作具有唯一名称"同一条纪律，套用到 KPI 卡上。
for (const label of ['查看费用构成', '查看 Token 用量时间线', '查看上下文占用时间线与构成', '查看异常 finding 列表']) {
  if (!verdictRegion.includes('aria-label="' + label + '"')) {
    fail(`P1-02: 缺唯一 aria-label「${label}」; region=${verdictRegion}`)
  }
}
// 低权重 chevron——每张可钻取的卡都要有"查看详情 →"这个可见入口。
const chevronCount = (verdictRegion.match(/查看详情 →/g) || []).length
if (chevronCount !== 4) fail(`P1-02: 低权重 chevron 应出现 4 次，实际 ${chevronCount}`)
// 数值本身不能只塞进 aria-label 丢给读屏软件、可见文字里却没有——aria-label
// 只描述"去哪"，数字用 aria-describedby 挂回卡片自己的 value 节点，两者都要
// 拿得到，不是二选一。
if (!/aria-describedby="sv-metric-v-m-cost"/.test(verdictRegion)) {
  fail('P1-02: 费用卡钻取按钮应通过 aria-describedby 关联回数值节点')
}
ok('P1-02 四张 KPI 卡：数据齐全时均可钻取（真实按钮 + 唯一 aria-label + 可见 chevron + aria-describedby 关联数值）')

// 目标区块必须真的有对应 id，钻取的 scrollIntoView 才有落点。
for (const id of ['sv-section-cost', 'sv-section-timeline', 'sv-section-findings']) {
  if (!htmlVerdict.includes('id="' + id + '"')) fail(`P1-02: 钻取目标缺 id="${id}"，滚动定位没有落点`)
}
ok('P1-02 三个钻取目标区块（费用/时间线/findings）都有稳定的 DOM id')

// 数据不可用时**不得**钻取——没有 requestMetrics 就没有时间线可去，Token/
// 上下文两张卡应该退回原来的纯展示 <div>，不能让用户点了没反应。费用/异常
// 两张卡跟 requestMetrics 无关，应该照常可钻取。
// 直接抓"紧贴在 label div 前面那个包装标签"，不靠字符数窗口猜边界——label
// div 是每张卡 body 数组的第一个子节点，包装标签的 `>` 后面就是它，中间不
// 会插进上一张卡的任何内容。
const wrapperOf = (html, label) => (html.match(new RegExp('<(button|div)[^>]*>\\s*<div class="sv-metric-label">' + label + '</div>')) || [])[1]
const tokTag = wrapperOf(noRmRegion, 'Token 用量')
const ctxTag = wrapperOf(noRmRegion, '上下文峰值')
const costTag = wrapperOf(noRmRegion, '费用估算')
const anomalyTag = wrapperOf(noRmRegion, '异常')
if (tokTag !== 'div' || ctxTag !== 'div') {
  fail(`P1-02: 没有 requestMetrics 时 Token/上下文卡应退回纯展示 div，实际 tok=${tokTag} ctx=${ctxTag}`)
}
if (costTag !== 'button' || anomalyTag !== 'button') {
  fail(`P1-02: 费用/异常两张卡跟 requestMetrics 无关，应该照常可钻取，实际 cost=${costTag} anomaly=${anomalyTag}`)
}
ok('P1-02 数据不可用时对应 KPI 卡退回纯展示、不可钻取，不给用户点了没反应的假按钮')

// --- P1-05 KPI 卡内联展开面板 ------------------------------------------------
// 四个面板初始都是 hidden（detail 初始值为 null），但内容照样要渲染进
// markup——跟 .sv-fdetail/.sv-detail 现有那套"hidden 不是不存在"的纪律
// 一致，静态快照断言得到，不需要真的模拟一次点击。
if (!/class="sv-detail" hidden/.test(verdictRegion)) {
  fail('P1-05: 内联展开面板应以 hidden 属性渲染，而不是整块不存在')
}
const detailPanelCount = (verdictRegion.match(/class="sv-detail" hidden/g) || []).length
if (detailPanelCount !== 4) fail(`P1-05: 应有 4 个内联展开面板（费用/Token/上下文/异常），实际 ${detailPanelCount}`)

// 费用面板：逐模型金额 + 高峰占比，数字与成本表用的是同一份 bigCost。
for (const [model, c] of Object.entries(bigCost.per_model)) {
  if (!verdictRegion.includes(money(c.total))) {
    fail(`P1-05: 费用内联面板应包含模型 ${model} 的金额 ${money(c.total)}; region=${verdictRegion}`)
  }
}
if (!verdictRegion.includes('估算，不是账单')) fail('P1-05: 费用内联面板应带「估算，不是账单」声明')

// Token 面板：四个类别分别列出（未上报的字段显示"未上报"，不是 0）。
if (!verdictRegion.includes('缓存写')) fail('P1-05: Token 内联面板应逐类别列出（含缓存写）')

// 上下文面板：计算方法说明 + 常驻前缀构成三行（P1-02 backlog 原话"同时展开
// 常驻前缀构成与计算方法"）——big fixture 的 composition 是 (1813,7646,2774)。
if (!verdictRegion.includes('系统提示词') || !verdictRegion.includes('工具定义') || !verdictRegion.includes('技能目录')) {
  fail('P1-05: 上下文内联面板应给出常驻前缀构成三行，不只是计算方法文字')
}
if (!verdictRegion.includes('1.8K') && !verdictRegion.includes('1813')) {
  fail('P1-05: 上下文内联面板的系统提示词数值应该是真算出来的，不是占位')
}

// 异常面板：Top 3（big fixture 只有 3 条去重后的 finding，不多不少)。
if (!verdictRegion.includes('最严重的 3 条')) fail(`P1-05: 异常内联面板应给出"最严重的 N 条"标题; region=${verdictRegion}`)
ok('P1-05 四张 KPI 卡的内联展开面板：费用逐模型 / Token 逐类别 / 上下文构成+计算方法 / 异常 Top 3，内容真算出来而非占位')

// --- P1-06 页面五个一级区块 --------------------------------------------------
// big-session 数据齐全（费用/Token/时间线/构成/浪费/子代理/finding 都有），
// 五个一级标题应该都在，且严格按"概览 → 时间线 → 执行拓扑与能力调用 →
// 归因与优化线索 → Finding 队列"的顺序出现——这条顺序本身就是 Dashboard
// "概览→定位→解释→证据"的信息路径，乱序等于路径断了。
//
// P2-01（真实审计 2026-08-25 发现）：原本四个区块，"执行拓扑与能力调用"
// 是从"上下文归因与优化线索"里拆出来的第五个——子代理/Skill/执行时长回答
// 的是"调了什么能力"，不是"token 去哪了"，硬凑在同一个标题下语义不通。
const page = renders[0]
const sectionTitles = ['会话资源概览', '会话健康时间线', '执行拓扑与能力调用', '上下文归因与优化线索', '发现 · 3 条']
const positions = sectionTitles.map(text => page.indexOf('<h2 class="sv-section-title">' + text + '</h2>'))
positions.forEach((pos, i) => {
  if (pos < 0) fail(`P1-06: 一级区块标题「${sectionTitles[i]}」缺失或未用 <h2 class="sv-section-title">; page 片段=${page.slice(0, 200)}`)
})
for (let i = 1; i < positions.length; i++) {
  if (positions[i] <= positions[i - 1]) {
    fail(`P1-06: 一级区块顺序不对——「${sectionTitles[i]}」应该出现在「${sectionTitles[i - 1]}」之后; positions=${positions}`)
  }
}
ok('P1-06 五个一级区块标题齐全，且按"概览→时间线→执行拓扑→归因与优化线索→Finding 队列"顺序出现')

// 子代理 / Skill 执行 / 执行时长三者归入"执行拓扑与能力调用"，常驻前缀构成 /
// 结构性浪费两者归入"上下文归因与优化线索"——各自一张 .sv-subcard（弱背景
// + 圆角，不叠阴影），按区块切片各自数，不是笼统数全页 5 张就算过（P2-01
// 拆分之后，"是不是拆对了组"本身就是这条断言要验的事，全页合计 5 张验证
// 不出拆错组的情况）。
const execTopoRegionP106 = page.slice(positions[2], positions[3])
const execTopoSubcards = (execTopoRegionP106.match(/class="sv-subcard"/g) || []).length
if (execTopoSubcards !== 3) {
  fail(`P1-06: "执行拓扑与能力调用"应含 3 张 .sv-subcard（子代理/Skill/执行时长），实际 ${execTopoSubcards}`)
}
const contextRegionP106 = page.slice(positions[3], positions[4])
const contextSubcards = (contextRegionP106.match(/class="sv-subcard"/g) || []).length
if (contextSubcards !== 2) {
  fail(`P1-06: "上下文归因与优化线索"应含 2 张 .sv-subcard（构成/浪费），实际 ${contextSubcards}`)
}
ok('P1-06 执行拓扑（子代理/Skill/执行时长）与上下文归因（构成/浪费）各归各的区块，各自一张 .sv-subcard，不再混在一起')

// Finding 队列在 pending / clean 两态下也要有区块边界（不是只在有数据时才
// 冒出来一块）——pending 态用静态标题，clean 态用"发现 · 0 条"。
const pendingHtml = renderToStaticMarkup(React.createElement(AuditView, {
  useProjection: (key) => key === 'behaviorFindings' ? undefined : projectionOf(big)(key),
}))
if (!pendingHtml.includes('<h2 class="sv-section-title">Finding 队列</h2>')) {
  fail('P1-06: findings 投影未就绪（pending）时 Finding 队列区块应仍有标题')
}
const cleanDs = { ...big, findings: [], waste: wasteOf([]) }
const cleanHtml = renderToStaticMarkup(React.createElement(AuditView, { useProjection: projectionOf(cleanDs) }))
if (!cleanHtml.includes('<h2 class="sv-section-title">发现 · 0 条</h2>')) {
  fail('P1-06: 无异常（clean）时 Finding 队列区块标题应该是「发现 · 0 条」，不是整块消失')
}
ok('P1-06 Finding 队列区块在 pending/clean/列表三态下都有一致的标题边界')

// --- P2 成本明细表 ---------------------------------------------------------
const costRegion = extractRegion(htmlVerdict, 'data-audit-cost')
if (costRegion === null) fail('P2: 成本区没渲染')
for (const col of ['未命中输入', '命中缓存', '输出', '高峰占比', '小计']) {
  if (!costRegion.includes(col)) fail(`P2: 成本表缺列「${col}」; region=${costRegion}`)
}
// big-session 两个模型各一行
const bodyRows = (costRegion.match(/<tr/g) || []).length - 1 // 减去表头那行
if (bodyRows !== 2) fail(`P2: 成本表应逐模型一行（期望 2 行），实际 ${bodyRows}; region=${costRegion}`)
ok('P2 成本表：五列齐全，逐模型一行')

// **全页只有一处总费用**：总额只在结论区出现，成本表里不得重复打印它。
const totalMoney = costReportOf(big.byModel).total
const totalStr = '¥' + (totalMoney >= 100 ? totalMoney.toFixed(1) : totalMoney.toFixed(2)).replace(/\.0+$/, '')
if (costRegion.includes(totalStr)) {
  fail(`P2: 成本表重复打印了总费用 ${totalStr}——全页只应有一处总额（结论区）; region=${costRegion}`)
}
if (!verdictRegion.includes(totalStr)) fail(`P1: 结论区应给出总费用 ${totalStr}`)
ok(`P2 全页只有一处总费用（${totalStr} 只在结论区出现）`)

// 缓存命中率洞察：这张表真正要说的话。¥ 总额本身不可操作，命中率才指向动作。
if (!costRegion.includes('缓存命中率')) fail(`P2: 缺缓存命中率洞察; region=${costRegion}`)
ok('P2 成本表：带出缓存命中率洞察，而不只是一堆数字')

// 口径必须写在明处：子代理跑在独立会话里，用量不在这份数据内。实测
// session-e4b0be69 少算 5.9%（父 ¥1113.66 / 5 个子会话另有 ¥69.74）。
// 不声明就是在假装这个数字是全账。
if (!costRegion.includes('仅本会话') || !costRegion.includes('subagent')) {
  fail(`P2: 成本区必须声明口径（仅本会话、不含 subagent）; region=${costRegion}`)
}
ok('P2 成本表：显式声明口径为「仅本会话、不含子代理」，总额是下限而非全账')

// 回落到原厂报价时**必须点名说出来**——一个按别家价估出来的数字，不说清楚就
// 是在冒充实价（用户明确要求：可以用原厂价估，但文案要讲明是原厂报价）。
const fbCost = {
  ...costReportOf(big.byModel),
}
fbCost.per_model = Object.fromEntries(Object.entries(fbCost.per_model).map(([m, v], i) =>
  [m, { ...v, provider: 'nowhere-inc', pricing_basis: i === 0 ? 'fallback' : 'provider', priced_with: i === 0 ? 'deepseek-official' : 'nowhere-inc' }]))
const fbHtml = renderToStaticMarkup(React.createElement(AuditView, {
  useProjection: (key) => key === 'costReport' ? fbCost : projectionOf(big)(key),
}))
const fbRegion = extractRegion(fbHtml, 'data-audit-cost')
if (!fbRegion.includes('原厂报价')) {
  fail(`回落计价必须写明「按原厂报价估算」，否则是拿别家的价冒充实价; region=${fbRegion}`)
}
// 只点名真正回落的那一个，不把所有模型都算进去。
const fbFirst = Object.values(fbCost.per_model)[0]
if (!fbRegion.includes(fbFirst.short_name)) {
  fail('回落说明必须点名是哪个模型')
}
// 供应商随行显示——只给模型名的话这张表跟任何一家的账单都对不上。
if (!fbRegion.includes('nowhere-inc')) fail('成本表每行应带出供应商')
ok('P2 成本表：回落原厂报价时点名说明「按原厂报价估算」，且每行带出供应商')

// 对照组：**每一行都用了该供应商自己的报价**时不该出现这句，否则每张表都平白
// 多一行看不懂的免责。注意默认夹具模拟的是「provider 未上报」——那按语义就是
// 回落（我们在拿原厂价当默认假设），所以对照组必须显式造一个 basis=provider
// 的报告，不能拿默认夹具当对照。
const ownCost = { ...costReportOf(big.byModel) }
ownCost.per_model = Object.fromEntries(Object.entries(ownCost.per_model).map(([m, v]) =>
  [m, { ...v, provider: 'shengsuanyun', pricing_basis: 'provider', priced_with: 'shengsuanyun' }]))
const noFbHtml = renderToStaticMarkup(React.createElement(AuditView, {
  useProjection: (key) => key === 'costReport' ? ownCost : projectionOf(big)(key),
}))
if (extractRegion(noFbHtml, 'data-audit-cost').includes('原厂报价')) {
  fail('对照组：每行都用了自家报价时不该出现「按原厂报价估算」')
}
ok('对照组：全部按自家报价计价时不出现原厂报价说明，不恒常占版面')

// 覆盖率 100% 时不出现覆盖率行（恒真的信息是零信息，只会稀释版面）。
if (costRegion.includes('计价覆盖率')) {
  fail(`P2: 全部模型都计价时不该出现「计价覆盖率」行; region=${costRegion}`)
}
// 反向：有未知模型时必须出现，且要说清有多少 token 没计进去。
const unknownDs = {
  ...big,
  byModel: { by_model: { ...big.byModel.by_model, 'mystery-model': bucket(5e6, 1e3, 0, 0) }, sequence: big.byModel.sequence },
}
const htmlUnknown = renderToStaticMarkup(React.createElement(AuditView, { useProjection: projectionOf(unknownDs) }))
const unknownRegion = extractRegion(htmlUnknown, 'data-audit-cost')
if (!unknownRegion.includes('计价覆盖率')) {
  fail(`P2: 存在未计价模型时必须报出覆盖率; region=${unknownRegion}`)
}
if (!unknownRegion.includes('5M')) {
  fail(`P2: 覆盖率行应说清有多少 token 没计进去; region=${unknownRegion}`)
}
ok('P2 成本表：覆盖率 100% 时隐藏，有未计价模型时报出缺口')

// --- T4 标记按会话隔离（PRD §5.1 / AC-02）---------------------------------
// 曾经的真实缺陷：markKey 只用 [rule, evidence]，localStorage 又是单一全局键。
// 后果是 A 会话里标记「已忽略」的 finding，在 B 会话里凭同样的 rule+evidence
// **静默继承**——用户从没看过 B 的那条，却已经被自己「处理」掉了。这不是 V2
// 的功能缺口，是当时就错的行为，所以用一条测试钉死，而不是只改代码。
//
// 构造：同一条 rule+evidence，分别属于两个 session。只标记 A 的那条。
const EVID = 'rm -rf /tmp/shared'
const dsA = {
  findings: [mkFinding('SV601', 'critical', EVID, 5, 'sess-a')],
  usage: {}, byModel: { by_model: {}, sequence: [], unreported_fields: [] },
}
const dsB = {
  findings: [mkFinding('SV601', 'critical', EVID, 5, 'sess-b')],
  usage: {}, byModel: { by_model: {}, sequence: [], unreported_fields: [] },
}

const NOTE_A = '这条我确认过：清理的是临时构建目录'
__notes = { [mk('SV601', EVID, 'sess-a')]: { text: NOTE_A, updatedAt: 0 } }
const htmlA = renderToStaticMarkup(React.createElement(AuditView, { useProjection: projectionOf(dsA) }))
const htmlB = renderToStaticMarkup(React.createElement(AuditView, { useProjection: projectionOf(dsB) }))
__notes = {}

if (!htmlA.includes(NOTE_A)) fail('AC-02: session A 自己的备注没渲染——同会话内备注必须照常工作')
// B：**必须不继承**。用户从没看过 B 的那条，不该已经"有了自己的判断"。
if (htmlB.includes(NOTE_A)) {
  fail('AC-02: session B 继承了 session A 的备注——备注跨会话泄漏')
}
// 且 B 里那条 critical 仍是 critical、仍在原位（AC-02 末句）。
const bRegion = extractRegion(htmlB, 'data-audit-findings')
if (!bRegion.includes('SV601') || !bRegion.includes('✕')) {
  fail(`AC-02: session B 的 critical finding 应保持原严重度; region=${bRegion}`)
}
ok('AC-02 备注按 sessionId 隔离：A 有备注，B 同 rule+evidence 不继承且严重度不变')

console.log('\n[verify-render] ALL CHECKS PASSED — AuditView mounts, its useState branch renders under real React, and 设计原则 T2/AC-01/AC-02/FR-07/FR-10 hold')
