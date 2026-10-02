#!/usr/bin/env node
// 城市素材预算守卫：素材目录总量 ≤ 5 MB（用户定的硬上限），且每个文件都在 LICENSES.md 里登记了来源与授权。
// 素材随应用离线分发，这个目录的每个字节都进安装包；没有登记来源的文件不允许进库。
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dir = path.join(repo, "apps/desktop/ui-dev/react/src/features/city/assets");
const BUDGET = 5 * 1024 * 1024;
const files = fs.readdirSync(dir, { recursive: true }).map(String).filter((name) => !path.basename(name).startsWith(".") && fs.statSync(path.join(dir, name)).isFile());
const licenses = fs.readFileSync(path.join(dir, "LICENSES.md"), "utf8");
let total = 0;
for (const name of files) {
  const size = fs.statSync(path.join(dir, name)).size;
  total += size;
  if (name === "LICENSES.md" || name.endsWith(".d.ts")) continue;
  assert(/\.(jpg|png|webp|glb)$/.test(name), `${name}: only compressed images and .glb models belong here (no .hdr/.exr/.zip/.fbx)`);
  assert(size <= 400 * 1024, `${name}: ${(size / 1024).toFixed(0)} KB exceeds the 400 KB per-file cap`);
  // 登记可以是完整文件名，也可以是「-color.jpg / -normal.jpg」成对写法的前缀。
  const stem = name.replace(/-(color|normal)\.jpg$/, "");
  assert(licenses.includes(`\`${name}\``) || licenses.includes(`\`${stem}-color.jpg\``), `${name}: not listed in LICENSES.md`);
}
assert(total <= BUDGET, `city assets total ${(total / 1048576).toFixed(2)} MB > 5 MB budget`);
console.log(`City assets: ${files.length} files, ${(total / 1048576).toFixed(2)} MB of 5 MB, all licensed.`);
