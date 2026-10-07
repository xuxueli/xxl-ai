import { app, dialog, ipcMain, shell, type BrowserWindow } from 'electron'
import { IPC } from '../shared/ipc'
import type {
  AppSettings,
  ProviderDTO,
  ProviderModelQuery,
  ProjectCreateInput,
  RuntimeInfo,
  SessionDTO,
  StoredMessage
} from '../shared/ipc'
import { getSettings, saveSettings } from './services/settingsService'
import {
  getDataDir,
  getDbFile,
  getDefaultDataDir,
  setDataDir
} from './services/storageService'
import {
  deleteProvider,
  fetchRemoteModels,
  getProvider,
  listProviders,
  saveProvider
} from './services/providerService'
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
import {
  createProject,
  deleteProject,
  getProject,
  listProjects,
  renameProject
} from './services/projectService'
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

/* 将底层异常翻译为可读提示：明确指向具体供应商与模型 */
function describeError(raw: string, providerName: string, modelId: string): string {
  const message = (raw || '').trim()
  if (/api key/i.test(message)) {
    return `供应商「${providerName}」未配置 API Key，无法调用模型「${modelId}」，请在「设置」中补全后重试`
  }
  const suffix = message ? `：${message}` : ''
  return `模型「${modelId}」（供应商「${providerName}」）调用失败${suffix}`
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
  ipcMain.handle(
    IPC.appInfo,
    (): RuntimeInfo => ({
      version: app.getVersion(),
      platform: process.platform,
      dataDir: getDataDir(),
      defaultDataDir: getDefaultDataDir(),
      dbFile: getDbFile()
    })
  )
  ipcMain.handle(IPC.appSetDataDir, (_event, dir: string) => setDataDir(dir))
  ipcMain.handle(IPC.appSelectDataDir, async () => {
    const result = await dialog.showOpenDialog({
      title: '选择数据目录',
      defaultPath: getDataDir(),
      properties: ['openDirectory', 'createDirectory']
    })
    return result.canceled || result.filePaths.length === 0 ? '' : result.filePaths[0]
  })
  ipcMain.handle(IPC.appOpenDataDir, async () => {
    await shell.openPath(getDataDir())
  })
  ipcMain.handle(IPC.appRelaunch, () => {
    app.relaunch()
    app.exit(0)
  })

  /* --- 设置 --- */
  ipcMain.handle(IPC.settingsGet, () => getSettings())
  ipcMain.handle(IPC.settingsSave, (_event, patch: Partial<AppSettings>) => saveSettings(patch))

  /* --- 供应商 --- */
  ipcMain.handle(IPC.providerList, () => listProviders())
  ipcMain.handle(IPC.providerSave, (_event, dto: Partial<ProviderDTO>) => saveProvider(dto))
  ipcMain.handle(IPC.providerRemove, (_event, id: string) => {
    deleteProvider(id)
  })
  ipcMain.handle(IPC.providerRemoteModels, (_event, input: ProviderModelQuery) =>
    fetchRemoteModels(input)
  )

  /* --- 项目（1:1 绑定本地目录） --- */
  ipcMain.handle(IPC.projectList, () => listProjects())
  ipcMain.handle(IPC.projectCreate, async (_event, input?: ProjectCreateInput) => {
    /* 未显式传入路径时，弹出系统目录选择对话框（取消返回 null） */
    let path = input?.path?.trim() ?? ''
    if (!path) {
      const result = await dialog.showOpenDialog({
        title: input?.dialogTitle || '选择项目目录',
        properties: ['openDirectory', 'createDirectory']
      })
      if (result.canceled || result.filePaths.length === 0) {
        return null
      }
      path = result.filePaths[0]
    }
    return createProject({ name: input?.name, path })
  })
  ipcMain.handle(IPC.projectRename, (_event, id: string, name: string) => renameProject(id, name))
  ipcMain.handle(IPC.projectRemove, (_event, id: string) => {
    /* 级联删除前先清理项目下会话的运行时 Agent 缓存 */
    const removed = deleteProject(id)
    removed.forEach((sessionId) => evictAgent(sessionId))
  })
  ipcMain.handle(IPC.projectReveal, (_event, id: string) => {
    /* 在系统文件管理器中展示项目目录（macOS Finder / Windows 资源管理器 / Linux 文件管理器） */
    const project = getProject(id)
    if (project) {
      shell.showItemInFolder(project.path)
    }
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
    /* 供应商/模型就绪后，错误提示统一带上「供应商 + 模型」上下文 */
    let providerName = ''
    let modelId = ''
    let contextReady = false
    const emit = (event: HostEvent): void => {
      const payload =
        event.type === 'error' && contextReady
          ? { ...event, message: describeError(event.message, providerName, modelId) }
          : event
      window?.webContents.send(IPC.chatEvent, { sessionId, ...payload })
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

      const model = session.modelId || settings.modelId || provider.models[0]
      if (!model) {
        emit({ type: 'error', message: '请为供应商配置至少一个模型' })
        return
      }

      providerName = provider.name
      modelId = model
      contextReady = true

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
      const serialized = agent.state.messages.map((message) => {
        const role = (message as { role?: string }).role ?? ''
        const stopReason = (message as { stopReason?: string }).stopReason
        const errorMessage = (message as { errorMessage?: string }).errorMessage
        let content = contentToText(message)
        /* 失败消息追加可读提示落库，避免切换会话后丢失错误信息（保留已生成的部分内容） */
        if (role === 'assistant' && stopReason === 'error') {
          const tip = describeError(errorMessage ?? '', providerName, modelId)
          content = content ? `${content}\n\n${tip}` : tip
        }
        return { role, content, data: JSON.stringify(message) }
      })
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
