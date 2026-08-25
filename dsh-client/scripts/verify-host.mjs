// Host-half verification: proves the projections the audit plugin registers fold
// raw events with the correct attribution:
//   - behaviorFindings — through the wasm with the session cwd (SV605 workspace-aware).
//   - tokenByModel — usage events bucketed against the model active at the time
//     (from `request/header`), with token-meter-identical dedup semantics, plus
//     the model-switch sequence.
// Unlike verify.mjs (zero-dep), this one imports `index.js`, so it needs `zod`:
//
//   cd dsh-client && npm install --legacy-peer-deps
//   node scripts/verify-host.mjs
//
// The mock `ctx.sessionProjections` replicates the two build paths that matter
// from the real `dsh-session-projection` registry (see its src/index.ts):
//   - `drive()` (live path): one `session/event` fires per new event, our own
//     cwd-capture hook runs first (registered before .register()), so `apply`
//     can read `activeSessionId` when it builds a session's cell for the first
//     time.
//   - `cellFor → buildCell` (cold path): `snapshot(session)` folds a session's
//     *entire* `session.events` in one synchronous pass, with **no**
//     `session/event` firing per element — this is what a finished/resumed
//     session hits on its first read (e.g. opening the 审计 tab on a subagent
//     transcript after it completed). A regression here (SV605 flooding
//     workspace-internal writes because `state.cwd` never got set) shipped
//     once already — the "cold snapshot" test below pins it.

import { apply, inject } from '../lib/index.js'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { zstdCompressSync } from 'node:zlib'

function fail(msg) {
  console.error(`\n[verify-host] FAIL: ${msg}`)
  process.exitCode = 1
  throw new Error(msg)
}
function ok(msg) {
  console.log(`[verify-host] ok: ${msg}`)
}

if (JSON.stringify(inject) !== JSON.stringify(['sessionProjections'])) {
  fail(`inject should be ['sessionProjections'], got ${JSON.stringify(inject)}`)
}
ok("inject === ['sessionProjections']")

// Collect handlers in registration order; capture every projection definition.
const handlers = []
const defs = {}
// session identity (object reference) -> { [defKey]: state } — mirrors the
// real registry's per-session WeakMap<Session, UnitCell> cell cache.
const cells = new Map()
function cellFor(def, session) {
  let bySession = cells.get(session)
  if (bySession === undefined) { bySession = {}; cells.set(session, bySession) }
  if (bySession[def.key] === undefined) {
    // Cold fold: exactly `buildCell` in the real registry — iterate the
    // session's full current event array with NO session/event dispatch.
    let state = def.init()
    for (const event of session.events) state = def.apply(state, event)
    bySession[def.key] = state
  }
  return bySession[def.key]
}
const ctx = {
  on(event, handler) { handlers.push({ event, handler }) },
  sessionProjections: {
    register: (d) => { defs[d.key] = d },
    snapshot(session) {
      const values = {}
      for (const def of Object.values(defs)) values[def.key] = def.schema.parse(def.view(cellFor(def, session)))
      return { asOfSeq: session.events.length - 1, values }
    },
  },
}
apply(ctx)

const createdHooks = handlers.filter((h) => h.event === 'session/created')
if (createdHooks.length !== 1) fail(`expected one session/created hook, got ${createdHooks.length}`)
ok('registers one session/created cwd-capture + eager-snapshot hook')

const hooks = handlers.filter((h) => h.event === 'session/event')
if (hooks.length !== 1) fail(`expected one session/event hook, got ${hooks.length}`)
ok('registers one session/event cwd-capture hook')

const bf = defs['behaviorFindings']
if (!bf) fail('behaviorFindings projection was not registered')
// 3 → 4：state 形状加了 sessionId（宿主注入，core 拿不到它），且 apply 开始
// 放行 turn/step 边界事件（Coords 靠它们顺延坐标）。两者都改变了折叠出来的
// state，必须 bump —— 不 bump 的话已缓存的旧 state 会被当成新版直接复用。
// 4 → 5（G2）：schema 加了 run_end_seq——state 形状没变，但 view() 的输出
// 契约变了，同样要 bump（precedent：skillAudit 的 T6 bump 就是同一条理由）。
if (bf.stateVersion !== 5) fail(`behaviorFindings stateVersion should be 5, got ${bf.stateVersion}`)
ok('registers behaviorFindings projection (stateVersion 5)')

const tb = defs['tokenByModel']
if (!tb) fail('tokenByModel projection was not registered')
if (tb.stateVersion !== 2) fail(`tokenByModel stateVersion should be 2, got ${tb.stateVersion}`)
ok('registers tokenByModel projection (stateVersion 2, view folds via wasm)')

// 阶段 A-5（真实审计 2026-08-25 发现）：导出脱敏要用工作区根路径当替换锚点，
// sessionCwd 是给 export.ts::redactPath 提供这个锚点的最小投影。
const sc = defs['sessionCwd']
if (!sc) fail('sessionCwd projection was not registered')
if (sc.stateVersion !== 1) fail(`sessionCwd stateVersion should be 1 (brand-new projection), got ${sc.stateVersion}`)
ok('registers sessionCwd projection (stateVersion 1，全新投影)')

const cr = defs['costReport']
if (!cr) fail('costReport projection was not registered')
// 1 → 2：apply 的白名单加了 request/context（逐请求计价要走 request_metrics），
// 折叠出来的 state 变了，必须 bump——不 bump 的话已缓存的旧 state 会被当成
// 新版直接复用，费用曲线会缺分母侧信息。
if (cr.stateVersion !== 2) fail(`costReport stateVersion should be 2, got ${cr.stateVersion}`)
ok('registers costReport projection (stateVersion 2, prices tokenByModel\'s fold host-side)')

// P2 债：behaviorFindings/tokenByModel 之外新增的四个投影，先前只在 wasm/core
// 层测过，宿主接线这一层完全没有断言——wasm 函数本身再扎实，接线本身接错了
// （比如 apply 白名单漏放行某个事件类型）测不出来。这里只补注册存在性 +
// 一条能验证接线对的功能断言，不重复 core 已经覆盖过的组合边界。
for (const key of ['requestMetrics', 'contextComposition', 'compactionEvents', 'structuralWaste', 'preForkUsage', 'skillAudit', 'durationAudit']) {
  if (!defs[key]) fail(`${key} projection was not registered`)
}
ok('registers requestMetrics / contextComposition / compactionEvents / structuralWaste / preForkUsage / skillAudit / durationAudit')

// **注册契约本身也要验**——不只是"投影算得对不对"。DSH 的 register() 校验
// stateVersion 必须是非负整数，少了会让**整个插件树加载失败**（`dsh web`
// 直接起不来，不是这个投影降级）。真机上就这么炸过一次：新增 preForkUsage
// 时漏了这个字段，而本文件其余断言全是直接调 init/apply/view，压根不走
// register()，于是全绿通过、一上真机就崩。这条补的正是那个盲区。
for (const [key, def] of Object.entries(defs)) {
  if (!Number.isInteger(def.stateVersion) || def.stateVersion < 0) {
    fail(`${key}: stateVersion 必须是非负整数（DSH register() 强制），实际 ${def.stateVersion}`)
  }
  // schema/init/apply/view 四件套缺一不可，同样是 register() 的硬要求。
  for (const field of ['schema', 'init', 'apply', 'view']) {
    if (def[field] == null) fail(`${key}: 注册缺少 ${field}`)
  }
}
ok(`每个投影的注册契约完整（${Object.keys(defs).length} 个：stateVersion 为非负整数 + schema/init/apply/view 齐全）`)

// ---------------------------------------------------------------------------
// Fold: pro → (usage ×2 same turn/step) → flash → (usage). The message for
// (turn1,step1) must REPLACE the earlier chunk, not double-count it.
// ---------------------------------------------------------------------------
// events: [] at creation — a genuinely new session has no history yet when
// session/created fires; its cell only fills in as live events arrive below.
const session = { id: 'sess-1', header: { cwd: '/workspace/skill-vitals' }, events: [] }
const events = [
  { type: 'request/header', seq: 1, time: 1000, data: { header: { config: { model: 'deepseek/deepseek-v4-pro-0813' } } } },
  { type: 'assistant/chunk', seq: 2, time: 1001, data: { turn: 1, step: 1, chunk: { type: 'usage', usage: { inputTokens: 1000, outputTokens: 200, cacheReadTokens: 300 } } } },
  { type: 'assistant/message', seq: 3, time: 1002, data: { turn: 1, step: 1, usage: { inputTokens: 1200, outputTokens: 250, cacheReadTokens: 300 } } },
  // 工作区内写 → 不报 SV605（behaviorFindings 用同一批事件，顺带验证）
  { type: 'tool/call', seq: 4, time: 1003, data: { name: 'write', arguments: '{"file_path":"/workspace/skill-vitals/dsh/a.json"}' } },
  { type: 'request/header', seq: 5, time: 1004, data: { header: { config: { model: 'deepseek/deepseek-v4-flash' } } } },
  { type: 'assistant/chunk', seq: 6, time: 1005, data: { turn: 2, step: 1, chunk: { type: 'usage', usage: { inputTokens: 500, outputTokens: 50 } } } },
  { type: 'tool/call', seq: 7, time: 1006, data: { name: 'bash', arguments: '{"command":"rm -rf /tmp/x"}' } },
]

for (const h of createdHooks) h.handler(session)

let state = bf.init()
let tbState = tb.init()
let scState = sc.init()
for (const event of events) {
  for (const h of hooks) h.handler(session, event)
  state = bf.apply(state, event)
  tbState = tb.apply(tbState, event)
  scState = sc.apply(scState, event)
}

