import { useEffect, useState } from "react";
import { StatusPill } from "../../components/ui/StatusPill";
import { readFindings, type FindingGroup, type OverviewDetails, type OverviewSnapshot, type SummaryHostTokens } from "../../lib/tauri";
import { sessionsDateHref, sessionsHostHref } from "../../lib/nav";
import { todayCacheHitRatio } from "./cacheHit";
import { monthSpendCard, todaySpendCard } from "./spendCards";
import { formatMajorMoney, message, useLanguage, type MessageKey } from "../../lib/i18n";

function tokensLabel(value: number | null): string {
  if (value == null) return "—";
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return String(value);
}

function moneyDetail(values: Record<string, number>): string {
  const entries = Object.entries(values);
  if (!entries.length) return message("overview.noPricedData");
  const remainder = entries.slice(1).map(([currency, amount]) => formatMajorMoney(amount, currency));
  return remainder.length ? message("overview.otherCurrencies", undefined, { amounts: remainder.join(" · ") }) : message("overview.separateCurrencies");
}

function basisLabel(value: string): string {
  const key = `overview.basis.${value}` as MessageKey;
  return ["metered_actual", "host_billed", "fixed_subscription", "metered_declared", "metered_estimate", "api_equivalent", "other"].includes(value) ? message(key) : value;
}

function basisLines(values: Record<string, Record<string, number>>): string {
  const lines = Object.entries(values).flatMap(([basis, currencies]) => Object.entries(currencies).map(([currency, amount]) => `${basisLabel(basis)} ${formatMajorMoney(amount, currency)}`));
  return lines.length ? lines.join(" · ") : message("overview.noActualSpend");
}

function hostTokensLabel(value: SummaryHostTokens): string {
  return `${tokensLabel(value.total)} · ${message("overview.cacheHit", undefined, { ratio: value.cache_hit_ratio == null ? "—" : (value.cache_hit_ratio * 100).toFixed(1) })}`;
}

function summaryState(value: "fresh" | "stale" | "partial" | "unavailable" | "unknown"): { label: string; tone: "success" | "warning" | "neutral" } {
  const tone = value === "fresh" ? "success" : value === "stale" || value === "partial" ? "warning" : "neutral";
  return { label: message(`overview.${value}` as MessageKey), tone };
}

function summaryTokens(value: { freshness: "fresh" | "stale" | "partial" | "unavailable" | "unknown"; total_tokens: number } | null): string {
  return value && value.freshness !== "unavailable" && value.freshness !== "unknown" ? `${tokensLabel(value.total_tokens)} tokens` : "—";
}

function summaryFreshnessNote(value: { freshness: "fresh" | "stale" | "partial" | "unavailable" | "unknown"; last_observed_at: string | null }): string {
  if (value.freshness === "stale") return ` · ${message("overview.staleObserved", undefined, { date: value.last_observed_at?.slice(0, 10) ?? "—" })}`;
  if (value.freshness === "partial") return ` · ${message("overview.partialObserved")}`;
  return "";
}

function budgetStatusLabel(level: string): string {
  const known = ["no_budget", "ok", "warn", "over", "snoozed", "disabled"].includes(level) ? level : "unknown";
  return message(`overview.budget.${known}` as MessageKey);
}

function hostStatusLabel(status: OverviewSnapshot["host_rows"][number]["status"]): string {
  return message(`overview.host.${status}` as MessageKey);
}

function syncStageLabel(stage: string): string {
  const known = ["complete", "fold", "discover", "resolve", "never", "paused", "partial", "light", "control", "facts"].includes(stage) ? stage : "unknown";
  return message(`overview.sync.${known}` as MessageKey);
}

