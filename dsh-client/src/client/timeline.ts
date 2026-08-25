// 会话健康时间线的**全部算术**。这里是纯函数，不碰 React、不碰 DOM——
// 因为手写 SVG 真正的风险不是画不出来，是**比例尺算错了也不报错**：曲线歪了
// 没有任何测试会红，只有人眼看出来。把「数据 → path 字符串」隔离成可直接
// 下断言的函数，才把这个风险变回"有没有测试"的问题。
//
// 两条不能破的语义：
//   1. **曲线按显示宽度聚合，事件点一个不丢。**687 次请求压到 220 个桶是为了
//      画得动，但风险 / 压缩 / 模型切换的标记不参与聚合——抽稀曲线可以，抽掉
//      一次 rm -rf 不行。`eventsIn === eventsOut` 有测试钉着。
//   2. **缺数据留缺口，不连直线。**真实会话 687 行里有 13 行没有
//      context_tokens。把它们当 0 会让曲线砸到底，跳过它们直接连下一个点会
//      画出一条根本没测过的斜线——两种都是编数据。整桶都缺就断开。

export type TimelineMode = 'context' | 'tokens' | 'cost'

export interface TimelineRow {
  request_seq: number
  seq: number | null
  turn: number | null
  model: string
  context_window: number | null
  context_tokens: number | null
  uncached_input_tokens: number | null
  output_tokens: number | null
  cache_read_tokens: number | null
  /** 截至该请求的累计费用；宿主 costReport.series 合并进来，可空。 */
  cumulative_cost?: number | null
}

export type EventKind = 'risk' | 'waste' | 'compaction' | 'model' | 'subagent' | 'skill' | 'slow'

export interface TimelineEventInput {
  kind: EventKind
  /** 排序/严重度用；compaction 与 model 没有严重度。 */
  severity?: string
  seq: number | null
  turn: number | null
  label: string
  /** 点击后要聚焦的 finding 行 id；没有对应行时为 null。 */
  targetId: string | null
  /** T9：skill 事件的触发方式，决定在时间线上用什么形状。 */
  skillMode?: 'explicit' | 'model_selected'
}

export interface TimelineEvent {
  kind: EventKind
  severity?: string
  x: number
  turn: number | null
  label: string
  targetId: string | null
  /** 同一 turn 同一类的事件合并成一个标记；count > 1 时展示 ×N。 */
  count: number
  /** 合并进来的全部 targetId（含自己），供"展开这一组"用。 */
  members: string[]
  /** T9：skill 事件的触发方式，决定渲染层用什么形状。 */
  skillMode?: 'explicit' | 'model_selected'
}

export interface TimelineGeometry {
  w: number
  h: number
  curveTop: number
  curveBottom: number
  eventY: number
  x0: number
  x1: number
}

/** 曲线上真实画出的一个点。hover/键盘游标吸附到这些点上——**不是吸附到任意
 *  鼠标位置**：曲线画的是桶内最大值，游标停在两点之间再插值出一个数，就是
 *  报了一个从没测过的值。 */
export interface TimelinePoint {
  x: number
  y: number
  /** 这个点取自哪一行（桶内最大值所在的那行）。 */
  idx: number
  /** 这个桶覆盖的行区间 [lo, hi)——tooltip 要说清它代表了几次请求。 */
  lo: number
  hi: number
}

export interface Timeline {
  /** 折线；含缺口时是多段 `M…L…`，不是一条连通的线。 */
  path: string
  /** 画出来的点，按 x 递增。游标只能停在这些点上。 */
  points: TimelinePoint[]
  /** 面积填充；每个连通段各自闭合到基线，缺口处不填。 */
  area: string
  events: TimelineEvent[]
  /** y 轴上限：context 模式是 contextWindow，tokens 模式是累计最大值。 */
  yMax: number
  /** contextWindow 缺失时为 true——此时 yMax 退化成数据最大值，不是真上限。 */
  yMaxIsData: boolean
  /** 参与曲线的行数 / 总行数。两者不等就必须在 UI 上说出来。 */
  measured: number
  total: number
  /** 聚合成了多少个桶；等于 total 时说明没聚合。 */
  buckets: number
  /** 断开的桶数。 */
  gaps: number
  geometry: TimelineGeometry
  turnTicks: { x: number; label: string }[]
}

