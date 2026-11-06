/*
 * Agent 记忆状态：按项目维护记忆列表，读写统一经 api.agentMemory。
 * @author xuxueli 2026-10-31
 */

import { defineStore } from 'pinia'
import { ref } from 'vue'
import { api } from '@common/renderer/api'
import type { AgentMemoryDTO } from '@modules/agent/shared'

export const useAgentStore = defineStore('agent', () => {
  /* 项目记忆列表（无记忆的项目 content 为空） */
  const memories = ref<AgentMemoryDTO[]>([])
  /* 是否已加载 */
  const loaded = ref(false)

  /* 加载全部项目记忆 */
  async function loadMemories(): Promise<void> {
    memories.value = await api.agentMemory.list()
    loaded.value = true
  }

  /* 保存项目记忆并就地更新列表 */
  async function saveMemory(projectId: string, content: string): Promise<void> {
    const saved = await api.agentMemory.save({ projectId, content })
    const index = memories.value.findIndex((item) => item.projectId === projectId)
    if (index >= 0) {
      memories.value[index] = saved
    } else {
      memories.value.push(saved)
    }
  }

  /* 删除项目记忆（仅清内容，保留项目） */
  async function removeMemory(projectId: string): Promise<void> {
    await api.agentMemory.remove(projectId)
    const target = memories.value.find((item) => item.projectId === projectId)
    if (target) {
      target.content = ''
      target.lastMessageTime = ''
      target.updateTime = ''
    }
  }

  return { memories, loaded, loadMemories, saveMemory, removeMemory }
})
