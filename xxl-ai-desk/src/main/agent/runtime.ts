/*
 * Agent 运行时管理（主进程侧）：
 * 拉起并托管 Agent 运行时进程（utilityProcess），转发流式事件与越界审批，
 * 使主进程只做 IPC 网关，不再承担模型调用与工具执行。对外 API 与旧 host 对齐。
 */

import { join } from 'path'
import { utilityProcess, type UtilityProcess } from 'electron'
import log from 'electron-log/main'
import { confirmOutside } from './approval'
import type {
  HostEvent,
  RunAgentInput,
  WorkerMessage,
  WorkerRequest
} from '../../shared/agentProtocol'

/* 一次运行的回调与结算：以会话为代表，同一会话同时只允许一轮运行 */
interface PendingRun {
  onEvent: (event: HostEvent) => void
  resolve: (result: { ok: true; messages: unknown[] } | { ok: false; message: string }) => void
}

/* 运行时进程句柄与其就绪 Promise（首个 spawn 后初始化） */
let worker: UtilityProcess | null = null
let workerReady: Promise<UtilityProcess> | null = null
/* 进行中的运行：sessionId → 事件回调与结算（同一会话同时只允许一轮） */
const pendingRuns = new Map<string, PendingRun>()

/* 启动（或复用）运行时进程 */
function ensureWorker(): Promise<UtilityProcess> {
  if (worker && workerReady) {
    return workerReady
  }
  const proc = utilityProcess.fork(join(__dirname, 'agent/worker.js'), [], {
    serviceName: 'xxl-ai-desk-agent'
  })
  worker = proc
  workerReady = new Promise<UtilityProcess>((resolve, reject) => {
    proc.once('spawn', () => resolve(proc))
    /* 启动失败（未 spawn 即退出）：拒绝就绪 Promise，由 runAgent 转成失败结果 */
    proc.once('exit', () => reject(new Error('Agent 运行时进程启动失败')))
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
      pending.resolve({ ok: false, message: 'Agent 运行时进程异常退出，请重试' })
      pendingRuns.delete(sessionId)
    }
  })
  return workerReady
}

/* 处理运行时进程消息：流式事件转发、运行结算、越界审批 */
async function handleMessage(message: WorkerMessage): Promise<void> {
  switch (message.type) {
    case 'event':
      pendingRuns.get(message.sessionId)?.onEvent(message.event)
      break
    case 'run-done': {
      const pending = pendingRuns.get(message.sessionId)
      pendingRuns.delete(message.sessionId)
      pending?.resolve({ ok: true, messages: message.messages })
      break
    }
    case 'run-error': {
      const pending = pendingRuns.get(message.sessionId)
      pendingRuns.delete(message.sessionId)
      pending?.resolve({ ok: false, message: message.message })
      break
    }
    case 'approval-request': {
      const choice = await confirmOutside(message)
      worker?.postMessage({ type: 'approval-response', requestId: message.requestId, choice })
      break
    }
    default:
      break
  }
}

/* 发送一条即发即弃的请求（运行时未启动则忽略） */
function postRequest(request: WorkerRequest): void {
  worker?.postMessage(request)
}

/* 执行一轮对话，流式回调事件；返回成功时的完整上下文或失败信息 */
export async function runAgent(
  input: RunAgentInput,
  onEvent: (event: HostEvent) => void
): Promise<{ ok: true; messages: unknown[] } | { ok: false; message: string }> {
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
export function abortAgent(sessionId: string): void {
  postRequest({ type: 'abort', sessionId })
}

/* 释放会话运行时（删除会话/切换模型时） */
export function evictAgent(sessionId: string): void {
  postRequest({ type: 'evict', sessionId })
}

/* 清理会话越界白名单 */
export function clearSessionPermissions(sessionId: string): void {
  postRequest({ type: 'clear-permissions', sessionId })
}

/* 清空全部会话运行时缓存（设置/供应商变更时） */
export function resetAgents(): void {
  postRequest({ type: 'reset' })
}

/* 退出时终止运行时进程 */
export function disposeAgentRuntime(): void {
  worker?.postMessage({ type: 'reset' } satisfies WorkerRequest)
  worker?.kill()
  worker = null
  workerReady = null
}
