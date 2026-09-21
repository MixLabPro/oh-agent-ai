import { useEffect, useMemo, useState, type FormEvent } from "react";
import { addCustomSourceRoot, checkForUpdates, clearBudgetSnooze, listen, openTrustedReleasesPage, pickCustomSourceRoot, readAboutDiagnostics, readBillingSettings, readBudgetSettings, readCustomSourceConfig, readMonthlyExportSummary, readSourceHealth, readSourceHostControls, readSyncRequestStatus, readStatisticsSettings, removeCustomSourceRoot, safeUiError, saveBudgetProfile, saveDiagnosticPackage, saveRetentionMonths, saveStatisticsTimezone, setSourceHostExcluded, setSyncPaused, snoozeBudgetCurrentPeriod, triggerSync, type AboutDiagnosticsReport, type BillingSettingsReport, type BudgetSettingsReport, type CustomSourceReport, type MonthlyExportSummary, type SourceConnectionState, type SourceErrorKind, type SourceHealthReport, type SourceHostControls, type StatisticsSettingsReport, type UpdateCheckResult } from "../../lib/tauri";

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
    try { const receipt = await saveStatisticsTimezone(next); setTimezone(receipt.timezone); setMessage(`统计时区已保存为 ${receipt.timezone}；用量页会按新的月份边界刷新。`); onReload(); }
    catch (reason: unknown) { setActionError(safeUiError(reason, "统计时区保存失败")); }
    finally { setSavingTimezone(false); }
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
    try { const receipt = await saveRetentionMonths(months, minimum, maximum); setRetention(String(receipt.months)); setMessage(`本机保留期已保存为 ${receipt.months} 个月；下次维护时才会执行清理。`); onReload(); }
    catch (reason: unknown) { setActionError(safeUiError(reason, "保留期保存失败")); }
    finally { setSavingRetention(false); }
  };

  const loadExport = async () => {
    if (exportLoading) return;
    setExportLoading(true); setExportError(null);
    const timezoneForExport = report?.timezone.status === "ok" ? report.timezone.timezone ?? undefined : undefined;
    try { setExportSummary(await readMonthlyExportSummary(statisticsMonth(timezoneForExport))); setExportPreview(true); }
    catch (reason: unknown) { setExportSummary(null); setExportError(safeUiError(reason, "月度摘要读取失败")); }
    finally { setExportLoading(false); }
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

  const exportDiagnostics = async () => {
    if (exporting) return;
    setExporting(true); setActionError(null); setMessage(null);
    try { const receipt = await saveDiagnosticPackage(); setMessage(receipt.status === "cancelled" ? "已取消保存诊断包。" : "诊断包已保存到你选择的位置；不会自动上传。"); }
    catch (reason: unknown) { setActionError(safeUiError(reason, "诊断包保存失败")); }
    finally { setExporting(false); }
  };
  const checkUpdates = async () => {
    if (checking) return;
    setChecking(true); setActionError(null); setMessage(null);
    try { const result = await checkForUpdates(); setUpdate(result); setMessage(result.status === "ok" && result.latestTag ? `当前 ${result.currentVersion ?? "未知"} · 最新 ${result.latestTag}；请手动从发布页确认安装。` : result.status === "no_release" ? "当前没有可用的可信发布。" : "版本检查暂不可用。"); }
    catch (reason: unknown) { setActionError(safeUiError(reason, "版本检查失败")); }
    finally { setChecking(false); }
  };
  const openReleases = async () => {
    if (opening) return;
    setOpening(true); setActionError(null);
    try { await openTrustedReleasesPage(); setMessage("已打开可信发布页；安装需由你手动确认。"); }
    catch (reason: unknown) { setActionError(safeUiError(reason, "发布页打开失败")); }
    finally { setOpening(false); }
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
  const pendingGroups = report?.groups ?? [];
  const pendingCandidates = (report?.candidates ?? []).filter((candidate) => candidate.status === "pending");
  const hasPending = pendingGroups.length > 0 || pendingCandidates.length > 0;
  const failedJobs = (report?.jobs ?? []).filter((job) => job.status === "failed" || job.status === "cancelled");
  return <section className="settings-billing-section" id="settings-billing" aria-labelledby="settings-billing-title">
    <div className="settings-section-heading"><div><p className="eyebrow">计费与套餐</p><h3 id="settings-billing-title">计费与套餐</h3><p>查看待确认的计费关系、当前声明和已有账单；账单录入仍在旧工作台。</p></div><button className="button button-secondary button-small" type="button" onClick={onReload} disabled={loading}>{loading ? "读取中…" : "重载计费"}</button></div>
    {error && <div className="error-banner" role="alert">待确认状态暂不可用：{error}<button className="button button-secondary button-small" type="button" onClick={onReload}>重试</button></div>}
    <SettingsLoadingState loading={loading} hasData={Boolean(report)} title="计费状态" detail="只查询本机 authority，不会修改归因。" />
    {report && <>
      {hasPending && <div className="settings-billing-todo"><div><strong>有待确认的计费关系</strong><span>{pendingGroups.length + pendingCandidates.length} 项需要确认；未确认前仍按现有估算展示。</span></div><button className="button button-primary" type="button" onClick={() => setExpanded((value) => !value)}>{expanded ? "收起待确认" : "查看待确认项"}</button></div>}
      {!hasPending && report.groups_status === "ok" && report.candidates_status === "ok" && <p className="settings-billing-empty">当前没有待确认的计费关系。</p>}
      {expanded && <div className="settings-billing-pending" aria-label="待确认的计费关系">
        {pendingGroups.slice(0, 32).map((group) => <article className="settings-billing-row" key={group.group_id}><div><strong>{group.host} · {group.provider_id} · {group.model_id}</strong><span>{compactTokens(group.tokens)} tokens · {group.session_count} 个会话 · {billingAmountText(group.estimated_amounts)} · {group.evidence_state === "unresolved" ? "部分用量未完成计价" : group.evidence_state === "determined" ? "已有明确线索" : "需要确认计费方式"}</span></div><small>{group.effective_start}{group.effective_end && group.effective_end !== group.effective_start ? ` – ${group.effective_end}` : ""}</small></article>)}
        {pendingCandidates.map((candidate) => <article className="settings-billing-row" key={candidate.candidate_id}><div><strong>{candidate.provider_id} · {minorToDecimal(candidate.amount_minor, candidate.currency)}/月 · {candidate.host}</strong><span>来自历史套餐记录 · 自 {candidate.billing_period_start} 起{candidate.impact ? ` · ${compactTokens(candidate.impact.total_tokens)} tokens · ${candidate.impact.session_count} 个会话` : ""}</span></div><small>需要在旧工作台确认</small></article>)}
        <p className="settings-billing-deferred" role="note">确认、撤销和重算会改变历史用量归因，当前仍在旧工作台执行；React 页面只展示安全只读证据。</p>
      </div>}
      {report.declarations_status !== "unavailable" && report.declarations.length > 0 && <div className="settings-billing-list"><div className="settings-setting-label">当前计费声明</div>{report.declarations.slice(0, 32).map((declaration) => <div className="settings-billing-row" key={declaration.declaration_id}><div><strong>{declaration.host} · {declaration.provider_id}</strong><span>{declaration.relationship_kind === "official_subscription" ? "官方订阅" : declaration.relationship_kind === "official_api" ? "官方 API 按量" : declaration.relationship_kind === "organization" ? "组织承担" : declaration.relationship_kind === "third_party" ? "中转或第三方" : "状态未知"} · {declaration.subscription_name ?? "未命名声明"}{declaration.amount_minor !== null && declaration.currency ? ` · ${minorToDecimal(declaration.amount_minor, declaration.currency)}` : ""}</span></div><small>{declaration.effective_start}{declaration.effective_end ? ` – ${declaration.effective_end}` : " · 持续有效"} · {declaration.scope_count} 个范围</small></div>)}</div>}
      {failedJobs.length > 0 && <div className="settings-billing-job-warning" role="alert"><strong>有重算任务需要处理</strong><span>旧结果仍可读，失败任务需要在旧工作台重试。</span></div>}
      {report.bills_status !== "unavailable" && report.bills.length > 0 && <div className="settings-billing-list"><div className="settings-setting-label">已有账单</div>{report.bills.slice(0, 64).map((bill) => <div className="settings-billing-row" key={bill.bill_id}><div><strong>{bill.host} · {bill.provider_id}</strong><span>{minorToDecimal(bill.amount_minor, bill.currency)} · {bill.billing_basis === "fixed_subscription" ? "订阅" : bill.billing_basis === "host_billed" ? "宿主账单" : bill.billing_basis === "metered_actual" ? "按量实付" : "计价口径未知"}</span></div><small>{bill.billing_period} · {bill.has_evidence ? "有来源记录" : "来源未记录"}</small></div>)}</div>}
      {(report.groups_status === "unavailable" || report.candidates_status === "unavailable") && <p className="settings-billing-unavailable" role="alert">待确认计费状态暂不可读，不将不可用误判为空。</p>}
      {report.declarations_status === "unavailable" && <p className="settings-billing-unavailable" role="alert">当前计费声明暂不可读。</p>}
      {report.jobs_status === "unavailable" && <p className="settings-billing-unavailable" role="alert">重算状态暂不可读。</p>}
      {report.bills_status === "unavailable" && <p className="settings-billing-unavailable" role="alert">本月账单暂不可读。</p>}
      {(report.groups_status === "partial" || report.candidates_status === "partial" || report.declarations_status === "partial" || report.jobs_status === "partial" || report.bills_status === "partial") && <p className="settings-billing-unavailable" role="status">部分计费记录无法读取，已显示可验证的记录。</p>}
    </>}
  </section>;
}

type BudgetSectionProps = { report: BudgetSettingsReport | null; loading: boolean; error: string | null; onReload: () => void };

function BudgetSection({ report, loading, error, onReload }: BudgetSectionProps) {
  const [currency, setCurrency] = useState<"CNY" | "USD">("CNY");
  const [monthly, setMonthly] = useState("");
  const [daily, setDaily] = useState("");
  const [saving, setSaving] = useState(false);
  const [snoozing, setSnoozing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    const estimate = report?.estimate;
    if (estimate) {
      if (estimate.currency === "USD" || estimate.currency === "CNY") setCurrency(estimate.currency);
      setMonthly((estimate.monthly_minor / 100).toFixed(2));
      setDaily(estimate.daily_minor === null ? "" : (estimate.daily_minor / 100).toFixed(2));
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
      setMessage(`已保存 ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}${receipt.notification_permission === "granted" ? "。" : "。系统通知未授权，可在系统设置中开启。"}`);
      onReload();
    } catch (reason: unknown) {
      setActionError(safeUiError(reason, "预算保存失败"));
    } finally { setSaving(false); }
  };

  const toggleSnooze = async () => {
    if (snoozing) return;
    setSnoozing(true); setMessage(null); setActionError(null);
    try {
      if (report?.snoozed_until_ms && report.snoozed_until_ms > Date.now()) {
        await clearBudgetSnooze();
        setMessage("预算提醒已恢复。");
      } else {
        await snoozeBudgetCurrentPeriod();
        setMessage("预算提醒已静默至本周期结束；统计仍会继续更新。");
      }
      onReload();
    } catch (reason: unknown) { setActionError(safeUiError(reason, "预算提醒设置失败")); }
    finally { setSnoozing(false); }
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
        <button className="button button-secondary" type="submit" disabled={saving || unsupportedCurrency}>{saving ? "保存中…" : "保存预算"}</button>
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

function SourceRow({ source, syncing, sourceControlHost, supportedHosts, onSync, onToggleExcluded }: { source: SourceHealthReport["sources"][number]; syncing: boolean; sourceControlHost: string | null; supportedHosts: string[]; onSync: () => void; onToggleExcluded: (source: SourceHealthReport["sources"][number]) => void }) {
  const errorText = source.error_kinds.map((kind) => errorLabels[kind]).join("、");
  const imported = source.connection_state === "not_detected" && source.sessions === 0 ? "尚未导入" : `${source.sessions} 个会话 · ${source.facts} 条记录`;
  const label = sourceLabel(source.host);
  const actionLabel = syncActionLabel(source.connection_state);
  const controlLabel = supportedHosts.includes(source.host) ? sourceControlLabel(source.connection_state) : null;
  const controlBusy = sourceControlHost === source.host;
  return <article className="settings-source-row" tabIndex={0} aria-label={`${label}，${stateLabels[source.connection_state]}`}>
    <div className="settings-source-main">
      <div className={`settings-source-dot settings-source-dot-${sourceTone(source.connection_state)}`} aria-hidden="true" />
      <div className="settings-source-copy"><strong>{label}</strong><span>{stateLabels[source.connection_state]}</span></div>
    </div>
    <div className="settings-source-metrics"><span>{imported}</span><span>最近记录：{observedAt(source.last_event_at_ms)}</span>{source.failed_sources > 0 && <span className="settings-source-error">读取失败 · {errorText || "读取失败"}</span>}</div>
    <div className="settings-source-scan">扫描 {source.source_count} 个文件<br /><small>{source.last_scanned_at_ms === null ? "尚未扫描" : `上次扫描 ${observedAt(source.last_scanned_at_ms)}`}</small></div>
    <div className="settings-source-actions">{controlLabel && <button className="button button-secondary button-small settings-source-action" type="button" onClick={() => onToggleExcluded(source)} disabled={controlBusy || syncing}>{controlBusy ? "保存中…" : controlLabel}</button>}{actionLabel && <button className="button button-secondary button-small settings-source-action" type="button" onClick={onSync} disabled={syncing || controlBusy}>{syncing ? "同步中…" : actionLabel}</button>}</div>
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
  const [host, setHost] = useState<"codex" | "claude-code" | "dsh">("codex");
  const [root, setRoot] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const chooseRoot = async () => {
    setActionError(null);
    try {
      const selected = await pickCustomSourceRoot();
      if (selected) {
        setRoot(selected);
        setMessage("已选择目录，请确认工具后添加。");
      }
    } catch (reason: unknown) {
      setActionError(safeUiError(reason, "无法打开目录选择"));
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
      setMessage(result.changed ? "目录已保存，正在同步。" : "该目录已在读取范围内，正在重新同步。");
      onReload();
      const synced = await onSync();
      setMessage(synced ? "目录已保存，同步完成。" : "目录已保存，但本次同步未完成；稍后可重新同步。");
    } catch (reason: unknown) {
      setActionError(safeUiError(reason, "添加读取位置失败"));
    } finally {
      setSaving(false);
    }
  };

  const removeRoot = async (source: CustomSourceReport["sources"][number]) => {
    if (saving) return;
    setSaving(true);
    setActionError(null);
    setMessage(null);
    try {
      const result = await removeCustomSourceRoot(source.host, source.root);
      setMessage(result.changed ? "已移除读取位置；已导入数据仍保留。" : "该目录已不在读取范围内。");
      onReload();
    } catch (reason: unknown) {
      setActionError(safeUiError(reason, "移除读取位置失败"));
    } finally {
      setSaving(false);
    }
  };

  return <section className="settings-custom-section" aria-labelledby="settings-custom-title">
    <div className="settings-section-heading"><div><p className="eyebrow">本机位置</p><h3 id="settings-custom-title">其他读取位置</h3><p>选择包含工具日志的本机文件夹；只会加入本机读取范围。</p></div></div>
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

export function SettingsPage() {
  const [report, setReport] = useState<SourceHealthReport | null>(null);
  const [sourceControls, setSourceControls] = useState<SourceHostControls | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [sourceControlHost, setSourceControlHost] = useState<string | null>(null);
  const [sourceControlError, setSourceControlError] = useState<string | null>(null);
  const [sourceControlMessage, setSourceControlMessage] = useState<string | null>(null);
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

  const refresh = () => {
    setLoading(true);
    setError(null);
    void readSourceHostControls().then(setSourceControls).catch(() => setSourceControls(null));
    void readSourceHealth().then(setReport).catch((reason: unknown) => {
      setError(safeUiError(reason, "来源状态读取失败"));
    }).finally(() => setLoading(false));
  };

  const refreshCustom = () => {
    setCustomLoading(true);
    setCustomError(null);
    void readCustomSourceConfig().then(setCustomReport).catch((reason: unknown) => {
      setCustomError(safeUiError(reason, "自定义来源配置读取失败"));
    }).finally(() => setCustomLoading(false));
  };

  const refreshBudget = () => {
    setBudgetLoading(true);
    setBudgetError(null);
    void readBudgetSettings().then(setBudgetReport).catch((reason: unknown) => {
      setBudgetError(safeUiError(reason, "预算状态读取失败"));
    }).finally(() => setBudgetLoading(false));
  };

  const refreshBilling = () => {
    setBillingLoading(true);
    setBillingError(null);
    void readBillingSettings().then(setBillingReport).catch((reason: unknown) => {
      setBillingError(safeUiError(reason, "计费状态读取失败"));
    }).finally(() => setBillingLoading(false));
  };

  const refreshData = () => {
    setDataLoading(true);
    setDataError(null);
    void readStatisticsSettings().then(setDataReport).catch((reason: unknown) => {
      setDataError(safeUiError(reason, "统计设置读取失败"));
    }).finally(() => setDataLoading(false));
  };

  const refreshAbout = () => {
    setAboutLoading(true);
    setAboutError(null);
    void readAboutDiagnostics().then(setAboutReport).catch((reason: unknown) => {
      setAboutError(safeUiError(reason, "版本诊断读取失败"));
    }).finally(() => setAboutLoading(false));
  };

  const runSync = async (): Promise<boolean> => {
    if (syncing) return false;
    setSyncing(true);
    setError(null);
    setSyncMessage("同步已发起，正在等待本机回执…");
    try {
      const requestId = await triggerSync();
      for (let attempt = 0; attempt < 20; attempt += 1) {
        const status = await readSyncRequestStatus(requestId);
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
      setSyncMessage(null);
      setError(safeUiError(reason, "同步请求未能完成"));
      return false;
    } finally {
      setSyncing(false);
    }
  };

  const togglePause = async () => {
    if (pauseSaving || report?.sync.paused === null || report?.sync.paused === undefined) return;
    setPauseSaving(true);
    setError(null);
    try {
      await setSyncPaused(!report.sync.paused);
      setSyncMessage(!report.sync.paused ? "自动同步已暂停。" : "自动同步已恢复。");
      refresh();
    } catch (reason: unknown) {
      setError(safeUiError(reason, "自动同步设置未保存"));
    } finally {
      setPauseSaving(false);
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
      setSourceControlMessage(receipt.excluded ? `${sourceLabel(source.host)} 已停止读取；已导入数据未删除。` : `${sourceLabel(source.host)} 已恢复读取；下次同步会重新纳入。`);
      refresh();
    } catch (reason: unknown) {
      setSourceControlError(safeUiError(reason, "来源读取控制未保存"));
    } finally {
      setSourceControlHost(null);
    }
  };

  useEffect(() => {
    refresh();
    refreshCustom();
    refreshBudget();
    refreshBilling();
    refreshData();
    refreshAbout();
    let active = true;
    let cleanups: Array<() => void> = [];
    Promise.all([listen("sync-status-updated", () => { if (active) { refresh(); refreshCustom(); refreshBudget(); refreshBilling(); refreshData(); refreshAbout(); } }), listen("usage-fold-updated", () => { if (active) { refresh(); refreshCustom(); refreshBudget(); refreshBilling(); refreshData(); refreshAbout(); } })]).then((unsubscribers) => {
      if (active) cleanups = unsubscribers;
      else unsubscribers.forEach((unsubscribe) => unsubscribe());
    });
    return () => { active = false; cleanups.forEach((unsubscribe) => unsubscribe()); };
  }, []);

  const attentionCount = useMemo(() => report?.sources.filter((source) => source.connection_state === "needs_attention").length ?? 0, [report]);

  return <>
    <section className="settings-page-header" aria-labelledby="settings-title">
      <div><p className="eyebrow">本机设置</p><h2 id="settings-title">数据源与本机配置</h2><p className="section-description">先查看数据源是否正常读取；本页只显示安全聚合，不展示绝对路径或原始错误。</p></div>
      <button className="button button-secondary" type="button" onClick={refresh} disabled={loading}>{loading ? "读取中…" : "重载"}</button>
    </section>

    <nav className="settings-section-nav" aria-label="设置分区"><a className="settings-section-nav-active" href="#settings-sources">数据源</a><a href="#settings-billing">计费与套餐</a><a href="#settings-budget">预算</a><a href="#settings-data">统计与数据</a><a href="#settings-about">关于与诊断</a></nav>

    <section className="settings-section" id="settings-sources" aria-labelledby="settings-sources-title">
      <div className="settings-section-heading"><div><p className="eyebrow">数据源</p><h3 id="settings-sources-title">来源健康</h3><p>每个工具独立显示读取状态；来源之间不合并计数。</p></div>{report && <span className={`status-pill status-pill-${attentionCount ? "warning" : "success"}`}>{attentionCount ? `${attentionCount} 个来源需要处理` : "来源状态正常"}</span>}</div>
      {error && <div className="error-banner" role="alert">来源状态暂不可用：{error}<button className="button button-secondary button-small" type="button" onClick={refresh}>重试</button></div>}
      <SettingsLoadingState loading={loading} hasData={Boolean(report)} title="来源状态" detail="只查询本机 authority，不会触发同步或读取额外路径。" />
      {report?.status === "unavailable" && <div className="settings-source-state"><strong>来源状态暂不可用</strong><span>本地 authority 无法读取；这不是“没有来源”，请修复数据库或重新同步后再试。</span></div>}
      {report?.status === "ok" && <div className="settings-source-list">{report.sources.length ? report.sources.map((source) => <SourceRow key={source.host} source={source} syncing={syncing} sourceControlHost={sourceControlHost} supportedHosts={sourceControls?.supported_hosts ?? []} onSync={runSync} onToggleExcluded={toggleSourceExcluded} />) : <div className="settings-source-state"><strong>没有可显示的来源</strong><span>来源注册表暂未返回任何工具。</span></div>}</div>}
      {sourceControlError && <div className="error-banner" role="alert">来源读取控制未保存：{sourceControlError}</div>}
      {sourceControlMessage && <p className="settings-sync-message" role="status" aria-live="polite">{sourceControlMessage}</p>}
      {report && <div className="settings-sync-summary"><span>上次同步：{syncLabel(report)}</span><span>{report.sync.paused === true ? "自动同步已暂停" : report.sync.paused === false ? "自动同步已开启" : "自动同步状态不可用"}</span>{report.sync.paused !== null && <button className="button button-secondary button-small" type="button" onClick={togglePause} disabled={pauseSaving}>{pauseSaving ? "保存中…" : report.sync.paused ? "恢复自动同步" : "暂停自动同步"}</button>} {syncMessage && <small role="status">{syncMessage}</small>}<small>停止读取只影响后续同步，不删除已导入数据；删除和计费归因仍保留在旧工作台。</small></div>}
    </section>

    <CustomSourceSection report={customReport} loading={customLoading} error={customError} onReload={refreshCustom} onSync={runSync} />

    <BillingSection report={billingReport} loading={billingLoading} error={billingError} onReload={refreshBilling} />

    <BudgetSection report={budgetReport} loading={budgetLoading} error={budgetError} onReload={refreshBudget} />

    <StatisticsDataSection report={dataReport} loading={dataLoading} error={dataError} onReload={refreshData} />

    <AboutSection report={aboutReport} loading={aboutLoading} error={aboutError} onReload={refreshAbout} />

    <section className="settings-placeholder" aria-label="其他设置迁移状态"><strong>高风险操作仍在旧工作台</strong><span>账单归因、导入删除和数据库恢复等会改变历史数据的操作仍保留在旧工作台，待单独完成回执与失败恢复验收。</span></section>
  </>;
}
