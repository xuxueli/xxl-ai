/* 主进程 / 预加载 / 渲染进程共享的类型定义 */

/* 供应商（OpenAI 兼容端点） */
export interface ProviderDTO {
  id: string
  name: string
  baseUrl: string
  apiKey: string
  headers: Record<string, string>
  models: string[]
  enabled: boolean
  sort: number
  addTime: string
  updateTime: string
}

/* 远程模型查询入参（未保存的草稿可直接传表单值，已保存的可只传 id 复用库存密钥） */
export interface ProviderModelQuery {
  id?: string
  baseUrl?: string
  apiKey?: string
  headers?: Record<string, string>
}

/* 项目：1:1 强绑定一个本地磁盘目录 */
export interface ProjectDTO {
  id: string
  name: string
  path: string
  addTime: string
  updateTime: string
}

/* 新建项目入参（path 缺省时由主进程弹出目录选择对话框） */
export interface ProjectCreateInput {
  name?: string
  path?: string
  /* 目录选择对话框标题（由渲染进程按语言注入） */
  dialogTitle?: string
}

/* 对话模式：plan 只读只规划；build 全量读写（默认） */
export type ChatMode = 'plan' | 'build'

/* 会话（归属某项目） */
export interface SessionDTO {
  id: string
  title: string
  projectId: string
  providerId: string
  modelId: string
  mode: ChatMode
  addTime: string
  updateTime: string
}

/* 已持久化的消息记录 */
export interface StoredMessage {
  id: string
  sessionId: string
  seq: number
  role: string
  content: string
  data: string
  addTime: string
}

/* 快捷操作标识（命令面板「快捷操作」区块，同时支持全局快捷键触发） */
export type QuickAction = 'newChat' | 'settings' | 'terminal' | 'files' | 'browser'

/* 快捷操作 → 快捷键绑定：键名小写、以 + 连接，mod 表示平台主修饰键（macOS ⌘ / 其他 Ctrl） */
export type ShortcutMap = Partial<Record<QuickAction, string>>

/* 快捷键默认值（主进程与渲染进程共用；mod = 平台主修饰键，macOS ⌘ / 其他 Ctrl）
 * 取值按助记字母：新建 N、设置 S、终端 T、文件 F、浏览器 B */
export const DEFAULT_SHORTCUTS: ShortcutMap = {
  newChat: 'mod+n',
  settings: 'mod+s',
  terminal: 'mod+t',
  files: 'mod+f',
  browser: 'mod+b'
}

/* 应用设置 */
export interface AppSettings {
  theme: 'light' | 'dark' | 'system'
  language: 'zh' | 'en'
  providerId: string
  modelId: string
  systemPrompt: string
  /* 个性化：应用名称（左上角 Logo 区域）与 Slogan（空态欢迎语） */
  appName: string
  slogan: string
  /* 快捷操作快捷键（缺省项回退 DEFAULT_SHORTCUTS） */
  shortcuts: ShortcutMap
}

/* 对话流式事件（主 → 渲染） */
export interface ChatEvent {
  sessionId: string
  type: 'delta' | 'thinking' | 'tool_start' | 'tool_end' | 'error' | 'done' | 'aborted'
  text?: string
  toolName?: string
  toolCallId?: string
  /* 工具调用入参（tool_start） */
  args?: unknown
  /* 工具返回文本（tool_end） */
  result?: string
  isError?: boolean
  message?: string
}

/* 越界审批选择：允许本次 / 本会话允许 / 拒绝 */
export type ChatApprovalChoice = 'once' | 'session' | 'deny'

/* 越界审批请求（主进程 → 渲染进程，由渲染进程弹应用内对话框） */
export interface ChatApprovalPrompt {
  requestId: string
  tool: string
  action: 'read' | 'write'
  abs: string
  root: string
}

/* 终端创建入参：cwd 为工作目录（通常为项目目录），缺省回退用户主目录 */
export interface TerminalCreateInput {
  cwd?: string
  cols?: number
  rows?: number
}

/* 终端实例信息 */
export interface TerminalDTO {
  id: string
  cwd: string
  shell: string
}

/* 终端流事件（主 → 渲染）：data 为输出片段，exit 为进程退出 */
export interface TerminalEvent {
  id: string
  type: 'data' | 'exit'
  data?: string
  exitCode?: number
}

/* 文件树节点（目录懒加载，children 由前端按需请求） */
export interface FsEntry {
  name: string
  path: string
  isDir: boolean
}

/* 文件读取结果（文本预览；图片附带 dataUrl 供内联预览） */
export interface FileContent {
  path: string
  name: string
  /* 文本内容（二进制文件为空串） */
  content: string
  size: number
  /* 因体积超限被截断 */
  truncated: boolean
  /* 判定为二进制（不可文本预览） */
  binary: boolean
  /* 图片预览数据 URL（仅可预览图片提供） */
  dataUrl?: string
}

/* 可用「打开方式」应用（由主进程探测本机常见编辑器，供下拉选择） */
export interface OpenWithApp {
  name: string
  path: string
}

/* 运行时信息（版本 / 平台 / 数据目录） */
export interface RuntimeInfo {
  version: string
  platform: string
  dataDir: string
  defaultDataDir: string
  dbFile: string
}

