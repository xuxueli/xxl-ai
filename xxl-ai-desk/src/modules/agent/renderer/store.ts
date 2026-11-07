/*
 * Agent 状态：多 Agent 列表 / 当前选择 / CRUD，以及按项目维护的长期记忆。
 *   - 当前选择用于新建会话的默认 Agent（类似项目选择）；
 *   - 运行配置以主进程为准，这里只保留展示态与交互态。
 * @author xuxueli 2026-10-31
 */

import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { api } from '@common/renderer/api'
import type { AgentDTO, AgentMemoryDTO, AgentSaveInput } from '@modules/agent/shared'

export const useAgentStore = defineStore('agent', () => {
  /* Agent 列表（默认 Agent 优先） */
  const agents = ref<AgentDTO[]>([])
  /* 当前选中 Agent id（新建会话默认绑定） */
  const currentId = ref(0)
  /* Agent 列表是否已加载 */
  const loaded = ref(false)

  /* 项目长期记忆列表（无记忆的项目 content 为空） */
  const memories = ref<AgentMemoryDTO[]>([])

  /* 当前 Agent 对象（未选中为 null） */
  const currentAgent = computed(
    () => agents.value.find((item) => item.id === currentId.value) ?? null
  )

  /* 默认内置 Agent */
  const defaultAgent = computed(() => agents.value.find((item) => item.builtin) ?? null)

  /* 加载 Agent 列表（保留当前选择，失效回落默认 Agent） */
  async function loadAgents(): Promise<void> {
    agents.value = await api.agent.list()
    loaded.value = true
    if (currentId.value && !agents.value.some((item) => item.id === currentId.value)) {
      currentId.value = 0
    }
    if (!currentId.value) {
      currentId.value = defaultAgent.value?.id ?? agents.value[0]?.id ?? 0
    }
  }

  /* 选择当前 Agent */
  function selectAgent(id: number): void {
    currentId.value = id
  }

  /* 选中默认内置 Agent（新建对话使用） */
  function selectDefaultAgent(): void {
    currentId.value = defaultAgent.value?.id ?? agents.value[0]?.id ?? 0
  }

  /* 保存 Agent（新建或更新）：回读列表以复用主进程排序与会话占用统计 */
  async function saveAgent(input: AgentSaveInput): Promise<AgentDTO> {
    /* 深拷贝为纯数据，避免 Vue 响应式代理经 IPC 结构化克隆失败 */
    const payload = JSON.parse(JSON.stringify(input)) as AgentSaveInput
    const saved = await api.agent.save(payload)
    await loadAgents()
    currentId.value = saved.id
    return saved
  }

  /* 删除 Agent（后端校验默认 Agent 与会话占用） */
  async function removeAgent(id: number): Promise<void> {
    await api.agent.remove(id)
    agents.value = agents.value.filter((item) => item.id !== id)
    if (currentId.value === id) {
      currentId.value = defaultAgent.value?.id ?? agents.value[0]?.id ?? 0
    }
  }

  /* 加载全部项目长期记忆 */
  async function loadMemories(): Promise<void> {
    memories.value = await api.agent.memoryList()
  }

  /* 保存项目记忆并就地更新列表 */
  async function saveMemory(projectId: number, content: string): Promise<void> {
    const saved = await api.agent.memorySave({ projectId, content })
    const index = memories.value.findIndex((item) => item.projectId === projectId)
    if (index >= 0) {
      memories.value[index] = saved
    } else {
      memories.value.push(saved)
    }
  }

  return {
    agents,
    currentId,
    loaded,
    memories,
    currentAgent,
    defaultAgent,
    loadAgents,
    selectAgent,
    selectDefaultAgent,
    saveAgent,
    removeAgent,
    loadMemories,
    saveMemory
  }
})
