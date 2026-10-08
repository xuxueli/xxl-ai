/*
 * Agent 运行时进程（Electron utilityProcess 入口）：
 * 承接全部模型调用、工具执行与文件沙箱，经 process.parentPort 与主进程通信。
 * 如此 LLM 流式与工具重活不再占用主进程事件循环，UI 与 IPC 始终保持顺滑。
 */

import log from 'electron-log/main'
import { abortAgent, evictAgent, getAgent, resetAgents, runPrompt } from './host'
import { clearSessionPermissions, setApprovalRequester } from './sandbox'
import type {
  ApprovalChoice,
  HostEvent,
  RunAgentInput,
  WorkerMessage,
  WorkerRequest
} from '../../shared/agentProtocol'

/* 与主进程通信的端口（utilityProcess 中始终存在） */
const port = process.parentPort

/* 增量事件合批窗口（毫秒）：把高频 token 合并后再跨进程，降低 IPC 与主进程转发开销 */
const COALESCE_MS = 40

/* 待审批请求：requestId → resolve（等待主进程弹窗结果回传） */
const pendingApprovals = new Map<string, (choice: ApprovalChoice) => void>()

/* 各会话的增量缓冲（delta/thinking 合并发送） */
interface DeltaBuffer {
  delta: string
  thinking: string
  timer: ReturnType<typeof setTimeout> | null
}
const deltaBuffers = new Map<string, DeltaBuffer>()

/* 发送消息到主进程 */
function post(message: WorkerMessage): void {
  port.postMessage(message)
}

/* 冲刷某会话缓冲的增量（保证在工具/完成等关键事件前先落文本，维持时序） */
function flushDelta(sessionId: string): void {
  const buffer = deltaBuffers.get(sessionId)
  if (!buffer) {
    return
  }
  if (buffer.timer !== null) {
    clearTimeout(buffer.timer)
    buffer.timer = null
  }
  if (buffer.delta) {
    post({ type: 'event', sessionId, event: { type: 'delta', text: buffer.delta } })
    buffer.delta = ''
  }
  if (buffer.thinking) {
    post({ type: 'event', sessionId, event: { type: 'thinking', text: buffer.thinking } })
    buffer.thinking = ''
  }
}

/* 事件回传：增量事件合批，其余关键事件先冲刷再即时发送 */
function emitEvent(sessionId: string, event: HostEvent): void {
  if (event.type === 'delta' || event.type === 'thinking') {
    let buffer = deltaBuffers.get(sessionId)
    if (!buffer) {
      buffer = { delta: '', thinking: '', timer: null }
      deltaBuffers.set(sessionId, buffer)
    }
    if (event.type === 'delta') {
      buffer.delta += event.text
    } else {
      buffer.thinking += event.text
    }
    if (buffer.timer === null) {
      buffer.timer = setTimeout(() => flushDelta(sessionId), COALESCE_MS)
    }
    return
  }
  flushDelta(sessionId)
  post({ type: 'event', sessionId, event })
}

/*
 * 越界审批：转发主进程弹应用内对话框，等待 approval-response 回传。
 * requestId 用于并发审批场景下的请求配对。
 */
setApprovalRequester(
  (request) =>
    new Promise<ApprovalChoice>((resolve) => {
      const requestId = `ap_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`
      pendingApprovals.set(requestId, resolve)
      post({ type: 'approval-request', requestId, ...request })
    })
)

/* 执行一轮对话：流式事件回传主进程，结束后回传完整上下文（供主进程落库） */
async function handleRun(input: RunAgentInput): Promise<void> {
  try {
    const agent = await getAgent({
      sessionId: input.sessionId,
      provider: input.provider,
      modelId: input.modelId,
      systemPrompt: input.systemPrompt,
      messages: input.messages,
      mode: input.mode,
      rootDir: input.rootDir
    })
    await runPrompt(agent, input.text, (event) => emitEvent(input.sessionId, event))
    /* 结束前冲刷残余增量，保证文本完整落库/展示 */
    flushDelta(input.sessionId)
    const messages = agent.state.messages.filter(
      (message) => (message as { role?: string }).role !== 'system'
    )
    post({ type: 'run-done', sessionId: input.sessionId, messages })
  } catch (error) {
    /* 运行时构建/执行异常（如模型未找到）：清理该会话缓存并回传错误，由主进程落库提示 */
    flushDelta(input.sessionId)
    evictAgent(input.sessionId)
    post({ type: 'run-error', sessionId: input.sessionId, message: (error as Error).message })
  }
}

/* 处理来自主进程的请求 */
function handleRequest(message: WorkerRequest): void {
  switch (message.type) {
    case 'run':
      void handleRun(message.input)
      break
    case 'abort':
      void abortAgent(message.sessionId)
      break
    case 'evict': {
      const buffer = deltaBuffers.get(message.sessionId)
      if (buffer?.timer) {
        clearTimeout(buffer.timer)
      }
      deltaBuffers.delete(message.sessionId)
      evictAgent(message.sessionId)
      break
    }
    case 'clear-permissions':
      clearSessionPermissions(message.sessionId)
      break
    case 'reset': {
      for (const buffer of deltaBuffers.values()) {
        if (buffer.timer) {
          clearTimeout(buffer.timer)
        }
      }
      deltaBuffers.clear()
      resetAgents()
      break
    }
    case 'approval-response': {
      const resolve = pendingApprovals.get(message.requestId)
      if (resolve) {
        pendingApprovals.delete(message.requestId)
        resolve(message.choice)
      }
      break
    }
    default:
      break
  }
}

port.on('message', (event) => {
  try {
    handleRequest(event.data as WorkerRequest)
  } catch (error) {
    log.error('[agent-runtime] 处理消息失败', error)
  }
})
