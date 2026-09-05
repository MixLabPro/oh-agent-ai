#!/usr/bin/env node
// 断言总览 KPI 行 / 双轨账 / 决策卡渲染器（src-tauri/ui/workbench.js，v0.9
// Stage D）的可测纯部分——与 scripts/verify-workbench-fold-bridge.mjs 同一
// 模式：node + vm 执行**真实文件**，不是照抄一份逻辑去测。
//
// 断言的诚实性规则（每条背后都是本会话实测过的坑）：
// 1. 无数据渲染「无数据」，绝不渲染 0（spec §0.1；DSH 0-token 月事故同款）。
// 2. 名义成本排除 fixed_subscription（月费不是标价折算——混进名义就重复计钱）。
// 3. 订阅利用率 >50× → 「归属待核」告警而非「值 N 倍」（anthropic 380× 实测：
//    倍数异常是声明错误的自检信号）。
// 4. cache_write 档位假设必须出现在名义副行（1hr/5min 差 5.2%，假设不是观测）。
// 5. 决策卡：Claude Pro 恒「窗口余量不可得」（quotaLimits 只有拒绝快照，不得
//    反推假百分比）；Codex <15% 建议提前切。

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

// 静态断言：关键诚实性文案在真实文件里
console.log("# 静态断言（真实文件内容）");
ok(wb.includes("cache_write 按 1hr 计"), "名义副行带 cache_write 档位假设标注");
ok(wb.includes("归属待核"), ">50× 的「归属待核」告警文案存在");
// （审查 #9：此处原是恒真断言 `X===false || X`，给假绿——名义排除订阅月费的
// 行为已由下方 renderKpiRow 的 $1180 断言真实覆盖，恒真行删除。）

// ── vm 执行真实文件 ──
function makeElement() {
  const classes = new Set();
  return { textContent: "", innerHTML: "", hidden: false, style: {},
    className: "", title: "", appendChild() {}, setAttribute() {},
    classList: {
      add: (c) => classes.add(c),
      remove: (c) => classes.delete(c),
      toggle: (c, force) => (force === undefined ? (classes.has(c) ? classes.delete(c) : classes.add(c)) : force ? classes.add(c) : classes.delete(c)),
      contains: (c) => classes.has(c),
    },
  };
}
const elements = {};
const el = (id) => (elements[id] ??= makeElement());
const sandbox = {
  window: {
    __TAURI__: {
      core: { invoke: async (cmd) => (cmd === "data_codex_quota" ? sandbox.__quota : null) },
      event: { listen: async () => () => {} },
    },
    addEventListener: () => {},
  },
  document: {
    addEventListener: () => {},
    createElement: () => makeElement(),
    getElementById: (id) => el(id),
  },
};
sandbox.window.document = sandbox.document;
vm.createContext(sandbox);
vm.runInContext(wb, sandbox);
sandbox.__quota = null;

const num = (id) => elements[id]?.textContent ?? "";
console.log("# renderKpiRow");
// 合成 DTO：形状 = 真实冻结 DTO（Stage B/C 后：by_provider 条目带 currency）
const daily = {
  by_provider: {
    "claude-code/anthropic": { amounts_by_basis: { api_equivalent: 1000 }, currency: "USD", has_unresolved: false },
    "claude-code/deepseek-official": { amounts_by_basis: { metered_estimate: 300 }, currency: "CNY", has_unresolved: false },
    "claude-code/zhipu-glm": { amounts_by_basis: { fixed_subscription: 118 }, currency: "CNY", has_unresolved: true },
    "codex/openai": { amounts_by_basis: { api_equivalent: 180 }, currency: "USD", has_unresolved: false },
  },
  total_actual_spend: { CNY: 118, USD: 0 },
  tokens_by_host: {
    "claude-code": { total: 1_000_000_000, uncached_input: 4_000_000, cache_read: 990_000_000, cache_write: 6_000_000, output: 0, cache_hit_ratio: 0.99 },
    codex: { total: 500_000_000, uncached_input: 100_000_000, cache_read: 400_000_000, cache_write: 0, output: 0, cache_hit_ratio: 0.8 },
  },
};
sandbox.renderKpiRow("t", daily);
ok(num("ov-t-tokens") === "1.50B", `tokens 四桶跨宿主合计（got ${num("ov-t-tokens")}）`);
ok(/^¥[\d.]+ \+ \$[\d.]+$/.test(num("ov-t-nominal")),
  `名义分栏统一币序 CNY 优先（UX#5，got ${num("ov-t-nominal")}）`);
ok(num("ov-t-nominal").includes("+") && /¥[\d.]+/.test(num("ov-t-nominal")),
  `名义跨币分栏并列（got ${num("ov-t-nominal")}）`);
// USD 栏 = api_equivalent 1000 + 180；¥300 是 metered 分栏——fixed_subscription
// 118 必须被排除（月费不是标价折算）。
ok(num("ov-t-nominal").includes("$1180.00") && num("ov-t-nominal").includes("¥300.00"),
  `名义分栏正确且排除订阅月费（got ${num("ov-t-nominal")}）`);
