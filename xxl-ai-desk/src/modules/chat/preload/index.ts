/*
 * 对话域 preload API 片段。
 * @author xuxueli 2026-11-07
 */

import { ipcRenderer } from 'electron'
import type { ChatApi, SessionApi } from '../shared/api'
import { CHAT_IPC, SESSION_IPC } from '../shared/ipc'

export const sessionApi: SessionApi = {
  list: () => ipcRenderer.invoke(SESSION_IPC.list),
  create: (input) => ipcRenderer.invoke(SESSION_IPC.create, input),
  update: (id, patch) => ipcRenderer.invoke(SESSION_IPC.update, id, patch),
  rename: (id: number, title: string) => ipcRenderer.invoke(SESSION_IPC.rename, id, title),
  remove: (id: number) => ipcRenderer.invoke(SESSION_IPC.remove, id),
  messages: (sessionId: number) => ipcRenderer.invoke(SESSION_IPC.messages, sessionId),
  removeMessages: (sessionId: number, ids: number[]) =>
    ipcRenderer.invoke(SESSION_IPC.deleteMessages, sessionId, ids)
}

export const chatApi: ChatApi = {
  send: (input) => ipcRenderer.invoke(CHAT_IPC.send, input),
  abort: (sessionId: number) => ipcRenderer.invoke(CHAT_IPC.abort, sessionId),
  onEvent: (callback) => {
    const listener = (_event: unknown, payload: Parameters<typeof callback>[0]): void =>
      callback(payload)
    ipcRenderer.on(CHAT_IPC.event, listener)
    return () => ipcRenderer.removeListener(CHAT_IPC.event, listener)
  },
  onInteraction: (callback) => {
    const listener = (_event: unknown, payload: Parameters<typeof callback>[0]): void =>
      callback(payload)
    ipcRenderer.on(CHAT_IPC.interactionRequest, listener)
    return () => ipcRenderer.removeListener(CHAT_IPC.interactionRequest, listener)
  },
  onInteractionCancel: (callback) => {
    const listener = (_event: unknown, payload: Parameters<typeof callback>[0]): void =>
      callback(payload)
    ipcRenderer.on(CHAT_IPC.interactionCancel, listener)
    return () => ipcRenderer.removeListener(CHAT_IPC.interactionCancel, listener)
  },
  respondInteraction: (requestId: string, result) =>
    ipcRenderer.invoke(CHAT_IPC.interactionRespond, requestId, result)
}
