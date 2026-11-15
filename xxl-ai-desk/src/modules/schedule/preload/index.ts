/*
 * 定时任务域 preload API 片段。
 * @author xuxueli 2026-11-15
 */

import { ipcRenderer } from 'electron'
import type { ScheduleApi } from '../shared/api'
import { SCHEDULE_IPC } from '../shared/ipc'

export const scheduleApi: ScheduleApi = {
  list: () => ipcRenderer.invoke(SCHEDULE_IPC.list),
  save: (input) => ipcRenderer.invoke(SCHEDULE_IPC.save, input),
  remove: (id: number) => ipcRenderer.invoke(SCHEDULE_IPC.remove, id),
  setEnabled: (id: number, enabled: boolean) =>
    ipcRenderer.invoke(SCHEDULE_IPC.setEnabled, id, enabled),
  runNow: (id: number) => ipcRenderer.invoke(SCHEDULE_IPC.runNow, id),
  logs: (query) => ipcRenderer.invoke(SCHEDULE_IPC.logs, query),
  clearLogs: (input) => ipcRenderer.invoke(SCHEDULE_IPC.clearLogs, input),
  watchdog: () => ipcRenderer.invoke(SCHEDULE_IPC.watchdog),
  getConfig: () => ipcRenderer.invoke(SCHEDULE_IPC.getConfig),
  saveConfig: (patch) => ipcRenderer.invoke(SCHEDULE_IPC.saveConfig, patch),
  onChanged: (callback) => {
    const listener = (_event: unknown, payload: Parameters<typeof callback>[0]): void =>
      callback(payload)
    ipcRenderer.on(SCHEDULE_IPC.changed, listener)
    return () => ipcRenderer.removeListener(SCHEDULE_IPC.changed, listener)
  }
}
