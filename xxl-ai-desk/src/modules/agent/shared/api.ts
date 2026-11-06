/*
 * Agent 域 preload API 契约。
 * @author xuxueli 2026-11-07
 */

import type { AgentMemoryDTO, AgentMemorySaveInput } from './contracts'

export interface AgentMemoryApi {
  list(): Promise<AgentMemoryDTO[]>
  save(input: AgentMemorySaveInput): Promise<AgentMemoryDTO>
  remove(projectId: string): Promise<void>
}
