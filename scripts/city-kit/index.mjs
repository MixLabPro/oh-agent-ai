// City 守卫公共加载器（CITY_ARCHITECTURE §6 / 迁移步 1「测试提速」）。
//
// 旧做法：每个守卫用 esbuild 打包后放进 vm.runInNewContext 执行，并各自重新生成同一批岛。
// 实测 vm 沙箱里的规划比原生慢约 8 倍（tier 10 单岛原生 1.5 s、vm 内 12 s），完整 verify:city 要 25–30 分钟。
// 新做法：打包一次写成 ESM 临时文件、原生 import；规划结果按 (seed, tier, profile) 在进程内缓存，
// 同一进程里跑多个守卫时共享（scripts/verify-city-all.mjs）。
//
// 只读约定：缓存返回的是同一个 plan 对象，守卫不得修改它（需要改动的先结构化克隆）。
// 跨引擎守卫（V8 vs JavaScriptCore）仍走自己的 vm/jsc 路径，不用本加载器。
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

export const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const citySrc = path.join(repo, "apps/agent-city/ui/src");
const { buildSync } = createRequire(path.join(repo, "apps/desktop/ui-dev/package.json"))("esbuild");

const loaded = new Map();

/** 按 { 导出名: 相对 src 的模块路径 } 打包并原生加载；同一组导出只打包一次。 */
export async function loadCity(exportsByModule) {
  const lines = Object.entries(exportsByModule)
    // "pkg:three" = 包名，其余是相对 src 的模块路径。
    .map(([module, names]) => `export ${names.length === 1 && names[0].startsWith("* as ") ? names[0] : `{ ${names.join(", ")} }`} from ${JSON.stringify(module.startsWith("pkg:") ? module.slice(4) : path.join(citySrc, module))};`)
    .join("\n");
  const key = crypto.createHash("sha1").update(lines).digest("hex").slice(0, 16);
  if (loaded.has(key)) return loaded.get(key);
  const out = buildSync({ stdin: { contents: lines, resolveDir: citySrc }, bundle: true, write: false, format: "esm", platform: "node", logLevel: "silent" });
  const dir = path.join(os.tmpdir(), "agent-city-kit");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${key}-${process.pid}.mjs`);
  fs.writeFileSync(file, out.outputFiles[0].text);
  const mod = await import(pathToFileURL(file).href);
  loaded.set(key, mod);
  return mod;
}

const plans = new Map();
const configIds = new WeakMap();
let nextConfigId = 1;
/** createCityPlan 的进程内缓存（只读结果）。键含 config 的对象身份：改过的 config 副本与原件永不碰撞。
 *  测「同输入两次生成必须相等」这类确定性断言的守卫要直接调用原函数，不能走缓存。 */
export function cachedPlan(createCityPlan, seed, tier, config) {
  let configId = "none";
  if (config) { if (!configIds.has(config)) configIds.set(config, nextConfigId++); configId = configIds.get(config); }
  const key = `${seed}|${tier}|${configId}`;
  if (!plans.has(key)) plans.set(key, createCityPlan(seed, tier, config));
  return plans.get(key);
}
