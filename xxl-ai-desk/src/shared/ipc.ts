/*
 * 主进程 / 预加载 / 渲染进程共享契约的聚合入口：
 *   - 各域契约（DTO / 常量）定义在 contracts/*，此处统一再导出，保持既有 import 路径不变；
 *   - 汇总 IPC 通道常量（IPC）与 preload 暴露给渲染进程的 API 接口（DeskApi）。
 */

export * from './contracts/app'
export * from './contracts/provider'
export * from './contracts/project'
export * from './contracts/session'
export * from './contracts/chat'
export * from './contracts/terminal'
export * from './contracts/fs'
export * from './contracts/git'
export * from './contracts/shell'
export * from './contracts/mcp'
export * from './contracts/skill'
export * from './contracts/browser'
export * from './contracts/agent'
export * from './contracts/pagination'
export * from './contracts/diagnostics'
export * from './defaults'
export * from './history'

import type {
  AppSettings,
  RuntimeDetectResult,
  RuntimeExecInput,
  RuntimeInfo,
  UpdateInfo
} from './contracts/app'
import type { ProviderDTO, ProviderModelQuery } from './contracts/provider'
import type { ProjectCreateInput, ProjectDTO } from './contracts/project'
import type { SessionDTO, StoredMessage } from './contracts/session'
import type {
  ChatEvent,
  ChatInteractionCancel,
  ChatInteractionPrompt,
  InteractionResult
} from './contracts/chat'
import type {
  TerminalAttachResult,
  TerminalCreateInput,
  TerminalDTO,
  TerminalEvent
} from './contracts/terminal'
import type { FileContent, FsEntry } from './contracts/fs'
import type {
  GitCommitInput,
  GitCommitResult,
  GitDiffInput,
  GitDiffResult,
  GitOperationResult,
  GitStatus
} from './contracts/git'
import type { OpenWithApp } from './contracts/shell'
import type {
  BrowserActionResult,
  BrowserActionRequest,
  BrowserOpenTabRequest
} from './contracts/browser'
import type { AgentMemoryDTO, AgentMemorySaveInput } from './contracts/agent'
import type { DiagnosticsQuery, LlmTraceDTO } from './contracts/diagnostics'
import type { PageResult } from './contracts/pagination'
import type {
  McpCategory,
  McpDiscoverDetail,
  McpDiscoverPage,
  McpDiscoverQuery,
  McpDTO,
  McpTestResult,
  McpToolMeta
} from './contracts/mcp'
import type {
  GithubSkillInspectResult,
  GithubSkillInstallInput,
  GithubSkillQuery,
  SkillContentChunk,
  SkillDetail,
  SkillDiscoverDetail,
  SkillDiscoverPage,
  SkillDiscoverQuery,
  SkillDTO,
  SkillImportResult
} from './contracts/skill'

