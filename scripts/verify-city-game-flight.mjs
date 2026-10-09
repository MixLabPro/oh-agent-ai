#!/usr/bin/env node
// 游戏飞行守卫（§12 运动/输入）：
// 1) 固定物理步 + 相同输入，30/60/120 Hz 渲染分帧 → 终态一致（帧率不影响轨迹）；
// 2) 模拟状态无 NaN（含极端输入防护）；
// 3) sweepFlight 扫掠命中（楼体/地形/硬边界；大步跨越也检出，不只测当前点）；
// 4) FlightInput 按键映射、输入框忽略、失焦清空（DOM shim）；
// 5) 校准回放（CITY_GAME_FLIGHT_CALIBRATION_SPEC §9）：SPEC 点名的六个场景在
//    当前物理上留基线曲线并断言不变量；R1 候选档位（转弯减速等）在此对照。
import assert from "node:assert/strict";
import vm from "node:vm";
import { createRequire } from "node:module";

const require = createRequire(new URL("../apps/desktop/ui-dev/package.json", import.meta.url));
const { buildSync } = require("esbuild");
const load = (file, extraGlobals = {}) => {
  const code = buildSync({ entryPoints: [new URL(`../apps/agent-city/ui/src/${file}`, import.meta.url).pathname],
    bundle: true, write: false, format: "cjs", platform: "node" }).outputFiles[0].text;
  const mod = { exports: {} };
  vm.runInNewContext(code, { module: mod, exports: mod.exports, console, Date, Math, Map, Set, Number, String, Array, Object, JSON, performance: { now: () => 0 }, ...extraGlobals });
  return mod.exports;
};

const sim = load("game/FlightSimulation.ts");
const { FlightWorld } = load("game/FlightWorld.ts");
const { sweepFlight } = load("game/FlightCollision.ts");

const params = sim.flightParamsFor(600);
const INPUT = { throttleUp: true, throttleDown: false, turnLeft: true, turnRight: false, pitchUp: true, pitchDown: false };
const FIXED = 1 / 60;

// ── 1) 帧率无关：同一输入时长，按不同渲染帧切分固定步，终态一致 ──
function runAt(renderHz) {
  const frameDt = 1 / renderHz;
  let state = sim.initialSimState({ x: 0, y: 50, z: 0, heading: 0 }, params);
  let acc = 0;
  const frames = Math.round(10 / frameDt); // 10 秒模拟；帧数取整避免浮点累计漂移污染对比
  for (let frame = 0; frame < frames; frame += 1) {
    acc += frameDt;
    let guard = 0;
    while (acc >= FIXED - 1e-12 && guard < 5) {
      state = sim.stepFlight(state, INPUT, FIXED, params);
      acc -= FIXED;
      guard += 1;
    }
    if (guard >= 5) acc = 0; // 帧内步数上限（与 GameSession 相同的丢帧策略）
  }
  return state;
}
const at30 = runAt(30);
const at60 = runAt(60);
const at120 = runAt(120);
for (const state of [at30, at120]) {
  for (const key of ["x", "y", "z", "heading", "speed", "turnRate", "verticalSpeed", "bank", "simTime"]) {
    assert.ok(Math.abs(state[key] - at60[key]) < 1e-9, `帧率影响轨迹：${key} ${state[key]} vs ${at60[key]}`);
    assert.ok(Number.isFinite(state[key]), `${key} 非有限值`);
  }
}
assert.ok(at60.simTime > 9.8 && at60.simTime <= 10 + FIXED, "模拟时钟按固定步推进");
assert.ok(at60.speed <= params.maxSpeed + 1e-9 && at60.speed >= params.minSpeed - 1e-9, "速度在 [min,max] 内");
assert.ok(Math.abs(at60.bank) <= params.bankMax + 1e-9, "倾斜不超上限");

