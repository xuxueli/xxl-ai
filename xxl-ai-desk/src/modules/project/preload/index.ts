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
  rename: (id: number, name: string) => ipcRenderer.invoke(PROJECT_IPC.rename, id, name),
  remove: (id: number) => ipcRenderer.invoke(PROJECT_IPC.remove, id),
  reveal: (id: number) => ipcRenderer.invoke(PROJECT_IPC.reveal, id),
  setMemoryEnabled: (id: number, enabled: boolean) =>
    ipcRenderer.invoke(PROJECT_IPC.setMemoryEnabled, id, enabled)
}
