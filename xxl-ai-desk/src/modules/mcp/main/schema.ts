/*
 * MCP 服务表结构。
 * @author xuxueli 2026-11-07
 */

import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const mcpTable = sqliteTable('desk_mcp', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull().default(''), /* MCP 名称（工具名前缀） */
  type: text('type').notNull().default('remote'), /* remote 远程 / local 本地 */
  transport: text('transport').notNull().default('streamable-http'), /* streamable-http / stdio */
  url: text('url').notNull().default(''), /* 远程服务地址 */
  headers: text('headers').notNull().default('{}'), /* 远程请求头 JSON（值编码存储） */
  command: text('command').notNull().default(''), /* 本地命令 */
  args: text('args').notNull().default('[]'), /* 本地命令参数 JSON 数组 */
  env: text('env').notNull().default('{}'), /* 本地环境变量 JSON（值编码存储） */
  cwd: text('cwd').notNull().default(''), /* 本地工作目录 */
  config: text('config').notNull().default('{}'), /* 规范配置 JSON */
  remark: text('remark').notNull().default(''), /* 备注 */
  health: text('health').notNull().default(''), /* 最近检测结果 JSON */
  addTime: text('add_time').notNull().default(''),
  updateTime: text('update_time').notNull().default('')
})
