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
  addTime: text('add_time').notNull().default(''),
  updateTime: text('update_time').notNull().default('')
})
