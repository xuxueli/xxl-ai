/*
 * 浏览器工具桥接（worker 侧）：持有动作回调并统一转发请求。
 *   - 回调由 runtime worker 启动时注入，工具只依赖本模块，不感知进程通信；
 *   - 页面动作失败统一转成可回填模型的结果，避免异常穿透工具执行。
 *
 * @author xuxueli 2026-10-31
 */

import type { BrowserAction, BrowserActionResult } from '@modules/browser/shared'
import { tr, type ToolContext } from '@modules/agent/worker'

/* 打开回调（worker 注入）：newTab=true 时强制新建标签页 */
let browserOpener: ((sessionId: number, url: string, newTab: boolean) => void) | null = null

/* 动作回调（worker 注入）：请求渲染层执行页面动作并回传结果 */
let browserActionInvoker:
  | ((sessionId: number, action: BrowserAction) => Promise<BrowserActionResult>)
  | null = null

/* 注入打开回调（运行时进程启动时调用一次） */
export function setBrowserOpener(
  opener: (sessionId: number, url: string, newTab: boolean) => void
): void {
  browserOpener = opener
}

/* 注入动作回调（运行时进程启动时调用一次） */
export function setBrowserActionInvoker(
  invoker: (sessionId: number, action: BrowserAction) => Promise<BrowserActionResult>
): void {
  browserActionInvoker = invoker
}

/* 当前打开回调（未注入时返回 null，由工具给出可读错误） */
export function getBrowserOpener(): ((sessionId: number, url: string, newTab: boolean) => void) | null {
  return browserOpener
}

/* 调用页面动作并统一处理不可用场景 */
export async function runBrowserAction(
  context: ToolContext,
  action: BrowserAction
): Promise<BrowserActionResult> {
  if (!browserActionInvoker) {
    return { ok: false, error: tr(context, 'runtime.tool.browserUnavailable') }
  }
  try {
    return await browserActionInvoker(context.sessionId, action)
  } catch (error) {
    return {
      ok: false,
      error: tr(context, 'runtime.tool.browserActionFailed', [(error as Error).message])
    }
  }
}
