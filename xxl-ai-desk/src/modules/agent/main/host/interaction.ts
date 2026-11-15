/*
 * 主进程侧人机交互桥：运行时进程把交互请求转交此处，
 * 由主进程转发渲染进程，在输入框位置内联展示审批 / 选择面板，并回传用户结果（提交 / 拒绝 / 取消）。
 *
 * 同一窗口内维护按 requestId 索引的请求表：渲染层按会话隔离并排队展示，主进程只做配对与转发。
 *
 * @author xuxueli 2026-10-31
 */

import { BrowserWindow } from 'electron'
import { CHAT_IPC } from '@modules/chat/shared'
import type { ChatInteractionPrompt, InteractionRequest, InteractionResult } from '@modules/chat/shared'

/* 请求回传器：由运行时入口注入，把结果写回 worker */
type InteractionResponder = (requestId: string, result: InteractionResult) => void

/* 待响应交互：requestId → 会话与回传器 */
const pending = new Map<string, { sessionId: number; respond: InteractionResponder }>()

/*
 * 自动结算器：无人值守会话（如定时任务）在推送渲染层前直接给出结果；
 * 返回 null 表示仍需人工处理。由会话域注册，避免 agent 反向依赖 chat。
 */
type InteractionAutoResolver = (
  sessionId: number,
  request: InteractionRequest
) => InteractionResult | null
let autoResolver: InteractionAutoResolver | null = null

/* 注册 / 注销自动结算器 */
export function setInteractionAutoResolver(next: InteractionAutoResolver | null): void {
  autoResolver = next
}

/* 取当前窗口：优先聚焦窗口，其次首个窗口 */
function activeWindow(): BrowserWindow | null {
  const window = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
  return window && !window.isDestroyed() ? window : null
}

/* 通知渲染层移除交互面板（运行时已主动取消） */
function closePrompt(requestId: string): void {
  activeWindow()?.webContents.send(CHAT_IPC.interactionCancel, { requestId })
}

/* 接收运行时交互请求：窗口缺失时直接按拒绝结算，避免工具悬挂 */
export function openInteraction(prompt: ChatInteractionPrompt, respond: InteractionResponder): void {
  /* 无人值守会话：立即按预定结果结算，不进入等待队列 */
  const autoResult = autoResolver?.(prompt.sessionId, prompt.request)
  if (autoResult) {
    respond(prompt.requestId, autoResult)
    return
  }
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

/* 运行时主动取消：移除请求并通知渲染层收起面板 */
export function cancelInteraction(requestId: string): void {
  if (pending.delete(requestId)) {
    closePrompt(requestId)
  }
}

/* 取消某会话全部交互（会话终止 / 删除） */
export function cancelInteractionsOf(sessionId: number): void {
  for (const [requestId, item] of pending) {
    if (item.sessionId === sessionId) {
      pending.delete(requestId)
      closePrompt(requestId)
    }
  }
}

/* 清空全部交互（运行时进程退出）：逐条通知渲染层移除，避免界面残留 */
export function clearInteractions(): void {
  for (const requestId of pending.keys()) {
    closePrompt(requestId)
  }
  pending.clear()
}
