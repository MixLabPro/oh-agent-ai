#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const engine = path.join(repo, "apps/agent-city/ui/src/engine");
const require = createRequire(path.join(repo, "apps/desktop/ui-dev/package.json"));
const THREE = require("three");
const { buildSync } = require("esbuild");
const source = fs.readFileSync(path.join(engine, "cityParts.ts"), "utf8");
// Execute the production infrastructure method without a DOM/WebGL context.
const start = source.indexOf("  private buildInfrastructure(): void {");
const end = source.indexOf("  private buildDistrictExpressways(): void {", start);
assert(start >= 0 && end > start);
const method = source.slice(start, end);
const bundle = buildSync({ stdin: {
  contents: `import * as THREE from "three";
    import { createCityPlan, clearsHighways, SegmentIndex, segmentDistance } from "./cityPlan";
    export { createCityPlan, clearsHighways, SegmentIndex, segmentDistance };
    const BOX = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
    export class Harness {
      layout; mesh; positionVector = new THREE.Vector3(); euler = new THREE.Euler();
      quaternion = new THREE.Quaternion(); scaleVector = new THREE.Vector3();
      matrix = new THREE.Matrix4(); color = new THREE.Color();
      constructor(layout) { this.layout = layout; }
      makeInstanced(geometry, material, count) { return this.mesh = new THREE.InstancedMesh(geometry, material, count); }
      run() { this.buildInfrastructure(); }
      ${method}
    }`, resolveDir: engine, loader: "ts",
}, bundle: true, write: false, format: "cjs", platform: "node", external: ["three"], logLevel: "silent" });
const mod = { exports: {} };
vm.runInNewContext(bundle.outputFiles[0].text, { module: mod, exports: mod.exports, require, process, console, Math, Map, Set });
const { Harness, createCityPlan, clearsHighways, SegmentIndex, segmentDistance } = mod.exports;
const harness = new Harness({ roadEdges: [{ bridge: true, width: 8, points: [{ x: -40, z: 0 }, { x: 40, z: 0 }] }],
  terrain: { height: (x) => Math.abs(x) >= 40 ? 1.2 : -3 } });
harness.run();
assert(harness.mesh.count >= 4, "bridge includes deck, rails and piers");
const matrix = new THREE.Matrix4();
harness.mesh.getMatrixAt(0, matrix);
assert(Math.abs(matrix.elements[0] - 80.5) < 0.001, "deck connects both banks");
assert(Math.abs(matrix.elements[13] + matrix.elements[5] - 1.2) < 0.001, "deck top meets approaches above water");
assert(harness.mesh.count > 12, "bridge includes edge lines and dashed center markings in the furniture batch");
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
for (const tier of [1, 2, 5]) {
  const plan = createCityPlan(1485618003, tier);
  for (const block of plan.blocks) for (const parcel of block.parcels) {
    assert(clearsHighways(parcel, parcel.width, parcel.depth, plan.highways), `tier ${tier}: expressway footprint guard`);
  }
  // Every sampled ring point on the riverbank is retained, not split by the buildable setback.
  assert(plan.highways.some((run) => run.some((p) => plan.terrain.height(p.x, p.z) < 0)), `tier ${tier}: elevated river crossing retained`);
}
console.log("City infrastructure: real bridge deck/rails/piers and expressway clearance/crossings across tiers passed.");
