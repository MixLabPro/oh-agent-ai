import { StatusPill } from "../../components/ui/StatusPill";
import type { OverviewDetails, OverviewSnapshot, SummaryHostTokens } from "../../lib/tauri";

function tokensLabel(value: number | null): string {
  if (value == null) return "—";
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return String(value);
}

function moneyLabel(values: Record<string, number>): string {
  const entries = Object.entries(values);
  if (!entries.length) return "—";
  const [currency, amount] = entries[0];
  return `${currency === "CNY" ? "¥" : currency + " "}${amount.toFixed(2)}`;
}

function moneyDetail(values: Record<string, number>): string {
  const entries = Object.entries(values);
  if (!entries.length) return "暂无可计价数据";
  const remainder = entries.slice(1).map(([currency, amount]) => `${currency} ${amount.toFixed(2)}`);
  return remainder.length ? `另有 ${remainder.join(" · ")} · 不跨币种相加` : "按币种分栏";
}

function basisLabel(value: string): string {
  return ({ metered_actual: "按量实付", host_billed: "宿主账单", fixed_subscription: "订阅月费", metered_declared: "归因估算", metered_estimate: "默认估算", api_equivalent: "等价标价", other: "其他" } as Record<string, string>)[value] ?? value;
}

function basisLines(values: Record<string, Record<string, number>>): string {
  const lines = Object.entries(values).flatMap(([basis, currencies]) => Object.entries(currencies).map(([currency, amount]) => `${basisLabel(basis)} ${currency === "CNY" ? "¥" : `${currency} `}${amount.toFixed(2)}`));
  return lines.length ? lines.join(" · ") : "暂无可计入的真实支出";
}

function hostTokensLabel(value: SummaryHostTokens): string {
  return `${tokensLabel(value.total)} · 缓存命中 ${value.cache_hit_ratio == null ? "—" : `${(value.cache_hit_ratio * 100).toFixed(1)}%`}`;
}

function summaryState(value: "fresh" | "stale" | "partial" | "unavailable" | "unknown"): { label: string; tone: "success" | "warning" | "neutral" } {
  return ({ fresh: { label: "最新", tone: "success" }, stale: { label: "数据过期", tone: "warning" }, partial: { label: "部分覆盖", tone: "warning" }, unavailable: { label: "不可用", tone: "neutral" }, unknown: { label: "状态未知", tone: "neutral" } } as const)[value];
}

function summaryTokens(value: { freshness: "fresh" | "stale" | "partial" | "unavailable" | "unknown"; total_tokens: number } | null): string {
  return value && value.freshness !== "unavailable" && value.freshness !== "unknown" ? `${tokensLabel(value.total_tokens)} tokens` : "—";
}

function summaryFreshnessNote(value: { freshness: "fresh" | "stale" | "partial" | "unavailable" | "unknown"; last_observed_at: string | null }): string {
  if (value.freshness === "stale") return ` · 最后观测 ${value.last_observed_at?.slice(0, 10) ?? "未知"}`;
  if (value.freshness === "partial") return " · 仅部分字段有观测";
  return "";
}

function budgetStatusLabel(level: string): string {
  return ({ no_budget: "未设置", ok: "正常", warn: "接近预算", over: "已超预算", snoozed: "提醒已静默", disabled: "已关闭" } as Record<string, string>)[level] ?? "暂不可读";
}

function hostStatusLabel(status: OverviewSnapshot["host_rows"][number]["status"]): string {
  return ({ ready: "可用", partial: "部分覆盖", unavailable: "不可用" } as Record<typeof status, string>)[status];
}

