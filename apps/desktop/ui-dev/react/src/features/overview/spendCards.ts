import type { DailySummary, UsageSourceSummary } from "../../lib/tauri";
import { formatMajorMoney, message } from "../../lib/i18n";

type SpendCard = { value: string; detail: string };

function available(summary: UsageSourceSummary | DailySummary | null): boolean {
  return summary !== null && summary.freshness !== "unavailable" && summary.freshness !== "unknown";
}

function formatAmount(currency: string, amount: number): string {
  return formatMajorMoney(amount, currency);
}

function rankedEntries(values: Record<string, number>): Array<[string, number]> {
  const rank = (currency: string) => currency === "CNY" ? 0 : currency === "USD" ? 1 : 2;
  return Object.entries(values).filter(([, amount]) => amount > 0)
    .sort(([left], [right]) => rank(left) - rank(right) || left.localeCompare(right));
}

function meteredEstimateNote(summary: UsageSourceSummary | DailySummary): string {
  const hasEstimate = Object.values(summary.metered_view).some((row) => row.declared_estimate > 0 || row.default_estimate > 0);
  return hasEstimate ? message("spend.estimateExcluded") : "";
}

function card(values: Record<string, number>, notes: string[]): SpendCard {
  const entries = rankedEntries(values);
  if (!entries.length) return { value: "—", detail: notes.join(" · ") || message("spend.noVerified") };
  const [[currency, amount], ...other] = entries;
  const extra = other.length ? message("spend.otherCurrencies", undefined, { amounts: other.map(([unit, value]) => formatAmount(unit, value)).join(" · ") }) : "";
  return { value: formatAmount(currency, amount), detail: [extra, ...notes].filter(Boolean).join(" · ") };
}

export function monthSpendCard(monthly: UsageSourceSummary | null): SpendCard {
  if (!available(monthly) || !monthly) return { value: "—", detail: message("spend.unavailableMonth") };
  const notes = [rankedEntries(monthly.actual_spend).length ? message("spend.recordedOrDeclared") : monthly.total_tokens > 0 ? message("spend.noConfirmed") : message("spend.noUsageMonth"), meteredEstimateNote(monthly)];
  if (monthly.has_unresolved || monthly.freshness === "partial") notes.push(message("spend.unresolved"));
  if (monthly.freshness === "stale") notes.push(message("spend.staleMonth"));
  return card(monthly.actual_spend, notes);
}

export function todaySpendCard(daily: DailySummary | null, monthly: UsageSourceSummary | null): SpendCard {
  if (!available(daily) || !daily) return { value: "—", detail: message("spend.unavailableToday") };
  const spend = { ...daily.actual_spend };
  let hasSubscription = false;
  if (available(monthly) && monthly && monthly.month === daily.date.slice(0, 7)) {
    const [year, month] = monthly.month.split("-").map(Number);
    const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
    for (const [currency, amount] of Object.entries(monthly.spend_by_basis.fixed_subscription ?? {})) {
      if (amount <= 0) continue;
      spend[currency] = (spend[currency] ?? 0) + amount / daysInMonth;
      hasSubscription = true;
    }
  }
  const notes = [hasSubscription ? message("spend.subscriptionAllocated") : rankedEntries(spend).length ? message("spend.recordedToday") : daily.total_tokens > 0 ? message("spend.noConfirmed") : message("spend.noUsageToday"), meteredEstimateNote(daily)];
  if (daily.has_unresolved || daily.freshness === "partial") notes.push(message("spend.unresolved"));
  if (daily.freshness === "stale") notes.push(message("spend.staleToday"));
  if (!hasSubscription && !available(monthly)) notes.push(message("spend.subscriptionUnknown"));
  return card(spend, notes);
}
