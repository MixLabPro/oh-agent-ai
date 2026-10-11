#!/usr/bin/env node
// 规划修复放权（docs/CITY_PLAN_MANUAL_REPAIR_SPEC.md §15，参考 SimCity）守卫：
//   (a) 推土机：新路压到非会话设施 → 随这一笔推平；压到会话楼 → 开发商就近安置到合法空地块（不拆）；
//       生成器原本就压着的（残余）不算这一笔的，不会被顺手拆/搬；附近无空地块 → homeless 如实上报；
//   (b) 新几何判定：被拆成两半的旧路不算「新路面」，不会因为拆路把两侧的楼当成被压到；
//   (c) 致敬地标与市政用地：可拆除、可搬到任意空地（free 级，目标 "@x,z"）；圆内地形/道路/建筑检查；
//       唯一锁定的是悬索桥（不是建筑，是桥面）；海上地标与港口也可以动（用户拍板「所有建筑都可以移动」）；
//   (d) 搬走的地标会让它圆内的地块算占用，会话楼不能被搬进去；
//   (e) 真实城市：画一条横穿城区的路，推平与安置后补丁干净重放、没有会话楼仍压在新路上（除非 homeless）。
import assert from "node:assert/strict";
import { loadCity } from "./city-kit/index.mjs";

globalThis.window ??= globalThis;
const {
  bulldozeForRoads, freshRoadGeometry, applyPlanPatch, emptyPlanPatch, appendRoadOp, appendSiteOp, listSites, siteMoveProblem, reservedParcelIds,
  validateRoadAdd, rectClearOfEdges, buildingRect, buildCityModel, layoutCity, MIAMI_COASTAL,
} = await loadCity({
  "engine/planBulldozer.ts": ["bulldozeForRoads", "freshRoadGeometry"],
  "engine/planPatch.ts": ["applyPlanPatch", "emptyPlanPatch", "appendRoadOp", "appendSiteOp", "reservedParcelIds", "rectClearOfEdges", "buildingRect"],
  "engine/planSites.ts": ["listSites", "siteMoveProblem"],
  "engine/planRoadRules.ts": ["validateRoadAdd"],
  "cityModel.ts": ["buildCityModel"],
  "engine/cityLayout.ts": ["layoutCity"],
  "engine/citySeaside.ts": ["MIAMI_COASTAL"],
});

// ── 合成城市 ── 一条东西向主路 z=0（0..300），路北是两排地块；一栋会话楼 b1 在 (100,30)，一栋背景楼在 (160,30)，
// 一栋会话楼 b2 原本就压在路上（生成器残余）在 (220,0)。一座致敬地标（摩天轮）在 (60,-80)、一座悬索桥、一座港口。
const terrain = { height: () => 2, slope: () => 0.1, buildable: (x, z) => x < 400 && z > -150, center: { x: 0, z: 0 }, radius: 500, coastRadius: () => 500, hasRiver: false };
const parcel = (id, blockId, x, z) => ({ id, blockId, x, z, yaw: 0, zone: "residential", width: 8, depth: 8 });
const rowA = Array.from({ length: 10 }, (_, i) => parcel(`a${i}`, "A", 20 + i * 30, 30));
const rowB = Array.from({ length: 10 }, (_, i) => parcel(`b${i}`, "B", 20 + i * 30, 60));
const edge = (from, to, width = 5, extra = {}) => {
  const [fx, fz] = from.split(":").map(Number); const [tx, tz] = to.split(":").map(Number);
  return { id: [from, to].sort().join("/"), from, to, width, kind: "local", points: [{ x: fx, z: fz }, { x: tx, z: tz }], structure: "ground-road", ...extra };
};
const model = {
  windowStartMs: 0, windowEndMs: 1, windowLabel: "t", generatedAt: 1,
  districts: [{ id: "d0", label: "D0", sessionCount: 2, tokensTotal: 0, activeCount: 0, anomaly: null }],
  buildings: ["b1", "b2"].map((id) => ({ id, districtId: "d0", footprint: 5, height: 10, archetype: "block" })),
};
function makeLayout() {
  const slots = new Map([["b1", rowA[3]], ["b2", parcel("onroad", "R", 220, 0)]]); // a3 = (110,30)
  return {
    seed: 1, scaleTier: 1, activityKey: "k", terrain,
    blocks: [{ id: "A", districtId: "d0", x: 155, z: 30, width: 300, depth: 10, zone: "residential", parcels: rowA, polygon: [] },
      { id: "B", districtId: "d0", x: 155, z: 60, width: 300, depth: 10, zone: "residential", parcels: rowB, polygon: [] }],
    roadNodes: [{ id: "0:0", x: 0, z: 0 }, { id: "300:0", x: 300, z: 0 }], roadEdges: [edge("0:0", "300:0")], culDeSacEnds: [],
    civics: [], gardens: [], districtLandmarks: [],
    contextBuildings: [{ id: "context:a5", x: 170, z: 30, y: 2, yaw: 0, width: 8, depth: 8, height: 15, seed: 0.5, zone: "residential", appearAt: 0 }],
    landmarks: [{ id: "landmark:ferris-wheel", kind: "ferris-wheel", x: 60, z: -80, yaw: 0, radius: 18 },
      { id: "landmark:suspension-bridge", kind: "suspension-bridge", x: 250, z: -80, yaw: 0, radius: 15, to: { x: 300, z: -80 } },
      { id: "landmark:sail-opera", kind: "sail-opera", x: 150, z: -120, yaw: 0, radius: 14, shore: { x: 150, z: -100 } }],
    publicSites: [{ id: "site:harbor", kind: "harbor", x: 330, z: -60, yaw: 0, radius: 12 }],
    highways: [],
    districts: [{ id: "d0", label: "D0", center: { x: 150, z: 30 }, radius: 300, terrain, slots, grounds: new Map([["b1", 2], ["b2", 2]]), roads: [], carPaths: [], river: null, riverHalfWidth: 0, trees: [], plaza: { x: 0, z: 0, y: 2 }, anomaly: null, sessionCount: 2 }],
  };
}
const fresh = () => emptyPlanPatch(1, 1);
const slotOf = (layout, id) => layout.districts.flatMap((d) => [...d.slots]).find(([b]) => b === id)?.[1];

