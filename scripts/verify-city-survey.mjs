#!/usr/bin/env node
// 样本外规划普查守卫（CITY_ARCHITECTURE 约束框架；CITY_PLANNER_V2_SPEC 步 3 扩到四档）：
// 30 个固定岛是回归样本，真实用户的种子千差万别——在与回归样本错开的种子上测全部约束，
// 断言每条约束的「违例岛数」不超过该档上限；同时输出各档平均分（scorePlan 只作规划器对比，不作验收）。
// 上限：tier1 沿用 150 种子折算；tier 3/5/10 = 2026-10-08 实测 + 余量。
// looseInlandRoadEnds 2026-10-08：断头豁免改语义判定后平岛盲区首次可见（检测口径 t1 45/t3 26/t5 18/t10 7）；
// 修复策略同步语义化（prune/joinNearMiss 不再看高度）后实测回落到 t1 29/t3 8/t5 8/t10 2，上限=实测值。
// 失败时先跑 `node scripts/city-kit/survey.mjs 150 1`（或对应档位）
// 看是哪类约束、典型种子，再决定修规划还是（有理由时）调上限。
import assert from "node:assert/strict";
import { loadCity } from "./city-kit/index.mjs";

const TIERS = [
  { tier: 1, seeds: 60 },
  { tier: 3, seeds: 30 },
  { tier: 5, seeds: 20 },
  { tier: 10, seeds: 10 },
];
// 0 = 当前实测为 0 的约束必须保持为 0；非 0 的是已知残留。tier>1 的表覆盖 tier1 表（未列键沿用）。
const CEILING = {
  siteInWater: 2, siteWithoutDoorRoad: 0, roadThroughSite: 0, sitesOverlap: 1, parcelInsideSite: 0,
  stationStadiumSetback: 0, stationDoorFacesRoad: 0, archStraddlesRoad: 0, civicPlazaCentred: 0,
  suspensionBridgeClearOfHighways: 0, looseInlandRoadEnds: 29, acuteJunctions: 5, crowdedArterials: 4,
};
const TIER_CEILING = {
  3: { siteInWater: 4, looseInlandRoadEnds: 8, acuteJunctions: 2, crowdedArterials: 2 },
  5: { siteInWater: 2, looseInlandRoadEnds: 8, acuteJunctions: 4, crowdedArterials: 3 },
  10: { siteInWater: 1, looseInlandRoadEnds: 2, acuteJunctions: 4, crowdedArterials: 3 },
};
const { createCityPlan, MIAMI_COASTAL, CONSTRAINTS, scorePlan } = await loadCity({
  "engine/cityPlan.ts": ["createCityPlan"], "engine/citySeaside.ts": ["MIAMI_COASTAL"],
  "engine/planner/constraints.ts": ["CONSTRAINTS"], "engine/planner/score.ts": ["scorePlan"],
});
const summaries = [];
for (const { tier, seeds } of TIERS) {
  const ceiling = { ...CEILING, ...(TIER_CEILING[tier] ?? {}) };
  const islands = new Map(CONSTRAINTS.map((c) => [c.id, []]));
  let scoreSum = 0;
  for (let i = 0; i < seeds; i += 1) {
    const seed = 2_000_000_000 + i * 104_729; // 与回归样本（1703294958 + i*7919）错开
    const plan = createCityPlan(seed, tier, MIAMI_COASTAL);
    scoreSum += scorePlan(plan);
    for (const c of CONSTRAINTS) if (c.measure(plan).length) islands.get(c.id).push(seed);
  }
  const problems = [];
  for (const c of CONSTRAINTS) {
    assert(c.id in CEILING, `survey ceiling missing for constraint ${c.id}`);
    const n = islands.get(c.id).length;
    if (n > ceiling[c.id]) problems.push(`tier ${tier} ${c.id}: ${n}/${seeds} islands (ceiling ${ceiling[c.id]}) e.g. seeds ${islands.get(c.id).slice(0, 3).join(", ")}`);
  }
  assert.equal(problems.length, 0, `out-of-sample planning quality regressed:\n  ${problems.join("\n  ")}`);
  const residual = [...islands].map(([id, l]) => `${id} ${l.length}`).filter((x) => !x.endsWith(" 0")).join(", ");
  summaries.push(`t${tier}(${seeds}): ${residual || "clean"}; score ${(scoreSum / seeds).toFixed(3)}`);
}
console.log(`City survey: 4 tiers — ${summaries.join(" | ")} (all within ceilings).`);
