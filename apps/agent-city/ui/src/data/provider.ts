import { invokeHost } from "../host";
import { validateCityProjectionV2, validateCityProjectionV3, type CitySnapshotV3, type CityProjectionV3, type PluginRequestV1, type PluginResponseV1, type CityUiProjectionV2 } from "@agent-vitals/app-sdk";

export type CityProjectionV1 = CityUiProjectionV2;

export interface CityDataProvider {
  getProjection(input: { windowDays: 7 | 30 | 90 | 366; signal?: AbortSignal; onStage?: (stage: "reading_summary" | "reading_sessions" | "ready") => void }): Promise<CityProjectionV1>;
}

let requestSequence = 0;

/** 独立页 `?fixtureSessions=N`：确定性合成 N 个会话，用来在浏览器里看「楼多起来」的城市。
 *  默认 3 个会话的 fixture 几乎没有会话楼，酒店街/立面/天际线都无从评估。只走 fixture 路径。 */
function syntheticSessions(count: number): CityProjectionV1["sessions"] {
  const harnesses = ["codex", "claude-code", "dsh", "workbuddy"]; // 与真实投影同名（连字符），否则落到兜底调色板
  let state = 0x9e3779b9;
  const next = () => { state = (Math.imul(state ^ (state >>> 15), 0x2c1b3c6d) + 0x6d2b79f5) >>> 0; return state / 0x1_0000_0000; };
  const end = Date.parse("2026-10-03T00:00:00Z");
  return Array.from({ length: count }, (_, index) => {
    const start = end - Math.floor(next() * 85 * 86_400_000);
    const total = Math.round(5_000 * Math.pow(1_000, next())); // 5K..5M，对数均匀
    const input = Math.round(total * 0.8);
    return {
      id: `fixture-synth-${String(index + 1).padStart(3, "0")}`,
      harness: harnesses[Math.floor(next() * harnesses.length)],
      first_event_at: new Date(start).toISOString().replace(/\.\d{3}Z$/, "Z"),
      last_event_at: new Date(start + 1_800_000).toISOString().replace(/\.\d{3}Z$/, "Z"),
      tokens: { input, output: total - input, total },
    };
  });
}

function fixtureProjection(windowDays: 7 | 30 | 90 | 366): CityProjectionV1 {
  const from = ({ 7: "2026-09-27T00:00:00Z", 30: "2026-09-03T00:00:00Z", 90: "2026-07-06T00:00:00Z", 366: "2025-10-03T00:00:00Z" } as const)[windowDays];
  // 只在浏览器里读查询参数：Node 守卫（verify-react-city-data）没有 location / URLSearchParams。
  const search = typeof location !== "undefined" && typeof URLSearchParams !== "undefined" ? new URLSearchParams(location.search) : null;
  const synthetic = Number(search?.get("fixtureSessions") ?? 0);
  const allSessions: CityProjectionV1["sessions"] = Number.isInteger(synthetic) && synthetic > 0 ? syntheticSessions(Math.min(synthetic, 3000)) : [
    { id: "fixture-session-001", harness: "codex", title: "修复菜单栏图标不显示", title_source: "codex_thread_name", first_event_at: "2026-10-02T09:10:00Z", last_event_at: "2026-10-02T09:42:00Z", tokens: { input: 12400, output: 3100, total: 15500 } },
    { id: "fixture-session-002", harness: "claude_code", title: "重构 surface compiler", title_source: "claude_ai_title", first_event_at: "2026-09-28T14:05:00Z", last_event_at: "2026-09-28T14:51:00Z", tokens: { input: 8700, output: 2200, total: 10900 } },
    { id: "fixture-session-003", harness: "codex", first_event_at: "2026-09-17T07:20:00Z", last_event_at: "2026-09-17T08:02:00Z", tokens: { input: 22100, output: 5400, total: 27500 } },
  ];
  const sessions = allSessions.filter((session) => session.first_event_at >= from);
  const claudeId = sessions.some((session) => session.harness === "claude-code") ? "claude-code" : "claude_code";
  return {
    protocol: "city:v2",
    source: "fixture",
    harnesses: [{ id: "codex", display_name: "Codex" }, { id: claudeId, display_name: "Claude Code" }, { id: "dsh", display_name: "DSH" }, { id: "workbuddy", display_name: "WorkBuddy" }].map((h) => ({ ...h,
      capabilities: { session_statistics: { available: true }, findings: { available: true, reason: null } } })),
    generated_at: "2026-10-03T12:00:00Z",
    window: { days: windowDays, label: `最近 ${windowDays} 天`, from, to: "2026-10-03T00:00:00Z" },
    sessions,
    findings: [
      { harness: "codex", severity: "warning", count: 2 },
      { harness: "claude_code", severity: "info", count: 1 },
    ],
    coverage: { total: sessions.length, returned: sessions.length, truncated: false, unknown_time: 0 },
    status: "ready",
  };
}

