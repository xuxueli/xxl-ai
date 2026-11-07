/*
 * Agent 域 IPC 注册：Agent 配置 CRUD 与项目记忆。
 *   - 保存后清理关联会话运行时，使新配置下一轮立即生效；
 *   - 删除前校验默认 Agent 与会话占用；
 *   - 会话能力由组合根注入，避免 agent → chat 的模块反向依赖。
 * @author xuxueli 2026-11-07
 */

import type { IpcContext } from '@common/main/ipc'
import { t } from '@common/main/i18n'
import { AGENT_IPC } from '../shared/ipc'
import { listAgentMemories, saveAgentMemory } from './agentMemoryService'
import { deleteAgent, getAgentById, listAgents, saveAgent } from './agentService'
import { evictAgent } from './host/runtimeHost'

/* 会话域注入能力 */
interface AgentSessionDeps {
  /* 各 Agent 绑定会话数（一次分组统计） */
  countSessionsByAgents(): Record<number, number>
  /* Agent 绑定会话 ID 列表 */
  listSessionIdsByAgent(agentId: number): number[]
  /* 项目下会话 ID 列表 */
  listSessionIdsByProject(projectId: number): number[]
}

/* 清理指定会话运行时：配置或记忆变更后下一轮重新装配 */
function evictSessions(sessionIds: number[]): void {
  sessionIds.forEach((sessionId) => evictAgent(sessionId))
}

export function registerAgentIpc(ipc: IpcContext, sessions: AgentSessionDeps): void {
  ipc.handle(AGENT_IPC.list, () => {
    const counts = sessions.countSessionsByAgents()
    return listAgents().map((agent) => ({ ...agent, sessionCount: counts[agent.id] ?? 0 }))
  })
  ipc.handle(AGENT_IPC.save, (_event, input) => {
    const saved = saveAgent(input)
    /* 配置变更：仅清理绑定该 Agent 的会话运行时 */
    evictSessions(sessions.listSessionIdsByAgent(saved.id))
    const sessionCount = sessions.countSessionsByAgents()[saved.id] ?? 0
    return { ...saved, sessionCount }
  })
  ipc.handle(AGENT_IPC.remove, (_event, id: number) => {
    const existing = getAgentById(id)
    if (!existing) {
      return
    }
    if (existing.builtin) {
      throw new Error(t('runtime.error.agentBuiltinUndeletable'))
    }
    const sessionCount = sessions.countSessionsByAgents()[id] ?? 0
    if (sessionCount > 0) {
      throw new Error(t('runtime.error.agentInUse', [sessionCount]))
    }
    deleteAgent(id)
  })

  ipc.handle(AGENT_IPC.memoryList, () => listAgentMemories())
  ipc.handle(AGENT_IPC.memorySave, (_event, input) => {
    const saved = saveAgentMemory(input)
    /* 记忆变更：清理项目下会话运行时，下一轮注入最新内容 */
    evictSessions(sessions.listSessionIdsByProject(saved.projectId))
    return saved
  })
}
