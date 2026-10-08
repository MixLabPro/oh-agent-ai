// 规划约束的共享度量（CITY_ARCHITECTURE §2「约束即守卫」，迁移步 5 前半）。
//
// 原先这些几何度量内联在 scripts/verify-city-context.mjs 与 verify-city-planning.mjs 里，只有 CI 能「事后」看到
// 违规。现在抽成一个纯模块（无 three、无 fs）：输入 createCityPlan 的返回值，输出每条约束的违规清单。
//
// 将来 planner/solve.ts 这样消费 CONSTRAINTS（本任务不实现 solve）：
//   generate → measure → repair → re-measure
//   1. generate：照现有规划流水线出一份 plan 草案；
//   2. measure：对 CONSTRAINTS 逐条 `c.measure(plan)`，违规带 site/at，solve 据此定位要修的对象；
//   3. repair：按约束 id 选修复策略（换位、改道、删支路），只动违规对象；
//   4. re-measure：重新度量直到全部为空或达迭代上限，剩余违规如实上报（不静默吞）。
// 守卫（scripts/verify-city-*.mjs）调用同一组 measure，所以「规划器认为合格」与「CI 认为合格」不会再分叉。
//
// 边界：这里只放「单个违规的几何定义」（如中心到路 < 0.7 半径算穿路）；
// 「允许多少条」的容忍计数是策略，留在守卫里。逻辑逐字取自两个守卫，勿在此改语义。
import type { createCityPlan } from "../cityPlan";
import { isPlannedRoadEnd } from "./endpoints";
import { wetCount } from "./footprint";

export type CityPlan = ReturnType<typeof createCityPlan>;
export type Violation = { constraint: string; site?: string; at?: { x: number; z: number }; detail: string };
export type Constraint = { id: string; description: string; measure: (plan: CityPlan) => Violation[] };

type Pt = { x: number; z: number };
// 规划产物的用地/路段形状很宽（各 kind 字段不同），度量只读几何字段。
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Site = any;

const seg = (p: Pt, a: Pt, b: Pt) => { const dx = b.x - a.x, dz = b.z - a.z, l2 = dx * dx + dz * dz || 1; const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / l2)); return Math.hypot(p.x - a.x - dx * t, p.z - a.z - dz * t); };
const SHORE = new Set(["harbor", "lighthouse", "sail-opera", "ferris-wheel", "villa-complex"]);

/** 带半径的用地：公共用地 + 地标（与守卫原先的 sites 同口径）。 */
export const planSites = (plan: CityPlan): Site[] => [...plan.publicSites, ...plan.landmarks].filter((s: Site) => s.radius);
const nonBridge = (plan: CityPlan): Site[] => plan.roadEdges.filter((e: Site) => !e.bridge);
/** 用地中心到最近非桥路段的距离。 */
const nearRoad = (plan: CityPlan, s: Site) => Math.min(...nonBridge(plan).map((e: Site) => seg(s, e.points[0], e.points.at(-1))));
const v = (constraint: string, s: Site, detail: string): Violation => ({ constraint, site: s.kind, at: { x: s.x, z: s.z }, detail });

export const siteInWater: Constraint = {
  id: "siteInWater", description: "占地圈 16 点地形高于水面（岸边类允许 ≤4 点；港口与岛上地标 shore 豁免）",
  measure(plan) {
    const out: Violation[] = [];
    const geo = { height: plan.terrain.height, inRiver: () => false };
    for (const s of planSites(plan)) {
      const wet = wetCount(geo, s, s.radius); // measure 口径：只看地形高度（河道由 siteNearRiver 单独量）
      if (s.kind !== "harbor" && !s.shore && wet > (SHORE.has(s.kind) ? 4 : 0)) out.push(v("siteInWater", s, `${s.kind} wet=${wet}`));
    }
    return out;
  },
};

