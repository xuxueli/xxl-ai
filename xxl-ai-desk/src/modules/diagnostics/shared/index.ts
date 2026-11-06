/*
 * diagnostics 模块跨进程公共契约出口。
 * @author xuxueli 2026-11-07
 */

export type { DiagnosticsApi } from './api'
export { TRACE_ERROR_MAX_CHARS, TRACE_REQUEST_MAX_CHARS, TRACE_RESPONSE_MAX_CHARS, TRACE_TOOL_CALLS_MAX_CHARS, TRACE_TOOL_RESULT_MAX_CHARS } from './contracts'
export type { DiagnosticsQuery, LlmTraceDTO, LlmTraceInput, ToolCallTraceDTO } from './contracts'
