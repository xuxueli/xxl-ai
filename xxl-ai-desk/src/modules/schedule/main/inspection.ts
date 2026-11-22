/*
 * 定时任务统一巡检：全局唯一的兜底通道，负责运行结算与调度器对账。
 *   - 单链 setTimeout 串行执行，任何异常都续排，链丢失由 10s 看护自愈；
 *   - 巡检不直接触发会话，触发全部交给任务调度器回调；
 *   - 巡检间隔取设置域 scheduleWatchdogInterval，范围 30~600 秒。
 * @author xuxueli 2026-11-22
 */

import log from 'electron-log/main'
import { t } from '@common/main/i18n'
import { SCHEDULE_WATCHDOG_MAX, SCHEDULE_WATCHDOG_MIN } from '@modules/settings/shared'
import { getSettings } from '@modules/settings/main'
import type { ScheduledTaskDTO, ScheduleWatchdogStatusDTO } from '@modules/schedule/shared'
import { listScheduledTasks } from './scheduledTaskService'
import { abortTimedOutRun, forceFinishRun, hasActiveTurn } from './runner'
import { getTaskRunningSince } from './runState'
import { pruneTaskJobs, reconcileTaskJob } from './taskJob'

/* 巡检间隔缺省值（秒），范围取设置域共享常量 */
const WATCHDOG_DEFAULT_SECONDS = 60
/* 巡检看护轮询间隔（毫秒）：只做巡检链存活检查，不接触业务数据 */
const WATCHDOG_GUARD_INTERVAL = 10_000
/* 运行态悬挂判定：标记运行中但底层已无在跑轮次，超过该时长强制结算 */
const RUN_STALE_GRACE = 5 * 60 * 1000
/* 已因超时中止的任务：避免巡检反复终止同一轮 */
const timeoutAborted = new Set<number>()

/* 巡检链：单链 setTimeout，保证不重入、异常必续排 */
let watchdogTimer: ReturnType<typeof setTimeout> | null = null
/* 巡检链代次：重排时自增，旧链回调自动失效 */
let watchdogGeneration = 0
/* 巡检是否正在执行：长耗时巡检不被看护误判为中断 */
let watchdogBusy = false
/* 巡检看护计时器 */
let guardTimer: ReturnType<typeof setInterval> | null = null
/* 上次巡检时刻（毫秒），0 表示尚未执行 */
let lastWatchdogAt = 0
/* 下次巡检计划时刻（毫秒），0 表示未安排 */
let nextWatchdogAt = 0
/* 巡检是否已启动 */
let running = false

/* 读取巡检间隔（毫秒）：配置异常回退默认值，绝不抛出 */
function readWatchdogDelay(): number {
  try {
    const seconds = getSettings().scheduleWatchdogInterval
    const bounded = Math.min(
      SCHEDULE_WATCHDOG_MAX,
      Math.max(SCHEDULE_WATCHDOG_MIN, Math.round(seconds || WATCHDOG_DEFAULT_SECONDS))
    )
    return bounded * 1000
  } catch (error) {
    log.error('[schedule] 读取巡检间隔失败，使用默认值', error)
    return WATCHDOG_DEFAULT_SECONDS * 1000
  }
}

/*
 * 运行超时检测：启用定时的任务超过任务级超时时间主动终止；
 * 不限时任务只在「标记运行中但底层已无在跑轮次」且持续过久时强制结算。
 */
function checkRunTimeout(task: ScheduledTaskDTO, now: number): void {
  if (!task.running) {
    timeoutAborted.delete(task.id)
    return
  }
  const elapsed = now - getTaskRunningSince(task.id)
  const timeoutMs = task.timeoutMinutes * 60_000
  if (timeoutMs > 0 && elapsed >= timeoutMs) {
    if (!timeoutAborted.has(task.id)) {
      /* 首次到达超时：终止轮次，交给执行侧收尾 */
      timeoutAborted.add(task.id)
      abortTimedOutRun(task.id)
    } else if (elapsed >= timeoutMs + RUN_STALE_GRACE) {
      /* 终止后仍未收尾：强制结算，恢复后续调度 */
      forceFinishRun(task.id, t('runtime.error.scheduleRunTimeoutStuck'))
      timeoutAborted.delete(task.id)
    }
    return
  }
  /* 运行态悬挂：本轮已无在跑轮次却长时间未结算，判定状态丢失 */
  if (elapsed >= RUN_STALE_GRACE && !hasActiveTurn(task.id)) {
    forceFinishRun(task.id, t('runtime.error.scheduleRunStale'))
  }
}

