/*
 * 会话压缩服务：一轮对话结束后检查上下文用量 / 轮次，满足条件时异步生成定长摘要。
 *   - 摘要与消费解耦：对话只读取摘要，压缩在后台完成，失败保留旧摘要；
 *   - 摘要内容包括旧摘要与此前增量，下次装配时传递“摘要 + 上次摘要后的全部增量”。
 * @author xuxueli 2026-11-08
 */

import log from 'electron-log/main'
import { t } from '@common/main/i18n'
import { SESSION_SUMMARY_MAX_CHARS } from '@modules/chat/shared'
import type { StoredMessage } from '@modules/chat/shared'
import { isRuntimeSource } from '@modules/chat/shared'
import { getSettings } from '@modules/settings/main'
import { evictAgent, generateSessionSummary, resolveAgentTarget, toRuntimeConfig } from '@modules/agent/main'
import { countTurnsAfter, getSession, getSessionSummary, listMessagesAfter, saveSessionSummary } from './sessionService'

/* 上下文使用率触发阈值：达到 80% 即主动压缩 */
const SUMMARY_CONTEXT_RATIO = 0.8

/* 轮次触发阈值：距上次摘要后真实用户轮次达到 20 即主动压缩 */
const SUMMARY_TURN_LIMIT = 20

/* 压缩入参最大转录长度（字符）：超长从最旧内容截断，控制压缩请求成本 */
const TRANSCRIPT_MAX_CHARS = 60_000

/* 生成中的会话：同一会话同时只跑一个摘要任务 */
const compressingSessions = new Set<number>()

/* 本轮上下文用量（每次模型响应结束后由 worker 回传） */
export interface SessionCompressionContext {
  /* 会话主键 */
  sessionId: number
  /* 本轮最后一次模型响应的上下文用量；缺失表示未收到 usage 事件 */
  usage: { used: number; window: number } | null
}

/* 提取消息正文：只取 text 块，排除 thinking 与工具调用 / 工具结果 */
function extractMessageText(row: StoredMessage): string {
  if (!row.data) {
    return row.content.trim()
  }
  try {
    const content = (JSON.parse(row.data) as { content?: unknown }).content
    if (!Array.isArray(content)) {
      return row.content.trim()
    }
    return content
      .map((part) => {
        const block = part as { type?: string; text?: string }
        return block.type === 'text' ? (block.text ?? '') : ''
      })
      .join('')
      .trim()
  } catch {
    /* 解析失败退回归一化正文，保证压缩不中断 */
    return row.content.trim()
  }
}

/* 拼接增量转录：只保留真实用户 / 助手正文，注入消息与工具结果不参与 */
function buildTranscript(messages: StoredMessage[]): string {
  const text = messages
    .filter(
      (row) =>
        (row.role === 'user' || row.role === 'assistant') && !isRuntimeSource(row.source)
    )
    .map((row) => ({ role: row.role, text: extractMessageText(row) }))
    .filter((row) => row.text)
    .map((row) => `${row.role}: ${row.text}`)
    .join('\n\n')
  return text.length > TRANSCRIPT_MAX_CHARS ? text.slice(-TRANSCRIPT_MAX_CHARS) : text
}

/* 是否满足压缩条件：无摘要、上下文使用率 ≥ 80%、摘要后轮次 ≥ 20 */
function shouldCompress(
  summary: string,
  turns: number,
  usage: SessionCompressionContext['usage']
): boolean {
  if (!summary.trim()) {
    return true
  }
  if (turns >= SUMMARY_TURN_LIMIT) {
    return true
  }
  if (!usage || usage.window <= 0) {
    return false
  }
  return usage.used / usage.window >= SUMMARY_CONTEXT_RATIO
}

/*
 * 一轮对话结束后调用：满足条件时异步压缩摘要。
 *   - 先按游标加载增量，生成成功后把游标推进到本次覆盖的最后一条消息；
 *   - 生成期间会话被删除则丢弃结果；失败保留旧摘要，下一轮继续尝试。
 */
export async function maybeCompressSession(context: SessionCompressionContext): Promise<void> {
  const { sessionId } = context
  if (!sessionId || compressingSessions.has(sessionId)) {
    return
  }
  const current = getSessionSummary(sessionId)
  const messages = listMessagesAfter(sessionId, current.lastMessageId)
  if (messages.length === 0) {
    return
  }
  const turns = countTurnsAfter(sessionId, current.lastMessageId)
  if (!shouldCompress(current.summary, turns, context.usage)) {
    return
  }
  const transcript = buildTranscript(messages)
  if (!transcript) {
    return
  }
  const session = getSession(sessionId)
  if (!session) {
    return
  }
  const settings = getSettings()
  const target = resolveAgentTarget(session, settings)
  if (!target) {
    log.warn(`[session-summary] 跳过压缩：会话 ${sessionId} 未找到可用模型`)
    return
  }
  const lastMessageId = messages[messages.length - 1].id
  compressingSessions.add(sessionId)
  try {
    const content = await generateSessionSummary({
      provider: toRuntimeConfig(target.provider),
      modelId: target.modelId,
      language: settings.language,
      oldSummary: current.summary,
      transcript,
      sessionId,
      traceEnabled: settings.developerMode
    })
    const saved = content.trim().slice(0, SESSION_SUMMARY_MAX_CHARS)
    if (!saved) {
      throw new Error(t('runtime.error.summaryGenerateFailed'))
    }
    /* 生成期间会话被删除：丢弃结果，避免孤儿摘要 */
    if (!getSession(sessionId)) {
      return
    }
    saveSessionSummary(sessionId, saved, lastMessageId)
    /* 系统提示词在创建 Agent 时固化：摘要需清理会话运行时，下一轮重新装配 */
    evictAgent(sessionId)
    log.info(`[session-summary] 会话 ${sessionId} 摘要已更新（${turns} 轮增量）`)
  } catch (error) {
    /* 失败隔离：保留旧摘要与游标，下一轮继续尝试 */
    log.warn(`[session-summary] 压缩失败 session=${sessionId}`, error)
  } finally {
    compressingSessions.delete(sessionId)
  }
}
