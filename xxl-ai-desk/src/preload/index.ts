import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '../shared/ipc'
import type {
  AppSettings,
  ChatEvent,
  DeskApi,
  ProviderDTO,
  ProviderModelQuery,
  SessionDTO,
  StoredMessage
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
  session: {
    list: () => ipcRenderer.invoke(IPC.sessionList),
    create: (input?: Partial<SessionDTO>) => ipcRenderer.invoke(IPC.sessionCreate, input),
    update: (id: string, patch: Partial<SessionDTO>) =>
      ipcRenderer.invoke(IPC.sessionUpdate, id, patch),
    rename: (id: string, title: string) => ipcRenderer.invoke(IPC.sessionRename, id, title),
    remove: (id: string) => ipcRenderer.invoke(IPC.sessionRemove, id),
    messages: (sessionId: string): Promise<StoredMessage[]> =>
      ipcRenderer.invoke(IPC.sessionMessages, sessionId),
    clear: (sessionId: string) => ipcRenderer.invoke(IPC.sessionClear, sessionId)
  },
  chat: {
    send: (input: { sessionId: string; text: string }) => ipcRenderer.invoke(IPC.chatSend, input),
    abort: (sessionId: string) => ipcRenderer.invoke(IPC.chatAbort, sessionId),
    onEvent: (callback: (event: ChatEvent) => void) => {
      const listener = (_event: unknown, payload: ChatEvent): void => callback(payload)
      ipcRenderer.on(IPC.chatEvent, listener)
      return () => ipcRenderer.removeListener(IPC.chatEvent, listener)
    }
  }
}

contextBridge.exposeInMainWorld('desk', api)
