/* 预加载：以白名单方式向渲染进程暴露受控 API（经 contextBridge 注入 window.desk） */

import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '../shared/ipc'
import type {
  AgentMemoryDTO,
  AgentMemorySaveInput,
  AppSettings,
  BrowserActionRequest,
  BrowserActionResult,
  BrowserOpenTabRequest,
  ChatEvent,
  ChatInteractionCancel,
  ChatInteractionPrompt,
  InteractionResult,
  DeskApi,
  FileContent,
  FsEntry,
  GithubSkillInspectResult,
  GithubSkillInstallInput,
  GithubSkillQuery,
  GitCommitInput,
  GitCommitResult,
  GitDiffInput,
  GitDiffResult,
  GitOperationResult,
  GitStatus,
  DiagnosticsQuery,
  LlmTraceDTO,
  McpDTO,
  McpDiscoverQuery,
  OpenWithApp,
  PageResult,
  ProviderDTO,
  ProviderModelQuery,
  ProjectCreateInput,
  RuntimeDetectResult,
  RuntimeExecInput,
  SessionDTO,
  SkillDiscoverDetail,
  SkillDiscoverQuery,
  SkillContentChunk,
  SkillDTO,
  SkillDetail,
  SkillImportResult,
  StoredMessage,
  TerminalCreateInput,
  TerminalEvent,
  UpdateInfo
} from '../shared/ipc'

