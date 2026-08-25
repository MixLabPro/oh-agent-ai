// FR-12 导出内容的直接断言。
//
// P0-02 修的是「点了没反应」——`window.open('', '_blank')` 写个 `<pre>` 根本
// 不是下载，失败也不吭声。落地部分（真下载/剪贴板兜底）碰 Blob/DOM，测不了
// 也不该硬测；但**组装导出内容**是纯函数（buildExportPayload），可以直接下
// 断言：FR-12 的字段契约、AC-01 的去重口径、"不得省略估算假设和缺失字段"，
// 都是这里出的错就出在这一层。
//
//   node scripts/verify-export.mjs

import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import React from 'react'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function fail(msg) {
  console.error(`\n[verify-export] FAIL: ${msg}`)
  process.exitCode = 1
  throw new Error(msg)
}
function ok(msg) { console.log(`[verify-export] ok: ${msg}`) }

const code = readFileSync(resolve(root, 'lib/client.cjs'), 'utf8')
let handoff
globalThis.window = globalThis
globalThis.window.__ModuleLoader__ = { load: (h) => { handoff = h } }
new Function(code)()
const exports_ = handoff.factory((s) => (s === 'react' ? React : undefined))
const pure = exports_.__pure
if (!pure || typeof pure.buildExportPayload !== 'function') fail('__pure.buildExportPayload 没导出')
if (typeof pure.redactPath !== 'function') fail('__pure.redactPath 没导出')
const { buildExportPayload, redactPath } = pure

const ROWS = [
  { key: 'k1', rule: 'SV601', severity: 'critical', category: 'x', tool_name: 'bash',
    evidence: 'rm -rf /tmp/a', count: 1, seqs: [10], turn: 7, step: 1, call_id: 'c1' },
  // SV610 ×2：occurrence，不是两条 finding——count/seqs 已经把两次合并了。
  { key: 'k2', rule: 'SV610', severity: 'warning', category: 'approval', tool_name: 'bash',
    evidence: 'allowed-once', count: 2, seqs: [20, 21], turn: 9, step: 2, call_id: 'c2' },
  { key: 'k3', rule: 'SV-COST-02', severity: 'info', category: 'cost', tool_name: 'read',
    evidence: '失败区间上下文增长', count: 1, seqs: [30], turn: 12, step: 1, call_id: 'c3',
    waste_tokens: 1964, suggestion: '确认失败原因' },
]
const NOTES = { k1: { text: '这条我确认过，是我自己跑的清理脚本', updatedAt: 1700000000000 } }

// ── 1. FR-12 + T10 + D10 + 阶段A-5 + 阶段B-3 的十四个键一个不少 ────────────
// T10（backlog FR-SK-09）给 ExportPayload 加了 `skill` 键（十个→十一个），
// D10（DURATION_AUDIT_BACKLOG.md）又加了 `duration` 键（十一个→十二个），
// 阶段 A-5（真实审计 2026-08-25 AC-12）再加 `pathsRedacted` 键（十二→十三），
// 阶段 B-3 再加 `skillAttribution` 键（十三→十四）——加字段时忘了把这条
// 断言一起挪，会让"契约外多余键"和"真的漏了一个键"两种情况看起来一样，
// 所以每次加键两边都要跟着改（T10 当时就漏过一次）。
{
  const p = buildExportPayload({
    rows: ROWS, notes: NOTES, sessionId: 'sess-1', nowIso: '2026-08-22T12:00:00.000Z',
    usage: { by_model: {} }, costEstimate: null, skillAudit: null, skillAttribution: null, durationAudit: null,
    assumptions: ['a1'], missingFields: [], cwd: null,
  })
  const want = ['sessionId', 'exportedAt', 'pathsRedacted', 'ruleVersion', 'findings', 'reviews', 'usage',
    'costEstimate', 'pricingVersion', 'skill', 'skillAttribution', 'duration', 'assumptions', 'missingFields']
  for (const k of want) if (!(k in p)) fail(`导出缺契约要求的键「${k}」`)
  if (Object.keys(p).length !== want.length) {
    fail(`导出键数应为 ${want.length}，实际 ${Object.keys(p).length}：${Object.keys(p)}——多出的键不在契约里`)
  }
  ok('FR-12 + T10 + D10 + 阶段A-5 + 阶段B-3 十四个键一个不少，也没有契约之外的键')
}

