/*
 * 项目表结构：1:1 强绑定本地磁盘目录。
 * @author xuxueli 2026-11-07
 */

import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core'

export const projectTable = sqliteTable('desk_project', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull().default(''),
  path: text('path').notNull().default(''), /* 绑定的本地目录绝对路径 */
  memoryEnabled: integer('memory_enabled').notNull().default(0), /* 1=启用项目长期记忆 */
  memory: text('memory').notNull().default(''), /* 长期记忆正文（Markdown，≤2000 字） */
  memoryLastTime: text('memory_last_time').notNull().default(''), /* 上次生成纳入的最后一条消息时间（项目级游标） */
  memoryUpdateTime: text('memory_update_time').notNull().default(''), /* 记忆生成时间（ISO） */
  addTime: text('add_time').notNull().default(''),
  updateTime: text('update_time').notNull().default('')
})
