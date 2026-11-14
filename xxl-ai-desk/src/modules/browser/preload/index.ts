/*
 * 浏览器域 preload API 片段。
 * @author xuxueli 2026-11-07
 */

import { ipcRenderer } from 'electron'
import type { BrowserApi } from '../shared/api'
import { BROWSER_IPC } from '../shared/ipc'

export const browserApi: BrowserApi = {
  onOpenTab: (callback) => {
    const listener = (_event: unknown, payload: Parameters<typeof callback>[0]): void =>
      callback(payload)
    ipcRenderer.on(BROWSER_IPC.openTab, listener)
    return () => ipcRenderer.removeListener(BROWSER_IPC.openTab, listener)
  },
  onActionRequest: (callback) => {
    const listener = (_event: unknown, payload: Parameters<typeof callback>[0]): void =>
      callback(payload)
    ipcRenderer.on(BROWSER_IPC.actionRequest, listener)
    return () => ipcRenderer.removeListener(BROWSER_IPC.actionRequest, listener)
  },
  onActionCancel: (callback) => {
    const listener = (_event: unknown, payload: Parameters<typeof callback>[0]): void =>
      callback(payload)
    ipcRenderer.on(BROWSER_IPC.actionCancel, listener)
    return () => ipcRenderer.removeListener(BROWSER_IPC.actionCancel, listener)
  },
  respondAction: (requestId: string, result) =>
    ipcRenderer.invoke(BROWSER_IPC.actionResult, requestId, result),
  onShortcutKey: (callback) => {
    const listener = (_event: unknown, payload: Parameters<typeof callback>[0]): void =>
      callback(payload)
    ipcRenderer.on(BROWSER_IPC.shortcutKey, listener)
    return () => ipcRenderer.removeListener(BROWSER_IPC.shortcutKey, listener)
  },
  setPanelActive: (active: boolean) => ipcRenderer.invoke(BROWSER_IPC.setPanelActive, active)
}
