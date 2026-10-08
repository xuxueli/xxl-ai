/* 预加载：以白名单方式向渲染进程暴露受控 API（经 contextBridge 注入 window.desk） */

import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '../shared/ipc'
import type {
  AppSettings,
  ChatApprovalChoice,
  ChatApprovalPrompt,
  ChatEvent,
  DeskApi,
  FileContent,
  FsEntry,
  OpenWithApp,
  ProviderDTO,
  ProviderModelQuery,
  ProjectCreateInput,
  RuntimeDetectResult,
  RuntimeExecInput,
  SessionDTO,
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
    selectExecutable: (title?: string) =>
      ipcRenderer.invoke(IPC.appSelectExecutable, title),
    /* 检测运行时可执行文件版本 */
    detectExecutable: (input: RuntimeExecInput): Promise<RuntimeDetectResult> =>
      ipcRenderer.invoke(IPC.appDetectExecutable, input)
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
  /* 供应商管理 */
  provider: {
    /* 供应商列表 */
    list: () => ipcRenderer.invoke(IPC.providerList),
    /* 新增或更新供应商 */
    save: (dto: Partial<ProviderDTO>) => ipcRenderer.invoke(IPC.providerSave, dto),
    /* 删除供应商 */
    remove: (id: string) => ipcRenderer.invoke(IPC.providerRemove, id),
    /* 查询远端可用模型 */
    remoteModels: (input: ProviderModelQuery) =>
      ipcRenderer.invoke(IPC.providerRemoteModels, input)
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
    /* 清空会话消息 */
    clear: (sessionId: string) => ipcRenderer.invoke(IPC.sessionClear, sessionId),
    /* 按 ID 删除指定消息 */
    removeMessages: (sessionId: string, ids: string[]) =>
      ipcRenderer.invoke(IPC.sessionDeleteMessages, sessionId, ids)
  },
  /* 对话：发送 / 中止 / 事件订阅 / 越界审批 */
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
    /* 订阅越界审批请求（返回取消订阅函数） */
    onApproval: (callback: (prompt: ChatApprovalPrompt) => void) => {
      const listener = (_event: unknown, payload: ChatApprovalPrompt): void => callback(payload)
      ipcRenderer.on(IPC.chatApprovalRequest, listener)
      return () => ipcRenderer.removeListener(IPC.chatApprovalRequest, listener)
    },
    /* 回传越界审批选择 */
    respondApproval: (requestId: string, choice: ChatApprovalChoice) =>
      ipcRenderer.invoke(IPC.chatApprovalRespond, requestId, choice)
  },
  /* 终端管理 */
  terminal: {
    /* 创建终端实例 */
    create: (input?: TerminalCreateInput) => ipcRenderer.invoke(IPC.terminalCreate, input),
    /* 写入终端输入 */
    write: (id: string, data: string) => ipcRenderer.invoke(IPC.terminalWrite, id, data),
    /* 调整终端尺寸 */
    resize: (id: string, cols: number, rows: number) =>
      ipcRenderer.invoke(IPC.terminalResize, id, cols, rows),
    /* 销毁终端实例 */
    dispose: (id: string) => ipcRenderer.invoke(IPC.terminalDispose, id),
    /* 订阅终端输出 / 退出事件（返回取消订阅函数） */
    onEvent: (callback: (event: TerminalEvent) => void) => {
      const listener = (_event: unknown, payload: TerminalEvent): void => callback(payload)
      ipcRenderer.on(IPC.terminalEvent, listener)
      return () => ipcRenderer.removeListener(IPC.terminalEvent, listener)
    }
  },
  /* 本地文件系统（右侧「工具 → 文件」面板，限定项目目录内） */
  fs: {
    /* 列出目录项 */
    list: (root: string, dir: string): Promise<FsEntry[]> =>
      ipcRenderer.invoke(IPC.fsList, root, dir),
    /* 读取文件内容 */
    read: (root: string, path: string): Promise<FileContent> =>
      ipcRenderer.invoke(IPC.fsRead, root, path),
    /* 写入文件内容 */
    write: (root: string, path: string, content: string) =>
      ipcRenderer.invoke(IPC.fsWrite, root, path, content),
    /* 监听目录变更 */
    watch: (dir: string) => ipcRenderer.invoke(IPC.fsWatch, dir),
    /* 取消目录监听 */
    unwatch: (dir: string) => ipcRenderer.invoke(IPC.fsUnwatch, dir),
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
    /* 内嵌浏览器：guest 新窗口请求 → 渲染层新标签页（返回取消订阅函数） */
    onOpenTab: (callback: (url: string) => void) => {
      const listener = (_event: unknown, url: string): void => callback(url)
      ipcRenderer.on(IPC.browserOpenTab, listener)
      return () => ipcRenderer.removeListener(IPC.browserOpenTab, listener)
    }
  }
}

contextBridge.exposeInMainWorld('desk', api)
