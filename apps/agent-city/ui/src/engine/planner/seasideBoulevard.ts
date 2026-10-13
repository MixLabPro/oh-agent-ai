/**
 * 海滨带 + 滨海大道（R5 第 3 道，逐字迁自 cityPlan.ts::buildPlan 的内嵌工序）。
 *
 * 三段同属一道工序：① 选海滨带（避开港口/河口方位）；② 把滨海大道的合法连续岸段铺进路网；
 * ③ 删去与大道并排的主干道段并记下主干新断头（稍后由 connectToNetwork 接入大道）。
 * 读：publicSites / landmarks / core / coast / hasRiver·riverX·riverWidth / coastDistance / height / seed / config。
 * 写：network.edges / network.nodes（addEdge、edges.delete、nodes.delete，原地、保持 Map 恒等与插入序）、
 *     coastalRoadEdgeIds / coastalRoadNodeIds（调用方持有的 Set，原地追加）。
 * 返回：seaside、coastalRoadRuns、trimmedTrunkEnds（原先是 buildPlan 里 let/const 的三个局部）。
 * 不调用 random()、不使用 commitNetwork；不 import ../cityPlan 的运行时（R2 边界）。
 */
import { DetMath as Math } from "../detMath";
import { boulevardSegments, buildSeasideBand, type CoastalConfig, type SeasideBand, type SeasideWorld } from "../citySeaside";
import type { Landmark } from "../cityPlan";
import type { PublicSite, Vec2 } from "../cityLayout";
import { roadNodeId, SegmentIndex } from "../roadGeometry";
import { addNetworkEdge, keyOf, type Network } from "./network";

export type SeasideBoulevardWorld = {
  network: Network;
  publicSites: readonly PublicSite[]; landmarks: readonly Landmark[];
  coast: Vec2[]; hasRiver: boolean; riverX: (z: number) => number; riverWidth: (z: number) => number;
  coastDistance: (x: number, z: number) => number; height: (x: number, z: number) => number;
  /** 调用方持有、原地追加（后续接入路与端点清理还要读）。 */
  coastalRoadEdgeIds: Set<string>; coastalRoadNodeIds: Set<string>;
};
export type SeasideBoulevardParams = { config: CoastalConfig | null; seed: number; core: Vec2 };
export type SeasideBoulevardResult = { seaside: SeasideBand | null; coastalRoadRuns: Vec2[][]; trimmedTrunkEnds: Vec2[] };

export function buildSeasideBoulevard(env: SeasideBoulevardWorld, params: SeasideBoulevardParams): SeasideBoulevardResult {
  const { network, publicSites, landmarks, coast, hasRiver, riverX, riverWidth, coastDistance, height, coastalRoadEdgeIds, coastalRoadNodeIds } = env;
  const { config, seed, core } = params;
  const { nodes, edges } = network;
  const key = keyOf;
  const addEdge = (a0: Vec2, b0: Vec2, arterial: boolean, bridge = false, primary = false) => addNetworkEdge(network, a0, b0, arterial, bridge, primary);

  // ── 海滨带（VICE B1）：选段避开港口与河口朝向；街区/地块避开保留带。
  // 港口已按「离核心最近海岸」放置，其方位由站点位置推出；河口 = 海岸点中离河中线近的两侧。
  let seaside: SeasideBand | null = null;
  if (config) {
    const blockedAzimuths: Array<{ at: number; halfWidth: number; weight?: number }> = [];
    const azimuthOf = (p: Vec2) => { let a = Math.atan2(p.z - core.z, p.x - core.x); if (a < 0) a += Math.PI * 2; return a; };
    for (const site of publicSites) if (site.kind === "harbor") blockedAzimuths.push({ at: azimuthOf(site), halfWidth: (30 * Math.PI) / 180, weight: 3 });
    if (hasRiver) {
      for (const point of coast) {
        if (Math.abs(point.x - riverX(point.z)) < riverWidth(point.z) + 30) blockedAzimuths.push({ at: azimuthOf(point), halfWidth: (14 * Math.PI) / 180 });
      }
    }
    const world: SeasideWorld = {
      landSignedDistance: coastDistance,
      height,
      slope: (x, z) => Math.hypot(height(x + 1, z) - height(x - 1, z), height(x, z + 1) - height(x, z - 1)) / 2,
      riverDistance: (x, z) => (hasRiver ? Math.abs(x - riverX(z)) - riverWidth(z) : Infinity),
      reservations: [...publicSites, ...landmarks].map((site) => ({ x: site.x, z: site.z, radius: site.radius })),
      blockedAzimuths,
    };
    seaside = buildSeasideBand(coast, core, world, config, seed);
  }

  // 滨海大道位于酒店排与棕榈步道之间。只消费合法连续岸段；无效样本处断开，
  // 不把水口/陡岸/港区缺口直线跨接。路段复用主干道宽度、路面纹理与路缘批次。
  const coastalRoadRuns = seaside && !seaside.degraded ? boulevardSegments(seaside).map((segment) => segment.map(key)) : [];
  for (const segment of coastalRoadRuns) {
    for (let k = 1; k < segment.length; k += 1) {
      const a = key(segment[k - 1]); const b = key(segment[k]);
      addEdge(a, b, true, false, true);
      const aId = roadNodeId(a); const bId = roadNodeId(b);
      coastalRoadNodeIds.add(aId); coastalRoadNodeIds.add(bId);
      coastalRoadEdgeIds.add([aId, bId].sort().join("/"));
    }
  }
  const trimmedTrunkEnds: Vec2[] = []; // 下方 connectToNetwork 定义后接入大道
  // 主干道先于海滨带生成，可能恰好沿着后来的海滨大道走到海边（两条宽路叠在一起，seed 1703326634 1 档）。
  // 大道铺好后，删去两端都在 18 内的主干道段，主干道新的断头再接入大道。
  if (coastalRoadRuns.length) {
    const boulevardIndex = new SegmentIndex(coastalRoadRuns);
    const loose: Vec2[] = [];
    for (const edge of [...edges.values()]) {
      if (edge.bridge || coastalRoadEdgeIds.has(edge.id) || edge.width < 12) continue;
      const [a, b] = edge.points;
      if (!boulevardIndex.closerThan(a, 18) || !boulevardIndex.closerThan(b, 18)) continue;
      edges.delete(edge.id); loose.push(a, b);
    }
    const degree = (p: Vec2) => { const id = roadNodeId(key(p)); let d = 0; for (const e of edges.values()) if (e.from === id || e.to === id) d += 1; return d; };
    for (const p of loose) {
      if (coastalRoadNodeIds.has(roadNodeId(key(p)))) continue;
      const d = degree(p);
      if (d === 0) { nodes.delete(roadNodeId(key(p))); continue; }
      if (d === 1) trimmedTrunkEnds.push(p);
    }
  }
  return { seaside, coastalRoadRuns, trimmedTrunkEnds };
}
