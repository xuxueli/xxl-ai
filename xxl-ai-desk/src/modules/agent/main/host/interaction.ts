/*
 * 主进程侧人机交互桥：运行时进程把交互请求转交此处，
 * 由主进程转发渲染进程弹应用内对话框，并回传用户结果（提交 / 拒绝 / 取消）。
 *
 * 同一窗口内维护单一请求表：渲染层按到达顺序排队展示，主进程只做配对与转发。
 *
 * @author xuxueli 2026-10-31
 */

import { BrowserWindow } from 'electron'
import { CHAT_IPC } from '@modules/chat/shared'
import type { ChatInteractionPrompt, InteractionResult } from '@modules/chat/shared'

/* 请求回传器：由运行时入口注入，把结果写回 worker */
type InteractionResponder = (requestId: string, result: InteractionResult) => void

/* 待响应交互：requestId → 会话与回传器 */
const pending = new Map<string, { sessionId: string; respond: InteractionResponder }>()

/* 取当前窗口：优先聚焦窗口，其次首个窗口 */
function activeWindow(): BrowserWindow | null {
  const window = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
  return window && !window.isDestroyed() ? window : null
}

/* 推送关闭弹窗（运行时已主动取消） */
function closePrompt(requestId: string): void {
  activeWindow()?.webContents.send(CHAT_IPC.interactionCancel, { requestId })
}

/* 接收运行时交互请求：窗口缺失时直接按拒绝结算，避免工具悬挂 */
export function openInteraction(prompt: ChatInteractionPrompt, respond: InteractionResponder): void {
  const window = activeWindow()
  if (!window) {
    respond(prompt.requestId, { status: 'denied' })
    return
  }
  pending.set(prompt.requestId, { sessionId: prompt.sessionId, respond })
  window.webContents.send(CHAT_IPC.interactionRequest, prompt)
}

/* 渲染层回传用户结果：取出即删除，后到的重复应答直接忽略 */
export function resolveInteraction(requestId: string, result: InteractionResult): boolean {
  const item = pending.get(requestId)
  if (!item) {
    return false
  }
  pending.delete(requestId)
  item.respond(requestId, result)
  return true
}

/* 运行时主动取消：移除请求并关闭仍打开的弹窗 */
export function cancelInteraction(requestId: string): void {
  if (pending.delete(requestId)) {
    closePrompt(requestId)
  }
}

/* 取消某会话全部交互（会话终止 / 删除） */
export function cancelInteractionsOf(sessionId: string): void {
  for (const [requestId, item] of pending) {
    if (item.sessionId === sessionId) {
      pending.delete(requestId)
      closePrompt(requestId)
    }
  }
}

/* 清空全部交互（运行时进程退出）：逐条关闭弹窗，避免界面残留 */
export function clearInteractions(): void {
  for (const requestId of pending.keys()) {
    closePrompt(requestId)
  }
  pending.clear()
}
