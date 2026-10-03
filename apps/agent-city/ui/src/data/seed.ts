import { invokeHost, embedded } from "../host";
import type { PluginResponseV1 } from "@agent-vitals/app-sdk";
let sequence = 0;
export function randomSeed(): number {
  return (crypto.getRandomValues(new Uint32Array(1))[0] >>> 0) || 1;
}
export async function citySeed(action: "read" | "write", seed?: number): Promise<number | null> {
  if (!embedded() || window.__CITY_ISOLATION_FIXTURE__) {
    if (action === "write") localStorage.setItem("city.seed", String(seed));
    const saved = Number(localStorage.getItem("city.seed") ?? localStorage.getItem("agent-vitals.city-seed"));
    return Number.isInteger(saved) && saved > 0 && saved <= 4294967295 ? saved : null;
  }
  const requestId = `city-seed-${++sequence}`;
  const response = await invokeHost<PluginResponseV1<{ seed: number | null }>>("plugin_request", {
    request: { version: 1, instanceId: window.__AV_PLUGIN_INSTANCE__, requestId, method: "data.read",
      payload: { projection: "city-settings", version: 1, action, ...(seed === undefined ? {} : { seed }) } },
  });
  if (response.version !== 1 || response.requestId !== requestId || !response.ok || !response.result) throw new Error(response.error?.code ?? "seed_unavailable");
  const value = response.result.seed;
  if (value !== null && (!Number.isInteger(value) || value < 1 || value > 4294967295)) throw new Error("invalid_seed_response");
  return value;
}
