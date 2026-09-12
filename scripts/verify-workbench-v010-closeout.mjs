#!/usr/bin/env node
// 文件名保留历史 v0.10 收口入口；断言内容跟随当前 v1 Workbench 契约，避免旧 CI/本地命令失效。
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
ok(js.includes('id = "sess-detail-trace"') && js.includes("会话轨迹图"), "会话详情有轨迹区块");
ok(js.includes("loadDetailTrace(data.session_ref)"), "详情轨迹使用安全 session_ref");
ok(js.includes('invoke("session_trace", { sessionRef'), "轨迹 IPC 只接收安全引用");
ok(js.includes("sessions_read",) && js.includes("s.session_ref"), "会话详情读取使用安全引用");

console.log("# 响应式");
ok(css.includes(".cards {\n  display: grid") && css.includes(".cards { grid-template-columns: 1fr; }"),
  "KPI 网格在窄窗口折为单列");
ok(/\.detail-cards,\s*\n\s*\.cards-4\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/.test(css),
  "详情与 Findings 卡片在窄窗口折为两列");
ok(/\.tabs\s*\{[\s\S]*?overflow-x:\s*auto/.test(css), "顶部 tabs 局部横向滚动");
ok(/\.table-wrap\s*\{[\s\S]*?overflow:\s*auto/.test(css), "宽表只在容器内滚动");
ok(/\.sess-toolbar\s*\{[^}]*flex-wrap:\s*wrap/.test(css), "Sessions 工具栏可换行");
ok(!html.includes('style="min-width:320px"'), "Trace 输入不再带固定内联最小宽度");

console.log("# 构建身份与状态文案（v1 当前契约）");
const cargoVersion = cargo.match(/^version = "([^"]+)"/m)?.[1];
ok(/^\d+\.\d+\.\d+$/.test(cargoVersion || ""), "桌面 Cargo 使用有效语义版本");
ok(tauri.version === cargoVersion, "Tauri 与 Cargo 版本锁步");
ok(/fn about_diagnostics\(\)/.test(lib), "后端提供 about_diagnostics");
ok(/generate_handler!\[[\s\S]*about_diagnostics,/.test(lib), "about_diagnostics 注册进 IPC");
ok(js.includes('invoke("about_diagnostics")'), "前端读取版本与诊断信息");
ok(lib.includes("会话数据暂不可用"), "菜单区分来源故障");
ok(lib.includes("尚无会话"), "菜单区分真实空用量");
ok(js.includes('invoke("data_status")'), "数据源页消费 SQL Authority 状态");
ok(js.includes("成本不可用"), "总览区分有用量但无实际金额");
ok(js.includes("尚未接入的会话维度") || js.includes("暂不可用"), "详情降级说明存在");
ok((js.match(/function fmtTokens\(/g) || []).length === 1, "token 格式化函数只有一份");

console.log(failed ? `\n${failed} FAIL` : "\n全部通过。");
process.exit(failed ? 1 : 0);
