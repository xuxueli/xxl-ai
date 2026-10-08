/*
 * Drizzle 表结构定义：与 db/index.ts 的建表 DDL 一一对应。
 * 字段 camelCase 映射到数据库下划线列名。
 */

import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core'

/* 供应商表：一个供应商对应一个 OpenAI 兼容端点与一组模型 */
export const providerTable = sqliteTable('desk_provider', {
  id: text('id').primaryKey(),
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

/* 项目表：1:1 强绑定本地磁盘目录，会话归属项目之下 */
export const projectTable = sqliteTable('desk_project', {
  id: text('id').primaryKey(),
  name: text('name').notNull().default(''),
  path: text('path').notNull().default(''), /* 绑定的本地目录绝对路径 */
  addTime: text('add_time').notNull().default(''),
  updateTime: text('update_time').notNull().default('')
})

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

/* 应用设置表：key-value 形式保存主题、语言、当前模型等 */
export const settingTable = sqliteTable('desk_setting', {
  key: text('key').primaryKey(), /* 设置项键名 */
  value: text('value').notNull().default('') /* 设置项值（对象以 JSON 存储） */
})
