/**
 * 选址候选生成器骨架（CITY_NETWORK_FIRST_CODE_DESIGN §5 / 迁移批次 6a-3）。
 *
 * 五类 placement 各一个生成器（sitespec.PlacementClass ↔ 本文件函数一一对应）：
 *   inland-frontage  → inlandFrontageCandidates   沿路取点：投影到最近主干段、沿法线偏移 radius+12（两侧）
 *   shore            → shoreCandidates            沿岸取点：最近岸点为目标、朝它滑移到离岸 ≈ 0.7·radius
 *   offshore-island  → offshoreIslandCandidates   岸外取点：岸点沿「离核向外」半径 radius+40 的深水圈
 *   straddle-trunk   → straddleTrunkCandidates    主干中段（len ≥ 20）中点，开口轴沿路向
 *   plaza            → plazaCandidates            广场 === 核心点（构造保证，单候选）
 *
 * 骨架纪律（本批）：
 *   - 输入只依赖 geo + 网络数据（SiteCandidateWorld；不含 cityPlan 闭包，不 import cityPlan 运行时）；
 *   - 纯函数、无随机、候选数有确定上界、id 稳定（source+序号）——同输入同输出；
 *   - **不接线**：生产管线（place()/十道挪动遍）不调用这里；行为变更批把指派移到骨架后时，
 *     以 assign.ts 的指派循环消费这些生成器（守卫先证明确定性）。
 * 生成逻辑按 cityPlan 现行遍的取点公式登记（临街遍的法线偏移、贴岸遍的滑移步长、海上岛遍的
 * 岸外半径），但「先到先得」改为「hard 全过 + soft 加权后取最优」——这是行为变更批的差异点，
 * 不是本批的行为。
 */
import { DetMath as Math } from "../detMath";
import type { Vec2 } from "../cityLayout";
import type { SiteSpec } from "./sitespec";
import { isDeepWater, nearBridgeEnd, polylineDistance, wetCount, isDry } from "./footprint";

/** 候选点：坐标 + 朝向 + 稳定 id（排序 tie-break 用）+ 来源说明；shoreAnchor 供海上岛堤道校验。 */
export type SiteCandidate = {
  id: string;
  x: number; z: number; yaw: number;
  source: string;
  /** 海上岛候选的堤道陆地端（岸点向内 6）。 */
  shoreAnchor?: Vec2;
};

/**
 * 候选世界（geo + 网络数据的显式清单；与 cityPlan 闭包解耦，行为变更批由 buildPlan 组装）。
 * 只列生成器与 hard 闸门真正读的字段（context.ts 文化：一个遍用到什么，一眼可见）。
 */
export type SiteCandidateWorld = {
  core: Vec2;
  R: number;
  turn: number;
  coast: Vec2[];
  /** 骨架主干折线（生成临街/跨路候选）。 */
  trunkRuns: Vec2[][];
  /** 环线高架折线（hard 闸门的净空检查）。 */
  ringRuns: Vec2[][];
  bridges: Array<{ from: Vec2; to: Vec2 }>;
  /** 已放置用地（间距 hard 判据；assign 按序追加）。 */
  placed: Array<{ x: number; z: number; radius: number }>;
  height: (x: number, z: number) => number;
  inRiver: (x: number, z: number) => boolean;
  riverBank: (x: number, z: number, bank: number) => boolean;
  coastDistance: (x: number, z: number) => number;
  landClearance: (x: number, z: number) => number;
  buildable: (x: number, z: number) => boolean;
  hasRiver: boolean;
  riverX: (z: number) => number;
  riverWidth: (z: number) => number;
  hillDir: Vec2;
  hillLine: number;
  hillProj: (x: number, z: number) => number;
};

const segmentLength = (a: Vec2, b: Vec2) => Math.hypot(b.x - a.x, b.z - a.z);

/** 折线全部线段（跨路/临街候选按段枚举）。 */
function runsToSegments(runs: Vec2[][]): Array<{ a: Vec2; b: Vec2; run: number; index: number }> {
  const out: Array<{ a: Vec2; b: Vec2; run: number; index: number }> = [];
  runs.forEach((run, r) => run.forEach((b, k) => { if (k > 0) out.push({ a: run[k - 1], b, run: r, index: k }); }));
  return out;
}

const projectOnSegment = (p: Vec2, a: Vec2, b: Vec2) => {
  const dx = b.x - a.x; const dz = b.z - a.z; const len = Math.hypot(dx, dz) || 1;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / (len * len)));
  return { foot: { x: a.x + dx * t, z: a.z + dz * t }, dx, dz, len };
};

