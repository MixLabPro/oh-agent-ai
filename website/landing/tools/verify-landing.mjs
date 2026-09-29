#!/usr/bin/env node
// verify-landing.mjs — LANDING 发布门的可执行化（2026-09-30）。
// 零网络审计 + 真截图发布门 + 诚实文案在场检查。发布门当前为红（截图未捕获），
// 用户按 assets/shots/README.md 捕获后自动转绿。
//
// 用法：node tools/verify-landing.mjs [--allow-missing-shots]
//   --allow-missing-shots 仅供开发预览：跳过截图门（结果行会标注 GATE-OPEN）。

import assert from "node:assert/strict";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const landing = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const allowMissingShots = process.argv.includes("--allow-missing-shots");

// ── 1. 零网络审计：页面不得加载任何第三方脚本/字体/追踪 ──
const html = readFileSync(path.join(landing, "index.html"), "utf8");
const jsFiles = readdirSync(path.join(landing)).filter((f) => f.endsWith(".js")).map((f) => readFileSync(path.join(landing, f), "utf8"));
const css = readFileSync(path.join(landing, "styles.css"), "utf8");
const all = [html, css, ...jsFiles].join("\n");

const externalScripts = [...html.matchAll(/<script[^>]+src=["']([^"']+)["']/g)].map((m) => m[1]).filter((src) => /^https?:\/\//.test(src));
assert.deepEqual(externalScripts, [], `不得加载第三方脚本（found: ${externalScripts.join(", ")}）`);
const externalLinks = [...html.matchAll(/<(?:link|img)[^>]+(?:href|src)=["']([^"']+)["']/g)].map((m) => m[1]).filter((src) => /^https?:\/\//.test(src));
assert.deepEqual(externalLinks, [], `静态资源不得外链（found: ${externalLinks.join(", ")}）`);
assert.ok(!/@import\s+url\(/.test(css), "CSS 不得 @import 外链");
assert.ok(!/fetch\(|XMLHttpRequest|sendBeacon|new Image\(\)\.src\s*=/.test(all), "不得有网络请求/信标代码");
// 外链 <a href="https://..."> 仅允许 GitHub 仓库域（跳转型链接，非加载）。
const anchorHrefs = [...html.matchAll(/<a[^>]+href=["'](https?:\/\/[^"']+)["']/g)].map((m) => m[1]);
for (const href of anchorHrefs) {
  assert.ok(/^https:\/\/github\.com\/MixLabPro\/agent-vitals/.test(href), `外链仅允许本仓库 GitHub 域：${href}`);
}
console.log("零网络审计: OK（无第三方脚本/字体/追踪，外链仅 GitHub）");

// ── 2. 诚实文案在场 ──
assert.ok(html.includes("交互示意") || html.includes("示例数据") || html.includes("模拟数据"), "演示区必须标注示意/模拟数据");
assert.ok(html.includes("估算金额，非实际账单") || html.includes("不能直接视为扣款"), "金额必须带估算口径标注");
assert.ok(html.includes("右键 → 打开"), "未公证测试版的右键打开指引必须在场");
assert.ok(/本地|本机|不上传/.test(html), "本地处理主张必须在场");
console.log("诚实文案: OK（示意标注 / 估算口径 / 右键打开指引 / 本地主张）");

// ── 3. 真截图发布门 ──
const shotsDir = path.join(landing, "assets", "shots");
const required = ["hero-diagnostics.png", "b1-repeated-failure.png", "b2-usage-to-session.png", "b3-billing-scope.png", "tray.png"];
const present = existsSync(shotsDir) ? readdirSync(shotsDir) : [];
const missing = required.filter((name) => !present.includes(name));
if (missing.length > 0 && !allowMissingShots) {
  console.error(`真截图发布门: 未通过 — 缺 ${missing.length} 张：${missing.join(", ")}`);
  console.error("捕获方式见 assets/shots/README.md（托盘打开工作台后 Cmd+Shift+4）");
  process.exit(1);
}
console.log(missing.length === 0
  ? "真截图发布门: OK（5 张真机截图齐备）"
  : `真截图发布门: GATE-OPEN（--allow-missing-shots 开发模式，缺 ${missing.length} 张）`);

console.log("verify-landing: PASS");
