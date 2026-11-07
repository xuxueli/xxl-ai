/*
 * 对话流式状态机：按会话维护增量缓冲、流式目标与切走后的消息缓存。
 *   - 支持多会话并发生成，切回会话时还原内存中的执行过程；
 *   - 仅依赖消息 ref 与 streamingIds，不感知会话 CRUD 与界面。
 * @author xuxueli 2026-10-25
 */

import type { Ref } from 'vue'
import { t } from '@renderer/shell/i18n'
import type { ChatEvent } from '@modules/chat/shared'
import type { ToolCallState, UiMessage } from '@modules/chat/renderer/types'
import { appendPart, refreshContent, uid } from '@modules/chat/renderer/store/messageMapping'

/* 流式状态机依赖的响应式上下文 */
export interface ChatStreamContext {
  /* 当前展示的会话 id */
  currentId: Ref<number>
  /* 当前展示的消息列表 */
  messages: Ref<UiMessage[]>
  /* 正在生成的会话集合 */
  streamingIds: Ref<Record<number, boolean>>
}

/* 单会话增量缓冲 */
interface StreamBuffer {
  delta: string
  thinking: string
  timer: ReturnType<typeof setTimeout> | null
}

/* 增量刷新节流间隔（毫秒），避免逐 token 触发重渲染 */
const FLUSH_INTERVAL = 80

