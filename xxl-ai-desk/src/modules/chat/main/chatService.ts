/*
 * 对话业务服务：一轮对话的编排（校验会话与运行时目标、系统指令与模式拼接、历史装配、
 * 交运行时进程执行、流式事件下发与失败轮次落库）。
 *   - 属业务编排，落 services（business）；底层执行交 agent/host（harness）。
 *   - ipc.ts 仅负责通道注册与事件转发，保持薄网关。
 */

import { createHash } from 'crypto'
import log from 'electron-log/main'
import { trimHistory } from '@modules/chat/shared'
import { translate } from '@common/shared/i18n'
import type {
  ChatEvent,
  InteractionResult,
  MessageSource,
  PermissionMode,
  SessionDTO,
  SessionStatus
} from '@modules/chat/shared'
import type { AppSettings } from '@modules/settings/shared'
import type { ProviderDTO } from '@modules/provider/shared'
import { isSessionModel } from '@common/shared/model'
import type { ContextBreakdown } from '@common/shared/model'
import type { HostEvent, ProviderModelConfig, RunAgentInput } from '@modules/agent/shared'
import { getSettings } from '@modules/settings/main'
import { getProvider } from '@modules/provider/main'
import { listMcpRuntimeConfigs } from '@modules/mcp/main'
import { listSkillsForRuntime } from '@modules/skill/main'
import { appendTurnMessages, getSession, getSessionSummary, isSessionRemoved, listMessages, listMessagesAfter, listNewProjectMessages, replaceTurnMessages, saveSessionContextBreakdown, startTurn, updateSession, updateSessionStatus } from './sessionService'
import type { TurnMessageInput } from './sessionService'
import { buildSystemPrompt } from '@modules/chat/harness'
import { maybeCompressSession } from './sessionSummaryService'
import { getProject } from '@modules/project/main'
import { getAgentById, getAgentMemory, maybeGenerateAgentMemory } from '@modules/agent/main'
import { buildMcpRuntimePath, buildRuntimePath } from '@modules/platform/main'
import { getSkillsDir } from '@common/main/config/paths'
import { abortAgent, evictAgent, generateMemory, isAgentRunning, prepareAgentRuntime, runAgent } from '@modules/chat/harness'
import { cancelBrowserActionsOf } from '@modules/browser/main'
import { resolveInteraction, cancelInteractionsOf } from '@modules/chat/harness'

/* 下发到渲染层的对话事件负载：流式事件（含轮次开始）或运行时事件 */
export type ChatEventPayload = ChatEvent | ({ sessionId: number } & HostEvent)

/* 流式草稿落库间隔（毫秒）：把已生成但尚未结束的回复定期写入，进程异常时保留已输出内容 */
const DRAFT_PERSIST_INTERVAL = 3000

/* 已请求终止的会话：终止轮次不再展示/落库「调用失败」提示 */
const abortRequested = new Set<number>()
/* 已丢弃结果的会话：删除会话/清空消息后，正在运行的轮次不再回写，避免产生孤儿数据 */
const discardedSessions = new Set<number>()

/* 将 Agent 消息内容归一化为纯正文（用于落库预览与记忆转录）：只保留 text 块 */
function contentToText(message: unknown): string {
  const content = (message as { content?: unknown })?.content
  if (!Array.isArray(content)) {
    return ''
  }
  return content
    .map((part) => {
      const block = part as { type?: string; text?: string }
      /* thinking / toolCall / toolResult 不进入正文，避免思考与工具参数落库 */
      return block.type === 'text' ? (block.text ?? '') : ''
    })
    .join('')
}

/* 将底层异常翻译为可读提示：明确指向具体供应商与模型 */
function describeError(
  raw: string,
  providerName: string,
  modelId: string,
  language: string
): string {
  const message = (raw || '').trim()
  if (/api key/i.test(message)) {
    return translate(language, 'runtime.apiKeyMissing', [providerName, modelId])
  }
  return translate(language, 'runtime.callFailed', [
    modelId,
    providerName,
    message ? `：${message}` : ''
  ])
}

/*
 * 解析会话运行时目标：会话已绑定的供应商/模型若已被删除或停用，
 * 返回明确的错误提示要求用户重新选择（不做静默切换，避免用户不知情地换了模型）。
 * 仅当会话未指定模型时才回退到设置默认模型/供应商首个模型。
 */
