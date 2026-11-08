/*
 * Agent 运行时管理（主进程侧）：
 * 拉起并托管 Agent 运行时进程（utilityProcess），转发流式事件与人机交互，
 * 使主进程只做 IPC 网关，不再承担模型调用与工具执行。对外 API 与既有调用方保持对齐。
 */

import { join } from 'path'
import { execFileSync, spawn } from 'child_process'
import { utilityProcess, type UtilityProcess } from 'electron'
import log from 'electron-log/main'
import { getLogDir } from '@common/main/config/paths'
import { t } from '@common/main/i18n'
import { getSettings } from '@modules/settings/main'
import { recordTrace } from '@modules/diagnostics/main'
import { openInteraction, cancelInteraction, clearInteractions } from './interaction'
import { requestBrowserAction } from '@modules/browser/main'
import type { HostEvent, MemoryGenerateInput, RunAgentInput, SessionSummaryGenerateInput, WorkerMessage, WorkerRequest } from '@modules/agent/shared/agentProtocol'
import type { McpRuntimeConfig, McpTestResult, McpToolMeta } from '@modules/mcp/shared'

/* 一次运行的回调与结算：以会话为代表，同一会话同时只允许一轮运行 */
interface PendingRun {
  onEvent: (event: HostEvent) => void
  resolve: (result:
    | { ok: true; messages: unknown[] }
    | { ok: false; message: string; interrupted?: boolean }
  ) => void
}

/* 是否正在退出应用：退出导致的运行中断不算异常 */
let disposing = false

/* 运行时进程句柄与其就绪 Promise（首个 spawn 后初始化） */
let worker: UtilityProcess | null = null
let workerReady: Promise<UtilityProcess> | null = null
/* 进行中的运行：sessionId → 事件回调与结算（同一会话同时只允许一轮） */
const pendingRuns = new Map<number, PendingRun>()
/*
 * 运行期间到达的 evict 请求：摘要 / 长期记忆等后台任务完成时会清理会话运行时，
 * 若此时正好有新一轮在等待用户审批，直接 evict 会取消交互；改为本轮结束后再清理。
 */
const pendingEvictions = new Set<number>()
/* 进行中的 MCP 请求：requestId → 结算（连通测试 / 工具列表） */
const pendingMcp = new Map<
  string,
  { resolve: (value: unknown) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }
>()

/* MCP 请求超时（毫秒）：需覆盖 stdio 首次下载依赖（最长 5 分钟）+ 列举余量 */
const MCP_REQUEST_TIMEOUT = 360000

/* 记忆生成超时（毫秒）：一次非流式补全，留出足够生成 2000 字的余量 */
const MEMORY_REQUEST_TIMEOUT = 180000

/* 进行中的记忆生成：requestId → 结算 */
const pendingMemory = new Map<
  string,
  { resolve: (content: string) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }
>()

/* 进行中的会话摘要生成：requestId → 结算 */
const pendingSummary = new Map<
  string,
  { resolve: (content: string) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }
>()

/* 右侧「浏览器」面板打开回调（由 ipc.ts 注册，把 URL 转发到对应会话的渲染层标签页） */
let browserOpener: ((sessionId: number, url: string, newTab: boolean) => void) | null = null

/*
 * 会话有效性判定：由会话域在启动时注入。
 * 已删除会话的迟到事件 / 交互 / 轨迹在转发前直接丢弃，避免重建已删会话的界面资源。
 */
let sessionActiveResolver: (sessionId: number) => boolean = () => true

/* 注册会话有效性判定（会话域启动时调用） */
export function setSessionActiveResolver(resolver: (sessionId: number) => boolean): void {
  sessionActiveResolver = resolver
}

/* 注册浏览器打开回调（主进程窗口就绪后由 IPC 网关注入） */
export function setBrowserOpener(
  opener: (sessionId: number, url: string, newTab: boolean) => void
): void {
  browserOpener = opener
}