/* 预加载暴露给渲染进程的 API */
export interface DeskApi {
  /* 应用运行时信息与数据目录 */
  app: {
    /* 读取运行时信息（版本 / 平台 / 数据目录） */
    info(): Promise<RuntimeInfo>
    /* 切换数据目录并返回生效路径 */
    setDataDir(dir: string): Promise<string>
    /* 弹出目录选择框并切换数据目录 */
    selectDataDir(): Promise<string>
    /* 在文件管理器中打开数据目录 */
    openDataDir(): Promise<void>
    /* 重启应用使数据目录变更生效 */
    relaunch(): Promise<void>
    /* 弹出可执行文件选择框，取消返回空串 */
    selectExecutable(title?: string): Promise<string>
    /* 检测运行时可执行文件（node / python）版本 */
    detectExecutable(input: RuntimeExecInput): Promise<RuntimeDetectResult>
    /* 上报渲染层异常（只写日志，不返回结果） */
    logError(message: string): void
  }
  /* 客户端更新（引导式：检测 + 前往下载） */
  update: {
    /* 检测最新版本 */
    check(): Promise<UpdateInfo>
    /* 用系统浏览器打开下载 / release 页面 */
    openDownload(url: string): Promise<void>
  }
  /* 应用设置读写 */
  settings: {
    /* 读取应用设置 */
    get(): Promise<AppSettings>
    /* 保存设置片段并返回完整设置 */
    save(patch: Partial<AppSettings>): Promise<AppSettings>
  }
  /* Agent 记忆（按项目维度维护） */
  agentMemory: {
    /* 项目记忆列表（无记忆的项目 content 为空） */
    list(): Promise<AgentMemoryDTO[]>
    /* 保存项目记忆（手动编辑） */
    save(input: AgentMemorySaveInput): Promise<AgentMemoryDTO>
    /* 删除项目记忆（仅清记忆，不删项目） */
    remove(projectId: string): Promise<void>
  }
  /* 供应商（OpenAI 兼容端点）管理 */
  provider: {
    /* 供应商列表 */
    list(): Promise<ProviderDTO[]>
    /* 新增或更新供应商 */
    save(dto: Partial<ProviderDTO>): Promise<ProviderDTO>
    /* 删除供应商 */
    remove(id: string): Promise<void>
    /* 查询远端可用模型 */
    remoteModels(input: ProviderModelQuery): Promise<string[]>
  }
  /* 项目管理（1:1 绑定本地磁盘目录） */
  project: {
    /* 项目列表 */
    list(): Promise<ProjectDTO[]>
    /* 新建项目（path 缺省时弹出目录选择对话框，取消返回 null） */
    create(input?: ProjectCreateInput): Promise<ProjectDTO | null>
    /* 重命名项目（仅改名称，目录绑定不变） */
    rename(id: string, name: string): Promise<ProjectDTO>
    /* 删除项目（级联删除其下会话与消息） */
    remove(id: string): Promise<void>
    /* 在文件管理器中显示项目目录 */
    reveal(id: string): Promise<void>
  }
  /* Git 工具（按项目空间执行，限定已登记项目目录） */
  git: {
    /* 项目 Git 状态：分支 / ahead-behind / 暂存与工作区变更 */
    status(projectId: string): Promise<GitStatus>
    /* 查看单文件差异（暂存区或工作区） */
    diff(input: GitDiffInput): Promise<GitDiffResult>
    /* 暂存单个文件 */
    stage(projectId: string, path: string, oldPath?: string): Promise<GitOperationResult>
    /* 取消暂存单个文件 */
    unstage(projectId: string, path: string, oldPath?: string): Promise<GitOperationResult>
    /* 提交暂存区变更 */
    commit(input: GitCommitInput): Promise<GitCommitResult>
    /* 监听项目 Git 变更（外部 git 操作即时刷新） */
    watch(projectId: string): Promise<void>
    /* 取消项目 Git 变更监听 */
    unwatch(projectId: string): Promise<void>
    /* 订阅项目 Git 变更事件（返回取消订阅函数） */
    onChange(cb: (projectId: string) => void): () => void
  }
  /* 会话管理 */
  session: {
    /* 会话列表 */
    list(): Promise<SessionDTO[]>
    /* 新建会话（缺省使用设置中的供应商 / 模型） */
    create(input?: Partial<SessionDTO>): Promise<SessionDTO>
    /* 更新会话（供应商 / 模型 / 模式等） */
    update(id: string, patch: Partial<SessionDTO>): Promise<SessionDTO>
    /* 重命名会话 */
    rename(id: string, title: string): Promise<void>
    /* 删除会话 */
    remove(id: string): Promise<void>
    /* 读取会话历史消息 */
    messages(sessionId: string): Promise<StoredMessage[]>
    /* 按 ID 删除指定消息 */
    removeMessages(sessionId: string, ids: string[]): Promise<void>
  }
  /* 对话（发送 / 中止 / 事件订阅 / 人机交互） */
  chat: {
    /* 发送用户消息并启动流式生成 */
    send(input: { sessionId: string; text: string }): Promise<void>
    /* 中止当前会话的生成 */
    abort(sessionId: string): Promise<void>
    /* 订阅对话流式事件（返回取消订阅函数） */
    onEvent(cb: (event: ChatEvent) => void): () => void
    /* 订阅人机交互请求（返回取消订阅函数） */
    onInteraction(cb: (prompt: ChatInteractionPrompt) => void): () => void
    /* 订阅人机交互取消（会话终止/删除后关闭弹窗） */
    onInteractionCancel(cb: (payload: ChatInteractionCancel) => void): () => void
    /* 回传用户交互结果（提交 / 拒绝 / 取消） */
    respondInteraction(requestId: string, result: InteractionResult): Promise<void>
  }
  /* 终端（本地 PTY）管理 */
  terminal: {
    /* 创建终端实例（必须归属会话） */
    create(input: TerminalCreateInput): Promise<TerminalDTO>
    /* 列举某会话存活的终端实例 */
    list(sessionId: string): Promise<TerminalDTO[]>
    /* 重连终端：返回实例信息与历史输出片段（会话切换后回放） */
    attach(id: string): Promise<TerminalAttachResult | null>
    /* 写入终端输入 */
    write(id: string, data: string): Promise<void>
    /* 调整终端尺寸 */
    resize(id: string, cols: number, rows: number): Promise<void>
    /* 销毁终端实例 */
    dispose(id: string): Promise<void>
    /* 终端归属会话迁移（新建对话草稿 → 真实会话） */
    reassign(fromSessionId: string, toSessionId: string): Promise<void>
    /* 订阅终端输出 / 退出事件（返回取消订阅函数） */
    onEvent(cb: (event: TerminalEvent) => void): () => void
  }
  /* 本地文件系统（右侧「工具 → 文件」面板使用，按项目主键限定项目目录内） */
  fs: {
    /* 列出目录项（子目录懒加载） */
    list(projectId: string, dir: string): Promise<FsEntry[]>
    /* 读取文件内容（文本预览；图片附带预览数据 URL） */
    read(projectId: string, path: string): Promise<FileContent>
    /* 写入文件内容 */
    write(projectId: string, path: string, content: string): Promise<void>
    /* 删除文件（移入系统废纸篓） */
    trash(projectId: string, path: string): Promise<void>
    /* 监听目录变更（本地增删文件后自动刷新）；onChange 返回取消订阅函数 */
    watch(projectId: string, dir: string): Promise<void>
    /* 取消目录监听 */
    unwatch(projectId: string, dir: string): Promise<void>
    /* 订阅目录变更事件（返回取消订阅函数） */
    onChange(cb: (dir: string) => void): () => void
  }
  /* 系统外壳能力（外部打开 / 打开所在文件夹 / 在文件管理器中显示 / 用指定应用打开） */
  shell: {
    /* 用系统默认程序打开外部链接 */
    openExternal(url: string): Promise<void>
    /* 用系统默认程序打开文件或目录 */
    openPath(path: string): Promise<void>
    /* 在文件管理器中显示指定路径 */
    reveal(path: string): Promise<void>
    /* 探测本机可用的「打开方式」应用 */
    openWithApps(): Promise<OpenWithApp[]>
    /* 用指定应用打开文件 */
    openWith(appPath: string, file: string): Promise<void>
  }
  /* 内嵌浏览器（右侧「工具 → 浏览器」面板）：新窗口请求转发 + 页面内容读取 */
  browser: {
    /* 订阅新标签页请求（返回取消订阅函数） */
    onOpenTab(cb: (request: BrowserOpenTabRequest) => void): () => void
    /* 订阅 Agent 页面动作请求（返回取消订阅函数），处理完需调用 respondAction 回传 */
    onActionRequest(cb: (request: BrowserActionRequest) => void): () => void
    /* 回传页面动作结果 */
    respondAction(requestId: string, result: BrowserActionResult): Promise<void>
  }
  /* MCP 插件中心（在线管理 + 发现 MCP） */
  mcp: {
    /* MCP 服务列表 */
    list(): Promise<McpDTO[]>
    /* 新增或更新 MCP 服务（保存即生效） */
    save(dto: Partial<McpDTO>): Promise<McpDTO>
    /* 删除 MCP 服务 */
    remove(id: string): Promise<void>
    /* 连通测试（支持未保存草稿） */
    test(dto: Partial<McpDTO>): Promise<McpTestResult>
    /* 已保存服务的可用工具列表 */
    tools(id: string): Promise<McpToolMeta[]>
    /* 发现 MCP：在线检索 */
    discover(query: McpDiscoverQuery): Promise<McpDiscoverPage>
    /* 发现 MCP：社区分类列表 */
    categories(): Promise<McpCategory[]>
    /* 发现 MCP：详情 */
    detail(slug: string): Promise<McpDiscoverDetail>
  }
  /* SKILL 技能中心（本地管理 + 发现安装） */
  skill: {
    /* 技能列表（扫描数据目录并对账） */
    list(): Promise<SkillDTO[]>
    /* 技能详情（SKILL.md 正文首屏 + 文件清单） */
    detail(id: string): Promise<SkillDetail>
    /* 技能正文续读（按字节偏移，内容不截断） */
    content(id: string, offset: number): Promise<SkillContentChunk>
    /* 从本地目录导入（弹目录选择框，取消返回 null） */
    importDirectory(): Promise<SkillImportResult | null>
    /* 从 Zip 导入（弹文件选择框，取消返回 null） */
    importZip(): Promise<SkillImportResult | null>
    /* 启用 / 停用技能 */
    setEnabled(id: string, enabled: boolean): Promise<SkillDTO>
    /* 删除技能（目录与记录一并清理） */
    remove(id: string): Promise<void>
    /* 在文件管理器中显示技能目录 */
    reveal(id: string): Promise<void>
    /* 重新扫描技能目录（刷新后清空运行时缓存） */
    refresh(): Promise<SkillDTO[]>
    /* 发现 SKILL：检索 / 榜单（空关键字返回榜单） */
    discover(query: SkillDiscoverQuery): Promise<SkillDiscoverPage>
    /* 发现 SKILL：详情描述（按需读取站点详情页） */
    discoverDetail(id: string): Promise<SkillDiscoverDetail>
    /* 发现 SKILL：安装（仅 GitHub 来源） */
    install(id: string): Promise<SkillDTO>
    /* 从 GitHub 安装：扫描仓库技能 */
    githubInspect(query: GithubSkillQuery): Promise<GithubSkillInspectResult>
    /* 从 GitHub 安装：安装指定技能 */
    githubInstall(input: GithubSkillInstallInput): Promise<SkillDTO>
    /* 从 GitHub 安装：释放扫描产生的临时归档 */
    githubCancel(query: GithubSkillQuery): Promise<void>
  }
  /* 会话诊断（开发者模式）：会话消息与模型通讯 trace */
  diagnostics: {
    /* 会话消息分页（复用 StoredMessage） */
    messages(query: DiagnosticsQuery): Promise<PageResult<StoredMessage>>
    /* 模型通讯分页 */
    traces(query: DiagnosticsQuery): Promise<PageResult<LlmTraceDTO>>
    /* 清空指定会话的通讯记录 */
    clearTraces(sessionId: string): Promise<void>
  }
}

