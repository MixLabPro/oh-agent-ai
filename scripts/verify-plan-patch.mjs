#!/usr/bin/env node
// 规划修复补丁守卫（docs/CITY_PLAN_MANUAL_REPAIR_SPEC.md §10，M1 首批）：
//   (a) 确定性：同输入两次套用逐字段相等；补丁条目倒序构造结果不变（排序后处理）；
//   (b) 移楼叠套是 no-op（节点/删路不承诺叠套——补丁只套在底层布局上，见 planPatch.ts 契约）；
//   (c) 建筑移动：换 slot 重算地面高度；目标缺失/被占/被预留 → stale 如实上报，布局不动；
//   (d) 锁定口径：桥（bridge/deck/ground-approach）与滨海段（waterfront）的节点不可移、边不可删；
//   (e) 节点移动：按新坐标重挂节点 id、边引用与边 id；回车点跟随映射重筛（移动的尽端仍是尽端）；
//   (f) 删路段：孤立节点清掉、车流按新边对集过滤；缺失边 → stale；
//   (g) 编辑校验：occupied / missing / over-road / steep / not-buildable / highway / overlap 各一例，
//       桥面不算压路（与体检同一净空口径）；
//   (h) 体检：压路、楼楼占地相交、坡地、孤岛街区、patchStale 各命中且按 severity 排序，确定性输出；
//   (i) 节点撞车：拖到不动节点上 / 拖到相邻节点（零长边）/ 两条拖到同一点 → node-collision，无重复 id；
//   (j) 背景楼压制：部分生效时，其余不存在的 id 仍逐条上报；
//   (k) 套用与校验同一占用口径：目标地块有背景楼 → parcel-occupied（曾只看会话楼）；
//   (l) 存档宽容读取：null/错型字段不抛、单条坏条目丢弃、缺必填 → 整条丢弃；
//   (m) 编辑器写补丁走原始 id：再拖已拖过的节点、删已重挂的路段 → 记回原始 id；
//   (n) 跨档位：整份补丁 tier-changed，布局不动；
//   (o) 真实城市：空补丁不改布局；占地重叠不误报（曾 1600 楼 1111 条）；layoutCity pins 让移楼在落位阶段生效、
//       空置街区随之长出路、刷新后不被新会话挤掉；pins=null / 跨档 pins 时落位与无 pins 一致。
import assert from "node:assert/strict";
import { loadCity } from "./city-kit/index.mjs";

globalThis.window ??= globalThis;
const {
  applyPlanPatch, validateBuildingMove, emptyPlanPatch, hashPlanPatch, edgeLocked, coercePlanPatch, recordNodeMove, recordEdgeDrop, layoutPinsFor,
  auditLayout, buildCityModel, layoutCity, MIAMI_COASTAL,
} = await loadCity({
  "engine/planPatch.ts": ["applyPlanPatch", "validateBuildingMove", "emptyPlanPatch", "hashPlanPatch", "edgeLocked", "coercePlanPatch", "recordNodeMove", "recordEdgeDrop", "layoutPinsFor"],
  "engine/planAudit.ts": ["auditLayout"],
  "cityModel.ts": ["buildCityModel"],
  "engine/cityLayout.ts": ["layoutCity"],
  "engine/citySeaside.ts": ["MIAMI_COASTAL"],
});
const fresh = () => emptyPlanPatch(74031, 1);