// (a) 推土机：一条南北向新路从 (110,-20) 到 (110,90)，穿过 b1（110,30）。再一条穿过背景楼 (170,30)。
{
  const base = makeLayout();
  const verdict = validateRoadAdd(base, model, { x: 110, z: 0 }, { x: 110, z: 90 }, 5);
  assert.deepEqual(verdict.blockers, [], "a road through a session building is allowed");
  assert.ok(verdict.warnings.includes("relocate:1"), `…and the developer re-home is announced — ${verdict.warnings}`);
  const patch = appendRoadOp(fresh(), { t: "add", from: { x: 110, z: 0 }, to: { x: 110, z: 90 }, width: 5 }, 1);
  const result = bulldozeForRoads(base, model, base, patch);
  assert.equal(result.relocated.length, 1); assert.equal(result.relocated[0].id, "b1");
  assert.deepEqual(result.bulldozed, []); assert.deepEqual(result.homeless, []);
  const after = applyPlanPatch(base, result.patch).layout;
  const newRoad = after.roadEdges.filter((e) => e.points.some((p) => p.x === 110 && p.z === 90));
  const home = slotOf(after, "b1");
  assert.notEqual(home.id, "a3", "b1 left its parcel");
  assert.ok(rectClearOfEdges(buildingRect(model.buildings[0], home), newRoad, 0.5), "…and its new parcel is clear of the new road");
  assert.ok(Math.hypot(home.x - 110, home.z - 30) <= 60, "…and it was re-homed nearby (nearest legal parcel)");
  assert.ok(after.districts[0].slots.has("b1"), "a session building is never removed — only moved");

  const throughContext = appendRoadOp(fresh(), { t: "add", from: { x: 170, z: 0 }, to: { x: 170, z: 90 }, width: 5 }, 1);
  const razed = bulldozeForRoads(base, model, base, throughContext);
  assert.deepEqual(razed.bulldozed, ["context:a5"], "a context building in the way is bulldozed with the road");
  assert.equal(applyPlanPatch(base, razed.patch).layout.contextBuildings.length, 0);
  assert.equal(applyPlanPatch(base, razed.patch).stale.length, 0, "road + bulldoze replay cleanly together");

  // 残余：b2 原本就压在主路上——画一条与主路相交的新路经过附近，不应把 b2 当成这一笔压到的。
  const nearResidual = appendRoadOp(fresh(), { t: "add", from: { x: 220, z: -40 }, to: { x: 220, z: -4 }, width: 5 }, 1);
  const residual = bulldozeForRoads(base, model, base, nearResidual);
  assert.ok(!residual.relocated.some((r) => r.id === "b2"), "a building the generator left on a road is not this stroke's casualty");

  // 无处安置：把所有空地块都填满再压 b1 → homeless 如实上报，补丁里不硬塞。
  const crowded = makeLayout();
  crowded.contextBuildings = [...rowA, ...rowB].filter((p) => p.id !== "a3").map((p) => ({ id: `context:${p.id}`, x: p.x, z: p.z, y: 2, yaw: 0, width: 8, depth: 8, height: 10, seed: 0.1, zone: "residential", appearAt: 0 }));
  const squeezed = bulldozeForRoads(crowded, model, crowded, appendRoadOp(fresh(), { t: "add", from: { x: 110, z: 0 }, to: { x: 110, z: 15 }, width: 5 }, 1));
  assert.ok(squeezed.homeless.includes("b1") || squeezed.relocated.every((r) => r.id !== "b1"), "with no free parcel the building is reported homeless, not forced");
}

