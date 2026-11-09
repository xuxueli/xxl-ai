/**
 * 对话流式 composable：SSE 事件解析 + 全链路可观测事件分流 + 断线自动续传 + 主动终止
 *
 * 发送/续传均返回可读流 reader，由本模块统一按 SSE 事件白名单解析：
 *  - stream：结果流标识（msgId）
 *  - thinking：思考过程增量
 *  - message：回复正文增量
 *  - reference：RAG 知识库检索引用列表（JSON）
 *  - tool：工具调用实时状态（JSON：RUNNING / SUCCESS / ERROR）
 *  - usage：Token 消耗实时统计（JSON）
 *  - trace：完整全链路追踪快照（JSON，终态下发）
 *  - ping：空闲心跳
 *  - done / error：终态事件
 */
import modal from '@/utils/modal'
import { resumeStream, sendStream } from '../api'
import { t } from '@/i18n'
import type { RagReference, SessionMsgExt, TokenUsage, ToolTraceItem } from '@/modules/business/session/types'

/** 流式增量回调 */
export type ChatStreamHandler = (text: string) => void

/** 全链路可观测与异常扩展回调集 */
export interface ChatStreamCallbacks {
  onStream?: (msgId: number) => void
  onError?: (message: string) => void
  onReference?: (references: RagReference[]) => void
  onTool?: (tool: ToolTraceItem) => void
  onUsage?: (usage: TokenUsage) => void
  onTrace?: (ext: SessionMsgExt, rawJson: string) => void
}

/** 流状态：msgId 由 stream 事件回填，lastEventId 为已处理的结果流条目 */
interface ChatStreamState {
  msgId?: number
  lastEventId?: string
}

export function useChatStream() {
  /** 是否已被用户主动终止（终止后不再自动续传） */
  let stopped = false
  /** 当前流的取消控制器（终止时中断 fetch） */
  let controller: AbortController | null = null

  /**
   * 发送消息并流式接收：打开流 → 解析并自动续传
   */
  async function sendMessage(
    payload: { uuid: string; visitorId: string; sessionId: number; content: string },
    onThinking: ChatStreamHandler,
    onContent: ChatStreamHandler,
    callbacksOrOnError?: ChatStreamCallbacks | ((message: string) => void)
  ) {
    stopped = false
    controller = new AbortController()
    const callbacks = normalizeCallbacks(callbacksOrOnError)
    const reader = await sendStream(payload.uuid, payload.visitorId, payload.sessionId, payload.content, controller.signal)
    if (!reader) {
      throw new Error('empty stream')
    }
    await streamWithResume(reader, {}, onThinking, onContent, callbacks, () => stopped, controller.signal)
  }

  /**
   * 续传生成中的助手消息：从结果流起点重放全部增量（用于刷新页面/切换对话后恢复生成）
   */
  async function resumeMessage(
    msgId: number,
    onThinking: ChatStreamHandler,
    onContent: ChatStreamHandler,
    callbacksOrOnError?: ChatStreamCallbacks | ((message: string) => void)
  ) {
    if (!msgId) return
    stopped = false
    controller = new AbortController()
    const callbacks = normalizeCallbacks(callbacksOrOnError)
    const reader = await resumeStream(msgId, undefined, controller.signal)
    if (!reader) return
    await streamWithResume(reader, { msgId }, onThinking, onContent, callbacks, () => stopped, controller.signal)
  }

  /**
   * 主动终止：标记不再续传并中断当前 fetch（后端终止由调用方经 stopStream 触发）
   */
  function stopMessage() {
    stopped = true
    controller?.abort()
    controller = null
  }

  return { sendMessage, resumeMessage, stopMessage }
}

function normalizeCallbacks(
  callbacksOrOnError?: ChatStreamCallbacks | ((message: string) => void)
): ChatStreamCallbacks {
  if (!callbacksOrOnError) {
    return {}
  }
  if (typeof callbacksOrOnError === 'function') {
    return { onError: callbacksOrOnError }
  }
  return callbacksOrOnError
}

/**
 * 读取流并断线自动续传：正常结束（done/error 终态事件）返回；中断则携 msgId + lastEventId 续传（最多 3 次）
 */
