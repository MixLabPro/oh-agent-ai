import { useEffect, useMemo, useRef, useState } from "react";
import { readRouteQuality, safeUiError, type RouteQualityFamily, type RouteQualityHost, type RouteQualityReport } from "../../lib/tauri";
import { ToolbarActions } from "../../components/ui/ToolbarActions";
import { message, resolvedLanguage, useLanguage, type MessageKey } from "../../lib/i18n";

const tx = (key: MessageKey, params: Record<string, string | number> = {}): string => message(key, resolvedLanguage(), params);
const isEn = (): boolean => resolvedLanguage() === "en";

const windows: Array<{ value: 30 | 90 | 365; key: MessageKey }> = [
  { value: 30, key: "qt.w30" },
  { value: 90, key: "qt.w90" },
  { value: 365, key: "qt.w365" },
];
const windowLabel = (value: number): string | undefined => { const found = windows.find((item) => item.value === value); return found ? tx(found.key) : undefined; };

const familyKeys: Partial<Record<RouteQualityFamily["family"], MessageKey>> = { anthropic: "qt.fAnthropic", openai: "qt.fOpenai", synthetic: "qt.fSynthetic", unknown: "qt.fUnknown" };
const familyBrand: Partial<Record<RouteQualityFamily["family"], string>> = { deepseek: "DeepSeek", glm: "GLM", minimax: "MiniMax", gemini: "Gemini", qwen: "Qwen" };
const familyLabel = (family: RouteQualityFamily["family"]): string => (familyKeys[family] ? tx(familyKeys[family] as MessageKey) : familyBrand[family] ?? family);

const flagKeys: Record<RouteQualityFamily["flag"], MessageKey> = { native: "qt.native", non_native: "qt.nonNative", api_error: "qt.apiError", no_baseline: "qt.noBaseline" };