function resolveRuntimeTarget(
  session: SessionDTO,
  settings: AppSettings,
  language: string
): { provider: ProviderDTO; model: string } | { error: string } {
  /* 供应商：会话已指定则必须仍存在且启用；未指定时回退设置默认供应商 */
  const providerId = session.providerId || settings.sessionDefaults.providerId
  const provider = providerId ? getProvider(providerId) : null
  if (!provider) {
    return { error: translate(language, 'runtime.providerMissing') }
  }
  if (!provider.enabled) {
    return { error: translate(language, 'runtime.providerDisabled', [provider.name]) }
  }
  /* 模型：会话已指定则必须仍在供应商模型列表内，否则提示更换 */
  if (session.modelId) {
    const bound = provider.models.find((item) => item.id === session.modelId)
    if (!bound) {
      return { error: translate(language, 'runtime.modelMissing', [session.modelId]) }
    }
    /* 嵌入 / 文生图模型不能用于对话，提示重新选择 */
    if (!isSessionModel(bound)) {
      return { error: translate(language, 'runtime.modelNotChat', [session.modelId]) }
    }
    return { provider, model: session.modelId }
  }
  /* 未指定模型：回退设置默认模型，其次供应商首个可对话模型 */
  const sessionModels = provider.models.filter((item) => isSessionModel(item))
  const fallback =
    settings.sessionDefaults.modelId &&
    sessionModels.some((item) => item.id === settings.sessionDefaults.modelId)
      ? settings.sessionDefaults.modelId
      : (sessionModels[0]?.id ?? '')
  if (!fallback) {
    return { error: translate(language, 'runtime.providerNoModel') }
  }
  return { provider, model: fallback }
}

/*
 * 运行时消息 → 落库行：data 保存 Pi 原始消息 JSON，content 只保留正文预览。
 * skipPrompt=true 时跳过本轮原始提问（主进程在发送时已单独落库）。
 */
function serializeRuntimeMessages(messages: unknown[], skipPrompt: boolean): TurnMessageInput[] {
  const list =
    skipPrompt && (messages[0] as { role?: string } | undefined)?.role === 'user'
      ? messages.slice(1)
      : messages
  return list
    .filter((message) => (message as { role?: string }).role !== 'system')
    .map((message) => {
      const role = (message as { role?: string }).role ?? ''
      const content = contentToText(message)
      /* 来源只做持久化字段，不写回 Agent 原始消息 JSON */
      const { source: sourceFlag, ...raw } = message as {
        role?: string
        source?: MessageSource
      } & Record<string, unknown>
      return {
        role,
        content,
        data: JSON.stringify(raw),
        timestamp: messageDisplayTime(raw),
        source: sourceFlag ?? null
      }
    })
}

/*
 * 失败轮次补齐错误提示：用户提问在发送时已落库，这里只向本轮追加助手提示，
 * 已完成的消息快照保持不变。
 */
function persistFailureTip(
  sessionId: number,
  turnId: number,
  tip: string,
  failedAt = Date.now()
): void {
  /* 会话已删除或结果已丢弃：不再写入 */
  if (discardedSessions.has(sessionId) || !getSession(sessionId)) {
    return
  }
  appendTurnMessages(sessionId, turnId, [
    {
      role: 'assistant',
      content: tip,
      data: JSON.stringify({
        role: 'assistant',
        content: [{ type: 'text', text: tip }],
        stopReason: 'error',
        errorMessage: tip,
        timestamp: failedAt
      }),
      timestamp: failedAt
    }
  ])
}

/* 应用退出导致本轮中断：追加终止备注，已完成的消息已由快照落库 */
function persistInterruptedTip(
  sessionId: number,
  turnId: number,
  language: AppSettings['language']
): void {
  if (discardedSessions.has(sessionId) || !getSession(sessionId)) {
    return
  }
  const endedAt = Date.now()
  const note = translate(language, 'runtime.interruptedNote')
  appendTurnMessages(sessionId, turnId, [
    {
      role: 'assistant',
      content: note,
      data: JSON.stringify({
        role: 'assistant',
        content: [{ type: 'text', text: note, error: true }],
        stopReason: 'aborted',
        timestamp: endedAt
      }),
      timestamp: endedAt
    }
  ])
}

/*
 * 消息展示时间：助手消息的 timestamp 是请求开始时刻，需叠加时长得到回复完成时刻；
 * 其余消息（用户 / 工具结果）timestamp 即自身产生时刻。
 */
