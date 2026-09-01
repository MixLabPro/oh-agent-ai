#!/usr/bin/env node
// 断言工作台 fold 事件桥的可测纯部分（src-tauri/ui/workbench.js 的 makePullMerger
// 合并状态机）与两处事件名一致性（lib.rs ↔ workbench.js）。
//
// 为什么是 node + vm：合并状态机是浏览器里的纯逻辑，但「双拉不报错、只有多花
// 一次 IPC/重渲染」正是这类 bug 的命门（先例 scripts/verify-timeline-geometry.mjs：
// 错图不抛异常，必须能对真实实现下断言）。workbench.js 是 `<script src>` 浏览器
// 脚本、没有 module 导出；用 vm 在桩全局里执行**真实文件**，再从上下文里取
// makePullMerger 断言——不是照抄一份逻辑去测（repo 里「测拷贝不算测」是铁律，
// golden 差分同一套）。DOM 集成（真实 listen → 重拉 → 渲染）在无 GUI 环境没法
// 自动验证，只能 `cargo tauri dev` 手动冒烟（见「工作台前端验证」memory）。

import { readFileSync } from "node:fs";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));

let failed = 0;
const ok = (cond, msg) => {
  if (cond) console.log("  ok  " + msg);
  else { failed++; console.error("FAIL  " + msg); }
};

// ── 事件名两处一致（lib.rs 的 FOLD_EVENT ↔ workbench.js 的 listen 参数）──
const lib = readFileSync(`${root}/src-tauri/src/lib.rs`, "utf8");
const wb = readFileSync(`${root}/src-tauri/ui/workbench.js`, "utf8");
const EVENT = "usage-fold-updated";
console.log("# 事件名两处一致");
ok(lib.includes(`"${EVENT}"`), "lib.rs 里定义 `usage-fold-updated`（FOLD_EVENT）");
ok(wb.includes(`"${EVENT}"`), "workbench.js 里订阅 `usage-fold-updated`（listen 参数）");

// 手动同步轮询的标志：声明 + 置位 + 复位齐全，防止「漏复位把之后的事件全吞掉」。
ok((wb.match(/manualSyncPolling/g) || []).length >= 4,
  "manualSyncPolling 声明/置位/复位/读取各就位（共 " + (wb.match(/manualSyncPolling/g) || []).length + " 处）");
ok(wb.includes("manualSyncPolling = true;"), "按钮 handler 置位 manualSyncPolling");
ok(wb.includes("manualSyncPolling = false;"), "按钮 handler 复位 manualSyncPolling（finally）");

// ── vm 里执行真实 workbench.js，取合并状态机 ──
// 顶层只需 window.__TAURI__（invoke/listen）、window.addEventListener、
// document.addEventListener（DOMContentLoaded）——init 不触发，其余 DOM 都不碰。
const sandbox = {
  window: {
    __TAURI__: {
      core: { invoke: async () => ({}) },
      event: { listen: async () => () => {} },
    },
    addEventListener: () => {},
  },
  document: { addEventListener: () => {} },
  console,
  Date,
  setTimeout,
  clearTimeout,
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(wb, sandbox, { filename: "workbench.js" });
const makePullMerger = sandbox.makePullMerger;
ok(typeof makePullMerger === "function",
  "vm 执行真实 workbench.js → makePullMerger 可取（可测纯部分在真实文件里）");
ok(typeof sandbox.refreshActiveTab === "function", "refreshActiveTab 已定义（事件桥重拉入口）");
ok(typeof sandbox.subscribeFoldEvent === "function", "subscribeFoldEvent 已定义（订阅入口）");

console.log("# 概览重拉合并状态机（makePullMerger）");

// 基础：首触发开拉；在途触发只排队；无排队时 done 释放。
const m = makePullMerger();
ok(m.fire() === true, "首次触发 → 开拉（fire 返回 true）");
ok(m.fire() === false, "在途再触发 → 只标排队（fire 返回 false）");
ok(m.fire() === false, "在途第三次触发 → 仍只标排队");
ok(m.done() === true, "轮完且有排队 → 补拉一轮（done 返回 true，保持 running）");
ok(m.fire() === false, "补拉期间又来触发 → 排队");
ok(m.done() === true, "补拉轮完仍有排队 → 再补一轮");
ok(m.done() === false, "无排队 → 释放（done 返回 false）");
ok(m.fire() === true, "释放后再触发 → 开新一轮");

// 突发：N 次触发（事件/手点同刻到达）→ 在途轮 + 至多 1 轮补拉，绝不并发双拉。
const b = makePullMerger();
let rounds = 0;
const trigger = () => { if (b.fire()) rounds++; };
trigger();                                // round 1
for (let i = 0; i < 10; i++) trigger();   // 10 次突发触发全部折叠
ok(rounds === 1, "10 次突发触发 → 只开 1 轮（其余折叠成排队，rounds=" + rounds + "）");
ok(b.done() === true, "轮完 → 补拉 1 轮");
rounds++;                                 // 补拉轮
for (let i = 0; i < 5; i++) trigger();    // 补拉轮内又有 5 次触发
ok(rounds === 2, "补拉轮内再 5 次触发 → 仍只多 1 轮补拉（rounds=" + rounds + "）");
while (b.done()) { rounds++; }
ok(rounds === 3, "全部排空 → 恰好第 3 轮后释放（rounds=" + rounds + "）");
ok(b.done() === false, "释放后 done → false（running 已复位）");

if (failed) { console.error("\n" + failed + " 项断言失败"); process.exit(1); }
console.log("\n通过。");
