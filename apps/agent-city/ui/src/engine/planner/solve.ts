import type { RepairContext } from "./context";
import { detourAroundSites, extendLooseEnds, frontStationsAndStadiums, nudgeSitesOffRoads } from "./repairs";

/**
 * 规划求解循环（CITY_ARCHITECTURE §2 迁移步 5b）：把 buildPlan 尾部内联的修复遍登记成「约束 id → 修复策略」的表。
 *
 * 本步只搬家、不改行为：表的顺序就是原先内联块的执行顺序，每个策略恰好跑一次（nudge 内部自带「最多 6 轮直到没有挪动」，
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
];

export type SolveReport = Array<{ constraint: string; name: string; changes: number }>;

/** 按表顺序跑完所有修复策略，返回每个策略的改动数。 */
export function solvePlan(ctx: RepairContext): SolveReport {
  return REPAIR_STRATEGIES.map((s) => ({ constraint: s.constraint, name: s.name, changes: s.run(ctx) }));
}