// sessionCwd：真的能拿到会话工作区根路径（导出脱敏的替换锚点）。
const scView = sc.view(scState)
if (scView.cwd !== '/workspace/skill-vitals') {
  fail(`sessionCwd should capture the session's cwd, got ${JSON.stringify(scView)}`)
}
ok(`sessionCwd captured cwd: ${scView.cwd}`)

// tokenByModel: per-model buckets + sequence
const view = tb.view(tbState)
const pro = view.by_model['deepseek/deepseek-v4-pro-0813']
const flash = view.by_model['deepseek/deepseek-v4-flash']
if (!pro) fail(`pro bucket missing; got keys ${JSON.stringify(Object.keys(view.by_model))}`)
if (!flash) fail(`flash bucket missing; got keys ${JSON.stringify(Object.keys(view.by_model))}`)
if (pro.uncached_input_tokens !== 1200) fail(`pro should hold the message's 1200 (chunk 1000 replaced), got ${pro.uncached_input_tokens}`)
if (pro.output_tokens !== 250) fail(`pro.output_tokens should be 250, got ${pro.output_tokens}`)
if (flash.uncached_input_tokens !== 500) fail(`flash should hold 500, got ${flash.uncached_input_tokens}`)
ok('tokenByModel buckets: pro(1200/250/300), flash(500/50) — 同 turn/step 只计 message')

const seq = view.sequence
if (JSON.stringify(seq) !== JSON.stringify(['deepseek/deepseek-v4-pro-0813', 'deepseek/deepseek-v4-flash'])) {
  fail(`sequence should be [pro, flash], got ${JSON.stringify(seq)}`)
}
ok('tokenByModel sequence tracks model switch (pro → flash)')

// 模型切回：pro → flash → pro 序列保留两次 pro（相邻去重，不抹掉切换信息）。
let back = tb.apply(tb.init(), { type: 'request/header', seq: 1, data: { header: { config: { model: 'a' } } } })
back = tb.apply(back, { type: 'request/header', seq: 2, data: { header: { config: { model: 'b' } } } })
back = tb.apply(back, { type: 'request/header', seq: 3, data: { header: { config: { model: 'a' } } } })
back = tb.apply(back, { type: 'request/header', seq: 4, data: { header: { config: { model: 'a' } } } })
// state 现在是 {events}，sequence 是 view（wasm 折叠）的输出
const backSeq = tb.view(back).sequence
if (JSON.stringify(backSeq) !== JSON.stringify(['a', 'b', 'a'])) {
  fail(`switch-back sequence should be [a, b, a], got ${JSON.stringify(backSeq)}`)
}
ok('tokenByModel sequence keeps switch-back: [a, b, a]')

// 无 request/header 的 usage → unknown 桶（不臆造模型）。
const bare = tb.view(tb.apply(tb.init(), { type: 'assistant/chunk', seq: 99, data: { turn: 9, step: 9, chunk: { type: 'usage', usage: { inputTokens: 7 } } } }))
if (!bare.by_model['unknown'] || bare.by_model['unknown'].uncached_input_tokens !== 7) {
  fail(`no-header usage should land in unknown bucket, got ${JSON.stringify(bare.by_model)}`)
}
ok('tokenByModel buckets header-less usage into "unknown" (不臆造)')

// 高峰/空闲按事件自己的 time 精确判定（wasm token_by_model，与 core usage.rs
// 逐字节对齐）：北京 10:00（峰值）与 20:00（空闲）各出一条 usage，peak_* 只
// 累计峰值那条，全量字段仍是两条之和。这条链路一断，client.js 就会退回旧的
// 「给空闲价和高峰价两个数」的区间估算——真正回归的地方在这，不在 UI 层。
let peakState = tb.init()
peakState = tb.apply(peakState, { type: 'request/header', seq: 1, data: { header: { config: { model: 'm' } } } })
peakState = tb.apply(peakState, { type: 'assistant/chunk', seq: 2, time: 1704074400000, data: { turn: 1, step: 1, chunk: { type: 'usage', usage: { inputTokens: 100, outputTokens: 10 } } } })
peakState = tb.apply(peakState, { type: 'assistant/chunk', seq: 3, time: 1704110400000, data: { turn: 2, step: 1, chunk: { type: 'usage', usage: { inputTokens: 50, outputTokens: 5 } } } })
const peakBucket = tb.view(peakState).by_model['m']
if (peakBucket.uncached_input_tokens !== 150 || peakBucket.peak_uncached_input_tokens !== 100) {
  fail(`peak split wrong: total=${peakBucket.uncached_input_tokens} (want 150), peak=${peakBucket.peak_uncached_input_tokens} (want 100)`)
}
ok('tokenByModel splits peak_* from an event\'s own time (Beijing 10:00 peak vs 20:00 off-peak)')

// ---------------------------------------------------------------------------
// costReport: 宿主原生算钱（此前是 AuditView.tsx 自己拿 tokenByModel 的输出
// 算一遍，内嵌一份 PRICING 副本）。复用上面那批 pro→flash events——同一批
// usage 数据，costReport 是它的另一个派生视图，价格来自 dsh-client/pricing.json
// （build 时从 scripts/skill_vitals/pricing.json 复制而来，两处数值必须相等，
// 这里用真实文件而非编一份，价格表本身漂移会让下面的断言直接崩，不是悄悄过）。
// ---------------------------------------------------------------------------
let crState = cr.init()
for (const event of events) crState = cr.apply(crState, event)
const crView = cr.view(crState)
// pro: 1200 uncached*4.5 + 300 cache_read*0.15 + 250 output*13.5（每百万价，off-peak）
// flash: 500 uncached*1.5 + 50 output*4.5（每百万价，off-peak）—— events 的时间戳
// 都在北京 08:00，不落在 9–12/14–18 高峰窗，peak_total 应为 0。
const expectPro = (1200 / 1e6) * 4.5 + (300 / 1e6) * 0.15 + (250 / 1e6) * 13.5
const expectFlash = (500 / 1e6) * 1.5 + (50 / 1e6) * 4.5
const closeEnough = (a, b) => Math.abs(a - b) < 1e-9
if (!closeEnough(crView.total, expectPro + expectFlash)) {
  fail(`costReport.total should be ${expectPro + expectFlash}, got ${crView.total}`)
}
if (crView.peak_total !== 0) fail(`costReport.peak_total should be 0 (events are all off-peak), got ${crView.peak_total}`)
if (crView.unpriced_tokens !== 0) fail(`costReport.unpriced_tokens should be 0, got ${crView.unpriced_tokens}`)
if (crView.status !== 'complete') fail(`costReport should be complete when every model is priced, got ${crView.status}`)
const proRow = crView.per_model['deepseek/deepseek-v4-pro-0813']
const flashRow = crView.per_model['deepseek/deepseek-v4-flash']
if (!proRow || !closeEnough(proRow.total, expectPro)) fail(`costReport.per_model[pro].total should be ${expectPro}, got ${proRow && proRow.total}`)
if (!flashRow || !closeEnough(flashRow.total, expectFlash)) fail(`costReport.per_model[flash].total should be ${expectFlash}, got ${flashRow && flashRow.total}`)
ok('costReport prices the pro→flash fold against the real pricing.json — matches CLI\'s cost_report exactly')

// cache_read_cost 是 total 内部的切面（不是另一个独立的桶）——pro 那 300
// cache_read tokens 单独值多少钱：300/1e6 * 0.15（off-peak）。flash 这批
// events 完全没有 cacheReadTokens，应为 0，不是缺字段。
const expectProCacheCost = (300 / 1e6) * 0.15
if (!closeEnough(proRow.cache_read_cost, expectProCacheCost)) {
  fail(`costReport.per_model[pro].cache_read_cost should be ${expectProCacheCost}, got ${proRow.cache_read_cost}`)
}
if (flashRow.cache_read_cost !== 0) fail(`costReport.per_model[flash].cache_read_cost should be 0, got ${flashRow.cache_read_cost}`)
ok('costReport.per_model[*].cache_read_cost isolates the cache-hit share of total — matches CLI\'s cost_report')

// FR-04「费用」纵轴的数据源：逐请求累计费用。**高峰与否由 core 的 is_peak
// 判定**，宿主只负责按它选一档单价——展示层自己重算北京 9–12/14–18 就是这
// 条规则的第四份拷贝。
if (!Array.isArray(crView.series)) fail('costReport 缺 series（FR-04 费用纵轴的数据源）')
if (crView.series.length !== crView.total_requests) {
  fail(`costReport.series 应逐请求一项（${crView.total_requests}），实际 ${crView.series.length}`)
}
for (let i = 1; i < crView.series.length; i++) {
  if (crView.series[i].cumulative < crView.series[i - 1].cumulative - 1e-9) {
    fail('costReport.series 是累计值，不得下降')
  }
}
// 终值必须与 per_model 汇总的 total 吻合——两条路径（按模型分桶 vs 逐请求）
// 算的是同一笔钱，对不上就说明其中一条错了。
const seriesEnd = crView.series[crView.series.length - 1].cumulative
if (!closeEnough(seriesEnd, crView.total)) {
  fail(`逐请求累计终值 ${seriesEnd} 与按模型汇总 ${crView.total} 不一致——同一笔钱两条路径算出两个数`)
}
ok('costReport.series 逐请求累计、单调不降，且终值与按模型汇总的 total 吻合')

// 时间戳缺失 → is_peak 为 null → **这一笔不计价**，不猜一档单价。
let noTime = cr.apply(cr.init(), { type: 'request/header', seq: 1, data: { header: { config: { model: 'deepseek/deepseek-v4-pro-0813' } } } })
noTime = cr.apply(noTime, { type: 'assistant/chunk', seq: 2, data: { turn: 1, step: 1, chunk: { type: 'usage', usage: { inputTokens: 1000000, outputTokens: 0 } } } })
const noTimeView = cr.view(noTime)
if (noTimeView.priced_requests !== 0) {
  fail(`没有时间戳时不得计价（会是猜的），实际 priced_requests=${noTimeView.priced_requests}`)
}
if (noTimeView.series.some((p) => p.cumulative !== 0)) {
  fail('没有时间戳时累计费用应保持 0，不得按某一档单价猜')
}
ok('costReport.series：时间戳缺失时该笔不计价（不猜单价），priced/total 如实透出')

