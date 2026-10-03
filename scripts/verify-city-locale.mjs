import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(path.join(repo, "apps/desktop/ui-dev/package.json"));
const React = require("react");
const { buildSync } = require("esbuild");
const source = buildSync({ entryPoints: [path.join(repo, "apps/agent-city/ui/src/i18n.tsx")],
  bundle: true, write: false, format: "cjs", external: ["react"],
  nodePaths: [path.join(repo, "apps/agent-city/ui/node_modules")] }).outputFiles[0].text;
const window = { __AV_PLUGIN_LOCALE__: "en" }; window.parent = window;
const module = { exports: {} };
vm.runInNewContext(source, { window, module, exports: module.exports, require, URL,
  location: { href: "http://localhost/" } });
const { cityText, cityView } = module.exports;
for (const [zh, en] of [["城市设置", "City settings"], ["执行环境城区", "Harness districts"],
  ["30 天", "30 days"], ["取消导出 · 25%", "Cancel export · 25%"],
  ["暂停回放", "Pause replay"], ["会话详情", "Session details"]]) {
  assert.equal(cityText(zh, "en"), en);
  assert.equal(cityText(zh, "zh-Hans"), zh);
}
const translated = cityView(React.createElement("button", { "aria-label": "城市设置" }, "城市设置"), "en");
assert.equal(translated.props["aria-label"], "City settings");
assert.equal(translated.props.children, "City settings");
const excerpt = React.createElement("blockquote", null, "城市设置");
assert.equal(cityView(excerpt, "en"), excerpt, "user excerpts must never be translated");
assert.equal(cityText("用户原文，不应翻译", "en"), "用户原文，不应翻译");
console.log("City locale: passed (catalog, dynamic labels, accessibility, zh fallback, raw excerpt preservation).");
