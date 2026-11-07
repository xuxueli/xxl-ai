/*
 * Agent 表结构：Agent 配置（图标标识 / 指令 / 技能 / MCP / 内置工具）与项目记忆。
 * @author xuxueli 2026-11-07
 */

import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

/* Agent 配置 */
export const agentTable = sqliteTable('desk_agent', {
  id: text('id').primaryKey(),
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

/* Agent 记忆：按项目维度保存，一个项目一条 */
export const agentMemoryTable = sqliteTable('desk_agent_memory', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().default(''), /* 归属项目 ID（唯一） */
  content: text('content').notNull().default(''), /* 记忆正文（Markdown，固定四段，≤2000 字） */
  lastMessageTime: text('last_time').notNull().default(''), /* 上次生成纳入的最后一条消息时间（项目级游标） */
  addTime: text('add_time').notNull().default(''),
  updateTime: text('update_time').notNull().default('')
})
