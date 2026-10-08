/**
 * 飞行档案端口（§9，G3.2）：FlightProfileV1 的读取/合并/保存。
 * 存储三级降级：原生 plugin.state 端口（incognito WebView 下唯一可靠的跨重启存储）
 * → 浏览器预览 origin 的有界 localStorage → 内存（HUD 提示「成绩仅本次保留」）。
 * 档案只含玩法记录：无 session handle、无提示词、无路径、无任务轨迹。
 */
import { invokeHost, embedded } from "../host";
import type { PluginResponseV1, PluginStateReadResult, PluginStateWriteResult } from "@agent-vitals/app-sdk";

export const PROFILE_KEY = "flight-profile:v1";
const LOCAL_STORAGE_KEY = "city.flight-profile.v1";
const MAX_RECORDS = 20;

export type FlightRecord = { courseId: string; bestTimeMs: number; collisions: number };

export type FlightProfileV1 = {
  schemaVersion: 1;
  tutorialSeen: boolean;
  preferences: { muted: boolean; reducedCameraMotion: boolean };
  /** 顺序即最近访问序（末尾最新）；超额淘汰最旧（§9）。 */
  records: FlightRecord[];
};

export const EMPTY_PROFILE: FlightProfileV1 = {
  schemaVersion: 1,
  tutorialSeen: false,
  preferences: { muted: false, reducedCameraMotion: false },
  records: [],
};

export type ProfilePortTier = "native" | "local" | "memory";

export type ProfilePort = {
  tier: ProfilePortTier;
  profile: FlightProfileV1;
  /** true = 只读降级（未知新版本/持续写失败）：已知成绩不被旧状态静默覆盖。 */
  readOnly: boolean;
};

const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

/** 读取时验证：字段有限、版本已知；未知新版本只读降级；损坏（缺版本/缺结构）启用空档案。 */
export function parseProfile(value: unknown): { profile: FlightProfileV1; readOnly: boolean } | null {
  if (typeof value !== "object" || value === null) return null;
  const raw = value as Record<string, unknown>;
  if (raw.schemaVersion !== 1) {
    if (typeof raw.schemaVersion === "number" && Number.isFinite(raw.schemaVersion) && raw.schemaVersion > 1) {
      // 未知新版本：只读降级为空档案（不写回、不覆盖）。
      return { profile: { ...EMPTY_PROFILE }, readOnly: true };
    }
    return null; // 缺版本/非法版本：按损坏处理（空档案，可写重建）
  }
  const records: FlightRecord[] = [];
  if (Array.isArray(raw.records)) {
    for (const entry of raw.records.slice(0, MAX_RECORDS)) {
      if (typeof entry !== "object" || entry === null) continue;
      const record = entry as Record<string, unknown>;
      if (typeof record.courseId === "string" && record.courseId.length > 0 && record.courseId.length <= 128
        && finite(record.bestTimeMs) && record.bestTimeMs >= 0 && finite(record.collisions) && record.collisions >= 0) {
        records.push({ courseId: record.courseId, bestTimeMs: record.bestTimeMs, collisions: record.collisions });
      }
    }
  }
  const preferences = (typeof raw.preferences === "object" && raw.preferences !== null ? raw.preferences : {}) as Record<string, unknown>;
  return {
    profile: {
      schemaVersion: 1,
      tutorialSeen: raw.tutorialSeen === true,
      preferences: { muted: preferences.muted === true, reducedCameraMotion: preferences.reducedCameraMotion === true },
      records,
    },
    readOnly: false,
  };
}

/** 成绩合并：同路线取更优（最终用时，并列时碰撞少者）；记录移到末尾（最近访问）；超额淘汰最旧。 */
export function mergeRecord(profile: FlightProfileV1, record: FlightRecord): FlightProfileV1 {
  const kept = profile.records.filter((existing) => existing.courseId !== record.courseId);
  const previous = profile.records.find((existing) => existing.courseId === record.courseId);
  const better = !previous
    || record.bestTimeMs < previous.bestTimeMs
    || (record.bestTimeMs === previous.bestTimeMs && record.collisions < previous.collisions);
  const next = better ? record : previous;
  const records = [...kept, next].slice(-MAX_RECORDS);
  return { ...profile, records };
}

