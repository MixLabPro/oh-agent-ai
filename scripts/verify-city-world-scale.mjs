#!/usr/bin/env node
// 世界比例尺守卫（1 单位 = 2 米，engine/worldScale.ts）：在 Node 里构建每个地标/机场/豪宅岛模型，量主体包围盒
// （去掉灯塔光束这类发光锥），换算成米，对照 worldScale.SIZE_POLICY：
//   real × range[0] ≤ 实测 ≤ real × range[1]
// real 是真实世界参考尺寸；range 偏离 1 的部分是「为了视觉效果」登记过的放大/压低（用户 2026-10-15：有些物体为了视觉效果可以调整大小）。
// 偏离必须写在表里、带理由；新模型没有条目直接失败——不让「顺手写的魔数」再把一个东西做成两倍大。
//   node scripts/verify-city-world-scale.mjs [--report]
import assert from "node:assert/strict";
import { loadCity } from "./city-kit/index.mjs";
import { installCanvasShim } from "./city-kit/scene-hash.mjs";

installCanvasShim();
const { THREE, LANDMARK_BUILDERS, buildAirport, createMaterialFactory, SIZE_POLICY, toMeters } = await loadCity({
  "pkg:three": ["* as THREE"],
  "engine/render/landmarkMaterials.ts": ["createMaterialFactory"],
  "engine/render/landmarkBuilders.ts": ["LANDMARK_BUILDERS"],
  "engine/cityAirport.ts": ["buildAirport"],
  "engine/worldScale.ts": ["SIZE_POLICY", "toMeters"],
});
const report = process.argv.includes("--report");

function buildLandmark(kind) {
  const landmark = { id: `landmark:${kind}`, kind, x: 0, z: 0, yaw: 0, radius: 30, reach: 30, ...(kind === "suspension-bridge" ? { to: { x: 300, z: 0 } } : {}) };
  const group = new THREE.Group();
  const material = createMaterialFactory();
  const mesh = (geometry, mat, parent, x, y, z, ry = 0) => { const m = new THREE.Mesh(geometry, mat); m.position.set(x, y, z); m.rotation.y = ry; parent.add(m); return m; };
  const matrix = new THREE.Matrix4(); const quaternion = new THREE.Quaternion(); const scaleVector = new THREE.Vector3(); const positionVector = new THREE.Vector3(); const euler = new THREE.Euler();
  const host = {
    disposables: [], landmarkSpinners: [], landmarkWindows: [], layout: { terrain: { height: () => 0 } }, group: new THREE.Group(),
    nightLights: { heads: new THREE.MeshBasicMaterial(), pools: new THREE.MeshBasicMaterial(), strips: new THREE.MeshBasicMaterial(), neon: new THREE.MeshBasicMaterial() },
    compose: (x, y, z, rotationY, sx, sy, sz) => { euler.set(0, rotationY, 0); quaternion.setFromEuler(euler); positionVector.set(x, y, z); scaleVector.set(sx, sy, sz); matrix.compose(positionVector, quaternion, scaleVector); },
    matrix, color: new THREE.Color(), spillWhite: new THREE.Color(), positionVector, quaternion, scaleVector,
  };
  LANDMARK_BUILDERS[kind]({ group, landmark, mesh, material, white: material("#f3f1ea"), steel: material("#c9cfd3"), red: material("#c8473a"), cap: 70, neon: false, host });
  return group;
}

/** 只量高度：占地受规划半径约束（已有 envelope 守卫），高度才是「看起来大一号」的来源。水面以下（码头桩）不计。 */
function heightMeters(root) {
  root.updateMatrixWorld(true);
  const box = new THREE.Box3();
  root.traverse((o) => { if (o.isMesh && !(o.material?.blending === THREE.AdditiveBlending)) box.expandByObject(o); });
  return toMeters(box.max.y - Math.max(0, box.min.y));
}

const measured = {};
for (const kind of Object.keys(LANDMARK_BUILDERS)) measured[kind] = heightMeters(buildLandmark(kind));
measured.airport = heightMeters(buildAirport({ shore: { x: 0, z: 0 }, centre: { x: 0, z: 140 }, outward: { x: 0, z: 1 }, yaw: 0 }, [], new THREE.MeshBasicMaterial()));

const failures = [];
for (const [kind, h] of Object.entries(measured)) {
  const policy = SIZE_POLICY[kind];
  if (!policy) { failures.push(`${kind}: 没有 SIZE_POLICY 条目（实测高 ${h.toFixed(1)} m）`); continue; }
  const [lo, hi] = policy.range.map((k) => policy.real * k);
  if (report) console.log(`${kind.padEnd(18)} 实测 ${h.toFixed(1).padStart(6)} m  参考 ${String(policy.real).padStart(4)} m  ×${(h / policy.real).toFixed(2)}（允许 ×${policy.range[0]}–${policy.range[1]}）`);
  if (h < lo || h > hi) failures.push(`${kind}: 实测高 ${h.toFixed(1)} m 超出 [${lo.toFixed(1)}, ${hi.toFixed(1)}]（参考 ${policy.real} m × ${policy.range.join("–")}：${policy.why}）`);
}
assert.deepEqual(failures, [], failures.join("\n"));
console.log(`world scale: ${Object.keys(measured).length} 个模型高度都在「真实参考 × 允许放大」之内`);
