/*
 * 会话级 Agent 宿主：在运行时进程内按会话创建/缓存 Agent，执行一轮对话并回传流式事件。
 * 模型构建与内置工具装配在此编排，是连接 Pi Agent 与主进程协议的中间层。
 */

import type { Agent } from '@earendil-works/pi-agent-core'
import { buildModels, type ProviderModelConfig } from '@modules/agent/worker/models'
import { buildToolGuide, createBuiltinToolEntries } from '@modules/agent/worker/tools'
import { createMcpTools } from '@modules/mcp/worker'
import type { MessageSource, PermissionMode } from '@modules/chat/shared'
import type { HostEvent } from '@modules/agent/shared/agentProtocol'
import type { BuiltinToolSwitches } from '@modules/agent/shared/agentProtocol'
import { contentBlocks } from '@modules/chat/shared'
import { contextTokensOfUsage } from '@common/shared/model'
import type { ContextBreakdown, ReasoningLevel, UsageLike } from '@common/shared/model'
import { translate, type AppLanguage } from '@common/shared/i18n'
import type { McpRuntimeConfig } from '@modules/mcp/shared'
import type { SkillRuntimeConfig } from '@modules/skill/shared'
import {
  createTraceHooks,
  createTraceTarget,
  handleTraceMessageEnd,
  handleTraceToolEnd,
  handleTraceToolStart
} from '@modules/agent/worker/trace'

/* 创建/获取会话 Agent 所需的运行时配置 */
export interface AgentRuntimeOptions {
  sessionId: number
  provider: ProviderModelConfig
  modelId: string
  /* 推理等级：仅对话模型生效 */
  reasoningLevel: ReasoningLevel
  systemPrompt: string
  /* 权限模式（决定工具装配与全局读写范围）与项目根目录（工作区边界） */
  permissionMode: PermissionMode
  rootDir: string
  /* 应用语言：工具错误与摘要文案使用对应语言 */
  language: AppLanguage
  /* 运行时 PATH（MCP stdio 与 run_command 共用） */
  runtimePath: string
  /* 已生效的 MCP 服务配置 */
  mcpServers: McpRuntimeConfig[]
  /* 已启用的技能索引 */
  skills: SkillRuntimeConfig[]
  /* 技能根目录（文件沙箱的技能库只读放行边界） */
  skillsDir: string
  /* 内置工具分类开关 */
  tools: BuiltinToolSwitches
  /* 会话是否已被终止（Agent 创建阶段用于提前跳出） */
  isAborted?: () => boolean
}

/* 会话级 Agent 运行时缓存：同一会话复用上下文 */
const runtimes = new Map<number, Promise<Agent>>()

/* 已请求终止的会话：覆盖「Agent 尚未创建完成就点击终止」的场景 */
const abortedSessions = new Set<number>()

/*
 * MCP 装配等待（毫秒）：连接已就绪（缓存命中）时几毫秒返回，本轮即有 MCP 工具；
 * 冷启动/慢服务不阻塞首字，未就绪则先跑，装配完成后直接追加到会话 Agent。
 */
const MCP_DISCOVERY_BUDGET = 2000

/* 在预算内等待任务完成：超时返回 null，任务继续在后台执行 */
function withinBudget<T>(task: Promise<T>, budgetMs: number): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), budgetMs)
  })
  return Promise.race([task, timeout]).finally(() => {
    if (timer) {
      clearTimeout(timer)
    }
  })
}

/* 标记会话开始新一轮（清除上一次终止标记） */
export function clearSessionAbort(sessionId: number): void {
  abortedSessions.delete(sessionId)
}

/* 会话是否已被请求终止 */
export function isSessionAborted(sessionId: number): boolean {
  return abortedSessions.has(sessionId)
}

/* 单次请求超时、重试间隔与次数 */
const REQUEST_TIMEOUT_MS = 30_000
const RETRY_DELAY_MS = 3_000
const MAX_REQUEST_RETRIES = 5

