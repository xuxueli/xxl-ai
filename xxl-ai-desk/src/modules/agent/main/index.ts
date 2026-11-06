/*
 * agent 模块主进程公共出口。
 * @author xuxueli 2026-11-07
 */

export { getAgentMemory, maybeGenerateAgentMemory, removeAgentMemory } from './agentMemoryService'
export { cancelInteraction, cancelInteractionsOf, clearInteractions, openInteraction, resolveInteraction } from './host/interaction'
export { abortAgent, clearSessionPermissions, disposeAgentRuntime, evictAgent, generateMemory, isAgentRunning, listMcpToolsByRuntime, resetAgents, runAgent, setBrowserOpener, testMcpByRuntime } from './host/runtimeHost'
export { registerAgentIpc } from './ipc'
