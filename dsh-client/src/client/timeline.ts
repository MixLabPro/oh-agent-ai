// 会话健康时间线的**数据准备适配器**。这里不再有几何。
//
// 几何（比例尺/缺口/聚合/事件定位与合并/纵轴上限）全部在共享的
// `timeline-shared.cjs`（= src-tauri/ui/timeline.js 的字节锁步副本，见
// docs/TRAJECTORY_TIMELINE_SPEC.md §6「几何只写一份」）。本文件只做三件事：
//   1. 把宿主给的行（requests[]）按当前纵轴模式折成共享几何的 spec.points 单序列；
//   2. 把事件按 seq/turn 定位到行（seq 走二分、turn 走线性，定位不到就丢）；
//   3. 把共享 buildGeometry 的结构化结果原样交给渲染层。
//
// 留在这里的是**数据准备**（valueOf/indexForSeq/indexForTurn/modelSwitchEvents/
// requestOrdinal）与交互辅助的类型；nearestPoint 是纯几何命中测试，已下沉到
// 共享几何里再导出，这里不重写。
//
// 两条不能破的语义是共享几何守的，不是这里（spec §5 不变量 5）：
//   1. 曲线按显示宽度聚合抽稀，事件标记一个不丢（eventsIn === eventsOut）；
//   2. 缺数据留缺口不连直线（累计序列沿用上一格，缺口由 measured/total 披露）。

import { buildGeometry, nearestPoint } from './timeline-shared.cjs'
import type { SharedTimelinePoint, SharedTimelineEvent, SharedTimelineSeries } from './timeline-shared.cjs'

export { nearestPoint }

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

  // ── 1. 逐行取值 → 共享几何的 spec.points 单序列。 ──
  // 纵轴模式在共享几何里表达成序列语义（不在这里重算比例尺）：
  //   context: 原始值——缺值 null，断开；
  //   tokens:  每行 delta——'sum' 外层累加，缺行沿用上一格；
  //   cost:    宿主给好的累计值——'carry'，沿用但不**再累加**（再累一遍就双计）。
  const name = mode
  const values: (number | null)[] = new Array(n)
  let measured = 0
  for (let i = 0; i < n; i++) {
    const v = valueOf(rows[i], mode)
    if (v != null) measured++
    values[i] = v
  }
  if (measured === 0) return null

  const points: SharedTimelinePoint[] = rows.map((r, i) => ({
    ordinal: i,
    task_id: r.turn != null ? r.turn : null,
    values: { [name]: values[i] },
  }))

  // ── 2. 事件定位到行 → spec.events（ordinal = 行下标；合并键用输入事件的 turn）。 ──
  // 定位不到就丢——画在一个猜的位置上比不画更糟，用户会照着那个位置去找证据。
  // 丢掉的这条仍在下方队列里，不会消失。
  const specEvents: SharedTimelineEvent[] = []
  for (const e of opts.events) {
    let idx: number | null = null
    if (e.seq != null) idx = indexForSeq(rows, e.seq)
    if (idx == null && e.turn != null) idx = indexForTurn(rows, e.turn)
    if (idx == null) continue
    specEvents.push({
      ordinal: idx, kind: e.kind, label: e.label,
      severity: e.severity, targetId: e.targetId,
      turn: e.turn, skillMode: e.skillMode,
    })
  }

  // ── 3. y 轴上限：context 模式有 contextWindow 时作为显式上限传给共享几何
  //       （max(dataMax, yMax) 并置 yMaxIsData）；窗口缺失就不传，让几何退回
  //       数据最大值并标记 yMaxIsData——不编一个默认上限。 ──
  const maxWin = mode === 'context'
    ? rows.reduce((a, r) => Math.max(a, r.context_window || 0), 0) : 0
  const cumulative: SharedTimelineSeries['cumulative'] =
    mode === 'context' ? false : mode === 'tokens' ? true : 'carry'

  const g = buildGeometry({
    points,
    events: specEvents,
    series: [{ name, label: name, cumulative }],
    geometry: GEO,
    yMax: maxWin > 0 ? maxWin : undefined,
  }, { maxBuckets: opts.maxBuckets ?? DEFAULT_BUCKETS })
  if (g === null) return null
  // 共享几何的返回结构与 Timeline 同构（kind: string 比 EventKind 宽，其余字段
  // 一一对应），渲染层只读这些字段，不做比例尺数学。
  return g as unknown as Timeline
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
