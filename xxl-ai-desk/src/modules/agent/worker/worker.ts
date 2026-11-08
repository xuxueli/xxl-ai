/*
 * Agent 运行时进程（Electron utilityProcess 入口）：
 * 承接全部模型调用、工具执行与文件沙箱，经 process.parentPort 与主进程通信。
 * 如此 LLM 流式与工具重活不再占用主进程事件循环，UI 与 IPC 始终保持顺滑。
 */

import log from 'electron-log/main'
import { randomUUID } from 'crypto'
import './i18n'
import { initWorkerLogger } from '@modules/agent/worker/logger'
import {
  beginTraceRun,
  clearTraceRuns,
  createTraceTarget,
  endTraceRun,
  setTraceSink
} from '@modules/agent/worker/trace'
import {
  abortAgent,
  applyRunMessages,
  clearSessionAbort,
  evictAgent,
  getAgent,
  isSessionAborted,
  resetAgents,
  runPrompt
} from '@modules/agent/worker/session'
import { setBrowserOpener, setBrowserActionInvoker, setRuntimePath } from '@modules/agent/worker/tools'
import {
  closeAllMcpClients,
  listServerTools,
  setMcpLanguage,
  setMcpRuntimePath,
  testMcpServer
} from '@modules/mcp/worker'
import { clearSessionPermissions } from '@modules/agent/worker/sandbox'
import { generateMemoryContent } from '@modules/agent/worker/memory'
import { generateSessionSummaryContent } from '@modules/agent/worker/summary'
import {
  cancelAllInteractions,
  cancelSessionInteractions,
  respondInteraction,
  setInteractionSender
} from '@modules/agent/worker/hitl'
import type { HostEvent, RunAgentInput, WorkerMessage, WorkerRequest } from '@modules/agent/shared/agentProtocol'
import { translate } from '@common/shared/i18n'
import type { BrowserActionResult } from '@modules/browser/shared'
import type { McpRuntimeConfig } from '@modules/mcp/shared'

/* 与主进程通信的端口（utilityProcess 中始终存在） */
const port = process.parentPort

/* 日志先就绪：后续装配与运行异常都能落盘 */
initWorkerLogger()

/* 模型通讯 trace 回传：仅开发者模式开启时 worker 才会开启采集 */
setTraceSink((sessionId, trace) => {
  post({ type: 'llm-trace', sessionId, trace })
})

/* 增量事件合批窗口（毫秒）：把高频 token 合并后再跨进程，降低 IPC 与主进程转发开销 */
const COALESCE_MS = 40

/* 各会话的增量缓冲（delta/thinking 合并发送） */
interface DeltaBuffer {
  delta: string
  thinking: string
  timer: ReturnType<typeof setTimeout> | null
}
const deltaBuffers = new Map<number, DeltaBuffer>()

/* 发送消息到主进程 */
function post(message: WorkerMessage): void {
  port.postMessage(message)
}

/* 人机交互桥：统一经 post 发送请求/取消，等待主进程回传应答 */
setInteractionSender(post)

/* open_browser 工具：把待打开地址转交主进程，由渲染层在对应会话的浏览器面板打开 */
setBrowserOpener((sessionId, url, newTab) =>
  post({ type: 'open-browser', sessionId, url, newTab })
)

/* 页面动作请求：requestId → 结果结算（主进程经渲染层 webview 执行后回传） */
const pendingBrowserActions = new Map<string, (result: BrowserActionResult) => void>()

/* 浏览器工具：跨进程请求渲染层执行页面动作 */
setBrowserActionInvoker(
  (sessionId, action) =>
    new Promise<BrowserActionResult>((resolve) => {
      const requestId = `ba_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`
      pendingBrowserActions.set(requestId, resolve)
      post({ type: 'browser-action', requestId, sessionId, action })
    })
)