// ── 合成城市 ──────────────────────────────────────────────────────────────────
// 岛半径 400（(500,500) 不可建）；坡地悬崖在 p2/p7；地面高度 x>50 处 +1（p3 高、p1 低，可断言换地重算）。
const height = (x, z) => (Math.hypot(x, z) < 400 ? 2 + (x > 50 ? 1 : 0) : -1);
const slope = (x, z) => (Math.hypot(x - 38, z - 60) < 10 || Math.hypot(x - 150, z - 150) < 10 ? 0.9 : 0.2);
const buildable = (x, z) => Math.hypot(x, z) < 380;
const terrain = { height, slope, buildable, center: { x: 0, z: 0 }, radius: 400, coastRadius: () => 400, hasRiver: false };
const parcel = (id, blockId, x, z, extra = {}) => ({ id, blockId, x, z, yaw: 0, zone: "residential", width: 8, depth: 8, ...extra });
const P1 = parcel("p1", "blkA", 30, 60);
const P2 = parcel("p2", "blkA", 38, 60);
const P3 = parcel("p3", "blkA", 54, 60);
const P4 = parcel("p4", "blkB", 300, 300);
const P5 = parcel("p5", "blkD", 50, -3);   // 压 e1（z=0 路面）
const P6 = parcel("p6", "blkE", 150, -3);  // 压 e2（桥面）
const P7 = parcel("p7", "blkF", 150, 150); // 坡地
const P8 = parcel("p8", "blkC", 500, 500); // 不可建
const P9 = parcel("p9", "blkG", 0, 20);    // 高架净空内
const edge = (id, from, to, width, points, extra = {}) => ({ id, from, to, width, kind: width >= 8 ? "arterial" : "local", points, ...extra });
const E1 = edge("0:0/100:0", "0:0", "100:0", 5, [{ x: 0, z: 0 }, { x: 100, z: 0 }]);
const E2 = edge("100:0/200:0", "100:0", "200:0", 12, [{ x: 100, z: 0 }, { x: 200, z: 0 }], { bridge: true, structure: "deck" });
const E3 = edge("0:0/0:100", "0:0", "0:100", 8, [{ x: 0, z: 0 }, { x: 0, z: 100 }], { purpose: "waterfront" });
const E4 = edge("100:0/100:100", "100:0", "100:100", 5, [{ x: 100, z: 0 }, { x: 100, z: 100 }]);

const model = {
  windowStartMs: 0, windowEndMs: 1, windowLabel: "t", generatedAt: 1,
  districts: [{ id: "d0", label: "D0", sessionCount: 4, tokensTotal: 0, activeCount: 0, anomaly: null }],
  buildings: [
    { id: "b1", districtId: "d0", footprint: 5, height: 20, archetype: "midrise" },
    { id: "b2", districtId: "d0", footprint: 10, height: 30, archetype: "tower" }, // 塔楼 10 宽（x∈[33,43]）→ 与 b1 占地相交
    { id: "b3", districtId: "d0", footprint: 5, height: 10, archetype: "block" },
    { id: "b4", districtId: "d0", footprint: 5, height: 10, archetype: "block" },
  ],
};

function makeLayout() {
  return {
    seed: 74031, scaleTier: 1, activityKey: "base",
    terrain,
    blocks: [
      { id: "blkA", districtId: "d0", x: 38, z: 60, width: 36, depth: 8, zone: "residential", parcels: [P1, P2, P3], polygon: [] },
      { id: "blkB", districtId: "d0", x: 300, z: 300, width: 8, depth: 8, zone: "residential", parcels: [P4], polygon: [] },
      { id: "blkC", districtId: "d0", x: 500, z: 500, width: 8, depth: 8, zone: "residential", parcels: [P8], polygon: [] },
      { id: "blkD", districtId: "d0", x: 50, z: -3, width: 8, depth: 8, zone: "residential", parcels: [P5], polygon: [] },
      { id: "blkE", districtId: "d0", x: 150, z: -3, width: 8, depth: 8, zone: "residential", parcels: [P6], polygon: [] },
      { id: "blkF", districtId: "d0", x: 150, z: 150, width: 8, depth: 8, zone: "residential", parcels: [P7], polygon: [] },
      { id: "blkG", districtId: "d0", x: 0, z: 20, width: 8, depth: 8, zone: "residential", parcels: [P9], polygon: [] },
    ],
    roadNodes: [
      { id: "0:0", x: 0, z: 0 }, { id: "100:0", x: 100, z: 0 }, { id: "200:0", x: 200, z: 0 },
      { id: "0:100", x: 0, z: 100 }, { id: "100:100", x: 100, z: 100 },
    ],
    roadEdges: [E1, E2, E3, E4],
    culDeSacEnds: [{ x: 100, z: 100 }],
    civics: [], gardens: [], districtLandmarks: [],
    contextBuildings: [{ id: "context:p6", x: 150, z: -3, y: 2, yaw: 0, width: 9, depth: 9, height: 10, seed: 0.5, zone: "residential", appearAt: 0 }],
    highways: [[{ x: -50, z: 20 }, { x: 250, z: 20 }]],
    districts: [{
      id: "d0", label: "D0", center: { x: 100, z: 100 }, radius: 300, terrain,
      slots: new Map([["b1", P1], ["b2", P2], ["b3", P4], ["b4", P5]]),
      grounds: new Map([["b1", 2], ["b2", 2], ["b3", 3], ["b4", 2]]),
      roads: [], carPaths: [[{ x: 0, z: 0 }, { x: 100, z: 0 }], [{ x: 100, z: 0 }, { x: 100, z: 100 }]],
      landValue: new Map([["b1", 0.5], ["b2", 0.5], ["b3", 0.2], ["b4", 0.5]]),
      river: null, riverHalfWidth: 18, trees: [], plaza: { x: 0, z: 0, y: 2 },
      anomaly: null, sessionCount: 4,
    }],
  };
}

