// Browser-only Tauri facade for visual iteration.
// Vite injects this file in `serve` mode only; the packaged app keeps the real
// `window.__TAURI__` supplied by Tauri and never loads this facade.
(function installBrowserTauriMock() {
  "use strict";
  if (window.__TAURI__) return;

  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  const dayInSystemTimezone = (value) => {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit",
    }).formatToParts(value);
    const values = Object.fromEntries(parts.filter((p) => p.type !== "literal").map((p) => [p.type, p.value]));
    return values.year + "-" + values.month + "-" + values.day;
  };
  const today = new Date();
  const isoDay = dayInSystemTimezone(today);
  const month = isoDay.slice(0, 7);
  const previousDay = dayInSystemTimezone(new Date(today.getTime() - 86400000));

  const byProvider = {
    "codex/openai": {
      currency: "USD",
      amounts_by_basis: { api_equivalent: 14.82 },
      has_unresolved: false,
      pricing_method: "official-price-card",
      evidence_basis: "route-evidence",
    },
    "claude-code/anthropic": {
      currency: "USD",
      amounts_by_basis: { fixed_subscription: 20 },
      has_unresolved: true,
      unresolved_reason: "subscription-token-usage-is-not-a-per-token-bill",
      evidence_basis: "official-subscription",
    },
    "dsh/deepseek": {
      currency: "CNY",
      amounts_by_basis: { metered_actual: 8.64 },
      has_unresolved: false,
      pricing_method: "official-price-card",
      evidence_basis: "metered-bill",
    },
  };

  function dto(tokens) {
    return {
      tokens_by_host: {
        codex: { total: Math.round(tokens * 0.46), uncached_input: Math.round(tokens * 0.26), cache_read: Math.round(tokens * 0.12), cache_write: Math.round(tokens * 0.03), output: Math.round(tokens * 0.05) },
        "claude-code": { total: Math.round(tokens * 0.34), uncached_input: Math.round(tokens * 0.20), cache_read: Math.round(tokens * 0.08), cache_write: Math.round(tokens * 0.02), output: Math.round(tokens * 0.04) },
        dsh: { total: Math.round(tokens * 0.20), uncached_input: Math.round(tokens * 0.12), cache_read: Math.round(tokens * 0.04), cache_write: Math.round(tokens * 0.01), output: Math.round(tokens * 0.03) },
      },
      by_provider: byProvider,
      total_actual_spend: { CNY: 8.64 },
      by_host: {
        codex: { amounts_by_basis: { api_equivalent: 14.82 }, freshness: { state: "fresh", last_observed_at: isoDay }, has_unresolved: false, pricing_method: "provider-card" },
        "claude-code": { amounts_by_basis: { fixed_subscription: 20 }, freshness: { state: "partial", last_observed_at: isoDay }, has_unresolved: true, pricing_method: "fair-market-fallback", unresolved_reason: "missing-provider-route-evidence" },
        dsh: { amounts_by_basis: { metered_actual: 8.64 }, freshness: { state: "fresh", last_observed_at: isoDay }, has_unresolved: false, pricing_method: "provider-card" },
      },
      coverage: { measured_fields: 3, total_fields: 3, denominator_version: 1 },
      excluded_hosts: [],
      total_summable: 8.64,
      freshness: { state: "partial", last_observed_at: isoDay },
    };
  }

  const overview = {
    sync: { ok: true, stage: "complete", at: new Date().toISOString(), message: "浏览器样式调试数据" },
    fx: { usd_cny: 7.15, as_of: month },
    days: [{ date: isoDay, total: 0 }],
    budget: { source: "sql", level: "warn", month_ratio: 0.68, month_cost: 68, monthly_cny: 100, effective_daily_budget: 5, generated_at: new Date().toISOString(), reasons: ["browser mock"] },
    budget_monthly_cny: 100,
    estimate_note: "浏览器调试数据，不会写入本地数据库",
    data_home: "浏览器调试模式",
  };

  const calendar = {
    days: {
      [previousDay]: { total_tokens: 128000, dsh_cost_cny: 2.34, claude_cost_usd: 1.12 },
      [isoDay]: { total_tokens: 246000, codex_cost_usd: 0.84, dsh_cost_cny: 3.21 },
    },
  };

  const sessions = [{
    session_ref: "sr_browser_mock_01",
    title: "浏览器样式调试会话",
    host: "codex",
    model_ids: ["gpt-5.6-sol"],
    first_event_at: new Date(Date.now() - 3600000).toISOString(),
    last_event_at: new Date().toISOString(),
    tokens: { total: 246000 },
    cost_minor: { amount_minor: 84, currency: "USD", basis: "metered_estimate" },
    cost_status: { state: "estimated", reason: "no-billing-declaration" },
  }];

  const ok = (data) => Promise.resolve(data);
  const emptyReport = (key) => ({ status: "ok", [key]: [] });
  async function invoke(command, args) {
    try {
      switch (command) {
      case "read_overview": return overview;
      case "data_daily_summary": return dto(246000);
      case "data_monthly_summary": return dto(374000);
      case "read_calendar_month": return calendar;
      case "data_status": return { status: "ok", data: { health: "warn", integrity: "ok", facts: 42, unresolved_tokens: 18000, unpriced_tokens: 0, pricing: { stale: false }, hints: ["浏览器 mock 数据，不会写入本地库"] } };
      case "billing_import_candidates": return emptyReport("candidates");
      case "billing_declarations": return emptyReport("declarations");
      case "host_bills_for_period": return emptyReport("bills");
      case "data_source_status": return { status: "ok", sources: [{ host: "codex", scan: { source_count: 12 }, import_scope: { sessions: 8 } }] };
      case "budget_config": return { status: "ok", monthly_cny_minor: 10000, daily_cny_minor: 500, warning_ratio_bp: 80, origin: "user" };
      case "budget_profiles_status": return { status: "ok", profiles: [] };
      case "retention_config": return { status: "ok", months: 13 };
      case "statistics_timezone_config": return { status: "ok", timezone, system_timezone: timezone };
      case "data_codex_quota": return { plan_type: "Plus", limits: { primary: { used_percent: 38, resets_at: Math.floor(Date.now() / 1000) + 7200 } } };
      case "sessions_list": return { data: { sessions, next_cursor: null, has_more: false, window_session_count: sessions.length, window_total_tokens: 246000 } };
      case "sessions_read": return { data: { session: sessions[0], events: [], findings: [] } };
      case "sessions_issues": return { data: { items: [], next_cursor: null, has_more: false, total: 0 } };
      case "issue_group_instances": return { data: { instances: [], next_cursor: null, has_more: false, total: 0 } };
      case "source_read_locations": return { status: "ok", locations: [] };
      case "sync_pause_state": return { paused: false };
      case "peek_nav_target": case "peek_focus_target": return null;
      case "billing_recalculation_job_status": return { status: "missing" };
      case "sync_request_status": return { completed: true };
      case "trigger_sync": return "browser-mock-sync";
      case "set_sync_paused": case "set_source_host_excluded": case "clear_nav_target": case "clear_focus_target": return ok({ status: "ok" });
        default: return ok({ status: "ok", browser_mock: true, command, args });
      }
    } catch (error) {
      console.error("[browser-mock] invoke failed", command, error);
      throw error;
    }
  }

  window.__TAURI__ = {
    core: { invoke },
    event: { listen: () => Promise.resolve(() => {}) },
    notification: null,
  };
})();
