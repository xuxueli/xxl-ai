/*
 * 会话诊断服务：会话消息分页，模型通讯 trace 的落库、分页与清理。
 *   - 诊断视图只读聚合：会话消息读 desk_message，不复制数据；
 *   - 模型通讯仅开发者模式开启时写入；worker 采集后经 host 回传，本服务是唯一 getDb 出口。
 *
 * @author xuxueli 2026-11-01
 */

import { and, count, desc, eq, inArray, lt } from 'drizzle-orm'
import { getDb } from '@common/main/db'
import { llmTraceTable } from '@modules/diagnostics/main/schema'
import { TRACE_ERROR_MAX_CHARS, TRACE_REQUEST_MAX_CHARS, TRACE_RESPONSE_MAX_CHARS, TRACE_TOOL_CALLS_MAX_CHARS, TRACE_TOOL_RESULT_MAX_CHARS } from '@modules/diagnostics/shared'
import type { DiagnosticsQuery, LlmTraceDTO, LlmTraceInput, ToolCallTraceDTO } from '@modules/diagnostics/shared'
import type { PageResult } from '@common/shared'
import type { StoredMessage } from '@modules/chat/shared'
import { getSettings } from '@modules/settings/main'

/* 保留天数与单会话条数上限：开发者模式长期开启时控制体积 */
const TRACE_RETENTION_DAYS = 7
const TRACE_SESSION_LIMIT = 1000

/* 字符串截断：超长追加截断标记 */
function clip(text: string, limit: number): string {
  return text.length > limit ? `${text.slice(0, limit)}…(truncated)` : text
}

/* 安全序列化：无法序列化时退化为字符串，避免 trace 写入中断 */
function serialize(value: unknown): string {
  try {
    return JSON.stringify(value, null, 0) ?? 'null'
  } catch {
    return String(value)
  }
}

/* 分页参数归一化：页码 ≥1，每页 1-100 */
function normalizePage(query: DiagnosticsQuery): { page: number; pageSize: number; offset: number } {
  const page = Math.max(1, Math.floor(Number(query.page) || 1))
  const pageSize = Math.min(100, Math.max(1, Math.floor(Number(query.pageSize) || 20)))
  return { page, pageSize, offset: (page - 1) * pageSize }
}

/* 通讯状态归一：脏数据按 success 兜底 */
function normalizeStatus(status: string): LlmTraceDTO['status'] {
  return status === 'error' ? 'error' : status === 'aborted' ? 'aborted' : 'success'
}

/* 通讯来源归一：记忆生成 / 会话摘要单独区分，其余按对话处理 */
function normalizePhase(phase: string): LlmTraceDTO['phase'] {
  if (phase === 'memory' || phase === 'summary') {
    return phase
  }
  return 'chat'
}

/* 会话消息分页：消息读取能力由组合根注入，诊断只做分页编排 */
export type MessagePageLoader = (
  sessionId: number,
  limit: number,
  offset: number
) => { items: StoredMessage[]; total: number }

export function listMessagePage(
  query: DiagnosticsQuery,
  loadMessages: MessagePageLoader
): PageResult<StoredMessage> {
  const { page, pageSize, offset } = normalizePage(query)
  const { items, total } = loadMessages(query.sessionId, pageSize, offset)
  return { items, total, page, pageSize }
}

/* 工具调用明细归一化并控制总量 */
function serializeToolCalls(toolCalls: ToolCallTraceDTO[]): string {
  const clipped = (toolCalls ?? []).map((item) => ({
    ...item,
    /* 单个工具结果上限与 worker 采集一致 */
    result: clip(String(item.result ?? ''), TRACE_TOOL_RESULT_MAX_CHARS)
  }))
  return clip(serialize(clipped), TRACE_TOOL_CALLS_MAX_CHARS)
}

