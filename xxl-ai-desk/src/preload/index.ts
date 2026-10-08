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
  SessionDTO,
  StoredMessage,
  TerminalCreateInput,
  TerminalEvent
} from '../shared/ipc'

/* 预加载：以白名单方式向渲染进程暴露受控 API */

const api: DeskApi = {
  app: {
    info: () => ipcRenderer.invoke(IPC.appInfo),
    setDataDir: (dir: string) => ipcRenderer.invoke(IPC.appSetDataDir, dir),
    selectDataDir: () => ipcRenderer.invoke(IPC.appSelectDataDir),
    openDataDir: () => ipcRenderer.invoke(IPC.appOpenDataDir),
    relaunch: () => ipcRenderer.invoke(IPC.appRelaunch)
  },
  settings: {
    get: () => ipcRenderer.invoke(IPC.settingsGet),
    save: (patch: Partial<AppSettings>) => ipcRenderer.invoke(IPC.settingsSave, patch)
  },
  provider: {
    list: () => ipcRenderer.invoke(IPC.providerList),
    save: (dto: Partial<ProviderDTO>) => ipcRenderer.invoke(IPC.providerSave, dto),
    remove: (id: string) => ipcRenderer.invoke(IPC.providerRemove, id),
    remoteModels: (input: ProviderModelQuery) =>
      ipcRenderer.invoke(IPC.providerRemoteModels, input)
  },
  project: {
    list: () => ipcRenderer.invoke(IPC.projectList),
    create: (input?: ProjectCreateInput) => ipcRenderer.invoke(IPC.projectCreate, input),
    rename: (id: string, name: string) => ipcRenderer.invoke(IPC.projectRename, id, name),
    remove: (id: string) => ipcRenderer.invoke(IPC.projectRemove, id),
    reveal: (id: string) => ipcRenderer.invoke(IPC.projectReveal, id)
  },
  session: {
    list: () => ipcRenderer.invoke(IPC.sessionList),
    create: (input?: Partial<SessionDTO>) => ipcRenderer.invoke(IPC.sessionCreate, input),
    update: (id: string, patch: Partial<SessionDTO>) =>
      ipcRenderer.invoke(IPC.sessionUpdate, id, patch),
    rename: (id: string, title: string) => ipcRenderer.invoke(IPC.sessionRename, id, title),
    remove: (id: string) => ipcRenderer.invoke(IPC.sessionRemove, id),
    messages: (sessionId: string): Promise<StoredMessage[]> =>
      ipcRenderer.invoke(IPC.sessionMessages, sessionId),
    clear: (sessionId: string) => ipcRenderer.invoke(IPC.sessionClear, sessionId),
    removeMessages: (sessionId: string, ids: string[]) =>
      ipcRenderer.invoke(IPC.sessionDeleteMessages, sessionId, ids)
  },
  chat: {
    send: (input: { sessionId: string; text: string }) => ipcRenderer.invoke(IPC.chatSend, input),
    abort: (sessionId: string) => ipcRenderer.invoke(IPC.chatAbort, sessionId),
    onEvent: (callback: (event: ChatEvent) => void) => {
      const listener = (_event: unknown, payload: ChatEvent): void => callback(payload)
      ipcRenderer.on(IPC.chatEvent, listener)
      return () => ipcRenderer.removeListener(IPC.chatEvent, listener)
    },
    onApproval: (callback: (prompt: ChatApprovalPrompt) => void) => {
      const listener = (_event: unknown, payload: ChatApprovalPrompt): void => callback(payload)
      ipcRenderer.on(IPC.chatApprovalRequest, listener)
      return () => ipcRenderer.removeListener(IPC.chatApprovalRequest, listener)
    },
    respondApproval: (requestId: string, choice: ChatApprovalChoice) =>
      ipcRenderer.invoke(IPC.chatApprovalRespond, requestId, choice)
  },
  terminal: {
    create: (input?: TerminalCreateInput) => ipcRenderer.invoke(IPC.terminalCreate, input),
    write: (id: string, data: string) => ipcRenderer.invoke(IPC.terminalWrite, id, data),
    resize: (id: string, cols: number, rows: number) =>
      ipcRenderer.invoke(IPC.terminalResize, id, cols, rows),
    dispose: (id: string) => ipcRenderer.invoke(IPC.terminalDispose, id),
    onEvent: (callback: (event: TerminalEvent) => void) => {
      const listener = (_event: unknown, payload: TerminalEvent): void => callback(payload)
      ipcRenderer.on(IPC.terminalEvent, listener)
      return () => ipcRenderer.removeListener(IPC.terminalEvent, listener)
    }
  },
  fs: {
    list: (root: string, dir: string): Promise<FsEntry[]> =>
      ipcRenderer.invoke(IPC.fsList, root, dir),
    read: (root: string, path: string): Promise<FileContent> =>
      ipcRenderer.invoke(IPC.fsRead, root, path),
    write: (root: string, path: string, content: string) =>
      ipcRenderer.invoke(IPC.fsWrite, root, path, content),
    watch: (dir: string) => ipcRenderer.invoke(IPC.fsWatch, dir),
    unwatch: (dir: string) => ipcRenderer.invoke(IPC.fsUnwatch, dir),
    onChange: (callback: (dir: string) => void) => {
      const listener = (_event: unknown, dir: string): void => callback(dir)
      ipcRenderer.on(IPC.fsChange, listener)
      return () => ipcRenderer.removeListener(IPC.fsChange, listener)
    }
  },
  shell: {
    openExternal: (url: string) => ipcRenderer.invoke(IPC.shellOpenExternal, url),
    openPath: (path: string) => ipcRenderer.invoke(IPC.shellOpenPath, path),
    reveal: (path: string) => ipcRenderer.invoke(IPC.shellReveal, path),
    openWithApps: (): Promise<OpenWithApp[]> => ipcRenderer.invoke(IPC.shellOpenWithApps),
    openWith: (appPath: string, file: string) =>
      ipcRenderer.invoke(IPC.shellOpenWith, appPath, file)
  },
  browser: {
    /* 内嵌浏览器：guest 新窗口请求 → 渲染层新标签页 */
    onOpenTab: (callback: (url: string) => void) => {
      const listener = (_event: unknown, url: string): void => callback(url)
      ipcRenderer.on(IPC.browserOpenTab, listener)
      return () => ipcRenderer.removeListener(IPC.browserOpenTab, listener)
    }
  }
}

contextBridge.exposeInMainWorld('desk', api)
