import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { fetchWatcherHealth, type WatcherHealthStatus, addCustomSourceRoot, amendBillingDeclaration, checkForUpdates, clearBudgetSnooze, deleteImportedSourceData, disableBudgetProfile, listenAppEvents, makeInvalidationGate, openTrustedReleasesPage, pickCustomSourceRoot, previewBillingDeclaration, readAboutDiagnostics, readBillingSettings, readBudgetSettings, readCustomSourceConfig, readMonthlyExportSummary, readQuotaReminderConfig, readSourceHealth, readSourceHostControls, readSyncRequestStatus, readStatisticsSettings, removeCustomSourceRoot, resolveBillingImportCandidate, retryBillingRecalculation, revokeBillingDeclaration, safeUiError, saveBudgetProfile, saveBillingDeclaration, saveDiagnosticPackage, saveQuotaReminderConfig, saveRetentionMonths, saveStatisticsTimezone, setSourceHostExcluded, setSyncPaused, snoozeBudgetCurrentPeriod, triggerSync, type AboutDiagnosticsReport, type BillingSettingsReport, type BudgetSettingsReport, type CustomSourceReport, type MonthlyExportSummary, type QuotaReminderConfig, type SourceConnectionState, type SourceErrorKind, type SourceHealthReport, type SourceHostControls, type StatisticsSettingsReport, type UpdateCheckResult } from "../../lib/tauri";

const stateLabels: Record<SourceConnectionState, string> = {
  connected: "已连接",
  needs_attention: "需要处理",
  paused: "已暂停",
  excluded: "已停止读取",
  not_detected: "未检测到",
  unknown: "状态未知",
};

const errorLabels: Record<SourceErrorKind, string> = {
  permission_denied: "没有读取权限",
  file_missing: "找不到日志文件",
  all_files_failed: "所有日志文件都读取失败",
  db_error: "本地数据库出错",
  migration_failed: "本地数据库需要迁移",
  read_failed: "读取失败",
};

