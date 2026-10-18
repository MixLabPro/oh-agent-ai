/** Official same-host City MVP contract. Not the legacy paginated app-local schema. */
import type { HarnessPublicIdentityV1 } from "./harness-data.js";
export type CityUiProjectionV2 = {
  protocol: "city:v2";
  harnesses: HarnessPublicIdentityV1[];
  source?: "local" | "fixture";
  data_revision?: number;
  generated_at: string | null;
  window: { days: 7 | 30 | 90 | 366; label: string; from: string; to: string };
  sessions: Array<{
    id: string;
    harness: string;
    /** 会话标题（V32，City 楼名）：codex thread_name / claude ai-title /
     *  dsh workspace title 的已脱敏、已截断投影；null = 无标题证据（UI 走
     *  fallback 命名）。本地 app 投影专用，不进 MCP/export 面。 */
    title?: string | null;
    /** 标题来源闭集：codex_thread_name | claude_ai_title | dsh_workspace_title。 */
    title_source?: string | null;
    first_event_at: string;
    last_event_at: string;
    tokens: { input: number; output: number; total: number };
    event_count?: number;
    task_excerpts?: Array<{ role: "user_first" | "user_turn"; text: string; provenance: "verbatim" | "truncated" | "scrubbed"; is_excerpt: true }>;
  }>;
  findings: Array<{ harness: string; severity: "critical" | "warning" | "info"; count: number }>;
  coverage: { total: number; returned: number; truncated: boolean; unknown_time: number; findings_state?: "unavailable" | "partial" };
  status: "ready" | "empty" | "stale" | "unavailable";
};