/* 启动（或复用）运行时进程 */
function ensureWorker(): Promise<UtilityProcess> {
  if (worker && workerReady) {
    return workerReady
  }
  const proc = utilityProcess.fork(join(__dirname, 'agent/worker/worker.js'), [], {
    serviceName: 'xxl-ai-desk-agent',
    /* 运行时进程与主进程写入同一目录的运行日志（按天分片） */
    env: {
      ...process.env,
      XXL_AI_RUNTIME_LOG_DIR: getLogDir()
    }
  })
  worker = proc
  workerReady = new Promise<UtilityProcess>((resolve, reject) => {
    proc.once('spawn', () => resolve(proc))
    /* 启动失败（未 spawn 即退出）：拒绝就绪 Promise，由 runAgent 转成失败结果 */
    proc.once('exit', () => reject(new Error(t('runtime.error.runtimeProcessStartFailed'))))
  })
  proc.on('message', (message) => {
    void handleMessage(message as WorkerMessage)
  })
  proc.on('exit', (code) => {
    log.warn(`[agent] 运行时进程退出（code=${code}）`)
    if (worker === proc) {
      worker = null
      workerReady = null
    }
    /* 进程异常退出：未结算的运行统一回传失败，避免调用方永久挂起 */
    for (const [sessionId, pending] of pendingRuns) {
      pending.resolve(
        disposing
          ? { ok: false, message: t('runtime.error.runtimeProcessExited'), interrupted: true }
          : { ok: false, message: 'Agent 运行时进程异常退出，请重试' }
      )
      pendingRuns.delete(sessionId)
    }
    /* 新进程没有旧运行，延后的 evict 无需继续排队 */
    pendingEvictions.clear()
    /* 交互请求随 worker 失效：清理挂起项，避免后续误回传 */
    clearInteractions()
    /* 未结算的 MCP 请求同样统一失败 */
    for (const [requestId, pending] of pendingMcp) {
      clearTimeout(pending.timer)
      pending.reject(new Error(t('runtime.error.runtimeProcessExited')))
      pendingMcp.delete(requestId)
    }
    /* 未结算的记忆生成同样统一失败 */
    for (const [requestId, pending] of pendingMemory) {
      clearTimeout(pending.timer)
      pending.reject(new Error(t('runtime.error.runtimeProcessExited')))
      pendingMemory.delete(requestId)
    }
    /* 未结算的会话摘要生成同样统一失败 */
    for (const [requestId, pending] of pendingSummary) {
      clearTimeout(pending.timer)
      pending.reject(new Error(t('runtime.error.runtimeProcessExited')))
      pendingSummary.delete(requestId)
    }
  })
  return workerReady
}

