/*
 * 诊断域 IPC 注册：会话消息与模型通讯记录。
 * @author xuxueli 2026-11-07
 */

import type { IpcContext } from '@common/main/ipc'
import { listSessionMessagePage } from '@modules/chat/main'
import { DIAGNOSTICS_IPC } from '../shared/ipc'
import { clearTraces, listMessagePage, listTraces } from './diagnosticsService'

export function registerDiagnosticsIpc(ipc: IpcContext): void {
  ipc.handle(DIAGNOSTICS_IPC.messages, (_event, query) =>
    listMessagePage(query, listSessionMessagePage)
  )
  ipc.handle(DIAGNOSTICS_IPC.traces, (_event, query) => listTraces(query))
  ipc.handle(DIAGNOSTICS_IPC.clear, (_event, sessionId: number) => clearTraces(sessionId))
}