function compact(value: number): string {
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1)}B`;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return String(value);
}

function observedAt(value: number): string {
  if (!value) return tx("qt.timeNA");
  return new Date(value).toLocaleString(isEn() ? "en-US" : "zh-CN", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function reportWindow(report: RouteQualityReport): string {
  return tx("qt.range", { from: observedAt(report.since_ms), to: observedAt(report.now_ms) });
}

function familyTone(family: RouteQualityFamily["flag"]): "success" | "warning" | "neutral" {
  if (family === "non_native" || family === "api_error") return "warning";
  if (family === "native") return "success";
  return "neutral";
}

function hostSummary(host: RouteQualityHost): { title: string; copy: string; tone: "success" | "warning" | "neutral" } {
  const nonNative = host.families.filter((family) => family.flag === "non_native");
  const apiErrors = host.families.find((family) => family.flag === "api_error");
  if (!host.has_baseline) return { title: tx("qt.noBaseline"), copy: tx("qt.noBaselineCopy"), tone: "neutral" };
  if (nonNative.length) {
    const share = nonNative.reduce((sum, family) => sum + family.request_share, 0);
    return { title: tx("qt.nonNativeTitle", { share: share.toFixed(1) }), copy: tx("qt.nonNativeCopy"), tone: "warning" };
  }
  if (apiErrors && apiErrors.requests > 0) return { title: tx("qt.errTitle"), copy: tx("qt.errCopy"), tone: "warning" };
  return { title: tx("qt.allNativeTitle"), copy: tx("qt.allNativeCopy"), tone: "success" };
}

function FamilyRow({ family }: { family: RouteQualityFamily }) {
  const models = family.models.slice().sort((left, right) => right.requests - left.requests).slice(0, 3);
  return <tr>
    <td><strong>{familyLabel(family.family)}</strong><small>{family.family}</small></td>
    <td><span className={`test-quality-flag test-quality-flag-${familyTone(family.flag)}`}>{tx(flagKeys[family.flag])}</span></td>
    <td><strong>{family.request_share.toFixed(1)}%</strong><small>{tx("qt.requestsN", { n: family.requests })}</small></td>
    <td><strong>{family.sessions}</strong><small>{compact(family.tokens_total)} tokens</small></td>
    <td><div className="test-quality-models">{models.length ? models.map((model) => <span key={model.model}><code>{model.model}</code><small>{tx("qt.requestsN", { n: model.requests })}</small></span>) : <span>{tx("qt.modelsNA")}</span>}</div></td>
    <td className="test-quality-time">{observedAt(family.last_event_ms)}</td>
  </tr>;
}

function HostQualityPanel({ host }: { host: RouteQualityHost }) {
  const summary = hostSummary(host);
  return <section className="test-quality-host" aria-labelledby={`test-host-${host.host}`}>
    <div className="test-quality-host-heading">
      <div><p className="eyebrow">{tx("qt.hostModel")}</p><h3 id={`test-host-${host.host}`}>{host.host}</h3><p>{tx("qt.hostTotals", { requests: host.totals.requests, sessions: host.totals.sessions })}</p></div>
      <span className={`status-pill status-pill-${summary.tone}`}>{summary.title}</span>
    </div>
    <div className={`test-quality-notice test-quality-notice-${summary.tone}`}>
      <strong>{summary.title}</strong><span>{summary.copy}</span>
    </div>
    <div className="test-quality-table-wrap"><table className="test-quality-table"><thead><tr><th scope="col">{tx("qt.thFamily")}</th><th scope="col">{tx("qt.thVerdict")}</th><th scope="col">{tx("qt.thShare")}</th><th scope="col">{tx("qt.thSessions")}</th><th scope="col">{tx("qt.thModels")}</th><th scope="col">{tx("qt.thLast")}</th></tr></thead><tbody>{host.families.map((family) => <FamilyRow key={`${host.host}-${family.family}`} family={family} />)}</tbody></table></div>
  </section>;
}

export function TestPage() {
  useLanguage();
  const [days, setDays] = useState<30 | 90 | 365>(90);
  const [report, setReport] = useState<RouteQualityReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const generation = useRef(0);

  const refresh = () => {
    const current = ++generation.current;
    setLoading(true);
    setError(null);
    void readRouteQuality(days).then((next) => {
      if (current !== generation.current) return;
      setReport(next);
    }).catch((reason: unknown) => {
      if (current !== generation.current) return;
      setError(safeUiError(reason, tx("qt.unavailable")));
    }).finally(() => {
      if (current === generation.current) setLoading(false);
    });
  };

  useEffect(() => { refresh(); }, [days]);

  const totals = useMemo(() => {
    const hosts = report?.hosts ?? [];
    return hosts.reduce((acc, host) => {
      acc.requests += host.totals.requests;
      acc.sessions += host.totals.sessions;
      acc.nonNative += host.families.filter((family) => family.flag === "non_native").reduce((sum, family) => sum + family.requests, 0);
      acc.apiErrors += host.families.filter((family) => family.flag === "api_error").reduce((sum, family) => sum + family.requests, 0);
      return acc;
    }, { requests: 0, sessions: 0, nonNative: 0, apiErrors: 0 });
  }, [report]);

  return <>
    <h2 id="test-page-title" className="visually-hidden">{tx("qt.pageTitle")}</h2>
    <ToolbarActions>
      <div className="test-header-actions"><label className="test-window-field"><span>{tx("qt.window")}</span><select value={days} onChange={(event) => setDays(Number(event.target.value) as 30 | 90 | 365)}>{windows.map((window) => <option key={window.value} value={window.value}>{tx(window.key)}</option>)}</select></label><button className="button button-secondary" type="button" onClick={refresh} disabled={loading}>{loading ? tx("qt.loading") : tx("qt.reload")}</button></div>
    </ToolbarActions>

    <section className="test-evidence-callout" aria-label={tx("qt.boundaryAria")}>
      <div><p className="eyebrow">{tx("qt.boundary")}</p><h3>{tx("qt.boundaryTitle")}</h3><p>{tx("qt.boundaryBody")}</p></div>
      <span className="status-pill status-pill-success"><span aria-hidden="true" className="status-dot" />{tx("qt.readOnly")}</span>
    </section>

    <section className="test-summary-grid" aria-label={tx("qt.summaryAria")}>
      <article><span>{tx("qt.coveredHosts")}</span><strong>{report ? report.hosts.length : "—"}</strong><small>{tx("qt.coveredHostsNote")}</small></article>
      <article><span>{tx("qt.requests")}</span><strong>{report ? totals.requests : "—"}</strong><small>{tx("qt.requestsNote")}</small></article>
      <article><span>{tx("qt.nonNativeReq")}</span><strong className={totals.nonNative ? "test-value-warning" : ""}>{report ? totals.nonNative : "—"}</strong><small>{tx("qt.nonNativeNote")}</small></article>
      <article><span>{tx("qt.apiErrors")}</span><strong className={totals.apiErrors ? "test-value-warning" : ""}>{report ? totals.apiErrors : "—"}</strong><small>{tx("qt.apiErrorsNote")}</small></article>
    </section>

    {error && <div className="error-banner" role="alert">{tx("qt.reportUnavailable", { error })}<button className="button button-secondary button-small" type="button" onClick={refresh}>{tx("qt.retry")}</button></div>}
    {loading && report && <div className="usage-refresh-status" role="status">{tx("qt.refreshing", { window: windowLabel(days) ?? "", range: reportWindow(report) })}</div>}
    {!loading && error && report && <div className="usage-refresh-status trust-refresh-status-error" role="status">{tx("qt.refreshIncomplete", { range: reportWindow(report) })}</div>}
    {loading && !report && <section className="test-state" role="status"><strong>{tx("qt.reading")}</strong><p>{tx("qt.readingNote")}</p></section>}
    {!loading && !error && report && report.hosts.length === 0 && <section className="test-state"><strong>{tx("qt.noFacts")}</strong><p>{tx("qt.noFactsNote")}</p></section>}
    {report && report.hosts.length > 0 && <div className="test-quality-list" aria-label={loading || error ? tx("qt.prevResultAria") : tx("qt.resultAria")} aria-busy={loading || undefined}>{report.hosts.map((host) => <HostQualityPanel key={host.host} host={host} />)}</div>}
    <p className="test-quality-foot">{tx("qt.foot", { window: windowLabel(days) ?? "", range: report ? tx("qt.footRange", { range: reportWindow(report) }) : tx("qt.notRead") })}</p>
  </>;
}
