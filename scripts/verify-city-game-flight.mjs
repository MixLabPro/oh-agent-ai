#!/usr/bin/env node
// 游戏飞行守卫（§12 运动/输入）：
// 1) 固定物理步 + 相同输入，30/60/120 Hz 渲染分帧 → 终态一致（帧率不影响轨迹）；
// 2) 模拟状态无 NaN（含极端输入防护）；
// 3) sweepFlight 扫掠命中（楼体/地形/硬边界；大步跨越也检出，不只测当前点）；
// 4) FlightInput 按键映射、输入框忽略、失焦清空（DOM shim）。
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

// ── 4) FlightInput：映射/输入框忽略/失焦清空（DOM shim）──
{
  class HTMLElement {}
  const listeners = new Map();
  const emitter = (target) => ({
    addEventListener: (type, fn) => { const list = listeners.get(`${target}:${type}`) ?? []; list.push(fn); listeners.set(`${target}:${type}`, list); },
    removeEventListener: (type, fn) => { const list = (listeners.get(`${target}:${type}`) ?? []).filter((item) => item !== fn); listeners.set(`${target}:${type}`, list); },
  });
  const documentShim = { visibilityState: "visible", addEventListener: emitter("document").addEventListener, removeEventListener: emitter("document").removeEventListener };
  const { FlightInput } = load("game/FlightInput.ts", { window: emitter("window"), document: documentShim, HTMLElement });
  const interrupts = [];
  const input = new FlightInput({ shouldConsumeArrows: () => true, onInterrupt: (reason) => interrupts.push(reason) });
  input.attach();
  const key = (code, target = null, extra = {}) => (listeners.get("window:keydown") ?? []).forEach((fn) => fn({ code, target, isComposing: false, repeat: false, preventDefault: () => {}, ...extra }));
  const keyUp = (code) => (listeners.get("window:keyup") ?? []).forEach((fn) => fn({ code, target: null }));
  key("KeyW"); key("KeyA"); key("ArrowUp");
  const snapshotEqual = (value, expected, label) => {
    for (const field of Object.keys(expected)) assert.equal(value[field], expected[field], `${label}: ${field}`);
  };
  snapshotEqual(input.snapshot(), { throttleUp: true, throttleDown: false, turnLeft: true, turnRight: false, pitchUp: true, pitchDown: false }, "按键映射");
  // 输入框/输入法期间不处理。
  key("KeyD", new HTMLElement()); // 非 typing target：正常生效
  keyUp("KeyD");
  key("KeyS", Object.assign(Object.create(HTMLElement.prototype), { tagName: "INPUT", isContentEditable: false }));
  assert.equal(input.snapshot().throttleDown, false, "输入框内的按键不进入游戏");
  key("KeyS", null, { isComposing: true });
  assert.equal(input.snapshot().throttleDown, false, "输入法组合期间的按键不进入游戏");
  // 失焦：清空按键 + focus-lost 回调。
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
  const before = listeners.get("window:keydown")?.length ?? 0;
  assert.equal(before, 0, "detach 后 keydown 监听为空");
  const blurCount = listeners.get("window:blur")?.length ?? 0;
  assert.equal(blurCount, 0, "detach 后 blur 监听为空");
}

console.log("verify-city-game-flight: ok");
