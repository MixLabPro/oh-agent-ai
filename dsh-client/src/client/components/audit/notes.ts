// FR-10 个人复核备注的存储层——本地读写，不碰 DOM 之外的任何东西。
import type { Note } from './types'

const NOTES_STORAGE_KEY = 'skill-vitals-audit:notes:v1'

// 备注键**必须带 sessionId**（AC-02）：不带的话，A 会话里写的备注会在 B 会话
// 里凭同样的 rule+evidence 静默出现——用户从没看过 B 的那条，却已经"有了自己
// 的判断"。sessionId 由宿主投影注入（core 拿不到它）。
//
// sessionId 为空（宿主未提供，例如老投影或测试桩）时退回 `''` 前缀：仍然按
// 「同一个未知会话」聚合，不会跨真实会话泄漏，因为真实会话总有非空 id。
export function noteKey(sessionId: string, rule: string, evidence: string): string {
  return JSON.stringify([sessionId, rule, evidence])
}

export function loadNotes(): Record<string, Note> {
  try {
    if (typeof localStorage === 'undefined') return {}
    const raw = localStorage.getItem(NOTES_STORAGE_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

export function persistNotes(notes: Record<string, Note>) {
  try {
    if (typeof localStorage === 'undefined') return
    localStorage.setItem(NOTES_STORAGE_KEY, JSON.stringify(notes))
  } catch {
    // best-effort — a full quota or disabled storage shouldn't crash the tab
  }
}