function StatCard({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <article className="stat-card">
    <p className="eyebrow">{label}</p>
    <p className={`stat-value ${value.length > 10 ? "stat-value-compact" : ""}`}>{value}</p>
    <p className="stat-detail">{detail}</p>
  </article>;
}


/**
 * R2（OVERVIEW_DRILLDOWN spec §4.3）：总览内嵌发现条——画布首发承诺
 * 「发现作为相关页面中的事项呈现」的落地。只读 findings_groups_safe 的
 * 既有脱敏投影（零新载荷字段），top 3；每项给「去看证据」的可达路径
 * （宿主会话深链）。两态诚实降级：服务不可用如实说，零发现是诚实空态。
 */
function OverviewFindingsStrip() {
  const [state, setState] = useState<"loading" | "ok" | "unavailable">("loading");
  const [items, setItems] = useState<FindingGroup[]>([]);
  useEffect(() => {
    let active = true;
    void readFindings(null)
      .then((report) => { if (active) { setItems(report.issues.slice(0, 3)); setState("ok"); } })
      .catch(() => { if (active) setState("unavailable"); });
    return () => { active = false; };
  }, []);
  if (state === "loading") return null;
  if (state === "unavailable") {
    return <section className="info-panel overview-findings" aria-labelledby="overview-findings-title"><p id="overview-findings-title" className="overview-findings-note">{message("overview.findingsUnavailable")}</p></section>;
  }
  if (items.length === 0) {
    return <section className="info-panel overview-findings" aria-labelledby="overview-findings-title"><p id="overview-findings-title" className="overview-findings-note">{message("overview.findingsEmpty")}</p></section>;
  }
  return (
    <section className="info-panel overview-findings" aria-labelledby="overview-findings-title">
      <div className="section-heading"><p className="eyebrow">{message("overview.findings")}</p><h3 id="overview-findings-title">{message("overview.attention")}</h3></div>
      <ul className="overview-findings-list">
        {items.map((item) => (
          <li key={item.group_id} className={`overview-finding severity-${item.severity}`}>
            <span className="finding-rule">{item.rule}</span>
            <small>{item.host} · {message("overview.findingCounts", undefined, { cases: item.count, sessions: item.sessions_count })}</small>
            {item.sessions_count > 0 && item.host !== "generic" && item.host !== "all" && item.host
              ? <a className="inline-drill" href={sessionsHostHref(item.host)}>{message("overview.openSessions")} <span aria-hidden="true">→</span></a>
              : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function OverviewPage({ overview, details }: { overview: OverviewSnapshot | null; details: OverviewDetails | null }) {
  const language = useLanguage();
  if (!overview) return <section className="empty-state" aria-live="polite"><p className="eyebrow">{message("overview.loading", language)}</p><h2>{message("overview.preparing", language)}</h2><p>{message("overview.loadingDetail", language)}</p></section>;
  const budgetTone = overview.budget.level === "over" ? "warning" : overview.budget.level === "warn" ? "warning" : overview.budget.level === "ok" ? "success" : "neutral";
  const measuredHosts = details?.monthly && details.monthly.freshness !== "unavailable" && details.monthly.freshness !== "unknown"
    ? Object.values(details.monthly.tokens_by_host).filter((host) => host.total > 0).length : null;
  const cacheHit = todayCacheHitRatio(details?.daily ?? null);
  const todaySpend = todaySpendCard(details?.daily ?? null, details?.monthly ?? null);
  const monthSpend = monthSpendCard(details?.monthly ?? null);
  return <>
    {details?.errors.length ? <div className="error-banner" role="status">{message("overview.partialError", language, { errors: details.errors.join("; ") })}</div> : null}
    <section className="stats-grid" aria-label={message("overview.status", language)}>
      <StatCard label={message("overview.todayTokens", language)} value={tokensLabel(overview.today_tokens)} detail={overview.today_tokens == null ? message("overview.noToday", language) : cacheHit == null ? message("overview.noCacheRatio", language) : message("overview.cacheRatio", language, { ratio: (cacheHit * 100).toFixed(2) })} />
      <StatCard label={message("overview.todayCost", language)} value={todaySpend.value} detail={todaySpend.detail} />
      <StatCard label={message("overview.monthSpend", language)} value={monthSpend.value} detail={monthSpend.detail} />
      <StatCard label={message("overview.activeHosts", language)} value={measuredHosts == null ? "—" : String(measuredHosts)} detail={measuredHosts == null ? message("overview.noMonthlyCoverage", language) : message("overview.hostsObserved", language)} />
    </section>
    <section className="overview-detail-grid" aria-label={message("overview.authoritativeSummaries", language)}>
      <section className="info-panel overview-panel">
        <div><p className="eyebrow">{message("overview.monthlySummary", language, { month: details?.monthly?.month ?? details?.month ?? "—" })}</p><h3>{summaryTokens(details?.monthly ?? null)}</h3><p className="overview-panel-copy">{details?.monthly && details.monthly.freshness !== "unavailable" && details.monthly.freshness !== "unknown" ? `${basisLines(details.monthly.spend_by_basis)}${details.monthly.has_unresolved ? ` · ${message("overview.unresolved", language)}` : ""}${summaryFreshnessNote(details.monthly)}` : message("overview.monthlyUnavailable", language)}</p></div>
        {(() => { const state = summaryState(details?.monthly?.freshness ?? "unavailable"); return <StatusPill tone={state.tone}>{details?.monthly ? `${state.label} · ${details.monthly.coverage.measured_fields}/${details.monthly.coverage.total_fields}` : state.label}</StatusPill>; })()}
      </section>
      <section className="info-panel overview-panel">
        <div><p className="eyebrow">{message("overview.dailySummary", language, { date: details?.date ?? "—" })}</p><h3>{summaryTokens(details?.daily ?? null)}</h3><p className="overview-panel-copy">{details?.daily && details.daily.freshness !== "unavailable" && details.daily.freshness !== "unknown" ? `${basisLines(details.daily.spend_by_basis)}${details.daily.has_unresolved ? ` · ${message("overview.unresolved", language)}` : ""}${summaryFreshnessNote(details.daily)}` : message("overview.dailyUnavailable", language)}</p></div>
        {(() => { const state = summaryState(details?.daily?.freshness ?? "unavailable"); return <StatusPill tone={state.tone}>{details?.daily ? `${state.label} · ${details.daily.coverage.measured_fields}/${details.daily.coverage.total_fields}` : state.label}</StatusPill>; })()}
      </section>
    </section>
    {details?.monthly && details.monthly.freshness !== "unavailable" && details.monthly.freshness !== "unknown" && <section className="overview-host-panel" aria-labelledby="overview-month-host-title">
      <div className="section-heading"><div><p className="eyebrow">{message("overview.hostBreakdown", language)}</p><h3 id="overview-month-host-title">tokens_by_host</h3></div><span className="count-badge">{message("overview.hostCount", language, { count: Object.keys(details.monthly.tokens_by_host).length })}</span></div>
      <div className="overview-host-list">{Object.entries(details.monthly.tokens_by_host).map(([host, tokens]) => <article className="overview-host-row" key={host}><div><strong>{host}</strong><span>{hostTokensLabel(tokens)}</span></div><b>{tokens.total ? tokensLabel(tokens.total) : "—"} token</b></article>)}</div>
      <p className="overview-empty">{message("overview.costScope", language)}</p>
    </section>}
    <OverviewFindingsStrip />
    {details?.calendar && <section className="info-panel overview-recent-panel" aria-labelledby="overview-recent-title">
      <div className="section-heading"><div><p className="eyebrow">{message("overview.recentDays", language)}</p><h3 id="overview-recent-title">{details.calendar.month}</h3></div><span className="count-badge">{message("count.days", language, { count: details.calendar.days.length })}</span></div>
      <div className="overview-recent-list">{details.calendar.days.slice(-5).reverse().map((day) => <a className="overview-recent-row overview-drill" key={day.date} href={sessionsDateHref(day.date)} title={message("overview.openDate", language, { date: day.date })}><span>{day.date}</span><strong>{tokensLabel(day.total_tokens)} tokens</strong><small>{moneyDetail(day.costs)}</small></a>)}</div>
    </section>}
    <div className="overview-detail-grid">
      <section className="info-panel overview-panel" aria-labelledby="overview-budget-title">
        <div><p className="eyebrow">{message("overview.budget", language)}</p><h3 id="overview-budget-title">{message("overview.monthBudget", language)}</h3><p className="overview-panel-copy">{overview.budget.month_cost == null || overview.budget.monthly_cny == null ? message("overview.noBudgetAmount", language) : message("overview.budgetUsed", language, { used: formatMajorMoney(overview.budget.month_cost, "CNY"), limit: formatMajorMoney(overview.budget.monthly_cny, "CNY") })}</p></div>
        <StatusPill tone={budgetTone}>{budgetStatusLabel(overview.budget.level)}</StatusPill>
      </section>
      <section className="info-panel overview-panel" aria-labelledby="overview-sync-title">
        <div><p className="eyebrow">{message("overview.dataFreshness", language)}</p><h3 id="overview-sync-title">{overview.freshness}</h3><p className="overview-panel-copy">{message("overview.syncStage", language, { stage: syncStageLabel(overview.sync.stage), amount: formatMajorMoney(overview.subscription_cny_month, "CNY") })}</p></div>
        <button className="button button-secondary" type="button" onClick={() => { window.location.hash = "trust"; }}>{message("overview.viewTrust", language)}</button>
      </section>
    </div>
    <section className="overview-host-panel" aria-labelledby="overview-host-title">
      <div className="section-heading"><div><p className="eyebrow">{message("overview.hostCoverage", language)}</p><h3 id="overview-host-title">{message("overview.localAgents", language)}</h3></div><span className="count-badge">{overview.host_rows.length ? overview.host_rows.length : overview.hosts == null ? "—" : overview.hosts}</span></div>
      {overview.host_rows.length ? <div className="overview-host-list">{overview.host_rows.map((host) => <a className="overview-host-row overview-drill" key={host.host} href={sessionsHostHref(host.host)} title={message("overview.openHost", language, { host: host.host })}><div><strong>{host.host}</strong><span>{host.today_sessions == null ? message("overview.hostSessionsUnavailable", language) : message("count.sessions", language, { count: host.today_sessions })} · {hostStatusLabel(host.status)}</span></div><b>{tokensLabel(host.today_tokens)} token</b></a>)}</div> : <p className="overview-empty">{message("overview.hostSnapshotMissing", language)}</p>}
    </section>
  </>;
}
