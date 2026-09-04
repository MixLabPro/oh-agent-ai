// 时间线聚合数学的直接断言。
//
// 为什么单独一个脚本而不是并进 verify-render：手写 SVG 的风险是**算错了也
// 不报错**——比例尺歪了、峰值被平均抹平了、缺口被连成直线了，渲染都成功，
// 只有人眼能看出来。通过渲染结果反推等于一次测两件事（数学 + 组件），红了
// 说不清坏的是哪一件。所以 buildTimeline 从 __pure 直接取出来测。
//
//   node scripts/verify-timeline.mjs

import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import React from 'react'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function fail(msg) {
  console.error(`\n[verify-timeline] FAIL: ${msg}`)
  process.exitCode = 1
  throw new Error(msg)
}
function ok(msg) { console.log(`[verify-timeline] ok: ${msg}`) }

const code = readFileSync(resolve(root, 'lib/client.cjs'), 'utf8')
let handoff
globalThis.window = globalThis
globalThis.window.__ModuleLoader__ = { load: (h) => { handoff = h } }
new Function(code)()
const exports_ = handoff.factory((s) => (s === 'react' ? React : undefined))
const pure = exports_.__pure
if (!pure || typeof pure.buildTimeline !== 'function') fail('__pure.buildTimeline 没导出')
const { buildTimeline, modelSwitchEvents, nearestPoint, requestOrdinal } = pure

// 造行：[context_tokens | null, turn]，seq 从 100 递增。
const mkRows = (specs, win = 1000000, model = 'pro') => specs.map(([ctx, turn], i) => ({
  request_seq: i + 1, seq: 100 + i, turn: turn ?? i + 1, model,
  context_window: win, context_tokens: ctx,
  uncached_input_tokens: ctx === null ? null : ctx, output_tokens: ctx === null ? null : 10,
  cache_read_tokens: ctx === null ? null : 0,
}))

const countM = (path) => (path.match(/M/g) || []).length

// ── 1. 缺口必须断开，不能连直线 ────────────────────────────────────
// 中间整段缺 context_tokens 时，连过去会画出一条**根本没测过**的斜线。
{
  const rows = mkRows([[100, 1], [200, 2], [null, 3], [null, 4], [300, 5], [400, 6]])
  const tl = buildTimeline({ rows, events: [], mode: 'context', maxBuckets: 6 })
  if (countM(tl.path) !== 2) {
    fail(`缺口处应断成两段（两个 M），实际 ${countM(tl.path)} 个; path=${tl.path}`)
  }
  if (tl.gaps !== 2) fail(`应报出 2 个断桶，实际 ${tl.gaps}`)
  if (tl.measured !== 4 || tl.total !== 6) fail(`measured/total 应为 4/6，实际 ${tl.measured}/${tl.total}`)
  ok('缺口断开：中间两行没测到 → path 断成两段，measured 老实报 4/6')
}

// 反向：没有缺口时必须是一条连通的线，不能被拆散。
{
  const rows = mkRows([[100, 1], [200, 2], [300, 3], [400, 4]])
  const tl = buildTimeline({ rows, events: [], mode: 'context', maxBuckets: 4 })
  if (countM(tl.path) !== 1) fail(`无缺口时应是一段连通折线，实际 ${countM(tl.path)} 段`)
  if (tl.gaps !== 0) fail(`无缺口时 gaps 应为 0，实际 ${tl.gaps}`)
  ok('无缺口时是一条连通折线（对照组）')
}

