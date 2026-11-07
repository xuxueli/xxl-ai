/*
 * Agent 域 IPC 注册：Agent 配置 CRUD 与项目记忆。
 *   - 保存后清理关联会话运行时，使新配置下一轮立即生效；
 *   - 删除前校验默认 Agent 与会话占用。
 * @author xuxueli 2026-11-07
 */

import type { IpcContext } from '@common/main/ipc'
import { AGENT_IPC } from '../shared/ipc'
import { listAgentMemories, removeAgentMemory, saveAgentMemory } from './agentMemoryService'
import { deleteAgent, getAgentById, listAgents, saveAgent } from './agentService'
import { evictAgent } from './host/runtimeHost'
import { countSessionsByAgent, listSessionIdsByAgent } from '@modules/chat/main'

/* 列表补全会话占用数（跨域统计在 IPC 层编排） */
function withSessionCount<T extends { id: string }>(agent: T): T & { sessionCount: number } {
  return { ...agent, sessionCount: countSessionsByAgent(agent.id) }
}

export function registerAgentIpc(ipc: IpcContext): void {
  ipc.handle(AGENT_IPC.list, () => listAgents().map(withSessionCount))
  ipc.handle(AGENT_IPC.save, (_event, input) => {
    const saved = saveAgent(input)
    /* 配置变更：仅清理绑定该 Agent 的会话运行时 */
    for (const sessionId of listSessionIdsByAgent(saved.id)) {
      evictAgent(sessionId)
    }
    return withSessionCount(saved)
  })
  ipc.handle(AGENT_IPC.remove, (_event, id: string) => {
    const existing = getAgentById(id)
    if (!existing) {
      return
    }
    if (existing.builtin) {
      throw new Error('默认 Agent 不允许删除')
    }
    const sessionCount = countSessionsByAgent(id)
    if (sessionCount > 0) {
      throw new Error(`该 Agent 已被 ${sessionCount} 个会话使用，无法删除`)
    }
    deleteAgent(id)
  })

  ipc.handle(AGENT_IPC.memoryList, () => listAgentMemories())
  ipc.handle(AGENT_IPC.memorySave, (_event, input) => saveAgentMemory(input))
  ipc.handle(AGENT_IPC.memoryRemove, (_event, projectId: string) => removeAgentMemory(projectId))
}
