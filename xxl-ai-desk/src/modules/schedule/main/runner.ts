/*
 * 定时任务运行器：会话阻塞策略、会话选择、运行日志与结果落库。
 *   - 任务侧只负责会话选择、运行结果落库与事件转发；
 *   - 消息落库、运行时装配、摘要与记忆全部由 chat 域完成；
 *   - 复用会话进行中时按任务策略处理：忽略本次调度 / 终止后强制调度；
 *   - 运行超时 / 运行态丢失由调度器巡检调用本模块兜底结算。
 * @author xuxueli 2026-11-15
 */

import log from 'electron-log/main'
import { t } from '@common/main/i18n'
import { abortChat, createSession, getSession, sendChat, updateSession } from '@modules/chat/main'
import type { ChatEventPayload } from '@modules/chat/main'
import { isAgentRunning } from '@modules/agent/main'
import { getSettings } from '@modules/settings/main'
import type {
  ScheduleLogStatus,
  ScheduleRunStartDTO,
  ScheduleRunStatus,
  ScheduledTaskDTO
} from '@modules/schedule/shared'
import { getScheduledTask, markScheduledRun } from './scheduledTaskService'
import { finishRunLog, hasRunLog, skipRunLog, startRunLog } from './runLog'
import {
  clearRunState,
  countRunningTasks,
  isTaskRunning,
  markTaskRunning,
  setActiveRunLog,
  setPendingForce,
  takeActiveRunLog,
  takePendingForce
} from './runState'

