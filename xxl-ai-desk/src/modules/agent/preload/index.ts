/*
 * Agent 域 preload API 片段：Agent 配置与项目记忆。
 * @author xuxueli 2026-11-07
 */

import { ipcRenderer } from 'electron'
import type { AgentApi } from '../shared/api'
import { AGENT_IPC } from '../shared/ipc'

export const agentApi: AgentApi = {
  list: () => ipcRenderer.invoke(AGENT_IPC.list),
  save: (input) => ipcRenderer.invoke(AGENT_IPC.save, input),
  remove: (id: number) => ipcRenderer.invoke(AGENT_IPC.remove, id),
  memoryList: () => ipcRenderer.invoke(AGENT_IPC.memoryList),
  memorySave: (input) => ipcRenderer.invoke(AGENT_IPC.memorySave, input)
}
