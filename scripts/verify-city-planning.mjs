#!/usr/bin/env node
// 道路与用地规划守卫（docs/CITY_ROAD_PLANNING_AUDIT.md R1/R2）。
// 真机反馈「道路混乱、地标胡乱摆放、门前没有路」：重写前 30 个岛（10 种子 × 1/2/5 档）实测
// 锐角路口 45、被道路穿过的用地 196、门前无路 10；R1/R2 后 5 / 3 / 3。阈值给少量余量，
// 防止退回旧的「最近节点直连」与「主干道穿过用地」。
import assert from "node:assert/strict";
import { cachedPlan, loadCity } from "./city-kit/index.mjs";

// 原生加载 + 进程内缓存（CITY_ARCHITECTURE 迁移步 1）。
const { createCityPlan: rawPlan, MIAMI_COASTAL, CONSTRAINTS } = await loadCity({
  "engine/planner/constraints.ts": ["CONSTRAINTS"],
  "engine/cityPlan.ts": ["createCityPlan"],
  "engine/citySeaside.ts": ["MIAMI_COASTAL"],
});
const createCityPlan = (seed, tier, config) => cachedPlan(rawPlan, seed, tier, config);

// 度量来自共享模块 engine/planner/constraints.ts（规划器与守卫同一份 measure）；上限留在下面的断言里。
const byId = Object.fromEntries(CONSTRAINTS.map((c) => [c.id, c]));
const totals = { acute: 0, inside: 0, far: 0, crowded: 0, islands: 0, loose: 0 };
for (const tier of [1, 2, 5]) for (let i = 0; i < 10; i += 1) {
  const seed = 1703294958 + i * 7919;
  const plan = createCityPlan(seed, tier, MIAMI_COASTAL);
  totals.islands += 1;
  // 内陆断头（F1 修复 B/C 之后）：度为 1、离岸 ≥ 2.5、离任何用地边缘 > 12 的路端。
  totals.loose += byId.looseInlandRoadEnds.measure(plan).length;
  // 锐角路口：三路及以上的路口，相邻两条路夹角 < 30°。
  totals.acute += byId.acuteJunctions.measure(plan).length;
  // 用地：路不能穿过（中心到路 < 0.7 半径；核心广场、凯旋门除外），门前要有路（边缘到路 ≤ 20，含堤道桥）。
  totals.inside += byId.roadThroughSite.measure(plan).length;
  totals.far += byId.siteWithoutDoorRoad.measure(plan).length;
  // 主干道不扎堆。
  totals.crowded += byId.crowdedArterials.measure(plan).length;
}
// 2026-10-07 碎边合并后 2，收紧到 5；同日固定地标增至 5 座后路网变动到 6（两条短支路之间的夹角），放到 8（仍低于原 10、远低于起点 45）。
// 2026-10-08 solve 循环新增 resolveAcuteJunctions / resolveCrowdedArterials / joinNearMissEnds / pruneShortSpurs 后实测 0 / 3 / 2，阈值收紧到实测 + 少量余量。
assert(totals.acute <= 2, `acute junctions ${totals.acute} > 2 across ${totals.islands} islands (was 45 before R1, 8 before the solve repairs)`);
assert(totals.inside <= 8, `sites with a road through them ${totals.inside} > 8 (was 196 before R2)`);
// 2026-10-08 网络优先批次 1：断头豁免从 height≥2.5 地形代理改为语义判定（planner/endpoints.ts），检测口径 30 岛实测 65；
// 修复策略同步语义化后回落到 16；批次 3-2（repairs.ts 全部 height 门切语义 + 河岸段豁免合并）后 9；
// 批次 4-3（孤立分量 tolerance 不校验直连删除）后 10——被水/地形围死的分量保持隔离，断头如实计数。上限=实测值。
assert(totals.loose <= 10, `loose inland road ends ${totals.loose} > 10 over 30 islands`);
assert(totals.far <= 5, `sites without a road at the door ${totals.far} > 3`);
assert(totals.crowded <= 5, `crowded arterial pairs ${totals.crowded} > 5`);
console.log(`City planning: ${totals.islands} islands — acute junctions ${totals.acute}, roads through sites ${totals.inside}, sites without access ${totals.far}, crowded arterials ${totals.crowded}, loose inland ends ${totals.loose} passed.`);
