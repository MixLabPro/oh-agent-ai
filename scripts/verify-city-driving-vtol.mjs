#!/usr/bin/env node
// VTOL 飞行车（vtolDriving，docs 待补）：地面段复用汽车物理，推进器叠加垂直通道；
//   空中段独立运动学 + 严格 3D 扫掠。断言：
//   1) 起飞：静止按住推进器 → 助推消耗、累计抬升、超离地余量转空中体制；
//   2) 悬停地板：无支撑（水面语义）不坠落、钳在海面、保持空中；
//   3) 天花板：最高实体+40（下限 120）裁剪爬升；
//   4) 上方实体裁剪：桥面板下方的垂直离地被 trim（车身顶到板底即止）；
//   5) 空中撞墙：严格策略、滑移后停于墙面（岛缘可越实体在空中也是阻挡）；
//   6) 落地：下降到有效支撑 → gameplay 足迹校验通过 → 接地回地面体制、助推恢复；
//   7) 内核界兼容：空中满速（=地面极速 13）时每步水平/3D 位移落在 DrivingKernel 守卫界内；
//   8) 审计不变式：stepDriving 忽略 thruster 字段——默认（无 VTOL）路径逐位不变。
import assert from "node:assert/strict";
import { loadCity } from "./city-kit/index.mjs";
import { makeFixtures } from "./city-kit/surface-region-fixtures.mjs";
const k = await loadCity({
  "game/driving/CollisionIndex.ts": ["buildCollisionIndex"],
  "game/driving/ContinuousDrivingEnvironment.ts": ["ContinuousDrivingEnvironment"],
  "game/driving/VtolDrivingEnvironment.ts": ["VtolDrivingEnvironment"],
  "game/driving/vtolDriving.ts": ["VTOL_PARAMS", "VTOL_PHYSICS_VERSION", "initialVtolState", "stepVtolDriving"],
  "game/driving/surfaceFootprint.ts": ["GAMEPLAY_FOOTPRINT_PARAMS"],
  "game/driving/vehicleFootprint.ts": ["GAMEPLAY_DRIVING_FOOTPRINT", "GAMEPLAY_COLLISION_INSET"],
  "game/carDimensions.ts": ["CAR_DIMENSIONS"],
  "game/DrivingSimulation.ts": ["stepDriving", "initialDrivingState", "DRIVING_DT", "DRIVING_PARAMS"],
  "game/driving/DrivingKernel.ts": ["DrivingKernel"],
  "engine/surface/meshBoundaries.ts": ["extractMeshBoundaries"],
  "engine/surface/SurfaceIndex.ts": ["buildSurfaceIndex"],
  "engine/surface/surfaceRegions.ts": ["buildSurfaceRegions"],
});
const { grid, patch, regionsOf } = makeFixtures(k);

// 路 [-30,30]×[-6,6]；x>30 无面片（水面语义）。高墙 x∈[24,25]（y 0..9，空中也挡）。
// 低板 x∈[-6,6], z∈[-2,2], y∈[3,3.5]（模拟桥面板底面，压制垂直离地）。
const road = patch("road", "carriageway", grid(-30, -6, 30, 6, 60, 12));
const { regions } = regionsOf([road], undefined);
assert.equal(regions.status, "ready");
const regionId = regions.classify(-20, 0, "ground").regionId;

const wall = { id: "wall", role: "pier", kind: "prism",
  ring: [{ x: 24, z: -6 }, { x: 25, z: -6 }, { x: 25, z: 6 }, { x: 24, z: 6 }], yMin: -0.5, yMax: 40 };
const slab = { id: "slab", role: "bridge-deck", kind: "prism",
  ring: [{ x: -6, z: -2 }, { x: 6, z: -2 }, { x: 6, z: 2 }, { x: -6, z: 2 }], yMin: 3, yMax: 3.5 };
const index = k.buildCollisionIndex([wall, slab]);
const d = k.CAR_DIMENSIONS;
const dims = { halfLength: d.length / 2 - k.GAMEPLAY_COLLISION_INSET, halfWidth: d.width / 2 - k.GAMEPLAY_COLLISION_INSET, halfHeight: d.height / 2 };
const binding = { surfaceRevision: regions.revision, worldRevision: "vtol-fixture", solidRevision: "vtol-fixture",
  solids: index.solids(), dimensions: dims, centerHeight: dims.halfHeight, isCurrent: () => true };
const env = new k.VtolDrivingEnvironment(regions, binding, k.GAMEPLAY_DRIVING_FOOTPRINT, k.GAMEPLAY_FOOTPRINT_PARAMS, {},
  { boundarySlide: true, mountablePolicy: "gameplay" });

const thrust = { forward: false, backward: false, left: false, right: false, thruster: true };
const idle = { forward: false, backward: false, left: false, right: false };
const fwd = { forward: true, backward: false, left: false, right: false };

