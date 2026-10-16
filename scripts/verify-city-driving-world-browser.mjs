#!/usr/bin/env node
// Synthetic host-only fixture. Never mounts CityApp, data providers or plugin IPC.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { loadCity } from "./city-kit/index.mjs";
import { sessionModel } from "./city-kit/session-models.mjs";
const require = createRequire(new URL("../apps/desktop/ui-dev/package.json", import.meta.url));
const { chromium } = require("playwright");
const { buildCityModel } = await loadCity({ "cityModel.ts": ["buildCityModel"] });
const model = sessionModel(buildCityModel, 90), base = process.argv[2] ?? "http://127.0.0.1:5179";
const browser = await chromium.launch({ channel: "chromium", headless: true, args: ["--use-angle=metal"] });
try {
  const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
  const errors = []; page.on("pageerror", (e) => errors.push(e.message));
  await page.route(new URL("/__driving-world-test", base).href, (route) => route.fulfill({ contentType: "text/html", body: "<!doctype html><canvas width='800' height='600'></canvas>" }));
  await page.goto(new URL("/__driving-world-test", base).href);
  const result = await page.evaluate(async (model) => {
    const { CityEngine } = await import("/src/engine/CityEngine.ts");
    const { captureRenderedSolids } = await import("/src/engine/surface/renderedSolids.ts");
    const { createCityCarSession } = await import("/src/game/runtime/createCityCarSession.ts");
    const { GameRuntime } = await import("/src/game/runtime/GameRuntime.ts");
    const check = (ok, message) => { if (!ok) throw new Error(message); };
    const same = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
    const engine = new CityEngine({ canvas: document.querySelector("canvas"), headless: true });
    const leases = [];
    const acquire = async () => { const c = await engine.captureDrivingWorld(); check(c.status === "ready", "world lease ready"); leases.push(c); return c; };
    const matchActual = (lease) => {
      const actual = captureRenderedSolids(engine.parts.drivingRoots).solids, owned = lease.readWorld().renderedSolids;
      check(actual.length === owned.length, "registered render mesh count matches");
      for (let i = 0; i < owned.length; i++) check(actual[i].id === owned[i].id && same(actual[i].positions, owned[i].positions) && same(actual[i].indices, owned[i].indices) && same(actual[i].transforms, owned[i].transforms), "exact current geometry and world instance matrices");
      return owned;
    };
    try {
      engine.setSeed(1); engine.applyModel(model);
      const [a, b] = await Promise.all([acquire(), acquire()]);
      check(a.worldRevision === b.worldRevision && engine.parts.drivingFreezeCount === 2, "shared freeze, independent leases");
      const solids = matchActual(a), roles = new Set(solids.map((s) => s.role));
      check(roles.has("building") && roles.has("landmark") && solids.some((s) => s.transforms.length > 16), "actual buildings, landmarks and instanced geometry present");
      check(a.readWorld().obstacleCoverage === "structures-and-rendered-buildings", "bounded coverage explicit");
      const mutatedCopy = a.readWorld(); mutatedCopy.renderedSolids[0].positions.fill(123);
      check(a.isCurrent() && a.readWorld().renderedSolids[0].positions[0] !== 123, "defensive typed array ownership");
      engine.parts.update(1, 10); check(a.isCurrent(), "frame cannot change frozen displayed geometry");
      engine.setTimeCursor(model.windowStartMs, { playing: false }); engine.parts.update(1, 11);
      check(a.isCurrent() && b.isCurrent(), "time jump queues while freeze held"); matchActual(a);
      let framesA = 0, framesB = 0;
      a.setFrameHook(() => framesA++);
      let refused = false; try { b.setFrameHook(() => framesB++); } catch { refused = true; }
      check(refused, "second frame owner refused"); engine.updateScene(0.02); check(framesA === 1 && framesB === 0, "single host frame callback");
      const afterFrame = captureRenderedSolids(engine.parts.drivingRoots).solids;
      for (let i=0;i<solids.length;i++) check(afterFrame[i] && same(solids[i].positions,afterFrame[i].positions) && same(solids[i].indices,afterFrame[i].indices) && same(solids[i].transforms,afterFrame[i].transforms), `freeze changed on host frame at ${solids[i].id}, role=${solids[i].role}, name=${engine.parts.drivingRoots[Number(solids[i].id.split(":")[2])]?.object.name}`);
      a.release(); a.release(); check(!a.isCurrent() && a.readWorld() === null && b.isCurrent(), `individual release idempotent and cannot unfreeze peer: freeze=${engine.parts.drivingFreezeCount},a=${a.isCurrent()},b=${b.isCurrent()}`);
      b.setFrameHook(() => framesB++); a.setFrameHook(null); engine.updateScene(0.02);
      check(framesA === 1 && framesB === 1, "old lease cannot clear new frame owner");
      b.release(); check(engine.parts.drivingFreezeCount === 0 && !b.isCurrent(), "last release restores time changes");
      const atStart = await acquire(); check(atStart.worldRevision !== b.worldRevision, "actual displayed height participates in identity"); matchActual(atStart);
      atStart.release();
      const repeated = await acquire(); check(repeated.worldRevision === atStart.worldRevision, "lease token does not change content identity"); repeated.release();
      const controller = new AbortController(); const cancelled = engine.captureDrivingWorld(controller.signal); controller.abort();
      check((await cancelled).status === "cancelled" && engine.parts.drivingFreezeCount === 0, "cancelled hash releases freeze");
      const tampered = await acquire();
      const shaft = engine.parts.shaftMeshes.find((m) => m.count > 0), value = shaft.instanceMatrix.array[13];
      shaft.instanceMatrix.array[13] = value + 1;
      check(!tampered.isCurrent() && tampered.readWorld() === null, "unexpected live geometry mutation invalidates frozen handle");
      shaft.instanceMatrix.array[13] = value; check(!tampered.isCurrent(), "restoring geometry cannot revive handle"); tampered.release();
      const disposedGeometry = await acquire(); shaft.geometry.dispose(); check(!disposedGeometry.isCurrent(), "geometry dispose invalidates frozen mesh"); disposedGeometry.release();
      const originalInfluences = shaft.morphTargetInfluences; shaft.morphTargetInfluences = [1];
      check((await engine.captureDrivingWorld()).status === "unavailable" && engine.parts.drivingFreezeCount === 0, "unsupported geometry releases acquired freeze"); shaft.morphTargetInfluences = originalInfluences;
      const originalCount = shaft.count; shaft.count = 100001;
      check((await engine.captureDrivingWorld()).status === "unavailable" && engine.parts.drivingFreezeCount === 0, "instance budget fails closed without retained freeze"); shaft.count = originalCount;
      const old = await acquire(); engine.applyModel(model, true); check(!old.isCurrent(), "rebuild invalidates lease"); old.release();
      const runtime = new GameRuntime();
      const entry = await createCityCarSession(engine, runtime, { x: 0, z: 0, heading: 0, layerId: "ground",
        collider: { dimensions: { halfWidth: 0.9, halfLength: 2, halfHeight: 0.75 }, centerHeight: 0.75, vehicleConfigHash: "synthetic-browser-car" }, present() {} });
      check(entry.status === "unavailable" && entry.reason === "unavailable-rendered-collision", "real city factory closes unsupported architectural collision");
      check(engine.parts.drivingFreezeCount === 0 && engine.drivingWorldFrame === null, "refused entry releases freeze and frame ownership"); runtime.dispose();
      const fresh = await acquire(); matchActual(fresh); engine.dispose(); check(!fresh.isCurrent(), "dispose invalidates lease"); fresh.release();
      check((await engine.captureDrivingWorld()).status === "unavailable", "disposed world unavailable");
      return { meshes: solids.length, roles: [...roles], instances: solids.reduce((n, s) => n + s.transforms.length / 16, 0) };
    } finally { for (const lease of leases) lease.release(); engine.dispose(); }
  }, model);
  assert.deepEqual(errors, []);
  console.log(`Driving world browser: ${result.meshes} registered meshes / ${result.instances} instances (${result.roles.join(", ")}); exact render buffers/matrices, independent freeze leases, deferred timeline, token frame hook, cancellation, mutation, rebuild and disposal passed.`);
} finally { await browser.close(); }