function messageDisplayTime(message: unknown): number | undefined {
  const item = message as { timestamp?: number; durationMs?: number }
  if (typeof item.timestamp !== 'number') {
    return undefined
  }
  return item.timestamp + (typeof item.durationMs === 'number' ? item.durationMs : 0)
}

/* 归一化历史消息：剔除 system 与非数组 content（thinking 由 history 窗口统一处理） */
function normalizeHistoryMessage(raw: unknown): { role?: string; content?: unknown } | null {
  if (!raw || typeof raw !== 'object') {
    return null
  }
  const message = raw as { role?: string; content?: unknown }
  if (!message.role || message.role === 'system' || !Array.isArray(message.content)) {
    return null
  }
  return message
}

/* 供应商 DTO → Pi 运行时配置 */
function toRuntimeConfig(provider: ProviderDTO): ProviderModelConfig {
  return {
    id: provider.id,
    name: provider.name,
    baseUrl: provider.baseUrl,
    apiKey: provider.apiKey ?? '',
    headers: provider.headers,
    models: provider.models
  }
}

/*
 * 发送一轮对话：校验运行时目标 → 组装系统指令/历史 → 交运行时进程执行 →
 * 成功后以完整上下文覆盖落库；失败则落库可读提示并下发。
 * 流式事件经 emit 回调交给 ipc.ts 转发渲染层。
 */
