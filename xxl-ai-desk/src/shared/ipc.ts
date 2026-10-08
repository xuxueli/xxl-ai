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
  systemPrompt: string
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
  }
  terminal: {
    create(input?: TerminalCreateInput): Promise<TerminalDTO>
    write(id: string, data: string): Promise<void>
    resize(id: string, cols: number, rows: number): Promise<void>
    dispose(id: string): Promise<void>
    onEvent(cb: (event: TerminalEvent) => void): () => void
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
  terminalCreate: 'desk:terminal:create',
  terminalWrite: 'desk:terminal:write',
  terminalResize: 'desk:terminal:resize',
  terminalDispose: 'desk:terminal:dispose',
  terminalEvent: 'desk:terminal:event'
} as const