ok(!num("ov-t-nominal").includes("118.00"), "订阅月费 ¥118 没有混进名义");
ok(num("ov-t-actual") === "¥118.00", `实际 = total_actual_spend 分币（got ${num("ov-t-actual")}）`);
// 跨宿主合成 = Σread/Σ(unc+read+write) = 1390M/1500M = 92.7%
ok(num("ov-t-cache") === "92.7%", `命中率跨宿主合成 1390/1500（got ${num("ov-t-cache")}）`);

// 无数据 → 「无数据」绝不 0
sandbox.renderKpiRow("t", null);
ok(num("ov-t-tokens") === "无数据" && num("ov-t-actual") === "无数据",
  "无 DTO 时全部 tile 渲染「无数据」");
const emptyDto = { by_provider: {}, total_actual_spend: {}, tokens_by_host: {} };
sandbox.renderKpiRow("t", emptyDto);
ok(num("ov-t-nominal") === "无数据", "全空宿主渲染「无数据」，不渲染 0（DSH 0-token 月同款纪律）");

console.log("# renderDualTrack");
const monthly = {
  by_provider: {
    "claude-code/anthropic": { amounts_by_basis: { fixed_subscription: 20, api_equivalent: 1278 }, currency: "USD", has_unresolved: false },
    "claude-code/minimax": { amounts_by_basis: { fixed_subscription: 114, api_equivalent: 127.8 }, currency: "CNY", has_unresolved: false },
    "claude-code/deepseek-official": { amounts_by_basis: { metered_estimate: 452.87 }, currency: "CNY", has_unresolved: false },
    "claude-code/zhipu-glm": { amounts_by_basis: { fixed_subscription: 118 }, currency: "CNY", has_unresolved: true },
    "dsh/deepseek-official": { amounts_by_basis: {}, currency: "CNY", has_unresolved: false },
  },
  total_actual_spend: { CNY: 232, USD: 20 },
};
elements["ov-dual-list"] = { textContent: "", innerHTML: "", hidden: true, appendChild(child) { this._kids ??= []; this._kids.push(child); }, className: "" };
elements["ov-dual-empty"] = { hidden: false };
sandbox.renderDualTrack(monthly);
const dualHtml = (elements["ov-dual-list"]._kids || []).map((k) => k.innerHTML).join("\n");
ok(dualHtml.includes("归属待核"), "anthropic 63.9× → 归属待核告警（>50× 护栏）");
ok(dualHtml.includes("值回月费 1.1×"), "minimax 1.12× 显示「值回月费 1.1×」（UX#11 展开文案）");
// glm（有月费、无标价折算、unresolved）在订阅轨里必须显示 unresolved chip
// ——曾因分类进 subEntries 后丢提示，看起来"一切正常"。
ok(dualHtml.includes("含未定价 tokens"), "glm 的 unresolved chip（不得显示 ¥0 或假装正常）");
ok(dualHtml.includes("估算（relay 上界）"), "deepseek 的 metered_estimate 带上界口径标签");
ok(dualHtml.includes("$20.00") && dualHtml.includes("¥114.00"), "月费带币种符号（条目级 currency）");

console.log("# renderDecideCard（async，等 promise 排空）");
elements["ov-decide-body"] = { textContent: "", innerHTML: "", appendChild(child) { this._kids ??= []; this._kids.push(child); } };
// stub 形状 = fold plan_from_rate_limits 的真实产物（limits.primary 在下）——
// 审查 #1：旧 stub 按渲染器的错误期望（顶层 primary）构造，互相印证假绿。
sandbox.__quota = { plan_type: "plus", has_credits: false,
  limits: { primary: { used_percent: 92, window_minutes: 10080, resets_at: 1786000000 } },
  observed_at: "2026-09-05T00:00:00Z" };
await sandbox.renderDecideCard(monthly);
let decideHtml = elements["ov-decide-body"].innerHTML + (elements["ov-decide-body"]._kids || []).map((k) => k.textContent).join("");
ok(decideHtml.includes("92% 剩余") || decideHtml.includes("8% 剩余"), `Codex 窗口条给剩余%（got 截断）`);
ok(decideHtml.includes("即将限流"), "Codex 剩 8% → 建议行「即将限流」预警态");
ok(decideHtml.includes("窗口余量不可得"), "Claude Pro 恒标「不可得」（拒绝快照反推不了正向余量）");

sandbox.__quota = { plan_type: "plus", has_credits: false,
  limits: { primary: { used_percent: 40, window_minutes: 10080, resets_at: 1786000000 } },
  observed_at: "2026-09-05T00:00:00Z" };
sandbox.renderDecideCard._quotaAt = 0; // 穿透 60s memo（审查 #6 修复引入），否则第二次调用复用 92% 的缓存
elements["ov-decide-body"] = { textContent: "", innerHTML: "", appendChild(child) { this._kids ??= []; this._kids.push(child); } };
await sandbox.renderDecideCard(monthly);
decideHtml = elements["ov-decide-body"].innerHTML + (elements["ov-decide-body"]._kids || []).map((k) => k.textContent).join("");
ok(decideHtml.includes("可继续使用"), "Codex 剩 60% → 健康态");

console.log(failed ? `\n${failed} 项失败` : "\n全部通过");
process.exit(failed ? 1 : 0);
