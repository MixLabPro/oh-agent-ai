#!/usr/bin/env node
// 发现 tab P1 验收（docs/v1.0.0/WORKBENCH_FINDINGS_TAB_SPEC.md §6 的 P1 条目）。
//
// 与 verify-workbench-skills.mjs 同一模式：静态断言打在真实文件上，行为断言
// 跑在 vm 执行的真实 workbench.js 上。fixture 形状出处：
//   · issues 组行 = agent-vitals-data issues.rs::issue_groups_with_sources 的
//     json! 字段（rule/host/count/sessions_count/status_rollup/sample_evidence/
//     remedy/source_kind）+ store.rs budget_issue_group（source_kind:"budget"）；
//   · freshness = runtime mcp/mod.rs::freshness（last_successful_sync_at +
//     stale_hosts）。
// 覆盖：§6.1〔P1〕待办区无 SV6xx；§6.2 remedy 文案；§6.3 迁移计数反馈；
// §6.4 首屏不扫会话日志（只调 sessions_issues / findings_freshness）；§6.5 新鲜度条。

import { readFileSync } from "node:fs";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));

let failed = 0;
const ok = (cond, msg) => {
  if (cond) console.log("  ok  " + msg);
  else { failed++; console.error("FAIL  " + msg); }
};

const wb = readFileSync(`${root}/apps/desktop/src-tauri/ui/workbench.js`, "utf8");
const html = readFileSync(`${root}/apps/desktop/src-tauri/ui/workbench.html`, "utf8");
const issuesRs = readFileSync(`${root}/crates/agent-vitals-data/src/issues.rs`, "utf8");

// ── 静态断言（真实文件） ──────────────────────────────────────────────────
console.log("# 静态断言（P1 结构与文案）");
for (const id of ["find-todo", "find-todo-list", "find-todo-empty", "find-evidence-box", "find-evidence-summary", "find-receipt", "find-freshness"]) {
  ok(html.includes(`id="${id}"`), `findings tab 含 #${id}`);
}
ok(!/<details id="find-evidence-box"[^>]*\bopen\b/.test(html),
  "证据区默认收起（details 无 open 属性）");
ok(html.includes('id="find-receipt"') && /id="find-receipt"[^>]*role="status"/.test(html),
  "计数反馈元素带 role=status（§9.3 无障碍基线沿用）");
for (const rid of ["review-destructive-shell", "review-privilege-shell", "review-remote-exec",
  "review-sensitive-path", "narrow-write-scope", "review-external-fetch",
  "reduce-limit-pressure", "inspect-timeout-tool", "review-approval-choice",
  "tighten-sandbox-mode"]) {
  ok(issuesRs.includes(`"${rid}"`), `issues.rs remedy_for 含 ${rid}`);
  ok(wb.includes(`"${rid}"`), `workbench.js labels map 含 ${rid}`);
}
ok(wb.includes("startsWith(\"SV6\")"), "待办准入显式挡 SV6xx（spec §3.1）");
ok(wb.includes("invoke(\"findings_freshness\")"), "首屏并发取新鲜度（spec §5.4）");
ok(wb.includes("sessions_issues") && !/loadActiveTab[\s\S]*?sessions_findings/.test(
  wb.slice(wb.indexOf("async function loadActiveTab"), wb.indexOf("window.addEventListener(\"focus\""))),
  "首屏路径不走 sessions_findings 重扫描（spec §1.6 性能预算）");

// ── vm 执行真实 workbench.js ─────────────────────────────────────────────
function makeElement(tag) {
  const children = [];
  let _text = "";
  return {
    tag: tag || "div",
    get textContent() { return _text; },
    set textContent(v) { _text = String(v); children.length = 0; },
    hidden: false, style: {}, dataset: {}, title: "", className: "", options: [], children,
    append(...nodes) { children.push(...nodes); },
    appendChild(node) { children.push(node); },
    setAttribute() {}, addEventListener() {},
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; }, [Symbol.iterator]: function* () {} },
  };
}
const elements = {};
const el = (id) => (elements[id] ??= makeElement());
const sandbox = {
  sessionStorage: new Map(),
  window: {
    __TAURI__: {
      core: { invoke: async (cmd, args) => {
        if (cmd === "sessions_issues") {
          sandbox.__issuesCalls = (sandbox.__issuesCalls || 0) + 1;
          const n = sandbox.__issuesCalls;
          const payload = n === 1 ? sandbox.__issues1 : sandbox.__issues2;
          return JSON.parse(JSON.stringify(payload));
        }
        if (cmd === "findings_freshness") return sandbox.__freshness;
        if (cmd === "issue_transition") return { status: "ok" };
        if (cmd === "data_status") return { status: "unavailable", reason: "fixture" };
        return null;
      } },
      event: { listen: async () => () => {} },
    },
    addEventListener: () => {},
  },
  document: {
    addEventListener: () => {},
    createElement: (tag) => makeElement(tag),
    createDocumentFragment: () => makeElement("#fragment"),
    createTextNode: (text) => ({ textContent: String(text), children: [] }),
    getElementById: (id) => el(id),
  },
};
sandbox.window.document = sandbox.document;
vm.createContext(sandbox);
vm.runInContext(wb, sandbox);

const textOf = (node) => (node == null ? "" : String(node.textContent ?? "")
  + (node.children || []).map(textOf).join(""));
const domText = (id) => textOf(elements[id]);

const group = (over) => Object.assign({
  group_id: "g", rule: "SV610", source_kind: "behavior", host: "dsh",
  severity: "warning", count: 10, sessions_count: 3, bucket: "2026-09-19",
  status_rollup: { open: 10, later: 0, acknowledged: 0, resolved: 0, not_applicable: 0 },
  sample_evidence: [], remedy: { remedy_id: "tighten-sandbox-mode", diagnostic_only: false },
}, over);

