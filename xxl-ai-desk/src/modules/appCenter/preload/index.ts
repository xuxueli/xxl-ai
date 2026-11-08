/*
 * 应用中心 preload API 片段。
 * @author xuxueli 2026-11-08
 */

import { ipcRenderer } from 'electron'
import type { AppCenterApi } from '../shared/api'
import { APP_CENTER_IPC } from '../shared/ipc'

export const appCenterApi: AppCenterApi = {
  listStates: () => ipcRenderer.invoke(APP_CENTER_IPC.listStates),
  getState: (appId) => ipcRenderer.invoke(APP_CENTER_IPC.getState, appId),
  install: (appId) => ipcRenderer.invoke(APP_CENTER_IPC.install, appId),
  uninstall: (appId) => ipcRenderer.invoke(APP_CENTER_IPC.uninstall, appId),
  setEnabled: (appId, enabled) => ipcRenderer.invoke(APP_CENTER_IPC.setEnabled, appId, enabled)
}
