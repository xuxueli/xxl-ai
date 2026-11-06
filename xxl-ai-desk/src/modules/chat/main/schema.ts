/*
 * 会话与消息表结构。
 * @author xuxueli 2026-11-07
 */

import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core'

/* 会话表：一次会话绑定一个供应商与模型，并保存对话模式；归属某项目 */
export const sessionTable = sqliteTable('desk_session', {
  id: text('id').primaryKey(),
  title: text('title').notNull().default(''),
  projectId: text('project_id').notNull().default(''), /* 归属项目 ID */
  providerId: text('provider_id').notNull().default(''), /* 绑定供应商 ID */
  modelId: text('model_id').notNull().default(''), /* 绑定模型 ID */
  mode: text('mode').notNull().default('build'), /* 对话模式 plan / build */
  addTime: text('add_time').notNull().default(''),
  updateTime: text('update_time').notNull().default('')
})

/* 消息表：按会话顺序保存消息，data 为 Agent 原始消息 JSON */
export const messageTable = sqliteTable('desk_message', {
  id: text('id').primaryKey(),
  sessionId: text('session_id').notNull(),
  seq: integer('seq').notNull().default(0), /* 会话内顺序号（升序） */
  role: text('role').notNull().default(''),
  content: text('content').notNull().default(''), /* 归一化纯文本（列表预览） */
  data: text('data').notNull().default(''), /* Agent 原始消息 JSON */
  addTime: text('add_time').notNull().default('')
})
