#!/usr/bin/env node
// 出生点派生与校验守卫（SPEC §13.5）：几何只来自审计案例、确定性派生、
// 逐点校验拒绝路径（不可行驶/区域锚不符/车身不净空）、无几何不出候选。
import assert from "node:assert/strict";
import vm from "node:vm";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { buildSync } = createRequire(path.join(repo, "apps/agent-city/ui/package.json"))("esbuild");
const load = (file) => {
  const source = buildSync({ entryPoints: [path.join(repo, "apps/agent-city/ui/src/game/driving", file)], bundle: true,
    write: false, format: "cjs", platform: "node" }).outputFiles[0].text;
  const module = { exports: {} };
  vm.runInNewContext(source, { module, exports: module.exports, console });
  return module.exports;
};
const { publishDrivingGraph } = load("audit/ReleasedDrivingGraph.ts");
const { evaluateAuditRelease } = load("audit/AuditReleasePolicy.ts");
const spawn = load("spawnPoints.ts");

const key = { baseSnapshotHash: "s", vehicleConfigHash: "v", kernelBuildId: "k", surfaceVersion: 1, queryVersion: 1, snapshotCompilerVersion: 1,
  physicsVersion: 1, collisionVersion: 1, controllerVersion: 1, plannerVersion: 1, observerVersion: 1, manifestHash: "m",
  releasePolicyVersion: 1, releaseBoundaryHash: "b1" };
const start = { x: 0, y: 0, z: 0, heading: 0, speed: 0, steering: 0, distance: 0, braking: false, reversing: false, pitch: 0, roll: 0, surfaceId: "pad" };
const corridor = (waypoints) => ({ surfaceSequence: ["pad"], portalSequence: [], waypoints });
const gate = (id) => ({ id, x: 10, y: 0, z: 0, forwardX: 1, forwardZ: 0, halfWidth: 1.8, heightTolerance: 0.3, surfaceIds: ["pad"] });
const mkCase = (id, units, waypoints) => ({ id, units, start,
  gates: [gate(`${id}:exit`)], corridor: corridor(waypoints), policy: { cruiseSpeed: 6, maxReverseSpeed: 0 }, maxTicks: 600, maxNoProgressTicks: 120 });

// 两条直路（不同方向）+ 一条多案例歧义单元 + 一个非 passed 单元。
const units = [
  { id: "edge:a>b", kind: "directed-edge" }, { id: "edge:b>a", kind: "directed-edge" },
  { id: "edge:amb", kind: "directed-edge" }, { id: "edge:closed", kind: "directed-edge" }, { id: "spawn:0", kind: "spawn-access" },
];
const manifest = { key, units, exclusions: [{ unitId: "edge:closed", reason: "closed-by-decision" }],
  cases: [
    mkCase("c-ab", ["edge:a>b", "spawn:0"], [{ x: 0, z: 0 }, { x: 10, z: 0 }]),
    mkCase("c-ba", ["edge:b>a"], [{ x: 10, z: 0 }, { x: 0, z: 0 }]),
    mkCase("c-amb-1", ["edge:amb"], [{ x: 0, z: 5 }, { x: 4, z: 5 }]),
    mkCase("c-amb-2", ["edge:amb"], [{ x: 6, z: 5 }, { x: 10, z: 5 }]),
  ] };
const statics = units.filter((unit) => unit.id !== "edge:closed").map((unit) => ({ key, unitId: unit.id, topology: "passed", geometry: "passed", witness: null }));
const runs = manifest.cases.map((item) => ({ key, caseId: item.id, verdict: "passed", cause: "none", coveredUnits: item.units, simulatedTicks: 40 }));
const decision = evaluateAuditRelease(manifest, statics, runs);
assert.equal(decision.ready, true, "对照组 ready");
const published = publishDrivingGraph(manifest, decision);
assert.equal(published.ok, true, "发布成功");

// 1) 图几何：passed 单元带 verified centerline；多案例覆盖的 edge:amb 无几何。
const geo = new Map(published.graph.geometry.map((entry) => [entry.unitId, entry]));
assert.ok(geo.has("edge:a>b") && geo.has("edge:b>a"), "单案例单元有几何");
assert.ok(!geo.has("edge:amb"), "多案例歧义单元无几何（不伪造）");
assert.ok(!geo.has("edge:closed"), "非 passed 单元无几何");
const geoAB = geo.get("edge:a>b"), geoBA = geo.get("edge:b>a");
assert.equal(geoAB ? geoAB.startHeading : null, 0, "a>b 起始朝向 +X");
assert.equal(geoBA ? Math.abs(geoBA.startHeading - Math.PI) < 1e-9 : false, true, "b>a 起始朝向 -X");

// 2) 派生：有几何单元出中点候选；歧义/非 passed/无几何不出；同图同输出。
const candidates = spawn.deriveSpawnCandidates(published.graph, () => "ground");
const ids = candidates.map((candidate) => candidate.id);
assert.equal(ids.length, 2, "只派生有几何单元");
assert.equal(ids[0], "spawn:edge:a>b");
assert.equal(ids[1], "spawn:edge:b>a");
const ab = candidates.find((candidate) => candidate.id === "spawn:edge:a>b");
assert.ok(Math.abs(ab.x - 5) < 1e-9 && Math.abs(ab.z) < 1e-9, "a>b 中点 (5,0)");
assert.ok(Math.abs(ab.heading) < 1e-9, "中点朝向沿切向 +X");
const again = spawn.deriveSpawnCandidates(published.graph, () => "ground");
assert.equal(again.length, candidates.length, "派生确定性：数量一致");
for (let index = 0; index < candidates.length; index += 1) {
  assert.equal(again[index].id, candidates[index].id);
  assert.equal(again[index].x, candidates[index].x);
  assert.equal(again[index].z, candidates[index].z);
  assert.equal(again[index].heading, candidates[index].heading);
}
const layered = spawn.deriveSpawnCandidates(published.graph, (unitId) => unitId.includes("b>a") ? "deck-1" : "ground");
const layeredBA = layered.find((candidate) => candidate.id === "spawn:edge:b>a");
assert.equal(layeredBA ? layeredBA.layerId : null, "deck-1", "layerId 由调用方映射");

// 3) 校验拒绝路径：spec 校验在世界面（readWorld 为 null → stale）与版本不匹配时拒绝。
const capture = { readWorld: () => null, isLeaseCurrent: () => false, worldRevision: "w-1" };
const spec = { schemaVersion: 1, worldRevision: "w-1", spawns: [] };
const rejectStale = await spawn.validateSpawnSpec({ capture, graph: published.graph }, spec, { halfLength: 1.4, halfWidth: 0.7, halfHeight: 0.5 }, 0.55);
assert.equal(rejectStale.ok, false);
assert.equal(rejectStale.reason, "stale-world");
const rejectRevision = await spawn.validateSpawnSpec({ capture: { ...capture, isLeaseCurrent: () => true }, graph: published.graph },
  { ...spec, worldRevision: "w-other" }, { halfLength: 1.4, halfWidth: 0.7, halfHeight: 0.5 }, 0.55);
assert.equal(rejectRevision.reason, "world-revision-mismatch");
const rejectSchema = await spawn.validateSpawnSpec({ capture, graph: published.graph },
  { ...spec, schemaVersion: 2 }, { halfLength: 1.4, halfWidth: 0.7, halfHeight: 0.5 }, 0.55);
assert.equal(rejectSchema.reason, "schema-version");

console.log("Driving spawns: audited-geometry-only derivation, midpoint/tangent determinism, layer mapping, spec validation rejections passed.");
