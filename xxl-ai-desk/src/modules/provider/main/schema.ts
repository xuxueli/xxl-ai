/*
 * 供应商表结构：一个供应商对应一个 OpenAI 兼容端点与一组模型。
 * @author xuxueli 2026-11-07
 */

import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core'

export const providerTable = sqliteTable('desk_provider', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  baseUrl: text('base_url').notNull().default(''), /* OpenAI 兼容端点地址 */
  apiKey: text('api_key').notNull().default(''), /* 密钥（编码后存储） */
  headers: text('headers').notNull().default('{}'), /* 自定义请求头 JSON */
  models: text('models').notNull().default('[]'), /* 模型 ID 列表 JSON */
  enabled: integer('enabled').notNull().default(1), /* 1 启用 / 0 停用 */
  sort: integer('sort').notNull().default(0), /* 列表排序值 */
  addTime: text('add_time').notNull().default(''),
  updateTime: text('update_time').notNull().default('')
})
