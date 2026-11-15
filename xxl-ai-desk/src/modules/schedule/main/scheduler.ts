/*
 * 定时任务调度器：按触发规则为每个任务挂一个计时器，并在系统唤醒 / 巡检时重新对齐。
 *   - 规则解析与下次触发时间统一走 shared/rule，不引入第三方 cron 库；
 *   - setTimeout 存在 2^31-1 ms 上限，超长间隔分段续挂，到点再算一次；
 *   - 应用启动不补跑历史计划，停用任务不创建计时器；
 *   - 巡检是全局唯一的兜底通道：单链 setTimeout + 看护计时器，任何异常都不允许中断巡检。
 * @author xuxueli 2026-11-15
 */

import log from 'electron-log/main'
import { powerMonitor } from 'electron'
import { t } from '@common/main/i18n'
import {
  SCHEDULE_WATCHDOG_MAX,
  SCHEDULE_WATCHDOG_MIN
} from '@modules/settings/shared'
import { getSettings } from '@modules/settings/main'
import type { ScheduledTaskDTO, ScheduleWatchdogStatusDTO } from '@modules/schedule/shared'
import { getScheduledTask, listScheduledTasks } from './scheduledTaskService'
import { abortTimedOutRun, forceFinishRun, hasActiveTurn, startScheduledRun } from './runner'
import { getTaskRunningSince } from './runState'
import { markInterruptedLogs, skipRunLog } from './runLog'
import { disposeKeepAwake, syncKeepAwake } from './keepAwake'

/* setTimeout 最大延迟（约 24.8 天） */
const MAX_TIMER_DELAY = 2_147_483_647
/* 巡检间隔缺省值（秒），范围取设置域共享常量 */
const WATCHDOG_DEFAULT_SECONDS = 60
/* 巡检看护轮询间隔（毫秒）：只做巡检链存活检查，不接触业务数据 */
const WATCHDOG_GUARD_INTERVAL = 10_000
/* 计划时刻允许的延迟：超过视为计时器未按预期触发 */
const MISSED_GRACE = 60_000
/* 计时器目标与规则下次触发时间的允许误差 */
const TIMER_TOLERANCE = 5_000
/* 过点重算的最小等待：避免同一时刻反复重排 */
const RETRY_DELAY = 1_000
/* 运行态悬挂判定：标记运行中但底层已无在跑轮次，超过该时长强制结算 */
const RUN_STALE_GRACE = 5 * 60 * 1000

/* 进行中的计时器：taskId → timer */
const timers = new Map<number, ReturnType<typeof setTimeout>>()
/* 计时器目标时刻：taskId → 毫秒时间戳（用于识别过点 / 排错） */
const armedAt = new Map<number, number>()
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
/* 是否已启动，避免重复监听 resume / 重复拉起巡检 */
let started = false

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

/* 清除单个任务的计时器（不存在时忽略） */
function clearTaskTimer(taskId: number): void {
  const timer = timers.get(taskId)
  if (timer !== undefined) {
    clearTimeout(timer)
    timers.delete(taskId)
  }
  armedAt.delete(taskId)
}

/* 计划时刻错过：记一条失败跳过日志，避免「没跑却查无实据」 */
function recordMissedRun(taskId: number, target: number): void {
  skipRunLog({
    taskId,
    triggerType: 'schedule',
    slotAt: new Date(target).toISOString(),
    status: 'skip',
    error: t('runtime.error.scheduleRunMissed')
  })
  log.warn(
    `[schedule] 计划时刻已错过，重排下一轮 task=${taskId} slot=${new Date(target).toISOString()}`
  )
}

/* 按目标时刻挂载计时器：过点 / 超长间隔都交给后续重算 */
function armAt(taskId: number, target: number): void {
  const delay = target - Date.now()
  /* 已过点：不立即补触发，1 秒后按最新规则重算（保证「至多一次」） */
  if (delay <= 0) {
    timers.set(
      taskId,
      setTimeout(() => {
        timers.delete(taskId)
        armTask(taskId)
      }, RETRY_DELAY)
    )
    return
  }
  /* 超过 setTimeout 上限：先挂到上限，到点后重新计算剩余时间 */
  if (delay > MAX_TIMER_DELAY) {
    armedAt.set(taskId, target)
    timers.set(
      taskId,
      setTimeout(() => {
        timers.delete(taskId)
        armedAt.delete(taskId)
        armTask(taskId)
      }, MAX_TIMER_DELAY)
    )
    return
  }
  armedAt.set(taskId, target)
  timers.set(
    taskId,
    setTimeout(() => {
      timers.delete(taskId)
      armedAt.delete(taskId)
      try {
        startScheduledRun(taskId, 'schedule', new Date(target).toISOString())
      } catch (error) {
        /* 单次触发失败不终止调度：下一周期继续，错误写入运行结果或日志 */
        log.error(`[schedule] 任务触发失败 task=${taskId}`, error)
      }
      /* 运行结果与上次会话已变化，重新读取后再排下一轮 */
      try {
        armTask(taskId)
      } catch (error) {
        /* 重排失败交给巡检兜底，不让回调异常冒泡到主进程 */
        log.error(`[schedule] 任务重排失败 task=${taskId}`, error)
      }
    }, delay)
  )
}

/* 按任务快照挂载下一个计时器：停用 / 无未来触发时间时只清理 */
function armTaskTimer(task: ScheduledTaskDTO): void {
  clearTaskTimer(task.id)
  if (!task.enabled || !task.nextRunAt) {
    return
  }
  armAt(task.id, new Date(task.nextRunAt).getTime())
}

