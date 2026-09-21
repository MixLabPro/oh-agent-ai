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
  path.join(reactSource, "components/ui/StatusPill.tsx"),
  path.join(reactSource, "features/overview/OverviewPage.tsx"),
  path.join(reactSource, "features/trust/TrustPage.tsx"),
  path.join(reactSource, "features/findings/FindingsPage.tsx"),
  path.join(reactSource, "features/findings/DecisionMatrixSection.tsx"),
  path.join(reactSource, "features/usage/UsagePage.tsx"),
  path.join(reactSource, "features/sessions/SessionsPage.tsx"),
  path.join(reactSource, "features/sessions/SessionDetail.tsx"),
  path.join(reactSource, "features/test/TestPage.tsx"),
  path.join(reactSource, "features/skills/SkillsPage.tsx"),
  path.join(reactSource, "features/settings/SettingsPage.tsx"),
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
const settingsPage = fs.readFileSync(path.join(reactSource, "features/settings/SettingsPage.tsx"), "utf8");
const trustPage = fs.readFileSync(path.join(reactSource, "features/trust/TrustPage.tsx"), "utf8");
const findingsPage = fs.readFileSync(path.join(reactSource, "features/findings/FindingsPage.tsx"), "utf8");
const decisionMatrix = fs.readFileSync(path.join(reactSource, "features/findings/DecisionMatrixSection.tsx"), "utf8");
const sessionsPage = fs.readFileSync(path.join(reactSource, "features/sessions/SessionsPage.tsx"), "utf8");
const sessionDetailPage = fs.readFileSync(path.join(reactSource, "features/sessions/SessionDetail.tsx"), "utf8");
const usagePage = fs.readFileSync(path.join(reactSource, "features/usage/UsagePage.tsx"), "utf8");
const skillsPage = fs.readFileSync(path.join(reactSource, "features/skills/SkillsPage.tsx"), "utf8");
const testPage = fs.readFileSync(path.join(reactSource, "features/test/TestPage.tsx"), "utf8");
if ((source.match(/https?:\/\//g) || []).length) fail("React 源码包含远端 URL");
const appSource = sourceFiles
  .filter((file) => !file.endsWith(path.join("lib", "tauri.ts")))
  .map((file) => fs.readFileSync(file, "utf8"))
  .join("\n");
if (appSource.includes("__TAURI__")) fail("组件绕过 local bridge 直接访问 __TAURI__");
if (!source.includes("components/ui/StatusPill") || !source.includes("inline-flex items-center")) fail("React 应用壳未使用受控 StatusPill primitive");
if (!source.includes('"findings_groups_safe"')) fail("React Findings 未使用版本化安全 DTO command");
if (!source.includes('"decision_matrix_safe"')) fail("React Findings 未使用版本化 decision matrix DTO command");
if (!source.includes('"trust_monitor_config"') || !source.includes('"save_trust_monitor_config"') || !source.includes('"trust_runtime_snapshot"')) fail("React Trust 未使用版本化 monitor DTO commands");
if (!source.includes("aria-labelledby=\"trust-monitor-title\"")) fail("React Trust 缺少 monitor 控件可访问标题");
if (!source.includes("查看明细") || !source.includes("evidence-detail")) fail("React Trust 缺少可展开的证据明细");
if (!source.includes("查看证据") || !source.includes("finding-evidence-detail") || !source.includes("evidence_level") || !source.includes("上传尝试不等于远端接收、留存或训练")) fail("React Findings 缺少可核验的脱敏证据明细");
if (!decisionMatrix.includes("hasStaleReport") || !decisionMatrix.includes("上一次对比结果") || !decisionMatrix.includes("窗口：${report.month}") || !decisionMatrix.includes("section-heading-side")) fail("React 决策矩阵刷新未标注旧窗口、旧结果或响应式状态");
if (!source.includes('"trust-monitor-updated"') || !source.includes('"sync-status-updated"')) fail("React Findings/Trust 缺少事件失效刷新");
if (!source.includes("safeUiError") || [findingsPage, trustPage, sessionsPage, sessionDetailPage].some((page) => /reason\.message/.test(page))) fail("React Findings/Trust/会话错误面未统一脱敏");
const unsafeErrorPattern = /(?:setError|setActionError|setExportError|setCustomError|setBudgetError|setBillingError|setDataError|setAboutError|setSourceError)\([^;\n]*reason\.message/u;
if ([usagePage, settingsPage, skillsPage, testPage].some((page) => unsafeErrorPattern.test(page))) fail("React 用量/设置/Skill/测试错误面仍直接渲染底层异常");
if (!skillsPage.includes("reportStale && scanning") || !skillsPage.includes("未形成新的可判定结果") || !skillsPage.includes("reportMatchesHost") || !source.includes("skill scan host_selection 不匹配") || !skillsPage.includes("保留上一次结果") || skillsPage.includes("setReport(null)")) fail("React Skill 扫描未保留旧报告、隔离宿主或把不可用误判为空结果");
if (testPage.includes("setReport(null)") || !testPage.includes("上一次可读报告") || !testPage.includes("上一次路线质量结果") || !testPage.includes("reportWindow(report)") || !testPage.includes("loading && !report")) fail("React 测试页刷新未保留旧路线质量报告、原始窗口或缺少 stale 状态");
if (!findingsPage.includes("requestGeneration") || !findingsPage.includes("Promise.allSettled") || !findingsPage.includes("发现新鲜度暂不可用")) fail("React Findings 刷新缺少请求代数或部分失败降级");
if (!trustPage.includes("auditLoadingHost") || !trustPage.includes("auditRequest") || !trustPage.includes("上一次可读报告") || !trustPage.includes("上一次审计结果") || trustPage.includes("setReport(null)")) fail("React Trust 审计刷新没有保留旧报告、请求代数或仍会清空证据");
if (!source.includes("today_tokens_sql") || !source.includes("overview-host-panel")) fail("React 总览未消费权威 token/宿主投影");
if (!source.includes('if (page !== "overview") return;')) fail("React 总览查询未按可见 tab 生命周期隔离");
if (!source.includes('"read_calendar_month"') || !source.includes('"read_hourly_distribution"') || !source.includes('"data_monthly_summary"') || !source.includes('"statistics_timezone_config"')) fail("React 用量未使用日历/小时/来源/统计时区安全 DTO command");
if (!source.includes("usage-calendar-grid") || !source.includes("usage-hour-grid") || !source.includes("total_actual_spend") || !source.includes("aria-selected") || !source.includes("dsh_tokens") || !source.includes("claude_tokens") || !source.includes("codex_tokens") || !source.includes("usage-host-summary") || !source.includes("无已观测数据")) fail("React 用量缺少日历、小时、币种、选择状态、宿主拆分或空数据诚实态");
if (!source.includes("loadedCalendarMonth") || !source.includes("sourceError") || !source.includes("不会把上一月份来源数据冒充为当前月份") || !source.includes("mounted.current") || !source.includes("monthRequest.current += 1")) fail("React 用量刷新未隔离月份投影、来源失败态或卸载中的请求");
if (!source.includes('"sessions_list"') || !source.includes("session_ref") || !source.includes("sessions-table") || !source.includes("window_session_count")) fail("React 会话未使用安全列表 DTO 或窗口守恒字段");
if (!source.includes("加载更多") || !source.includes("cost_status") || !source.includes("requestInFlight") || !source.includes("pendingRefresh")) fail("React 会话缺少成本状态、分页或竞态保护");
if (!source.includes('"sessions_read"') || !source.includes("workflow_timeline") || !source.includes("billing_breakdown") || !source.includes("session-detail-panel")) fail("React 会话详情缺少安全摘要、计费桶或脱敏时间线");
if (!source.includes("session detail session_ref 不匹配") || !source.includes("paginationError") || !source.includes("已有详情仍可用，请重试")) fail("React 会话详情缺少分页错配保护或可重试的局部错误态");
if (source.includes('"sessions_issues"')) fail("React Findings 直接消费 legacy 宽 DTO");
if (!source.includes('"routes_quality"') || !source.includes("readRouteQuality") || !source.includes("test-quality-host")) fail("React 测试页未使用只读路线质量 DTO");
if (!source.includes("route quality 时间范围不安全") || !source.includes("reportWindow(report)")) fail("React 路线质量未校验报告时间顺序或未展示原始报告窗口");
if (source.includes('"probe_run_start"')) fail("React 测试页越过 mutation 边界调用主动探针");
if (!source.includes("只读") || !source.includes("不发请求") || !source.includes("无官方基准")) fail("React 测试页缺少主动探针边界或无基准诚实状态");
if (!source.includes('text === "<synthetic>"') || !source.includes('text === "<unknown>"')) fail("React 路线质量未保留合法哨兵模型标识");
if (!source.includes('"data_source_status"') || !source.includes("readSourceHealth") || !source.includes("settings-source-row")) fail("React 设置未使用安全数据源状态 DTO");
if (!source.includes('"source_host_controls"') || !source.includes("supported_hosts") || !source.includes('"set_source_host_excluded"') || !source.includes("setSourceHostExcluded") || !source.includes("supportedHosts.includes(source.host)") || !source.includes("停止读取只影响后续同步") || !source.includes("已导入数据未删除")) fail("React 设置缺少来源能力声明、停止/恢复读取的安全回执或边界文案");
if (!source.includes('"delete_imported_source_data"') || !source.includes("deleteImportedSourceData") || !source.includes("确认删除") || !source.includes("原始日志未修改") || !source.includes("删除未完成；原始日志未修改")) fail("React 设置缺少二次确认、删除回执或失败保护");
if (!source.includes("triggerSync") || !source.includes("setSyncPaused") || !source.includes("readSyncRequestStatus")) fail("React 设置缺少同步控制与回执轮询");
if (!source.includes("readCustomSourceConfig") || !source.includes("addCustomSourceRoot") || !source.includes("removeCustomSourceRoot") || !source.includes("pickCustomSourceRoot")) fail("React 设置缺少自定义读取位置桥接");
if (!source.includes("readBudgetSettings") || !source.includes("saveBudgetProfile") || !source.includes("snoozeBudgetCurrentPeriod") || !source.includes("clearBudgetSnooze")) fail("React 设置缺少预算状态、保存或静默桥接");
if (!source.includes("预算（订阅 + 按量）") || !source.includes("80% 和 100%") || !source.includes("warning_ratio_bp: 8000")) fail("React 设置预算未固定新表单与阈值契约");
if (source.includes('"save_budget_config"') || source.includes('"save_host_bill"')) fail("React 设置越过预算旧配置或账单 mutation 边界");
if (!source.includes("readBillingSettings") || !source.includes('"billing_confirmation_groups"') || !source.includes('"host_bills_for_period"')) fail("React 设置缺少计费只读 DTO");
if (["resolve_billing_import_candidate", "save_billing_declaration_revision", "revoke_billing_declaration", "retry_billing_recalculation", "save_host_bill", "save_host_bills", "delete_host_bill"].some((command) => appSource.includes(`\"${command}\"`))) fail("React 设置越过计费归因或账单写入 mutation 边界");
if (!source.includes("readStatisticsSettings") || !source.includes('"retention_config"') || !source.includes('"statistics_timezone_config"') || !source.includes('"public_pricing_catalog_status"')) fail("React 设置缺少统计、保留期或价格目录只读 DTO");
if (!source.includes("readMonthlyExportSummary") || !source.includes("当前月摘要 CSV") || !source.includes("settings-data-section")) fail("React 设置缺少安全月度摘要导出面");
if (!source.includes("readAboutDiagnostics") || !source.includes("saveDiagnosticPackage") || !source.includes("checkForUpdates") || !source.includes("openTrustedReleasesPage") || !source.includes("settings-about-section")) fail("React 设置缺少关于与诊断安全桥接");
if (!source.includes("readSkillScan") || !source.includes("cancelSkillScan") || !source.includes("skills-page-header") || !source.includes('"skills_doctor_report"')) fail("React Skill 页未使用用户触发的安全扫描 DTO");
if (["skills_snapshot_save", "skills_export_redacted", "skills_export_pick_path", "save_skills_scan_settings", "disable_skill", "delete_skill"].some((command) => appSource.includes(`\"${command}\"`))) fail("React Skill 页越过快照、导出、配置或修改 skill mutation 边界");
if (["save_public_pricing_catalog_policy", "update_public_pricing_catalog", "delete_retained_data", "clear_retention"].some((command) => appSource.includes(`\"${command}\"`))) fail("React 设置越过价格联网或数据删除 mutation 边界");
if (!source.includes("显示完整路径") || !source.includes("settings-custom-form")) fail("React 设置缺少本机位置的人机可读路径展示");
if (!source.includes('status === "unavailable" ? []')) fail("React 设置未隔离自定义位置配置不可用态");
if (!source.includes("尚未导入") || !source.includes("没有读取权限") || !source.includes("来源状态暂不可用")) fail("React 设置缺少来源空态、错误映射或不可用态");
if (!source.includes("Promise.allSettled") || !source.includes("sync_pause_state") || !source.includes("read_overview")) fail("React 设置未保留来源状态的部分失败降级");
if (!settingsPage.includes("SettingsLoadingState") || !settingsPage.includes("保留上一次可读结果；刷新完成前不会清空页面。")) fail("React 设置刷新未保留旧数据并明确 stale 状态");
if (/set(?:Report|CustomReport|BudgetReport|BillingReport|DataReport|AboutReport)\(null\)/u.test(settingsPage)) fail("React 设置刷新失败时清空了已有投影");
const routeQualityType = source.match(/export type RouteQualityModel[\s\S]*?\};/u)?.[0] || "";
if (/provider_raw|provider_id|credential_ref|endpoint_base_url/u.test(routeQualityType)) fail("React 路线质量模型投影携带了 provider/credential/endpoint 字段");

const html = fs.readFileSync(path.join(dist, "index.html"), "utf8");
if (!html.includes("<div id=\"root\"></div>")) fail("React production entry 缺少 root");
// React's production runtime contains documentation URLs and SVG namespace
// strings. The relevant offline gate is that our source does not create a
// network client or reference an external resource, not that vendor strings
// are absent from minified output.
if (/\b(fetch|WebSocket|EventSource|XMLHttpRequest)\s*\(/.test(source)) fail("React source creates an unapproved network client");
if (/<(?:script|link)[^>]+https?:\/\//i.test(html)) fail("React entry references an external resource");

if (!process.exitCode) console.log("React Workbench contract: OK (isolated build, typed bridge, offline bundle)");
