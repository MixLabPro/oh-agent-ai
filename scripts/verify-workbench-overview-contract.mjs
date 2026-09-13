// B1-M1.1: execute the production loader against the browser fixtures. This is
// a boundary regression test, not evidence of native Authority integration.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const source = read("apps/desktop/src-tauri/ui/workbench.js");
const mock = read("apps/desktop/ui-dev/public/tauri-mock.js");
const elements = new Map();
const element = () => ({ textContent: "", innerHTML: "", hidden: false, style: {}, dataset: {},
  setAttribute() {},
  classList: { toggle() {}, add() {}, remove() {} }, appendChild() {}, append() {}, addEventListener() {},
  querySelector() { return element(); }, querySelectorAll() { return []; },
});
const sandbox = {
  console: { warn() {}, error() {} },
  window: { addEventListener() {} },
  document: { addEventListener() {}, querySelectorAll() { return []; },
    getElementById(id) { if (!elements.has(id)) elements.set(id, element()); return elements.get(id); },
    createElement: element, createTextNode: (textContent) => ({ textContent }),
  },
  sessionStorage: { getItem() { return null; }, setItem() {} },
};
vm.createContext(sandbox);
vm.runInContext(mock, sandbox);
const fixtureInvoke = sandbox.window.__TAURI__.core.invoke;
const calls = [];
let override = null;
sandbox.window.__TAURI__.core.invoke = async (command, args) => {
  calls.push({ command, args });
  if (override) return override(command, args);
  return fixtureInvoke(command, args);
};
vm.runInContext(source, sandbox);
const requests = vm.runInContext("OVERVIEW_REQUESTS", sandbox);
const expected = ["read_overview", "data_monthly_summary", "data_daily_summary", "read_calendar_month",
  "data_source_status", "data_status", "data_codex_quota", "billing_import_candidates",
  "billing_declarations", "billing_recalculation_jobs"];
assert.deepEqual(Array.from(requests, (r) => r.command).sort(), expected.sort());
for (const command of [...expected, "statistics_timezone_config"]) {
  assert.ok(mock.includes('case "' + command + '":'), command + " has an explicit fixture");
  assert.match(mock.slice(0, mock.indexOf('case "' + command + '":')).split('\n').at(-2), /Shape:.*\.rs:\d+/, command + " cites a Rust producer");
}
await assert.rejects(fixtureInvoke("unregistered_overview_command"), /Unsupported browser mock command/);
await fixtureInvoke("save_statistics_timezone_config", { timezone: "Pacific/Kiritimati" });
let result = await sandbox.loadOverviewData();
assert.deepEqual(Object.keys(result.errors), []);
assert.equal(calls[0].command, "statistics_timezone_config");
assert.equal(calls.length, 11);
for (const { command, args } of calls) {
  if (command === "data_daily_summary") assert.equal(args.date, result.window.date);
  if (["data_monthly_summary", "read_calendar_month"].includes(command)) assert.equal(args.month, result.window.month);
}
assert.equal(result.window.month, result.window.date.slice(0, 7));
assert.equal(vm.runInContext("statisticsTimezoneName()", sandbox), "Pacific/Kiritimati");
assert.equal(result.data.daily.date, result.window.date);
assert.equal(result.data.monthly.month, result.window.month);

// Every missing/malformed command becomes its own error; siblings survive.
for (const request of requests) {
  override = async (command, args) => command === request.command ? {} : fixtureInvoke(command, args);
  result = await sandbox.loadOverviewData();
  assert.equal(result.errors[request.key].code, "schema-mismatch", request.command);
  assert.equal(result.data[request.key], null);
  assert.equal(Object.keys(result.errors).length, 1);
}
override = async (command, args) => {
  if (command === "data_daily_summary") throw { error: { code: "database_unreadable", message: "fixture" } };
  return fixtureInvoke(command, args);
};
result = await sandbox.loadOverviewData();
assert.equal(result.errors.daily.code, "database_unreadable");
assert.ok(result.data.monthly && result.data.calendar);
override = async (command, args) => command === "data_status"
  ? { status: "unavailable", code: "database_missing" } : fixtureInvoke(command, args);
