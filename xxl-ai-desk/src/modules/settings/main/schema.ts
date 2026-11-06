/*
 * 应用设置表结构。
 * @author xuxueli 2026-11-07
 */

import { sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const settingTable = sqliteTable('desk_setting', {
  key: text('key').primaryKey(), /* 设置项键名 */
  value: text('value').notNull().default('') /* 设置项值（对象以 JSON 存储） */
})