async function nativeRead(): Promise<{ value: unknown; revision: number } | null> {
  const requestId = `city-profile-read-${Date.now()}`;
  const response = await invokeHost<PluginResponseV1<PluginStateReadResult>>("plugin_request", { request: {
    version: 1, instanceId: window.__AV_PLUGIN_INSTANCE__, requestId, method: "plugin.state.read",
    payload: { key: PROFILE_KEY },
  } });
  if (response.version !== 1 || response.requestId !== requestId || !response.ok || !response.result) {
    throw new Error(response.error?.code ?? "state_unavailable");
  }
  return response.result;
}

async function nativeWrite(revision: number, value: FlightProfileV1): Promise<number> {
  const requestId = `city-profile-write-${Date.now()}`;
  const response = await invokeHost<PluginResponseV1<PluginStateWriteResult>>("plugin_request", { request: {
    version: 1, instanceId: window.__AV_PLUGIN_INSTANCE__, requestId, method: "plugin.state.write",
    payload: { key: PROFILE_KEY, revision, value },
  } });
  if (response.version !== 1 || response.requestId !== requestId || !response.ok || !response.result) {
    throw new Error(response.error?.code ?? "state_unavailable");
  }
  return response.result.revision;
}

function localRead(): { value: unknown } | null {
  try {
    const text = localStorage.getItem(LOCAL_STORAGE_KEY);
    return text === null ? null : { value: JSON.parse(text) };
  } catch {
    return null; // 解析失败或存储不可用 → 空档案/内存
  }
}

function localWrite(value: FlightProfileV1): void {
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(value));
  } catch {
    throw new Error("local_storage_unavailable");
  }
}

/**
 * 载入档案：优先原生端口（真实 WebView）；预览/独立页用 localStorage；失败进内存档。
 * 返回的 port 供后续保存（记住 tier 与 revision）。
 */
export async function loadProfilePort(): Promise<ProfilePort> {
  if (embedded() && window.__AV_PLUGIN_INSTANCE__) {
    try {
      const read = await nativeRead();
      const parsed = read && read.value !== null ? parseProfile(read.value) : null;
      return {
        tier: "native",
        profile: parsed?.profile ?? { ...EMPTY_PROFILE },
        readOnly: parsed?.readOnly ?? false,
        revision: read?.revision ?? 0,
      } as ProfilePort & { revision: number };
    } catch {
      // 原生端口不可用（预览 iframe / 宿主旧版本）：降到 localStorage。
    }
  }
  const local = localRead();
  const parsed = local?.value ? parseProfile(local.value) : null;
  if (parsed) {
    try {
      localWrite(parsed.profile);
      return { tier: "local", profile: parsed.profile, readOnly: parsed.readOnly };
    } catch {
      // 存储只读/满：内存档。
    }
  }
  return { tier: "memory", profile: parsed?.profile ?? { ...EMPTY_PROFILE }, readOnly: false };
}

/** 保存档案（设置变更与比赛结算时调用，不逐帧）。失败返回 false（HUD 显示「本次成绩尚未保存」）。 */
export async function saveProfile(port: ProfilePort, profile: FlightProfileV1): Promise<ProfilePort> {
  if (port.readOnly) return port; // 只读降级不写回（未知版本不覆盖）
  if (port.tier === "native" && "revision" in port) {
    const revision = (port as ProfilePort & { revision: number }).revision;
    try {
      const next = await nativeWrite(revision, profile);
      return { ...port, profile, revision: next } as ProfilePort & { revision: number };
    } catch (error) {
      if (error instanceof Error && error.message === "revision_conflict") {
        // 冲突：重读 → 合并（已知成绩不被旧状态静默覆盖）→ 重写一次。
        try {
          const read = await nativeRead();
          const parsed = read && read.value !== null ? parseProfile(read.value) : null;
          const merged = parsed ? parsed.profile : { ...EMPTY_PROFILE };
          let combined = merged;
          for (const record of profile.records) combined = mergeRecord(combined, record);
          const next = await nativeWrite(read?.revision ?? 0, combined);
          return { tier: "native", profile: combined, readOnly: false, revision: next } as ProfilePort & { revision: number };
        } catch {
          return { ...port, profile, readOnly: true };
        }
      }
      return { ...port, profile, readOnly: true };
    }
  }
  if (port.tier === "local") {
    try {
      localWrite(profile);
      return { ...port, profile };
    } catch {
      return { tier: "memory", profile, readOnly: false };
    }
  }
  return { ...port, profile }; // 内存档：本次会话内保留
}