/** 断言用快照：Map → 排序数组，只挑受补丁影响的字段。 */
const snap = (layout) => JSON.stringify({
  roadNodes: layout.roadNodes,
  roadEdges: layout.roadEdges,
  culDeSacEnds: layout.culDeSacEnds,
  contextIds: layout.contextBuildings.map((c) => c.id).sort(),
  activityKey: layout.activityKey,
  districts: layout.districts.map((d) => ({
    id: d.id,
    slots: [...d.slots].map(([b, p]) => [b, p.id]).sort(),
    grounds: [...d.grounds].sort(),
    carPaths: d.carPaths,
  })),
});

// (a) 确定性：同输入两次 → 相同；条目倒序构造 → 相同。
{
  const patch = fresh();
  patch.buildingMoves = { b1: "p3", b2: "p9" };
  patch.edgeDrops = ["100:0/100:100"];
  patch.nodeMoves = { "100:100": { x: 120, z: 120 } };
  const reversed = { ...patch, buildingMoves: { b2: "p9", b1: "p3" }, edgeDrops: [...patch.edgeDrops].reverse() };
  const one = applyPlanPatch(makeLayout(), patch);
  const two = applyPlanPatch(makeLayout(), patch);
  assert.equal(snap(one.layout), snap(two.layout), "same input must yield identical layouts");
  assert.equal(JSON.stringify(one.stale), JSON.stringify(two.stale));
  assert.equal(snap(applyPlanPatch(makeLayout(), reversed).layout), snap(one.layout), "entry insertion order must not matter");
}

// (b) 移楼叠套 → 不动。
{
  const patch = fresh();
  patch.buildingMoves = { b1: "p3" };
  const once = applyPlanPatch(makeLayout(), patch);
  const twice = applyPlanPatch(once.layout, patch);
  assert.equal(snap(twice.layout), snap(once.layout), "re-applying building moves must be a no-op");
  assert.equal(twice.stale.length, 0, "building-move replay must not report stale entries");
}

// (c) 建筑移动：slot 换、地面高度重算（p3 在 x=54 → 高度 3）；失效条目 stale 且布局不动。
{
  const patch = fresh();
  patch.buildingMoves = { b1: "p3", b2: "missing-parcel", b3: "p1", ghost: "p3" };
  const { layout, stale } = applyPlanPatch(makeLayout(), patch);
  const d0 = layout.districts[0];
  assert.equal(d0.slots.get("b1").id, "p3", "b1 must move to p3");
  assert.equal(d0.grounds.get("b1"), 3, "ground height must follow the new parcel terrain");
  assert.equal(d0.slots.get("b3").id, "p1", "a parcel vacated earlier in the same patch is claimable (b1 freed p1; sorted order b1 < b3)");
  assert.deepEqual(stale.map((s) => `${s.kind}:${s.reason}`).sort(), ["building-move:missing-parcel", "building-move:unknown-building"], "stale reasons must be exact");
}

// (d) 锁定口径：桥端点、滨海端点不可移；桥/滨海边不可删。
{
  assert.ok(edgeLocked(E2) && edgeLocked(E3), "bridge and waterfront edges are locked by construction");
  const patch = fresh();
  patch.nodeMoves = { "100:0": { x: 120, z: 0 }, "0:0": { x: 10, z: 10 } }; // 100:0 连桥、0:0 连滨海
  patch.edgeDrops = ["100:0/200:0", "0:0/0:100"];
  const { layout, stale } = applyPlanPatch(makeLayout(), patch);
  assert.equal(stale.length, 4, "every locked node move and edge drop must be reported");
  assert.ok(stale.every((s) => s.reason === "locked-edge"));
  const base = makeLayout();
  assert.deepEqual(layout.roadNodes, base.roadNodes, "locked node moves must not mutate nodes");
  assert.deepEqual(layout.roadEdges, base.roadEdges, "locked edge drops must not mutate edges");
}

