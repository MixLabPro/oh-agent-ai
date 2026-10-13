#!/usr/bin/env node
// 夜景光照守卫（CITY_NIGHT_LIGHTING_SPEC N4）：灯光预算自洽，且夜景代码不再绕过预算手填强度。
//   1. cityLightBudget 的预算项/亮灯率曲线通过自检（窗光亮度跨度、傍晚高峰与深夜低谷、桥塔霓虹降饱和）；
//   2. 住宅 / 办公亮灯率：办公傍晚更高、深夜更低；活跃会话夜里更亮；路灯主干 > 次干 > 步道；
//   3. 渲染代码里不再有「墙面全程自发光」「每栋楼顶都画霓虹」「路灯/霓虹手填倍率」这些旧写法。
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const engine = path.join(repo, "apps/agent-city/ui/src/engine");
const { buildSync } = createRequire(path.join(repo, "apps/desktop/ui-dev/package.json"))("esbuild");
const out = buildSync({ entryPoints: [path.join(engine, "cityLightBudget.ts")], bundle: true, write: false, format: "cjs", platform: "node", logLevel: "silent" });
const mod = { exports: {} };
vm.runInNewContext(out.outputFiles[0].text, { module: mod, exports: mod.exports, Math });
const B = mod.exports;

assert.equal(JSON.stringify(B.budgetProblems()), "[]", "light budget self-check"); // 跨 vm 上下文的数组不能 deepEqual
assert(B.windowRate(19, "office") > B.windowRate(19, "residential"), "office lights up more in the early evening");
assert(B.windowRate(2, "office") < 0.1 && B.windowRate(2, "residential") < 0.15, "late night is mostly dark");
assert(B.windowRate(20, "residential") > B.windowRate(0.5, "residential") * 3, "evening far brighter than after midnight");
assert(B.activeBoost(0.05) >= 0.45 && B.activeBoost(0.9) <= 1, "active sessions stay lit overnight");
assert(B.lampTier(12) > B.lampTier(8) && B.lampTier(8) > B.lampTier(5), "street lamps tiered by road class");
assert.equal(B.useOfZone("downtown"), "office");
assert.equal(B.useOfZone("residential"), "residential");
assert.equal(B.nightFactor(0.05), 0, "daytime selfLit is not night");
assert.equal(B.nightFactor(1), 1);

// 地标造型：声明化的在 models/landmarks/*.ts，依赖 three 的手写 drawX 在 render/landmarks/*.ts（桥塔霓虹在 suspensionBridge.ts）：夜景代码检查读 cityParts + engine/render/*.ts + engine/systems/*.ts + 全部造型文件。
const modelsDir = path.join(engine, "models/landmarks");
const splitDirs = ["render", "render/landmarks", "systems"].map((d) => path.join(engine, d)).filter((d) => fs.existsSync(d));
const splitFiles = splitDirs.flatMap((d) => fs.readdirSync(d).filter((f) => f.endsWith(".ts")).map((f) => path.join(d, f)));
const parts = [path.join(engine, "cityParts.ts"), ...splitFiles, ...fs.readdirSync(modelsDir).map((f) => path.join(modelsDir, f)), ...fs.readdirSync(path.join(engine, "models")).filter((f) => f.endsWith(".ts")).map((f) => path.join(engine, "models", f))].map((f) => fs.readFileSync(f, "utf8")).join("\n");
const eng = fs.readFileSync(path.join(engine, "CityEngine.ts"), "utf8");
assert(!/uniforms\.uSelfLit\.value = themeBase;/.test(parts), "walls must dim at night (uSelfLit tied to night)");
assert(!/setColorAt\(roofCount, new THREE\.Color\(palette\.accent\)\.multiplyScalar\(3\.2\)\)/.test(parts), "roof neon must be gated to tall/hotel via the budget");
for (const magic of ["night * 3.2", "night * 0.9", "night * 2.4", "night * 2.6"]) assert(!parts.includes(magic), `hand-tuned lamp multiplier ${magic} bypasses LIGHT_BUDGET`);
assert(parts.includes("LIGHT_BUDGET.street.head") && parts.includes("LIGHT_BUDGET.neon.bridge"), "night lights read the budget");
assert(eng.includes("LIGHT_BUDGET.ambient.exposureCut"), "night exposure comes from the budget");
assert(/setNightHour\(hour\)/.test(eng), "engine feeds the local hour to the window-rate curve");
assert(/"#38e8ff"[\s\S]{0,200}bridgeSaturation/.test(parts), "bridge neon is desaturated through the budget");
console.log("City night lighting: budget self-check, rate curves, lamp tiers and no hand-tuned multipliers passed.");
