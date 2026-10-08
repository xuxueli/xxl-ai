/*
* 主进程 / 预加载 / 渲染进程共享的契约：DTO 类型、IPC 通道常量与 DeskApi 接口
*/

/* 供应商（OpenAI 兼容端点） */
export interface ProviderDTO {
  /* 主键 */
  id: string
  /* 名称 */
  name: string
  /* 接口基址（OpenAI 兼容端点） */
  baseUrl: string
  /* 访问密钥（落库加密，读取时解密） */
  apiKey: string
  /* 附加请求头（支持 {session} 等占位） */
  headers: Record<string, string>
  /* 可选模型 ID 列表 */
  models: string[]
  /* 是否启用 */
  enabled: boolean
  /* 排序值（升序，越小越靠前） */
  sort: number
  /* 创建时间（ISO） */
  addTime: string
  /* 更新时间（ISO） */
  updateTime: string
}

/* 远程模型查询入参（未保存的草稿可直接传表单值，已保存的可只传 id 复用库存密钥） */
export interface ProviderModelQuery {
  /* 已保存供应商主键（用于复用库存配置） */
  id?: string
  /* 草稿接口基址 */
  baseUrl?: string
  /* 草稿访问密钥 */
  apiKey?: string
  /* 草稿附加请求头 */
  headers?: Record<string, string>
}

/* 项目：1:1 强绑定一个本地磁盘目录 */
export interface ProjectDTO {
  /* 主键 */
  id: string
  /* 项目名 */
  name: string
  /* 绑定的本地磁盘目录绝对路径 */
  path: string
  /* 创建时间（ISO） */
  addTime: string
  /* 更新时间（ISO） */
  updateTime: string
}

/* 新建项目入参（path 缺省时由主进程弹出目录选择对话框） */
export interface ProjectCreateInput {
  /* 项目名（缺省取目录名） */
  name?: string
  /* 目标目录（缺省时弹出目录选择对话框） */
  path?: string
  /* 目录选择对话框标题（由渲染进程按语言注入） */
  dialogTitle?: string
}

/* 对话模式：plan 只读只规划；build 全量读写（默认） */
export type ChatMode = 'plan' | 'build'

/* 会话（归属某项目） */
export interface SessionDTO {
  /* 主键 */
  id: string
  /* 会话标题 */
  title: string
  /* 归属项目主键 */
  projectId: string
  /* 绑定的供应商主键 */
  providerId: string
  /* 选用的模型 ID */
  modelId: string
  /* 对话模式（plan 只读只规划 / build 全量读写） */
  mode: ChatMode
  /* 创建时间（ISO） */
  addTime: string
  /* 更新时间（ISO） */
  updateTime: string
}

/* 已持久化的消息记录 */
export interface StoredMessage {
  /* 主键 */
  id: string
  /* 所属会话主键 */
  sessionId: string
  /* 会话内顺序号 */
  seq: number
  /* 角色（user / assistant 等） */
  role: string
  /* 文本内容（列表预览用） */
  content: string
  /* Agent 原始消息 JSON */
  data: string
  /* 创建时间（ISO） */
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
  /* 主题 */
  theme: 'light' | 'dark' | 'system'
  /* 界面语言（不支持运行时切换，需重启生效） */
  language: 'zh' | 'en'
  /* 当前供应商主键 */
  providerId: string
  /* 当前模型 ID */
  modelId: string
  /* 系统提示词（自定义指令） */
  systemPrompt: string
  /* 个性化：应用名称（左上角 Logo 区域）与 Slogan（空态欢迎语） */
  appName: string
  slogan: string
  /* 快捷操作快捷键（缺省项回退 DEFAULT_SHORTCUTS） */
  shortcuts: ShortcutMap
  /* 命令运行环境：Node 来源（builtin 内置 Electron Node / custom 自定义路径） */
  runtimeNodeMode: 'builtin' | 'custom'
  /* 自定义 Node 可执行文件路径（runtimeNodeMode=custom 时生效） */
  runtimeNodePath: string
  /* 自定义 Python 解释器路径（留空自动探测系统 python3 / python） */
  runtimePythonPath: string
  /* 启动时自动检查客户端更新 */
  updateAutoCheck: boolean
}

