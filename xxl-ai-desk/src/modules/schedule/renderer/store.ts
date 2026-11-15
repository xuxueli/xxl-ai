/*
 * 定时任务状态：列表、筛选、休眠开关与运行触发。
 *   - 只经 api.schedule 访问能力；
 *   - 运行实例不在本地维护，页面按 chat.sessions 过滤。
 * @author xuxueli 2026-11-15
 */

import { defineStore } from 'pinia'
import { computed, reactive, ref } from 'vue'
import { api } from '@common/renderer/api'
import { SCHEDULE_CONFIG_DEFAULT } from '@modules/schedule/shared'
import type {
  ScheduleConfigDTO,
  ScheduledTaskDTO,
  ScheduledTaskInput
} from '@modules/schedule/shared'

/* 状态筛选值 */
type ScheduleStatusFilter = 'all' | 'enabled' | 'disabled' | 'running' | 'failed' | 'invalid'

/* 列表筛选条件 */
interface ScheduleFilters {
  keyword: string
  projectId: number
  agentId: number
  status: ScheduleStatusFilter
}

export const useScheduleStore = defineStore('schedule', () => {
  /* 任务列表（主进程已按更新时间倒序） */
  const tasks = ref<ScheduledTaskDTO[]>([])
  /* 列表是否已加载 */
  const loaded = ref(false)
  /* 列表加载中 */
  const loading = ref(false)
  /* 任务设置（休眠 / 最大并发数） */
  const config = ref<ScheduleConfigDTO>({ ...SCHEDULE_CONFIG_DEFAULT })
  /* 设置保存中 */
  const configSaving = ref(false)
  /* 筛选条件 */
  const filters = reactive<ScheduleFilters>({
    keyword: '',
    projectId: 0,
    agentId: 0,
    status: 'all'
  })

  /* 变更事件解绑函数与订阅计数：任务列表 / 运行记录切换时避免相互解绑 */
  let unbindChanged: (() => void) | null = null
  let bindCount = 0

  /* 筛选后的任务列表 */
  const filteredTasks = computed(() => {
    const keyword = filters.keyword.trim().toLowerCase()
    return tasks.value.filter((task) => {
      if (keyword && !`${task.name} ${task.prompt}`.toLowerCase().includes(keyword)) {
        return false
      }
      if (filters.projectId && task.projectId !== filters.projectId) {
        return false
      }
      if (filters.agentId && task.agentId !== filters.agentId) {
        return false
      }
      if (filters.status === 'enabled' && !task.enabled) {
        return false
      }
      if (filters.status === 'disabled' && task.enabled) {
        return false
      }
      if (filters.status === 'running' && !task.running) {
        return false
      }
      if (filters.status === 'failed' && task.lastRunStatus !== 'failed') {
        return false
      }
      if (filters.status === 'invalid' && !task.invalidReason) {
        return false
      }
      return true
    })
  })

  /* 加载任务列表 */
  async function loadTasks(): Promise<void> {
    loading.value = true
    try {
      tasks.value = await api.schedule.list()
      loaded.value = true
    } finally {
      loading.value = false
    }
  }

  /* 加载任务设置 */
  async function loadConfig(): Promise<void> {
    config.value = await api.schedule.getConfig()
  }

  /* 保存任务（新增 / 编辑） */
  async function saveTask(input: ScheduledTaskInput): Promise<ScheduledTaskDTO> {
    const saved = await api.schedule.save(input)
    await loadTasks()
    return saved
  }

  /* 删除任务 */
  async function removeTask(id: number): Promise<void> {
    await api.schedule.remove(id)
    await loadTasks()
  }

  /* 启停任务 */
  async function setEnabled(id: number, enabled: boolean): Promise<void> {
    await api.schedule.setEnabled(id, enabled)
    await loadTasks()
  }

  /* 立即运行：返回本次实例会话 ID */
  async function runNow(id: number): Promise<number> {
    const result = await api.schedule.runNow(id)
    await loadTasks()
    return result.sessionId
  }

  /* 保存任务设置 */
  async function saveConfig(patch: Partial<ScheduleConfigDTO>): Promise<void> {
    configSaving.value = true
    try {
      config.value = await api.schedule.saveConfig(patch)
    } finally {
      configSaving.value = false
    }
  }

  /* 订阅任务 / 运行状态变化（按页面引用计数，避免切换子页时互相解绑） */
  function bindEvents(): void {
    bindCount += 1
    if (bindCount > 1) {
      return
    }
    unbindChanged = api.schedule.onChanged(() => {
      void loadTasks()
    })
  }

  /* 页面卸载时释放引用，最后一个页面退出后真正解绑 */
  function unbindEvents(): void {
    bindCount = Math.max(0, bindCount - 1)
    if (bindCount > 0) {
      return
    }
    unbindChanged?.()
    unbindChanged = null
  }

  /* 重置筛选条件 */
  function resetFilters(): void {
    filters.keyword = ''
    filters.projectId = 0
    filters.agentId = 0
    filters.status = 'all'
  }

  return {
    tasks,
    loaded,
    loading,
    config,
    configSaving,
    filters,
    filteredTasks,
    loadTasks,
    loadConfig,
    saveTask,
    removeTask,
    setEnabled,
    runNow,
    saveConfig,
    bindEvents,
    unbindEvents,
    resetFilters
  }
})
