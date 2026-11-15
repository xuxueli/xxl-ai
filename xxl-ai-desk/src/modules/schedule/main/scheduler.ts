/*
 * 定时任务调度器：按触发规则为每个任务挂一个计时器，并在系统唤醒后重新对齐。
 *   - 规则解析与下次触发时间统一走 shared/rule，不引入第三方 cron 库；
 *   - setTimeout 存在 2^31-1 ms 上限，超长间隔分段续挂，到点再算一次；
 *   - 应用启动不补跑历史计划，停用任务不创建计时器。
 * @author xuxueli 2026-11-15
 */

import log from 'electron-log/main'
import { powerMonitor } from 'electron'
import type { ScheduledTaskDTO } from '@modules/schedule/shared'
import { getScheduledTask, listScheduledTasks } from './scheduledTaskService'
import { startScheduledRun } from './runner'
import { disposeKeepAwake, syncKeepAwake } from './keepAwake'

/* setTimeout 最大延迟（约 24.8 天） */
const MAX_TIMER_DELAY = 2_147_483_647

/* 进行中的计时器：taskId → timer */
const timers = new Map<number, ReturnType<typeof setTimeout>>()
/* 是否已启动，避免重复监听 resume */
let started = false

/* 清除单个任务的计时器（不存在时忽略） */
function clearTaskTimer(taskId: number): void {
  const timer = timers.get(taskId)
  if (timer !== undefined) {
    clearTimeout(timer)
    timers.delete(taskId)
  }
}

/* 按任务快照挂载下一个计时器：停用 / 无未来触发时间时只清理 */
function armTaskTimer(task: ScheduledTaskDTO): void {
  clearTaskTimer(task.id)
  if (!task.enabled || !task.nextRunAt) {
    return
  }
  const delay = new Date(task.nextRunAt).getTime() - Date.now()
  if (delay <= 0) {
    return
  }
  /* 超过 setTimeout 上限：先挂到上限，到点后重新计算剩余时间 */
  if (delay > MAX_TIMER_DELAY) {
    timers.set(
      task.id,
      setTimeout(() => {
        timers.delete(task.id)
        armTask(task.id)
      }, MAX_TIMER_DELAY)
    )
    return
  }
  timers.set(
    task.id,
    setTimeout(() => {
      timers.delete(task.id)
      try {
        startScheduledRun(task.id, 'schedule')
      } catch (error) {
        /* 单次触发失败不终止调度：下一周期继续，错误写入运行结果或日志 */
        log.error(`[schedule] 任务触发失败 task=${task.id}`, error)
      }
      /* 运行结果与上次会话已变化，重新读取后再排下一轮 */
      armTask(task.id)
    }, delay)
  )
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

/* 系统唤醒：重新对齐触发时间并同步休眠策略 */
function onResume(): void {
  rescheduleAll()
  syncKeepAwake()
}

/* 清除全部计时器（重排 / 退出共用） */
function clearAllTimers(): void {
  for (const taskId of [...timers.keys()]) {
    clearTaskTimer(taskId)
  }
}

/* 按已有配置重建全部计时器 */
export function rescheduleAll(): void {
  clearAllTimers()
  for (const task of listScheduledTasks()) {
    armTaskTimer(task)
  }
}

/* 重排单个任务：保存 / 启停 / 删除后调用 */
export function rescheduleTask(taskId: number): void {
  armTask(taskId)
}

/* 启动调度：加载启用任务、同步休眠策略并监听系统唤醒 */
export function startScheduleScheduler(): void {
  if (started) {
    return
  }
  started = true
  rescheduleAll()
  syncKeepAwake()
  powerMonitor.on('resume', onResume)
}

/* 退出：清除全部计时器、移除监听并释放休眠 blocker */
export function disposeScheduleScheduler(): void {
  clearAllTimers()
  if (started) {
    powerMonitor.removeListener('resume', onResume)
    started = false
  }
  disposeKeepAwake()
}
