/*
 * 诊断域 preload API 片段。
 * @author xuxueli 2026-11-07
 */

import { ipcRenderer } from 'electron'
import type { DiagnosticsApi } from '../shared/api'
import { DIAGNOSTICS_IPC } from '../shared/ipc'

export const diagnosticsApi: DiagnosticsApi = {
  messages: (query) => ipcRenderer.invoke(DIAGNOSTICS_IPC.messages, query),
  traces: (query) => ipcRenderer.invoke(DIAGNOSTICS_IPC.traces, query),
  clearTraces: (sessionId: number) => ipcRenderer.invoke(DIAGNOSTICS_IPC.clear, sessionId)
}
