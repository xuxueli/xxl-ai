/*
 * 定时任务调度器：每个启用任务持有一个 croner 实例，按 taskId 维护在 Map 中。
 *   - 回调只做「取计划时刻 + 准入 + 派发」，长轮次由 runner 异步执行，不阻塞计时器；
 *   - 规则变化 / 启停 / 删除只重建对应任务，互不影响；
 *   - 计时器丢失、时钟漂移、系统唤醒后的重建由统一巡检调用本模块完成。
 * @author xuxueli 2026-11-22
 */

import log from 'electron-log/main'
import { Cron } from 'croner'
import type { CronOptions } from 'croner'
import { t } from '@common/main/i18n'
import { toCronerExpression } from '@modules/schedule/shared'
import type { ScheduledTaskDTO } from '@modules/schedule/shared'
import { listScheduledTasks } from './scheduledTaskService'
import { startScheduledRun } from './runner'
import { skipRunLog } from './runLog'

/* 计划时刻允许的延迟：超过视为休眠 / 事件循环阻塞造成的错过，不补跑 */
const MISSED_GRACE = 60_000
/* 期望时刻与 croner 下次触发的允许误差：超过视为时钟调整或计时器丢失 */
const SLOT_TOLERANCE = 5_000

/* 单任务调度器：croner 实例 + 表达式签名 + 本次期望触发时刻 */
interface TaskJobEntry {
  /* croner 实例 */
  job: Cron
  /* 表达式与启停签名，用于判断是否需要重建 */
  signature: string
  /* 本次期望触发时刻（毫秒，0 表示无后续触发） */
  armedSlotAt: number
}

/* 任务维度调度器：taskId → 调度器实例 */
const taskJobs = new Map<number, TaskJobEntry>()

/* 任务签名：只有表达式或启停变化才需要重建计时器 */
function taskSignature(task: ScheduledTaskDTO): string {
  return `${task.enabled ? 1 : 0}|${task.scheduleExpression}`
}

/* 计时器选项：日 / 周取交集；展开后的列表按固定时刻处理，保持与旧实现的时区解释一致 */
function cronOptions(): CronOptions {
  return {
    mode: '7-part',
    domAndDow: true,
    fixedTimeRule: 'no-wildcard',
    /* 串行与阻塞策略由 runner 准入统一裁决，避免 croner 静默丢触发 */
    protect: false,
    catch: (error) => log.error('[schedule] 调度器回调异常', error)
  }
}

/* 清除单个任务的调度器（不存在时忽略） */
export function removeTaskJob(taskId: number): void {
  const entry = taskJobs.get(taskId)
  if (!entry) {
    return
  }
  entry.job.stop()
  taskJobs.delete(taskId)
}

/* 清除全部调度器（退出 / 全量重建共用） */
export function clearTaskJobs(): void {
  for (const taskId of [...taskJobs.keys()]) {
    removeTaskJob(taskId)
  }
}

/* 记录一次错过的计划触发：只留跳过日志，不补跑 */
function recordMissedRun(taskId: number, target: number): void {
  try {
    skipRunLog({
      taskId,
      triggerType: 'schedule',
      slotAt: new Date(target).toISOString(),
      status: 'skip',
      error: t('runtime.error.scheduleRunMissed')
    })
  } catch (error) {
    /* 记账失败不能阻断后续重排 */
    log.error(`[schedule] 错过触发记账失败 task=${taskId}`, error)
  }
  log.warn(
    `[schedule] 计划时刻已错过，重排下一轮 task=${taskId} slot=${new Date(target).toISOString()}`
  )
}

/* 创建任务调度器：规则无法转换或无未来触发时返回 null */
function createTaskJob(task: ScheduledTaskDTO): TaskJobEntry | null {
  const pattern = toCronerExpression(task.scheduleExpression)
  if (!pattern) {
    log.error(`[schedule] 触发规则无法转换为调度表达式 task=${task.id}`)
    return null
  }
  try {
    const job = new Cron(pattern, cronOptions(), () => onTaskTick(task.id))
    const next = job.nextRun()
    if (!next) {
      job.stop()
      return null
    }
    return { job, signature: taskSignature(task), armedSlotAt: next.getTime() }
  } catch (error) {
    /* 单个任务创建失败只影响自身，巡检会按签名继续兜底 */
    log.error(`[schedule] 调度器创建失败 task=${task.id}`, error)
    return null
  }
}

