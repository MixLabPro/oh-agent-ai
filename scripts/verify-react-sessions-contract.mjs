#!/usr/bin/env node
// React bridge contract for the Sessions list/detail path. This locks the
// desktop-facing spelling of detail pagination (`page_size`, not the MCP
// `limit` field) and rejects unsafe windows or malformed page envelopes.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ui = path.join(repo, "apps/desktop/ui-dev");
const sessionsSource = readFileSync(path.join(ui, "react/src/features/sessions/SessionsPage.tsx"), "utf8");
const detailSource = readFileSync(path.join(ui, "react/src/features/sessions/SessionDetail.tsx"), "utf8");
assert.match(sessionsSource, /sessions-workspace-selected/, "selecting a session must open the desktop inspector beside the list");
assert.match(sessionsSource, /rows\.find\(\(row\) => row\.session_ref === selectedSessionRef\)/, "selection must resolve against refreshed rows by stable session_ref");
assert.doesNotMatch(sessionsSource, /useState<SessionRow \| null>/, "the inspector must not retain a stale row object across list refreshes");
assert.match(sessionsSource, /refreshKey=\{detailRefreshKey\}/, "list invalidation must also refresh the selected inspector");
assert.match(detailSource, /\[sessionRef, refreshKey\]/, "detail query must rerun when its parent refresh revision changes");
assert.match(detailSource, /setLoadingMore\(false\)/, "detail refresh must release an in-flight pagination button");
const uiRequire = createRequire(path.join(ui, "package.json"));
const { buildSync } = uiRequire("esbuild");

function loadMock() {
  const sandbox = { console: { error() {}, warn() {}, log() {} }, Intl, Date, Math, Promise, setTimeout, clearTimeout, window: {} };
  vm.createContext(sandbox);
  vm.runInContext(readFileSync(path.join(ui, "public/tauri-mock.js"), "utf8"), sandbox, { filename: "tauri-mock.js" });
  return sandbox.window.__TAURI__.core.invoke;
}

function loadBridge(invoke) {
  const built = buildSync({ entryPoints: [path.join(ui, "react/src/lib/tauri.ts")], bundle: true, format: "cjs", platform: "node", target: "node20", write: false, logLevel: "silent" });
  const sandbox = { module: { exports: {} }, exports: {}, require: uiRequire, console: { error() {}, warn() {}, log() {} }, Intl, Date, Math, Promise, setTimeout, clearTimeout, window: { __TAURI__: { core: { invoke } } } };
  vm.createContext(sandbox);
  vm.runInContext(built.outputFiles[0].text, sandbox, { filename: "tauri-sessions.bundle.cjs" });
  return sandbox.module.exports;
}

const originalInvoke = loadMock();
const calls = [];
const invoke = async (command, args) => {
  calls.push({ command, args });
  return originalInvoke(command, args);
};
const bridge = loadBridge(invoke);

const first = await bridge.readSessions({ month: "2026-09", page_size: 50 });
assert.equal(first.sessions.length, 1);
assert.equal(calls.at(-1).command, "sessions_list");
assert.equal(calls.at(-1).args.page_size, 50);
assert.equal(calls.at(-1).args.month, "2026-09");

const second = await bridge.readSessions({ month: "2026-09", page_size: 50, cursor: first.next_cursor });
assert.equal(second.sessions.length, 1);
assert.equal(calls.at(-1).args.cursor, "preview-next");
assert.notEqual(second.sessions[0].session_ref, first.sessions[0].session_ref);

const detail = await bridge.readSessionDetail("sr_browser_mock_01");
assert.equal(calls.at(-1).command, "sessions_read");
assert.equal(calls.at(-1).args.sessionRef, "sr_browser_mock_01");
assert.equal(calls.at(-1).args.page_size, 200);
assert.equal(calls.at(-1).args.limit, undefined);
const detailPage = await bridge.readSessionDetail("sr_browser_mock_01", "detail-next");
assert.equal(calls.at(-1).args.cursor, "detail-next");
assert.equal(detailPage.session_ref, detail.session_ref);

// The authority detail contract does not include the search row's peak_tokens.
// A valid detail must not be rejected or silently given a fabricated peak of 0.
const withoutListOnlyPeak = loadBridge(async (command, args) => {
  const value = await originalInvoke(command, args);
  if (command !== "sessions_read") return value;
  const copy = structuredClone(value);
  delete copy.data.peak_tokens;
  return copy;
});
const detailWithoutPeak = await withoutListOnlyPeak.readSessionDetail("sr_browser_mock_01");
assert.equal(Object.hasOwn(detailWithoutPeak, "peak_tokens"), false);

await assert.rejects(() => bridge.readSessions({ date_from: "2026-09-10" }), /成对/);
await assert.rejects(() => bridge.readSessions({ date_from: "2026-09-11", date_to: "2026-09-10" }), /起点不能晚于终点/);
await assert.rejects(() => bridge.readSessionDetail("native-session-id"), /session_ref 不安全/);

const malformed = async (command, args) => {
  if (command === "sessions_read") {
    return { data: { ...await originalInvoke(command, args).then((value) => value.data), session_ref: "sr_browser_mock_01", timeline: [], workflow_timeline: [], billing_breakdown: [], has_more: true, next_cursor: null, workflow_has_more: false } };
  }
  return originalInvoke(command, args);
};
const malformedBridge = loadBridge(malformed);
await assert.rejects(() => malformedBridge.readSessionDetail("sr_browser_mock_01"), /分页缺少 next_cursor/);

console.log("React Sessions contract: OK (split inspector, stable selection, list/detail pagination, safe filters, malformed rejection)");