/* 仅 401 / 402 / 403 / 404 不重试，其余异常一律重试 */
const NON_RETRYABLE_STATUS = new Set([401, 402, 403, 404])

/* 运行期消息的最小结构 */
interface RuntimeMessage {
  role?: string
  content?: unknown
  usage?: UsageLike
  stopReason?: string
  errorMessage?: string
  timestamp?: number
  source?: MessageSource
}

/* 中英文混合估算 token：CJK 约 1 token/字，其余约 4 字符/token */
function estimateTokens(text: string): number {
  const cjkCount = text.match(/[\u3400-\u9fff\uf900-\ufaff]/g)?.length ?? 0
  return Math.ceil(cjkCount + (text.length - cjkCount) / 4)
}

/* 上下文分项估算：系统提示词与工具定义按字符估算，剩余归入对话消息 */
function contextBreakdownOf(agent: Agent, used: number): ContextBreakdown {
  const systemTokens = estimateTokens(agent.state.systemPrompt ?? '')
  const toolTokens = estimateTokens(JSON.stringify(agent.state.tools ?? []))
  return {
    systemTokens,
    toolTokens,
    messageTokens: Math.max(0, used - systemTokens - toolTokens)
  }
}

/* 助手消息的上下文用量：非助手消息返回 0 */
function contextTokensOf(message: unknown): number {
  const item = message as RuntimeMessage
  return item?.role === 'assistant' ? contextTokensOfUsage(item.usage) : 0
}

/* 原始用户提问是否已进入上下文（请求失败后判断是否需要重发） */
function hasUserText(agent: Agent, text: string): boolean {
  return (agent.state.messages as RuntimeMessage[]).some(
    (message) =>
      message.role === 'user' &&
      contentBlocks(message).some(
        (block) => (block as { type?: string; text?: string }).type === 'text' &&
          (block as { text?: string }).text === text
      )
  )
}

/* 标记本轮新增的运行时注入提示：按新增位置定位，避免依赖提示文本匹配 */
function markRuntimePrompt(agent: Agent, fromIndex: number, source: MessageSource): void {
  const messages = agent.state.messages as RuntimeMessage[]
  for (let index = fromIndex; index < messages.length; index += 1) {
    if (messages[index].role === 'user') {
      messages[index].source = source
      return
    }
  }
}

/* 用户终止：在当前助手消息或新消息中写入终止备注 */
function appendAbortNote(agent: Agent, start: number, note: string): void {
  const hasNewAssistant = (agent.state.messages as RuntimeMessage[])
    .slice(start)
    .some((message) => message.role === 'assistant')
  appendAssistantNote(agent, note, hasNewAssistant, 'aborted')
}

/* 最后一轮助手消息 */
function lastAssistant(agent: Agent): RuntimeMessage | undefined {
  const messages = agent.state.messages as RuntimeMessage[]
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index].role === 'assistant') {
      return messages[index]
    }
  }
  return undefined
}

/* 在正文追加一条系统备注；appendToLast=true 时并入最后一条助手消息 */
function appendAssistantNote(
  agent: Agent,
  note: string,
  appendToLast: boolean,
  stopReason: 'stop' | 'aborted' | 'error' = 'stop'
): void {
  const messages = agent.state.messages as RuntimeMessage[]
  if (appendToLast) {
    const last = lastAssistant(agent)
    if (last && Array.isArray(last.content)) {
      last.content.push({ type: 'text', text: note, error: true })
      /* 备注即本轮终态：同步 stopReason，保证落库状态与界面一致 */
      if (stopReason !== 'stop') {
        last.stopReason = stopReason
      }
      return
    }
  }
  messages.push({
    role: 'assistant',
    content: [{ type: 'text', text: note, error: true }],
    stopReason,
    timestamp: Date.now()
  })
}

/* 重试退避 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/* 是否用户主动终止 */
function isAbortError(error: unknown): boolean {
  return /aborted|cancell?ed/i.test((error as Error)?.message ?? '')
}