// ── 2. 桶内取最大值，不是平均 ──────────────────────────────────────
// 这条曲线是用来找峰值的。取平均会把一次爆掉的请求抹成看不见——而那一次
// 恰恰是用户打开这个 tab 要找的东西。
{
  // 10 行压成 2 桶：第一桶含一个尖峰 900，其余都是 100。
  const rows = mkRows([[100, 1], [900, 2], [100, 3], [100, 4], [100, 5],
                       [100, 6], [100, 7], [100, 8], [100, 9], [100, 10]], 1000)
  const tl = buildTimeline({ rows, events: [], mode: 'context', maxBuckets: 2 })
  const { curveTop, curveBottom } = tl.geometry
  // 尖峰 900 / yMax 1000 → y 应贴近 curveTop；若取平均（约 260）则会在中下部。
  const ys = (tl.path.match(/[ML]\S+ (\S+)/g) || []).map(s => parseFloat(s.split(' ')[1]))
  const top = Math.min(...ys)
  const expectPeak = curveBottom - (900 / 1000) * (curveBottom - curveTop)
  if (Math.abs(top - expectPeak) > 1) {
    fail(`桶内应取最大值（900 → y≈${expectPeak.toFixed(1)}），实际最高点 y=${top}——像是取了平均`)
  }
  ok('桶内取最大值：尖峰在聚合后仍然是尖峰，没被平均抹平')
}

// ── 3. 事件不参与聚合，一个都不能丢 ────────────────────────────────
// 曲线可以抽稀，风险标记不行。687 行压到 220 桶时，若事件也跟着抽稀，
// 一次 rm -rf 会凭空消失。
{
  const rows = mkRows(Array.from({ length: 300 }, (_, i) => [1000 + i, i + 1]))
  // 30 个事件，全落在不同 turn 上，聚合后必须一条不少。
  const events = Array.from({ length: 30 }, (_, k) => ({
    kind: 'risk', severity: 'critical', seq: 100 + k * 10, turn: k * 10 + 1,
    label: 'SV601', targetId: 'f-' + k,
  }))
  const tl = buildTimeline({ rows, events, mode: 'context', maxBuckets: 20 })
  if (tl.buckets !== 20) fail(`应聚合成 20 桶，实际 ${tl.buckets}`)
  const totalMarked = tl.events.reduce((s, e) => s + e.count, 0)
  if (totalMarked !== 30) {
    fail(`聚合到 20 桶后事件总数必须仍是 30，实际 ${totalMarked}——曲线可以抽稀，事件不行`)
  }
  const members = new Set(tl.events.flatMap(e => e.members))
  if (members.size !== 30) fail(`30 条事件的 targetId 应全部保留，实际 ${members.size}`)
  ok('事件不参与聚合：300 行压到 20 桶，30 个事件标记一条不少')
}

// ── 3b. P1-07 问题 4：超过 1,000 个请求点（§8.1/AC-04 的具体阈值）时，
// 曲线降采样但 finding / 模型切换 / compaction 事件一个不丢，且每个都仍
// 落在某个可寻址的 turn 上（键盘逐事件遍历的前提——事件定位不到会被直接
// 丢弃，见 buildTimeline 里"定位不到就丢掉"那段，丢了就等于键盘也够不着）。
{
  const N = 1200
  const rows = mkRows(Array.from({ length: N }, (_, i) => [1000 + (i % 50) * 37, i + 1]),
    1000000, 'pro')
  // 模型在第 400/800 个请求处切换——modelSwitchEvents 在真实场景下由这个
  // 纯函数从 rows 推出来，不是手写的事件列表。
  for (let i = 400; i < 800; i++) rows[i].model = 'flash'
  const modelEvents = modelSwitchEvents(rows)
  // 20 条 finding 风险事件 + 8 次 compaction，分散在不同 turn 上（不触发同
  // turn 合并），验证的是"抽稀曲线不抽稀事件"在千级规模下依然成立，不只是
  // 300 行这种小样本的巧合。
  const riskEvents = Array.from({ length: 20 }, (_, k) => ({
    kind: 'risk', severity: 'critical', seq: 100 + k * 50, turn: k * 50 + 1,
    label: 'SV601', targetId: 'f-risk-' + k,
  }))
  const compactionEvents = Array.from({ length: 8 }, (_, k) => ({
    kind: 'compaction', seq: 100 + k * 140, turn: k * 140 + 3, label: 'prune', targetId: null,
  }))
  const events = [...riskEvents, ...compactionEvents, ...modelEvents]
  const tl = buildTimeline({ rows, events, mode: 'context' }) // 不传 maxBuckets：走真实默认值
  if (tl.total !== N) fail(`应有 ${N} 个请求点，实际 ${tl.total}`)
  if (tl.buckets !== 220) fail(`超过 1,000 点应按默认桶数（220）降采样，实际 ${tl.buckets} 桶——DEFAULT_BUCKETS 是否被改了`)
  const riskCount = tl.events.filter(e => e.kind === 'risk').reduce((s, e) => s + e.count, 0)
  const compCount = tl.events.filter(e => e.kind === 'compaction').reduce((s, e) => s + e.count, 0)
  const modelCount = tl.events.filter(e => e.kind === 'model').reduce((s, e) => s + e.count, 0)
  if (riskCount !== 20) fail(`>1000 点降采样后风险事件应仍是 20 条，实际 ${riskCount}`)
  if (compCount !== 8) fail(`>1000 点降采样后 compaction 事件应仍是 8 条，实际 ${compCount}`)
  if (modelCount !== modelEvents.length) fail(`>1000 点降采样后模型切换事件应仍是 ${modelEvents.length} 条，实际 ${modelCount}`)
  // 每条风险事件的 targetId 都要能在 members 里找到——这是"键盘可达性保留"
  // 的静态代理：定位不到的事件在 buildTimeline 内部直接被丢弃，不会出现在
  // members 里，丢了就意味着这个 finding 从时间线上完全够不着。
  const members = new Set(tl.events.filter(e => e.kind === 'risk').flatMap(e => e.members))
  if (members.size !== 20) fail(`20 条风险事件的 targetId 应全部可寻址，实际 ${members.size}`)
  ok(`>1000 请求点（${N} 个）降采样到 ${tl.buckets} 桶：风险×20/compaction×8/模型切换×${modelEvents.length} 事件一条不丢，键盘可达性（targetId 可寻址）保留`)
}