/* 单次巡检：逐任务执行超时检测与调度器对账，单个任务失败不影响其它任务 */
function watchdog(): void {
  const now = Date.now()
  let tasks: ScheduledTaskDTO[]
  try {
    tasks = listScheduledTasks()
  } catch (error) {
    log.error('[schedule] 巡检读取任务失败', error)
    return
  }

  const alive = new Set<number>()
  for (const task of tasks) {
    alive.add(task.id)
    try {
      checkRunTimeout(task, now)
      reconcileTaskJob(task, now)
    } catch (error) {
      log.error(`[schedule] 任务巡检失败 task=${task.id}`, error)
    }
  }
  /* 已删除任务：清理残留调度器与超时中止标记 */
  pruneTaskJobs(alive)
  for (const taskId of [...timeoutAborted]) {
    if (!alive.has(taskId)) {
      timeoutAborted.delete(taskId)
    }
  }
}

/*
 * 安排下一次巡检：单链 setTimeout 串行执行。
 *   - 巡检内部异常在 finally 中续排，链不会因为一次失败而中断；
 *   - 代次变化（重新拉起）后旧链回调直接退出，避免双链。
 */
function scheduleWatchdog(delay: number): void {
  if (!running) {
    return
  }
  const generation = watchdogGeneration
  nextWatchdogAt = Date.now() + delay
  watchdogTimer = setTimeout(() => {
    watchdogTimer = null
    nextWatchdogAt = 0
    if (!running || generation !== watchdogGeneration) {
      return
    }
    lastWatchdogAt = Date.now()
    watchdogBusy = true
    try {
      watchdog()
    } catch (error) {
      /* 兜底：巡检整体异常也必须继续下一轮 */
      log.error('[schedule] 巡检执行失败', error)
    } finally {
      watchdogBusy = false
      if (running && generation === watchdogGeneration) {
        scheduleWatchdog(readWatchdogDelay())
      }
    }
  }, delay)
}

/* 重新拉起巡检链：间隔设置变化 / 系统唤醒 / 看护发现中断时调用 */
export function resyncWatchdog(): void {
  watchdogGeneration += 1
  if (watchdogTimer !== null) {
    clearTimeout(watchdogTimer)
    watchdogTimer = null
  }
  nextWatchdogAt = 0
  if (!running) {
    return
  }
  scheduleWatchdog(readWatchdogDelay())
}

/* 巡检运行状态：设置页展示上次 / 下次巡检时间与当前间隔 */
export function getWatchdogStatus(): ScheduleWatchdogStatusDTO {
  return {
    interval: Math.round(readWatchdogDelay() / 1000),
    lastRunAt: lastWatchdogAt ? new Date(lastWatchdogAt).toISOString() : '',
    nextRunAt: nextWatchdogAt ? new Date(nextWatchdogAt).toISOString() : ''
  }
}

/*
 * 巡检看护：极简存活检查，不接触业务数据。
 * 巡检链意外丢失（未在途运行且没有已排计时器）时重新拉起，保证兜底通道不会永久中断。
 */
function guardWatchdog(): void {
  try {
    if (!running || watchdogBusy) {
      return
    }
    if (watchdogTimer === null) {
      log.warn('[schedule] 巡检链丢失，重新拉起')
      resyncWatchdog()
    }
  } catch (error) {
    /* 看护自身异常也不能中断进程：下一轮继续检查 */
    log.error('[schedule] 巡检看护异常', error)
  }
}

/* 启动巡检：先跑一轮再入链，随后启动看护 */
export function startInspection(): void {
  if (running) {
    return
  }
  running = true
  lastWatchdogAt = Date.now()
  try {
    watchdog()
  } catch (error) {
    log.error('[schedule] 首次巡检失败', error)
  }
  resyncWatchdog()
  guardTimer = setInterval(guardWatchdog, WATCHDOG_GUARD_INTERVAL)
}

/* 停止巡检：清除链路与看护，复位状态 */
export function disposeInspection(): void {
  running = false
  watchdogGeneration += 1
  lastWatchdogAt = 0
  nextWatchdogAt = 0
  if (watchdogTimer !== null) {
    clearTimeout(watchdogTimer)
    watchdogTimer = null
  }
  if (guardTimer !== null) {
    clearInterval(guardTimer)
    guardTimer = null
  }
  timeoutAborted.clear()
}
