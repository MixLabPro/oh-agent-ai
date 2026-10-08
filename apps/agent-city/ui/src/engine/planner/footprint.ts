/**
 * 占地谓词的唯一实现（CITY_PLANNER_V2_SPEC §5.2，步 1）。
 *
 * 「占地圈 16 点采样」曾抄了 8 份（cityPlan×4、constraints、siting×2、repairs），阈值与河道口径各异
 * （<0.5 / <0.8 / >-0.8；含不含 inRiver；河岸带 14/60）——measure 说合格、修复说不合格（或反之）的
 * 「两套口径」就是在谓词层复活的（spec D3）。本模块只依赖 Geography 形状与线段距离，measure / 落位 /
 * 修复三方共用；口径差异必须经 opts 显式表达，禁止调用方再写自己的采样循环。
 *
 * 迁移纪律（spec §5.2）：每次替换调用点，plan/场景基线哈希必须不变；口径确实不同的用 opts 保留，
 * 不得「顺手统一」——统一口径是行为变更，需单独一步、单独审。
 */
import { DetMath as Math } from "../detMath";
import { segmentDistance } from "../cityPlan";
import type { Vec2 } from "../cityLayout";

/** 现有各口径的水位常量：siteInWater 系 <0.5；占地「干地」≥0.8；海上岛「深水」≤-0.8。 */
export const WATER_LEVEL = 0.5;
export const DRY_LEVEL = 0.8;
export const DEEP_LEVEL = -0.8;

/** 地理判定注入：调用方传各自的 height/inRiver 闭包（cityPlan 的闭包含 hasRiver 短路，保持原语义）。 */
export type FootprintGeo = {
  height: (x: number, z: number) => number;
  inRiver: (x: number, z: number) => boolean;
  /** 河岸带：点到河中线 < riverWidth+bank。无河的调用方不传（opts.riverBank 不出现即不检查）。 */
  riverBank?: (x: number, z: number, bank: number) => boolean;
};

export type WetOpts = {
  /** 水位（缺省 WATER_LEVEL）。 */
  level?: number;
  /** 计入河道。 */
  river?: boolean;
  /** 计入河岸带宽度（需要 geo.riverBank）。 */
  riverBank?: number;
};

/** 占地圈 16 点采样（奇数点外圈 r、偶数点内圈 0.6r），返回「落水」点数。 */
export function wetCount(geo: FootprintGeo, c: Vec2, radius: number, opts: WetOpts = {}): number {
  const level = opts.level ?? WATER_LEVEL;
  let n = 0;
  for (let k = 0; k < 16; k += 1) {
    const t = (k / 16) * Math.PI * 2; const r = k % 2 ? radius : radius * 0.6;
    const x = c.x + Math.cos(t) * r; const z = c.z + Math.sin(t) * r;
    if (geo.height(x, z) < level || (opts.river && geo.inRiver(x, z)) || (opts.riverBank !== undefined && geo.riverBank !== undefined && geo.riverBank(x, z, opts.riverBank))) n += 1;
  }
  return n;
}

/** 占地「全干」判定（水位 DRY_LEVEL、含河道；早退）。 */
export function isDry(geo: FootprintGeo, c: Vec2, radius: number): boolean {
  for (let k = 0; k < 16; k += 1) {
    const t = (k / 16) * Math.PI * 2; const r = k % 2 ? radius : radius * 0.6;
    const x = c.x + Math.cos(t) * r; const z = c.z + Math.sin(t) * r;
    if (geo.height(x, z) < DRY_LEVEL || geo.inRiver(x, z)) return false;
  }
  return true;
}

/** 海上小岛的「全深水」判定（整圈 ≤DEEP_LEVEL、不在河道、不贴河岸 60 带；早退）。 */
export function isDeepWater(geo: FootprintGeo, c: Vec2, radius: number): boolean {
  for (let k = 0; k < 16; k += 1) {
    const t = (k / 16) * Math.PI * 2; const r = k % 2 ? radius : radius * 0.6;
    const x = c.x + Math.cos(t) * r; const z = c.z + Math.sin(t) * r;
    if (geo.height(x, z) > DEEP_LEVEL || geo.inRiver(x, z) || (geo.riverBank !== undefined && geo.riverBank(x, z, 60))) return false;
  }
  return true;
}

/** 点到一组折线（主干 / 环线 / 路段）的最近距离——曾五份全量扫描（siting/repairs 的 nearestRoad、
 *  distanceToTrunks、distanceToRing、地块终筛），此处一份。 */
export function polylineDistance(runs: Vec2[][], p: Vec2): number {
  let d = Infinity;
  for (const run of runs) for (let k = 1; k < run.length; k += 1) d = Math.min(d, segmentDistance(p, run[k - 1], run[k]));
  return d;
}

/** 同上，但连最近点一起返回（临街修复要沿「路→用地」方向拉，需要垂足坐标）。 */
export function polylineClosest(runs: Vec2[][], p: Vec2): { d: number; q: Vec2 } | null {
  let best: { d: number; q: Vec2 } | null = null;
  for (const run of runs) for (let k = 1; k < run.length; k += 1) {
    const a = run[k - 1]; const b = run[k];
    const dx = b.x - a.x; const dz = b.z - a.z;
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / (dx * dx + dz * dz || 1)));
    const q = { x: a.x + dx * t, z: a.z + dz * t }; const d = Math.hypot(q.x - p.x, q.z - p.z);
    if (!best || d < best.d) best = { d, q };
  }
  return best;
}

// ── 2c：从 buildPlan 迁出的三个纯几何谓词 + 安全线检查（原 RepairContext 闭包成员，D5 收尾）──

/** 桥头避让：用地不能贴着过河桥两端（桥头必须留出接路空间）。 */
export function nearBridgeEnd(bridges: Array<{ from: Vec2; to: Vec2 }>, x: number, z: number, radius: number): boolean {
  return bridges.some((b) => Math.hypot(b.from.x - x, b.from.z - z) < radius + 14 || Math.hypot(b.to.x - x, b.to.z - z) < radius + 14);
}

/** 线段 ab 与 cd 是否真相交（不含共端点）。 */
export function crosses(a: Vec2, b: Vec2, c: Vec2, d: Vec2): boolean {
  const o = (p: Vec2, q: Vec2, r: Vec2) => (q.x - p.x) * (r.z - p.z) - (q.z - p.z) * (r.x - p.x);
  return o(a, b, c) * o(a, b, d) < 0 && o(c, d, a) * o(c, d, b) < 0;
}

/** 两点连线能否通过（可建、坡度可走、不穿预留地）。reservations = publicSites + landmarks。 */
export function safeRoadLink(geo: { buildable: (x: number, z: number) => boolean; terrain: { slope: (x: number, z: number) => number } }, reservations: Array<{ x: number; z: number; radius: number }>, a: Vec2, b: Vec2): boolean {
  const distance = Math.hypot(b.x - a.x, b.z - a.z);
  const steps = Math.max(1, Math.ceil(distance / 4));
  for (let i = 0; i <= steps; i += 1) {
    const p = { x: a.x + (b.x - a.x) * i / steps, z: a.z + (b.z - a.z) * i / steps };
    if (!geo.buildable(p.x, p.z) || geo.terrain.slope(p.x, p.z) > 0.9) return false;
    if (reservations.some((site) => Math.hypot(p.x - site.x, p.z - site.z) < site.radius + 5)) return false;
  }
  return true;
}
