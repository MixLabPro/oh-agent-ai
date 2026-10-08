#!/usr/bin/env node
// 会话生命周期守卫（审查 P1-1 回归）：
// 1) 首次准备失败（城市未就绪）后「重试」必须完整重建 world/params/sim——
//    不得进入无模拟对象的空局面（telemetry 为 null 的 practice 是失败信号）；
// 2) restart 必须重建终态 mission（重赛进度不冻结）；
// 3) 挑战进入 → 倒计时经帧钩子推进 → racing；退出归还相机并回调 onExited。
import assert from "node:assert/strict";
import vm from "node:vm";
import { createRequire } from "node:module";

const require = createRequire(new URL("../apps/desktop/ui-dev/package.json", import.meta.url));
const { buildSync } = require("esbuild");
const THREE = createRequire(new URL("../apps/agent-city/ui/package.json", import.meta.url))("three");
const load = (file, extraGlobals = {}) => {
  const code = buildSync({ entryPoints: [new URL(`../apps/agent-city/ui/src/${file}`, import.meta.url).pathname],
    bundle: true, write: false, format: "cjs", platform: "node" }).outputFiles[0].text;
  const mod = { exports: {} };
  vm.runInNewContext(code, { module: mod, exports: mod.exports, console, Date, Math, Map, Set, Number, String, Array, Object, JSON,
    performance: { now: () => Date.now() }, ...extraGlobals });
  return mod.exports;
};
const noopEmitter = { addEventListener: () => {}, removeEventListener: () => {} };
// 可派发事件的 window 桩（GameSession 经 FlightInput 挂 window keydown/keyup）。
const windowListeners = new Map();
const windowShim = {
  addEventListener: (type, fn) => { const list = windowListeners.get(type) ?? []; list.push(fn); windowListeners.set(type, list); },
  removeEventListener: (type, fn) => { windowListeners.set(type, (windowListeners.get(type) ?? []).filter((item) => item !== fn)); },
  matchMedia: undefined, parent: null,
};
const documentShim = { visibilityState: "visible", activeElement: null, addEventListener: () => {}, removeEventListener: () => {} };
const pressKey = (code) => {
  for (const fn of windowListeners.get("keydown") ?? []) fn({ code, target: windowShim, isComposing: false, repeat: false, preventDefault: () => {} });
};
const releaseKey = (code) => {
  for (const fn of windowListeners.get("keyup") ?? []) fn({ code, target: windowShim });
};
const { buildCityModel } = load("cityModel.ts", { window: windowShim, document: documentShim });
const { layoutCity } = load("engine/cityLayout.ts");
const { GameSession } = load("game/GameSession.ts", { window: windowShim, document: documentShim, HTMLElement: class {}, self: windowShim });

const DAY = 86_400_000;
const now = Date.UTC(2026, 9, 1);
const tokens = (total) => ({ uncached_input_tokens: total, cache_read_tokens: 0, cache_write_tokens: 0, output_tokens: 0, total });
const rows = Array.from({ length: 40 }, (_, index) => {
  const first = now - DAY * 29 + index * 3_600_000;
  return { session_ref: `s:${index}`, harness: index % 2 ? "harness:zcode" : "harness:claude", first_event_at: new Date(first).toISOString(), last_event_at: new Date(first + 7_200_000).toISOString(),
    event_count: 10, model_ids: [], tokens: tokens(50_000 + (index % 37) * 900_000), peak_tokens: 0, cost_minor: null,
    cost_status: { state: "unavailable", reason: "test", has_unresolved: false } };
});
const model = buildCityModel({ rows, findings: [], windowStartMs: now - DAY * 30, windowEndMs: now, windowLabel: "30d",
  totalSessions: rows.length, truncated: false, generatedAt: now });
const layout = layoutCity(model, null, 42, null, "auto");

const returnView = { position: [10, 10, 10], target: [0, 0, 0], up: [0, 1, 0], fov: 42,
  controls: { minDistance: 3, maxDistance: 900, enablePan: true, zoomToCursor: true, orbitLockedId: null } };
function fakeEngine() {
  let frameHook = null;
  return {
    currentLayout: null, currentModel: null, replayCursor: null, owner: "orbit",
    setCameraOwner(owner) { this.owner = owner; return true; },
    captureReturnView: () => structuredClone(returnView),
    restoreReturnView(view) { this.restored = view; },
    attachGameObjects: () => {}, detachGameObjects: () => {},
    setGameFrameHook: (fn) => { frameHook = fn; },
    get frame() { return (dt) => frameHook?.(dt); },
    setLabelsVisible: () => {},
    renderCamera: new THREE.PerspectiveCamera(50, 1.6, 0.1, 2000),
    domCanvas: {},
  };
}