export const siteWithoutDoorRoad: Constraint = {
  id: "siteWithoutDoorRoad", description: "门前有路：最近路段（含桥）离占地边缘 ≤ 20",
  measure(plan) {
    const out: Violation[] = [];
    for (const s of planSites(plan)) {
      const near = nearRoad(plan, s);
      const nearAny = Math.min(near, ...plan.roadEdges.filter((e: Site) => e.bridge).map((e: Site) => seg(s, e.points[0], e.points.at(-1)))); // 门口直接起桥（岸边地标隔河）也是门前有路
      if (nearAny > s.radius + 20) out.push(v("siteWithoutDoorRoad", s, `${s.kind} gap=${Math.round(nearAny - s.radius)}`));
    }
    return out;
  },
};

export const roadThroughSite: Constraint = {
  id: "roadThroughSite", description: "道路不穿用地：中心到路 ≥ 0.7 半径（市政广场=环岛、凯旋门=骑路，豁免）",
  measure(plan) {
    const out: Violation[] = [];
    for (const s of planSites(plan)) {
      if (s.kind === "arch" || s.kind === "civic") continue;
      const near = nearRoad(plan, s);
      if (near < s.radius * 0.7) out.push(v("roadThroughSite", s, `${s.kind} d=${Math.round(near)}`));
    }
    return out;
  },
};

export const sitesOverlap: Constraint = {
  id: "sitesOverlap", description: "用地两两中心距 ≥ 半径和",
  measure(plan) {
    const out: Violation[] = [];
    const sites = planSites(plan);
    for (const s of sites) for (const o of sites) if (o !== s && o.kind > s.kind && Math.hypot(o.x - s.x, o.z - s.z) < o.radius + s.radius) out.push(v("sitesOverlap", s, `${s.kind} x ${o.kind}`));
    return out;
  },
};

export const parcelInsideSite: Constraint = {
  id: "parcelInsideSite", description: "没有地块中心落在用地半径内",
  measure(plan) {
    const out: Violation[] = [];
    for (const s of planSites(plan)) for (const b of plan.blocks) for (const p of b.parcels) if (Math.hypot(p.x - s.x, p.z - s.z) < s.radius) { out.push(v("parcelInsideSite", s, `${s.kind} parcel ${p.id}`)); break; }
    return out;
  },
};

export const stationStadiumSetback: Constraint = {
  id: "stationStadiumSetback", description: "车站/体育场正面贴路：中心到路 ≤ 1.3 半径",
  measure(plan) {
    const out: Violation[] = [];
    for (const s of planSites(plan)) {
      const near = nearRoad(plan, s);
      if ((s.kind === "station" || s.kind === "stadium") && near > s.radius * 1.3 && near <= s.radius + 90) out.push(v("stationStadiumSetback", s, `${s.kind} d=${Math.round(near)} r=${s.radius}`));
    }
    return out;
  },
};

export const stationDoorFacesRoad: Constraint = {
  id: "stationDoorFacesRoad", description: "车站正门（局部 +z）朝向最近的路：夹角 < 45°",
  measure(plan) {
    const out: Violation[] = [];
    const roads = nonBridge(plan);
    for (const s of planSites(plan)) {
      const near = nearRoad(plan, s);
      if (s.kind === "station" && near <= s.radius + 90) {
        let best: { d: number; q: Pt } | null = null;
        for (const e of roads) { const [a, b] = [e.points[0], e.points.at(-1)]; const dx = b.x - a.x, dz = b.z - a.z, l2 = dx * dx + dz * dz || 1; const t = Math.max(0, Math.min(1, ((s.x - a.x) * dx + (s.z - a.z) * dz) / l2)); const q = { x: a.x + dx * t, z: a.z + dz * t }; const d = Math.hypot(q.x - s.x, q.z - s.z); if (!best || d < best.d) best = { d, q }; }
        const bq = best as unknown as { d: number; q: Pt };
        const cos = (Math.sin(s.yaw) * (bq.q.x - s.x) + Math.cos(s.yaw) * (bq.q.z - s.z)) / (bq.d || 1);
        if (cos < Math.cos((45 * Math.PI) / 180)) out.push(v("stationDoorFacesRoad", s, `${s.kind} door faces away from the road (cos ${cos.toFixed(2)})`));
      }
    }
    return out;
  },
};