async function streamWithResume(
  reader: ReadableStreamDefaultReader<Uint8Array> | null,
  state: ChatStreamState,
  onThinking: ChatStreamHandler,
  onContent: ChatStreamHandler,
  callbacks: ChatStreamCallbacks,
  isStopped: () => boolean,
  signal: AbortSignal
) {
  let attempts = 0
  while (reader) {
    if (isStopped()) return
    let completed = false
    try {
      completed = await readStream(reader, onThinking, onContent, callbacks, state)
    } catch (e) {
      // 网络中断：进入续传分支
      completed = false
    }
    if (completed || isStopped()) return
    // 未正常结束且已获得 msgId：携带断点续传（最多 3 次）
    if (!state.msgId || attempts >= 3) return
    attempts++
    await new Promise((resolve) => setTimeout(resolve, 500 * attempts))
    if (isStopped()) return
    try {
      const resumed = await resumeStream(state.msgId, state.lastEventId, signal)
      if (!resumed) return
      reader = resumed
    } catch (e) {
      return
    }
  }
}

/**
 * 流式读取：按 SSE 事件白名单解析（stream / thinking / message / reference / tool / usage / trace / ping / done / error）
 */
async function readStream(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  onThinking: ChatStreamHandler,
  onContent: ChatStreamHandler,
  callbacks: ChatStreamCallbacks,
  state: ChatStreamState
): Promise<boolean> {
  const decoder = new TextDecoder('utf-8')
  let buffer = ''
  let eventName = 'message'
  // 当前事件 id（结果流条目，用于断线续传）
  let eventId = ''
  // 待拼装的事件数据（同一事件内的多条 data: 行）
  let dataLines: string[] = []

  /** 派发单个事件：命中终态返回 true，终止读取 */
  const dispatch = (data: string): boolean => {
    const currentEvent = eventName
    eventName = 'message'

    // 终态事件（done/error）：后端专用事件名，不再混入内容通道
    if (currentEvent === 'done') {
      if (eventId) state.lastEventId = eventId
      return true
    }
    if (currentEvent === 'error') {
      if (eventId) state.lastEventId = eventId
      modal.msgError(data || t('business.chat.failed'))
      callbacks.onError?.(data)
      return true
    }
    if (!data) return false
    if (currentEvent === 'stream') {
      state.msgId = Number(data)
      if (state.msgId) {
        callbacks.onStream?.(state.msgId)
      }
      return false
    }
    if (currentEvent === 'ping') return false

    if (currentEvent === 'thinking') {
      onThinking(data)
    } else if (currentEvent === 'message') {
      onContent(data)
    } else if (currentEvent === 'reference') {
      try {
        const refs = JSON.parse(data) as RagReference[]
        if (Array.isArray(refs)) {
          callbacks.onReference?.(refs)
        }
      } catch (e) {
        // 忽略非法 JSON
      }
    } else if (currentEvent === 'tool') {
      try {
        const tool = JSON.parse(data) as ToolTraceItem
        if (tool && tool.callId) {
          callbacks.onTool?.(tool)
        }
      } catch (e) {
        // 忽略非法 JSON
      }
    } else if (currentEvent === 'usage') {
      try {
        const usage = JSON.parse(data) as TokenUsage
        if (usage) {
          callbacks.onUsage?.(usage)
        }
      } catch (e) {
        // 忽略非法 JSON
      }
    } else if (currentEvent === 'trace') {
      try {
        const ext = JSON.parse(data) as SessionMsgExt
        if (ext) {
          callbacks.onTrace?.(ext, data)
        }
      } catch (e) {
        // 忽略非法 JSON
      }
    }

    // 推进结果流断点 ID，续传时从该 id 之后继续
    if (eventId) state.lastEventId = eventId
    return false
  }

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    // 按 SSE 行切分（兼容 \r\n / \r / \n），末尾不完整行留在 buffer 下次拼接
    const lines = buffer.split(/\r\n|\r|\n/)
    buffer = lines.pop() || ''
    for (const line of lines) {
      // 空行为事件结束标志：拼装完整内容后统一派发
      if (line === '') {
        if (dataLines.length > 0 || eventName === 'done' || eventName === 'error') {
          const data = dataLines.join('\n')
          dataLines = []
          if (dispatch(data)) return true
        }
        eventId = ''
        continue
      }
      if (line.startsWith('event:')) {
        eventName = line.substring(6).trim()
        continue
      }
      if (line.startsWith('id:')) {
        eventId = line.substring(3).trim()
        continue
      }
      if (line.startsWith('data:')) {
        // 保留原始内容：不做 trim，避免丢失 Markdown 空行/缩进（多行内容由 join('\n') 还原）
        dataLines.push(line.substring(5))
        continue
      }
      // 忽略其它字段（retry / 注释行等）
    }
  }
  // 流结束兜底：派发未以空行收尾的残留数据（如最后一个事件未换行结尾）
  if (dataLines.length > 0 || eventName === 'done' || eventName === 'error') {
    return dispatch(dataLines.join('\n'))
  }
  return false
}