// ── 1) 起飞 ──
let state = k.initialVtolState(-20, 0, 0, regionId);
assert.ok(env.place ? true : true);
let tookOffAt = -1;
for (let tick = 0; tick < 240; tick += 1) {
  state = k.stepVtolDriving(state, thrust, env);
  assert.ok(state.boost <= 1 && state.boost >= 0, "boost within [0,1]");
  if (state.airborne) { tookOffAt = tick; break; }
  if (state.y < -0.01) assert.fail(`climb must not sink before liftoff (y=${state.y.toFixed(3)})`);
}
assert.ok(tookOffAt >= 0, "must take off while thrusting");
assert.ok(state.y > k.VTOL_PARAMS.liftoffMargin, `airborne above liftoff margin (y=${state.y.toFixed(3)})`);
assert.ok(state.boost < 1, "boost drains while thrusting");
const boostAfterTakeoff = state.boost;

// ── 7) 内核界兼容：空中满速每步水平位移 ≤ 地面极速每步（DrivingKernel planar 界）──
{
  let air = { ...state, x: -20, z: 0, y: 6, speed: 0, airborne: true, verticalSpeed: 0, boost: 1, surfaceId: regionId };
  let maxSpeed = 0;
  for (let tick = 0; tick < 300; tick += 1) { // 带推进维持高度，测水平极速与每步界
    const before = { x: air.x, z: air.z };
    air = k.stepVtolDriving(air, { ...fwd, thruster: true }, env);
    const planar = Math.hypot(air.x - before.x, air.z - before.z);
    assert.ok(planar <= k.DRIVING_PARAMS.maxForward * k.DRIVING_DT + 1e-6, `air planar step within kernel guard (${planar.toFixed(4)})`);
    maxSpeed = Math.max(maxSpeed, air.speed);
  }
  assert.ok(maxSpeed > k.VTOL_PARAMS.airMaxForward * 0.9, `air speed approaches cap (${maxSpeed.toFixed(2)})`);
  const sinkFrom = air.y;
  for (let tick = 0; tick < 200; tick += 1) air = k.stepVtolDriving(air, { ...fwd, thruster: false }, env);
  assert.ok(air.y < sinkFrom, `gravity sinks without thrust (${air.y.toFixed(2)} < ${sinkFrom.toFixed(2)})`);
}

// ── 5) 空中撞墙（严格：高墙在 x=24，朝 +x 飞）──
{
  let air = { ...k.initialVtolState(10, 0, 0, regionId), y: 5, airborne: true, verticalSpeed: 0, boost: 1 };
  for (let tick = 0; tick < 900; tick += 1) {
    air = k.stepVtolDriving(air, { ...fwd, thruster: tick < 60 }, env);
    if (air.x > 23.4) assert.fail(`wall must stop the flying car in air (x=${air.x.toFixed(2)})`);
    if (tick > 120 && Math.abs(air.speed) < 0.5) break;
  }
  assert.ok(air.x < 23.5, `car stops before the wall face (x=${air.x.toFixed(2)})`);
  assert.ok(Math.abs(air.speed) < 1, `speed near zero against wall (${air.speed.toFixed(2)})`);
}

// ── 6) 落地：从 y=2 无推进器下降 → 接地 ──
{
  let air = { ...k.initialVtolState(-20, 0, 0, regionId), y: 2, airborne: true, verticalSpeed: 0, boost: 0.5 };
  let landed = false;
  for (let tick = 0; tick < 240; tick += 1) {
    air = k.stepVtolDriving(air, idle, env);
    if (air.airborne === false) { landed = true; break; }
  }
  assert.ok(landed, "must land on valid road support");
  assert.ok(Math.abs(air.y) < 0.05, `landed at support height (y=${air.y.toFixed(3)})`);
  assert.equal(air.surfaceId, regionId);
  // 落地静止恢复助推
  const boost0 = air.boost;
  for (let tick = 0; tick < 120; tick += 1) air = k.stepVtolDriving(air, idle, env);
  assert.ok(air.boost > boost0, "boost regenerates when grounded and slow");
  assert.equal(air.airborne, false);
  // 行驶中也回充（四成速率）——助推耗尽后开车跑一段必须能再飞（用户实测反馈）
  {
    let drive = { ...air, boost: 0 };
    for (let tick = 0; tick < 240; tick += 1) drive = k.stepVtolDriving(drive, fwd, env);
    assert.ok(Math.abs(drive.speed) > k.VTOL_PARAMS.boostRegenMaxSpeed, `test drives above regen-speed threshold (${drive.speed.toFixed(1)})`);
    assert.ok(drive.boost > k.VTOL_PARAMS.minBoostToLift, `driving regenerates boost past lift threshold (${drive.boost.toFixed(3)})`);
    // 助推过阈值后按 Space 必须能再起升
    let ticks = 0;
    while (!drive.airborne && ticks < 240) { drive = k.stepVtolDriving(drive, thrust, env); ticks += 1; }
    assert.ok(drive.airborne, `can take off again after driving regen (${ticks} ticks)`);
  }
}

