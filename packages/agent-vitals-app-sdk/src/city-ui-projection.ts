/** Official same-host City MVP contract. Not the legacy paginated app-local schema. */
export type CityUiProjectionV1 = {
  protocol: "city:v1";
  source?: "local" | "fixture";
  data_revision?: number;
  generated_at: string | null;
  window: { days: 7 | 30 | 90 | 366; label: string; from: string; to: string };
  sessions: Array<{
    id: string;
    harness: string;
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
