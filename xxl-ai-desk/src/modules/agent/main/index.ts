/*
 * agent 模块主进程公共出口。
 * @author xuxueli 2026-11-07
 */

export { countAgentsByMcpId, countAgentsBySkillId, getAgentById, listAgents, saveAgent } from './agentService'
export { getAgentMemory, maybeGenerateAgentMemory } from './agentMemoryService'
export { resolveAgentTarget, toRuntimeConfig } from './runtimeTarget'
