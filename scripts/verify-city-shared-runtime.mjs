#!/usr/bin/env node
// Cross-vehicle foundation: same lifecycle/clock, configurable input, one
// deterministic environment source. No renderer, profile or private data.
import assert from "node:assert/strict";
import fs from "node:fs";
import { loadCity } from "./city-kit/index.mjs";
const { GameRuntime, FlightAdapter, KeyboardInput, CityEnvironment, weatherAt } = await loadCity({
  "game/runtime/GameRuntime.ts": ["GameRuntime"], "game/runtime/FlightAdapter.ts": ["FlightAdapter"],
  "game/runtime/KeyboardInput.ts": ["KeyboardInput"], "engine/environment/CityEnvironment.ts": ["CityEnvironment"],
  "engine/environment/WeatherState.ts": ["weatherAt"],
});
const runtimeSource = fs.readFileSync(new URL("../apps/agent-city/ui/src/game/runtime/GameRuntime.ts", import.meta.url), "utf8");
assert.doesNotMatch(runtimeSource, /from\s+["'][^"']*(?:DrivingSimulation|CarAdapter|FlightSimulation|three|react)["']/);

function fixture(kind, overrides = {}) {
  const state = { valid: true, hook: null, steps: 0, frames: [], releases: 0, disposals: 0, prepares: 0 };
  const revision = `world:${kind}`;
  const lease = { revision, isCurrent: () => state.valid, setFrameHook: (hook) => { state.hook = hook; },
    release: () => { state.releases++; state.hook = null; } };
  const binding = { isCurrent: () => state.valid, prepare: () => { state.prepares++; },
    fixedStep: () => { state.steps++; }, present: (alpha) => state.frames.push(alpha),
    settle() {}, reset() {}, dispose: () => { state.disposals++; }, ...overrides };
  const adapter = kind === "plane" ? new FlightAdapter(revision, binding) : { revision, ...binding };
  return { state, lease, adapter };
}
// One runtime alternates adapter/input shapes with no residual hook or ownership.
{
  const runtime = new GameRuntime();
  for (let n = 0; n < 20; n++) {
    const kind = n % 2 ? "plane" : "car", f = fixture(kind);
    assert.equal(kind === "plane" ? runtime.enterSync(f.lease, f.adapter) : await runtime.enter(f.lease, f.adapter), true);
    assert.equal(runtime.snapshot.phase, "paused"); runtime.resume();
    runtime.setInput(kind === "plane" ? { throttleUp: true, pitchUp: true } : { forward: true });
    f.state.hook(1 / 30); assert.equal(f.state.steps, 2);
    runtime.pause(); const before = f.state.steps; f.state.hook(0.5); assert.equal(f.state.steps, before);
    runtime.exit(); runtime.exit();
    assert.equal(f.state.releases, 1); assert.equal(f.state.disposals, 1); assert.equal(f.state.hook, null);
  }
  runtime.dispose();
}
// Activity transition discards catch-up without forcing a pause (countdown -> race).
{
  const f = fixture("plane"), runtime = new GameRuntime();
  runtime.enterSync(f.lease, f.adapter); runtime.resume(); f.state.hook(0.2);
  assert.equal(f.state.steps, 5, "bounded catch-up");
  assert.equal(runtime.snapshot.phase, "paused", "overload pauses instead of silently skipping simulation time");
  assert.equal(runtime.snapshot.reason, "long-frame"); runtime.dispose();
}

// Activity transition discards catch-up without forcing a pause (countdown -> race).
{
  let ticks = 0;
  const f = fixture("plane", { fixedStep: () => { ticks++; return false; } });
  const runtime = new GameRuntime(); runtime.enterSync(f.lease, f.adapter); runtime.resume();
  f.state.hook(0.08); assert.equal(ticks, 1); assert.equal(runtime.snapshot.phase, "running");
  f.state.hook(1 / 60); assert.equal(ticks, 2); runtime.dispose();
}
// Invalidations fail closed for the plane as well as the car; old callbacks die.
{
  let errors = 0;
  const f = fixture("plane"), runtime = new GameRuntime({ onError: () => { errors++; } });
  runtime.enterSync(f.lease, f.adapter); runtime.resume(); const old = f.state.hook;
  f.state.valid = false; old(1 / 60);
  assert.equal(runtime.snapshot.phase, "error"); assert.equal(errors, 1);
  assert.equal(f.state.steps, 0); assert.equal(f.state.releases, 1);
  const next = fixture("plane"); assert.equal(runtime.enterSync(next.lease, next.adapter), true);
  old(1 / 60); assert.equal(next.state.steps, 0); runtime.dispose();
}
// Sync admission cannot accidentally activate an async/unfinished adapter.
{
  const f = fixture("car", { prepare: async () => {} }), runtime = new GameRuntime();
  assert.equal(runtime.enterSync(f.lease, f.adapter), false);
  assert.equal(runtime.snapshot.reason, "async-adapter-in-sync-entry");
  assert.equal(f.state.releases, 1); assert.equal(f.state.hook, null);
}
// Late async preparation cannot replace a newly entered flight activity.
{
  let complete;
  const f = fixture("car", { prepare: () => new Promise((resolve) => { complete = resolve; }) }), runtime = new GameRuntime();
  const pending = runtime.enter(f.lease, f.adapter); runtime.exit();
  const next = fixture("plane"); runtime.enterSync(next.lease, next.adapter);
  complete(); assert.equal(await pending, false);
  assert.equal(runtime.snapshot.revision, next.lease.revision); assert.equal(f.state.releases, 1); runtime.dispose();
}
// Deterministic weather/sky facts, replay seeks, clear cinematic override, no timers.
{
  const f = fixture("plane", { settle: () => { throw new Error("settle-failed"); } }), runtime = new GameRuntime();
  runtime.enterSync(f.lease, f.adapter); runtime.resume(); runtime.pause();
  assert.equal(runtime.snapshot.phase, "error"); assert.equal(f.state.releases, 1); assert.equal(f.state.disposals, 1);
}
{
  const runtime = new GameRuntime(), next = fixture("plane");
  const f = fixture("plane", { reset: () => { runtime.exit(); runtime.enterSync(next.lease, next.adapter); } });
  runtime.enterSync(f.lease, f.adapter);
  assert.equal(runtime.reset(), false, "a replaced reset must not mutate the new session");
  assert.equal(runtime.snapshot.revision, next.lease.revision); assert.equal(runtime.snapshot.phase, "paused");
  assert.equal(f.state.releases, 1); runtime.dispose(); assert.equal(next.state.releases, 1);
}

