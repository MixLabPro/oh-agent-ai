#!/usr/bin/env node
// Contract for the single local desktop event bus. The renderer receives only
// an allowlisted event type; payload fields are intentionally discarded.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ui = path.join(repo, "apps/desktop/ui-dev");
const uiRequire = createRequire(path.join(ui, "package.json"));
const { buildSync } = uiRequire("esbuild");
let callback = null;
let domCallback = null;
let subscribed = null;
let unsubscribed = false;
const built = buildSync({ entryPoints: [path.join(ui, "react/src/lib/tauri.ts")], bundle: true, format: "cjs", platform: "node", target: "node20", write: false, logLevel: "silent" });
const sandbox = {
  module: { exports: {} }, exports: {}, require: uiRequire,
  console: { error() {}, warn() {}, log() {} }, Intl, Date, Math, Promise, setTimeout, clearTimeout,
  window: {
    addEventListener: (event, handler) => { if (event === "agent-vitals-source-data-deleted") domCallback = handler; },
    removeEventListener: (event, handler) => { if (event === "agent-vitals-source-data-deleted" && domCallback === handler) domCallback = null; },
    __TAURI__: { event: { listen: async (event, handler) => { subscribed = event; callback = handler; return () => { unsubscribed = true; }; } } },
  },
};
vm.createContext(sandbox);
vm.runInContext(built.outputFiles[0].text, sandbox, { filename: "tauri-events.bundle.cjs" });
const { listenAppEvents } = sandbox.module.exports;
const events = [];
const unsubscribe = await listenAppEvents((event) => events.push(event));
assert.equal(subscribed, "app-event");
callback?.({ payload: { type: "SyncStatusChanged", secret: "must-not-cross" } });
callback?.({ payload: { type: "SourceDataDeleted", path: "/private/path" } });
callback?.({ payload: { type: "UnknownInternalEvent", secret: "drop" } });
callback?.({ payload: "malformed" });
domCallback?.();
assert.equal(JSON.stringify(events), JSON.stringify([{ type: "SyncStatusChanged" }, { type: "SourceDataDeleted" }, { type: "SourceDataDeleted" }]));
unsubscribe();
assert.equal(unsubscribed, true);
assert.equal(domCallback, null);

sandbox.window.__TAURI__.event.listen = async () => { throw new Error("webview closing"); };
const rejectedEvents = [];
const rejectedUnsubscribe = await listenAppEvents((event) => rejectedEvents.push(event));
assert.notEqual(domCallback, null);
domCallback?.();
assert.equal(JSON.stringify(rejectedEvents), JSON.stringify([{ type: "SourceDataDeleted" }]));
rejectedUnsubscribe();
assert.equal(domCallback, null);

const source = readFileSync(path.join(ui, "react/src/features/findings/FindingsPage.tsx"), "utf8");
assert.ok(source.includes("listenAppEvents"));
assert.ok(source.includes("eventRefreshTimer"));
assert.ok(!source.includes('listen("sync-status-updated"'));
assert.ok(!source.includes('listen("usage-fold-updated"'));
assert.ok(!source.includes('listen("trust-monitor-updated"'));
assert.ok(!source.includes('listen("source-data-deleted"'));
console.log("React event bus contract: OK (app-event allowlist, payload redaction, cleanup, burst queue)");