/* 运行时可执行文件检测入参 */
export interface RuntimeExecInput {
  /* 运行时类型：node / python */
  kind: 'node' | 'python'
  /* 可执行文件路径；node 省略时使用内置 Node，python 省略时自动探测 */
  path?: string
}

/* 运行时可执行文件检测结果 */
export interface RuntimeDetectResult {
  /* 是否检测通过 */
  ok: boolean
  /* 解析到的版本（如 v22.9.0 / Python 3.12.4） */
  version: string
  /* 实际使用的可执行文件路径或命令名 */
  path: string
  /* 失败提示（ok=false 时） */
  message: string
}

/* 对话流式事件（主 → 渲染） */
export interface ChatEvent {
  /* 所属会话主键 */
  sessionId: string
  /* 事件类型：delta 增量文本 / thinking 思考 / tool_start 工具开始 / tool_end 工具结束 / error 错误 / done 完成 / aborted 中止 */
  type: 'delta' | 'thinking' | 'tool_start' | 'tool_end' | 'error' | 'done' | 'aborted'
  /* 增量文本（delta / thinking） */
  text?: string
  /* 工具名（tool_start / tool_end） */
  toolName?: string
  /* 工具调用 ID（tool_start / tool_end） */
  toolCallId?: string
  /* 工具调用入参（tool_start） */
  args?: unknown
  /* 工具返回文本（tool_end） */
  result?: string
  /* 工具是否失败（tool_end） */
  isError?: boolean
  /* 错误信息（error） */
  message?: string
}

/* 越界审批选择：允许本次 / 本会话允许 / 拒绝 */
export type ChatApprovalChoice = 'once' | 'session' | 'deny'

/* 越界审批请求（主进程 → 渲染进程，由渲染进程弹应用内对话框） */
export interface ChatApprovalPrompt {
  /* 审批请求 ID（回传选择时对应） */
  requestId: string
  /* 触发审批的工具名 */
  tool: string
  /* 动作类型：read 读 / write 写 */
  action: 'read' | 'write'
  /* 越界目标的绝对路径 */
  abs: string
  /* 沙箱根目录（通常为项目目录） */
  root: string
}

/* 终端创建入参：cwd 为工作目录（通常为项目目录），缺省回退用户主目录 */
export interface TerminalCreateInput {
  /* 工作目录 */
  cwd?: string
  /* 终端列数 */
  cols?: number
  /* 终端行数 */
  rows?: number
}

/* 终端实例信息 */
export interface TerminalDTO {
  /* 终端实例 ID */
  id: string
  /* 工作目录 */
  cwd: string
  /* 使用的 shell */
  shell: string
}

/* 终端流事件（主 → 渲染）：data 为输出片段，exit 为进程退出 */
export interface TerminalEvent {
  /* 终端实例 ID */
  id: string
  /* 事件类型：data 输出 / exit 退出 */
  type: 'data' | 'exit'
  /* 输出片段（data） */
  data?: string
  /* 退出码（exit） */
  exitCode?: number
}

/* 文件树节点（目录懒加载，children 由前端按需请求） */
export interface FsEntry {
  /* 名称 */
  name: string
  /* 绝对路径 */
  path: string
  /* 是否目录 */
  isDir: boolean
}

/* 文件读取结果（文本预览；图片附带 dataUrl 供内联预览） */
export interface FileContent {
  /* 绝对路径 */
  path: string
  /* 文件名 */
  name: string
  /* 文本内容（二进制文件为空串） */
  content: string
  /* 文件字节大小 */
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
  /* 应用显示名 */
  name: string
  /* 应用可执行文件路径 */
  path: string
}

/* 运行时信息（版本 / 平台 / 数据目录） */
export interface RuntimeInfo {
  /* 应用版本 */
  version: string
  /* 运行平台（darwin / win32 / linux） */
  platform: string
  /* 当前数据目录 */
  dataDir: string
  /* 默认数据目录 */
  defaultDataDir: string
  /* SQLite 数据库文件路径 */
  dbFile: string
}

