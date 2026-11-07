/*
 * 供应商域 IPC 注册。
 * @author xuxueli 2026-11-07
 */

import type { IpcContext } from '@common/main/ipc'
import { PROVIDER_IPC } from '../shared/ipc'
import { deleteProvider, fetchRemoteModels, listProviders, saveProvider } from './providerService'
import { resetAgents } from '@modules/agent/main'

export function registerProviderIpc(ipc: IpcContext): void {
  ipc.handle(PROVIDER_IPC.list, () => listProviders())
  ipc.handle(PROVIDER_IPC.save, (_event, dto) => {
    const saved = saveProvider(dto)
    resetAgents()
    return saved
  })
  ipc.handle(PROVIDER_IPC.remove, (_event, id: number) => {
    deleteProvider(id)
    resetAgents()
  })
  ipc.handle(PROVIDER_IPC.remoteModels, (_event, input) => fetchRemoteModels(input))
}