/** 演示城市（standalone ?demo=1）：确定性生成 ~280 条会话，让浏览器里的城市达到
 * 真实规模（路网 + 楼群 + 背景聚合楼），供驾驶 UAT 等需要完整城市场面的测试。
 * 仅在非嵌入（standalone）浏览器预览生效——嵌入宿主永不读它，隔离测试的
 * `__CITY_ISOLATION_FIXTURE__` 也不经过这里。 */
function demoCityProjection(windowDays: 7 | 30 | 90 | 366): CityProjectionV1 {
  const windowEndMs = Date.parse("2026-10-03T00:00:00Z");
  const from = ({ 7: "2026-09-27T00:00:00Z", 30: "2026-09-03T00:00:00Z", 90: "2026-07-06T00:00:00Z", 366: "2025-10-03T00:00:00Z" } as const)[windowDays];
  // mulberry32：确定性，刷新/重跑同一城市。
  let seed = 0x63697479;
  const random = () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const harnesses = ["codex", "claude_code"] as const;
  const sessions: CityProjectionV1["sessions"] = [];
  for (let index = 0; index < 280; index += 1) {
    // 90 天内偏近期分布（每天 1~6 条），366 天窗口额外铺一批历史楼。
    const daysAgo = Math.floor(random() * (windowDays >= 366 ? 300 : 88));
    const dayStart = windowEndMs - (daysAgo + 1) * 86400000;
    const start = dayStart + Math.floor(random() * 10 + 1) * 3600000;
    const durationMinutes = 12 + Math.floor(random() * 110);
    const input = 3000 + Math.floor(random() * 90000);
    const output = 800 + Math.floor(random() * 12000);
    const harness = harnesses[Math.floor(random() * harnesses.length)];
    sessions.push({
      id: `demo-session-${String(index + 1).padStart(3, "0")}`,
      harness,
      // 每 4 条给 1 条标题（其余保持无标题：验证 fallback 命名路径）。
      ...(index % 4 === 0
        ? { title: `演示会话 ${index + 1}：${harness === "codex" ? "rollout 解析" : "evidence 对拍"}`, title_source: harness === "codex" ? ("codex_thread_name" as const) : ("claude_ai_title" as const) }
        : {}),
      first_event_at: new Date(start).toISOString().replace(/\.\d+Z$/, "Z"),
      last_event_at: new Date(start + durationMinutes * 60000).toISOString().replace(/\.\d+Z$/, "Z"),
      tokens: { input, output, total: input + output },
    });
  }
  const visible = sessions.filter((session) => session.first_event_at >= from);
  return {
    protocol: "city:v2",
    source: "fixture",
    harnesses: [{ id: "codex", display_name: "Codex" }, { id: "claude_code", display_name: "Claude Code" }].map((h) => ({ ...h,
      capabilities: { session_statistics: { available: true }, findings: { available: true, reason: null } } })),
    generated_at: "2026-10-03T12:00:00Z",
    window: { days: windowDays, label: `最近 ${windowDays} 天`, from, to: "2026-10-03T00:00:00Z" },
    sessions: visible,
    findings: [
      { harness: "codex", severity: "warning", count: Math.floor(visible.length * 0.08) },
      { harness: "codex", severity: "info", count: Math.floor(visible.length * 0.05) },
      { harness: "claude_code", severity: "warning", count: Math.floor(visible.length * 0.04) },
    ],
    coverage: { total: visible.length, returned: visible.length, truncated: false, unknown_time: 0 },
    status: "ready",
  };
}

declare global {
  interface Window {
    __CITY_ISOLATION_FIXTURE__?: boolean;
    __TAURI__?: {
      core?: {
        invoke<T>(command: string, args?: Record<string, unknown>): Promise<T>;
      };
    };
  }
}