// ── 1d. 阶段B-3：skillAttribution 原样透传，不在导出层重新计算或裁剪 ───────
{
  const skillAttribution = [{ seq: 10, findings: 1, tool_calls: 3, tokens: 500, cost: 0.02 }]
  const p = buildExportPayload({
    rows: [], notes: {}, sessionId: 's', nowIso: '2026-08-22T00:00:00.000Z',
    usage: {}, costEstimate: null, skillAudit: null, skillAttribution, durationAudit: null,
    assumptions: [], missingFields: [],
  })
  if (p.skillAttribution !== skillAttribution) {
    fail('skillAttribution 应原样透传 skillAttribution 投影（引用相等），不在导出层重算')
  }
  ok('阶段B-3：skillAttribution 原样透传 skillAttribution 投影')
}

// ── 1b. T10：skill 原样透传，不在导出层重新计算或裁剪 ─────────────────────
{
  const skillAudit = { invocations: [{ name: 'foo', trigger_mode: 'explicit' }], sessions_discovered: 2 }
  const p = buildExportPayload({
    rows: [], notes: {}, sessionId: 's', nowIso: '2026-08-22T00:00:00.000Z',
    usage: {}, costEstimate: null, skillAudit, durationAudit: null, assumptions: [], missingFields: [],
  })
  if (p.skill !== skillAudit) fail('skill 应原样透传 skillAudit 投影（引用相等），不在导出层重算')
  ok('T10：skill 原样透传 skillAudit 投影')
}

// ── 1c. D10：duration 原样透传，不在导出层重新计算或裁剪 ───────────────────
{
  const durationAudit = { tool_calls: [{ call_id: 'c1', duration_ms: 18 }], turns: [], steps: [], approvals: [] }
  const p = buildExportPayload({
    rows: [], notes: {}, sessionId: 's', nowIso: '2026-08-22T00:00:00.000Z',
    usage: {}, costEstimate: null, skillAudit: null, durationAudit, assumptions: [], missingFields: [],
  })
  if (p.duration !== durationAudit) fail('duration 应原样透传 durationAudit 投影（引用相等），不在导出层重算')
  ok('D10：duration 原样透传 durationAudit 投影')
}

// ── 2. AC-01 口径：occurrence 不再被当成独立 finding ─────────────────────
{
  const p = buildExportPayload({
    rows: ROWS, notes: {}, sessionId: 's', nowIso: '2026-08-22T00:00:00.000Z',
    usage: {}, costEstimate: null, assumptions: [], missingFields: [],
  })
  if (p.findings.length !== 3) fail(`导出的 finding 数应等于去重后的行数 3，实际 ${p.findings.length}`)
  const sv610 = p.findings.find(f => f.rule === 'SV610')
  if (sv610.occurrences !== 2 || JSON.stringify(sv610.seqs) !== '[20,21]') {
    fail(`SV610 的两次 occurrence 应体现在 occurrences/seqs 上，不是拆成两条 finding`)
  }
  ok('导出条数与页面显示的去重口径一致（AC-01），occurrence 只在 occurrences/seqs 里')
}

// ── 3. 不编版本号 ─────────────────────────────────────────────────────────
{
  const p = buildExportPayload({
    rows: [], notes: {}, sessionId: 's', nowIso: '2026-08-22T00:00:00.000Z',
    usage: {}, costEstimate: null, assumptions: [], missingFields: [],
  })
  if (p.ruleVersion !== null) fail(`ruleVersion 应为 null（没有真实版本号来源），实际 ${JSON.stringify(p.ruleVersion)}`)
  if (p.pricingVersion !== null) fail(`pricingVersion 应为 null，实际 ${JSON.stringify(p.pricingVersion)}`)
  ok('ruleVersion/pricingVersion 没有真实来源时为 null，不编一个出来')
}

// ── 4. 备注同时体现在 findings[].note 与独立的 reviews ────────────────────
{
  const p = buildExportPayload({
    rows: ROWS, notes: NOTES, sessionId: 's', nowIso: '2026-08-22T00:00:00.000Z',
    usage: {}, costEstimate: null, assumptions: [], missingFields: [],
  })
  const k1 = p.findings.find(f => f.rule === 'SV601')
  if (k1.note !== NOTES.k1.text) fail('findings[].note 应带出备注文本')
  if (p.reviews.length !== 1 || p.reviews[0].note !== NOTES.k1.text) {
    fail(`reviews 应独立列出有备注的那条，实际 ${JSON.stringify(p.reviews)}`)
  }
  if (p.reviews[0].updatedAt !== NOTES.k1.updatedAt) fail('reviews 应带出备注的更新时间')
  // 没有备注的行 note 必须是 null，不是空字符串——两者语义不同。
  const k2 = p.findings.find(f => f.rule === 'SV610')
  if (k2.note !== null) fail(`没有备注的行 note 应为 null，实际 ${JSON.stringify(k2.note)}`)
  ok('备注体现在 findings[].note 与独立的 reviews 两处，无备注的行 note 为 null 不是空串')
}

