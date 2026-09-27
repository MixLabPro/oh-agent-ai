#!/usr/bin/env node
// 会话消耗诊断的桌面契约（SESSION_TRACE_DIAGNOSTICS_SPEC r6 §6、§8、§10）。
//
// 三层：
// 1. 桥（lib/sessionInsights.ts）：mock 形状能解析；越界/未知词表/超长摘录被拒绝，
//    而不是静默渲染。mock 形状出处见 public/tauri-mock.js 的 `mockInsights`。
// 2. 几何（features/sessions/insightsGeometry.ts）：比例尺错了图照样画得出来，所以
//    直接断言不变量——诊断区间永不因窗口消失、窗口包含焦点、柱位单调且在绘图区内、
//    长空闲缝隙只出现在窗口内。
// 3. 文案（SessionInsights.tsx 的 diagText）：事实与原因分开；不出现「多付/可节省/浪费」；
//    诊断不带金额。
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

function load(entry, globals = {}) {
  const built = buildSync({
    entryPoints: [path.join(ui, entry)], bundle: true, format: "cjs", platform: "node", target: "node20", write: false, logLevel: "silent",
    loader: { ".css": "empty" }, external: ["react", "react/jsx-runtime", "react-dom"],
  });
  const sandbox = { module: { exports: {} }, exports: {}, require: uiRequire, console: { error() {}, warn() {}, log() {} }, Intl, Date, Math, Number, Object, Array, JSON, String, Promise, setTimeout, clearTimeout, window: {}, ...globals };
  vm.createContext(sandbox);
  vm.runInContext(built.outputFiles[0].text, sandbox, { filename: entry });
  return sandbox.module.exports;
}

function loadMock() {
  const sandbox = { console: { error() {}, warn() {}, log() {} }, Intl, Date, Math, Promise, setTimeout, clearTimeout, window: {} };
  vm.createContext(sandbox);
  vm.runInContext(readFileSync(path.join(ui, "public/tauri-mock.js"), "utf8"), sandbox, { filename: "tauri-mock.js" });
  return sandbox.window.__TAURI__.core.invoke;
}

// ── 1. 桥 ──
const mockInvoke = loadMock();
const calls = [];
const invoke = async (command, args) => { calls.push({ command, args }); return mockInvoke(command, args); };
const bridge = load("react/src/lib/sessionInsights.ts", { window: { __TAURI__: { core: { invoke } } } });

const insights = await bridge.readSessionInsights("sr_browser_mock_01");
assert.equal(calls.at(-1).command, "session_trace");
assert.equal(calls.at(-1).args.output, "insights");
assert.equal(insights.axis.unit, "turn");
assert.equal(insights.axis.steps.length, 40);
assert.equal(insights.diagnostics[0].kind, "repeated_failure");
assert.equal(insights.diagnostics[0].cause, "evidence");
assert.equal(insights.session.nominal_cost.amounts[0].currency, "USD");
assert.equal(insights.quality.legacy_fingerprints, 0, "缺省 quality 按 0 处理");
await assert.rejects(() => bridge.readSessionInsights("../etc/passwd"), /session_ref 不安全/);

const evidence = await bridge.readSessionTraceEvidence("sr_browser_mock_01", 18, 20);
assert.equal(calls.at(-1).command, "session_trace_evidence", "证据走本地命令，不走 MCP 的 session_trace");
assert.equal(evidence.failures.length, 3);
assert.match(evidence.failures[0].error_excerpt, /Cannot find module/);
await assert.rejects(() => bridge.readSessionTraceEvidence("sr_browser_mock_01", 5, 2), /证据区间不安全/);

const base = await mockInvoke("session_trace", { output: "insights" });
const mutate = (fn) => { const copy = JSON.parse(JSON.stringify(base)); fn(copy.data); return copy; };
assert.throws(() => bridge.parseSessionInsights(mutate(d => { d.diagnostics[0].steps.to = 999; })), /诊断区间越界/);
assert.throws(() => bridge.parseSessionInsights(mutate(d => { d.diagnostics[0].kind = "wasted_money"; })), /词表/);
assert.throws(() => bridge.parseSessionInsights(mutate(d => { d.axis.steps[3].index = 9; })), /回合序号不连续/);
assert.throws(() => bridge.parseSessionInsights(mutate(d => { d.axis.steps[0].hit_rate = 1.5; })), /比例不安全/);
assert.throws(() => bridge.parseSessionInsights(mutate(d => { d.safety.rules[0].rule = "rm -rf /"; })), /规则码不安全/);
assert.throws(() => bridge.parseSessionInsights({ error: { code: "internal_error" } }), /暂不可用/);
const evBase = await mockInvoke("session_trace_evidence", { from: 18, to: 20 });
const longExcerpt = JSON.parse(JSON.stringify(evBase)); longExcerpt.data.failures[0].error_excerpt = "x".repeat(5000);
assert.throws(() => bridge.parseSessionTraceEvidence(longExcerpt), /摘录不安全/);
console.log("Session insights bridge: OK (mock parses, evidence via local command, malformed rejected)");

