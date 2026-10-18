import { invokeHost } from "../host";
import type { PluginRequestV1, PluginResponseV1, CityUiProjectionV2 } from "@agent-vitals/app-sdk";

export type CityProjectionV1 = CityUiProjectionV2;

export interface CityDataProvider {
  getProjection(input: { windowDays: 7 | 30 | 90 | 366 }): Promise<CityProjectionV1>;
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

export const tauriCityDataProvider: CityDataProvider = {
  async getProjection({ windowDays }) {
    const request: PluginRequestV1 = {
      version: 1,
      instanceId: window.__AV_PLUGIN_INSTANCE__ ?? "city-standalone",
      requestId: `city-request-${++requestSequence}`,
      method: "data.read",
      payload: { projection: "city", version: 2, windowDays },
    };
    const standalone = !window.__AV_PLUGIN_INSTANCE__;
    if (standalone && new URLSearchParams(location.search).get("demo") === "1") return demoCityProjection(windowDays);
    if (standalone || window.__CITY_ISOLATION_FIXTURE__) return fixtureProjection(windowDays);
    const response = await invokeHost<PluginResponseV1<CityProjectionV1>>("plugin_request", { request });
    if (response.version !== 1 || response.requestId !== request.requestId) throw new Error("plugin_response_invalid");
    if (response.ok && response.result) return response.result;
    // Embedded failures must not masquerade as real data via fixture fallback.
    throw new Error(response.error?.code ?? "plugin_request_failed");
  },
};
