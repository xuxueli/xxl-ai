/*
 * 对话历史窗口：限制送给模型的上下文规模，并剔除历史思考内容。
 *   - 最多保留最近 HISTORY_MAX_MESSAGES 条消息；
 *   - 起始位置向前对齐到真实用户消息，避免从半轮开始；
 *   - 总字符超过 HISTORY_MAX_CHARS 时从最旧内容继续丢弃（有摘要时保留全部增量）；
 *   - thinking 不回传（仅正文 / 工具调用 / 工具结果进入上下文）。
 * @author xuxueli 2026-10-26
 */

import { translate } from '@common/shared/i18n'
import { isRuntimeSource } from './messageSource'
import type { MessageSource } from './messageSource'
import { messageStatusOf } from './messageStatus'

/* 历史窗口：最多保留的最近消息条数 */
export const HISTORY_MAX_MESSAGES = 50

/* 历史窗口：总字符上限（超过后从最旧轮次继续丢弃） */
export const HISTORY_MAX_CHARS = 120_000

/* 历史条目：消息本体 + 运行时注入来源（注入消息不算真实用户轮次） */
export interface HistoryEntry {
  message: HistoryMessage | null
  source: MessageSource | null
}

/* 运行期消息最小结构 */
interface HistoryMessage {
  role?: string
  content?: unknown
  stopReason?: string
  errorMessage?: string
}

/* 消息内容块 */
export function contentBlocks(message: { content?: unknown }): unknown[] {
  return Array.isArray(message.content) ? message.content : []
}

/* 是否为真实用户轮次（注入消息不算新一轮） */
function isTurnStart(entry: HistoryEntry): boolean {
  return entry.message?.role === 'user' && !isRuntimeSource(entry.source)
}

/*
 * 去掉 assistant 的思考块：
 *   - 有正文/工具调用：只剔除 thinking；
 *   - 只有 thinking：不静默丢弃，转为 error + 正文异常说明。
 */
function stripThinking(message: HistoryMessage, language: string): HistoryMessage | null {
  if (message.role !== 'assistant') {
    return message
  }
  const blocks = contentBlocks(message)
  if (blocks.length === 0) {
    return message
  }
  const kept = blocks.filter((block) => (block as { type?: string })?.type !== 'thinking')
  if (kept.length === 0) {
    /* 用户主动终止：写入终止备注，继续进入模型上下文 */
    if (messageStatusOf(message) === 'aborted') {
      return {
        ...message,
        errorMessage: translate(language, 'runtime.abortNote'),
        content: [{ type: 'text', text: translate(language, 'runtime.abortNote'), error: true }]
      }
    }
    return {
      ...message,
      stopReason: 'error',
      errorMessage: translate(language, 'runtime.thinkingOnlyNote'),
      content: [{ type: 'text', text: translate(language, 'runtime.thinkingOnlyNote'), error: true }]
    }
  }
  return kept.length === blocks.length ? message : { ...message, content: kept }
}

/* 按消息条数与字符上限裁剪历史；keepAll=true 时跳过窗口限制（摘要后的全部增量） */
export function trimHistory(input: HistoryEntry[], language: string, keepAll: boolean): unknown[] {
  const cleaned = input
    .map((entry) => ({
      message: stripThinking(entry.message as HistoryMessage, language),
      source: entry.source
    }))
    .filter((entry): entry is HistoryEntry & { message: HistoryMessage } => entry.message !== null)

  /* 最近 50 条；若起点在半轮中间，向后对齐到真实用户消息 */
  let result = keepAll ? cleaned : cleaned.slice(-HISTORY_MAX_MESSAGES)
  const start = result.findIndex(isTurnStart)
  if (start > 0) {
    result = result.slice(start)
  }

  /* 字符超限：继续从最旧轮次丢弃；有摘要时增量必须全部保留，不做字符裁剪 */
  if (!keepAll) {
    while (
      result.length > 1 &&
      JSON.stringify(result.map((entry) => entry.message)).length > HISTORY_MAX_CHARS
    ) {
      const nextTurn = result.findIndex((entry, index) => index > 0 && isTurnStart(entry))
      result = result.slice(nextTurn > 0 ? nextTurn : 1)
    }
  }
  return result.map((entry) => entry.message)
}
