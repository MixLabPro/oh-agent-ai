#!/usr/bin/env node
// RoadAuditPlanner (D1): the mandatory manifest is frozen before any run, deterministic, with exclusions kept
// visible; every unit has exactly one case covering only itself; execution goes through the B audit into the
// release policy and reports coverage per kind. --cities plans and audits real rendered cities.
import assert from "node:assert/strict";
import { loadCity } from "./city-kit/index.mjs";
import { makeFixtures } from "./city-kit/surface-region-fixtures.mjs";
const m = await loadCity({
  "engine/surface/meshBoundaries.ts": ["extractMeshBoundaries"],
  "engine/surface/SurfaceIndex.ts": ["buildSurfaceIndex"],
  "engine/surface/surfaceRegions.ts": ["buildSurfaceRegions"],
  "game/driving/audit/RoadPassabilityAudit.ts": ["passabilityWorld", "continuousAuditKeyFields"],
  "game/driving/audit/RoadAuditPlanner.ts": ["planRoadAudit", "executeAuditPlan", "ROAD_AUDIT_PLANNER_VERSION"],
  "game/driving/audit/RoutePilot.ts": ["ROUTE_PILOT_CONTROLLER_VERSION"],
});
const { grid, patch } = makeFixtures(m);
const keyFor = (worldRevision, manifestHash) => ({ baseSnapshotHash: worldRevision, kernelBuildId: "fixture-continuous-v1", surfaceVersion: 3,
  snapshotCompilerVersion: 1, controllerVersion: m.ROUTE_PILOT_CONTROLLER_VERSION, plannerVersion: m.ROAD_AUDIT_PLANNER_VERSION, observerVersion: 2, manifestHash, releasePolicyVersion: 1, releaseBoundaryHash: null,
  ...m.continuousAuditKeyFields() });
const box = (id, role, x0, x1, y0, y1, z0, z1) => ({ id, role, shape: "box", corners: [x0, x1].flatMap((x) => [y0, y1].flatMap((y) => [z0, z1].map((z) => ({ x, y, z })))) });
// "+" crossroads, arms 40 long and 6 wide, centre node C; the roads are two aliased rectangles (one region).
const patches = [patch("ew", "carriageway", grid(-40, -3, 40, 3, 40, 6)), patch("ns", "carriageway", grid(-3, -40, 3, 40, 6, 40))];
const N = { x: 0, z: -40 }, S = { x: 0, z: 40 }, E = { x: 40, z: 0 }, W = { x: -40, z: 0 }, C = { x: 0, z: 0 };
const edge = (id, from, to, a, b) => ({ id, from, to, width: 6, points: [a, b] });
const edges = [edge("e", "C", "E", C, E), edge("n", "C", "N", C, N), edge("s", "C", "S", C, S), edge("w", "C", "W", C, W)];
const worldOf = (obstacles = []) => {
  const surface = { revision: "surface-fixture", geometryVersion: 3, patches, portals: [], renderBatches: [], report: { candidateLength: 0, geometricallyEligibleLength: 0, issues: [] } };
  const regions = m.buildSurfaceRegions(surface, m.buildSurfaceIndex(surface)); assert.equal(regions.status, "ready");
  const snapshot = { revision: "world-plus", surface, obstacles, landings: [], counts: { bridges: 0, expresswaySegments: 0, flares: 0, islands: 0, culDeSacs: 0 }, obstacleCoverage: "structures-only", renderedSolids: [], sceneSolids: [] };
  return m.passabilityWorld(snapshot, regions, () => true, { declareNoBuildings: true }).world;
};

