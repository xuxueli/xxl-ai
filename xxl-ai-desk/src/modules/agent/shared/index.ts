/*
 * agent 模块跨进程公共契约出口。
 * @author xuxueli 2026-11-07
 */

export type { HostEvent, ProviderModelConfig, RunAgentInput } from './agentProtocol'
export type { AgentMemoryApi } from './api'
export { AGENT_INSTRUCTION_MAX_CHARS, AGENT_MEMORY_MAX_CHARS, AGENT_MEMORY_MESSAGE_LIMIT } from './contracts'
export type { AgentMemoryDTO, AgentMemorySaveInput } from './contracts'