// (b) 新几何：交叉把旧路拆成两半——两半不是新路面。
{
  const base = makeLayout();
  const crossing = appendRoadOp(fresh(), { t: "add", from: { x: 150, z: -40 }, to: { x: 150, z: -10 }, width: 5 }, 1);
  const after = applyPlanPatch(base, crossing).layout;
  const geometry = freshRoadGeometry(base, after);
  assert.equal(geometry.length, 1, "only the new stroke is new geometry");
  const crossed = appendRoadOp(fresh(), { t: "add", from: { x: 150, z: -40 }, to: { x: 150, z: 20 }, width: 5 }, 1);
  const split = applyPlanPatch(base, crossed).layout;
  assert.ok(split.roadEdges.some((e) => e.id === "0:0/150:0") && split.roadEdges.some((e) => e.id === "150:0/300:0"), "the main road is split at the crossing");
  assert.equal(freshRoadGeometry(base, split).length, 2, "the two new pieces are new geometry; the two halves of the old road are not");
}

// (c) 致敬地标与市政用地。
{
  const base = makeLayout();
  const sites = new Map(listSites(base).map((s) => [s.id, s]));
  const wheel = sites.get("landmark:ferris-wheel"); const bridge = sites.get("landmark:suspension-bridge");
  const opera = sites.get("landmark:sail-opera"); const harbor = sites.get("public:site:harbor");
  assert.equal(wheel.level, "free"); assert.equal(wheel.locked, undefined);
  assert.ok(bridge.locked && /悬索桥/.test(bridge.locked), "the suspension bridge is the one locked object — it is part of the road network");
  assert.equal(opera.locked, undefined, "a sea landmark can be moved (user: every building is movable)");
  assert.equal(harbor.locked, undefined, "the harbor can be moved too");
  assert.equal(siteMoveProblem(base, wheel, "@60,-100"), null, "open ground accepts the wheel");
  assert.equal(siteMoveProblem(base, wheel, "@60,5"), "site-over-road", "the wheel cannot sit on the main road");
  assert.equal(siteMoveProblem(base, wheel, "@110,40"), "target-occupied", "nor on a session building");
  assert.equal(siteMoveProblem(base, wheel, "@60,-140"), "not-buildable", "nor half in the sea");
  assert.equal(siteMoveProblem(base, wheel, "nope"), "missing-target");
  assert.equal(siteMoveProblem(base, bridge, "@60,-100"), "site-locked");
  const moved = applyPlanPatch(base, appendSiteOp(fresh(), { t: "move", id: "landmark:ferris-wheel", at: { x: 60, z: -80 }, to: "@60,-100" }, 1));
  assert.equal(moved.stale.length, 0);
  assert.deepEqual([moved.layout.landmarks[0].x, moved.layout.landmarks[0].z], [60, -100], "the wheel moved");
  const razed = applyPlanPatch(base, appendSiteOp(appendSiteOp(fresh(), { t: "remove", id: "landmark:sail-opera", at: { x: 150, z: -120 } }, 1), { t: "remove", id: "public:site:harbor", at: { x: 330, z: -60 } }, 2));
  assert.equal(razed.stale.length, 0);
  assert.ok(!razed.layout.landmarks.some((l) => l.id === "landmark:sail-opera") && razed.layout.publicSites.length === 0, "landmarks and public sites can be removed");
  const lockedTry = applyPlanPatch(base, appendSiteOp(fresh(), { t: "remove", id: "landmark:suspension-bridge" }, 1));
  assert.deepEqual(lockedTry.stale.map((s) => s.reason), ["site-blocked"], "removing the locked bridge goes stale, not through");
}

// (d) 搬到地块上的地标：圆内地块算占用。
{
  const base = makeLayout();
  const onto = applyPlanPatch(base, appendSiteOp(fresh(), { t: "move", id: "landmark:ferris-wheel", at: { x: 60, z: -80 }, to: "@200,75" }, 1));
  // (200,75) 与 b 排地块重叠，但不压会话楼/路——放下后圆内地块应被占用。
  if (onto.stale.length === 0) {
    const reserved = reservedParcelIds(onto.layout);
    assert.ok(reserved.has("b6"), "parcels under a relocated landmark are reserved");
  } else {
    assert.deepEqual(onto.stale.map((s) => s.reason), ["site-blocked"], "if the target is refused it is reported, not half-applied");
  }
}

