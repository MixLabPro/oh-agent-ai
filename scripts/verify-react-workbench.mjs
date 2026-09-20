#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ui = path.join(repo, "apps/desktop/ui-dev");
const reactSource = path.join(ui, "react/src");
const dist = path.join(ui, "dist-react");

function fail(message) {
  console.error(`FAIL ${message}`);
  process.exitCode = 1;
}

for (const required of [
  path.join(ui, "vite.react.config.js"),
  path.join(ui, "react/index.html"),
  path.join(reactSource, "main.tsx"),
  path.join(reactSource, "lib/tauri.ts"),
  path.join(reactSource, "features/trust/TrustPage.tsx"),
  path.join(reactSource, "features/findings/FindingsPage.tsx"),
  path.join(reactSource, "features/findings/DecisionMatrixSection.tsx"),
  path.join(repo, "apps/desktop/src-tauri/src/store.rs"),
  path.join(dist, "index.html"),
]) {
  if (!fs.existsSync(required)) fail(`缺少 React 迁移产物：${path.relative(repo, required)}`);
}

const sourceFiles = [];
function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (/\.(ts|tsx|css)$/.test(entry.name)) sourceFiles.push(full);
  }
}
walk(reactSource);

const source = sourceFiles.map((file) => fs.readFileSync(file, "utf8")).join("\n");
if ((source.match(/https?:\/\//g) || []).length) fail("React 源码包含远端 URL");
const appSource = sourceFiles
  .filter((file) => !file.endsWith(path.join("lib", "tauri.ts")))
  .map((file) => fs.readFileSync(file, "utf8"))
  .join("\n");
if (appSource.includes("__TAURI__")) fail("组件绕过 local bridge 直接访问 __TAURI__");
if (!source.includes('"findings_groups_safe"')) fail("React Findings 未使用版本化安全 DTO command");
if (!source.includes('"decision_matrix_safe"')) fail("React Findings 未使用版本化 decision matrix DTO command");
if (!source.includes('"trust_monitor_config"') || !source.includes('"save_trust_monitor_config"') || !source.includes('"trust_runtime_snapshot"')) fail("React Trust 未使用版本化 monitor DTO commands");
if (!source.includes("aria-labelledby=\"trust-monitor-title\"")) fail("React Trust 缺少 monitor 控件可访问标题");
if (!source.includes("查看明细") || !source.includes("evidence-detail")) fail("React Trust 缺少可展开的证据明细");
if (!source.includes('"trust-monitor-updated"') || !source.includes('"sync-status-updated"')) fail("React Findings/Trust 缺少事件失效刷新");
if (source.includes('"sessions_issues"')) fail("React Findings 直接消费 legacy 宽 DTO");

const html = fs.readFileSync(path.join(dist, "index.html"), "utf8");
if (!html.includes("<div id=\"root\"></div>")) fail("React production entry 缺少 root");
// React's production runtime contains documentation URLs and SVG namespace
// strings. The relevant offline gate is that our source does not create a
// network client or reference an external resource, not that vendor strings
// are absent from minified output.
if (/\b(fetch|WebSocket|EventSource|XMLHttpRequest)\s*\(/.test(source)) fail("React source creates an unapproved network client");
if (/<(?:script|link)[^>]+https?:\/\//i.test(html)) fail("React entry references an external resource");

if (!process.exitCode) console.log("React Workbench contract: OK (isolated build, typed bridge, offline bundle)");
