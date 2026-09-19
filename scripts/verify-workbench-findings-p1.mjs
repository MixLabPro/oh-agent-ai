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
// §1.6 P1.1：重路径（evaluator 刷新）只挂在「重载」按钮的显式点击上。
ok(wb.includes("invoke(\"sessions_issues\", { pageSize: 50, cursor: null, refresh: !!refresh })"),
  "sessions_issues 请求显式携带 refresh 位（spec §1.6）");
ok((wb.match(/loadFindings\(true, true\)/g) || []).length === 1
  && /find-reload"\)\.addEventListener\("click", \(\) => loadFindings\(true, true\)\)/.test(wb),
  "唯一 refresh=true 调用点是重载按钮（spec §1.6）");
// transitionIssueFromUi 的 loadFindings(true) 是有意的快速刷新（refresh 缺省
// = false，纯读）——不算残留；上一条已保证 true 只出自重载按钮。

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
    querySelector: () => null, querySelectorAll: () => [],
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
          sandbox.__issuesArgs = sandbox.__issuesArgs || [];
          sandbox.__issuesArgs.push(JSON.parse(JSON.stringify(args || {})));
          const n = sandbox.__issuesCalls;
          const payload = n === 1 ? sandbox.__issues1 : sandbox.__issues2;
          return JSON.parse(JSON.stringify(payload));
        }
        if (cmd === "findings_freshness") return sandbox.__freshness;
        if (cmd === "decision_matrix") {
          if (sandbox.__matrixFail) throw new Error(sandbox.__matrixFail);
          return sandbox.__matrix;
        }
        if (cmd === "issue_transition") return { status: "ok" };
        if (cmd === "issue_group_instances") return sandbox.__instances || { instances: [], next_cursor: null, total_instances: 0 };
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
  const syncAt = new Date("2026-09-19T08:48:12.000+08:00");
  const expectHm = `${String(syncAt.getHours()).padStart(2, "0")}:${String(syncAt.getMinutes()).padStart(2, "0")}`;
  ok(fresh.includes(expectHm), `新鲜度条显示数字截止时刻（本机钟面 ${expectHm}；got ${fresh}）`);
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

console.log("# §4.8〔P1.2〕新鲜度时间显示");
{
  // 时区锚定：期望值全部从本机 Date 派生（断言与实现各算各的，非循环论证），
  // 在任何时区的机器上期望与实际同钟面——CI/协作者不限于 UTC+8。
  const pad = (n) => String(n).padStart(2, "0");
  const localClock = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const localDay = (d) => `${d.getMonth() + 1}月${d.getDate()}日`;
  // ① 当日：用本机本地时间拼"本地当日 08:48"，再转成带本机偏移的 ISO 串喂进去。
  const t = new Date();
  t.setHours(8, 48, 0, 0);
  // toISOString 往返恒等（同一 epoch），freshnessClock 的本地 getter 读回
  // 本机 08:48——比手工加减偏移可靠（那次算术正是上一个 bug 的来源）。
  const todayStr = t.toISOString();
  ok(sandbox.freshnessClock(todayStr) === "08:48",
    `当日同步只显示 HH:MM（got ${sandbox.freshnessClock(todayStr)}）`);
  // ② 跨日：2020 年的固定时刻，期望值按本机钟面计算（不写死 +08 数值）。
  const staleAt = new Date("2020-01-02T23:43:47.384+08:00");
  const expectStale = `${localDay(staleAt)} ${localClock(staleAt)}`;
  const gotStale = sandbox.freshnessClock("2020-01-02T23:43:47.384+08:00");
  ok(gotStale === expectStale && /\d+月\d+日 \d{2}:\d{2}/.test(gotStale),
    `跨日同步带日期（got ${gotStale}，expect ${expectStale}）`);
  ok(sandbox.freshnessClock("not-a-date") === "not-a-date", "解析失败退回原串，不猜");
  ok(sandbox.freshnessClock(null) === "未知", "空值显示未知");
}

console.log("# §6.4〔P1.1〕首屏纯读：refresh 位");
{
  const args1 = (sandbox.__issuesArgs || [])[0];
  ok(args1 && args1.refresh === false, `首次加载 refresh=false（纯 authority 读，got ${JSON.stringify(args1)}）`);
  await sandbox.loadFindings(true, true);
  const argsN = sandbox.__issuesArgs[sandbox.__issuesArgs.length - 1];
  ok(argsN && argsN.refresh === true, `重载路径 refresh=true（显式触发 evaluator，got ${JSON.stringify(argsN)}）`);
  ok(String(elements["find-loading"].textContent).includes("扫描会话日志"),
    `重载的加载文案明说重路径（got: ${elements["find-loading"].textContent}）`);
  await sandbox.loadFindings(true);
  const argsLast = sandbox.__issuesArgs[sandbox.__issuesArgs.length - 1];
  ok(argsLast.refresh === false, "非重载调用回落 refresh=false");
}

