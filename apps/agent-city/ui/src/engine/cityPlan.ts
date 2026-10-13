import { DetMath as Math } from "./detMath"; // 跨引擎确定性：见 detMath.ts
/**
 * Seeded, data-independent geography and municipal land reservations.
 *
 * CITY_PLANNING_SPEC G1：先有地理、再铺街区、规模跟着档位走。
 *   L1 地理：种子 → 岛形（极坐标谐波 + 海湾 + 拉伸旋转）、河、山脊、城市核心点、生态带。
 *   规模：scaleTier（由会话总数分档，见 cityLayout）→ 目标地块数；岛按需放大到装得下
 *         （同一种子只放大不变形，档位不变时地图不变）。
 *   街区网格按岛的实际包围盒生成；公共用地与城区锚点相对核心点放置再贴到陆地上——
 *   不再有任何写死的岛形坐标（曾经全部写死：换种子岛形不变，岛一变就落海）。
 * 只读 (seed, scaleTier)，不读任何会话字段。
 */
import { hashSeed } from "../cityModel";
import { fbm, smoothstep } from "./cityNoise";
import { boulevardSegments, buildSeasideBand, MIAMI_COASTAL, seasideStripContains, type CoastalConfig, type SeasideBand, type SeasideWorld } from "./citySeaside";
import type { RepairContext } from "./planner/context";
import { initializeRepairPlanningWorld, runRepairDerivedFinalization, solvePlan } from "./planner/solve";
import { CONSTRAINTS, type CityPlan as ConstraintPlan } from "./planner/constraints";
import { closestPolylineSegment, polylineDistance } from "./planner/footprint";
import { canRelocateGroundSite, coastalSitingKinds, specByKind } from "./planner/sitespec";
import { candidatesFor, siteCandidateHardReject } from "./planner/access";
import { assignConnectedSite } from "./planner/jointSite";
import { proposeShorePlotAccess } from "./planner/shorePlotAccess";
import { frontSitesOnTrunks, resnapSitesOntoDryLand, restickSitesClearOfRingRuns, straddleSitesAcrossTrunk, groundFrontageSegments, type FrontageMoveContext } from "./planner/access";
import { localResiteCandidates, retreatShoreSitesToDryLand, settleHarborOnCoast, settleSailOperaOffshore, settleShoreSitesOnCoast, SAIL_OPERA_CONFIG, type ShoreMoveContext } from "./planner/siting";
import { buildGeography } from "./planner/geography";
import { roadCandidateCrowding } from "./planner/roadAdmission";
import { extractRoadFaces } from "./planner/roadFaces";
import { generateRoadBlocks, type RoadBlockReport } from "./planner/roadBlocks";
import { componentOf, diagnoseNetwork, type ConnectionDemand } from "./planner/intent";
import { buildSkeleton, chooseCore } from "./planner/skeleton";
import { addNetworkEdge, emptyNetwork, keyOf, type Network } from "./planner/network";
import { runConnection, endpointClear, commitFixedLink, parseFailure, type ConnectionAttempt, type ConnectorWorld } from "./planner/connect";
import { connectServiceLoops } from "./planner/loop";
import { connectGroundJunctions } from "./planner/junctions";
import { buildLandingCircles } from "./planner/landing";
import type { CityBlock, CityLayout, Parcel, PublicSite, RoadEdge, RoadNode, TerrainField, Vec2, Zone } from "./cityLayout";
import { clearsHighways, polygonDistance, roadNodeId, SegmentIndex, segmentDistance } from "./roadGeometry";
import { targetParcels } from "./scaleTier";
export { clearsHighways, polygonDistance, roadNodeId, SegmentIndex, segmentDistance } from "./roadGeometry";
export { MAX_TIER, scaleTierFor, SESSIONS_PER_TIER, targetParcels } from "./scaleTier";

export type Biome = "tropical" | "temperate" | "boreal" | "savanna" | "eastasian";

/** 致敬型地标（SPEC §4.4）：程序化几何、不复刻具体建筑；纯装饰，不占会话地块、不进统计。 */
export type LandmarkKind = "tv-tower" | "sail-opera" | "arch" | "pagoda" | "lighthouse" | "ferris-wheel" | "suspension-bridge" | "twin-towers" | "twist-tower" | "villa-complex";
/** shore：海上小岛地标（歌剧院）的堤道陆地端；有它即「立在水中的岛上」，不适用陆地/岸滩规则。 */
export type Landmark = Vec2 & { id: string; kind: LandmarkKind; yaw: number; radius: number; to?: Vec2; shore?: Vec2; access?: PublicSite["access"] };
const BIOMES: Biome[] = ["tropical", "temperate", "boreal", "savanna", "eastasian"];

/** Capacity is discontinuous when terrain/site/skeleton choices change. Never
 * extrapolate an almost-empty plan into a many-hundred-fold area expansion. */
export const RADIUS_CALIBRATION_CONFIG = { version: 1, maxRetries: 4, maxAreaGrowth: 2, capacityMargin: 1.04 };
export function nextCalibrationRadius(radius: number, required: number, available: number): number {
  if (![radius, required, available].every(Number.isFinite) || radius <= 0 || required <= 0 || available < 0) throw new RangeError("invalid capacity calibration input");
  if (available >= required) return radius;
  return radius * Math.min(Math.sqrt(RADIUS_CALIBRATION_CONFIG.maxAreaGrowth),
    Math.sqrt(required / Math.max(1, available)) * RADIUS_CALIBRATION_CONFIG.capacityMargin);
}

export type Shape = {
  stretch: number; spin: number;
  harmonics: Array<{ k: number; a: number; p: number }>;
  bays: Array<{ at: number; depth: number; width: number }>;
};

/** `opts.skipSolve` 仅供守卫（verify-city-solve）取「修复前」的草案；生产调用不传。 */
export function createCityPlan(seed: number, tier = 2, config: CoastalConfig | null = null, opts: { skipSolve?: boolean; memoizeTerrain?: boolean; legacyGridParcels?: boolean } = {}) {
  const random = (key: string) => hashSeed(`${seed}:${key}`);
  // 岛形参数（与半径无关）：放大时形状不变。
  const shape: Shape = {
    stretch: 0.78 + random("stretch") * 0.5,
    spin: random("spin") * Math.PI * 2,
    harmonics: [2, 3, 5].map((k) => ({ k, a: 0.05 + random(`h${k}`) * (k === 2 ? 0.16 : 0.1), p: random(`hp${k}`) * Math.PI * 2 })),
    bays: Array.from({ length: 1 + Math.floor(random("bays") * 3) }, (_, i) => ({ at: random(`bay${i}`) * Math.PI * 2, depth: 0.14 + random(`bayd${i}`) * 0.18, width: 0.18 + random(`bayw${i}`) * 0.25 })),
  };
  // 海滨配置（VICE B1）：提供 config 时强制生态带（miami-coastal → tropical），
  // 否则保持原有随机五选一——无配置调用方行为不变。
  const biome: Biome = config ? config.biome : BIOMES[Math.floor(random("biome") * BIOMES.length) % BIOMES.length];
  // 先按档位估一个半径，再按实测地块数校正（最多 4 次）：面积 ∝ R²。
  // 起始估计：390 半径 ≈ 一档 400 会话的地皮，再按实测地块数校正。
  let radius = 390 * Math.sqrt(tier);
  let plan = buildPlan(seed, radius, shape, biome, config, tier, !!opts.skipSolve, opts.memoizeTerrain === true, opts.legacyGridParcels === true);
  let radiusAttempts = 0; // 诊断（批次 8 §5.7「先测再做」）：半径校正实际重建次数的分布
  const radiusHistory = [{ attempt: 0, radius, generatedParcels: plan.parcelGeneration.generated,
    available: plan.blocks.reduce((sum, block) => sum + block.parcels.length, 0), roads: plan.roadEdges.length, blocks: plan.blocks.length }];
  for (let attempt = 0; attempt < RADIUS_CALIBRATION_CONFIG.maxRetries; attempt += 1) {
    const parcels = plan.blocks.reduce((sum, block) => sum + block.parcels.length, 0);
    if (parcels >= targetParcels(tier)) break;
    radius = nextCalibrationRadius(radius, targetParcels(tier), parcels);
    plan = buildPlan(seed, radius, shape, biome, config, tier, !!opts.skipSolve, opts.memoizeTerrain === true, opts.legacyGridParcels === true);
    radiusAttempts += 1;
    radiusHistory.push({ attempt: radiusAttempts, radius, generatedParcels: plan.parcelGeneration.generated,
      available: plan.blocks.reduce((sum, block) => sum + block.parcels.length, 0), roads: plan.roadEdges.length, blocks: plan.blocks.length });
  }
  const availableParcels = plan.blocks.reduce((sum, block) => sum + block.parcels.length, 0);
  const planningOutcome = availableParcels < targetParcels(tier)
    ? { ...plan.planningOutcome, status: "failed" as const, reasons: [...plan.planningOutcome.reasons, "required parcel capacity remains unmet"] }
    : plan.planningOutcome;
  return { ...plan, planningOutcome, scaleTier: tier, biome, radiusAttempts, radiusHistory,
    capacity: { required: targetParcels(tier), available: availableParcels, satisfied: availableParcels >= targetParcels(tier) } };
}