// (e) 节点移动：尽端节点 (100,100) → (120,120)，id/边引用/边 id/回车点全部跟随；id 映射回原始。
{
  const patch = fresh();
  patch.nodeMoves = { "100:100": { x: 120, z: 120 } };
  const { layout, stale, ids } = applyPlanPatch(makeLayout(), patch);
  assert.equal(stale.length, 0);
  const node = layout.roadNodes.find((n) => n.id === "120:120");
  assert.ok(node && node.x === 120 && node.z === 120, "node must be re-keyed to its new coordinates");
  assert.ok(!layout.roadNodes.some((n) => n.id === "100:100"), "old node id must be gone");
  const e4 = layout.roadEdges.find((e) => e.from === "120:120" || e.to === "120:120");
  assert.equal(e4.id, "100:0/120:120", "edge id must be re-derived from the new node ids");
  assert.deepEqual(e4.points, [{ x: 100, z: 0 }, { x: 120, z: 120 }], "edge endpoints must follow the moved node");
  assert.deepEqual(layout.culDeSacEnds, [{ x: 120, z: 120 }], "the moved dead-end must remain a cul-de-sac at its new position");
  assert.equal(ids.nodes.get("120:120"), "100:100", "effective node id maps back to the original");
  assert.equal(ids.edges.get("100:0/120:120"), "100:0/100:100", "effective edge id maps back to the original");
}

// (f) 删路段：车流过滤、孤立节点清除、缺失边 stale、锁定边 stale。
{
  const patch = fresh();
  patch.edgeDrops = ["100:0/100:100", "100:0/200:0", "nope"];
  const { layout, stale } = applyPlanPatch(makeLayout(), patch);
  assert.ok(!layout.roadEdges.some((e) => e.id === "100:0/100:100"), "the dropped local edge must be gone");
  assert.ok(!layout.roadNodes.some((n) => n.id === "100:100"), "the orphaned dead-end node must be pruned");
  assert.deepEqual(layout.culDeSacEnds, [], "the cul-de-sac of a dropped road must vanish");
  assert.equal(layout.districts[0].carPaths.length, 1, "car paths along dropped edges must be filtered");
  assert.deepEqual(stale.map((s) => s.reason).sort(), ["locked-edge", "missing-edge"]);
}

// (g) 编辑校验：blockers 硬阻止。
{
  const empty = fresh();
  const layout = makeLayout();
  assert.deepEqual(validateBuildingMove(layout, model, empty, "b1", "p3").blockers, [], "a free, clear parcel must pass");
  assert.ok(validateBuildingMove(layout, model, empty, "b1", "p2").blockers.includes("parcel-occupied"), "occupied target must block");
  assert.ok(validateBuildingMove(layout, model, empty, "b1", "ghost").blockers.includes("missing-parcel"), "missing target must block");
  assert.ok(validateBuildingMove(layout, model, empty, "b1", "p6").blockers.includes("parcel-occupied"), "context buildings reserve their parcels");
  assert.ok(!validateBuildingMove(layout, model, empty, "b1", "p6").blockers.includes("building-over-road"), "bridge decks are not ground roads — validate shares the audit's clearance rule");
  const withSuppression = fresh();
  withSuppression.suppressedContext = ["context:p6"];
  assert.ok(!validateBuildingMove(layout, model, withSuppression, "b1", "p6").blockers.includes("parcel-occupied"), "suppression lifts the reservation");
  assert.ok(validateBuildingMove(layout, model, empty, "b1", "p7").blockers.includes("steep-slope"), "steep terrain must block");
  assert.ok(validateBuildingMove(layout, model, empty, "b1", "p8").blockers.includes("not-buildable"), "unbuildable terrain must block");
  assert.ok(validateBuildingMove(layout, model, empty, "b1", "p9").blockers.includes("highway-clearance"), "highway clearance must block");
  assert.ok(validateBuildingMove(layout, model, empty, "b1", "p5").blockers.includes("parcel-occupied"), "b4 occupies p5");
  assert.ok(validateBuildingMove(layout, model, empty, "b4", "p5").blockers.includes("building-over-road"), "a lot on a ground road must block");
  assert.deepEqual(validateBuildingMove(layout, model, empty, "ghost", "p3").blockers, ["unknown-building"]);
  // 占地重叠（SPEC §7.3 硬阻止，曾缺）：贴着塔楼 b2 的地块不行。
  layout.blocks[0].parcels.push({ ...P3, id: "p3b", x: 46, z: 60 });
  assert.ok(validateBuildingMove(layout, model, empty, "b3", "p3b").blockers.includes("building-overlap"), "overlap with another session building must block");
  assert.ok(!validateBuildingMove(layout, model, empty, "b3", "p3").blockers.includes("building-overlap"), "a clear parcel must not report overlap");
}