/* 创建对话流式状态机 */
export function createChatStream(context: ChatStreamContext) {
  /* 各会话的当前流式目标（sessionId → 本地助手消息 id） */
  const streamTargets = new Map<number, number>()
  /* 各会话的增量缓冲与节流定时器 */
  const streamBuffers = new Map<number, StreamBuffer>()
  /* 各会话生成中的消息数组缓存：切走后仍持续累积，切回即还原 */
  const liveMessages = new Map<number, UiMessage[]>()

  /* 取（或创建）某会话的增量缓冲 */
  function bufferOf(sessionId: number): StreamBuffer {
    let buffer = streamBuffers.get(sessionId)
    if (!buffer) {
      buffer = { delta: '', thinking: '', timer: null }
      streamBuffers.set(sessionId, buffer)
    }
    return buffer
  }

  /* 取某会话当前的消息数组：展示中的用 messages，后台生成中的用其缓存 */
  function sessionMessages(sessionId: number): UiMessage[] | undefined {
    if (context.currentId.value === sessionId) {
      return context.messages.value
    }
    return liveMessages.get(sessionId)
  }

  /* 定位某会话正在流式的助手消息（响应式代理） */
  function streamAssistant(sessionId: number): UiMessage | undefined {
    const id = streamTargets.get(sessionId)
    if (!id) {
      return undefined
    }
    return sessionMessages(sessionId)?.find((item) => item.id === id)
  }

  /* 刷新某会话缓冲的增量：写入该会话消息数组（后台会话亦累积，供切回还原） */
  function flushBuffers(sessionId: number): void {
    const buffer = streamBuffers.get(sessionId)
    if (!buffer) {
      return
    }
    if (buffer.timer !== null) {
      clearTimeout(buffer.timer)
      buffer.timer = null
    }
    const assistant = streamAssistant(sessionId)
    if (assistant) {
      /* 思考先于正文写入，维持片段发生顺序 */
      if (buffer.thinking) {
        appendPart(assistant, { type: 'thinking', text: buffer.thinking })
      }
      if (buffer.delta) {
        appendPart(assistant, { type: 'text', text: buffer.delta })
      }
      refreshContent(assistant)
    }
    buffer.delta = ''
    buffer.thinking = ''
  }

  /* 调度某会话的节流刷新 */
  function scheduleFlush(sessionId: number): void {
    const buffer = bufferOf(sessionId)
    if (buffer.timer !== null) {
      return
    }
    buffer.timer = setTimeout(() => flushBuffers(sessionId), FLUSH_INTERVAL)
  }

  /* 开始一轮生成：登记目标消息并重置缓冲 */
  function beginRound(sessionId: number, assistantId: number): void {
    streamTargets.set(sessionId, assistantId)
    const buffer = bufferOf(sessionId)
    buffer.delta = ''
    buffer.thinking = ''
    liveMessages.set(sessionId, context.messages.value)
  }

  /*
   * 结束一轮生成：落定缓冲并清理会话缓存。
   * 返回本轮是否仍为该会话的当前流（避免被同一会话的新一轮取代）。
   */
  function completeRound(sessionId: number, assistantId: number): boolean {
    if (streamTargets.get(sessionId) !== assistantId) {
      return false
    }
    flushBuffers(sessionId)
    streamTargets.delete(sessionId)
    streamBuffers.delete(sessionId)
    liveMessages.delete(sessionId)
    return true
  }

  /* 丢弃会话的全部流式缓存（删除会话时调用） */
  function discard(sessionId: number): void {
    /* 先停掉节流定时器，避免删除后仍有回调写回 */
    const buffer = streamBuffers.get(sessionId)
    if (buffer && buffer.timer !== null) {
      clearTimeout(buffer.timer)
    }
    liveMessages.delete(sessionId)
    streamTargets.delete(sessionId)
    streamBuffers.delete(sessionId)
  }

  /* 读取生成中的消息缓存（切回会话时优先还原） */
  function liveMessagesOf(sessionId: number): UiMessage[] | undefined {
    return liveMessages.get(sessionId)
  }

  /* 记录生成中的消息缓存（如应用重启后补占位助手消息） */
  function setLiveMessages(sessionId: number, list: UiMessage[]): void {
    liveMessages.set(sessionId, list)
  }

  /* 当前流式目标消息 id（生成中但无内存缓存时用于补占位） */
  function targetIdOf(sessionId: number): number | undefined {
    return streamTargets.get(sessionId)
  }

  /* 当前流式助手消息（读取/更新 pending 状态） */
  function assistantOf(sessionId: number): UiMessage | undefined {
    return streamAssistant(sessionId)
  }

  /* 处理主进程推送的对话事件（按会话路由，多会话并发生成互不干扰） */
  function handleEvent(event: ChatEvent): void {
    const sessionId = event.sessionId
    switch (event.type) {
      case 'delta':
      case 'thinking': {
        /* 缓冲增量，节流刷新（不触发逐 token 重渲染） */
        const buffer = bufferOf(sessionId)
        if (event.type === 'delta') {
          buffer.delta += event.text ?? ''
        } else {
          buffer.thinking += event.text ?? ''
        }
        scheduleFlush(sessionId)
        break
      }
      case 'tool_start': {
        /* 先落定已缓冲的思考/正文，保证工具片段追加在正确位置 */
        flushBuffers(sessionId)
        const assistant = streamAssistant(sessionId)
        if (assistant) {
          const tool: ToolCallState = {
            id: event.toolCallId ?? uid(),
            name: event.toolName ?? 'tool',
            status: 'running',
            args: event.args,
            startedAt: Date.now()
          }
          assistant.parts.push({ type: 'tool', tool })
        }
        break
      }
      case 'tool_end': {
        const assistant = streamAssistant(sessionId)
        const part = assistant?.parts.find(
          (item) => item.type === 'tool' && item.tool.id === event.toolCallId
        )
        if (part && part.type === 'tool') {
          part.tool.status = event.isError ? 'error' : 'done'
          part.tool.result = event.result ?? part.tool.result
          part.tool.details = event.details ?? part.tool.details
          part.tool.durationMs = event.durationMs ?? part.tool.durationMs
          part.tool.endedAt = Date.now()
        }
        break
      }
      case 'usage': {
        /* 最近一次模型响应结束：更新当前会话的上下文占用 */
        const used = Number(event.used) || 0
        const assistant = streamAssistant(sessionId)
        if (assistant && used > 0) {
          assistant.contextTokens = used
          assistant.contextWindow = Number(event.window) || undefined
        }
        break
      }
      case 'notice': {
        /* 非致命异常：写入异常备注并标记该段为 error，本轮继续执行 */
        flushBuffers(sessionId)
        const assistant = streamAssistant(sessionId)
        const note = event.message ?? ''
        if (assistant && note) {
          appendPart(assistant, {
            type: 'text',
            text: note,
            error: true
          })
          refreshContent(assistant)
        }
        break
      }
      case 'error': {
        flushBuffers(sessionId)
        const assistant = streamAssistant(sessionId)
        /* 保留已生成的部分内容，并在其后追加可读错误提示（与落库内容保持一致） */
        if (assistant && !assistant.error) {
          const tip = event.message ?? t('chat.requestFailed')
          appendPart(assistant, { type: 'text', text: assistant.content ? `\n\n${tip}` : tip })
          refreshContent(assistant)
        }
        if (assistant) {
          assistant.error = true
          assistant.pending = false
          assistant.endedAt = Date.now()
        }
        delete context.streamingIds.value[sessionId]
        break
      }
      case 'done': {
        flushBuffers(sessionId)
        const assistant = streamAssistant(sessionId)
        if (assistant) {
          assistant.pending = false
          assistant.endedAt = Date.now()
        }
        delete context.streamingIds.value[sessionId]
        break
      }
      default:
        break
    }
  }

  return {
    handleEvent,
    beginRound,
    completeRound,
    discard,
    flush: flushBuffers,
    liveMessagesOf,
    setLiveMessages,
    targetIdOf,
    assistantOf
  }
}