/* 处理运行时进程消息：流式事件转发、运行结算、越界审批 */
async function handleMessage(message: WorkerMessage): Promise<void> {
  switch (message.type) {
    case 'event':
      if (!sessionActiveResolver(message.sessionId)) {
        break
      }
      pendingRuns.get(message.sessionId)?.onEvent(message.event)
      break
    case 'open-browser':
      /* 会话已删除：不再为已删会话打开浏览器标签页 */
      if (!sessionActiveResolver(message.sessionId)) {
        break
      }
      /* Agent 工具请求：转交渲染层，在该会话的浏览器面板打开（newTab 控制是否新建标签页） */
      browserOpener?.(message.sessionId, message.url, message.newTab === true)
      break
    case 'browser-action':
      /* Agent 工具请求：经渲染层 webview 执行页面动作，结果回传运行时进程 */
      void requestBrowserAction(message.sessionId, message.action).then((result) => {
        worker?.postMessage({
          type: 'browser-action-result',
          requestId: message.requestId,
          result
        } satisfies WorkerRequest)
      })
      break
    case 'run-done': {
      const pending = pendingRuns.get(message.sessionId)
      pendingRuns.delete(message.sessionId)
      flushPendingEviction(message.sessionId)
      pending?.resolve({ ok: true, messages: message.messages })
      break
    }
    case 'run-error': {
      const pending = pendingRuns.get(message.sessionId)
      pendingRuns.delete(message.sessionId)
      flushPendingEviction(message.sessionId)
      pending?.resolve({ ok: false, message: message.message })
      break
    }
    case 'interaction-request': {
      /* 会话已删除：直接按拒绝结算，避免已删会话残留交互与工具悬挂 */
      if (!sessionActiveResolver(message.sessionId)) {
        worker?.postMessage({
          type: 'interaction-response',
          requestId: message.requestId,
          result: { status: 'denied' }
        } satisfies WorkerRequest)
        break
      }
      openInteraction(
        { requestId: message.requestId, sessionId: message.sessionId, request: message.request },
        (requestId, result) => {
          worker?.postMessage({ type: 'interaction-response', requestId, result })
        }
      )
      break
    }
    case 'interaction-cancel':
      cancelInteraction(message.requestId)
      break
    case 'mcp-test-result':
    case 'mcp-tools-result': {
      const pending = pendingMcp.get(message.requestId)
      if (pending) {
        clearTimeout(pending.timer)
        pendingMcp.delete(message.requestId)
        pending.resolve(message.type === 'mcp-test-result' ? message.result : message.tools)
      }
      break
    }
    case 'mcp-result-error': {
      const pending = pendingMcp.get(message.requestId)
      if (pending) {
        clearTimeout(pending.timer)
        pendingMcp.delete(message.requestId)
        pending.reject(new Error(message.message))
      }
      break
    }
    case 'memory-result': {
      const pending = pendingMemory.get(message.requestId)
      if (pending) {
        clearTimeout(pending.timer)
        pendingMemory.delete(message.requestId)
        if (message.ok) {
          pending.resolve(message.content ?? '')
        } else {
          pending.reject(new Error(message.message ?? t('runtime.error.memoryGenerateFailed')))
        }
      }
      break
    }
    case 'summary-result': {
      const pending = pendingSummary.get(message.requestId)
      if (pending) {
        clearTimeout(pending.timer)
        pendingSummary.delete(message.requestId)
        if (message.ok) {
          pending.resolve(message.content ?? '')
        } else {
          pending.reject(new Error(message.message ?? t('runtime.error.summaryGenerateFailed')))
        }
      }
      break
    }
    case 'llm-trace':
      /* 会话已删除：丢弃迟到轨迹，避免留下不可见的孤儿记录 */
      if (!sessionActiveResolver(message.sessionId)) {
        break
      }
      /* 模型通讯：开发者模式关闭时 service 内部直接丢弃 */
      recordTrace(message.sessionId, message.trace)
      break
    default:
      break
  }
}

/* 发送一条即发即弃的请求（运行时未启动则忽略） */
function postRequest(request: WorkerRequest): void {
  worker?.postMessage(request)
}

/* 指定会话是否已有正在运行的一轮（用于 IPC 层提前拒绝重复发送，避免落库错误轮次） */
export function isAgentRunning(sessionId: number): boolean {
  return pendingRuns.has(sessionId)
}

/* 预启动运行时进程：调用方在登记本轮前先等待就绪，缩小与「删除会话」的竞态窗口 */
export async function prepareAgentRuntime(): Promise<void> {
  await ensureWorker()
}

/* 执行一轮对话，流式回调事件；返回成功时本轮新增消息或失败信息 */
export async function runAgent(
  input: RunAgentInput,
  onEvent: (event: HostEvent) => void
): Promise<
  | { ok: true; messages: unknown[] }
  | { ok: false; message: string; interrupted?: boolean }
