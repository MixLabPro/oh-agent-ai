import type { DailySummary, UsageSourceSummary } from "../../lib/tauri";

type SpendCard = { value: string; detail: string };

function available(summary: UsageSourceSummary | DailySummary | null): boolean {
  return summary !== null && summary.freshness !== "unavailable" && summary.freshness !== "unknown";
}

function formatAmount(currency: string, amount: number): string {
  return `${currency === "CNY" ? "¥" : currency === "USD" ? "$" : currency ? `${currency} ` : "币种未声明 "}${amount.toFixed(2)}`;
}

function rankedEntries(values: Record<string, number>): Array<[string, number]> {
  const rank = (currency: string) => currency === "CNY" ? 0 : currency === "USD" ? 1 : 2;
  return Object.entries(values).filter(([, amount]) => amount > 0)
    .sort(([left], [right]) => rank(left) - rank(right) || left.localeCompare(right));
}

function meteredEstimateNote(summary: UsageSourceSummary | DailySummary): string {
  const hasEstimate = Object.values(summary.metered_view).some((row) => row.declared_estimate > 0 || row.default_estimate > 0);
  return hasEstimate ? "按量估算未计入实付" : "";
}

function card(values: Record<string, number>, notes: string[]): SpendCard {
  const entries = rankedEntries(values);
  if (!entries.length) return { value: "—", detail: notes.join(" · ") || "尚无可核实的支出金额" };
  const [[currency, amount], ...other] = entries;
  const extra = other.length ? `另有 ${other.map(([unit, value]) => formatAmount(unit, value)).join("、")}；不同币种不相加` : "";
  return { value: formatAmount(currency, amount), detail: [extra, ...notes].filter(Boolean).join(" · ") };
}

export function monthSpendCard(monthly: UsageSourceSummary | null): SpendCard {
  if (!available(monthly) || !monthly) return { value: "—", detail: "月度权威汇总不可用" };
  const notes = [rankedEntries(monthly.actual_spend).length ? "已知账单与订阅月费" : monthly.total_tokens > 0 ? "尚无已确认的套餐或账单金额" : "本月尚无可计入的用量", meteredEstimateNote(monthly)];
  if (monthly.has_unresolved || monthly.freshness === "partial") notes.push("仍有未解析或部分覆盖项");
  if (monthly.freshness === "stale") notes.push("月度数据可能过期");
  return card(monthly.actual_spend, notes);
}

export function todaySpendCard(daily: DailySummary | null, monthly: UsageSourceSummary | null): SpendCard {
  if (!available(daily) || !daily) return { value: "—", detail: "今日权威汇总不可用" };
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
  const notes = [hasSubscription ? "含订阅月费日均摊，非当日扣款" : rankedEntries(spend).length ? "仅含当日已知实付" : daily.total_tokens > 0 ? "尚无已确认的套餐或账单金额" : "今日尚无可计入的用量", meteredEstimateNote(daily)];
  if (daily.has_unresolved || daily.freshness === "partial") notes.push("仍有未解析或部分覆盖项");
  if (daily.freshness === "stale") notes.push("今日数据可能过期");
  if (!hasSubscription && !available(monthly)) notes.push("月度订阅状态不可用，未计均摊");
  return card(spend, notes);
}
