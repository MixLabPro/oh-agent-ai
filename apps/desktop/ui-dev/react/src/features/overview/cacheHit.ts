import type { DailySummary } from "../../lib/tauri";

export function todayCacheHitRatio(daily: DailySummary | null): number | null {
  if (!daily || daily.freshness === "unavailable" || daily.freshness === "unknown") return null;
  let cacheRead = 0;
  let input = 0;
  for (const host of Object.values(daily.tokens_by_host)) {
    cacheRead += host.cache_read;
    input += host.uncached_input + host.cache_read + host.cache_write;
  }
  return input > 0 ? cacheRead / input : null;
}