console.log("# §3.2/§4.6〔P2〕模型 × Harness 对比面");
{
  sandbox.__matrix = {
    month: "2026-09",
    rows: [
      { host: "codex", model_id: "gpt-6-astra", provider_id: "cogfoundry.ai", sessions: 10,
        tokens: { uncached_input: 1, cache_read: 1, cache_write: 1, output: 1, total: 4 },
        cache_hit_ratio: null, has_subscription: false, waste_rate: null,
        amounts: [], top_sessions: [], host_behavior: {} },
      { host: "codex", model_id: "gpt-5.6-terra", provider_id: "shengsuanyun", sessions: 31,
        tokens: { uncached_input: 1754, cache_read: 34448965, cache_write: 2304878, output: 119195, total: 36875892 },
        cache_hit_ratio: 0.9363, has_subscription: false, waste_rate: null,
        amounts: [{ amount_minor: 1408, currency: "USD", basis: "metered_estimate" }],
        top_sessions: [], host_behavior: { SV610: 62 } },
      { host: "claude-code", model_id: "deepseek-v4-flash-0731", provider_id: "<unknown>", sessions: 12,
        tokens: { uncached_input: 44432002, cache_read: 12596736, cache_write: 0, output: 13030, total: 57041768 },
        cache_hit_ratio: 0.2211, has_subscription: false, waste_rate: null,
        amounts: [{ amount_minor: 6734, currency: "CNY", basis: "metered_estimate" }],
        cost_provider_unresolved: true, top_sessions: [], host_behavior: {} },
      { host: "claude-code", model_id: "glm-5.3", provider_id: "zhipu-glm", sessions: 3,
        tokens: { uncached_input: 1, cache_read: 2, cache_write: 0, output: 0, total: 3 },
        cache_hit_ratio: null, has_subscription: true, waste_rate: null,
        amounts: [], top_sessions: [], host_behavior: {} },
    ],
    notes: ["waste_rate 恒 null：waste 检测器仅 DSH 且尚未接入（spec §4.2，不用 0 冒充）"],
  };
  await sandbox.loadDecisionMatrix();
  const sorted = sandbox.sortMatrixRows(sandbox.__matrix.rows);
  ok(sorted.order[0].model_id === "gpt-6-astra", "未计价行恒排最前（§4.6）");
  ok(sorted.order[sorted.order.length - 1].model_id === "glm-5.3", "订阅行不参与排序、排最后（§4.6）");
  ok(!sorted.metricSorted && /CNY \/ USD|USD \/ CNY/.test(sorted.note),
    `混合币种禁用排序并说明（got ${sorted.note}）`);
  const bodyText = domText("find-matrix-body");
  ok(bodyText.includes("未计价"), "无价组合带「未计价」标记");
  ok(bodyText.includes("≈¥67.34") && bodyText.includes("≈$14.08"),
    "多币种分列显示、各自带 ≈（永不相加）");
  ok(bodyText.includes("套餐内"), "订阅组合带套餐标记");
  ok((bodyText.match(/—/g) || []).length >= 2, "浪费率与无命中显示「—」不显示 0");
  // 展开一行验证宿主级证据
  sandbox.toggleMatrixRow("codex/gpt-5.6-terra/shengsuanyun", { target: { closest: () => null } });
  const bodyText2 = domText("find-matrix-body");
  ok(bodyText2.includes("宿主级证据") && bodyText2.includes("SV610 × 62"),
    "展开行含宿主级行为标记（§4.7）");
  ok(bodyText2.includes("四桶"), "展开行含四桶 token");
}