/** 环线净空（与 cityPlan.clearsHighways 同公式：5.25 + 半对角 + 1；纯函数版，无空间索引）。 */
export function clearsRingRuns(p: Vec2, width: number, depth: number, ringRuns: Vec2[][]): boolean {
  return polylineDistance(ringRuns, p) >= 5.25 + Math.hypot(width, depth) / 2 + 1;
}

/** 临街候选：最近 4 条主干段（按离 current 距离排序）× 两侧法线偏移 radius+12（临街遍公式）。 */
export function inlandFrontageCandidates(world: SiteCandidateWorld, spec: SiteSpec, current: Vec2): SiteCandidate[] {
  const ranked = runsToSegments(world.trunkRuns)
    .map((s) => ({ ...s, d: polylineDistance([[s.a, s.b]], current) }))
    .sort((x, y) => x.d - y.d || x.run - y.run || x.index - y.index)
    .slice(0, 4);
  const out: SiteCandidate[] = [];
  for (const seg of ranked) {
    const { foot, dx, dz, len } = projectOnSegment(current, seg.a, seg.b);
    let nx = -dz / len; let nz = dx / len;
    if ((current.x - foot.x) * nx + (current.z - foot.z) * nz < 0) { nx = -nx; nz = -nz; }
    for (const sign of [1, -1]) {
      const offset = spec.radius + 12;
      out.push({
        id: `frontage:${seg.run}:${seg.index}:${sign > 0 ? "l" : "r"}`,
        x: foot.x + nx * sign * offset, z: foot.z + nz * sign * offset,
        yaw: -Math.atan2(dz, dx),
        source: `trunk segment ${seg.run}/${seg.index} normal ${sign > 0 ? "+" : "-"}`,
      });
    }
  }
  return out;
}

/** 跨路候选：主干中段（len ≥ 20）按离 current 距离排序的中点，开口轴沿路向（跨路遍公式）。 */
export function straddleTrunkCandidates(world: SiteCandidateWorld, spec: SiteSpec, current: Vec2): SiteCandidate[] {
  return runsToSegments(world.trunkRuns)
    .filter((s) => segmentLength(s.a, s.b) >= 20)
    .map((s) => ({ s, d: polylineDistance([[s.a, s.b]], current) }))
    .sort((x, y) => x.d - y.d || x.s.run - y.s.run || x.s.index - y.s.index)
    .slice(0, 8)
    .map(({ s }) => {
      const dx = s.b.x - s.a.x; const dz = s.b.z - s.a.z;
      return {
        id: `straddle:${s.run}:${s.index}`,
        x: s.a.x + dx * 0.5, z: s.a.z + dz * 0.5,
        yaw: Math.atan2(dx, dz),
        source: `trunk mid ${s.run}/${s.index}`,
      };
    });
}

/** 岸线候选：最近 8 个岸点（按离 current 距离），朝每个岸点滑移（步长 3、上限 100 步）到离岸 ≈ 0.7·radius（贴岸遍公式）。 */
export function shoreCandidates(world: SiteCandidateWorld, spec: SiteSpec, current: Vec2): SiteCandidate[] {
  const targets = [...world.coast]
    .map((q, i) => ({ q, i, d: Math.hypot(q.x - current.x, q.z - current.z) }))
    .sort((x, y) => x.d - y.d || x.i - y.i)
    .slice(0, 8);
  const out: SiteCandidate[] = [];
  for (const { q, i } of targets) {
    let x = current.x; let z = current.z;
    for (let step = 0; step < 100 && world.coastDistance(x, z) > spec.radius * 0.7; step += 1) {
      const dx = q.x - x; const dz = q.z - z; const len = Math.hypot(dx, dz) || 1;
      x += (dx / len) * 3; z += (dz / len) * 3;
    }
    const tangent = Math.atan2(q.x - x, q.z - z); // 岸线近似切向（候选朝向；soft 偏好再调）
    out.push({ id: `shore:${i}`, x, z, yaw: tangent, source: `coast point ${i} (slid to ~0.7r of water)` });
  }
  return out;
}