function StatCard({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <article className="stat-card">
    <p className="eyebrow">{label}</p>
    <p className={`stat-value ${value.length > 10 ? "stat-value-compact" : ""}`}>{value}</p>
    <p className="stat-detail">{detail}</p>
  </article>;
}

export function OverviewPage({ overview, details }: { overview: OverviewSnapshot | null; details: OverviewDetails | null }) {
  if (!overview) return <section className="empty-state" aria-live="polite"><p className="eyebrow">正在读取</p><h2>准备工作台数据</h2><p>正在通过本地 IPC 获取状态。</p></section>;
  const budgetTone = overview.budget.level === "over" ? "warning" : overview.budget.level === "warn" ? "warning" : overview.budget.level === "ok" ? "success" : "neutral";
  return <>
    {details?.errors.length ? <div className="error-banner" role="status">部分总览数据不可用：{details.errors.join("；")}。已保留可用分区，未用 0 代替未知。</div> : null}
    <section className="hero-panel">
      <div>
        <p className="eyebrow">本地工作台 · 数据概览</p>
        <h2>把运行状态变成可理解的证据</h2>
        <p className="hero-copy">数据来自本机 authority；React 只呈现安全投影，不读取原始日志、路径或工作区内容。</p>
      </div>
      <StatusPill tone={overview.sync.ok ? "success" : "warning"}>{overview.sync.ok ? "本地同步正常" : "同步状态需检查"}</StatusPill>
    </section>
    <section className="stats-grid" aria-label="工作台状态">
      <StatCard label="今日消耗" value={tokensLabel(overview.today_tokens)} detail={overview.today_tokens == null ? "暂无今日权威数据" : "tokens · 含缓存读写"} />
      <StatCard label="今日费用" value={moneyLabel(overview.today_spend)} detail={moneyDetail(overview.today_spend)} />
      <StatCard label="本月费用" value={moneyLabel(overview.month_spend)} detail={moneyDetail(overview.month_spend)} />
      <StatCard label="已覆盖宿主" value={overview.hosts == null ? "—" : String(overview.hosts)} detail={overview.hosts == null ? "覆盖数据不可用" : "本机已发现的 Agent"} />
    </section>
    <section className="overview-detail-grid" aria-label="月度和今日权威汇总">
      <section className="info-panel overview-panel">
        <div><p className="eyebrow">月度权威汇总 · {details?.monthly?.month ?? details?.month ?? "—"}</p><h3>{summaryTokens(details?.monthly ?? null)}</h3><p className="overview-panel-copy">{details?.monthly && details.monthly.freshness !== "unavailable" && details.monthly.freshness !== "unknown" ? `${basisLines(details.monthly.spend_by_basis)}${details.monthly.has_unresolved ? " · 存在未解析项" : ""}${summaryFreshnessNote(details.monthly)}` : "月度汇总不可用；未用 0 代替未知"}</p></div>
        {(() => { const state = summaryState(details?.monthly?.freshness ?? "unavailable"); return <StatusPill tone={state.tone}>{details?.monthly ? `${state.label} · ${details.monthly.coverage.measured_fields}/${details.monthly.coverage.total_fields}` : state.label}</StatusPill>; })()}
      </section>
      <section className="info-panel overview-panel">
        <div><p className="eyebrow">今日权威汇总 · {details?.date ?? "—"}</p><h3>{summaryTokens(details?.daily ?? null)}</h3><p className="overview-panel-copy">{details?.daily && details.daily.freshness !== "unavailable" && details.daily.freshness !== "unknown" ? `${basisLines(details.daily.spend_by_basis)}${details.daily.has_unresolved ? " · 存在未解析项" : ""}${summaryFreshnessNote(details.daily)}` : "今日汇总不可用；请检查来源状态"}</p></div>
        {(() => { const state = summaryState(details?.daily?.freshness ?? "unavailable"); return <StatusPill tone={state.tone}>{details?.daily ? `${state.label} · ${details.daily.coverage.measured_fields}/${details.daily.coverage.total_fields}` : state.label}</StatusPill>; })()}
      </section>
    </section>
    {details?.monthly && details.monthly.freshness !== "unavailable" && details.monthly.freshness !== "unknown" && <section className="overview-host-panel" aria-labelledby="overview-month-host-title">
      <div className="section-heading"><div><p className="eyebrow">月度宿主拆分</p><h3 id="overview-month-host-title">tokens_by_host</h3></div><span className="count-badge">{Object.keys(details.monthly.tokens_by_host).length} 宿主</span></div>
      <div className="overview-host-list">{Object.entries(details.monthly.tokens_by_host).map(([host, tokens]) => <article className="overview-host-row" key={host}><div><strong>{host}</strong><span>{hostTokensLabel(tokens)}</span></div><b>{tokens.total ? tokensLabel(tokens.total) : "—"} token</b></article>)}</div>
      <p className="overview-empty">币种和账单口径仅按 basis 分栏；估算、订阅和等价标价不会跨币种相加。</p>
    </section>}
    {details?.calendar && <section className="info-panel overview-recent-panel" aria-labelledby="overview-recent-title">
      <div className="section-heading"><div><p className="eyebrow">最近观测日</p><h3 id="overview-recent-title">{details.calendar.month}</h3></div><span className="count-badge">{details.calendar.days.length} 天</span></div>
      <div className="overview-recent-list">{details.calendar.days.slice(-5).reverse().map((day) => <div className="overview-recent-row" key={day.date}><span>{day.date}</span><strong>{tokensLabel(day.total_tokens)} tokens</strong><small>{moneyDetail(day.costs)}</small></div>)}</div>
    </section>}
    <div className="overview-detail-grid">
      <section className="info-panel overview-panel" aria-labelledby="overview-budget-title">
        <div><p className="eyebrow">预算</p><h3 id="overview-budget-title">本月预算状态</h3><p className="overview-panel-copy">{overview.budget.month_cost == null || overview.budget.monthly_cny == null ? "尚无可计入的本月金额" : `已用 ¥${overview.budget.month_cost.toFixed(2)} / ¥${overview.budget.monthly_cny.toFixed(2)}`}</p></div>
        <StatusPill tone={budgetTone}>{budgetStatusLabel(overview.budget.level)}</StatusPill>
      </section>
      <section className="info-panel overview-panel" aria-labelledby="overview-sync-title">
        <div><p className="eyebrow">数据新鲜度</p><h3 id="overview-sync-title">{overview.freshness}</h3><p className="overview-panel-copy">同步阶段：{overview.sync.stage} · 订阅月费：{overview.subscription_cny_month == null ? "—" : `¥${overview.subscription_cny_month.toFixed(2)}`}</p></div>
        <button className="button button-secondary" type="button" onClick={() => { window.location.hash = "trust"; }}>查看 Trust</button>
      </section>
    </div>
    <section className="overview-host-panel" aria-labelledby="overview-host-title">
      <div className="section-heading"><div><p className="eyebrow">宿主覆盖</p><h3 id="overview-host-title">本机 Agent 状态</h3></div><span className="count-badge">{overview.host_rows.length ? overview.host_rows.length : overview.hosts == null ? "—" : overview.hosts}</span></div>
      {overview.host_rows.length ? <div className="overview-host-list">{overview.host_rows.map((host) => <article className="overview-host-row" key={host.host}><div><strong>{host.host}</strong><span>{host.today_sessions == null ? "会话不可用" : `${host.today_sessions} 个会话`} · {hostStatusLabel(host.status)}</span></div><b>{tokensLabel(host.today_tokens)} token</b></article>)}</div> : <p className="overview-empty">宿主快照尚未生成。没有快照不等于没有宿主，打开 Trust 可重新发现。</p>}
    </section>
  </>;
}
