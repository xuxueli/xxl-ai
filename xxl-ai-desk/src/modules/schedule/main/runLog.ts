/*
 * 定时任务运行日志：每次触发落一条记录，含被跳过的触发。
 *   - 同一任务的计划时刻唯一，重复触发不会执行第二次；
 *   - 记录只作观测与排查，运行结果仍以任务表 last_* 为活跃状态；
 *   - 不自动裁剪：由运行日志页的「日志清理」按任务 + 时间范围删除，删除任务时一并清理。
 * @author xuxueli 2026-11-15
 */

import { and, count, desc, eq, gte, lt, type SQL } from 'drizzle-orm'
import { getDb } from '@common/main/db'
import { t } from '@common/main/i18n'
import type { PageResult } from '@common/shared/contracts/pagination'
import type {
  ScheduleLogClearInput,
  ScheduleLogDTO,
  ScheduleLogQuery,
  ScheduleLogStatus,
  ScheduleLogTrigger
} from '@modules/schedule/shared'
import { scheduledLogTable } from './schema'

/* 默认与最大分页大小 */
const LOG_PAGE_SIZE_DEFAULT = 10
const LOG_PAGE_SIZE_MAX = 100

/* 日志行结构 */
type ScheduledLogRow = typeof scheduledLogTable.$inferSelect

/* 日志状态归一：只保留已知状态，其余视为失败 */
function normalizeStatus(value: unknown): ScheduleLogStatus {
  if (value === 'running' || value === 'success' || value === 'skip') {
    return value
  }
  return 'failed'
}

/* 日志触发方式归一：只保留已知方式，其余视为定时触发 */
function normalizeTrigger(value: unknown): ScheduleLogTrigger {
  return value === 'manual' ? 'manual' : 'schedule'
}

/* 行记录 → DTO */
function toDTO(row: ScheduledLogRow): ScheduleLogDTO {
  return {
    id: row.id,
    taskId: row.taskId,
    triggerType: normalizeTrigger(row.triggerType),
    slotAt: row.slotAt,
    status: normalizeStatus(row.status),
    sessionId: row.sessionId,
    error: row.error,
    addTime: row.addTime,
    updateTime: row.updateTime
  }
}

/* 该计划时刻是否已处理过（用于避免同一时刻重复执行） */
export function hasRunLog(taskId: number, slotAt: string): boolean {
  if (!taskId || !slotAt) {
    return false
  }
  return Boolean(
    getDb()
      .select({ id: scheduledLogTable.id })
      .from(scheduledLogTable)
      .where(and(eq(scheduledLogTable.taskId, taskId), eq(scheduledLogTable.slotAt, slotAt)))
      .get()
  )
}

/*
 * 开始一条运行日志：返回日志主键；同一计划时刻已存在记录时返回 0（调用方放弃本次执行）。
 * 立即运行的计划时刻为空串，不参与唯一约束。
 */
export function startRunLog(input: {
  taskId: number
  triggerType: ScheduleLogTrigger
  slotAt: string
  sessionId: number
}): number {
  if (input.slotAt && hasRunLog(input.taskId, input.slotAt)) {
    return 0
  }
  const now = new Date().toISOString()
  const inserted = getDb()
    .insert(scheduledLogTable)
    .values({
      taskId: input.taskId,
      triggerType: input.triggerType,
      slotAt: input.slotAt,
      status: 'running',
      sessionId: input.sessionId,
      error: '',
      addTime: now,
      updateTime: now
    })
    .onConflictDoNothing()
    .returning({ id: scheduledLogTable.id })
    .get()
  return inserted?.id ?? 0
}

/* 结算运行日志：只更新仍在进行中的行，避免兜底结果被后到的收尾覆盖 */
export function finishRunLog(id: number, status: ScheduleLogStatus, error: string): void {
  if (!id) {
    return
  }
  getDb()
    .update(scheduledLogTable)
    .set({ status, error, updateTime: new Date().toISOString() })
    .where(and(eq(scheduledLogTable.id, id), eq(scheduledLogTable.status, 'running')))
    .run()
}

/* 记录一次未执行的触发（会话阻塞忽略 / 并发满 / 引用失效 / 计划时刻错过） */
export function skipRunLog(input: {
  taskId: number
  triggerType: ScheduleLogTrigger
  slotAt: string
  status: ScheduleLogStatus
  error: string
}): void {
  const now = new Date().toISOString()
  getDb()
    .insert(scheduledLogTable)
    .values({
      taskId: input.taskId,
      triggerType: input.triggerType,
      slotAt: input.slotAt,
      status: input.status,
      sessionId: 0,
      error: input.error,
      addTime: now,
      updateTime: now
    })
    .onConflictDoNothing()
    .run()
}

/* 日志筛选条件：任务 + 触发时间范围，均省略时返回 undefined（不限条件） */
function logCondition(filter: ScheduleLogClearInput): SQL | undefined {
  const conditions = []
  if (filter.taskId) {
    conditions.push(eq(scheduledLogTable.taskId, filter.taskId))
  }
  if (filter.startTime) {
    conditions.push(gte(scheduledLogTable.addTime, filter.startTime))
  }
  if (filter.endTime) {
    conditions.push(lt(scheduledLogTable.addTime, filter.endTime))
  }
  return conditions.length ? and(...conditions) : undefined
}

/* 运行日志分页：按任务与触发时间范围过滤、主键倒序 */
export function listRunLogs(query: ScheduleLogQuery): PageResult<ScheduleLogDTO> {
  const pageSize = Math.min(
    LOG_PAGE_SIZE_MAX,
    Math.max(1, Math.floor(query.pageSize || LOG_PAGE_SIZE_DEFAULT))
  )
  const page = Math.max(1, Math.floor(query.page || 1))
  const condition = logCondition(query)
  const total =
    getDb()
      .select({ total: count() })
      .from(scheduledLogTable)
      .where(condition)
      .get()?.total ?? 0
  const rows = getDb()
    .select()
    .from(scheduledLogTable)
    .where(condition)
    .orderBy(desc(scheduledLogTable.id))
    .limit(pageSize)
    .offset((page - 1) * pageSize)
    .all()
  return { items: rows.map(toDTO), total, page, pageSize }
}

/* 清理运行日志：按任务与触发时间范围删除，均省略时清空全部；返回删除条数 */
export function clearRunLogs(input: ScheduleLogClearInput): number {
  return getDb().delete(scheduledLogTable).where(logCondition(input)).run().changes
}

/* 应用启动：上次进程遗留的「进行中」日志统一标为失败，避免日志长期停在进行中 */
export function markInterruptedLogs(): void {
  getDb()
    .update(scheduledLogTable)
    .set({
      status: 'failed',
      error: t('runtime.error.scheduleRunInterrupted'),
      updateTime: new Date().toISOString()
    })
    .where(eq(scheduledLogTable.status, 'running'))
    .run()
}
