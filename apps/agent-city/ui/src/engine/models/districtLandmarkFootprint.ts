/**
 * 城区地标的地基随楼高放大（用户 2026-10-15：「按会话楼的策略，达到一定阈值后增加地基面积」）。
 *
 * 会话楼的策略是：高楼（≥ TALL）并入相邻空地块，面宽翻倍，不再细成一根签。城区地标高度由会话数据决定（下限 ≈ 最高会话楼×1.1，
 * 上限 160 单位 = 320 m），裙楼固定 17 单位、塔身 12 单位时，160 高的塔细长比 13:1。这里让塔身宽度至少是高度的 1/SLENDER，
 * 裙楼同比放大，但**只在地标已经预留的街区里**放大——生成器与编辑器都把它所在的整个街区预留了（cityLayout 注释、planGeometry），
 * 所以放大不会压到会话楼，也不用改规划占地与基线。
 *
 * 纯函数，不依赖 three：渲染器每次按当前布局算，编辑器把地标搬到别的街区后自动按新街区的空间重算。
 */
import { DISTRICT_LANDMARK_RENDER_GEOMETRY } from "./layoutPlacementGeometry";

/** 塔身（最宽一级）的高宽比上限：8:1 是高层塔楼的常见细长比（过 10 开始像烟囱）。 */
export const LANDMARK_SLENDER = 8;
/** 基准塔身宽度（最宽一级，单位）；裙楼 17 与它的比例固定。 */
export const LANDMARK_SHAFT_BASE = 12;
/** 离街区边界留的余量（单位）：裙楼不贴着街区边线。 */
const EDGE_MARGIN = 1;

type Placed = { id: string; x: number; z: number; yaw: number; width: number; depth: number; blockId: string };

/** 地标局部坐标系（rotation.y = yaw）下，该街区所有地块在地标中心两侧各自能给出的最大对称半宽。 */
export function landmarkRoom(landmark: { x: number; z: number; yaw: number; parcelId: string }, parcels: readonly Placed[]): { width: number; depth: number } | null {
  const own = parcels.find((p) => p.id === landmark.parcelId);
  if (!own) return null;
  const cos = Math.cos(landmark.yaw), sin = Math.sin(landmark.yaw);
  let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity;
  for (const p of parcels) {
    if (p.blockId !== own.blockId) continue;
    const c = Math.cos(p.yaw), s = Math.sin(p.yaw);
    for (const [hx, hz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) {
      // 地块局部角点 → 世界 → 地标局部（与 three 的 rotation.y 约定一致：lx = dx·cos − dz·sin，lz = dx·sin + dz·cos）。
      const lx = hx * p.width / 2, lz = hz * p.depth / 2;
      const dx = p.x + lx * c + lz * s - landmark.x, dz = p.z - lx * s + lz * c - landmark.z;
      const u = dx * cos - dz * sin, v = dx * sin + dz * cos;
      if (u < minU) minU = u; if (u > maxU) maxU = u; if (v < minV) minV = v; if (v > maxV) maxV = v;
    }
  }
  if (!Number.isFinite(minU)) return null;
  return { width: 2 * Math.min(-minU, maxU), depth: 2 * Math.min(-minV, maxV) };
}

/** 裙楼与塔身的放大系数 ≥ 1：先按高宽比要求，再受街区可用空间限制（不小于 1，即保底就是原来的尺寸）。 */
export function landmarkGrowth(height: number, room: { width: number; depth: number } | null): number {
  const wanted = Math.max(1, height / (LANDMARK_SLENDER * LANDMARK_SHAFT_BASE));
  if (!room) return 1;
  const fit = Math.min(room.width, room.depth) - EDGE_MARGIN * 2;
  return Math.max(1, Math.min(wanted, fit / DISTRICT_LANDMARK_RENDER_GEOMETRY.skirtWidth));
}
