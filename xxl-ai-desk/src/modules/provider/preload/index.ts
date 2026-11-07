/*
 * 供应商域 preload API 片段。
 * @author xuxueli 2026-11-07
 */

import { ipcRenderer } from 'electron'
import type { ProviderApi } from '../shared/api'
import { PROVIDER_IPC } from '../shared/ipc'

export const providerApi: ProviderApi = {
  list: () => ipcRenderer.invoke(PROVIDER_IPC.list),
  save: (dto) => ipcRenderer.invoke(PROVIDER_IPC.save, dto),
  remove: (id: number) => ipcRenderer.invoke(PROVIDER_IPC.remove, id),
  remoteModels: (input) => ipcRenderer.invoke(PROVIDER_IPC.remoteModels, input)
}
