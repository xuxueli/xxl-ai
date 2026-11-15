/*
 * 定时任务状态：列表、筛选、休眠开关、运行触发与运行日志。
 *   - 只经 api.schedule 访问能力；
 *   - 运行日志由主进程分页返回（含被跳过的触发）。
 * @author xuxueli 2026-11-15
 */

import { defineStore } from 'pinia'
import { computed, reactive, ref } from 'vue'
import { api } from '@common/renderer/api'
import { SCHEDULE_CONFIG_DEFAULT } from '@modules/schedule/shared'
import { dayRangeBounds } from '@modules/schedule/renderer/utils/time'
import type {
  ScheduleConfigDTO,
  ScheduleLogClearInput,
  ScheduleLogDTO,
  ScheduledTaskDTO,
  ScheduledTaskInput,
  ScheduleWatchdogStatusDTO
} from '@modules/schedule/shared'

/* 状态筛选值：只表达任务自身启停状态 */
type ScheduleStatusFilter = 'all' | 'enabled' | 'disabled'

/* 列表筛选条件 */
interface ScheduleFilters {
  keyword: string
  projectId: number
  agentId: number
  status: ScheduleStatusFilter
}

/* 运行日志默认分页大小 */
const SCHEDULE_LOG_PAGE_SIZE = 10

export const useScheduleStore = defineStore('schedule', () => {
  /* 任务列表（主进程已按任务名称自然排序） */
  const tasks = ref<ScheduledTaskDTO[]>([])
  /* 列表加载中 */
  const loading = ref(false)
  /* 调度设置（休眠 / 最大并发数） */
  const config = ref<ScheduleConfigDTO>({ ...SCHEDULE_CONFIG_DEFAULT })
  /* 设置保存中 */
  const configSaving = ref(false)
  /* 巡检运行状态（上次 / 下次巡检时间） */
  const watchdogStatus = ref<ScheduleWatchdogStatusDTO>({
    interval: SCHEDULE_CONFIG_DEFAULT.watchdogInterval,
    lastRunAt: '',
    nextRunAt: ''
  })
  /* 运行日志（当前页） */
  const logs = ref<ScheduleLogDTO[]>([])
  /* 运行日志总数 */
  const logTotal = ref(0)
  /* 运行日志页码（从 1 开始） */
  const logPage = ref(1)
  /* 运行日志分页大小 */
  const logPageSize = ref(SCHEDULE_LOG_PAGE_SIZE)
  /* 运行日志筛选：任务主键，0 表示全部 */
  const logTaskId = ref(0)
  /* 运行日志触发时间范围：本地 YYYY-MM-DD，首尾日期均包含；null 表示不限 */
  const logRangeDates = ref<[string, string] | null>(null)
  /* 运行日志是否已加载：变更事件只在日志页打开后刷新它 */
  const logsLoaded = ref(false)
  /* 运行日志加载中 */
  const logsLoading = ref(false)
  /* 筛选条件 */
  const filters = reactive<ScheduleFilters>({
    keyword: '',
    projectId: 0,
    agentId: 0,
    status: 'all'
  })

  /* 变更事件解绑函数与订阅计数：列表 / 日志页切换时避免相互解绑 */
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
      return true
    })
  })

  /* 加载任务列表 */
  async function loadTasks(): Promise<void> {
    loading.value = true
    try {
      tasks.value = await api.schedule.list()
    } finally {
      loading.value = false
    }
  }

  /* 加载运行日志：按当前任务筛选、时间范围与分页参数查询 */
  async function loadLogs(page = logPage.value, pageSize = logPageSize.value): Promise<void> {
    logPage.value = page
    logPageSize.value = pageSize
    logsLoading.value = true
    try {
      const result = await api.schedule.logs({
        taskId: logTaskId.value || undefined,
        ...dayRangeBounds(logRangeDates.value),
        page,
        pageSize
      })
      logs.value = result.items
      logTotal.value = result.total
      logsLoaded.value = true
      /* 当前页被裁剪（删除 / 数据收缩）时回退到最后一页 */
      const lastPage = Math.max(1, Math.ceil(result.total / pageSize))
      if (result.total > 0 && page > lastPage) {
        await loadLogs(lastPage, pageSize)
      }
    } finally {
      logsLoading.value = false
    }
  }

  /* 清理运行日志：按任务 + 时间范围删除后回到第一页，返回删除条数 */
  async function clearLogs(input: ScheduleLogClearInput): Promise<number> {
    const deleted = await api.schedule.clearLogs(input)
    await loadLogs(1)
    return deleted
  }

  /* 更新日志筛选：只传需变更的维度，统一回到第一页 */
  async function filterLogs(patch: {
    taskId?: number
    dates?: [string, string] | null
  }): Promise<void> {
    if (patch.taskId !== undefined) {
      logTaskId.value = patch.taskId
    }
    if (patch.dates !== undefined) {
      logRangeDates.value = patch.dates
    }
    await loadLogs(1)
  }

  /* 加载调度设置 */
  async function loadConfig(): Promise<void> {
    config.value = await api.schedule.getConfig()
  }

  /* 加载巡检运行状态（上次 / 下次巡检时间） */
  async function loadWatchdogStatus(): Promise<void> {
    watchdogStatus.value = await api.schedule.watchdog()
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

  /* 保存调度设置 */
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
      /* 日志页打开时才刷新日志，避免任务页每次变更都多查一次 */
      if (logsLoaded.value) {
        void loadLogs()
      }
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
    loading,
    config,
    configSaving,
    watchdogStatus,
    logs,
    logTotal,
    logPage,
    logPageSize,
    logTaskId,
    logRangeDates,
    logsLoading,
    filters,
    filteredTasks,
    loadTasks,
    loadConfig,
    loadWatchdogStatus,
    loadLogs,
    clearLogs,
    filterLogs,
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