// ── loopCosts 投影（G2，GOVERNANCE_BACKLOG.md）──────────────────────────
// SV611 的 [seq, run_end_seq] 区间要能跟 request_metrics 的逐请求行对齐、
// 求和定价。构造：连续 3 次相同的 bash 调用（seq 2/4/6）触发 SV611，
// run_end_seq 落在第 3 次调用的 seq（6）——中间穿插两条 assistant/message
// usage（seq 3、5，落在区间内）和一条落在区间**外**的（seq 7，不该计入）。
{
  const lc = defs['loopCosts']
  if (!lc) fail('loopCosts projection was not registered')
  if (lc.stateVersion !== 1) fail(`loopCosts stateVersion should be 1 (brand-new projection), got ${lc.stateVersion}`)
  ok('registers loopCosts projection (stateVersion 1，全新投影)')

  const PEAK_TIME = 1704074400000 // 与上面 peak/off-peak 测试同一个已知高峰时间戳
  const loopEvents = [
    { type: 'request/header', seq: 1, time: PEAK_TIME, data: { header: { config: { model: 'deepseek/deepseek-v4-pro-0813' } } } },
    { type: 'tool/call', seq: 2, time: PEAK_TIME, data: { name: 'bash', arguments: '{"command":"ls"}' } },
    { type: 'assistant/message', seq: 3, time: PEAK_TIME, data: { turn: 1, step: 1, usage: { inputTokens: 1000, outputTokens: 100 } } },
    { type: 'tool/call', seq: 4, time: PEAK_TIME, data: { name: 'bash', arguments: '{"command":"ls"}' } },
    { type: 'assistant/message', seq: 5, time: PEAK_TIME, data: { turn: 1, step: 2, usage: { inputTokens: 2000, outputTokens: 200 } } },
    { type: 'tool/call', seq: 6, time: PEAK_TIME, data: { name: 'bash', arguments: '{"command":"ls"}' } }, // 第 3 次 → SV611 命中，run_end_seq=6
    { type: 'assistant/message', seq: 7, time: PEAK_TIME, data: { turn: 1, step: 3, usage: { inputTokens: 5000, outputTokens: 0 } } }, // 区间外，不该计入
  ]
  let lcState = lc.init()
  for (const e of loopEvents) lcState = lc.apply(lcState, e)
  const lcView = lc.view(lcState)
  const sv611 = lcView.filter((x) => x.rule === 'SV611')
  if (sv611.length !== 1) fail(`应恰好一条 SV611 loopCost，实际 ${JSON.stringify(lcView)}`)
  if (sv611[0].seq !== 2) fail(`SV611 loopCost 的 seq 应为 2（run 起点），实际 ${sv611[0].seq}`)
  const expectTokens = 1000 + 100 + 2000 + 200 // seq7 的 5000 在区间外，不计入
  if (sv611[0].tokens !== expectTokens) fail(`SV611 loopCost.tokens 应为 ${expectTokens}（区间外的 seq7 不计入），实际 ${sv611[0].tokens}`)
  // deepseek-v4-pro 高峰价：input_uncached 9.0/1M、output 27.0/1M。
  const expectCost = (1000 / 1e6) * 9.0 + (100 / 1e6) * 27.0 + (2000 / 1e6) * 9.0 + (200 / 1e6) * 27.0
  if (!closeEnough(sv611[0].cost, expectCost)) fail(`SV611 loopCost.cost 应约为 ${expectCost}，实际 ${sv611[0].cost}`)
  ok('loopCosts：SV611 的 [seq, run_end_seq] 区间正确对齐 request_metrics 并按 is_peak 定价，区间外的行不计入')

  // 区间内一个请求行都没有（没有任何 usage 事件）→ tokens/cost 都是 null，不是 0。
  const noUsageEvents = [
    { type: 'tool/call', seq: 1, data: { name: 'bash', arguments: '{"command":"ls"}' } },
    { type: 'tool/call', seq: 2, data: { name: 'bash', arguments: '{"command":"ls"}' } },
    { type: 'tool/call', seq: 3, data: { name: 'bash', arguments: '{"command":"ls"}' } },
  ]
  let noUsageState = lc.init()
  for (const e of noUsageEvents) noUsageState = lc.apply(noUsageState, e)
  const noUsageView = lc.view(noUsageState).filter((x) => x.rule === 'SV611')
  if (noUsageView.length !== 1 || noUsageView[0].tokens !== null || noUsageView[0].cost !== null) {
    fail(`区间内没有任何请求行时 tokens/cost 应为 null（算不出，不是 0），实际 ${JSON.stringify(noUsageView)}`)
  }
  ok('loopCosts：区间内没有任何请求行时 tokens/cost 为 null，不冒充 0')
}

