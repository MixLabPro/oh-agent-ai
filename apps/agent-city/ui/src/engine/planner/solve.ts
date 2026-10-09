import type { RepairContext } from "./context";
import { CONSTRAINTS } from "./constraints";
import { componentOf, diagnoseNetwork, primaryComponentId } from "./intent";
import { DetMath as Math } from "../detMath";
import { resiteViolatingSites } from "./siting";
import { joinNearMissEnds, pruneShortSpurs, resolveAcuteJunctions, resolveCrowdedArterials } from "./networkRepairs";
import { detourAroundSites, extendLooseEnds, frontStationsAndStadiums, nudgeSitesOffRoads } from "./repairs";

/**
 * 规划求解循环（CITY_ARCHITECTURE §2 迁移步 5b）：把 buildPlan 尾部内联的修复遍登记成「约束 id → 修复策略」的表。
 *
 * 策略顺序保留原迁移表；现在逐策略在隔离草稿执行，接受检查通过才发布。
 * 顺序仍影响候选，但后一步不能以破坏已满足需求/安全关系换取自身分数：
 *   1. frontStationsAndStadiums  车站/体育场临街（先拉近，再转车站正面朝路）       ← stationDoorFacesRoad
 *   2. nudgeSitesOffRoads        路穿过用地中心的，沿离路方向推开（≤6 轮；岸边用地推不开则沿海岸换位，
 *                                即 repairs.ts::relocateShoreSite，它在每轮逐用地的兜底里被调用，无法与推开拆成两遍）← roadThroughSite
 *   3. detourAroundSites         被用地截断的两个共线断头，用绕用地外缘的折线接起来      ← looseInlandRoadEnds
 *   4. extendLooseEnds           其余内陆断头顺自己方向延伸到下一条路（≤2 遍）          ← looseInlandRoadEnds
 * 之后的「终筛」（按路段距离筛地块）不是修复路网而是收尾过滤，留在 cityPlan.ts。
 * 注册表继续复用旧候选策略；拒绝与原因进入产物 solveReport。
 */
export type RepairStrategy = { constraint: string; name: string; run: (ctx: RepairContext) => number };

/** 朝向是独立候选，不要求接受旧批量临街策略的整组位置/容量变化。 */
function orientStationDoors(ctx: RepairContext): number {
  let changes = 0;
  for (const site of ctx.publicSites) {
    if (site.kind !== "station") continue;
    let best: { distance: number; x: number; z: number; id: string } | null = null;
    for (const edge of ctx.network.edges.values()) {
      if (edge.bridge) continue;
      const a = edge.points[0]; const b = edge.points[edge.points.length - 1];
      const dx = b.x - a.x; const dz = b.z - a.z;
      const t = Math.max(0, Math.min(1, ((site.x - a.x) * dx + (site.z - a.z) * dz) / (dx * dx + dz * dz || 1)));
      const x = a.x + dx * t; const z = a.z + dz * t; const distance = Math.hypot(x - site.x, z - site.z);
      if (!best || distance < best.distance || (distance === best.distance && edge.id < best.id)) best = { x, z, distance, id: edge.id };
    }
    if (!best || best.distance < 0.01 || best.distance > site.radius + 90) continue;
    const yaw = Math.atan2(best.x - site.x, best.z - site.z);
    if (yaw !== site.yaw) { site.yaw = yaw; changes += 1; }
  }
  return changes;
}

