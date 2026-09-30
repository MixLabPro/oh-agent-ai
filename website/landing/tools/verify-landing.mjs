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
import vm from "node:vm";
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
const externalLinks = [...html.matchAll(/<(?:link|img)[^>]+(?:href|src)=["']([^"']+)["']/g)]
  .filter(([full]) => !/rel=["'][^"']*alternate/.test(full))
  .map((m) => m[1]).filter((src) => /^https?:\/\//.test(src));
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
assert.ok(/交互示意|示例数据|模拟数据|Sample data|simulated/.test(html), "演示区必须标注示意/模拟数据（双语词表）");
assert.ok(/估算金额，非实际账单|不能直接视为扣款|estimate, not a bill|not charges/.test(html), "金额必须带估算口径标注（双语词表）");
assert.ok(html.includes("右键 → 打开") || html.includes("right-click → Open"), "未公证测试版的右键打开指引必须在场（双语词表）");
assert.ok(/本地|本机|不上传|on-device|never leave your Mac|never uploaded/.test(html), "本地处理主张必须在场（双语词表）");
console.log("诚实文案: OK（示意标注 / 估算口径 / 右键打开指引 / 本地主张）");

// ── 2b. 演示脚本行为守卫 ──
// 回归：b1621514 把 app.js 误删成 2 行，静态检查全绿而页面的周期切换/图表/弹窗/动效开关全坏。
// 不引入 jsdom（零依赖）：语法可解析 + 必需交互接线在场 + 脚本引用的每个选择器在页面里都存在。
const appJs = readFileSync(path.join(landing, "app.js"), "utf8");
new vm.Script(appJs, { filename: "app.js" }); // 语法错误直接抛出
for (const needle of ["renderPeriod", "showModal", "motion-paused", "#chart-bars", "data-period", "selectEvent"]) {
  assert.ok(appJs.includes(needle), `app.js 缺少演示交互接线：${needle}（是否被误删？）`);
}
assert.ok(appJs.split("\n").length >= 60, "app.js 行数异常偏少，疑似被截断");
for (const [, id] of appJs.matchAll(/querySelector\('#([\w-]+)'\)/g)) {
  assert.ok(html.includes(`id="${id}"`), `app.js 引用了页面里不存在的 #${id}`);
}
// 英文页：可见文本之外的 aria 属性也不得残留中文（屏幕阅读器会读出来）。
// data-i18n-aria 的默认值由 i18n.js 覆盖，同样要求英文。
const cjk = /[㐀-鿿]/;
const aria = [...html.matchAll(/aria-label="([^"]*)"/g)].map((m) => m[1]).filter((v) => cjk.test(v));
assert.deepEqual(aria, [], `英文页 aria-label 不得含中文：${aria.join(" | ")}`);
console.log("演示脚本: OK（可解析 / 交互接线在场 / 选择器均存在 / aria 无中文残留）");

// ── 2c. 禁用词（LANDING_VALUE_FIRST_SPEC §0.6.5）：我们不产出/不支持的承诺 ──
const i18nText = readFileSync(path.join(landing, "i18n.js"), "utf8");
const banned = [/health score/i, /\bwasted\b|waste detected|estimated waste/i, /real-?time/i, /\bintervene\b/i, /auto-?fix/i, /\bburned\b/i, /saves? you/i, /framework-agnostic/i, /LangGraph|CrewAI|AutoGen/i, /cargo install/i, /agent-vitals (audit|inspect)/i];
for (const re of banned) assert.ok(!re.test(html) && !re.test(i18nText), `页面含禁用承诺词：${re}`);
console.log("禁用词: OK（无评分/浪费/实时/干预/框架无关/不存在的命令）");

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
// 双语（2026-10-01 i18n）：默认英文 + zh 可切。
assert.equal(html.match(/<html lang="en">/)?.[0], '<html lang="en">', "默认语言必须英文");
assert.ok(html.includes('hreflang="zh"') && html.includes('hreflang="en"'), "hreflang 双语声明在场");
assert.ok(html.includes('data-lang-switch="zh"'), "默认面上必须给中文切换入口");
assert.ok(html.includes('data-i18n='), "i18n 替换键已挂载");
const i18nSource = readFileSync(path.join(landing, "i18n.js"), "utf8");
assert.ok(!/fetch\(|XMLHttpRequest|sendBeacon/.test(i18nSource), "i18n 脚本零网络");
assert.ok(!/document\.cookie/.test(i18nSource), "语言偏好不得用 Cookie（localStorage 本地）");
console.log(missing.length === 0
  ? "真截图发布门: OK（5 张真机截图齐备）"
  : `真截图发布门: GATE-OPEN（--allow-missing-shots 开发模式，缺 ${missing.length} 张）`);

console.log("verify-landing: PASS");