// ── 会话分叉边界必须穿过每一个投影 ──────────────────────────────────────
// 边界**不是一个事件类型，是日志头的 `seedLength`**。初版用的是第一个
// `session/end-seed` 事件——在一个已分叉的会话上验证通过就推广了，那是巧合：
// 那个标记的是「一段续种结束」，会话每次被唤醒都会触发。真实日志
// session-6b47acc7 完全没分叉，唯一的 end-seed 落在**最后一个事件**上，按事件
// 判会把整个会话丢光，UI 上费用/上下文/常驻前缀/子代理全变「不可用」——这个
// 回归就是这么被用户在真机上发现的。
{
  const ev = [
    { type: 'request/header', seq: 1, time: 1000, data: { header: { config: { model: 'deepseek/deepseek-v4-pro-0813' } } } },
    { type: 'assistant/chunk', seq: 2, time: 1001, data: { turn: 1, step: 1, chunk: { type: 'usage', usage: { inputTokens: 2000000, outputTokens: 0 } } } },
    { type: 'tool/call', seq: 3, time: 1002, data: { turn: 1, step: 1, name: 'bash', arguments: '{"command":"rm -rf /tmp/upstream"}' } },
    { type: 'request/header', seq: 4, time: 1003, data: { header: { config: { model: 'deepseek/deepseek-v4-flash' } } } },
    { type: 'assistant/chunk', seq: 5, time: 1004, data: { turn: 2, step: 1, chunk: { type: 'usage', usage: { inputTokens: 100000, outputTokens: 0 } } } },
  ]
  const run = (header, def) => {
    // events: [] —— session/created 会调 snapshot() 冷折一遍，缺这个字段会崩。
    const sess = { id: 'fork-' + Math.random(), header, events: [] }
    for (const h of createdHooks) h.handler(sess)
    let st = def.init()
    for (const e of ev) { for (const h of hooks) h.handler(sess, e); st = def.apply(st, e) }
    return def.view(st)
  }

  // ① 已分叉：seedLength=4 → seq<4 的都是上游的，一律不计。
  const forked = run({ cwd: '/w', seedLength: 4 }, tb)
  if (Object.keys(forked.by_model).length !== 1 || !forked.by_model['deepseek/deepseek-v4-flash']) {
    fail(`已分叉会话应只剩分叉后的用量，实际 ${JSON.stringify(Object.keys(forked.by_model))}`)
  }
  const forkedFindings = run({ cwd: '/w', seedLength: 4 }, bf)
  if (forkedFindings.length !== 0) {
    fail(`分叉前那次 rm -rf 是上游干的，不该算成本会话的 finding: ${JSON.stringify(forkedFindings.map(f => f.rule))}`)
  }
  const forkedCost = run({ cwd: '/w', seedLength: 4 }, cr)
  if (Object.keys(forkedCost.per_model).length !== 1) fail('已分叉会话的费用应只算分叉后')

  // ② **未分叉：一个事件都不能滤。**这是真机上炸掉的那一种。
  for (const [key, def, check] of [
    ['tokenByModel', tb, (v) => Object.keys(v.by_model).length === 2],
    ['costReport', cr, (v) => v.total !== null && Object.keys(v.per_model).length === 2],
    ['requestMetrics', defs['requestMetrics'], (v) => v.requests.length === 2],
    ['behaviorFindings', bf, (v) => v.length === 1],
  ]) {
    const v = run({ cwd: '/w' }, def)
    if (!check(v)) {
      fail(`未分叉会话（header 无 seedLength）被误滤了：${key} → ${JSON.stringify(v).slice(0, 200)}`)
    }
  }
  ok('分叉边界只认日志头 seedLength：已分叉只算分叉后，未分叉一个事件都不滤（四个投影各验一次）')

  // ③ seedLength 捕获必须活过 apply。apply 返回裸对象字面量会把 state 上已捕获
  //    的 seed 丢掉——第一版就是这么写的，边界形同虚设（分叉会话照样全量计入）。
  const st = (() => {
    const sess = { id: 'keep', header: { cwd: '/w', seedLength: 4 }, events: [] }
    for (const h of createdHooks) h.handler(sess)
    let s2 = tb.init()
    for (const e of ev) { for (const h of hooks) h.handler(sess, e); s2 = tb.apply(s2, e) }
    return s2
  })()
  if (st.seed !== 4) fail(`seedLength 没能活过 apply（state.seed=${st.seed}）——apply 的 return 必须展开原 state`)
  ok('seedLength 捕获活过每一次 apply（return 展开原 state，不是裸对象字面量）')

  // ④ preForkUsage：主口径滤掉的那一段要能**单独**折出来，用于在展开详情里
  //    解释"上方数字为什么变小了"。它与 tokenByModel 恰好互补——同一批事件，
  //    一个取边界之后、一个取边界之前，两边加起来才是日志里的全量。
  const pf = defs['preForkUsage']
  const pfForked = run({ cwd: '/w', seedLength: 4 }, pf)
  if (pfForked.forked !== true) fail('preForkUsage: seedLength=4 的会话应报 forked:true')
  if (pfForked.boundary_seq !== 4) fail(`preForkUsage: 边界应是 4，实际 ${pfForked.boundary_seq}`)
  // 分叉前只有 seq<4 那一段：pro 模型的 2,000,000 uncached input。
  if (pfForked.tokens !== 2000000) {
    fail(`preForkUsage: 上游 token 应是 2,000,000（seq<4 那段），实际 ${pfForked.tokens}`)
  }
  if (pfForked.cost == null || pfForked.cost <= 0) {
    fail(`preForkUsage: 上游有可计价用量时应折出金额，实际 ${pfForked.cost}`)
  }
  // 互补性：上游那段的模型（pro）不该出现在主口径里，反之亦然。这条是整个
  // 分叉设计的核心不变量——同一个模型的用量绝不能两边都算一遍。
  if (Object.keys(forked.by_model).some(m => m.includes('pro'))) {
    fail('主口径里混进了上游的 pro 用量——重复计费')
  }
  // **未分叉 → forked:false，且四个字段全 null。**「没分叉」与「分叉了但上游
  // 花了 0」是两回事：前者展示层一个字都不该提分叉，后者要老实说上游是 0。
  const pfPlain = run({ cwd: '/w' }, pf)
  if (pfPlain.forked !== false) fail('preForkUsage: 未分叉会话应报 forked:false')
  if (pfPlain.tokens !== null || pfPlain.cost !== null || pfPlain.boundary_seq !== null) {
    fail(`preForkUsage: 未分叉时三个字段都该是 null（不是 0），实际 ${JSON.stringify(pfPlain)}`)
  }
  ok('preForkUsage：分叉前那段可单独折算（2M token + 金额），与主口径互补不重复；未分叉时全 null 而非 0')

  // ⑤ **继承的上下文 ≠ 上游累计花费**。这两个数很容易被当成一个用，但差着
  //    数量级：累计是几十上百个 turn 加起来（真机 277.2M），继承的是"上游最后
  //    一次请求当时占了多少"（受 context window 封顶）。混用会把 81% 的占用
  //    显示成 27700%。夹具特意让两者不相等，才能真正钉住这条。
  const evMulti = [
    { type: 'request/header', seq: 1, time: 1000, data: { header: { config: { model: 'deepseek/deepseek-v4-pro-0813' } } } },
    { type: 'request/context', seq: 2, time: 1000, data: { provider: 'deepseek', model: 'deepseek/deepseek-v4-pro-0813', contextWindow: 1000000 } },
    { type: 'assistant/message', seq: 3, time: 1001, data: { turn: 1, step: 1, usage: { inputTokens: 1000000, outputTokens: 0, cacheReadTokens: 0 } } },
    { type: 'request/header', seq: 4, time: 1002, data: { header: { config: { model: 'deepseek/deepseek-v4-pro-0813' } } } },
    { type: 'request/context', seq: 5, time: 1002, data: { provider: 'deepseek', model: 'deepseek/deepseek-v4-pro-0813', contextWindow: 1000000 } },
    { type: 'assistant/message', seq: 6, time: 1003, data: { turn: 2, step: 1, usage: { inputTokens: 800000, outputTokens: 0, cacheReadTokens: 0 } } },
    // 分叉边界 = 7：上面 6 个事件都是上游的。
    { type: 'request/header', seq: 7, time: 1004, data: { header: { config: { model: 'deepseek/deepseek-v4-flash' } } } },
  ]
  const pfMulti = (() => {
    const sess = { id: 'fork-multi', header: { cwd: '/w', seedLength: 7 }, events: [] }
    for (const h of createdHooks) h.handler(sess)
    let s = pf.init()
    for (const e of evMulti) { for (const h of hooks) h.handler(sess, e); s = pf.apply(s, e) }
    return pf.view(s)
  })()
  // 累计 = 1,000,000 + 800,000
  if (pfMulti.tokens !== 1800000) {
    fail(`preForkUsage: 上游累计应是 1,800,000，实际 ${pfMulti.tokens}`)
  }
  // 继承 = **最后一次请求**那一刻的占用，不是累计
  if (pfMulti.inherited_context !== 800000) {
    fail(`preForkUsage: 继承的上下文应是最后一次请求的 800,000（不是累计 1,800,000），实际 ${pfMulti.inherited_context}`)
  }
  if (pfMulti.inherited_context === pfMulti.tokens) {
    fail('preForkUsage: 继承上下文与上游累计花费被算成了同一个数——这正是要防的那个数量级错误')
  }
  if (pfMulti.inherited_window !== 1000000) {
    fail(`preForkUsage: 上限应取自 request/context，实际 ${pfMulti.inherited_window}`)
  }
  ok('preForkUsage：继承的上下文取"上游最后一次请求的占用"（800K）而非累计花费（1.8M），两者不得混用')

  // ⑥ **TS 的价目表解析必须与 CLI 数字级对账**。本文件其余夹具的
  //    request/header 一律不带 provider，走的全是 null→回落原厂那一路——
  //    「这家有自己的价卡」和「归属不明」两条分支在宿主侧此前零覆盖，
  //    只在 verify-render 的**静态**夹具里间接出现过（那些夹具是手写的
  //    costReport，根本没跑 resolveCard）。
  const cr2 = defs['costReport']
  const runCost = (events) => {
    const sess = { id: 'prov-' + Math.random(), header: { cwd: '/w' }, events: [] }
    for (const h of createdHooks) h.handler(sess)
    let st = cr2.init()
    for (const e of events) { for (const h of hooks) h.handler(sess, e); st = cr2.apply(st, e) }
    return cr2.view(st)
  }
  const hdr = (seq, model, provider) => ({
    type: 'request/header', seq, time: 1000 + seq,
    data: { header: { config: { model, provider } } },
  })
  const usg = (seq, turn, input) => ({
    type: 'assistant/message', seq, time: 1000 + seq,
    data: { turn, step: 1, usage: { inputTokens: input, outputTokens: 0 } },
  })

  // (a) 供应商有自己的价卡 → basis=provider，按它自己的价
  const own = runCost([hdr(1, 'deepseek/deepseek-v4-pro-0813', 'shengsuanyun'), usg(2, 1, 1000000)])
  const ownRow = own.per_model['deepseek/deepseek-v4-pro-0813']
  if (!ownRow || ownRow.pricing_basis !== 'provider' || ownRow.priced_with !== 'shengsuanyun') {
    fail(`价目表解析(a)：胜算云有自己的 pro 价卡，应 basis=provider/priced_with=shengsuanyun，实际 ${JSON.stringify(ownRow)}`)
  }
  // 100 万未命中 × ¥4.5/M = ¥4.50（time=1002 → 北京 1970-01-01 08:00，空闲价）
  if (Math.abs(ownRow.total - 4.5) > 1e-9) fail(`价目表解析(a)：应为 ¥4.50，实际 ${ownRow.total}`)

  // (b) 没配过的供应商 → 回落原厂，且**标记出来**
  const fb = runCost([hdr(1, 'deepseek-v4-pro', 'nowhere-inc'), usg(2, 1, 1000000)])
  const fbRow = fb.per_model['deepseek-v4-pro']
  if (!fbRow || fbRow.pricing_basis !== 'fallback' || fbRow.priced_with !== 'deepseek-official') {
    fail(`价目表解析(b)：未配过的供应商应回落原厂并标 fallback，实际 ${JSON.stringify(fbRow)}`)
  }
  if (fbRow.provider !== 'nowhere-inc') fail('价目表解析(b)：provider 仍应是实际那家，不能被改写成回落来源')

  // (c) 同一模型被两家先后服务 → 归属不明。**内部哨兵不得渲染给用户**：
  //     provider 必须落 null，而不是把 "__ambiguous__" 当成供应商名透出去。
  const amb = runCost([
    hdr(1, 'deepseek-v4-pro', 'shengsuanyun'), usg(2, 1, 1000000),
    hdr(3, 'deepseek-v4-pro', 'deepseek-official'), usg(4, 2, 500000),
  ])
  const ambRow = amb.per_model['deepseek-v4-pro']
  if (!ambRow || ambRow.pricing_basis !== 'ambiguous') {
    fail(`价目表解析(c)：同一模型被两家服务过应 basis=ambiguous，实际 ${JSON.stringify(ambRow)}`)
  }
  if (ambRow.provider !== null) {
    fail(`价目表解析(c)：'__ambiguous__' 是内部哨兵，绝不能作为供应商名透给展示层，实际 ${ambRow.provider}`)
  }
  ok('价目表按供应商解析（宿主侧数字级）：自家价卡 / 回落原厂并标记 / 归属不明不泄漏内部哨兵')

  // 收尾：把 activeSessionId 停在一个**没有 seedLength** 的会话上。
  // 生产路径里 apply 总是紧跟 session/event，拿到的永远是当前会话的边界；
  // 但本文件后面还有几处直接调 apply 而不走钩子的用例，不复位的话它们会继承
  // 上面那个 seedLength=4，事件被误滤（第一次加这段时就是这么把一条无关的
  // unpriced 断言弄红的）。
  for (const h of hooks) h.handler({ id: 'reset', header: { cwd: '/w' }, events: [] }, { type: 'noop' })
}

// 没有任何 usage 事件 → total 等一整套字段全 null，不是 0（与 Rust/Python 的
// cost_report 返回 None 同一语义），且这本身是"完整信息"——不是缺数据。
const emptyCrView = cr.view(cr.init())
if (emptyCrView.total !== null || emptyCrView.status !== 'complete') {
  fail(`costReport with no usage events should be {total: null, status: 'complete'}, got ${JSON.stringify(emptyCrView)}`)
}
ok('costReport: 没有 usage 事件时 total 为 null（不是 0），meta 仍是 complete')