// Deterministic weather/sky facts, replay seeks, clear cinematic override, no timers.
{
  const environment = new CityEnvironment();
  const t = new Date(2026, 8, 4, 10, 30).getTime();
  const snapshot = environment.sample(t);
  assert.equal(environment.sample(t + 200), snapshot);
  assert.ok(Object.isFrozen(snapshot) && Object.isFrozen(snapshot.weather));
  assert.deepEqual(snapshot.weather, weatherAt(t));
  assert.equal(snapshot.rainIntensity, snapshot.weather.kind === "rain" ? snapshot.weather.intensity : 0);
  const cinematic = environment.sample(t, 18.5);
  assert.equal(cinematic.hour, 18.5); assert.equal(cinematic.rainIntensity, 0); assert.equal(cinematic.weather.kind, "clear");
  assert.deepEqual(environment.sample(t), snapshot);
  assert.deepEqual(environment.sample(t - 86400000), new CityEnvironment().sample(t - 86400000));
  assert.throws(() => environment.sample(NaN), /invalid-environment-time/);
}
// Input aliases, focused canvas, IME/modifiers, unconditional key-up and teardown.
{
  const emitter = () => {
    const map = new Map();
    return { addEventListener(type, fn) { const set = map.get(type) ?? new Set(); set.add(fn); map.set(type, set); },
      removeEventListener(type, fn) { map.get(type)?.delete(fn); }, fire(type, event) { for (const fn of [...(map.get(type) ?? [])]) fn(event); },
      count() { return [...map.values()].reduce((n, set) => n + set.size, 0); } };
  };
  globalThis.HTMLElement = class {};
  globalThis.window = emitter(); globalThis.document = { ...emitter(), visibilityState: "visible" };
  let focused = true; const interruptions = [];
  const source = new KeyboardInput({ keys: { KeyW: "forward", ArrowUp: "forward" }, emptyInput: () => ({ forward: false }),
    isFocused: () => focused, onInterrupt: (reason) => interruptions.push(reason) });
  const key = (code, extra = {}) => ({ code, target: null, preventDefault() {}, stopImmediatePropagation() {}, ...extra });
  source.attach(); source.attach();
  window.fire("keydown", key("KeyW", { isComposing: true })); assert.equal(source.snapshot().forward, false);
  window.fire("keydown", key("KeyW", { metaKey: true })); assert.equal(source.snapshot().forward, false);
  focused = false; window.fire("keydown", key("KeyW")); assert.equal(source.snapshot().forward, false);
  focused = true; window.fire("keydown", key("KeyW")); window.fire("keydown", key("ArrowUp"));
  window.fire("keyup", key("KeyW")); assert.equal(source.snapshot().forward, true, "other alias still held");
  focused = false; window.fire("keyup", key("ArrowUp")); assert.equal(source.snapshot().forward, false);
  focused = true; window.fire("keydown", key("KeyW")); window.fire("blur", {});
  assert.equal(source.snapshot().forward, false); assert.equal(interruptions.at(-1), "focus-lost");
  document.visibilityState = "hidden"; document.fire("visibilitychange", {}); assert.equal(interruptions.at(-1), "host-hidden");
  window.fire("__AV_PLUGIN_SUSPENDED__", {}); assert.equal(interruptions.at(-1), "host-suspended");
  source.detach(); source.detach(); assert.equal(window.count() + document.count(), 0);
  delete globalThis.window; delete globalThis.document; delete globalThis.HTMLElement;
}
console.log("Shared vehicle runtime: alternating adapters, activity boundaries, cancellation/stale cleanup, deterministic environment and keyboard ownership passed.");