/*
 * croner 触发回调：同步完成时刻推进与派发，立即返回。
 *   - slotAt 取期望触发时刻，保证 (task_id, slot_at) 幂等键稳定；
 *   - 迟到超过阈值只记跳过，不补跑；
 *   - 执行异常由 executeRun 自己收尾，不冒泡到 croner。
 */
function onTaskTick(taskId: number): void {
  const entry = taskJobs.get(taskId)
  if (!entry) {
    return
  }
  const slotAt = entry.armedSlotAt
  const next = entry.job.nextRun()
  entry.armedSlotAt = next ? next.getTime() : 0
  if (!slotAt) {
    return
  }
  if (Date.now() - slotAt > MISSED_GRACE) {
    recordMissedRun(taskId, slotAt)
    return
  }
  try {
    startScheduledRun(taskId, 'schedule', new Date(slotAt).toISOString())
  } catch (error) {
    /* 单次触发失败不终止调度：下一周期继续，错误写入运行结果或日志 */
    log.error(`[schedule] 任务触发失败 task=${taskId}`, error)
  }
}

/* 按任务快照同步调度器：签名未变则保留，表达式 / 启停变化时重建 */
export function syncTaskJob(task: ScheduledTaskDTO, force = false): void {
  const existing = taskJobs.get(task.id)
  const signature = taskSignature(task)
  if (
    !force &&
    task.enabled &&
    task.nextRunAt &&
    existing &&
    existing.signature === signature &&
    !existing.job.isStopped()
  ) {
    return
  }
  removeTaskJob(task.id)
  if (!task.enabled || !task.nextRunAt) {
    return
  }
  const entry = createTaskJob(task)
  if (entry) {
    taskJobs.set(task.id, entry)
  }
}

/* 全量重建：启动 / 唤醒 / 配置整体变化时使用 */
export function resyncTaskJobs(): void {
  clearTaskJobs()
  for (const task of listScheduledTasks()) {
    try {
      syncTaskJob(task)
    } catch (error) {
      /* 单个任务失败不影响其它任务，由巡检继续兜底 */
      log.error(`[schedule] 任务调度器装载失败 task=${task.id}`, error)
    }
  }
}

/* 巡检对账：缺失 / 已停止 / 时钟漂移 / 计时器丢失时重建，已删除任务清理 */
export function reconcileTaskJob(task: ScheduledTaskDTO, now: number): void {
  if (!task.enabled || !task.nextRunAt) {
    removeTaskJob(task.id)
    return
  }
  const entry = taskJobs.get(task.id)
  if (!entry || entry.job.isStopped()) {
    syncTaskJob(task)
    return
  }
  const next = entry.job.nextRun()
  const nextAt = next ? next.getTime() : 0
  if (nextAt === 0 || entry.armedSlotAt === 0) {
    /* 无后续触发 / 期望时刻丢失：按最新规则重建 */
    syncTaskJob(task, true)
    return
  }
  /* 期望时刻仍在未来：只校正明显的时钟漂移 */
  if (entry.armedSlotAt > now) {
    if (Math.abs(nextAt - entry.armedSlotAt) > SLOT_TOLERANCE) {
      syncTaskJob(task, true)
    }
    return
  }
  /* 期望时刻已过仍未触发：超过宽限期判定计时器丢失，记跳过并重建 */
  if (now - entry.armedSlotAt > MISSED_GRACE) {
    recordMissedRun(task.id, entry.armedSlotAt)
    syncTaskJob(task, true)
  }
}

/* 清理已删除任务的调度器 */
export function pruneTaskJobs(aliveTaskIds: Set<number>): void {
  for (const taskId of [...taskJobs.keys()]) {
    if (!aliveTaskIds.has(taskId)) {
      removeTaskJob(taskId)
    }
  }
}

/* 系统休眠：暂停全部计时器，避免休眠期间状态漂移 */
export function pauseTaskJobs(): void {
  for (const entry of taskJobs.values()) {
    entry.job.pause()
  }
}

/* 系统唤醒：按期望时刻补记错过的触发（不补跑） */
export function recordArmedMissedRuns(): void {
  const now = Date.now()
  for (const [taskId, entry] of taskJobs) {
    if (entry.armedSlotAt > 0 && now - entry.armedSlotAt > MISSED_GRACE) {
      recordMissedRun(taskId, entry.armedSlotAt)
    }
  }
}
