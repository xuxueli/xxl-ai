/*
 * 定时任务服务：任务配置 CRUD、字段校验与 DTO 归一。
 *   - 调度器只消费本服务的查询结果，不直接读写任务表；
 *   - 运行结果由任务表持久化，运行中状态由 runState 进程内维护。
 * @author xuxueli 2026-11-15
 */

import { eq } from 'drizzle-orm'
import { getDb } from '@common/main/db'
import { t } from '@common/main/i18n'
import { getAgentById } from '@modules/agent/main'
import { getProject } from '@modules/project/main'
import { getSettings } from '@modules/settings/main'
import { DEFAULT_PERMISSION_MODE, normalizePermissionMode } from '@common/shared/permission'
import { DEFAULT_REASONING_LEVEL, normalizeReasoningLevel } from '@common/shared/model'
import {
  SCHEDULE_DEFAULT_EXPRESSION,
  nextRunTimes,
  normalizeScheduleExpression,
  validateScheduleFields
} from '@modules/schedule/shared'
import type {
  ScheduleConfigDTO,
  ScheduleRunStatus,
  ScheduleSessionBlockPolicy,
  ScheduleSessionMode,
  ScheduledTaskDTO,
  ScheduledTaskInput
} from '@modules/schedule/shared'
import { scheduledTaskTable } from './schema'
import { clearRunLogs } from './runLog'
import { isTaskRunning } from './runState'

type ScheduledTaskRow = typeof scheduledTaskTable.$inferSelect

/* 会话设置方式归一：非法值回退「复用上次会话」 */
function normalizeSessionMode(value: unknown): ScheduleSessionMode {
  return value === 'new' ? 'new' : 'reuse'
}

/* 会话阻塞策略归一：非法值回退「本次调度忽略」 */
function normalizeSessionBlockPolicy(value: unknown): ScheduleSessionBlockPolicy {
  return value === 'force' ? 'force' : 'skip'
}

/* 任务超时归一：0 表示不限时，其余取整到 >=1 分钟 */
function normalizeTimeoutMinutes(value: unknown): number {
  const minutes = Math.floor(Number(value))
  return Number.isFinite(minutes) && minutes > 0 ? minutes : 0
}

/* 运行结果归一：只保留已知结果，其余视为未运行 */
function normalizeRunStatus(value: unknown): ScheduleRunStatus {
  return value === 'success' || value === 'failed' || value === 'skipped' ? value : ''
}

/* 下次触发时间：规则无未来时间（如年份已过）时返回 null */
function nextRunAtOf(expression: string): string | null {
  return nextRunTimes(expression, 1)[0] ?? null
}

/* 读取任务行（不存在返回 undefined），供查询与写入前的存在性校验共用 */
function findRow(id: number): ScheduledTaskRow | undefined {
  if (!id) {
    return undefined
  }
  return getDb().select().from(scheduledTaskTable).where(eq(scheduledTaskTable.id, id)).get()
}

/* 项目 / Agent 失效提示：列表与运行前共用同一判断，避免两处口径不一致 */
function invalidReasonOf(row: ScheduledTaskRow): string {
  if (!row.projectId || !getProject(row.projectId)) {
    return t('runtime.error.scheduleProjectMissing')
  }
  if (!row.agentId || !getAgentById(row.agentId)) {
    return t('runtime.error.scheduleAgentMissing')
  }
  return ''
}

/* 行记录 → DTO（运行时派生字段在这里统一回填） */
function toDTO(row: ScheduledTaskRow): ScheduledTaskDTO {
  const enabled = row.enabled === 1
  /* 读取边界归一：存量脏数据回退默认规则，避免 UI 解析失败 */
  const scheduleExpression =
    normalizeScheduleExpression(row.scheduleExpression) || SCHEDULE_DEFAULT_EXPRESSION
  return {
    id: row.id,
    name: row.name,
    prompt: row.prompt,
    projectId: row.projectId,
    agentId: row.agentId,
    providerId: row.providerId,
    modelId: row.modelId,
    reasoningLevel: normalizeReasoningLevel(row.reasoningLevel),
    permissionMode: normalizePermissionMode(row.permissionMode),
    scheduleExpression,
    sessionMode: normalizeSessionMode(row.sessionMode),
    sessionBlockPolicy: normalizeSessionBlockPolicy(row.sessionBlockPolicy),
    timeoutMinutes: normalizeTimeoutMinutes(row.timeoutMinutes),
    enabled,
    lastRunAt: row.lastRunAt,
    lastRunStatus: normalizeRunStatus(row.lastRunStatus),
    lastError: row.lastError,
    lastSessionId: row.lastSessionId,
    addTime: row.addTime,
    updateTime: row.updateTime,
    nextRunAt: enabled ? nextRunAtOf(scheduleExpression) : null,
    running: isTaskRunning(row.id),
    invalidReason: invalidReasonOf(row)
  }
}

/*
 * 任务名称自然排序：中文按拼音、数字按数值比较（如「任务2」排在「任务10」之前）。
 * 同名时按主键升序，保证顺序稳定。
 */
const taskNameCollator = new Intl.Collator('zh-Hans', { numeric: true, sensitivity: 'base' })

/* 全部定时任务（任务名称自然排序） */
export function listScheduledTasks(): ScheduledTaskDTO[] {
  return getDb()
    .select()
    .from(scheduledTaskTable)
    .all()
    .map(toDTO)
    .sort((a, b) => taskNameCollator.compare(a.name, b.name) || a.id - b.id)
}

