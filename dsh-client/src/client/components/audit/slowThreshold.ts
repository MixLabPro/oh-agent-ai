// D7 "多久算慢"阈值——纯前端本地存储，不需要后端（DURATION_AUDIT_BACKLOG.md
// D7，与 GOVERNANCE_BACKLOG.md G1 的 budget.ts 同一模式）。
//
// **不按 sessionId 隔离**，理由同 budget.ts：这是"提醒我这个数"式的个人偏好，
// 不是针对某条具体证据的备注，用户没理由每换一个会话就重设一次。

const SLOW_THRESHOLD_STORAGE_KEY = 'skill-vitals-audit:slow-threshold-ms:v1'

// 0 或负数没有意义，一律当作"未设置"处理。
export function loadSlowThreshold(): number | null {
  try {
    if (typeof localStorage === 'undefined') return null
    const raw = localStorage.getItem(SLOW_THRESHOLD_STORAGE_KEY)
    if (raw === null) return null
    const n = JSON.parse(raw)
    return typeof n === 'number' && isFinite(n) && n > 0 ? n : null
  } catch {
    return null
  }
}

export function persistSlowThreshold(ms: number | null) {
  try {
    if (typeof localStorage === 'undefined') return
    if (ms === null) localStorage.removeItem(SLOW_THRESHOLD_STORAGE_KEY)
    else localStorage.setItem(SLOW_THRESHOLD_STORAGE_KEY, JSON.stringify(ms))
  } catch {
    // best-effort — a full quota or disabled storage shouldn't crash the tab
  }
}