/* 按配置动态加载 Pi Agent，装配模型与内置工具，注入系统提示与历史消息 */
async function createAgent(options: AgentRuntimeOptions): Promise<Agent> {
  const { Agent: AgentClass } = await import('@earendil-works/pi-agent-core')
  const models = await buildModels([{ ...options.provider, sessionId: options.sessionId }])
  const model = models.getModel(String(options.provider.id), options.modelId)
  if (!model) {
    throw new Error(
      translate(options.language, 'runtime.error.modelNotFound', [
        options.provider.id,
        options.modelId
      ])
    )
  }
  const entries = await createBuiltinToolEntries({
    permissionMode: options.permissionMode,
    rootDir: options.rootDir,
    sessionId: options.sessionId,
    language: options.language,
    skills: options.skills,
    skillsDir: options.skillsDir,
    tools: options.tools
  })
  const tools = entries.map((entry) => entry.tool)
  /* MCP 工具：先等一个短预算（已连接/缓存命中即刻就绪），未就绪也不阻塞首字 */
  const mcpTask = createMcpTools({
    servers: options.mcpServers,
    permissionMode: options.permissionMode,
    language: options.language,
    runtimePath: options.runtimePath,
    isAborted: options.isAborted
  })
  const readyMcpTools = await withinBudget(mcpTask, MCP_DISCOVERY_BUDGET)
  /*
   * 模型通讯采集钩子常驻：是否真正记录由「本轮是否 begin」决定，
   * 这样开发者模式在会话中途开启也能立即生效，无需清理运行时缓存。
   */
  /* 历史消息不随 initialState 注入：每轮由 applyRunMessages 统一下发 */
  const agent = new AgentClass({
    initialState: {
      systemPrompt: `${options.systemPrompt}${buildToolGuide(entries)}`,
      model,
      /* Default 交由供应商决定；Max 由 Pi 按模型能力自动降级 */
      thinkingLevel: options.reasoningLevel === 'default' ? 'off' : options.reasoningLevel,
      tools: [...tools, ...(readyMcpTools ?? [])]
    },
    streamFn: (model, context, options) =>
      models.streamSimple(model, context, { ...options, timeoutMs: REQUEST_TIMEOUT_MS }),
    ...createTraceHooks(createTraceTarget(options.sessionId), options.provider.id, options.modelId)
  })
  /*
   * 后台装配完成：直接替换运行中 Agent 的工具集（Pi 官方支持，下一次请求生效并自动告知模型），
   * 无需重建 Agent，会话上下文不丢。
   */
  if (readyMcpTools === null) {
    void mcpTask
      .then((lateMcpTools) => {
        agent.state.tools = [...tools, ...lateMcpTools]
      })
      .catch(() => undefined)
  }
  return agent
}

/*
 * 应用本轮历史：系统指令在创建 Agent 时固化（指令 / 记忆 / 技能索引 / 模式说明），
 * 变更由主进程 evictAgent / resetAgents 触发重建；这里仅替换历史，避免把 system 消息冲掉。
 * 协议侧消息为不透明结构，边界处统一断言为运行时消息。
 */
export function applyRunMessages(agent: Agent, messages: unknown[]): void {
  const state = agent.state.messages as RuntimeMessage[]
  /* 按角色保留系统消息，不依赖「固定在下标 0」的隐式约定 */
  const systemMessages = state.filter((message) => message.role === 'system')
  agent.state.messages = [...systemMessages, ...(messages as RuntimeMessage[])] as never
}

/* 获取（或创建）会话 Agent */
export function getAgent(options: AgentRuntimeOptions): Promise<Agent> {
  let runtime = runtimes.get(options.sessionId)
  if (!runtime) {
    runtime = createAgent(options)
    runtimes.set(options.sessionId, runtime)
  }
  return runtime
}

/* 释放会话 Agent（删除会话/切换模型时） */
export function evictAgent(sessionId: number): void {
  runtimes.delete(sessionId)
}

