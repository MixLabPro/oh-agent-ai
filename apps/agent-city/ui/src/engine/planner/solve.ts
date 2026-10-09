import type { RepairContext } from "./context";
import { CONSTRAINTS } from "./constraints";
import { resiteViolatingSites } from "./siting";
import { joinNearMissEnds, pruneShortSpurs, resolveAcuteJunctions, resolveCrowdedArterials } from "./networkRepairs";
import { detourAroundSites, extendLooseEnds, frontStationsAndStadiums, nudgeSitesOffRoads } from "./repairs";

/**
 * 规划求解循环（CITY_ARCHITECTURE §2 迁移步 5b）：把 buildPlan 尾部内联的修复遍登记成「约束 id → 修复策略」的表。
 *
 * 本步只搬家、不改行为：表的顺序就是原先内联块的执行顺序，每个策略每轮跑一次；整张表重复到不动点（最多 MAX_SOLVE_ROUNDS 轮，见 solvePlan）（nudge 内部自带「最多 6 轮直到没有挪动」，
 * 保持原语义）。顺序是承重的——后一步改了路/用地位置，前一步接好的关系就可能失效：
 *   1. frontStationsAndStadiums  车站/体育场临街（先拉近，再转车站正面朝路）       ← stationDoorFacesRoad
 *   2. nudgeSitesOffRoads        路穿过用地中心的，沿离路方向推开（≤6 轮；岸边用地推不开则沿海岸换位，
 *                                即 repairs.ts::relocateShoreSite，它在每轮逐用地的兜底里被调用，无法与推开拆成两遍）← roadThroughSite
 *   3. detourAroundSites         被用地截断的两个共线断头，用绕用地外缘的折线接起来      ← looseInlandRoadEnds
 *   4. extendLooseEnds           其余内陆断头顺自己方向延伸到下一条路（≤2 遍）          ← looseInlandRoadEnds
 * 之后的「终筛」（按路段距离筛地块）不是修复路网而是收尾过滤，留在 cityPlan.ts。
 * 将来 measure → repair → re-measure 的外层循环（按 CONSTRAINTS 的违规挑策略）以这张表为注册点；本步不引入新修复、不改触发时机。
 */
export type RepairStrategy = { constraint: string; name: string; run: (ctx: RepairContext) => number };

export const REPAIR_STRATEGIES: RepairStrategy[] = [
  { constraint: "stationDoorFacesRoad", name: "frontStationsAndStadiums", run: frontStationsAndStadiums },
  { constraint: "roadThroughSite", name: "nudgeSitesOffRoads", run: nudgeSitesOffRoads },
  { constraint: "looseInlandRoadEnds", name: "detourAroundSites", run: detourAroundSites },
  { constraint: "looseInlandRoadEnds", name: "extendLooseEnds", run: extendLooseEnds },
  // 以下三条会改变规划（删冗余路段），见 networkRepairs.ts 的三道保险；顺序在断头延伸之后，让「删出来的新断头」下一轮被延伸/修剪。
  { constraint: "crowdedArterials", name: "resolveCrowdedArterials", run: resolveCrowdedArterials },
  { constraint: "acuteJunctions", name: "resolveAcuteJunctions", run: resolveAcuteJunctions },
  { constraint: "looseInlandRoadEnds", name: "joinNearMissEnds", run: joinNearMissEnds },
  { constraint: "looseInlandRoadEnds", name: "pruneShortSpurs", run: pruneShortSpurs },
  // 选址后置（siting.ts）：路网定型后，对仍然入水/重叠的用地在候选表里重新落位。放在表尾，不动点循环会让前面的策略对新位置再跑一遍。
  { constraint: "siteInWater", name: "resiteViolatingSites", run: resiteViolatingSites },
];

export type SolveReport = Array<{ constraint: string; name: string; changes: number }>;

/** 外层循环上限：规划是确定性的，没有改动就是不动点，三轮足够；封顶防止两个策略互相撤销时无限振荡。 */
export const MAX_SOLVE_ROUNDS = 3;

/**
 * 按表顺序跑修复策略；一轮里只要有任何策略改动了东西，就整张表再跑一轮（后一步的改动可能让前一步重新有活可干，
 * 例如断头延伸接通后，原来被「路离用地太近」挡住的推开现在能执行了），直到一整轮零改动或达到 MAX_SOLVE_ROUNDS。
 * 返回每个策略在所有轮次里的改动数合计。
 */
export function solvePlan(ctx: RepairContext, maxRounds = MAX_SOLVE_ROUNDS): SolveReport {
  const report: SolveReport = REPAIR_STRATEGIES.map((s) => ({ constraint: s.constraint, name: s.name, changes: 0 }));
  // 违例驱动·保守版（批次 8，设计 §5.6）：首轮先量一遍全部策略约束，**全部为零才不进循环**。
  // 逐策略门控的完整试验已做并回退：没有配套 §5.6-2「补丁不回退（字典序接受）」时，跳过
  // 「自身约束已清零」的策略会丢掉它们的跨约束清理（实测 t1：acute 6>5、断分量 4>2、
  // 桥头 10>8 三处回升）——两半不可分割，完整机制与 solve 守卫的逐约束单调松弛一并留给下批。
  const ids = new Set(REPAIR_STRATEGIES.map((s) => s.constraint));
  const anyViolation = CONSTRAINTS.some((c) => ids.has(c.id) && c.measure(planView(ctx)).length > 0);
  if (anyViolation) {
    for (let round = 0; round < maxRounds; round += 1) {
      let changed = 0;
      REPAIR_STRATEGIES.forEach((s, i) => { const n = s.run(ctx); report[i].changes += n; changed += n; });
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
  } as unknown as Parameters<typeof CONSTRAINTS[0]["measure"]>[0];
}
