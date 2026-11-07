/*
 * Agent 域 preload API 契约。
 * @author xuxueli 2026-11-07
 */

import type { AgentDTO, AgentMemoryDTO, AgentMemorySaveInput, AgentSaveInput } from './contracts'

export interface AgentApi {
  /* Agent 配置 */
  list(): Promise<AgentDTO[]>
  save(input: AgentSaveInput): Promise<AgentDTO>
  remove(id: number): Promise<void>
  /* 项目记忆 */
  memoryList(): Promise<AgentMemoryDTO[]>
  memorySave(input: AgentMemorySaveInput): Promise<AgentMemoryDTO>
}