const GEO: TimelineGeometry = {
  w: 1000, h: 190,
  curveTop: 10, curveBottom: 150,
  eventY: 172,
  x0: 6, x1: 994,
}

/** 默认桶数：viewBox 宽 1000，约 4.5 单位一个桶——再密画不出差别，只是白算。 */
export const DEFAULT_BUCKETS = 220

function xAt(i: number, n: number): number {
  if (n <= 1) return (GEO.x0 + GEO.x1) / 2
  return GEO.x0 + (i / (n - 1)) * (GEO.x1 - GEO.x0)
}

/**
 * 每行在当前模式下的值。null = 这一行**没测到**（不是 0）。
 * - context：provider 实测的该次请求上下文占用。
 * - tokens：该次请求消耗的 token 总量，外层再累加成累计曲线。
 * - cost：**已经是累计值**，由宿主逐请求算好（core 判 is_peak、宿主乘价格）
 *   直接挂在行上，这里不再累加，也不在浏览器里重算任何单价。
 */
function valueOf(r: TimelineRow, mode: TimelineMode): number | null {
  if (mode === 'context') return r.context_tokens ?? null
  if (mode === 'cost') return r.cumulative_cost ?? null
  const parts = [r.uncached_input_tokens, r.output_tokens, r.cache_read_tokens]
  if (parts.every(v => v == null)) return null
  return parts.reduce((s: number, v) => s + (v || 0), 0)
}

/** 找到 seq 落在哪一行：最后一个 row.seq <= seq 的行。行按 seq 递增。 */
function indexForSeq(rows: TimelineRow[], seq: number): number | null {
  let lo = 0, hi = rows.length - 1, found: number | null = null
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    const s = rows[mid].seq
    if (s == null) { lo = mid + 1; continue }
    if (s <= seq) { found = mid; lo = mid + 1 } else { hi = mid - 1 }
  }
  return found
}

function indexForTurn(rows: TimelineRow[], turn: number): number | null {
  for (let i = 0; i < rows.length; i++) if (rows[i].turn === turn) return i
  return null
}

/** 从 requests 里推出模型切换点：相邻两行 model 不同即为一次切换。 */
export function modelSwitchEvents(rows: TimelineRow[]): TimelineEventInput[] {
  const out: TimelineEventInput[] = []
  for (let i = 1; i < rows.length; i++) {
    if (rows[i].model && rows[i].model !== rows[i - 1].model) {
      out.push({ kind: 'model', seq: rows[i].seq, turn: rows[i].turn, label: rows[i].model, targetId: null })
    }
  }
  return out
}

