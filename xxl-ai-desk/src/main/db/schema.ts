import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core'

/* 供应商表：一个供应商对应一个 OpenAI 兼容端点与一组模型 */
export const providerTable = sqliteTable('desk_provider', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  baseUrl: text('base_url').notNull().default(''),
  apiKey: text('api_key').notNull().default(''),
  headers: text('headers').notNull().default('{}'),
  models: text('models').notNull().default('[]'),
  enabled: integer('enabled').notNull().default(1),
  sort: integer('sort').notNull().default(0),
  addTime: text('add_time').notNull().default(''),
  updateTime: text('update_time').notNull().default('')
})

/* 项目表：1:1 强绑定本地磁盘目录，会话归属项目之下 */
export const projectTable = sqliteTable('desk_project', {
  id: text('id').primaryKey(),
  name: text('name').notNull().default(''),
  path: text('path').notNull().default(''),
  addTime: text('add_time').notNull().default(''),
  updateTime: text('update_time').notNull().default('')
})

/* 会话表：一次会话绑定一个供应商与模型，并保存系统指令；归属某项目 */
export const sessionTable = sqliteTable('desk_session', {
  id: text('id').primaryKey(),
  title: text('title').notNull().default(''),
  projectId: text('project_id').notNull().default(''),
  providerId: text('provider_id').notNull().default(''),
  modelId: text('model_id').notNull().default(''),
  systemPrompt: text('system_prompt').notNull().default(''),
  addTime: text('add_time').notNull().default(''),
  updateTime: text('update_time').notNull().default('')
})

/* 消息表：按会话顺序保存消息，data 为 Agent 原始消息 JSON */
export const messageTable = sqliteTable('desk_message', {
  id: text('id').primaryKey(),
  sessionId: text('session_id').notNull(),
  seq: integer('seq').notNull().default(0),
  role: text('role').notNull().default(''),
  content: text('content').notNull().default(''),
  data: text('data').notNull().default(''),
  addTime: text('add_time').notNull().default('')
})

/* 应用设置表：key-value 形式保存主题、语言、当前模型等 */
export const settingTable = sqliteTable('desk_setting', {
  key: text('key').primaryKey(),
  value: text('value').notNull().default('')
})
