#!/usr/bin/env node
// AC28：真实 Workbench 文件上的“仍不确定/稍后”路径回归。
// 这些选择只能保留 pending 候选并抑制首屏提醒，不能写声明或触发重算。

import { readFileSync } from "node:fs";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const wb = readFileSync(`${root}/apps/desktop/src-tauri/ui/workbench.js`, "utf8");
const html = readFileSync(`${root}/apps/desktop/src-tauri/ui/workbench.html`, "utf8");
let failed = 0;
const ok = (condition, message) => {
  if (condition) console.log("  ok  " + message);
  else { failed += 1; console.error("FAIL  " + message); }
};

const elements = {};
function makeElement() {
  return {
    textContent: "", innerHTML: "", hidden: false, title: "", className: "",
    dataset: {}, value: "", disabled: false, onclick: null, children: [],
    appendChild(child) { this.children.push(child); },
    append(...children) { this.children.push(...children); },
    setAttribute() {}, focus() {}, scrollIntoView() {},
  };
}
const stores = { local: new Map(), session: new Map() };
const makeStore = (name) => ({
  getItem(key) { return stores[name].get(key) || null; },
  setItem(key, value) { stores[name].set(key, String(value)); },
  removeItem(key) { stores[name].delete(key); },
});
const writes = [];
const invoke = async (command) => {
  writes.push(command);
  throw new Error("AC28 must not invoke declaration/recalculation writes");
};
const sandbox = {
  window: {
    localStorage: makeStore("local"), sessionStorage: makeStore("session"),
    __TAURI__: { core: { invoke }, event: { listen: async () => () => {} } },
    addEventListener() {},
  },
  document: {
    addEventListener() {}, createElement: makeElement,
    createTextNode: (text) => ({ textContent: String(text) }),
    getElementById(id) { return (elements[id] ??= makeElement()); },
  },
  Intl, Date, setTimeout,
};
sandbox.window.document = sandbox.document;
vm.createContext(sandbox);
vm.runInContext(wb, sandbox);

ok(html.includes('id="ov-billing-later"') && html.includes('value="unknown"'),
  "Workbench exposes 稍后 and 仍不确定 choices");
ok(wb.includes('relationship === "unknown"') && wb.includes("deferBillingReview"),
  "仍不确定 path is explicitly non-writing and deferred");

const candidate = {
  candidate_id: "candidate-ac28", host: "codex", provider_id: "openai",
  currency: "USD", amount_minor: 2000, billing_period_start: "2026-09",
  status: "pending", impact: { status: "ok", total_tokens: 18000, fact_count: 4, session_count: 1 },
};
const report = { status: "ok", candidates: [candidate] };
const before = JSON.stringify(report);

// 稍后：候选仍是 pending，前端只记本地抑制时间。
sandbox.renderBillingImportCandidates(report);
ok(!elements["ov-billing-prompt"].hidden, "pending candidate shows the contextual prompt");
elements["ov-billing-later"].onclick();
ok(writes.length === 0, "稍后 does not call declaration or recalculation IPC");
ok(elements["ov-billing-prompt"].hidden, "稍后 hides the first-screen prompt immediately");
ok(sandbox.billingReviewIsDeferred(Date.now()), "稍后 records the 30-day local suppression");
ok(JSON.stringify(report) === before, "稍后 leaves the candidate and estimate unchanged");

// 清除本地抑制，只为覆盖“仍不确定”分支；真实路径不会清除候选状态。
stores.local.clear(); stores.session.clear();
sandbox.renderBillingImportCandidates(report);
sandbox.openBillingDeclaration(candidate);
sandbox.document.getElementById("ov-billing-relationship").value = "unknown";
await sandbox.document.getElementById("ov-billing-save").onclick();
ok(writes.length === 0, "仍不确定 does not call declaration or recalculation IPC");
ok(elements["ov-billing-prompt"].hidden, "仍不确定 hides the first-screen prompt immediately");
ok(sandbox.billingReviewIsDeferred(Date.now()), "仍不确定 records the 30-day local suppression");
ok(JSON.stringify(report) === before, "仍不确定 leaves the candidate and estimate unchanged");

const deferredAt = Number(stores.local.get("agent-vitals-billing-review-deferred-at-ms"));
ok(deferredAt > 0 && sandbox.billingReviewIsDeferred(deferredAt + 30 * 24 * 60 * 60 * 1000 - 1),
  "suppression holds before 30 days");
ok(!sandbox.billingReviewIsDeferred(deferredAt + 30 * 24 * 60 * 60 * 1000),
  "prompt may return at 30-day expiry");

if (failed) process.exit(1);
console.log("\n通过。");
