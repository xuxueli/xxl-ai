/*
 * 主进程侧越界审批：运行时进程把越界访问转交此处，
 * 由主进程转发渲染进程弹「应用内对话框」，再回传用户选择（允许本次 / 本会话允许 / 拒绝）。
 */

import { BrowserWindow } from 'electron'
import { IPC } from '../../shared/ipc'
import type { ApprovalChoice, ApprovalRequest } from '../../shared/agentProtocol'
import type { ChatApprovalPrompt } from '../../shared/ipc'

/* 待响应的审批请求：requestId → resolve 回调 */
const pending = new Map<string, (choice: ApprovalChoice) => void>()

/* 渲染进程回传审批结果（由 ipc.ts 的 chatApprovalRespond 处理器调用） */
export function resolveApproval(requestId: string, choice: ApprovalChoice): void {
  const resolve = pending.get(requestId)
  if (resolve) {
    pending.delete(requestId)
    resolve(choice)
  }
}

/* 请求越界审批：转发渲染进程弹应用内对话框，等待其回传选择；窗口缺失即拒绝 */
export function confirmOutside(input: ApprovalRequest): Promise<ApprovalChoice> {
  const window = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
  if (!window || window.isDestroyed()) {
    return Promise.resolve('deny')
  }
  const requestId = `ap_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`
  const prompt: ChatApprovalPrompt = {
    requestId,
    tool: input.tool,
    action: input.action,
    abs: input.abs,
    root: input.root
  }
  return new Promise<ApprovalChoice>((resolve) => {
    pending.set(requestId, resolve)
    window.webContents.send(IPC.chatApprovalRequest, prompt)
  })
}
