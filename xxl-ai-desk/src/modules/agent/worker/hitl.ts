/*
 * 运行时侧人机交互桥：把工具/沙箱的等待请求转交主进程，在渲染层输入框位置内联展示，并在用户应答、
 * 生成终止或运行时清理时结算 Promise，保证工具不会永久悬挂。
 *
 * 本模块只做请求配对与生命周期管理，不感知界面与业务；跨进程发送由运行时入口注入。
 *
 * @author xuxueli 2026-10-31
 */

import type { WorkerMessage } from '@modules/agent/shared/agentProtocol'
import type { InteractionRequest, InteractionResult } from '@modules/chat/shared'

/* 挂起中的交互请求 */
interface PendingInteraction {
  /* 所属会话主键 */
  sessionId: number
  /* 结算回调 */
  resolve: (result: InteractionResult) => void
  /* 工具调用信号（终止时自动取消） */
  signal?: AbortSignal
  /* 信号监听器（结算时移除） */
  onAbort?: () => void
}

/* 待响应请求：requestId → 结算信息 */
const pending = new Map<string, PendingInteraction>()

/* 发送消息到主进程（运行时入口注入） */
let sender: ((message: WorkerMessage) => void) | null = null

/* 注册发送器（运行时进程启动时调用一次） */
export function setInteractionSender(send: ((message: WorkerMessage) => void) | null): void {
  sender = send
}

/* 生成请求标识 */
function nextRequestId(): string {
  return `ia_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`
}

/* 结算请求：首到者生效，后到的应答/取消直接忽略 */
function settle(requestId: string, result: InteractionResult, notify: boolean): boolean {
  const item = pending.get(requestId)
  if (!item) {
    return false
  }
  pending.delete(requestId)
  if (item.signal && item.onAbort) {
    item.signal.removeEventListener('abort', item.onAbort)
  }
  /* 由运行时主动取消：通知渲染层移除仍展示的交互面板 */
  if (notify) {
    sender?.({ type: 'interaction-cancel', requestId })
  }
  item.resolve(result)
  return true
}

/* 发起交互并等待用户应答 */
export function requestInteraction(
  sessionId: number,
  request: InteractionRequest,
  signal?: AbortSignal
): Promise<InteractionResult> {
  if (!sender) {
    return Promise.resolve({ status: 'cancelled' })
  }
  const requestId = nextRequestId()
  return new Promise<InteractionResult>((resolve) => {
    /* 工具调用已终止：不再发起交互 */
    if (signal?.aborted) {
      resolve({ status: 'cancelled' })
      return
    }
    const onAbort = (): void => {
      settle(requestId, { status: 'cancelled' }, true)
    }
    pending.set(requestId, { sessionId, resolve, signal, onAbort })
    signal?.addEventListener('abort', onAbort, { once: true })
    sender?.({ type: 'interaction-request', requestId, sessionId, request })
  })
}

/* 主进程回传用户应答（worker.ts 调用） */
export function respondInteraction(requestId: string, result: InteractionResult): void {
  settle(requestId, result, false)
}

/* 取消某会话的全部挂起交互（终止生成 / 释放会话） */
export function cancelSessionInteractions(sessionId: number): void {
  for (const [requestId, item] of pending) {
    if (item.sessionId === sessionId) {
      settle(requestId, { status: 'cancelled' }, true)
    }
  }
}

/* 取消全部挂起交互（重置运行时 / 退出） */
export function cancelAllInteractions(): void {
  for (const requestId of [...pending.keys()]) {
    settle(requestId, { status: 'cancelled' }, true)
  }
}
