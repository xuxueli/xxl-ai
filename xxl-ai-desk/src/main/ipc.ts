/*
 * IPC 网关：注册主进程全部 ipcMain 处理器，只做参数透传、必要编排（如 dataDir 选择）与错误兜底。
 *   - 业务编排下沉 services/*（chat 编排在 services/chatService.ts）；底层能力由 agent/* 提供。
 *   - 本文件不写业务规则，保持薄网关。
 */

import { app, dialog, ipcMain, shell, type BrowserWindow, type IpcMainInvokeEvent } from 'electron'
import log from 'electron-log/main'
import { IPC } from '@shared/ipc'
import { logIpcError } from './utils/logger'
import type {
  AgentMemorySaveInput,
  AppSettings,
  BrowserActionResult,
  GitCommitInput,
  GitDiffInput,
  GithubSkillInstallInput,
  GithubSkillQuery,
  InteractionResult,
  DiagnosticsQuery,
  McpDTO,
  McpDiscoverQuery,
  ProviderDTO,
  ProviderModelQuery,
  ProjectCreateInput,
  RuntimeExecInput,
  RuntimeInfo,
  SessionDTO,
  SkillDiscoverQuery,
  StoredMessage,
  TerminalCreateInput
} from '@shared/ipc'
import { getSettings, saveSettings } from './services/settingsService'
import {
  listAgentMemories,
  removeAgentMemory,
  saveAgentMemory
} from './services/agentMemoryService'
import { getDataDir, getDbFile, getDefaultDataDir, setDataDir } from './config/paths'
import { detectExecutable } from './services/envService'
import { checkForUpdate, openDownload } from './services/updateService'
import {
  deleteProvider,
  fetchRemoteModels,
  listProviders,
  saveProvider
} from './services/providerService'
import {
  createSession,
  deleteMessages,
  deleteSession,
  listMessages,
  listSessions,
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
  attachTerminal,
  createTerminal,
  disposeAllTerminals,
  disposeTerminal,
  listTerminals,
  onTerminalEvent,
  reassignTerminals,
  resizeTerminal,
  writeTerminal
} from './services/terminalService'
import { assertProjectDir, listDir, readFile, trashFile, writeFile } from './services/fsService'
import { initFsWatch, unwatchDir, watchDir } from './services/fsWatchService'
import { listOpenWithApps, openWith } from './services/openWithService'
import {
  commitGit,
  getGitDiff,
  getGitStatus,
  initGitWatch,
  stageGit,
  unstageGit,
  unwatchGitProject,
  watchGitProject
} from './services/gitService'
import { abortChat, discardSessionRuns, respondInteraction, sendChat } from './services/chatService'
import {
  clearTraces,
  listMessagePage,
  listTraces
} from './services/diagnosticsService'
import { deleteMcp, listMcps, saveMcp } from './services/mcpService'
import { listMcpTools, testMcp } from './services/mcpRuntimeService'
import { discoverMcp, discoverMcpDetail, listMcpCategories } from './services/mcpDiscoverService'
import {
  deleteSkill,
  getSkillContent,
  getSkillDetail,
  getSkillRevealPath,
  importSkillsFromDirectory,
  importSkillsFromZip,
  listSkills,
  refreshSkills,
  setSkillEnabled
} from './services/skillService'
import {
  discoverSkillDetail,
  discoverSkills,
  installDiscoveredSkill
} from './services/skillDiscoverService'
import {
  inspectGithubSkills,
  installGithubSkill,
  cancelGithubSkills
} from './services/skillGithubService'
import {
  clearSessionPermissions,
  disposeAgentRuntime,
  evictAgent,
  resetAgents,
  setBrowserOpener
} from './agent/host/runtimeHost'
import { resolveBrowserAction, setBrowserActionSender } from './agent/host/browserBridge'

