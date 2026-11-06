/*
 * Agent 记忆表结构：按项目维度保存，一个项目一条。
 * @author xuxueli 2026-11-07
 */

import { sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const agentMemoryTable = sqliteTable('desk_agent_memory', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().default(''), /* 归属项目 ID（唯一） */
  content: text('content').notNull().default(''), /* 记忆正文（Markdown，固定四段，≤2000 字） */
  lastMessageTime: text('last_time').notNull().default(''), /* 上次生成纳入的最后一条消息时间（项目级游标） */
  addTime: text('add_time').notNull().default(''),
  updateTime: text('update_time').notNull().default('')
})