// (h) 体检：布局层规则命中、排序确定。
{
  const layout = makeLayout();
  const issues = auditLayout(layout, model, [{ kind: "building-move", id: "b1", reason: "missing-parcel", detail: "x" }]);
  const rules = issues.map((issue) => issue.id);
  assert.ok(rules.includes("buildingOverRoad:b4"), `b4 sits on road e1 — got ${rules.join(",")}`);
  assert.ok(rules.includes("buildingOverlap:b1/b2"), "b1 (lot) and b2 (10-wide tower) footprints must intersect");
  assert.ok(rules.includes("buildingOnSlope:steep:b2"), "b2 sits on the cliff");
  assert.ok(rules.includes("orphanedBlock:blkB"), "blkB has a building but no road nearby");
  assert.ok(rules.includes("patchStale:building-move:b1"), "stale entries must surface as info issues");
  assert.equal(issues.find((issue) => issue.rule === "patchStale").at, null, "stale entries have no location — null, never NaN");
  const again = auditLayout(layout, model, [{ kind: "building-move", id: "b1", reason: "missing-parcel", detail: "x" }]);
  assert.equal(JSON.stringify(again), JSON.stringify(issues), "audit must be deterministic");
  const order = issues.map((issue) => ({ error: 0, warning: 1, info: 2 })[issue.severity]);
  assert.deepEqual(order, [...order].sort((a, b) => a - b), "issues must be severity-sorted");
  // 修复闭环：把 b4 挪到 p3 后压路问题消失（体检与补丁同一语言）。
  const patch = fresh();
  patch.buildingMoves = { b4: "p3" };
  const fixed = auditLayout(applyPlanPatch(layout, patch).layout, model);
  assert.ok(!fixed.some((issue) => issue.rule === "buildingOverRoad"), "moving b4 off the road must clear the issue");
  // 指纹稳定性：同补丁同指纹；不同补丁不同指纹。
  const other = fresh();
  other.buildingMoves = { b1: "p3" };
  assert.equal(hashPlanPatch(patch), hashPlanPatch({ ...patch, buildingMoves: { b4: "p3" } }));
  assert.notEqual(hashPlanPatch(patch), hashPlanPatch(other));
}

// (i) 节点撞车：重复 id / 零长边曾一路流进渲染。
{
  const uniqueAndNonDegenerate = (layout) => {
    const nodeIds = layout.roadNodes.map((n) => n.id); assert.equal(new Set(nodeIds).size, nodeIds.length, "node ids stay unique");
    const edgeIds = layout.roadEdges.map((e) => e.id); assert.equal(new Set(edgeIds).size, edgeIds.length, "edge ids stay unique");
    assert.ok(layout.roadEdges.every((e) => e.from !== e.to), "no zero-length edge");
  };
  for (const to of [{ x: 0, z: 100 }, { x: 100, z: 0 }]) { // 拖到不动的 0:100 上 / 拖到相邻节点 → 零长边
    const patch = fresh(); patch.nodeMoves = { "100:100": to };
    const { layout, stale } = applyPlanPatch(makeLayout(), patch);
    assert.deepEqual(stale.map((s) => s.reason), ["node-collision"], "a move onto an existing node must be rejected");
    assert.ok(layout.roadNodes.some((n) => n.id === "100:100"), "the rejected node stays put");
    uniqueAndNonDegenerate(layout);
  }
  const free = () => {
    const layout = makeLayout();
    layout.roadNodes.push({ id: "300:0", x: 300, z: 0 }, { id: "300:50", x: 300, z: 50 });
    layout.roadEdges.push(edge("300:0/300:50", "300:0", "300:50", 5, [{ x: 300, z: 0 }, { x: 300, z: 50 }]), edge("100:100/300:0", "100:100", "300:0", 5, [{ x: 100, z: 100 }, { x: 300, z: 0 }]));
    return layout;
  };
  // 两个自由节点去同一点：两条都拒（谁也不比谁优先，确定性）。
  const both = fresh(); both.nodeMoves = { "300:0": { x: 200, z: 200 }, "300:50": { x: 200, z: 200 } };
  const collided = applyPlanPatch(free(), both);
  assert.deepEqual(collided.stale.map((s) => `${s.id}:${s.reason}`), ["300:0:node-collision", "300:50:node-collision"]);
  uniqueAndNonDegenerate(collided.layout);
  // 让位（A 去 B 的旧位、B 去别处）是单射，合法。
  const swap = fresh(); swap.nodeMoves = { "300:50": { x: 320, z: 80 }, "300:0": { x: 300, z: 50 } };
  const swapped = applyPlanPatch(free(), swap);
  assert.equal(swapped.stale.length, 0, "moving into a spot another move vacates is legal");
  assert.ok(swapped.layout.roadEdges.some((e) => e.id === "300:50/320:80"));
  uniqueAndNonDegenerate(swapped.layout);
  // 连锁：B 被拒留在原地 → 要去 B 旧位的 A 也得拒（迭代到稳定）。
  const chain = fresh(); chain.nodeMoves = { "300:0": { x: 300, z: 50 }, "300:50": { x: 100, z: 100 } };
  assert.deepEqual(applyPlanPatch(free(), chain).stale.map((s) => s.id).sort(), ["300:0", "300:50"], "a rejection that pins a node must cascade");
}

