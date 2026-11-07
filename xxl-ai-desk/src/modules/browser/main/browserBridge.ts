/*
 * 浏览器动作桥（主进程侧）：把运行时进程的页面动作转发渲染层 webview，并等待结果回传。
 *   - 主进程只做请求配对与超时兜底，页面提取 / 交互脚本由渲染层执行；
 *   - 窗口缺失或渲染层无响应时返回可读错误，避免工具调用永久挂起。
 */

import type { BrowserAction, BrowserActionRequest, BrowserActionResult } from '@modules/browser/shared'

/* 动作超时（毫秒）：覆盖 wait_browser 最长 30s 轮询与页面加载余量 */
const ACTION_TIMEOUT = 60000

/* 渲染层发送函数（由 IPC 网关注入） */
type ActionSender = (request: BrowserActionRequest) => void
let sender: ActionSender | null = null

/* 待响应请求：requestId → 结算与超时定时器 */
const pending = new Map<
  string,
  { resolve: (result: BrowserActionResult) => void; timer: ReturnType<typeof setTimeout> }
>()

/* 注册渲染层发送函数（IPC 网关启动时注入） */
export function setBrowserActionSender(value: ActionSender): void {
  sender = value
}

/* 回传渲染层的动作结果（由 IPC 网关调用） */
export function resolveBrowserAction(requestId: string, result: BrowserActionResult): void {
  const entry = pending.get(requestId)
  if (!entry) {
    return
  }
  clearTimeout(entry.timer)
  pending.delete(requestId)
  entry.resolve(result)
}

/* 请求执行页面动作；无窗口/超时统一转为失败结果 */
export function requestBrowserAction(
  sessionId: number,
  action: BrowserAction
): Promise<BrowserActionResult> {
  const send = sender
  if (!send) {
    return Promise.resolve({ ok: false, error: '浏览器不可用：窗口尚未就绪' })
  }
  const requestId = `ba_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`
  return new Promise<BrowserActionResult>((resolve) => {
    const timer = setTimeout(() => {
      pending.delete(requestId)
      resolve({ ok: false, error: '浏览器动作超时：请确认右侧浏览器已打开页面后重试' })
    }, ACTION_TIMEOUT)
    pending.set(requestId, { resolve, timer })
    send({ requestId, sessionId: String(sessionId), action })
  })
}

/* 清空全部待响应请求（窗口销毁/退出时兜底） */
export function disposeBrowserActions(): void {
  for (const entry of pending.values()) {
    clearTimeout(entry.timer)
    entry.resolve({ ok: false, error: '窗口已关闭，动作取消' })
  }
  pending.clear()
}
