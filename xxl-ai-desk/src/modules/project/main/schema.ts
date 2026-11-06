/*
 * 项目表结构：1:1 强绑定本地磁盘目录。
 * @author xuxueli 2026-11-07
 */

import { sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const projectTable = sqliteTable('desk_project', {
  id: text('id').primaryKey(),
  name: text('name').notNull().default(''),
  path: text('path').notNull().default(''), /* 绑定的本地目录绝对路径 */
  addTime: text('add_time').notNull().default(''),
  updateTime: text('update_time').notNull().default('')
})