// ── 4. 同 turn 同类事件合并成一个标记 ──────────────────────────────
// 真实会话里 10 次 prune 全在 T85。不合并就是十个像素级重叠的点，点不中
// 也读不出；合并后 count=10，仍然一条不丢（上一条测试保证）。
{
  const rows = mkRows([[100, 85], [200, 85], [300, 86]])
  const events = Array.from({ length: 10 }, (_, k) => ({
    kind: 'compaction', seq: 100, turn: 85, label: 'prune', targetId: null,
  }))
  const tl = buildTimeline({ rows, events, mode: 'context', maxBuckets: 3 })
  const comp = tl.events.filter(e => e.kind === 'compaction')
  if (comp.length !== 1) fail(`同 turn 的 10 次 prune 应合并成 1 个标记，实际 ${comp.length} 个`)
  if (comp[0].count !== 10) fail(`合并后 count 应为 10，实际 ${comp[0].count}`)
  ok('同 turn 同类事件合并：T85 的 10 次 prune → 1 个标记 ×10')
}

// 合并组的代表取严重度最高的那条——点击落到最该看的那条上。
{
  const rows = mkRows([[100, 5], [200, 6]])
  const tl = buildTimeline({
    rows, mode: 'context', maxBuckets: 2,
    events: [
      { kind: 'risk', severity: 'info', seq: 100, turn: 5, label: 'SV609', targetId: 'f-info' },
      { kind: 'risk', severity: 'critical', seq: 100, turn: 5, label: 'SV601', targetId: 'f-crit' },
      { kind: 'risk', severity: 'warning', seq: 100, turn: 5, label: 'SV610', targetId: 'f-warn' },
    ],
  })
  const g = tl.events.find(e => e.kind === 'risk')
  if (g.severity !== 'critical' || g.targetId !== 'f-crit') {
    fail(`合并组应以最高严重度为代表，实际 severity=${g.severity} target=${g.targetId}`)
  }
  if (g.members.length !== 3) fail(`合并组应保留全部 3 个成员，实际 ${g.members.length}`)
  ok('合并组以最高严重度为代表，成员一个不丢')
}

