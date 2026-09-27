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
const overviewPage = readFileSync(path.join(ui, "react/src/features/overview/OverviewPage.tsx"), "utf8");
const appPage = readFileSync(path.join(ui, "react/src/app/App.tsx"), "utf8");
assert.doesNotMatch(overviewPage, /overview\.(today_spend|month_spend)/, "cost cards must use authority daily/monthly summaries, not legacy DSH overview fields");
assert.doesNotMatch(overviewPage, /className="hero-panel"|把运行状态变成可理解的证据/, "overview should lead with useful metrics instead of a decorative hero card");
assert.doesNotMatch(appPage, /Workbench React migration/i, "migration placeholder title must not appear in the product UI");

// R2（OVERVIEW_DRILLDOWN spec §4.3/§7.2）：内嵌发现条的契约——存在性、
// 两态诚实降级、「去看会话」路径只给可过滤宿主且有会话证据的项（决策 #3）。
assert.match(overviewPage, /function OverviewFindingsStrip/, "overview must render the inline findings strip");
assert.match(overviewPage, /发现服务暂不可用/, "findings strip must state unavailability honestly");
assert.match(overviewPage, /当前没有需要注意的事项/, "findings strip must have an honest empty state");
assert.match(overviewPage, /item\.sessions_count > 0 && item\.host !== "generic" && item\.host !== "all"/, "evidence link only for filterable hosts with session evidence");
assert.match(overviewPage, /readFindings\(null\)/, "strip reads the existing safe findings projection (no new payload path)");
assert.match(overviewPage, /sessionsDateHref|sessionsHostHref/, "drill-down links go through the whitelisted nav helper");
assert.doesNotMatch(appPage, /工作台预览/, "production navigation must not call itself a preview");
assert.match(appPage, /<h1 className="visually-hidden">总览<\/h1>/, "compact overview still needs an accessible page heading");
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

function loadCacheHitMetric() {
  const built = buildSync({
    entryPoints: [path.join(ui, "react/src/features/overview/cacheHit.ts")],
    bundle: true,
    format: "cjs",
    platform: "node",
    target: "node20",
    write: false,
    logLevel: "silent",
  });
  const sandbox = { module: { exports: {} }, exports: {}, require: uiRequire, Object };
  vm.createContext(sandbox);
  vm.runInContext(built.outputFiles[0].text, sandbox, { filename: "overview-cache-hit.bundle.cjs" });
  return sandbox.module.exports.todayCacheHitRatio;
}

function loadSpendCards() {
  const built = buildSync({
    entryPoints: [path.join(ui, "react/src/features/overview/spendCards.ts")],
    bundle: true, format: "cjs", platform: "node", target: "node20", write: false, logLevel: "silent",
  });
  const sandbox = { module: { exports: {} }, exports: {}, require: uiRequire, Date, Object };
  vm.createContext(sandbox);
  vm.runInContext(built.outputFiles[0].text, sandbox, { filename: "overview-spend-cards.bundle.cjs" });
  return sandbox.module.exports;
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
const detailsSnapshot = await bridge.readOverviewDetails();
assert.equal(detailsSnapshot.month, month);
assert.equal(detailsSnapshot.date, date);
assert.equal(detailsSnapshot.authority_revision, 42);
assert.equal(detailsSnapshot.is_consistent, true);
assert.equal(detailsSnapshot.errors.length, 0);
assertTokenPartition(monthly);
assertTokenPartition(daily);
assertMoneyPartition(monthly);
assertMoneyPartition(daily);
const todayCacheHitRatio = loadCacheHitMetric();
const expectedInput = Object.values(daily.tokens_by_host).reduce((sum, host) => sum + host.uncached_input + host.cache_read + host.cache_write, 0);
const expectedRead = Object.values(daily.tokens_by_host).reduce((sum, host) => sum + host.cache_read, 0);
assert.equal(todayCacheHitRatio(daily), expectedInput > 0 ? expectedRead / expectedInput : null);
assert.equal(todayCacheHitRatio({ ...daily, tokens_by_host: { a: { total: 110, uncached_input: 10, cache_read: 90, cache_write: 0, output: 10 }, b: { total: 1010, uncached_input: 900, cache_read: 100, cache_write: 0, output: 10 } } }), 190 / 1100);
assert.equal(todayCacheHitRatio({ ...daily, tokens_by_host: { a: { total: 10, uncached_input: 0, cache_read: 0, cache_write: 0, output: 10 } } }), null);
assert.equal(todayCacheHitRatio({ ...daily, freshness: "unavailable" }), null);
const { todaySpendCard, monthSpendCard } = loadSpendCards();
const pricedMonth = { ...monthly, month: "2026-09", freshness: "fresh", actual_spend: { CNY: 182.55, USD: 40 }, spend_by_basis: { fixed_subscription: { CNY: 162, USD: 40 }, host_billed: { CNY: 20.55 } }, metered_view: { CNY: { amount: 100, actual: 20.55, declared_estimate: 79.45, default_estimate: 0, label: "mixed" } } };
const pricedDay = { ...daily, date: "2026-09-24", freshness: "fresh", actual_spend: {}, metered_view: { CNY: { amount: 80, actual: 0, declared_estimate: 80, default_estimate: 0, label: "estimate" } } };
assert.equal(monthSpendCard(pricedMonth).value, "¥182.55");
assert.match(monthSpendCard(pricedMonth).detail, /\$40\.00/);
assert.equal(todaySpendCard(pricedDay, pricedMonth).value, "¥5.40");
assert.match(todaySpendCard(pricedDay, pricedMonth).detail, /\$1\.33/);
assert.match(todaySpendCard(pricedDay, pricedMonth).detail, /非当日扣款/);
assert.match(todaySpendCard(pricedDay, pricedMonth).detail, /按量估算未计入实付/);
assert.equal(todaySpendCard(pricedDay, { ...pricedMonth, month: "2026-08" }).value, "—", "wrong month must not allocate subscriptions");
assert.equal(todaySpendCard({ ...pricedDay, freshness: "unavailable" }, pricedMonth).value, "—", "unavailable daily summary must not fabricate a daily amount");
assert.equal(todaySpendCard({ ...pricedDay, actual_spend: { CNY: 2 } }, pricedMonth).value, "¥7.40", "known daily metered charges add to the subscription allocation");
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

withOverride(async (command, args) => {
  const result = await originalInvoke(command, args);
  if (command !== "read_overview_details_snapshot") return result;
  return { ...result, is_consistent: false, errors: ["revision changed during query"] };
});
const inconsistent = await bridge.readOverviewDetails();
assert.equal(inconsistent.is_consistent, false);
assert.equal(inconsistent.authority_revision, 42);
assert.match(inconsistent.errors[0], /快照暂不可用/);
restore();

withOverride(async (command, args) => {
  const result = await originalInvoke(command, args);
  return command === "read_overview_details_snapshot" ? { ...result, month: "1900-01" } : result;
});
await assert.rejects(() => bridge.readOverviewDetails(), /窗口与请求不一致/);
restore();

console.log("React Overview/Usage contract: OK (revision-consistent snapshot, mock DTOs, malformed rejection, honest degradation)");
