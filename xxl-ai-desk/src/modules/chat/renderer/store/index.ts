/*
 * 对话状态：会话列表、当前会话消息、流式生成与事件订阅
 */

import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { t } from '@renderer/shell/i18n'
import { api } from '@common/renderer/api'
import { useProjectStore } from '@modules/project/renderer'
import { useAgentStore } from '@modules/agent/renderer'
import { useSettingsStore } from '@modules/settings/renderer'
import { useProviderStore } from '@modules/provider/renderer'
import type { ContextBreakdown, ReasoningLevel } from '@common/shared/model'
import { DRAFT_SESSION_KEY, useToolPanelStore } from '@modules/toolPanel/renderer'
import { clearLastSessionId, readLastSessionId, writeLastSessionId } from '@modules/chat/renderer/store/lastSession'
import { mapStoredMessages, nextLocalMessageId, appendPart, refreshContent } from '@modules/chat/renderer/store/messageMapping'
import { createChatStream } from '@modules/chat/renderer/store/stream'
import { computeSessionMetrics, computeTokenUsage } from '@modules/chat/renderer/utils/sessionMetrics'
import { NEW_CHAT_TITLE } from '@modules/settings/shared'
import {
  DEFAULT_PERMISSION_MODE,
  type ChatInteractionCancel,
  type ChatInteractionPrompt,
  type InteractionResult,
  type PermissionMode,
  type SessionDTO
} from '@modules/chat/shared'
import type { UiMessage } from '@modules/chat/renderer/types'

