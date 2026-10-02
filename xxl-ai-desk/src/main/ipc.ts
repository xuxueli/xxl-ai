import { app, ipcMain, type BrowserWindow } from 'electron'
import { IPC } from '../shared/ipc'
import type { AppSettings, ProviderDTO, SessionDTO, StoredMessage } from '../shared/ipc'
import { getSettings, saveSettings } from './services/settingsService'
import { deleteProvider, getProvider, listProviders, saveProvider } from './services/providerService'
import {
  clearMessages,
  createSession,
  deleteSession,
  getSession,
  listMessages,
  listSessions,
  replaceMessages,
  updateSession
} from './services/sessionService'
import { abortAgent, evictAgent, getAgent, runPrompt, type HostEvent } from './agent/host'
import type { ProviderModelConfig } from './agent/models'

/* 将 Agent 消息内容归一化为纯文本（用于列表预览与检索） */
function contentToText(message: unknown): string {
  const content = (message as { content?: unknown })?.content
  if (typeof content === 'string') {
    return content
  }
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === 'string') {
          return part
        }
        return (part as { text?: string })?.text ?? ''
      })
      .join('')
  }
  return ''
}

/* 供应商 DTO → Pi 运行时配置 */
function toRuntimeConfig(provider: ProviderDTO): ProviderModelConfig {
  return {
    id: provider.id,
    name: provider.name,
    baseUrl: provider.baseUrl,
    apiKey: provider.apiKey,
    headers: provider.headers,
    models: provider.models
  }
}

/* 注册全部 IPC 处理器 */
export function registerIpc(getWindow: () => BrowserWindow | null): void {
  ipcMain.handle(IPC.appInfo, () => ({
    version: app.getVersion(),
    platform: process.platform
  }))

  /* --- 设置 --- */
  ipcMain.handle(IPC.settingsGet, () => getSettings())
  ipcMain.handle(IPC.settingsSave, (_event, patch: Partial<AppSettings>) => saveSettings(patch))

  /* --- 供应商 --- */
  ipcMain.handle(IPC.providerList, () => listProviders())
  ipcMain.handle(IPC.providerSave, (_event, dto: Partial<ProviderDTO>) => saveProvider(dto))
  ipcMain.handle(IPC.providerRemove, (_event, id: string) => {
    deleteProvider(id)
  })

  /* --- 会话 --- */
  ipcMain.handle(IPC.sessionList, () => listSessions())
  ipcMain.handle(IPC.sessionCreate, (_event, input?: Partial<SessionDTO>) => createSession(input))
  ipcMain.handle(IPC.sessionUpdate, (_event, id: string, patch: Partial<SessionDTO>) => {
    evictAgent(id)
    return updateSession(id, patch)
  })
  ipcMain.handle(IPC.sessionRename, (_event, id: string, title: string) => {
    updateSession(id, { title })
  })
  ipcMain.handle(IPC.sessionRemove, (_event, id: string) => {
    evictAgent(id)
    deleteSession(id)
  })
  ipcMain.handle(IPC.sessionMessages, (_event, sessionId: string): StoredMessage[] =>
    listMessages(sessionId)
  )
  ipcMain.handle(IPC.sessionClear, (_event, sessionId: string) => {
    evictAgent(sessionId)
    clearMessages(sessionId)
  })

  /* --- 对话 --- */
  ipcMain.handle(IPC.chatAbort, async (_event, sessionId: string) => {
    await abortAgent(sessionId)
  })

  ipcMain.handle(IPC.chatSend, async (_event, input: { sessionId: string; text: string }) => {
    const { sessionId, text } = input
    const window = getWindow()
    const emit = (event: HostEvent): void => {
      window?.webContents.send(IPC.chatEvent, { sessionId, ...event })
    }

    try {
      const session = getSession(sessionId)
      if (!session) {
        emit({ type: 'error', message: '会话不存在' })
        return
      }

      const settings = getSettings()
      const providerId = session.providerId || settings.providerId
      const provider = providerId ? getProvider(providerId) : null
      if (!provider) {
        emit({ type: 'error', message: '请先在设置中添加并启用模型供应商' })
        return
      }

      const modelId = session.modelId || settings.modelId || provider.models[0]
      if (!modelId) {
        emit({ type: 'error', message: '请为供应商配置至少一个模型' })
        return
      }

      const systemPrompt = session.systemPrompt || settings.systemPrompt
      const history = listMessages(sessionId)
        .map((message) => {
          try {
            return JSON.parse(message.data)
          } catch {
            return null
          }
        })
        .filter((item) => item !== null)

      const agent = await getAgent({
        sessionId,
        provider: toRuntimeConfig(provider),
        modelId,
        systemPrompt,
        messages: history
      })

      await runPrompt(agent, text, emit)

      /* 落库：以 Agent 完整上下文覆盖会话消息，保证下次续聊一致 */
      const serialized = agent.state.messages.map((message) => ({
        role: (message as { role?: string }).role ?? '',
        content: contentToText(message),
        data: JSON.stringify(message)
      }))
      replaceMessages(sessionId, serialized)

      /* 首次对话自动以提问作为会话标题 */
      const current = getSession(sessionId)
      if (current && (current.title === '新对话' || !current.title)) {
        updateSession(sessionId, { title: text.slice(0, 24) })
      }
    } catch (error) {
      emit({ type: 'error', message: (error as Error).message })
    }
  })
}