// 未知模型 → 计入 unpriced_tokens，不悄悄按 0 计价；meta 标 partial，因为
// total 现在是低估，不是精确值。
let unknownState = cr.apply(cr.init(), { type: 'request/header', seq: 1, data: { header: { config: { model: 'some-other-vendor/mystery-model' } } } })
unknownState = cr.apply(unknownState, { type: 'assistant/chunk', seq: 2, data: { turn: 1, step: 1, chunk: { type: 'usage', usage: { inputTokens: 999, outputTokens: 1 } } } })
const unknownView = cr.view(unknownState)
if (unknownView.unpriced_tokens !== 999) fail(`unknown-model tokens should land in unpriced_tokens (999), got ${unknownView.unpriced_tokens}`)
if (unknownView.status !== 'partial' || !unknownView.missingFields.includes('unpriced_tokens')) {
  fail(`costReport with an unpriced model should be partial + ['unpriced_tokens'], got ${JSON.stringify(unknownView)}`)
}
ok('costReport: 报价单没有的模型进 unpriced_tokens 而不是按 0 计价，meta 标 partial')

// behaviorFindings: cwd 感知 + SV605 只报工作区外
if (state.cwd !== '/workspace/skill-vitals') {
  fail(`behaviorFindings did not capture cwd, got ${JSON.stringify(state.cwd)}`)
}
ok(`behaviorFindings captured cwd: ${state.cwd}`)

const findings = bf.view(state)
const rules = findings.map((f) => f.rule)
if (!rules.includes('SV601')) fail(`expected SV601 (rm -rf), got ${JSON.stringify(rules)}`)
if (rules.includes('SV605')) fail(`工作区内写不应报 SV605, got ${JSON.stringify(rules)}`)
ok('behaviorFindings view: 工作区内写不报 SV605，rm -rf 报 SV601')

// ---------------------------------------------------------------------------
// Regression: cold read of a FINISHED / resumed session — session.events
// already holds the full history when session/created fires, and NO
// session/event ever fires for any of them (buildCell's fold path, not
// drive()). Before the fix this left state.cwd === '' forever and flooded
// SV605 on every workspace-internal write (真实回归：183/188 条假阳性).
// ---------------------------------------------------------------------------
const finishedSession = {
  id: 'sess-cold',
  header: { cwd: '/workspace/skill-vitals' },
  events: [
    { type: 'tool/call', seq: 1, time: 1, data: { name: 'edit', arguments: '{"file_path":"/workspace/skill-vitals/src/discovery.rs"}' } },
    { type: 'tool/call', seq: 2, time: 2, data: { name: 'edit', arguments: '{"file_path":"/workspace/skill-vitals/src/inventory.rs"}' } },
  ],
}
// Only session/created fires — the cold path never touches session/event.
for (const h of createdHooks) h.handler(finishedSession)

const coldView = ctx.sessionProjections.snapshot(finishedSession).values.behaviorFindings
const coldRules = coldView.map((f) => f.rule)
if (coldRules.includes('SV605')) {
  fail(`cold read of a finished session flooded SV605 on workspace-internal writes: ${JSON.stringify(coldRules)}`)
}
ok('cold snapshot() of a finished session captures cwd via session/created — no SV605 flood on in-workspace edits')

// ---------------------------------------------------------------------------
// requestMetrics: apply must放行 request/context（分母的唯一来源）—— tokenByModel
// 的白名单没有它，如果 requestMetrics 的 apply 抄漏了这一条，每行 context_window
// 都会悄悄变 null，且不会有任何报错，只会在 UI 上"上下文占用暂不可用"。
// ---------------------------------------------------------------------------
const rm = defs['requestMetrics']
let rmState = rm.init()
const rmEvents = [
  { type: 'request/context', seq: 1, data: { provider: 'p', model: 'm', contextWindow: 1000000 } },
  ...events, // 复用上面已验证过的 pro→flash usage 序列
]
for (const event of rmEvents) rmState = rm.apply(rmState, event)
const rmView = rm.view(rmState)
const rmRows = rmView.requests
// events 里两个 usage 落点是 (turn1,step1)（chunk+message 去重成 1 行）与
// (turn2,step1)（仅 chunk）—— 2 行，不是 3；tool/call 不产生 usage 行。
if (rmRows.length !== 2) fail(`requestMetrics should fold to 2 request rows, got ${rmRows.length}`)
if (rmRows[0].context_window !== 1000000) {
  fail(`requestMetrics dropped request/context — context_window is ${rmRows[0].context_window}, apply() likely doesn't allowlist it`)
}
if (rmRows[0].context_tokens !== 1500) { // 1200 (message replaced chunk) + 300 cacheRead
  fail(`requestMetrics context_tokens should be 1500 (1200+300), got ${rmRows[0].context_tokens}`)
}
// events 里 flash 那条 chunk（seq 6）没带 cacheReadTokens——这是共享 fixture 的
// 真实数据缺口，不是我编的：它的 context_tokens 因此正确地是 null，meta 应该
// 老实报 partial，而不是被我最初写错的"应该 complete"断言掩盖过去。
if (rmView.status !== 'partial' || !rmView.missingFields.includes('context_tokens')) {
  fail(`requestMetrics meta should be partial + ['context_tokens'] (the flash chunk lacks cacheReadTokens), got ${JSON.stringify({ status: rmView.status, missingFields: rmView.missingFields })}`)
}
ok('requestMetrics: request/context 分母接线正确，逐请求 context_tokens 折得对，meta 老实报出那条缺 cacheReadTokens 的行')

// 对照组：request/context + 每行都带齐 cacheReadTokens 时，meta 必须是
// complete——证明 partial 不是"只要有数据就标"的常态，是真的缺了才标。
let completeState = rm.apply(rm.init(), { type: 'request/context', seq: 1, data: { contextWindow: 1000000 } })
completeState = rm.apply(completeState, { type: 'assistant/chunk', seq: 2, data: { turn: 1, step: 1, chunk: { type: 'usage', usage: { inputTokens: 10, cacheReadTokens: 5 } } } })
const completeView = rm.view(completeState)
if (completeView.status !== 'complete' || completeView.missingFields.length !== 0) {
  fail(`requestMetrics meta should be complete/[] when every row has cacheReadTokens, got ${JSON.stringify(completeView)}`)
}
ok('requestMetrics: 逐行都齐全时 meta 正确报 complete（对照组）')

// ---------------------------------------------------------------------------
// contextComposition: apply 按 data.source.kind 判断，不是 type 白名单——技能
// 目录不是专用事件类型，如果误写成只放行固定 type，目录数据就永远进不来。
// ---------------------------------------------------------------------------
const cc = defs['contextComposition']
let ccState = cc.init()
const ccEvents = [
  { type: 'request/header', seq: 1, data: { header: { system: 'You are an AI agent.', tools: [{ name: 'bash', description: 'Run a shell command' }] } } },
  { type: 'agent/inbox/spliced', seq: 2, data: { source: { kind: 'skill-catalog', entries: [{ name: 'a', description: 'skill a' }] } } },
]
for (const event of ccEvents) ccState = cc.apply(ccState, event)
const ccView = cc.view(ccState)
if (ccView.catalog_entries !== 1) {
  fail(`contextComposition missed the skill-catalog carrier (kind-based, not type-allowlisted) — catalog_entries=${ccView.catalog_entries}`)
}
if (ccView.system_tokens === null || ccView.tools_tokens === null) {
  fail(`contextComposition missed request/header.system/tools — got ${JSON.stringify(ccView)}`)
}
if (ccView.status !== 'complete') fail(`contextComposition should be complete when all 3 sources present, got ${ccView.status}`)
ok('contextComposition: system/tools/catalog 三路接线都对（目录按 source.kind 而非 type 判断），meta=complete')

// T1: catalog_names 逐条拆分要接线到位——只带 {name, tokens}，description 原文
// 绝不出现在投影输出里（FR-SK-09 导出纪律）。
if (!Array.isArray(ccView.catalog_names) || ccView.catalog_names.length !== 1
    || ccView.catalog_names[0].name !== 'a' || typeof ccView.catalog_names[0].tokens !== 'number') {
  fail(`contextComposition.catalog_names wiring broken — got ${JSON.stringify(ccView.catalog_names)}`)
}
if (JSON.stringify(ccView).includes('skill a')) {
  fail('contextComposition leaked catalog description text into the projection output')
}
ok('contextComposition: catalog_names 逐条拆分接线正确，且不带 description 原文（T1）')

// 没有任何来源事件 → 三项全 null，meta 应为 partial 且点名三个字段。
const emptyCcView = cc.view(cc.init())
if (emptyCcView.status !== 'partial'
    || !['system_tokens', 'tools_tokens', 'catalog_tokens'].every((k) => emptyCcView.missingFields.includes(k))) {
  fail(`contextComposition with no source events should be partial with all 3 fields listed, got ${JSON.stringify(emptyCcView)}`)
}
ok('contextComposition: 无来源事件时 meta 正确标 partial + 三个字段名')

