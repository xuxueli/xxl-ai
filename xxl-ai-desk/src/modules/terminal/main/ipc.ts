/*
 * 终端域 IPC 注册：PTY 生命周期与事件转发。
 * @author xuxueli 2026-11-07
 */

import type { IpcContext } from '@common/main/ipc'
import { TERMINAL_IPC } from '../shared/ipc'
import { attachTerminal, createTerminal, disposeTerminal, listTerminals, onTerminalEvent, reassignTerminals, resizeTerminal, writeTerminal } from './terminalService'

export function registerTerminalIpc(ipc: IpcContext): void {
  ipc.handle(TERMINAL_IPC.create, (_event, input) => createTerminal(input))
  ipc.handle(TERMINAL_IPC.list, (_event, sessionId: string) => listTerminals(sessionId))
  ipc.handle(TERMINAL_IPC.attach, (_event, id: string) => attachTerminal(id))
  ipc.handle(TERMINAL_IPC.write, (_event, id: string, data: string) => writeTerminal(id, data))
  ipc.handle(TERMINAL_IPC.resize, (_event, id: string, cols: number, rows: number) =>
    resizeTerminal(id, cols, rows)
  )
  ipc.handle(TERMINAL_IPC.dispose, (_event, id: string) => disposeTerminal(id))
  ipc.handle(TERMINAL_IPC.reassign, (_event, fromSessionId: string, toSessionId: string) =>
    reassignTerminals(fromSessionId, toSessionId)
  )
  onTerminalEvent((event) => ipc.send(TERMINAL_IPC.event, event))
}