// T9 回归：skillMode 必须活过 buildTimeline 的合并阶段——原来构造合并组
// 代表事件的那个对象字面量没有带上 skillMode 这个字段，`(e as any).skillMode`
// 在渲染层永远是 undefined，'explicit' 触发的技能在时间线上其实一直画的是
// 圆点（跟 model_selected 视觉上无法区分），且没有任何测试断言过实际的 `d=`
// 路径内容，所以这个缺口一直没被测出来。D9 顺手一起补上，不是新引入的。
{
  const rows = mkRows([[100, 5]])
  const tl = buildTimeline({
    rows, mode: 'context', maxBuckets: 1,
    events: [{ kind: 'skill', seq: 100, turn: 5, label: 'release-notes', targetId: null, skillMode: 'explicit' }],
  })
  const g = tl.events.find(e => e.kind === 'skill')
  if (g.skillMode !== 'explicit') {
    fail(`skillMode 必须原样活过 buildTimeline，实际 ${g.skillMode}（渲染层靠它选菱形还是圆点）`)
  }
  ok('T9 回归修复：单条 skill 事件的 skillMode 活过 buildTimeline 合并阶段')
}

// 同一 turn 两条不同 skillMode 的 skill 事件合并：严重度相同（skill 事件都
// 不带 severity）时第一条留任代表，skillMode 也应该是第一条的——不能被后
// 来的覆盖，也不能变成 undefined。
{
  const rows = mkRows([[100, 5]])
  const tl = buildTimeline({
    rows, mode: 'context', maxBuckets: 1,
    events: [
      { kind: 'skill', seq: 100, turn: 5, label: 'release-notes', targetId: null, skillMode: 'explicit' },
      { kind: 'skill', seq: 100, turn: 5, label: 'commit-summarizer', targetId: null, skillMode: 'model_selected' },
    ],
  })
  const g = tl.events.find(e => e.kind === 'skill')
  if (g.count !== 2) fail(`同 turn 两条 skill 事件应合并成 1 个标记 ×2，实际 count=${g.count}`)
  if (g.skillMode !== 'explicit') fail(`合并后代表事件保留第一条的 skillMode，实际 ${g.skillMode}`)
  ok('同 turn 两条 skill 事件合并：count 正确累加，代表事件的 skillMode 不丢')
}

// D9：'slow' 是一个普通的 EventKind，跟 risk/waste/compaction 走同一条聚合
// 路径——这里只需确认它真的能定位、合并、不被过滤掉，形状由渲染层决定，
// 几何层不关心。
{
  const rows = mkRows([[100, 7], [200, 8]])
  const tl = buildTimeline({
    rows, mode: 'context', maxBuckets: 2,
    events: [
      { kind: 'slow', seq: 100, turn: 7, label: 'bash · 42s', targetId: null },
      { kind: 'slow', seq: 100, turn: 7, label: 'grep · 30s', targetId: null },
    ],
  })
  const g = tl.events.filter(e => e.kind === 'slow')
  if (g.length !== 1 || g[0].count !== 2) {
    fail(`同 turn 的两条 slow 事件应合并成 1 个标记 ×2，实际 ${JSON.stringify(g)}`)
  }
  ok("D9：'slow' 事件走通用聚合路径（定位/合并与 risk/waste 同一套，不是特例）")
}

// ── 5. 定位不到的事件宁可不画 ──────────────────────────────────────
// 画在一个猜的位置上比不画更糟：用户会照着那个位置去找证据。
{
  const rows = mkRows([[100, 1], [200, 2]])
  const tl = buildTimeline({
    rows, mode: 'context', maxBuckets: 2,
    events: [{ kind: 'risk', severity: 'critical', seq: null, turn: 999, label: 'x', targetId: 'f-x' }],
  })
  if (tl.events.length !== 0) fail(`turn 999 不在这份 requests 里，不该被画到任何位置`)
  ok('定位不到的事件不画（它仍在下方队列里，不会消失）')
}