/* 读取任务并挂载计时器：保存 / 启停 / 删除后调用 */
function armTask(taskId: number): void {
  const task = getScheduledTask(taskId)
  if (!task) {
    clearTaskTimer(taskId)
    return
  }
  armTaskTimer(task)
}

/* 系统唤醒前的错过检测：休眠期间的计划不补跑，但要留下跳过记录 */
function recordOverdueBeforeResume(): void {
  const now = Date.now()
  for (const [taskId, target] of armedAt) {
    if (now - target <= MISSED_GRACE) {
      continue
    }
    try {
      recordMissedRun(taskId, target)
    } catch (error) {
      /* 记账失败不能阻断唤醒后的重排 */
      log.error(`[schedule] 错过触发记账失败 task=${taskId}`, error)
    }
  }
}

/* 系统唤醒：重新对齐触发时间、重建巡检链并同步休眠策略（任一步失败都不影响巡检恢复） */
function onResume(): void {
  try {
    recordOverdueBeforeResume()
  } catch (error) {
    log.error('[schedule] 唤醒错过检测失败', error)
  }
  try {
    rescheduleAll()
  } catch (error) {
    log.error('[schedule] 唤醒重排失败', error)
  }
  resyncWatchdog()
  try {
    syncKeepAwake()
  } catch (error) {
    log.error('[schedule] 唤醒休眠策略同步失败', error)
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

/*
 * 计时器检测：
 *   - 停用 / 无未来触发 → 清理计时器；
 *   - 应挂未挂 → 按最新规则重排；
 *   - 目标时刻已过仍挂着 → 记失败跳过后重排；
 *   - 目标时刻明显晚于规则下次触发 → 重排到更早的正确时刻。
 */
function checkTimer(task: ScheduledTaskDTO, now: number): void {
  if (!task.enabled || !task.nextRunAt) {
    clearTaskTimer(task.id)
    return
  }
  const expected = new Date(task.nextRunAt).getTime()
  const armed = armedAt.get(task.id)
  if (!timers.has(task.id) || armed === undefined) {
    armTaskTimer(task)
    return
  }
  if (now - armed > MISSED_GRACE) {
    recordMissedRun(task.id, armed)
    armTask(task.id)
    return
  }
  if (armed - expected > TIMER_TOLERANCE) {
    armTaskTimer(task)
  }
}

/* 单次巡检：逐任务执行超时检测与计时器检测，单个任务失败不影响其它任务 */
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
      checkTimer(task, now)
    } catch (error) {
      log.error(`[schedule] 任务巡检失败 task=${task.id}`, error)
    }
  }
  /* 已删除任务：清理残留计时器与超时中止标记 */
  for (const taskId of [...timers.keys()]) {
    if (!alive.has(taskId)) {
      clearTaskTimer(taskId)
    }
  }
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
  if (!started) {
    return
  }
  const generation = watchdogGeneration
  nextWatchdogAt = Date.now() + delay
  watchdogTimer = setTimeout(() => {
    watchdogTimer = null
    nextWatchdogAt = 0
    if (!started || generation !== watchdogGeneration) {
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
      if (started && generation === watchdogGeneration) {
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
  if (!started) {
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
 * 巡检链意外丢失（未在途运行且没有已排计时器）时重新拉起，
 * 保证全局唯一的兜底通道不会永久中断。
 */
function guardWatchdog(): void {
  try {
    if (!started || watchdogBusy) {
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

/* 清除全部计时器（重排 / 退出共用） */
function clearAllTimers(): void {
  for (const taskId of [...timers.keys()]) {
    clearTaskTimer(taskId)
  }
  armedAt.clear()
}

/* 按已有配置重建全部计时器 */
export function rescheduleAll(): void {
  clearAllTimers()
  for (const task of listScheduledTasks()) {
    try {
      armTaskTimer(task)
    } catch (error) {
      /* 单个任务重排失败不影响其它任务，由巡检继续兜底 */
      log.error(`[schedule] 任务重排失败 task=${task.id}`, error)
    }
  }
}

/* 重排单个任务：保存 / 启停 / 删除后调用 */
export function rescheduleTask(taskId: number): void {
  armTask(taskId)
}

/* 启动调度：结算遗留日志、加载启用任务、启动巡检链与看护、监听系统唤醒 */
export function startScheduleScheduler(): void {
  if (started) {
    return
  }
  started = true
  /* 上次进程遗留的「进行中」日志统一标为失败；日志异常不阻断调度启动 */
  try {
    markInterruptedLogs()
  } catch (error) {
    log.error('[schedule] 运行日志初始化失败', error)
  }
  try {
    rescheduleAll()
  } catch (error) {
    log.error('[schedule] 启动重排失败', error)
  }
  /* 巡检先跑一轮再入链，启动后立即校正计时器与悬挂状态 */
  lastWatchdogAt = Date.now()
  try {
    watchdog()
  } catch (error) {
    log.error('[schedule] 首次巡检失败', error)
  }
  resyncWatchdog()
  guardTimer = setInterval(guardWatchdog, WATCHDOG_GUARD_INTERVAL)
  try {
    syncKeepAwake()
  } catch (error) {
    log.error('[schedule] 休眠策略同步失败', error)
  }
  powerMonitor.on('resume', onResume)
}

/* 退出：清除全部计时器与巡检、移除监听并释放休眠 blocker */
export function disposeScheduleScheduler(): void {
  clearAllTimers()
  timeoutAborted.clear()
  started = false
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
  powerMonitor.removeListener('resume', onResume)
  disposeKeepAwake()
}
