import { app, dialog, ipcMain, shell, type BrowserWindow } from 'electron'
import { IPC } from '../shared/ipc'
import type {
  AppSettings,
  ChatMode,
  ProviderDTO,
  ProviderModelQuery,
  ProjectCreateInput,
  RuntimeInfo,
  SessionDTO,
  StoredMessage,
  TerminalCreateInput
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
  deleteMessages,
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
import {
  createTerminal,
  disposeTerminal,
  onTerminalEvent,
  resizeTerminal,
  writeTerminal
} from './services/terminalService'
import { abortAgent, evictAgent, getAgent, resetAgents, runPrompt, type HostEvent } from './agent/host'
import { clearSessionPermissions } from './agent/sandbox'
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
function describeError(raw: string, providerName: string, modelId: string): string {  const message = (raw || '').trim()
  if (/api key/i.test(message)) {
    return `供应商「${providerName}」未配置 API Key，无法调用模型「${modelId}」，请在「设置」中补全后重试`
  }
  const suffix = message ? `：${message}` : ''
  return `模型「${modelId}」（供应商「${providerName}」）调用失败${suffix}`
}

/* 模式说明：拼接到系统指令末尾，引导模型按当前模式行事（Plan 只读规划，Build 读写实施） */
function modeSystemHint(mode: ChatMode): string {
  if (mode === 'plan') {
    return '\n\n当前为 Plan（规划）模式：你处于只读状态，只能读取项目文件进行阅读与分析，不能写入/编辑文件或执行命令。请先给出清晰的方案与计划，待用户切换到 Build 模式后再落地实施。'
  }
  return '\n\n当前为 Build（构建）模式：你可以读取、写入、编辑项目文件并执行命令；文件操作限制在当前项目目录内，越界需用户确认。'
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
  ipcMain.handle(IPC.settingsSave, (_event, patch: Partial<AppSettings>) => {
    const saved = saveSettings(patch)
    /* 自定义指令变更后清空运行时缓存，使全部会话（含旧对话）下次对话即生效 */
    if (patch.systemPrompt !== undefined) {
      resetAgents()
    }
    return saved
  })

  /* --- 供应商 --- */
  ipcMain.handle(IPC.providerList, () => listProviders())
  ipcMain.handle(IPC.providerSave, (_event, dto: Partial<ProviderDTO>) => {
    const saved = saveProvider(dto)
    /* 供应商配置（含 API Key）变更后，清空运行时缓存，使下一次对话立即生效 */
    resetAgents()
    return saved
  })
  ipcMain.handle(IPC.providerRemove, (_event, id: string) => {
    deleteProvider(id)
    resetAgents()
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
    /* 级联删除前先清理项目下会话的运行时 Agent 缓存与越界白名单 */
    const removed = deleteProject(id)
    removed.forEach((sessionId) => {
      evictAgent(sessionId)
      clearSessionPermissions(sessionId)
    })
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
    clearSessionPermissions(id)
    deleteSession(id)
  })
  ipcMain.handle(IPC.sessionMessages, (_event, sessionId: string): StoredMessage[] =>
    listMessages(sessionId)
  )
  ipcMain.handle(IPC.sessionClear, (_event, sessionId: string) => {
    evictAgent(sessionId)
    clearSessionPermissions(sessionId)
    clearMessages(sessionId)
  })
  ipcMain.handle(IPC.sessionDeleteMessages, (_event, sessionId: string, ids: string[]) => {
    /* 删除消息后清空运行时缓存，使对话上下文与存储一致 */
    evictAgent(sessionId)
    deleteMessages(sessionId, ids)
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

      /* 对话模式与文件沙箱边界：默认 Build；根目录取会话所属项目目录（缺失时回退用户主目录） */
      const mode = session.mode === 'plan' ? 'plan' : 'build'
      const project = session.projectId ? getProject(session.projectId) : null
      const rootDir = project?.path || app.getPath('home')

      /* 自定义指令全局生效：统一取当前设置，并附模式说明（个性化变更对旧对话同样生效） */
      const systemPrompt = `${settings.systemPrompt || ''}${modeSystemHint(mode)}`
      /* 历史消息不携带 system 提示：系统指令始终取当前设置，保证旧对话也随设置变更生效 */
      const history = listMessages(sessionId)
        .map((message) => {
          try {
            return JSON.parse(message.data) as { role?: string }
          } catch {
            return null
          }
        })
        .filter((item) => item !== null && item.role !== 'system')

      const agent = await getAgent({
        sessionId,
        provider: toRuntimeConfig(provider),
        modelId,
        systemPrompt,
        messages: history,
        mode,
        rootDir
      })

      await runPrompt(agent, text, emit)

      /* 落库：以 Agent 完整上下文覆盖会话消息，保证下次续聊一致（剔除 system，避免固化旧指令） */
      const serialized = agent.state.messages
        .filter((message) => (message as { role?: string }).role !== 'system')
        .map((message) => {
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

  /* --- 终端（本地 PTY） --- */
  ipcMain.handle(IPC.terminalCreate, (_event, input?: TerminalCreateInput) => createTerminal(input))
  ipcMain.handle(IPC.terminalWrite, (_event, id: string, data: string) => writeTerminal(id, data))
  ipcMain.handle(IPC.terminalResize, (_event, id: string, cols: number, rows: number) =>
    resizeTerminal(id, cols, rows)
  )
  ipcMain.handle(IPC.terminalDispose, (_event, id: string) => disposeTerminal(id))
  /* 终端输出/退出事件统一转发到渲染窗口 */
  onTerminalEvent((event) => {
    getWindow()?.webContents.send(IPC.terminalEvent, event)
  })
}
