#!/usr/bin/env node
// 意图层只读诊断守卫（CITY_NETWORK_FIRST_CODE_DESIGN 迁移批次 2）：
//   (a) 主网定义成立：primaryComponentId 存在且覆盖大部分节点（含 civic/plaza 骨架）；
//   (b) 检测完整：每个度为 1 的非桥路端都有角色，没有 null/未分类；
//   (c) 每个 required demand 有满足布尔与原因；unmet 只作影子指标输出（本批不 gating 质量）；
//   (d) 零副作用：诊断前后 plan 深比较完全一致（设计 §5A-7 拒绝的候选不得修改正式网络）；
//   (e) 确定性：同输入两次诊断结果完全一致。
import assert from "node:assert/strict";
import { loadCity } from "./city-kit/index.mjs";

const { createCityPlan, MIAMI_COASTAL, diagnoseNetwork, componentOf, preserveDemandPaths } = await loadCity({
  "engine/cityPlan.ts": ["createCityPlan"], "engine/citySeaside.ts": ["MIAMI_COASTAL"],
  "engine/planner/constraints.ts": ["CONSTRAINTS"],
  "engine/planner/intent.ts": ["diagnoseNetwork", "componentOf"],
  "engine/planner/retention.ts": ["preserveDemandPaths"],
});
const ISLANDS = [[1, 0, null], [2, 3, MIAMI_COASTAL], [5, 7, MIAMI_COASTAL], [1, 11, null], [2, 13, MIAMI_COASTAL], [5, 17, null], [3, 21, MIAMI_COASTAL], [2, 23, MIAMI_COASTAL]];
// 展示保路使用长度而不是边数，走完整规划图（允许穿过已保留的中间分量），不改变原边。
{
  const node = (id, x, z) => ({ id, x, z });
  const a = node("a", 0, 0); const b = node("b", 10, 0); const c = node("c", 20, 0); const d = node("d", 30, 0); const far = node("far", 0, 100); const e = node("e", 40, 0);
  const edge = (p, q) => ({ id: [p.id, q.id].sort().join("/"), from: p.id, to: q.id, width: 5, kind: "local", points: [p, q] });
  const roads = [edge(a, far), edge(far, d), edge(a, b), edge(b, c), edge(c, d), edge(d, e)];
  const selected = new Set([edge(b, c).id, edge(d, e).id]);
  const before = JSON.stringify(roads);
  const first = preserveDemandPaths(roads, selected, "a", ["d", "e", "missing"]);
  assert.deepEqual(first.restored, ["a/b", "c/d"]);
  assert.deepEqual(first.unresolved, ["missing"]);
  assert.equal(JSON.stringify(roads), before);
  assert.deepEqual([...selected].sort(), ["b/c", "d/e"]);
  const second = preserveDemandPaths([...roads].reverse(), selected, "a", ["missing", "e", "d"]);
  assert.deepEqual([...first.keep].sort(), [...second.keep].sort());
  assert.deepEqual(second.unresolved, first.unresolved);
  assert.ok(preserveDemandPaths(roads, selected, "absent", ["d"]).anchorMissing);
  assert.equal(preserveDemandPaths(roads, first.keep, "a", ["d", "e"]).restored.length, 0);
}
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
// 评审 P1-2 反例：车站旁只有孤立环路 → site-access 必须 unmet（曾误报满足）
{
  const node = (x, z, id) => ({ x, z, id: id ?? `${x}:${z}` });
  const road = (a, b) => ({ id: [a.id, b.id].sort().join("/"), from: a.id, to: b.id, width: 5, kind: "local", points: [a, b], bridge: false });
  const primaryA = node(0, 0, "p1"); const primaryB = node(100, 0, "p2"); const lonelyA = node(300, 200, "l1"); const lonelyB = node(320, 220, "l2");
  const fakePlan = {
    roadNodes: [primaryA, primaryB, lonelyA, lonelyB],
    roadEdges: [road(primaryA, primaryB), road(lonelyA, lonelyB)],
    publicSites: [{ id: "station-x", kind: "station", x: 310, z: 210, radius: 30 }],
    landmarks: [], blocks: [], terrain: { height: () => 5 },
    seaside: null, coast: [node(-500, -500), node(500, -500), node(500, 500)], river: null,
    core: node(50, 0), coastRoads: [[lonelyA, lonelyB]], riverRoadRuns: [],
  };
  const dd = diagnoseNetwork(fakePlan);
  const station = dd.demands.find((x) => x.demand.id === "site:station-x");
  assert.ok(station && !station.satisfied && /no road within|not on the primary network/.test(station.reason ?? ""), `isolated-road door must be unmet, got ${JSON.stringify(station)}`);
  const anchored = { ...fakePlan, primaryAnchorNodeId: "p1", core: lonelyA };
  assert.equal(diagnoseNetwork(anchored).primaryComponentId, componentOf(anchored).get("p1"), "nearer isolated road cannot replace the skeleton anchor");
  assert.equal(diagnoseNetwork({ ...anchored, primaryAnchorNodeId: "missing" }), null, "missing declared anchor fails explicitly");
  const nearBoth = { ...anchored, publicSites: [{ id: "station-x", kind: "station", x: 50, z: 10, radius: 30 }],
    roadNodes: [...fakePlan.roadNodes, node(40, 10, "s1"), node(60, 10, "s2")],
    roadEdges: [...fakePlan.roadEdges, road(node(40, 10, "s1"), node(60, 10, "s2"))] };
  for (const roadEdges of [nearBoth.roadEdges, [...nearBoth.roadEdges].reverse()]) {
    const d = diagnoseNetwork({ ...nearBoth, roadEdges });
    assert.ok(d.demands.find((x) => x.demand.id === "site:station-x").satisfied, "nearer isolated road must not hide a qualifying primary road");
  }
}

console.log(`City intent diagnostics: ${ISLANDS.length} islands — every degree-1 endpoint classified, every required demand verdicted, read-only and deterministic.`);
console.log(`  ${shadow.join(" | ")}`);
