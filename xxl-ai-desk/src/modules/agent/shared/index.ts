/*
 * agent 模块跨进程公共契约出口。
 * @author xuxueli 2026-11-07
 */

export type { HostEvent, ProviderModelConfig, RunAgentInput } from './agentProtocol'
export type { AgentApi } from './api'
export { AGENT_AVATAR_PRESETS, resolveAgentAvatar } from './agentPresets'
export type { AgentAvatarPreset } from './agentPresets'
export {
  AGENT_DESCRIPTION_MAX_CHARS,
  AGENT_INSTRUCTION_MAX_CHARS,
  AGENT_MEMORY_MAX_CHARS,
  AGENT_MEMORY_REFRESH_MS,
  AGENT_NAME_MAX_CHARS,
  DEFAULT_AGENT_AVATAR,
  DEFAULT_AGENT_TOOLS,
  EMPTY_AGENT_TOOLS
} from './contracts'
export type {
  AgentDTO,
  AgentMemoryDTO,
  AgentMemorySaveInput,
  AgentSaveInput,
  AgentToolSwitches
} from './contracts'
