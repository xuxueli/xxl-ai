/*
 * 定时任务域 IPC 注册：任务 CRUD、立即运行与休眠开关。
 *   - 调度重排与休眠同步在这里统一编排，服务层保持纯数据职责；
 *   - 流式事件复用对话域 CHAT_IPC.event，渲染层无需新增订阅协议。
 * @author xuxueli 2026-11-15
 */

import type { IpcContext } from '@common/main/ipc'
import { t } from '@common/main/i18n'
import { saveSettings } from '@modules/settings/main'
import {
  SCHEDULE_MAX_CONCURRENCY_MAX,
  SCHEDULE_MAX_CONCURRENCY_MIN
} from '@modules/settings/shared'
import { abortChat } from '@modules/chat/main'
import { CHAT_IPC, SESSION_IPC } from '@modules/chat/shared'
import { SCHEDULE_IPC } from '../shared/ipc'
import type { ScheduleConfigDTO, ScheduledTaskInput } from '../shared/contracts'
import {
  deleteScheduledTask,
  getScheduleConfig,
  getScheduledTask,
  listScheduledTasks,
  saveScheduledTask,
  setScheduledTaskEnabled
} from './scheduledTaskService'
import { configureScheduleRuntime, startScheduledRun } from './runner'
import { isTaskRunning } from './runState'
import { rescheduleTask } from './scheduler'
import { syncKeepAwake } from './keepAwake'

export function registerScheduleIpc(ipc: IpcContext): void {
  /* 运行器依赖：任务页刷新、会话列表刷新与流式事件转发 */
  configureScheduleRuntime({
    emitChatEvent: (payload) => ipc.send(CHAT_IPC.event, payload),
    notifyScheduleChanged: (taskId) => ipc.send(SCHEDULE_IPC.changed, { taskId }),
    notifySessionChanged: (sessionId) => ipc.send(SESSION_IPC.changed, { sessionId })
  })

  /* 任务配置变化：重排调度并通知页面刷新 */
  const publishTaskChange = (taskId: number): void => {
    rescheduleTask(taskId)
    ipc.send(SCHEDULE_IPC.changed, { taskId })
  }

  ipc.handle(SCHEDULE_IPC.list, () => listScheduledTasks())
  ipc.handle(SCHEDULE_IPC.save, (_event, input: ScheduledTaskInput) => {
    const saved = saveScheduledTask(input)
    publishTaskChange(saved.id)
    return saved
  })
  ipc.handle(SCHEDULE_IPC.setEnabled, (_event, id: number, enabled: boolean) => {
    setScheduledTaskEnabled(id, enabled)
    publishTaskChange(id)
  })
  ipc.handle(SCHEDULE_IPC.remove, async (_event, id: number) => {
    const task = getScheduledTask(id)
    /* 删除运行中的任务：先终止当前实例，再移除配置；历史会话保留 */
    if (task && isTaskRunning(id) && task.lastSessionId) {
      await abortChat(task.lastSessionId)
    }
    deleteScheduledTask(id)
    publishTaskChange(id)
  })
  ipc.handle(SCHEDULE_IPC.runNow, (_event, id: number) => startScheduledRun(id, 'manual'))
  ipc.handle(SCHEDULE_IPC.getConfig, () => getScheduleConfig())
  ipc.handle(SCHEDULE_IPC.saveConfig, (_event, patch: Partial<ScheduleConfigDTO>) => {
    /*
     * 越界直接失败，避免静默改写用户输入。
     * 与 settingsService 读取时的 clamp 分工：这里负责「拒绝非法输入」，读取侧只做「防御脏数据」，二者不可合并。
     */
    if (patch.maxConcurrency !== undefined) {
      const value = Number(patch.maxConcurrency)
      if (
        !Number.isInteger(value) ||
        value < SCHEDULE_MAX_CONCURRENCY_MIN ||
        value > SCHEDULE_MAX_CONCURRENCY_MAX
      ) {
        throw new Error(
          t('runtime.error.scheduleConcurrencyRange', [
            SCHEDULE_MAX_CONCURRENCY_MIN,
            SCHEDULE_MAX_CONCURRENCY_MAX
          ])
        )
      }
    }
    saveSettings({
      ...(patch.keepAwake === undefined ? {} : { scheduleKeepAwake: patch.keepAwake }),
      ...(patch.maxConcurrency === undefined
        ? {}
        : { scheduleMaxConcurrency: patch.maxConcurrency })
    })
    syncKeepAwake()
    return getScheduleConfig()
  })
}