// ── 5. missingFields 去重 ─────────────────────────────────────────────────
{
  const p = buildExportPayload({
    rows: [], notes: {}, sessionId: 's', nowIso: '2026-08-22T00:00:00.000Z',
    usage: {}, costEstimate: null, assumptions: [],
    missingFields: ['context.system_tokens', 'context.system_tokens', 'cost.unpriced_tokens'],
  })
  if (p.missingFields.length !== 2) {
    fail(`重复的字段名应去重，期望 2 个，实际 ${p.missingFields.length}：${p.missingFields}`)
  }
  ok('missingFields 去重——同一字段被多个投影各报一次时，导出里只列一次')
}

// ── 6. exportedAt 原样传入，不在纯函数内部取时间 ──────────────────────────
{
  const p = buildExportPayload({
    rows: [], notes: {}, sessionId: 's', nowIso: '2026-08-22T09:30:00.000Z',
    usage: {}, costEstimate: null, assumptions: [], missingFields: [],
  })
  if (p.exportedAt !== '2026-08-22T09:30:00.000Z') fail('exportedAt 应原样使用调用方传入的 nowIso')
  ok('exportedAt 由调用方传入（纯函数本身不碰时钟），可重放、可直接下断言')
}

// ── 7. redactPath：工作区根路径替换，非正则、cwd 为空原样返回 ──────────────
{
  const cwd = '/Users/dev/projects/skill-vitals'
  if (redactPath(`写入 ${cwd}/src/foo.ts`, cwd) !== '写入 <workspace>/src/foo.ts') {
    fail('redactPath 应把 evidence 里的工作区根路径整体替换成 <workspace>')
  }
  if (redactPath('没有路径的文本', cwd) !== '没有路径的文本') {
    fail('redactPath 不应改动不含 cwd 的文本')
  }
  if (redactPath(`两次出现：${cwd}/a 和 ${cwd}/b`, cwd) !== '两次出现：<workspace>/a 和 <workspace>/b') {
    fail('redactPath 应替换所有出现次数，不止第一次')
  }
  // cwd 为空（未知）时原样返回，不臆造占位符。
  if (redactPath(`写入 ${cwd}/src/foo.ts`, '') !== `写入 ${cwd}/src/foo.ts`) {
    fail('redactPath 在 cwd 为空时应原样返回文本，不做替换')
  }
  // cwd 带正则特殊字符时也要按字面量整体匹配，不能被当成正则解释。
  const weirdCwd = '/Users/x.y+z(1)/proj'
  if (redactPath(`见 ${weirdCwd}/file`, weirdCwd) !== '见 <workspace>/file') {
    fail('redactPath 对带正则特殊字符的 cwd 应按字面量匹配，不是当正则解释')
  }
  ok('redactPath：按字面量整体替换全部出现，cwd 为空时原样返回')
}

// ── 8. pathsRedacted：诚实反映"这次导出有没有可替换的锚点" ──────────────────
{
  const cwd = '/Users/dev/projects/skill-vitals'
  const rowsWithPath = [
    { key: 'k1', rule: 'SV604', severity: 'warning', category: 'x', tool_name: 'write',
      evidence: `写入 ${cwd}/dist/out.js`, count: 1, seqs: [1], turn: 1, step: 1, call_id: 'c1' },
  ]
  const withCwd = buildExportPayload({
    rows: rowsWithPath, notes: {}, sessionId: 's', nowIso: '2026-08-22T00:00:00.000Z',
    usage: {}, costEstimate: null, skillAudit: null, durationAudit: null,
    assumptions: [], missingFields: [], cwd,
  })
  if (withCwd.pathsRedacted !== true) fail('cwd 已知时 pathsRedacted 应为 true')
  if (withCwd.findings[0].evidence !== '写入 <workspace>/dist/out.js') {
    fail(`已知 cwd 时 findings[].evidence 应替换工作区根路径，实际 ${withCwd.findings[0].evidence}`)
  }

  const withoutCwd = buildExportPayload({
    rows: rowsWithPath, notes: {}, sessionId: 's', nowIso: '2026-08-22T00:00:00.000Z',
    usage: {}, costEstimate: null, skillAudit: null, durationAudit: null,
    assumptions: [], missingFields: [], cwd: null,
  })
  if (withoutCwd.pathsRedacted !== false) fail('cwd 未知（null）时 pathsRedacted 应诚实报 false，不是悄悄跳过')
  if (withoutCwd.findings[0].evidence !== `写入 ${cwd}/dist/out.js`) {
    fail('cwd 未知时 evidence 应原样保留，不做替换')
  }
  ok('pathsRedacted 如实反映本次导出是否有可替换的工作区根路径锚点')
}

console.log('\n[verify-export] ALL CHECKS PASSED — FR-12 导出内容完整、口径一致、不编造版本号')
