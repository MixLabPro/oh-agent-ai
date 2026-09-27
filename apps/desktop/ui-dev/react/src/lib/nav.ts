/**
 * 站内深链（OVERVIEW_DRILLDOWN spec R1）：异常 → 会话的一键穿透。
 * 页面路由仍是 App 的 hash 路由；本模块约定 `#sessions?date=YYYY-MM-DD` 与
 * `#sessions?host=<host>` 两种参数（可组合），白名单识别即校验，不认识的
 * 一律丢弃（页面保持默认视图，解码失败也不抛——守卫 spec §8）。
 */

const SESSIONS_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
// 与桥接层 safeHostLabel 同文法：真实宿主（claude-code）+ plugin:<slug>。
const SESSIONS_HOST_PATTERN = /^[a-z][a-z0-9_-]{0,31}(:[a-z0-9_-]{1,32})?$/;

function safeDecode(value: string): string | null {
  try { return decodeURIComponent(value); } catch { return null; }
}

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
    const value = raw === undefined ? null : safeDecode(raw);
    if (value === null) continue;
    if (key === "date" && SESSIONS_DATE_PATTERN.test(value)) out.date = value;
    if (key === "host" && SESSIONS_HOST_PATTERN.test(value)) out.host = value;
  }
  return out;
}