// (j) 背景楼压制：曾以「总数没变」判失效，一条生效就吞掉其余不存在的 id。
{
  const patch = fresh(); patch.suppressedContext = ["context:p6", "context:ghost"];
  const { layout, stale } = applyPlanPatch(makeLayout(), patch);
  assert.equal(layout.contextBuildings.length, 0, "the existing context building is suppressed");
  assert.deepEqual(stale.map((s) => `${s.id}:${s.reason}`), ["context:ghost:missing-context"], "the missing id must still be reported");
}

// (k) 套用与校验同一占用口径：目标地块上有背景楼（未压制）→ parcel-occupied。
{
  const patch = fresh(); patch.buildingMoves = { b1: "p6" };
  const { layout, stale } = applyPlanPatch(makeLayout(), patch);
  assert.deepEqual(stale.map((s) => s.reason), ["parcel-occupied"], "apply must honour context-building reservations");
  assert.equal(layout.districts[0].slots.get("b1").id, "p1");
  const lifted = { ...patch, suppressedContext: ["context:p6"] };
  assert.equal(applyPlanPatch(makeLayout(), lifted).layout.districts[0].slots.get("b1").id, "p6", "suppression frees the parcel");
}

// (l) 存档宽容读取：曾 `{...c, 默认, ...c}`，`edgeDrops: null` 直接让套用抛异常。
{
  const coerced = coercePlanPatch({ version: 1, seed: 74031, scaleTier: 1, nodeMoves: { a: { x: 1, z: 2 }, bad: { x: "1" } }, edgeDrops: null, buildingMoves: { b1: "p3", b2: 9 }, suppressedContext: ["context:x", 3] });
  assert.deepEqual(coerced, { version: 1, seed: 74031, scaleTier: 1, updatedAt: 0, nodeMoves: { a: { x: 1, z: 2 } }, edgeDrops: [], buildingMoves: { b1: "p3" }, suppressedContext: ["context:x"] });
  assert.doesNotThrow(() => applyPlanPatch(makeLayout(), coerced));
  assert.equal(coercePlanPatch({ version: 1, seed: 7 }), null, "missing scaleTier drops the whole patch");
  assert.equal(coercePlanPatch(null), null);
  assert.equal(coercePlanPatch({ version: 2, seed: 7, scaleTier: 1 }), null);
}

// (m) 编辑器写补丁走原始 id：effective 布局里拾取的是重挂后的 id。
{
  const base = makeLayout();
  let patch = fresh(); patch.nodeMoves = { "100:100": { x: 120, z: 120 } };
  let patched = applyPlanPatch(base, patch);
  patch = recordNodeMove(patch, patched, "120:120", { x: 130, z: 140 }, 1); // 再拖同一节点（effective id）
  assert.deepEqual(Object.keys(patch.nodeMoves), ["100:100"], "re-dragging a moved node overwrites its original entry");
  patched = applyPlanPatch(base, patch);
  assert.equal(patched.stale.length, 0);
  assert.ok(patched.layout.roadNodes.some((n) => n.id === "130:140"));
  patch = recordEdgeDrop(patch, patched, "100:0/130:140", 2); // 删一条已重挂的路段
  assert.deepEqual(patch.edgeDrops, ["100:0/100:100"], "dropping a re-keyed edge records its original id");
  const final = applyPlanPatch(base, patch);
  assert.ok(!final.layout.roadEdges.some((e) => e.id === "100:0/100:100" || e.id === "100:0/130:140"), "the edge is gone");
  assert.deepEqual(final.stale.map((s) => s.reason), ["missing-node"], "the dragged node lost its only edge — its move goes stale, honestly");
}

