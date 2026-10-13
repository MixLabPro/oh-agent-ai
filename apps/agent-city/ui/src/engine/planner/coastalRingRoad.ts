/**
 * 环岛滨海路 + 河岸路（R5 第 4 道，逐字迁自 cityPlan.ts::buildPlan 的内嵌工序）。
 *
 * 读：network.edges（既有主干/海滨大道，用于避让与同级降级）、coast、core、bbox、hasRiver·riverX·riverWidth、
 *     coastDistance / landClearance / hillProj / hillLine / height / inRiver、seaside（海滨景观带避让）、
 *     reservations()（实时读 publicSites+landmarks，调用方闭包）、ringIndex（环线高架索引）。
 * 写：network.edges / network.nodes（addEdge 原地加边；对 ground-road 边写 purpose="waterfront"）。
 * 返回：coastRoadRuns（前 coastalRunCount 条是环岛滨海路，其后是河岸路）与 coastalRunCount
 *       （原先是 buildPlan 里的 const 数组与 let 计数器；数组在块内原地 push，顺序即原顺序）。
 * 不调用 random()、不使用 commitNetwork；不 import ../cityPlan 的运行时（R2 边界）。
 */
import { DetMath as Math } from "../detMath";
import { seasideStripContains, type SeasideBand } from "../citySeaside";
import type { Vec2 } from "../cityLayout";
import { roadNodeId, SegmentIndex } from "../roadGeometry";
import { addNetworkEdge, keyOf, type Network } from "./network";

export type CoastalRingRoadWorld = {
  network: Network;
  coast: Vec2[]; bbox: { minX: number; maxX: number; minZ: number; maxZ: number };
  hasRiver: boolean; riverX: (z: number) => number; riverWidth: (z: number) => number;
  coastDistance: (x: number, z: number) => number; landClearance: (x: number, z: number) => number;
  hillProj: (x: number, z: number) => number; hillLine: number; height: (x: number, z: number) => number;
  inRiver: (x: number, z: number) => boolean;
  /** 实时读取（每次调用现取 publicSites+landmarks），不可换成快照。 */
  reservations: () => ReadonlyArray<Vec2 & { radius: number }>;
  ringIndex: SegmentIndex;
};
export type CoastalRingRoadParams = { core: Vec2; seaside: SeasideBand | null };
export type CoastalRingRoadResult = { coastRoadRuns: Vec2[][]; coastalRunCount: number };

