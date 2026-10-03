#!/usr/bin/env node
import assert from "node:assert/strict";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ui = path.join(repo, "apps/desktop/ui-dev");
const { build } = createRequire(path.join(ui, "package.json"))("esbuild");
const out = await build({
  entryPoints: [path.join(repo, "apps/agent-city/ui/src/data/provider.ts")], bundle: true, write: false,
  format: "cjs", platform: "node", logLevel: "silent",
});
const mod = { exports: {} };
const windowStub = {
  parent: null,
  __AV_PLUGIN_INSTANCE__: undefined,
  addEventListener() {}, removeEventListener() {}, dispatchEvent() {},
  setTimeout, clearTimeout, setInterval, clearInterval,
};
windowStub.parent = windowStub;
vm.runInNewContext(out.outputFiles[0].text, {
  module: mod, exports: mod.exports, process, console, window: windowStub,
  location: { href: "http://localhost/" }, URL, setTimeout, clearTimeout,
});
const { tauriCityDataProvider } = mod.exports;
for (const windowDays of [7, 30, 90, 366]) {
  const projection = await tauriCityDataProvider.getProjection({ windowDays });
  assert.equal(projection.protocol, "city:v1");
  assert.equal(projection.window.days, windowDays);
  assert.equal(projection.status, "ready");
  assert(projection.sessions.every((session) => !("title" in session) && !("path" in session) && !("prompt" in session)));
  assert(projection.findings.every((finding) => ["critical", "warning", "info"].includes(finding.severity)));
  assert.equal(projection.coverage.total, projection.sessions.length);
}
windowStub.__AV_PLUGIN_INSTANCE__ = "plugin-city-test";
windowStub.__TAURI__ = { core: { async invoke(command, { request }) {
  assert.equal(command, "plugin_request");
  return { version: 1, requestId: request.requestId, ok: false, result: null,
    error: { code: "provider_unavailable", retryable: true } };
} } };
await assert.rejects(tauriCityDataProvider.getProjection({ windowDays: 30 }), /provider_unavailable/,
  "Embedded failures must not silently return synthetic sessions");
console.log("City data provider: versioned windows, standalone fixtures, redacted DTO and no embedded fixture fallback passed.");
