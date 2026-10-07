import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { api } from '../api'
import { useProjectStore } from './project'
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
  /* 解析原始数据，恢复失败标记（切换会话/重启后仍显示错误样式） */
  let failed = false
  try {
    const parsed = JSON.parse(message.data) as { stopReason?: string }
    failed = parsed?.stopReason === 'error'
  } catch {
    /* 数据缺失或非法时按正常消息处理 */
  }
  return {
    id: message.id,
    role: message.role === 'user' ? 'user' : 'assistant',
    content: message.content,
    thinking: '',
    tools: [],
    addTime: message.addTime,
    error: failed
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
      messages.value = stored
        .map(toUiMessage)
        .filter((item): item is UiMessage => item !== null)
    } finally {
      loading.value = false
    }
  }

  /* 新建会话（归属当前选中项目） */
  async function createSession(projectId?: string): Promise<SessionDTO> {
    const settings = useSettingsStore()
    const project = useProjectStore()
    const targetProjectId = projectId || project.currentId
    const session = await api.session.create({
      title: '新对话',
      projectId: targetProjectId,
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
      case 'error': {
        /* 保留已生成的部分内容，并在其后追加可读错误提示（与落库内容保持一致） */
        if (!assistant.error) {
          const tip = event.message ?? '请求失败'
          assistant.content = assistant.content ? `${assistant.content}\n\n${tip}` : tip
        }
        assistant.error = true
        assistant.pending = false
        streaming.value = false
        break
      }
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
      /* 强要求：新建会话必须先选择项目 */
      if (!useProjectStore().currentId) {
        return
      }
      await createSession()
    }
    const sessionId = currentId.value

    messages.value.push({ id: uid(), role: 'user', content, thinking: '', tools: [], addTime: new Date().toISOString() })
    messages.value.push({
      id: uid(),
      role: 'assistant',
      content: '',
      thinking: '',
      tools: [],
      addTime: new Date().toISOString(),
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
    reloadSessions,
    selectSession,
    createSession,
    startNewChat,
    removeSession,
    renameSession,
    updateSessionModel,
    send,
    abort,
    bind
  }
})