/* 中断会话当前生成：先登记终止标记（Agent 未就绪也不会丢），再中止运行中的 Agent */
export async function abortAgent(sessionId: number): Promise<void> {
  abortedSessions.add(sessionId)
  const runtime = runtimes.get(sessionId)
  if (runtime) {
    try {
      const agent = await runtime
      agent.abort()
    } catch {
      /* Agent 创建失败无需中止 */
    }
  }
}

/* 清空全部运行时（退出时） */
export function resetAgents(): void {
  runtimes.clear()
}

/* 从异常对象中提取 HTTP 状态码 */
function statusOf(error: unknown): number | undefined {
  const value = error as {
    status?: unknown
    statusCode?: unknown
    code?: unknown
    response?: { status?: unknown }
    error?: { status?: unknown }
  }
  const candidates = [
    value?.status,
    value?.statusCode,
    value?.code,
    value?.response?.status,
    value?.error?.status
  ]
  for (const candidate of candidates) {
    const status = Number(candidate)
    if (Number.isInteger(status)) {
      return status
    }
  }
  return undefined
}

/* 是否为白名单内的不可重试错误（401 / 402 / 403 / 404） */
function isNonRetryable(error: unknown): boolean {
  const status = statusOf(error)
  if (status !== undefined) {
    return NON_RETRYABLE_STATUS.has(status)
  }
  const message = typeof error === 'string' ? error : (error as Error)?.message ?? ''
  if (/\b(?:HTTP|status(?:\s*code)?|API error)\s*[:=(]?\s*(401|402|403|404)\b/i.test(message)) {
    return true
  }
  if (/^\s*(?:Error:\s*)?(401|402|403|404)\b/i.test(message)) {
    return true
  }
  return /\b(401|402|403|404)\s+(Unauthorized|Payment Required|Forbidden|Not Found)\b/i.test(
    message
  )
}

/* 执行一轮对话：请求失败重试、长度截断/未知状态统一按 error 处理 */
export async function runPrompt(
  agent: Agent,
  text: string,
  sink: (event: HostEvent) => void,
  sessionId = 0,
  language: AppLanguage = 'zh'
): Promise<RuntimeMessage[]> {
  const tr = (key: string, params?: Array<string | number>): string =>
    translate(language, key, params)
  /* 采集目标：会话 + 对话来源（记忆生成使用独立目标，互不覆盖） */
  const traceTarget = createTraceTarget(sessionId)
  const unsubscribe = agent.subscribe((event) => {
    switch (event.type) {
      case 'message_update': {
        const inner = event.assistantMessageEvent
        if (inner.type === 'text_delta') {
          sink({ type: 'delta', text: inner.delta })
        } else if (inner.type === 'thinking_delta') {
          sink({ type: 'thinking', text: inner.delta })
        }
        break
      }
      case 'tool_execution_start':
        handleTraceToolStart(traceTarget, event.toolCallId, event.toolName, event.args)
        sink({
          type: 'tool_start',
          toolCallId: event.toolCallId,
          toolName: event.toolName,
          args: event.args
        })
        break
      case 'tool_execution_end':
        handleTraceToolEnd(traceTarget, event.toolCallId, {
          isError: event.isError,
          text: toolResultText(event.result),
          durationMs: event.durationMs
        })
        sink({
          type: 'tool_end',
          toolCallId: event.toolCallId,
          toolName: event.toolName,
          isError: event.isError,
          result: toolResultText(event.result),
          details: (event.result as { details?: unknown } | undefined)?.details,
          durationMs: event.durationMs
        })
        break
      case 'message_end': {
        handleTraceMessageEnd(traceTarget, event.message)
        /* 每次模型响应结束回传上下文用量，供顶栏实时展示占用占比 */
        const used = contextTokensOf(event.message)
        if (used > 0) {
          const breakdown = contextBreakdownOf(agent, used)
          sink({
            type: 'usage',
            used,
            window: agent.state.model.contextWindow,
            ...breakdown
          })
        }
        break
      }
      default:
        break
    }
  })

  let failures = 0
  let first = true
  const start = (agent.state.messages as RuntimeMessage[]).length
  const takeNew = (): RuntimeMessage[] =>
    (agent.state.messages as RuntimeMessage[]).slice(start)
  try {
    while (true) {
      if (sessionId && isSessionAborted(sessionId)) {
        appendAbortNote(agent, start, tr('runtime.abortNote'))
        sink({ type: 'notice', message: tr('runtime.abortNote') })
        sink({ type: 'done' })
        return takeNew()
      }

      let thrown: unknown = null
      const continuePrompt = !first
      const promptText = first ? text : tr('runtime.continuePrompt')
      const beforeCount = (agent.state.messages as RuntimeMessage[]).length
      first = false
      try {
        await agent.prompt(promptText)
      } catch (error) {
        thrown = error
      } finally {
        /* 续写提示由运行时注入：标记后落库时不进入界面、不切分轮次 */
        if (continuePrompt) {
          markRuntimePrompt(agent, beforeCount, 'runtime:continue')
        }
      }

      /* 用户终止：直接结束 */
      if (thrown && (isAbortError(thrown) || (sessionId && isSessionAborted(sessionId)))) {
        appendAbortNote(agent, start, tr('runtime.abortNote'))
        sink({ type: 'notice', message: tr('runtime.abortNote') })
        sink({ type: 'done' })
        return takeNew()
      }

      const last = lastAssistant(agent)
      const reason = thrown ? 'exception' : last?.stopReason

      /* 模型明确结束 */
      if (reason === 'stop') {
        sink({ type: 'done' })
        return takeNew()
      }

      /* 用户终止：写入终止备注后结束 */
      if (reason === 'aborted') {
        appendAbortNote(agent, start, tr('runtime.abortNote'))
        sink({ type: 'notice', message: tr('runtime.abortNote') })
        sink({ type: 'done' })
        return takeNew()
      }

      /* 所有异常统一按 error 处理：正文备注原因 + 重试 5 次 */
      const detail = thrown
        ? (thrown as Error)?.message || String(thrown)
        : reason === 'length'
          ? tr('runtime.truncated')
          : reason === 'error'
            ? last?.errorMessage || tr('runtime.modelError')
            : tr('runtime.unknownState', [reason || 'unknown'])

      /* 当前助手消息标记为 error，并写入可读原因 */
      if (!thrown && last) {
        last.stopReason = 'error'
        last.errorMessage = detail
      }

      /* 不可重试错误（401/402/403/404）：直接结束 */
      if (!thrown && isNonRetryable(detail)) {
        const note = `\n\n${tr('runtime.nonRetryable', [detail])}`
        appendAssistantNote(agent, note, !thrown, 'error')
        sink({ type: 'error', message: note })
        return takeNew()
      }

      failures += 1
      const appendToLast = !thrown
      const final = failures > MAX_REQUEST_RETRIES
      const note = final
        ? `\n\n${tr('runtime.final', [MAX_REQUEST_RETRIES + 1, detail])}`
        : `\n\n${tr('runtime.retry', [failures, detail])}`
      appendAssistantNote(agent, note, appendToLast, 'error')

      if (final) {
        sink({ type: 'error', message: note })
        return takeNew()
      }

      /* 非致命异常：界面标记错误备注，本轮继续 */
      sink({ type: 'notice', message: note })
      if (thrown && !hasUserText(agent, text)) {
        first = true
      }
      await sleep(RETRY_DELAY_MS)
    }
  } finally {
    unsubscribe()
  }
  return takeNew()
}

/* 汇总工具结果为纯文本（仅取文本内容块，供 UI 展开查看） */
function toolResultText(result: unknown): string {
  const content = (result as { content?: unknown })?.content
  if (typeof content === 'string') {
    return content
  }
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === 'string') {
          return part
        }
        return (part as { type?: string; text?: string }).type === 'text'
          ? ((part as { text?: string }).text ?? '')
          : ''
      })
      .filter((item) => item !== '')
      .join('\n')
  }
  return ''
}
