/*
 * 模型通讯 trace 采集：按会话收集每次模型请求的入参、响应与工具调用，回传主进程落库。
 *   - 仅在开发者模式开启时由 worker 调用 beginTraceRun，其余场景所有函数快速返回；
 *   - 一次模型请求一条记录，同一 run 内 step 递增，工具结果按 toolCallId 归属。
 *
 * @author xuxueli 2026-11-01
 */

import { messageStatusOf } from '@modules/chat/shared'
import { TRACE_REQUEST_MAX_CHARS, TRACE_RESPONSE_MAX_CHARS, TRACE_TOOL_RESULT_MAX_CHARS } from '@modules/diagnostics/shared'
import type { LlmTraceInput, ToolCallTraceDTO } from '@modules/diagnostics/shared'

/* 回传通道：由 worker 入口注入（parentPort.postMessage） */
export type TraceSink = (sessionId: number, trace: LlmTraceInput) => void

/* 采集目标：会话 + 来源，贯穿一轮采集的所有回调 */
export interface TraceTarget {
  /* 归属会话 */
  sessionId: number
  /* 对话 / 记忆生成 / 会话摘要 */
  phase: 'chat' | 'memory' | 'summary'
}

/* 运行时消息最小结构（只取 trace 需要的字段） */
interface TraceMessage {
  role?: string
  content?: unknown
  usage?: { input?: number; output?: number; reasoning?: number }
  stopReason?: string
  errorMessage?: string
}

/* 采集中的工具调用 */
interface PendingToolCall extends ToolCallTraceDTO {
  /* 工具开始时间（毫秒时间戳） */
  startedAt: number
}

/* 采集中的一次模型调用 */
interface PendingTrace {
  step: number
  providerId: number
  modelId: string
  startedAt: number
  /* 响应结束时间（未拿到响应为 0） */
  endedAt: number
  httpStatus: number
  request: string
  response: string
  status: LlmTraceInput['status']
  error: string
  inputTokens: number
  outputTokens: number
  reasoningTokens: number
  toolCalls: Map<string, PendingToolCall>
}

/* 单轮对话的采集状态 */
interface TraceRun {
  runId: string
  phase: 'chat' | 'memory' | 'summary'
  step: number
  current: PendingTrace | null
}

/* 采集器状态：按「会话 + 来源」隔离，避免记忆生成与对话并发时互相覆盖 */
const runs = new Map<string, TraceRun>()
let sink: TraceSink | null = null

/* 采集键：同一会话的对话与记忆生成各自独立 */
function runKey(target: TraceTarget): string {
  return `${target.sessionId}\u0000${target.phase}`
}

/* 创建采集目标（phase 默认对话） */
export function createTraceTarget(
  sessionId: number,
  phase: 'chat' | 'memory' | 'summary' = 'chat'
): TraceTarget {
  return { sessionId, phase }
}

/* 注入回传通道（worker 入口调用） */
export function setTraceSink(next: TraceSink | null): void {
  sink = next
}

/* 字符串截断：超长追加截断标记 */
function clip(text: string, limit: number): string {
  return text.length > limit ? `${text.slice(0, limit)}…(truncated)` : text
}

/* 安全序列化：循环引用等异常时退化为字符串 */
function serialize(value: unknown): string {
  try {
    return JSON.stringify(value) ?? 'null'
  } catch {
    return String(value)
  }
}

/* 落库结果：错误信息与是否用户中止 */
interface TraceOutcome {
  error?: string
  aborted?: boolean
}

/* 落库一条记录；无 sink 时静默丢弃 */
function flushTrace(
  target: TraceTarget,
  run: TraceRun,
  trace: PendingTrace,
  outcome: TraceOutcome = {}
): void {
  if (!sink) {
    return
  }
  const { error = '', aborted = false } = outcome
  /* 未拿到响应视为异常（请求失败 / 重试 / 中止），避免展示成空成功记录 */
  const hasResponse = trace.response.length > 0
  const status: LlmTraceInput['status'] = aborted
    ? 'aborted'
    : !hasResponse
      ? 'error'
      : trace.status
  sink(target.sessionId, {
    runId: run.runId,
    step: trace.step,
    providerId: trace.providerId,
    modelId: trace.modelId,
    phase: run.phase,
    status,
    httpStatus: trace.httpStatus,
    durationMs: (trace.endedAt || Date.now()) - trace.startedAt,
    inputTokens: trace.inputTokens,
    outputTokens: trace.outputTokens,
    reasoningTokens: trace.reasoningTokens,
    request: trace.request,
    response: trace.response,
    toolCalls: Array.from(trace.toolCalls.values()).map(
      ({ startedAt: _startedAt, ...item }) => item
    ),
    error: error || trace.error
  })
}

/* 开始一轮采集：traceEnabled 为真时才调用 */
export function beginTraceRun(target: TraceTarget, runId: string): void {
  const key = runKey(target)
  /* 同来源上一轮异常未收尾时先丢弃，避免状态串轮 */
  runs.delete(key)
  runs.set(key, { runId, phase: target.phase, step: 0, current: null })
}