// ── The frozen manifest ──
const plan = m.planRoadAudit({ worldRevision: "world-plus", roadEdges: edges, landings: [] });
{
  assert.equal(plan.counts["directed-edge"].units, 8, "both directions of every edge");
  assert.equal(plan.counts.turn.units, 12, "4 arms × 3 non-U-turn exits at the crossroads; dead ends have none");
  assert.equal(plan.counts["spawn-access"].units, 1, "one audit start per connected component");
  assert.equal(plan.routes.length, plan.units.length - plan.exclusions.length, "every mandatory unit has exactly one case");
  assert.ok(plan.routes.every((r) => r.units.length === 1 && r.units[0] === r.id), "a case covers only its own unit");
  assert.ok(!plan.units.some((u) => /turn:C:(\w):(fwd|rev)>\1:/.test(u.id) && u.id.split(">")[0].split(":")[2] === u.id.split(">")[1].split(":")[0]), "no U-turns");
  const again = m.planRoadAudit({ worldRevision: "world-plus", roadEdges: [...edges].reverse(), landings: [] });
  assert.equal(again.manifestHash, plan.manifestHash, "input order does not change the manifest");
  const moved = m.planRoadAudit({ worldRevision: "world-plus", roadEdges: [...edges.slice(1), edge("e", "C", "E", C, { x: 41, z: 0 })], landings: [] });
  assert.notEqual(moved.manifestHash, plan.manifestHash, "geometry changes the manifest identity");
  // A stub too short to audit stays in the denominator as a visible exclusion.
  const stubbed = m.planRoadAudit({ worldRevision: "world-plus", roadEdges: [...edges, edge("stub", "E", "X", E, { x: 48, z: 0 })], landings: [] });
  const ex = stubbed.exclusions.filter((x) => x.unitId.startsWith("edge:stub:"));
  assert.equal(ex.length, 2); assert.match(ex[0].reason, /^edge-too-short:/);
  assert.ok(stubbed.units.some((u) => u.id === "edge:stub:fwd"), "excluded units remain in the manifest");
  // Landings: dangling ends excluded, others get onto/off cases with their layers.
  const landing = (end, status, layerId) => ({ structureId: "bridge:b", end, layerId, x: 0, z: 0, patchId: "deck", seam: { a: { x: 0, y: 0, z: -2.5 }, b: { x: 0, y: 0, z: 2.5 } }, outX: -1, outZ: 0, deckY: 0, groundY: 0, step: 0, status });
  const structured = m.planRoadAudit({ worldRevision: "world-plus", roadEdges: edges, landings: [landing("from", "aligned", "ground"), landing("to", "no-ground", "ground")] });
  assert.equal(structured.counts["structure-transition"].units, 4); assert.equal(structured.counts["structure-transition"].excluded, 2);
  const onto = structured.routes.find((r) => r.id === "structure:bridge:b:from:onto");
  assert.equal(onto.exitLayer, "ground"); assert.equal(onto.halfWidth, 3, "corridor from the seam's actual width");
}

// ── Execution: release policy on the frozen manifest + coverage per kind ──
{
  const report = m.executeAuditPlan(worldOf(), plan, keyFor);
  assert.equal(report.manifestHash, plan.manifestHash);
  assert.equal(report.results.length, plan.routes.length);
  assert.ok(report.results.every((r) => r.key.manifestHash === plan.manifestHash), "every result carries the manifest identity");
  assert.equal(report.coverage["directed-edge"].passed, 8, JSON.stringify(report.coverage));
  assert.equal(report.coverage["spawn-access"].passed, 1, "the end-to-end spawn route passes");
  assert.equal(report.coverage.turn.passed, 12, `filleted centrelines + RoutePilot drive every turn (${JSON.stringify(report.coverage.turn)})`);
  assert.equal(report.release.ready, false, "no release without the final boundary replay");
  assert.ok(report.release.reasons.includes("final-boundary-replay-required"));
  assert.match(report.summary, /^已验 8\/8 个方向、12\/12 个转向、0\/0 个结构连接、1\/1 个出生可达/);
  // Controller fault (spec §11.8): a pilot that never steers fails turns as inconclusive, never as road evidence.
  const straight = () => ({ input: (s) => ({ forward: s.speed < 5, backward: false, left: false, right: false }) });
  const broken = m.executeAuditPlan(worldOf(), plan, keyFor, { pilot: straight });
  const turns = broken.results.filter((r) => r.routeId.startsWith("turn:") && !/(e:rev>w|w:rev>e|n:rev>s|s:rev>n)/.test(r.routeId));
  assert.equal(turns.length, 8); assert.ok(turns.every((r) => r.verdict === "inconclusive" && r.witness === null), "a broken controller is never a blocked road");
  assert.throws(() => m.executeAuditPlan(worldOf(), plan, (w, h) => ({ ...keyFor(w, h), controllerVersion: 1 })), /plan-key-controller-mismatch/, "the key must name the controller");
  console.log(`Audit planner: crossroads → ${report.summary}; turns ${JSON.stringify(report.coverage.turn)}.`);
}
{
  // Fault injection: an exact pier across the east arm at 20 → exactly that arm's directions are blocked
  // with a witness; turns (legs ≤ 15) are untouched; the far spawn route is never counted as a pass.
  const report = m.executeAuditPlan(worldOf([box("pier", "expressway-pier", 19, 21, 0, 6, -3.2, 3.2)]), plan, keyFor);
  const v = (id) => report.results.find((r) => r.routeId === id);
  assert.equal(v("edge:e:fwd").verdict, "blocked"); assert.equal(v("edge:e:rev").verdict, "blocked");
  assert.ok(v("edge:e:fwd").witness.limits.includes("structure:pier"));
  for (const id of ["edge:n:fwd", "edge:w:rev", "edge:s:fwd"]) assert.equal(v(id).verdict, "passed", id);
  assert.equal(report.coverage["directed-edge"].blocked, 2);
  assert.equal(report.release.units.find((u) => u.unitId === "edge:e:fwd").status, "blocked", "the release policy carries the witness");
}
console.log("Audit planner: frozen deterministic manifest (directions, non-U turns, structure onto/off, spawn → farthest node), visible exclusions, one case per unit, release-policy execution with per-kind coverage, fault injection localised passed.");