export const REPAIR_STRATEGIES: RepairStrategy[] = [
  { constraint: "stationDoorFacesRoad", name: "frontStationsAndStadiums", run: frontStationsAndStadiums },
  { constraint: "stationDoorFacesRoad", name: "orientStationDoors", run: orientStationDoors },
  { constraint: "roadThroughSite", name: "nudgeSitesOffRoads", run: nudgeSitesOffRoads },
  { constraint: "looseInlandRoadEnds", name: "detourAroundSites", run: detourAroundSites },
  { constraint: "looseInlandRoadEnds", name: "extendLooseEnds", run: extendLooseEnds },
  // 以下三条会改变规划（删冗余路段），见 networkRepairs.ts 的三道保险；顺序在断头延伸之后，让「删出来的新断头」下一轮被延伸/修剪。
  { constraint: "crowdedArterials", name: "resolveCrowdedArterials", run: resolveCrowdedArterials },
  { constraint: "crowdedArterials", name: "resolveCrowdedWithEnds", run: (ctx) => {
    const changed = resolveCrowdedArterials(ctx);
    return changed ? changed + joinNearMissEnds(ctx) + pruneShortSpurs(ctx) : 0;
  } },
  { constraint: "acuteJunctions", name: "resolveAcuteJunctions", run: resolveAcuteJunctions },
  { constraint: "acuteJunctions", name: "resolveAcuteWithEnds", run: (ctx) => {
    const changed = resolveAcuteJunctions(ctx);
    return changed ? changed + joinNearMissEnds(ctx) + pruneShortSpurs(ctx) : 0;
  } },
  { constraint: "looseInlandRoadEnds", name: "joinNearMissEnds", run: joinNearMissEnds },
  { constraint: "looseInlandRoadEnds", name: "pruneShortSpurs", run: pruneShortSpurs },
  // 选址后置（siting.ts）：路网定型后，对仍然入水/重叠的用地在候选表里重新落位。放在表尾，不动点循环会让前面的策略对新位置再跑一遍。
  { constraint: "siteInWater", name: "resiteViolatingSites", run: resiteViolatingSites },
];

export type SolveReport = Array<{ constraint: string; name: string; changes: number; declined: number; reasons: string[] }>;

/** 草稿只复制数据；地形函数保持只读，不复制或调用外部副作用。 */
function copyData<T>(value: T): T {
  if (Array.isArray(value)) return value.map(copyData) as T;
  if (value instanceof Map) return new Map([...value].map(([key, item]) => [key, copyData(item)])) as T;
  if (value instanceof Set) return new Set(value) as T;
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, copyData(item)])) as T;
  return value;
}

/** 以既有对象为身份保护安全关系，而非只比较总分。 */
export function repairAcceptance(before: RepairContext, after: RepairContext): string | null {
  let improved = false;
  if (before.primaryAnchorNodeId && !after.network.nodes.has(before.primaryAnchorNodeId)) return "required primary anchor lost";
  const previousComponents = componentOf(planView(before)); const currentComponents = componentOf(planView(after));
  const previousPrimary = primaryComponentId(planView(before), previousComponents); const currentPrimary = primaryComponentId(planView(after), currentComponents);
  const inherited = new Map<string, Set<string>>();
  for (const [id, previous] of previousComponents) {
    const current = currentComponents.get(id); if (!current) continue;
    if (previous === previousPrimary && current !== currentPrimary) return "required main-network node detached";
    const roots = inherited.get(previous) ?? new Set<string>(); roots.add(current); inherited.set(previous, roots);
    if (roots.size > 1) return "existing component split";
  }
  for (const constraint of CONSTRAINTS) {
    const old = constraint.measure(planView(before)); const next = constraint.measure(planView(after));
    if (next.length > old.length) return `${constraint.id} increased ${old.length}->${next.length}`;
    if (next.length < old.length) improved = true;
    // 分量代表/报告坐标不是稳定对象身份；上面的节点继承检查已经禁止新断连或拆分。
    if (constraint.id === "disconnectedComponents") continue;
    const identity = (v: typeof old[number], ctx: RepairContext) => {
      const owner = v.site ? [...ctx.publicSites, ...ctx.landmarks].find((s) => s.kind === v.site && (!v.at || (s.x === v.at.x && s.z === v.at.z))) : null;
      return owner ? `${v.constraint}:${owner.id}` : `${v.constraint}:${v.site ?? ""}:${v.at?.x}:${v.at?.z}`;
    };
    const existing = new Set(old.map((v) => identity(v, before)));
    if (next.some((v) => !existing.has(identity(v, after)))) return `${constraint.id} introduced at a new object`;
  }
  const previousDemands = diagnoseNetwork(planView(before))?.demands ?? [];
  const satisfied = previousDemands.filter((d) => d.demand.required && d.satisfied);
  const next = new Map((diagnoseNetwork(planView(after))?.demands ?? []).map((d) => [d.demand.id, d.satisfied]));
  if (satisfied.some((d) => next.get(d.demand.id) !== true)) return "required demand lost";
  if (previousDemands.some((d) => d.demand.required && !d.satisfied && next.get(d.demand.id) === true)) improved = true;
  const parcelCount = (ctx: RepairContext) => ctx.blocks.reduce((n, block) => n + block.parcels.length, 0);
  if (parcelCount(after) < parcelCount(before)) return "repair discarded reserved parcel capacity";
  const parcelIds = new Set(after.blocks.flatMap((block) => block.parcels.map((parcel) => parcel.id)));
  if (before.blocks.some((block) => block.parcels.some((parcel) => !parcelIds.has(parcel.id)))) return "repair replaced a reserved parcel identity";
  if (!improved) return "no verified constraint or demand improvement";
  return null;
}