/* 采集钩子：供 Pi Agent / completeSimple 复用，避免各调用点重复拼装 */
export interface TraceHooks {
  onPayload: (payload: unknown, model: { provider?: string; id?: string }) => undefined
  onResponse: (response: { status: number }) => void
}

/* 创建采集钩子：模型信息缺失时回落到调用方传入的供应商 / 模型 */
export function createTraceHooks(
  target: TraceTarget,
  fallbackProviderId: number,
  fallbackModelId: string
): TraceHooks {
  return {
    onPayload: (payload, model): undefined => {
      handleTracePayload(
        target,
        payload,
        Number(model.provider) || fallbackProviderId,
        model.id ?? fallbackModelId
      )
      return undefined
    },
    onResponse: (response): void => {
      handleTraceResponse(target, response.status)
    }
  }
}

/* 请求发送前：收尾上一调用，开启新调用（onPayload） */
export function handleTracePayload(
  target: TraceTarget,
  payload: unknown,
  providerId: number,
  modelId: string
): void {
  const run = runs.get(runKey(target))
  if (!run) {
    return
  }
  /* 上一次调用已拿到响应：工具执行完毕后再发新请求，此时可以安全落库 */
  if (run.current) {
    flushTrace(target, run, run.current)
  }
  run.step += 1
  run.current = {
    step: run.step,
    providerId,
    modelId,
    startedAt: Date.now(),
    endedAt: 0,
    httpStatus: 0,
    request: clip(serialize(payload), TRACE_REQUEST_MAX_CHARS),
    response: '',
    status: 'success',
    error: '',
    inputTokens: 0,
    outputTokens: 0,
    reasoningTokens: 0,
    toolCalls: new Map()
  }
}

/* HTTP 响应到达：记录状态码（onResponse） */
export function handleTraceResponse(target: TraceTarget, status: number): void {
  const current = runs.get(runKey(target))?.current
  if (current) {
    current.httpStatus = Number(status) || 0
  }
}

/* 助手消息结束：回填响应体与用量 */
export function handleTraceMessageEnd(target: TraceTarget, message: unknown): void {
  const current = runs.get(runKey(target))?.current
  if (!current) {
    return
  }
  const item = message as TraceMessage
  if (item.role && item.role !== 'assistant') {
    return
  }
  current.response = clip(serialize(item), TRACE_RESPONSE_MAX_CHARS)
  current.endedAt = Date.now()
  current.inputTokens = Number(item.usage?.input) || 0
  current.outputTokens = Number(item.usage?.output) || 0
  current.reasoningTokens = Number(item.usage?.reasoning) || 0
  /* 状态与消息落库共用同一套归一规则，避免响应体截断后无法判断 */
  const status = messageStatusOf(item)
  current.status =
    status === 'aborted' ? 'aborted' : status === 'error' || status === 'truncated' ? 'error' : 'success'
  current.error = item.errorMessage ?? ''
}

/* 工具开始：登记到当前调用 */
export function handleTraceToolStart(
  target: TraceTarget,
  toolCallId: string,
  toolName: string,
  args: unknown
): void {
  const current = runs.get(runKey(target))?.current
  if (!current) {
    return
  }
  current.toolCalls.set(toolCallId, {
    toolCallId,
    toolName,
    args,
    result: '',
    isError: false,
    durationMs: 0,
    startedAt: Date.now()
  })
}

/* 工具结束入参：结果文本、失败标记与耗时 */
export interface TraceToolResult {
  isError: boolean
  text: string
  durationMs?: number
}

/* 工具结束：回填结果与耗时 */
export function handleTraceToolEnd(
  target: TraceTarget,
  toolCallId: string,
  result: TraceToolResult
): void {
  const tool = runs.get(runKey(target))?.current?.toolCalls.get(toolCallId)
  if (!tool) {
    return
  }
  tool.isError = Boolean(result.isError)
  tool.result = clip(String(result.text ?? ''), TRACE_TOOL_RESULT_MAX_CHARS)
  tool.durationMs = Number(result.durationMs) || Date.now() - tool.startedAt
}

/* 结束一轮采集：落库最后一条；带 error 时标记异常 */
export function endTraceRun(target: TraceTarget, error = '', aborted = false): void {
  const key = runKey(target)
  const run = runs.get(key)
  if (!run) {
    return
  }
  if (run.current) {
    flushTrace(target, run, run.current, { error, aborted })
  }
  runs.delete(key)
}

/* 释放采集状态：会话 Evict / 运行时重置时调用，避免状态滞留 */
export function clearTraceRuns(sessionId?: number): void {
  if (!sessionId) {
    runs.clear()
    return
  }
  runs.delete(runKey(createTraceTarget(sessionId, 'chat')))
  runs.delete(runKey(createTraceTarget(sessionId, 'memory')))
  runs.delete(runKey(createTraceTarget(sessionId, 'summary')))
}