// ---------------------------------------------------------------------------
// compactionEvents: apply 必须放行 turn/start·turn/end——prune 自身不带 turn，
// 只喂 compaction/* 不喂 turn 边界的话，这条真实踩过的坑会在这里重现。
// ---------------------------------------------------------------------------
const ce = defs['compactionEvents']
let ceState = ce.init()
const ceEvents = [
  { type: 'turn/start', seq: 1, data: { turn: 85 } },
  { type: 'compaction/prune', seq: 2, data: { shadowedSeqs: [10], shadowedTokenCount: 3367 } },
  { type: 'turn/end', seq: 3, data: { turn: 85 } },
]
for (const event of ceEvents) ceState = ce.apply(ceState, event)
const ceView = ce.view(ceState)
if (ceView.prunes.length !== 1) fail(`compactionEvents should fold 1 prune, got ${ceView.prunes.length}`)
if (ceView.prunes[0].turn !== 85) {
  fail(`compactionEvents dropped turn/start·turn/end — prune.turn is ${ceView.prunes[0].turn}, should carry forward to 85`)
}
if (ceView.status !== 'complete') fail(`compactionEvents should be complete when the one prune reports its token count, got ${ceView.status}`)
ok('compactionEvents: turn/start·turn/end 接线正确，prune 的 turn 顺延得到，meta=complete')

// 无压缩事件 ≠ 数据不全——"这次会话没发生压缩"是完整信息，不该标 partial。
const noCompactView = ce.view(ce.init())
if (noCompactView.status !== 'complete') {
  fail(`compactionEvents with zero compaction events should still be complete (no compaction happened is a real fact, not missing data), got ${noCompactView.status}`)
}
ok('compactionEvents: 会话内没有压缩事件时仍是 complete，不是 partial')

// ---------------------------------------------------------------------------
// structuralWaste: 两路事件（tool/call+tool/result 与 usage）分开攒，view()
// 里先把 usage 那路折成 requests 再喂给 wasm——顺序错了两个检测器都会失效。
// ---------------------------------------------------------------------------
const sw = defs['structuralWaste']
let swState = sw.init()
const dupContent = [{ type: 'text', text: 'key: value' }]
const swEvents = [
  { type: 'tool/call', seq: 1, data: { turn: 1, step: 1, callId: 'c1', name: 'read', arguments: '{"path":"config.yaml"}' } },
  { type: 'tool/result', seq: 2, data: { turn: 1, step: 1, message: { source: { kind: 'tool', callId: 'c1' }, content: dupContent } } },
  { type: 'tool/call', seq: 3, data: { turn: 2, step: 1, callId: 'c2', name: 'read', arguments: '{"path":"config.yaml"}' } },
  { type: 'tool/result', seq: 4, data: { turn: 2, step: 1, message: { source: { kind: 'tool', callId: 'c2' }, content: dupContent } } },
]
for (const event of swEvents) swState = sw.apply(swState, event)
const swView = sw.view(swState)
if (swView.findings.length !== 1 || swView.findings[0].rule !== 'SV-COST-01') {
  fail(`structuralWaste should find one SV-COST-01 (duplicate read across turns), got ${JSON.stringify(swView)}`)
}
// swEvents 里没有 usage 事件，所以 requests 是空数组——没有请求点就没有
// "某行缺 context_tokens" 这回事，meta 应为 complete，不是笼统地因为没数据
// 就标 partial（跟 compactionEvents 的"无压缩≠不全"是同一条判断原则）。
if (swView.status !== 'complete') {
  fail(`structuralWaste should be complete when there are simply no usage events (not partial), got ${swView.status}`)
}
ok('structuralWaste: 重复工具结果接线正确（跨 turn 判定，不是同 turn 内计数），meta=complete')

// **浪费行也必须带 session_id**（AC-02）。core 看不到 sessionId，由宿主注入——
// behaviorFindings 一直这么做，structuralWaste 此前漏了：备注键于是退化成
// ["", rule, evidence]，A 会话给某条 SV-COST 写的备注会静默出现在 B 会话同
// rule+evidence 的那一行上。
//
// 这条**只能在宿主侧钉**：verify-render 的 wasteOf 夹具是手写的投影输出，
// 里面本来就带着 session_id，它假设的正是这个注入已经发生——夹具与真实宿主
// 不一致时，渲染测试反而看不出来。
if (!swView.findings.every((f) => typeof f.session_id === 'string')) {
  fail(`structuralWaste 的每条 finding 都必须带 session_id（备注按它隔离），实际 ${JSON.stringify(swView.findings[0])}`)
}
ok('structuralWaste: 每条浪费行都注入了 session_id，备注不会跨会话泄漏（AC-02）')

// ---------------------------------------------------------------------------
// skillAudit（backlog T5 + T6）：
// T5：两路事件流分开攒（execEvents 走 skill_audit，usageEvents 折成 requests
// 供 request_seq 定位）——同一种 structuralWaste 已验证过的接线顺序。
// explicit（skill-invocation 载体）与 model_selected（tool/call name="skill"
// 配 tool/result）各验一次，外加"普通 user/message 不得泄漏进投影"的隐私
// 边界（T2 同款纪律）。
// T6：coverage 字段（sessionsDiscovered / sessionsCovered / missingSessions /
// coverageBySkill），以及 model_selected 行上的 agent_id（从 subagentSpawns
// 经 callId 回填）。coverage_by_skill 的去重键是 (sessionId, skillName) ——
// 同名 skill 跨 Agent 不得错误去重（backlog T6 AC-SK-05）。
// ---------------------------------------------------------------------------
const sa = defs['skillAudit']
// P0-01（真实审计 2026-08-25 发现）：invocations 加了 source_agent_id/depth，
// 子会话自己的 Skill 调用现在真的会出现在这个数组里，coverage_by_skill 的
// value 形状也从 {discovered,covered} 简化成单个 number → 2→3。
if (sa.stateVersion !== 3) fail(`skillAudit stateVersion should be 3 (P0-01 subagent skill parsing), got ${sa.stateVersion}`)
ok('skillAudit: stateVersion 3 (P0-01 子代理 Skill 解析)')

let saState = sa.init()
const saEvents = [
  { type: 'turn/start', seq: 10, data: { turn: 3 } },
  // 普通用户消息（无 skill-invocation 载体）：不得混进 execEvents，
  // 否则原始 prompt 文本就泄漏进了投影/导出。
  { type: 'user/message', seq: 11, time: 1750000011000, data: { content: [{ type: 'text', text: 'SENSITIVE_PROMPT_TEXT' }] } },
  { type: 'user/message', seq: 13, time: 1750000014000, data: { source: { kind: 'skill-invocation', name: 'release-notes' } } },
  { type: 'turn/end', seq: 16, data: { turn: 3 } },
  { type: 'request/header', seq: 18, time: 1750000019000, data: { header: { config: { model: 'm' } } } },
  { type: 'tool/call', seq: 19, time: 1750000020000, data: { turn: 4, step: 1, callId: 'c1', name: 'skill', arguments: '{"name":"commit-summarizer"}' } },
  { type: 'assistant/chunk', seq: 20, time: 1750000020010, data: { turn: 4, step: 1, chunk: { type: 'usage', usage: { inputTokens: 10, outputTokens: 5 } } } },
  { type: 'tool/result', seq: 21, time: 1750000020018, data: { message: { source: { kind: 'tool', callId: 'c1' }, content: [{ type: 'tool-result', isError: false }] } } },
]
for (const event of saEvents) saState = sa.apply(saState, event)
const saView = sa.view(saState)
if (saView.invocations.length !== 2) {
  fail(`skillAudit should find 2 invocations (1 explicit + 1 model_selected), got ${JSON.stringify(saView.invocations)}`)
}
const [explicitRow, modelRow] = saView.invocations
if (explicitRow.trigger_mode !== 'explicit' || explicitRow.load_status !== 'loaded' || explicitRow.turn !== 3) {
  fail(`skillAudit explicit row wiring broken: ${JSON.stringify(explicitRow)}`)
}
// T6: explicit 行没有 call_id → agent_id 必须是 null（不是 undefined/空字符串）
if (explicitRow.agent_id !== null) {
  fail(`skillAudit explicit invocation should have agent_id=null, got ${explicitRow.agent_id}`)
}
// T6: model_selected 行通过 callId 从 subagentSpawns 回填 agent_id。
// saView 没有子会话日志（subagentUsage 返回 null），所以 sessionsCovered=0，
// 但 sessionsDiscovered 也=0 因为 subagentSpawns 里 c1 的 agent_id 是 null——
if (typeof modelRow.agent_id !== 'string' && modelRow.agent_id !== null) {
  fail(`skillAudit model_selected agent_id should be string|null, got ${modelRow.agent_id}`)
}
if (modelRow.trigger_mode !== 'model_selected' || modelRow.load_status !== 'loaded'
    || modelRow.call_id !== 'c1' || modelRow.request_seq !== 1) {
  fail(`skillAudit model_selected row wiring broken (request_seq should resolve via request_metrics): ${JSON.stringify(modelRow)}`)
}
if (JSON.stringify(saView).includes('SENSITIVE_PROMPT_TEXT')) {
  fail('skillAudit leaked a plain user/message (no skill-invocation carrier) into the projection — privacy boundary broken')
}
// T6 coverage fields 必须存在
if (typeof saView.sessions_discovered !== 'number') {
  fail(`skillAudit must have sessions_discovered (number), got ${saView.sessions_discovered}`)
}
if (!Array.isArray(saView.missing_sessions)) {
  fail(`skillAudit must have missing_sessions (array), got ${saView.missing_sessions}`)
}
if (typeof saView.coverage_by_skill !== 'object' || saView.coverage_by_skill === null) {
  fail(`skillAudit must have coverage_by_skill (object), got ${saView.coverage_by_skill}`)
}
ok('skillAudit: explicit + model_selected 两路接线正确，request_seq 靠 request_metrics 定位，普通用户消息不泄漏，coverage 字段存在（T5+T6）')