/** Explicit synthetic aggregates for previewing facility panels; never a fallback for local data. */
function completeFixture(projection: CityProjectionV1): CityProjectionV1 {
  const days = new Map<string, { date: string; session_count: number; event_count: number; tokens: number }>();
  const sessions = projection.sessions.map((session) => {
    const day=session.first_event_at.slice(0,10);
    const item=days.get(day) ?? {date:day,session_count:0,event_count:0,tokens:0};
    item.session_count++; item.event_count+=session.event_count ?? 1; item.tokens+=session.tokens.total; days.set(day,item);
    return { ...session, event_count: session.event_count ?? 1,
      tokens: { ...session.tokens, uncached_input: session.tokens.input, cache_read: 0, cache_write: 0 },
      model_ids: [`fixture/${session.harness}-model`] };
  });
  const tokens=sessions.reduce((sum,s)=>({input:sum.input+s.tokens.input,output:sum.output+s.tokens.output,total:sum.total+s.tokens.total}),{input:0,output:0,total:0});
  const activity=[...days.values()].sort((a,b)=>a.date.localeCompare(b.date));
  const busiest=[...activity].sort((a,b)=>b.session_count-a.session_count || b.tokens-a.tokens || b.date.localeCompare(a.date))[0] ?? null;
  return { ...projection, sessions, summary:{session_count:sessions.length,usage_event_count:sessions.reduce((n,s)=>n+s.event_count,0),
      tokens:{...tokens,uncached_input:tokens.input,cache_read:0,cache_write:0}},
    models:[...new Set(sessions.flatMap((s)=>s.model_ids))].sort(),
    model_coverage:{unknown_model_usage_events:0,legacy_usage_events:0},activity:{days:activity,busiest_day:busiest,timezone:"UTC"} };
}
async function readV3(payload: Record<string, unknown>, signal?: AbortSignal): Promise<CityProjectionV3> {
  if (signal?.aborted) throw new Error("city_request_cancelled");
  const request: PluginRequestV1 = { version: 1, instanceId: window.__AV_PLUGIN_INSTANCE__ ?? "city-standalone",
    requestId: `city-request-${++requestSequence}`, method: "data.read", payload: { projection: "city", version: 3, ...payload } };
  const response = await invokeHost<PluginResponseV1<CityProjectionV3>>("plugin_request", { request });
  if (signal?.aborted) throw new Error("city_request_cancelled");
  if (response.version !== 1 || response.requestId !== request.requestId) throw new Error("plugin_response_invalid");
  if (!response.ok || !response.result) throw new Error(response.error?.code ?? "plugin_request_failed");
  return validateCityProjectionV3(response.result);
}
function continuation(context: CitySnapshotV3): Record<string, unknown> {
  return { expected_revision: context.data_revision, snapshot: context.snapshot, context: context.context,
    query_semantics: context.query_semantics, window: context.window };
}
export async function readCitySessionDetail(projection: CityProjectionV1, id: string, signal?: AbortSignal): Promise<CityProjectionV1["sessions"][number]> {
  if (!projection.v3_context) {
    const session = projection.sessions.find((s) => s.id === id);
    if (!session) throw new Error("session_unavailable");
    return session;
  }
  const response = await readV3({ ...continuation(projection.v3_context), operation: "session.detail", id, include_excerpts: true }, signal);
  if (response.snapshot !== projection.v3_context.snapshot || response.detail?.id !== id) throw new Error("city_detail_invalid");
  const detail = response.detail;
  return { ...detail, cost_minor: detail.cost.cost_minor, cost_breakdown: detail.cost.breakdown, cost_complete: detail.cost.complete,
    cost_status: { state: detail.cost.status, reason: detail.cost.reason, has_unresolved: detail.cost.has_unresolved } };
}
export async function readCityModule(projection: CityProjectionV1, module: "findings" | "skills" | "workflow", signal?: AbortSignal, fresh = false, harness?: string) {
  if (projection.source !== "local") return { source: "fixture" as const, window: projection.window, generated_at: projection.generated_at,
    result: module === "findings" ? { state: "ready", supported: true, data: { current_backlog: projection.findings.filter((row) => !harness || row.harness === harness), window_new: [], detail_state: "unsupported" } }
      : module === "skills" ? { state: "ready", supported: true, data: { coverage: "synthetic_fixture", inventory_included: false, truncated: false,
        skills: projection.harnesses.filter((item) => !harness || item.id === harness).map((item) => ({ harness: item.id,
          skill: "demo-code-review", invocations: 3, sessions: 2, finished_events: 2, failed_events: 1, succeeded_events: 1,
          last_invoked_at_ms: Date.parse(projection.window.to) - 60000 })) } }
      : { state: "unsupported", supported: false, reason: "projection_not_registered" } };
  const context = (fresh ? undefined : projection.v3_context) ?? await readV3({ operation: "overview", windowDays: projection.window.days,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, page_size: 1 }, signal);
  const response = await readV3({ ...continuation(context), operation: "module.read", module, ...(harness ? { harness } : {}) }, signal);
  if (harness && (response as unknown as { scope?: { harness?: string } }).scope?.harness !== harness) throw new Error("city_module_scope_mismatch");
  return response;
}
export const tauriCityDataProvider: CityDataProvider = {
  async getProjection({ windowDays, signal, onStage }) {
    const standalone = !window.__AV_PLUGIN_INSTANCE__;
    if (standalone && new URLSearchParams(location.search).get("demo") === "1") return completeFixture(demoCityProjection(windowDays));
    if (standalone || window.__CITY_ISOLATION_FIXTURE__) return completeFixture(fixtureProjection(windowDays));
    if (new URLSearchParams(location.search).get("cityData") !== "v3") {
      onStage?.("reading_summary");
      const request: PluginRequestV1 = { version: 1, instanceId: window.__AV_PLUGIN_INSTANCE__!, requestId: `city-request-${++requestSequence}`,
        method: "data.read", payload: { projection: "city", version: 2, windowDays } };
      const response = await invokeHost<PluginResponseV1<CityProjectionV1>>("plugin_request", { request });
      if (signal?.aborted) throw new Error("city_request_cancelled");
      if (response.version !== 1 || response.requestId !== request.requestId) throw new Error("plugin_response_invalid");
      if (!response.ok || !response.result) throw new Error(response.error?.code ?? "plugin_request_failed");
      onStage?.("ready");
      return validateCityProjectionV2(response.result);
    }
    // Stage pages privately; apply the model once. A revision change discards every staged page.
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        onStage?.("reading_summary");
        const first = await readV3({ operation: "overview", windowDays, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          calendar_mode: "rolling", page_size: 500 }, signal);
        if (!first.page || !first.harnesses || !first.modules?.overview.data) throw new Error("city_overview_invalid");
        const context: CitySnapshotV3 = { data_revision: first.data_revision, snapshot: first.snapshot, context: first.context,
          query_semantics: first.query_semantics, window: first.window };
        const sessions = [...first.page.sessions];
        const ids = new Set(sessions.map((session) => session.id));
        let cursor = first.page.next_cursor;
        onStage?.("reading_sessions");
        while (cursor && sessions.length < 4000) {
          const page = await readV3({ ...continuation(context), operation: "sessions.page", cursor, page_size: 500 }, signal);
          if (page.snapshot !== first.snapshot || !page.page || page.page.coverage.offset !== sessions.length
            || page.page.sessions.length === 0) throw new Error("city_page_invalid");
          for (const session of page.page.sessions) {
            if (ids.has(session.id)) throw new Error("city_page_duplicate");
            ids.add(session.id); sessions.push(session);
          }
          if (page.page.next_cursor === cursor) throw new Error("city_cursor_invalid");
          cursor = page.page.next_cursor;
        }
        sessions.sort((a,b) => a.layout_order - b.layout_order);
        const summary = first.modules.overview.data as CityProjectionV1["summary"] & {
          models?: { model_ids?: string[] }; time_classification?: { unknown_time_only: number; mixed_time: number } };
        const activity = first.modules.activity.data as CityProjectionV1["activity"];
        if (!summary?.tokens || !Number.isSafeInteger(summary.tokens.total)) throw new Error("city_overview_invalid");
        onStage?.("ready");
        return { protocol: "city:v2", source: "local", v3_context: context, data_revision: first.data_revision,
          generated_at: first.generated_at, harnesses: first.harnesses,
          window: { days: windowDays, label: `最近 ${windowDays} 天`, from: first.window.from, to: first.window.to },
          sessions, models: summary.models?.model_ids ?? [], activity, summary,
          findings: [], coverage: { total: first.page.coverage.matched, returned: sessions.length,
            truncated: first.page.coverage.matched > sessions.length,
            unknown_time: (summary.time_classification?.unknown_time_only ?? 0) + (summary.time_classification?.mixed_time ?? 0),
            findings_state: "unavailable" }, status: first.page.coverage.matched > 0 ? "ready" : "empty" };
      } catch (error) {
        if (!(error instanceof Error) || error.message !== "revision_changed" || attempt === 2) throw error;
      }
    }
    throw new Error("revision_changed");
  },
};
