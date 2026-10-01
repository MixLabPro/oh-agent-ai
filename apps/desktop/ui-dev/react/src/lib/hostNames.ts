import { useSyncExternalStore } from "react";
import { hasNativeBridge, invoke } from "./tauri";

/**
 * 宿主的面向用户显示名。`plugin:<slug>` 里的 `plugin:` 只是「热插拔宿主」的内部类别标记，
 * 用户只关心 ZCode 这个名字：优先用后端从插件清单取的 display.name，
 * 取不到时去掉前缀、按 -/_ 分词首字母大写。
 */
const BUILTIN: Record<string, string> = {
  "claude-code": "Claude Code", codex: "Codex", dsh: "DeepSeek Harness", workbuddy: "WorkBuddy",
  openclaw: "OpenClaw", hermes: "Hermes", pi: "Pi",
};

let pluginNames: Record<string, string> = {};
const listeners = new Set<() => void>();

function prettifySlug(slug: string): string {
  return slug.split(/[-_]/).filter(Boolean).map((word) => word[0].toUpperCase() + word.slice(1)).join(" ");
}

export function hostName(kind: string | null | undefined): string {
  if (!kind) return "—";
  if (BUILTIN[kind]) return BUILTIN[kind];
  if (pluginNames[kind]) return pluginNames[kind];
  return kind.startsWith("plugin:") ? prettifySlug(kind.slice("plugin:".length)) : kind;
}

/** 启动时取一次插件宿主显示名；取到后通知订阅者重渲染。失败静默：退回 prettify。 */
export async function hydrateHostNames(): Promise<void> {
  if (!hasNativeBridge()) return;
  const result = await invoke<Record<string, unknown>>("host_display_names");
  const next: Record<string, string> = {};
  for (const [kind, name] of Object.entries(result ?? {})) if (typeof name === "string" && name.trim()) next[kind] = name;
  if (JSON.stringify(next) === JSON.stringify(pluginNames)) return;
  pluginNames = next;
  listeners.forEach((notify) => notify());
}

/** 在根组件调用一次：显示名到达后整棵树重渲染。 */
export function useHostNames(): Record<string, string> {
  return useSyncExternalStore((notify) => { listeners.add(notify); return () => { listeners.delete(notify); }; }, () => pluginNames);
}