// ── 2. 几何 ──
const geo = load("react/src/features/sessions/insightsGeometry.ts");
const mkSteps = (n, idleAt = new Map()) => Array.from({ length: n }, (_, i) => ({ index: i + 1, idle_before_ms: idleAt.get(i + 1) ?? 60_000 }));
for (const total of [5, 40, 420, 2447]) {
  const plotW = 700;
  const maxV = geo.maxVisibleSteps(plotW);
  for (const [from, to] of [[1, 1], [Math.ceil(total / 2), Math.ceil(total / 2) + 2], [total, total], [1, total]]) {
    const view = geo.chartWindow(total, maxV, null, Math.min(from, total), Math.min(to, total));
    assert.ok(view[0] >= 1 && view[1] <= Math.max(total, 1) && view[0] <= view[1], `window in bounds ${view}`);
    if (to - from + 1 <= maxV) assert.ok(view[0] <= from && Math.min(to, total) <= view[1], `window ${view} contains focus ${from}-${to} (total ${total})`);
    const steps = mkSteps(total, new Map([[3, 47 * 60_000], [Math.ceil(total / 2) + 1, 90 * 60_000]]));
    const layout = geo.layoutSteps(steps, view, 52, plotW);
    assert.equal(layout.slots.length, view[1] - view[0] + 1, "每个窗口内的步都有柱位（不抽稀）");
    for (let k = 1; k < layout.slots.length; k += 1) assert.ok(layout.slots[k].x > layout.slots[k - 1].x, "柱位单调");
    const last = layout.slots.at(-1);
    assert.ok(last.x + last.w <= 52 + plotW + 1e-6, "柱位不越出绘图区");
    for (const gap of layout.gaps) assert.ok(gap.beforeIndex > view[0] && gap.beforeIndex <= view[1], "缝隙只在窗口内");
    // 诊断区间永不消失：窗口内给位置，窗口外给方向。
    for (const range of [{ from: 1, to: 2 }, { from: total, to: total }, { from: Math.max(1, total - 3), to: total }]) {
      const band = geo.bandFor(range, view, layout);
      if (band.kind === "visible") assert.ok(band.w > 0);
      else assert.ok(band.side === "left" || band.side === "right");
      const intersects = range.to >= view[0] && range.from <= view[1];
      assert.equal(band.kind === "visible", intersects, `band visibility for ${JSON.stringify(range)} in ${view}`);
    }
  }
}
assert.equal(geo.niceCeil(640_000), 800_000);
assert.equal(geo.niceCeil(1), 1);
assert.ok(geo.tickStep(3) * 3 >= 34, "刻度间隔至少 34px");
const mini = geo.miniColumns([{ input: 10, miss: 9 }, { input: 5, miss: 0 }], 1);
assert.deepEqual(JSON.parse(JSON.stringify(mini)), [{ x: 0, value: 10, warn: true }], "缩略图取列内最大值");
console.log("Session insights geometry: OK (windows contain focus, bands never dropped, slots in bounds)");

// ── 3. 文案 ──
const view = load("react/src/features/sessions/SessionInsights.tsx", { self: {} });
const unit = "回合";
for (const d of insights.diagnostics) {
  const t = view.diagText(d, unit);
  const text = `${t.title}${t.fact}${t.why}`;
  assert.doesNotMatch(text, /多付|可节省|浪费|省下|\$|¥/, `诊断文案不得暗示浪费或给金额：${text}`);
  if (d.cause === "unknown") assert.equal(t.chip[1], "原因未明");
  if (d.cause === "evidence") assert.equal(t.chip[1], "有错误摘要");
}
const growth = view.diagText(insights.diagnostics.find(d => d.kind === "input_growth"), unit);
assert.match(growth.title, /增长 3\.2 倍/, "输入增长的标题是测得的事实");
assert.match(growth.why, /尚不能确定/, "原因单列并说明不确定");
const source = readFileSync(path.join(ui, "react/src/features/sessions/SessionInsights.tsx"), "utf8");
assert.ok(!source.includes("estimated_amount"), "诊断不读金额（r6 移除 estimated_amount）");
assert.ok(!source.includes("比全部命中多"), "不写「比全部命中多约 $X」");
assert.ok(source.includes("仅在本机显示，不进入导出和 MCP"), "摘录旁固定标注本机专属");
assert.equal(view.fmtTokens(1_832_000), "183 万");
assert.equal(view.fmtMoney({ amounts: [{ amount_minor: 612, currency: "USD" }, { amount_minor: 900, currency: "CNY" }], coverage: "partial" }), "$6.12 + ¥9.00（部分调用无价卡）");
console.log("Session insights copy: OK (fact/cause split, no waste or money wording in diagnostics)");
