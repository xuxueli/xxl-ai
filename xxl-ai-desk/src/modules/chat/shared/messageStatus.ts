/*
 * 消息状态归一：把 Pi 原始消息的 stopReason / errorMessage / 可见片段统一映射为业务状态。
 * @author xuxueli 2026-11-08
 */

/* 消息状态：成功 / 中止 / 失败 / 截断 */
export type MessageStatus = 'success' | 'aborted' | 'error' | 'truncated'

/* 状态归一入参：只取判断需要的字段 */
export interface MessageStatusSource {
  role?: string
  stopReason?: string
  errorMessage?: string
  content?: unknown
}

/* 落库状态归一：未知值按空串处理，避免脏数据被当成成功 */
export function normalizeMessageStatus(value: string): MessageStatus | '' {
  return value === 'success' || value === 'aborted' || value === 'error' || value === 'truncated'
    ? value
    : ''
}

/* 是否存在可见片段：正文与工具调用算可见，纯思考或空内容不算 */
export function hasVisiblePart(content: unknown): boolean {
  return (
    Array.isArray(content) &&
    content.some((part) => {
      const type = (part as { type?: string } | null)?.type
      return type === 'text' || type === 'toolCall'
    })
  )
}

/* 消息状态：非助手返回空串；中止优先，其次失败 / 截断，其余按成功 */
export function messageStatusOf(message: MessageStatusSource): MessageStatus | '' {
  if (message.role !== 'assistant') {
    return ''
  }
  if (message.stopReason === 'aborted') {
    return 'aborted'
  }
  if (message.stopReason === 'error' || message.errorMessage) {
    return 'error'
  }
  if (message.stopReason === 'length') {
    return 'truncated'
  }
  return hasVisiblePart(message.content) ? 'success' : 'error'
}
