import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { api } from '../api'
import { useProjectStore } from './project'
import { useSettingsStore } from './settings'
import type { ChatMode, ChatEvent, SessionDTO, StoredMessage } from '../../../shared/ipc'
import type { MessagePart, ToolCallState, UiMessage } from '../types'

/* 生成 UI 消息 id */
function uid(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

/* 持久化的 Pi 原始消息结构（仅取渲染所需字段） */
interface RawPart {
  type?: string
  text?: string
  thinking?: string
  redacted?: boolean
  id?: string
  name?: string
  arguments?: unknown
}
interface RawMessage {
  role?: string
  content?: RawPart[]
  stopReason?: string
  errorMessage?: string
  toolCallId?: string
  isError?: boolean
}

/* 安全解析持久化的原始消息 JSON */
function parseData(data: string): RawMessage | null {
  try {
    return JSON.parse(data) as RawMessage
  } catch {
    return null
  }
}

/* 向助手消息追加片段：同类相邻文本合并，保持片段发生顺序（思考 → 工具 → 正文 交错） */
function appendPart(message: UiMessage, part: MessagePart): void {
  if (part.type === 'thinking' || part.type === 'text') {
    const last = message.parts[message.parts.length - 1]
    if (last && last.type === part.type) {
      last.text += part.text
      return
    }
  }
  message.parts.push(part)
}

/* 回填助手消息正文：拼接全部正文片段（供复制、列表预览与滚动跟随） */
function refreshContent(message: UiMessage): void {
  message.content = message.parts
    .filter((part): part is { type: 'text'; text: string } => part.type === 'text')
    .map((part) => part.text)
    .join('\n\n')
}

/* 原始文本内容块 → 纯文本（工具结果展示用） */
function contentToPlain(raw: RawMessage | null): string {
  const content = raw?.content
  if (!Array.isArray(content)) {
    return ''
  }
  return content
    .filter((part) => part.type === 'text')
    .map((part) => part.text ?? '')
    .join('\n')
}

/*
 * 持久化消息集合 → UI 消息（按「轮次」折叠，并保留片段发生顺序）。
 *   - 一轮对话中 Agent 会分多次产出 assistant 片段（工具调用轮），并伴随 toolResult；
 *   - 折叠为「一条用户消息 + 一条助手消息」，助手消息内部按顺序记录 思考/正文/工具 片段，
 *     据此还原完整的执行过程，而非把思考、工具堆在一起。
 */
function mapStoredMessages(stored: StoredMessage[]): UiMessage[] {
  const result: UiMessage[] = []
  /* toolCallId → 工具片段引用，供后续 toolResult 回填状态与结果 */
  const toolParts = new Map<string, ToolCallState>()

  for (const record of stored) {
    if (record.role === 'user') {
      result.push({
        id: record.id,
        role: 'user',
        content: record.content,
        parts: [],
        addTime: record.addTime
      })
      continue
    }
    /* 工具结果：回填到对应工具片段 */
    if (record.role === 'toolResult') {
      const raw = parseData(record.data)
      const tool = raw?.toolCallId ? toolParts.get(raw.toolCallId) : undefined
      if (tool) {
        tool.status = raw?.isError ? 'error' : 'done'
        tool.result = contentToPlain(raw)
      }
      continue
    }
    if (record.role !== 'assistant') continue

    const raw = parseData(record.data)
    const parts = Array.isArray(raw?.content) ? raw.content : []
    const failed = raw?.stopReason === 'error'

    /* 合并到本轮已存在的助手消息 */
    let last = result[result.length - 1]
    if (!last || last.role !== 'assistant') {
      last = {
        id: record.id,
        role: 'assistant',
        content: '',
        parts: [],
        addTime: record.addTime,
        error: failed
      }
      result.push(last)
    } else if (failed) {
      last.error = true
    }

    /* 按原始顺序还原片段，并累计本片段的结构化正文 */
    let localText = ''
    for (const part of parts) {
      if (part.type === 'thinking' && !part.redacted && part.thinking) {
        appendPart(last, { type: 'thinking', text: part.thinking })
      } else if (part.type === 'text' && part.text) {
        appendPart(last, { type: 'text', text: part.text })
        localText += part.text
      } else if (part.type === 'toolCall') {
        const tool: ToolCallState = {
          id: part.id ?? uid(),
          name: part.name ?? 'tool',
          status: 'done',
          args: part.arguments,
          startedAt: 0
        }
        last.parts.push({ type: 'tool', tool })
        toolParts.set(tool.id, tool)
      }
    }

    /* 兜底：落库正文比结构化片段多出的部分（失败轮次追加的可读错误提示）补足展示 */
    if (record.content && record.content !== localText) {
      if (record.content.startsWith(localText)) {
        const rest = record.content.slice(localText.length)
        if (rest) {
          appendPart(last, { type: 'text', text: rest })
        }
      } else if (!localText) {
        appendPart(last, { type: 'text', text: record.content })
      }
    }
  }

  /* 剔除无任何内容的空助手消息（避免空白气泡） */
  return result.filter((message) => message.role !== 'assistant' || message.parts.length > 0)
}

/* 会话与对话状态 */
export const useChatStore = defineStore('chat', () => {
  const sessions = ref<SessionDTO[]>([])
  const currentId = ref('')
  const messages = ref<UiMessage[]>([])
  const loading = ref(false)
  let unbind: (() => void) | null = null

  /* 正在生成的会话集合（响应式）：支持多会话并发生成、互不阻塞 */
  const streamingIds = ref<Record<string, boolean>>({})
  /* 各会话的当前流式目标（sessionId → 本地助手消息 id） */
  const streamTargets = new Map<string, string>()
  /* 各会话的增量缓冲与节流定时器 */
  interface StreamBuffer {
    delta: string
    thinking: string
    timer: ReturnType<typeof setTimeout> | null
  }
  const streamBuffers = new Map<string, StreamBuffer>()
  const FLUSH_INTERVAL = 80

  /* 当前会话是否正在生成（组件据此展示停止/禁用发送；其它会话不受影响） */
  const streaming = computed(() => Boolean(currentId.value && streamingIds.value[currentId.value]))

  /* 取（或创建）某会话的增量缓冲 */
  function bufferOf(sessionId: string): StreamBuffer {
    let buffer = streamBuffers.get(sessionId)
    if (!buffer) {
      buffer = { delta: '', thinking: '', timer: null }
      streamBuffers.set(sessionId, buffer)
    }
    return buffer
  }

  /* 定位某会话正在流式的助手消息（响应式代理） */
  function streamAssistant(sessionId: string): UiMessage | undefined {
    const id = streamTargets.get(sessionId)
    if (!id) {
      return undefined
    }
    return messages.value.find((item) => item.id === id)
  }

  /* 刷新某会话缓冲的增量；该会话未展示时丢弃（完成后按持久化结果回读） */
  function flushBuffers(sessionId: string): void {
    const buffer = streamBuffers.get(sessionId)
    if (!buffer) {
      return
    }
    if (buffer.timer !== null) {
      clearTimeout(buffer.timer)
      buffer.timer = null
    }
    if (currentId.value === sessionId) {
      const assistant = streamAssistant(sessionId)
      if (assistant) {
        /* 思考先于正文写入，维持片段发生顺序 */
        if (buffer.thinking) {
          appendPart(assistant, { type: 'thinking', text: buffer.thinking })
        }
        if (buffer.delta) {
          appendPart(assistant, { type: 'text', text: buffer.delta })
        }
        refreshContent(assistant)
      }
    }
    buffer.delta = ''
    buffer.thinking = ''
  }

  /* 调度某会话的节流刷新 */
  function scheduleFlush(sessionId: string): void {
    const buffer = bufferOf(sessionId)
    if (buffer.timer !== null) {
      return
    }
    buffer.timer = setTimeout(() => flushBuffers(sessionId), FLUSH_INTERVAL)
  }

  const currentSession = computed(
    () => sessions.value.find((item) => item.id === currentId.value) ?? null
  )

  /* 加载会话列表 */
  async function loadSessions(): Promise<void> {
    sessions.value = await api.session.list()
  }

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
      const stored = await api.session.messages(id)
      const list = mapStoredMessages(stored)
      /* 该会话仍在生成中：补一个占位助手消息，使后续增量继续流入（避免切回即空白） */
      const targetId = streamTargets.get(id)
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
      title: '新对话',
      projectId: targetProjectId,
      providerId: settings.settings.providerId,
      modelId: settings.settings.modelId,
      mode,
      systemPrompt: settings.settings.systemPrompt
    })
    sessions.value = [session, ...sessions.value]
    currentId.value = session.id
    messages.value = []
    return session
  }

  /* 进入新对话草稿态：不立即落库，首次发送时才创建会话（避免空对话被反复创建） */
  function startNewChat(): void {
    /* 允许在其它会话生成时进入新对话草稿：各会话生成状态相互独立 */
    currentId.value = ''
    messages.value = []
  }

  /* 删除会话 */
  async function removeSession(id: string): Promise<void> {
    await api.session.remove(id)
    sessions.value = sessions.value.filter((item) => item.id !== id)
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

  /* 切换当前会话使用的供应商与模型 */
  async function updateSessionModel(providerId: string, modelId: string): Promise<void> {
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

  /* 处理主进程推送的对话事件（按会话路由，多会话并发生成互不干扰） */
  function handleEvent(event: ChatEvent): void {
    const sessionId = event.sessionId
    const visible = currentId.value === sessionId
    switch (event.type) {
      case 'delta':
      case 'thinking': {
        /* 缓冲增量，节流刷新（不触发逐 token 重渲染） */
        const buffer = bufferOf(sessionId)
        if (event.type === 'delta') {
          buffer.delta += event.text ?? ''
        } else {
          buffer.thinking += event.text ?? ''
        }
        scheduleFlush(sessionId)
        break
      }
      case 'tool_start': {
        /* 先落定已缓冲的思考/正文，保证工具片段追加在正确位置 */
        flushBuffers(sessionId)
        if (visible) {
          const assistant = streamAssistant(sessionId)
          if (assistant) {
            const tool: ToolCallState = {
              id: event.toolCallId ?? uid(),
              name: event.toolName ?? 'tool',
              status: 'running',
              args: event.args,
              startedAt: Date.now()
            }
            assistant.parts.push({ type: 'tool', tool })
          }
        }
        break
      }
      case 'tool_end': {
        if (visible) {
          const assistant = streamAssistant(sessionId)
          const part = assistant?.parts.find(
            (item) => item.type === 'tool' && item.tool.id === event.toolCallId
          )
          if (part && part.type === 'tool') {
            part.tool.status = event.isError ? 'error' : 'done'
            part.tool.result = event.result ?? part.tool.result
            part.tool.endedAt = Date.now()
          }
        }
        break
      }
      case 'error': {
        flushBuffers(sessionId)
        if (visible) {
          const assistant = streamAssistant(sessionId)
          /* 保留已生成的部分内容，并在其后追加可读错误提示（与落库内容保持一致） */
          if (assistant && !assistant.error) {
            const tip = event.message ?? '请求失败'
            appendPart(assistant, { type: 'text', text: assistant.content ? `\n\n${tip}` : tip })
            refreshContent(assistant)
          }
          if (assistant) {
            assistant.error = true
            assistant.pending = false
            assistant.endedAt = Date.now()
          }
        }
        delete streamingIds.value[sessionId]
        break
      }
      case 'done': {
        flushBuffers(sessionId)
        if (visible) {
          const assistant = streamAssistant(sessionId)
          if (assistant) {
            assistant.pending = false
            assistant.endedAt = Date.now()
          }
        }
        delete streamingIds.value[sessionId]
        break
      }
      default:
        break
    }
  }

  /* 绑定事件监听（幂等） */
  function bind(): void {
    if (unbind) {
      return
    }
    unbind = api.chat.onEvent(handleEvent)
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
    if (session && (session.title === '新对话' || !session.title)) {
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
    /* 记录该会话的流式目标与缓冲（多会话各自独立） */
    streamTargets.set(sessionId, assistantMessage.id)
    const buffer = bufferOf(sessionId)
    buffer.delta = ''
    buffer.thinking = ''

    messages.value.push({ id: uid(), role: 'user', content, parts: [], addTime: new Date().toISOString() })
    messages.value.push(assistantMessage)
    streamingIds.value[sessionId] = true

    try {
      await api.chat.send({ sessionId, text: content })
    } finally {
      flushBuffers(sessionId)
      delete streamingIds.value[sessionId]
      /* 本轮是否仍为该会话的当前流（避免被同一会话的新一轮取代） */
      const active = streamTargets.get(sessionId) === assistantMessage.id
      if (active) {
        /* 仅当该会话仍在展示时回读替换，避免覆盖其它会话；否则待下次进入时按库回读 */
        if (currentId.value === sessionId) {
          const assistant = streamAssistant(sessionId)
          if (assistant) {
            assistant.pending = false
          }
          const stored = await api.session.messages(sessionId)
          if (currentId.value === sessionId && streamTargets.get(sessionId) === assistantMessage.id) {
            messages.value = mapStoredMessages(stored)
          }
        }
        streamTargets.delete(sessionId)
        streamBuffers.delete(sessionId)
      }
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
    selectSession,
    createSession,
    startNewChat,
    removeSession,
    renameSession,
    updateSessionModel,
    updateSessionMode,
    removeMessages,
    send,
    abort,
    bind
  }
})