function buildPlan(seed: number, R: number, shape: Shape, biome: Biome, config: CoastalConfig | null, tier: number, skipSolve: boolean, memoizeTerrain: boolean, legacyGridParcels: boolean) {
  const random = (key: string) => hashSeed(`${seed}:${key}`);

  // ── L1 地理（V2 步 2a：逐字迁至 planner/geography.ts，random 无状态键控哈希、迁移不改调用序）──
  const geo = buildGeography(seed, R, shape, { memoize: memoizeTerrain });
  const { coast, bbox, hasRiver, river, riverShift, riverX, riverWidth, coastDistance, landClearance, hillAngle, hillDir, hillLine, hillProj, height, buildable, terrain } = geo;

  // ── 核心点（V2 步 2a 迁出；步 4 起带环线成活率降分与出口弦净空，见 skeleton.ts）──
  let core = chooseCore(geo, seed, random);

  /** 从名义位置就近找可建地：同心环搜索，离岸/离河至少 clearance，与已放置点保持间距。 */
  const snap = (nominal: Vec2, clearance: number, placed: Array<Vec2 & { radius: number }>, radius: number, accept?: (q: Vec2) => boolean): Vec2 => {
    for (let ring = 0; ring <= 60; ring += 1) {
      const steps = Math.max(1, ring * 8);
      for (let k = 0; k < steps; k += 1) {
        const a = (k / steps) * Math.PI * 2 + ring * 0.37;
        const q = { x: nominal.x + Math.cos(a) * ring * 12, z: nominal.z + Math.sin(a) * ring * 12 };
        if (landClearance(q.x, q.z) < clearance || hillProj(q.x, q.z) > hillLine - clearance * 0.5) continue;
        if (placed.some((o) => Math.hypot(o.x - q.x, o.z - q.z) < o.radius + radius + 20)) continue;
        if (accept && !accept(q)) continue;
        return q;
      }
    }
    return nominal;
  };
  const around = (angle: number, distance: number): Vec2 => ({ x: core.x + Math.cos(angle) * distance, z: core.z + Math.sin(angle) * distance });
  const turn = random("siteTurn") * Math.PI * 2;

  // ── 公共用地：相对核心点放置再贴陆地（按条件选址在 G3 细化）。
  const publicSites: PublicSite[] = [];
  // Municipal commitments exist before either skeleton or joint site search.
  // A failed station/stadium candidate cannot erase its placement/access duty.
  const declaredSiteDemands: ConnectionDemand[] = ["civic-square", "observation-tower", "riverside-park",
    "working-harbor", "central-station", "east-stadium"].map((ownerId) => ({ id: `site:${ownerId}`,
      class: "site-access", required: true, anchor: ownerId, originAnchor: ownerId }));
  // 离水的最小距离：港口只要 ~24（堆场 1.5r×1.2r，近边正好落在水线上），其余预留地仍是 radius+14。
  // 曾一律 radius+14=51，港口中心被推到离水 ~60 的内陆，码头和吊车立在沙地上（拍照实测）。
  const siteClearance = (kind: string, radius: number) => (kind === "harbor" ? 24 : radius + 14);
  const place = (id: string, kind: PublicSite["kind"], nominal: Vec2, radius: number, yaw: number) => {
    const q = snap(nominal, siteClearance(kind, radius), publicSites, radius);
    publicSites.push({ id, kind, x: q.x, z: q.z, radius, yaw });
  };
  place("civic-square", "civic", core, 44, -0.15);
  // 步 4 起 chooseCore 的硬门保证 snap 的环 0 必然命中（广场 === 核心点，civicPlazaCentred 构造成立）；
  // 无门控候选的小岛仍走旧口径：广场被推离核心时，广场挪到哪里核心点就跟到哪里，
  // 否则环岛、放射主干道、高架都围着旧核心画，广场孤悬一旁（用户截图；30 岛里 10 个偏 12–60）。
  { const plaza = publicSites[publicSites.length - 1]; core = { x: plaza.x, z: plaza.z }; }
  place("observation-tower", "tower", around(turn + 0.9, 0.16 * R), 26, 0);
  place("riverside-park", "park", hasRiver ? { x: riverX(core.z + 0.18 * R) + riverWidth(core.z) + 60, z: core.z + 0.18 * R } : around(turn + 3.6, 0.3 * R), 47, 0);
  {
    // 港口：离核心最近的一段海岸内侧（码头离市中心不远）。
    // 取离核心 ≥150 的最近岸点：核心贴海时（用户种子）曾取到市政广场旁的岸点，再被避让推进内陆，港口落在市中心（真机截图）。
    const byDistance = [...coast].sort((a, b) => Math.hypot(a.x - core.x, a.z - core.z) - Math.hypot(b.x - core.x, b.z - core.z));
    const shore = byDistance.find((p) => Math.hypot(p.x - core.x, p.z - core.z) >= 150) ?? byDistance[0];
    // 中心只内移 10：码头半边伸向水面（buildMarina 的栈桥由此入海）。
    const toCore = Math.max(1, Math.hypot(core.x - shore.x, core.z - shore.z));
    const inset = Math.min(10, toCore * 0.5);
    const inward = { x: shore.x + ((core.x - shore.x) / toCore) * inset, z: shore.z + ((core.z - shore.z) / toCore) * inset };
    place("working-harbor", "harbor", inward, 37, -Math.atan2(shore.z - core.z, shore.x - core.x));
  }

  // ── 致敬型地标：种子从候选里抽 2–3 座，按地理条件选址；和公共用地一样先于街区预留土地。
  const landmarks: Landmark[] = [];
  {
    const shoreOrder = [...coast].sort((p, q) => Math.hypot(p.x - core.x, p.z - core.z) - Math.hypot(q.x - core.x, q.z - core.z));
    const inwardFrom = (shore: Vec2, amount: number) => ({ x: shore.x + (core.x - shore.x) * amount, z: shore.z + (core.z - shore.z) * amount });
    const taken = () => [...publicSites, ...landmarks].map((site) => ({ x: site.x, z: site.z, radius: site.radius }));
    const candidates: Array<{ kind: LandmarkKind; weight: number; site: () => { at: Vec2; radius: number; clearance: number; yaw: number } | null }> = [
      { kind: "tv-tower", weight: 2, site: () => ({ at: around(turn + 0.4, 0.14 * R), radius: 16, clearance: 20, yaw: 0 }) },
      { kind: "twin-towers", weight: 1, site: () => ({ at: around(turn + 3.1, 0.12 * R), radius: 22, clearance: 20, yaw: turn }) },
      { kind: "twist-tower", weight: 1, site: () => ({ at: around(turn + 2.6, 0.17 * R), radius: 16, clearance: 20, yaw: 0 }) },
      { kind: "arch", weight: 1, site: () => ({ at: around(turn + 5.6, 0.26 * R), radius: 18, clearance: 20, yaw: turn + 5.6 }) },
      { kind: "sail-opera", weight: 2, site: () => { const shore = shoreOrder[Math.min(shoreOrder.length - 1, 3)]; return { at: inwardFrom(shore, 0.1), radius: 34, clearance: 16, yaw: -Math.atan2(shore.z - core.z, shore.x - core.x) }; } },
      { kind: "lighthouse", weight: 2, site: () => { const shore = shoreOrder[shoreOrder.length - 1]; return { at: inwardFrom(shore, 0.04), radius: 12, clearance: 6, yaw: 0 }; } },
      { kind: "ferris-wheel", weight: 2, site: () => { const shore = shoreOrder[Math.floor(shoreOrder.length * 0.45)]; return { at: inwardFrom(shore, 0.08), radius: 26, clearance: 14, yaw: -Math.atan2(shore.z - core.z, shore.x - core.x) + Math.PI / 2 }; } },
      { kind: "pagoda", weight: biome === "eastasian" ? 5 : 1, site: () => ({ at: { x: hillDir.x * (hillLine - 80), z: hillDir.z * (hillLine - 80) }, radius: 18, clearance: 18, yaw: hillAngle }) },
      // 地中海庄园：低层纪念性地标，天际线里「横向白楼 + 红陶坡顶」的断点。热带海滨优先；
      // 站位与帆顶剧院（shoreOrder[3]）错开；拱廊面（局部 +Z）朝向放置点看到的局部岸线方向，
      // 大岛上这与「朝城心反向」并不重合——平行水线才能读成滨海庄园。
      { kind: "villa-complex", weight: biome === "tropical" ? 4 : 1, site: () => { const shore = shoreOrder[Math.min(shoreOrder.length - 1, 5)]; const at = inwardFrom(shore, 0.08); return { at, radius: 34, clearance: 16, yaw: Math.atan2(shore.x - at.x, shore.z - at.z) }; } },
    ];
    // 数量随岛规模增长：1 档 4 座，每两档多一座，最多 7 座。曾固定抽 2–3 座：摩天轮只在 16/60 个种子里出现，
    // 真机反馈「原来的吊桥和摩天轮为什么没看见」。
    const count = Math.min(9, 6 + Math.floor((tier - 1) / 2)); // 固定地标增至 5 座（塔/庄园/摩天轮/歌剧院/灯塔），总数随之上调，仍给抽签留 1–4 席
    const pool = [...candidates];
    // Vice City 的第一眼轮廓需要一座 downtown 高塔；若完全按抽签，某些种子会
    // 只抽到灯塔/摩天轮/低矮文化馆，低会话量时整座城就像空地块规划图。
    // 高塔属于固定城市地标，不代表会话、不进数据统计；具体造型仍由 seed 决定。
    if (config?.profile === "miami-coastal") {
      const skylineKinds: LandmarkKind[] = ["twin-towers", "twist-tower"];
      const skylineKind = skylineKinds[Math.floor(random("miami-skyline") * skylineKinds.length)];
      const skylineIndex = pool.findIndex((candidate) => candidate.kind === skylineKind);
      if (skylineIndex >= 0) {
        const skyline = pool.splice(skylineIndex, 1)[0];
        // 双子塔与扭转塔二选一：固定高塔占位后，另一座不再进抽签池（曾在 5 档岛上两座同时出现）。
        for (let k = pool.length - 1; k >= 0; k -= 1) if (pool[k].kind === "twin-towers" || pool[k].kind === "twist-tower") pool.splice(k, 1);
        const site = skyline.site();
        if (site) {
          const q = snap(site.at, site.clearance, taken(), site.radius);
          landmarks.push({ id: `landmark:${skyline.kind}`, kind: skyline.kind, x: q.x, z: q.z, yaw: site.yaw, radius: site.radius });
        }
      }
    }
    // 摩天轮是海滨城的第二个固定标志（与高塔一样不代表会话），其余仍由种子抽选。
    if (config?.profile === "miami-coastal") {
      // 地中海庄园与摩天轮一样是海滨城固定地标（用户：「没有看见这些城市地标建筑物」——抽签抽不到就永远看不见）。
      // 海滨城识别锚点不靠抽签（用户：「种子彩票」——小档位的抽签名额被固定地标挤占，灯塔/帆顶剧院可能永远看不到）：
      // 帆形歌剧院与灯塔也固定放置，和庄园、摩天轮同一模式。
      for (const fixedKind of ["sail-opera", "lighthouse"] as LandmarkKind[]) {
        const index = pool.findIndex((candidate) => candidate.kind === fixedKind);
        if (index < 0) continue;
        const fixed = pool.splice(index, 1)[0];
        const site = fixed.site();
        if (!site) continue;
        const q = snap(site.at, site.clearance, taken(), site.radius);
        landmarks.push({ id: `landmark:${fixed.kind}`, kind: fixed.kind, x: q.x, z: q.z, yaw: site.yaw, radius: site.radius });
      }
      const villaIndex = pool.findIndex((candidate) => candidate.kind === "villa-complex");
      if (villaIndex >= 0) {
        const villa = pool.splice(villaIndex, 1)[0];
        const site = villa.site();
        if (site) {
          const q = snap(site.at, site.clearance, taken(), site.radius);
          landmarks.push({ id: `landmark:${villa.kind}`, kind: villa.kind, x: q.x, z: q.z, yaw: site.yaw, radius: site.radius });
        }
      }
      const wheelIndex = pool.findIndex((candidate) => candidate.kind === "ferris-wheel");
      if (wheelIndex >= 0) {
        const wheel = pool.splice(wheelIndex, 1)[0];
        const site = wheel.site();
        if (site) {
          const q = snap(site.at, site.clearance, taken(), site.radius);
          landmarks.push({ id: `landmark:${wheel.kind}`, kind: wheel.kind, x: q.x, z: q.z, yaw: site.yaw, radius: site.radius });
        }
      }
    }
    // 高塔已占一席；余下地标保持种子抽选。
    for (let n = landmarks.length; n < count && pool.length; n += 1) {
      const total = pool.reduce((sum, c) => sum + c.weight, 0);
      let pick = random(`landmark${n}`) * total;
      let index = 0;
      while (index < pool.length - 1 && pick >= pool[index].weight) { pick -= pool[index].weight; index += 1; }
      const chosen = pool.splice(index, 1)[0];
      // 双子塔与扭转塔同属 downtown 高塔：抽到一个就不再抽另一个。
      if (chosen.kind === "twin-towers" || chosen.kind === "twist-tower") for (let k = pool.length - 1; k >= 0; k -= 1) if (pool[k].kind === "twin-towers" || pool[k].kind === "twist-tower") pool.splice(k, 1);
      const site = chosen.site();
      if (!site) continue;
      const q = snap(site.at, site.clearance, taken(), site.radius);
      landmarks.push({ id: `landmark:${chosen.kind}`, kind: chosen.kind, x: q.x, z: q.z, yaw: site.yaw, radius: site.radius });
    }
  }
  /** 公共用地 + 地标：街区与地块都要避开的预留地。 */
  const reservations = () => [...publicSites, ...landmarks];

  // ── L2 骨架（CITY_PLANNING_SPEC §4.3）──
  // 主干道从核心放射、沿陆地延伸到海边，过河处自动成桥；环线高架绕核心一圈（沿陆地断续）；
  // 主干道之间每个扇区各铺一张朝向沿扇区放射方向的街网——不再是全岛一张方格（曾经整张方格盖在岛上）。
  // 路网原语（V2 步 2b-lite）：nodes/edges/key/addEdge 由 planner/network.ts 唯一实现，此处只留薄包装。
  const network = emptyNetwork();
  const { nodes, edges } = network;
  const coastalRoadEdgeIds = new Set<string>();
  const coastalRoadNodeIds = new Set<string>();
  const key = keyOf;
  const addEdge = (a0: Vec2, b0: Vec2, arterial: boolean, bridge = false, primary = false) => addNetworkEdge(network, a0, b0, arterial, bridge, primary);
  const inRiver = (x: number, z: number) => hasRiver && coastDistance(x, z) > 0 && Math.abs(x - riverX(z)) < riverWidth(z);
  // 占地谓词统一走 planner/footprint（V2 步 1）：此处只注入地理闭包；河岸带口径（不含 coastDistance）与
  // inRiver 不同，历史上就是两套判断，按原语义各自保留。
  const footprintGeo = { height, inRiver, riverBank: (x: number, z: number, bank: number) => hasRiver && Math.abs(x - riverX(z)) < riverWidth(z) + bank };

  // 岸边类集合由 sitespec 表派生（V2 网络优先 6b-2：值 === 原 Set 字面量，守卫 verify-city-sitespec 证相等）。
  const SHORE_SITE_KINDS = coastalSitingKinds(); // 庄园：临水拱廊，同属岸边地标
  // Selected landmarks are committed before roads; optional selection itself
  // remains a distinct capability, not a reason to drop an accepted owner.
  for (const site of landmarks) if (site.radius) declaredSiteDemands.push({ id: `site:${site.id}`,
    class: "site-access", required: true, anchor: site.id, originAnchor: site.id });
  // ── 骨架（V2 步 2b-full：逐字迁至 planner/skeleton.ts::buildSkeleton）──
  // Only accepted fixed reservations constrain this stage. Other nominal
  // candidates are deliberately reassigned in the frontage/shore passes below;
  // treating their temporary locations as immutable kills valid corridors.
  const fixedSkeletonSites = publicSites.filter((site) => site.kind === "civic" || site.kind === "harbor" || site.access);
  const fixedSkeletonLandmarks = landmarks.filter((site) => "access" in site && site.access);
  const skeletonReservationIds = [...fixedSkeletonSites, ...fixedSkeletonLandmarks].map((site) => site.id);
  const { trunks, bridges, ringRuns, primaryAnchorNodeId, primaryAnchorNodeIds, diagnostics: skeletonDiagnostics } = buildSkeleton({ geo, seed, core,
    publicSites: fixedSkeletonSites, landmarks: fixedSkeletonLandmarks, shoreSiteKinds: SHORE_SITE_KINDS, random, network, inRiver });
  const trunkRuns = trunks.map((trunk) => trunk.points);
  const trunkIndex = new SegmentIndex(trunkRuns);
  const distanceToTrunks = (p: Vec2) => polylineDistance(trunkRuns, p);

  // 主干按段（桥段剔除）与临路挪动四遍的显式依赖（V2 网络优先 6b-2：遍体逐字迁至 planner/access.ts；
  // trunkSegments 提前到避高架遍之前定义——纯计算无副作用，snap/siteClearance 环搜闭包按引用传入）。
  const trunkSegments = trunks.flatMap((trunk) => trunk.points.slice(1).map((b, k) => [trunk.points[k], b] as const))
    .filter(([a, b]) => !bridges.some((bridge) => bridge.to === b || bridge.from === a && bridge.to === b));
  const frontageCtx: FrontageMoveContext = { publicSites, landmarks, trunkRuns, trunkSegments, ringRuns, height, inRiver: footprintGeo.inRiver, riverBank: footprintGeo.riverBank, buildable, landClearance, snap, siteClearance };
  // 岸线挪动四遍的显式依赖（V2 网络优先 6b-1：遍体逐字迁至 planner/siting.ts；此处只组 ctx，行为不变）。
  const shoreCtx: ShoreMoveContext = { publicSites, landmarks, core, coast, coastDistance, height, inRiver: footprintGeo.inRiver, riverBank: footprintGeo.riverBank, trunkRuns, bridges, ringRuns };
  // 公共用地与地标先于环线选址，名义位置可能正压在高架上（clearsHighways 守卫只覆盖了地块/配套/花园）：
  // 环线只取决于核心点与岛半径，所以这里把压线的预留地原地重新贴到不压高架的位置；街区与地块都在此之后生成。
  restickSitesClearOfRingRuns(frontageCtx);
  // 岸边地标（歌剧院、摩天轮、灯塔、庄园）向核心方向内移，直到占地圈 16 点里落在水上的 ≤3 个——
  // 曾按「离核心最近的海岸点」放下就不管了，约三分之一占地悬在海面上（场景依赖守卫抓到）。港口本就临水，除外。
  retreatShoreSitesToDryLand(shoreCtx);
  // ── 用地临街（R2）：内陆的公共用地与地标贴到最近主干道的一侧（边缘离路肩 6），朝向与道路对齐。
  // 曾在主干道之前按地理选址、之后互不避让：车站中心正压在主干道上，10 个对象没有一个与门前道路对齐。
  // 岸边对象（港口、灯塔、歌剧院、摩天轮）保持海岸位置，稍后补一条入口路。
  // 跨路地标（门式）：凯旋门骑在主干道上、道路从拱券开口穿过——曾与其它用地一样贴到路旁，门下是草地
  // （用户截图：「凯旋门下面不是路？建筑物缺少约束」）。取最近主干道中段，开口轴（局部 z）沿道路方向。
  straddleSitesAcrossTrunk({ ...frontageCtx, trunkSegments: groundFrontageSegments([...network.edges.values()]) });
  frontSitesOnTrunks(frontageCtx);
  // 占地内外两圈 16 个点都得是干地（高于 0.8、不在河道里）：水面渲染还盖住低矮的河岸坡，只看到河道中线的距离不够。
  // 仍不在干地的内陆用地（岸边/跨路/广场豁免，各有专属遍或构造保证）重贴到干地。
  resnapSitesOntoDryLand(frontageCtx);
  // 港口最后贴回岸线：前面的避让（离其它用地、离环线高架）会把它推进内陆，港口离水上百（用户截图：港口在市中心）。
  // 朝最近的岸点逐步移动，直到中心离岸 ≤ 12（码头半边伸进水面）。
  settleHarborOnCoast(shoreCtx);
  // 岸边地标（帆形歌剧院、灯塔、摩天轮、庄园）同样贴回岸线（用户：「类似悉尼歌剧院的建筑不是应该在水边吗」）：
  // 朝最近岸点移动到中心离岸 ≈ 0.7 半径，同时占地圈 16 点落水不超过 3（立在水边、不悬空）。
  settleShoreSitesOnCoast(shoreCtx);
  // 帆形歌剧院改立在海上小岛、以堤道连岸（用户：「歌剧院不应该在河里，需要在海上」「范式和机场一样」）。
  // 取离当前位置最近的几个岸点，岸外 radius+40 处整个占地圈必须是深水（不在河口），且离港口/其它用地够远。
  let sailOperaCandidateSets = settleSailOperaOffshore(shoreCtx);
  const siteObligations: Array<{ ownerId: string; placed: boolean; reason?: string; routeRetries?: number }> = [];
  const jointSiteProgramme = [["central-station", "station"], ["east-stadium", "stadium"]] as const;
  for (const [ownerId, kind] of jointSiteProgramme) {
    let assigned = assignConnectedSite({ ...geo, core, turn, trunkRuns, ringRuns, bridges, placed: [...publicSites, ...landmarks], height, inRiver,
      riverBank: footprintGeo.riverBank }, { network, geo, inRiver, reservations }, specByKind(kind)!, ownerId, primaryAnchorNodeId);
    let relocationFailure: string | undefined;
    if (!assigned.site && assigned.reason?.includes("site-spacing")) {
      type RelocationPatch = { publicSites: PublicSite[]; landmarks: Landmark[]; opera: typeof sailOperaCandidateSets };
      const patches = new Map<string, RelocationPatch>();
      const currentSites = [...publicSites, ...landmarks].filter((site) => site.radius);
      const overlapCount = (sites: typeof currentSites) => {
        let count = 0;
        for (let i = 0; i < sites.length; i += 1) for (let j = i + 1; j < sites.length; j += 1) {
          if (Math.hypot(sites[i].x - sites[j].x, sites[i].z - sites[j].z) < sites[i].radius + sites[j].radius) count += 1;
        }
        return count;
      };
      const baselineOverlaps = overlapCount(currentSites);
      const currentRoads = [...network.edges.values()].map((edge) => edge.points);
      const baselineRoadOverlaps = currentSites.filter((site) => site.kind !== "civic" && site.kind !== "arch"
        && polylineDistance(currentRoads, site) < site.radius * 0.7).length;
      const relocationRejects = new Map<string, number>();
      const noteRelocationReject = (reason: string) => relocationRejects.set(reason, (relocationRejects.get(reason) ?? 0) + 1);
      const ownerRules = CONSTRAINTS.filter((constraint) => ["siteInWater", "siteWithoutDoorRoad", "roadThroughSite",
        "sitesOverlap", "stationStadiumSetback", "stationDoorFacesRoad", "archStraddlesRoad"].includes(constraint.id));
      const ownerView = (candidateNetwork: Network, sites: PublicSite[], marks: Landmark[]) => ({
        roadEdges: [...candidateNetwork.edges.values()], roadNodes: [...candidateNetwork.nodes.values()], publicSites: sites, landmarks: marks,
        blocks: [], terrain, core, coast, river, seaside: null, coastRoads: [], riverRoadRuns: [], primaryAnchorNodeId,
      } as unknown as ConstraintPlan);
      const ownerIdentity = (violation: ReturnType<typeof ownerRules[number]["measure"]>[number], sites: typeof currentSites) =>
        sites.find((site) => site.kind === violation.site && site.x === violation.at?.x && site.z === violation.at?.z)?.id
        ?? JSON.stringify([violation.site, violation.at, violation.detail]);
      const previousOwnerFailures = new Map(ownerRules.map((constraint) => [constraint.id,
        new Set(constraint.measure(ownerView(network, publicSites, landmarks)).map((violation) => ownerIdentity(violation, currentSites)))]));
      const moveOptionalSites = (owner: PublicSite, candidateNetwork: Network): string | null => {
        const stagedPublic = publicSites.map((site) => ({ ...site, ...(site.access ? { access: { ...site.access } } : {}) }));
        const stagedLandmarks = landmarks.map((site) => ({ ...site, ...("shore" in site && site.shore ? { shore: { ...site.shore } } : {}) }));
        stagedPublic.push(owner);
        const initialSites = [...stagedPublic, ...stagedLandmarks].filter((site) => site.radius);
        const initialOwner = initialSites.find((site) => site.id === ownerId)!;
        const candidateRoads = [...candidateNetwork.edges.values()].map((edge) => edge.points);
        const blockerIds = new Set(initialSites.filter((site) => site !== initialOwner && (
          Math.hypot(site.x - initialOwner.x, site.z - initialOwner.z) < site.radius + initialOwner.radius + 10
          || (site.kind !== "civic" && site.kind !== "arch" && polylineDistance(candidateRoads, site) < site.radius * 0.7)
        )).map((site) => site.id));
        if (blockerIds.size > 0) {
          const fixedBlocker = initialSites.find((site) => blockerIds.has(site.id)
            && (site.kind === "civic" || site.kind === "harbor" || ("access" in site && site.access)));
          if (fixedBlocker) return `site-relocation-fixed-blocker(${fixedBlocker.id})`;
          const actualTrunks = [...candidateNetwork.edges.values()].filter((edge) => !edge.bridge && edge.width >= 8).map((edge) => edge.points);
          const actualSegments = actualTrunks.flatMap((run) => run.slice(1).map((point, index) => [run[index], point] as [Vec2, Vec2]));
          const stagedFrontage = { ...frontageCtx, trunkRuns: actualTrunks, trunkSegments: actualSegments,
            publicSites: stagedPublic, landmarks: stagedLandmarks, relocateSiteIds: blockerIds };
          const stagedShore = { ...shoreCtx, publicSites: stagedPublic, landmarks: stagedLandmarks, relocateSiteIds: blockerIds,
            neighbourMargins: new Map([[ownerId, 10]]), trunkRuns: actualTrunks, roadEnvelopes: [...candidateNetwork.edges.values()] };
          restickSitesClearOfRingRuns(stagedFrontage);
          const archSegments = groundFrontageSegments([...candidateNetwork.edges.values()]);
          straddleSitesAcrossTrunk({ ...stagedFrontage, trunkSegments: archSegments });
          frontSitesOnTrunks(stagedFrontage);
          resnapSitesOntoDryLand(stagedFrontage);
          settleShoreSitesOnCoast(stagedShore);
          const stagedOpera = [...stagedLandmarks].some((site) => blockerIds.has(site.id) && site.kind === "sail-opera")
            ? settleSailOperaOffshore(stagedShore) : sailOperaCandidateSets;
          // The legacy movement passes do not reposition every relocatable class
          // (for example, a dry park may have no frontage/wet/foundation violation).
          // When it still blocks a required owner, search that model's declared,
          // bounded placement candidates against the complete staged site set.
          const requiredOwner = [...stagedPublic, ...stagedLandmarks].find((site) => site.id === ownerId)!;
          const actualPlaced = [...stagedPublic, ...stagedLandmarks].filter((site) => site.radius);
          const movableBlockers = [...blockerIds].sort().map((id) => actualPlaced.find((site) => site.id === id))
            .filter((site): site is typeof actualPlaced[number] => !!site
              && Math.hypot(site.x - requiredOwner.x, site.z - requiredOwner.z) < site.radius + requiredOwner.radius + 10);
          if (movableBlockers.length > 2) noteRelocationReject("joint-blocker-node-budget-exhausted");
          else if (movableBlockers.length) {
            const movableIds = new Set(movableBlockers.map((site) => site.id));
            const fixedPlaced = actualPlaced.filter((site) => !movableIds.has(site.id));
            const options: Array<Array<{ site: typeof movableBlockers[number]; spec: NonNullable<ReturnType<typeof specByKind>>; candidate: ReturnType<typeof candidatesFor>[number] }>> = [];
            let invalidBlocker = false;
            for (const blocker of movableBlockers) {
              const spec = specByKind(blocker.kind);
              if (!canRelocateGroundSite(blocker) || !spec) { noteRelocationReject(`${blocker.id}:immovable-or-unregistered`); invalidBlocker = true; break; }
              const placementWorld = { ...geo, core, turn, trunkRuns: actualTrunks, ringRuns, bridges, inRiver, riverBank: footprintGeo.riverBank,
                placed: fixedPlaced.map((site) => ({ x: site.x, z: site.z, radius: site.radius })) };
              const generated = [...candidatesFor(placementWorld, spec, blocker),
                ...[...localResiteCandidates(blocker)].map((at, index) => ({ ...at, yaw: blocker.yaw,
                  id: `required-owner-relocation:${blocker.id}:${index}`, source: "declared-local-resite" }))];
              const admitted: typeof options[number] = [];
              for (const candidate of generated) {
                const hardFailure = siteCandidateHardReject(placementWorld, spec, candidate);
                if (hardFailure) { noteRelocationReject(`${blocker.id}:${hardFailure}`); continue; }
                const roadDistance = Math.min(...candidateRoads.map((run) => polylineDistance([run], candidate)));
                if (roadDistance > spec.radius + 20) { noteRelocationReject(`${blocker.id}:door-road-distance`); continue; }
                admitted.push({ site: blocker, spec, candidate });
              }
              admitted.sort((a, b) => Math.hypot(a.candidate.x - blocker.x, a.candidate.z - blocker.z)
                - Math.hypot(b.candidate.x - blocker.x, b.candidate.z - blocker.z)
                || (a.candidate.id < b.candidate.id ? -1 : a.candidate.id > b.candidate.id ? 1 : 0));
              options.push(admitted.slice(0, 64));
              if (!admitted.length) noteRelocationReject(`${blocker.id}:no-hard-admissible-candidate`);
            }
            if (!invalidBlocker && options.every((list) => list.length)) {
              const selected: typeof options[number] = [];
              let accepted = false;
              const search = (index: number) => {
                if (accepted) return;
                if (index < options.length) { for (const option of options[index]) { selected.push(option); search(index + 1); selected.pop(); if (accepted) break; } return; }
                const targetById = new Map(selected.map((entry) => [entry.site.id, entry.candidate]));
                const completePlaced = actualPlaced.filter((site) => !movableIds.has(site.id)).map((site) => ({ x: site.x, z: site.z, radius: site.radius }));
                for (const entry of selected) completePlaced.push({ x: entry.candidate.x, z: entry.candidate.z, radius: entry.spec.radius });
                for (const entry of selected) {
                  const world = { ...geo, core, turn, trunkRuns: actualTrunks, ringRuns, bridges, inRiver, riverBank: footprintGeo.riverBank,
                    placed: completePlaced.filter((site) => site.x !== targetById.get(entry.site.id)!.x || site.z !== targetById.get(entry.site.id)!.z) };
                  if (siteCandidateHardReject(world, entry.spec, entry.candidate)) { noteRelocationReject(`${entry.site.id}:joint-final-hard-check`); return; }
                  if (Math.min(...candidateRoads.map((run) => polylineDistance([run], entry.candidate))) > entry.spec.radius + 20) {
                    noteRelocationReject(`${entry.site.id}:joint-final-door-road`); return;
                  }
                }
                const prior = selected.map(({ site }) => ({ site, x: site.x, z: site.z, yaw: site.yaw }));
                for (const entry of selected) { entry.site.x = entry.candidate.x; entry.site.z = entry.candidate.z; entry.site.yaw = entry.candidate.yaw; }
                const trialSites = [...stagedPublic, ...stagedLandmarks].filter((site) => site.radius);
                const spacingConflict = trialSites.some((site) => site !== requiredOwner
                  && Math.hypot(site.x - requiredOwner.x, site.z - requiredOwner.z) < site.radius + requiredOwner.radius + 10);
                const introducedFinding = spacingConflict ? null : ownerRules.flatMap((constraint) => constraint.measure(ownerView(candidateNetwork, stagedPublic, stagedLandmarks))
                  .filter((violation) => !previousOwnerFailures.get(constraint.id)!.has(ownerIdentity(violation, trialSites)))
                  .map((violation) => ({ constraint, violation })))[0] ?? null;
                const introducedConstraint = introducedFinding?.constraint ?? null;
                const newViolation = !!introducedConstraint;
                if (!spacingConflict && !newViolation) { accepted = true; return; }
                noteRelocationReject(spacingConflict ? "joint-blockers:owner-spacing" : `joint-blockers:new-${introducedConstraint?.id ?? "owner-constraint"}:${introducedFinding ? ownerIdentity(introducedFinding.violation, trialSites) : "unknown"}`);
                for (const entry of prior) { entry.site.x = entry.x; entry.site.z = entry.z; entry.site.yaw = entry.yaw; }
              };
              search(0);
              if (!accepted) noteRelocationReject("joint-blockers:no-accepted-combination");
            }
          }
          const stagedSites = [...stagedPublic, ...stagedLandmarks].filter((site) => site.radius);
          const stagedOwner = stagedSites.find((site) => site.id === ownerId)!;
          const ownerSpacingBlockers = stagedSites.filter((site) => site !== stagedOwner
            && Math.hypot(site.x - stagedOwner.x, site.z - stagedOwner.z) < site.radius + stagedOwner.radius + 10);
          const ownerSpacingConflict = ownerSpacingBlockers.length > 0;
          const roadOverlaps = stagedSites.filter((site) => site.kind !== "civic" && site.kind !== "arch"
            && polylineDistance(candidateRoads, site) < site.radius * 0.7).length;
          if (ownerSpacingConflict || overlapCount(stagedSites) > baselineOverlaps || roadOverlaps > baselineRoadOverlaps) {
            const evidence = [...relocationRejects].sort(([a], [b]) => a.localeCompare(b)).map(([reason, count]) => `${reason}=${count}`).join(",");
            return `site-relocation-refused(ownerSpacing=${ownerSpacingConflict},siteOverlaps=${overlapCount(stagedSites)}>${baselineOverlaps},roadOverlaps=${roadOverlaps}>${baselineRoadOverlaps}) blockers=[${ownerSpacingBlockers.map((site) => site.id).join(",")}] relocation=[${evidence}]`;
          }
          for (const constraint of ownerRules) if (constraint.measure(ownerView(candidateNetwork, stagedPublic, stagedLandmarks))
            .some((violation) => !previousOwnerFailures.get(constraint.id)!.has(ownerIdentity(violation, stagedSites)))) return `site-relocation-new-${constraint.id}`;
          patches.set(ownerId, { publicSites: stagedPublic, landmarks: stagedLandmarks, opera: stagedOpera });
        } else patches.set(ownerId, { publicSites: stagedPublic, landmarks: stagedLandmarks, opera: sailOperaCandidateSets });
        return null;
      };
      const stagedPublic = publicSites.map((site) => ({ ...site, ...(site.access ? { access: { ...site.access } } : {}) }));
      const stagedLandmarks = landmarks.map((site) => ({ ...site, ...("shore" in site && site.shore ? { shore: { ...site.shore } } : {}) }));
      const fixed = [...stagedPublic, ...stagedLandmarks].filter((site) => site.kind === "civic" || site.kind === "harbor" || ("access" in site && site.access));
      const retry = assignConnectedSite({ ...geo, core, turn, trunkRuns, ringRuns, bridges, placed: fixed, height, inRiver,
        riverBank: footprintGeo.riverBank }, { network, geo, inRiver, reservations: () => fixed }, specByKind(kind)!, ownerId, primaryAnchorNodeId, moveOptionalSites);
      if (retry.site && retry.network) {
        const patch = patches.get(ownerId);
        if (!patch) throw new Error(`missing site relocation patch for ${ownerId}`);
        publicSites.splice(0, publicSites.length, ...patch.publicSites);
        landmarks.splice(0, landmarks.length, ...patch.landmarks);
        sailOperaCandidateSets = patch.opera;
        assigned = retry;
      } else relocationFailure = `relocation retry: ${retry.reason ?? "no connected candidate"}`;
    }
    siteObligations.push({ ownerId, placed: !!assigned.site, ...(assigned.routeRetries ? { routeRetries: assigned.routeRetries } : {}),
      ...(!assigned.site ? { reason: [assigned.reason, relocationFailure].filter(Boolean).join("; ") } : {}) });
    if (!assigned.site || !assigned.network) continue;
    nodes.clear(); for (const [id, node] of assigned.network.nodes) nodes.set(id, node);
    edges.clear(); for (const [id, edge] of assigned.network.edges) edges.set(id, edge);
    const versioned = network as Network & { version?: number }; versioned.version = (versioned.version ?? 0) + 1;
    if (!publicSites.some((site) => site.id === assigned.site!.id)) publicSites.push(assigned.site);
  }
  const ringIndex = new SegmentIndex(ringRuns);
  const distanceToRing = (p: Vec2) => polylineDistance(ringRuns, p);

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
  const coastRoadIndex = new SegmentIndex(coastRoadRuns);

  // 两端都接入陆侧主干道，避免只有拓扑连通但车辆到大道时会瞬移/断头。
  // 连接线按 4 单位采样，避让水面、陡坡、海岸和市政/地标预留地。
  const safeRoadLink = (a: Vec2, b: Vec2) => {
    const distance = Math.hypot(b.x - a.x, b.z - a.z);
    const steps = Math.max(1, Math.ceil(distance / 4));
    for (let i = 0; i <= steps; i += 1) {
      const p = { x: a.x + (b.x - a.x) * i / steps, z: a.z + (b.z - a.z) * i / steps };
      if (!buildable(p.x, p.z) || terrain.slope(p.x, p.z) > 0.9) return false;
      if (reservations().some((site) => Math.hypot(p.x - site.x, p.z - site.z) < site.radius + 5)) return false;
    }
    return true;
  };
  // ── 接入路（Parish–Müller 式 localConstraints）：把一个端点「垂直」接到最近的已有路段上，
  // 落点把那条路切成 T 路口；落点离路段端点 <12 时吸附到端点（不留碎段）。拒绝：与被接道路夹角 <60°、
  // 与其它道路交叉、穿过水面/陡坡/预留地。曾经直连「700/400 内最近的主干道节点」：
  // 不看角度、不看沿途道路——真机里那束 X 形长斜线与 8° 锐角路口都出自这里（docs/CITY_ROAD_PLANNING_AUDIT.md）。
  // ── 统一连接器（网络优先批次 4-2）：本函数改走 planner/connect.ts 的 direct-projection 策略，
  // 经 commitNetworkPatch 事务提交；搜索判据逐字保留（投影/吸附/夹角/safeRoadLink/clearAngle/交叉），
  // 规划基线哈希不变是行为等价的证明。
  const connectorWorld: ConnectorWorld = { network, geo, inRiver, reservations };
  let connectSeq = 0;
  const connectToNetwork = (endpoint: Vec2, maxDistance: number, arterial: boolean, exclude: (edge: RoadEdge) => boolean = () => false, minAngle = 60): boolean =>
    runConnection({
      id: `connect:${connectSeq += 1}`,
      source: endpoint,
      target: { kind: "edges", include: (edge) => !exclude(edge) },
      purpose: "district-access",
      allowBridge: false,
      maxLength: maxDistance,
      roadClass: arterial ? "arterial" : "local",
      minAngleDeg: minAngle,
    }, connectorWorld, { strategies: ["direct-projection"] }).ok;
  for (const p of trimmedTrunkEnds) connectToNetwork(p, 40, true, (edge) => !coastalRoadEdgeIds.has(edge.id), 35);
  for (const segment of coastalRoadRuns) {
    if (segment.length < 2) continue;
    for (const endpoint of [segment[0], segment[segment.length - 1]]) {
      connectToNetwork(endpoint, 160, true, (edge) => coastalRoadEdgeIds.has(edge.id));
    }
  }

  let primaryIndexCache: SegmentIndex | null = null;
  const primaryRoadIndex = () => (primaryIndexCache ??= new SegmentIndex([...edges.values()].filter((edge) => edge.width >= 12 && !edge.bridge).map((edge) => edge.points)));
  const zoneFor = (center: Vec2): Zone => {
    // 分区由地理与骨架决定：核心附近 downtown、临海 waterfront、主干道两侧 commercial、其余 residential。
    // 实测 380 栋会话楼 97% 落在 residential、0 栋商业：downtown 半径 0.24R 几乎被市政广场与用地占满，
    // commercial 只认放射主干道。改为 0.3R，且临任意宽路（环岛滨海路、河岸路、海滨大道）也算商业街。
    if (Math.hypot(center.x - core.x, center.z - core.z) < 0.3 * R) return "downtown";
    if (coastDistance(center.x, center.z) < 90) return "waterfront";
    if (trunkIndex.closerThan(center, 80) || primaryRoadIndex().closerThan(center, 60)) return "commercial"; // 主干道 80 / 宽路 60：曾 60/45，商业仅 ~9%
    return "residential";
  };

  // 扇区街网：相邻两条主干道之间，网格 u 轴沿扇区起始那条主干道（街区沿主干道排开、横街以 T 路口接入主干道），
  // v 轴垂直指向扇区内部。曾沿扇区平分线：街网与两侧主干道都斜交、隔 10 单位空地带浮着（审计 R3 前的第一步）。
  const blocks: CityBlock[] = [];
  const roadGenerationDiagnostics = { crowdedBlockCandidates: 0, examples: [] as string[] };
  const parcelBuilders = new Map<string, (block: CityBlock) => Parcel[]>();
  const angleBetween = (a: number, lo: number, hi: number) => {
    const span = ((hi - lo) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) || Math.PI * 2;
    const off = ((a - lo) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
    return off > 0 && off < span;
  };
  const primarySegments = [...edges.values()].filter((edge) => edge.width >= 12 && !edge.bridge).map((edge) => edge.points);
  const parallelPrimaryGap = (a: Vec2, b: Vec2) => {
    const mid = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 };
    const angle = Math.atan2(b.z - a.z, b.x - a.x);
    let gap = Infinity;
    for (const [c, d] of primarySegments) {
      let delta = Math.abs(angle - Math.atan2(d.z - c.z, d.x - c.x)) % Math.PI;
      delta = Math.min(delta, Math.PI - delta);
      if (delta < (15 * Math.PI) / 180) gap = Math.min(gap, segmentDistance(mid, c, d));
    }
    return gap;
  };
  const frontNodes: Vec2[] = []; // 首排街区贴主干道的角点：街网生成后以 T 路口接入主干道
  const sectors = trunks.length ? trunks.map((trunk, i) => ({ lo: trunk.angle, hi: trunks[(i + 1) % trunks.length].angle })) : [{ lo: 0, hi: Math.PI * 2 }];
  sectors.forEach((sector, sectorIndex) => {
    const span = ((sector.hi - sector.lo) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) || Math.PI * 2;
    // 宽扇区（>135°，常因指向山脊的主干道被省略）贴一侧主干道铺不满：退回平分线朝向、两侧都铺。
    const aligned = span <= Math.PI * 0.75;
    const theta = aligned ? sector.lo : sector.lo + span / 2;
    const u = { x: Math.cos(theta), z: Math.sin(theta) };
    const TRUNK_GAP = 8; // 首排街区离主干道中线 8（路幅半宽 6 + 路缘）
    const v = { x: -u.z, z: u.x };
    const du = 44 + random(`du${sectorIndex}`) * 10;
    const dv = 40 + random(`dv${sectorIndex}`) * 12;
    // A shared, seed-keyed displacement at every grid junction breaks the
    // perfect Manhattan checkerboard without opening cracks between blocks.
    // Keep it below 12% of the narrowest block span so junctions become organic
    // at aerial scale without folding adjacent block quads.
    const nodeOffsets = new Map<string, Vec2>();
    const at = (i: number, j: number): Vec2 => {
      const id = `${i}:${j}`;
      let offset = nodeOffsets.get(id);
      if (!offset) {
        const amplitude = aligned && j === 0 ? 0 : 5.2; // 贴主干道的首排不抖动，免得角点压进路面
        offset = {
          x: (random(`grid:${sectorIndex}:${id}:x`) - 0.5) * amplitude * 2,
          z: (random(`grid:${sectorIndex}:${id}:z`) - 0.5) * amplitude * 2,
        };
        nodeOffsets.set(id, offset);
      }
      const gap = aligned ? TRUNK_GAP : 0;
      return { x: core.x + u.x * i * du + v.x * (j * dv + gap) + offset.x, z: core.z + u.z * i * du + v.z * (j * dv + gap) + offset.z };
    };
    const reachCells = Math.ceil((R * 1.6) / Math.min(du, dv));
    for (let i = 1; i < reachCells; i += 1) for (let j = aligned ? 0 : -reachCells; j < reachCells; j += 1) {
      let polygon = [at(i, j), at(i + 1, j), at(i + 1, j + 1), at(i, j + 1)];
      let center = at(i + 0.5, j + 0.5);
      const centerAngle = Math.atan2(center.z - core.z, center.x - core.x);
      if (!angleBetween(centerAngle, sector.lo, sector.hi)) continue;
      // 四角都在本扇区内（不和相邻扇区的街网重叠）、可建、离主干道与环线高架留出路幅。
      // S4「街区形状由大地块决定」：跨出扇区的格子不再整格丢弃（曾留下锯齿边、主干道两侧空一圈），
      // 而是沿扇区两条边界射线（内收 10）裁切——斜向主干道旁的街区成为三角形/梯形，一直排到路边。
      let clipped = false;
      let onClipLine: (p: Vec2) => boolean = () => false; // 裁切线上的边是临主干道的界面，不修成街道
      if (polygon.some((p) => !angleBetween(Math.atan2(p.z - core.z, p.x - core.x), sector.lo, sector.hi))) {
        const lo = { x: Math.cos(sector.lo), z: Math.sin(sector.lo) }; const hi = { x: Math.cos(sector.hi), z: Math.sin(sector.hi) };
        const insideLo = (p: Vec2) => lo.x * (p.z - core.z) - lo.z * (p.x - core.x) - 10;   // 逆时针侧为正
        const insideHi = (p: Vec2) => -(hi.x * (p.z - core.z) - hi.z * (p.x - core.x)) - 10; // 顺时针侧为正
        const clip = (poly: Vec2[], f: (p: Vec2) => number) => {
          const out: Vec2[] = [];
          for (let k = 0; k < poly.length; k += 1) {
            const a = poly[k]; const b = poly[(k + 1) % poly.length];
            const fa = f(a); const fb = f(b);
            if (fa >= 0) out.push(a);
            if ((fa >= 0) !== (fb >= 0)) { const t = fa / (fa - fb); out.push({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t }); }
          }
          return out;
        };
        polygon = clip(clip(polygon, insideLo), insideHi);
        onClipLine = (p: Vec2) => Math.abs(insideLo(p)) < 0.01 || Math.abs(insideHi(p)) < 0.01;
        if (polygon.length < 3) continue;
        let area = 0; for (let k = 0; k < polygon.length; k += 1) { const a = polygon[k]; const b = polygon[(k + 1) % polygon.length]; area += a.x * b.z - b.x * a.z; }
        if (Math.abs(area) / 2 < 350) continue;
        // 尖角 <50° 的裁切块不要：它的街道会在尖角处相交成锐角路口（初版 30 岛锐角 2 → 45）。保留梯形与钝形块。
        let minAngle = Math.PI;
        for (let k = 0; k < polygon.length; k += 1) {
          const prev = polygon[(k + polygon.length - 1) % polygon.length]; const cur = polygon[k]; const next = polygon[(k + 1) % polygon.length];
          const ux = prev.x - cur.x; const uz = prev.z - cur.z; const vx = next.x - cur.x; const vz = next.z - cur.z;
          const lu = Math.hypot(ux, uz); const lv = Math.hypot(vx, vz);
          if (lu < 1e-6 || lv < 1e-6) continue;
          minAngle = Math.min(minAngle, Math.acos(Math.max(-1, Math.min(1, (ux * vx + uz * vz) / (lu * lv)))));
        }
        if (minAngle < (50 * Math.PI) / 180) continue;
        center = { x: polygon.reduce((t, p) => t + p.x, 0) / polygon.length, z: polygon.reduce((t, p) => t + p.z, 0) / polygon.length };
        if (!angleBetween(Math.atan2(center.z - core.z, center.x - core.x), sector.lo, sector.hi)) continue;
        clipped = true;
      }
      if (polygon.some((p) => !buildable(p.x, p.z))) continue;
      // 海滨保留带（水线→带外缘）内不生成街区：沙滩/步道/酒店排用地。
      if (seaside && polygon.some((p) => seasideStripContains(seaside, p, 4))) continue;
      if (polygon.some((p, k) => { const q = polygon[(k + 1) % polygon.length]; return !buildable((p.x + q.x) / 2, (p.z + q.z) / 2); })) continue;
      if ([center, ...polygon].some((p) => trunkIndex.closerThan(p, 7))) continue;
      if ([center, ...polygon].some((p) => ringIndex.closerThan(p, 9))) continue;
      if ([center, ...polygon].some((p) => coastRoadIndex.closerThan(p, 7))) continue;
      // 压到预留地的格子整格不生成（曾只是不放地块、四条边照样成路——支路穿过公园/广场）。
      if (reservations().some((site) => polygonDistance(site, polygon) > -site.radius)) continue;
      const zone = zoneFor(center);
      const id = `plan:${sectorIndex}:${i}:${j}`;
      const wasClipped = clipped;
      const buildParcels = (block: CityBlock): Parcel[] => {
      // Derive addresses only after accepted road/site repairs. Split nodes on a
      // straight boundary do not turn a quadrilateral into a clipped block.
      const polygon = block.polygon.filter((p, k, points) => {
        const a = points[(k + points.length - 1) % points.length], b = points[(k + 1) % points.length];
        return Math.abs((p.x - a.x) * (b.z - p.z) - (p.z - a.z) * (b.x - p.x)) > 0.001;
      });
      if (polygon.length < 3) return [];
      const clipped = wasClipped || polygon.length !== 4;
      const center = { x: polygon.reduce((sum, p) => sum + p.x, 0) / polygon.length, z: polygon.reduce((sum, p) => sum + p.z, 0) / polygon.length };
      const parcels: Parcel[] = [];
      // 裁切出的三角/梯形街区：沿最长边排一排临街地块（内收朝多边形内侧）。
      let front = 0;
      if (clipped) for (let k = 1; k < polygon.length; k += 1) {
        const len = (q: number) => Math.hypot(polygon[(q + 1) % polygon.length].x - polygon[q].x, polygon[(q + 1) % polygon.length].z - polygon[q].z);
        if (len(k) > len(front)) front = k;
      }
      const sideLength = clipped ? Math.hypot(polygon[(front + 1) % polygon.length].x - polygon[front].x, polygon[(front + 1) % polygon.length].z - polygon[front].z)
        : Math.hypot(polygon[1].x - polygon[0].x, polygon[1].z - polygon[0].z);
      const columnCount = Math.max(clipped ? 1 : 3, Math.floor((sideLength - 14) / 7.2));
      for (let side = 0; side < (clipped ? 1 : 2); side += 1) for (let index = 0; index < columnCount; index += 1) {
        const a = clipped ? polygon[front] : polygon[side === 0 ? 0 : 3]; const b = clipped ? polygon[(front + 1) % polygon.length] : polygon[side === 0 ? 1 : 2];
        const length = Math.hypot(b.x - a.x, b.z - a.z); const dx = (b.x - a.x) / length; const dz = (b.z - a.z) / length;
        const t = (index + 0.5) / columnCount;
        let inset = side === 0 ? 12 : -12;
        if (clipped) { const mx = (a.x + b.x) / 2; const mz = (a.z + b.z) / 2; if (-dz * (center.x - mx) + dx * (center.z - mz) < 0) inset = -12; }
        const p = { x: a.x + dx * (7 + (length - 14) * t) - dz * inset, z: a.z + dz * (7 + (length - 14) * t) + dx * inset };
        // Warped corners can leave an interior parcel inside the curved beach
        // reserve even when all four block corners are outside it.
        if (seaside && seasideStripContains(seaside, p, 1)) continue;
        if (polygonDistance(p, polygon) < 3.6 + 5) continue;
        if (reservations().some((site) => Math.hypot(p.x - site.x, p.z - site.z) < site.radius + 9)) continue;
        if (!clearsHighways(p, 7.2, 8, ringIndex)) continue;
        parcels.push({ ...p, id: `${id}/${side}:${index}`, blockId: id, yaw: -Math.atan2(dz, dx), zone, width: Math.min(7.2, (length - 14) / columnCount), depth: 8 });
      }
      return parcels;
      };
      const k = (p: Vec2) => key(p);
      const roadCandidates: Array<{ a: Vec2; b: Vec2; arterial: boolean }> = [];
      // 每 3 条网格线一条主干级街道（宽 8），其余为支路。
      polygon.forEach((p, e) => {
        const q = polygon[(e + 1) % polygon.length];
        // 贴着主干道的那条边不再单修一条平行支路：主干道本身就是这排街区的临街道路。
        if (trunkIndex.closerThan(p, 12) && trunkIndex.closerThan(q, 12)) { frontNodes.push(p, q); return; }
        // 裁切线上的边：不修街道（曾在没有主干道的扇区边界上与相邻扇区街网斜交成锐角路口，30 岛 2 → 39）。
        if (onClipLine(p) && onClipLine(q)) { frontNodes.push(p, q); return; }
        // 与主干道/滨海大道近乎平行（<15°）且很近：≤12 视为同一条路不修，≤25 降为支路——不再并排出现两条大路。
        const parallel = parallelPrimaryGap(p, q);
        if (parallel <= 12) { frontNodes.push(p, q); return; }
        roadCandidates.push({ a: p, b: q, arterial: parallel > 25 && (e % 2 === 0 ? j % 3 === 0 : i % 3 === 0) });
      });
      // 地块不能先发布、随后再接受穿设施/落水的街道；拒绝整个边界候选，无部分加边。
      const crowded = roadCandidateCrowding([...edges.values()], roadCandidates);
      if (crowded) {
        roadGenerationDiagnostics.crowdedBlockCandidates += 1;
        if (roadGenerationDiagnostics.examples.length < 4) roadGenerationDiagnostics.examples.push(`${id}/${crowded.candidateIndex} against ${crowded.hostId}`);
        continue; // Neither roads nor block/parcels have been published; no width downgrade.
      }
      if (roadCandidates.length && !commitFixedLink(connectorWorld, roadCandidates).ok) continue;
      blocks.push({ id, districtId: "", ...center, width: du, depth: dv, zone, parcels: [], polygon: polygon.map(k) });
      parcelBuilders.set(id, buildParcels);
    }
  });

  // 沿海路 / 河岸路的断头互接：一段的端点 80 内有另一段（或同段另一端）的断头，就直连成一条（不过水、不穿用地）。
  // 河岸路在入海口附近停下、环岛路在河口另一侧停下，两端都是断头却互不相接（真机截图）。
  // 批次 4-2：互接的加边改走连接器 node-merge（目标 = 指名节点），校验口径保留历史档
  // （safeRoadLink 同判据 + 两端净空角，不查交叉），经 commitNetworkPatch 事务提交。
  {
    let coastalJoinSeq = 0;
    const deg = () => { const d = new Map<string, number>(); for (const e of edges.values()) for (const n of [e.from, e.to]) d.set(n, (d.get(n) ?? 0) + 1); return d; };
    const ends = coastRoadRuns.flatMap((run, r) => [{ p: run[0], r }, { p: run[run.length - 1], r }]);
    const joined = new Set<string>();
    for (const a of ends) {
      const d = deg(); const ida = roadNodeId(key(a.p));
      if ((d.get(ida) ?? 0) !== 1 || joined.has(ida)) continue;
      const mate = ends
        .filter((b) => b !== a && (d.get(roadNodeId(key(b.p))) ?? 0) === 1 && !joined.has(roadNodeId(key(b.p))))
        .map((b) => ({ b, dist: Math.hypot(b.p.x - a.p.x, b.p.z - a.p.z) }))
        .filter(({ dist, b }) => dist > 1 && dist < 80 && safeRoadLink(a.p, b.p) && endpointClear(network, a.p, b.p) && endpointClear(network, b.p, a.p))
        .sort((x, y) => x.dist - y.dist)[0];
      if (!mate) continue;
      runConnection({
        id: `coastal-join:${coastalJoinSeq += 1}`,
        source: a.p,
        target: { kind: "node", id: roadNodeId(key(mate.b.p)) },
        purpose: "coastal-link",
        allowBridge: false,
        maxLength: 80,
        roadClass: "arterial",
        primary: true,
      }, connectorWorld, { strategies: ["node-merge"], siteMargin: 5, crossings: true });
      joined.add(ida); joined.add(roadNodeId(key(mate.b.p)));
    }
  }
  // 环岛滨海路段端接入路网；离它 ≤16 的街网节点以 T 路口接上（街区一直排到沿海路）。
  for (const runPts of coastRoadRuns) for (const end of [runPts[0], runPts[runPts.length - 1]]) {
    if (Math.hypot(end.x - runPts[0].x, end.z - runPts[0].z) < 0.01 && end !== runPts[0]) continue;
    connectToNetwork(end, 160, false, (edge) => coastRoadRuns.some((r) => r.some((q) => Math.hypot(q.x - edge.points[0].x, q.z - edge.points[0].z) < 0.01) && r.some((q) => Math.hypot(q.x - edge.points[1].x, q.z - edge.points[1].z) < 0.01)));
  }
  for (const node of [...nodes.values()]) {
    if (!coastRoadIndex.closerThan(node, 16) || coastRoadIndex.closerThan(node, 0.5)) continue;
    connectToNetwork(node, 18, false, (edge) => edge.width < 12 || !coastRoadIndex.closerThan(edge.points[0], 0.5));
  }
  // 节点落在别的路段中间时把那条路段切开（S4 裁切块的边沿网格线只走到裁切点，与相邻整格的同线整边重叠成 0° 「锐角」）：
  // 重叠的共线边因此变成共享路段，T 接点成为真正的路口。按 60 分桶避免 O(N·E)。
  {
    for (let pass = 0; pass < 3; pass += 1) {
      const CELL = 60; const buckets = new Map<string, RoadEdge[]>();
      for (const edge of edges.values()) {
        if (edge.bridge) continue;
        const [a, b] = edge.points;
        for (let gx = Math.floor(Math.min(a.x, b.x) / CELL); gx <= Math.floor(Math.max(a.x, b.x) / CELL); gx += 1)
          for (let gz = Math.floor(Math.min(a.z, b.z) / CELL); gz <= Math.floor(Math.max(a.z, b.z) / CELL); gz += 1) {
            const k = `${gx}:${gz}`; (buckets.get(k) ?? buckets.set(k, []).get(k)!).push(edge);
          }
      }
      let split = 0;
      for (const node of [...nodes.values()]) {
        const host = (buckets.get(`${Math.floor(node.x / CELL)}:${Math.floor(node.z / CELL)}`) ?? []).find((edge) =>
          edges.has(edge.id) && edge.from !== node.id && edge.to !== node.id && segmentDistance(node, edge.points[0], edge.points[1]) < 0.05
          && Math.hypot(node.x - edge.points[0].x, node.z - edge.points[0].z) > 0.5 && Math.hypot(node.x - edge.points[1].x, node.z - edge.points[1].z) > 0.5);
        if (!host) continue;
        edges.delete(host.id);
        const primary = host.width >= 12; const art = host.kind === "arterial";
        addEdge(host.points[0], node, art, false, primary); addEdge(node, host.points[1], art, false, primary);
        split += 1;
      }
      if (!split) break;
    }
  }

  // 横街接入主干道：首排街区的角点（及离主干道 ≤16 的街网节点）垂直接到主干道上，形成 T 路口。
  {
    const seen = new Set<string>();
    const candidates = [...frontNodes, ...[...nodes.values()].filter((n) => trunkIndex.closerThan(n, 16))];
    for (const p of candidates) {
      const id = roadNodeId(key(p));
      if (seen.has(id)) continue; seen.add(id);
      if (!nodes.has(id)) continue; // 角点上没有任何街道（整条边都贴主干道）就不必接
      connectToNetwork(p, 18, false, (edge) => edge.kind !== "arterial" || edge.width < 12);
    }
  }
  // 街网生成后再给大道两端各补一条到街区街道的接入路（同一套 localConstraints）。
  for (const segment of coastalRoadRuns) {
    if (segment.length < 2) continue;
    for (const endpoint of [segment[0], segment[segment.length - 1]]) connectToNetwork(endpoint, 160, false, (edge) => coastalRoadEdgeIds.has(edge.id));
  }

  // 入口路（R2）：仍离路较远的用地/地标（岸边对象，或找不到临街位置的）从朝向最近道路的边缘
  // 拉一条支路接入路网——门前要有路（真机：双子塔、摩天轮、港口门前无路）。
  // 批次 5-1 桥接统一：堤道与「过水门前路」都改走连接器的显式桥候选（ground→bridge→ground
  // 三段、桥头干地与跨距校验、候选按距离前 40 个投影点），经事务补丁提交；判据逐字保留。
  // 批 A：堤道/门路的失败都如实进 connectionLog（诊断面，不进基线哈希）。
  const connectionLog: ConnectionAttempt[] = [];
  // Close the generated ground network before accepting a site's entrance.
  // Otherwise a valid shore attachment can be committed to a component whose
  // main-network route has not even been attempted yet.
  const junctionReport = connectGroundJunctions(connectorWorld);
  connectGeneratedComponents();
  for (const site of [...publicSites, ...landmarks]) {
    if (!site.radius) continue;
    // 海上岛地标：先铺堤道桥（岛缘 → 岸点），再从岸点往路网接路。落位期已验证
    // （占地圈全深水、岸点在实地 ≥0.3），此处仅事务化提交（commitFixedLink）。
    const landmarkSite = site as typeof site & { shore?: Vec2 };
    const ref: Vec2 = landmarkSite.shore ?? site;
    if (landmarkSite.shore) {
      const candidateSet = sailOperaCandidateSets.find((set) => set.siteId === (site.id ?? site.kind));
      const candidates = candidateSet?.candidates.slice(0, SAIL_OPERA_CONFIG.jointCandidates) ?? [{ x: site.x, z: site.z, yaw: site.yaw, shore: ref }];
      const original = { x: site.x, z: site.z, zShore: ref.z, shoreX: ref.x, yaw: site.yaw };
      const failed: string[] = [];
      let accepted = false;
      for (const candidate of candidates) {
        site.x = candidate.x; site.z = candidate.z; site.yaw = candidate.yaw; landmarkSite.shore = candidate.shore;
        const l = Math.hypot(site.x - candidate.shore.x, site.z - candidate.shore.z) || 1;
        const edgePt = key({ x: site.x - ((site.x - candidate.shore.x) / l) * site.radius * 0.9, z: site.z - ((site.z - candidate.shore.z) / l) * site.radius * 0.9 });
        const shorePt = key(candidate.shore);
        const staged: Network = { nodes: new Map([...network.nodes].map(([id, node]) => [id, { ...node }])), edges: new Map([...network.edges].map(([id, edge]) => [id, { ...edge, points: edge.points.map((p) => ({ ...p })) }])) };
        const stagedConnector: ConnectorWorld = { ...connectorWorld, network: staged, reservations: () => reservations().filter((reserved) => reserved !== site) };
        const causeway = commitFixedLink(stagedConnector, [{ a: shorePt, b: edgePt, arterial: false, bridge: true, primary: false }]);
        if (!causeway.ok) { failed.push(`causeway:${causeway.detail ?? causeway.reason}`); continue; }
        // 连接器的 owner-revalidation 必须能重新找到设施；路径候选本身仍从 blockers 中排除 owner。
        stagedConnector.reservations = reservations;
        const stagedComponents = componentOf({ roadNodes: [...staged.nodes.values()], roadEdges: [...staged.edges.values()] } as ConstraintPlan);
        const primaryAnchor = primaryAnchorNodeIds.find((id) => staged.nodes.has(id));
        const primaryComponent = primaryAnchor ? stagedComponents.get(primaryAnchor) : undefined;
        if (!primaryComponent || ![...staged.edges.values()].some((edge) => !edge.bridge && stagedComponents.get(edge.from) === primaryComponent)) {
          failed.push("no-primary-ground-network-target"); continue;
        }
        const access = runConnection({ id: `causeway-access:${site.id ?? site.kind}`, source: shorePt,
          target: { kind: "primary", isPrimaryNode: (id) => stagedComponents.get(id) === primaryComponent }, purpose: "site-access", allowBridge: true, maxLength: 1000, roadClass: "local", minAngleDeg: 35 },
        stagedConnector, { strategies: ["direct-projection", "node-merge", "detour", "bridge-candidate"],
          bridge: { self: site, blockers: reservations().filter((reserved) => reserved !== site), siteGate: true } });
        if (!access.ok) { failed.push(`shore:${access.detail ?? access.reason}`); continue; }
        const acceptedComponents = componentOf({ roadNodes: [...staged.nodes.values()], roadEdges: [...staged.edges.values()] } as ConstraintPlan);
        if (acceptedComponents.get(roadNodeId(edgePt)) !== acceptedComponents.get(primaryAnchor!)) {
          failed.push("causeway-not-attached-to-primary"); continue;
        }
        site.access = { role: "plot-gate", capability: "island-causeway", nodeId: roadNodeId(edgePt), ownerX: site.x, ownerZ: site.z, ownerYaw: site.yaw };
        nodes.clear(); for (const [id, node] of staged.nodes) nodes.set(id, node);
        edges.clear(); for (const [id, edge] of staged.edges) edges.set(id, edge);
        (network as Network & { version?: number }).version = (staged as Network & { version?: number }).version;
        bridges.push({ from: shorePt, to: edgePt, angle: Math.atan2(edgePt.z - shorePt.z, edgePt.x - shorePt.x), length: Math.hypot(edgePt.x - shorePt.x, edgePt.z - shorePt.z) });
        for (const span of access.bridgeSpans) bridges.push({ from: span.from, to: span.to, angle: Math.atan2(span.to.z - span.from.z, span.to.x - span.from.x), length: Math.hypot(span.to.x - span.from.x, span.to.z - span.from.z) });
        accepted = true;
        break;
      }
      if (accepted) continue; // 堤道及岸侧主网引道已经作为同一草稿提交。
      site.x = original.x; site.z = original.z; site.yaw = original.yaw;
      landmarkSite.shore = { x: original.shoreX, z: original.zShore };
      const detail = `no joint causeway/shore-access candidate among ${candidates.length}: ${failed.slice(-4).join("; ")}`;
      connectionLog.push({ id: `causeway:${site.id ?? site.kind}`, purpose: "site-access", ok: false, reason: parseFailure(detail), detail });
      continue;
    }
    let nearest: { p: Vec2; d: number; edge: RoadEdge } | null = null;
    for (const edge of edges.values()) {
      if (edge.bridge) continue;
      const closest = closestPolylineSegment(edge.points, ref);
      if (!closest) continue;
      const p = closest.q; const d = closest.d;
      if (!nearest || d < nearest.d) nearest = { p, d, edge };
    }
    if (!nearest || nearest.d <= (landmarkSite.shore ? 6 : site.radius + 14)) continue;
    const ux = (nearest.p.x - ref.x) / nearest.d; const uz = (nearest.p.z - ref.z) / nearest.d;
    // 岸边地标（灯塔在岬角尖上）门口常是不可建的岸滩：沿朝路方向往里走到可建地面再起路。
    let reach = landmarkSite.shore ? 0 : site.radius + 6;
    // 不再向内陆走到可建地：岬角灯塔会走 100+，入口路从远处的路边起步、根本到不了地标（用户：门前要有路）。
    // 门口在不可建岸滩时，由下方的显式桥候选兜底（全程在陆上或 ≤84 连续水段成桥）。
    const gate = key({ x: ref.x + ux * reach, z: ref.z + uz * reach });
    if (!connectToNetwork(gate, 240, false) && !connectToNetwork(gate, 700, false, () => false, 35)) {
      const spec = specByKind(site.kind);
      if (spec?.plotBoundaryAccess) {
        const view = (candidate: Network, access?: PublicSite["access"]) => ({
          roadEdges: [...candidate.edges.values()], roadNodes: [...candidate.nodes.values()],
          publicSites: publicSites.map((owner) => owner === site && access ? { ...owner, access } : owner),
          landmarks, blocks: [], terrain, core, coast, river, seaside,
          coastRoads: coastRoadRuns.slice(0, coastalRunCount), riverRoadRuns: coastRoadRuns.slice(coastalRunCount),
          primaryAnchorNodeId: primaryAnchorNodeIds.find((id) => candidate.nodes.has(id)) ?? null,
          siteObligations, demandCatalogue: declaredSiteDemands } as unknown as ConstraintPlan);
        const identity = (finding: { site?: string; at?: Vec2; detail?: string }) => JSON.stringify([finding.site, finding.at, finding.detail]);
        const baseline = new Map(CONSTRAINTS.map((rule) => [rule.id, new Set(rule.measure(view(network)).map(identity))]));
        const binding = (point: Vec2): NonNullable<PublicSite["access"]> => ({ role: "plot-gate", capability: "shore-plot-boundary",
          nodeId: roadNodeId(point), ownerX: site.x, ownerZ: site.z, ownerYaw: site.yaw,
          entranceId: "shore-plot-boundary", entranceEvidence: "plot-proxy" });
        const proposal = proposeShorePlotAccess(connectorWorld, site, spec,
          primaryAnchorNodeIds.find((id) => nodes.has(id)) ?? null, (candidate, point) => {
            for (const rule of CONSTRAINTS) if (rule.measure(view(candidate, binding(point)))
              .some((finding) => !baseline.get(rule.id)!.has(identity(finding)))) return `shore-plot-new-${rule.id}`;
            return null;
          });
        if (!proposal.ok) connectionLog.push({ id: `gate:${site.id}`, purpose: "site-access", ok: false,
          reason: "no-target", detail: proposal.reason });
        else {
          nodes.clear(); for (const [id, node] of proposal.network.nodes) nodes.set(id, node);
          edges.clear(); for (const [id, edge] of proposal.network.edges) edges.set(id, edge);
          network.patchRemaps = proposal.network.patchRemaps;
          const versioned = network as Network & { version?: number }; versioned.version = (versioned.version ?? 0) + 1;
          site.access = binding(proposal.gate);
          for (const span of proposal.bridgeSpans) bridges.push({ from: span.from, to: span.to,
            angle: Math.atan2(span.to.z - span.from.z, span.to.x - span.from.x), length: Math.hypot(span.to.x - span.from.x, span.to.z - span.from.z) });
        }
        continue; // Replace, rather than duplicate, the original 40-host bridge tier.
      }
      // 兜底（批次 5-1 起统一走 bridge-candidate）：门口 → 近岸 → 桥 → 对岸 → 接入点（无水时纯地面引道）。
      // 地面引道不查 buildable/坡度（门前引道穿过不可建前滩带是历史口径，TerrainPatch 批次前的已知豁免）。
      const blockers = [...publicSites, ...landmarks].filter((o) => o !== site && o.radius);
      const bridged = runConnection({
        id: `gate:${site.id ?? site.kind}`,
        source: gate,
        target: { kind: "edges", include: () => true },
        purpose: "site-access",
        allowBridge: true,
        maxLength: 1e4, // 桥候选的界限是候选数（前 40 个投影点），不是半径（历史口径）
        roadClass: "local",
      }, connectorWorld, { strategies: ["bridge-candidate"], bridge: { self: site, blockers, siteGate: true }, crossings: true });
      for (const span of bridged.ok ? bridged.bridgeSpans : []) {
        bridges.push({ from: span.from, to: span.to, angle: Math.atan2(span.to.z - span.from.z, span.to.x - span.from.x), length: Math.hypot(span.to.x - span.from.x, span.to.z - span.from.z) });
      }
      if (!bridged.ok) connectionLog.push({ id: `gate:${site.id ?? site.kind}`, purpose: "site-access", ok: false, reason: bridged.reason, detail: bridged.detail });
    }
  }

  // ── 连通（网络优先批次 4-3）：各扇区街网可能被河/保留用地切成几块。并查集找连通分量，每个不含
  // 主网的分量经统一连接器接入。主网目标 = intent.primaryComponentId 的分量（离核心最近路端所在，
  // 批次 2 的主网定义），不许「接最近分量」——两个孤岛互连不等于接入主网。
  // 设计明令删除的 tolerance=[1,0.7,0] 不校验直连兜底（2026-10-08 实测：150 岛 141 条兜底边里
  // 63 条穿水、16 条不可建、2 条陡坡、9 条穿既有路）：禁止用降低硬约束换连通；失败进诊断
  // （intent 需求体系记 unmet + 本处 connectionLog 记原因），必要时允许局部分量保持隔离。
  function connectGeneratedComponents() {
    const parent = new Map<string, string>();
    const find = (x: string): string => { let r = x; while (parent.get(r) !== r) r = parent.get(r)!; let c = x; while (parent.get(c) !== r) { const n = parent.get(c)!; parent.set(c, r); c = n; } return r; };
    for (const id of nodes.keys()) parent.set(id, id);
    for (const edge of edges.values()) { const ra = find(edge.from); const rb = find(edge.to); if (ra !== rb) parent.set(ra, rb); }
    // 主网锚点：离核心最近的路端（与 intent.primaryComponentId 同规则；环路围绕核心，正常落在骨架分量上）。
    const primaryNodeId = primaryAnchorNodeId;
    const coreRoot = () => (primaryNodeId && nodes.has(primaryNodeId) ? find(primaryNodeId) : null);
    // 每个孤立分量按 localConstraints 垂直接入主网分量；接上一个就重算分量。
    // 逐级放宽：严格（≤220、≥60°）→ 放远放宽（≤400、≥35°）→ 连接器兜底阶梯（并线/绕行/有界 A*，全程校验）。
    const recompute = () => {
      for (const id of nodes.keys()) if (!parent.has(id)) parent.set(id, id);
      for (const edge of edges.values()) { const ra = find(edge.from); const rb = find(edge.to); if (ra !== rb) parent.set(ra, rb); }
    };
    for (let pass = 0; pass < 3; pass += 1) {
      recompute();
      const groupsNow = new Map<string, RoadNode[]>();
      for (const node of nodes.values()) { const r = find(node.id); const list = groupsNow.get(r); if (list) list.push(node); else groupsNow.set(r, [node]); }
      for (const [root, members] of groupsNow) {
        const target = coreRoot();
        if (!target || root === target) continue;
        const isPrimaryNode = (id: string) => find(id) === target;
        // pass 0/1 沿用历史的 top-12（按离主干距离）；pass 2 与历史兜底同覆盖面：并线遍历全部分量成员
        // （实测 seed 1927/t4：381 节点的分量，唯一合法并线点排在 top-12 之外，只试 12 个会漏掉），
        // 绕行/A* 只对头部成员执行（同分量内不同起点的可达性基本相同，A* 逐成员重跑纯费预算）。
        const ordered = [...members].sort((a, b) => distanceToTrunks(a) - distanceToTrunks(b));
        let linked = false;
        for (const member of pass < 2 ? ordered.slice(0, 12) : ordered) {
          const base = { source: member, target: { kind: "primary", isPrimaryNode } as const, purpose: "district-access", allowBridge: false, roadClass: "local" } as const;
          const result = pass < 2
            ? runConnection({ ...base, id: `isolate:${pass}:${member.id}`, maxLength: pass === 0 ? 220 : 400, minAngleDeg: pass === 0 ? 60 : 35 }, connectorWorld, { strategies: ["direct-projection"] })
            : runConnection({ ...base, id: `isolate:${pass}:${member.id}`, maxLength: 700 }, connectorWorld, { strategies: ["node-merge"] });
          if (pass === 2) connectionLog.push({ id: `isolate:${root}:${member.id}`, purpose: "district-access", ok: result.ok, strategy: result.ok ? result.strategy : undefined, reason: result.ok ? undefined : result.reason, detail: result.ok ? undefined : result.detail });
          if (result.ok) { linked = true; break; }
        }
        if (!linked && pass === 2) {
          for (const member of ordered.slice(0, 6)) {
            const result = runConnection({ source: member, target: { kind: "primary", isPrimaryNode }, id: `isolate:${pass}:${member.id}`, purpose: "district-access", allowBridge: false, maxLength: 700, roadClass: "local" }, connectorWorld, { strategies: ["detour", "grid-astar"] });
            connectionLog.push({ id: `isolate:${root}:${member.id}`, purpose: "district-access", ok: result.ok, strategy: result.ok ? result.strategy : undefined, reason: result.ok ? undefined : result.reason, detail: result.ok ? undefined : result.detail });
            if (result.ok) { linked = true; break; }
          }
        }
        if (!linked && pass === 2) {
          // 最后手段：并线角度从宽（转弯是软成本，设计 §4.1）——只放松端点净空角，走廊（水/坡/用地）
          // 与交叉检查仍是硬约束；质量代价由 acuteJunctions 约束如实度量。被删除的 tolerance 兜底
          // 连水/坡/用地/交叉都不查，本档是其合法化替代（实测 seed 1927/t4：381 节点分量与主网最近
          // 一对仅隔 2.7 单位、走廊干净，唯端点角 <35°，严格档拒之门外会把整个街区留在主网之外）。
          for (const member of ordered) {
            const result = runConnection({ source: member, target: { kind: "primary", isPrimaryNode }, id: `isolate:${pass}:${member.id}`, purpose: "district-access", allowBridge: false, maxLength: 700, roadClass: "local" }, connectorWorld, { strategies: ["node-merge"], anglePolicy: "relaxed" });
            connectionLog.push({ id: `isolate-relaxed:${root}:${member.id}`, purpose: "district-access", ok: result.ok, strategy: result.ok ? result.strategy : undefined, reason: result.ok ? undefined : result.reason, detail: result.ok ? undefined : result.detail });
            if (result.ok) { linked = true; break; }
          }
        }
        if (!linked && pass === 2) {
          // 跨河档（设计 §4.2「跨河允许 ground→bridge→ground」）：连续水段 ≤84 才可成桥——跨距上限
          // 本身就排除了跨海长桥（不从「遇水」自动推断可修桥的落点）。桥头干地/用地避让/落点拆边
          // 全在 bridge-candidate 判据内；桥梁注册表同步登记。实测 seed 123456789/t2：143 节点分量与
          // 主网隔一条 ~40 宽的河口，前几档全部 slope/water-span 拒绝。
          for (const member of ordered) {
            const result = runConnection({ source: member, target: { kind: "primary", isPrimaryNode }, id: `isolate:${pass}:${member.id}`, purpose: "district-access", allowBridge: true, maxLength: 700, roadClass: "local" }, connectorWorld, { strategies: ["bridge-candidate"], bridge: { blockers: reservations(), siteGate: true }, crossings: true });
            connectionLog.push({ id: `isolate-bridge:${root}:${member.id}`, purpose: "district-access", ok: result.ok, strategy: result.ok ? result.strategy : undefined, reason: result.ok ? undefined : result.reason, detail: result.ok ? undefined : result.detail });
            if (result.ok) {
              for (const span of result.bridgeSpans) bridges.push({ from: span.from, to: span.to, angle: Math.atan2(span.to.z - span.from.z, span.to.x - span.from.x), length: Math.hypot(span.to.x - span.from.x, span.to.z - span.from.z) });
              linked = true; break;
            }
          }
        }
        recompute();
      }
    }
  }

  // ── 尽端环路（lollipop service loop，G 批 2026-10-08）：连接器孤立分量阶梯之后的专用遍
  // （planner/loop.ts）。「包含/紧邻用地服务环的孤立分量」（体育场类：环形服务路不接主网、
  // 通向用地的路断头，用户截图 ②）以单入口接入——一根入口路从主网最近边（split 成 T 口）连到
  // 环上，环保持闭环。判据/入口角/确定性排序见 LOOP_CONFIG；入口路走 direct-projection 的地面
  // 走廊校验（水/坡/用地/交叉），事务提交；失败进 connectionLog（id 前缀 loop:），不静默。
  // 非服务环形态的残余分量（混合等级街区残片、<6 边碎枝）不属于本遍：如实保持隔离并计入
  // disconnectedComponents 诊断。
  connectServiceLoops({ world: connectorWorld, core, primaryAnchorNodeId, log: connectionLog });

  const parkTrees: CityLayout["parkTrees"] = [];
  const spanX = bbox.maxX - bbox.minX + 120; const spanZ = bbox.maxZ - bbox.minZ + 120;
  // 路段按 60 单位网格分桶：逐棵树对全部路段算距离是百万级运算（单岛 0.2–1 s 的主要来源）。
  const CELL = 60;
  const edgeBuckets = new Map<string, RoadEdge[]>();
  for (const edge of edges.values()) {
    const [a, b] = edge.points;
    for (let gx = Math.floor(Math.min(a.x, b.x) / CELL) - 1; gx <= Math.floor(Math.max(a.x, b.x) / CELL) + 1; gx += 1)
      for (let gz = Math.floor(Math.min(a.z, b.z) / CELL) - 1; gz <= Math.floor(Math.max(a.z, b.z) / CELL) + 1; gz += 1) {
        const key = `${gx}:${gz}`;
        const list = edgeBuckets.get(key);
        if (list) list.push(edge); else edgeBuckets.set(key, [edge]);
      }
  }
  // 山体植被（tinyskies 的教训：山不能光秃秃）——高度 3.2 以上、坡度可站立
  // （slope < 1.5）的山坡是主要林区；公园/河岸/近海沙滩维持原有条件。
  const slope = (x: number, z: number) => Math.hypot(height(x + 1, z) - height(x - 1, z), height(x, z + 1) - height(x, z - 1)) / 2;
  for (let i = 0; i < 2600; i += 1) {
    const x = bbox.minX - 60 + random(`tx${i}`) * spanX; const z = bbox.minZ - 60 + random(`tz${i}`) * spanZ;
    const h = height(x, z);
    const park = publicSites.some((s) => s.kind === "park" && Math.hypot(x - s.x, z - s.z) < s.radius - 5);
    const bank = Math.abs(x - riverX(z)) - riverWidth(z);
    const mountainside = h > 3.2 && h < 60 && slope(x, z) < 1.5;
    const wild = hillProj(x, z) > hillLine - 20 || coastDistance(x, z) < 30 || mountainside;
    if (h < 2.5 || (!park && !wild && !(hasRiver && bank < 23))) continue;
    if ((edgeBuckets.get(`${Math.floor(x / CELL)}:${Math.floor(z / CELL)}`) ?? []).some((e) => segmentDistance({ x, z }, e.points[0], e.points[1]) < e.width / 2 + 3)) continue;
    parkTrees.push({ x, z, y: height(x, z), seed: random(`tree${i}`) });
  }
  // ── 碎边合并：长度 <5 的非桥路段把两端并成一个节点。接入路吸附到离已有路口几单位处时会留下 0–4 长的碎边，
  // 与广场环路等形成 <30° 的「锐角路口」（30 岛中 10 个锐角全部是这种形状）。
  const sliverSkip = new Set<string>();
  const declaredEntranceNodes = new Set(publicSites.flatMap((site) => site.access ? [site.access.nodeId] : []));
  for (let pass = 0; pass < 50; pass += 1) {
    // 宽 12 的骨架（海滨大道按 ~15 细分、段间可能 <5）不合并：并掉会打断大道的车流回路（seaside 守卫）。
    const sliver = [...edges.values()].find((e) => !sliverSkip.has(e.id) && !declaredEntranceNodes.has(e.from) && !declaredEntranceNodes.has(e.to) && !e.bridge && e.width < 12 && Math.hypot(e.points[1].x - e.points[0].x, e.points[1].z - e.points[0].z) < 5);
    if (!sliver) break;
    // 保留挂着骨架（宽 12）的那一端：并掉海滨大道端点会让大道车流回路引用不存在的节点（seaside 守卫 10 档）。
    const touchesPrimary = (id: string) => [...edges.values()].some((e) => e !== sliver && e.width >= 12 && (e.from === id || e.to === id));
    const fromPrimary = touchesPrimary(sliver.from); const toPrimary = touchesPrimary(sliver.to);
    const fromPinned = primaryAnchorNodeIds.includes(sliver.from); const toPinned = primaryAnchorNodeIds.includes(sliver.to);
    const touchesBridge = (id: string) => [...edges.values()].some((e) => e.bridge && (e.from === id || e.to === id));
    const fromBridge = touchesBridge(sliver.from); const toBridge = touchesBridge(sliver.to);
    if ((fromPrimary && toPrimary) || ((fromPinned || fromBridge) && (toPinned || toBridge))) { sliverSkip.add(sliver.id); continue; }
    edges.delete(sliver.id);
    // Rebinding a deck endpoint shifts the bridge geometry while its bridge registry remains fixed.
    // Keep the primary anchor first, then a bridge endpoint; otherwise use the established trunk rule.
    const keepId = fromPinned ? sliver.from : toPinned ? sliver.to
      : fromBridge ? sliver.from : toBridge ? sliver.to
        : toPrimary ? sliver.to : sliver.from;
    const keepNode = nodes.get(keepId)!; const dropId = keepId === sliver.from ? sliver.to : sliver.from;
    for (const e of [...edges.values()]) {
      if (e.from !== dropId && e.to !== dropId) continue;
      edges.delete(e.id);
      const other = e.from === dropId ? e.points[1] : e.points[0];
      addEdge(keepNode, other, e.kind === "arterial", e.bridge ?? false, e.width >= 12);
    }
    nodes.delete(dropId);
  }

  const carPaths: Vec2[][] = [];
  const buildTrafficPaths = (blocks: CityBlock[], carPaths: Vec2[][]) => {
  carPaths.push(...blocks.filter((b, i) => b.parcels.length > 0 && i % 7 === 0).map((b) => {
    const boundary = b.roadBoundary ?? b.polygon;
    return [...boundary, boundary[0]];
  }));
  // 海滨大道车流沿海岸单向行驶，再通过真实路网回到起点；找不到完整地面回路时
  // 不生成假路线。返程搜索排除大道自身边，避免车辆在两端掉头后原路折返。
  const roadReturnPath = (from: Vec2, to: Vec2): Vec2[] | null => {
    const start = roadNodeId(key(from)); const goal = roadNodeId(key(to));
    const adjacency = new Map<string, string[]>();
    for (const id of nodes.keys()) adjacency.set(id, []);
    for (const edge of edges.values()) {
      if (coastalRoadEdgeIds.has(edge.id)) continue;
      adjacency.get(edge.from)?.push(edge.to); adjacency.get(edge.to)?.push(edge.from);
    }
    const previous = new Map<string, string | null>([[start, null]]); const queue = [start];
    for (let i = 0; i < queue.length && !previous.has(goal); i += 1) {
      for (const next of adjacency.get(queue[i]) ?? []) if (!previous.has(next)) { previous.set(next, queue[i]); queue.push(next); }
    }
    if (!previous.has(goal)) return null;
    const path: string[] = [];
    for (let cursor: string | null = goal; cursor; cursor = previous.get(cursor) ?? null) path.push(cursor);
    return path.reverse().map((id) => nodes.get(id)!).filter(Boolean).map(({ x, z }) => ({ x, z }));
  };
  for (const segment of coastalRoadRuns) {
    if (segment.length < 2) continue;
    const homeward = roadReturnPath(segment[segment.length - 1], segment[0]);
    if (homeward && homeward.length > 1) carPaths.push([...segment, ...homeward.slice(1)]);
    else {
      // Some valid beach segments have only one safe district-road access because
      // the opposite end is screened by river mouths/reservations. Keep deterministic
      // shuttle traffic on the rendered boulevard rather than wrapping/teleporting.
      carPaths.push([...segment, ...segment.slice(0, -1).reverse()]);
    }
  }
  };

  // 城区锚点：第一名执行环境在核心，其余绕核心等角分布再贴陆地，彼此至少隔 ~200。
  const anchorsPlaced: Array<Vec2 & { radius: number }> = [];
  const nominalAnchors = [core, around(turn + 1.6, 0.42 * R), around(turn + 3.7, 0.42 * R), around(turn + 5.3, 0.42 * R)];
  for (const nominal of nominalAnchors) {
    const q = snap(nominal, 40, [...anchorsPlaced, ...publicSites.map((site) => ({ x: site.x, z: site.z, radius: site.radius * 0.4 }))], 90);
    anchorsPlaced.push({ ...q, radius: 90 });
  }
  const districtAnchors = anchorsPlaced.map(({ x, z }) => ({ x, z }));

  // 高架：环线（沿陆地断续），取代原来按常量画在城北的一条直线。
  const highwayRuns: Vec2[][] = ringRuns;

  // 下游读的边界：全部由岛的实际包围盒推导（曾是常量 ±570 / -350..430 / 650 / 1600）。
  const urbanBounds = { left: bbox.minX + 30, right: bbox.maxX - 30, north: bbox.minZ + 30, south: bbox.maxZ - 30 };
  const boundsRadius = Math.max(bbox.maxX - bbox.minX, bbox.maxZ - bbox.minZ) / 2 + 40;
  const extent = Math.ceil((Math.max(Math.abs(bbox.minX), Math.abs(bbox.maxX), Math.abs(bbox.minZ), Math.abs(bbox.maxZ)) + 260) * 2 / 100) * 100;
  // ── 断头路收尾（30 岛实测 ~390 个断头，多为环岛/河岸路段端与被切断的碎段）：
  // 每个非入口、非岸边自然终点的断头：沿其悬挂链走到最近的路口，先尝试按 localConstraints 接回路网，
  // 接不上且整条悬挂链很短（主干 <40、其余 <30）就删掉——不留通往空地的小尾巴。
  {
    const sitesForGate = [...publicSites, ...landmarks].filter((site) => site.radius);
    const degree = () => { const d = new Map<string, number>(); for (const e of edges.values()) for (const n of [e.from, e.to]) d.set(n, (d.get(n) ?? 0) + 1); return d; };
    for (let pass = 0; pass < 3; pass += 1) {
      const deg = degree();
      const ends = [...nodes.values()].filter((n) => deg.get(n.id) === 1);
      for (const end of ends) {
        if (!nodes.has(end.id) || degree().get(end.id) !== 1) continue;
        if (sitesForGate.some((site) => Math.hypot(site.x - end.x, site.z - end.z) < site.radius + 60)) continue; // 用地入口（门前接入点可能内移到岸滩以外，60 内都算）
        if (coastDistance(end.x, end.z) < 30 || inRiver(end.x, end.z)) continue;                              // 通到海边/河边的自然终点
        // 悬挂链：从断头一路走到度 ≠ 2 的节点。
        const chain: RoadEdge[] = []; let cursor = end.id; let length = 0; const d2 = degree();
        for (let guard = 0; guard < 64; guard += 1) {
          const next = [...edges.values()].find((e) => (e.from === cursor || e.to === cursor) && !chain.includes(e));
          if (!next) break;
          chain.push(next); length += Math.hypot(next.points[1].x - next.points[0].x, next.points[1].z - next.points[0].z);
          cursor = next.from === cursor ? next.to : next.from;
          if (d2.get(cursor) !== 2) break;
        }
        const wide = chain.some((e) => e.width >= 12);
        if (connectToNetwork(end, wide ? 120 : 60, false, (edge) => chain.includes(edge), 45)) continue;
        if (chain.some((e) => e.bridge || [...edges.values()].some((b) => b.bridge && [b.from, b.to].some((id) => id === e.from || id === e.to))) || length >= (wide ? 40 : 30)) continue;
        for (const e of chain) edges.delete(e.id);
        nodes.delete(end.id);
      }
    }
    for (const id of [...nodes.keys()]) if (![...edges.values()].some((e) => e.from === id || e.to === id)) nodes.delete(id);
  }

  // A failed skeleton placement remains a commitment. Road growth can expose
  // new legal frontage, so revisit only missing owners before any parcels are
  // accepted. This bounded phase never relocates an already-bound owner.
  for (const obligation of siteObligations.filter((entry) => !entry.placed)) {
    const programme = jointSiteProgramme.find(([id]) => id === obligation.ownerId);
    if (!programme || publicSites.some((site) => site.id === obligation.ownerId)) continue;
    const ownerRules = CONSTRAINTS.filter((rule) => ["siteInWater", "siteWithoutDoorRoad", "roadThroughSite",
      "sitesOverlap", "stationStadiumSetback", "stationDoorFacesRoad", "archStraddlesRoad", "unjoinedGroundJunctions",
      "crowdedArterials", "bridgeheadContinuity"].includes(rule.id));
    const view = (candidate: Network, sites: PublicSite[]) => ({ roadEdges: [...candidate.edges.values()],
      roadNodes: [...candidate.nodes.values()], publicSites: sites, landmarks, blocks: [], terrain, core, coast, river,
      seaside, coastRoads: coastRoadRuns.slice(0, coastalRunCount), riverRoadRuns: coastRoadRuns.slice(coastalRunCount),
      primaryAnchorNodeId: primaryAnchorNodeIds.find((id) => candidate.nodes.has(id)) ?? null } as unknown as ConstraintPlan);
    const identity = (finding: { site?: string; at?: Vec2; detail?: string }) => JSON.stringify([finding.site, finding.at, finding.detail]);
    const baseline = new Map(ownerRules.map((rule) => [rule.id, new Set(rule.measure(view(network, publicSites)).map(identity))]));
    const assigned = assignConnectedSite({ ...geo, core, turn,
      trunkRuns: [...edges.values()].filter((edge) => !edge.bridge && edge.width >= 8).map((edge) => edge.points),
      ringRuns, bridges, placed: reservations(), height, inRiver, riverBank: footprintGeo.riverBank },
      connectorWorld, specByKind(programme[1])!, obligation.ownerId,
      primaryAnchorNodeIds.find((id) => nodes.has(id)) ?? null, (owner, candidate) => {
        for (const rule of ownerRules) if (rule.measure(view(candidate, [...publicSites, owner]))
          .some((finding) => !baseline.get(rule.id)!.has(identity(finding)))) return `post-growth-new-${rule.id}`;
        return null;
      });
    obligation.routeRetries = (obligation.routeRetries ?? 0) + (assigned.routeRetries ?? 0);
    if (!assigned.site || !assigned.network) {
      obligation.reason = `${obligation.reason ?? "initial placement failed"}; post-growth: ${assigned.reason ?? "no connected candidate"}`;
      continue;
    }
    nodes.clear(); for (const [id, node] of assigned.network.nodes) nodes.set(id, node);
    edges.clear(); for (const [id, edge] of assigned.network.edges) edges.set(id, edge);
    const versioned = network as Network & { version?: number }; versioned.version = (versioned.version ?? 0) + 1;
    publicSites.push(assigned.site);
    obligation.placed = true; delete obligation.reason;
    // Trees are presentation drafts, not accepted parcels or service owners.
    for (let index = parkTrees.length - 1; index >= 0; index -= 1) {
      const tree = parkTrees[index];
      if (Math.hypot(tree.x - assigned.site.x, tree.z - assigned.site.z) < assigned.site.radius + 9
        || [...edges.values()].some((edge) => polylineDistance([edge.points], tree) < edge.width / 2 + 3)) parkTrees.splice(index, 1);
    }
  }

  // ── 桥头落地环（E 轨 2026-10-08，planner/landing.ts）：桥全部生成、断头收尾之后、solve 之前的一遍。
  // 桥的地面端方向失配（桥轴向与接地路向夹角 >25°）或接地路缺失/可被 solve 的 pruneShortSpurs
  // 删除时，桥头插入半径 10–14 的落地环——桥面端点落在环上、接地路接入环，环形吸收方向差，
  // 桥头的地面度数 ≥2 使「桥 +1 地面边」不再被当断头链删除。桥边与 bridges 注册表不动
  // （悬索桥装饰选址 withBridgeLandmark、nearBridgeEnd 桥头避让全部保持兼容）。树先于此遍放置，
  // 落到新增地面边上的按报告清除（与放置时的 width/2+3 同口径）。
  {
    const landingReport = buildLandingCircles({ network, geo, inRiver, sites: reservations, carPaths });
    if (landingReport.addedEdges.length) {
      for (let t = parkTrees.length - 1; t >= 0; t -= 1) {
        const tree = parkTrees[t];
        if (landingReport.addedEdges.some((e) => segmentDistance(tree, e.a, e.b) < e.width / 2 + 3)) parkTrees.splice(t, 1);
      }
    }
  }

  // ── F1 闭环（CITY_ROAD_F1_ALGORITHM_SPEC）：路网不是一次生成就完事——所有改路步骤（接入路、断头路收尾、
  // 碎边合并）之后，对违规的用地/断头修复。修复遍已搬到 planner/repairs.ts，由 planner/solve.ts 的策略表按原顺序执行
  // （临街 → 推开穿路用地 → 绕行被截断的路 → 延伸断头；顺序见 solve.ts 头注释）。
  const repairCtx: RepairContext = { network, connectionLog, siteObligations, demandCatalogue: declaredSiteDemands, primaryAnchorNodeId: primaryAnchorNodeIds.find((id) => nodes.has(id)) ?? null, geo, height, inRiver, trunkRuns, bridges, publicSites, landmarks, blocks, ringRuns, coast, core, SHORE_SITE_KINDS, carPaths, seaside, coastRoadRunEnds: coastRoadRuns.flatMap((r) => [r[0], r[r.length - 1]]), coastRoadRuns, coastalRunCount, riverRoadRuns: coastRoadRuns.slice(coastalRunCount) };
  const solveReport = skipSolve ? null : solvePlan(repairCtx);
  if (skipSolve) initializeRepairPlanningWorld(repairCtx);
  let generatedParcels = 0;
  let roadBlockReport: RoadBlockReport | null = null;
  const derivedFinalization = runRepairDerivedFinalization(repairCtx, (draft) => {
  const blocks = draft.blocks, carPaths = draft.carPaths;
  if (legacyGridParcels) finalizeParcels(blocks);
  else {
    const roads = [...draft.network.edges.values()], faces = extractRoadFaces(roads);
    // This is a finite geometric slot bound, not an increased route/snap budget:
    // at most two frontage rows per real face, each slot retaining width 7.2.
    const maxCandidates = faces.faces.reduce((total, face) => total + 2 * face.boundary.reduce((count, point, index) => {
      const next = face.boundary[(index + 1) % face.boundary.length];
      return count + Math.floor(Math.hypot(next.x - point.x, next.z - point.z) / 7.2);
    }, 0), 0);
    const generated = generateRoadBlocks({ faces, roads,
      primaryAnchorNodeId: draft.primaryAnchorNodeId ?? null,
      networkVersion: (draft.network as Network & { version?: number }).version ?? 0,
      districtFor: () => "", zoneFor, buildable, sites: [...draft.publicSites, ...draft.landmarks], highways: draft.ringRuns,
      reserved: (point) => !!seaside && seasideStripContains(seaside, point, 1), maxCandidates,
      presentationSupportsHoles: true });
    roadBlockReport = generated.report;
    if (generated.report.status === "budget-exhausted" || generated.report.status === "cancelled") throw new Error(generated.report.status);
    const frontage = new Map(generated.access.map((proof) => [proof.parcelId, proof]));
    const sourceFaces = new Map(faces.faces.map((face) => [face.id, face]));
    for (const block of generated.blocks) {
      block.roadBoundary = sourceFaces.get(block.sourceFaceId)!.boundary.map((point) => ({ ...point }));
      for (const parcel of block.parcels) parcel.frontage = frontage.get(parcel.id);
    }
    blocks.splice(0, blocks.length, ...generated.blocks);
    generatedParcels = generated.report.accepted;
  }
  buildTrafficPaths(blocks, carPaths);
  // 车流折线的收口放在求解之后：修复（删冗余路段、切 T 路口、近距接入）会增删路段，车流必须按最终路网校验——
  // 曾放在求解之前，删路后海滨车流折线引用了已不存在的路段（verify-react-city-seaside 抓到）。
  // 接入路把已有路段切成 T 路口后，车流折线还按旧端点走：把落在线段上的路口节点按顺序插回去。
  {
    const allNodes = [...nodes.values()];
    for (let r = 0; r < carPaths.length; r += 1) {
      const route = carPaths[r]; const out: Vec2[] = [route[0]];
      for (let i = 1; i < route.length; i += 1) {
        const a = route[i - 1]; const b = route[i];
        const dx = b.x - a.x; const dz = b.z - a.z; const l2 = dx * dx + dz * dz || 1;
        const between = allNodes
          .map((n) => ({ n, t: ((n.x - a.x) * dx + (n.z - a.z) * dz) / l2 }))
          .filter(({ n, t }) => t > 1e-4 && t < 1 - 1e-4 && segmentDistance(n, a, b) < 0.02)
          .sort((x, y) => x.t - y.t);
        for (const { n } of between) out.push({ x: n.x, z: n.z });
        out.push(b);
      }
      carPaths[r] = out;
    }
    // 贴主干道那条边不再单独成路：绕街区一圈的车流若经过不存在的路段就整条丢弃（不让车开在没有路的地方）。
    const pairs = new Set([...edges.values()].map((edge) => [edge.from, edge.to].sort().join("/")));
    // 落地环批（2026-10-08）：桥头落地环会把既有路段重锚到环缘（桥头→环缘→对端，新折点不在原线段上），
    // 车流折线里失效的相邻对不再整条丢弃，而是改走当前路网的最短路（例如经落地环绕行）；
    // 折点本身被合并残点清除的（近失误重锚的 0.x–2 并点）先吸附 ≤2 内最近现存节点。仍无路可代才丢弃。
    const adjacency = new Map<string, string[]>();
    for (const id of nodes.keys()) adjacency.set(id, []);
    for (const edge of edges.values()) { adjacency.get(edge.from)?.push(edge.to); adjacency.get(edge.to)?.push(edge.from); }
    const bfsMiddle = (from: string, to: string): string[] | null => {
      if (from === to) return [];
      const previous = new Map<string, string | null>([[from, null]]); const queue = [from];
      for (let i = 0; i < queue.length && !previous.has(to); i += 1) {
        for (const next of adjacency.get(queue[i]) ?? []) if (!previous.has(next)) { previous.set(next, queue[i]); queue.push(next); }
      }
      if (!previous.has(to)) return null;
      const chain: string[] = [];
      for (let cursor: string | null = to; cursor && cursor !== from; cursor = previous.get(cursor) ?? null) chain.push(cursor);
      chain.shift(); // 去掉 to 本身（调用方随后压入 cur）
      return chain.reverse();
    };
    for (let r = carPaths.length - 1; r >= 0; r -= 1) {
      // 碎边合并/断头清理后，折线里可能留下相距 <1 的两个点（原来的碎边已并成一个节点）：把中间点并掉再核对，
      // 不因为一个 0.4 长的碎边就丢掉整条 220 点的车流回路（海滨大道回路因此消失，滨海车流守卫抓到）。
      const raw = carPaths[r];
      const route = raw.filter((q, i) => i === 0 || i === raw.length - 1 || Math.hypot(q.x - raw[i + 1].x, q.z - raw[i + 1].z) >= 1);
      // 折点被落地环并点/吞并清除的：≤2 内吸附最近现存节点（近失误重锚的 0.x–2 并点）；
      // 更远的（环内被吞节点）直接剔除折点——相邻存活点由下方的最短路经环绕行接回。
      const resnap: Vec2[] = [];
      for (const q of route) {
        if (nodes.has(roadNodeId(key(q)))) { resnap.push(q); continue; }
        let best: RoadNode | null = null;
        for (const n of nodes.values()) if (!best || Math.hypot(n.x - q.x, n.z - q.z) < Math.hypot(best.x - q.x, best.z - q.z)) best = n;
        if (best && Math.hypot(best.x - q.x, best.z - q.z) <= 2) resnap.push({ x: best.x, z: best.z });
      }
      const out: Vec2[] = [];
      let ok = true;
      for (let i = 0; i < resnap.length && ok; i += 1) {
        const cur = resnap[i];
        if (i > 0) {
          const prev = out[out.length - 1];
          if (roadNodeId(key(prev)) !== roadNodeId(key(cur)) && !pairs.has([roadNodeId(key(prev)), roadNodeId(key(cur))].sort().join("/"))) {
            const middle = bfsMiddle(roadNodeId(key(prev)), roadNodeId(key(cur)));
            if (!middle) { ok = false; break; }
            for (const id of middle) { const n = nodes.get(id); if (n) out.push({ x: n.x, z: n.z }); }
          }
        }
        if (!out.length || roadNodeId(key(out[out.length - 1])) !== roadNodeId(key(cur))) out.push(cur);
      }
      // A graph edge may be a bent polyline; endpoint adjacency alone must not
      // turn it into a straight traffic chord through the intervening terrain.
      const shaped: Vec2[] = out.length ? [out[0]] : [];
      for (let i = 1; i < out.length && ok; i += 1) {
        const from = roadNodeId(key(out[i - 1])), to = roadNodeId(key(out[i]));
        const edge = edges.get([from, to].sort().join("/"));
        if (!edge) { ok = false; break; }
        shaped.push(...(edge.from === from ? edge.points : [...edge.points].reverse()).slice(1));
      }
      if (!ok || shaped.length < 2) carPaths.splice(r, 1); else carPaths[r] = shaped;
    }
  }
  draft.landmarks.splice(0, draft.landmarks.length,
    ...withBridgeLandmark(draft.landmarks, bridges, random, highwayRuns));
  });
  if (!derivedFinalization.ok) generatedParcels = blocks.reduce((sum, block) => sum + block.parcels.length, 0);
  // 终筛：所有改路步骤（接入路、断头路收尾、碎边合并）之后，对每个地块统一核对「到任何路段的距离」。
  // 曾放在断头路收尾与碎边合并之前：那两步新增/移动的路段会压到地块上（凯旋门骑路改位后布局守卫抓到 gap 6.2）。
  // 块级检查只看街区四角与中心到主干道的距离，边中点更近的地块会漏过；连接支路又长达上百单位直穿街区、
  // 且在地块之后才加入——布局守卫抓到过 gap 6.4 的压路地块。
  function finalizeParcels(blocks: CityBlock[]) {
    for (const block of blocks) block.parcels = parcelBuilders.get(block.id)?.(block) ?? [];
    generatedParcels = blocks.reduce((sum, block) => sum + block.parcels.length, 0);
    const CELL = 60;
    const grid = new Map<string, RoadEdge[]>();
    for (const edge of edges.values()) {
      for (let segment = 1; segment < edge.points.length; segment += 1) {
      const a0 = edge.points[segment - 1], b0 = edge.points[segment];
      for (let gx = Math.floor(Math.min(a0.x, b0.x) / CELL) - 1; gx <= Math.floor(Math.max(a0.x, b0.x) / CELL) + 1; gx += 1)
        for (let gz = Math.floor(Math.min(a0.z, b0.z) / CELL) - 1; gz <= Math.floor(Math.max(a0.z, b0.z) / CELL) + 1; gz += 1) {
          const key2 = `${gx}:${gz}`;
          const list = grid.get(key2);
          if (list) list.push(edge); else grid.set(key2, [edge]);
        }
      }
    }
    for (const block of blocks) {
      block.parcels = block.parcels.filter((parcel) => {
        const need = Math.hypot(parcel.width, parcel.depth) / 2;
        return (grid.get(`${Math.floor(parcel.x / CELL)}:${Math.floor(parcel.z / CELL)}`) ?? []).every((edge) =>
          edge.points.slice(1).every((b, k) => segmentDistance(parcel, edge.points[k], b) >= need + edge.width / 2 + 0.5));
      });
    }
  }

  // ── 尽端回车点（路网形态批 §5-3，docs/CITY_PLANNER_V2_FINDINGS.md §5）：合法尽端
  // （EndpointRole cul-de-sac：滨海大道计划断点 planned-local / 近水终止 coast）语义上
  // 是计划内终点，几何上却是路戛然而止——把它们的坐标作为加性字段输出，渲染层据此画
  // 死胡同回车圈。classifyEndpoints 经 diagnoseNetwork 调用，只读（verify-city-intent
  // 已证诊断前后 plan 深比较一致），不改任何路网/用地字段，计划基线哈希不受影响。
  const plan = { blocks, roadNodes: [...nodes.values()], roadEdges: [...edges.values()], terrain, extent, coast, river, publicSites, parkTrees,
    urbanBounds, bridges, boundsRadius, carPaths, coastRoads: coastRoadRuns.slice(0, coastalRunCount), riverRoadRuns: coastRoadRuns.slice(coastalRunCount), districtAnchors, highways: highwayRuns, core, islandRadius: R, landmarks, seaside,
    // 修复可能合并掉一个 civic 节点；只在骨架预先声明的锚点集合内重绑，不能选附近支路。
    connections: connectionLog, primaryAnchorNodeId: repairCtx.primaryAnchorNodeId ?? null, junctionReport, solveReport, siteObligations,
    demandCatalogue: repairCtx.demandCatalogue?.map((demand) => ({ ...demand })),
    planningOutcome: derivedFinalization.outcome,
    parcelSource: legacyGridParcels ? "legacy-grid" as const : "accepted-road-faces" as const, roadBlockReport,
    derivedFinalization: { ok: derivedFinalization.ok, ...(derivedFinalization.reason ? { reason: derivedFinalization.reason } : {}) },
    derivedNetworkVersion: (network as Network & { version?: number }).version ?? 0, skeletonDiagnostics, skeletonReservationIds, roadGenerationDiagnostics,
    parcelGeneration: { generated: generatedParcels, roadClearanceRejected: generatedParcels - blocks.reduce((sum, block) => sum + block.parcels.length, 0) } };
  const culDeSacEnds: Vec2[] = (diagnoseNetwork(plan)?.endpoints ?? [])
    .filter((endpoint) => endpoint.role.kind === "cul-de-sac")
    .map((endpoint) => endpoint.at);
  return { ...plan, culDeSacEnds };
}

