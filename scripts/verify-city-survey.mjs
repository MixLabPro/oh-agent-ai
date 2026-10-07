#!/usr/bin/env node
// 样本外规划普查守卫（CITY_ARCHITECTURE 约束框架）：30 个固定岛是回归样本，真实用户的种子千差万别——
// 这里在 60 个与回归样本错开的种子上测全部约束，断言每条约束的「违例岛数」不超过上限。
// 上限 = 150 种子普查实测率折算到 60 个并留余量（见 scripts/city-kit/survey.mjs，可手动跑更大的普查）。
// 失败时先跑 `node scripts/city-kit/survey.mjs 150 1` 看是哪类约束、典型种子，再决定修规划还是（有理由时）调上限。
import assert from "node:assert/strict";
import { loadCity } from "./city-kit/index.mjs";

const SEEDS = 60;
// 0 = 当前实测为 0 的约束必须保持为 0；非 0 的是已知残留（广场偏离环岛、庄园入水、少量断头/锐角/并排路）。
const CEILING = {
  siteInWater: 2, siteWithoutDoorRoad: 0, roadThroughSite: 0, sitesOverlap: 1, parcelInsideSite: 0,
  stationStadiumSetback: 0, stationDoorFacesRoad: 0, archStraddlesRoad: 0, civicPlazaCentred: 2,
  suspensionBridgeClearOfHighways: 0, looseInlandRoadEnds: 2, acuteJunctions: 5, crowdedArterials: 4,
};
const { createCityPlan, MIAMI_COASTAL, CONSTRAINTS } = await loadCity({
  "engine/cityPlan.ts": ["createCityPlan"], "engine/citySeaside.ts": ["MIAMI_COASTAL"], "engine/planner/constraints.ts": ["CONSTRAINTS"],
});
const islands = new Map(CONSTRAINTS.map((c) => [c.id, []]));
for (let i = 0; i < SEEDS; i += 1) {
  const seed = 2_000_000_000 + i * 104_729;
  const plan = createCityPlan(seed, 1, MIAMI_COASTAL);
  for (const c of CONSTRAINTS) if (c.measure(plan).length) islands.get(c.id).push(seed);
}
const problems = [];
for (const c of CONSTRAINTS) {
  assert(c.id in CEILING, `survey ceiling missing for constraint ${c.id}`);
  const n = islands.get(c.id).length;
  if (n > CEILING[c.id]) problems.push(`${c.id}: ${n}/${SEEDS} islands (ceiling ${CEILING[c.id]}) e.g. seeds ${islands.get(c.id).slice(0, 3).join(", ")}`);
}
assert.equal(problems.length, 0, `out-of-sample planning quality regressed:\n  ${problems.join("\n  ")}`);
console.log(`City survey: ${SEEDS} out-of-sample seeds — ${[...islands].map(([id, l]) => `${id} ${l.length}`).filter((x) => !x.endsWith(" 0")).join(", ") || "no violations"} (all within ceilings).`);
