#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (path) => readFileSync(`${root}/${path}`, "utf8");
const js = read("apps/desktop/src-tauri/ui/workbench.js");
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
ok(js.includes("for (const source of sources)"), "前端按返回集合渲染而非硬编码宿主");
ok(js.includes("recoverSource(button, key)") && js.includes('invoke("trigger_sync")'),
  "未检测与失败状态都有恢复动作");
ok(js.includes('invoke("sync_request_status", { requestId })'), "恢复动作按请求ID等待完成");

console.log("# 真实前端渲染与恢复链路");
const elements = {};
function makeEl(id) {
  const classes = new Set();
  let textValue = "";
  let htmlValue = "";
  const node = {
    id, children: [], dataset: {}, hidden: false, disabled: false,
    classList: { add: (...names) => names.forEach(name => classes.add(name)), contains: name => classes.has(name) },
    appendChild(child) { this.children.push(child); return child; },
    addEventListener() {}, remove() { this.removed = true; },
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
const invoke = async (command, args) => {
  if (command === "data_source_status") {
    statusReads += 1;
    return statusFailure ? { status: "unavailable", reason: "schema mismatch", sources: [] } : sourceDto;
  }
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
const cards = elements["src-cards"].children;
ok(cards.length === 3, "真实 renderSources 渲染三张宿主卡片");
const names = cards.map(card => card.children[0].children[0].textContent);
ok(names.join("|") === "Claude Code|Codex|DeepSeek Harness", "三宿主名称和顺序来自契约");
ok(cards[2].children.some(child => child.textContent.includes("permission")), "失败范围进入卡片而非假空");
const firstAction = cards[0].children.find(child => child.textContent === "扫描并接入");
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

console.log(failed ? `\n${failed} FAIL` : "\n全部通过。");
process.exit(failed ? 1 : 0);
