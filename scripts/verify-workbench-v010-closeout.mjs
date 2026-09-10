#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (path) => readFileSync(`${root}/${path}`, "utf8");
const html = read("apps/desktop/src-tauri/ui/workbench.html");
const css = read("apps/desktop/src-tauri/ui/workbench.css");
const js = read("apps/desktop/src-tauri/ui/workbench.js");
const lib = read("apps/desktop/src-tauri/src/lib.rs");
const cargo = read("apps/desktop/src-tauri/Cargo.toml");
const tauri = JSON.parse(read("apps/desktop/src-tauri/tauri.conf.json"));

let failed = 0;
function ok(condition, message) {
  if (condition) console.log(`  ok  ${message}`);
  else {
    failed += 1;
    console.error(`FAIL  ${message}`);
  }
}

console.log("# 会话计数与 Trace 主路径");
ok(js.includes("data.window_session_count"), "UI 消费独立 window_session_count");
ok(js.includes("data.window_total_tokens"), "UI 单独消费 window_total_tokens");
ok(!/sessState\.total\s*=\s*data\.window_total_tokens/.test(js),
  "token 总量不再写入会话数");
ok(html.includes('id="sess-trace"'), "会话详情有查看轨迹动作");
ok(js.includes("openTraceForSession(currentDetailSession"), "详情动作接到 Trace 上下文");
ok(js.includes('invoke("resolve_session_ref"'), "旧深链先换成安全 session_ref");
ok(html.includes("<summary>高级定位</summary>"), "手工 session_ref 降为高级入口");

console.log("# 响应式");
ok(css.includes("repeat(auto-fit, minmax(min(220px, 100%), 1fr))"),
  "KPI 网格可按窗口宽度折列");
ok(css.includes("repeat(auto-fit, minmax(min(180px, 100%), 1fr))"),
  "详情与 Findings 卡片可折列");
ok(/\.tabs\s*\{[\s\S]*?overflow-x:\s*auto/.test(css), "顶部 tabs 局部横向滚动");
ok(/\.table-wrap\s*\{[\s\S]*?overflow:\s*auto/.test(css), "宽表只在容器内滚动");
ok(/\.sess-toolbar\s*\{[\s\S]*?flex-wrap:\s*wrap/.test(css), "Sessions 工具栏可换行");
ok(!html.includes('style="min-width:320px"'), "Trace 输入不再带固定内联最小宽度");

console.log("# 构建身份与状态文案");
const cargoVersion = cargo.match(/^version = "([^"]+)"/m)?.[1];
ok(cargoVersion === "0.10.0", "桌面 Cargo 版本为 0.10.0");
ok(tauri.version === cargoVersion, "Tauri 与 Cargo 版本锁步");
ok(/fn app_build_info\(/.test(lib), "后端提供 app_build_info");
ok(/generate_handler!\[[\s\S]*app_build_info,/.test(lib), "app_build_info 注册进 IPC");
ok(js.includes('invoke("app_build_info")'), "前端读取构建身份");
ok(lib.includes("有用量，未计价"), "菜单区分有用量但金额不可用");
ok(lib.includes("尚无用量"), "菜单区分真实空用量");
ok(js.includes('invoke("data_status")'), "数据源页消费 SQL Authority 状态");
ok(js.includes("金额不可用"), "总览区分有用量但无实际金额");
ok(js.includes("尚未接入的会话维度"), "详情降级说明降为次级信息");

console.log(failed ? `\n${failed} FAIL` : "\n全部通过。");
process.exit(failed ? 1 : 0);