// ── 1b) 校准回放（CALIBRATION_SPEC §9 运动行）：确定性输入场景 + 基线曲线输出 ──
// 场景驱动固定 1/60 步；inputOf(state, step) 返回该步输入，录制速度/转向率曲线。
const EMPTY = { throttleUp: false, throttleDown: false, turnLeft: false, turnRight: false, pitchUp: false, pitchDown: false };
const W = { ...EMPTY, throttleUp: true };
const S = { ...EMPTY, throttleDown: true };
const A = { ...EMPTY, turnLeft: true };
function replay(name, inputOf, seconds) {
  let state = sim.initialSimState({ x: 0, y: 400, z: 0, heading: 0 }, params);
  const steps = Math.round(seconds / FIXED);
  const curve = [];
  for (let step = 0; step < steps; step += 1) {
    state = sim.stepFlight(state, inputOf(state, step), FIXED, params);
    if (step % Math.round(0.5 / FIXED) === 0 || step === steps - 1) curve.push({ t: +(step * FIXED).toFixed(2), speed: +state.speed.toFixed(2), turnRate: +state.turnRate.toFixed(3) });
  }
  for (const field of ["speed", "turnRate", "verticalSpeed", "bank"]) {
    assert.ok(Number.isFinite(state[field]), `${name}: ${field} 有限`);
  }
  assert.ok(state.speed >= params.minSpeed - 1e-9 && state.speed <= params.maxSpeed + 1e-9, `${name}: 速度边界`);
  return { name, curve, end: state };
}
// 转向符号（回归）：前向 = (cos h, 0, sin h)，追尾相机看向 +X 时屏幕右 = +Z。
// 曾经 A 键把飞机带向屏幕右侧，而上面所有场景只断言 |turnRate|，对符号不敏感。
{
  const D = { ...EMPTY, turnRight: true };
  const fly = (input) => { let s = sim.initialSimState({ x: 0, y: 400, z: 0, heading: 0 }, params); for (let i = 0; i < 60; i += 1) s = sim.stepFlight(s, input, FIXED, params); return s; };
  const left = fly(A), right = fly(D);
  assert.ok(left.z < 0 && left.heading < 0, "A 左转：飞机偏向 -Z（屏幕左），heading 减小");
  assert.ok(right.z > 0 && right.heading > 0, "D 右转：飞机偏向 +Z（屏幕右），heading 增大");
  assert.ok(left.bank < 0 && right.bank > 0, "bank 与转向同号（FlightVisuals 依赖：bank>0 = 右翼下沉 = 向右转的内侧）");
}
// 场景 1：稳定巡航 + 满舵 3 秒（R1 转弯减速候选的主对照；当前物理速度应保持巡航）。
const fullRudder = replay("cruise-full-rudder-3s", () => A, 3.0);
assert.ok(Math.abs(fullRudder.end.speed - params.cruiseSpeed) < 0.01, "场景1 基线：现物理转向不损失速度（候选档位将改变此断言）");
// 场景 2：满舵 1 秒后松舵——转向率应单调衰减到 0（指数平滑）。
const rudderDecay = replay("rudder-release-decay", (_state, step) => (step * FIXED < 1 ? A : EMPTY), 3.0);
const decayTurns = rudderDecay.curve.filter((point) => point.t >= 1).map((point) => Math.abs(point.turnRate));
assert.ok(decayTurns.every((value, index) => index === 0 || value <= decayTurns[index - 1] + 1e-6), "场景2 松舵后转向率单调衰减");
assert.ok(Math.abs(rudderDecay.end.turnRate) < 0.01, "场景2 转向率归零");
// 场景 3：W 冲到极速后纯松油门——速度回落巡航但不得跌破 min。
const releaseThrottle = replay("release-throttle", (_state, step) => (step * FIXED < 2 ? W : EMPTY), 4.0);
assert.ok(releaseThrottle.curve[3].speed > params.cruiseSpeed * 1.2, "场景3 两秒内显著超过巡航");
assert.ok(Math.abs(releaseThrottle.end.speed - params.cruiseSpeed) < params.cruiseSpeed * 0.05, "场景3 松手回到巡航附近");
// 场景 4：W 冲到极速后 S 刹车到底——逼近 min 且不越界。
const brake = replay("brake-to-min", (_state, step) => (step * FIXED < 2 ? W : S), 4.0);
assert.ok(brake.end.speed <= params.minSpeed + params.cruiseSpeed * 0.05, "场景4 刹车逼近 min");
assert.ok(brake.end.speed >= params.minSpeed - 1e-9, "场景4 刹车不穿 min");
// 场景 5/6：组合输入 W+转弯 / S+转弯——边界内且有限。
const wPlusTurn = replay("w-plus-turn", () => ({ ...W, turnLeft: true }), 3.0);
assert.ok(wPlusTurn.end.speed <= params.maxSpeed + 1e-9, "场景5 W+转弯不越 max");
const sPlusTurn = replay("s-plus-turn", () => ({ ...S, turnLeft: true }), 3.0);
assert.ok(sPlusTurn.end.speed >= params.minSpeed - 1e-9, "场景6 S+转弯不穿 min");
// 组合顺序确定性：W+转弯 与 先W后转弯 的终速一致（固定步顺序无关性）。
{
  const both = replay("w-and-turn-together", () => ({ ...W, turnLeft: true }), 2.0);
  let staged = sim.initialSimState({ x: 0, y: 400, z: 0, heading: 0 }, params);
  for (let step = 0; step < Math.round(1 / FIXED); step += 1) staged = sim.stepFlight(staged, W, FIXED, params);
  for (let step = 0; step < Math.round(1 / FIXED); step += 1) staged = sim.stepFlight(staged, { ...W, turnLeft: true }, FIXED, params);
  assert.ok(Math.abs(both.end.speed - staged.speed) < 0.01, "组合输入顺序确定性");
}
// 基线曲线输出（一行一场景，供候选档位 diff；格式 calibration-replay/<物理版本>）。
console.log(`calibration-replay/p${sim.PHYSICS_VERSION}: ` + [fullRudder, rudderDecay, releaseThrottle, brake, wPlusTurn, sPlusTurn]
  .map((scenario) => `${scenario.name}=${scenario.curve.map((point) => point.speed).join("/")}`).join(" | "));