export function buildCoastalRingRoads(env: CoastalRingRoadWorld, params: CoastalRingRoadParams): CoastalRingRoadResult {
  const { network, coast, bbox, hasRiver, riverX, riverWidth, coastDistance, landClearance, hillProj, hillLine, height, inRiver, reservations, ringIndex } = env;
  const { core, seaside } = params;
  const { edges } = network;
  const key = keyOf;
  const addEdge = (a0: Vec2, b0: Vec2, arterial: boolean, bridge = false, primary = false) => addNetworkEdge(network, a0, b0, arterial, bridge, primary);

  // ── 环岛滨海路（规划总纲 S1，Lynch「边界要被路径看见」）：沿整条海岸、离水线 22 单位一条连续道路。
  // 曾只有海滨景观那 85° 一段有大道，其余海岸没有路（真机：住宅区一直延伸到海边却没有沿海道路）。
  // 跳过：海滨景观段（已有大道）、山体、河口、岸边用地；按连续可用段成路，段端稍后接入路网。
  const COAST_ROAD_OFFSET = 22;
  const coastRoadRuns: Vec2[][] = [];
  let coastalRunCount = 0; // 之前是环岛滨海路段，之后是河岸路段（S3 滨海景观带只沿前者铺）
  {
    const existingPrimary = new SegmentIndex([...edges.values()].filter((edge) => edge.width >= 12).map((edge) => edge.points));
    const n = coast.length;
    const offsetPoint = (i: number) => {
      const p = coast[i]; const prev = coast[(i - 1 + n) % n]; const next = coast[(i + 1) % n];
      let nx = -(next.z - prev.z); let nz = next.x - prev.x; const l = Math.hypot(nx, nz) || 1; nx /= l; nz /= l;
      if (nx * (core.x - p.x) + nz * (core.z - p.z) < 0) { nx = -nx; nz = -nz; }
      return { x: p.x + nx * COAST_ROAD_OFFSET, z: p.z + nz * COAST_ROAD_OFFSET };
    };
    const usable = (q: Vec2) => coastDistance(q.x, q.z) > 10 && !inRiver(q.x, q.z) && landClearance(q.x, q.z) > 10
      && hillProj(q.x, q.z) < hillLine - 12 && height(q.x, q.z) < 6
      && !(seaside && seasideStripContains(seaside, q, 6))
      && !reservations().some((site) => Math.hypot(q.x - site.x, q.z - site.z) < site.radius + 8)
      && !ringIndex.closerThan(q, 10)
      && !existingPrimary.closerThan(q, 26); // 已有主干道/海滨大道经过的岸段不再并排修一条
    const pts = Array.from({ length: n }, (_, i) => offsetPoint(i));
    const ok = pts.map(usable);
    // 从一个不可用点开始绕一圈，切出连续段（全可用时就是闭环）。
    const start = ok.indexOf(false);
    let current: Vec2[] = [];
    for (let k = 0; k <= n; k += 1) {
      const i = start < 0 ? k % n : (start + k) % n;
      const a = current[current.length - 1];
      const chordOk = !a || [0.25, 0.5, 0.75].every((t) => usable({ x: a.x + (pts[i].x - a.x) * t, z: a.z + (pts[i].z - a.z) * t }));
      if (ok[i] && chordOk) current.push(pts[i]);
      else { if (current.length >= 3) coastRoadRuns.push(current); current = ok[i] ? [pts[i]] : []; }
    }
    if (current.length >= 3) coastRoadRuns.push(current);
    // ── 河岸路（规划总纲 S2）：河是城市的另一条「边界」，两岸各一条沿河道路（离河道边缘 14），
    // 遇主干道/桥头/预留地断开，段端稍后以 T 路口接入。与环岛滨海路共用一套接入、避让与街网退让逻辑。
    coastalRunCount = coastRoadRuns.length;
    if (hasRiver) {
      const existingArterial = new SegmentIndex([...edges.values()].filter((edge) => edge.width >= 8 && !edge.bridge).map((edge) => edge.points));
      // Coastal candidates are accepted before publication into edges. River
      // planning must see those actual planned corridors too, not a stale
      // network-only reservation snapshot that permits a second width12 road.
      const plannedCoastalArterial = new SegmentIndex(coastRoadRuns.slice(0, coastalRunCount));
      const riverUsable = (q: Vec2) => coastDistance(q.x, q.z) > 14 && !inRiver(q.x, q.z) && landClearance(q.x, q.z) > 8
        && hillProj(q.x, q.z) < hillLine - 12 && height(q.x, q.z) < 6
        && !(seaside && seasideStripContains(seaside, q, 6))
        && !reservations().some((site) => Math.hypot(q.x - site.x, q.z - site.z) < site.radius + 8)
        // 不再避让环线高架：高架是架空的，河岸路从桥下穿过（曾在高架两侧各断一截，真机截图「道路缺少连接」）。
        && !existingArterial.closerThan(q, 28) && !plannedCoastalArterial.closerThan(q, 28); // 28 > 规划守卫的「拥挤」阈值 25
      for (const side of [-1, 1]) {
        let runPts: Vec2[] = [];
        for (let z = bbox.minZ; z <= bbox.maxZ; z += 20) {
          const q = { x: riverX(z) + side * (riverWidth(z) + 14), z };
          const last = runPts[runPts.length - 1];
          // <=4 spacing plus the existing 3-unit separation margin prevents
          // an unsampled chord interior from approaching a reserved coast road.
          const steps = last ? Math.max(1, Math.ceil(Math.hypot(q.x - last.x, q.z - last.z) / 4)) : 1;
          const chordOk = !last || Array.from({ length: steps - 1 }, (_, k) => (k + 1) / steps)
            .every((t) => riverUsable({ x: last.x + (q.x - last.x) * t, z: last.z + (q.z - last.z) * t }));
          if (riverUsable(q) && chordOk) runPts.push(q);
          else { if (runPts.length >= 3) coastRoadRuns.push(runPts); runPts = riverUsable(q) ? [q] : []; }
        }
        if (runPts.length >= 3) coastRoadRuns.push(runPts);
      }
    }
    // 主干级（宽 12）：与海滨大道同级，平行的街网道路据此降级为支路。
    for (const runPts of coastRoadRuns) for (let k = 1; k < runPts.length; k += 1) {
      addEdge(runPts[k - 1], runPts[k], true, false, true);
      const id = [roadNodeId(key(runPts[k - 1])), roadNodeId(key(runPts[k]))].sort().join("/");
      const edge = edges.get(id);
      if (edge && !edge.bridge && edge.structure === "ground-road") edge.purpose = "waterfront";
    }
  }
  return { coastRoadRuns, coastalRunCount };
}