/* 冲刷某会话缓冲的增量（保证在工具/完成等关键事件前先落文本，维持时序） */
function flushDelta(sessionId: number): void {
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
function emitEvent(sessionId: number, event: HostEvent): void {
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

/* 执行一轮对话：流式事件回传主进程，结束后回传完整上下文（供主进程落库） */
async function handleRun(input: RunAgentInput): Promise<void> {
  try {
    /* 新一轮开始：清除上一次的终止标记 */
    clearSessionAbort(input.sessionId)
    /* 应用本轮运行时 PATH（设置中的 Node / Python 环境），供 run_command 使用 */
    setRuntimePath(input.runtimePath)
    /* MCP stdio 使用独立 PATH：优先系统 Node，避免产生额外 Dock 图标 */
    setMcpRuntimePath(input.mcpRuntimePath)
    setMcpLanguage(input.language)
    const agent = await getAgent({
      sessionId: input.sessionId,
      provider: input.provider,
      modelId: input.modelId,
      reasoningLevel: input.reasoningLevel,
      systemPrompt: input.systemPrompt,
      permissionMode: input.permissionMode,
      rootDir: input.rootDir,
      language: input.language,
      runtimePath: input.mcpRuntimePath,
      mcpServers: input.mcpServers ?? [],
      skills: input.skills ?? [],
      skillsDir: input.skillsDir,
      tools: input.tools,
      isAborted: () => isSessionAborted(input.sessionId)
    })

    /* 应用本轮历史：保留构造时注入的 system 消息，历史由主进程下发 */
    applyRunMessages(agent, input.messages)

    /* 创建 Agent 期间已被终止：不再发起模型请求，本次没有新增消息 */
    if (isSessionAborted(input.sessionId)) {
      flushDelta(input.sessionId)
      post({
        type: 'run-done',
        sessionId: input.sessionId,
        messages: [
          {
            role: 'assistant',
            content: [{ type: 'text', text: translate(input.language, 'runtime.abortNote'), error: true }],
            stopReason: 'aborted',
            timestamp: Date.now()
          }
        ]
      })
      return
    }
    /* 开发者模式：本轮开始采集模型通讯 trace（关闭时不建状态，事件回调自动空转） */
    if (input.traceEnabled) {
      beginTraceRun(createTraceTarget(input.sessionId), randomUUID())
    }
    const newMessages = await runPrompt(
      agent,
      input.text,
      (event) => {
        /* 用户已终止：错误事件按正常结束下发，避免 UI 误报失败 */
        const normalized =
          event.type === 'error' && isSessionAborted(input.sessionId)
            ? ({ type: 'done' } as HostEvent)
            : event
        emitEvent(input.sessionId, normalized)
      },
      input.sessionId,
      input.language
    )
    /* 采集收尾：正常结束；用户中止时标记 aborted */
    endTraceRun(createTraceTarget(input.sessionId), '', isSessionAborted(input.sessionId))
    /* 结束前冲刷残余增量，保证文本完整落库/展示 */
    flushDelta(input.sessionId)
    post({
      type: 'run-done',
      sessionId: input.sessionId,
      messages: newMessages.filter(
        (message) => (message as { role?: string }).role !== 'system'
      )
    })
  } catch (error) {
    /* 运行时构建/执行异常（如模型未找到）：清理该会话缓存并回传错误，由主进程落库提示 */
    endTraceRun(createTraceTarget(input.sessionId), (error as Error).message)
    flushDelta(input.sessionId)
    cancelSessionInteractions(input.sessionId)
    evictAgent(input.sessionId)
    post({ type: 'run-error', sessionId: input.sessionId, message: (error as Error).message })
  }
}

/* 记忆生成：调用一次模型压缩，结果回传主进程（失败只回错误，不影响对话） */
async function handleMemoryGenerate(input: Parameters<typeof generateMemoryContent>[0]): Promise<void> {
  try {
    const content = await generateMemoryContent(input)
    post({ type: 'memory-result', requestId: input.requestId, ok: true, content })
  } catch (error) {
    post({
      type: 'memory-result',
      requestId: input.requestId,
      ok: false,
      message: (error as Error).message
    })
  }
}

/* 会话摘要生成：调用一次模型压缩，结果回传主进程（失败只回错误，不影响对话） */
async function handleSummaryGenerate(
  input: Parameters<typeof generateSessionSummaryContent>[0]
): Promise<void> {
  try {
    const content = await generateSessionSummaryContent(input)
    post({ type: 'summary-result', requestId: input.requestId, ok: true, content })
  } catch (error) {
    post({
      type: 'summary-result',
      requestId: input.requestId,
      ok: false,
      message: (error as Error).message
    })
  }
}

/* 连通测试：临时连接 MCP 服务，返回服务信息与工具明细 */
async function handleMcpTest(
  requestId: string,
  server: McpRuntimeConfig,
  path: string,
  language: 'zh' | 'en'
): Promise<void> {
  try {
    setMcpLanguage(language)
    const result = await testMcpServer(server, path)
    post({ type: 'mcp-test-result', requestId, result })
  } catch (error) {
    post({ type: 'mcp-result-error', requestId, message: (error as Error).message })
  }
}

/* 列举工具：复用连接缓存，返回工具元信息 */
async function handleMcpTools(
  requestId: string,
  server: McpRuntimeConfig,
  path: string,
  language: 'zh' | 'en'
): Promise<void> {
  try {
    setMcpLanguage(language)
    setMcpRuntimePath(path)
    const tools = await listServerTools(server)
    post({ type: 'mcp-tools-result', requestId, tools })
  } catch (error) {
    post({ type: 'mcp-result-error', requestId, message: (error as Error).message })
  }
}

/* 处理来自主进程的请求 */
function handleRequest(message: WorkerRequest): void {
  switch (message.type) {
    case 'run':
      void handleRun(message.input)
      break
    case 'mcp-test':
      void handleMcpTest(message.requestId, message.server, message.runtimePath, message.language)
      break
    case 'mcp-tools':
      void handleMcpTools(message.requestId, message.server, message.runtimePath, message.language)
      break
    case 'memory-generate':
      void handleMemoryGenerate(message.input)
      break
    case 'summary-generate':
      void handleSummaryGenerate(message.input)
      break
    case 'browser-action-result': {
      const resolve = pendingBrowserActions.get(message.requestId)
      if (resolve) {
        pendingBrowserActions.delete(message.requestId)
        resolve(message.result)
      }
      break
    }
    case 'abort':
      cancelSessionInteractions(message.sessionId)
      void abortAgent(message.sessionId)
      break
    case 'evict': {
      const buffer = deltaBuffers.get(message.sessionId)
      if (buffer?.timer) {
        clearTimeout(buffer.timer)
      }
      deltaBuffers.delete(message.sessionId)
      cancelSessionInteractions(message.sessionId)
      evictAgent(message.sessionId)
      /* 会话被清出运行时：同步丢弃未完成的采集状态 */
      clearTraceRuns(message.sessionId)
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
      cancelAllInteractions()
      resetAgents()
      /* 运行时重置：丢弃全部未完成的采集状态 */
      clearTraceRuns()
      /* 配置变更/退出：关闭全部 MCP 连接，释放 stdio 子进程 */
      void closeAllMcpClients()
      break
    }
    case 'shutdown':
      cancelAllInteractions()
      void shutdownWorker()
      break
    case 'interaction-response': {
      respondInteraction(message.requestId, message.result)
      break
    }
    default:
      break
  }
}

/* 退出前优雅关闭：先释放全部 MCP stdio 子进程（npx/node），再退出自身 */
async function shutdownWorker(): Promise<void> {
  try {
    await closeAllMcpClients()
  } catch (error) {
    log.warn('[agent-runtime] 退出前关闭 MCP 连接失败', error)
  } finally {
    process.exit(0)
  }
}

port.on('message', (event) => {
  try {
    handleRequest(event.data as WorkerRequest)
  } catch (error) {
    log.error('[agent-runtime] 处理消息失败', error)
  }
})