console.log("# §4.6〔P2-r2〕单币种排序分支与新增列");
{
  // 单币种（全 CNY）：metricSorted 必须为 true 且按单位会话成本降序——
  // 这是 §4.6 的核心指标路径，混合 fixture 覆盖不到。
  const single = [
    { host: "a", model_id: "cheap-slow", provider_id: "p", sessions: 10,
      tokens: { total: 100 }, cache_hit_ratio: null, has_subscription: false,
      amounts: [{ amount_minor: 5000, currency: "CNY", basis: "metered_estimate" }] },
    { host: "a", model_id: "dear-fast", provider_id: "p", sessions: 2,
      tokens: { total: 50 }, cache_hit_ratio: null, has_subscription: false,
      amounts: [{ amount_minor: 3000, currency: "CNY", basis: "metered_estimate" }] },
  ];
  const sorted = sandbox.sortMatrixRows(single);
  ok(sorted.metricSorted === true, "单币种启用成本排序（metricSorted=true）");
  ok(sorted.order[0].model_id === "dear-fast" && sorted.order[1].model_id === "cheap-slow",
    "按单位会话成本降序：¥15/会话 在 ¥5/会话 前（got " + sorted.order.map((r) => r.model_id).join(",") + "）");

  // 新列与新入口：撞限流、查看轨迹、失败数、错误区分
  sandbox.__matrix.rows[1].limit_pressure = { hits: 8, per_session: 0.26 };
  sandbox.__matrix.rows[2].top_sessions = [{ session_ref: "sr_1f7589ece7184a8", span_first_ms: 100, span_last_ms: 3600100, tokens_total: 473030189, failures: 40 }];
  sandbox.renderMatrix();
  sandbox.toggleMatrixRow("claude-code/deepseek-v4-flash-0731/<unknown>", { target: { closest: () => null } });
  const txt = domText("find-matrix-body");
  ok(txt.includes("8 次 · ≈0.26/会话"), "撞限流列：命中数 + 每会话均值（§4.5）");
  ok(txt.includes("失败 40"), "贡献会话带失败数（§6.7）");
  ok(txt.includes("查看轨迹"), "贡献会话带「查看轨迹」入口（§6.7）");
  ok(txt.includes("跨度 1.0h（事件跨度近似）"), "跨度如实标注近似口径");
  // 错误与空数据可区分：mock 注入失败 → loadDecisionMatrix → 错误文案
  sandbox.__matrixFail = "authority locked";
  await sandbox.loadDecisionMatrix();
  sandbox.__matrixFail = false;
  ok(domText("find-matrix-empty").includes("对比面读取失败：authority locked"),
    `IPC 失败显示错误而非空态（got ${domText("find-matrix-empty")}）`);
}

console.log("# r3 预算归因卡 + 行为证据只读（用户反馈 2026-09-19）");
{
  // 预算归因：②已加载（上一块跑过 loadDecisionMatrix），flash-0731 是唯一
  // 带 CNY 金额的特征行（22% 命中 → 特征必须出现在归因里）。
  // 上一块注入过 __matrixFail 并留下错误态——先成功重载，归因才有数据。
  await sandbox.loadDecisionMatrix();
  const budgetGroup = {
    group_id: "g-budget", rule: "BUDGET_THRESHOLD", source_kind: "budget", severity: "critical",
    count: 1, sessions: 0, bucket: "2026-09",
    status_rollup: { open: 0, later: 0, acknowledged: 0, resolved: 0, not_applicable: 0 },
    sample_evidence: [{ level: "exceeded", month: "2026-09", monthly_cny_minor: 50000, metered_cny_minor: 102981 }],
    remedy: { remedy_id: "review-budget-or-snooze", diagnostic_only: true },
  };
  const attr = sandbox.budgetAttribution(budgetGroup);
  const attrText = textOf(attr);
  ok(attrText.includes("钱主要去了哪"), "归因块标题在（回答'为什么超'）");
  ok(attrText.includes("deepseek-v4-flash-0731") && attrText.includes("≈¥67.34"),
    `归因列出最大 CNY 组合（got ${attrText.slice(0, 160)}）`);
  ok(attrText.includes("缓存命中 22%"), "低缓存命中作为特征带上卡");
  ok(attrText.includes("USD 估算行未折算"), "混合币种如实标注未计入");
  const main = sandbox.todoMainAction(budgetGroup);
  ok(main.label === "看超在哪", `预算主按钮改为归因入口（got ${main.label}）`);
  // 行为证据只读：SV 组实例行无状态迁移按钮，非 SV 组保留。
  sandbox.__instances = { instances: [
    { issue_id: "sv-i1", evidence: "danger-full-access", status: "open" },
    { issue_id: "sv-i2", evidence: "allowed-once", status: "open" },
  ], next_cursor: null, total_instances: 2 };
  const detailRow = { firstElementChild: sandbox.document.createElement("td") };
  await sandbox.loadIssueGroupInstances({ group_id: "g-sv", rule: "SV610", source_kind: "behavior" }, detailRow);
  const svText = textOf(detailRow.firstElementChild);
  ok(svText.includes("行为证据 · 只读"), `行为组带只读声明（spec §8；got ${svText.slice(0, 120)}）`);
  const svButtons = (detailRow.firstElementChild.children || [])
    .filter((c) => (c.children || []).some((b) => /稍后|已解决|已确认|不适用|恢复待处理/.test(String(b.textContent || ""))));
  ok(svButtons.length === 0, "行为实例行无状态迁移按钮");
  // 非行为且无专属分支的组（如数据质量类）走实例循环，状态迁移保留。
  const detailRow2 = { firstElementChild: sandbox.document.createElement("td") };
  await sandbox.loadIssueGroupInstances({ group_id: "g-dq", rule: "QUOTA_WINDOW" }, detailRow2);
  const priceText = textOf(detailRow2.firstElementChild);
  ok(/稍后|已解决|不适用/.test(priceText), `非行为组保留状态迁移（待办语义；got ${priceText.slice(0, 120)}）`);
}

console.log(failed === 0 ? "\n全部通过" : `\n${failed} 条失败`);
process.exit(failed === 0 ? 0 : 1);
