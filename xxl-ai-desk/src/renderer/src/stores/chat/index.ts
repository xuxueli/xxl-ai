/*
 * 对话状态：会话列表、当前会话消息、流式生成与事件订阅
 */

import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import { api } from '@renderer/api'
import { useProjectStore } from '../project'
import { useSettingsStore } from '../settings'
import { DRAFT_SESSION_KEY, useToolPanelStore } from '../toolPanel'
import { clearLastSessionId, readLastSessionId, writeLastSessionId } from './lastSession'
import { mapStoredMessages, uid } from './messageMapping'
import { createChatStream } from './stream'
import { NEW_CHAT_TITLE } from '@shared/ipc'
import type { ChatMode, SessionDTO } from '@shared/ipc'
import type { UiMessage } from '@renderer/types'

/* 会话与对话状态 */
export const useChatStore = defineStore('chat', () => {
  /* 会话列表（最近更新优先） */
  const sessions = ref<SessionDTO[]>([])
  /* 当前选中会话 id；空串表示处于「新建对话」草稿态 */
  const currentId = ref('')
  /* 当前会话的消息列表（UI 渲染用） */
  const messages = ref<UiMessage[]>([])
  /* 当前会话消息加载中标记 */
  const loading = ref(false)
  /* 对话事件监听解绑函数（避免重复绑定） */
  let unbind: (() => void) | null = null

  /* 正在生成的会话集合（响应式）：支持多会话并发生成、互不阻塞 */
  const streamingIds = ref<Record<string, boolean>>({})
  /* 流式状态机：缓冲、目标消息与多会话内存缓存 */
  const stream = createChatStream({ currentId, messages, streamingIds })

  /* 当前会话是否正在生成（组件据此展示停止/禁用发送；其它会话不受影响） */
  const streaming = computed(() => Boolean(currentId.value && streamingIds.value[currentId.value]))

  /* 当前会话对象（未选中为 null） */
  const currentSession = computed(
    () => sessions.value.find((item) => item.id === currentId.value) ?? null
  )

  /* 加载会话列表 */
  async function loadSessions(): Promise<void> {
    sessions.value = await api.session.list()
  }

  /*
   * 启动定位会话：优先恢复最近打开的会话（记录丢失时回落最近更新的会话）；
   * 无任何历史会话则进入新建对话页面。
   */
  async function restoreLastSession(): Promise<void> {
    const lastId = readLastSessionId()
    const target = sessions.value.find((item) => item.id === lastId) || sessions.value[0]
    if (target) {
      await selectSession(target.id)
      return
    }
    startNewChat()
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
    if (currentId.value && !sessions.value.some((item) => item.id === currentId.value)) {
      currentId.value = ''
      messages.value = []
    }
  }

  /* 选择会话并加载消息 */
  async function selectSession(id: string): Promise<void> {
    currentId.value = id
    const target = sessions.value.find((item) => item.id === id)
    if (target) {
      useProjectStore().selectProject(target.projectId)
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
    } finally {
      loading.value = false
    }
  }

  /* 新建会话（归属当前选中项目，默认 Build 模式） */
  async function createSession(projectId?: string, mode: ChatMode = 'build'): Promise<SessionDTO> {
    const settings = useSettingsStore()
    const project = useProjectStore()
    const targetProjectId = projectId || project.currentId
    const session = await api.session.create({
      title: NEW_CHAT_TITLE,
      projectId: targetProjectId,
      providerId: settings.settings.providerId,
      modelId: settings.settings.modelId,
      mode
    })
    sessions.value = [session, ...sessions.value]
    currentId.value = session.id
    messages.value = []
    /* 草稿工具面板迁移给新建会话：切回该会话时保留开新对话前的面板状态 */
    useToolPanelStore().adoptDraft(session.id)
    return session
  }

  /* 进入新对话草稿态：不立即落库，首次发送时才创建会话（避免空对话被反复创建） */
  function startNewChat(): void {
    /* 允许在其它会话生成时进入新对话草稿：各会话生成状态相互独立 */
    currentId.value = ''
    messages.value = []
    /* 确保草稿工具面板状态已创建（含本地持久化恢复） */
    useToolPanelStore().ensure(DRAFT_SESSION_KEY)
  }

  /* 删除会话 */
  async function removeSession(id: string): Promise<void> {
    await api.session.remove(id)
    /* 清理该会话的生成缓存与流式状态 */
    stream.discard(id)
    delete streamingIds.value[id]
    sessions.value = sessions.value.filter((item) => item.id !== id)
    /* 该会话的工具面板 / 浏览器 / 对话 UI 资源由 useSessionLifecycle 统一回收 */
    /* 清除「最后会话」记录：避免下次启动定位到已删除的会话 */
    clearLastSessionId(id)
    if (currentId.value === id) {
      currentId.value = ''
      messages.value = []
      /* 优先定位有归属项目的会话（无归属的历史会话不展示） */
      const next = sessions.value.find((item) => item.projectId)
      if (next) {
        await selectSession(next.id)
      }
    }
  }

  /* 重命名会话 */
  async function renameSession(id: string, title: string): Promise<void> {
    await api.session.rename(id, title)
    const target = sessions.value.find((item) => item.id === id)
    if (target) {
      target.title = title
    }
  }

  /* 选择模型：写入全局默认值（下次新建对话沿用），并同步当前会话配置 */
  async function selectModel(providerId: string, modelId: string): Promise<void> {
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

  /* 切换当前会话的对话模式（plan 只读 / build 读写） */
  async function updateSessionMode(mode: ChatMode): Promise<void> {
    if (!currentId.value) {
      return
    }
    const updated = await api.session.update(currentId.value, { mode })
    const target = sessions.value.find((item) => item.id === updated.id)
    if (target) {
      target.mode = updated.mode
    }
  }

  /* 绑定事件监听（幂等） */
  function bind(): void {
    if (unbind) {
      return
    }
    unbind = api.chat.onEvent(stream.handleEvent)
  }

  /* 发送消息（新建会话时按传入模式创建，默认 Build） */
  async function send(text: string, mode: ChatMode = 'build'): Promise<void> {
    const content = text.trim()
    if (!content || streaming.value) {
      return
    }
    if (!currentId.value) {
      /* 强要求：新建会话必须先选择项目 */
      if (!useProjectStore().currentId) {
        return
      }
      await createSession(undefined, mode)
    }
    const sessionId = currentId.value

    /* 首条消息：本地立即把会话标题更新为提问摘要，侧栏无需等待生成完成（后端亦同步落库） */
    const session = sessions.value.find((item) => item.id === sessionId)
    if (session && !session.title.trim()) {
      session.title = content.slice(0, 24)
    }

    const assistantMessage: UiMessage = {
      id: uid(),
      role: 'assistant',
      content: '',
      parts: [],
      addTime: new Date().toISOString(),
      startedAt: Date.now(),
      pending: true
    }

    messages.value.push({
      id: uid(),
      role: 'user',
      content,
      parts: [],
      addTime: new Date().toISOString()
    })
    messages.value.push(assistantMessage)
    streamingIds.value[sessionId] = true
    /* 开始本轮：登记流式目标并缓存消息数组（切走后仍持续累积） */
    stream.beginRound(sessionId, assistantMessage.id)

    try {
      await api.chat.send({ sessionId, text: content })
    } finally {
      stream.flush(sessionId)
      delete streamingIds.value[sessionId]
      /* 本轮是否仍为该会话的当前流（避免被同一会话的新一轮取代） */
      const active = stream.targetIdOf(sessionId) === assistantMessage.id
      if (active && currentId.value === sessionId) {
        /* 仅当该会话仍在展示时回读替换，避免覆盖其它会话；否则待下次进入时按库回读 */
        const assistant = stream.assistantOf(sessionId)
        if (assistant) {
          assistant.pending = false
        }
        const stored = await api.session.messages(sessionId)
        if (currentId.value === sessionId && stream.targetIdOf(sessionId) === assistantMessage.id) {
          messages.value = mapStoredMessages(stored)
        }
      }
      /* 本轮结束：内存缓存让位于持久化结果，后续切换按库回读 */
      stream.completeRound(sessionId, assistantMessage.id)
      await loadSessions()
    }
  }

  /* 删除指定消息：同步删除存储与前端渲染，并重建会话上下文 */
  async function removeMessages(ids: string[]): Promise<void> {
    if (!currentId.value || ids.length === 0) {
      return
    }
    await api.session.removeMessages(currentId.value, ids)
    const removed = new Set(ids)
    messages.value = messages.value.filter((item) => !removed.has(item.id))
  }

  /* 中断生成 */
  async function abort(): Promise<void> {
    if (currentId.value) {
      await api.chat.abort(currentId.value)
    }
  }

  return {
    sessions,
    currentId,
    messages,
    streaming,
    loading,
    currentSession,
    loadSessions,
    reloadSessions,
    restoreLastSession,
    selectSession,
    createSession,
    startNewChat,
    removeSession,
    renameSession,
    selectModel,
    updateSessionMode,
    removeMessages,
    send,
    abort,
    bind
  }
})