if (process.argv.includes("--cities")) {
  const { sceneKit, buildParts } = await import("./city-kit/scene-parts.mjs");
  const kit = await sceneKit({ "engine/surface/citySurfacePort.ts": ["CitySurfacePort"], "engine/surface/SurfaceIndex.ts": ["buildSurfaceIndex"], "engine/surface/surfaceRegions.ts": ["buildSurfaceRegions"],
    "game/driving/audit/RoadPassabilityAudit.ts": ["passabilityWorld"], "game/driving/audit/RoadAuditPlanner.ts": ["planRoadAudit", "executeAuditPlan"] });
  const scenes = (process.env.PLANNER_SCENES ?? "0/1,90/7,500/42").split(",");
  const limit = Number(process.env.PLANNER_ROUTES ?? 0); // 0 = the whole manifest
  for (const scene of scenes) {
    const [sessions, seed] = scene.split("/").map(Number);
    const { parts } = buildParts(kit, sessions, seed);
    const lease = parts.acquireDrivingWorldSource();
    try {
      const capture = await new kit.CitySurfacePort().capture(lease.source); assert.equal(capture.status, "ready");
      const snap = capture.readWorld();
      const world = kit.passabilityWorld(snap, kit.buildSurfaceRegions(snap.surface, kit.buildSurfaceIndex(snap.surface)), capture.isCurrent).world;
      const full = kit.planRoadAudit({ worldRevision: snap.revision, roadEdges: lease.source.layout.roadEdges, landings: snap.landings });
      const plan = limit ? { ...full, routes: full.routes.filter((_, i) => i % Math.ceil(full.routes.length / limit) === 0) } : full;
      const t = Date.now();
      const report = kit.executeAuditPlan(world, plan, keyFor);
      const k = full.counts;
      console.log(`Audit planner: ${scene}: manifest ${full.units.length} units (edges ${k["directed-edge"].units}, turns ${k.turn.units}, structures ${k["structure-transition"].units}, spawns ${k["spawn-access"].units}; excluded ${full.exclusions.length}), ran ${plan.routes.length} cases in ${((Date.now() - t) / 1000).toFixed(0)}s → ${report.summary}.`);
      const bad = report.results.filter((r) => r.verdict !== "passed");
      for (const r of bad.slice(0, 12)) console.log(`  ${r.routeId} ${r.verdict}:${r.cause} ${r.detail}`);
      assert.ok(report.results.every((r) => r.verdict !== "blocked" || r.witness), "blocked always carries a witness");
    } finally { lease.release(); }
  }
}