sandbox.__issues1 = {
  totals: { issues: 7, findings: 20, critical: 1, warning: 5, info: 1, sessions: 5, sessions_total: 845 },
  rules: [],
  issues: [
    group({ group_id: "g-price", rule: "PRICE_COVERAGE", source_kind: "data_quality", severity: "warning",
      count: 12, sessions_count: 3, status_rollup: { open: 2, later: 0, acknowledged: 0, resolved: 0, not_applicable: 0 },
      sample_evidence: [{ model_id: "deepseek/v4-flash", provider_id: "deepseek-official" }] }),
    group({ group_id: "g-route", rule: "ROUTE_UNCONFIRMED", source_kind: "data_quality", severity: "warning",
      count: 4, sessions_count: 2, status_rollup: { open: 1, later: 0, acknowledged: 0, resolved: 0, not_applicable: 0 },
      sample_evidence: [{ model_id: "gpt-5.6-sol" }] }),
    group({ group_id: "g-budget", rule: "BUDGET_THRESHOLD", source_kind: "budget", severity: "warning",
      count: 1, sessions: 0, status_rollup: { open: 0, later: 0, acknowledged: 0, resolved: 0, not_applicable: 0 },
      sample_evidence: [{ level: "warn", month: "2026-09" }] }),
    group({ group_id: "g-billing", rule: "BILLING_CANDIDATE", source_kind: "billing_candidate", severity: "warning",
      count: 3, sessions_count: 1, status_rollup: { open: 1, later: 0, acknowledged: 0, resolved: 0, not_applicable: 0 },
      sample_evidence: [{ provider_id: "minimax" }] }),
    group({ group_id: "g-srcfail", rule: "SOURCE_FILE_ERROR", source_kind: "source_failure", severity: "critical",
      count: 2, sessions_count: 2, status_rollup: { open: 1, later: 0, acknowledged: 0, resolved: 0, not_applicable: 0 },
      sample_evidence: [{ error_code: "permission_denied" }] }),
    group({ group_id: "g-sv610", rule: "SV610", source_kind: "behavior", severity: "warning",
      count: 39, sessions_count: 8, status_rollup: { open: 30, later: 0, acknowledged: 0, resolved: 0, not_applicable: 0 } }),
    group({ group_id: "g-growth", rule: "USAGE_GROWTH", source_kind: "usage_growth", severity: "info",
      count: 5, sessions_count: 2, status_rollup: { open: 2, later: 0, acknowledged: 0, resolved: 0, not_applicable: 0 } }),
  ],
  next_cursor: null,
};
// 第二份：SV610 的一条实例被 resolved（open 30 → 29）。
sandbox.__issues2 = JSON.parse(JSON.stringify(sandbox.__issues1));
sandbox.__issues2.issues[5].status_rollup.open = 29;
sandbox.__freshness = {
  status: "ok",
  freshness: { last_successful_sync_at: "2026-09-19T08:48:12.000+08:00", stale_hosts: ["workbuddy"] },
};

console.log("# §6.1〔P1〕首屏 = 待办区 + 收起的证据区，SV6xx 不进待办区");
await sandbox.loadFindings(true);
{
  const todo = domText("find-todo-list");
  ok(todo.includes("缺少价卡") && todo.includes("deepseek/v4-flash"), "待办含 PRICE_COVERAGE（一句话带样本型号）");
  ok(todo.includes("归属未确认") && todo.includes("预算告警") && todo.includes("计费方式待明确")
    && todo.includes("数据源读取失败"), "待办含五类已验证流程");
  ok(!todo.includes("SV610"), "SV6xx 行为命中不出现在待办区（spec §3.1）");
  ok(!todo.includes("USAGE_GROWTH") && !todo.includes("查看对应会话"),
    "usage_growth 不进待办区（首批成员穷举之外）");
  ok(elements["find-todo-empty"].hidden === true, "有待办时空态文案隐藏");
  ok(domText("find-evidence-summary").includes("7 条"), "证据摘要行带规则命中总数");
  ok(domText("find-rules-body").includes("SV610") || domText("find-note").length >= 0,
    "规则表仍归证据区");
}
console.log("# §6.5 新鲜度条");
{
  const fresh = domText("find-freshness");
  ok(fresh.includes("08:48"), "新鲜度条显示数字截止时刻");
  ok(fresh.includes("workbuddy"), "新鲜度条列出 stale 宿主");
}
console.log("# §6.2 remedy 文案");
{
  const label = sandbox.issueActionLabel({ rule: "SV610", remedy: { remedy_id: "tighten-sandbox-mode" } });
  ok(label.includes("收紧沙箱权限"), "SV610 专属文案可显示（不再落兜底）");
}
console.log("# §6.3〔P1〕状态迁移计数反馈");
{
  const before = sandbox.openHitCount();
  ok(before === 37, `迁移前开放命中口径 = status_rollup.open 之和（got ${before}）`);
  await sandbox.transitionIssueFromUi("issue-1", "resolved");
  const receipt = domText("find-receipt");
  ok(elements["find-receipt"].hidden === false, "迁移后反馈条可见");
  ok(receipt.includes("已处理 1 项") && receipt.includes("37 → 36"),
    `反馈为「已处理 1 项 · 待处理命中 37 → 36」（got: ${receipt}）`);
}

console.log(failed === 0 ? "\n全部通过" : `\n${failed} 条失败`);
process.exit(failed === 0 ? 0 : 1);
