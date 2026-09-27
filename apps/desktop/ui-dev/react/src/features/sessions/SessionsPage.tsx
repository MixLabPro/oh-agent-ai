import { useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import {
  listenAppEvents,
  makeInvalidationGate,
  readSessions,
  readStatisticsTimezone,
  safeUiError,
  type SessionCostStatus,
  type SessionRow,
  type SessionsCostFilter,
  type SessionsFilters,
  type SessionsPage as SessionsPageData,
  type SessionsWindow,
} from "../../lib/tauri";
import { readSessionsDeepLinkFromHash } from "../../lib/nav";
import { SessionDetail } from "./SessionDetail";
import { Button, DateInput, Field, FilterBar, SelectInput, TextInput } from "../../components/ui/FormControls";
import { ToolbarActions } from "../../components/ui/ToolbarActions";

const costStates: Array<{ value: SessionsCostFilter; label: string }> = [
  { value: "all", label: "全部计费状态" },
  { value: "estimated", label: "估算" },
  { value: "subscription", label: "订阅" },
  { value: "unpriced", label: "缺价" },
  { value: "unavailable", label: "不可用" },
];

const DEFAULT_STATISTICS_TIMEZONE = "Asia/Shanghai";
const SESSIONS_VIEW_STATE_KEY = "agent-vitals.sessions-view.v1";
type SessionNavigationTarget = { type: "sessionDetail"; session_ref: string; host_kind: string } | { type: "sessionList"; host_kind: string | null };

function loadSessionsViewState(): { filters: SessionsFilters; selectedSessionRef: string | null } | null {
  try {
    const raw = window.sessionStorage.getItem(SESSIONS_VIEW_STATE_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as { filters?: Partial<SessionsFilters>; selectedSessionRef?: unknown };
    const filters = value.filters;
    if (!filters || !["month", "today", "7d", "day", "custom"].includes(filters.window ?? "") || !["all", "estimated", "subscription", "unpriced", "unavailable"].includes(filters.cost_status ?? "")) return null;
    const fallback = filtersForTimezone(DEFAULT_STATISTICS_TIMEZONE);
    const date = (item: unknown, backup: string) => typeof item === "string" && /^\d{4}-\d{2}-\d{2}$/.test(item) ? item : backup;
    return {
      filters: {
        ...fallback, ...filters,
        month: typeof filters.month === "string" && /^\d{4}-\d{2}$/.test(filters.month) ? filters.month : fallback.month,
        day: date(filters.day, fallback.day),
        date_from: date(filters.date_from, fallback.date_from), date_to: date(filters.date_to, fallback.date_to),
        host_kind: typeof filters.host_kind === "string" && /^[a-z][a-z0-9_-]{0,31}$/.test(filters.host_kind) ? filters.host_kind : "all",
        model: typeof filters.model === "string" ? filters.model.slice(0, 120) : "",
        provider: typeof filters.provider === "string" ? filters.provider.slice(0, 120) : "",
      } as SessionsFilters,
      selectedSessionRef: typeof value.selectedSessionRef === "string" && /^sr_[A-Za-z0-9_-]{8,128}$/.test(value.selectedSessionRef) ? value.selectedSessionRef : null,
    };
  } catch { return null; }
}

function dateInTimezone(timezone: string, date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value ?? "1970";
  const month = parts.find((part) => part.type === "month")?.value ?? "01";
  const day = parts.find((part) => part.type === "day")?.value ?? "01";
  return `${year}-${month}-${day}`;
}

function filtersForTimezone(timezone: string): SessionsFilters {
  const today = dateInTimezone(timezone);
  return { window: "month", month: today.slice(0, 7), day: today, date_from: shiftDate(today, -6), date_to: today, host_kind: "all", model: "", provider: "", cost_status: "all" };
}

function shiftDate(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function compact(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return String(value);
}

function dateLabel(value: string | null): string {
  if (!value) return "时间不可用";
  return value.slice(0, 16).replace("T", " ");
}

function dayLabel(value: string | null): string {
  if (!value) return "未知日期";
  return value.slice(0, 10).replaceAll("-", "/");
}

function sessionTitle(row: SessionRow): string {
  return `${row.host} 会话 · ${dayLabel(row.first_event_at)}`;
}

function costStateLabel(status: SessionCostStatus): string {
  const labels: Record<SessionCostStatus["state"], string> = { estimated: "估算", subscription: "订阅", unpriced: "缺价", unavailable: "不可用" };
  return `${labels[status.state]} · ${status.reason}`;
}

function costStateShort(state: SessionCostStatus["state"]): string {
  return ({ estimated: "估算", subscription: "订阅", unpriced: "缺价", unavailable: "不可用" } as Record<SessionCostStatus["state"], string>)[state];
}

function costLabel(row: SessionRow): string {
  if (!row.cost_minor) return "—";
  const amount = row.cost_minor.amount_minor / 100;
  return `${row.cost_minor.currency === "CNY" ? "¥" : `${row.cost_minor.currency} `}${amount.toFixed(2)}`;
}

function serverArgs(filters: SessionsFilters, cursor: string | null, timezone: string): Parameters<typeof readSessions>[0] {
  const args: Parameters<typeof readSessions>[0] = { page_size: 50, cursor };
  if (filters.window === "month") args.month = filters.month;
  const today = dateInTimezone(timezone);
  if (filters.window === "today") args.day = today;
  if (filters.window === "day") args.day = filters.day;
  if (filters.window === "7d") { args.date_from = shiftDate(today, -6); args.date_to = today; }
  if (filters.window === "custom") { args.date_from = filters.date_from; args.date_to = filters.date_to; }
  if (filters.host_kind !== "all") args.host_kind = filters.host_kind;
  if (filters.model.trim()) args.model = filters.model.trim();
  if (filters.provider.trim()) args.provider = filters.provider.trim();
  return args;
}

function updateFilter(setFilters: Dispatch<SetStateAction<SessionsFilters>>, key: keyof SessionsFilters, value: string) {
  setFilters((current) => ({ ...current, [key]: value } as SessionsFilters));
}

export function SessionsPage({ navigationTarget = null, onNavigationTargetApplied }: { navigationTarget?: SessionNavigationTarget | null; onNavigationTargetApplied?: () => void }) {
  const initialViewState = useMemo(() => loadSessionsViewState(), []);
  // R1 深链（OVERVIEW_DRILLDOWN spec §4.2）：#sessions?date=…&host=… 优先于
  // 恢复的 view-state——深链是用户此刻的意图；切换窗口控件即离开 day 态。
  // date 与 host 可组合（同时过滤）。**一次性消费**：应用后立即 replaceState
  // 去掉 query——否则 F5 会用旧深链压回用户后来切好的窗口（验收 P2-1）。
  const deepLinkToFilters = (base: SessionsFilters, deep: ReturnType<typeof readSessionsDeepLinkFromHash>): SessionsFilters => {
    if (!deep.date && !deep.host) return base;
    let next: SessionsFilters = deep.date ? { ...base, window: "day" as const, day: deep.date } : base;
    if (deep.host) next = { ...next, host_kind: deep.host };
    return next;
  };
  const consumeDeepLink = () => {
    if (window.location.hash.includes("?")) {
      window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}#sessions`);
    }
  };
  const [filters, setFilters] = useState<SessionsFilters>(() => {
    const base = initialViewState?.filters ?? filtersForTimezone(DEFAULT_STATISTICS_TIMEZONE);
    const next = deepLinkToFilters(base, readSessionsDeepLinkFromHash());
    if (next !== base) consumeDeepLink();
    return next;
  });
  // 同页 hash 变化（侧栏重点「会话」/同页深链再进入）：重读深链参数——
  // 裸 #sessions 不动现有过滤；带新参数则应用并消费（验收 P2-2）。
  useEffect(() => {
    const onHashChange = () => {
      const deep = readSessionsDeepLinkFromHash();
      if (deep.date || deep.host) {
        setFilters((current) => deepLinkToFilters(current, deep));
        consumeDeepLink();
      }
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);
  const [statisticsTimezone, setStatisticsTimezone] = useState(DEFAULT_STATISTICS_TIMEZONE);
  const [timezoneReady, setTimezoneReady] = useState(false);
  const [rows, setRows] = useState<SessionRow[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [total, setTotal] = useState<number | null>(null);
  const [windowTokens, setWindowTokens] = useState<number | null>(null);
  const [selectedSessionRef, setSelectedSessionRef] = useState<string | null>(() => initialViewState?.selectedSessionRef ?? null);
  const [detailRefreshKey, setDetailRefreshKey] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const generation = useRef(0);
  const requestInFlight = useRef(false);
  const pendingRefresh = useRef(false);
  const dateFiltersTouched = useRef(Boolean(initialViewState));
  const filtersRef = useRef(filters);
  filtersRef.current = filters;
  useEffect(() => {
    try { window.sessionStorage.setItem(SESSIONS_VIEW_STATE_KEY, JSON.stringify({ filters, selectedSessionRef })); } catch { /* Optional UI preference; authority data remains unaffected. */ }
  }, [filters, selectedSessionRef]);
  const serverKey = useMemo(() => JSON.stringify([filters.window, filters.month, filters.day, filters.date_from, filters.date_to, filters.host_kind, filters.model, filters.provider]), [filters]);
  const visibleRows = useMemo(() => filters.cost_status === "all" ? rows : rows.filter((row) => row.cost_status.state === filters.cost_status), [filters.cost_status, rows]);

  useEffect(() => {
    if (!navigationTarget) return;
    setFilters((current) => ({ ...current, host_kind: navigationTarget.host_kind || "all" }));
    setSelectedSessionRef(navigationTarget.type === "sessionDetail" ? navigationTarget.session_ref : null);
    onNavigationTargetApplied?.();
  }, [navigationTarget, onNavigationTargetApplied]);

  useEffect(() => {
    let active = true;
    void readStatisticsTimezone().catch(() => ({ timezone: DEFAULT_STATISTICS_TIMEZONE })).then(({ timezone }) => {
      if (!active) return;
      setStatisticsTimezone(timezone);
      if (!dateFiltersTouched.current) setFilters((current) => ({ ...filtersForTimezone(timezone), host_kind: current.host_kind }));
      setTimezoneReady(true);
    });
    return () => { active = false; };
  }, []);

  const fetchFirstPage = async () => {
    setDetailRefreshKey((value) => value + 1);
    if (requestInFlight.current) {
      pendingRefresh.current = true;
      generation.current += 1;
      setLoading(true);
      setError(null);
      return;
    }
    const currentFilters = filtersRef.current;
    const currentGeneration = ++generation.current;
    requestInFlight.current = true;
    setLoading(true);
    setError(null);
    setNextCursor(null);
    try {
      const page = await readSessions(serverArgs(currentFilters, null, statisticsTimezone));
      if (currentGeneration !== generation.current) return;
      setRows(page.sessions);
      setNextCursor(page.next_cursor);
      setTotal(page.window_session_count);
      setWindowTokens(page.window_total_tokens);
    } catch (reason: unknown) {
      if (currentGeneration !== generation.current) return;
      setError(safeUiError(reason, "会话数据暂不可用"));
      setTotal(null);
      setWindowTokens(null);
    } finally {
      if (currentGeneration === generation.current) setLoading(false);
      requestInFlight.current = false;
      if (pendingRefresh.current) {
        pendingRefresh.current = false;
        void fetchFirstPage();
      }
    }
  };

  useEffect(() => { if (timezoneReady) void fetchFirstPage(); }, [serverKey, statisticsTimezone, timezoneReady]);

  useEffect(() => {
    let active = true;
    const refresh = () => { if (active) void fetchFirstPage(); };
    let cleanups: Array<() => void> = [];
    const gate = makeInvalidationGate();
    void listenAppEvents((event) => { if (gate(event)) refresh(); })
      .then((unsubscribe) => { if (active) cleanups = [unsubscribe]; else unsubscribe(); });
    return () => { active = false; cleanups.forEach((unsubscribe) => unsubscribe()); };
  }, [serverKey, statisticsTimezone, timezoneReady]);

  const loadMore = async () => {
    if (!nextCursor || loadingMore || requestInFlight.current) return;
    const currentGeneration = generation.current;
    requestInFlight.current = true;
    setLoadingMore(true);
    try {
      const page = await readSessions(serverArgs(filters, nextCursor, statisticsTimezone));
      if (currentGeneration !== generation.current) return;
      setRows((current) => {
        const known = new Set(current.map((row) => row.session_ref));
        return current.concat(page.sessions.filter((row) => !known.has(row.session_ref)));
      });
      setNextCursor(page.next_cursor);
      setTotal(page.window_session_count);
      setWindowTokens(page.window_total_tokens);
    } catch (reason: unknown) {
      if (currentGeneration === generation.current) setError(safeUiError(reason, "更多会话暂不可用"));
    } finally {
      setLoadingMore(false);
      requestInFlight.current = false;
      if (pendingRefresh.current) {
        pendingRefresh.current = false;
        void fetchFirstPage();
      }
    }
  };

  const selectedRow = rows.find((row) => row.session_ref === selectedSessionRef) ?? null;

  return <div className={`sessions-workspace ${selectedSessionRef ? "sessions-workspace-selected" : ""}`}>
    <main className="sessions-list-pane">
    <>
    <h1 className="visually-hidden">会话</h1>
    <ToolbarActions>
      <div className="sessions-header-actions">
        <span className="status-pill"><span aria-hidden="true" className="status-dot" />安全列表</span>
        <Button type="button" onClick={() => void fetchFirstPage()} disabled={loading}>刷新</Button>
      </div>
    </ToolbarActions>

    <FilterBar aria-label="会话筛选" data-window={filters.window}>
      <Field label="时间窗口" htmlFor="sessions-window"><SelectInput id="sessions-window" value={filters.window} onChange={(event) => { dateFiltersTouched.current = true; updateFilter(setFilters, "window", event.target.value); }}><option value="month">按月</option><option value="today">今天</option><option value="7d">最近 7 天</option><option value="day">单日</option><option value="custom">自定义</option></SelectInput></Field>
      {filters.window === "day" && <Field label="日期" htmlFor="sessions-day"><DateInput id="sessions-day" type="date" value={filters.day} onChange={(event) => { dateFiltersTouched.current = true; updateFilter(setFilters, "day", event.target.value); }} /></Field>}
      {filters.window === "month" && <Field label="月份" htmlFor="sessions-month"><DateInput id="sessions-month" type="month" value={filters.month} onChange={(event) => { dateFiltersTouched.current = true; updateFilter(setFilters, "month", event.target.value); }} /></Field>}
      {filters.window === "custom" && <><Field label="开始日期" htmlFor="sessions-date-from"><DateInput id="sessions-date-from" type="date" value={filters.date_from} onChange={(event) => { dateFiltersTouched.current = true; updateFilter(setFilters, "date_from", event.target.value); }} /></Field><Field label="结束日期" htmlFor="sessions-date-to"><DateInput id="sessions-date-to" type="date" value={filters.date_to} onChange={(event) => { dateFiltersTouched.current = true; updateFilter(setFilters, "date_to", event.target.value); }} /></Field></>}
      <Field label="宿主" htmlFor="sessions-host"><TextInput id="sessions-host" list="session-host-options" value={filters.host_kind === "all" ? "" : filters.host_kind} placeholder="全部宿主 / 动态宿主" onChange={(event) => updateFilter(setFilters, "host_kind", event.target.value || "all")} /></Field>
      <datalist id="session-host-options"><option value="codex" /><option value="claude-code" /><option value="dsh" /><option value="workbuddy" /><option value="zcode" /><option value="minimax-code" /></datalist>
      <Field label="模型" htmlFor="sessions-model"><TextInput id="sessions-model" value={filters.model} placeholder="可选精确匹配" onChange={(event) => updateFilter(setFilters, "model", event.target.value)} /></Field>
      <Field label="服务商" htmlFor="sessions-provider"><TextInput id="sessions-provider" value={filters.provider} placeholder="可选精确匹配" onChange={(event) => updateFilter(setFilters, "provider", event.target.value)} /></Field>
      <Field label="计费状态" htmlFor="sessions-cost"><SelectInput id="sessions-cost" value={filters.cost_status} onChange={(event) => updateFilter(setFilters, "cost_status", event.target.value)}>{costStates.map((state) => <option key={state.value} value={state.value}>{state.label}</option>)}</SelectInput></Field>
    </FilterBar>

    {error && <div className="error-banner" role="alert">会话数据不可用：{error}</div>}
    {loading && rows.length > 0 && <div className="sessions-refresh-status" role="status" aria-live="polite">正在读取新的筛选窗口，下面暂保留上一份会话结果；完成后会替换为最新数据。</div>}
    <section className="sessions-summary" aria-live="polite">
      <div><strong>{total === null ? "—" : total}</strong><span>窗口会话</span></div>
      <div><strong>{windowTokens === null ? "—" : compact(windowTokens)}</strong><span>窗口 tokens</span></div>
      <div><strong>{visibleRows.length}</strong><span>{filters.cost_status === "all" ? "当前页" : "当前页匹配"}</span></div>
      <p>已加载 {rows.length} 条 · 成本按币种分别计算</p>
    </section>

    <section className="sessions-panel" aria-labelledby="sessions-list-title">
      <div className="section-heading"><div><p className="eyebrow">安全投影</p><h3 id="sessions-list-title">会话列表</h3></div><span className="count-badge">{nextCursor ? "可继续" : "已加载"}</span></div>
      {loading && rows.length === 0 ? <div className="sessions-state" role="status"><strong>正在读取会话</strong><p>正在通过本地 authority 汇总当前窗口，不会上传数据。</p></div> : visibleRows.length === 0 ? <div className="sessions-state"><strong>{error ? "无法显示会话" : rows.length ? "没有匹配的计费状态" : "暂无会话"}</strong><p>{error ? "请检查本地数据同步状态后重试。" : "当前筛选窗口没有可展示的安全会话聚合。"}</p></div> : <>
        <div className="sessions-table-wrap"><table className="sessions-table"><thead><tr><th scope="col">会话</th><th scope="col">宿主 · 模型</th><th scope="col">时间</th><th scope="col">Tokens</th><th scope="col">费用</th><th scope="col">状态</th></tr></thead><tbody>{visibleRows.map((row) => <tr key={row.session_ref} className={`sessions-table-row-clickable ${row.session_ref === selectedSessionRef ? "sessions-row-selected" : ""}`} tabIndex={0} role="button" aria-pressed={row.session_ref === selectedSessionRef} onClick={() => setSelectedSessionRef(row.session_ref)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setSelectedSessionRef(row.session_ref); } }}><td><strong>{sessionTitle(row)}</strong><code>{row.session_ref.slice(0, 15)}…</code></td><td>{row.host}<small>{row.model_ids.length ? row.model_ids.join(" · ") : "模型不可用"}</small></td><td>{dateLabel(row.first_event_at)}<small>{row.last_event_at ? `至 ${dateLabel(row.last_event_at)}` : "结束时间不可用"}</small></td><td><strong>{compact(row.tokens.total)}</strong><small>{row.event_count} 个事件 · 峰值 {compact(row.peak_tokens)}</small></td><td><strong>{costLabel(row)}</strong><small>{row.cost_minor ? row.cost_minor.basis : "未计入金额"}</small></td><td><span className={`session-cost-state session-cost-${row.cost_status.state}`}>{costStateLabel(row.cost_status)}</span></td></tr>)}</tbody></table></div>
        <div className="sessions-card-list">{visibleRows.map((row) => <article className={`session-card session-card-clickable ${row.session_ref === selectedSessionRef ? "sessions-row-selected" : ""}`} key={row.session_ref} tabIndex={0} role="button" aria-pressed={row.session_ref === selectedSessionRef} onClick={() => setSelectedSessionRef(row.session_ref)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setSelectedSessionRef(row.session_ref); } }}><div className="session-card-heading"><strong>{sessionTitle(row)}</strong><span className={`session-cost-state session-cost-${row.cost_status.state}`}>{costStateShort(row.cost_status.state)}</span></div><p>{row.host} · {row.model_ids.join(" · ") || "模型不可用"}</p><div><span>{compact(row.tokens.total)} token · {row.event_count} 个事件</span><strong>{costLabel(row)}</strong></div><small>{dateLabel(row.first_event_at)} 至 {dateLabel(row.last_event_at)}</small><code>{row.session_ref.slice(0, 15)}…</code></article>)}</div>
        {nextCursor && <div className="sessions-more"><Button type="button" onClick={() => void loadMore()} busy={loadingMore} disabled={loading}>{loadingMore ? "正在加载…" : "加载更多"}</Button></div>}
      </>}
    </section>
    </>
    </main>
    {selectedSessionRef && <aside className="sessions-inspector" aria-label="会话检查器"><SessionDetail row={selectedRow} sessionRef={selectedSessionRef} hostKind={filters.host_kind} refreshKey={detailRefreshKey} onBack={() => setSelectedSessionRef(null)} /></aside>}
  </div>;
}
