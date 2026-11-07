/*
 * 会话与消息表结构。
 * @author xuxueli 2026-11-07
 */

import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core'

/* 会话表：一次会话绑定一个项目、Agent、供应商与模型，并保存对话模式 */
export const sessionTable = sqliteTable('desk_session', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  title: text('title').notNull().default(''),
  projectId: integer('project_id').notNull().default(0), /* 归属项目 ID */
  agentId: integer('agent_id').notNull().default(0), /* 绑定的 Agent ID（创建后不可修改） */
  providerId: integer('provider_id').notNull().default(0), /* 绑定供应商 ID */
  modelId: text('model_id').notNull().default(''), /* 绑定模型 ID */
  mode: text('mode').notNull().default('build'), /* 对话模式 plan / build */
  addTime: text('add_time').notNull().default(''),
  updateTime: text('update_time').notNull().default('')
})

/* 消息表：按会话顺序保存消息，data 为 Agent 原始消息 JSON */
export const messageTable = sqliteTable('desk_message', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  sessionId: integer('session_id').notNull(),
  turnId: integer('turn_id').notNull().default(0), /* 所属轮次：等于该轮真实用户提问消息 id */
  role: text('role').notNull().default(''),
  injected: integer('injected', { mode: 'boolean' }).notNull().default(false), /* 运行时注入消息（非用户输入）：不展示、不构成新一轮 */
  status: text('status').notNull().default(''), /* 消息状态（success/aborted/error/truncated，非助手为空） */
  content: text('content').notNull().default(''), /* 归一化纯文本（列表预览） */
  data: text('data').notNull().default(''), /* Agent 原始消息 JSON */
  addTime: text('add_time').notNull().default('')
})