result = await sandbox.loadOverviewData();
assert.equal(result.errors.quality.code, "database_missing");
override = async (command, args) => command === "data_codex_quota" ? null : fixtureInvoke(command, args);
result = await sandbox.loadOverviewData();
assert.equal(result.data.quota, null);
assert.deepEqual(Object.keys(result.errors), []);

// Invalid numeric fields cannot become NaN or fabricated zero in a renderer.
override = async (command, args) => {
  const value = await fixtureInvoke(command, args);
  if (command === "data_daily_summary") delete value.tokens_by_host.codex.output;
  return value;
};
result = await sandbox.loadOverviewData();
assert.equal(result.errors.daily.code, "schema-mismatch");

// A DTO for another window is invalid even if all numeric fields are present.
override = async (command, args) => {
  const value = await fixtureInvoke(command, args);
  if (command === "data_monthly_summary") value.month = "1900-01";
  return value;
};
result = await sandbox.loadOverviewData();
assert.equal(result.errors.monthly.code, "schema-mismatch");

// A slow billing request must not serialize the independent command launches.
let release;
override = async (command, args) => command === "billing_import_candidates"
  ? new Promise((resolve) => { release = () => resolve(fixtureInvoke(command, args)); })
  : fixtureInvoke(command, args);
calls.length = 0;
const loading = sandbox.loadOverviewData();
for (let i = 0; i < 10; i++) await Promise.resolve();
assert.equal(calls.length, 11);
release();
await loading;
override = null;

// Render the actual overview and assert its request set excludes settings.
calls.length = 0;
await sandbox.renderOverview();
assert.deepEqual(calls.map((c) => c.command).sort(), [...expected, "statistics_timezone_config"].sort());
assert.ok(elements.get("ov-m-metered").textContent.includes("8.64"));
assert.ok(!sandbox.renderOverview.toString().includes("invoke("), "overview renderer performs no IPC");
assert.ok(!sandbox.renderNoRecordsState.toString().includes("invoke("), "empty-state renderer performs no IPC");
const beforeDecide = calls.length;
sandbox.renderDecideCard(result.data.monthly, result.data.quota);
assert.equal(calls.length, beforeDecide, "decision renderer performs no IPC");

// Source health comes from current connection states, regardless of monthly history.
assert.equal(elements.get("ov-sources-brief").textContent, "2 个来源正常，1 个需检查，1 个尚未接入");
const sourceFixture = await fixtureInvoke("data_source_status");
const sourceRow = sourceFixture.sources[0];
const sourceCases = [
  [["connected"], "1 个来源正常", true],
  [["needs_attention"], "0 个来源正常，1 个需检查", false],
  [["paused"], "0 个来源正常，1 个需检查", false],
  [["excluded"], "0 个来源正常，1 个需检查", false],
  [["not_detected"], "1 个尚未接入", true],
  [["connected", "needs_attention", "paused", "excluded", "not_detected"], "1 个来源正常，3 个需检查，1 个尚未接入", false],
  [["unknown"], "0 个来源正常，1 个需检查", false],
  [[], "尚未连接数据来源", true],
];
for (const [states, text, actionHidden] of sourceCases) {
  override = async (command, args) => command === "data_source_status"
    ? { status: "ok", sources: states.map((connection_state) => ({ ...sourceRow, connection_state })) }
    : fixtureInvoke(command, args);
  await sandbox.renderOverview();
  assert.equal(elements.get("ov-sources-brief").textContent, text, states.join(","));
  assert.equal(elements.get("ov-sources-brief-action").hidden, actionHidden);
}
for (const report of [{ status: "unavailable", sources: sourceFixture.sources }, {}]) {
  override = async (command, args) => command === "data_source_status" ? report : fixtureInvoke(command, args);
  await sandbox.renderOverview();
  assert.equal(elements.get("ov-sources-brief").textContent, "来源状态不可用");
  assert.equal(elements.get("ov-sources-brief-action").hidden, true);
}
sandbox.sourcesBrief({ status: "unavailable", sources: sourceFixture.sources });
assert.equal(elements.get("ov-sources-brief").textContent, "来源状态不可用");
override = async (command, args) => command === "data_monthly_summary" ? {} : fixtureInvoke(command, args);
await sandbox.renderOverview();
assert.equal(elements.get("ov-sources-brief").textContent, "2 个来源正常，1 个需检查，1 个尚未接入", "monthly failure cannot hide source status");

