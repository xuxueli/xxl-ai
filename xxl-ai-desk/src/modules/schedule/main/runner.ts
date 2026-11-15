/*
 * 定时任务运行器：创建 / 复用任务会话，并复用对话域 sendChat 执行。
 *   - 任务侧只负责会话选择、运行结果落库与事件转发；
 *   - 消息落库、运行时装配、摘要与记忆全部由 chat 域完成。
 * @author xuxueli 2026-11-15
 */

import { t } from '@common/main/i18n'
import { isAgentRunning } from '@modules/agent/main'
import { createSession, getSession, sendChat } from '@modules/chat/main'
import type { ChatEventPayload } from '@modules/chat/main'
import { getSettings } from '@modules/settings/main'
import type { ScheduledTaskDTO, ScheduleRunStartDTO } from '@modules/schedule/shared'
import { getScheduledTask, markScheduledRun } from './scheduledTaskService'
import { countRunningTasks, isTaskRunning, markTaskRunning } from './runState'

/* 运行器依赖：由 schedule/main/ipc 注入，避免模块内直接持有 IPC 上下文 */
export interface ScheduleRuntimeDeps {
  /* 任务会话流式事件转发渲染层（复用 CHAT_IPC.event） */
  emitChatEvent(payload: ChatEventPayload): void
  /* 通知定时任务页刷新 */
  notifyScheduleChanged(taskId: number): void
  /* 通知首页侧栏刷新会话列表 */
  notifySessionChanged(sessionId: number): void
}

let deps: ScheduleRuntimeDeps | null = null

/* 注册运行器依赖（IPC 注册时调用一次） */
export function configureScheduleRuntime(next: ScheduleRuntimeDeps): void {
  deps = next
}

/* 两位补零 */
function pad(value: number): string {
  return String(value).padStart(2, '0')
}

/* 任务会话标题：任务名 + 本次运行时间，避免多次运行同名 */
function buildSessionTitle(taskName: string, at: Date): string {
  return `${taskName} · ${pad(at.getMonth() + 1)}-${pad(at.getDate())} ${pad(at.getHours())}:${pad(at.getMinutes())}`
}

/* 复用条件：上次会话仍存在、归属该任务且当前未在生成 */
function reusableSessionId(task: ScheduledTaskDTO): number {
  if (task.sessionMode !== 'reuse' || !task.lastSessionId) {
    return 0
  }
  const session = getSession(task.lastSessionId)
  if (!session || session.triggerType !== 'schedule' || session.scheduleTaskId !== task.id) {
    return 0
  }
  return isAgentRunning(session.id) ? -1 : session.id
}

/* 异步执行一轮任务，并在结束时写入运行结果 */
async function executeRun(task: ScheduledTaskDTO, sessionId: number): Promise<void> {
  let failed = false
  try {
    await sendChat({ sessionId, text: task.prompt }, (payload) => {
      if (payload.type === 'error') {
        failed = true
      }
      deps?.emitChatEvent(payload)
    })
    markScheduledRun(task.id, {
      lastRunStatus: failed ? 'failed' : 'success',
      lastError: failed ? t('runtime.error.scheduleRunFailed') : ''
    })
  } catch (error) {
    markScheduledRun(task.id, {
      lastRunStatus: 'failed',
      lastError: (error as Error).message
    })
  } finally {
    markTaskRunning(task.id, false)
    deps?.notifyScheduleChanged(task.id)
  }
}

/*
 * 未启动运行时的结算：写入结果并通知页面。
 *   - 手动运行直接抛出原因，由渲染层提示；
 *   - 定时触发静默返回 sessionId=0，原因保留在任务运行结果中。
 */
function settleWithoutRun(
  task: ScheduledTaskDTO,
  reason: string,
  status: 'failed' | 'skipped',
  source: 'schedule' | 'manual'
): ScheduleRunStartDTO {
  markScheduledRun(task.id, {
    lastRunAt: new Date().toISOString(),
    lastRunStatus: status,
    lastError: reason
  })
  deps?.notifyScheduleChanged(task.id)
  if (source === 'manual') {
    throw new Error(reason)
  }
  return { sessionId: 0 }
}

/*
 * 启动一次任务运行：同步完成校验与会话选择，长轮次异步执行。
 *   - 返回实际使用的会话 ID，供「立即运行」跳转；
 *   - 定时触发遇到停用 / 运行中 / 引用失效时返回 0，并记录跳过或失败。
 */
export function startScheduledRun(
  taskId: number,
  source: 'schedule' | 'manual'
): ScheduleRunStartDTO {
  const task = getScheduledTask(taskId)
  if (!task) {
    throw new Error(t('runtime.error.scheduleTaskMissing'))
  }
  if (source === 'schedule' && !task.enabled) {
    return { sessionId: 0 }
  }
  if (task.invalidReason) {
    return settleWithoutRun(task, task.invalidReason, 'failed', source)
  }
  if (isTaskRunning(task.id)) {
    return settleWithoutRun(task, t('runtime.error.scheduleAlreadyRunning'), 'skipped', source)
  }

  /* 全局并发限制：手动运行提示失败，定时触发记为跳过 */
  const maxConcurrency = getSettings().scheduleMaxConcurrency
  if (countRunningTasks() >= maxConcurrency) {
    const manual = source === 'manual'
    const reason = manual
      ? t('runtime.error.scheduleConcurrencyFull', [maxConcurrency])
      : t('runtime.error.scheduleConcurrencyLimit', [maxConcurrency])
    return settleWithoutRun(task, reason, manual ? 'failed' : 'skipped', source)
  }

  let sessionId = reusableSessionId(task)
  if (sessionId < 0) {
    return settleWithoutRun(task, t('runtime.error.scheduleSessionBusy'), 'skipped', source)
  }

  const startedAt = new Date()
  if (!sessionId) {
    const session = createSession({
      title: buildSessionTitle(task.name, startedAt),
      projectId: task.projectId,
      agentId: task.agentId,
      providerId: task.providerId,
      modelId: task.modelId,
      reasoningLevel: task.reasoningLevel,
      permissionMode: task.permissionMode,
      triggerType: 'schedule',
      scheduleTaskId: task.id
    })
    sessionId = session.id
    deps?.notifySessionChanged(sessionId)
  }

  markTaskRunning(task.id, true)
  markScheduledRun(task.id, {
    lastRunAt: startedAt.toISOString(),
    lastRunStatus: '',
    lastError: '',
    lastSessionId: sessionId
  })
  deps?.notifyScheduleChanged(task.id)

  void executeRun(task, sessionId)
  return { sessionId }
}
