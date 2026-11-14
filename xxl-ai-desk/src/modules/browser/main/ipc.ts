/*
 * 浏览器域 IPC 注册：页面打开请求与页面动作桥。
 * @author xuxueli 2026-11-07
 */

import type { IpcContext } from '@common/main/ipc'
import { BROWSER_IPC } from '../shared/ipc'
import {
  resolveBrowserAction,
  setBrowserActionCancelSender,
  setBrowserActionSender
} from './browserBridge'
import { setBrowserPanelActive } from './shortcut'

export function registerBrowserIpc(ipc: IpcContext): void {
  setBrowserActionSender((request) => {
    ipc.send(BROWSER_IPC.actionRequest, request)
  })
  setBrowserActionCancelSender((sessionId) => {
    ipc.send(BROWSER_IPC.actionCancel, { sessionId })
  })
  ipc.handle(BROWSER_IPC.actionResult, (_event, requestId: string, result) =>
    resolveBrowserAction(requestId, result)
  )
  /* 面板激活态：仅激活时主进程才拦截浏览器快捷键 */
  ipc.handle(BROWSER_IPC.setPanelActive, (_event, active: boolean) => {
    setBrowserPanelActive(active === true)
  })
}