// missingFields 汇总：至少一行缺字段时，projection 级 status 应为 partial，
// 且把该行 missing_fields 里报的字段名带上来（不是重新判定一遍，是汇总）。
let saIncompleteState = sa.init()
const saIncompleteEvents = [
  { type: 'tool/call', seq: 1, time: 1000, data: { turn: 1, step: 1, callId: 'c1', name: 'skill', arguments: '{"name":"still-loading"}' } },
]
for (const event of saIncompleteEvents) saIncompleteState = sa.apply(saIncompleteState, event)
const saIncompleteView = sa.view(saIncompleteState)
if (saIncompleteView.status !== 'partial' || !saIncompleteView.missingFields.includes('duration_ms')) {
  fail(`skillAudit: 结果没到的调用应报 partial 且带出 duration_ms，实际 ${JSON.stringify(saIncompleteView)}`)
}
ok('skillAudit: 结果没到的调用（incomplete）汇总进 projection 级 missingFields，不是静默吞掉')

// ---------------------------------------------------------------------------
// P0-01 回归（真实审计 2026-08-25 发现）：主会话派生一个子代理，子代理自己
// 的事件流里有一次 explicit Skill 调用——修复前 skillAudit 从不解析子会话
// 自己的 Skill 调用，这条调用永远不会出现在任何地方；`covered` 判据也曾经
// 只看费用能不能算出来（`u.total !== null`），检查的是错的字段，名字叫
// "覆盖率"实测的是"文件读得到"。`coverage_by_skill` 的 key 曾经是
// `spawn.description`（任务描述），不是真实 skill 名。
// ---------------------------------------------------------------------------
{
  // 独立的临时 DSH_HOME，不复用下面 subagentSpawns 测试那个（这个测试块
  // 在文件里排在它前面，那个 `dshHome` 这时候还没声明）。
  const p0DshHomeDir = mkdtempSync(join(tmpdir(), 'sv-verify-host-p0-'))
  const SUB_AGENT_ID = 'a1b2c3d4-0000-4000-8000-000000000099'
  const subSessionDir = join(p0DshHomeDir, 'sessions', 'ws1', SUB_AGENT_ID)
  mkdirSync(subSessionDir, { recursive: true })
  const subOwnEvents = [
    { type: 'session/created', seq: 0, time: 1000, data: {} },
    // 子代理自己触发的一次 explicit Skill 调用——本次修复要让它能被主会话
    // 的 skillAudit 投影看见的那条数据。
    { type: 'user/message', seq: 1, time: 1500, data: { source: { kind: 'skill-invocation', name: 'sub-only-skill' } } },
    { type: 'turn/end', seq: 2, time: 1600, data: { turn: 0 } },
    { type: 'assistant/chunk', seq: 3, time: 1700, data: { turn: 1, step: 1, chunk: { type: 'usage', usage: { inputTokens: 5 } } } },
  ]
  const subOwnJsonl = subOwnEvents.map((e) => JSON.stringify(e)).join('\n') + '\n'
  writeFileSync(join(subSessionDir, 'session.jsonl.zstd'), zstdCompressSync(Buffer.from(subOwnJsonl, 'utf8')))

  const runWithDshHome = (fn) => {
    const prev = process.env.DSH_HOME
    process.env.DSH_HOME = p0DshHomeDir
    try { return fn() } finally {
      if (prev === undefined) delete process.env.DSH_HOME
      else process.env.DSH_HOME = prev
    }
  }

  let p0State = sa.init()
  const p0Events = [
    { type: 'tool/call', seq: 1, time: 1000, data: { turn: 1, step: 1, callId: 'sub1', name: 'subagent', arguments: '{"description":"do something"}' } },
    {
      type: 'tool/result', seq: 2, time: 1010,
      data: {
        message: {
          source: { kind: 'tool', callId: 'sub1' },
          content: [{ type: 'tool-result', content: [{ type: 'text', text: `started subagent ${SUB_AGENT_ID}` }] }],
        },
      },
    },
  ]
  for (const event of p0Events) p0State = sa.apply(p0State, event)
  const p0View = runWithDshHome(() => sa.view(p0State))

  const subInv = p0View.invocations.find((inv) => inv.source_agent_id === SUB_AGENT_ID)
  if (!subInv) {
    fail(`P0-01: 主会话自己 0 次 Skill 调用、子会话 1 次——子会话自己的调用应该出现在 invocations 里（source_agent_id=${SUB_AGENT_ID}），实际 ${JSON.stringify(p0View.invocations)}`)
  }
  if (subInv.name !== 'sub-only-skill' || subInv.depth !== 1) {
    fail(`P0-01: 子会话调用的 name/depth 接线不对: ${JSON.stringify(subInv)}`)
  }
  if (p0View.sessions_covered !== 1) {
    fail(`P0-01: 子会话日志读到了、Skill 也真的解析出来了，sessions_covered 应为 1，实际 ${p0View.sessions_covered}`)
  }
  if (p0View.coverage_by_skill['sub-only-skill'] !== 1) {
    fail(`P0-01: coverage_by_skill 的 key 应该是真实 skill 名 "sub-only-skill"，不是任务描述；实际 ${JSON.stringify(p0View.coverage_by_skill)}`)
  }
  if ('do something' in p0View.coverage_by_skill) {
    fail('P0-01: coverage_by_skill 不该再用 spawn.description（任务描述）当 key')
  }
  ok('P0-01: 子会话自己的 Skill 调用真的被解析出来并合并进主 invocations 列表（source_agent_id/depth 标记来源），coverage_by_skill 用真实 skill 名当 key，不再是任务描述')

  // 对照：子会话日志读不到时，不得计入 covered，也不该往 coverage_by_skill
  // 里凭空加一条——这条路径 P0-01 之前就是对的，改动后不能退化。
  let p0MissState = sa.init()
  const p0MissEvents = [
    { type: 'tool/call', seq: 1, time: 1000, data: { turn: 1, step: 1, callId: 'sub2', name: 'subagent', arguments: '{"description":"unreachable"}' } },
    {
      type: 'tool/result', seq: 2, time: 1010,
      data: {
        message: {
          source: { kind: 'tool', callId: 'sub2' },
          content: [{ type: 'tool-result', content: [{ type: 'text', text: 'started subagent 00000000-0000-4000-8000-000000000000' }] }],
        },
      },
    },
  ]
  for (const event of p0MissEvents) p0MissState = sa.apply(p0MissState, event)
  const p0MissView = runWithDshHome(() => sa.view(p0MissState))
  if (p0MissView.sessions_covered !== 0 || !p0MissView.missing_sessions.includes('00000000-0000-4000-8000-000000000000')) {
    fail(`P0-01: 读不到的子会话应落进 missing_sessions、不计入 covered，实际 ${JSON.stringify({ covered: p0MissView.sessions_covered, missing: p0MissView.missing_sessions })}`)
  }
  ok('P0-01: 子会话日志读不到时仍然正确落进 missing_sessions、不计入 covered（这条路径改动前就对，改动后没有退化）')
}

// ---------------------------------------------------------------------------
// durationAudit（DURATION_AUDIT_BACKLOG.md D6，D1–D3）：
// 一份混合 fixture（tool/call+result、turn/start+end、step/start+end、
// approval asked+decided 全部揉在一起，模拟真实会话里这些事件交织出现）
// 一次性验证四个子数组接线都对，且手算结果与 D5 commit 里对 wasm 做过的
// 手工验证是同一份 fixture、同一组期望值——两处独立验证互相印证。
// 另外验证 hook/* 事件被过滤集合挡在外面（D4 的宿主前提未验证，不能进）。
// ---------------------------------------------------------------------------
const da = defs['durationAudit']
if (da.stateVersion !== 1) fail(`durationAudit stateVersion should be 1 (brand-new projection), got ${da.stateVersion}`)
ok('durationAudit: stateVersion 1（全新投影，不延续 skillAudit 的版本号）')

let daState = da.init()
const daEvents = [
  { type: 'turn/start', seq: 1, time: 1000, data: { turn: 1 } },
  { type: 'tool/call', seq: 2, time: 1010, data: { turn: 1, step: 1, callId: 'c1', name: 'bash', arguments: '{}' } },
  { type: 'tool/result', seq: 3, time: 1030, data: { message: { source: { kind: 'tool', callId: 'c1' }, content: [{ type: 'tool-result', isError: false }] } } },
  { type: 'step/start', seq: 4, time: 1015, data: { turn: 1, step: 1 } },
  { type: 'approval/asked', seq: 5, time: 1020, data: { id: 'a1', toolName: 'write_file', reason: 'x' } },
  // hook/* 不在 DURATION_EVENT_TYPES 里——过滤集合应该把它挡在外面，不是
  // 混进 execEvents 之后才在别处被忽略（那样每次会话都在白白攒一堆用不上
  // 的事件，体积随之增长）。
  { type: 'hook/invoked', seq: 100, time: 1100, data: { turn: 1, point: 'PreToolUse', handlerId: 'h1' } },
  { type: 'hook/result', seq: 101, time: 1101, data: { turn: 1, point: 'PreToolUse', handlerId: 'h1', decision: 'pass', durationMs: 1 } },
  { type: 'step/end', seq: 6, time: 1025, data: { turn: 1, step: 1 } },
  { type: 'approval/decided', seq: 7, time: 1030, data: { id: 'a1', outcome: 'allowed-once' } },
  { type: 'turn/end', seq: 8, time: 1040, data: { turn: 1, reason: { kind: 'completed' } } },
]
for (const event of daEvents) daState = da.apply(daState, event)
const daView = da.view(daState)

