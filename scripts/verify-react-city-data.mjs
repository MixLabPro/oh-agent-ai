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
  entryPoints: [path.join(ui, "react/src/features/city/cityData.ts")], bundle: true, write: false,
  format: "cjs", platform: "node", logLevel: "silent",
  plugins: [{ name: "local-authority-fixture", setup(builder) {
    builder.onResolve({ filter: /\/lib\/tauri$|^\.\/tauri$/ }, () => ({ path: "authority", namespace: "fixture" }));
    builder.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({ contents: `
      export const readSessions = (...args) => fixture.readSessions(...args);
      export const readFindings = async () => ({issues:[]});
      export const readStatisticsTimezone = async () => ({timezone:"UTC"});
      export const listenAppEvents = async () => () => {};
      export const makeInvalidationGate = () => () => true;
      export const safeUiError = (_, fallback) => fallback;
      export const hasNativeBridge = () => false;
      export const invoke = async () => ({});
    ` }));
  } }],
});
const fixture = { readSessions: null };
const mod = { exports: {} };
vm.runInNewContext(out.outputFiles[0].text, { module: mod, exports: mod.exports, process, console, fixture, setTimeout, clearTimeout });
const { CityLoader } = mod.exports;
const row = (index) => ({ session_ref: `session:${index}`, host: "codex", tokens: { total: 1000 }, first_event_at: "2026-09-30T01:00:00Z", last_event_at: "2026-09-30T02:00:00Z" });

for (const count of [0, 1, 500, 501, 700, 4500, 5000]) {
  let requests = 0;
  fixture.readSessions = async ({ cursor, page_size }) => {
    requests += 1;
    const offset = cursor ? Number(cursor) : 0;
    const end = Math.min(count, offset + page_size);
    return { sessions: Array.from({ length: end - offset }, (_, i) => row(offset + i)), next_cursor: end < count ? String(end) : null, window_session_count: count };
  };
  const published = [];
  const loader = new CityLoader();
  await loader.begin("30d", { onModel: (result) => published.push(result) });
  assert(published.length > 0);
  assert.equal(published.at(-1).error, null);
  assert.equal(published.at(-1).model.stats.totalSessions, count);
  assert.equal(published.at(-1).model.stats.tokensTotal, Math.min(4500, count) * 1000, "the terminal page is included in token totals");
  assert.equal(published.at(-1).model.stats.truncated, count > 4500);
  assert.equal(requests, Math.max(1, Math.ceil(Math.min(4500, count) / 500)));
  loader.dispose();
}
console.log("City loader: empty, single-page, final-page and load-cap publication passed.");
