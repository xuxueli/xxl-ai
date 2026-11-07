/*
 * 会话诊断契约：会话消息与模型通讯（trace）的分页查询、明细结构。
 *   - 诊断视图只读聚合，不复制数据：会话消息读 desk_message，模型通讯读 desk_llm_trace；
 *   - 模型通讯仅在开发者模式开启时写入。
 *
 * @author xuxueli 2026-11-01
 */

import type { PageQuery } from '@common/shared/contracts/pagination'

/* 模型通讯 trace：请求体字符上限（worker 采集与主进程落库共用） */
export const TRACE_REQUEST_MAX_CHARS = 256 * 1024

/* 模型通讯 trace：响应体字符上限 */
export const TRACE_RESPONSE_MAX_CHARS = 64 * 1024

/* 模型通讯 trace：单个工具结果字符上限 */
export const TRACE_TOOL_RESULT_MAX_CHARS = 32 * 1024

/* 模型通讯 trace：工具调用明细总量字符上限 */
export const TRACE_TOOL_CALLS_MAX_CHARS = 256 * 1024

/* 模型通讯 trace：错误信息字符上限 */
export const TRACE_ERROR_MAX_CHARS = 4000

/* 诊断分页查询：会话 + 通用分页参数 */
export interface DiagnosticsQuery extends PageQuery {
  /* 会话主键 */
  sessionId: number
}

/* 单次工具调用明细 */
export interface ToolCallTraceDTO {
  /* 工具调用 ID（与模型返回的 toolCall 对应） */
  toolCallId: string
  /* 工具名 */
  toolName: string
  /* 调用参数 */
  args: unknown
  /* 工具返回文本（已截断） */
  result: string
  /* 是否执行失败 */
  isError: boolean
  /* 执行耗时（毫秒） */
  durationMs: number
}

/* 一次模型调用的完整 trace */
export interface LlmTraceInput {
  /* 一轮对话的运行标识（同一 run 内 step 递增） */
  runId: string
  /* 本轮第几次模型调用（从 1 开始） */
  step: number
  /* 供应商主键 */
  providerId: number
  /* 模型 ID */
  modelId: string
  /* 来源：对话 / 记忆生成 / 会话摘要 */
  phase: 'chat' | 'memory' | 'summary'
  /* 结果状态 */
  status: 'success' | 'error' | 'aborted'
  /* HTTP 状态码（未知为 0） */
  httpStatus: number
  /* 请求到响应的耗时（毫秒） */
  durationMs: number
  /* 输入 tokens */
  inputTokens: number
  /* 输出 tokens */
  outputTokens: number
  /* 推理 tokens */
  reasoningTokens: number
  /* 请求体 JSON（已截断） */
  request: string
  /* 响应体 JSON（已截断） */
  response: string
  /* 工具调用明细 */
  toolCalls: ToolCallTraceDTO[]
  /* 错误信息 */
  error: string
}

/* 落库后的 trace（含主键与时间） */
export interface LlmTraceDTO extends LlmTraceInput {
  /* 主键 */
  id: number
  /* 会话主键 */
  sessionId: number
  /* 写入时间 */
  addTime: string
}