// ── 6. y 轴上限：有 contextWindow 用它，没有就退回数据最大值并标记 ──
{
  const withWin = buildTimeline({ rows: mkRows([[400, 1], [800, 2]], 1000), events: [], mode: 'context' })
  if (withWin.yMax !== 1000 || withWin.yMaxIsData) fail(`有 contextWindow 时 yMax 应为 1000 且 yMaxIsData=false`)
  const noWin = buildTimeline({ rows: mkRows([[400, 1], [800, 2]], null), events: [], mode: 'context' })
  if (noWin.yMax !== 800 || !noWin.yMaxIsData) {
    fail(`没有 contextWindow 时应退回数据最大值 800 并标记 yMaxIsData，实际 yMax=${noWin.yMax} flag=${noWin.yMaxIsData}`)
  }
  ok('y 轴上限：有 contextWindow 用它，没有就退回数据最大值并标记（不编默认上限）')
}

// ── 7. tokens 模式是单调累计，缺行不产生缺口 ───────────────────────
// 缺的是"这一笔加了多少"，不是"总数归零了"——所以累计曲线沿用上一格，
// 缺口改由 measured/total 披露。
{
  const rows = mkRows([[100, 1], [null, 2], [100, 3]])
  const tl = buildTimeline({ rows, events: [], mode: 'tokens', maxBuckets: 3 })
  if (countM(tl.path) !== 1) fail(`累计曲线不该因缺行断开，实际 ${countM(tl.path)} 段`)
  if (tl.measured !== 2 || tl.total !== 3) fail(`tokens 模式也要报出 2/3 的缺口，实际 ${tl.measured}/${tl.total}`)
  const ys = (tl.path.match(/[ML]\S+ (\S+)/g) || []).map(s => parseFloat(s.split(' ')[1]))
  for (let i = 1; i < ys.length; i++) if (ys[i] > ys[i - 1] + 0.01) fail('累计曲线不该下降（y 递减即值递增）')
  ok('tokens 模式：单调累计，缺行不断开但仍报出 2/3 的缺口')
}

// ── 8. 空数据返回 null，不返回一个空壳 ─────────────────────────────
{
  if (buildTimeline({ rows: [], events: [], mode: 'context' }) !== null) fail('空 rows 应返回 null')
  const allNull = buildTimeline({ rows: mkRows([[null, 1], [null, 2]]), events: [], mode: 'context' })
  if (allNull !== null) fail('全部行都没测到时应返回 null，而不是一条贴底的假曲线')
  ok('没有可画的数据时返回 null，不摆一条贴底的假曲线')
}

// ── 9. 模型切换点从 requests 推出 ──────────────────────────────────
{
  const rows = [...mkRows([[1, 1], [2, 2]], 1000, 'pro'), ...mkRows([[3, 3]], 1000, 'flash'),
                ...mkRows([[4, 4]], 1000, 'pro')]
  rows.forEach((r, i) => { r.seq = 100 + i; r.request_seq = i + 1 })
  const sw = modelSwitchEvents(rows)
  if (sw.length !== 2) fail(`pro→flash→pro 应推出 2 次切换，实际 ${sw.length}`)
  ok('模型切换点从相邻行 model 变化推出（pro→flash→pro = 2 次）')
}

// ── 10. 切换纵轴时事件位置不变（FR-04 / AC）──────────────────────
// 事件定位只看行下标，与纵轴无关——但这是"应该"，得有测试钉着。
{
  const rows = mkRows(Array.from({ length: 40 }, (_, i) => [1000 + i * 10, i + 1]))
  rows.forEach((r, i) => { r.cumulative_cost = (i + 1) * 0.5 })
  const events = [
    { kind: 'risk', severity: 'critical', seq: 105, turn: 6, label: 'SV601', targetId: 'f-1' },
    { kind: 'compaction', seq: 130, turn: 31, label: 'prune', targetId: null },
  ]
  const xs = ['context', 'tokens', 'cost'].map(mode =>
    buildTimeline({ rows, events, mode, maxBuckets: 20 }).events.map(e => e.x))
  if (JSON.stringify(xs[0]) !== JSON.stringify(xs[1]) || JSON.stringify(xs[0]) !== JSON.stringify(xs[2])) {
    fail(`切换纵轴后事件位置变了：context=${xs[0]} tokens=${xs[1]} cost=${xs[2]}`)
  }
  ok('切换 [上下文]/[Token]/[费用] 纵轴，事件标记位置逐像素不变')
}

