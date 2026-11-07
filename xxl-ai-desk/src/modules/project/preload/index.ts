/*
 * 项目域 preload API 片段。
 * @author xuxueli 2026-11-07
 */

import { ipcRenderer } from 'electron'
import type { ProjectApi } from '../shared/api'
import { PROJECT_IPC } from '../shared/ipc'

export const projectApi: ProjectApi = {
  list: () => ipcRenderer.invoke(PROJECT_IPC.list),
  create: (input) => ipcRenderer.invoke(PROJECT_IPC.create, input),
  rename: (id: string, name: string) => ipcRenderer.invoke(PROJECT_IPC.rename, id, name),
  remove: (id: string) => ipcRenderer.invoke(PROJECT_IPC.remove, id),
  reveal: (id: string) => ipcRenderer.invoke(PROJECT_IPC.reveal, id),
  setMemoryEnabled: (id: string, enabled: boolean) =>
    ipcRenderer.invoke(PROJECT_IPC.setMemoryEnabled, id, enabled)
}