// ── 2) NaN 防护：非有限状态不外泄 ──
{
  const broken = { ...at60, heading: NaN };
  const next = sim.stepFlight(broken, INPUT, FIXED, params);
  assert.ok([next.x, next.heading, next.speed].every(Number.isFinite), "NaN 状态必须被替换为安全值");
}

// ── 3) 碰撞扫掠 ──
const model0 = { generatedAt: 0, windowStartMs: 0, windowEndMs: 1, windowLabel: "t", districts: [], buildings: [], stats: { renderedSessions: 0, aggregatedSessions: 0, totalSessions: 0, tokensTotal: 0, activeCount: 0, truncated: false }, rows: new Map() };
const flatLayout = {
  scaleTier: 1, biome: "temperate", core: { x: 0, z: 0 }, islandRadius: 300, seed: 1,
  districts: [], blocks: [], roadNodes: [], roadEdges: [], terrain: { height: () => 0, slope: () => 0, buildable: () => true, coastRadius: () => 300, center: { x: 0, z: 0 }, radius: 300, hasRiver: false },
  extent: 300, coast: [], river: [], publicSites: [], parkTrees: [], urbanBounds: { left: -200, right: 200, north: -200, south: 200 },
  bridges: [], boatLanes: [], boundsRadius: 250, decorMountains: [], districtAnchors: [], highways: [], massing: [], civics: [], landmarks: [],
  seaside: null, coastalConfigKey: "none", coastalConfig: null, contextBuildings: [], gardens: [], boatLoops: [], seaMountains: [],
};
{
  // 空世界（无楼）：水平直线畅通；贴地与越界被检出。
  const world = new FlightWorld({ layout: flatLayout, model: model0, cursorMs: null });
  assert.equal(sweepFlight(world, { x: 0, y: 60, z: 0 }, { x: 40, y: 60, z: 0 }, 2), null, "畅通直线不误报");
  const ground = sweepFlight(world, { x: 0, y: 10, z: 0 }, { x: 0, y: 0.5, z: 0 }, 2);
  assert.ok(ground && (ground.kind === "terrain" || ground.kind === "bounds"), "下坠贴地检出（地形或垂直边界）");
  const outside = sweepFlight(world, { x: 0, y: 60, z: 0 }, { x: world.bounds.hardRadius * 1.5, y: 60, z: 0 }, 2);
  assert.ok(outside && outside.kind === "bounds", "硬边界检出");
}
{
  // 单楼扫掠：慢步与跨楼大步（瞬移尺度）都必须命中——不只测当前点。
  const layout = { ...flatLayout, districts: [{ id: "d", label: "d", center: { x: 0, z: 0 }, radius: 50, terrain: flatLayout.terrain,
    slots: new Map([["b1", { id: "b1", x: 100, z: 0, blockId: "blk", yaw: 0, zone: "residential", width: 8, depth: 8 }]]),
    grounds: new Map([["b1", 0]]), roads: [], carPaths: [], river: null, riverHalfWidth: 0, trees: [], plaza: { x: 0, z: 0, y: 0 }, anomaly: null, sessionCount: 1, landValue: new Map() }],
    landmarks: [], bridges: [] };
  const model = { ...model0, buildings: [{ id: "b1", districtId: "d", archetype: "tower", facade: 0, seed: 0.5, tokensTotal: 1e6, height: 30, footprint: 5, startedAt: 0, endedAt: null, active: false, builtFraction: 1, busyness: 0, aggregated: false, extraCount: 0 }] };
  const world = new FlightWorld({ layout, model, cursorMs: null });
  assert.equal(world.boxes.length, 1);
  const slow = sweepFlight(world, { x: 96, y: 15, z: 0 }, { x: 97, y: 15, z: 0 }, 1.5);
  assert.ok(slow && slow.kind === "box", "慢步进楼检出");
  const jump = sweepFlight(world, { x: 60, y: 15, z: 0 }, { x: 140, y: 15, z: 0 }, 1.5);
  assert.ok(jump && jump.kind === "box", "大步跨楼检出（扫掠）");
  assert.equal(sweepFlight(world, { x: 90, y: 45, z: 0 }, { x: 110, y: 45, z: 0 }, 1.5), null, "楼顶上方通过不误报");
}