// ── 2) 悬停地板：无支撑（x>30）→ 钳在海面、保持空中 ──
{
  let air = { ...k.initialVtolState(40, 0, 0, regionId), y: 2, airborne: true, verticalSpeed: 0, boost: 1 };
  for (let tick = 0; tick < 240; tick += 1) air = k.stepVtolDriving(air, idle, env);
  assert.ok(air.airborne, "no landing over water");
  assert.ok(Math.abs(air.y - 0.2) < 0.05, `hovers at water level (y=${air.y.toFixed(3)})`);
  assert.ok(air.verticalSpeed >= -1e-9, "hover floor stops the sink");
}

// ── 3) 天花板：爬升钳在 max(最高实体+40, 120) ──
{
  let air = { ...k.initialVtolState(-20, 0, 0, regionId), y: 100, airborne: true, verticalSpeed: 0, boost: 1 };
  for (let tick = 0; tick < 600; tick += 1) air = k.stepVtolDriving(air, thrust, env);
  assert.ok(air.y <= 120 + 1e-6, `ceiling clamps the climb (y=${air.y.toFixed(2)})`);
}

// ── 4) 上方实体裁剪：板（y 3..3.5）下方垂直离地被 trim ──
{
  const ground = { ...k.initialVtolState(0, 0, 0, regionId) };
  const lifted = env.lift(ground, 5);
  assert.ok(lifted.trimmed, "lift under the slab is trimmed");
  // 车顶（y+centerHeight+halfHeight ≈ y+1.15）到板底 3：约 y≈1.8 处接触
  assert.ok(lifted.y < 1.95, `trimmed below the slab underside (y=${lifted.y.toFixed(2)})`);
  assert.ok(lifted.y > 1.0, `still lifts partway (y=${lifted.y.toFixed(2)})`);
}

// ── 8) 审计不变式：stepDriving 忽略 thruster，默认路径逐位不变 ──
{
  const plain = new k.ContinuousDrivingEnvironment(regions, binding, k.GAMEPLAY_DRIVING_FOOTPRINT, k.GAMEPLAY_FOOTPRINT_PARAMS, {},
    { boundarySlide: true, mountablePolicy: "gameplay" });
  const from = { ...k.initialVtolState(-20, 0, 0, regionId) };
  const a = k.stepDriving(from, { ...fwd, thruster: true }, plain);
  const b = k.stepDriving(from, fwd, plain);
  assert.deepEqual(a, b, "thruster field must not change stepDriving behavior");
}

// ── 附加：DrivingKernel 全速飞行步进守卫不触发（用户路径经内核）──
{
  const kernel = new k.DrivingKernel(env, { baseSnapshotHash: "vtol", vehicleConfigHash: "vtol", kernelBuildId: "vtol-verify",
    physicsVersion: 0, collisionVersion: 0, queryVersion: 0 });
  let air = { ...k.initialVtolState(-20, 0, 0, regionId), y: 5, airborne: true, verticalSpeed: 0, boost: 1 };
  for (let tick = 0; tick < 900; tick += 1) {
    const step = kernel.step(air, { ...fwd, thruster: tick < 30 });
    air = { ...step.state, airborne: step.state.airborne ?? air.airborne, verticalSpeed: step.state.verticalSpeed ?? 0, boost: step.state.boost ?? 1 };
  }
  assert.ok(true, "kernel steps never throw under VTOL states at full air speed");
}

// ── 附加：诊断出生路径——出生状态不带 VTOL 字段（仅 DrivingState）也不得产生 NaN，
//   且能正常起飞（用户实测「Boost NaN」回归锁）──
{
  const bare = k.initialDrivingState(-20, 0, 0, regionId);
  assert.equal(bare.boost, undefined, "fixture precondition: bare spawn has no vtol fields");
  let s = k.stepVtolDriving(bare, thrust, env);
  assert.ok(Number.isFinite(s.boost) && s.boost >= 0.99, `bare-spawn boost heals to finite (${s.boost})`);
  assert.ok(Number.isFinite(s.verticalSpeed) && Number.isFinite(s.y), "bare-spawn vertical fields finite");
  let ticks = 0;
  while (!s.airborne && ticks < 240) { s = k.stepVtolDriving(s, thrust, env); ticks += 1; }
  assert.ok(s.airborne, `bare (diagnostic) spawn can take off (${ticks} ticks)`);
}

console.log(`VTOL driving (physics v${k.VTOL_PHYSICS_VERSION}): takeoff boost-drain/liftoff, air wall stop (strict), road landing + driving boost regen, water hover floor, ceiling clamp, overhead-slab lift trim, kernel-guard-compatible air steps, bare diagnostic spawn (no NaN), and stepDriving thruster invariance passed.`);
