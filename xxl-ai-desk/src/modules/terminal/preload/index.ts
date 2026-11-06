/*
 * 终端域 preload API 片段。
 * @author xuxueli 2026-11-07
 */

import { ipcRenderer } from 'electron'
import type { TerminalApi } from '../shared/api'
import { TERMINAL_IPC } from '../shared/ipc'

export const terminalApi: TerminalApi = {
  create: (input) => ipcRenderer.invoke(TERMINAL_IPC.create, input),
  list: (sessionId: string) => ipcRenderer.invoke(TERMINAL_IPC.list, sessionId),
  attach: (id: string) => ipcRenderer.invoke(TERMINAL_IPC.attach, id),
  write: (id: string, data: string) => ipcRenderer.invoke(TERMINAL_IPC.write, id, data),
  resize: (id: string, cols: number, rows: number) =>
    ipcRenderer.invoke(TERMINAL_IPC.resize, id, cols, rows),
  dispose: (id: string) => ipcRenderer.invoke(TERMINAL_IPC.dispose, id),
  reassign: (fromSessionId: string, toSessionId: string) =>
    ipcRenderer.invoke(TERMINAL_IPC.reassign, fromSessionId, toSessionId),
  onEvent: (callback) => {
    const listener = (_event: unknown, payload: Parameters<typeof callback>[0]): void =>
      callback(payload)
    ipcRenderer.on(TERMINAL_IPC.event, listener)
    return () => ipcRenderer.removeListener(TERMINAL_IPC.event, listener)
  }
}