// ── 1) 准备失败 → 重试完整重建（不再进入空局面）──
{
  const engine = fakeEngine();
  const exited = [];
  const session = new GameSession(engine, { onState: () => {}, onExited: () => exited.push(true) });
  // 调用方报告 cityReady=true 但引擎布局尚未到位（分页/竞态）：控制器已进入 preparing，
  // ensureRunObjects 失败 → 错误面板。旧实现此时 world/params 为 null，重试会空跑。
  const host = { cityReady: true, cinemaActive: false, filmActive: false, busy: false };
  const failed = session.enter({ mode: "practice" }, host);
  assert.ok(!failed.ok && failed.reason === "not-ready");
  assert.equal(session.controller.snapshot.phase, "preparing");
  assert.ok(session.controller.snapshot.error, "失败进入错误面板");
  assert.ok(!session.snapshot().telemetry, "失败时不该有模拟读数");
  // 引擎数据到位后重试：必须长出完整模拟对象。
  engine.currentLayout = layout; engine.currentModel = model;
  session.retryPrepare();
  const snapshot = session.snapshot();
  assert.equal(snapshot.controller.phase, "practice", "重试后进入练习");
  assert.ok(snapshot.telemetry, "重试后必须有模拟读数（telemetry 非空 = sim 存在）");
  assert.ok(session.controller.simulating);
  // 练习 restart 仍可用。
  session.pause("user");
  session.restart();
  assert.equal(session.snapshot().controller.phase, "practice");
  assert.ok(session.snapshot().telemetry);
  session.exit();
  assert.equal(exited.length, 1);
  assert.equal(engine.owner, "orbit", "退出归还相机");
  assert.ok(engine.restored, "退出恢复返回视角");
}

// ── 2) 挑战：倒计时经帧钩子推进到 racing；终态 restart 重建 mission ──
{
  const engine = fakeEngine();
  engine.currentLayout = layout; engine.currentModel = model;
  const session = new GameSession(engine, { onState: () => {}, onExited: () => {} });
  const host = { cityReady: true, cinemaActive: false, filmActive: false, busy: false };
  const entered = session.enter({ mode: "race" }, host);
  assert.ok(entered.ok, `挑战可进入（${entered.ok ? "" : entered.reason}）`);
  assert.equal(session.snapshot().controller.phase, "countdown");
  assert.ok(session.snapshot().mission, "挑战带任务实例");
  const missionFirst = session.snapshot().mission;
  // 帧钩子推进倒计时（3s × 60fps）。
  for (let frame = 0; frame < 200; frame += 1) engine.frame(1 / 60);
  assert.equal(session.snapshot().controller.phase, "racing", "倒计时结束进入比赛");
  // 终态后的 restart：mission 必须是新实例（旧实例已终态，进度会冻结）。
  session.controller.raceFinished();
  assert.equal(session.snapshot().controller.phase, "result");
  session.restart();
  const after = session.snapshot();
  assert.equal(after.controller.phase, "countdown", "重赛回到倒计时");
  assert.ok(after.mission && after.mission !== missionFirst, "restart 重建任务实例");
  assert.equal(after.mission.progress, 0);
  session.exit();
}

// ── 3) 退出后再进入：输入适配器重新挂载（exit 清空 input 引用）──
{
  const engine = fakeEngine();
  engine.currentLayout = layout; engine.currentModel = model;
  const session = new GameSession(engine, { onState: () => {}, onExited: () => {} });
  const host = { cityReady: true, cinemaActive: false, filmActive: false, busy: false };
  assert.ok(session.enter({ mode: "practice" }, host).ok);
  session.exit();
  assert.ok(session.enter({ mode: "practice" }, host).ok, "退出后可再次进入");
  assert.ok(session.snapshot().telemetry);
  session.exit();
}

// ── 4) 输入→模拟→遥测 端到端：画布聚焦才生效（审查 P1-2 的会话级回归）──
{
  const engine = fakeEngine();
  engine.currentLayout = layout; engine.currentModel = model;
  const session = new GameSession(engine, { onState: () => {}, onExited: () => {} });
  assert.ok(session.enter({ mode: "practice" }, { cityReady: true, cinemaActive: false, filmActive: false, busy: false }).ok);
  const cruise = session.snapshot().telemetry.speed;
  // 未聚焦（焦点在宿主控件）：按住 W 推进 2s，速度不得上升。
  documentShim.activeElement = null;
  pressKey("KeyW");
  for (let frame = 0; frame < 120; frame += 1) engine.frame(1 / 60);
  assert.ok(Math.abs(session.snapshot().telemetry.speed - cruise) < 0.5, "未聚焦时 W 不加速");
  releaseKey("KeyW");
  // 画布聚焦：W 推进 2s，速度必须显著上升；松开后回落巡航。
  documentShim.activeElement = engine.domCanvas;
  pressKey("KeyW");
  for (let frame = 0; frame < 120; frame += 1) engine.frame(1 / 60);
  const accelerated = session.snapshot().telemetry.speed;
  assert.ok(accelerated > cruise * 1.2, `聚焦时 W 加速（${cruise} → ${accelerated}）`);
  releaseKey("KeyW");
  for (let frame = 0; frame < 120; frame += 1) engine.frame(1 / 60);
  assert.ok(Math.abs(session.snapshot().telemetry.speed - cruise) < 1.5, "松开后回到巡航");
  // keyup 在未聚焦时也清除（不粘键）：按住→切走焦点→松开→回焦，不应继续加速。
  documentShim.activeElement = engine.domCanvas;
  pressKey("KeyW");
  documentShim.activeElement = null;
  releaseKey("KeyW");
  documentShim.activeElement = engine.domCanvas;
  for (let frame = 0; frame < 60; frame += 1) engine.frame(1 / 60);
  assert.ok(Math.abs(session.snapshot().telemetry.speed - cruise) < 1.5, "未聚焦 keyup 仍清除（无粘键）");
  session.exit();
}

console.log("verify-city-game-session: ok");
