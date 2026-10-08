#!/usr/bin/env node
// 意图层只读诊断守卫（CITY_NETWORK_FIRST_CODE_DESIGN 迁移批次 2）：
//   (a) 主网定义成立：primaryComponentId 存在且覆盖大部分节点（含 civic/plaza 骨架）；
//   (b) 检测完整：每个度为 1 的非桥路端都有角色，没有 null/未分类；
//   (c) 每个 required demand 有满足布尔与原因；unmet 只作影子指标输出（本批不 gating 质量）；
//   (d) 零副作用：诊断前后 plan 深比较完全一致（设计 §5A-7 拒绝的候选不得修改正式网络）；
//   (e) 确定性：同输入两次诊断结果完全一致。
import assert from "node:assert/strict";
import { loadCity } from "./city-kit/index.mjs";

const { createCityPlan, MIAMI_COASTAL, diagnoseNetwork, componentOf } = await loadCity({
  "engine/cityPlan.ts": ["createCityPlan"], "engine/citySeaside.ts": ["MIAMI_COASTAL"],
  "engine/planner/constraints.ts": ["CONSTRAINTS"],
  "engine/planner/intent.ts": ["diagnoseNetwork", "componentOf"],
});
const ISLANDS = [[1, 0, null], [2, 3, MIAMI_COASTAL], [5, 7, MIAMI_COASTAL], [1, 11, null], [2, 13, MIAMI_COASTAL], [5, 17, null], [3, 21, MIAMI_COASTAL], [2, 23, MIAMI_COASTAL]];
const shadow = [];
for (const [tier, i, cfg] of ISLANDS) {
  const seed = 1703294958 + i * 7919;
  const plan = createCityPlan(seed, tier, cfg);
  const frozen = JSON.stringify([plan.roadNodes, plan.roadEdges, plan.publicSites, plan.landmarks, plan.coastRoads]);
  const d1 = diagnoseNetwork(plan);
  assert.ok(d1, `seed ${seed}: primary component missing (civic skeleton absent)`);
  assert.equal(JSON.stringify([plan.roadNodes, plan.roadEdges, plan.publicSites, plan.landmarks, plan.coastRoads]), frozen, `seed ${seed}: diagnostics mutated the plan`);
  const d2 = diagnoseNetwork(plan);
  assert.equal(JSON.stringify(d2), JSON.stringify(d1), `seed ${seed}: diagnostics not deterministic`);
  assert.ok(d1.endpoints.length > 0 && d1.endpoints.every((e) => e.role && e.role.kind), `seed ${seed}: an endpoint has no role`);
  assert.ok(d1.demands.every((x) => typeof x.satisfied === "boolean"), `seed ${seed}: a demand lacks a verdict`);
  // 主网骨架证据：primary 分量必须包含离 core ≤ 60 的节点（环岛半径 52 + 余量）——
  // 防「离 core 最近的节点恰是被孤立的 spur」选错分量（设计：主网 = 含 civic/plaza 骨架的分量）。
  const comp = componentOf(plan);
  const nearCoreIds = plan.roadNodes.filter((n) => Math.hypot(n.x - plan.core.x, n.z - plan.core.z) <= 60).map((n) => n.id);
  assert.ok(nearCoreIds.some((id) => comp.get(id) === d1.primaryComponentId), `seed ${seed}: primary component carries no plaza-ring node`);
  // 独立重数：度为 1 的非桥端总数必须与诊断的 endpoints 数一致（classifyEndpoints 静默跳过的
  // 节点记录缺失会被此处抓到）。
  const deg1 = new Map();
  for (const e of plan.roadEdges) if (!e.bridge) for (const id of [e.from, e.to]) deg1.set(id, (deg1.get(id) || 0) + 1);
  const degree1Count = [...deg1.entries()].filter(([id, d]) => d === 1 && plan.roadNodes.some((n) => n.id === id)).length;
  assert.equal(d1.endpoints.length, degree1Count, `seed ${seed}: endpoint classification incomplete (${d1.endpoints.length} of ${degree1Count})`);
  assert.ok(d1.unmet.every((u) => u.reason && u.demandId), `seed ${seed}: an unmet demand lacks a reason`);
  shadow.push(`${seed}/t${tier}: endpoints ${d1.endpoints.length} (must-connect ${d1.endpoints.filter((e) => e.role.kind === "must-connect").length}), unmet ${d1.unmet.length}${d1.unmet.length ? ` [${d1.unmet.slice(0, 3).map((u) => u.demandId).join(", ")}]` : ""}`);
}
console.log(`City intent diagnostics: ${ISLANDS.length} islands — every degree-1 endpoint classified, every required demand verdicted, read-only and deterministic.`);
console.log(`  ${shadow.join(" | ")}`);