// Capture the advice node separately: provider evidence rows can still name providers.
let advice = "";
elements.get("ov-decide-body").appendChild = (child) => {
  if (child.className === "decide-advice") advice = child.textContent;
};
for (const used of [86, 92, 100]) {
  override = async (command, args) => {
    const value = await fixtureInvoke(command, args);
    if (command === "data_codex_quota") return { ...value, limits: { ...value.limits,
      primary: { ...value.limits.primary, used_percent: used } } };
    return value;
  };
  await sandbox.renderOverview();
  assert.equal(advice, "💡 Codex 额度较低；请在用量或设置中确认可用线路");
  assert.doesNotMatch(advice, /Claude|GLM|切到/i);
  assert.equal(elements.get("ov-decide-card").hidden, false);
}
override = null;

// Render-level isolation, including success -> failure transitions that used to leave stale KPIs.
const valueOf = (id) => elements.get(id).textContent;
for (const mode of ["rejected", "malformed"]) {
  for (const request of requests) {
    override = null;
    await sandbox.renderOverview();
    const monthlyBefore = valueOf("ov-m-metered");
    const dailyBefore = valueOf("ov-t-tokens");
    override = async (command, args) => {
      if (command !== request.command) return fixtureInvoke(command, args);
      if (mode === "rejected") throw { code: "database_unreadable" };
      return {};
    };
    await sandbox.renderOverview();
    if (request.key !== "monthly") assert.equal(valueOf("ov-m-metered"), monthlyBefore, request.key);
    if (request.key !== "daily") assert.equal(valueOf("ov-t-tokens"), dailyBefore, request.key);
    switch (request.key) {
      case "monthly":
        assert.equal(valueOf("ov-m-metered"), "无数据");
        assert.equal(valueOf("ov-m-tokens"), "无数据");
        assert.match(valueOf("ov-m-tokens-sub"), /暂不可读/);
        break;
      case "daily": assert.match(valueOf("ov-t-tokens-sub"), /暂不可读/); break;
      case "overview":
        assert.equal(valueOf("ov-budget-amount"), "—");
        assert.equal(elements.get("ov-budget-card").hidden, false);
        assert.match(valueOf("ov-budget-sub"), /暂不可读/);
        assert.match(valueOf("ov-sync-status"), /暂无法读取同步状态/);
        break;
      case "calendar": assert.match(valueOf("ov-days-empty"), /暂不可读/); break;
      case "quality": assert.equal(elements.get("ov-trust-route").className, "notice danger"); break;
      case "candidates":
        assert.equal(elements.get("ov-billing-prompt").hidden, false);
        assert.match(valueOf("ov-billing-prompt-copy"), /待确认状态暂不可读/);
        break;
      case "declarations": case "jobs": {
        const name = request.key === "jobs" ? "recalculation" : "declarations";
        assert.equal(elements.get("ov-billing-" + name + "-panel").hidden, false);
        assert.match(valueOf("ov-billing-" + name + "-list"), /待确认状态暂不可读/);
        assert.match(valueOf("ov-billing-prompt-copy"), /发现 1 条/);
        break;
      }
      case "quota":
        assert.equal(elements.get("ov-decide-card").hidden, false);
        assert.match(advice, /暂无法给出建议/);
        break;
    }
  }
}
// Successful empty billing reports remove the error state, independently of KPI data.
override = async (command, args) => {
  if (command === "billing_import_candidates") return { status: "ok", candidates: [] };
  if (command === "billing_declarations") return { status: "ok", declarations: [] };
  if (command === "billing_recalculation_jobs") return { status: "ok", jobs: [] };
  return fixtureInvoke(command, args);
};
await sandbox.renderOverview();
for (const id of ["ov-billing-prompt", "ov-billing-declarations-panel", "ov-billing-recalculation-panel"]) {
  assert.equal(elements.get(id).hidden, true);
}
assert.match(valueOf("ov-m-metered"), /8.64/);

