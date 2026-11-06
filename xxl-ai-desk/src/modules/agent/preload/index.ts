/*
 * Agent 域 preload API 片段。
 * @author xuxueli 2026-11-07
 */

import { ipcRenderer } from 'electron'
import type { AgentMemoryApi } from '../shared/api'
import { AGENT_IPC } from '../shared/ipc'

export const agentMemoryApi: AgentMemoryApi = {
  list: () => ipcRenderer.invoke(AGENT_IPC.memoryList),
  save: (input) => ipcRenderer.invoke(AGENT_IPC.memorySave, input),
  remove: (projectId: string) => ipcRenderer.invoke(AGENT_IPC.memoryRemove, projectId)
}