/** 海上岛候选：最近 40 个岸点，沿「离核向外」radius+40（海上岛遍公式），堤道陆地端 = 岸点向内 6。 */
export function offshoreIslandCandidates(world: SiteCandidateWorld, spec: SiteSpec, current: Vec2): SiteCandidate[] {
  const targets = [...world.coast]
    .map((q, i) => ({ q, i, d: Math.hypot(q.x - current.x, q.z - current.z) }))
    .sort((x, y) => x.d - y.d || x.i - y.i)
    .slice(0, 40);
  const out: SiteCandidate[] = [];
  for (const { q, i } of targets) {
    const len = Math.hypot(q.x - world.core.x, q.z - world.core.z) || 1;
    const outx = (q.x - world.core.x) / len; const outz = (q.z - world.core.z) / len;
    out.push({
      id: `offshore:${i}`,
      x: q.x + outx * (spec.radius + 40), z: q.z + outz * (spec.radius + 40),
      yaw: -Math.atan2(outz, outx),
      source: `coast point ${i} + outward ${spec.radius + 40}`,
      shoreAnchor: { x: q.x - outx * 6, z: q.z - outz * 6 },
    });
  }
  return out;
}

/** 广场候选：核心点本身（chooseCore 硬门 + 核心跟随的构造保证；单候选）。 */
export function plazaCandidates(world: SiteCandidateWorld, spec: SiteSpec): SiteCandidate[] {
  return [{ id: "plaza:core", x: world.core.x, z: world.core.z, yaw: spec.initialYaw.value ?? 0, source: "core by construction" }];
}

/** placement 五类 → 生成器分派（assign.ts 的入口；新增 placement 必须显式登记）。 */
export function candidatesFor(world: SiteCandidateWorld, spec: SiteSpec, current: Vec2): SiteCandidate[] {
  switch (spec.placement) {
    case "inland-frontage": return inlandFrontageCandidates(world, spec, current);
    case "shore": return shoreCandidates(world, spec, current);
    case "offshore-island": return offshoreIslandCandidates(world, spec, current);
    case "straddle-trunk": return straddleTrunkCandidates(world, spec, current);
    case "plaza": return plazaCandidates(world, spec);
  }
}

/**
 * hard 闸门（骨架）：候选必须全过本类 hard 判据才参与 soft 排序。判据按 sitespec 的
 * HardCheckId 文档执行、全部复用现有谓词（footprint.*、clearsRingRuns = clearsHighways 公式）。
 * 返回首个不过的判据名（诊断用；null = 全过）。
 */
export function siteCandidateHardReject(world: SiteCandidateWorld, spec: SiteSpec, candidate: SiteCandidate): string | null {
  const geo = { height: world.height, inRiver: world.inRiver, riverBank: world.riverBank };
  const at = { x: candidate.x, z: candidate.z };
  const r = spec.radius;
  const spacing = (gap: number) => world.placed.some((o) => Math.hypot(o.x - at.x, o.z - at.z) < o.radius + r + gap) ? `site-spacing(+${gap})` : null;
  const ring = () => (clearsRingRuns(at, r * 2, r * 2, world.ringRuns) ? null : "clear-of-highways");
  switch (spec.placement) {
    case "plaza":
      return world.landClearance(at.x, at.z) >= r + 14 ? null : "snap-land-clearance";
    case "inland-frontage":
      return (world.buildable(at.x, at.z) ? null : "buildable-center")
        ?? (isDry(geo, at, r) ? null : "dry-footprint")
        ?? (world.landClearance(at.x, at.z) >= r + 4 ? null : "land-clearance-r+4")
        ?? (polylineDistance(world.trunkRuns, at) >= r + 8 ? null : "trunk-clearance-r+8")
        ?? ring()
        ?? spacing(10);
    case "straddle-trunk":
      return (world.buildable(at.x, at.z) ? null : "buildable-center")
        ?? (isDry(geo, at, r) ? null : "dry-footprint")
        ?? ring()
        ?? spacing(10);
    case "shore":
      return (wetCount(geo, at, r, { river: true, riverBank: 14 }) <= 3 ? null : "wet-budget-3-riverbank")
        ?? (world.coastDistance(at.x, at.z) <= r * 0.7 ? null : "coast-distance-0.7r")
        ?? (world.height(at.x, at.z) > 0.5 ? null : "height-above-0.5")
        ?? (!world.inRiver(at.x, at.z) ? null : "not-in-river")
        ?? (polylineDistance(world.trunkRuns, at) >= r + 4 ? null : "trunk-clearance-r+4")
        ?? (nearBridgeEnd(world.bridges, at.x, at.z, r) ? "not-near-bridge-end" : null)
        ?? ring()
        ?? spacing(0);
    case "offshore-island": {
      if (!isDeepWater(geo, at, r)) return "deep-water-ring";
      const anchor = candidate.shoreAnchor;
      if (!anchor || world.height(anchor.x, anchor.z) < 0.3) return "causeway-land-dry";
      const harbor = world.placed.find((o) => Math.hypot(o.x - at.x, o.z - at.z) < o.radius + r + 120);
      if (harbor) return "harbor-distance-120";
      return spacing(30);
    }
  }
}
