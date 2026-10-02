/**
 * 个人化地形种子：第一次打开城市页时生成，落盘后永不自动改变（只有用户点「重新生成岛屿」才换）。
 *
 * 桌面端存在数据目录 state/city-seed.json（Tauri 命令 city_seed_config / reset_city_seed），
 * 清浏览器缓存不会丢；浏览器预览（无原生桥）退回 localStorage。种子只是本机随机数，
 * 不关联账号或网络标识，也不离开本机。
 */
import { hasNativeBridge, invoke } from "../../lib/tauri";

const STORAGE_KEY = "agent-vitals.city-seed";

function validSeed(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0 && value <= 0xffffffff;
}

function browserSeed(reset: boolean): number {
  try {
    const stored = Number(window.localStorage.getItem(STORAGE_KEY));
    if (!reset && validSeed(stored)) return stored;
  } catch { /* 无存储：本次会话内仍稳定（模块级缓存） */ }
  const fresh = (crypto.getRandomValues(new Uint32Array(1))[0] || 1) >>> 0;
  try { window.localStorage.setItem(STORAGE_KEY, String(fresh)); } catch { /* ignore */ }
  return fresh;
}

let cached: Promise<number> | null = null;

export function loadCitySeed(): Promise<number> {
  if (cached) return cached;
  cached = (async () => {
    if (!hasNativeBridge()) return browserSeed(false);
    const result = await invoke<{ status: string; seed: unknown }>("city_seed_config");
    if (result.status !== "ok" || !validSeed(result.seed)) throw new Error("city seed unavailable");
    return result.seed;
  })();
  // 读失败不缓存失败结果：下次进入城市页重试，而不是永久卡住。
  cached.catch(() => { cached = null; });
  return cached;
}

export async function resetCitySeed(): Promise<number> {
  let seed: number;
  if (!hasNativeBridge()) seed = browserSeed(true);
  else {
    const result = await invoke<{ status: string; seed: unknown }>("reset_city_seed");
    if (result.status !== "saved" || !validSeed(result.seed)) throw new Error("city seed was not saved");
    seed = result.seed;
  }
  cached = Promise.resolve(seed);
  return seed;
}
