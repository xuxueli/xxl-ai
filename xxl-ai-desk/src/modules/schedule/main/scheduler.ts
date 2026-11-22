/*
 * 定时任务调度生命周期：装配任务调度器 Map、统一巡检、系统唤醒与休眠策略。
 *   - 任务维度的 croner 实例由 taskJob 维护，统一巡检由 inspection 维护；
 *   - 本文件只做启动 / 停止 / 重排与唤醒编排，不承载计时器细节；
 *   - 启动不补跑历史计划，停用任务不创建调度器。
 * @author xuxueli 2026-11-22
 */

import log from 'electron-log/main'
import { powerMonitor } from 'electron'
import { getScheduledTask } from './scheduledTaskService'
import { markInterruptedLogs } from './runLog'
import { disposeKeepAwake, syncKeepAwake } from './keepAwake'
import {
  clearTaskJobs,
  pauseTaskJobs,
  recordArmedMissedRuns,
  removeTaskJob,
  resyncTaskJobs,
  syncTaskJob
} from './taskJob'
import { disposeInspection, resyncWatchdog, startInspection } from './inspection'

export { getWatchdogStatus, resyncWatchdog } from './inspection'

/* 是否已启动，避免重复监听 / 重复拉起 */
let started = false

/* 系统休眠：暂停全部任务调度器，避免休眠期间状态漂移 */
function onSuspend(): void {
  pauseTaskJobs()
}

/* 系统唤醒：错过记账 → 重建调度器 → 重建巡检链 → 同步休眠策略（任一步失败都不影响巡检恢复） */
function onResume(): void {
  try {
    recordArmedMissedRuns()
  } catch (error) {
    log.error('[schedule] 唤醒错过检测失败', error)
  }
  rescheduleAll()
  resyncWatchdog()
  try {
    syncKeepAwake()
  } catch (error) {
    log.error('[schedule] 唤醒休眠策略同步失败', error)
  }
}

/* 按已有配置重建全部任务调度器 */
function rescheduleAll(): void {
  try {
    resyncTaskJobs()
  } catch (error) {
    log.error('[schedule] 全量重排失败', error)
  }
}

/* 重排单个任务：保存 / 启停 / 删除后调用 */
export function rescheduleTask(taskId: number): void {
  const task = getScheduledTask(taskId)
  if (!task) {
    removeTaskJob(taskId)
    return
  }
  try {
    syncTaskJob(task)
  } catch (error) {
    /* 单个任务重排失败不影响其它任务，由巡检继续兜底 */
    log.error(`[schedule] 任务重排失败 task=${taskId}`, error)
  }
}

/* 启动调度：结算遗留日志、装载任务调度器、启动巡检与看护、监听系统休眠 / 唤醒 */
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
  rescheduleAll()
  startInspection()
  try {
    syncKeepAwake()
  } catch (error) {
    log.error('[schedule] 休眠策略同步失败', error)
  }
  powerMonitor.on('suspend', onSuspend)
  powerMonitor.on('resume', onResume)
}

/* 退出：停止全部调度器与巡检、移除监听并释放休眠 blocker */
export function disposeScheduleScheduler(): void {
  started = false
  clearTaskJobs()
  disposeInspection()
  powerMonitor.removeListener('suspend', onSuspend)
  powerMonitor.removeListener('resume', onResume)
  disposeKeepAwake()
}
