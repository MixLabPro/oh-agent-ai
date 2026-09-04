// timeline-shared.cjs（= src-tauri/ui/timeline.js 的字节锁步副本）的类型声明。
// 几何本体是纯 JS，无类型；这份 .d.cts 只描述它暴露的三个函数与进出结构，
// 让 dsh-client 的 TS 能对共享几何做类型检查。锁步见 tests/test_timeline_lockstep.py。
// 注意：这份 .d.cts 不是 timeline-shared.cjs 的一部分（副本必须与源逐字节一致），
// 改共享几何的返回结构时，这里必须同步——编译期就会报，不用等跑。

export interface SharedTimelineSeries {
  name: string
  label?: string
  /** false=原始值（缺值断开）；true/'sum'=delta 累计（缺值沿用上一格）；'carry'=宿主已给累计值（沿用但不累加）。 */
  cumulative?: boolean | 'sum' | 'carry'
}

export interface SharedTimelinePoint {
  ordinal: number
  task_id?: number | string | null
  values: Record<string, number | null>
}

export interface SharedTimelineEvent {
  ordinal: number
  kind: string
  label?: string
  severity?: string
  targetId?: string | null
  turn?: number | string | null
  skillMode?: string
}

export interface SharedTimelineGeometry {
  w: number
  h: number
  curveTop: number
  curveBottom: number
  eventY: number
  x0: number
  x1: number
}

export interface SharedGeometrySpec {
  points: SharedTimelinePoint[]
  events?: SharedTimelineEvent[]
  series?: SharedTimelineSeries[]
  width?: number
  height?: number
  pad?: number
  geometry?: SharedTimelineGeometry
  yMax?: number
}

export interface SharedGeometryPoint {
  x: number
  y: number
  idx: number
  lo: number
  hi: number
}

export interface SharedGeometryEvent {
  kind: string
  severity?: string
  x: number
  turn: number | string | null
  label: string
  targetId: string | null
  count: number
  members: string[]
  skillMode?: string
}

export interface SharedGeometryResult {
  path: string
  area: string
  points: SharedGeometryPoint[]
  events: SharedGeometryEvent[]
  seriesPaths: { name: string; path: string; area: string }[]
  cols: { series: SharedTimelineSeries; values: (number | null)[]; measured: number }[]
  yMax: number
  yMaxIsData: boolean
  measured: number
  total: number
  buckets: number
  gaps: number
  geometry: SharedTimelineGeometry
  turnTicks: { x: number; label: string }[]
}

export function buildTimeline(spec: SharedGeometrySpec & { classPrefix?: string }): string
export function buildGeometry(spec: SharedGeometrySpec, opts?: { maxBuckets?: number }): SharedGeometryResult | null
export function nearestPoint(points: { x: number }[], x: number): number
