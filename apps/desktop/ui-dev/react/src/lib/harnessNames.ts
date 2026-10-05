import { useSyncExternalStore } from "react";
import { hasNativeBridge, invoke } from "./tauri";

/**
 * Agent harness 的面向用户显示名，不指 Agent Vitals 插件宿主。
 * `harness:<slug>` 是数据适配器标识，不是 City 等应用插件的 ID，
 * 用户只关心 ZCode 这个名字：优先用后端从插件清单取的 display.name，
 * 取不到时去掉前缀、按 -/_ 分词首字母大写。
 */
const BUILTIN: Record<string, string> = {
  "claude-code": "Claude Code", codex: "Codex", dsh: "DeepSeek Harness", workbuddy: "WorkBuddy",
  openclaw: "OpenClaw", hermes: "Hermes", pi: "Pi",
};

let manifestNames: Record<string, string> = {};
let hydrationSequence = 0;
const listeners = new Set<() => void>();

function prettifySlug(slug: string): string {
  return slug.split(/[-_]/).filter(Boolean).map((word) => word[0].toUpperCase() + word.slice(1)).join(" ");
}

export function harnessName(kind: string | null | undefined): string {
  if (!kind) return "—";
  if (manifestNames[kind]) return manifestNames[kind];
  if (BUILTIN[kind]) return BUILTIN[kind];
  return kind.startsWith("harness:") ? prettifySlug(kind.slice("harness:".length)) : kind;
}

/** Refresh from the authoritative public identity list at startup/invalidation. */
export async function hydrateHarnessNames(): Promise<void> {
  if (!hasNativeBridge()) return;
  const sequence = ++hydrationSequence;
  const result = await invoke<Record<string, unknown>>("harness_display_names");
  if (sequence !== hydrationSequence) return;
  const next: Record<string, string> = {};
  for (const [kind, name] of Object.entries(result ?? {})) if (typeof name === "string" && name.trim()) next[kind] = name;
  if (JSON.stringify(next) === JSON.stringify(manifestNames)) return;
  manifestNames = next;
  listeners.forEach((notify) => notify());
}

/** 在根组件调用一次：显示名到达后整棵树重渲染。 */
export function useHarnessNames(): Record<string, string> {
  return useSyncExternalStore((notify) => { listeners.add(notify); return () => { listeners.delete(notify); }; }, () => manifestNames);
}