/** 悬索大桥：有河桥时把最长的那座做成悬索桥（地标，不改路网）。曾按 55% 概率：用户的岛恰好没抽中。 */
function withBridgeLandmark(landmarks: Landmark[], bridges: CityLayout["bridges"], _random: (key: string) => number, highways: Vec2[][] = []): Landmark[] {
  if (!bridges.length) return landmarks;
  // 悬索桥的门式塔高 34、桥宽 12：环线高架（离地 8）若从桥身中段穿过，会直接穿过塔架与主缆（用户截图）。
  // 取最长的、且整段离高架 ≥ 36 的过河桥；都不满足就不做悬索桥（桥仍是普通桥）。
  const clearOfHighways = (b: CityLayout["bridges"][number]) => highways.every((run) => run.every((q, i) => { if (i === 0) return true; for (let k = 0; k <= 10; k += 1) { const t = k / 10; if (segmentDistance({ x: b.from.x + (b.to.x - b.from.x) * t, z: b.from.z + (b.to.z - b.from.z) * t }, run[i - 1], q) < 36) return false; } return true; }));
  const longest = [...bridges].sort((a, b) => b.length - a.length).find(clearOfHighways);
  if (!longest) return landmarks;
  return [...landmarks, { id: "landmark:suspension-bridge", kind: "suspension-bridge", x: longest.from.x, z: longest.from.z, to: longest.to, yaw: longest.angle, radius: 0 }];
}
