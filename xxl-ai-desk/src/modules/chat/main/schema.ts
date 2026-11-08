/*
 * 会话与消息表结构。
 * @author xuxueli 2026-11-07
 */

import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core'
import type { MessageSource } from '@modules/chat/shared'

/* 会话表：一次会话绑定一个项目、Agent、供应商与模型，并保存推理等级、权限模式与压缩摘要 */
export const sessionTable = sqliteTable('desk_session', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  title: text('title').notNull().default(''),
  projectId: integer('project_id').notNull().default(0), /* 归属项目 ID */
  agentId: integer('agent_id').notNull().default(0), /* 绑定的 Agent ID（创建后不可修改） */
  providerId: integer('provider_id').notNull().default(0), /* 绑定供应商 ID */
  modelId: text('model_id').notNull().default(''), /* 绑定模型 ID */
  reasoningLevel: text('reasoning_level').notNull().default('default'), /* 推理等级 default / low / high / max */
  permissionMode: text('permission_mode').notNull().default('workspace-write'), /* 权限模式 read-only / workspace-write / full-access */
  summary: text('summary').notNull().default(''), /* 历史会话压缩摘要（定长） */
  summaryLastMessageId: integer('summary_last_message_id').notNull().default(0), /* 摘要覆盖到的最后一条消息 ID */
  summaryUpdateTime: text('summary_update_time').notNull().default(''), /* 摘要生成时间（ISO） */
  contextBreakdown: text('context_breakdown').notNull().default(''), /* 最近一次上下文分项估算（JSON） */
  addTime: text('add_time').notNull().default(''),
  updateTime: text('update_time').notNull().default('')
})

/* 消息表：按会话顺序保存消息，data 为 Agent 原始消息 JSON */
export const messageTable = sqliteTable('desk_message', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  sessionId: integer('session_id').notNull(),
  turnId: integer('turn_id').notNull().default(0), /* 所属轮次：等于该轮真实用户提问消息 id */
  role: text('role').notNull().default(''),
  source: text('source').$type<MessageSource>(), /* 运行时注入来源；常规消息为空（NULL） */
  status: text('status').notNull().default(''), /* 消息状态（success/aborted/error/truncated，非助手为空） */
  content: text('content').notNull().default(''), /* 归一化纯文本（列表预览） */
  data: text('data').notNull().default(''), /* Agent 原始消息 JSON */
  addTime: text('add_time').notNull().default('')
})
