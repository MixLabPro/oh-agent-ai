/**
 * 骨架阶段（CITY_PLANNER_V2_SPEC §5.1 / 步 2a 先迁核心点选择；主干/桥/环线在步 2b 迁入）。
 *
 * chooseCore 从 buildPlan 逐字迁出：25×25 网格打分（离岸 0.32R、离山脊远、靠河、种子抖动）。
 * random 为无状态键控哈希，迁移不改调用序；行为保持由基线哈希证明。
 */
import { DetMath as Math } from "../detMath";
import type { Vec2 } from "../cityLayout";
import type { Geography } from "./geography";

export function chooseCore(geo: Geography, random: (key: string) => number): Vec2 {
  const { R, bbox, buildable, coastDistance, riverX, riverWidth, hasRiver, hillProj, hillLine, riverShift } = geo;
  // ── 城市核心点：可建地上评分最高处——离岸约 0.32R、离山脊远、靠河（有河时）。
  let core: Vec2 = { x: riverShift, z: 0 };
  let best = -Infinity;
  for (let gx = 0; gx <= 24; gx += 1) for (let gz = 0; gz <= 24; gz += 1) {
    const x = bbox.minX + ((bbox.maxX - bbox.minX) * gx) / 24;
    const z = bbox.minZ + ((bbox.maxZ - bbox.minZ) * gz) / 24;
    if (!buildable(x, z)) continue;
    const shore = coastDistance(x, z);
    const riverGap = hasRiver ? Math.abs(Math.abs(x - riverX(z)) - riverWidth(z) - 70) : 0;
    const score = -Math.abs(shore - 0.32 * R) - riverGap * 0.6 - Math.max(0, hillProj(x, z) - hillLine * 0.4) * 0.8 + random(`core${gx}:${gz}`) * 8;
    if (score > best) { best = score; core = { x, z }; }
  }
  return core;
}
