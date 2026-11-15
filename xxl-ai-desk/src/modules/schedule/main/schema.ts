/*
 * 定时任务表结构与运行日志表结构。
 * @author xuxueli 2026-11-15
 */

import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import type {
  ScheduleLogStatus,
  ScheduleLogTrigger,
  ScheduleSessionBlockPolicy,
  ScheduleSessionMode
} from '@modules/schedule/shared'

/* 定时任务：保存会话模板、触发规则与上次运行结果 */
export const scheduledTaskTable = sqliteTable('desk_scheduled_task', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull().default(''),
  prompt: text('prompt').notNull().default(''),
  projectId: integer('project_id').notNull().default(0),
  agentId: integer('agent_id').notNull().default(0),
  providerId: integer('provider_id').notNull().default(0),
  modelId: text('model_id').notNull().default(''),
  reasoningLevel: text('reasoning_level').notNull().default('default'),
  permissionMode: text('permission_mode').notNull().default('workspace-write'),
  scheduleExpression: text('schedule_expression').notNull().default(''),
  sessionMode: text('session_mode').$type<ScheduleSessionMode>().notNull().default('reuse'),
  sessionBlockPolicy: text('session_block_policy')
    .$type<ScheduleSessionBlockPolicy>()
    .notNull()
    .default('skip'),
  timeoutMinutes: integer('timeout_minutes').notNull().default(0),
  enabled: integer('enabled').notNull().default(1),
  lastRunAt: text('last_run_at').notNull().default(''),
  lastRunStatus: text('last_run_status').notNull().default(''),
  lastError: text('last_error').notNull().default(''),
  lastSessionId: integer('last_session_id').notNull().default(0),
  addTime: text('add_time').notNull().default(''),
  updateTime: text('update_time').notNull().default('')
})

/* 运行日志：每次触发一条，含被跳过的触发 */
export const scheduledLogTable = sqliteTable('desk_scheduled_log', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  taskId: integer('task_id').notNull().default(0),
  triggerType: text('trigger_type').$type<ScheduleLogTrigger>().notNull().default('schedule'),
  slotAt: text('slot_at').notNull().default(''),
  status: text('status').$type<ScheduleLogStatus>().notNull().default('running'),
  sessionId: integer('session_id').notNull().default(0),
  error: text('error').notNull().default(''),
  addTime: text('add_time').notNull().default(''),
  updateTime: text('update_time').notNull().default('')
})
