import { useEffect, useMemo, useRef, useState } from "react";
import {
  listenAppEvents,
  makeInvalidationGate,
  readUsageCalendar,
  readUsageHourly,
  readUsageSourceSummary,
  readStatisticsTimezone,
  safeUiError,
  type UsageCalendar,
  type UsageDay,
  type UsageHourly,
  type UsageSourceSummary,
} from "../../lib/tauri";

type Metric = "tokens" | "cost";

function currentMonth(timezone?: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit" }).format(new Date());
}

function todayDate(timezone?: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

function shiftMonth(month: string, delta: number): string {
  const [year, index] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year, index - 1 + delta, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function tokensLabel(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return String(value);
}

function costsLabel(costs: Record<string, number>): string {
  const parts = Object.entries(costs).filter(([, amount]) => amount > 0).map(([currency, amount]) => `${currency === "CNY" ? "¥" : `${currency} `}${amount.toFixed(2)}`);
  return parts.length ? parts.join(" · ") : "成本不可用";
}

function costLinesLabel(lines: UsageDay["cost_lines"]): string {
  const labels: Record<string, string> = { dsh: "DSH", claude: "Claude", codex: "Codex" };
  const bases: Record<string, string> = { metered_actual: "实付", metered_estimate: "估算", api_equivalent: "等价" };
  return lines.map((line) => `${labels[line.source]} ${line.currency === "CNY" ? "¥" : `${line.currency} `}${line.amount.toFixed(2)}（${bases[line.basis]}）`).join(" · ");
}

function spendBasisLabel(spend: UsageSourceSummary["spend_by_basis"]): string {
  const labels: Record<string, string> = { metered_actual: "按量实付", host_billed: "宿主账单", fixed_subscription: "订阅月费", metered_declared: "声明估算", metered_estimate: "默认估算", api_equivalent: "等价标价", other: "其他" };
  const lines = Object.entries(spend).flatMap(([basis, amounts]) => Object.entries(amounts).filter(([, amount]) => amount > 0).map(([currency, amount]) => `${labels[basis] ?? basis} ${currency === "CNY" ? "¥" : `${currency} `}${amount.toFixed(2)}`));
  return lines.length ? lines.join(" · ") : "无账单级金额";
}

function monthTitle(month: string): string {
  const [year, index] = month.split("-").map(Number);
  return `${year} 年 ${index} 月`;
}

function sourceLabel(value: string | null): string {
  return value ? "已入库事实" : "无小时数据";
}

function freshnessLabel(value: UsageSourceSummary["freshness"]): string {
  return ({ fresh: "新鲜", stale: "数据过期", partial: "部分覆盖", unavailable: "不可用", unknown: "状态未知" } as Record<string, string>)[value];
}

function dateParts(month: string): { leading: number; days: number } {
  const [year, index] = month.split("-").map(Number);
  return { leading: new Date(Date.UTC(year, index - 1, 1)).getUTCDay(), days: new Date(Date.UTC(year, index, 0)).getUTCDate() };
}

function dayFor(calendar: UsageCalendar | null, date: string): UsageDay | undefined {
  return calendar?.days.find((day) => day.date === date);
}

function dayTokens(day: UsageDay | undefined): number {
  return day?.total_tokens ?? 0;
}

function hostTokenLines(day: UsageDay | undefined): string {
  if (!day) return "无已观测宿主";
  const values: Array<[string, number]> = [["DSH", day.dsh_tokens], ["CC", day.claude_tokens], ["CX", day.codex_tokens]];
  const lines = values.filter(([, tokens]) => tokens > 0).map(([label, tokens]) => `${label} ${tokensLabel(tokens)}`);
  return lines.length ? lines.join(" · ") : "无已观测宿主";
}

function hostTotalLabel(value: number, total: number): string {
  if (total === 0) return "无已观测数据";
  return value > 0 ? tokensLabel(value) : "未观测";
}

function hourlyTotal(hour: UsageHourly["hours"][number]): number {
  return (hour.dsh_tokens ?? 0) + (hour.claude_tokens ?? 0) + (hour.codex_tokens ?? 0);
}

export function UsagePage() {
  const [timezone, setTimezone] = useState(Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC");
  const [timezoneReady, setTimezoneReady] = useState(false);
  const [month, setMonth] = useState(() => currentMonth());
  const [metric, setMetric] = useState<Metric>("tokens");
  const [calendar, setCalendar] = useState<UsageCalendar | null>(null);
  const [source, setSource] = useState<UsageSourceSummary | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [hourly, setHourly] = useState<UsageHourly | null>(null);
  const [loading, setLoading] = useState(true);
  const [hourlyLoading, setHourlyLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sourceError, setSourceError] = useState<string | null>(null);
  const [hourlyError, setHourlyError] = useState<string | null>(null);
  const monthRequest = useRef(0);
  const mounted = useRef(false);
  const loadedCalendarMonth = useRef<string | null>(null);
  const [hourlyReloadKey, setHourlyReloadKey] = useState(0);

  const loadMonth = (requestedMonth: string) => {
    const requestId = ++monthRequest.current;
    setLoading(true);
    setError(null);
    setSourceError(null);
    // Keep the last known projection visible during a refresh. The rendered
    // month below is derived from the returned DTO, so stale data is never
    // presented as if it belonged to the newly requested month.
    const changingMonth = loadedCalendarMonth.current !== requestedMonth;
    if (changingMonth) {
      setSelectedDate(null);
      setHourly(null);
      setHourlyError(null);
    }
    void Promise.allSettled([readUsageCalendar(requestedMonth), readUsageSourceSummary(requestedMonth)]).then(([calendarResult, sourceResult]) => {
      if (!mounted.current || requestId !== monthRequest.current) return;
      if (calendarResult.status === "fulfilled") {
        setCalendar(calendarResult.value);
        loadedCalendarMonth.current = calendarResult.value.month;
        if (changingMonth) {
          const first = calendarResult.value.days.find((day) => day.total_tokens > 0)?.date ?? null;
          const today = todayDate(timezone);
          setSelectedDate(first && first <= today ? first : null);
        }
        setHourlyReloadKey((value) => value + 1);
      } else {
        setError(safeUiError(calendarResult.reason, "用量日历暂不可用"));
      }
      if (sourceResult.status === "fulfilled") {
        setSource(sourceResult.value);
      } else {
        setSourceError(safeUiError(sourceResult.reason, "来源状态暂不可用"));
      }
      setLoading(false);
    });
  };

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      monthRequest.current += 1;
    };
  }, []);

  useEffect(() => {
    if (!timezoneReady) return undefined;
    loadMonth(month);
    return () => { monthRequest.current += 1; };
  }, [month, timezoneReady]);

  useEffect(() => {
    let active = true;
    void readStatisticsTimezone().then(({ timezone: next }) => {
      if (!active) return;
      setTimezone(next);
      setMonth((value) => value === currentMonth() ? currentMonth(next) : value);
      setTimezoneReady(true);
    }).catch(() => { if (active) setTimezoneReady(true); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    const refresh = () => { if (active && timezoneReady) loadMonth(month); };
    let cleanups: Array<() => void> = [];
    const gate = makeInvalidationGate();
    void listenAppEvents((event) => { if (gate(event)) refresh(); }).then((unsubscribe) => {
      if (active) cleanups = [unsubscribe];
      else unsubscribe();
    });
    return () => { active = false; cleanups.forEach((unsubscribe) => unsubscribe()); };
  }, [month, timezone, timezoneReady]);

  useEffect(() => {
    if (!selectedDate) return;
    let active = true;
    setHourlyLoading(true);
    setHourlyError(null);
    void readUsageHourly(selectedDate).then((value) => {
      if (active) setHourly(value);
    }).catch((reason: unknown) => {
      if (active) setHourlyError(safeUiError(reason, "小时用量暂不可用"));
    }).finally(() => { if (active) setHourlyLoading(false); });
    return () => { active = false; };
  }, [selectedDate, hourlyReloadKey]);

  const totals = useMemo(() => {
    const tokens = calendar?.days.reduce((sum, day) => sum + day.total_tokens, 0) ?? 0;
    const hostTokens = calendar?.days.reduce((sum, day) => ({
      dsh: sum.dsh + day.dsh_tokens,
      claude: sum.claude + day.claude_tokens,
      codex: sum.codex + day.codex_tokens,
    }), { dsh: 0, claude: 0, codex: 0 }) ?? { dsh: 0, claude: 0, codex: 0 };
    const costs: Record<string, number> = {};
    calendar?.days.forEach((day) => Object.entries(day.costs).forEach(([currency, amount]) => { costs[currency] = (costs[currency] ?? 0) + amount; }));
    return { tokens, hostTokens, costs };
  }, [calendar]);
  const today = todayDate(timezone);
  const displayedMonth = calendar?.month ?? source?.month ?? month;
  const calendarForDisplayedMonth = calendar?.month === displayedMonth ? calendar : null;
  // Calendar and source summary are independent projections. Summary cards
  // only combine matching windows; the source panel below can still show a
  // successfully-read older/newer source window with an explicit label.
  const sourceForDisplayedMonth = source?.month === displayedMonth ? source : null;
  const sourceForPanel = source;
  const layout = dateParts(displayedMonth);
  const selectedDay = dayFor(calendarForDisplayedMonth, selectedDate ?? "");
  const maxHourTokens = Math.max(1, ...(hourly?.hours.map(hourlyTotal) ?? [1]));

  return <>
    <section className="usage-header" aria-labelledby="usage-title">
      <div><p className="eyebrow">Tokens · 成本 · 覆盖</p><h2 id="usage-title">用量日历</h2><p className="section-description">按统计月份查看跨宿主 token；金额按币种和来源口径分栏，不把估算当作账单。</p></div>
      <div className="usage-toolbar">
        <button className="button button-secondary" type="button" aria-label="上个月" onClick={() => setMonth((value) => shiftMonth(value, -1))}>‹</button>
        <input className="usage-month" type="month" aria-label="选择统计月份" value={month} onChange={(event) => setMonth(event.target.value || currentMonth(timezone))} />
        <button className="button button-secondary" type="button" aria-label="下个月" disabled={month >= currentMonth(timezone)} onClick={() => setMonth((value) => shiftMonth(value, 1))}>›</button>
        <label className="usage-metric">显示<select aria-label="日历显示指标" value={metric} onChange={(event) => setMetric(event.target.value as Metric)}><option value="tokens">Tokens</option><option value="cost">成本</option></select></label>
      </div>
    </section>
    {error && <div className="error-banner" role="alert">读取日历失败：{error}</div>}
    {sourceError && <div className="error-banner" role="alert">读取来源摘要失败：{sourceError}；不会把上一月份来源数据冒充为当前月份。</div>}
    {loading && !calendar && !source && <section className="empty-state" aria-live="polite"><p className="eyebrow">正在读取</p><h3>{monthTitle(month)}用量</h3><p>正在通过本地 authority 获取安全聚合。</p></section>}
    {loading && (calendar || source) && <div className="usage-refresh-status" role="status" aria-live="polite">正在读取 {monthTitle(month)}；保留 {monthTitle(displayedMonth)} 的已知结果。</div>}
    {(calendar || source) && <div aria-busy={loading || undefined}>
      <section className="usage-summary-grid" aria-label="月份汇总">
        <article className="stat-card"><p className="eyebrow">{monthTitle(displayedMonth)} token</p><p className="stat-value">{calendarForDisplayedMonth && totals.tokens ? tokensLabel(totals.tokens) : "—"}</p><p className="stat-detail">{calendarForDisplayedMonth && totals.tokens ? "跨宿主可加总" : "该月日历数据不可用"}</p></article>
        <article className="stat-card"><p className="eyebrow">{calendarForDisplayedMonth ? `${monthTitle(displayedMonth)} 日历来源口径成本` : "来源口径成本"}</p><p className="stat-value stat-value-compact">{calendarForDisplayedMonth ? costsLabel(totals.costs) : "—"}</p><p className="stat-detail">{sourceForDisplayedMonth ? `${spendBasisLabel(sourceForDisplayedMonth.spend_by_basis)} · 日历不摊订阅月费` : "当前月份来源摘要不可用或尚未对齐"}</p></article>
        <article className="stat-card"><p className="eyebrow">{sourceForDisplayedMonth ? `${monthTitle(sourceForDisplayedMonth.month)} 数据新鲜度` : "数据新鲜度"}</p><p className="stat-value stat-value-compact">{sourceForDisplayedMonth ? freshnessLabel(sourceForDisplayedMonth.freshness) : "—"}</p><p className="stat-detail">{sourceForDisplayedMonth?.last_observed_at ? `最后观测 ${sourceForDisplayedMonth.last_observed_at}` : "当前月份来源状态不可用或尚未对齐"}</p></article>
      </section>
      <section className="usage-host-summary" aria-label="月份宿主 token 拆分"><div><span>DSH</span><strong>{calendarForDisplayedMonth ? hostTotalLabel(totals.hostTokens.dsh, totals.tokens) : "—"}</strong></div><div><span>Claude Code</span><strong>{calendarForDisplayedMonth ? hostTotalLabel(totals.hostTokens.claude, totals.tokens) : "—"}</strong></div><div><span>Codex</span><strong>{calendarForDisplayedMonth ? hostTotalLabel(totals.hostTokens.codex, totals.tokens) : "—"}</strong></div><p>宿主拆分只展示已观测 token；月度总量仍以权威日历为准，不把不同计费口径合并。</p></section>
      <section className="usage-calendar-panel" aria-labelledby="usage-calendar-title">
        <div className="section-heading"><div><p className="eyebrow">日历</p><h3 id="usage-calendar-title">{monthTitle(displayedMonth)}</h3></div><span className="count-badge">{calendarForDisplayedMonth?.days.length ?? 0} 天</span></div>
        {calendarForDisplayedMonth && totals.tokens > 0 ? <div className="usage-calendar-grid" role="grid" aria-label={`${monthTitle(displayedMonth)} token 日历`}>
          {(["日", "一", "二", "三", "四", "五", "六"] as const).map((day) => <span className="usage-calendar-dow" role="columnheader" key={day}>{day}</span>)}
          {Array.from({ length: layout.leading }, (_, index) => <span className="usage-calendar-cell usage-calendar-blank" aria-hidden="true" key={`blank-${index}`} />)}
          {Array.from({ length: layout.days }, (_, index) => {
            const date = `${displayedMonth}-${String(index + 1).padStart(2, "0")}`;
            const day = dayFor(calendarForDisplayedMonth, date);
            const future = date > today;
            const selected = selectedDate === date;
            const value = metric === "tokens" ? (day ? tokensLabel(day.total_tokens) : "—") : (day ? costsLabel(day.costs) : "—");
            return <button className={`usage-calendar-cell ${day && day.total_tokens > 0 ? "usage-calendar-has-data" : ""} ${selected ? "usage-calendar-selected" : ""} ${future ? "usage-calendar-future" : ""}`} type="button" role="gridcell" key={date} disabled={future} aria-selected={selected} aria-label={`${date}，${value}${day && metric === "tokens" ? `，宿主拆分 ${hostTokenLines(day)}` : ""}${future ? "，未来日期" : "，查看小时明细"}`} onClick={() => setSelectedDate(date)}><span>{index + 1}</span><strong>{value}</strong>{metric === "tokens" && day && day.total_tokens > 0 && <small className="usage-host-breakdown">{hostTokenLines(day)}</small>}{metric === "cost" && day && day.total_tokens > 0 && <small>{day.cost_lines.length ? costLinesLabel(day.cost_lines) : `${tokensLabel(day.total_tokens)} tokens`}</small>}</button>;
          })}
        </div> : <div className="usage-empty">{calendarForDisplayedMonth ? "该月没有已测 token。空数据不等于来源不可用，请结合下方覆盖状态判断。" : "该月份日历结果暂不可用；上一份结果未被冒充为当前月份。"}</div>}
        <p className="usage-note">{metric === "tokens" ? "主行 = 当日跨宿主 token 总量；点击过去日期查看小时分布。" : "主行 = 当日成本分币并列；没有成本证据显示“成本不可用”，不等于 ¥0。"}</p>
      </section>
      <section className="usage-detail-grid">
        <section className="usage-hourly-panel" aria-labelledby="usage-hourly-title">
          <div className="section-heading"><div><p className="eyebrow">小时明细</p><h3 id="usage-hourly-title">{selectedDate ? `${selectedDate}${selectedDate === today ? " · 今天" : ""}` : "选择一个日期"}</h3></div>{selectedDay && <span className="count-badge">{tokensLabel(dayTokens(selectedDay))}</span>}</div>
          {hourlyLoading && <p className="usage-empty">正在读取小时事实…</p>}
          {hourlyError && <p className="usage-empty" role="alert">{hourlyError}</p>}
          {!hourlyLoading && !hourlyError && hourly && <><div className="usage-hour-grid">{hourly.hours.map((hour) => { const total = hourlyTotal(hour); const label = total ? `${String(hour.hour).padStart(2, "0")}:00 · ${tokensLabel(total)} tokens` : `${String(hour.hour).padStart(2, "0")}:00 · 无观测数据`; return <div className={`usage-hour ${total === 0 ? "usage-hour-empty" : ""}`} key={hour.hour} role="img" aria-label={label} title={label}><div className="usage-hour-bar"><span style={{ height: `${Math.max(total ? 4 : 1, Math.round((total / maxHourTokens) * 56))}px` }} /></div><small aria-hidden="true">{String(hour.hour).padStart(2, "0")}</small></div>; })}</div><p className="usage-note">小时空格 = 没有已观测事实，不会用日总量均摊补造；{Object.entries(hourly.hosts_available).map(([host, value]) => `${host}：${sourceLabel(value)}`).join(" · ")}。</p></>}
        </section>
        <section className="usage-source-panel" aria-labelledby="usage-source-title"><div className="section-heading"><div><p className="eyebrow">来源状态</p><h3 id="usage-source-title">覆盖与新鲜度</h3>{sourceForPanel && <p className="section-meta">窗口：{monthTitle(sourceForPanel.month)}</p>}</div><span className="count-badge">{sourceForPanel ? `${sourceForPanel.coverage.measured_fields}/${sourceForPanel.coverage.total_fields}` : "—"}</span></div>{sourceForPanel ? <dl className="usage-source-list"><div><dt>账单级实付</dt><dd>{Object.keys(sourceForPanel.actual_spend).length ? costsLabel(sourceForPanel.actual_spend) : "无数据"}</dd></div><div><dt>状态</dt><dd>{freshnessLabel(sourceForPanel.freshness)}</dd></div><div><dt>最后观测</dt><dd>{sourceForPanel.last_observed_at ?? "无时间证据"}</dd></div><div><dt>未决计费项</dt><dd>{sourceForPanel.has_unresolved ? "有 · 不计为账单实付" : "无"}</dd></div><div><dt>范围外宿主</dt><dd>{sourceForPanel.excluded_hosts.length ? sourceForPanel.excluded_hosts.join("、") : "无"}</dd></div></dl> : <p className="usage-empty">来源状态暂不可用；日历与来源面板独立读取。</p>}<p className="usage-note">估算、套餐等价和未决用量/金额不等于账单级实付；覆盖不足时请结合状态判断。</p></section>
      </section>
    </div>}
  </>;
}