// ── 11. 费用纵轴是宿主算好的累计值，浏览器不重算 ─────────────────
{
  const rows = mkRows([[100, 1], [200, 2], [300, 3]])
  rows[0].cumulative_cost = 1.5; rows[1].cumulative_cost = null; rows[2].cumulative_cost = 4.0
  const tl = buildTimeline({ rows, events: [], mode: 'cost', maxBuckets: 3 })
  // 中间那笔宿主没计价（缺时间戳判不出高峰）→ 累计原地不动，**不断开**，
  // 缺口由 measured/total 披露。
  if (countM(tl.path) !== 1) fail(`费用累计曲线不该因某笔未计价而断开，实际 ${countM(tl.path)} 段`)
  if (tl.measured !== 2 || tl.total !== 3) fail(`费用模式应报出 2/3 的计价覆盖，实际 ${tl.measured}/${tl.total}`)
  if (Math.abs(tl.yMax - 4.0) > 1e-9) fail(`费用纵轴上限应是累计终值 4.0，实际 ${tl.yMax}`)
  ok('费用纵轴直接用宿主的累计值：未计价的那笔原地不动、不断开，覆盖率如实报 2/3')
}

// ── 12. 游标吸附到真实画出的点，不按 x 插值 ──────────────────────
// 曲线画的是桶内最大值；游标停在两点之间再插一个数出来，等于报一个从没
// 测过的值。所以吸附到 points，且每个点要能说出自己取自哪一行。
{
  const rows = mkRows(Array.from({ length: 100 }, (_, i) => [1000 + i * 7, Math.floor(i / 10) + 1]))
  const tl = buildTimeline({ rows, events: [], mode: 'context', maxBuckets: 10 })
  if (tl.points.length !== 10) fail(`应画出 10 个点（桶数），实际 ${tl.points.length}`)
  for (const p of tl.points) {
    if (!(p.idx >= p.lo && p.idx < p.hi)) fail(`点的 idx=${p.idx} 应落在它自己的桶区间 [${p.lo},${p.hi})`)
    // 桶内取最大值 → 这一行的值必须是该区间里最大的
    let max = -Infinity
    for (let i = p.lo; i < p.hi; i++) max = Math.max(max, rows[i].context_tokens)
    if (rows[p.idx].context_tokens !== max) fail(`点应指向桶内最大值所在的行`)
  }
  // nearestPoint 命中最近的那个，且**只会**返回已画出的点
  const mid = (tl.points[3].x + tl.points[4].x) / 2
  const hit = nearestPoint(tl.points, mid + 0.01)
  if (hit !== 4) fail(`x 落在 3/4 之间偏右，应吸附到 4，实际 ${hit}`)
  if (nearestPoint([], 100) !== -1) fail('没有点时应返回 -1')
  ok('游标吸附到真实画出的点：每个点指向其桶内最大值所在的行，不插值')
}

// ── 13. tooltip 的 `turn · request n/m` 口径 ─────────────────────
// PRD FR-04 明确要求 tooltip 显示 turn · request n/m · requestSeq。
// n/m 是**该 turn 内**的序号与总数，不是全会话的。
{
  const rows = mkRows([[1, 5], [2, 5], [3, 5], [4, 6], [5, 6]])
  const got = [0, 1, 2, 3, 4].map(i => requestOrdinal(rows, i))
  const want = [[1, 3], [2, 3], [3, 3], [1, 2], [2, 2]]
  for (let i = 0; i < want.length; i++) {
    if (got[i].n !== want[i][0] || got[i].m !== want[i][1]) {
      fail(`第 ${i} 行应是 ${want[i][0]}/${want[i][1]}，实际 ${got[i].n}/${got[i].m}`)
    }
  }
  const noTurn = mkRows([[1, 1]]); noTurn[0].turn = null
  if (requestOrdinal(noTurn, 0) !== null) fail('turn 为空时应返回 null，不能编一个 1/1 出来')
  ok('requestOrdinal 给出 turn 内的 n/m（T5 三次、T6 两次），turn 缺失时返回 null')
}

console.log('\n[verify-timeline] ALL CHECKS PASSED — 聚合抽稀曲线、但不抽稀事件；缺数据留缺口不连线')
