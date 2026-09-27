/**
 * 站内深链（OVERVIEW_DRILLDOWN spec R1）：异常 → 会话的一键穿透。
 * 页面路由仍是 App 的 hash 路由；本模块只约定 `#sessions?date=YYYY-MM-DD`
 * 这一种带参形态——参数白名单只有 date（北京日），识别即校验，不认识的一律
 * 返回 null（页面保持默认视图，不猜）。
 */

const SESSIONS_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const SESSIONS_HOST_PATTERN = /^[a-z][a-z0-9_-]{0,31}$/;

export function sessionsDateHref(date: string): string {
  return `#sessions?date=${encodeURIComponent(date)}`;
}

export function sessionsHostHref(host: string): string {
  return `#sessions?host=${encodeURIComponent(host)}`;
}

export type SessionsDeepLink = { date: string | null; host: string | null };

/** 读当前 hash 的会话深链参数（date / host 白名单校验）；无参 → 全 null。 */
export function readSessionsDeepLinkFromHash(): SessionsDeepLink {
  const query = window.location.hash.split("?")[1] ?? "";
  const out: SessionsDeepLink = { date: null, host: null };
  for (const pair of query.split("&")) {
    const [key, raw] = pair.split("=");
    const value = decodeURIComponent(raw ?? "");
    if (key === "date" && SESSIONS_DATE_PATTERN.test(value)) out.date = value;
    if (key === "host" && SESSIONS_HOST_PATTERN.test(value)) out.host = value;
  }
  return out;
}

/** 读当前 hash 的会话日期参数；无参/非法 → null（视图回默认，不抛错）。 */
export function readSessionsDateFromHash(): string | null {
  const query = window.location.hash.split("?")[1] ?? "";
  for (const pair of query.split("&")) {
    const [key, raw] = pair.split("=");
    if (key !== "date") continue;
    const value = decodeURIComponent(raw ?? "");
    return SESSIONS_DATE_PATTERN.test(value) ? value : null;
  }
  return null;
}