/* 单个定时任务 */
export function getScheduledTask(id: number): ScheduledTaskDTO | null {
  const row = findRow(id)
  return row ? toDTO(row) : null
}

/* 保存定时任务：校验、归一、upsert；不负责调度重排（由 IPC 编排） */
export function saveScheduledTask(input: ScheduledTaskInput): ScheduledTaskDTO {
  /* 字段规则与渲染层共用同一实现：一处调整，两端口径一致 */
  const fieldError = validateScheduleFields(input)
  if (fieldError) {
    throw new Error(t(`runtime.error.${fieldError}`))
  }
  const name = input.name.trim()
  const prompt = input.prompt.trim()
  const scheduleExpression = normalizeScheduleExpression(input.scheduleExpression)
  if (!input.projectId || !getProject(input.projectId)) {
    throw new Error(t('runtime.error.scheduleProjectMissing'))
  }
  if (!input.agentId || !getAgentById(input.agentId)) {
    throw new Error(t('runtime.error.scheduleAgentMissing'))
  }

  const db = getDb()
  const now = new Date().toISOString()
  const existing = input.id ? findRow(input.id) : undefined
  if (input.id && !existing) {
    throw new Error(t('runtime.error.scheduleTaskMissing'))
  }
  const sessionMode = normalizeSessionMode(input.sessionMode)

  const record = {
    name,
    prompt,
    projectId: input.projectId,
    agentId: input.agentId,
    providerId: input.providerId ?? 0,
    modelId: input.modelId ?? '',
    reasoningLevel: normalizeReasoningLevel(input.reasoningLevel ?? DEFAULT_REASONING_LEVEL),
    permissionMode: normalizePermissionMode(input.permissionMode ?? DEFAULT_PERMISSION_MODE),
    scheduleExpression,
    sessionMode,
    /* 阻塞策略只对「复用上次会话」生效：新建模式统一存默认值，避免切换后残留旧策略 */
    sessionBlockPolicy:
      sessionMode === 'new' ? 'skip' : normalizeSessionBlockPolicy(input.sessionBlockPolicy),
    timeoutMinutes: normalizeTimeoutMinutes(input.timeoutMinutes),
    enabled: (input.enabled ?? true) ? 1 : 0,
    lastRunAt: existing?.lastRunAt ?? '',
    lastRunStatus: existing?.lastRunStatus ?? '',
    lastError: existing?.lastError ?? '',
    lastSessionId: existing?.lastSessionId ?? 0,
    addTime: existing?.addTime ?? now,
    updateTime: now
  }
  /*
   * 会话属性变化后旧会话不再代表当前配置：
   * 清空复用指针，避免「复用上次会话」继续用旧的模型 / 项目 / 权限运行。
   */
  if (
    existing &&
    (existing.projectId !== record.projectId ||
      existing.agentId !== record.agentId ||
      existing.providerId !== record.providerId ||
      existing.modelId !== record.modelId ||
      existing.reasoningLevel !== record.reasoningLevel ||
      existing.permissionMode !== record.permissionMode)
  ) {
    record.lastSessionId = 0
  }

  if (existing) {
    db.update(scheduledTaskTable)
      .set(record)
      .where(eq(scheduledTaskTable.id, existing.id))
      .run()
    return toDTO({ id: existing.id, ...record })
  }

  const inserted = db
    .insert(scheduledTaskTable)
    .values(record)
    .returning({ id: scheduledTaskTable.id })
    .get()
  return toDTO({ id: inserted.id, ...record })
}

/* 启停：仅影响后续调度，不终止正在运行的实例 */
export function setScheduledTaskEnabled(id: number, enabled: boolean): void {
  const db = getDb()
  const existing = findRow(id)
  if (!existing) {
    throw new Error(t('runtime.error.scheduleTaskMissing'))
  }
  db.update(scheduledTaskTable)
    .set({ enabled: enabled ? 1 : 0, updateTime: new Date().toISOString() })
    .where(eq(scheduledTaskTable.id, id))
    .run()
}

/* 删除任务配置：运行日志一并清理，历史会话由会话域保留 */
export function deleteScheduledTask(id: number): void {
  if (!id) {
    return
  }
  getDb().delete(scheduledTaskTable).where(eq(scheduledTaskTable.id, id)).run()
  clearRunLogs({ taskId: id })
}

/* 写入最近一次运行结果 */
export function markScheduledRun(
  id: number,
  patch: {
    lastRunAt?: string
    lastRunStatus?: ScheduleRunStatus
    lastError?: string
    lastSessionId?: number
  }
): void {
  const existing = findRow(id)
  if (!existing) {
    return
  }
  getDb().update(scheduledTaskTable)
    .set({
      lastRunAt: patch.lastRunAt ?? existing.lastRunAt,
      lastRunStatus: patch.lastRunStatus ?? existing.lastRunStatus,
      lastError: patch.lastError ?? existing.lastError,
      lastSessionId: patch.lastSessionId ?? existing.lastSessionId
    })
    .where(eq(scheduledTaskTable.id, id))
    .run()
}

/* 定时调度设置：休眠开关、最大并发数与巡检间隔 */
export function getScheduleConfig(): ScheduleConfigDTO {
  const settings = getSettings()
  return {
    keepAwake: settings.scheduleKeepAwake,
    maxConcurrency: settings.scheduleMaxConcurrency,
    watchdogInterval: settings.scheduleWatchdogInterval
  }
}