/* 行记录 → DTO */
function toTraceDTO(row: typeof llmTraceTable.$inferSelect): LlmTraceDTO {
  let toolCalls: ToolCallTraceDTO[] = []
  try {
    const parsed = JSON.parse(row.toolCalls)
    toolCalls = Array.isArray(parsed) ? (parsed as ToolCallTraceDTO[]) : []
  } catch {
    toolCalls = []
  }
  return {
    id: row.id,
    sessionId: row.sessionId,
    runId: row.runId,
    step: row.step,
    providerId: row.providerId,
    modelId: row.modelId,
    phase: normalizePhase(row.phase),
    status: normalizeStatus(row.status),
    httpStatus: row.httpStatus,
    durationMs: row.durationMs,
    inputTokens: row.inputTokens,
    outputTokens: row.outputTokens,
    reasoningTokens: row.reasoningTokens,
    request: row.request,
    response: row.response,
    toolCalls,
    error: row.error,
    addTime: row.addTime
  }
}

/* 写入一条模型通讯记录：开发者模式关闭时直接丢弃 */
export function recordTrace(sessionId: number, trace: LlmTraceInput): void {
  if (!sessionId) {
    return
  }
  if (!getSettings().developerMode) {
    return
  }
  const db = getDb()
  db.insert(llmTraceTable)
    .values({
      sessionId,
      runId: trace.runId ?? '',
      step: Number(trace.step) || 0,
      providerId: trace.providerId || 0,
      modelId: trace.modelId ?? '',
      phase: normalizePhase(trace.phase),
      status: normalizeStatus(trace.status),
      httpStatus: Number(trace.httpStatus) || 0,
      durationMs: Number(trace.durationMs) || 0,
      inputTokens: Number(trace.inputTokens) || 0,
      outputTokens: Number(trace.outputTokens) || 0,
      reasoningTokens: Number(trace.reasoningTokens) || 0,
      request: clip(trace.request ?? '', TRACE_REQUEST_MAX_CHARS),
      response: clip(trace.response ?? '', TRACE_RESPONSE_MAX_CHARS),
      toolCalls: serializeToolCalls(trace.toolCalls ?? []),
      error: clip(trace.error ?? '', TRACE_ERROR_MAX_CHARS),
      addTime: new Date().toISOString()
    })
    .run()
  enforceSessionLimit(sessionId)
}

/* 单会话超出上限时删除最旧记录 */
function enforceSessionLimit(sessionId: number): void {
  const db = getDb()
  if (!sessionId) {
    return
  }
  const staleIds = db
    .select({ id: llmTraceTable.id })
    .from(llmTraceTable)
    .where(eq(llmTraceTable.sessionId, sessionId))
    .orderBy(desc(llmTraceTable.addTime), desc(llmTraceTable.step))
    .limit(TRACE_SESSION_LIMIT)
    .offset(TRACE_SESSION_LIMIT)
    .all()
  if (staleIds.length === 0) {
    return
  }
  db.delete(llmTraceTable)
    .where(
      and(
        eq(llmTraceTable.sessionId, sessionId),
        inArray(
          llmTraceTable.id,
          staleIds.map((row) => row.id)
        )
      )
    )
    .run()
}

/* 清理过期记录：应用启动时调用一次 */
export function purgeExpiredTraces(): void {
  const cutoff = new Date(Date.now() - TRACE_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString()
  getDb().delete(llmTraceTable).where(lt(llmTraceTable.addTime, cutoff)).run()
}

/* 模型通讯分页：按写入时间倒序，同一轮内按 step 倒序 */
export function listTraces(query: DiagnosticsQuery): PageResult<LlmTraceDTO> {
  const { page, pageSize, offset } = normalizePage(query)
  const condition = eq(llmTraceTable.sessionId, query.sessionId)
  const db = getDb()
  const total = db
    .select({ value: count() })
    .from(llmTraceTable)
    .where(condition)
    .get()?.value ?? 0
  const items = db
    .select()
    .from(llmTraceTable)
    .where(condition)
    .orderBy(desc(llmTraceTable.addTime), desc(llmTraceTable.step))
    .limit(pageSize)
    .offset(offset)
    .all()
    .map(toTraceDTO)
  return { items, total, page, pageSize }
}

/* 清空指定会话的通讯记录 */
export function clearTraces(sessionId: number): void {
  if (!sessionId) {
    return
  }
  getDb().delete(llmTraceTable).where(eq(llmTraceTable.sessionId, sessionId)).run()
}
