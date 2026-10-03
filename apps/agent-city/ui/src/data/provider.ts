import { invokeHost } from "../host";
import type { PluginRequestV1, PluginResponseV1, CityUiProjectionV1 } from "@agent-vitals/app-sdk";

export type CityProjectionV1 = CityUiProjectionV1;

export interface CityDataProvider {
  getProjection(input: { windowDays: 7 | 30 | 90 | 366 }): Promise<CityProjectionV1>;
}

let requestSequence = 0;

function fixtureProjection(windowDays: 7 | 30 | 90 | 366): CityProjectionV1 {
  const from = ({ 7: "2026-09-27T00:00:00Z", 30: "2026-09-03T00:00:00Z", 90: "2026-07-06T00:00:00Z", 366: "2025-10-03T00:00:00Z" } as const)[windowDays];
  const allSessions: CityProjectionV1["sessions"] = [
    { id: "fixture-session-001", harness: "codex", first_event_at: "2026-10-02T09:10:00Z", last_event_at: "2026-10-02T09:42:00Z", tokens: { input: 12400, output: 3100, total: 15500 } },
    { id: "fixture-session-002", harness: "claude_code", first_event_at: "2026-09-28T14:05:00Z", last_event_at: "2026-09-28T14:51:00Z", tokens: { input: 8700, output: 2200, total: 10900 } },
    { id: "fixture-session-003", harness: "codex", first_event_at: "2026-09-17T07:20:00Z", last_event_at: "2026-09-17T08:02:00Z", tokens: { input: 22100, output: 5400, total: 27500 } },
  ];
  const sessions = allSessions.filter((session) => session.first_event_at >= from);
  return {
    protocol: "city:v1",
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
      payload: { projection: "city", version: 1, windowDays },
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