export function buildTimeline(opts: {
  rows: TimelineRow[]
  events: TimelineEventInput[]
  mode: TimelineMode
  maxBuckets?: number
}): Timeline | null {
  const { rows, mode } = opts
  const n = rows.length
  if (n === 0) return null

  // ── 1. 逐行取值。tokens 模式先累加成单调序列再聚合。 ──
  // 累计曲线在缺数据的行上**不产生缺口**：缺的是"这一笔加了多少"，不是"总数
  // 归零了"。所以缺行沿用上一格的累计值，缺口改由 measured/total 披露。
  const series: (number | null)[] = new Array(n)
  let measured = 0
  if (mode === 'tokens') {
    let acc = 0
    let seen = false
    for (let i = 0; i < n; i++) {
      const v = valueOf(rows[i], mode)
      if (v != null) { acc += v; measured++; seen = true }
      series[i] = seen ? acc : null
    }
  } else if (mode === 'cost') {
    // 已经是累计值：缺的那几笔宿主没计价（is_peak 为 null），累计值原地不动，
    // 所以**不产生缺口**——缺口由 measured/total 披露，与 tokens 模式同理。
    let last: number | null = null
    for (let i = 0; i < n; i++) {
      const v = valueOf(rows[i], mode)
      if (v != null) { measured++; last = v }
      series[i] = last
    }
  } else {
    for (let i = 0; i < n; i++) {
      const v = valueOf(rows[i], mode)
      if (v != null) measured++
      series[i] = v
    }
  }
  if (measured === 0) return null

  // ── 2. y 轴上限 ──
  let dataMax = 0
  for (const v of series) if (v != null && v > dataMax) dataMax = v
  let yMax = dataMax
  let yMaxIsData = true
  if (mode === 'context') {
    let win = 0
    for (const r of rows) if (r.context_window && r.context_window > win) win = r.context_window
    // 上限本来就随模型变；拿不到就退回数据最大值并标记，**不编一个默认上限**。
    if (win > 0) { yMax = Math.max(win, dataMax); yMaxIsData = false }
  }
  if (yMax <= 0) yMax = 1

  // ── 3. 聚合。桶内取**最大值**而不是平均：这条曲线是用来找峰值的，
  //      平均会把一次爆掉的请求抹平成看不见。整桶全缺 → 断开。 ──
  const maxBuckets = opts.maxBuckets ?? DEFAULT_BUCKETS
  const buckets = Math.max(1, Math.min(n, maxBuckets))
  const segments: TimelinePoint[][] = []
  let current: TimelinePoint[] = []
  let gaps = 0
  const yFor = (v: number) => GEO.curveBottom - (v / yMax) * (GEO.curveBottom - GEO.curveTop)

  for (let b = 0; b < buckets; b++) {
    const lo = Math.floor((b * n) / buckets)
    const hi = Math.max(lo + 1, Math.floor(((b + 1) * n) / buckets))
    let best: number | null = null
    let bestIdx = lo
    for (let i = lo; i < hi && i < n; i++) {
      const v = series[i]
      if (v == null) continue
      if (best === null || v > best) { best = v; bestIdx = i }
    }
    if (best === null) {
      if (current.length > 0) { segments.push(current); current = [] }
      gaps++
      continue
    }
    current.push({ x: xAt(bestIdx, n), y: yFor(best), idx: bestIdx, lo, hi: Math.min(hi, n) })
  }
  if (current.length > 0) segments.push(current)

  const path = segments.map(seg =>
    seg.map((p, i) => (i === 0 ? 'M' : 'L') + fmt(p.x) + ' ' + fmt(p.y)).join(' ')
  ).join(' ')
  // 单点段没有面积可填（一条零宽的竖线），跳过——否则会画出一根杂散的竖线。
  const area = segments.filter(seg => seg.length > 1).map(seg =>
    'M' + fmt(seg[0].x) + ' ' + fmt(GEO.curveBottom) + ' ' +
    seg.map(p => 'L' + fmt(p.x) + ' ' + fmt(p.y)).join(' ') +
    ' L' + fmt(seg[seg.length - 1].x) + ' ' + fmt(GEO.curveBottom) + ' Z'
  ).join(' ')

  // ── 4. 事件。**不参与聚合**——曲线可以抽稀，风险标记不行。 ──
  // 同一 turn 的同类事件合并成一个标记（真实会话里 10 次 prune 全在 T85，
  // 不合并就是十个像素级重叠的点，点不中也读不出）。
  const placed: TimelineEvent[] = []
  const byKey = new Map<string, TimelineEvent>()
  for (const e of opts.events) {
    let idx: number | null = null
    if (e.seq != null) idx = indexForSeq(rows, e.seq)
    if (idx == null && e.turn != null) idx = indexForTurn(rows, e.turn)
    // 定位不到就丢掉——**画在一个猜的位置上比不画更糟**，用户会照着那个
    // 位置去找证据。丢掉的这条仍然在下方队列里，不会消失。
    if (idx == null) continue
    const key = e.kind + '@' + (e.turn ?? ('i' + idx))
    const hit = byKey.get(key)
    if (hit) {
      hit.count++
      if (e.targetId) hit.members.push(e.targetId)
      // 合并组的代表取严重度最高的那条，点击落到它身上。
      if (rank(e.severity) < rank(hit.severity)) {
        hit.severity = e.severity
        hit.label = e.label
        if (e.targetId) hit.targetId = e.targetId
        // T9 遗漏过一次的坑：只换 severity/label/targetId 不换 skillMode，
        // 代表事件换了但形状还是上一个事件的——这里跟着代表一起换。
        if (e.skillMode) hit.skillMode = e.skillMode
      }
      continue
    }
    const ev: TimelineEvent = {
      kind: e.kind, severity: e.severity, x: xAt(idx, n), turn: e.turn,
      label: e.label, targetId: e.targetId, count: 1,
      members: e.targetId ? [e.targetId] : [],
      // T9：合并前是 undefined 就是 undefined——非 skill 事件本来就没有这个
      // 概念，不能填一个默认值假装"是 model_selected"。
      skillMode: e.skillMode,
    }
    byKey.set(key, ev)
    placed.push(ev)
  }
  placed.sort((a, b) => a.x - b.x)

  // ── 5. turn 刻度：横轴按请求走，但人读的是 turn。 ──
  const turnTicks: { x: number; label: string }[] = []
  const tickCount = Math.min(6, n)
  for (let k = 0; k < tickCount; k++) {
    const i = Math.round((k / Math.max(1, tickCount - 1)) * (n - 1))
    const turn = rows[i].turn
    if (turn == null) continue
    const label = 'T' + turn
    if (turnTicks.length > 0 && turnTicks[turnTicks.length - 1].label === label) continue
    turnTicks.push({ x: xAt(i, n), label })
  }

  const points = segments.flat()
  return {
    path, area, points, events: placed, yMax, yMaxIsData,
    measured, total: n, buckets, gaps,
    geometry: GEO, turnTicks,
  }
}

