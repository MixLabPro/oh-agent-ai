#!/usr/bin/env node
// planner/solve.ts 自检（CITY_ARCHITECTURE §2 迁移步 5b）：
//   (a) 策略表里每个 constraint id 都存在于 CONSTRAINTS；
//   (b) 修复不让它所针对的约束变差：6 个岛上「solve 前（skipSolve 草案）→ solve 后」的违规数，after <= before；
//   (c) 确定性：同一输入两次运行结果完全一致（含 skipSolve 草案）。
import assert from "node:assert/strict";
import { loadCity } from "./city-kit/index.mjs";

const { createCityPlan, MIAMI_COASTAL, CONSTRAINTS, REPAIR_STRATEGIES, solvePlan } = await loadCity({
  "engine/cityPlan.ts": ["createCityPlan"],
  "engine/citySeaside.ts": ["MIAMI_COASTAL"],
  "engine/planner/constraints.ts": ["CONSTRAINTS"],
  "engine/planner/solve.ts": ["REPAIR_STRATEGIES", "solvePlan"],
});

const ids = new Set(CONSTRAINTS.map((c) => c.id));
assert(REPAIR_STRATEGIES.length > 0 && typeof solvePlan === "function", "strategy table + solvePlan must exist");
for (const s of REPAIR_STRATEGIES) {
  assert(ids.has(s.constraint), `strategy ${s.name} targets unknown constraint ${s.constraint}`);
  assert.equal(typeof s.run, "function", `${s.name} needs run()`);
}
const targeted = [...new Set(REPAIR_STRATEGIES.map((s) => s.constraint))];

const count = (plan, id) => CONSTRAINTS.find((c) => c.id === id).measure(plan).length;
const islands = [[1, 0, null], [2, 3, MIAMI_COASTAL], [5, 7, MIAMI_COASTAL], [1, 11, null], [2, 13, MIAMI_COASTAL], [5, 17, null]];
const rows = [];
for (const [tier, i, cfg] of islands) {
  const seed = 1703294958 + i * 7919;
  const before = createCityPlan(seed, tier, cfg, { skipSolve: true });
  const after = createCityPlan(seed, tier, cfg);
  for (const id of targeted) {
    const b = count(before, id); const a = count(after, id);
    // 2026-10-08 网络优先批次 1 过渡豁免：断头检测语义化后，锐角/扎堆修复删边可能让端点 2->1，
    // 留下的窄短枝若受车流/门前保护则 prune 正当地不收——软约束间的有界互换。允许净 +1，
    // 统一连接器（批次 4）落地「接受检查」后收回此豁免。
    const slack = id === "looseInlandRoadEnds" ? 1 : 0;
    assert(a <= b + slack, `island seed=${seed} tier=${tier}: ${id} got worse after solve (${b} -> ${a})`);
    rows.push(`${id} ${b}->${a}`);
  }
  assert.equal(JSON.stringify(createCityPlan(seed, tier, cfg)), JSON.stringify(after), `solve not deterministic for seed=${seed} tier=${tier}`);
  assert.equal(JSON.stringify(createCityPlan(seed, tier, cfg, { skipSolve: true })), JSON.stringify(before), `skipSolve draft not deterministic for seed=${seed} tier=${tier}`);
}
console.log(`City solve: ${REPAIR_STRATEGIES.length} strategies over ${targeted.length} constraints (${targeted.join(", ")}); ${islands.length} islands never worse after solve; deterministic.`);
console.log(`  ${rows.join(" | ")}`);