function observedAt(value: number | null): string {
  if (value === null) return "尚无记录";
  return new Date(value).toLocaleString([], { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function syncLabel(report: SourceHealthReport): string {
  if (report.sync.state === "ok") return report.sync.last_success_at ? `成功 · ${report.sync.last_success_at.slice(0, 16)}` : "成功";
  if (report.sync.state === "never") return "尚未同步";
  if (report.sync.state === "failed") return "部分来源读取失败";
  return "状态暂不可用";
}

function sourceTone(state: SourceConnectionState): "success" | "warning" | "neutral" {
  if (state === "connected") return "success";
  if (state === "needs_attention") return "warning";
  return "neutral";
}

function sourceLabel(host: string): string {
  const labels: Record<string, string> = {
    "claude-code": "Claude Code",
    codex: "Codex",
    dsh: "DeepSeek Harness",
    workbuddy: "WorkBuddy",
  };
  return labels[host] ?? host;
}

function shortenPath(path: string): string {
  if (path.startsWith("~/")) return path;
  const parts = path.split(/[\\/]/u).filter(Boolean);
  return parts.length > 2 ? `…/${parts.slice(-2).join("/")}` : path;
}

function syncActionLabel(state: SourceConnectionState): string | null {
  if (state === "connected") return "同步全部来源";
  if (state === "needs_attention") return "重新同步全部来源";
  if (state === "not_detected") return "扫描全部来源";
  return null;
}

function sourceControlLabel(state: SourceConnectionState): string | null {
  if (state === "excluded") return "恢复读取";
  if (state === "connected" || state === "needs_attention" || state === "paused") return "停止读取";
  return null;
}

function decimalToMinor(value: string): number | null {
  const text = value.trim();
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(text)) return null;
  const [whole, fraction = ""] = text.split(".");
  try {
    const minor = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
    if (minor <= 0n || minor > BigInt(Number.MAX_SAFE_INTEGER)) return null;
    return Number(minor);
  } catch { return null; }
}

function decimalToMinorAllowZero(value: string): number | null {
  const text = value.trim();
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/u.test(text)) return null;
  const [whole, fraction = ""] = text.split(".");
  try {
    const minor = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
    return minor <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(minor) : null;
  } catch { return null; }
}

function minorToDecimal(value: number | null, currency: string): string {
  if (value === null) return "—";
  const prefix = currency === "USD" ? "$" : currency === "CNY" ? "¥" : `${currency} `;
  return `${prefix}${(value / 100).toFixed(2)}`;
}

function budgetStatusLabel(level: string): string {
  return ({ ok: "正常", warn: "接近预算", exceeded: "已超预算", incomplete: "数据不完整", no_data: "暂无用量", disabled: "未启用" } as Record<string, string>)[level] ?? "状态未知";
}

function budgetDate(value: number | null): string {
  if (value === null) return "";
  return new Date(value).toLocaleString([], { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function compactTokens(value: number): string {
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1)}B`;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return String(value);
}

function billingAmountText(amounts: Array<{ amount_minor: number; currency: string }>): string {
  if (!amounts.length) return "暂无可用金额";
  return amounts.map((amount) => minorToDecimal(amount.amount_minor, amount.currency)).join(" + ");
}

function statisticsMonth(timezone?: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit" }).format(new Date());
}

function statisticsDay(timezone?: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

function pricingStateLabel(state: StatisticsSettingsReport["pricing"]["state"]): string {
  return ({ ok: "本地价卡可用", updated: "本地价卡已更新", failed: "上次检查失败", rejected: "价卡被拒绝", never_checked: "尚未检查", skipped: "未执行检查", unknown: "状态未知" } as Record<string, string>)[state];
}

function csvCell(value: string | number | null): string {
  const text = value === null ? "" : String(value);
  const safe = /^[=+\-@]/u.test(text) ? `'${text}` : text;
  return /[",\n]/u.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}

function exportCsv(summary: MonthlyExportSummary): string {
  const header = ["统计月份", "宿主", "服务商", "tokens（宿主汇总）", "计价口径", "币种", "金额", "未定价/待确认", "证据口径", "价格口径", "新鲜度"];
  const rows = summary.rows.map((row) => [summary.month, row.host, row.provider ?? "宿主汇总", row.tokens, row.basis, row.currency, row.amount === null ? null : row.amount.toFixed(6), row.unresolved ? "是" : "否", row.evidence_basis, row.pricing_method, row.freshness]);
  return [header, ...rows].map((line) => line.map(csvCell).join(",")).join("\n") + "\n";
}

function SettingsLoadingState({ loading, hasData, title, detail }: { loading: boolean; hasData: boolean; title: string; detail: string }) {
  if (!loading) return null;
  return <div className="settings-source-state" role="status"><strong>{hasData ? `正在刷新${title}` : `正在读取${title}`}</strong><span>{hasData ? "保留上一次可读结果；刷新完成前不会清空页面。" : detail}</span></div>;
}

function useMountedRef() {
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  return mounted;
}

type StatisticsDataSectionProps = { report: StatisticsSettingsReport | null; loading: boolean; error: string | null; onReload: () => void };

function StatisticsDataSection({ report, loading, error, onReload }: StatisticsDataSectionProps) {
  const [timezone, setTimezone] = useState("");
  const [customTimezone, setCustomTimezone] = useState("");
  const [retention, setRetention] = useState("");
  const [savingTimezone, setSavingTimezone] = useState(false);
  const [savingRetention, setSavingRetention] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [exportSummary, setExportSummary] = useState<MonthlyExportSummary | null>(null);
  const [exportLoading, setExportLoading] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportPreview, setExportPreview] = useState(false);
  const mounted = useMountedRef();

  useEffect(() => {
    if (report?.timezone.status === "ok" && report.timezone.timezone) {
      const current = report.timezone.timezone;
      if (current === report.timezone.system_timezone || timezoneOptions.includes(current)) setTimezone(current);
      else { setTimezone("__custom__"); setCustomTimezone(current); }
    }
    if (report?.retention.status === "ok" && report.retention.months !== null) setRetention(String(report.retention.months));
  }, [report?.timezone.timezone, report?.retention.months]);

  const saveTimezone = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (savingTimezone) return;
    const next = timezone === "__custom__" ? customTimezone.trim() : timezone;
    setActionError(null); setMessage(null);
    if (!next) { setActionError("请选择或填写有效的 IANA 时区。"); return; }
    setSavingTimezone(true);
    try { const receipt = await saveStatisticsTimezone(next); if (!mounted.current) return; setTimezone(receipt.timezone); setMessage(`统计时区已保存为 ${receipt.timezone}；用量页会按新的月份边界刷新。`); onReload(); }
    catch (reason: unknown) { if (mounted.current) setActionError(safeUiError(reason, "统计时区保存失败")); }
    finally { if (mounted.current) setSavingTimezone(false); }
  };

  const saveRetention = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (savingRetention || !report || report.retention.status !== "ok") return;
    const minimum = report.retention.minimum_months ?? 1;
    const maximum = report.retention.maximum_months ?? 60;
    const months = Number(retention);
    setActionError(null); setMessage(null);
    if (!Number.isSafeInteger(months) || months < minimum || months > maximum) { setActionError(`保留期必须是 ${minimum}-${maximum} 之间的整数。`); return; }
    setSavingRetention(true);
    try { const receipt = await saveRetentionMonths(months, minimum, maximum); if (!mounted.current) return; setRetention(String(receipt.months)); setMessage(`本机保留期已保存为 ${receipt.months} 个月；下次维护时才会执行清理。`); onReload(); }
    catch (reason: unknown) { if (mounted.current) setActionError(safeUiError(reason, "保留期保存失败")); }
    finally { if (mounted.current) setSavingRetention(false); }
  };

  const loadExport = async () => {
    if (exportLoading) return;
    setExportLoading(true); setExportError(null);
    const timezoneForExport = report?.timezone.status === "ok" ? report.timezone.timezone ?? undefined : undefined;
    try { const summary = await readMonthlyExportSummary(statisticsMonth(timezoneForExport)); if (!mounted.current) return; setExportSummary(summary); setExportPreview(true); }
    catch (reason: unknown) { if (mounted.current) { setExportSummary(null); setExportError(safeUiError(reason, "月度摘要读取失败")); } }
    finally { if (mounted.current) setExportLoading(false); }
  };

  const downloadExport = () => {
    if (!exportSummary) return;
    const blob = new Blob(["\uFEFF", exportCsv(exportSummary)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = `agent-vitals-${exportSummary.month}-summary.csv`; anchor.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setMessage(`已生成 ${exportSummary.month} 月度摘要 CSV；文件只在本机下载。`);
  };

  const timezoneOptions = ["UTC", "Asia/Shanghai", "Asia/Tokyo", "Asia/Singapore", "Europe/London", "America/Los_Angeles", "America/New_York"];
  return <section className="settings-data-section" id="settings-data" aria-labelledby="settings-data-title">
    <div className="settings-section-heading"><div><p className="eyebrow">统计与数据</p><h3 id="settings-data-title">统计与数据</h3><p>统计边界、保留期与价格目录状态均来自本机 authority；导出只包含当前月安全摘要。</p></div><button className="button button-secondary button-small" type="button" onClick={onReload} disabled={loading}>{loading ? "读取中…" : "重载统计设置"}</button></div>
    {error && <div className="error-banner" role="alert">统计设置暂不可用：{error}<button className="button button-secondary button-small" type="button" onClick={onReload}>重试</button></div>}
    <SettingsLoadingState loading={loading} hasData={Boolean(report)} title="统计设置" detail="只查询本机配置，不会上传数据。" />
    {report && <>
      <div className="settings-data-grid">
        <form className="settings-data-card" onSubmit={saveTimezone} aria-labelledby="settings-timezone-title"><div className="settings-card-heading"><div><p className="eyebrow">统计边界</p><h4 id="settings-timezone-title">统计时区</h4></div>{report.timezone.status === "unavailable" && <span className="status-pill status-pill-warning">暂不可用</span>}</div>{report.timezone.status === "ok" && <><label><span>时区</span><select value={timezone === report.timezone.system_timezone ? "__system__" : timezoneOptions.includes(timezone) ? timezone : timezone ? "__custom__" : ""} onChange={(event) => { const value = event.target.value; setTimezone(value === "__system__" ? report.timezone.system_timezone ?? "UTC" : value); }}><option value="">选择时区</option><option value="__system__">跟随系统（{report.timezone.system_timezone ?? "系统"}）</option>{timezoneOptions.map((option) => <option value={option} key={option}>{option}</option>)}<option value="__custom__">自定义 IANA 时区…</option></select></label>{timezone === "__custom__" && <label><span>自定义时区</span><input value={customTimezone} onChange={(event) => setCustomTimezone(event.target.value)} placeholder="例如 Asia/Shanghai" autoComplete="off" /></label>}<p className="settings-data-help">只改变今天/月的统计边界，不修改宿主原始日志或供应商计价时区。</p><button className="button button-secondary" type="submit" disabled={savingTimezone || !timezone || timezone === "__custom__" && !customTimezone.trim()}>{savingTimezone ? "保存中…" : "保存统计时区"}</button></>}</form>
        <form className="settings-data-card" onSubmit={saveRetention} aria-labelledby="settings-retention-title"><div className="settings-card-heading"><div><p className="eyebrow">本机维护</p><h4 id="settings-retention-title">数据保留期</h4></div>{report.retention.status === "unavailable" && <span className="status-pill status-pill-warning">暂不可用</span>}</div>{report.retention.status === "ok" && <><label><span>保留月数</span><input type="number" min={report.retention.minimum_months ?? 1} max={report.retention.maximum_months ?? 60} step="1" value={retention} onChange={(event) => setRetention(event.target.value)} /></label><p className="settings-data-help">范围 {report.retention.minimum_months}-{report.retention.maximum_months} 个月，保存后不会立即删除；下次本机维护才执行。</p><button className="button button-secondary" type="submit" disabled={savingRetention || !retention}>{savingRetention ? "保存中…" : "保存保留期"}</button></>}</form>
      </div>
      <div className="settings-data-card settings-pricing-card"><div className="settings-card-heading"><div><p className="eyebrow">价格目录</p><h4>公共价格目录（只读）</h4></div>{report.pricing.status === "ok" && <span className={`status-pill status-pill-${report.pricing.available ? "success" : "warning"}`}>{pricingStateLabel(report.pricing.state)}</span>}</div>{report.pricing.status === "unavailable" ? <p className="settings-data-help">本地价格目录状态暂不可读，不显示为已更新。</p> : <div className="settings-pricing-meta"><span>版本：{report.pricing.version ?? "未知"}</span><span>模型：{report.pricing.model_count ?? "未知"}</span><span>最近成功：{report.pricing.last_success_at_ms ? new Date(report.pricing.last_success_at_ms).toLocaleString() : "无"}</span></div>}<p className="settings-data-help">Beta 版本不提供联网开关、检查或更新按钮；本页不会触发网络请求。</p></div>
      <div className="settings-data-card settings-export-card"><div className="settings-card-heading"><div><p className="eyebrow">本地导出</p><h4>当前月摘要 CSV</h4></div><span className="status-pill">不含原始会话</span></div><p className="settings-data-help">只导出宿主、服务商、token 汇总、金额口径、覆盖与新鲜度；不含正文、绝对路径、凭据或账户标识。</p><div className="settings-export-actions"><button className="button button-secondary" type="button" onClick={loadExport} disabled={exportLoading}>{exportLoading ? "读取中…" : exportPreview ? "刷新预览" : "预览导出字段"}</button><button className="button button-secondary" type="button" onClick={downloadExport} disabled={!exportSummary || exportSummary.freshness === "unavailable"}>下载 CSV</button></div>{exportError && <p className="settings-data-error" role="alert">{exportError}</p>}{exportPreview && exportSummary && <div className="settings-export-preview" role="status"><strong>{exportSummary.month} · {exportSummary.rows.length} 行</strong><span>字段：统计月份、宿主、服务商、tokens、计价口径、币种、金额、待确认、证据、价格、新鲜度。</span>{exportSummary.freshness === "unavailable" ? <small>摘要来源暂不可用，未生成可判定导出；请先恢复本机 authority。</small> : exportSummary.rows.length === 0 && <small>本月没有可导出的计费行；来源仍然可读。</small>}</div>}</div>
    </>}
    {actionError && <div className="error-banner" role="alert">{actionError}</div>}{message && <p className="settings-data-message" role="status" aria-live="polite">{message}</p>}
  </section>;
}

type AboutSectionProps = { report: AboutDiagnosticsReport | null; loading: boolean; error: string | null; onReload: () => void };

function versionText(value: string | null): string { return value ?? "不可用"; }

function AboutSection({ report, loading, error, onReload }: AboutSectionProps) {
  const [exporting, setExporting] = useState(false);
  const [checking, setChecking] = useState(false);
  const [opening, setOpening] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [update, setUpdate] = useState<UpdateCheckResult | null>(null);
  const mounted = useMountedRef();

  const exportDiagnostics = async () => {
    if (exporting) return;
    setExporting(true); setActionError(null); setMessage(null);
    try { const receipt = await saveDiagnosticPackage(); if (mounted.current) setMessage(receipt.status === "cancelled" ? "已取消保存诊断包。" : "诊断包已保存到你选择的位置；不会自动上传。"); }
    catch (reason: unknown) { if (mounted.current) setActionError(safeUiError(reason, "诊断包保存失败")); }
    finally { if (mounted.current) setExporting(false); }
  };
  const checkUpdates = async () => {
    if (checking) return;
    setChecking(true); setActionError(null); setMessage(null);
    try { const result = await checkForUpdates(); if (mounted.current) { setUpdate(result); setMessage(result.status === "ok" && result.latestTag ? `当前 ${result.currentVersion ?? "未知"} · 最新 ${result.latestTag}；请手动从发布页确认安装。` : result.status === "no_release" ? "当前没有可用的可信发布。" : "版本检查暂不可用。"); } }
    catch (reason: unknown) { if (mounted.current) setActionError(safeUiError(reason, "版本检查失败")); }
    finally { if (mounted.current) setChecking(false); }
  };
  const openReleases = async () => {
    if (opening) return;
    setOpening(true); setActionError(null);
    try { await openTrustedReleasesPage(); if (mounted.current) setMessage("已打开可信发布页；安装需由你手动确认。"); }
    catch (reason: unknown) { if (mounted.current) setActionError(safeUiError(reason, "发布页打开失败")); }
    finally { if (mounted.current) setOpening(false); }
  };
  return <section className="settings-about-section" id="settings-about" aria-labelledby="settings-about-title">
    <div className="settings-section-heading"><div><p className="eyebrow">关于与诊断</p><h3 id="settings-about-title">关于与诊断</h3><p>版本信息来自本机；诊断包由你主动保存，不含会话正文、绝对路径或账户标识，也不会自动上传。</p></div><button className="button button-secondary button-small" type="button" onClick={onReload} disabled={loading}>{loading ? "读取中…" : "重载诊断"}</button></div>
    {error && <div className="error-banner" role="alert">版本诊断暂不可用：{error}<button className="button button-secondary button-small" type="button" onClick={onReload}>重试</button></div>}
    <SettingsLoadingState loading={loading} hasData={Boolean(report)} title="版本信息" detail="只查询本机状态，不会发起更新检查。" />
    {report && <div className="settings-about-card"><dl className="settings-version-list"><div><dt>App</dt><dd>{versionText(report.appVersion ?? null)}</dd></div><div><dt>CLI</dt><dd>{versionText(report.cliVersion ?? null)}</dd></div><div><dt>Engine</dt><dd>{versionText(report.engineVersion ?? null)}</dd></div><div><dt>Authority schema</dt><dd>{versionText(report.authoritySchema ?? null)}</dd></div><div><dt>价格目录</dt><dd>{report.pricing?.version ? `${report.pricing.version}${report.pricing.capturedAtMs ? ` · ${new Date(report.pricing.capturedAtMs).toLocaleString()}` : ""}` : "暂无快照"}</dd></div><div><dt>统计时区</dt><dd>{report.statisticsTimezone ?? "不可用"}</dd></div><div><dt>同步</dt><dd>{report.sync.state === "ok" ? "正常" : report.sync.state === "needs_attention" ? "需要检查" : "状态未知"}</dd></div></dl><div className="settings-about-actions"><button className="button button-secondary" type="button" onClick={exportDiagnostics} disabled={exporting}>{exporting ? "保存中…" : "保存脱敏诊断包"}</button><button className="button button-secondary" type="button" onClick={checkUpdates} disabled={checking}>{checking ? "检查中…" : "检查新版本"}</button><button className="button button-secondary" type="button" onClick={openReleases} disabled={opening}>{opening ? "打开中…" : "查看发布页"}</button></div>{update && <p className="settings-about-update" role="status">{update.status === "unavailable" ? "版本检查不可用，不会自动安装。" : update.status === "no_release" ? "未找到可用发布。" : `已确认 ${update.latestTag ?? "最新发布"}；不会自动安装。`}</p>}</div>}
    {actionError && <div className="error-banner" role="alert">{actionError}</div>}{message && <p className="settings-about-message" role="status" aria-live="polite">{message}</p>}
  </section>;
}

type BillingSectionProps = { report: BillingSettingsReport | null; loading: boolean; error: string | null; onReload: () => void };

function BillingSection({ report, loading, error, onReload }: BillingSectionProps) {
  const [expanded, setExpanded] = useState(false);
  const [candidateBusy, setCandidateBusy] = useState<string | null>(null);
  const [candidateMessage, setCandidateMessage] = useState<string | null>(null);
  const [candidateError, setCandidateError] = useState<string | null>(null);
  const [declarationGroup, setDeclarationGroup] = useState<BillingSettingsReport["groups"][number] | null>(null);
  const [declarationKind, setDeclarationKind] = useState<"official_api" | "third_party" | "organization">("official_api");
  const [declarationImpact, setDeclarationImpact] = useState<import("../../lib/tauri").BillingImpactPreview | null>(null);
  const [declarationBusy, setDeclarationBusy] = useState<"preview" | "save" | null>(null);
  const [declarationError, setDeclarationError] = useState<string | null>(null);
  const [declarationMessage, setDeclarationMessage] = useState<string | null>(null);
  const [retryJobId, setRetryJobId] = useState<string | null>(null);
  const [retryError, setRetryError] = useState<string | null>(null);
  const [retryMessage, setRetryMessage] = useState<string | null>(null);
  const [revokeDeclarationId, setRevokeDeclarationId] = useState<string | null>(null);
  const [revokeBusy, setRevokeBusy] = useState<string | null>(null);
  const [revokeError, setRevokeError] = useState<string | null>(null);
  const [revokeMessage, setRevokeMessage] = useState<string | null>(null);
  const [amendDeclaration, setAmendDeclaration] = useState<BillingSettingsReport["declarations"][number] | null>(null);
  const [amendName, setAmendName] = useState("");
  const [amendAmount, setAmendAmount] = useState("");
  const [amendCurrency, setAmendCurrency] = useState<"CNY" | "USD">("CNY");
  const [amendEnd, setAmendEnd] = useState("");
  const [amendBusy, setAmendBusy] = useState(false);
  const [amendError, setAmendError] = useState<string | null>(null);
  const [amendMessage, setAmendMessage] = useState<string | null>(null);
  const mounted = useMountedRef();
  const pendingGroups = report?.groups ?? [];
  const pendingCandidates = (report?.candidates ?? []).filter((candidate) => candidate.status === "pending");
  const dismissedCandidates = (report?.candidates ?? []).filter((candidate) => candidate.status === "dismissed");
  const hasPending = pendingGroups.length > 0 || pendingCandidates.length > 0;
  const hasCandidateHistory = hasPending || dismissedCandidates.length > 0;
  const failedJobs = (report?.jobs ?? []).filter((job) => job.status === "failed" || job.status === "cancelled");
  const changeCandidate = async (candidateId: string, decision: "dismiss" | "reopen") => {
    if (candidateBusy) return;
    setCandidateBusy(candidateId); setCandidateError(null); setCandidateMessage(null);
    try {
      const receipt = await resolveBillingImportCandidate(candidateId, decision);
      if (!mounted.current) return;
      setCandidateMessage(receipt.changed ? decision === "dismiss" ? "已标记为不是我的；未修改历史金额。" : "已重新打开待确认候选。" : "状态没有变化。保留现有计费结果。");
      onReload();
    } catch (reason: unknown) {
      if (mounted.current) setCandidateError(safeUiError(reason, "计费候选处置失败"));
    } finally { if (mounted.current) setCandidateBusy(null); }
  };
  const retryJob = async (jobId: string) => {
    if (retryJobId) return;
    setRetryJobId(jobId); setRetryError(null); setRetryMessage(null);
    try {
      const receipt = await retryBillingRecalculation(jobId);
      if (!mounted.current) return;
      setRetryMessage(receipt.changed ? `重算任务已重新入队（${receipt.job_id}）；完成前旧结果仍可读。` : `重算任务未发生变化（${receipt.job_id}）；旧结果仍可读。`);
      onReload();
    } catch (reason: unknown) {
      if (mounted.current) setRetryError(safeUiError(reason, "重算重试失败"));
    } finally { if (mounted.current) setRetryJobId(null); }
  };
  const revokeDeclaration = async (declaration: BillingSettingsReport["declarations"][number]) => {
    if (!declaration.current_revision_id || revokeBusy) return;
    if (revokeDeclarationId !== declaration.declaration_id) { setRevokeDeclarationId(declaration.declaration_id); setRevokeError(null); setRevokeMessage(null); return; }
    setRevokeBusy(declaration.declaration_id); setRevokeError(null); setRevokeMessage(null);
    try {
      const receipt = await revokeBillingDeclaration({ declaration_id: declaration.declaration_id, supersedes_revision_id: declaration.current_revision_id });
      if (!mounted.current) return;
      setRevokeMessage(receipt.changed ? `已撤销声明（${receipt.declaration_id}）；历史事实保留，未来归因将按未声明状态重算。` : "声明状态没有变化；保留现有历史结果。");
      setRevokeDeclarationId(null); onReload();
    } catch (reason: unknown) { if (mounted.current) setRevokeError(safeUiError(reason, "计费声明撤销失败")); }
    finally { if (mounted.current) setRevokeBusy(null); }
  };
  const openAmendment = (declaration: BillingSettingsReport["declarations"][number]) => {
    setAmendDeclaration(declaration); setAmendName(declaration.subscription_name ?? ""); setAmendAmount(declaration.amount_minor === null ? "" : (declaration.amount_minor / 100).toFixed(2)); setAmendCurrency(declaration.currency === "USD" ? "USD" : "CNY"); setAmendEnd(declaration.effective_end ?? ""); setAmendError(null); setAmendMessage(null);
  };
  const saveAmendment = async () => {
    if (!amendDeclaration || amendBusy || !amendDeclaration.current_revision_id) return;
    setAmendBusy(true); setAmendError(null); setAmendMessage(null);
    const amountMinor = amendAmount.trim() === "" ? null : decimalToMinorAllowZero(amendAmount);
    if (amendAmount.trim() !== "" && amountMinor === null) { setAmendError("月费必须是 0 或正数，最多两位小数；留空表示金额暂不清楚。"); setAmendBusy(false); return; }
    const effectiveEnd = amendEnd.trim() === "" ? null : amendEnd.trim();
    const currentMonthStart = `${statisticsMonth("Asia/Shanghai")}-01`;
    const effectiveStart = amendDeclaration.effective_start > currentMonthStart ? amendDeclaration.effective_start : currentMonthStart;
    if (effectiveEnd !== null && (!/^\d{4}-\d{2}-\d{2}$/u.test(effectiveEnd) || effectiveEnd < effectiveStart || effectiveEnd > statisticsDay("Asia/Shanghai"))) { setAmendError("结束日期必须不早于本次修订起始日且不晚于今天；留空表示持续有效。"); setAmendBusy(false); return; }
    try {
      const receipt = await amendBillingDeclaration({ declaration_id: amendDeclaration.declaration_id, supersedes_revision_id: amendDeclaration.current_revision_id, host: amendDeclaration.host, provider_id: amendDeclaration.provider_id, subscription_name: amendName.trim() || null, amount_minor: amountMinor, currency: amountMinor === null ? null : amendCurrency, effective_start: effectiveStart, effective_end: effectiveEnd, source_candidate_id: amendDeclaration.source_candidate_id, scopes: amendDeclaration.scopes });
      if (!mounted.current) return;
      if (receipt.job?.status === "queued") setAmendMessage(`订阅修订已保存（自 ${effectiveStart} 生效），重算任务已入队（${receipt.job.job_id}）；历史月份不变。`);
      else if (receipt.job?.status === "enqueue_failed") setAmendMessage("订阅修订已保存，但重算没有入队；当前数字仍是旧结果。");
      else setAmendMessage("订阅修订已保存；历史月份不变。重算状态仍需单独确认。");
      setAmendDeclaration(null); onReload();
    } catch (reason: unknown) { if (mounted.current) setAmendError(safeUiError(reason, "订阅修订保存失败")); }
    finally { if (mounted.current) setAmendBusy(false); }
  };
  const openDeclaration = (group: BillingSettingsReport["groups"][number]) => {
    setDeclarationGroup(group); setDeclarationKind("official_api"); setDeclarationImpact(null); setDeclarationError(null); setDeclarationMessage(null);
  };
  const declarationScopes = declarationGroup?.model_id && declarationGroup.model_id !== "<unknown>"
    ? [{ scope_kind: "model" as const, scope_value: declarationGroup.model_id }]
    : [{ scope_kind: "provider" as const, scope_value: "unresolved" }];
  const previewDeclaration = async () => {
    if (!declarationGroup || declarationBusy) return;
    setDeclarationBusy("preview"); setDeclarationError(null); setDeclarationMessage(null);
    try {
      const impact = await previewBillingDeclaration({ host: declarationGroup.host, provider_id: declarationGroup.provider_id, relationship_kind: declarationKind, effective_start: declarationGroup.effective_start, effective_end: declarationGroup.effective_end, scopes: declarationScopes });
      if (mounted.current) setDeclarationImpact(impact);
    } catch (reason: unknown) { if (mounted.current) setDeclarationError(safeUiError(reason, "计费影响预览失败")); }
    finally { if (mounted.current) setDeclarationBusy(null); }
  };
  const saveDeclaration = async () => {
    if (!declarationGroup || !declarationImpact || declarationBusy) return;
    setDeclarationBusy("save"); setDeclarationError(null); setDeclarationMessage(null);
    const suffix = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    try {
      const receipt = await saveBillingDeclaration({ revision_id: `rev-react-${suffix}`, declaration_id: `decl-react-${suffix}`, host: declarationGroup.host, provider_id: declarationGroup.provider_id, relationship_kind: declarationKind, effective_start: declarationGroup.effective_start, effective_end: declarationGroup.effective_end, source_candidate_id: null, evidence_ref: `react:confirmation-group:${declarationGroup.group_id}`, scopes: declarationScopes });
      if (!mounted.current) return;
      if (receipt.job?.status === "queued") {
        setDeclarationMessage(`声明已保存，重算任务已入队（${receipt.job.job_id}）；完成前旧结果仍可读。`);
      } else if (receipt.job?.status === "enqueue_failed") {
        setDeclarationMessage("声明已保存，但重算没有入队；当前数字仍是旧结果。");
        setDeclarationError("重算未入队；请到重算状态重试，或在旧工作台处理。声明事实已保留，不会伪装成金额已更新。");
      } else {
        setDeclarationMessage("声明已保存；该关系不改变金额。旧结果仍可读。");
      }
      setDeclarationGroup(null); setDeclarationImpact(null); onReload();
    } catch (reason: unknown) { if (mounted.current) setDeclarationError(safeUiError(reason, "计费声明保存失败")); }
    finally { if (mounted.current) setDeclarationBusy(null); }
  };
  return <section className="settings-billing-section" id="settings-billing" aria-labelledby="settings-billing-title">
    <div className="settings-section-heading"><div><p className="eyebrow">计费与套餐</p><h3 id="settings-billing-title">计费与套餐</h3><p>查看待确认的计费关系、当前声明和已有账单；账单录入仍在旧工作台。</p></div><button className="button button-secondary button-small" type="button" onClick={onReload} disabled={loading}>{loading ? "读取中…" : "重载计费"}</button></div>
    {error && <div className="error-banner" role="alert">待确认状态暂不可用：{error}<button className="button button-secondary button-small" type="button" onClick={onReload}>重试</button></div>}
    <SettingsLoadingState loading={loading} hasData={Boolean(report)} title="计费状态" detail="只查询本机 authority，不会修改归因。" />
    {report && <>
      {hasCandidateHistory && <div className="settings-billing-todo"><div><strong>{hasPending ? "有待确认的计费关系" : "已排除的计费候选"}</strong><span>{hasPending ? `${pendingGroups.length + pendingCandidates.length} 项需要确认；未确认前仍按现有估算展示。` : `${dismissedCandidates.length} 项已排除；可重新打开后再确认。`}</span></div><button className="button button-primary" type="button" onClick={() => setExpanded((value) => !value)}>{expanded ? "收起候选" : "查看候选"}</button></div>}
      {!hasPending && report.groups_status === "ok" && report.candidates_status === "ok" && <p className="settings-billing-empty">当前没有待确认的计费关系。</p>}
      {expanded && <div className="settings-billing-pending" aria-label="待确认的计费关系">
        {pendingGroups.slice(0, 32).map((group) => <article className="settings-billing-row" key={group.group_id}><div><strong>{group.host} · {group.provider_id} · {group.model_id}</strong><span>{compactTokens(group.tokens)} tokens · {group.session_count} 个会话 · {billingAmountText(group.estimated_amounts)} · {group.evidence_state === "unresolved" ? "部分用量未完成计价" : group.evidence_state === "determined" ? "已有明确线索" : "需要确认计费方式"}</span></div><div className="settings-billing-row-actions"><small>{group.effective_start}{group.effective_end && group.effective_end !== group.effective_start ? ` – ${group.effective_end}` : ""}</small><button className="button button-secondary button-small" type="button" onClick={() => openDeclaration(group)} disabled={declarationBusy !== null}>声明归属…</button></div></article>)}
        {declarationGroup && <div className="settings-billing-declaration" role="dialog" aria-labelledby="settings-billing-declaration-title"><div className="settings-card-heading"><div><p className="eyebrow">影响预览后保存</p><h4 id="settings-billing-declaration-title">声明 {declarationGroup.host} · {declarationGroup.provider_id} · {declarationGroup.model_id}</h4></div><button className="button button-secondary button-small" type="button" onClick={() => setDeclarationGroup(null)} disabled={declarationBusy !== null}>取消</button></div><label><span>关系</span><select value={declarationKind} onChange={(event) => { setDeclarationKind(event.target.value as typeof declarationKind); setDeclarationImpact(null); }} disabled={declarationBusy !== null}><option value="official_api">官方 API（按量）</option><option value="third_party">中转或第三方</option><option value="organization">组织承担</option></select></label><p className="settings-data-help">范围：{declarationScopes.map((scope) => `${scope.scope_kind}=${scope.scope_value}`).join("、")} · 日期：{declarationGroup.effective_start}{declarationGroup.effective_end ? ` – ${declarationGroup.effective_end}` : " · 持续有效"}</p><div className="settings-billing-declaration-actions"><button className="button button-secondary" type="button" onClick={previewDeclaration} disabled={declarationBusy !== null}>{declarationBusy === "preview" ? "预览中…" : "预览影响"}</button>{declarationImpact && <button className="button button-primary" type="button" onClick={saveDeclaration} disabled={declarationBusy !== null}>{declarationBusy === "save" ? "保存中…" : "确认并保存声明"}</button>}</div>{declarationImpact && <div className="settings-billing-preview" role="status"><strong>将处理 {compactTokens(declarationImpact.moved.tokens)} tokens · {declarationImpact.moved.session_count} 个会话</strong><span>{declarationImpact.changes_amounts ? "该关系可能改变金额归因；保存后会入队重算。" : "该关系不改变金额，只记录用户声明并关闭待确认提示。"}</span>{declarationImpact.pending.tokens > 0 && <small>仍有 {compactTokens(declarationImpact.pending.tokens)} tokens 待确认，不会被强行归因。</small>}</div>}
        </div>}
        {pendingCandidates.map((candidate) => <article className="settings-billing-row" key={candidate.candidate_id}><div><strong>{candidate.provider_id} · {minorToDecimal(candidate.amount_minor, candidate.currency)}/月 · {candidate.host}</strong><span>来自历史套餐记录 · 自 {candidate.billing_period_start} 起{candidate.impact ? ` · ${compactTokens(candidate.impact.total_tokens)} tokens · ${candidate.impact.session_count} 个会话` : ""}</span></div><div className="settings-billing-row-actions"><small>未确认不改变现有估算</small><button className="button button-secondary button-small" type="button" onClick={() => changeCandidate(candidate.candidate_id, "dismiss")} disabled={candidateBusy !== null}>{candidateBusy === candidate.candidate_id ? "保存中…" : "不是我的"}</button></div></article>)}
        {dismissedCandidates.length > 0 && <div className="settings-billing-list"><div className="settings-setting-label">已排除的候选</div>{dismissedCandidates.slice(0, 32).map((candidate) => <article className="settings-billing-row" key={candidate.candidate_id}><div><strong>{candidate.provider_id} · {candidate.host}</strong><span>已标记为不是我的；重新打开后才会回到待确认列表。</span></div><button className="button button-secondary button-small" type="button" onClick={() => changeCandidate(candidate.candidate_id, "reopen")} disabled={candidateBusy !== null}>{candidateBusy === candidate.candidate_id ? "保存中…" : "重新打开"}</button></article>)}</div>}
        <p className="settings-billing-deferred" role="note">“不是我的/重新打开”只处置候选状态，不改变历史金额。声明保存需要先预览影响；失败/取消重算可在本页重新入队，订阅修订和撤销也会保留历史并返回重算回执。</p>
      </div>}
      {report.declarations_status !== "unavailable" && report.declarations.length > 0 && <div className="settings-billing-list"><div className="settings-setting-label">当前计费声明</div>{report.declarations.slice(0, 32).map((declaration) => <article className="settings-billing-row" key={declaration.declaration_id}><div><strong>{declaration.host} · {declaration.provider_id}</strong><span>{declaration.relationship_kind === "official_subscription" ? "官方订阅" : declaration.relationship_kind === "official_api" ? "官方 API 按量" : declaration.relationship_kind === "organization" ? "组织承担" : declaration.relationship_kind === "third_party" ? "中转或第三方" : "状态未知"} · {declaration.subscription_name ?? "未命名声明"}{declaration.amount_minor !== null && declaration.currency ? ` · ${minorToDecimal(declaration.amount_minor, declaration.currency)}` : ""}</span><small>{declaration.effective_start}{declaration.effective_end ? ` – ${declaration.effective_end}` : " · 持续有效"} · {declaration.scope_count} 个范围</small></div><div className="settings-billing-row-actions">{declaration.relationship_kind === "official_subscription" && declaration.current_revision_id && <button className="button button-secondary button-small" type="button" onClick={() => openAmendment(declaration)} disabled={amendBusy || revokeBusy !== null}>修改订阅</button>}{declaration.current_revision_id && <button className="button button-secondary button-small" type="button" onClick={() => revokeDeclaration(declaration)} disabled={revokeBusy !== null || amendBusy}>{revokeBusy === declaration.declaration_id ? "撤销中…" : revokeDeclarationId === declaration.declaration_id ? "再次确认撤销" : "撤销声明"}</button>}</div>{amendDeclaration?.declaration_id === declaration.declaration_id && <div className="settings-billing-amendment" role="group" aria-labelledby={`billing-amendment-${declaration.declaration_id}`}><h4 id={`billing-amendment-${declaration.declaration_id}`}>修改订阅修订</h4><p>新价格自本月起生效，历史月份不变；结束日留空表示持续有效。</p><label><span>套餐名</span><input value={amendName} onChange={(event) => setAmendName(event.target.value)} disabled={amendBusy} /></label><div className="settings-billing-amendment-grid"><label><span>月费（可留空）</span><input inputMode="decimal" value={amendAmount} onChange={(event) => setAmendAmount(event.target.value)} placeholder="留空表示暂不清楚" disabled={amendBusy} /></label><label><span>币种</span><select value={amendCurrency} onChange={(event) => setAmendCurrency(event.target.value as "CNY" | "USD")} disabled={amendBusy || amendAmount.trim() === ""}><option value="CNY">CNY</option><option value="USD">USD</option></select></label><label><span>结束日（可选）</span><input type="date" value={amendEnd} onChange={(event) => setAmendEnd(event.target.value)} disabled={amendBusy} /></label></div><div className="settings-billing-declaration-actions"><button className="button button-primary" type="button" onClick={saveAmendment} disabled={amendBusy}>{amendBusy ? "保存中…" : "保存修订"}</button><button className="button button-secondary" type="button" onClick={() => setAmendDeclaration(null)} disabled={amendBusy}>取消</button></div><small>范围沿用当前声明的 {declaration.scope_count} 个范围，不会扩大到整个服务商。</small></div>}</article>)}</div>}
      {failedJobs.length > 0 && <div className="settings-billing-job-warning" role="alert"><div><strong>有重算任务需要处理</strong><span>任务失败或被取消；当前金额不会被静默替换，旧结果仍可读。</span></div><div className="settings-billing-job-list">{failedJobs.slice(0, 32).map((job) => <article className="settings-billing-job-row" key={job.job_id}><div><strong>{job.job_id}</strong><span>{job.status === "cancelled" ? "已取消" : "重算失败"}{job.error_code ? ` · ${job.error_code}` : ""} · 请求于 {observedAt(job.requested_at_ms)}</span></div><button className="button button-secondary button-small" type="button" onClick={() => retryJob(job.job_id)} disabled={retryJobId !== null}>{retryJobId === job.job_id ? "重新入队中…" : "重试重算"}</button></article>)}</div><small>重试只重新入队，不会删除任务记录；刷新后仍会显示可验证的任务状态。</small></div>}
      {report.bills_status !== "unavailable" && report.bills.length > 0 && <div className="settings-billing-list"><div className="settings-setting-label">已有账单</div>{report.bills.slice(0, 64).map((bill) => <div className="settings-billing-row" key={bill.bill_id}><div><strong>{bill.host} · {bill.provider_id}</strong><span>{minorToDecimal(bill.amount_minor, bill.currency)} · {bill.billing_basis === "fixed_subscription" ? "订阅" : bill.billing_basis === "host_billed" ? "宿主账单" : bill.billing_basis === "metered_actual" ? "按量实付" : "计价口径未知"}</span></div><small>{bill.billing_period} · {bill.has_evidence ? "有来源记录" : "来源未记录"}</small></div>)}</div>}
      {(report.groups_status === "unavailable" || report.candidates_status === "unavailable") && <p className="settings-billing-unavailable" role="alert">待确认计费状态暂不可读，不将不可用误判为空。</p>}
      {report.declarations_status === "unavailable" && <p className="settings-billing-unavailable" role="alert">当前计费声明暂不可读。</p>}
      {report.jobs_status === "unavailable" && <p className="settings-billing-unavailable" role="alert">重算状态暂不可读。</p>}
      {report.bills_status === "unavailable" && <p className="settings-billing-unavailable" role="alert">本月账单暂不可读。</p>}
      {(report.groups_status === "partial" || report.candidates_status === "partial" || report.declarations_status === "partial" || report.jobs_status === "partial" || report.bills_status === "partial") && <p className="settings-billing-unavailable" role="status">部分计费记录无法读取，已显示可验证的记录。</p>}
    </>}
    {candidateError && <div className="error-banner" role="alert">{candidateError}</div>}
    {candidateMessage && <p className="settings-data-message" role="status" aria-live="polite">{candidateMessage}</p>}
    {declarationError && <div className="error-banner" role="alert">{declarationError}</div>}
    {declarationMessage && <p className="settings-data-message" role="status" aria-live="polite">{declarationMessage}</p>}
    {retryError && <div className="error-banner" role="alert">{retryError}</div>}
    {retryMessage && <p className="settings-data-message" role="status" aria-live="polite">{retryMessage}</p>}
    {revokeError && <div className="error-banner" role="alert">{revokeError}</div>}
    {revokeMessage && <p className="settings-data-message" role="status" aria-live="polite">{revokeMessage}</p>}
    {amendError && <div className="error-banner" role="alert">{amendError}</div>}
    {amendMessage && <p className="settings-data-message" role="status" aria-live="polite">{amendMessage}</p>}
  </section>;
}

type BudgetSectionProps = { report: BudgetSettingsReport | null; loading: boolean; error: string | null; onReload: () => void };

function BudgetSection({ report, loading, error, onReload }: BudgetSectionProps) {
  const [currency, setCurrency] = useState<"CNY" | "USD">("CNY");
  const [monthly, setMonthly] = useState("");
  const [daily, setDaily] = useState("");
  const [saving, setSaving] = useState(false);
  const [disabling, setDisabling] = useState(false);
  const [disableArmed, setDisableArmed] = useState(false);
  const [snoozing, setSnoozing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const mounted = useMountedRef();

  useEffect(() => {
    const estimate = report?.estimate;
    if (estimate) {
      if (estimate.currency === "USD" || estimate.currency === "CNY") setCurrency(estimate.currency);
      setMonthly((estimate.monthly_minor / 100).toFixed(2));
      setDaily(estimate.daily_minor === null ? "" : (estimate.daily_minor / 100).toFixed(2));
    } else if (report?.status === "ok") {
      setMonthly("");
      setDaily("");
      setDisableArmed(false);
    }
  }, [report?.estimate?.profile_id, report?.estimate?.updated_at_ms]);

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving) return;
    const monthlyMinor = decimalToMinor(monthly);
    const dailyMinor = daily.trim() === "" ? null : decimalToMinor(daily);
    setMessage(null);
    setActionError(null);
    if (monthlyMinor === null) { setActionError("请填写正数月预算，最多两位小数。"); return; }
    if (daily.trim() !== "" && dailyMinor === null) { setActionError("日预算必须为正数，最多两位小数；也可以留空。"); return; }
    setSaving(true);
    try {
      const receipt = await saveBudgetProfile({ currency, monthly_minor: monthlyMinor, daily_minor: dailyMinor });
      if (!mounted.current) return;
      setMessage(`已保存 ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}${receipt.notification_permission === "granted" ? "。" : "。系统通知未授权，可在系统设置中开启。"}`);
      onReload();
    } catch (reason: unknown) {
      if (mounted.current) setActionError(safeUiError(reason, "预算保存失败"));
    } finally { if (mounted.current) setSaving(false); }
  };

  const toggleSnooze = async () => {
    if (snoozing) return;
    setSnoozing(true); setMessage(null); setActionError(null);
    try {
      if (report?.snoozed_until_ms && report.snoozed_until_ms > Date.now()) {
        await clearBudgetSnooze();
        if (!mounted.current) return;
        setMessage("预算提醒已恢复。");
      } else {
        await snoozeBudgetCurrentPeriod();
        if (!mounted.current) return;
        setMessage("预算提醒已静默至本周期结束；统计仍会继续更新。");
      }
      if (mounted.current) onReload();
    } catch (reason: unknown) { if (mounted.current) setActionError(safeUiError(reason, "预算提醒设置失败")); }
    finally { if (mounted.current) setSnoozing(false); }
  };

  const disable = async () => {
    if (disabling) return;
    if (!disableArmed) { setDisableArmed(true); setActionError(null); setMessage("再次点击确认停用估算预算；历史用量不会删除，已确认预算不受影响。"); return; }
    setDisabling(true); setActionError(null); setMessage(null);
    try {
      const receipt = await disableBudgetProfile();
      if (!mounted.current) return;
      setDisableArmed(false);
      setMessage(receipt.changed ? "估算预算已停用；历史用量与已确认预算保留。" : "估算预算本来就未设置；历史用量未改变。");
      onReload();
    } catch (reason: unknown) { if (mounted.current) setActionError(safeUiError(reason, "预算停用失败")); }
    finally { if (mounted.current) setDisabling(false); }
  };

  const estimate = report?.estimate;
  const unsupportedCurrency = Boolean(estimate && estimate.currency !== "CNY" && estimate.currency !== "USD");
  const snoozed = report?.snoozed_until_ms !== null && report?.snoozed_until_ms !== undefined && report.snoozed_until_ms > Date.now();
  const availableReport = report?.status === "ok" ? report : null;
  return <section className="settings-budget-section" id="settings-budget" aria-labelledby="settings-budget-title">
    <div className="settings-section-heading"><div><p className="eyebrow">预算</p><h3 id="settings-budget-title">预算（订阅 + 按量）</h3><p>只保存本机预算目标；按量支出与订阅摊派分开计算，达到 80% 和 100% 各提醒一次。</p></div><button className="button button-secondary button-small" type="button" onClick={onReload} disabled={loading}>{loading ? "读取中…" : "重载预算"}</button></div>
    {error && <div className="error-banner" role="alert">预算状态暂不可用：{error}<button className="button button-secondary button-small" type="button" onClick={onReload}>重试</button></div>}
    <SettingsLoadingState loading={loading} hasData={Boolean(report)} title="预算状态" detail="只查询本机 authority，不会上传数据。" />
    {report?.legacy && !estimate && <div className="settings-budget-legacy" role="note"><strong>检测到旧版预算</strong><span>{minorToDecimal(report.legacy.monthly_minor, "CNY")}/月仍在生效；保存下面的新预算后将以估算预算为准，不会自动转换。</span></div>}
    {report?.status === "unavailable" && <div className="settings-source-state"><strong>预算状态暂不可用</strong><span>没有足够的本机预算回执；不会显示伪造的 0 元。</span></div>}
    {availableReport && <>
      <form className="settings-budget-form" onSubmit={save}>
        <label><span>币种</span><select value={currency} onChange={(event) => setCurrency(event.target.value as "CNY" | "USD")} disabled={unsupportedCurrency}><option value="CNY">CNY · 人民币</option><option value="USD">USD · 美元</option></select></label>
        <label><span>月预算</span><input inputMode="decimal" value={monthly} onChange={(event) => setMonthly(event.target.value)} placeholder="例如 100.00" aria-describedby="settings-budget-help" disabled={unsupportedCurrency} /><small id="settings-budget-help">正数，最多两位小数</small></label>
        <label><span>日预算（可选）</span><input inputMode="decimal" value={daily} onChange={(event) => setDaily(event.target.value)} placeholder="留空表示不设日预算" disabled={unsupportedCurrency} /></label>
        <div className="settings-budget-threshold"><span>提醒阈值</span><strong>80% 和 100%</strong><small>固定阈值，各提醒一次</small></div>
        <div className="settings-budget-form-actions"><button className="button button-secondary" type="submit" disabled={saving || disabling || unsupportedCurrency}>{saving ? "保存中…" : "保存预算"}</button>{estimate && <button className="button button-danger button-small" type="button" onClick={disable} disabled={saving || disabling}>{disabling ? "停用中…" : disableArmed ? "再次确认停用估算预算" : "停用估算预算"}</button>}</div>
      </form>
      {unsupportedCurrency && estimate && <p className="settings-budget-warning" role="note">当前估算预算使用 {estimate.currency}，此页面暂不支持编辑该币种；为避免误覆盖，表单已锁定。</p>}
      {estimate && <div className="settings-budget-summary"><div><span>当前估算预算</span><strong>{minorToDecimal(estimate.total_spent_minor, estimate.currency)} / {minorToDecimal(estimate.monthly_minor, estimate.currency)}</strong></div><span className={`status-pill status-pill-${estimate.level === "ok" ? "success" : estimate.level === "warn" ? "warning" : estimate.level === "exceeded" ? "danger" : "neutral"}`}>{budgetStatusLabel(estimate.level)}</span>{estimate.has_unresolved && <small className="settings-budget-warning">部分用量仍待确认，金额可能不完整。</small>}</div>}
      {availableReport.confirmed && <div className="settings-budget-confirmed"><strong>已确认支出预算</strong><span>{minorToDecimal(availableReport.confirmed.total_spent_minor, availableReport.confirmed.currency)} / {minorToDecimal(availableReport.confirmed.monthly_minor, availableReport.confirmed.currency)} · 只读</span></div>}
      <div className="settings-budget-actions"><div><strong>系统提醒</strong><span>预算达到阈值时发送系统通知；权限状态由系统管理。</span></div><button className="button button-secondary button-small" type="button" onClick={toggleSnooze} disabled={snoozing}>{snoozing ? "处理中…" : snoozed ? "恢复提醒" : "本周期静默提醒"}</button>{snoozed && <small>已静默至 {budgetDate(availableReport.snoozed_until_ms)}</small>}</div>
    </>}
    {actionError && <div className="error-banner" role="alert">{actionError}</div>}
    {message && <p className="settings-budget-message" role="status" aria-live="polite">{message}</p>}
  </section>;
}

type QuotaReminderSectionProps = { config: QuotaReminderConfig | null; loading: boolean; error: string | null; onReload: () => void };

function QuotaReminderSection({ config, loading, error, onReload }: QuotaReminderSectionProps) {
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const mounted = useMountedRef();
  const available = config?.status === "ok";

  const toggle = async (event: ChangeEvent<HTMLInputElement>) => {
    if (!available || saving) return;
    const enabled = event.target.checked;
    setSaving(true); setActionError(null); setMessage(null);
    try {
      const receipt = await saveQuotaReminderConfig(enabled);
      if (!mounted.current) return;
      setMessage(receipt.enabled ? receipt.notification_permission === "granted" ? "已开启；额度窗口耗尽时会提醒一次。" : "已开启，但系统通知未授权；可在系统设置中开启。" : "已关闭额度窗口提醒。");
      onReload();
    } catch (reason: unknown) {
      if (mounted.current) setActionError(safeUiError(reason, "额度窗口提醒保存失败"));
    } finally { if (mounted.current) setSaving(false); }
  };

  const repair = async () => {
    if (saving) return;
    setSaving(true); setActionError(null); setMessage(null);
    try {
      const receipt = await saveQuotaReminderConfig(false);
      if (!mounted.current) return;
      setMessage(receipt.enabled ? "配置仍处于开启状态，请重试。" : "已恢复为关闭，额度窗口提醒配置已修复。定时任务不会被历史数据影响。");
      onReload();
    } catch (reason: unknown) {
      if (mounted.current) setActionError(safeUiError(reason, "额度窗口提醒配置修复失败"));
    } finally { if (mounted.current) setSaving(false); }
  };

  return <section className="settings-notification-section" id="settings-notifications" aria-labelledby="settings-notifications-title">
    <div className="settings-section-heading"><div><p className="eyebrow">系统通知</p><h3 id="settings-notifications-title">Claude Pro 额度窗口提醒</h3><p>默认关闭；启用时才申请系统通知权限。提醒只在本机检测到窗口耗尽时发送，不上传会话内容。</p></div><button className="button button-secondary button-small" type="button" onClick={onReload} disabled={loading}>{loading ? "读取中…" : "重载提醒"}</button></div>
    {error && <div className="error-banner" role="alert">额度窗口提醒暂不可用：{error}<button className="button button-secondary button-small" type="button" onClick={onReload}>重试</button></div>}
    <SettingsLoadingState loading={loading} hasData={Boolean(config)} title="额度提醒设置" detail="只查询本机开关，不会触发网络请求。" />
    {config?.status === "unavailable" && <div className="settings-source-state"><strong>额度提醒设置暂不可用</strong><span>配置文件无法读取；不会显示为已开启。可以显式恢复为关闭，只修复这个开关文件。</span><button className="button button-secondary button-small" type="button" onClick={repair} disabled={saving}>{saving ? "修复中…" : "恢复为关闭并修复配置"}</button></div>}
    <div className="settings-notification-card">
      <div><strong>窗口耗尽时通知</strong><p className="settings-notification-help">{config?.notification_permission === "denied" ? "系统通知未授权，可在系统设置中开启。" : config?.notification_permission === "granted" ? "系统通知已授权。" : "权限状态未知；保存开关后会由系统决定。"}</p></div>
      <label className="settings-notification-toggle"><input type="checkbox" checked={config?.enabled === true} onChange={toggle} disabled={!available || saving} aria-label="启用 Claude Pro 额度窗口提醒" /><span>{saving ? "保存中…" : config?.enabled ? "已开启" : "已关闭"}</span></label>
    </div>
    {actionError && <div className="error-banner" role="alert">{actionError}</div>}
    {message && <p className="settings-data-message" role="status" aria-live="polite">{message}</p>}
  </section>;
}

function SourceRow({ source, syncing, sourceControlHost, deleteConfirmHost, deleteBusyHost, supportedHosts, onSync, onToggleExcluded, onRequestDelete, onCancelDelete, onDelete }: { source: SourceHealthReport["sources"][number]; syncing: boolean; sourceControlHost: string | null; deleteConfirmHost: string | null; deleteBusyHost: string | null; supportedHosts: string[]; onSync: () => void; onToggleExcluded: (source: SourceHealthReport["sources"][number]) => void; onRequestDelete: (source: SourceHealthReport["sources"][number]) => void; onCancelDelete: () => void; onDelete: (source: SourceHealthReport["sources"][number]) => void }) {
  const errorText = source.error_kinds.map((kind) => errorLabels[kind]).join("、");
  const imported = source.connection_state === "not_detected" && source.sessions === 0 ? "尚未导入" : `${source.sessions} 个会话 · ${source.facts} 条记录`;
  const label = sourceLabel(source.host);
  const actionLabel = syncActionLabel(source.connection_state);
  const controlLabel = supportedHosts.includes(source.host) ? sourceControlLabel(source.connection_state) : null;
  const controlBusy = sourceControlHost === source.host;
  const deleteAllowed = supportedHosts.includes(source.host) && (source.facts > 0 || source.sessions > 0);
  const deleteConfirming = deleteConfirmHost === source.host;
  const deleteBusy = deleteBusyHost === source.host;
  return <article className="settings-source-row" tabIndex={0} aria-label={`${label}，${stateLabels[source.connection_state]}`}>
    <div className="settings-source-main">
      <div className={`settings-source-dot settings-source-dot-${sourceTone(source.connection_state)}`} aria-hidden="true" />
      <div className="settings-source-copy"><strong>{label}</strong><span>{stateLabels[source.connection_state]}</span></div>
    </div>
    <div className="settings-source-metrics"><span>{imported}</span><span>最近记录：{observedAt(source.last_event_at_ms)}</span>{source.failed_sources > 0 && <span className="settings-source-error">读取失败 · {errorText || "读取失败"}</span>}</div>
    <div className="settings-source-scan">扫描 {source.source_count} 个文件<br /><small>{source.last_scanned_at_ms === null ? "尚未扫描" : `上次扫描 ${observedAt(source.last_scanned_at_ms)}`}</small></div>
    <div className="settings-source-actions">{controlLabel && <button className="button button-secondary button-small settings-source-action" type="button" onClick={() => onToggleExcluded(source)} disabled={controlBusy || deleteBusy || syncing}>{controlBusy ? "保存中…" : controlLabel}</button>}{actionLabel && <button className="button button-secondary button-small settings-source-action" type="button" onClick={onSync} disabled={syncing || controlBusy || deleteBusy}>{syncing ? "同步中…" : actionLabel}</button>}{deleteAllowed && !deleteConfirming && <button className="button button-danger button-small settings-source-action" type="button" onClick={() => onRequestDelete(source)} disabled={controlBusy || deleteBusy || syncing}>删除已导入数据…</button>}{deleteConfirming && <div className="settings-source-delete-confirm" role="group" aria-label={`${label} 删除确认`}><strong>确认删除 {source.facts} 条记录和 {source.sessions} 个会话？</strong><span>将清理 App 投影、Trust 观测、路由证据和任务摘录；不会删除原始日志、手工账单或价卡。</span><div><button className="button button-secondary button-small" type="button" onClick={onCancelDelete} disabled={deleteBusy}>取消</button><button className="button button-danger button-small" type="button" onClick={() => onDelete(source)} disabled={deleteBusy}>{deleteBusy ? "删除中…" : "确认删除"}</button></div></div>}</div>
  </article>;
}

type CustomSourceSectionProps = {
  report: CustomSourceReport | null;
  loading: boolean;
  error: string | null;
  onReload: () => void;
  onSync: () => Promise<boolean>;
};

function CustomSourceSection({ report, loading, error, onReload, onSync }: CustomSourceSectionProps) {
  const [watcherHealth, setWatcherHealth] = useState<WatcherHealthStatus | null>(null);
  useEffect(() => {
    let active = true;
    let cleanup: (() => void) | undefined;
    void fetchWatcherHealth().then((status) => { if (active) setWatcherHealth(status); });
    void listenAppEvents((event) => {
      if (!active || event.type !== "WatcherHealthChanged") return;
      void fetchWatcherHealth().then((status) => { if (active) setWatcherHealth(status); });
    }).then((unsubscribe) => { if (active) cleanup = unsubscribe; else unsubscribe(); });
    return () => { active = false; cleanup?.(); };
  }, []);
  const [host, setHost] = useState<"codex" | "claude-code" | "dsh">("codex");
  const [root, setRoot] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const mounted = useMountedRef();

  const chooseRoot = async () => {
    setActionError(null);
    try {
      const selected = await pickCustomSourceRoot();
      if (!mounted.current) return;
      if (selected) {
        setRoot(selected);
        setMessage("已选择目录，请确认工具后添加。");
      }
    } catch (reason: unknown) {
      if (mounted.current) setActionError(safeUiError(reason, "无法打开目录选择"));
    }
  };

  const addRoot = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setActionError(null);
    setMessage(null);
    try {
      const result = await addCustomSourceRoot(host, root.trim());
      if (!mounted.current) return;
      setMessage(result.changed ? "目录已保存，正在同步。" : "该目录已在读取范围内，正在重新同步。");
      onReload();
      const synced = await onSync();
      if (mounted.current) setMessage(synced ? "目录已保存，同步完成。" : "目录已保存，但本次同步未完成；稍后可重新同步。");
    } catch (reason: unknown) {
      if (mounted.current) setActionError(safeUiError(reason, "添加读取位置失败"));
    } finally {
      if (mounted.current) setSaving(false);
    }
  };

  const removeRoot = async (source: CustomSourceReport["sources"][number]) => {
    if (saving) return;
    setSaving(true);
    setActionError(null);
    setMessage(null);
    try {
      const result = await removeCustomSourceRoot(source.host, source.root);
      if (!mounted.current) return;
      setMessage(result.changed ? "已移除读取位置；已导入数据仍保留。" : "该目录已不在读取范围内。");
      onReload();
    } catch (reason: unknown) {
      if (mounted.current) setActionError(safeUiError(reason, "移除读取位置失败"));
    } finally {
      if (mounted.current) setSaving(false);
    }
  };

  return <section className="settings-custom-section" aria-labelledby="settings-custom-title">
    <div className="settings-section-heading"><div><p className="eyebrow">本机位置</p><h3 id="settings-custom-title">其他读取位置</h3><p>选择包含工具日志的本机文件夹；只会加入本机读取范围。</p></div></div>
    <div className="settings-location-row" role="status" aria-live="polite"><strong>实时监听</strong><span>{watcherStatusLabel(watcherHealth)}</span></div>
    {error && <div className="error-banner" role="alert">读取位置设置暂不可用：{error}<button className="button button-secondary button-small" type="button" onClick={onReload}>重试</button></div>}
    <SettingsLoadingState loading={loading} hasData={Boolean(report)} title="位置配置" detail="不会读取目录内容。" />
    {report?.status === "unavailable" && <div className="settings-source-state"><strong>读取位置设置暂不可用</strong><span>可以稍后重试；已有来源状态不受影响。</span></div>}
    {report?.status === "ok" && <>
      <div className="settings-location-list" aria-label="标准读取位置">
        {Object.entries(report.locations).filter(([, path]) => path).map(([locationHost, path]) => <div className="settings-location-row" key={locationHost}><strong>{sourceLabel(locationHost)}</strong><span>{shortenPath(path as string)}</span><details><summary>显示完整路径</summary><code>{path}</code></details></div>)}
      </div>
      <form className="settings-custom-form" onSubmit={addRoot}>
        <label><span>工具</span><select value={host} onChange={(event) => setHost(event.target.value as typeof host)}><option value="codex">Codex</option><option value="claude-code">Claude Code</option><option value="dsh">DeepSeek Harness</option></select></label>
        <label className="settings-custom-path"><span>目录</span><input value={root} onChange={(event) => setRoot(event.target.value)} placeholder="/Volumes/…/sessions" autoComplete="off" /></label>
        <button className="button button-secondary" type="button" onClick={chooseRoot} disabled={saving}>选择文件夹</button>
        <button className="button button-secondary" type="submit" disabled={saving || !root.trim()}>{saving ? "保存中…" : "添加并同步"}</button>
      </form>
      {report.sources.length > 0 && <div className="settings-custom-list" aria-label="已添加读取位置">{report.sources.map((source) => <div className="settings-custom-row" key={`${source.host}:${source.root}`}><div><strong>{sourceLabel(source.host)}</strong><span>{shortenPath(source.root)}</span><details><summary>显示完整路径</summary><code>{source.root}</code></details></div><button className="button button-secondary button-small" type="button" onClick={() => removeRoot(source)} disabled={saving}>移除读取位置</button></div>)}</div>}
      {report.sources.length === 0 && <p className="settings-custom-empty">尚未添加其他读取位置。</p>}
    </>}
    {actionError && <div className="error-banner" role="alert">{actionError}</div>}
    {message && <p className="settings-custom-message" role="status" aria-live="polite">{message}</p>}
  </section>;
}

/** watcher 健康的用户文案（HARDENING spec §5.6）：不指控、不暴露路径；
 * degraded/unavailable 统一为「定期检查」，periodic fallback 永远在场。 */
function watcherStatusLabel(health: WatcherHealthStatus | null): string {
  if (!health) return "状态不可判定 · 定期检查每 5 分钟兜底";
  // `throttled` 能与 `mode: "active"` 共存（REVIEW P4 自看护：watcher 后端
  // 本身没坏，只是本机 CPU 持续偏高，同步节流窗被自动拉长）——如实说明，
  // 不能让它落进「实时监听已启用」这句话里悄悄消失。
  const throttledSuffix = health.reasonCode === "throttled" ? " · 本机 CPU 较高，同步节流中" : "";
  if (health.mode === "active" && health.pendingRoots === 0) return `实时监听已启用${throttledSuffix}`;
  if (health.mode === "active" && health.pendingRoots > 0) {
    return `部分可用（${health.pendingRoots} 个根等待） · 其余实时${throttledSuffix}`;
  }
  if (health.mode === "disabled") return "未启用实时监听 · 定期检查每 5 分钟";
  return "已降级为定期检查 · 每 5 分钟";
}

export function SettingsPage() {
  const [report, setReport] = useState<SourceHealthReport | null>(null);
  const [sourceControls, setSourceControls] = useState<SourceHostControls | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [sourceControlHost, setSourceControlHost] = useState<string | null>(null);
  const [sourceControlError, setSourceControlError] = useState<string | null>(null);
  const [sourceControlMessage, setSourceControlMessage] = useState<string | null>(null);
  const [deleteConfirmHost, setDeleteConfirmHost] = useState<string | null>(null);
  const [deleteBusyHost, setDeleteBusyHost] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteMessage, setDeleteMessage] = useState<string | null>(null);
  const [customReport, setCustomReport] = useState<CustomSourceReport | null>(null);
  const [customError, setCustomError] = useState<string | null>(null);
  const [customLoading, setCustomLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [pauseSaving, setPauseSaving] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [budgetReport, setBudgetReport] = useState<BudgetSettingsReport | null>(null);
  const [budgetError, setBudgetError] = useState<string | null>(null);
  const [budgetLoading, setBudgetLoading] = useState(true);
  const [billingReport, setBillingReport] = useState<BillingSettingsReport | null>(null);
  const [billingError, setBillingError] = useState<string | null>(null);
  const [billingLoading, setBillingLoading] = useState(true);
  const [dataReport, setDataReport] = useState<StatisticsSettingsReport | null>(null);
  const [dataError, setDataError] = useState<string | null>(null);
  const [dataLoading, setDataLoading] = useState(true);
  const [aboutReport, setAboutReport] = useState<AboutDiagnosticsReport | null>(null);
  const [aboutError, setAboutError] = useState<string | null>(null);
  const [aboutLoading, setAboutLoading] = useState(true);
  const [quotaReminder, setQuotaReminder] = useState<QuotaReminderConfig | null>(null);
  const [quotaReminderError, setQuotaReminderError] = useState<string | null>(null);
  const [quotaReminderLoading, setQuotaReminderLoading] = useState(true);
  const settingsMounted = useRef(true);
  const sourceRequest = useRef(0);
  const sourceControlsRequest = useRef(0);
  const customRequest = useRef(0);
  const budgetRequest = useRef(0);
  const billingRequest = useRef(0);
  const dataRequest = useRef(0);
  const aboutRequest = useRef(0);
  const quotaReminderRequest = useRef(0);

  const refresh = () => {
    const sourceRequestId = ++sourceRequest.current;
    const sourceControlsRequestId = ++sourceControlsRequest.current;
    setLoading(true);
    setError(null);
    void readSourceHostControls().then((next) => {
      if (settingsMounted.current && sourceControlsRequestId === sourceControlsRequest.current) setSourceControls(next);
    }).catch(() => {
      if (settingsMounted.current && sourceControlsRequestId === sourceControlsRequest.current) setSourceControls(null);
    });
    void readSourceHealth().then((next) => {
      if (settingsMounted.current && sourceRequestId === sourceRequest.current) setReport(next);
    }).catch((reason: unknown) => {
      if (settingsMounted.current && sourceRequestId === sourceRequest.current) setError(safeUiError(reason, "来源状态读取失败"));
    }).finally(() => {
      if (settingsMounted.current && sourceRequestId === sourceRequest.current) setLoading(false);
    });
  };

  const refreshCustom = () => {
    const requestId = ++customRequest.current;
    setCustomLoading(true);
    setCustomError(null);
    void readCustomSourceConfig().then((next) => {
      if (settingsMounted.current && requestId === customRequest.current) setCustomReport(next);
    }).catch((reason: unknown) => {
      if (settingsMounted.current && requestId === customRequest.current) setCustomError(safeUiError(reason, "自定义来源配置读取失败"));
    }).finally(() => {
      if (settingsMounted.current && requestId === customRequest.current) setCustomLoading(false);
    });
  };

  const refreshBudget = () => {
    const requestId = ++budgetRequest.current;
    setBudgetLoading(true);
    setBudgetError(null);
    void readBudgetSettings().then((next) => {
      if (settingsMounted.current && requestId === budgetRequest.current) setBudgetReport(next);
    }).catch((reason: unknown) => {
      if (settingsMounted.current && requestId === budgetRequest.current) setBudgetError(safeUiError(reason, "预算状态读取失败"));
    }).finally(() => {
      if (settingsMounted.current && requestId === budgetRequest.current) setBudgetLoading(false);
    });
  };

  const refreshBilling = () => {
    const requestId = ++billingRequest.current;
    setBillingLoading(true);
    setBillingError(null);
    void readBillingSettings().then((next) => {
      if (settingsMounted.current && requestId === billingRequest.current) setBillingReport(next);
    }).catch((reason: unknown) => {
      if (settingsMounted.current && requestId === billingRequest.current) setBillingError(safeUiError(reason, "计费状态读取失败"));
    }).finally(() => {
      if (settingsMounted.current && requestId === billingRequest.current) setBillingLoading(false);
    });
  };

  const refreshData = () => {
    const requestId = ++dataRequest.current;
    setDataLoading(true);
    setDataError(null);
    void readStatisticsSettings().then((next) => {
      if (settingsMounted.current && requestId === dataRequest.current) setDataReport(next);
    }).catch((reason: unknown) => {
      if (settingsMounted.current && requestId === dataRequest.current) setDataError(safeUiError(reason, "统计设置读取失败"));
    }).finally(() => {
      if (settingsMounted.current && requestId === dataRequest.current) setDataLoading(false);
    });
  };

  const refreshAbout = () => {
    const requestId = ++aboutRequest.current;
    setAboutLoading(true);
    setAboutError(null);
    void readAboutDiagnostics().then((next) => {
      if (settingsMounted.current && requestId === aboutRequest.current) setAboutReport(next);
    }).catch((reason: unknown) => {
      if (settingsMounted.current && requestId === aboutRequest.current) setAboutError(safeUiError(reason, "版本诊断读取失败"));
    }).finally(() => {
      if (settingsMounted.current && requestId === aboutRequest.current) setAboutLoading(false);
    });
  };

  const refreshQuotaReminder = () => {
    const requestId = ++quotaReminderRequest.current;
    setQuotaReminderLoading(true);
    setQuotaReminderError(null);
    void readQuotaReminderConfig().then((next) => {
      if (settingsMounted.current && requestId === quotaReminderRequest.current) setQuotaReminder(next);
    }).catch((reason: unknown) => {
      if (settingsMounted.current && requestId === quotaReminderRequest.current) setQuotaReminderError(safeUiError(reason, "额度窗口提醒读取失败"));
    }).finally(() => {
      if (settingsMounted.current && requestId === quotaReminderRequest.current) setQuotaReminderLoading(false);
    });
  };

  const runSync = async (): Promise<boolean> => {
    if (syncing) return false;
    setSyncing(true);
    setError(null);
    setSyncMessage("同步已发起，正在等待本机回执…");
    try {
      const requestId = await triggerSync();
      if (!settingsMounted.current) return false;
      for (let attempt = 0; attempt < 20; attempt += 1) {
        const status = await readSyncRequestStatus(requestId);
        if (!settingsMounted.current) return false;
        if (status.failed) throw new Error("同步请求已失效");
        if (status.completed) {
          setSyncMessage("同步完成，来源状态已刷新。");
          refresh();
          return true;
        }
        await new Promise((resolve) => window.setTimeout(resolve, 250));
      }
      setSyncMessage("同步仍在后台运行；稍后可重新查看来源状态。");
      return false;
    } catch (reason: unknown) {
      if (settingsMounted.current) {
        setSyncMessage(null);
        setError(safeUiError(reason, "同步请求未能完成"));
      }
      return false;
    } finally {
      if (settingsMounted.current) setSyncing(false);
    }
  };

  const togglePause = async () => {
    if (pauseSaving || report?.sync.paused === null || report?.sync.paused === undefined) return;
    setPauseSaving(true);
    setError(null);
    try {
      const paused = await setSyncPaused(!report.sync.paused);
      if (!settingsMounted.current) return;
      setSyncMessage(paused ? "自动同步已暂停。" : "自动同步已恢复。");
      refresh();
    } catch (reason: unknown) {
      if (settingsMounted.current) setError(safeUiError(reason, "自动同步设置未保存"));
    } finally {
      if (settingsMounted.current) setPauseSaving(false);
    }
  };

  const toggleSourceExcluded = async (source: SourceHealthReport["sources"][number]) => {
    if (sourceControlHost) return;
    const excluded = source.connection_state !== "excluded";
    setSourceControlHost(source.host);
    setSourceControlError(null);
    setSourceControlMessage(null);
    try {
      const receipt = await setSourceHostExcluded(source.host, excluded);
      if (!settingsMounted.current) return;
      setSourceControlMessage(receipt.excluded ? `${sourceLabel(source.host)} 已停止读取；已导入数据未删除。` : `${sourceLabel(source.host)} 已恢复读取；下次同步会重新纳入。`);
      refresh();
    } catch (reason: unknown) {
      if (settingsMounted.current) setSourceControlError(safeUiError(reason, "来源读取控制未保存"));
    } finally {
      if (settingsMounted.current) setSourceControlHost(null);
    }
  };

  const deleteSourceData = async (source: SourceHealthReport["sources"][number]) => {
    if (deleteBusyHost) return;
    setDeleteBusyHost(source.host);
    setDeleteError(null);
    setDeleteMessage(null);
    try {
      const receipt = await deleteImportedSourceData(source.host);
      if (!settingsMounted.current) return;
      setDeleteMessage(`已删除 ${receipt.facts} 条记录、${receipt.sessions} 个会话、${receipt.source_files} 个来源文件、${receipt.trust_observations} 条 Trust 观测、${receipt.route_evidence} 条路由证据和 ${receipt.session_excerpts} 条任务摘录；原始日志未修改。`);
      setDeleteConfirmHost(null);
      refresh();
    } catch (reason: unknown) {
      if (settingsMounted.current) setDeleteError(`删除未完成；原始日志未修改，请重新查看来源状态后重试。${safeUiError(reason, "请稍后重试")}`);
    } finally {
      if (settingsMounted.current) setDeleteBusyHost(null);
    }
  };

  useEffect(() => {
    settingsMounted.current = true;
    refresh();
    refreshCustom();
    refreshBudget();
    refreshBilling();
    refreshData();
    refreshAbout();
    refreshQuotaReminder();
    let active = true;
    let cleanups: Array<() => void> = [];
    const gate = makeInvalidationGate();
    void listenAppEvents((event) => {
      if (!active) return;
      if (event.type === "SourceDataDeleted" && gate(event)) {
        // R1：轮询合成的事件带 revision，已被 Invalidated 覆盖的同 revision 重复
        // 被 gate 吞掉；真删除（无 revision）仍无条件放行。
        refresh(); refreshData(); refreshQuotaReminder();
      } else if (event.type === "SyncStatusChanged") {
        // 同步失败/恢复只体现在数据源健康（sync_runs 是记账写，不推进 revision）。
        refresh();
      } else if (gate(event)) {
        // 权威 revision 前进：预算/计费/数据面/关于页一起重拉——每 tick 至多一次，
        // 且同 revision 的重复事件被闸门吞掉（RUNTIME_INVALIDATION spec §6）。
        refresh(); refreshCustom(); refreshBudget(); refreshBilling(); refreshData(); refreshAbout(); refreshQuotaReminder();
      }
    }).then((unsubscribe) => {
      if (active) cleanups = [unsubscribe];
      else unsubscribe();
    });
    return () => { active = false; settingsMounted.current = false; cleanups.forEach((unsubscribe) => unsubscribe()); };
  }, []);

  const attentionCount = useMemo(() => report?.sources.filter((source) => source.connection_state === "needs_attention").length ?? 0, [report]);

  return <>
    <section className="settings-page-header" aria-labelledby="settings-title">
      <div><p className="eyebrow">本机设置</p><h2 id="settings-title">数据源与本机配置</h2><p className="section-description">先查看数据源是否正常读取；本页只显示安全聚合，不展示绝对路径或原始错误。</p></div>
      <button className="button button-secondary" type="button" onClick={refresh} disabled={loading}>{loading ? "读取中…" : "重载"}</button>
    </section>

    <nav className="settings-section-nav" aria-label="设置分区"><a className="settings-section-nav-active" href="#settings-sources">数据源</a><a href="#settings-billing">计费与套餐</a><a href="#settings-budget">预算</a><a href="#settings-notifications">提醒</a><a href="#settings-data">统计与数据</a><a href="#settings-about">关于与诊断</a></nav>

    <section className="settings-section" id="settings-sources" aria-labelledby="settings-sources-title">
      <div className="settings-section-heading"><div><p className="eyebrow">数据源</p><h3 id="settings-sources-title">来源健康</h3><p>每个工具独立显示读取状态；来源之间不合并计数。</p></div>{report && <span className={`status-pill status-pill-${attentionCount ? "warning" : "success"}`}>{attentionCount ? `${attentionCount} 个来源需要处理` : "来源状态正常"}</span>}</div>
      {error && <div className="error-banner" role="alert">来源状态暂不可用：{error}<button className="button button-secondary button-small" type="button" onClick={refresh}>重试</button></div>}
      <SettingsLoadingState loading={loading} hasData={Boolean(report)} title="来源状态" detail="只查询本机 authority，不会触发同步或读取额外路径。" />
      {report?.status === "unavailable" && <div className="settings-source-state"><strong>来源状态暂不可用</strong><span>本地 authority 无法读取；这不是“没有来源”，请修复数据库或重新同步后再试。</span></div>}
      {report?.status === "ok" && <div className="settings-source-list">{report.sources.length ? report.sources.map((source) => <SourceRow key={source.host} source={source} syncing={syncing} sourceControlHost={sourceControlHost} deleteConfirmHost={deleteConfirmHost} deleteBusyHost={deleteBusyHost} supportedHosts={sourceControls?.supported_hosts ?? []} onSync={runSync} onToggleExcluded={toggleSourceExcluded} onRequestDelete={(item) => { setDeleteError(null); setDeleteMessage(null); setDeleteConfirmHost(item.host); }} onCancelDelete={() => setDeleteConfirmHost(null)} onDelete={deleteSourceData} />) : <div className="settings-source-state"><strong>没有可显示的来源</strong><span>来源注册表暂未返回任何工具。</span></div>}</div>}
      {sourceControlError && <div className="error-banner" role="alert">来源读取控制未保存：{sourceControlError}</div>}
      {sourceControlMessage && <p className="settings-sync-message" role="status" aria-live="polite">{sourceControlMessage}</p>}
      {deleteError && <div className="error-banner" role="alert">{deleteError}</div>}
      {deleteMessage && <p className="settings-sync-message" role="status" aria-live="polite">{deleteMessage}</p>}
      {report && <div className="settings-sync-summary"><span>上次同步：{syncLabel(report)}</span><span>{report.sync.paused === true ? "自动同步已暂停" : report.sync.paused === false ? "自动同步已开启" : "自动同步状态不可用"}</span>{report.sync.paused !== null && <button className="button button-secondary button-small" type="button" onClick={togglePause} disabled={pauseSaving}>{pauseSaving ? "保存中…" : report.sync.paused ? "恢复自动同步" : "暂停自动同步"}</button>} {syncMessage && <small role="status">{syncMessage}</small>}<small>停止读取只影响后续同步；删除只清理 App 投影，计费归因仍保留在旧工作台。</small></div>}
    </section>

    <CustomSourceSection report={customReport} loading={customLoading} error={customError} onReload={refreshCustom} onSync={runSync} />

    <BillingSection report={billingReport} loading={billingLoading} error={billingError} onReload={refreshBilling} />

    <BudgetSection report={budgetReport} loading={budgetLoading} error={budgetError} onReload={refreshBudget} />

    <QuotaReminderSection config={quotaReminder} loading={quotaReminderLoading} error={quotaReminderError} onReload={refreshQuotaReminder} />

    <StatisticsDataSection report={dataReport} loading={dataLoading} error={dataError} onReload={refreshData} />

    <AboutSection report={aboutReport} loading={aboutLoading} error={aboutError} onReload={refreshAbout} />

    <section className="settings-placeholder" aria-label="其他设置迁移状态"><strong>高风险操作仍在旧工作台</strong><span>账单归因、导入删除和数据库恢复等会改变历史数据的操作仍保留在旧工作台，待单独完成回执与失败恢复验收。</span></section>
  </>;
}