/* IPC 处理器统一兜底：异常先落日志再抛回渲染层，避免只停留在控制台 */
function handle<T extends unknown[]>(
  channel: string,
  handler: (event: IpcMainInvokeEvent, ...args: T) => unknown
): void {
  ipcMain.handle(channel, async (event, ...args) => {
    try {
      return await handler(event, ...(args as T))
    } catch (error) {
      logIpcError(channel, args, error)
      throw error
    }
  })
}

/* 注册全部 IPC 处理器 */
export function registerIpc(getWindow: () => BrowserWindow | null): void {
  /* Git 文件变更：主进程监听到项目变化后通知渲染层刷新 */
  initGitWatch((projectId) => getWindow()?.webContents.send(IPC.gitChange, projectId))

  /* Agent 工具 open_browser：把 URL 交给渲染层，在对应会话的浏览器面板打开（可指定新建标签页） */
  setBrowserOpener((sessionId, url, newTab) => {
    getWindow()?.webContents.send(IPC.browserOpenTab, {
      sessionId,
      url,
      newTab
    })
  })
  /* Agent 浏览器动作：请求转渲染层执行，结果经 browserActionResult 回传 */
  setBrowserActionSender((request) => {
    getWindow()?.webContents.send(IPC.browserActionRequest, request)
  })
  handle(IPC.browserActionResult, (_event, requestId: string, result: BrowserActionResult) =>
    resolveBrowserAction(requestId, result)
  )

  handle(
    IPC.appInfo,
    (): RuntimeInfo => ({
      version: app.getVersion(),
      platform: process.platform,
      dataDir: getDataDir(),
      defaultDataDir: getDefaultDataDir(),
      dbFile: getDbFile()
    })
  )
  handle(IPC.appSetDataDir, (_event, dir: string) => setDataDir(dir))
  /* 渲染层异常上报：只落日志，不做业务处理 */
  ipcMain.on(IPC.appLogError, (_event, message: string) => {
    log.error('[renderer]', message)
  })
  handle(IPC.appSelectDataDir, async () => {
    const result = await dialog.showOpenDialog({
      title: '选择数据目录',
      defaultPath: getDataDir(),
      properties: ['openDirectory', 'createDirectory']
    })
    return result.canceled || result.filePaths.length === 0 ? '' : result.filePaths[0]
  })
  handle(IPC.appOpenDataDir, async () => {
    await shell.openPath(getDataDir())
  })
  handle(IPC.appRelaunch, () => {
    /*
     * 开发模式：electron-vite 的 dev server 会随本进程退出而关闭，
     * app.relaunch 拉起的新进程无渲染服务可加载（白屏），故此处兜底不重启（渲染层已做样式化提示）。
     */
    if (!app.isPackaged) {
      console.warn('[relaunch] 开发模式下不执行自动重启，请手动重新运行 npm run dev')
      return
    }
    /* app.exit 不触发 before-quit，需先手动回收运行时进程与终端，避免残留 */
    disposeAgentRuntime()
    disposeAllTerminals()
    app.relaunch()
    app.exit(0)
  })

  /* 弹出可执行文件选择框（供设置中选择 Node / Python） */
  handle(IPC.appSelectExecutable, async (_event, title?: string) => {
    const result = await dialog.showOpenDialog({
      title: title || '选择可执行文件',
      properties: ['openFile']
    })
    if (result.canceled || result.filePaths.length === 0) {
      return ''
    }
    return result.filePaths[0]
  })
  /* 检测运行时可执行文件（node / python）版本 */
  handle(IPC.appDetectExecutable, (_event, input: RuntimeExecInput) =>
    detectExecutable(input)
  )

  /* --- 客户端更新（引导式） --- */
  handle(IPC.updateCheck, () => checkForUpdate())
  handle(IPC.updateOpen, (_event, url: string) => openDownload(url))

  /* --- 设置 --- */
  handle(IPC.settingsGet, () => getSettings())
  handle(IPC.settingsSave, (_event, patch: Partial<AppSettings>) => {
    const saved = saveSettings(patch)
    /* 自定义指令、记忆开关与内置工具开关变更后清空运行时缓存，使全部会话（含旧对话）下次对话即生效 */
    if (
      patch.systemPrompt !== undefined ||
      patch.agentMemoryEnabled !== undefined ||
      patch.builtinToolBrowserEnabled !== undefined ||
      patch.builtinToolFsEnabled !== undefined ||
      patch.builtinToolShellEnabled !== undefined ||
      patch.builtinToolGeneralEnabled !== undefined ||
      patch.builtinToolInteractionEnabled !== undefined
    ) {
      resetAgents()
    }
    return saved
  })

  /* --- Agent 记忆 --- */
  handle(IPC.agentMemoryList, () => listAgentMemories())
  handle(IPC.agentMemorySave, (_event, input: AgentMemorySaveInput) => saveAgentMemory(input))
  handle(IPC.agentMemoryRemove, (_event, projectId: string) => removeAgentMemory(projectId))

  /* --- 供应商 --- */
  handle(IPC.providerList, () => listProviders())
  handle(IPC.providerSave, (_event, dto: Partial<ProviderDTO>) => {
    const saved = saveProvider(dto)
    /* 供应商配置（含 API Key）变更后，清空运行时缓存，使下一次对话立即生效 */
    resetAgents()
    return saved
  })
  handle(IPC.providerRemove, (_event, id: string) => {
    deleteProvider(id)
    resetAgents()
  })
  handle(IPC.providerRemoteModels, (_event, input: ProviderModelQuery) =>
    fetchRemoteModels(input)
  )

  /* --- 项目（1:1 绑定本地目录） --- */
  handle(IPC.projectList, () => listProjects())
  handle(IPC.projectCreate, async (_event, input?: ProjectCreateInput) => {
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
  handle(IPC.projectRename, (_event, id: string, name: string) => renameProject(id, name))
  handle(IPC.projectRemove, async (_event, id: string) => {
    /* 级联删除前先终止项目下会话的运行中轮次，并清理运行时 Agent 缓存与越界白名单 */
    const removed = deleteProject(id)
    for (const sessionId of removed) {
      discardSessionRuns(sessionId)
      await abortChat(sessionId)
      evictAgent(sessionId)
      clearSessionPermissions(sessionId)
    }
  })
  handle(IPC.projectReveal, (_event, id: string) => {
    /* 在系统文件管理器中展示项目目录（macOS Finder / Windows 资源管理器 / Linux 文件管理器） */
    const project = getProject(id)
    if (project) {
      shell.showItemInFolder(project.path)
    }
  })

  /* --- 会话 --- */
  handle(IPC.sessionList, () => listSessions())
  handle(IPC.sessionCreate, (_event, input?: Partial<SessionDTO>) => createSession(input))
  handle(IPC.sessionUpdate, async (_event, id: string, patch: Partial<SessionDTO>) => {
    /* 模型/模式变更可能影响正在运行的一轮：先终止并丢弃回写，再更新配置 */
    discardSessionRuns(id)
    await abortChat(id)
    evictAgent(id)
    return updateSession(id, patch)
  })
  handle(IPC.sessionRename, (_event, id: string, title: string) => {
    updateSession(id, { title })
  })
  handle(IPC.sessionRemove, async (_event, id: string) => {
    /* 删除前先丢弃回写并终止运行中轮次：避免被删会话继续耗 token / 执行工具 */
    discardSessionRuns(id)
    await abortChat(id)
    evictAgent(id)
    clearSessionPermissions(id)
    deleteSession(id)
  })
  handle(IPC.sessionMessages, (_event, sessionId: string): StoredMessage[] =>
    listMessages(sessionId)
  )
  handle(IPC.sessionDeleteMessages, async (_event, sessionId: string, ids: string[]) => {
    /* 删除消息后终止运行中轮次并清空运行时缓存，使对话上下文与存储一致 */
    discardSessionRuns(sessionId)
    await abortChat(sessionId)
    evictAgent(sessionId)
    deleteMessages(sessionId, ids)
  })

  /* --- 对话（编排下沉 chatService，网关仅转发事件） --- */
  handle(IPC.chatSend, (_event, input: { sessionId: string; text: string }) =>
    sendChat(input, (payload) => {
      getWindow()?.webContents.send(IPC.chatEvent, payload)
    })
  )
  handle(IPC.chatAbort, (_event, sessionId: string) => abortChat(sessionId))
  /* 人机交互：渲染进程回传用户结果，唤醒等待中的工具调用 */
  handle(
    IPC.chatInteractionRespond,
    (_event, requestId: string, result: InteractionResult) =>
      respondInteraction(requestId, result)
  )

  /* --- Git 工具（项目空间维度） --- */
  handle(IPC.gitStatus, (_event, projectId: string) => getGitStatus(projectId))
  handle(IPC.gitDiff, (_event, input: GitDiffInput) => getGitDiff(input))
  handle(IPC.gitStage, (_event, projectId: string, path: string, oldPath?: string) =>
    stageGit(projectId, path, oldPath)
  )
  handle(IPC.gitUnstage, (_event, projectId: string, path: string, oldPath?: string) =>
    unstageGit(projectId, path, oldPath)
  )
  handle(IPC.gitCommit, (_event, input: GitCommitInput) => commitGit(input))
  handle(IPC.gitWatch, (_event, projectId: string) => watchGitProject(projectId))
  handle(IPC.gitUnwatch, (_event, projectId: string) => unwatchGitProject(projectId))

  /* --- 终端（本地 PTY） --- */
  handle(IPC.terminalCreate, (_event, input: TerminalCreateInput) => createTerminal(input))
  handle(IPC.terminalList, (_event, sessionId: string) => listTerminals(sessionId))
  handle(IPC.terminalAttach, (_event, id: string) => attachTerminal(id))
  handle(IPC.terminalWrite, (_event, id: string, data: string) => writeTerminal(id, data))
  handle(IPC.terminalResize, (_event, id: string, cols: number, rows: number) =>
    resizeTerminal(id, cols, rows)
  )
  handle(IPC.terminalDispose, (_event, id: string) => disposeTerminal(id))
  handle(IPC.terminalReassign, (_event, fromSessionId: string, toSessionId: string) =>
    reassignTerminals(fromSessionId, toSessionId)
  )
  /* 终端输出/退出事件统一转发到渲染窗口 */
  onTerminalEvent((event) => {
    getWindow()?.webContents.send(IPC.terminalEvent, event)
  })

  /* --- 本地文件系统（右侧「文件」面板；按项目主键限定，根目录由主进程解析） --- */
  handle(IPC.fsList, (_event, projectId: string, dir: string) => listDir(projectId, dir))
  handle(IPC.fsRead, (_event, projectId: string, path: string) => readFile(projectId, path))
  handle(IPC.fsWrite, (_event, projectId: string, path: string, content: string) =>
    writeFile(projectId, path, content)
  )
  handle(IPC.fsTrash, (_event, projectId: string, path: string) => trashFile(projectId, path))
  /* 目录监听：本地增删文件后推送变更，渲染层刷新对应目录 */
  initFsWatch((dir) => getWindow()?.webContents.send(IPC.fsChange, dir))
  handle(IPC.fsWatch, (_event, projectId: string, dir: string) =>
    watchDir(assertProjectDir(projectId, dir))
  )
  handle(IPC.fsUnwatch, (_event, _projectId: string, dir: string) => unwatchDir(dir))

  /* --- 系统外壳能力 --- */
  handle(IPC.shellOpenExternal, (_event, url: string) => shell.openExternal(url))
  handle(IPC.shellOpenPath, (_event, path: string) => shell.openPath(path))
  handle(IPC.shellReveal, (_event, path: string) => {
    shell.showItemInFolder(path)
  })
  handle(IPC.shellOpenWithApps, () => listOpenWithApps())
  handle(IPC.shellOpenWith, (_event, appPath: string, file: string) =>
    openWith(appPath, file)
  )

  /* --- MCP 插件中心（保存即生效：清空运行时缓存，下一轮对话重建工具） --- */
  handle(IPC.mcpList, () => listMcps())
  handle(IPC.mcpSave, (_event, dto: Partial<McpDTO>) => {
    const saved = saveMcp(dto)
    resetAgents()
    return saved
  })
  handle(IPC.mcpRemove, (_event, id: string) => {
    deleteMcp(id)
    resetAgents()
  })
  handle(IPC.mcpTest, (_event, dto: Partial<McpDTO>) => testMcp(dto))
  handle(IPC.mcpTools, (_event, id: string) => listMcpTools(id))
  handle(IPC.mcpDiscover, (_event, query: McpDiscoverQuery) => discoverMcp(query))
  handle(IPC.mcpCategories, () => listMcpCategories())
  handle(IPC.mcpDetail, (_event, slug: string) => discoverMcpDetail(slug))

  /* --- SKILL 技能中心（导入 / 启停 / 删除均由 service 统一失效运行时缓存） --- */
  handle(IPC.skillList, () => listSkills())
  handle(IPC.skillDetail, (_event, id: string) => getSkillDetail(id))
  handle(IPC.skillContent, (_event, id: string, offset: number) =>
    getSkillContent(id, offset)
  )
  handle(IPC.skillImportDir, async () => {
    const result = await dialog.showOpenDialog({
      title: '选择技能目录',
      properties: ['openDirectory']
    })
    if (result.canceled || result.filePaths.length === 0) {
      return null
    }
    return importSkillsFromDirectory(result.filePaths[0])
  })
  handle(IPC.skillImportZip, async () => {
    const result = await dialog.showOpenDialog({
      title: '选择技能 Zip 文件',
      properties: ['openFile'],
      filters: [{ name: 'Zip', extensions: ['zip'] }]
    })
    if (result.canceled || result.filePaths.length === 0) {
      return null
    }
    return importSkillsFromZip(result.filePaths[0])
  })
  handle(IPC.skillSetEnabled, (_event, id: string, enabled: boolean) =>
    setSkillEnabled(id, enabled)
  )
  handle(IPC.skillRemove, (_event, id: string) => deleteSkill(id))
  handle(IPC.skillReveal, (_event, id: string) => {
    shell.showItemInFolder(getSkillRevealPath(id))
  })
  handle(IPC.skillRefresh, () => refreshSkills())
  handle(IPC.skillDiscover, (_event, query: SkillDiscoverQuery) => discoverSkills(query))
  handle(IPC.skillDiscoverDetail, (_event, id: string) => discoverSkillDetail(id))
  handle(IPC.skillInstall, (_event, id: string) => installDiscoveredSkill(id))
  handle(IPC.skillGithubInspect, (_event, query: GithubSkillQuery) =>
    inspectGithubSkills(query)
  )
  handle(IPC.skillGithubInstall, (_event, input: GithubSkillInstallInput) =>
    installGithubSkill(input)
  )
  handle(IPC.skillGithubCancel, (_event, query: GithubSkillQuery) =>
    cancelGithubSkills(query)
  )

  /* --- 会话诊断（开发者模式） --- */
  handle(IPC.diagnosticsMessages, (_event, query: DiagnosticsQuery) => listMessagePage(query))
  handle(IPC.diagnosticsTraces, (_event, query: DiagnosticsQuery) => listTraces(query))
  handle(IPC.diagnosticsClear, (_event, sessionId: string) => clearTraces(sessionId))
}
