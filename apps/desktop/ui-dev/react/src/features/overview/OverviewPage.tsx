import { hostName } from "../../lib/hostNames";
import { useEffect, useState } from "react";
import { StatusPill } from "../../components/ui/StatusPill";
import { readFindings, readUsageHourly, type FindingGroup, type OverviewDetails, type OverviewSnapshot, type SummaryHostTokens, type UsageHourly } from "../../lib/tauri";
import { sessionsDateHref, sessionsHostHref } from "../../lib/nav";
import { todayCacheHitRatio } from "./cacheHit";
import { monthSpendCard, todaySpendCard } from "./spendCards";
import { DecisionArea } from "./DecisionArea";
import { formatMajorMoney, message, useLanguage, type MessageKey, formatTokenCount } from "../../lib/i18n";

function tokensLabel(value: number | null): string {
  if (value == null) return "—";
  return formatTokenCount(value);
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
 * OVERVIEW_TREND_PANEL spec v1.1 §4：今日逐小时用量分布（24 列，DSH /
 * Claude Code / Codex 三段堆叠，token 高度）+ 失败小时标记。小时 token 复用
 * 用量页同一条 read_hourly_distribution 命令；失败小时来自 overview 快照的
 * failure_hours（同一 revision 括号）。不放金额（r6）。
 * 降级：failure_hours 为 null → 柱照画、图例处标「失败标记不可用」；小时数据
 * 读不到 → 诚实说不可用；有失败但零 token 的小时保留标记（没用量≠没失败）。
 */
function TrendPanel({ details }: { details: OverviewDetails }) {
  const language = useLanguage();
  const [hourly, setHourly] = useState<UsageHourly | null>(null);
  const [hourlyState, setHourlyState] = useState<"loading" | "ok" | "unavailable">("loading");
  const failureHours = details.failure_hours;
  useEffect(() => {
    let active = true;
    setHourlyState("loading");
    void readUsageHourly(details.date)
      .then((value) => { if (active) { setHourly(value); setHourlyState("ok"); } })
      .catch(() => { if (active) setHourlyState("unavailable"); });
    return () => { active = false; };
  }, [details.date]);
  const hourByIndex = new Map((hourly?.hours ?? []).map((hour) => [hour.hour, hour]));
  const hourTotal = (index: number) => {
    const hour = hourByIndex.get(index);
    return (hour?.dsh_tokens ?? 0) + (hour?.claude_tokens ?? 0) + (hour?.codex_tokens ?? 0);
  };
  const totals = Array.from({ length: 24 }, (_, index) => hourTotal(index));
  const maxTokens = Math.max(1, ...totals);
  const hasUsage = totals.some((total) => total > 0);
  const hasFailures = failureHours != null && Object.keys(failureHours).length > 0;
  return <section className="info-panel overview-trend" aria-labelledby="overview-trend-title">
    <div className="section-heading">
      <div><p className="eyebrow">{message("overview.trendTitle", language)}</p><h3 id="overview-trend-title">{details.date}</h3></div>
      <div className="overview-trend-legend">
        <span><i className="trend-seg-dsh" aria-hidden="true" />DSH</span>
        <span><i className="trend-seg-claude" aria-hidden="true" />Claude Code</span>
        <span><i className="trend-seg-codex" aria-hidden="true" />Codex</span>
        <span><i className="trend-flag" aria-hidden="true" />{message("overview.trendFailureLegend", language)}</span>
        {failureHours == null && <span className="overview-trend-unavailable">{message("overview.trendFailureUnavailable", language)}</span>}
      </div>
    </div>
    {hourlyState === "unavailable" ? <p className="overview-empty">{message("overview.trendHourlyUnavailable", language)}</p> : <>
      <div className="overview-trend-chart">
        {totals.map((total, hour) => {
          const row = hourByIndex.get(hour);
          const failures = failureHours?.[String(hour)] ?? 0;
          const failuresText = failures > 0 ? message("overview.trendDayFailures", language, { count: failures }) : "";
          const aria = message("overview.trendDayAria", language, { hour: String(hour).padStart(2, "0"), tokens: tokensLabel(total), failures: failuresText });
          const showLabel = hour % 6 === 0 || hour === 23;
          return <a key={hour} className="overview-trend-col" href={sessionsDateHref(details.date)} aria-label={aria} title={aria}>
            <span className={`overview-trend-bar ${total > 0 ? "" : "overview-trend-bar-empty"}`} style={{ height: total > 0 ? `${Math.max(5, Math.round((total / maxTokens) * 100))}%` : "2px" }}>
              {row ? <>
                <i className="trend-seg-codex" style={{ flexGrow: Math.max(row.codex_tokens ?? 0, 0.001) }} />
                <i className="trend-seg-claude" style={{ flexGrow: Math.max(row.claude_tokens ?? 0, 0.001) }} />
                <i className="trend-seg-dsh" style={{ flexGrow: Math.max(row.dsh_tokens ?? 0, 0.001) }} />
              </> : null}
            </span>
            {failures > 0 ? <span className="trend-flag" aria-hidden="true" /> : null}
            <small aria-hidden="true">{showLabel ? String(hour).padStart(2, "0") : ""}</small>
          </a>;
        })}
      </div>
      {!hasUsage && !hasFailures && <p className="overview-empty">{message("overview.trendEmpty", language)}</p>}
      <p className="overview-trend-note">{message("overview.trendNote", language)}</p>
    </>}
  </section>;
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
            <small>{hostName(item.host)} · {message("overview.findingCounts", undefined, { cases: item.count, sessions: item.sessions_count })}</small>
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
    {details && <TrendPanel details={details} />}
    <section className="overview-detail-grid" aria-label={message("overview.authoritativeSummaries", language)}>
      <section className="info-panel overview-panel">
        <div><p className="eyebrow">{message("overview.monthlySummary", language, { month: details?.monthly?.month ?? details?.month ?? "—" })}</p><h3>{summaryTokens(details?.monthly ?? null)}</h3><p className="overview-panel-copy">{details?.monthly && details.monthly.freshness !== "unavailable" && details.monthly.freshness !== "unknown" ? `${basisLines(details.monthly.spend_by_basis)}${details.monthly.has_unresolved ? ` · ${message("overview.unresolved", language)}` : ""}${summaryFreshnessNote(details.monthly)}` : message("overview.monthlyUnavailable", language)}</p></div>
        {(() => { const state = summaryState(details?.monthly?.freshness ?? "unavailable"); return <StatusPill tone={state.tone}>{details?.monthly ? `${state.label} · ${details.monthly.coverage.measured_fields}/${details.monthly.coverage.total_fields}` : state.label}</StatusPill>; })()}
      </section>
      <section className="info-panel overview-panel">
        <div><p className="eyebrow">{message("overview.dailySummary", language, { date: details?.date ?? "—" })}</p><h3>{summaryTokens(details?.daily ?? null)}</h3><p className="overview-panel-copy">{details?.daily && details.daily.freshness !== "unavailable" && details.daily.freshness !== "unknown" ? `${basisLines(details.daily.spend_by_basis)}${Object.keys(details.monthly?.spend_by_basis.fixed_subscription ?? {}).length ? ` · ${message("overview.dailyAllocNote", language)}` : ""}${details.daily.has_unresolved ? ` · ${message("overview.unresolved", language)}` : ""}${summaryFreshnessNote(details.daily)}` : message("overview.dailyUnavailable", language)}</p></div>
        {(() => { const state = summaryState(details?.daily?.freshness ?? "unavailable"); return <StatusPill tone={state.tone}>{details?.daily ? `${state.label} · ${details.daily.coverage.measured_fields}/${details.daily.coverage.total_fields}` : state.label}</StatusPill>; })()}
      </section>
    </section>
    {details?.monthly && details.monthly.freshness !== "unavailable" && details.monthly.freshness !== "unknown" && <section className="overview-host-panel" aria-labelledby="overview-month-host-title">
      <div className="section-heading"><div><p className="eyebrow">{message("overview.hostBreakdown", language)}</p><h3 id="overview-month-host-title">{message("overview.hostTokens", language)}</h3></div><span className="count-badge">{message("overview.hostCount", language, { count: Object.values(details.monthly.tokens_by_host).filter((host) => host.total > 0).length })}</span></div>
      <div className="overview-host-list">{Object.entries(details.monthly.tokens_by_host).filter(([, tokens]) => tokens.total > 0).map(([host, tokens]) => <article className="overview-host-row" key={host}><div><strong>{hostName(host)}</strong><span>{hostTokensLabel(tokens)}</span></div><b>{message("overview.tokensValue", language, { value: tokensLabel(tokens.total) })}</b></article>)}</div>
      {Object.values(details.monthly.tokens_by_host).some((host) => host.total === 0) && <p className="overview-empty">{message("overview.hostsNoUsage", language, { hosts: Object.entries(details.monthly.tokens_by_host).filter(([, tokens]) => tokens.total === 0).map(([host]) => host).join(", ") })}</p>}
      <p className="overview-empty">{message("overview.costScope", language)}</p>
    </section>}
    <DecisionArea monthly={details?.monthly ?? null} />
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
      {overview.host_rows.length ? <div className="overview-host-list">{overview.host_rows.map((host) => <a className="overview-host-row overview-drill" key={host.host} href={sessionsHostHref(host.host)} title={message("overview.openHost", language, { host: hostName(host.host) })}><div><strong>{hostName(host.host)}</strong><span>{host.today_sessions == null ? message("overview.hostSessionsUnavailable", language) : message("count.sessions", language, { count: host.today_sessions })} · {hostStatusLabel(host.status)}</span></div><b>{tokensLabel(host.today_tokens)} token</b></a>)}</div> : <p className="overview-empty">{message("overview.hostSnapshotMissing", language)}</p>}
    </section>
  </>;
}