// Bad budget fields degrade only the budget; valid synchronization survives.
for (const budget of [{}, { source: "sql", level: "warn", month_cost: "bad", month_ratio: 0.5, monthly_cny: 20 }]) {
  override = async (command, args) => {
    const dto = await fixtureInvoke(command, args);
    return command === "read_overview" ? { ...dto, budget } : dto;
  };
  await sandbox.renderOverview();
  assert.equal(valueOf("ov-budget-amount"), "—");
  assert.match(valueOf("ov-sync-status"), /已更新/);
}
// Nested malformed billing data cannot fabricate zero impact or undefined declarations.
for (const [command, patch, key] of [
  ["billing_import_candidates", (v) => { delete v.candidates[0].impact.total_tokens; }, "candidates"],
  ["billing_declarations", (v) => { v.declarations = [{ declaration_id: "d", host: "codex", provider_id: "openai" }]; }, "declarations"],
  ["billing_recalculation_jobs", (v) => { v.jobs = [null]; }, "jobs"],
]) {
  override = async (cmd, args) => {
    const dto = JSON.parse(JSON.stringify(await fixtureInvoke(cmd, args)));
    if (cmd === command) patch(dto);
    return dto;
  };
  const loaded = await sandbox.loadOverviewData();
  assert.equal(loaded.errors[key].code, "schema-mismatch");
  assert.ok(loaded.data.daily && loaded.data.monthly);
}
for (const quota of [null, { plan_type: "plus", observed_at: "invalid", limits: {} },
  { plan_type: "plus", observed_at: new Date(Date.now() - 25 * 3600000).toISOString(),
    limits: { primary: { used_percent: 50, resets_at: Date.now() / 1000 + 7200 } } },
  { plan_type: "plus", observed_at: new Date().toISOString(),
    limits: { primary: { used_percent: 50, resets_at: Date.now() / 1000 - 1 } } },
]) {
  override = async (command, args) => command === "data_codex_quota" ? quota : fixtureInvoke(command, args);
  await sandbox.renderOverview();
  assert.match(advice, /暂无法给出建议/);
  assert.equal(elements.get("ov-decide-card").hidden, false);
}
// Midnight during IPC must not change the denominator after the window was captured.
const originalToday = sandbox.statisticsToday;
let todayCalls = 0;
sandbox.statisticsToday = () => ++todayCalls === 1 ? "2026-09-10" : "2026-10-01";
override = null;
await sandbox.renderOverview();
assert.equal(todayCalls, 1);
assert.match(valueOf("ov-budget-sub"), /本月剩 20 天/);
sandbox.statisticsToday = originalToday;

// All six existing settings renderers still load on entering Settings.
calls.length = 0;
vm.runInContext('activeTab = "sources"; srcState.loaded = true;', sandbox);
await sandbox.loadActiveTab();
for (const command of ["host_bills_for_period", "retention_config", "statistics_timezone_config",
  "public_pricing_catalog_status", "about_diagnostics", "budget_config"]) {
  assert.ok(calls.some((c) => c.command === command), command + " loads in Settings");
}
console.log("Overview contract passed: 10 fixtures, source state mapping, neutral low-quota advice, unknown/malformed/failure isolation, parallel reads, pure decision renderer, deferred settings.");
