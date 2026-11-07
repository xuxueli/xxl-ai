/*
 * 模型通讯 trace 表结构：仅开发者模式开启时写入。
 * @author xuxueli 2026-11-07
 */

import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core'

export const llmTraceTable = sqliteTable('desk_llm_trace', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  sessionId: integer('session_id').notNull().default(0), /* 归属会话 ID */
  runId: text('run_id').notNull().default(''), /* 一轮对话的运行标识 */
  step: integer('step').notNull().default(0), /* 本轮第几次模型调用 */
  providerId: integer('provider_id').notNull().default(0), /* 供应商 ID */
  modelId: text('model_id').notNull().default(''), /* 模型 ID */
  phase: text('phase').notNull().default('chat'), /* chat 对话 / memory 记忆生成 / summary 会话摘要 */
  status: text('status').notNull().default('success'), /* success / error / aborted */
  httpStatus: integer('http_status').notNull().default(0), /* HTTP 状态码 */
  durationMs: integer('duration_ms').notNull().default(0), /* 请求到响应耗时 */
  inputTokens: integer('input_tokens').notNull().default(0),
  outputTokens: integer('output_tokens').notNull().default(0),
  reasoningTokens: integer('reasoning_tokens').notNull().default(0),
  request: text('request').notNull().default(''), /* 请求体 JSON（已截断） */
  response: text('response').notNull().default(''), /* 响应体 JSON（已截断） */
  toolCalls: text('tool_calls').notNull().default('[]'), /* 工具调用明细 JSON */
  error: text('error').notNull().default(''), /* 错误信息 */
  addTime: text('add_time').notNull().default('')
})
