// FR-11 复制 / FR-12 导出的"落地"部分——碰 DOM/剪贴板/Blob，因此不是纯函数
// （组装导出内容的纯函数部分在 ../export.ts，可以直接下断言；这里手动测，
// 靠 P0-02 的真机验证）。
import type { Finding } from './types'

// 剪贴板失败**不静默**（FR-11）：拿不到权限就把文本回填进一个只读输入框让
// 用户自己复制，并明说失败了。
export function writeClipboard(text: string, onResult: (ok: boolean) => void) {
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(() => onResult(true), () => onResult(false))
      return
    }
  } catch { /* fall through */ }
  onResult(false)
}

export function sessionIdOf(findings: Finding[]): string {
  for (const f of findings) if (f.session_id) return f.session_id
  return ''
}

/**
 * FR-12 JSON 导出的落地部分——碰 DOM/Blob，因此不放进 `../export.ts`（那边是
 * 纯函数，直接下断言；这里手动测，靠 P0-02 的三条真机验证）。
 *
 * **P0-02 修的就是这个函数原来的样子**：`window.open('', '_blank')` 写个
 * `<pre>` 根本不是下载，popup 在插件的受限上下文里大概率被拦，拦了之后又
 * 静默落到剪贴板、不给任何反馈——用户点了跟没点一样。现在：
 *   1. 真下载（Blob + `<a download>`，这是完整网页而不是 Artifacts 那种沙箱
 *      iframe，`<a download>` 用得了）；
 *   2. 下载机制本身失败（极少数宿主环境）才退到剪贴板，且**明确说是退到
 *      剪贴板**，不能让用户以为文件已经存到磁盘了；
 *   3. 两条路都失败才说「导出失败」——FR-11 那条「不得静默失败」原样适用
 *      在导出上。
 */
export function downloadJson(payload: object, filename: string, onResult: (kind: 'downloaded' | 'clipboard' | 'failed') => void): void {
  const text = JSON.stringify(payload, null, 2)
  try {
    const blob = new Blob([text], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    // 释放放在下一个 tick——某些浏览器在 click() 同步返回时还没真正发起下载，
    // 立刻 revoke 会让文件读到一半就没了。
    setTimeout(() => URL.revokeObjectURL(url), 0)
    onResult('downloaded')
    return
  } catch { /* 走剪贴板兜底 */ }
  writeClipboard(text, ok => onResult(ok ? 'clipboard' : 'failed'))
}

// F2 fallback: DSH's conversation.view slot contract (ConvViewProps /
// dsh-client-ui-conversation slots.d.ts) exposes no jump-to-seq or tab-switch
// API — only forkAt(seq) and a read-only scrollTop — so "click seq, jump to
// 轨迹 tab" (the doc's preferred F2) isn't buildable against the current host
// contract. Falls back to copy-to-clipboard, the degradation the doc names.
// FR-11：成功要说"已复制"，失败要说"复制失败，请手动复制"——**不得静默失败**。
// 旧实现拿不到剪贴板权限时什么都不做，用户以为复制成功了。
export function copySeq(seqs: number[], onResult?: (ok: boolean) => void) {
  if (!seqs.length) return
  writeClipboard(seqs.join(','), ok => onResult?.(ok))
}
