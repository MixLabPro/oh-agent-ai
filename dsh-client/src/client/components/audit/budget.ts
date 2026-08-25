// G1 预算阈值——纯前端本地存储，不需要后端（GOVERNANCE_BACKLOG.md G1）。
//
// **不按 sessionId 隔离**，这是与 notes.ts 唯一但关键的不同：备注针对某条
// 具体证据，跨会话复用会张冠李戴（AC-02）；预算阈值是"提醒我这个数"这类
// 可复用的个人偏好，用户没理由每换一个会话就重设一次——就像
// DURATION_AUDIT_BACKLOG.md D7 的"多久算慢"阈值一样，全局一份即可。
//
// 存储写法照抄 notes.ts：localStorage + `typeof localStorage === 'undefined'`
// 守卫 + try/catch best-effort（存储被禁用或配额满不能让整个 tab 崩）。

const BUDGET_STORAGE_KEY = 'skill-vitals-audit:budget:v1'

// 0 或负数没有意义（除零/负比例），一律当作"未设置"处理。
export function loadBudget(): number | null {
  try {
    if (typeof localStorage === 'undefined') return null
    const raw = localStorage.getItem(BUDGET_STORAGE_KEY)
    if (raw === null) return null
    const n = JSON.parse(raw)
    return typeof n === 'number' && isFinite(n) && n > 0 ? n : null
  } catch {
    return null
  }
}

export function persistBudget(amount: number | null) {
  try {
    if (typeof localStorage === 'undefined') return
    if (amount === null) localStorage.removeItem(BUDGET_STORAGE_KEY)
    else localStorage.setItem(BUDGET_STORAGE_KEY, JSON.stringify(amount))
  } catch {
    // best-effort — a full quota or disabled storage shouldn't crash the tab
  }
}