/**
 * 找到离给定 x 最近的**已画出的点**。返回 points 里的下标，没有点时返回 -1。
 *
 * 为什么吸附到点而不是按 x 反算行号：曲线画的是桶内最大值，游标停在两点之间
 * 再插值，等于报一个从没测过的值。宁可跳到最近的真实点。
 */
export function nearestPoint(points: TimelinePoint[], x: number): number {
  if (points.length === 0) return -1
  let best = 0
  let bestD = Math.abs(points[0].x - x)
  for (let i = 1; i < points.length; i++) {
    const d = Math.abs(points[i].x - x)
    if (d < bestD) { bestD = d; best = i }
  }
  return best
}

/**
 * 第 `idx` 行在它所属 turn 里是第几次请求 / 该 turn 共几次（PRD FR-04 要求
 * tooltip 显示 `turn · request n/m · requestSeq`）。turn 为空时返回 null。
 */
export function requestOrdinal(rows: TimelineRow[], idx: number): { n: number; m: number } | null {
  const turn = rows[idx]?.turn
  if (turn == null) return null
  let n = 0
  let m = 0
  for (let i = 0; i < rows.length; i++) {
    if (rows[i].turn !== turn) continue
    m++
    if (i <= idx) n++
  }
  return { n, m }
}

const SEV_RANK: Record<string, number> = { critical: 0, warning: 1, info: 2 }
function rank(sev: string | undefined): number {
  return sev && sev in SEV_RANK ? SEV_RANK[sev] : 3
}

/** 坐标保留一位小数——path 字符串体积减半，肉眼看不出差别。 */
function fmt(v: number): string {
  return (Math.round(v * 10) / 10).toString()
}
