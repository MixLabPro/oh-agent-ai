#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (path) => readFileSync(`${root}/${path}`, "utf8");
const js = read("apps/desktop/src-tauri/ui/workbench.js");
const html = read("apps/desktop/src-tauri/ui/workbench.html");
const lib = read("apps/desktop/src-tauri/src/lib.rs");
const runtime = read("crates/agent-vitals-runtime/src/mcp/mod.rs");
let failed = 0;
const ok = (condition, message) => {
  if (condition) console.log("  ok  " + message);
  else { failed += 1; console.error("FAIL  " + message); }
};

console.log("# 独立数据源状态契约");
ok(/fn data_source_status\(\)/.test(lib), "桌面后端提供独立命令");
ok(/generate_handler!\[[\s\S]*data_source_status,/.test(lib), "独立命令注册到 IPC");
ok(/generate_handler!\[[\s\S]*sync_request_status,/.test(lib), "同步请求状态命令注册到 IPC");
ok(js.includes('invoke("data_source_status")'), "数据源页消费独立命令");
ok(!/sessions_list[\s\S]{0,160}source_statuses/.test(js), "不再从会话搜索读取源状态");
ok(runtime.includes("crate::ingest_service::FACT_HOSTS"), "契约由已接线宿主注册表驱动");
for (const field of ["source_id", "authorization", "connection_state", "scan",
  "log", "import_scope", "failed_scope", "recovery_action"]) {
  ok(runtime.includes(`\"${field}\"`), `契约包含 ${field}`);
}
ok(js.includes("for (const source of ordered)"), "前端按返回集合渲染而非硬编码宿主");
ok(js.includes("recoverSource(button, key") && js.includes('invoke("trigger_sync")'),
  "未检测与失败状态都有恢复动作");
ok(js.includes('invoke("sync_request_status", { requestId })'), "恢复动作按请求ID等待完成");
ok(!/id="ov-billing-review"[^>]*aria-expanded/.test(html),
  "套餐确认入口不暴露为 AX 折叠控件，保留普通按钮点击语义");
ok(/id="ov-billing-review"[^>]*>明确计费方式<\/button>/.test(html) &&
  /id="ov-billing-review-panel"[^>]*role="region"[^>]*aria-labelledby="ov-billing-review-title"/.test(html),
  "套餐确认入口使用普通按钮并保留展开区域标题语义");
ok(js.includes("if (control) control.disabled = true;") && js.includes("if (control) control.disabled = false;"),
  "已保存声明锁定三步选择，避免切换为仍不确定造成状态漂移");
ok(lib.includes("match worker_db.billing_recalculation_run") && lib.includes("Ok(true) => return") &&
  !/billing_recalculation_run\([\s\S]{0,180}\.is_ok\(\)/.test(lib),
  "重算 worker 只把 changed=true 当作成功，不吞掉 false/错误回执");
ok(lib.includes("fn billing_recalculation_jobs()") &&
  /billing_recalculation_job_status,[\s\S]*billing_recalculation_jobs,/.test(lib) &&
  // 总览重构后 jobs 走 OVERVIEW_REQUESTS 的合并拉取（command 字段动态 invoke），
  // 不再是页面里一处字面量 invoke("billing_recalculation_jobs")。
  js.includes('command: "billing_recalculation_jobs"') && js.includes("重算待重试"),
  "工作台重启后读取待处理重算并提供可见重试入口");

console.log("# 真实前端渲染与恢复链路");
const elements = {};
function makeEl(id) {
  const classes = new Set();
  const attrs = {};
  let textValue = "";
  let htmlValue = "";
  const node = {
    id, children: [], dataset: {}, hidden: false, disabled: false, title: "",
    classList: { add: (...names) => names.forEach(name => classes.add(name)), contains: name => classes.has(name) },
    appendChild(child) { this.children.push(child); return child; },
    append(...children) { this.children.push(...children); },
    focus() { this.focused = true; },
    addEventListener() {}, remove() { this.removed = true; }, scrollIntoView() {},
    click() { if (typeof this.onclick === "function") return this.onclick(); },
    // renderSourceRow 用 setAttribute("aria-expanded", …) 记录展开态——真实按钮
    // 有这个方法，makeEl 之前没实现，切到行式结构后第一次跑就在这里炸。
    setAttribute(name, value) { attrs[name] = String(value); },
    getAttribute(name) { return attrs[name] ?? null; },
    removeAttribute(name) { delete attrs[name]; },
  };
  Object.defineProperties(node, {
    textContent: { get: () => textValue, set: value => { textValue = String(value); htmlValue = ""; node.children = []; } },
    innerHTML: { get: () => htmlValue, set: value => { htmlValue = String(value); textValue = ""; node.children = []; } },
  });
  return node;
}
for (const id of ["src-loading", "src-banner", "src-cards", "src-foot", "src-sync"]) {
  elements[id] = makeEl(id);
}
let statusFailure = false;
let triggered = 0;
let statusReads = 0;
let completionPolls = 0;
let neverComplete = false;
let lastPollArgs = null;
const sourceDto = {
  status: "ok",
  sources: [
    { source_id: "host:claude-code", host: "claude-code", connection_state: "not_detected",
      scan: { source_count: 0 }, log: {}, import_scope: { facts: 0, sessions: 0 }, failed_scope: { sources: 0 },
      recovery_action: { kind: "scan_and_connect", label: "扫描并接入" } },
    { source_id: "host:codex", host: "codex", connection_state: "connected",
      scan: { source_count: 2 }, log: { last_event_at_ms: 1 }, import_scope: { facts: 4, sessions: 2 }, failed_scope: { sources: 0 },
      recovery_action: { kind: "sync", label: "立即同步" } },
    { source_id: "host:dsh", host: "dsh", connection_state: "needs_attention",
      scan: { source_count: 1 }, log: {}, import_scope: { facts: 0, sessions: 0 },
      failed_scope: { sources: 1, error_codes: ["permission"] }, recovery_action: { kind: "retry_sync", label: "重新同步" } },
  ],
};
// workbench.js 在加载时解构 `const { invoke } = window.__TAURI__.core`，之后换
// `sandbox.__TAURI__.core.invoke` 不起作用；计费段用这个钩子注入自己的 fixture。
let billingOverride = null;
const invoke = async (command, args) => {
  if (billingOverride) {
    const overridden = await billingOverride(command, args);
    if (overridden !== undefined) return overridden;
  }
  if (command === "data_source_status") {
    statusReads += 1;
    return statusFailure ? { status: "unavailable", reason: "schema mismatch", sources: [] } : sourceDto;
  }
  if (command === "custom_source_roots") return { status: "ok", sources: [] };
  if (command === "source_read_locations") return { status: "ok", locations: {} };
  if (command === "sync_pause_state") return { status: "ok", paused: false };
  if (command === "read_overview") return { sync: { ok: true, at: "same-second" } };
  if (command === "trigger_sync") { triggered += 1; return "sync-test-1"; }
  if (command === "sync_request_status") {
    completionPolls += 1;
    lastPollArgs = args;
    return { request_id: "sync-test-1", completed: !neverComplete && completionPolls >= 2 };
  }
  return null;
};
const sandbox = {
  console,
  document: {
    getElementById: id => (elements[id] ||= makeEl(id)),
    createElement: tag => makeEl(tag),
    createTextNode: text => ({ textContent: String(text), children: [] }),
    querySelectorAll: () => [],
    addEventListener() {},
  },
  __TAURI__: { core: { invoke }, event: { listen: async () => () => {} } },
  setTimeout: fn => { fn(); return 1; }, clearTimeout() {},
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
sandbox.addEventListener = () => {};
sandbox.TimelineGeometry = { buildTimeline: () => "" };
vm.createContext(sandbox);
vm.runInContext(js, sandbox, { filename: "workbench.js" });

await sandbox.loadSources(true);
// 行式列表（设置页规格 §4.1.1）：row.children = [head, detail]；
// head.children = [dot, name, state, meta, caret]。失败来源排最前
// （renderSources 的 ordered 排序），其余保持契约返回顺序。
const rows = elements["src-cards"].children;
ok(rows.length === 3, "真实 renderSources 渲染三条数据源行");
const names = rows.map(row => row.children[0].children[1].textContent);
ok(names.join("|") === "DeepSeek Harness|Claude Code|Codex", "失败来源排最前，其余顺序来自契约");
const dshDetail = rows[0].children[1];
ok(dshDetail.children.some(child => child.title === "permission"), "原始 error code 只在展开区 title，不上摘要文字");
ok(dshDetail.children.some(child => child.textContent.includes("没有读取权限")), "reason code 映射为人话（规格 §5.6）");
ok(dshDetail.children.some(child => child.textContent.includes("不是新鲜数据")), "失败来源明确不宣称数据新鲜");
ok(elements["src-banner"].hidden === false && elements["src-banner"].textContent.includes("DeepSeek Harness") && elements["src-banner"].textContent.includes("其他来源已继续同步"),
  "部分失败横幅点名失败宿主并说明其他来源继续同步");
// 恢复动作现在住在展开区 .src-row-detail-actions 里（规格 §4.1.1），不再是
// 卡片的直接子节点；按钮文字仍是契约 recovery_action.label 原样透传。
const actionButtons = rows.flatMap(row =>
  row.children[1].children.filter(c => c.className === "src-row-detail-actions").flatMap(a => a.children));
const firstAction = actionButtons.find(child => child.textContent === "扫描并接入");
await firstAction.onclick();
ok(triggered === 1 && completionPolls === 2, "恢复动作至少观察一次未完成再等到本请求完成");
ok(statusReads === 2, "本请求完成前不重读、完成后只重读一次独立状态");
ok(lastPollArgs && lastPollArgs.requestId === "sync-test-1", "轮询携带本次同步请求ID");
neverComplete = true;
const readsBeforeTimeout = statusReads;
await firstAction.onclick();
ok(completionPolls === 12 && statusReads === readsBeforeTimeout,
  "超时前轮询十次且不提前重读数据源状态");
ok(elements["src-banner"].hidden === false && elements["src-banner"].textContent.includes("仍在后台运行"),
  "同步超时显示明确错误而不宣称成功");
statusFailure = true;
await sandbox.loadSources(true);
ok(elements["src-banner"].hidden === false && elements["src-banner"].textContent.includes("schema mismatch"),
  "契约失败显示错误横幅而非零数据");

console.log("# 计费确认主链（docs/v1.0.0/BETA_1_BILLING_CONFIRMATION_CHAIN_SPEC.md §7.2，v1.2「明确计费方式」）");
for (const id of ["ov-billing-prompt", "ov-billing-review-panel", "ov-billing-review",
  "ov-billing-review-close", "ov-billing-prompt-copy", "ov-billing-review-list",
  "ov-billing-later", "ov-billing-save", "ov-billing-cancel",
  "ov-billing-relationship-effect", "ov-billing-start", "ov-billing-end", "ov-billing-scope-text",
  "ov-billing-declaration-panel", "ov-billing-declaration-context", "ov-billing-preview", "ov-billing-missing",
  "ov-billing-batch-row", "ov-billing-batch", "ov-billing-batch-text",
  "ov-billing-provider-row", "ov-billing-provider", "ov-billing-route-row", "ov-billing-route",
  "ov-billing-mode-row", "ov-billing-mode", "ov-billing-subscription-fields", "ov-billing-subscription-name",
  "ov-billing-subscription-amount", "ov-billing-subscription-currency", "ov-billing-amount-unknown",
  "ov-billing-recalculation-panel", "ov-billing-recalculation-list",
  "settings-billing-candidates", "settings-billing-candidates-copy", "settings-billing-candidates-open"]) {
  elements[id] ||= makeEl(id);
}
// V1：孤儿端点、两步「应用」按钮、候选直通 accept、直接选 relationship 的旧下拉都不得再出现。
ok(!js.includes("billing_declaration_impact_preview") && !html.includes("billing_declaration_impact_preview"),
  "修订级预览孤儿端点已从前端删除（B5）");
ok(!js.includes("ov-billing-apply") && !html.includes("ov-billing-apply"),
  "保存与重算不再是两次点击（G6）");
ok(!/decision:\s*"accept"|resolve\("accept"\)|"是我的套餐"/.test(js),
  "候选没有绕过预览与声明的 accept 直通（G1）");
ok(!html.includes('id="ov-billing-relationship"') && html.includes('id="ov-billing-route"') && html.includes('id="ov-billing-mode"'),
  "relationship_kind 由「服务商 → 路由 → 计费方式」三步推导，不再直接选（v1.2 §5.3a）");
ok(html.includes('id="ov-billing-review">明确计费方式</button>') && !/编辑/.test(html.slice(html.indexOf('id="ov-billing-prompt"'), html.indexOf('id="ov-billing-prompt"') + 800)),
  "入口主按钮用任务语言「明确计费方式」，不含「编辑」（REQ-020）");
ok(!/billing_candidate_impact_preview[\s\S]{0,400}windowStartMs/.test(js),
  "预览不再由前端传统计月窗口（G2）");
ok(js.includes("calendarLoadedMonth = null;") && js.includes("sessState.loaded = false;") && js.includes("findState.loaded = false;")
  && /async function refreshAfterBillingChange[\s\S]{0,600}loadActiveTab\(\)/.test(js),
  "重算完成后作废用量/会话/待处理缓存并重拉当前页，而不是只刷新总览（用户路径第 6 步）");

const storage = {};
sandbox.localStorage = { getItem: (k) => storage[k] ?? null, setItem: (k, v) => { storage[k] = String(v); }, removeItem: (k) => { delete storage[k]; } };
sandbox.sessionStorage = sandbox.localStorage;
const month = sandbox.statisticsMonth();
const monthStart = month + "-01";
const today = new Date().toISOString().slice(0, 10);
const groupsReport = { status: "ok", month, groups: [
  { group_id: "codex|openai|gpt-5.6-sol|session-native|metered_estimate|" + month, host: "codex", provider_id: "openai",
    model_id: "gpt-5.6-sol", evidence_basis: "session-native", pricing_basis: "metered_estimate", tokens: 1_650_000,
    first_event_at_ms: 1, last_event_at_ms: 2, session_count: 7, effective_start: month, effective_end: month,
    estimated_amounts: [{ amount_minor: 1892, currency: "USD", basis: "metered_estimate" }], unpriced_tokens: 0, unresolved_reason: null },
  { group_id: "claude-code|minimax|MiniMax-M2.5|missing|metered_estimate|" + month, host: "claude-code", provider_id: "minimax",
    model_id: "MiniMax-M2.5", evidence_basis: "missing", pricing_basis: "metered_estimate", tokens: 980_000,
    first_event_at_ms: 1, last_event_at_ms: 2, session_count: 4, effective_start: month, effective_end: month,
    estimated_amounts: [{ amount_minor: 760, currency: "CNY", basis: "metered_estimate" }], unpriced_tokens: 0, unresolved_reason: null },
  // 与 sol 同宿主、同 provider、同证据、同计价依据、同日期 → 同一批量键。
  { group_id: "codex|openai|gpt-5.6-luna|session-native|metered_estimate|" + month, host: "codex", provider_id: "openai",
    model_id: "gpt-5.6-luna", evidence_basis: "session-native", pricing_basis: "metered_estimate", tokens: 120_000,
    first_event_at_ms: 1, last_event_at_ms: 2, session_count: 1, effective_start: month, effective_end: month,
    estimated_amounts: [{ amount_minor: 96, currency: "USD", basis: "metered_estimate" }], unpriced_tokens: 0, unresolved_reason: null },
  // 服务商未知的组：弹窗必须先问服务商。
  { group_id: "claude-code|<unknown>|glm-5|missing|metered_estimate|" + month, host: "claude-code", provider_id: "<unknown>",
    model_id: "glm-5", evidence_basis: "missing", pricing_basis: "metered_estimate", tokens: 640_000,
    first_event_at_ms: 1, last_event_at_ms: 2, session_count: 3, effective_start: month, effective_end: month,
    estimated_amounts: [], unpriced_tokens: 640_000, unresolved_reason: "billing-route-unknown" },
  { group_id: "codex|openai|gpt-mystery|missing|unavailable|" + month, host: "codex", provider_id: "openai",
    model_id: "gpt-mystery", evidence_basis: "missing", pricing_basis: "unavailable", tokens: 18_000,
    first_event_at_ms: 1, last_event_at_ms: 2, session_count: 1, effective_start: month, effective_end: month,
    estimated_amounts: [], unpriced_tokens: 18_000, unresolved_reason: "no compatible price card" },
] };
const candidatesReport = { status: "ok", candidates: [{ candidate_id: "candidate-test", host: "codex", provider_id: "openai",
  amount_minor: 2000, currency: "USD", billing_period_start: "2026-06-01", status: "pending" }] };
await sandbox.renderBillingConfirmation(groupsReport, candidatesReport);
ok(elements["ov-billing-prompt"].hidden === false, "待确认组存在时显示入口提示");
const promptCopy = elements["ov-billing-prompt-copy"].textContent;
ok(/发现 5 组/.test(promptCopy), "提示按组计数");
ok(promptCopy.includes("19.88") && promptCopy.includes("7.60") && !promptCopy.includes("27.48"),
  "提示金额分币列出，USD 与 CNY 永不相加");
ok(promptCopy.includes("确认后可区分订阅覆盖和额外按量费用") && promptCopy.includes("已按官方价估算"),
  "提示同时说清受影响用量、当前默认处理与确认收益（AC26）");
ok(elements["ov-billing-review-panel"].hidden === true, "初始状态保持确认面板收起");
await elements["ov-billing-review"].onclick();
const reviewRows = elements["ov-billing-review-list"].children;
ok(elements["ov-billing-review-panel"].hidden === false && reviewRows.length === 5,
  "点击明确计费方式展开面板并按组渲染五行");
ok(reviewRows[0].children[0].textContent.includes("gpt-5.6-sol") && reviewRows[4].children[0].textContent.includes("无价卡"),
  "V3：金额最大的组在前，无价卡的组排最后");
ok(reviewRows[0].children[0].children.some((child) => child.textContent.includes("来自旧版本套餐记录")),
  "旧资产候选作为证据行挂在同宿主同 provider 的组下");
const rowButtons = reviewRows.map((row) => row.children[1].children.map((b) => b.textContent));
ok(rowButtons.every((labels) => labels.length === 1 && labels[0] === "明确计费方式"),
  "每组只有一个主操作「明确计费方式」");

// 弹窗：路由已知（session-native）→ 只问计费方式；同类组默认批量。
const billingCalls = [];
const previewFixture = (args) => ({ status: "ok", host: args.host, provider_id: args.providerId,
  relationship_kind: args.relationshipKind, effective_start: args.effectiveStart, effective_end: args.effectiveEnd,
  scopes: args.scopes, changes_amounts: args.relationshipKind === "official_subscription",
  moved: { fact_count: 24, session_count: 8, tokens: 1_770_000, unpriced_tokens: 0,
    amounts: args.relationshipKind === "official_subscription" ? [{ amount_minor: 1988, currency: "USD", basis: "metered_estimate" }] : [],
    estimated_amounts: [{ amount_minor: 1988, currency: "USD", basis: "metered_estimate" }] },
  kept: { tokens: 18_000, unpriced_tokens: 18_000, amounts: [] },
  pending: { fact_count: 2, tokens: 900, reasons: ["route-evidence-conflict"] },
  first_event_ts_ms: 1, last_event_ts_ms: 2 });
billingOverride = async (command, args) => {
  billingCalls.push({ command, args });
  if (command === "billing_candidate_impact_preview") return previewFixture(args);
  if (command === "save_billing_declaration_revision") {
    return { status: "saved", revision_id: args.revisionId, declaration_id: args.declarationId, changed: true,
      job: args.relationshipKind === "official_subscription" ? { job_id: "billing-" + args.revisionId, status: "queued", changed: true } : null };
  }
  if (command === "billing_recalculation_job_status") return { status: "succeeded", job_id: args.jobId };
  if (command === "revoke_billing_declaration") return { status: "revoked" };
  if (command === "save_price_route") return { status: "saved" };
  return undefined;
};
sandbox.renderOverview = async () => { billingCalls.push({ command: "<renderOverview>" }); };
await reviewRows[0].children[1].children[0].onclick();
ok(elements["ov-billing-declaration-panel"].hidden === false && elements["ov-billing-provider-row"].hidden === true
  && elements["ov-billing-route-row"].hidden === true && elements["ov-billing-mode-row"].hidden === false,
  "路由证据已是官方（session-native）时只问计费方式，不问服务商与路由（缺什么问什么）");
ok(elements["ov-billing-batch-row"].hidden === false && elements["ov-billing-batch"].checked === true
  && /将同时处理 2 个模型、8 个会话、1\.8M tokens/.test(elements["ov-billing-batch-text"].textContent),
  "默认勾选同宿主、同未知原因、同日期的同类组并汇总模型/会话/tokens");
ok(elements["ov-billing-subscription-fields"].hidden === false && elements["ov-billing-relationship-effect"].textContent.includes("移出按量估算"),
  "默认官方订阅：展示套餐名/月费/币种字段与结果说明");
ok(elements["ov-billing-subscription-amount"].value === "20.00" && elements["ov-billing-subscription-currency"].value === "USD",
  "有旧资产候选时预填其套餐金额/币种供核对");
elements["ov-billing-subscription-amount"].value = "";
ok(elements["ov-billing-start"].value === monthStart && elements["ov-billing-end"].value === today && elements["ov-billing-end"].max === today,
  "起止日期默认为组所在月首日/今天，结束日期上限为今天（§5.4）");
elements["ov-billing-end"].value = "2999-01-01";
await elements["ov-billing-save"].onclick();
ok(elements["ov-billing-preview"].textContent.includes("不能晚于今天") && !billingCalls.some((c) => c.command === "billing_candidate_impact_preview"),
  "结束日期晚于今天时前端直接拒绝，不发预览请求（G3）");
elements["ov-billing-end"].value = today;
await elements["ov-billing-save"].onclick();
ok(elements["ov-billing-preview"].textContent.includes("月费") && !billingCalls.some((c) => c.command === "billing_candidate_impact_preview"),
  "官方订阅未填月费也未勾选「金额暂不清楚」时不发预览");
elements["ov-billing-amount-unknown"].checked = true;
await elements["ov-billing-save"].onclick();
const previewCall = billingCalls.find((c) => c.command === "billing_candidate_impact_preview");
ok(previewCall && previewCall.args.effectiveStart === monthStart && previewCall.args.effectiveEnd === today && previewCall.args.relationshipKind === "official_subscription"
  && previewCall.args.scopes.map((s) => s.scope_value).join(",") === "gpt-5.6-sol,gpt-5.6-luna" && !("windowStartMs" in previewCall.args),
  "预览参数 = 保存参数（宿主/provider/关系/起止日期/批量模型作用域），不传统计月窗口（G2）");
const previewText = elements["ov-billing-preview"].textContent;
ok(previewText.includes("预计从按量估算中移出") && previewText.includes("19.88") && previewText.includes("保持估算 18K")
  && previewText.includes("仍待确认 900") && previewText.includes("路由证据冲突"),
  "V2：预览展示移出 / 保持 / 仍待确认三组数字与分币金额（§5.5）");
ok(elements["ov-billing-save"].textContent === "确认并保存声明" && !billingCalls.some((c) => c.command === "save_billing_declaration_revision"),
  "预览后按钮变为「确认并保存声明」，尚未写入");
await elements["ov-billing-save"].onclick();
const saveCall = billingCalls.find((c) => c.command === "save_billing_declaration_revision");
ok(saveCall && saveCall.args.effectiveStart === monthStart && saveCall.args.effectiveEnd === today && saveCall.args.relationshipKind === "official_subscription"
  && saveCall.args.sourceCandidateId === "candidate-test" && saveCall.args.scopes.length === 2 && saveCall.args.amountMinor === null && saveCall.args.currency === null,
  "保存参数与预览一致；「金额暂不清楚」写空金额而不补挂牌价（AC09）");
ok(!billingCalls.some((c) => c.command === "enqueue_billing_recalculation"),
  "前端不再单独入队：入队由保存命令完成（G6）");
ok(billingCalls.some((c) => c.command === "billing_recalculation_job_status") && billingCalls.some((c) => c.command === "<renderOverview>"),
  "保存后轮询重算回执并刷新总览");
ok(vm.runInContext("sessState.loaded === false && findState.loaded === false && calendarLoadedMonth === null", sandbox),
  "重算完成后用量/会话/待处理缓存已作废（用户路径第 6 步）");
const receipt = elements["ov-billing-preview"];
ok(receipt.textContent.includes("声明已保存") && receipt.textContent.includes("重算已完成") && receipt.children.some((b) => b.textContent === "撤销"),
  "回执原位显示修订、范围与重算状态，并提供撤销");
await receipt.children.find((b) => b.textContent === "撤销").onclick();
ok(billingCalls.some((c) => c.command === "revoke_billing_declaration" && c.args.supersedesRevisionId === saveCall.args.revisionId),
  "撤销追加修订并 supersede 当前修订，不删历史");

// 服务商未知：先选服务商，再问路由，再问计费方式；保存同时写型号归属。
billingCalls.length = 0;
await reviewRows[3].children[1].children[0].onclick();
ok(elements["ov-billing-provider-row"].hidden === false && elements["ov-billing-route-row"].hidden === false
  && elements["ov-billing-missing"].textContent.includes("服务商、路由、计费方式"),
  "服务商未知的组：弹窗先问服务商，并列出缺失项");
elements["ov-billing-amount-unknown"].checked = false;
await elements["ov-billing-save"].onclick();
ok(elements["ov-billing-preview"].textContent.includes("先选择这批用量的服务商") && billingCalls.length === 0,
  "未选服务商时不发预览");
elements["ov-billing-provider"].value = "zhipu-glm";
elements["ov-billing-route"].value = "official";
elements["ov-billing-mode"].value = "api";
elements["ov-billing-mode"].onchange();
ok(elements["ov-billing-subscription-fields"].hidden === true && elements["ov-billing-relationship-effect"].textContent.includes("金额不变"),
  "选官方 API 时不展示订阅字段，并说明金额不变");
await elements["ov-billing-save"].onclick();
const glmPreview = billingCalls.find((c) => c.command === "billing_candidate_impact_preview");
ok(glmPreview && glmPreview.args.providerId === "zhipu-glm" && glmPreview.args.relationshipKind === "official_api"
  && glmPreview.args.scopes.some((s) => s.scope_kind === "provider" && s.scope_value === "unresolved")
  && glmPreview.args.scopes.some((s) => s.scope_kind === "model" && s.scope_value === "glm-5"),
  "预览带用户选的服务商与 provider=unresolved 作用域（只命中 NULL-provider 事实）");
await elements["ov-billing-save"].onclick();
const routeCall = billingCalls.find((c) => c.command === "save_price_route");
ok(routeCall && routeCall.args.input.model_prefix === "glm-5" && routeCall.args.input.provider_id === "zhipu-glm" && routeCall.args.input.mode === "metered",
  "保存时同时写型号归属（下一轮同步归到该服务商）");
ok(!billingCalls.some((c) => c.command === "billing_recalculation_job_status") && billingCalls.some((c) => c.command === "<renderOverview>"),
  "官方 API 不改金额：无重算任务，但仍刷新各面");

// 仍不确定：两次点击只记录 30 天降级，不写声明、不写归属，组留在待处理。
billingCalls.length = 0;
await reviewRows[1].children[1].children[0].onclick();
ok(elements["ov-billing-route-row"].hidden === false, "路由证据缺失（missing）时问路由");
elements["ov-billing-route"].value = "unknown";
elements["ov-billing-route"].onchange();
ok(elements["ov-billing-mode-row"].hidden === true && elements["ov-billing-subscription-fields"].hidden === true,
  "选仍不确定后不再问计费方式");
await elements["ov-billing-save"].onclick();
ok(elements["ov-billing-preview"].textContent.includes("留在待处理列表，未创建计费声明") && elements["ov-billing-save"].textContent === "保持待确认并返回",
  "仍不确定：先展示影响，不创建声明（AC28）");
await elements["ov-billing-save"].onclick();
ok(!billingCalls.some((c) => ["save_billing_declaration_revision", "save_price_route"].includes(c.command)) && storage["agent-vitals-billing-review-deferred-at-ms"],
  "V4：仍不确定第二次点击只记录 30 天降级，无 save / 归属写入");
billingOverride = null;

ok(js.includes("if (billingReviewOpen) renderRows();"),
  "异步读取完成后会补绘已提前展开的确认面板");
await sandbox.renderBillingRecalculationJobs({ status: "ok", jobs: [{
  job_id: "job-retry-test", declaration_id: "decl-test", revision_id: "rev-test",
  status: "failed", error_code: "interrupted", error_detail: "SqliteFailure(Error { code: Busy })",
}] });
const jobRow = elements["ov-billing-recalculation-list"].children[0];
ok(elements["ov-billing-recalculation-panel"].hidden === false &&
  jobRow.children[1].children[0].textContent === "重试重算" &&
  jobRow.children[0].textContent.includes("上次退出时中断") && !jobRow.children[0].textContent.includes("SqliteFailure"),
  "重算失败状态显示旧结果可用、error_code 人话与重试按钮，原始错误串不上卡面（§5.10）");
console.log(failed ? `\n${failed} FAIL` : "\n全部通过。");
process.exit(failed ? 1 : 0);
