#!/usr/bin/env node
import assert from "node:assert/strict";
import { loadCity } from "./city-kit/index.mjs";
// 原生加载同一生产函数；避免 vm 沙箱把完整规划放慢约八倍。
const { THREE, createCityPlan, clearsHighways, SegmentIndex, segmentDistance, buildSkeleton, emptyNetwork, buildInfrastructure, buildDistrictExpressways, EXPRESSWAY_DECK_THICKNESS } = await loadCity({
  "pkg:three": ["* as THREE"],
  "engine/cityPlan.ts": ["createCityPlan", "clearsHighways", "SegmentIndex", "segmentDistance"],
  "engine/planner/skeleton.ts": ["buildSkeleton"],
  "engine/planner/network.ts": ["emptyNetwork"],
  "engine/systems/roadSystem.ts": ["buildInfrastructure", "buildDistrictExpressways"],
  "engine/render/shared.ts": ["EXPRESSWAY_DECK_THICKNESS"],
});
class Harness {
  group = new THREE.Group(); disposables = [];
  positionVector = new THREE.Vector3(); euler = new THREE.Euler();
  quaternion = new THREE.Quaternion(); scaleVector = new THREE.Vector3();
  matrix = new THREE.Matrix4(); color = new THREE.Color();
  constructor(layout) { this.layout = layout; }
  makeInstanced(geometry, material, count) { return this.mesh = new THREE.InstancedMesh(geometry, material, count); }
  run() { buildInfrastructure(this); }
}
const harness = new Harness({ roadEdges: [{ bridge: true, width: 8, points: [{ x: -40, z: 0 }, { x: 40, z: 0 }] }],
  terrain: { height: (x) => Math.abs(x) >= 40 ? 1.2 : -3 } });
harness.run();
assert(harness.mesh.count >= 4, "bridge includes deck, rails and piers");
const matrix = new THREE.Matrix4();
harness.mesh.getMatrixAt(0, matrix);
assert(Math.abs(matrix.elements[0] - 80.5) < 0.001, "deck connects both banks");
assert(Math.abs(matrix.elements[13] + matrix.elements[5] - 1.2) < 0.001, "deck top meets approaches above water");
assert(harness.mesh.count > 12, "bridge includes edge lines and dashed center markings in the furniture batch");
// 出口的连续短弧不能被桥面渲染的旧 6 单位阈值吃掉（用户截图：桥面断开但桥墩还在）。
{
  const points = [{ x: -120, z: 0 }, { x: -9, z: 0 }, { x: -6, z: 2 }, { x: -3, z: 4 }, { x: 0, z: 6 }];
  const short = new Harness({ highways: [points], terrain: { height: () => 1.2 } });
  buildDistrictExpressways(short);
  const mesh = short.group.getObjectByName("city-district-expressways"), matrix = new THREE.Matrix4();
  const position = new THREE.Vector3(), rotation = new THREE.Quaternion(), scale = new THREE.Vector3();
  const decks = [];
  for (let i = 0; i < mesh.count; i += 1) {
    mesh.getMatrixAt(i, matrix); matrix.decompose(position, rotation, scale);
    if (Math.abs(scale.y - EXPRESSWAY_DECK_THICKNESS) < 1e-5) decks.push(position.clone());
  }
  assert.equal(decks.length, points.length - 1, "every nonzero segment, including consecutive short exit arcs, has a bridge deck");
  for (let i = 1; i < points.length; i += 1) {
    assert.ok(Math.abs(decks[i - 1].x - (points[i - 1].x + points[i].x) / 2) < 1e-5);
    assert.ok(Math.abs(decks[i - 1].z - (points[i - 1].z + points[i].z) / 2) < 1e-5);
  }
  for (const disposable of short.disposables) disposable.dispose();
}
const distant = new SegmentIndex([[{ x: 150, z: 0 }, { x: 150, z: 10 }]]);
assert(distant.closerThan({ x: 0, z: 0 }, 160), "large footprint queries search beyond adjacent cells");
assert(!distant.closerThan({ x: 0, z: 0 }, 140), "large footprint guard remains distance-based");
for (const seed of [1927, 42, 1485618003, 987654]) {
  const plan = createCityPlan(seed, 2);
  for (const run of plan.highways) {
    if (Math.hypot(run[0].x - run.at(-1).x, run[0].z - run.at(-1).z) < 0.01) continue;
    for (const endpoint of [run[0], run.at(-1)]) {
      assert(plan.roadEdges.some((edge) => !edge.bridge && segmentDistance(endpoint, edge.points[0], edge.points[1]) < 0.02), `seed ${seed}: ramp ends on a ground road`);
      assert(plan.terrain.height(endpoint.x, endpoint.z) >= 1.2, `seed ${seed}: ramp ends on land`);
    }
  }
  assert.deepEqual(plan.highways, createCityPlan(seed, 2).highways, `seed ${seed}: deterministic exits`);
}
// 档位：每档 400 栋，最多 10 档 = 4000 栋（scaleTierFor 夹在 MAX_TIER = 10）。
for (const tier of [1, 5, 10]) {
  const plan = createCityPlan(1485618003, tier);
  for (const block of plan.blocks) for (const parcel of block.parcels) {
    assert(clearsHighways(parcel, parcel.width, parcel.depth, plan.highways), `tier ${tier}: expressway footprint guard`);
  }
}
// 原 1485618003 生产见证在接管前的 HEAD（9e4a0ad4）三个档位已经没有高架，不能继续拿它证明跨河。
// 用显式的平岛/窄河检验真实骨架函数：地面不可建的河岸退让必须不截断架空环线。
{
  const R = 600, coastDistance = (x, z) => R - Math.hypot(x, z);
  const inRiver = (x, z) => coastDistance(x, z) > 0 && Math.abs(x) < 18;
  const height = (x, z) => coastDistance(x, z) > 0 && !inRiver(x, z) ? 1.2 : -3;
  const buildable = (x, z) => coastDistance(x, z) > 12 && Math.abs(x) > 30;
  const geo = { R, hasRiver: true, maxWaterSpan: 140, coastDistance, landClearance: (x, z) => Math.min(coastDistance(x, z), Math.abs(x) - 18),
    coast: Array.from({ length: 96 }, (_, i) => ({ x: R * Math.cos(i / 96 * Math.PI * 2), z: R * Math.sin(i / 96 * Math.PI * 2) })),
    river: [], riverX: () => 0, riverWidth: () => 18, riverShift: 0,
    hillDir: { x: 0, z: 0 }, hillProj: () => 0, hillLine: 10000, height, buildable,
    terrain: { height, buildable, slope: () => 0 }, islets: [], waterEdges: [], isletClearance: () => -Infinity };
  const result = buildSkeleton({ geo, seed: 42, core: { x: -100, z: 0 }, publicSites: [], landmarks: [],
    shoreSiteKinds: new Set(), random: () => 0.5, network: emptyNetwork(), inRiver });
  assert(result.ringRuns.some(run => run.some(p => inRiver(p.x, p.z))), "explicit river fixture retains an elevated crossing");
  assert(result.ringRuns.some(run => run.some(p => !buildable(p.x, p.z))), "the witness really crosses ground setbacks");
}
console.log("City infrastructure: real bridge deck/rails/piers and expressway clearance/crossings across tiers passed.");