if (daView.tool_calls.length !== 1 || daView.tool_calls[0].duration_ms !== 20 || daView.tool_calls[0].tool_name !== 'bash') {
  fail(`durationAudit tool_calls wiring broken: ${JSON.stringify(daView.tool_calls)}`)
}
if (daView.turns.length !== 1 || daView.turns[0].duration_ms !== 40 || daView.turns[0].ended_reason !== 'completed') {
  fail(`durationAudit turns wiring broken: ${JSON.stringify(daView.turns)}`)
}
if (daView.steps.length !== 1 || daView.steps[0].duration_ms !== 10) {
  fail(`durationAudit steps wiring broken: ${JSON.stringify(daView.steps)}`)
}
if (daView.approvals.length !== 1 || daView.approvals[0].wait_ms !== 10 || daView.approvals[0].outcome !== 'allowed-once') {
  fail(`durationAudit approvals wiring broken: ${JSON.stringify(daView.approvals)}`)
}
if (JSON.stringify(daView).includes('handlerId') || JSON.stringify(daView).includes('"h1"')) {
  fail('durationAudit leaked hook/* data into the projection — DURATION_EVENT_TYPES should have filtered it out entirely')
}
ok('durationAudit: tool_calls/turns/steps/approvals 四路接线都对（与 D5 对 wasm 的手工验证同一份 fixture、同一组期望值），hook/* 被过滤集合挡在外面')

// missingFields 汇总：incomplete 的 tool/call（没有 tool/result）应报 partial。
let daIncompleteState = da.init()
const daIncompleteEvents = [
  { type: 'tool/call', seq: 1, time: 1000, data: { turn: 1, step: 1, callId: 'c1', name: 'bash' } },
]
for (const event of daIncompleteEvents) daIncompleteState = da.apply(daIncompleteState, event)
const daIncompleteView = da.view(daIncompleteState)
if (daIncompleteView.status !== 'partial' || !daIncompleteView.missingFields.includes('duration_ms')) {
  fail(`durationAudit: 没有回执的调用应报 partial 且带出 duration_ms，实际 ${JSON.stringify(daIncompleteView)}`)
}
ok('durationAudit: 没有回执的调用（incomplete）汇总进 projection 级 missingFields，不是静默吞掉')

// ---------------------------------------------------------------------------
// skillAttribution 投影（阶段 B-3，真实审计 2026-08-25 后续跟进：Skill →
// Finding/工具/费用归因）。两次 explicit Skill 调用（seq=10、seq=20），
// 中间穿插一次触发 SV601 的 bash 调用（seq=12）+ 一笔 usage（seq=14）——都
// 落在 [10,20) 区间内，应该记到第一次调用账上；第二次调用之后是一次安全
// 的 bash 调用（seq=22）+ usage（seq=24），落在 [20,∞) 开区间内。
// ---------------------------------------------------------------------------
{
  const skAttr = defs['skillAttribution']
  if (!skAttr) fail('skillAttribution projection was not registered')
  if (skAttr.stateVersion !== 1) fail(`skillAttribution stateVersion should be 1 (brand-new projection), got ${skAttr.stateVersion}`)
  ok('registers skillAttribution projection (stateVersion 1，全新投影)')

  const skAttrEvents = [
    { type: 'turn/start', seq: 9, time: 1000, data: { turn: 1 } },
    { type: 'user/message', seq: 10, time: 1001, data: { source: { kind: 'skill-invocation', name: 'skill-a' } } },
    { type: 'request/header', seq: 11, time: 1002, data: { header: { config: { model: 'deepseek/deepseek-v4-pro-0813' } } } },
    // 落在窗口 A [10,20) 内：一次危险命令（该算进 A 的 findings）+ 一笔 usage。
    { type: 'tool/call', seq: 12, time: 1003, data: { turn: 1, step: 1, callId: 'c1', name: 'bash', arguments: '{"command":"rm -rf /tmp/a"}' } },
    { type: 'tool/result', seq: 13, time: 1004, data: { message: { source: { kind: 'tool', callId: 'c1' }, content: [{ type: 'tool-result', isError: false }] } } },
    { type: 'assistant/message', seq: 14, time: 1005, data: { turn: 1, step: 1, usage: { inputTokens: 1000, outputTokens: 100 } } },
    { type: 'turn/end', seq: 15, time: 1006, data: { turn: 1 } },
    { type: 'turn/start', seq: 19, time: 1007, data: { turn: 2 } },
    { type: 'user/message', seq: 20, time: 1008, data: { source: { kind: 'skill-invocation', name: 'skill-b' } } },
    // 落在窗口 B [20,∞) 内：一次安全命令（不该产生 finding）+ 一笔 usage。
    { type: 'tool/call', seq: 22, time: 1009, data: { turn: 2, step: 1, callId: 'c2', name: 'bash', arguments: '{"command":"ls"}' } },
    { type: 'tool/result', seq: 23, time: 1010, data: { message: { source: { kind: 'tool', callId: 'c2' }, content: [{ type: 'tool-result', isError: false }] } } },
    { type: 'assistant/message', seq: 24, time: 1011, data: { turn: 2, step: 1, usage: { inputTokens: 500, outputTokens: 50 } } },
    { type: 'turn/end', seq: 25, time: 1012, data: { turn: 2 } },
  ]
  let skAttrState = skAttr.init()
  for (const event of skAttrEvents) skAttrState = skAttr.apply(skAttrState, event)
  const skAttrView = skAttr.view(skAttrState)
  if (skAttrView.length !== 2) fail(`skillAttribution should have 2 windows (one per invocation), got ${JSON.stringify(skAttrView)}`)
  const [winA, winB] = [...skAttrView].sort((a, b) => a.seq - b.seq)
  if (winA.seq !== 10) fail(`第一个窗口应锚在 seq=10（skill-a 的调用位置），实际 ${winA.seq}`)
  if (winA.findings !== 1) fail(`窗口 A [10,20) 内的 rm -rf 应记 1 条 finding，实际 ${winA.findings}`)
  if (winA.tool_calls !== 1) fail(`窗口 A 内应有 1 次工具调用（seq=12 的 bash），实际 ${winA.tool_calls}`)
  const expectTokensA = 1000 + 100
  if (winA.tokens !== expectTokensA) fail(`窗口 A 的 tokens 应为 ${expectTokensA}（seq=24 的 usage 在窗口外不计入），实际 ${winA.tokens}`)
  if (winB.seq !== 20) fail(`第二个窗口应锚在 seq=20（skill-b 的调用位置），实际 ${winB.seq}`)
  if (winB.findings !== 0) fail(`窗口 B 内只有安全命令，findings 应为 0（测到了、真的是 0，不是 null），实际 ${winB.findings}`)
  if (winB.tool_calls !== 1) fail(`窗口 B 内应有 1 次工具调用（seq=22 的 ls），实际 ${winB.tool_calls}`)
  const expectTokensB = 500 + 50
  if (winB.tokens !== expectTokensB) fail(`窗口 B（开区间到会话末尾）的 tokens 应为 ${expectTokensB}，实际 ${winB.tokens}`)
  ok('skillAttribution：按 [本次调用.seq, 下一次调用.seq) 正确切分区间，findings/工具调用/token 各自归到对应窗口，最后一个窗口开区间到会话末尾')
}

// ---------------------------------------------------------------------------
// subagentSpawns.duration_ms（用户观察到原生 DSH UI 会显示子代理运行了多久，
// 促成这次补充）：eventSpanMs 读子会话**自己**的完整事件流，取首尾 time 之差。
// 真实走一遍 locateSession → zstd 多帧解压这条路径，不是在投影层面直接注入
// 一个假的 duration_ms——那样测不出文件定位/解压这段真会出错的路径。
// ---------------------------------------------------------------------------
const AGENT_ID = '39f63b04-416d-4787-97a5-2963769019d0'
const dshHome = mkdtempSync(join(tmpdir(), 'sv-verify-host-'))
const sessionDir = join(dshHome, 'sessions', 'ws1', AGENT_ID)
mkdirSync(sessionDir, { recursive: true })
const subEvents = [
  { type: 'session/created', seq: 0, time: 1000, data: {} },
  { type: 'assistant/chunk', seq: 1, time: 6500, data: { turn: 1, step: 1, chunk: { type: 'usage', usage: { inputTokens: 10 } } } },
]
const subJsonl = subEvents.map(e => JSON.stringify(e)).join('\n') + '\n'
writeFileSync(join(sessionDir, 'session.jsonl.zstd'), zstdCompressSync(Buffer.from(subJsonl, 'utf8')))
const origDshHome = process.env.DSH_HOME
process.env.DSH_HOME = dshHome

const ss = defs['subagentSpawns']
if (ss.stateVersion !== 2) fail(`subagentSpawns stateVersion should be 2 (schema added duration_ms), got ${ss.stateVersion}`)
let ssState = ss.init()
const ssEvents = [
  { type: 'tool/call', seq: 1, time: 1000, data: { turn: 22, step: 1, callId: 'c1', name: 'subagent', arguments: '{"description":"real fixture"}' } },
  {
    type: 'tool/result', seq: 2, time: 1010,
    data: {
      message: {
        source: { kind: 'tool', callId: 'c1' },
        content: [{ type: 'tool-result', content: [{ type: 'text', text: `started subagent ${AGENT_ID}` }] }],
      },
    },
  },
]
for (const event of ssEvents) ssState = ss.apply(ssState, event)
const ssView = ss.view(ssState)
if (origDshHome === undefined) delete process.env.DSH_HOME
else process.env.DSH_HOME = origDshHome

if (ssView.spawns.length !== 1 || ssView.spawns[0].agent_id !== AGENT_ID) {
  fail(`subagentSpawns wiring broken: ${JSON.stringify(ssView.spawns)}`)
}
if (ssView.spawns[0].duration_ms !== 5500) {
  fail(`subagentSpawns: duration_ms should be 5500 (real zstd round-trip: last time 6500 − first time 1000), got ${ssView.spawns[0].duration_ms}`)
}
ok('subagentSpawns: duration_ms 走真实的 locateSession → zstd 多帧解压路径算出子会话时间跨度（5500ms）——原生 DSH UI 显示的就是这个数字')

console.log('\n[verify-host] ALL CHECKS PASSED — host projections are cwd- and model-aware')
