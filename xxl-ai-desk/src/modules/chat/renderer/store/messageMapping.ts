/*
 * 对话消息映射：持久化原始消息 → UI 消息（纯函数，无 Vue / Pinia 依赖）。
 *   - 按「轮次」折叠助手片段，保留 思考 → 工具 → 正文 的发生顺序；
 *   - toolResult 按 toolCallId 回填工具状态与结果；
 * @author xuxueli 2026-10-25
 */

import { t } from '@renderer/shell/i18n'
import { contextTokensOfUsage } from '@common/shared/model'
import type { UsageLike } from '@common/shared/model'
import type { MessagePart, ToolCallState, UiMessage } from '@modules/chat/renderer/types'
import { hasVisiblePart, isRuntimeSource } from '@modules/chat/shared'
import type { StoredMessage } from '@modules/chat/shared'

/* 持久化的 Pi 原始消息结构（仅取渲染所需字段） */
export interface RawPart {
  type?: string
  text?: string
  thinking?: string
  redacted?: boolean
  id?: string
  name?: string
  arguments?: unknown
  /* 异常备注片段（本地渲染用，Pi 忽略该字段） */
  error?: boolean
}

export interface RawMessage {
  role?: string
  content?: RawPart[]
  stopReason?: string
  errorMessage?: string
  toolCallId?: string
  isError?: boolean
  /* 模型用量：持久化的 Pi 原始消息已带，用于恢复上下文占用展示 */
  usage?: UsageLike
  /* 工具结果的结构化细节与耗时（Pi 持久化在 toolResult 消息上） */
  details?: unknown
  durationMs?: number
}