/* 运行器依赖：由 schedule/main/ipc 注入，避免模块内直接持有 IPC 上下文 */
export interface ScheduleRuntimeDeps {
  /* 任务会话流式事件转发渲染层（复用 CHAT_IPC.event） */
  emitChatEvent(payload: ChatEventPayload): void
  /* 通知定时任务页 / 运行日志页刷新 */
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

/* 复用结果：sessionId=0 表示需新建；busy 表示复用会话正在生成 */
interface ReusableSession {
  sessionId: number
  busy: boolean
}

/* 复用条件：上次会话仍存在、归属该任务；是否空闲单独标记 */
function reusableSessionOf(task: ScheduledTaskDTO): ReusableSession {
  if (task.sessionMode !== 'reuse' || !task.lastSessionId) {
    return { sessionId: 0, busy: false }
  }
  const session = getSession(task.lastSessionId)
  if (!session || session.triggerType !== 'schedule' || session.scheduleTaskId !== task.id) {
    return { sessionId: 0, busy: false }
  }
  return { sessionId: session.id, busy: isAgentRunning(session.id) }
}

/* 运行失败原因：优先取运行时错误，缺省用通用失败提示 */
function failureReason(errorText: string): string {
  return errorText || t('runtime.error.scheduleRunFailed')
}

/* 异步执行一轮任务，并在结束时写入运行日志与任务结果 */
async function executeRun(
  task: ScheduledTaskDTO,
  sessionId: number,
  logId: number,
  startedAt: Date
): Promise<void> {
  let failed = false
  let errorText = ''
  try {
    await sendChat({ sessionId, text: task.prompt }, (payload) => {
      if (payload.type === 'error') {
        failed = true
        errorText = payload.message ?? ''
      }
      deps?.emitChatEvent(payload)
    })
  } catch (error) {
    failed = true
    errorText = (error as Error).message
  }
  const status: ScheduleRunStatus = failed ? 'failed' : 'success'
  try {
    finishRunLog(logId, status, failed ? failureReason(errorText) : '')
    takeActiveRunLog(task.id)
    markScheduledRun(task.id, {
      lastRunAt: startedAt.toISOString(),
      lastRunStatus: status,
      lastError: failed ? failureReason(errorText) : '',
      lastSessionId: sessionId
    })
  } finally {
    markTaskRunning(task.id, false)
    deps?.notifyScheduleChanged(task.id)
    /* 强制调度：本轮结束（或已被终止）后启动待执行的那一次触发，结算异常也要继续 */
    runPendingForce(task.id)
  }
}

/* 消费强制调度请求：存在待执行触发时按原计划时刻重新触发 */
function runPendingForce(taskId: number): void {
  const slotAt = takePendingForce(taskId)
  if (slotAt === null) {
    return
  }
  try {
    startScheduledRun(taskId, 'schedule', slotAt)
  } catch (error) {
    log.error(`[schedule] 强制调度启动失败 task=${taskId}`, error)
  }
}

/*
 * 未执行的触发：写运行日志并通知页面。
 *   - 不覆盖任务行的「上次运行」——跳过不是一次真实运行；
 *   - 手动运行直接抛出原因，由渲染层提示；定时触发静默返回 sessionId=0。
 */
function settleWithoutRun(
  task: ScheduledTaskDTO,
  reason: string,
  status: ScheduleLogStatus,
  source: 'schedule' | 'manual',
  slotAt: string
): ScheduleRunStartDTO {
  skipRunLog({ taskId: task.id, triggerType: source, slotAt, status, error: reason })
  deps?.notifyScheduleChanged(task.id)
  if (source === 'manual') {
    throw new Error(reason)
  }
  return { sessionId: 0 }
}

/*
 * 强制调度：终止进行中会话，待本轮收尾后按原计划时刻重新触发。
 *   - 先登记待执行请求，再终止会话：避免收尾先于登记导致补跑丢失；
 *   - 任务已无在途轮次（如复用会话被手动占用）时直接消费请求。
 */
function forceRestart(task: ScheduledTaskDTO, slotAt: string): ScheduleRunStartDTO {
  const sessionId = task.lastSessionId
  setPendingForce(task.id, slotAt)
  log.warn(`[schedule] 会话阻塞策略=强制调度，终止进行中会话 task=${task.id} session=${sessionId}`)
  void (async () => {
    try {
      if (sessionId && isAgentRunning(sessionId)) {
        await abortChat(sessionId)
      }
      if (!isTaskRunning(task.id)) {
        runPendingForce(task.id)
      }
    } catch (error) {
      /* 终止失败只记日志：待本轮自然收尾时仍会消费强制调度请求 */
      log.error(`[schedule] 强制调度终止会话失败 task=${task.id}`, error)
    }
  })()
  return { sessionId: 0 }
}

/*
 * 启动一次任务运行：同步完成校验、会话选择与日志登记，长轮次异步执行。
 *   - 复用会话进行中：按任务阻塞策略忽略本次调度（记失败跳过）或终止后强制调度；
 *   - 返回实际使用的会话 ID，供「立即运行」跳转；
 *   - 定时触发遇到停用 / 引用失效时返回 0，并记录日志。
 */
export function startScheduledRun(
  taskId: number,
  source: 'schedule' | 'manual',
  slotAt = ''
): ScheduleRunStartDTO {
  const task = getScheduledTask(taskId)
  if (!task) {
    throw new Error(t('runtime.error.scheduleTaskMissing'))
  }
  if (source === 'schedule' && !task.enabled) {
    return { sessionId: 0 }
  }
  if (task.invalidReason) {
    return settleWithoutRun(task, task.invalidReason, 'failed', source, slotAt)
  }
  /* 阻塞策略只对定时触发且「复用上次会话」的任务生效 */
  const canForce =
    source === 'schedule' && task.sessionMode === 'reuse' && task.sessionBlockPolicy === 'force'

  /* 本任务仍有一轮在途：忽略或终止后强制调度 */
  if (isTaskRunning(task.id)) {
    if (canForce) {
      return forceRestart(task, slotAt)
    }
    return settleWithoutRun(
      task,
      t('runtime.error.scheduleAlreadyRunning'),
      'skip',
      source,
      slotAt
    )
  }

  /* 全局并发限制：手动运行提示失败，定时触发记为失败跳过 */
  const maxConcurrency = getSettings().scheduleMaxConcurrency
  if (countRunningTasks() >= maxConcurrency) {
    const manual = source === 'manual'
    const reason = manual
      ? t('runtime.error.scheduleConcurrencyFull', [maxConcurrency])
      : t('runtime.error.scheduleConcurrencyLimit', [maxConcurrency])
    return settleWithoutRun(task, reason, manual ? 'failed' : 'skip', source, slotAt)
  }

  /* 复用会话正在生成（如被手动对话占用）：同样按阻塞策略处理 */
  const reusable = reusableSessionOf(task)
  if (reusable.busy) {
    if (canForce) {
      return forceRestart(task, slotAt)
    }
    return settleWithoutRun(
      task,
      t('runtime.error.scheduleSessionBusy'),
      'skip',
      source,
      slotAt
    )
  }
  let sessionId = reusable.sessionId

  /* 日志幂等：同一计划时刻已执行过（立即运行不受限制），不再建会话 */
  if (slotAt && hasRunLog(task.id, slotAt)) {
    log.warn(`[schedule] 计划时刻已执行，忽略重复触发 task=${task.id} slot=${slotAt}`)
    return { sessionId: 0 }
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
  } else {
    /* 复用会话：标题同步为本次运行时间，避免始终停留在首次创建时刻 */
    updateSession(sessionId, { title: buildSessionTitle(task.name, startedAt) })
    deps?.notifySessionChanged(sessionId)
  }

  const logId = startRunLog({
    taskId: task.id,
    triggerType: source,
    slotAt,
    sessionId
  })
  if (!logId) {
    log.warn(`[schedule] 计划时刻已记录，忽略重复触发 task=${task.id} slot=${slotAt}`)
    return { sessionId: 0 }
  }

  markTaskRunning(task.id, true)
  setActiveRunLog(task.id, logId)
  markScheduledRun(task.id, {
    lastRunAt: startedAt.toISOString(),
    lastRunStatus: '',
    lastError: '',
    lastSessionId: sessionId
  })
  deps?.notifyScheduleChanged(task.id)

  void executeRun(task, sessionId, logId, startedAt).catch((error) => {
    /* 执行侧的落库 / 收尾异常只记日志，不影响调度链与后续触发 */
    log.error(`[schedule] 任务运行收尾失败 task=${task.id}`, error)
  })
  return { sessionId }
}

/* 运行超时：终止会话当前轮次，交给 executeRun 收尾（不在此处改写运行态） */
export function abortTimedOutRun(taskId: number): void {
  const task = getScheduledTask(taskId)
  const sessionId = task?.lastSessionId ?? 0
  if (sessionId && isAgentRunning(sessionId)) {
    log.warn(`[schedule] 运行超时，终止轮次 task=${taskId} session=${sessionId}`)
    void abortChat(sessionId)
  }
}

/* 本轮底层是否仍有在跑的 Agent 轮次：巡检据此判定运行态是否悬挂 */
export function hasActiveTurn(taskId: number): boolean {
  const sessionId = getScheduledTask(taskId)?.lastSessionId ?? 0
  return Boolean(sessionId && isAgentRunning(sessionId))
}

/*
 * 运行态丢失兜底：强制结算，避免任务永久卡在「进行中」而不再触发。
 *   - 运行日志按失败结算且不再被后续收尾覆盖；
 *   - 同时清理强制调度请求，防止无主补跑。
 */
export function forceFinishRun(taskId: number, reason: string): void {
  const logId = takeActiveRunLog(taskId)
  const sessionId = getScheduledTask(taskId)?.lastSessionId ?? 0
  /* 运行态已判定丢失：先尝试终止真实轮次，避免留下无人接管的生成 */
  if (sessionId && isAgentRunning(sessionId)) {
    void abortChat(sessionId)
  }
  markTaskRunning(taskId, false)
  takePendingForce(taskId)
  finishRunLog(logId, 'failed', reason)
  const task = getScheduledTask(taskId)
  if (!task) {
    return
  }
  markScheduledRun(task.id, { lastRunStatus: 'failed', lastError: reason })
  deps?.notifyScheduleChanged(task.id)
  log.warn(`[schedule] 强制结算运行态 task=${taskId}: ${reason}`)
}

/* 删除任务：先终止当前轮次，再清理进程内运行状态 */
export async function stopScheduledRun(taskId: number): Promise<void> {
  const task = getScheduledTask(taskId)
  const sessionId = task?.lastSessionId ?? 0
  if (sessionId && isTaskRunning(taskId) && isAgentRunning(sessionId)) {
    await abortChat(sessionId)
  }
  clearRunState(taskId)
}