const api: DeskApi = {
  /* 应用运行时信息与数据目录 */
  app: {
    /* 读取运行时信息 */
    info: () => ipcRenderer.invoke(IPC.appInfo),
    /* 切换数据目录 */
    setDataDir: (dir: string) => ipcRenderer.invoke(IPC.appSetDataDir, dir),
    /* 弹出目录选择框并切换数据目录 */
    selectDataDir: () => ipcRenderer.invoke(IPC.appSelectDataDir),
    /* 在文件管理器中打开数据目录 */
    openDataDir: () => ipcRenderer.invoke(IPC.appOpenDataDir),
    /* 重启应用使变更生效 */
    relaunch: () => ipcRenderer.invoke(IPC.appRelaunch),
    /* 弹出可执行文件选择框 */
    selectExecutable: (title?: string) => ipcRenderer.invoke(IPC.appSelectExecutable, title),
    /* 检测运行时可执行文件版本 */
    detectExecutable: (input: RuntimeExecInput): Promise<RuntimeDetectResult> =>
      ipcRenderer.invoke(IPC.appDetectExecutable, input),
    /* 上报渲染层异常 */
    logError: (message: string) => ipcRenderer.send(IPC.appLogError, message)
  },
  /* 客户端更新（引导式） */
  update: {
    /* 检测最新版本 */
    check: (): Promise<UpdateInfo> => ipcRenderer.invoke(IPC.updateCheck),
    /* 用系统浏览器打开下载 / release 页面 */
    openDownload: (url: string) => ipcRenderer.invoke(IPC.updateOpen, url)
  },
  /* 应用设置读写 */
  settings: {
    /* 读取设置 */
    get: () => ipcRenderer.invoke(IPC.settingsGet),
    /* 保存设置片段 */
    save: (patch: Partial<AppSettings>) => ipcRenderer.invoke(IPC.settingsSave, patch)
  },
  /* Agent 记忆 */
  agentMemory: {
    /* 项目记忆列表 */
    list: (): Promise<AgentMemoryDTO[]> => ipcRenderer.invoke(IPC.agentMemoryList),
    /* 保存项目记忆 */
    save: (input: AgentMemorySaveInput): Promise<AgentMemoryDTO> =>
      ipcRenderer.invoke(IPC.agentMemorySave, input),
    /* 删除项目记忆 */
    remove: (projectId: string) => ipcRenderer.invoke(IPC.agentMemoryRemove, projectId)
  },
  /* 供应商管理 */
  provider: {
    /* 供应商列表 */
    list: () => ipcRenderer.invoke(IPC.providerList),
    /* 新增或更新供应商 */
    save: (dto: Partial<ProviderDTO>) => ipcRenderer.invoke(IPC.providerSave, dto),
    /* 删除供应商 */
    remove: (id: string) => ipcRenderer.invoke(IPC.providerRemove, id),
    /* 查询远端可用模型 */
    remoteModels: (input: ProviderModelQuery) => ipcRenderer.invoke(IPC.providerRemoteModels, input)
  },
  /* 项目管理 */
  project: {
    /* 项目列表 */
    list: () => ipcRenderer.invoke(IPC.projectList),
    /* 新建项目（可选目录对话框） */
    create: (input?: ProjectCreateInput) => ipcRenderer.invoke(IPC.projectCreate, input),
    /* 重命名项目 */
    rename: (id: string, name: string) => ipcRenderer.invoke(IPC.projectRename, id, name),
    /* 删除项目 */
    remove: (id: string) => ipcRenderer.invoke(IPC.projectRemove, id),
    /* 在文件管理器中显示项目目录 */
    reveal: (id: string) => ipcRenderer.invoke(IPC.projectReveal, id)
  },
  /* Git 工具（项目空间维度） */
  git: {
    status: (projectId: string): Promise<GitStatus> => ipcRenderer.invoke(IPC.gitStatus, projectId),
    diff: (input: GitDiffInput): Promise<GitDiffResult> => ipcRenderer.invoke(IPC.gitDiff, input),
    stage: (projectId: string, path: string, oldPath?: string): Promise<GitOperationResult> =>
      ipcRenderer.invoke(IPC.gitStage, projectId, path, oldPath),
    unstage: (projectId: string, path: string, oldPath?: string): Promise<GitOperationResult> =>
      ipcRenderer.invoke(IPC.gitUnstage, projectId, path, oldPath),
    commit: (input: GitCommitInput): Promise<GitCommitResult> =>
      ipcRenderer.invoke(IPC.gitCommit, input),
    watch: (projectId: string) => ipcRenderer.invoke(IPC.gitWatch, projectId),
    unwatch: (projectId: string) => ipcRenderer.invoke(IPC.gitUnwatch, projectId),
    onChange: (callback: (projectId: string) => void) => {
      const listener = (_event: unknown, projectId: string): void => callback(projectId)
      ipcRenderer.on(IPC.gitChange, listener)
      return () => ipcRenderer.removeListener(IPC.gitChange, listener)
    }
  },
  /* 会话管理 */
  session: {
    /* 会话列表 */
    list: () => ipcRenderer.invoke(IPC.sessionList),
    /* 新建会话 */
    create: (input?: Partial<SessionDTO>) => ipcRenderer.invoke(IPC.sessionCreate, input),
    /* 更新会话 */
    update: (id: string, patch: Partial<SessionDTO>) =>
      ipcRenderer.invoke(IPC.sessionUpdate, id, patch),
    /* 重命名会话 */
    rename: (id: string, title: string) => ipcRenderer.invoke(IPC.sessionRename, id, title),
    /* 删除会话 */
    remove: (id: string) => ipcRenderer.invoke(IPC.sessionRemove, id),
    /* 读取会话历史消息 */
    messages: (sessionId: string): Promise<StoredMessage[]> =>
      ipcRenderer.invoke(IPC.sessionMessages, sessionId),
    /* 按 ID 删除指定消息 */
    removeMessages: (sessionId: string, ids: string[]) =>
      ipcRenderer.invoke(IPC.sessionDeleteMessages, sessionId, ids)
  },
  /* 对话：发送 / 中止 / 事件订阅 / 人机交互 */
  chat: {
    /* 发送用户消息并启动流式生成 */
    send: (input: { sessionId: string; text: string }) => ipcRenderer.invoke(IPC.chatSend, input),
    /* 中止当前会话生成 */
    abort: (sessionId: string) => ipcRenderer.invoke(IPC.chatAbort, sessionId),
    /* 订阅流式事件（返回取消订阅函数） */
    onEvent: (callback: (event: ChatEvent) => void) => {
      const listener = (_event: unknown, payload: ChatEvent): void => callback(payload)
      ipcRenderer.on(IPC.chatEvent, listener)
      return () => ipcRenderer.removeListener(IPC.chatEvent, listener)
    },
    /* 订阅人机交互请求（返回取消订阅函数） */
    onInteraction: (callback: (prompt: ChatInteractionPrompt) => void) => {
      const listener = (_event: unknown, payload: ChatInteractionPrompt): void => callback(payload)
      ipcRenderer.on(IPC.chatInteractionRequest, listener)
      return () => ipcRenderer.removeListener(IPC.chatInteractionRequest, listener)
    },
    /* 订阅人机交互取消（返回取消订阅函数） */
    onInteractionCancel: (callback: (payload: ChatInteractionCancel) => void) => {
      const listener = (_event: unknown, payload: ChatInteractionCancel): void => callback(payload)
      ipcRenderer.on(IPC.chatInteractionCancel, listener)
      return () => ipcRenderer.removeListener(IPC.chatInteractionCancel, listener)
    },
    /* 回传用户交互结果 */
    respondInteraction: (requestId: string, result: InteractionResult) =>
      ipcRenderer.invoke(IPC.chatInteractionRespond, requestId, result)
  },
  /* 终端管理 */
  terminal: {
    /* 创建终端实例（必须归属会话） */
    create: (input: TerminalCreateInput) => ipcRenderer.invoke(IPC.terminalCreate, input),
    /* 列举某会话存活的终端实例 */
    list: (sessionId: string) => ipcRenderer.invoke(IPC.terminalList, sessionId),
    /* 重连终端：返回实例信息与历史输出片段 */
    attach: (id: string) => ipcRenderer.invoke(IPC.terminalAttach, id),
    /* 写入终端输入 */
    write: (id: string, data: string) => ipcRenderer.invoke(IPC.terminalWrite, id, data),
    /* 调整终端尺寸 */
    resize: (id: string, cols: number, rows: number) =>
      ipcRenderer.invoke(IPC.terminalResize, id, cols, rows),
    /* 销毁终端实例 */
    dispose: (id: string) => ipcRenderer.invoke(IPC.terminalDispose, id),
    /* 终端归属会话迁移（新建对话草稿 → 真实会话） */
    reassign: (fromSessionId: string, toSessionId: string) =>
      ipcRenderer.invoke(IPC.terminalReassign, fromSessionId, toSessionId),
    /* 订阅终端输出 / 退出事件（返回取消订阅函数） */
    onEvent: (callback: (event: TerminalEvent) => void) => {
      const listener = (_event: unknown, payload: TerminalEvent): void => callback(payload)
      ipcRenderer.on(IPC.terminalEvent, listener)
      return () => ipcRenderer.removeListener(IPC.terminalEvent, listener)
    }
  },
  /* 本地文件系统（右侧「工具 → 文件」面板，按项目主键限定项目目录内） */
  fs: {
    /* 列出目录项 */
    list: (projectId: string, dir: string): Promise<FsEntry[]> =>
      ipcRenderer.invoke(IPC.fsList, projectId, dir),
    /* 读取文件内容 */
    read: (projectId: string, path: string): Promise<FileContent> =>
      ipcRenderer.invoke(IPC.fsRead, projectId, path),
    /* 写入文件内容 */
    write: (projectId: string, path: string, content: string) =>
      ipcRenderer.invoke(IPC.fsWrite, projectId, path, content),
    /* 删除文件（移入系统废纸篓） */
    trash: (projectId: string, path: string) =>
      ipcRenderer.invoke(IPC.fsTrash, projectId, path),
    /* 监听目录变更 */
    watch: (projectId: string, dir: string) => ipcRenderer.invoke(IPC.fsWatch, projectId, dir),
    /* 取消目录监听 */
    unwatch: (projectId: string, dir: string) =>
      ipcRenderer.invoke(IPC.fsUnwatch, projectId, dir),
    /* 订阅目录变更事件（返回取消订阅函数） */
    onChange: (callback: (dir: string) => void) => {
      const listener = (_event: unknown, dir: string): void => callback(dir)
      ipcRenderer.on(IPC.fsChange, listener)
      return () => ipcRenderer.removeListener(IPC.fsChange, listener)
    }
  },
  /* 系统外壳能力 */
  shell: {
    /* 用系统默认程序打开外部链接 */
    openExternal: (url: string) => ipcRenderer.invoke(IPC.shellOpenExternal, url),
    /* 用系统默认程序打开文件或目录 */
    openPath: (path: string) => ipcRenderer.invoke(IPC.shellOpenPath, path),
    /* 在文件管理器中显示指定路径 */
    reveal: (path: string) => ipcRenderer.invoke(IPC.shellReveal, path),
    /* 探测可用「打开方式」应用 */
    openWithApps: (): Promise<OpenWithApp[]> => ipcRenderer.invoke(IPC.shellOpenWithApps),
    /* 用指定应用打开文件 */
    openWith: (appPath: string, file: string) =>
      ipcRenderer.invoke(IPC.shellOpenWith, appPath, file)
  },
  /* 内嵌浏览器 */
  browser: {
    /* 内嵌浏览器：新窗口 / Agent 打开请求 → 渲染层标签页（返回取消订阅函数） */
    onOpenTab: (callback: (request: BrowserOpenTabRequest) => void) => {
      const listener = (_event: unknown, request: BrowserOpenTabRequest): void => callback(request)
      ipcRenderer.on(IPC.browserOpenTab, listener)
      return () => ipcRenderer.removeListener(IPC.browserOpenTab, listener)
    },
    /* Agent 页面动作请求：渲染层执行脚本并回传结果（返回取消订阅函数） */
    onActionRequest: (callback: (request: BrowserActionRequest) => void) => {
      const listener = (_event: unknown, request: BrowserActionRequest): void => callback(request)
      ipcRenderer.on(IPC.browserActionRequest, listener)
      return () => ipcRenderer.removeListener(IPC.browserActionRequest, listener)
    },
    /* 回传页面动作结果 */
    respondAction: (requestId: string, result: BrowserActionResult) =>
      ipcRenderer.invoke(IPC.browserActionResult, requestId, result)
  },
  /* MCP 插件中心 */
  mcp: {
    /* MCP 服务列表 */
    list: () => ipcRenderer.invoke(IPC.mcpList),
    /* 新增或更新 MCP 服务 */
    save: (dto: Partial<McpDTO>) => ipcRenderer.invoke(IPC.mcpSave, dto),
    /* 删除 MCP 服务 */
    remove: (id: string) => ipcRenderer.invoke(IPC.mcpRemove, id),
    /* 连通测试 */
    test: (dto: Partial<McpDTO>) => ipcRenderer.invoke(IPC.mcpTest, dto),
    /* 已保存服务的工具列表 */
    tools: (id: string) => ipcRenderer.invoke(IPC.mcpTools, id),
    /* 发现 MCP：在线检索 */
    discover: (query: McpDiscoverQuery) => ipcRenderer.invoke(IPC.mcpDiscover, query),
    /* 发现 MCP：社区分类列表 */
    categories: () => ipcRenderer.invoke(IPC.mcpCategories),
    /* 发现 MCP：详情 */
    detail: (slug: string) => ipcRenderer.invoke(IPC.mcpDetail, slug)
  },
  /* SKILL 技能中心 */
  skill: {
    /* 技能列表 */
    list: (): Promise<SkillDTO[]> => ipcRenderer.invoke(IPC.skillList),
    /* 技能详情 */
    detail: (id: string): Promise<SkillDetail> => ipcRenderer.invoke(IPC.skillDetail, id),
    /* 技能正文续读 */
    content: (id: string, offset: number): Promise<SkillContentChunk> =>
      ipcRenderer.invoke(IPC.skillContent, id, offset),
    /* 从本地目录导入 */
    importDirectory: (): Promise<SkillImportResult | null> =>
      ipcRenderer.invoke(IPC.skillImportDir),
    /* 从 Zip 导入 */
    importZip: (): Promise<SkillImportResult | null> => ipcRenderer.invoke(IPC.skillImportZip),
    /* 启用 / 停用 */
    setEnabled: (id: string, enabled: boolean): Promise<SkillDTO> =>
      ipcRenderer.invoke(IPC.skillSetEnabled, id, enabled),
    /* 删除技能 */
    remove: (id: string) => ipcRenderer.invoke(IPC.skillRemove, id),
    /* 在文件管理器中显示技能目录 */
    reveal: (id: string) => ipcRenderer.invoke(IPC.skillReveal, id),
    /* 重新扫描 */
    refresh: (): Promise<SkillDTO[]> => ipcRenderer.invoke(IPC.skillRefresh),
    /* 发现 SKILL：检索 / 榜单 */
    discover: (query: SkillDiscoverQuery) => ipcRenderer.invoke(IPC.skillDiscover, query),
    /* 发现 SKILL：详情描述 */
    discoverDetail: (id: string): Promise<SkillDiscoverDetail> =>
      ipcRenderer.invoke(IPC.skillDiscoverDetail, id),
    /* 发现 SKILL：安装 */
    install: (id: string): Promise<SkillDTO> => ipcRenderer.invoke(IPC.skillInstall, id),
    /* 从 GitHub 安装：扫描仓库技能 */
    githubInspect: (query: GithubSkillQuery): Promise<GithubSkillInspectResult> =>
      ipcRenderer.invoke(IPC.skillGithubInspect, query),
    /* 从 GitHub 安装：安装指定技能 */
    githubInstall: (input: GithubSkillInstallInput): Promise<SkillDTO> =>
      ipcRenderer.invoke(IPC.skillGithubInstall, input),
    /* 从 GitHub 安装：释放临时归档 */
    githubCancel: (query: GithubSkillQuery) =>
      ipcRenderer.invoke(IPC.skillGithubCancel, query)
  },
  /* 会话诊断（开发者模式） */
  diagnostics: {
    /* 会话消息分页 */
    messages: (query: DiagnosticsQuery) => ipcRenderer.invoke(IPC.diagnosticsMessages, query),
    /* 模型通讯分页 */
    traces: (query: DiagnosticsQuery): Promise<PageResult<LlmTraceDTO>> =>
      ipcRenderer.invoke(IPC.diagnosticsTraces, query),
    /* 清空本会话通讯记录 */
    clearTraces: (sessionId: string) => ipcRenderer.invoke(IPC.diagnosticsClear, sessionId)
  }
}

contextBridge.exposeInMainWorld('desk', api)
