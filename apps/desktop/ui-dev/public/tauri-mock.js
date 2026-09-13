// Browser-only Tauri facade for visual iteration.
// Vite injects this file in `serve` mode only; the packaged app keeps the real
// `window.__TAURI__` supplied by Tauri and never loads this facade.
(function installBrowserTauriMock() {
  "use strict";
  if (window.__TAURI__) return;

  let timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
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
    // 真实场景：MiniMax 订阅 ¥49/月，经 Claude Code 中转使用——与 anthropic 同宿主、
    // 不同服务商、不同币种，必须各占一行、永不相加（CLAUDE.md 的反面教材）。
    "claude-code/minimax": {
      currency: "CNY",
      amounts_by_basis: { fixed_subscription: 49, api_equivalent: 56.2 },
      has_unresolved: false,
      pricing_method: "official-price-card",
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

  // 形状出处：crates/agent-vitals-domain/src/domain/data_contract.rs
  //   MonthlySummary::to_json / DailySummary::to_json（total_actual_spend =
  //   by_provider summable 档按币分桶，含订阅月费；actual_spend_by_basis 是它
  //   的按 basis 拆栏，各栏之和恒等于 total_actual_spend）。日粒度 by_provider
  //   恒无 fixed_subscription（订阅费不摊进日账）——两份 DTO 不能共用一份
  //   by_provider，否则 mock 自己就违反 domain 不变量。
  const dailyByProvider = {
    "codex/openai": { ...byProvider["codex/openai"], amounts_by_basis: { api_equivalent: 0.84 } },
    "claude-code/anthropic": { ...byProvider["claude-code/anthropic"], amounts_by_basis: {} },
    "claude-code/minimax": { ...byProvider["claude-code/minimax"], amounts_by_basis: { api_equivalent: 4.1 } },
    "dsh/deepseek": { ...byProvider["dsh/deepseek"], amounts_by_basis: { metered_actual: 3.21 } },
  };

  function dto(tokens, opts) {
    const daily = !!(opts && opts.daily);
    return {
      ...(daily ? { date: opts.date || isoDay } : { month: opts && opts.month || month }),
      has_unresolved: true,
      last_observed_at: isoDay,
      tokens_by_host: {
        codex: { total: Math.round(tokens * 0.46), uncached_input: Math.round(tokens * 0.26), cache_read: Math.round(tokens * 0.12), cache_write: Math.round(tokens * 0.03), output: Math.round(tokens * 0.05) },
        "claude-code": { total: Math.round(tokens * 0.34), uncached_input: Math.round(tokens * 0.20), cache_read: Math.round(tokens * 0.08), cache_write: Math.round(tokens * 0.02), output: Math.round(tokens * 0.04) },
        dsh: { total: Math.round(tokens * 0.20), uncached_input: Math.round(tokens * 0.12), cache_read: Math.round(tokens * 0.04), cache_write: Math.round(tokens * 0.01), output: Math.round(tokens * 0.03) },
      },
      by_provider: daily ? dailyByProvider : byProvider,
      total_actual_spend: daily ? { CNY: 3.21 } : { CNY: 57.64, USD: 20 },
      actual_spend_by_basis: daily
        ? { metered_actual: { CNY: 3.21 } }
        : { fixed_subscription: { CNY: 49, USD: 20 }, metered_actual: { CNY: 8.64 } },
      by_host: {
        codex: { amounts_by_basis: { api_equivalent: 14.82 }, freshness: { state: "fresh", last_observed_at: isoDay }, has_unresolved: false, pricing_method: "provider-card" },
        // by_host 的 claude-code 条目混币（USD 20 + CNY 49），故不声明 currency（domain 规则：混币条目 currency=None）。
        "claude-code": { amounts_by_basis: { fixed_subscription: 69, api_equivalent: 56.2 }, freshness: { state: "partial", last_observed_at: isoDay }, has_unresolved: true, pricing_method: "fair-market-fallback", unresolved_reason: "missing-provider-route-evidence" },
        dsh: { amounts_by_basis: { metered_actual: 8.64 }, freshness: { state: "fresh", last_observed_at: isoDay }, has_unresolved: false, pricing_method: "provider-card" },
      },
      coverage: { measured_fields: 3, total_fields: 3, denominator_version: 1 },
      excluded_hosts: [],
      total_summable: daily ? 3.21 : 8.64,
      freshness: { state: "partial", last_observed_at: isoDay },
    };
  }

  // 形状出处：apps/desktop/src-tauri/src/overview.rs SyncStatus::ok →
  //   beijing_timestamp() = runtime::clock::local_timestamp_text，格式
  //   "YYYY-MM-DD HH:MM:SS"（统计时区本地时间，**不是** ISO/UTC）。此前 mock
  //   用 toISOString() 让「上次同步」比同页 note 早 8 小时，是 mock 的错。
  const localStamp = (value) => {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
    }).formatToParts(value);
    const v = Object.fromEntries(parts.filter((p) => p.type !== "literal").map((p) => [p.type, p.value]));
    return v.year + "-" + v.month + "-" + v.day + " " + v.hour.replace("24", "00") + ":" + v.minute + ":" + v.second;
  };
  const overview = {
    sync: { ok: true, stage: "complete", at: localStamp(new Date()), message: "浏览器样式调试数据" },
    fx: { usd_cny: 7.15, as_of: month },
    days: [{ date: isoDay, total: 0 }],
    // 预算分子 = 跨宿主按量实付 CNY = 上面 dto() 的 total_actual_spend.CNY（8.64）。
    // 此前 mock 写 68 → 预算卡「¥68」与本月支出卡「¥8.64」同屏打架（2026-09-01
    // 两卡打架事故的形状复刻）。
    budget: { source: "sql", level: "warn", month_ratio: 0.72, month_cost: 8.64, monthly_cny: 12, effective_daily_budget: 0.6, generated_at: new Date().toISOString(), reasons: ["browser mock"] },
    budget_monthly_cny: 12,
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

  const issueGroups = [
    {
      group_id: "browser-issue-group-1", source_kind: "behavior", rule: "SV613",
      host: "codex", object: "进度停滞: 连续工具失败", evidence_class: "tool_failure",
      bucket: isoDay, count: 3, first_seen_at_ms: Date.now() - 7200000,
      last_seen_at_ms: Date.now() - 3600000, severity: "warning",
      status_rollup: { open: 3, later: 0, acknowledged: 0, resolved: 0, not_applicable: 0 },
      sessions_count: 1, sample_evidence: [{ issue_id: "browser-issue-1", evidence: "tool failure", metadata: { category: "tool_failure" } }],
      remedy: { remedy_id: "diagnostic-only", diagnostic_only: true }, actionability: 0.7,
      time: Date.now() - 7200000, evidence: "tool_failure", tool_name: "进度停滞: 连续工具失败", category: "tool_failure", hits: 3, sessions: 1,
    },
    {
      group_id: "browser-issue-group-2", source_kind: "billing_candidate", rule: "BILLING_CONFIRMATION",
      host: "codex", object: "openai:2026-09", evidence_class: "USD", bucket: month,
      count: 1, first_seen_at_ms: Date.now() - 1800000, last_seen_at_ms: Date.now() - 1800000,
      severity: "warning", status_rollup: { open: 1, later: 0, acknowledged: 0, resolved: 0, not_applicable: 0 },
      sessions_count: 0, sample_evidence: [{ candidate_id: "browser-candidate-1", provider_id: "openai", currency: "USD", amount_minor: 2000, is_bill: false }],
      remedy: { remedy_id: "diagnostic-only", diagnostic_only: true }, actionability: 0.8,
      time: Date.now() - 1800000, evidence: "USD", tool_name: "openai:2026-09", category: "USD", hits: 1, sessions: 0,
    },
  ];
  const issueInstances = [{
    issue_id: "browser-issue-1", host_kind: "codex", session_key: "browser_mock_session",
    rule: "SV613", status: "open", severity: "warning", evidence: "tool failure",
    opened_at_ms: Date.now() - 7200000, closed_at_ms: null, metadata: { category: "tool_failure", time: Date.now() - 7200000 },
  }];

  let syncPaused = false;
  // Shape: crates/agent-vitals-runtime/src/mcp/mod.rs:488-499 source_status_report()
  // 一行一个 host；生产 error_codes 词表目前只见 permission_denied/permission
  // （mcp/mod.rs:716 测试），file_missing 只在本 mock 里出现过——改用生产词表，
  // 免得设置页规格 §5.6 的映射表在 Vite 里测不到真实分支。
  const sourceStatuses = [
    {
      host: "codex", source_id: "browser-codex", connection_state: "connected",
      scan: { source_count: 12, last_scanned_at_ms: Date.now() - 3600000 },
      log: { last_event_at_ms: Date.now() - 3600000 },
      import_scope: { sessions: 8, facts: 42, first_event_at_ms: Date.now() - 30 * 86400000, last_event_at_ms: Date.now() - 3600000 },
      recovery_action: null,
    },
    {
      host: "claude-code", source_id: "browser-claude", connection_state: "needs_attention",
      scan: { source_count: 4, last_scanned_at_ms: Date.now() - 7200000 },
      log: { last_event_at_ms: Date.now() - 7200000 },
      import_scope: { sessions: 3, facts: 18, first_event_at_ms: Date.now() - 20 * 86400000, last_event_at_ms: Date.now() - 7200000 },
      failed_scope: { sources: 1, error_codes: ["permission_denied"] },
      recovery_action: { label: "重新同步", kind: "retry_source" },
    },
    {
      host: "dsh", source_id: "browser-dsh", connection_state: "connected",
      scan: { source_count: 2, last_scanned_at_ms: Date.now() - 1800000 },
      log: { last_event_at_ms: Date.now() - 1800000 },
      import_scope: { sessions: 2, facts: 9, first_event_at_ms: Date.now() - 5 * 86400000, last_event_at_ms: Date.now() - 1800000 },
      recovery_action: null,
    },
    {
      host: "workbuddy", source_id: "browser-workbuddy", connection_state: "not_detected",
      scan: { source_count: 0 }, log: {},
      import_scope: { sessions: 0, facts: 0 },
      recovery_action: { label: "扫描并接入", kind: "scan_and_connect" },
    },
  ];
  const customRoots = [];
  let retentionMonths = 13;
  let budgetSnoozedUntilMs = null;
  const budgetConfigState = { monthly_cny_minor: 10000, daily_cny_minor: 500, warning_ratio_bp: 8000, origin: "legacy_import" };
  const budgetProfilesState = {
    estimate: { profile_id: "estimate", currency: "CNY", monthly_minor: 20000, daily_minor: null,
      warning_ratio_bp: 8000, spent_minor: 864, ratio_bp: 432, level: "ok", has_unresolved: false, daily_level: "disabled" },
  };
  const billingCandidates = [{
    candidate_id: "browser-candidate-1", status: "pending", host: "codex",
    provider_id: "openai", currency: "USD", amount_minor: 2000,
    billing_period_start: month + "-01",
    impact: { status: "ok", total_tokens: 18000, fact_count: 4, session_count: 1 },
  }];
  const billingDeclarations = [];
  const billingJobs = new Map();
  let pricingNetworkEnabled = true;
  let pricingLastSuccessAt = Date.now() - 3600000;
  const canonicalIssueStatus = (status) => ({ pending: "open", closed: "resolved", wontfix: "not_applicable" }[status] || status || "open");
  const transitionIssue = (issueId, toStatus) => {
    const instance = issueInstances.find((item) => item.issue_id === issueId);
    if (!instance) throw new Error("issue not found: " + issueId);
    const from = canonicalIssueStatus(instance.status);
    const to = canonicalIssueStatus(toStatus);
    if (from === to) return { status: "ok", issue_id: issueId, to_status: to };
    const group = issueGroups.find((item) => item.sample_evidence?.some((evidence) => evidence.issue_id === issueId));
    if (group) {
      const rollup = group.status_rollup;
      rollup[from] = Math.max(0, Number(rollup[from] || 0) - 1);
      rollup[to] = Number(rollup[to] || 0) + 1;
    }
    instance.status = to;
    return { status: "ok", issue_id: issueId, to_status: to };
  };
  const ok = (data) => Promise.resolve(data);
  const emptyReport = (key) => ({ status: "ok", [key]: [] });
  async function invoke(command, args) {
    try {
      switch (command) {
      // Shape: apps/desktop/src-tauri/src/overview.rs:348 Overview (Serialize), :86 SyncStatus::ok,
      // :664 budget_profiles（同一份 budget_profiles_status_sql_at 产出，不是
      // 第二套预算数据——设置页规格 §8 D1：总览预算卡优先读这里的 estimate
      // profile，budgetProfilesState 与 "budget_profiles_status" case 共享同一
      // 状态，两个命令在浏览器 mock 里也不该各算各的）。
      case "read_overview": return { ...overview, budget: { ...overview.budget,
        snoozed_until: budgetSnoozedUntilMs ? new Date(budgetSnoozedUntilMs).toISOString() : null },
        budget_profiles: { status: "ok", month, profiles: Object.values(budgetProfilesState) } };
      // Shape: crates/agent-vitals-domain/src/domain/data_contract.rs:607 DailySummary::to_json.
      case "data_daily_summary": return dto(246000, { daily: true, date: args && args.date });
      // Shape: crates/agent-vitals-domain/src/domain/data_contract.rs:494 MonthlySummary::to_json.
      case "data_monthly_summary": return dto(374000, { month: args && args.month });
      // Shape: apps/desktop/src-tauri/src/lib.rs:2780 read_calendar_month → crates/agent-vitals-runtime/src/summary.rs:1466 calendar_month (json!).
      case "read_calendar_month": return { month: args && args.month || month, days: (args && args.month && args.month !== month) ? {} : calendar.days };
      // Shape: apps/desktop/src-tauri/src/lib.rs:1390 data_status (json!).
      case "data_status": return { status: "ok", data: { health: "warn", integrity: "ok", facts: 42, unresolved_tokens: 18000, unpriced_tokens: 0, pricing: { stale: false }, hints: ["浏览器 mock 数据，不会写入本地库"] } };
      // Shape: apps/desktop/src-tauri/src/lib.rs:1480 billing_import_candidates (json!).
      case "billing_import_candidates": return { status: "ok", candidates: billingCandidates };
      // Shape: apps/desktop/src-tauri/src/lib.rs:2607 billing_recalculation_jobs (json!).
      case "billing_recalculation_jobs": return { status: "ok", jobs: [] };
      // Shape: apps/desktop/src-tauri/src/lib.rs:2325 billing_declarations (json!).
      case "billing_declarations": return { status: "ok", declarations: billingDeclarations };
      case "resolve_billing_import_candidate": {
        const candidate = billingCandidates.find((item) => item.candidate_id === (args && args.candidateId));
        if (!candidate) throw new Error("billing candidate not found");
        const decision = args && args.decision;
        candidate.status = decision === "reopen" ? "pending" : decision === "accept" ? "accepted" : "dismissed";
        return { status: "ok", candidate_id: candidate.candidate_id, decision };
      }
      case "billing_candidate_impact_preview": {
        const candidate = billingCandidates.find((item) => item.host === (args && args.host) && item.provider_id === (args && args.providerId));
        return candidate ? candidate.impact : { status: "unavailable", reason: "candidate not found" };
      }
      case "save_billing_declaration_revision": {
        if ((args && args.relationshipKind) === "unknown") {
          throw new Error("仍不确定的候选必须继续保持 pending，不能保存为计费声明");
        }
        const candidate = billingCandidates.find((item) => item.candidate_id === (args && args.sourceCandidateId));
        if (candidate) candidate.status = "accepted";
        billingDeclarations.push({
          declaration_id: args && args.declarationId,
          revision_id: args && args.revisionId,
          host: args && args.host,
          provider_id: args && args.providerId,
          relationship_kind: args && args.relationshipKind,
          amount_minor: args && args.amountMinor,
          currency: args && args.currency,
          effective_start: args && args.effectiveStart,
          effective_end: args && args.effectiveEnd,
          source_candidate_id: args && args.sourceCandidateId,
          current_revision_id: args && args.revisionId,
          status: "saved",
        });
        return { status: "ok", declaration_id: args && args.declarationId, revision_id: args && args.revisionId };
      }
      case "enqueue_billing_recalculation": {
        billingJobs.set(args && args.jobId, { status: "succeeded" });
        return { status: "queued", job_id: args && args.jobId };
      }
      case "billing_recalculation_job_status": return billingJobs.get(args && args.jobId) || { status: "missing" };
      case "revoke_billing_declaration": {
        const index = billingDeclarations.findIndex((item) => item.declaration_id === (args && args.declarationId));
        if (index >= 0) billingDeclarations.splice(index, 1);
        return { status: "revoked", declaration_id: args && args.declarationId, revision_id: args && args.revisionId };
      }
      case "host_bills_for_period": return emptyReport("bills");
      // Shape: apps/desktop/src-tauri/src/lib.rs:2632 data_source_status (json!).
      case "data_source_status": return { status: "ok", sources: sourceStatuses };
      case "custom_source_roots": return { status: "ok", sources: customRoots };
      // Shape: crates/agent-vitals-runtime/src/budget.rs:140-152（万分比，8000=80%）；
      // 旧字段名沿用 apps/desktop/src-tauri/src/lib.rs:2142 budget_config()。
      case "budget_config": return { status: "ok", ...budgetConfigState };
      case "save_budget_config": {
        const input = (args && args.input) || {};
        Object.assign(budgetConfigState, {
          monthly_cny_minor: input.monthly_cny_minor, daily_cny_minor: input.daily_cny_minor,
          warning_ratio_bp: input.warning_ratio_bp, origin: "user",
        });
        return ok({ status: "saved", updated_at_ms: Date.now(), notification_permission: "granted" });
      }
      case "budget_profiles_status": return { status: "ok", profiles: Object.values(budgetProfilesState) };
      case "save_budget_profile": {
        const input = (args && args.input) || {};
        if (!input.profile_id || !Number.isSafeInteger(input.monthly_minor) || input.monthly_minor <= 0) {
          throw new Error("budget profile requires a positive integer monthly_minor");
        }
        const spent = budgetProfilesState[input.profile_id] ? budgetProfilesState[input.profile_id].spent_minor || 0 : 0;
        const ratioBp = Math.round((spent * 10000) / input.monthly_minor);
        budgetProfilesState[input.profile_id] = {
          profile_id: input.profile_id, currency: input.currency, monthly_minor: input.monthly_minor,
          daily_minor: input.daily_minor ?? null, warning_ratio_bp: input.warning_ratio_bp,
          spent_minor: spent, ratio_bp: ratioBp,
          level: ratioBp >= 10000 ? "exceeded" : ratioBp >= input.warning_ratio_bp ? "warn" : "ok",
          has_unresolved: false, daily_level: input.daily_minor ? "ok" : "disabled",
        };
        return ok({ status: "saved", profile_id: input.profile_id, currency: input.currency, notification_permission: "granted" });
      }
      case "snooze_budget_current_period": {
        budgetSnoozedUntilMs = Date.parse(month + "-28T23:59:59+08:00");
        return ok({ status: "ok", snoozed_until_ms: budgetSnoozedUntilMs });
      }
      case "clear_budget_snooze": {
        budgetSnoozedUntilMs = null;
        return ok({ status: "ok" });
      }
      case "retention_config": return { status: "ok", months: retentionMonths, minimum_months: 1, maximum_months: 60 };
      case "save_retention_config": {
        const input = (args && args.input) || {};
        if (!Number.isInteger(input.months) || input.months < 1 || input.months > 60) {
          throw new Error("retention months must be an integer between 1 and 60");
        }
        retentionMonths = input.months;
        return ok({ status: "saved", months: retentionMonths });
      }
      case "export_diagnostic_package": return ok({ status: "saved", path: "/tmp/agent-vitals-diagnostic-browser-mock.zip", upload_performed: false });
      // Shape: apps/desktop/src-tauri/src/lib.rs:1708 statistics_timezone_config (json!).
      case "statistics_timezone_config": return { status: "ok", timezone, system_timezone: timezone };
      case "save_statistics_timezone_config": {
        const next = String((args && args.timezone) || "").trim();
        if (!next) throw new Error("statistics timezone must be a non-empty IANA name");
        try {
          new Intl.DateTimeFormat("en-US", { timeZone: next }).format();
        } catch (_) {
          throw new Error("unknown IANA statistics timezone: " + next);
        }
        timezone = next;
        return { status: "saved", timezone };
      }
      case "public_pricing_catalog_status": return { state: "ok", network_enabled: pricingNetworkEnabled, source_url: "https://example.invalid/pricing.json", source_version: "public-browser-mock", model_count: 7, last_success_at_ms: pricingLastSuccessAt };
      case "save_public_pricing_catalog_policy": {
        pricingNetworkEnabled = !!(args && args.networkEnabled);
        return { status: "saved", network_enabled: pricingNetworkEnabled };
      }
      case "update_public_pricing_catalog": {
        if (!pricingNetworkEnabled) throw new Error("公共价格联网检查未开启；继续使用本地价卡");
        pricingLastSuccessAt = Date.now();
        return { status: "updated", source_url: "https://example.invalid/pricing.json", source_version: "public-browser-mock", model_count: 7, last_success_at_ms: pricingLastSuccessAt };
      }
      case "about_diagnostics": return { status: "ok", app_version: "browser-mock", cli_version: "browser-mock", engine_version: "browser-mock", architecture: "browser-mock", authority_schema: "browser-mock", statistics_timezone: timezone, pricing: { version: "public-browser-mock", captured_at_ms: Date.now() - 3600000 }, sync: { ok: true, message: "浏览器样式调试数据" } };
      case "open_trusted_releases_page": return { status: "opened", url: "https://example.invalid/releases", automatic_install: false };
      case "restore_authority_backup": return { status: "cancelled" };
      case "check_for_updates": return { status: "ok", current_version: "browser-mock", latest_tag: "app-v1.0.0", url: "https://example.invalid/releases", automatic_install: false };
      // 形状出处：hosts/codex/sessions/usage.rs plan_from_rate_limits →
      //   { plan_type, has_credits, limits: { primary: {...} }, observed_at }（事件的 ISO 时间戳）。
      // Shape: apps/desktop/src-tauri/src/lib.rs:2767 data_codex_quota → crates/agent-vitals-hosts/src/hosts/codex/sessions/usage.rs:191 plan_from_rate_limits.
      case "data_codex_quota": return { plan_type: "Plus", has_credits: false, limits: { primary: { used_percent: 38, window_minutes: 10080, resets_at: Math.floor(Date.now() / 1000) + 7200 } }, observed_at: new Date(Date.now() - 1500000).toISOString() };
      case "sessions_list": return { data: { sessions, next_cursor: null, has_more: false, window_session_count: sessions.length, window_total_tokens: 246000 } };
      case "sessions_read": return { data: { session: sessions[0], events: [], findings: [] } };
      case "sessions_issues": return {
        totals: { issues: issueGroups.length, findings: issueGroups.length, critical: 0, warning: issueGroups.length, info: 0, sessions: 1, sessions_total: 1 },
        rules: issueGroups.map((group) => ({ rule: group.rule, severity: group.severity, category: group.category, hits: group.hits, sessions: group.sessions })),
        issues: issueGroups, findings: [], source: "browser_mock", next_cursor: null, source_projection_count: 1,
      };
      case "issue_group_instances": return { group_id: args && args.groupId, instances: issueInstances, next_cursor: null, total_instances: issueInstances.length };
      case "issue_instance_read": return { status: "ok", issue: issueInstances.find((item) => item.issue_id === (args && args.issueId)) || null };
      case "issue_transition": return transitionIssue(args && args.issueId, args && args.toStatus);
      case "source_read_locations": return { status: "ok", locations: { codex: "~/.codex", "claude-code": "~/.claude", dsh: "~/.deepseek" } };
      case "sync_pause_state": return { status: "ok", paused: syncPaused };
      case "peek_nav_target": case "peek_focus_target": return null;
      case "sync_request_status": return { completed: true };
      case "trigger_sync": {
        for (const source of sourceStatuses) {
          if (source.connection_state === "needs_attention") {
            source.connection_state = "connected";
            source.failed_scope = {};
            source.recovery_action = null;
          }
        }
        return "browser-mock-sync";
      }
      case "set_sync_paused":
        syncPaused = !!(args && args.paused);
        return ok({ status: "ok", paused: syncPaused });
      case "set_source_host_excluded": {
        const input = (args && args.input) || {};
        const source = sourceStatuses.find((item) => item.host === input.host);
        if (!source) throw new Error("source host not found");
        source.connection_state = input.excluded ? "excluded" : "connected";
        source.failed_scope = input.excluded ? {} : source.failed_scope;
        source.recovery_action = input.excluded
          ? { label: "恢复读取", kind: "include_source" }
          : null;
        return ok({ status: "ok", host: source.host, excluded: !!input.excluded });
      }
      case "delete_imported_source_data": {
        const source = sourceStatuses.find((item) => item.host === (args && args.host));
        if (!source) throw new Error("source host not found");
        const scope = source.import_scope || {};
        const result = { facts: Number(scope.facts || 0), sessions: Number(scope.sessions || 0) };
        source.import_scope = { facts: 0, sessions: 0 };
        source.connection_state = "excluded";
        return ok(result);
      }
      case "pick_custom_source_root": return "/tmp/agent-vitals-browser-custom-source";
      case "add_custom_source_root": {
        const input = (args && args.input) || {};
        if (!input.host || !input.root) throw new Error("custom source host and root are required");
        const exists = customRoots.some((item) => item.host === input.host && item.root === input.root);
        if (!exists) customRoots.push({ host: input.host, root: input.root });
        return ok({ status: "ok", changed: !exists });
      }
      case "remove_custom_source_root": {
        const input = (args && args.input) || {};
        const index = customRoots.findIndex((item) => item.host === input.host && item.root === input.root);
        if (index >= 0) customRoots.splice(index, 1);
        return ok({ status: "ok", changed: index >= 0 });
      }
      case "clear_nav_target": case "clear_focus_target": return ok({ status: "ok" });
        default: throw new Error("Unsupported browser mock command: " + command);
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
