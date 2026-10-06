import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { api } from '../api'
import { useSettingsStore } from './settings'
import type { ChatEvent, SessionDTO, StoredMessage } from '../../../shared/ipc'
import type { UiMessage } from '../types'

/* 生成 UI 消息 id */
function uid(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

/* 持久化消息 → UI 消息 */
function toUiMessage(message: StoredMessage): UiMessage | null {
  if (message.role !== 'user' && message.role !== 'assistant') {
    return null
  }
  return {
    id: message.id,
    role: message.role === 'user' ? 'user' : 'assistant',
    content: message.content,
    thinking: '',
    tools: []
  }
}

/* 会话与对话状态 */
export const useChatStore = defineStore('chat', () => {
  const sessions = ref<SessionDTO[]>([])
  const currentId = ref('')
  const messages = ref<UiMessage[]>([])
  const streaming = ref(false)
  const loading = ref(false)
  let unbind: (() => void) | null = null

  const currentSession = computed(
    () => sessions.value.find((item) => item.id === currentId.value) ?? null
  )

  /* 获取最后一条助手消息（响应式代理） */
  function lastAssistant(): UiMessage | undefined {
    for (let index = messages.value.length - 1; index >= 0; index -= 1) {
      if (messages.value[index].role === 'assistant') {
        return messages.value[index]
      }
    }
    return undefined
  }

  /* 加载会话列表 */
  async function loadSessions(): Promise<void> {
    sessions.value = await api.session.list()
  }

  /* 选择会话并加载消息 */
  async function selectSession(id: string): Promise<void> {
    currentId.value = id
    loading.value = true
    try {
      const stored = await api.session.messages(id)
      messages.value = stored
        .map(toUiMessage)
        .filter((item): item is UiMessage => item !== null)
    } finally {
      loading.value = false
    }
  }

  /* 新建会话 */
  async function createSession(): Promise<SessionDTO> {
    const settings = useSettingsStore()
    const session = await api.session.create({
      title: '新对话',
      providerId: settings.settings.providerId,
      modelId: settings.settings.modelId,
      systemPrompt: settings.settings.systemPrompt
    })
    sessions.value = [session, ...sessions.value]
    currentId.value = session.id
    messages.value = []
    return session
  }

  /* 进入新对话草稿态：不立即落库，首次发送时才创建会话（避免空对话被反复创建） */
  function startNewChat(): void {
    if (streaming.value) {
      return
    }
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
      if (sessions.value.length > 0) {
        await selectSession(sessions.value[0].id)
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

  /* 处理主进程推送的对话事件 */
  function handleEvent(event: ChatEvent): void {
    if (event.sessionId !== currentId.value) {
      return
    }
    const assistant = lastAssistant()
    if (!assistant) {
      return
    }
    switch (event.type) {
      case 'delta':
        assistant.content += event.text ?? ''
        break
      case 'thinking':
        assistant.thinking += event.text ?? ''
        break
      case 'tool_start':
        assistant.tools.push({
          id: event.toolCallId ?? uid(),
          name: event.toolName ?? 'tool',
          status: 'running',
          args: undefined
        })
        break
      case 'tool_end': {
        const tool = assistant.tools.find((item) => item.id === event.toolCallId)
        if (tool) {
          tool.status = event.isError ? 'error' : 'done'
        }
        break
      }
      case 'error':
        assistant.error = true
        assistant.content = assistant.content || (event.message ?? '请求失败')
        assistant.pending = false
        streaming.value = false
        break
      case 'done':
        assistant.pending = false
        streaming.value = false
        break
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

  /* 发送消息 */
  async function send(text: string): Promise<void> {
    const content = text.trim()
    if (!content || streaming.value) {
      return
    }
    if (!currentId.value) {
      await createSession()
    }
    const sessionId = currentId.value

    messages.value.push({ id: uid(), role: 'user', content, thinking: '', tools: [] })
    messages.value.push({
      id: uid(),
      role: 'assistant',
      content: '',
      thinking: '',
      tools: [],
      pending: true
    })
    streaming.value = true

    try {
      await api.chat.send({ sessionId, text: content })
    } finally {
      streaming.value = false
      const assistant = lastAssistant()
      if (assistant) {
        assistant.pending = false
      }
      await loadSessions()
    }
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
    selectSession,
    createSession,
    startNewChat,
    removeSession,
    renameSession,
    send,
    abort,
    bind
  }
})
