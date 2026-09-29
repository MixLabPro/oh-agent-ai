// 会话成本卡的呈现投影：纯函数，只读 session_detail 已有字段，不长第二份计价规则。
//
// 为什么需要它（2026-09-29 真机）：一个 codex 会话 81% 用量被 ChatGPT Plus 订阅覆盖，
// 剩下两个模型（gpt-6-luna / gpt-6-sol）既不在订阅声明的模型范围里、又没有价卡。
// 后端 `session_cost_view` 只看非订阅部分，如实给出 `unpriced / no-price-card`；卡片
// 原样显示「— · 缺价 · no-price-card」，读起来像「整个会话都算不出钱」，而下方诊断
// 同时显示名义成本 $66.53——两处像在互相矛盾。事实是「订阅为主、少数模型缺价」，
// 卡片要把这层构成说出来。
//
// 口径纪律（CLAUDE.md「v0.9 成本词表」）：订阅用量不是按 token 的账单，永不折成金额；
// 缺价不计为 0、不借别的卡；这里只做「占比 + 哪些模型缺价」的计数与措辞。
import type { SessionBillingBucket, SessionCostStatus, SessionDetail } from "../../lib/tauri";

/// 后端原因码 → 用户可读的一句话。原因码本身保留在卡片的 title 里，方便排查。
const REASON_TEXT: Record<string, string> = {
  "metered-estimate": "按官方价卡估算，非账单",
  "official-card-fallback-estimate": "按官方价卡估算，服务商价格未确认",
  "subscription-token-usage-is-not-a-per-token-bill": "订阅用量，不按 token 计费",
  "no-price-card": "模型没有价卡，无法估算",
  "no-pricing-snapshot": "这段时间没有价目快照",
  "multiple-provider-costs-require-breakdown": "涉及多个服务商，见下方计费归因",
  "no-usage-facts": "没有用量记录",
  "cost-unavailable": "成本暂不可用",
};

export function costReasonText(status: Pick<SessionCostStatus, "reason">): string {
  return REASON_TEXT[status.reason] ?? "成本暂不可用";
}

export type CostCard = {
  /// 卡片主值：金额、「订阅」「订阅为主」「部分订阅」或「—」。
  value: string;
  /// 主值下方的一行说明。
  note: string;
  /// 悬停提示：保留后端原因码与缺价模型全名，供排查。
  title: string;
  /// 说明里是否含「缺价」这类需要留意的信息（用于着色）。
  warn: boolean;
};

export function formatCost(cost: { amount_minor: number; currency: string } | null): string | null {
  if (!cost) return null;
  const amount = (cost.amount_minor / 100).toFixed(2);
  return cost.currency === "CNY" ? `¥${amount}` : cost.currency === "USD" ? `$${amount}` : `${cost.currency} ${amount}`;
}

function pct(part: number, whole: number): string {
  const v = whole > 0 ? (part / whole) * 100 : 0;
  // 不把 99.6% 四舍五入成「100%」：那会让「订阅覆盖 100% · 另有缺价」自相矛盾
  if (v > 99 && v < 100) return ">99%";
  if (v > 0 && v < 1) return "<1%";
  return `${Math.round(v)}%`;
}

/// 模型名里的连字符换成不断行连字符（U+2011）：卡片窄时「gpt-6-luna」会在连字符处
/// 折成「gpt-6-」「luna」两行，读起来像两个东西。原名保留在 title 里。
function modelList(models: string[]): string {
  const shown = models.map(m => m.replace(/-/g, "\u2011"));
  return shown.length <= 2 ? shown.join("、") : `${shown.slice(0, 2).join("、")} 等 ${shown.length} 个模型`;
}

export function sessionCostCard(detail: Pick<SessionDetail, "billing_breakdown" | "cost_minor" | "cost_status">): CostCard {
  const buckets: SessionBillingBucket[] = detail.billing_breakdown ?? [];
  const status = detail.cost_status;
  const amount = formatCost(detail.cost_minor);
  const code = `原因码：${status.reason}`;
  if (buckets.length === 0) {
    return { value: amount ?? "—", note: costReasonText(status), title: code, warn: !amount };
  }
  const total = buckets.reduce((sum, b) => sum + b.tokens.total, 0);
  const subscribed = buckets.filter(b => b.billing_mode === "subscription").reduce((sum, b) => sum + b.tokens.total, 0);
  const metered = buckets.filter(b => b.billing_mode !== "subscription");
  const unpriced = [...new Set(metered.filter(b => !b.cost_minor).map(b => b.model_id))].sort();
  const title = unpriced.length ? `${code}\n缺价模型：${unpriced.join("、")}` : code;
  // 有桶是按事后每日同步到的价卡补算的（事件发生时还没有这张卡）：金额照算，但要说出来。
  const backfill = metered.some(b => b.pricing_source === "backfilled") ? " · 含事后补录价" : "";

  if (metered.length === 0) {
    return { value: "订阅", note: "订阅覆盖，不按 token 计费", title, warn: false };
  }
  if (subscribed === 0) {
    if (amount) {
      const note = (unpriced.length ? `按量估算 · ${modelList(unpriced)} 缺价未计入` : costReasonText(status)) + backfill;
      return { value: amount, note, title, warn: unpriced.length > 0 };
    }
    return { value: "—", note: unpriced.length ? `${modelList(unpriced)} 没有价卡` : costReasonText(status), title, warn: true };
  }

  // 订阅与按量混合：主值说构成，金额（若有）只代表按量部分。
  const share = pct(subscribed, total);
  if (amount) {
    const tail = unpriced.length ? ` · ${modelList(unpriced)} 缺价` : "";
    return { value: amount, note: `按量部分 · 订阅覆盖 ${share}${tail}${backfill}`, title, warn: unpriced.length > 0 };
  }
  const value = subscribed * 2 >= total ? "订阅为主" : "部分订阅";
  const rest = unpriced.length ? `其余 ${modelList(unpriced)} 缺价卡` : `其余${costReasonText(status)}`;
  return { value, note: `订阅覆盖 ${share} · ${rest}`, title, warn: true };
}
