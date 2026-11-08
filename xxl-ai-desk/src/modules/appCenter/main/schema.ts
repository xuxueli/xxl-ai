/*
 * 应用状态表结构：安装、启用与配置统一存储。
 * @author xuxueli 2026-11-08
 */

import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const appSettingTable = sqliteTable('desk_app_setting', {
  appId: text('app_id').primaryKey(), /* 应用标识 */
  installed: integer('installed').notNull().default(0), /* 是否已安装 */
  enabled: integer('enabled').notNull().default(0), /* 是否启用 */
  config: text('config').notNull().default('{}'), /* 应用配置（JSON） */
  addTime: text('add_time').notNull().default(''), /* 创建时间（ISO） */
  updateTime: text('update_time').notNull().default('') /* 更新时间（ISO） */
})