// (n) 跨档位：整份补丁失效，布局原样返回。
{
  const patch = emptyPlanPatch(74031, 2); patch.buildingMoves = { b1: "p3" }; patch.edgeDrops = ["100:0/100:100"];
  const base = makeLayout();
  const { layout, stale } = applyPlanPatch(base, patch);
  assert.equal(layout, base, "a cross-tier patch must not touch the layout");
  assert.deepEqual(stale.map((s) => `${s.kind}:${s.reason}`), ["building-move:tier-changed", "edge-drop:tier-changed"]);
}

// (o) 真实城市（同 verify-city-culdesac-bulbs 的固定伪随机数据）。
{
  const HARNESSES = ["codex", "claude-code", "dsh", "harness:zcode"];
  const GENERATED_AT = Date.UTC(2026, 9, 7, 12, 0, 0);
  const rows = (count, offset = 0) => {
    let s = 12345 + offset;
    const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
    return Array.from({ length: count }, (_, i) => {
      const total = Math.round(2000 + rnd() ** 3 * 4_000_000);
      const start = GENERATED_AT - Math.round(rnd() * 28 * 86_400_000);
      const end = start + Math.round(rnd() * 3_600_000);
      return {
        session_ref: `session:${i + offset}`, harness: HARNESSES[i % HARNESSES.length],
        first_event_at: new Date(start).toISOString(), last_event_at: new Date(end).toISOString(),
        event_count: 10, model_ids: ["claude-sonnet-5"],
        tokens: { uncached_input_tokens: Math.round(total * 0.2), cache_read_tokens: Math.round(total * 0.5), cache_write_tokens: Math.round(total * 0.1), output_tokens: Math.round(total * 0.2), total },
        peak_tokens: Math.round(total * 0.3),
        cost_minor: { amount_minor: Math.round(total / 1000), currency: "USD", basis: "api_equivalent" },
        cost_status: { state: "estimated", reason: "", has_unresolved: false },
      };
    });
  };
  const modelOf = (list) => buildCityModel({ rows: list, findings: [], windowStartMs: GENERATED_AT - 30 * 86_400_000, windowEndMs: GENERATED_AT, windowLabel: "30d", totalSessions: list.length, truncated: false, generatedAt: GENERATED_AT });
  const slotsOf = (layout) => JSON.stringify(layout.districts.map((d) => [...d.slots].map(([b, p]) => [b, p.id]).sort()));
  const slotOf = (layout, id) => layout.districts.flatMap((d) => [...d.slots]).find(([b]) => b === id)?.[1];

  for (const count of [380, 1600]) {
    const real = modelOf(rows(count));
    const base = layoutCity(real, null, undefined, MIAMI_COASTAL);
    // 空补丁不改布局（只追加指纹）；pins=null 与不传逐字节一致。
    const blank = applyPlanPatch(base, emptyPlanPatch(base.seed, base.scaleTier));
    assert.equal(slotsOf(blank.layout), slotsOf(base));
    assert.equal(JSON.stringify(blank.layout.roadEdges), JSON.stringify(base.roadEdges));
    assert.equal(JSON.stringify(blank.layout.districts.map((d) => d.carPaths)), JSON.stringify(base.districts.map((d) => d.carPaths)));
    assert.deepEqual(blank.layout.culDeSacEnds, base.culDeSacEnds);
    assert.equal(slotsOf(layoutCity(real, null, undefined, MIAMI_COASTAL, "auto", null)), slotsOf(base), "pins=null must not change placement");
    // 占地重叠不误报：曾借保守碰撞包络，380 楼报 253 条、1600 楼报 1111 条 error。
    const overlaps = auditLayout(base, real).filter((issue) => issue.rule === "buildingOverlap");
    assert.ok(overlaps.length <= count * 0.01, `buildingOverlap must not flood a generated city — ${overlaps.length} for ${count}`);
    console.log(`  ${count} 楼：buildingOverlap ${overlaps.length} 条（旧保守包络口径 ${count === 380 ? 253 : 1111} 条）`);
  }

  // pins：把一栋楼搬进一个空置街区——落位阶段生效、街区长出路、刷新/新会话不挤掉。
  const real = modelOf(rows(380));
  const base = layoutCity(real, null, undefined, MIAMI_COASTAL);
  const builtBlocks = new Set(base.districts.flatMap((d) => [...d.slots.values()].map((p) => p.blockId)));
  const mover = [...base.districts[0].slots.keys()].sort()[0];
  let target = null;
  for (const block of base.blocks) {
    if (builtBlocks.has(block.id) || block.parcels.length === 0) continue;
    const parcel = block.parcels.find((candidate) => validateBuildingMove(base, real, emptyPlanPatch(base.seed, base.scaleTier), mover, candidate.id).blockers.length === 0);
    if (parcel) { target = { block, parcel }; break; }
  }
  assert.ok(target, "the generated city must have at least one empty block with a valid parcel");
  const patch = emptyPlanPatch(base.seed, base.scaleTier); patch.buildingMoves = { [mover]: target.parcel.id };
  // 只做后处理（旧行为）：楼搬过去了，但新家街区的支路早被生长剪枝剪掉。
  const postOnly = applyPlanPatch(base, patch);
  assert.equal(slotOf(postOnly.layout, mover).id, target.parcel.id);
  const orphaned = (layout) => auditLayout(layout, real).some((issue) => issue.id === `orphanedBlock:${target.block.id}`);
  const pinned = layoutCity(real, null, undefined, MIAMI_COASTAL, "auto", layoutPinsFor(patch));
  assert.equal(slotOf(pinned, mover).id, target.parcel.id, "pins must place the building at its target during layout");
  const applied = applyPlanPatch(pinned, patch);
  assert.equal(applied.stale.length, 0, "apply after a pinned layout is a no-op for the move");
  // 判别断言是路段数：orphanedBlock 的 40 阈值在这个样本上两边都不报（剪掉的是街区自己的支路，干道仍在 40 内），
  // 真正的差别是生长剪枝因为街区「有楼」而保留了服务它的支路。
  const grewRoads = pinned.roadEdges.length - base.roadEdges.length;
  assert.ok(grewRoads > 0, "pinning a building into an empty block must keep that block's roads from being pruned");
  assert.equal(postOnly.layout.roadEdges.length, base.roadEdges.length, "post-processing alone cannot regrow pruned roads (the defect pins fix)");
  assert.ok(!orphaned(applied.layout), "the formerly empty block must be served by a road");
  console.log(`  pins: ${mover} → ${target.parcel.id}；生长剪枝多保留 ${grewRoads} 条路段（post-only 孤立街区=${orphaned(postOnly.layout)}，pins=${orphaned(applied.layout)}）`);
  // 刷新 + 新会话：pins 先落位，目标地块不会被新会话抢走。
  const grown = modelOf([...rows(380), ...rows(12, 10_000)]);
  const refreshed = layoutCity(grown, pinned, base.seed, MIAMI_COASTAL, "auto", layoutPinsFor(patch));
  assert.equal(slotOf(refreshed, mover).id, target.parcel.id, "a refresh must keep the pinned building on its target");
  assert.equal(applyPlanPatch(refreshed, patch).stale.length, 0, "the patch stays live after a refresh");
  // 钉子跨档不认。
  const otherTier = layoutCity(real, null, undefined, MIAMI_COASTAL, "auto", { scaleTier: base.scaleTier + 1, parcels: layoutPinsFor(patch).parcels });
  assert.equal(slotsOf(otherTier), slotsOf(base), "pins written for another tier are ignored by layoutCity");
}

console.log("City plan patch: deterministic and order-independent, building-move replay is a no-op, stale entries degrade honestly (missing/locked/occupied/collision/tier/context), node moves re-key ids/edges/cul-de-sacs and map back to originals, edge drops prune nodes and filter car paths, building-move blockers (occupied/missing/road/slope/buildable/highway/overlap) hold, storage coercion never throws, layout audit is severity-sorted and quiet on generated cities, layout pins place moved buildings before road pruning and survive refresh.");