> {
  /* 同一会话同时只允许一轮：避免覆盖 pendingRuns 导致前一轮 Promise 永久悬挂 */
  if (pendingRuns.has(input.sessionId)) {
    return { ok: false, message: '当前会话正在生成，请等待本轮结束或先停止生成' }
  }
  let proc: UtilityProcess
  try {
    proc = await ensureWorker()
  } catch (error) {
    return { ok: false, message: (error as Error).message }
  }
  return new Promise((resolve) => {
    pendingRuns.set(input.sessionId, { onEvent, resolve })
    proc.postMessage({ type: 'run', input })
  })
}

/* 中断会话当前生成 */
export function abortAgent(sessionId: number): void {
  postRequest({ type: 'abort', sessionId })
}

/* 运行结束后补发延后的 evict */
function flushPendingEviction(sessionId: number): void {
  if (pendingEvictions.delete(sessionId)) {
    postRequest({ type: 'evict', sessionId })
  }
}

/* 释放会话运行时（删除会话/切换模型/后台配置刷新） */
export function evictAgent(sessionId: number): void {
  /* 本轮仍在执行：暂存到结束后清理，避免取消正在等待的审批 / 选择交互 */
  if (pendingRuns.has(sessionId)) {
    pendingEvictions.add(sessionId)
    return
  }
  postRequest({ type: 'evict', sessionId })
}

/* 清理会话越界白名单 */
export function clearSessionPermissions(sessionId: number): void {
  postRequest({ type: 'clear-permissions', sessionId })
}

/* 清空全部会话运行时缓存（设置/供应商变更时） */
export function resetAgents(): void {
  postRequest({ type: 'reset' })
}