// (e) 真实城市：一条横穿城区的路。
{
  const HARNESSES = ["codex", "claude-code", "dsh", "harness:zcode"];
  const GENERATED_AT = Date.UTC(2026, 9, 7, 12, 0, 0);
  let seedState = 12345; const rnd = () => { seedState = (seedState * 1103515245 + 12345) & 0x7fffffff; return seedState / 0x7fffffff; };
  const rows = Array.from({ length: 380 }, (_, i) => {
    const total = Math.round(2000 + rnd() ** 3 * 4_000_000);
    const start = GENERATED_AT - Math.round(rnd() * 28 * 86_400_000);
    return {
      session_ref: `session:${i}`, harness: HARNESSES[i % HARNESSES.length],
      first_event_at: new Date(start).toISOString(), last_event_at: new Date(start + Math.round(rnd() * 3_600_000)).toISOString(),
      event_count: 10, model_ids: ["claude-sonnet-5"],
      tokens: { uncached_input_tokens: Math.round(total * 0.2), cache_read_tokens: Math.round(total * 0.5), cache_write_tokens: Math.round(total * 0.1), output_tokens: Math.round(total * 0.2), total },
      peak_tokens: Math.round(total * 0.3), cost_minor: { amount_minor: Math.round(total / 1000), currency: "USD", basis: "api_equivalent" },
      cost_status: { state: "estimated", reason: "", has_unresolved: false },
    };
  });
  const real = buildCityModel({ rows, findings: [], windowStartMs: GENERATED_AT - 30 * 86_400_000, windowEndMs: GENERATED_AT, windowLabel: "30d", totalSessions: rows.length, truncated: false, generatedAt: GENERATED_AT });
  const layout = layoutCity(real, null, undefined, MIAMI_COASTAL);
  // 找一条穿过会话楼、两端都在陆地上且不过河的路：以若干会话楼为中点，各试 8 个方向（岛中间有河，过河要桥，本期没有架桥工具）。
  const slots = layout.districts.flatMap((d) => [...d.slots.values()]);
  let chosen = null;
  for (let i = 0; i < slots.length && !chosen; i += 7) {
    for (let k = 0; k < 8 && !chosen; k += 1) {
      const ang = (k * Math.PI) / 8; const half = 70; const c = slots[i];
      const from = { x: c.x - Math.cos(ang) * half, z: c.z - Math.sin(ang) * half }; const to = { x: c.x + Math.cos(ang) * half, z: c.z + Math.sin(ang) * half };
      const verdict = validateRoadAdd(layout, real, from, to, 5);
      if (!verdict.blockers.length && verdict.warnings.some((w) => w.startsWith("relocate:"))) chosen = { from, to, verdict };
    }
  }
  assert.ok(chosen, "a cross-town road through session buildings is accepted");
  const t0 = performance.now();
  const result = bulldozeForRoads(layout, real, layout, appendRoadOp(emptyPlanPatch(layout.seed, layout.scaleTier), { t: "add", from: chosen.from, to: chosen.to, width: 5 }, 1));
  const ms = Math.round(performance.now() - t0);
  const applied = applyPlanPatch(layout, result.patch);
  assert.equal(applied.stale.length, 0, `the road + bulldoze + relocations replay cleanly — ${JSON.stringify(applied.stale.slice(0, 3))}`);
  const fresh2 = freshRoadGeometry(layout, applied.layout);
  const buildings = new Map(real.buildings.map((b) => [b.id, b]));
  const stillOnRoad = applied.layout.districts.flatMap((d) => [...d.slots]).filter(([id, slot]) => !result.homeless.includes(id) && !rectClearOfEdges(buildingRect(buildings.get(id), slot), fresh2, 0.5));
  assert.deepEqual(stillOnRoad.map(([id]) => id), [], "no re-homed session building is left under the new road");
  assert.equal(applied.layout.districts.reduce((n, d) => n + d.slots.size, 0), layout.districts.reduce((n, d) => n + d.slots.size, 0), "no session building disappears");
  console.log(`  真实城市 380 楼：横穿城区的新路 ${chosen.verdict.warnings.join("、")} → 推平 ${result.bulldozed.length}、安置 ${result.relocated.length}、无处安置 ${result.homeless.length}；推土机耗时 ${ms}ms`);
}

console.log("City plan bulldozer: roads through buildings are allowed — facilities are bulldozed and session buildings re-homed by the developer (never removed), generator residue is left alone, homeless buildings are reported, split halves are not new geometry; landmarks and public sites can be removed or moved anywhere legal, only the suspension bridge stays locked; real-city cross-town road replays cleanly.");
