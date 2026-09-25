/**
 * 对话流式 composable：SSE 事件解析 + 断线自动续传
 *
 * 发送/续传均返回可读流 reader，由本模块统一按 SSE 事件解析（stream/thinking/message/ping），
 * 中断时携带 msgId + lastEventId 自动续传（最多 3 次）。
 */
import { ElMessage } from 'element-plus'
import { resumeStream, sendStream } from '../api'

/** 流式增量回调 */
export type ChatStreamHandler = (text: string) => void

/** 流状态：msgId 由 stream 事件回填，lastEventId 为已处理的结果流条目 */
interface ChatStreamState {
  msgId?: number
  lastEventId?: string
}

export function useChatStream() {
  /**
   * 发送消息并流式接收：打开流 → 解析并自动续传
   */
  async function sendMessage(
    payload: { uuid: string; visitorId: string; convId: number; content: string },
    onThinking: ChatStreamHandler,
    onContent: ChatStreamHandler
  ) {
    const reader = await sendStream(payload.uuid, payload.visitorId, payload.convId, payload.content)
    if (!reader) {
      throw new Error('empty stream')
    }
    await streamWithResume(reader, {}, onThinking, onContent)
  }

  /**
   * 续传生成中的助手消息：从结果流起点重放全部增量（用于刷新页面/切换对话后恢复生成）
   */
  async function resumeMessage(msgId: number, onThinking: ChatStreamHandler, onContent: ChatStreamHandler) {
    if (!msgId) return
    const reader = await resumeStream(msgId)
    if (!reader) return
    await streamWithResume(reader, { msgId }, onThinking, onContent)
  }

  return { sendMessage, resumeMessage }
}

/**
 * 读取流并断线自动续传：正常结束（done/error 终态事件）返回；中断则携 msgId + lastEventId 续传（最多 3 次）
 *
 * @param reader 初始流（发送或续传获得）
 * @param state  流状态（stream 事件回填 msgId，内容事件推进 lastEventId）
 */
async function streamWithResume(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  state: ChatStreamState,
  onThinking: ChatStreamHandler,
  onContent: ChatStreamHandler
) {
  let attempts = 0
  while (reader) {
    let completed = false
    try {
      completed = await readStream(reader, onThinking, onContent, state)
    } catch (e) {
      // 网络中断：进入续传分支
      completed = false
    }
    if (completed) return
    // 未正常结束且已获得 msgId：携带断点续传（最多 3 次）
    if (!state.msgId || attempts >= 3) return
    attempts++
    await new Promise((resolve) => setTimeout(resolve, 500 * attempts))
    try {
      const resumed = await resumeStream(state.msgId, state.lastEventId)
      if (!resumed) return
      reader = resumed
    } catch (e) {
      return
    }
  }
}

/**
 * 流式读取：按 SSE 事件解析（stream=流标识，thinking=思考过程，message=回复内容，ping=心跳，
 * done=结束，error=错误），逐事件回调
 *
 * Spring SseEmitter 会将含换行的内容按行拆成多条 data: 行，同一事件内的 data: 内容必须以换行连接还原，
 * 否则多行/段落（如 ## 标题 + 正文）会被拼成单行，导致 markdown 实时渲染格式错乱（而刷新后从库中读取完整内容正常）。
 *
 * @returns 是否收到终态（done/error）；未收到即视为中断，由调用方携带 state 续传
 */
async function readStream(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  onThinking: ChatStreamHandler,
  onContent: ChatStreamHandler,
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
    // 终态事件（done/error）：后端专用事件名，不再混入内容通道
    if (eventName === 'done') {
      if (eventId) state.lastEventId = eventId
      return true
    }
    if (eventName === 'error') {
      if (eventId) state.lastEventId = eventId
      ElMessage.error(data || '生成失败')
      return true
    }
    if (!data) return false
    if (eventName === 'stream') {
      state.msgId = Number(data)
      return false
    }
    if (eventName === 'ping') return false
    if (eventName === 'thinking') {
      onThinking(data)
    } else {
      onContent(data)
    }
    // 仅内容事件推进断点，续传时从该 id 之后继续
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
        if (dataLines.length > 0) {
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
  if (dataLines.length > 0) {
    return dispatch(dataLines.join('\n'))
  }
  return false
}