/* 客户端更新信息（引导式：检测 + 前往下载） */
export interface UpdateInfo {
  /* 是否有新版本 */
  hasUpdate: boolean
  /* 当前版本 */
  currentVersion: string
  /* 最新版本（去 v 前缀） */
  latestVersion: string
  /* release 页面地址 */
  releaseUrl: string
  /* 匹配到的安装包直链（可能为空） */
  downloadUrl: string
  /* release 说明正文 */
  notes: string
  /* 发布时间（ISO） */
  publishedAt: string
}

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
    /* 清空会话消息 */
    clear(sessionId: string): Promise<void>
    /* 按 ID 删除指定消息 */
    removeMessages(sessionId: string, ids: string[]): Promise<void>
  }
  /* 对话（发送 / 中止 / 事件订阅 / 越界审批） */
  chat: {
    /* 发送用户消息并启动流式生成 */
    send(input: { sessionId: string; text: string }): Promise<void>
    /* 中止当前会话的生成 */
    abort(sessionId: string): Promise<void>
    /* 订阅对话流式事件（返回取消订阅函数） */
    onEvent(cb: (event: ChatEvent) => void): () => void
    /* 越界审批：主进程推送请求，渲染进程回传选择 */
    onApproval(cb: (prompt: ChatApprovalPrompt) => void): () => void
    /* 回传越界审批选择（once / session / deny） */
    respondApproval(requestId: string, choice: ChatApprovalChoice): Promise<void>
  }
  /* 终端（本地 PTY）管理 */
  terminal: {
    /* 创建终端实例 */
    create(input?: TerminalCreateInput): Promise<TerminalDTO>
    /* 写入终端输入 */
    write(id: string, data: string): Promise<void>
    /* 调整终端尺寸 */
    resize(id: string, cols: number, rows: number): Promise<void>
    /* 销毁终端实例 */
    dispose(id: string): Promise<void>
    /* 订阅终端输出 / 退出事件（返回取消订阅函数） */
    onEvent(cb: (event: TerminalEvent) => void): () => void
  }
  /* 本地文件系统（右侧「工具 → 文件」面板使用，限定在项目目录内） */
  fs: {
    /* 列出目录项（子目录懒加载） */
    list(root: string, dir: string): Promise<FsEntry[]>
    /* 读取文件内容（文本预览；图片附带预览数据 URL） */
    read(root: string, path: string): Promise<FileContent>
    /* 写入文件内容 */
    write(root: string, path: string, content: string): Promise<void>
    /* 监听目录变更（本地增删文件后自动刷新）；onChange 返回取消订阅函数 */
    watch(dir: string): Promise<void>
    /* 取消目录监听 */
    unwatch(dir: string): Promise<void>
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
  /* 内嵌浏览器（右侧「工具 → 浏览器」面板）：主进程把新窗口请求转发为「新标签页」 */
  browser: {
    /* 订阅新标签页请求（返回取消订阅函数） */
    onOpenTab(cb: (url: string) => void): () => void
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
  /* 客户端更新 */
  updateCheck: 'desk:update:check',
  updateOpen: 'desk:update:open',
  /* 应用设置 */
  settingsGet: 'desk:settings:get',
  settingsSave: 'desk:settings:save',
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
  /* 会话 */
  sessionList: 'desk:session:list',
  sessionCreate: 'desk:session:create',
  sessionUpdate: 'desk:session:update',
  sessionRename: 'desk:session:rename',
  sessionRemove: 'desk:session:remove',
  sessionMessages: 'desk:session:messages',
  sessionClear: 'desk:session:clear',
  sessionDeleteMessages: 'desk:session:delete-messages',
  /* 对话 */
  chatSend: 'desk:chat:send',
  chatAbort: 'desk:chat:abort',
  chatEvent: 'desk:chat:event',
  chatApprovalRequest: 'desk:chat:approval-request',
  chatApprovalRespond: 'desk:chat:approval-respond',
  /* 终端 */
  terminalCreate: 'desk:terminal:create',
  terminalWrite: 'desk:terminal:write',
  terminalResize: 'desk:terminal:resize',
  terminalDispose: 'desk:terminal:dispose',
  terminalEvent: 'desk:terminal:event',
  /* 本地文件系统 */
  fsList: 'desk:fs:list',
  fsRead: 'desk:fs:read',
  fsWrite: 'desk:fs:write',
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
  browserOpenTab: 'desk:browser:open-tab'
} as const
