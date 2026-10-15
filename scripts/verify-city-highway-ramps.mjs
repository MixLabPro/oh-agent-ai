#!/usr/bin/env node
// 匝道必须接上真实高架和有限地面宿主，不能只在切线/道路延长线上看起来接近。
import assert from "node:assert/strict";
import { loadCity } from "./city-kit/index.mjs";
const { planHighwayRamps, HIGHWAY_RAMP_CONFIG: C, segmentDistance, THREE, buildHighwayRamps, EXPRESSWAY_DECK_Y } = await loadCity({
  "engine/planner/highwayRamps.ts": ["planHighwayRamps", "HIGHWAY_RAMP_CONFIG"],
  "engine/roadGeometry.ts": ["segmentDistance"],
  "pkg:three": ["* as THREE"],
  "engine/systems/roadSystem.ts": ["buildHighwayRamps"],
  "engine/render/shared.ts": ["EXPRESSWAY_DECK_Y"],
});
const road = (id, x, lo = -100, hi = 100) => ({ id, from: `${x}:${lo}`, to: `${x}:${hi}`,
  width: 12, kind: "arterial", structure: "ground-road", points: [{ x, z: lo }, { x, z: hi }] });
const run = [{ x: -500, z: 0 }, { x: -80, z: 20 }, { x: 80, z: 0 }, { x: 500, z: -10 }];
const input = { highways: [run], roads: [road("host", 0)], buildable: () => true, sites: [] };
const before = JSON.stringify(input);
const result = planHighwayRamps(input);
assert.equal(result.ramps.length, 4, "an unobstructed crossing has two ramps on each side");
for (const ramp of result.ramps) {
  const start = ramp.points[0], end = ramp.points.at(-1);
  assert.ok(run.slice(1).some((b, i) => segmentDistance(start, run[i], b) < 1e-8), "bridge end lies on actual curved highway");
  assert.ok(segmentDistance(end, input.roads[0].points[0], input.roads[0].points[1]) < 1e-8, "ground end lies on finite host");
}
const splitHosts = planHighwayRamps({ ...input, roads: [road("lower", 0, -100, 0), road("upper", 0, 0, 100)] });
assert.equal(splitHosts.ramps.length, 4, "a junction split must not hide real collinear landing hosts");
assert.deepEqual(planHighwayRamps(input), result);
assert.equal(JSON.stringify(input), before);
assert.equal(planHighwayRamps({ ...input, roads: [road("short-host", 0, -5, 5)] }).ramps.length, 0,
  "a landing beyond the road endpoint cannot become an interchange");
assert.equal(planHighwayRamps({ ...input, buildable: () => false }).ramps.length, 0);
assert.equal(planHighwayRamps({ ...input, sites: [{ x: 0, z: 0, radius: 500 }] }).ramps.length, 0);
assert.equal(planHighwayRamps({ ...input, highways: [[{ x: -160, z: 0 }, { x: 160, z: 0 }]] }).ramps.length, 0,
  "the bridge merge must clear the highway's own landing slope");
const closed = [{ x: -500, z: -500 }, { x: 500, z: -500 }, { x: 500, z: 500 }, { x: -500, z: 500 }, { x: -500, z: -500 }];
const spaced = planHighwayRamps({ ...input, highways: [closed], roads: [road("a", -50, -550, -450), road("b", 50, -550, -450)] });
assert.equal(spaced.interchanges.length, 1, "nearby crossings on a closed highway obey longitudinal spacing");
assert.ok(C.endClear >= 90, "merge points must be above the existing highway end slopes");
{
  const host = { layout: { highways: [run], highwayRamps: [result.ramps[0]], terrain: { height: () => 1.2 } }, group: new THREE.Group(), disposables: [],
    positionVector: new THREE.Vector3(), euler: new THREE.Euler(), quaternion: new THREE.Quaternion(), scaleVector: new THREE.Vector3(),
    matrix: new THREE.Matrix4(), color: new THREE.Color() };
  buildHighwayRamps(host);
  const mesh = host.group.getObjectByName("city-highway-ramps"), matrix = new THREE.Matrix4();
  assert.ok(mesh && mesh.count > 0, "the accepted geometry is rendered");
  mesh.getMatrixAt(0, matrix);
  assert.ok(Math.abs(matrix.elements[13] - EXPRESSWAY_DECK_Y) < 1e-5, "merge deck stays level with the highway instead of sinking into it");
  const position = new THREE.Vector3(), rotation = new THREE.Quaternion(), scale = new THREE.Vector3();
  let rails = 0;
  for (let i = 0; i < mesh.count; i += 1) {
    mesh.getMatrixAt(i, matrix); matrix.decompose(position, rotation, scale);
    if (Math.abs(scale.y - 0.9) < 1e-5) {
      const distance = Math.min(...run.slice(1).map((b, j) => segmentDistance({ x: position.x, z: position.z }, run[j], b)));
      if (distance < (10.5 + result.ramps[0].width) / 2 + 0.5) {
        assert.ok(Math.abs(position.y - EXPRESSWAY_DECK_Y) < 1e-5, "overlapping ramp cross sections must stay at main deck height");
      }
    }
    if (Math.abs(scale.y - 0.05) < 1e-5) {
      const distance = Math.min(...run.slice(1).map((b, j) => segmentDistance({ x: position.x, z: position.z }, run[j], b)));
      assert.ok(distance > 10.5 / 2 + 0.39, "ramp edge markings must not cross the main highway lanes");
    }
    if (Math.abs(scale.y - 0.55) > 1e-5) continue;
    rails += 1;
    const end = result.ramps[0].points.at(-1);
    assert.ok(Math.hypot(position.x - end.x, position.z - end.z) > 10, "ramp rails must leave the ground junction open");
  }
  assert.ok(rails > 0, "the descent retains protective rails between open ends");
  for (const disposable of host.disposables) disposable.dispose();
}
console.log("City highway ramps: curved bridge contact, finite ground hosts, slope clearance, closed spacing, obstacles and determinism passed.");
