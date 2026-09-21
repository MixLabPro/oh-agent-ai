#!/usr/bin/env node
// React bridge contract test for Overview/Usage summary DTOs.
// It executes the same browser facade used by visual development and bundles
// the real TypeScript bridge, so this test exercises parser rejection rather
// than merely checking fixture JSON.
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

function loadMock() {
  const sandbox = {
    console: { error() {}, warn() {}, log() {} },
    Intl, Date, Math, Promise, setTimeout, clearTimeout,
    window: {},
  };
  vm.createContext(sandbox);
  vm.runInContext(readFileSync(path.join(ui, "public/tauri-mock.js"), "utf8"), sandbox, { filename: "tauri-mock.js" });
  return sandbox.window.__TAURI__.core.invoke;
}

function loadBridge(invoke) {
  const built = buildSync({
    entryPoints: [path.join(ui, "react/src/lib/tauri.ts")],
    bundle: true,
    format: "cjs",
    platform: "node",
    target: "node20",
    write: false,
    logLevel: "silent",
  });
  const sandbox = {
    module: { exports: {} }, exports: {}, require: uiRequire,
    console: { error() {}, warn() {}, log() {} },
    Intl, Date, Math, Promise, setTimeout, clearTimeout,
    window: { __TAURI__: { core: { invoke } } },
  };
  vm.createContext(sandbox);
  vm.runInContext(built.outputFiles[0].text, sandbox, { filename: "tauri-bridge.bundle.cjs" });
  return { bridge: sandbox.module.exports, window: sandbox.window };
}

function currentWindow() {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const year = parts.find((part) => part.type === "year")?.value ?? "1970";
  const month = parts.find((part) => part.type === "month")?.value ?? "01";
  const day = parts.find((part) => part.type === "day")?.value ?? "01";
  return { month: `${year}-${month}`, date: `${year}-${month}-${day}` };
}

function assertTokenPartition(summary) {
  for (const row of Object.values(summary.tokens_by_host)) {
    assert.equal(row.total, row.uncached_input + row.cache_read + row.cache_write + row.output);
    assert.ok(row.cache_hit_ratio === null || (row.cache_hit_ratio >= 0 && row.cache_hit_ratio <= 1));
  }
}

function assertMoneyPartition(summary) {
  const aggregate = {};
  for (const amounts of Object.values(summary.spend_by_basis)) {
    for (const [currency, amount] of Object.entries(amounts)) aggregate[currency] = (aggregate[currency] ?? 0) + amount;
  }
  const currencies = new Set([...Object.keys(summary.actual_spend), ...Object.keys(aggregate)]);
  for (const currency of currencies) {
    const total = summary.actual_spend[currency] ?? 0;
    const sum = aggregate[currency] ?? 0;
    const tolerance = Math.max(1e-9, Math.max(Math.abs(total), Math.abs(sum)) * 1e-12);
    assert.ok(Math.abs(total - sum) <= tolerance, currency);
  }
}

const fixtureInvoke = loadMock();
const loaded = loadBridge(fixtureInvoke);
const { bridge, window } = loaded;
const { month, date } = currentWindow();

const monthly = await bridge.readUsageSourceSummary(month);
const daily = await bridge.readDailySummary(date);
const calendar = await bridge.readUsageCalendar(month);
assert.equal(monthly.month, month);
assert.equal(daily.date, date);
assert.equal(calendar.month, month);
assertTokenPartition(monthly);
assertTokenPartition(daily);
assertMoneyPartition(monthly);
assertMoneyPartition(daily);
for (const day of calendar.days) assert.equal(day.total_tokens, day.dsh_tokens + day.claude_tokens + day.codex_tokens);

const originalInvoke = fixtureInvoke;
const withOverride = (override) => { window.__TAURI__.core.invoke = override; };
const restore = () => { window.__TAURI__.core.invoke = originalInvoke; };

let value;
withOverride(async (command, args) => {
  value = await originalInvoke(command, args);
  if (command === "data_monthly_summary") {
    value = structuredClone(value);
    value.actual_spend_by_basis.metered_actual.CNY = "not-a-number";
  }
  return value;
});
await assert.rejects(() => bridge.readUsageSourceSummary(month), /金额不安全/);
restore();

withOverride(async (command, args) => {
  value = await originalInvoke(command, args);
  if (command === "data_monthly_summary") {
    value = structuredClone(value);
    value.total_actual_spend.CNY += 1;
  }
  return value;
});
await assert.rejects(() => bridge.readUsageSourceSummary(month), /basis 不守恒/);
restore();

withOverride(async (command, args) => {
  value = await originalInvoke(command, args);
  if (command === "data_daily_summary") {
    value = structuredClone(value);
    delete value.tokens_by_host.codex.output;
  }
  return value;
});
await assert.rejects(() => bridge.readDailySummary(date), /字段|数值|token/);
restore();

withOverride(async (command, args) => {
  value = await originalInvoke(command, args);
  if (command === "data_monthly_summary") {
    value = structuredClone(value);
    value.tokens_by_host.codex.cache_hit_ratio = 2;
  }
  return value;
});
await assert.rejects(() => bridge.readUsageSourceSummary(month), /cache hit ratio/);
restore();

withOverride(async (command, args) => {
  value = await originalInvoke(command, args);
  if (command === "data_monthly_summary") {
    value = structuredClone(value);
    value.coverage.measured_fields = value.coverage.total_fields + 1;
  }
  return value;
});
await assert.rejects(() => bridge.readUsageSourceSummary(month), /coverage/);
restore();

withOverride(async (command, args) => {
  value = await originalInvoke(command, args);
  if (command === "data_monthly_summary") {
    value = structuredClone(value);
    value.month = "1900-01";
  }
  return value;
});
await assert.rejects(() => bridge.readUsageSourceSummary(month), /错误月份|月份/);
restore();

for (const failedCommand of ["data_monthly_summary", "data_daily_summary", "read_calendar_month"]) {
  withOverride(async (command, args) => command === failedCommand
    ? Promise.reject(new Error("database unavailable"))
    : originalInvoke(command, args));
  const details = await bridge.readOverviewDetails();
  assert.equal(details.monthly === null, failedCommand === "data_monthly_summary");
  assert.equal(details.daily === null, failedCommand === "data_daily_summary");
  assert.equal(details.calendar === null, failedCommand === "read_calendar_month");
  assert.equal(details.errors.length, 1);
  restore();
}

console.log("React Overview/Usage contract: OK (real bridge parser, mock DTOs, malformed rejection, independent degradation)");
