/*
 * Agent 表结构：Agent 配置（图标标识 / 指令 / 技能 / MCP / 内置工具）。
 * @author xuxueli 2026-11-07
 */

import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

/* Agent 配置 */
export const agentTable = sqliteTable('desk_agent', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull().default(''),
  description: text('description').notNull().default(''),
  avatar: text('avatar').notNull().default('assistant'), /* 预设标识 id */
  systemPrompt: text('system_prompt').notNull().default(''), /* 系统指令（≤2000 字） */
  skillIds: text('skill_ids').notNull().default('[]'), /* 选用的技能 id（JSON 数组） */
  mcpIds: text('mcp_ids').notNull().default('[]'), /* 选用的 MCP id（JSON 数组） */
  toolFs: integer('tool_fs').notNull().default(1), /* 文件类工具开关 */
  toolShell: integer('tool_shell').notNull().default(1), /* 终端类工具开关 */
  toolBrowser: integer('tool_browser').notNull().default(1), /* 浏览器类工具开关 */
  toolGeneral: integer('tool_general').notNull().default(0), /* 通用工具开关 */
  toolInteraction: integer('tool_interaction').notNull().default(0), /* 人机交互工具开关 */
  builtin: integer('builtin').notNull().default(0), /* 1=默认内置 Agent（禁止删除） */
  addTime: text('add_time').notNull().default(''),
  updateTime: text('update_time').notNull().default('')
})