export async function sendChat(
  input: { sessionId: number; text: string },
  emit: (payload: ChatEventPayload) => void
): Promise<void> {
  const { sessionId, text } = input
  /* 本轮发送时刻：失败轮次回写时用户提问仍取此刻，避免与错误提示显示为同一时间 */
  const startedAt = Date.now()
  const settings = getSettings()
  const language = settings.language
  /* 同一会话已有运行中的一轮：直接下发提示，不落库错误轮次 */
  if (isAgentRunning(sessionId)) {
    emit({ sessionId, type: 'error', message: translate(language, 'runtime.sessionBusy') })
    return
  }
  /* 新一轮开始：清除上一轮的终止/丢弃标记 */
  abortRequested.delete(sessionId)
  discardedSessions.delete(sessionId)
  /* 供应商/模型就绪后，错误提示统一带上「供应商 + 模型」上下文 */
  let providerName = ''
  let modelId = ''
  let contextReady = false
  /* 本轮是否已完整落库；异常兜底据此避免重复追加失败轮次 */
  let committed = false
  /* 本轮轮次 ID：用户提问落库后回填，助手 / 工具消息统一挂到该轮次 */
  let turnId = 0
  /* 本轮最后一次上下文用量：对话结束后用于判断是否触发会话压缩 */
  let roundUsage: { used: number; window: number } | null = null
  /* 本轮最后一次上下文分项：结束时写入会话表 */
  let roundBreakdown: ContextBreakdown | null = null
  /* 本轮已完成的运行时消息快照（checkpoint 回传） */
  let roundSnapshot: unknown[] = []
  /* 当前流式回复的草稿片段：只有正文 / 思考，不含未完成的工具调用 */
  const draftParts: Array<{ type: 'text' | 'thinking'; text: string }> = []
  let draftTimer: ReturnType<typeof setTimeout> | null = null
  /* 追加流式片段：同类型相邻合并，保持发生顺序 */
  const appendDraft = (type: 'text' | 'thinking', text: string): void => {
    if (!text) {
      return
    }
    const last = draftParts[draftParts.length - 1]
    if (last && last.type === type) {
      last.text += text
      return
    }
    draftParts.push({ type, text })
  }
  /* 草稿消息：与 Pi 正文 / 思考块同构，不含工具调用（避免中断后上下文出现半截工具调用） */
  const draftMessage = (): unknown => ({
    role: 'assistant',
    content: draftParts.map((part) =>
      part.type === 'text'
        ? { type: 'text', text: part.text }
        : { type: 'thinking', thinking: part.text }
    ),
    timestamp: startedAt
  })
  /*
   * 消息快照落库：运行时每完成一条消息回传本轮全部新增消息，
   * 这里按快照覆盖本轮助手 / 工具消息，进程异常时数据库保留最近一次完整内容。
   */
  const persistRound = (): void => {
    if (
      !turnId ||
      discardedSessions.has(sessionId) ||
      isSessionRemoved(sessionId) ||
      !getSession(sessionId)
    ) {
      return
    }
    const messages = draftParts.length > 0 ? [...roundSnapshot, draftMessage()] : roundSnapshot
    try {
      replaceTurnMessages(sessionId, turnId, serializeRuntimeMessages(messages, true))
    } catch (error) {
      /* 快照落库失败不阻断本轮：结束时还会按最终结果再写一次 */
      log.warn(`[chat] 轮次快照落库失败 session=${sessionId}`, error)
    }
  }
  /* 流式过程中定期落库草稿：长回复在执行中途异常时也能恢复已输出内容 */
  const scheduleDraftPersist = (): void => {
    if (draftTimer !== null) {
      return
    }
    draftTimer = setTimeout(() => {
      draftTimer = null
      persistRound()
    }, DRAFT_PERSIST_INTERVAL)
  }
  const persistCheckpoint = (messages: unknown[]): void => {
    /* 快照已包含刚完成的消息，草稿内容不再重复落库 */
    roundSnapshot = messages
    draftParts.length = 0
    persistRound()
  }
  const emitEvent = (event: HostEvent): void => {
    /* 会话已删除：迟到的流式/错误事件一律丢弃，避免渲染层重建已删会话状态 */
    if (isSessionRemoved(sessionId)) {
      return
    }
    /* 快照事件只用于落库，不转发渲染层 */
    if (event.type === 'checkpoint') {
      persistCheckpoint(event.messages)
      return
    }
    /* 记录流式草稿：长回复中途异常时仍能恢复已输出内容 */
    if (event.type === 'delta') {
      appendDraft('text', event.text)
      scheduleDraftPersist()
    } else if (event.type === 'thinking') {
      appendDraft('thinking', event.text)
      scheduleDraftPersist()
    }
    /* 记录上下文用量，供本轮结束后的压缩判定与会话分项写入使用 */
    if (event.type === 'usage') {
      const { systemTokens, toolTokens, messageTokens } = event
      roundUsage = { used: event.used, window: event.window }
      roundBreakdown =
        typeof systemTokens === 'number' &&
        typeof toolTokens === 'number' &&
        typeof messageTokens === 'number'
          ? { systemTokens, toolTokens, messageTokens }
          : null
    }
    /* 用户已终止：错误事件转成正常结束，避免弹出「调用失败」 */
    if (event.type === 'error' && abortRequested.has(sessionId)) {
      emit({ sessionId, type: 'done' })
      return
    }
    const payload =
      event.type === 'error' && contextReady
        ? { ...event, message: describeError(event.message, providerName, modelId, language) }
        : event
    emit({ sessionId, ...payload })
  }
  /* 会话状态：Loop 状态及时落库，并同步渲染层侧栏 / 状态条 */
  const setStatus = (status: SessionStatus): void => {
    updateSessionStatus(sessionId, status)
    if (!isSessionRemoved(sessionId)) {
      emit({ sessionId, type: 'status', status })
    }
  }

  /* 失败兜底：把可读错误提示落到本轮并下发，避免重载/切换会话后提示丢失 */
  const fail = (raw: string): void => {
    const tip = contextReady ? describeError(raw, providerName, modelId, language) : raw
    /* 失败前已产生用量：仍保留最近一次分项，避免面板回退成无数据 */
    saveSessionContextBreakdown(sessionId, roundBreakdown)
    setStatus('failed')
    if (!committed && turnId) {
      /* 先把已输出的草稿落库，再追加可读错误提示 */
      if (draftParts.length > 0) {
        persistRound()
      }
      persistFailureTip(sessionId, turnId, tip, Date.now())
      committed = true
    }
    emitEvent({ type: 'error', message: tip })
  }

  try {
    const session = getSession(sessionId)
    if (!session) {
      emitEvent({ type: 'error', message: translate(language, 'runtime.sessionMissing') })
      return
    }
    /* 首次对话立即以提问作为会话标题并落库：不等到生成结束，避免侧栏长时间停留在「新对话」 */
    if (!session.title.trim()) {
      updateSession(sessionId, { title: text.slice(0, 24) })
    }
    /*
     * 提问先落库，再进入模型执行：长轮次或进程异常退出时，
     * 用户已发送的内容与后续消息快照都能在重载后恢复。
     */
    turnId = startTurn(sessionId, text, startedAt)
    /*
     * 轮次开始：手动发送与定时任务统一走此事件。
     * 渲染层发起的轮次已本地占位（streamingIds 去重）；主进程发起的轮次据此补建消息并接入流式。
     */
    emit({ sessionId, type: 'turn-start', userText: text, startedAt })
    setStatus('running')

    /* 会话引用的供应商/模型若已删除或停用，直接提示用户重新选择，不做静默切换 */
    const target = resolveRuntimeTarget(session, settings, language)
    if ('error' in target) {
      fail(target.error)
      return
    }
    const { provider, model } = target

    providerName = provider.name
    modelId = model
    contextReady = true

    /* 权限模式与文件沙箱边界：会话必须绑定有效项目，禁止回退主目录造成沙箱扩大 */
    const permissionMode = session.permissionMode
    const project = session.projectId ? getProject(session.projectId) : null
    if (!project) {
      fail(translate(language, 'runtime.projectMissing'))
      return
    }
    const rootDir = project.path

    /* 会话绑定的 Agent：创建会话时已校验存在，缺失即视为数据异常 */
    const agent = getAgentById(session.agentId)
    if (!agent) {
      fail(translate(language, 'runtime.error.agentMissing'))
      return
    }

    /* 技能 / MCP 清单：只取当前 Agent 选中的资源，摘要随系统提示下发，正文由 read_skill 按需读取 */
    const skills = listSkillsForRuntime().filter((item) => agent.skillIds.includes(item.id))
    const mcpServers = listMcpRuntimeConfigs().filter((item) => agent.mcpIds.includes(item.id))
    /* Agent 记忆：项目开启记忆时注入，作为可能过时的历史事实，冲突以当前指令为准 */
    /* 注意：系统提示词在会话 Agent 创建时固化，以下来源统一计入运行时指纹，变化后下一轮自动重建 */
    const memory = project.memoryEnabled ? getAgentMemory(project.id) : ''
    /* 会话摘要：历史轮次压缩后的结论；已有摘要时只传摘要与上次摘要后的增量消息 */
    const summary = getSessionSummary(sessionId)
    const systemPrompt = buildSystemPrompt({
      language,
      agentInstruction: agent.systemPrompt || '',
      memory,
      summary: summary.summary,
      skills,
      mcpServers,
      permissionMode,
      tools: agent.tools
    })
    /* 历史消息不携带 system 提示：系统指令始终取当前设置，保证旧对话也随设置变更生效 */
    /* 模型上下文与完整历史分离：无摘要时取最近窗口，有摘要时取上次摘要后的全部增量 */
    const historyRows = summary.summary
      ? listMessagesAfter(sessionId, summary.lastMessageId)
      : listMessages(sessionId)
    const history = trimHistory(
      historyRows
        .map((message) => ({
          message: (() => {
            try {
              return normalizeHistoryMessage(JSON.parse(message.data))
            } catch {
              return null
            }
          })(),
          source: message.source
        }))
        .filter((item) => item.message !== null),
      settings.language,
      Boolean(summary.summary)
    )

    /*
     * 运行时装配指纹：Agent 指令 / 记忆 / 摘要 / SKILL / MCP / 权限 / 内置工具 / 供应商任一变化，
     * 下一轮自动重建会话 Agent；配置模块只负责数据，不参与 Loop 缓存失效。
     */
    const runtimeFingerprint = createHash('sha1')
      .update(
        JSON.stringify({
          provider: toRuntimeConfig(provider),
          modelId,
          reasoningLevel: session.reasoningLevel,
          systemPrompt,
          permissionMode,
          rootDir,
          mcpServers,
          skills,
          skillsDir: getSkillsDir(),
          tools: agent.tools,
          language: settings.language
        })
      )
      .digest('hex')

    /* 交运行时进程执行：只下发模型上下文，结束后回传本轮新增消息供追加落库 */
    const runInput: RunAgentInput = {
      sessionId,
      provider: { ...toRuntimeConfig(provider), sessionId },
      modelId,
      reasoningLevel: session.reasoningLevel,
      systemPrompt,
      messages: history,
      language: settings.language,
      permissionMode,
      rootDir,
      runtimeFingerprint,
      runtimePath: buildRuntimePath(),
      mcpRuntimePath: buildMcpRuntimePath(),
      /* MCP：只下发 Agent 选中的服务，运行时进程按配置装配工具 */
      mcpServers,
      /* SKILL：Agent 选中的技能索引，运行时进程据此装配 read_skill */
      skills,
      /* SKILL：技能根目录，文件工具读取技能库不触发越界审批 */
      skillsDir: getSkillsDir(),
      /* 内置工具：由 Agent 配置决定下发的工具域 */
      tools: agent.tools,
      text,
      /* 开发者模式：开启后采集模型通讯 trace，主进程落库供「会话日志」展示 */
      traceEnabled: settings.developerMode
    }
    /*
     * 运行时冷启动期间会话可能已被删除：先等进程就绪，再复核一次，
     * 避免删除后仍发起模型请求或执行工具（删除先于本轮登记时 abort 会被 worker 清掉）。
     */
    try {
      await prepareAgentRuntime()
    } catch {
      /* 启动失败交给 runAgent 统一回报失败 */
    }
    if (discardedSessions.has(sessionId) || isSessionRemoved(sessionId) || !getSession(sessionId)) {
      emitEvent({ type: 'done' })
      return
    }
    const result = await runAgent(runInput, emitEvent)
    if (!result.ok) {
      /* 应用退出导致的中断：已完成消息已在库中，补写草稿后追加终止备注 */
      if (result.interrupted) {
        if (draftParts.length > 0) {
          persistRound()
        }
        persistInterruptedTip(sessionId, turnId, settings.language)
        setStatus('failed')
        committed = true
        return
      }
      /* 运行时构建/执行异常（如模型未找到）：先落日志，再以错误消息回给用户 */
      log.error(
        `[chat] 运行时执行失败 session=${sessionId} provider=${providerName} model=${modelId}`,
        result.message
      )
      fail(result.message)
      return
    }

    /* 会话已被删除或本轮结果已被丢弃：跳过落库，避免孤儿消息 */
    if (discardedSessions.has(sessionId) || !getSession(sessionId)) {
      return
    }
    /* 最终落库：按本轮完整快照覆盖助手 / 工具消息（用户提问行保持不变） */
    replaceTurnMessages(sessionId, turnId, serializeRuntimeMessages(result.messages, true))
    setStatus('completed')
    committed = true
    /* 会话只保留最近一次分项：不写入消息原始数据，切会话 / 重启后由会话表还原 */
    saveSessionContextBreakdown(sessionId, roundBreakdown)
    /* 会话压缩异步执行：满足无摘要 / 上下文 ≥80% / 摘要后轮次 ≥20 才真正压缩，失败不阻断对话 */
    void maybeCompressSession({ sessionId, usage: roundUsage }).catch((error) => {
      log.warn(`[chat] 会话摘要生成异常 session=${sessionId}`, error)
    })
    /* 记忆生成异步执行：会话数据由本域提供，避免 agent 反向依赖 chat；失败只记日志（保留旧记忆） */
    void maybeGenerateAgentMemory({
      session,
      loadPendingMessages: (since) => listNewProjectMessages(session.projectId, since),
      /* 记忆写入前复核来源会话：删除会话后不再把其内容并入项目记忆 */
      isSessionActive: (id) => !isSessionRemoved(id) && Boolean(getSession(id)),
      generate: (input) => generateMemory(input)
    }).catch((error) => {
      log.warn(`[chat] 记忆生成异常 session=${sessionId}`, error)
    })
  } catch (error) {
    /* 主进程侧异常（读库/落库等）：记录堆栈、清理运行时缓存并落库错误提示 */
    log.error(`[chat] 本轮执行异常 session=${sessionId}`, error)
    evictAgent(sessionId)
    fail((error as Error).message)
  } finally {
    /* 本轮结束：清理会话级标记与草稿定时器，避免长期累积 */
    if (draftTimer !== null) {
      clearTimeout(draftTimer)
      draftTimer = null
    }
    /* 用户主动终止本轮：广播终止事件，供定时任务运行器区分「已终止」与「成功」 */
    if (abortRequested.has(sessionId) && !isSessionRemoved(sessionId)) {
      setStatus('aborted')
      emit({ sessionId, type: 'aborted' })
    }
    abortRequested.delete(sessionId)
    discardedSessions.delete(sessionId)
  }
}

/* 中止指定会话的当前生成 */
export async function abortChat(sessionId: number): Promise<void> {
  abortRequested.add(sessionId)
  /* 先移除该会话仍展示的交互面板与挂起的浏览器动作，再通知运行时代为结算 */
  cancelInteractionsOf(sessionId)
  cancelBrowserActionsOf(sessionId)
  await abortAgent(sessionId)
}

/* 丢弃指定会话正在运行/后续回写的结果（删除会话、清空消息时调用） */
export function discardSessionRuns(sessionId: number): void {
  discardedSessions.add(sessionId)
}

/* 回传人机交互结果（唤醒运行时进程中等待的工具调用） */
export function respondInteraction(requestId: string, result: InteractionResult): void {
  resolveInteraction(requestId, result)
}
