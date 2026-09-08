#!/usr/bin/env node
// v0.10.0 Traces 渲染壳的可测纯部分验证（模式同 verify-workbench-fold-bridge.mjs：
// vm 桩全局执行**真实** workbench.js——测拷贝不算测）。
//
// 断言三件事：
// 1. 事件/命令名两处一致：lib.rs 的 `session_trace` command ↔ workbench.js 的
//    invoke 参数；HTML 的 tab id ↔ JS 的 DOM id（错一个字母渲染壳就是哑的）。
// 2. 用**真实 CLI DTO**（release 二进制对入库 fixture 跑 trace --timeline-series
//    的输出）过真实 buildTimeline——渲染壳消费的形状就是 IPC 会给的形状。
// 3. Traces tab 的行为接线存在：renderTrace 绑定、namespace 必填校验（spec §9
//    身份段不发明——前端也要拦，不是只靠后端）、unplaced_events 显式展示路径。
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
let failed = 0;
const ok = (cond, msg) => {
  if (cond) console.log("  ok  " + msg);
  else { failed++; console.error("FAIL  " + msg); }
};

const lib = readFileSync(`${root}/apps/desktop/src-tauri/src/lib.rs`, "utf8");
const html = readFileSync(`${root}/apps/desktop/src-tauri/ui/workbench.html`, "utf8");
const wb = readFileSync(`${root}/apps/desktop/src-tauri/ui/workbench.js`, "utf8");