export const archStraddlesRoad: Constraint = {
  id: "archStraddlesRoad", description: "凯旋门骑路：主干道（宽 ≥ 12）从中心 3 内穿过，开口轴与路向夹角 ≤ 15°",
  measure(plan) {
    const out: Violation[] = [];
    const roads = nonBridge(plan);
    for (const s of planSites(plan)) {
      if (s.kind !== "arch") continue;
      const host = roads.filter((e: Site) => e.width >= 12).find((e: Site) => seg(s, e.points[0], e.points.at(-1)) < 3);
      if (!host) out.push(v("archStraddlesRoad", s, `${s.kind} not on a road`));
      else {
        const dir = Math.atan2(host.points.at(-1).x - host.points[0].x, host.points.at(-1).z - host.points[0].z);
        let d = Math.abs(dir - s.yaw) % Math.PI; d = Math.min(d, Math.PI - d);
        if (d > (15 * Math.PI) / 180) out.push(v("archStraddlesRoad", s, `${s.kind} opening off road by ${Math.round((d * 180) / Math.PI)}deg`));
      }
    }
    return out;
  },
};

export const civicPlazaCentred: Constraint = {
  id: "civicPlazaCentred", description: "市政广场与核心点（环岛圆心）重合，偏差 ≤ 4",
  measure(plan) {
    const civic = plan.publicSites.find((s: Site) => s.kind === "civic");
    if (!civic) return [];
    const off = Math.hypot(civic.x - plan.core.x, civic.z - plan.core.z);
    return off > 4 ? [v("civicPlazaCentred", civic, `civic plaza off the roundabout centre by ${Math.round(off)}`)] : [];
  },
};

export const suspensionBridgeClearOfHighways: Constraint = {
  id: "suspensionBridgeClearOfHighways", description: "悬索桥（门式塔高 34）桥身整段离环线高架 ≥ 35",
  measure(plan) {
    const bridge = plan.landmarks.find((l: Site) => l.kind === "suspension-bridge") as Site;
    if (!bridge) return [];
    let min = Infinity;
    for (const run of plan.highways ?? []) for (let k = 1; k < run.length; k += 1) for (let u = 0; u <= 10; u += 1) {
      const p = { x: bridge.x + (bridge.to.x - bridge.x) * (u / 10), z: bridge.z + (bridge.to.z - bridge.z) * (u / 10) };
      min = Math.min(min, seg(p, run[k - 1], run[k]));
    }
    return min < 35 ? [v("suspensionBridgeClearOfHighways", bridge, `expressway runs through the suspension bridge (clearance ${min.toFixed(1)})`)] : [];
  },
};

export const looseInlandRoadEnds: Constraint = {
  id: "looseInlandRoadEnds", description: "内陆断头：度为 1 且不属于计划内终点（滨海大道端/门前终点/沿河海路 run 端/近水终止）的路端；地形高度不参与判定",
  measure(plan) {
    const out: Violation[] = [];
    const deg = new Map<string, number>(); for (const e of plan.roadEdges) if (!e.bridge) for (const id of [e.from, e.to]) deg.set(id, (deg.get(id) || 0) + 1);
    const nodes = new Map<string, Site>(plan.roadNodes.map((n: Site) => [n.id, n]));
    // 豁免改用语义判定（planner/endpoints.ts，网络优先设计批次 1）：旧 height ≥ 2.5 是「靠水断头=合法」的
    // 地形代理，把平岛的内陆断头全部藏进盲区（四档 75–90% 的岛至少 1 个，2026-10-08 实测）。
    const world = {
      sites: planSites(plan),
      boulevardEnds: (plan.seaside?.samples ?? []).filter((s: Site) => s.valid && s.boulevard).map((s: Site) => s.boulevard),
      // 海段 + 河岸段（批次 3-2 清偿切片分歧：曾只看海段，宽河 run 端 >40 时修复豁免、检测计违例）
      coastRoadRunEnds: [...(plan.coastRoads ?? []), ...(plan.riverRoadRuns ?? [])].flatMap((r: Site[]) => [r[0], r[r.length - 1]]),
      coast: plan.coast ?? [], river: plan.river ?? null,
    };
    for (const [id, d] of deg) { if (d !== 1) continue; const q = nodes.get(id); if (!q || isPlannedRoadEnd(q, world)) continue; out.push({ constraint: "looseInlandRoadEnds", at: { x: q.x, z: q.z }, detail: `node ${id}` }); }
    return out;
  },
};

