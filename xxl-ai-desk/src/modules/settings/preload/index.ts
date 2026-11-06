/*
 * 设置域 preload API 片段。
 * @author xuxueli 2026-11-07
 */

import { ipcRenderer } from 'electron'
import type { SettingsApi } from '../shared/api'
import { SETTINGS_IPC } from '../shared/ipc'

export const settingsApi: SettingsApi = {
  get: () => ipcRenderer.invoke(SETTINGS_IPC.get),
  save: (patch) => ipcRenderer.invoke(SETTINGS_IPC.save, patch)
}