/* 预加载暴露给渲染进程的 API */
export interface DeskApi {
  app: {
    info(): Promise<RuntimeInfo>
    setDataDir(dir: string): Promise<string>
    selectDataDir(): Promise<string>
    openDataDir(): Promise<void>
    relaunch(): Promise<void>
  }
  settings: {
    get(): Promise<AppSettings>
    save(patch: Partial<AppSettings>): Promise<AppSettings>
  }
  provider: {
    list(): Promise<ProviderDTO[]>
    save(dto: Partial<ProviderDTO>): Promise<ProviderDTO>
    remove(id: string): Promise<void>
    remoteModels(input: ProviderModelQuery): Promise<string[]>
  }
  project: {
    list(): Promise<ProjectDTO[]>
    create(input?: ProjectCreateInput): Promise<ProjectDTO | null>
    rename(id: string, name: string): Promise<ProjectDTO>
    remove(id: string): Promise<void>
    reveal(id: string): Promise<void>
  }
  session: {
    list(): Promise<SessionDTO[]>
    create(input?: Partial<SessionDTO>): Promise<SessionDTO>
    update(id: string, patch: Partial<SessionDTO>): Promise<SessionDTO>
    rename(id: string, title: string): Promise<void>
    remove(id: string): Promise<void>
    messages(sessionId: string): Promise<StoredMessage[]>
    clear(sessionId: string): Promise<void>
    removeMessages(sessionId: string, ids: string[]): Promise<void>
  }
  chat: {
    send(input: { sessionId: string; text: string }): Promise<void>
    abort(sessionId: string): Promise<void>
    onEvent(cb: (event: ChatEvent) => void): () => void
    /* 越界审批：主进程推送请求，渲染进程回传选择 */
    onApproval(cb: (prompt: ChatApprovalPrompt) => void): () => void
    respondApproval(requestId: string, choice: ChatApprovalChoice): Promise<void>
  }
  terminal: {
    create(input?: TerminalCreateInput): Promise<TerminalDTO>
    write(id: string, data: string): Promise<void>
    resize(id: string, cols: number, rows: number): Promise<void>
    dispose(id: string): Promise<void>
    onEvent(cb: (event: TerminalEvent) => void): () => void
  }
  /* 本地文件系统（右侧「工具 → 文件」面板使用，限定在项目目录内） */
  fs: {
    list(root: string, dir: string): Promise<FsEntry[]>
    read(root: string, path: string): Promise<FileContent>
    write(root: string, path: string, content: string): Promise<void>
    /* 监听目录变更（本地增删文件后自动刷新）；onChange 返回取消订阅函数 */
    watch(dir: string): Promise<void>
    unwatch(dir: string): Promise<void>
    onChange(cb: (dir: string) => void): () => void
  }
  /* 系统外壳能力（外部打开 / 打开所在文件夹 / 在文件管理器中显示 / 用指定应用打开） */
  shell: {
    openExternal(url: string): Promise<void>
    openPath(path: string): Promise<void>
    reveal(path: string): Promise<void>
    openWithApps(): Promise<OpenWithApp[]>
    openWith(appPath: string, file: string): Promise<void>
  }
  /* 内嵌浏览器（右侧「工具 → 浏览器」面板）：主进程把新窗口请求转发为「新标签页」 */
  browser: {
    onOpenTab(cb: (url: string) => void): () => void
  }
}

export const IPC = {
  appInfo: 'desk:app:info',
  appSetDataDir: 'desk:app:set-data-dir',
  appSelectDataDir: 'desk:app:select-data-dir',
  appOpenDataDir: 'desk:app:open-data-dir',
  appRelaunch: 'desk:app:relaunch',
  settingsGet: 'desk:settings:get',
  settingsSave: 'desk:settings:save',
  providerList: 'desk:provider:list',
  providerSave: 'desk:provider:save',
  providerRemove: 'desk:provider:remove',
  providerRemoteModels: 'desk:provider:remote-models',
  projectList: 'desk:project:list',
  projectCreate: 'desk:project:create',
  projectRename: 'desk:project:rename',
  projectRemove: 'desk:project:remove',
  projectReveal: 'desk:project:reveal',
  sessionList: 'desk:session:list',
  sessionCreate: 'desk:session:create',
  sessionUpdate: 'desk:session:update',
  sessionRename: 'desk:session:rename',
  sessionRemove: 'desk:session:remove',
  sessionMessages: 'desk:session:messages',
  sessionClear: 'desk:session:clear',
  sessionDeleteMessages: 'desk:session:delete-messages',
  chatSend: 'desk:chat:send',
  chatAbort: 'desk:chat:abort',
  chatEvent: 'desk:chat:event',
  chatApprovalRequest: 'desk:chat:approval-request',
  chatApprovalRespond: 'desk:chat:approval-respond',
  terminalCreate: 'desk:terminal:create',
  terminalWrite: 'desk:terminal:write',
  terminalResize: 'desk:terminal:resize',
  terminalDispose: 'desk:terminal:dispose',
  terminalEvent: 'desk:terminal:event',
  fsList: 'desk:fs:list',
  fsRead: 'desk:fs:read',
  fsWrite: 'desk:fs:write',
  fsWatch: 'desk:fs:watch',
  fsUnwatch: 'desk:fs:unwatch',
  fsChange: 'desk:fs:change',
  shellOpenExternal: 'desk:shell:open-external',
  shellOpenPath: 'desk:shell:open-path',
  shellReveal: 'desk:shell:reveal',
  shellOpenWithApps: 'desk:shell:open-with-apps',
  shellOpenWith: 'desk:shell:open-with',
  /* 内嵌浏览器新窗口请求 → 渲染层新标签页 */
  browserOpenTab: 'desk:browser:open-tab'
} as const