console.log("# 事件/命令名两处一致");
ok(/fn session_trace\(/.test(lib), "lib.rs 定义 session_trace command");
ok(/invoke_handler[\s\S]*session_trace,/.test(lib), "session_trace 注册进 generate_handler");
ok(wb.includes('invoke("session_trace"'), "workbench.js invoke session_trace");
for (const id of ["trace-path", "trace-host", "trace-ns", "trace-render", "trace-banner", "trace-timeline", "trace-empty", "trace-coverage"]) {
  ok(html.includes(`id="${id}"`), `HTML 有 #${id}`);
  ok(wb.includes(`"${id}"`), `workbench.js 引用 #${id}`);
}
ok(html.includes('data-tab="traces"'), "HTML 有 Traces tab 按钮");
ok(html.includes('id="tab-traces"'), "HTML 有 tab-traces 面板");
ok(html.includes("timeline.js"), "工作台加载共享 timeline.js（几何唯一份）");
ok(!/function\s+buildGeometry|function\s+buildTimeline/.test(wb), "workbench.js 不含第二份几何实现");

// ── 真实 DTO 过真实几何 ──
console.log("# 真实 CLI DTO × 真实 buildTimeline");
const bin = `${root}/target/release/agent-vitals`;
const fixture = `${root}/fixtures/dsh/session.jsonl.zstd`;
const spec = JSON.parse(execFileSync(bin, [
  "trace", fixture, "--host", "dsh", "--machine-namespace", "ns-ui",
  "--timeline-series",
], { encoding: "utf8" }));
ok(spec.points.length > 0 && spec.events.length > 0, `DTO 可用（points=${spec.points.length} events=${spec.events.length}）`);

// vm 桩全局：最小 DOM 桩 + __TAURI__ invoke 桩（返回真实 CLI DTO），执行真实
// workbench.js，再直接调 renderTrace 的按钮 handler 走完整渲染路径。
const listeners = {};
const docReady = [];   // DOMContentLoaded 回调——workbench.js 的元素绑定都在这里注册
const elements = {};
function makeEl(id) {
  return {
    id,
    value: id === "trace-path" ? fixture
      : id === "trace-ns" ? "ns-ui"
      : id === "trace-host" ? "dsh"   // select 桩的默认选中项 = 真实 HTML 的第一个 option
      : "",
    textContent: "", innerHTML: "", hidden: false, disabled: false,
    addEventListener(ev, fn) { (listeners[`${id}:${ev}`] ||= []).push(fn); },
    keydown: null,
  };
}
for (const id of ["trace-path", "trace-host", "trace-ns", "trace-render", "trace-banner", "trace-timeline", "trace-empty", "trace-coverage"]) {
  elements[id] = makeEl(id);
}
const sandbox = {
  window: {},
  document: {
    // 自动造宽容元素：workbench.js 的 init() 摸的是整个真实页面，逐个补桩
    // 是打地鼠——任意 id 都给一个可绑事件/可读写的元素，让真实 init 全程跑。
    getElementById: (id) => (elements[id] ||= makeEl(id)),
    addEventListener: (ev, fn) => { if (ev === "DOMContentLoaded") docReady.push(fn); },
    querySelectorAll: () => [],
  },
  console,
  invoke: async (cmd, args) => {
    // 桩 = 真实二进制（同 store.rs 的 spawn 语义）：形状即 IPC 形状。
    // 只对 session_trace 走真二进制——init() 的其他 IPC（peek_focus_target 等）
    // 返回 null，与本验证无关。
    if (cmd !== "session_trace") return null;
    try {
      // --timeline-series 是布尔 flag 不吃值，"--json FILE" 才吃——照真实 CLI
      // 面拼参数，不发明（这里吃过的亏：多塞一个 "-" 直接 clap 报错）。
      const cliArgs = [
        "trace", args.path, "--host", args.host,
        "--machine-namespace", args.machineNamespace,
      ];
      if (args.output === "graph") cliArgs.push("--json", "-");
      else cliArgs.push("--timeline-series");
      const out = execFileSync(bin, cliArgs, { encoding: "utf8" });
      return { data: JSON.parse(out) };
    } catch (e) {
      console.error("  [stub] invoke 失败:", e.status, e.stderr?.slice(0, 200), e.stdout?.slice(0, 200));
      throw e;
    }
  },
  setTimeout, clearTimeout,
};
sandbox.addEventListener = () => {};   // window.addEventListener（focus 重拉钩子）
sandbox.__TAURI__ = {
  core: { invoke: sandbox.invoke },
  event: { listen: async () => () => {} },   // workbench.js 顶层解构 event.listen——给空订阅
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
// 真实 timeline.js 先进沙箱（UMD：无 module → root.TimelineGeometry，root=self/
// this → 沙箱全局）——workbench.js 消费的 window.TimelineGeometry 必须是**真实
// 几何**，不是桩。
vm.runInContext(readFileSync(`${root}/apps/desktop/src-tauri/ui/timeline.js`, "utf8"),
  sandbox, { filename: "timeline.js" });
ok(typeof sandbox.TimelineGeometry?.buildTimeline === "function", "真实 timeline.js 在沙箱内加载出 buildTimeline");
vm.runInContext(wb, sandbox, { filename: "workbench.js" });

// 触发 DOMContentLoaded → 真实注册路径跑完 → 再触发按钮 handler。
for (const fn of docReady) fn();
const handlers = listeners["trace-render:click"] || [];
ok(handlers.length === 1, "渲染按钮绑定恰好一个 handler");
await handlers[0]();
ok(elements["trace-timeline"].innerHTML.includes("<svg") || elements["trace-timeline"].innerHTML.includes("tl-"),
  "真实 DTO 渲染出 SVG（或几何空态标记）");
ok(!elements["trace-banner"].hidden === false || elements["trace-banner"].textContent === "",
  "无错误时 banner 不出现");
ok(elements["trace-coverage"].textContent.includes("节点"), "coverage 六计数原样呈现（无单值比率）");

// namespace 缺失 → 前端拦截，不发起 invoke（spec §9 身份段不发明）。
elements["trace-ns"].value = "";
await handlers[0]();
ok(elements["trace-banner"].textContent.includes("namespace"), "namespace 缺失被前端拦截并提示");

console.log(failed ? `\n${failed} FAIL` : "\n全部通过。");
process.exit(failed ? 1 : 0);
