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
  const synthetic = Number(new URLSearchParams(location.search).get("fixtureSessions"));
  const allSessions: CityProjectionV1["sessions"] = Number.isInteger(synthetic) && synthetic > 0 ? syntheticSessions(Math.min(synthetic, 3000)) : [
    { id: "fixture-session-001", harness: "codex", first_event_at: "2026-10-02T09:10:00Z", last_event_at: "2026-10-02T09:42:00Z", tokens: { input: 12400, output: 3100, total: 15500 } },
    { id: "fixture-session-002", harness: "claude_code", first_event_at: "2026-09-28T14:05:00Z", last_event_at: "2026-09-28T14:51:00Z", tokens: { input: 8700, output: 2200, total: 10900 } },
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
    if (standalone || window.__CITY_ISOLATION_FIXTURE__) return fixtureProjection(windowDays);
    const response = await invokeHost<PluginResponseV1<CityProjectionV1>>("plugin_request", { request });
    if (response.version !== 1 || response.requestId !== request.requestId) throw new Error("plugin_response_invalid");
    if (response.ok && response.result) return response.result;
    // Embedded failures must not masquerade as real data via fixture fallback.
    throw new Error(response.error?.code ?? "plugin_request_failed");
  },
};
