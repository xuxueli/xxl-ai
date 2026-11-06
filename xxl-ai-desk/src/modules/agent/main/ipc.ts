/*
 * Agent 域 IPC 注册：项目记忆。
 * @author xuxueli 2026-11-07
 */

import type { IpcContext } from '@common/main/ipc'
import { AGENT_IPC } from '../shared/ipc'
import { listAgentMemories, removeAgentMemory, saveAgentMemory } from './agentMemoryService'

export function registerAgentIpc(ipc: IpcContext): void {
  ipc.handle(AGENT_IPC.memoryList, () => listAgentMemories())
  ipc.handle(AGENT_IPC.memorySave, (_event, input) => saveAgentMemory(input))
  ipc.handle(AGENT_IPC.memoryRemove, (_event, projectId: string) => removeAgentMemory(projectId))
}