/* 会话与对话状态 */
export const useChatStore = defineStore('chat', () => {
  /* 会话列表（最近更新优先） */
  const sessions = ref<SessionDTO[]>([])
  /* 当前选中会话 id；空串表示处于「新建对话」草稿态 */
  const currentId = ref(0)
  /* 当前会话的消息列表（UI 渲染用） */
  const messages = ref<UiMessage[]>([])
  /* 当前会话消息加载中标记（启动时先视为加载中，避免闪出新建对话空态） */
  const loading = ref(true)
  /* 应用启动引导中：恢复最后会话完成前保持加载态 */
  const bootstrapping = ref(true)
  /* 对话事件监听解绑函数（避免重复绑定） */
  let unbind: (() => void) | null = null

  /* 正在生成的会话集合（响应式）：支持多会话并发生成、互不阻塞 */
  const streamingIds = ref<Record<number, boolean>>({})
  /* 流式状态机：缓冲、目标消息与多会话内存缓存 */
  const stream = createChatStream({ currentId, messages, streamingIds })

  /*
   * 人机交互按会话隔离：其它会话的待响应请求不占用当前输入区，
   * 切回对应会话时再展示，避免跨会话相互影响。
   */
  const interactions = ref<Record<number, ChatInteractionPrompt[]>>({})

  /* 当前会话是否正在生成（组件据此展示停止/禁用发送；其它会话不受影响） */
  const streaming = computed(() => Boolean(currentId.value && streamingIds.value[currentId.value]))

  /* 当前会话对象（未选中为 null） */
  const currentSession = computed(
    () => sessions.value.find((item) => item.id === currentId.value) ?? null
  )

  /* 当前会话待响应的交互（取队首） */
  const currentInteraction = computed<ChatInteractionPrompt | null>(
    () => interactions.value[currentId.value]?.[0] ?? null
  )

  /* 当前会话排队等待的交互数量 */
  const currentInteractionCount = computed(
    () => interactions.value[currentId.value]?.length ?? 0
  )

  /* 当前会话的上下文占用：取最近一次带用量的助手消息；无用量时不展示 */
  const contextUsage = computed<{
    used: number
    window: number | null
    breakdown: ContextBreakdown | null
  } | null>(() => {
    for (let index = messages.value.length - 1; index >= 0; index -= 1) {
      const message = messages.value[index]
      if (message.role === 'assistant' && message.contextTokens) {
        /* 窗口优先取当前会话模型配置，缺失时回退事件值；均缺失视为未知，不猜测默认值 */
        const session = currentSession.value
        const provider = session
          ? useProviderStore().providers.find((item) => item.id === session.providerId)
          : undefined
        const modelWindow = provider?.models.find((item) => item.id === session?.modelId)
          ?.contextWindow
        const window = Number(modelWindow) || Number(message.contextWindow) || 0
        return {
          used: message.contextTokens,
          window: window > 0 ? window : null,
          breakdown: currentSession.value?.contextBreakdown ?? null
        }
      }
    }
    return null
  })

  /* 当前会话统计：轮次 / 步数 / 模型与工具耗时 / 输出速度（由已加载消息聚合） */
  const sessionMetrics = computed(() => computeSessionMetrics(messages.value))

  /* 当前会话 Token 用量：分项与缓存命中率（由已加载消息聚合） */
  const tokenUsage = computed(() => computeTokenUsage(messages.value))

  /* 加载会话列表 */
  async function loadSessions(): Promise<void> {
    sessions.value = await api.session.list()
  }

  /* 启动定位会话：优先恢复最近打开的会话（记录丢失时回落最近更新的会话）；
   * 无任何历史会话则进入新建对话页面。 */
  async function restoreLastSession(): Promise<void> {
    loading.value = true
    const lastId = readLastSessionId()
    const target = sessions.value.find((item) => item.id === lastId) || sessions.value[0]
    if (target) {
      await selectSession(target.id)
      return
    }
    startNewChat()
  }

  /* 启动引导结束：退出全局加载态（异常中断时也保证界面可用） */
  function finishBootstrap(): void {
    bootstrapping.value = false
    loading.value = false
  }

  /* 记住当前会话：选中/新建会话后写入本地，供下次启动默认定位（草稿态不写入） */
  watch(currentId, (id) => {
    if (id) {
      writeLastSessionId(id)
    }
  })

  /* 重新加载会话并校正当前会话（项目级联删除后调用） */
  async function reloadSessions(): Promise<void> {
    await loadSessions()
    pruneInteractions(sessions.value.map((item) => item.id))
    if (currentId.value && !sessions.value.some((item) => item.id === currentId.value)) {
      currentId.value = 0
      messages.value = []
    }
  }

  /* 选择会话并加载消息 */
  async function selectSession(id: number): Promise<void> {
    currentId.value = id
    const target = sessions.value.find((item) => item.id === id)
    if (target) {
      useProjectStore().selectProject(target.projectId)
      useAgentStore().selectAgent(target.agentId)
    }
    loading.value = true
    try {
      /* 生成中的会话：直接还原其内存消息（含用户消息与已流出的思考/工具/正文），避免切回即空白 */
      const live = stream.liveMessagesOf(id)
      if (streamingIds.value[id] && live) {
        messages.value = live
        return
      }
      const stored = await api.session.messages(id)
      const list = mapStoredMessages(stored)
      /* 生成中但无内存缓存（如应用重启后）：补一个占位助手消息，使后续增量继续流入 */
      const targetId = stream.targetIdOf(id)
      if (streamingIds.value[id] && targetId && !list.some((item) => item.id === targetId)) {
        list.push({
          id: targetId,
          role: 'assistant',
          content: '',
          parts: [],
          addTime: new Date().toISOString(),
          startedAt: Date.now(),
          pending: true
        })
        stream.setLiveMessages(id, list)
      }
      messages.value = list
    } catch (error) {
      /* 加载失败要显式提示，避免界面只停在空态且无任何反馈 */
      messages.value = []
      ElMessage.error(t('chat.loadMessagesFailed', [(error as Error).message]))
    } finally {
      loading.value = false
    }
  }

  /* 新建会话（归属当前选中项目与 Agent，默认工作区内修改权限） */
  async function createSession(
    projectId?: number,
    permissionMode: PermissionMode = DEFAULT_PERMISSION_MODE,
    agentId?: number
  ): Promise<SessionDTO> {
    const settings = useSettingsStore()
    const project = useProjectStore()
    const agent = useAgentStore()
    const targetProjectId = projectId ?? project.currentId
    const targetAgentId = agentId ?? agent.currentId ?? agent.defaultAgent?.id ?? 0
    const session = await api.session.create({
      title: NEW_CHAT_TITLE,
      projectId: targetProjectId,
      agentId: targetAgentId,
      providerId: settings.settings.providerId,
      modelId: settings.settings.modelId,
      reasoningLevel: settings.settings.reasoningLevel,
      permissionMode
    })
    sessions.value = [session, ...sessions.value]
    currentId.value = session.id
    messages.value = []
    agent.selectAgent(session.agentId)
    /* 草稿工具面板迁移给新建会话：切回该会话时保留开新对话前的面板状态 */
    useToolPanelStore().adoptDraft(session.id)
    return session
  }

  /* 进入新对话草稿态：不立即落库，首次发送时才创建会话（避免空对话被反复创建） */
  function startNewChat(): void {
    /* 允许在其它会话生成时进入新对话草稿：各会话生成状态相互独立 */
    currentId.value = 0
    messages.value = []
    loading.value = false
    /* 新建对话默认选中排序第一个项目与默认 Agent */
    useProjectStore().selectFirstProject()
    useAgentStore().selectDefaultAgent()
    /* 确保草稿工具面板状态已创建（含本地持久化恢复） */
    useToolPanelStore().ensure(DRAFT_SESSION_KEY)
  }

  /* 删除会话 */
  async function removeSession(id: number): Promise<void> {
    await api.session.remove(id)
    /* 清理该会话的生成缓存、流式状态与人机交互队列 */
    stream.discard(id)
    delete streamingIds.value[id]
    clearSessionInteractions(id)
    sessions.value = sessions.value.filter((item) => item.id !== id)
    /* 该会话的工具面板 / 浏览器 / 对话 UI 资源由 useSessionLifecycle 统一回收 */
    /* 清除「最后会话」记录：避免下次启动定位到已删除的会话 */
    clearLastSessionId(id)
    if (currentId.value === id) {
      currentId.value = 0
      messages.value = []
      /* 优先定位有归属项目的会话（无归属的历史会话不展示） */
      const next = sessions.value.find((item) => item.projectId)
      if (next) {
        await selectSession(next.id)
      }
    }
  }

  /* 重命名会话 */
  async function renameSession(id: number, title: string): Promise<void> {
    await api.session.rename(id, title)
    const target = sessions.value.find((item) => item.id === id)
    if (target) {
      target.title = title
    }
  }

  /* 选择模型：写入全局默认值（下次新建对话沿用），并同步当前会话配置 */
  async function selectModel(providerId: number, modelId: string): Promise<void> {
    const settings = useSettingsStore()
    await settings.saveSettings({ providerId, modelId })
    if (!currentId.value) {
      return
    }
    const updated = await api.session.update(currentId.value, { providerId, modelId })
    const target = sessions.value.find((item) => item.id === updated.id)
    if (target) {
      target.providerId = updated.providerId
      target.modelId = updated.modelId
    }
  }

  /* 切换当前会话的推理等级：同时记住全局默认，新建对话沿用 */
  async function updateSessionReasoningLevel(reasoningLevel: ReasoningLevel): Promise<void> {
    await useSettingsStore().saveSettings({ reasoningLevel })
    if (!currentId.value) {
      return
    }
    const updated = await api.session.update(currentId.value, { reasoningLevel })
    const target = sessions.value.find((item) => item.id === updated.id)
    if (target) {
      target.reasoningLevel = updated.reasoningLevel
    }
  }

  /* 切换当前会话的权限模式 */
  async function updateSessionPermissionMode(permissionMode: PermissionMode): Promise<void> {
    if (!currentId.value) {
      return
    }
    const updated = await api.session.update(currentId.value, { permissionMode })
    const target = sessions.value.find((item) => item.id === updated.id)
    if (target) {
      target.permissionMode = updated.permissionMode
    }
  }

  /* 从任意会话队列移除指定请求 */
  function dropInteraction(requestId: string): void {
    const next = { ...interactions.value }
    let changed = false
    for (const [key, queue] of Object.entries(next)) {
      const filtered = queue.filter((item) => item.requestId !== requestId)
      if (filtered.length === queue.length) {
        continue
      }
      changed = true
      if (filtered.length > 0) {
        next[Number(key)] = filtered
      } else {
        delete next[Number(key)]
      }
    }
    if (changed) {
      interactions.value = next
    }
  }

  /* 收到交互请求：只进入所属会话队列，不打断其它会话 */
  function onInteraction(prompt: ChatInteractionPrompt): void {
    const queue = interactions.value[prompt.sessionId] ?? []
    if (queue.some((item) => item.requestId === prompt.requestId)) {
      return
    }
    interactions.value = {
      ...interactions.value,
      [prompt.sessionId]: [...queue, prompt]
    }
  }

  /* 运行时主动取消：移除对应请求 */
  function onInteractionCancel(payload: ChatInteractionCancel): void {
    dropInteraction(payload.requestId)
  }

  /* 回传用户应答：先移出队列，再交主进程唤醒工具调用 */
  function respondInteraction(requestId: string, result: InteractionResult): void {
    dropInteraction(requestId)
    void api.chat.respondInteraction(requestId, result)
  }

  /* 清理会话的交互队列（删除会话时调用） */
  function clearSessionInteractions(sessionId: number): void {
    if (!interactions.value[sessionId]) {
      return
    }
    const next = { ...interactions.value }
    delete next[sessionId]
    interactions.value = next
  }

  /* 清理已不存在会话的交互（项目级联删除等不经过 removeSession 的场景） */
  function pruneInteractions(validSessionIds: number[]): void {
    const valid = new Set(validSessionIds)
    const stale = Object.keys(interactions.value).filter((id) => !valid.has(Number(id)))
    if (stale.length === 0) {
      return
    }
    const next = { ...interactions.value }
    for (const id of stale) {
      delete next[Number(id)]
    }
    interactions.value = next
  }

  /* 绑定事件监听（幂等） */
  function bind(): void {
    if (unbind) {
      return
    }
    unbind = api.chat.onEvent((event) => {
      /* usage 事件实时同步会话分项：落库在主进程按轮完成，这里只更新当前列表视图 */
      if (event.type === 'usage') {
        const session = sessions.value.find((item) => item.id === event.sessionId)
        const { systemTokens, toolTokens, messageTokens } = event
        if (
          session &&
          typeof systemTokens === 'number' &&
          typeof toolTokens === 'number' &&
          typeof messageTokens === 'number'
        ) {
          session.contextBreakdown = { systemTokens, toolTokens, messageTokens }
        }
      }
      stream.handleEvent(event)
    })
    api.chat.onInteraction(onInteraction)
    api.chat.onInteractionCancel(onInteractionCancel)
  }

  /* 发送失败：提示并在当前流式助手气泡内追加可读错误 */
  function reportSendError(sessionId: number, assistantId: number, error: string): void {
    const tip = t('chat.sendFailed', [error])
    ElMessage.error(tip)
    const assistant = stream.assistantOf(sessionId)
    if (assistant && stream.targetIdOf(sessionId) === assistantId && currentId.value === sessionId) {
      appendPart(assistant, { type: 'text', text: tip, error: true })
      refreshContent(assistant)
      assistant.error = true
    }
  }

  /* 回读持久化消息：失败时保留内存内容并提示，避免界面被清空 */
  async function reloadStoredMessages(sessionId: number, assistantId: number): Promise<void> {
    try {
      const stored = await api.session.messages(sessionId)
      if (currentId.value === sessionId && stream.targetIdOf(sessionId) === assistantId) {
        messages.value = mapStoredMessages(stored)
      }
    } catch (error) {
      ElMessage.error(t('chat.loadMessagesFailed', [(error as Error).message]))
    }
  }

  /* 发送消息（新建会话时按传入权限创建，默认工作区内修改） */
  async function send(text: string, permissionMode: PermissionMode = DEFAULT_PERMISSION_MODE): Promise<void> {
    const content = text.trim()
    if (!content || streaming.value) {
      return
    }
    if (!currentId.value) {
      /* 强要求：新建会话必须先选择项目与 Agent */
      if (!useProjectStore().currentId || !useAgentStore().currentId) {
        return
      }
      await createSession(undefined, permissionMode)
    }
    const sessionId = currentId.value

    /* 首条消息：本地立即把会话标题更新为提问摘要，侧栏无需等待生成完成（后端亦同步落库） */
    const session = sessions.value.find((item) => item.id === sessionId)
    if (session && !session.title.trim()) {
      session.title = content.slice(0, 24)
    }

    const assistantMessage: UiMessage = {
      id: nextLocalMessageId(),
      role: 'assistant',
      content: '',
      parts: [],
      addTime: new Date().toISOString(),
      startedAt: Date.now(),
      pending: true
    }

    messages.value.push({
      id: nextLocalMessageId(),
      role: 'user',
      content,
      parts: [],
      addTime: new Date().toISOString()
    })
    messages.value.push(assistantMessage)
    streamingIds.value[sessionId] = true
    /* 开始本轮：登记流式目标并缓存消息数组（切走后仍持续累积） */
    stream.beginRound(sessionId, assistantMessage.id)

    let sendError = ''
    try {
      await api.chat.send({ sessionId, text: content })
    } catch (error) {
      sendError = (error as Error).message
    } finally {
      stream.flush(sessionId)
      delete streamingIds.value[sessionId]
      /* 本轮是否仍为该会话的当前流（避免被同一会话的新一轮取代） */
      const active = stream.targetIdOf(sessionId) === assistantMessage.id
      const assistant = stream.assistantOf(sessionId)
      if (assistant) {
        assistant.pending = false
      }
      if (sendError) {
        reportSendError(sessionId, assistantMessage.id, sendError)
      }
      /* 失败轮次未落库，回读会覆盖错误气泡；仅成功时刷新持久化结果 */
      if (active && currentId.value === sessionId && !sendError) {
        await reloadStoredMessages(sessionId, assistantMessage.id)
      }
      /* 本轮结束：内存缓存让位于持久化结果，后续切换按库回读 */
      stream.completeRound(sessionId, assistantMessage.id)
      try {
        await loadSessions()
      } catch {
        /* 会话列表刷新失败不覆盖当前对话界面 */
      }
    }
  }

  /* 删除指定消息：同步删除存储与前端渲染，并重建会话上下文 */
  async function removeMessages(ids: number[]): Promise<void> {
    if (!currentId.value || ids.length === 0) {
      return
    }
    await api.session.removeMessages(currentId.value, ids)
    const removed = new Set(ids)
    messages.value = messages.value.filter((item) => !removed.has(item.id))
    /* 主进程已清空会话分项：本地同步失效，避免删除后仍展示旧分项 */
    if (currentSession.value) {
      currentSession.value.contextBreakdown = null
    }
  }

  /* 中断生成 */
  async function abort(): Promise<void> {
    if (currentId.value) {
      await api.chat.abort(currentId.value)
    }
  }

  /* 指定会话是否正在生成（用于删除前提示） */
  function isStreaming(sessionId: number): boolean {
    return Boolean(streamingIds.value[sessionId])
  }

  return {
    sessions,
    currentId,
    messages,
    streaming,
    isStreaming,
    loading,
    bootstrapping,
    currentSession,
    contextUsage,
    sessionMetrics,
    tokenUsage,
    currentInteraction,
    currentInteractionCount,
    respondInteraction,
    loadSessions,
    reloadSessions,
    restoreLastSession,
    finishBootstrap,
    selectSession,
    createSession,
    startNewChat,
    removeSession,
    renameSession,
    selectModel,
    updateSessionReasoningLevel,
    updateSessionPermissionMode,
    removeMessages,
    send,
    abort,
    bind
  }
})