/* IPC 通道名（统一 desk:{module}:{action}；主进程经 ipcMain.handle 注册，preload 经 ipcRenderer.invoke/on 使用） */
export const IPC = {
  /* 应用信息与数据目录 */
  appInfo: 'desk:app:info',
  appSetDataDir: 'desk:app:set-data-dir',
  appSelectDataDir: 'desk:app:select-data-dir',
  appOpenDataDir: 'desk:app:open-data-dir',
  appRelaunch: 'desk:app:relaunch',
  appSelectExecutable: 'desk:app:select-executable',
  appDetectExecutable: 'desk:app:detect-executable',
  appLogError: 'desk:app:log-error',
  /* 客户端更新 */
  updateCheck: 'desk:update:check',
  updateOpen: 'desk:update:open',
  /* 应用设置 */
  settingsGet: 'desk:settings:get',
  settingsSave: 'desk:settings:save',
  /* Agent 记忆 */
  agentMemoryList: 'desk:agent-memory:list',
  agentMemorySave: 'desk:agent-memory:save',
  agentMemoryRemove: 'desk:agent-memory:remove',
  /* 供应商 */
  providerList: 'desk:provider:list',
  providerSave: 'desk:provider:save',
  providerRemove: 'desk:provider:remove',
  providerRemoteModels: 'desk:provider:remote-models',
  /* 项目 */
  projectList: 'desk:project:list',
  projectCreate: 'desk:project:create',
  projectRename: 'desk:project:rename',
  projectRemove: 'desk:project:remove',
  projectReveal: 'desk:project:reveal',
  /* Git 工具 */
  gitStatus: 'desk:git:status',
  gitDiff: 'desk:git:diff',
  gitStage: 'desk:git:stage',
  gitUnstage: 'desk:git:unstage',
  gitCommit: 'desk:git:commit',
  gitWatch: 'desk:git:watch',
  gitUnwatch: 'desk:git:unwatch',
  gitChange: 'desk:git:change',
  /* 会话 */
  sessionList: 'desk:session:list',
  sessionCreate: 'desk:session:create',
  sessionUpdate: 'desk:session:update',
  sessionRename: 'desk:session:rename',
  sessionRemove: 'desk:session:remove',
  sessionMessages: 'desk:session:messages',
  sessionDeleteMessages: 'desk:session:delete-messages',
  /* 对话 */
  chatSend: 'desk:chat:send',
  chatAbort: 'desk:chat:abort',
  chatEvent: 'desk:chat:event',
  chatInteractionRequest: 'desk:chat:interaction-request',
  chatInteractionRespond: 'desk:chat:interaction-respond',
  chatInteractionCancel: 'desk:chat:interaction-cancel',
  /* 终端 */
  terminalCreate: 'desk:terminal:create',
  terminalList: 'desk:terminal:list',
  terminalAttach: 'desk:terminal:attach',
  terminalWrite: 'desk:terminal:write',
  terminalResize: 'desk:terminal:resize',
  terminalDispose: 'desk:terminal:dispose',
  terminalReassign: 'desk:terminal:reassign',
  terminalEvent: 'desk:terminal:event',
  /* 本地文件系统 */
  fsList: 'desk:fs:list',
  fsRead: 'desk:fs:read',
  fsWrite: 'desk:fs:write',
  fsTrash: 'desk:fs:trash',
  fsWatch: 'desk:fs:watch',
  fsUnwatch: 'desk:fs:unwatch',
  fsChange: 'desk:fs:change',
  /* 系统外壳能力 */
  shellOpenExternal: 'desk:shell:open-external',
  shellOpenPath: 'desk:shell:open-path',
  shellReveal: 'desk:shell:reveal',
  shellOpenWithApps: 'desk:shell:open-with-apps',
  shellOpenWith: 'desk:shell:open-with',
  /* 内嵌浏览器新窗口请求 → 渲染层新标签页 */
  browserOpenTab: 'desk:browser:open-tab',
  /* 内嵌浏览器页面动作：主进程 → 渲染层请求 / 渲染层 → 主进程结果 */
  browserActionRequest: 'desk:browser:action-request',
  browserActionResult: 'desk:browser:action-result',
  /* MCP 插件中心 */
  mcpList: 'desk:mcp:list',
  mcpSave: 'desk:mcp:save',
  mcpRemove: 'desk:mcp:remove',
  mcpTest: 'desk:mcp:test',
  mcpTools: 'desk:mcp:tools',
  mcpDiscover: 'desk:mcp:discover',
  mcpCategories: 'desk:mcp:categories',
  mcpDetail: 'desk:mcp:detail',
  /* SKILL 技能中心 */
  skillList: 'desk:skill:list',
  skillDetail: 'desk:skill:detail',
  skillContent: 'desk:skill:content',
  skillImportDir: 'desk:skill:import-dir',
  skillImportZip: 'desk:skill:import-zip',
  skillSetEnabled: 'desk:skill:set-enabled',
  skillRemove: 'desk:skill:remove',
  skillReveal: 'desk:skill:reveal',
  skillRefresh: 'desk:skill:refresh',
  skillDiscover: 'desk:skill:discover',
  skillDiscoverDetail: 'desk:skill:discover-detail',
  skillInstall: 'desk:skill:install',
  skillGithubInspect: 'desk:skill:github-inspect',
  skillGithubInstall: 'desk:skill:github-install',
  skillGithubCancel: 'desk:skill:github-cancel',
  /* 会话诊断（开发者模式） */
  diagnosticsMessages: 'desk:diagnostics:messages',
  diagnosticsTraces: 'desk:diagnostics:traces',
  diagnosticsClear: 'desk:diagnostics:clear'
} as const
