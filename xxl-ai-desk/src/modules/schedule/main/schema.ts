/*
 * 定时任务表结构。
 * @author xuxueli 2026-11-15
 */

import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import type { ScheduleSessionMode } from '@modules/schedule/shared'

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
  enabled: integer('enabled').notNull().default(1),
  lastRunAt: text('last_run_at').notNull().default(''),
  lastRunStatus: text('last_run_status').notNull().default(''),
  lastError: text('last_error').notNull().default(''),
  lastSessionId: integer('last_session_id').notNull().default(0),
  addTime: text('add_time').notNull().default(''),
  updateTime: text('update_time').notNull().default('')
})