function acceptDraft(ctx: RepairContext, draft: RepairContext): void {
  ctx.network.nodes.clear(); for (const [id, node] of draft.network.nodes) ctx.network.nodes.set(id, node);
  ctx.network.edges.clear(); for (const [id, edge] of draft.network.edges) ctx.network.edges.set(id, edge);
  const network = ctx.network as typeof ctx.network & { version?: number };
  network.version = (network.version ?? 0) + 1;
  for (const field of ["publicSites", "landmarks", "blocks", "carPaths", "bridges", "connectionLog"] as const) {
    const target = ctx[field]; const source = draft[field];
    if (target && source) (target as unknown[]).splice(0, target.length, ...source);
  }
}

export function runRepairTransaction(ctx: RepairContext, strategy: RepairStrategy): { changes: number; reason?: string } {
  const draft = copyData(ctx);
  const changes = strategy.run(draft);
  if (!changes) return { changes: 0 };
  const reason = repairAcceptance(ctx, draft);
  if (reason) return { changes: 0, reason };
  acceptDraft(ctx, draft);
  return { changes };
}

/** 外层循环上限：规划是确定性的，没有改动就是不动点，三轮足够；封顶防止两个策略互相撤销时无限振荡。 */
export const MAX_SOLVE_ROUNDS = 3;

/**
 * 按表顺序跑修复策略；一轮里只要有任何策略改动了东西，就整张表再跑一轮（后一步的改动可能让前一步重新有活可干，
 * 例如断头延伸接通后，原来被「路离用地太近」挡住的推开现在能执行了），直到一整轮零改动或达到 MAX_SOLVE_ROUNDS。
 * 返回每个策略在所有轮次里的改动数合计。
 */
export function solvePlan(ctx: RepairContext, maxRounds = MAX_SOLVE_ROUNDS): SolveReport {
  const report: SolveReport = REPAIR_STRATEGIES.map((s) => ({ constraint: s.constraint, name: s.name, changes: 0, declined: 0, reasons: [] }));
  // 保留跨约束候选生成；每个候选都独立接受，不再原地运行后补救。
  const ids = new Set(REPAIR_STRATEGIES.map((s) => s.constraint));
  const anyViolation = CONSTRAINTS.some((c) => ids.has(c.id) && c.measure(planView(ctx)).length > 0);
  if (anyViolation) {
    for (let round = 0; round < maxRounds; round += 1) {
      let changed = 0;
      REPAIR_STRATEGIES.forEach((s, i) => {
        const outcome = runRepairTransaction(ctx, s);
        if (outcome.reason) { report[i].declined += 1; if (!report[i].reasons.includes(outcome.reason)) report[i].reasons.push(outcome.reason); return; }
        report[i].changes += outcome.changes; changed += outcome.changes;
      });
      if (!changed) break;
    }
  }
  return report;
}

/** 约束 measure 可读的 ctx 视图：constraints.ts 只读下列字段（与 CityPlan 子集同构）。 */
function planView(ctx: RepairContext) {
  return {
    roadEdges: [...ctx.network.edges.values()], roadNodes: [...ctx.network.nodes.values()],
    publicSites: ctx.publicSites, landmarks: ctx.landmarks, blocks: ctx.blocks,
    terrain: ctx.geo.terrain, seaside: ctx.seaside, coast: ctx.coast, river: ctx.geo.river,
    core: ctx.core, coastRoads: ctx.coastRoadRuns, riverRoadRuns: ctx.riverRoadRuns,
    primaryAnchorNodeId: ctx.primaryAnchorNodeId,
  } as unknown as Parameters<typeof CONSTRAINTS[0]["measure"]>[0];
}