/* 发送一次 MCP 请求并等待结果（超时/进程退出统一转为异常） */
async function requestMcp<T>(build: (requestId: string) => WorkerRequest): Promise<T> {
  let proc: UtilityProcess
  try {
    proc = await ensureWorker()
  } catch (error) {
    throw new Error((error as Error).message)
  }
  const requestId = `mcp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      pendingMcp.delete(requestId)
      reject(new Error(t('runtime.error.mcpRequestTimeout')))
    }, MCP_REQUEST_TIMEOUT)
    pendingMcp.set(requestId, {
      resolve: (value) => resolve(value as T),
      reject,
      timer
    })
    proc.postMessage(build(requestId))
  })
}

/* 连通测试（支持未保存草稿；配置由调用方解密后传入） */
export function testMcpByRuntime(server: McpRuntimeConfig, runtimePath: string): Promise<McpTestResult> {
  return requestMcp<McpTestResult>((requestId) => ({
    type: 'mcp-test',
    requestId,
    server,
    runtimePath,
    language: getSettings().language
  }))
}

/* 列举已连接服务的工具（复用运行时连接缓存） */
export function listMcpToolsByRuntime(
  server: McpRuntimeConfig,
  runtimePath: string
): Promise<McpToolMeta[]> {
  return requestMcp<McpToolMeta[]>((requestId) => ({
    type: 'mcp-tools',
    requestId,
    server,
    runtimePath,
    language: getSettings().language
  }))
}

/* 生成一次 Agent 记忆并等待结果（超时/进程退出统一转为异常） */
export async function generateMemory(
  input: Omit<MemoryGenerateInput, 'requestId'>
): Promise<string> {
  let proc: UtilityProcess
  try {
    proc = await ensureWorker()
  } catch (error) {
    throw new Error((error as Error).message)
  }
  const requestId = `mem_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`
  return new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => {
      pendingMemory.delete(requestId)
      reject(new Error(t('runtime.error.memoryGenerateTimeout')))
    }, MEMORY_REQUEST_TIMEOUT)
    pendingMemory.set(requestId, { resolve, reject, timer })
    proc.postMessage({
      type: 'memory-generate',
      input: { ...input, requestId }
    } satisfies WorkerRequest)
  })
}

/* 生成一次会话摘要并等待结果（超时/进程退出统一转为异常） */
export async function generateSessionSummary(
  input: Omit<SessionSummaryGenerateInput, 'requestId'>
): Promise<string> {
  let proc: UtilityProcess
  try {
    proc = await ensureWorker()
  } catch (error) {
    throw new Error((error as Error).message)
  }
  const requestId = `sum_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`
  return new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => {
      pendingSummary.delete(requestId)
      reject(new Error(t('runtime.error.summaryGenerateTimeout')))
    }, MEMORY_REQUEST_TIMEOUT)
    pendingSummary.set(requestId, { resolve, reject, timer })
    proc.postMessage({
      type: 'summary-generate',
      input: { ...input, requestId }
    } satisfies WorkerRequest)
  })
}

/* 退出时终止运行时进程：先请求优雅关闭（释放 MCP 子进程），超时强杀，并兜底清理残留后代进程 */
export function disposeAgentRuntime(timeout = 6000): Promise<void> {
  disposing = true
  const proc = worker
  worker = null
  workerReady = null
  if (!proc) {
    return Promise.resolve()
  }
  /* 退出前先快照后代进程（MCP 的 npx/node、Agent 执行的命令等），退出后按 PID 兜底清理 */
  const descendants = proc.pid ? collectDescendantPids(proc.pid) : []
  return new Promise<void>((resolve) => {
    const timer = setTimeout(() => {
      /* 超时：Windows 用 taskkill 杀整棵树，POSIX 逐个强杀后代后再杀 worker */
      if (process.platform === 'win32' && proc.pid) {
        spawn('taskkill', ['/pid', String(proc.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true })
      } else {
        killPids(descendants)
      }
      proc.kill()
      resolve()
    }, timeout)
    proc.once('exit', () => {
      clearTimeout(timer)
      /* 优雅退出后仍存活的子进程（如关闭 MCP 失败 / 用户命令未结束）：兜底清理 */
      const leftovers = alivePids(descendants)
      if (leftovers.length > 0) {
        log.warn(`[agent] 退出时清理残留子进程：${leftovers.join(',')}`)
        killPids(leftovers)
      }
      resolve()
    })
    proc.postMessage({ type: 'shutdown' } satisfies WorkerRequest)
  })
}

/* 收集指定进程的全部后代 PID（POSIX 通过 ps 解析父子关系；Windows 交由 taskkill 处理） */
function collectDescendantPids(rootPid: number): number[] {
  if (process.platform === 'win32') {
    return []
  }
  try {
    const rows = execFileSync('ps', ['-Ao', 'pid=,ppid='], { encoding: 'utf8' }).split('\n')
    const childrenOf = new Map<number, number[]>()
    for (const row of rows) {
      const [pidText, ppidText] = row.trim().split(/\s+/)
      const pid = Number(pidText)
      const ppid = Number(ppidText)
      if (!pid || !ppid) {
        continue
      }
      const list = childrenOf.get(ppid) ?? []
      list.push(pid)
      childrenOf.set(ppid, list)
    }
    /* 广度优先展开后代 */
    const result: number[] = []
    const queue = [...(childrenOf.get(rootPid) ?? [])]
    while (queue.length > 0) {
      const pid = queue.shift() as number
      result.push(pid)
      queue.push(...(childrenOf.get(pid) ?? []))
    }
    return result
  } catch {
    return []
  }
}

/* 强杀进程：优先按进程组（MCP stdio 为独立进程组），失败再按单进程；先子后父 */
function killPids(pids: number[]): void {
  for (const pid of [...pids].reverse()) {
    try {
      process.kill(-pid, 'SIGKILL')
    } catch {
      try {
        process.kill(pid, 'SIGKILL')
      } catch {
        /* 进程已退出 */
      }
    }
  }
}

/* 过滤仍存活的 PID（信号 0 仅做存在性探测） */
function alivePids(pids: number[]): number[] {
  return pids.filter((pid) => {
    try {
      process.kill(pid, 0)
      return true
    } catch {
      return false
    }
  })
}