// ── 4) FlightInput：映射/焦点门槛/输入框忽略/失焦清空（DOM shim）──
{
  class HTMLElement {}
  const listeners = new Map();
  const emitter = (target) => ({
    addEventListener: (type, fn) => { const list = listeners.get(`${target}:${type}`) ?? []; list.push(fn); listeners.set(`${target}:${type}`, list); },
    removeEventListener: (type, fn) => { const list = (listeners.get(`${target}:${type}`) ?? []).filter((item) => item !== fn); listeners.set(`${target}:${type}`, list); },
  });
  const documentShim = { visibilityState: "visible", activeElement: null, addEventListener: emitter("document").addEventListener, removeEventListener: emitter("document").removeEventListener };
  let canvasFocused = false;
  const { FlightInput } = load("game/FlightInput.ts", { window: emitter("window"), document: documentShim, HTMLElement });
  const interrupts = [];
  const input = new FlightInput({ isGameFocused: () => canvasFocused, shouldConsumeArrows: () => canvasFocused, onInterrupt: (reason) => interrupts.push(reason) });
  input.attach();
  const key = (code, target = null, extra = {}) => (listeners.get("window:keydown") ?? []).forEach((fn) => fn({ code, target, isComposing: false, repeat: false, preventDefault: () => {}, ...extra }));
  const keyUp = (code) => (listeners.get("window:keyup") ?? []).forEach((fn) => fn({ code, target: null }));
  // 画布未聚焦：按键不进入飞行状态（HUD 按钮/宿主控件聚焦时不误控飞机）。
  key("KeyW");
  assert.equal(input.snapshot().throttleUp, false, "未聚焦时 WASD 不进入飞行状态");
  canvasFocused = true;
  key("KeyW"); key("KeyA"); key("ArrowUp");
  const snapshotEqual = (value, expected, label) => {
    for (const field of Object.keys(expected)) assert.equal(value[field], expected[field], `${label}: ${field}`);
  };
  snapshotEqual(input.snapshot(), { throttleUp: true, throttleDown: false, turnLeft: true, turnRight: false, pitchUp: true, pitchDown: false }, "按键映射");
  // 输入框/输入法期间不处理。
  key("KeyS", Object.assign(Object.create(HTMLElement.prototype), { tagName: "INPUT", isContentEditable: false }));
  assert.equal(input.snapshot().throttleDown, false, "输入框内的按键不进入游戏");
  key("KeyS", null, { isComposing: true });
  assert.equal(input.snapshot().throttleDown, false, "输入法组合期间的按键不进入游戏");
  // 焦点离开画布后的 keyup 仍要清除（不粘键）。
  canvasFocused = false;
  keyUp("KeyW");
  assert.equal(input.snapshot().throttleUp, false, "未聚焦时 keyup 仍清除状态");
  // 失焦：清空按键 + focus-lost 回调。
  canvasFocused = true;
  key("KeyW");
  (listeners.get("window:blur") ?? []).forEach((fn) => fn());
  snapshotEqual(input.snapshot(), { throttleUp: false, throttleDown: false, turnLeft: false, turnRight: false, pitchUp: false, pitchDown: false }, "失焦清空按键");
  assert.equal(interrupts.at(-1), "focus-lost");
  // 文档隐藏：host-hidden。
  key("KeyW");
  documentShim.visibilityState = "hidden";
  (listeners.get("document:visibilitychange") ?? []).forEach((fn) => fn());
  assert.equal(input.snapshot().throttleUp, false);
  assert.equal(interrupts.at(-1), "host-hidden");
  // detach 后监听成对释放。
  input.detach();
  assert.equal(listeners.get("window:keydown")?.length ?? 0, 0, "detach 后 keydown 监听为空");
  assert.equal(listeners.get("window:blur")?.length ?? 0, 0, "detach 后 blur 监听为空");
}

console.log("verify-city-game-flight: ok");