/* 生成工具调用兜底 id（字符串） */
export function uid(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

/* 生成流式期间本地消息 id（负数，避免与数据库自增正数冲突） */
let localMessageSeq = 0
export function nextLocalMessageId(): number {
  localMessageSeq -= 1
  return localMessageSeq
}

/* 累加模型用量：同一轮多次响应的分项合并，供会话 Token 统计 */
function addUsage(current: UsageLike | undefined, next: UsageLike): UsageLike {
  const before = current ?? {}
  return {
    input: (Number(before.input) || 0) + (Number(next.input) || 0),
    output: (Number(before.output) || 0) + (Number(next.output) || 0),
    cacheRead: (Number(before.cacheRead) || 0) + (Number(next.cacheRead) || 0),
    cacheWrite: (Number(before.cacheWrite) || 0) + (Number(next.cacheWrite) || 0),
    totalTokens: (Number(before.totalTokens) || 0) + (Number(next.totalTokens) || 0)
  }
}

/* ISO 时间 → 毫秒时间戳（无效值返回 undefined） */
function toTimestamp(iso: string): number | undefined {
  const value = Date.parse(iso)
  return Number.isFinite(value) ? value : undefined
}

/* 安全解析持久化的原始消息 JSON */
export function parseData(data: string): RawMessage | null {
  try {
    return JSON.parse(data) as RawMessage
  } catch {
    return null
  }
}

/* 标记失败消息的最后一段正文；没有正文时补一条异常说明 */
function markFailedPart(message: UiMessage, startIndex: number): void {
  for (let index = message.parts.length - 1; index >= startIndex; index -= 1) {
    const part = message.parts[index]
    if (part.type === 'text') {
      part.error = true
      return
    }
  }
  appendPart(message, { type: 'text', text: t('runtime.thinkingOnlyNote'), error: true })
}

/* 向助手消息追加片段：同类相邻文本合并，保持片段发生顺序（思考 → 工具 → 正文 交错） */
export function appendPart(message: UiMessage, part: MessagePart): void {
  if (part.type === 'thinking' || part.type === 'text') {
    const last = message.parts[message.parts.length - 1]
    /* 文本片段按 error 边界分段，避免异常备注与正常正文合并 */
    if (last && last.type === part.type) {
      const sameError =
        last.type !== 'text' ||
        part.type !== 'text' ||
        Boolean(last.error) === Boolean(part.error)
      if (sameError) {
        last.text += part.text
        return
      }
    }
  }
  message.parts.push(part)
}

/* 回填助手消息正文：拼接全部正文片段（供复制、列表预览与滚动跟随） */
export function refreshContent(message: UiMessage): void {
  message.content = message.parts
    .filter((part): part is { type: 'text'; text: string } => part.type === 'text')
    .map((part) => part.text)
    .join('\n\n')
}

/* 原始文本内容块 → 纯文本（工具结果展示用） */
function contentToPlain(raw: RawMessage | null): string {
  const content = raw?.content
  if (!Array.isArray(content)) {
    return ''
  }
  return content
    .filter((part) => part.type === 'text')
    .map((part) => part.text ?? '')
    .join('\n')
}

/*
 * 持久化消息集合 → UI 消息（按「轮次」折叠，并保留片段发生顺序）。
 *   - 一轮对话中 Agent 会分多次产出 assistant 片段（工具调用轮），并伴随 toolResult；
 *   - 折叠为「一条用户消息 + 一条助手消息」，助手消息内部按顺序记录 思考/正文/工具 片段，
 *     据此还原完整的执行过程，而非把思考、工具堆在一起。
 */
export function mapStoredMessages(stored: StoredMessage[]): UiMessage[] {
  const result: UiMessage[] = []
  /* toolCallId → 工具片段引用，供后续 toolResult 回填状态与结果 */
  const toolParts = new Map<string, ToolCallState>()
  /* 当前轮次标识：消息行 turnId，助手片段据此归组 */
  let currentTurnId = 0
  /* 各轮次开始时间：取真实用户提问消息的落库时间，重载后仍可展示本轮耗时 */
  const turnStarts = new Map<number, number | undefined>()

  for (const record of stored) {
    const raw = parseData(record.data)
    if (record.role === 'user') {
      /* 运行时注入提示仅驱动模型，不进入界面 */
      if (isRuntimeSource(record.source)) {
        continue
      }
      currentTurnId = record.turnId
      turnStarts.set(record.turnId, toTimestamp(record.addTime))
      result.push({
        id: record.id,
        role: 'user',
        content: record.content,
        parts: [],
        addTime: record.addTime
      })
      continue
    }
    /* 工具结果：回填到对应工具片段 */
    if (record.role === 'toolResult') {
      const tool = raw?.toolCallId ? toolParts.get(raw.toolCallId) : undefined
      if (tool) {
        tool.status = raw?.isError ? 'error' : 'done'
        tool.result = contentToPlain(raw)
        tool.details = raw?.details
        tool.durationMs = typeof raw?.durationMs === 'number' ? raw.durationMs : undefined
      }
      continue
    }
    if (record.role !== 'assistant') continue

    const parts = Array.isArray(raw?.content) ? raw.content : []
    /* 状态由落库时统一生成 */
    const status = record.status
    const aborted = status === 'aborted'
    /* 用户主动终止不是异常；失败、截断、只有 thinking / 空内容才标记 error */
    const failed = !aborted && (status === 'error' || status === 'truncated')

    /* 本轮起止时间：开始取用户提问时间，结束取本轮最后一次助手落库时间 */
    const startedAt = turnStarts.get(record.turnId)
    const endedAt = toTimestamp(record.addTime)
    const turnId = record.turnId

    /* 同一 turnId 的助手片段合并为一条消息 */
    let last = result[result.length - 1]
    if (!last || last.role !== 'assistant' || turnId !== currentTurnId) {
      last = {
        id: record.id,
        role: 'assistant',
        content: '',
        parts: [],
        addTime: record.addTime,
        startedAt,
        endedAt,
        status
      }
      result.push(last)
    } else {
      /* 合并后的展示时间取本轮最后一次响应完成时刻，避免长时间执行仍显示开始时间 */
      last.addTime = record.addTime
      last.startedAt = startedAt
      last.endedAt = endedAt
      last.status = status
    }
    currentTurnId = turnId

    /* 记录本次模型响应的上下文用量，供顶栏展示占用占比 */
    const tokens = contextTokensOfUsage(raw?.usage)
    if (tokens > 0) {
      last.contextTokens = tokens
    }

    /* 累计本轮模型用量、请求耗时与步数：供会话统计 / Token 用量展示 */
    if (raw?.usage) {
      last.usage = addUsage(last.usage, raw.usage)
    }
    /* 仅真实模型响应计步：终止 / 异常备注等合成消息既无用量也无耗时 */
    if (raw?.usage || typeof raw?.durationMs === 'number') {
      last.modelMs = (last.modelMs ?? 0) + (Number(raw?.durationMs) || 0)
      last.steps = (last.steps ?? 0) + 1
    }

    /* 本片段起始下标：用于失败时标记对应的正文段 */
    const partStart = last.parts.length

    /* 按原始顺序还原片段，并累计本片段的结构化正文 */
    let localText = ''
    for (const part of parts) {
      if (part.type === 'thinking' && !part.redacted && part.thinking) {
        appendPart(last, { type: 'thinking', text: part.thinking })
      } else if (part.type === 'text' && part.text) {
        appendPart(last, { type: 'text', text: part.text, error: part.error === true })
        localText += part.text
      } else if (part.type === 'toolCall') {
        const tool: ToolCallState = {
          id: part.id ?? uid(),
          name: part.name ?? 'tool',
          status: 'done',
          args: part.arguments,
          startedAt: 0
        }
        last.parts.push({ type: 'tool', tool })
        toolParts.set(tool.id, tool)
      }
    }

    /* 兜底：落库正文比结构化片段多出的部分（失败轮次追加的可读错误提示）补足展示 */
    if (record.content && record.content !== localText) {
      if (record.content.startsWith(localText)) {
        const rest = record.content.slice(localText.length)
        if (rest) {
          appendPart(last, { type: 'text', text: rest, error: failed })
        }
      } else if (!localText) {
        appendPart(last, { type: 'text', text: record.content, error: failed })
      }
    }

    /* 失败/截断消息：至少给出一段可读的异常说明 */
    if (failed) {
      markFailedPart(last, partStart)
    } else if (aborted && !hasVisiblePart(raw?.content)) {
      /* 用户主动终止：保留思考并写入终止备注，不标记为异常 */
      appendPart(last, { type: 'text', text: t('runtime.abortNote'), error: true })
    }
  }

  /* 剔除空助手消息（理论上已在上面补齐异常说明） */
  return result.filter((message) => message.role !== 'assistant' || message.parts.length > 0)
}
