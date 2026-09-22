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
callback?.({ payload: { type: "WatcherHealthChanged", mode: "active", topology_revision: 2, pending_roots: 0, reason_code: null } });
callback?.({ payload: { type: "WatcherHealthChanged", mode: "not-a-mode", raw: "/private/path" } });
callback?.({ payload: { type: "UnknownInternalEvent", secret: "drop" } });
callback?.({ payload: "malformed" });
domCallback?.();
assert.equal(JSON.stringify(events), JSON.stringify([
  { type: "SyncStatusChanged" },
  { type: "SourceDataDeleted" },
  { type: "WatcherHealthChanged" },
  { type: "WatcherHealthChanged" },
  { type: "SourceDataDeleted" },
]));
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

const { parseWatcherHealth } = sandbox.module.exports;
// vm 跨 realm 对象不做 deepEqual（原型不同）——按本文件惯例用 JSON 串比较。
assert.equal(
  JSON.stringify(parseWatcherHealth({ status: "ok", mode: "active", reason_code: null, topology_revision: 7, pending_roots: 0 })),
  JSON.stringify({ mode: "active", reasonCode: null, topologyRevision: 7, pendingRoots: 0 }),
);
assert.equal(
  JSON.stringify(parseWatcherHealth({ mode: "degraded", reason_code: "backend_init_failed", topology_revision: 1e12, pending_roots: 3 })),
  JSON.stringify({ mode: "degraded", reasonCode: "backend_init_failed", topologyRevision: 0, pendingRoots: 3 }),
  "越界 revision 限幅为 0，mode 与短 reason 照收",
);
assert.equal(parseWatcherHealth({ mode: "escalated", topology_revision: 1, pending_roots: 0 }), null, "闭集外 mode 必须拒绝");
assert.equal(
  JSON.stringify(parseWatcherHealth({ mode: "active", reason_code: "/private/raw/path/error" })),
  JSON.stringify({ mode: "active", reasonCode: null, topologyRevision: 0, pendingRoots: 0 }),
  "超长/路径样 reason 拒为 null",
);
assert.equal(parseWatcherHealth(null), null);
assert.equal(parseWatcherHealth("string"), null);

const source = readFileSync(path.join(ui, "react/src/features/findings/FindingsPage.tsx"), "utf8");
assert.ok(source.includes("listenAppEvents"));
assert.ok(source.includes("eventRefreshTimer"));
assert.ok(!source.includes('listen("sync-status-updated"'));
assert.ok(!source.includes('listen("usage-fold-updated"'));
assert.ok(!source.includes('listen("trust-monitor-updated"'));
assert.ok(!source.includes('listen("source-data-deleted"'));
console.log("React event bus contract: OK (app-event allowlist, payload redaction, cleanup, burst queue, watcher-health closed set)");
