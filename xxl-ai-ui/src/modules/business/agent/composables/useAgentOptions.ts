/**
 * 「所属 Agent」下拉选项（对话管理、长期记忆等页面共用，保证取数逻辑一致）
 *
 * 取空间内全部 Agent（/agent/loadAll），不区分发布状态与记忆开关：
 * Agent 可能先开启记忆、后关闭记忆，历史数据仍需可按 Agent 过滤查询。
 */
import { agentApi } from '../api'
import { ref } from 'vue'

/** 下拉选项：{ id, name } */
export interface AgentOption {
  id: number
  name: string
}

export function useAgentOptions() {
  const agentOptions = ref<AgentOption[]>([])

  /**
   * 加载空间内全部 Agent 作为下拉选项
   */
  function loadAgentOptions() {
    agentApi
      .loadAll()
      .then((response) => {
        agentOptions.value = (response.data || []).map((a) => ({ id: Number(a.id), name: a.name ?? '' }))
      })
      .catch(() => {})
  }

  return { agentOptions, loadAgentOptions }
}
