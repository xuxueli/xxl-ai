/*
 * 浏览器域 IPC 注册：Agent 打开标签页与页面动作桥。
 * @author xuxueli 2026-11-07
 */

import type { IpcContext } from '@common/main/ipc'
import { BROWSER_IPC } from '../shared/ipc'
import { resolveBrowserAction, setBrowserActionSender } from './browserBridge'
import { setBrowserOpener } from '@modules/agent/main'

export function registerBrowserIpc(ipc: IpcContext): void {
  setBrowserOpener((sessionId, url, newTab) => {
    ipc.send(BROWSER_IPC.openTab, { sessionId: String(sessionId), url, newTab })
  })
  setBrowserActionSender((request) => {
    ipc.send(BROWSER_IPC.actionRequest, request)
  })
  ipc.handle(BROWSER_IPC.actionResult, (_event, requestId: string, result) =>
    resolveBrowserAction(requestId, result)
  )
}