export const acuteJunctions: Constraint = {
  id: "acuteJunctions", description: "三路及以上的路口，相邻两条路夹角 ≥ 30°",
  measure(plan) {
    const out: Violation[] = [];
    const incident = new Map<string, Site[]>();
    for (const edge of plan.roadEdges) for (const id of [edge.from, edge.to]) (incident.get(id) ?? incident.set(id, []).get(id)!).push(edge);
    const nodes = new Map<string, Site>(plan.roadNodes.map((node: Site) => [node.id, node]));
    for (const [id, list] of incident) {
      if (list.length < 3) continue;
      const node = nodes.get(id) as Site;
      const angles = list.map((edge: Site) => { const pts = edge.from === id ? edge.points : [...edge.points].reverse(); return Math.atan2(pts[1].z - node.z, pts[1].x - node.x); }).sort((a: number, b: number) => a - b);
      for (let k = 0; k < angles.length; k += 1) {
        const gap = (k + 1 < angles.length ? angles[k + 1] : angles[0] + Math.PI * 2) - angles[k];
        if (gap < (30 * Math.PI) / 180) { out.push({ constraint: "acuteJunctions", at: { x: node.x, z: node.z }, detail: `node ${id}` }); break; }
      }
    }
    return out;
  },
};

export const crowdedArterials: Constraint = {
  id: "crowdedArterials", description: "主干道不扎堆：不共享节点、彼此 < 25、夹角 < 15° 且侧向重叠的段对",
  measure(plan) {
    const out: Violation[] = [];
    const arterials: Site[] = plan.roadEdges.filter((edge: Site) => edge.kind === "arterial" && !edge.bridge);
    for (let a = 0; a < arterials.length; a += 1) for (let b = a + 1; b < arterials.length; b += 1) {
      const A = arterials[a]; const B = arterials[b];
      if ([A.from, A.to].some((id: string) => id === B.from || id === B.to)) continue;
      const [b0, b1] = [B.points[0], B.points.at(-1)];
      const mid = { x: (A.points[0].x + A.points.at(-1).x) / 2, z: (A.points[0].z + A.points.at(-1).z) / 2 };
      const l2 = (b1.x - b0.x) ** 2 + (b1.z - b0.z) ** 2 || 1;
      const t = ((mid.x - b0.x) * (b1.x - b0.x) + (mid.z - b0.z) * (b1.z - b0.z)) / l2;
      if (t <= 0.1 || t >= 0.9 || seg(mid, b0, b1) >= 25) continue;
      const angle = Math.abs(Math.atan2(A.points.at(-1).z - A.points[0].z, A.points.at(-1).x - A.points[0].x) - Math.atan2(b1.z - b0.z, b1.x - b0.x)) % Math.PI;
      if (Math.min(angle, Math.PI - angle) < (15 * Math.PI) / 180) out.push({ constraint: "crowdedArterials", at: mid, detail: `${A.from}-${A.to} ~ ${B.from}-${B.to}` });
    }
    return out;
  },
};

export const CONSTRAINTS: Constraint[] = [
  siteInWater, siteWithoutDoorRoad, roadThroughSite, sitesOverlap, parcelInsideSite,
  stationStadiumSetback, stationDoorFacesRoad, archStraddlesRoad, civicPlazaCentred,
  suspensionBridgeClearOfHighways, looseInlandRoadEnds, acuteJunctions, crowdedArterials,
];
