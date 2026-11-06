/*
 * 对话域 IPC 注册：会话、对话流与人机交互。
 * @author xuxueli 2026-11-07
 */

import type { IpcContext } from '@common/main/ipc'
import { CHAT_IPC, SESSION_IPC } from '../shared/ipc'
import { createSession, deleteMessages, deleteSession, listMessages, listSessions, updateSession } from './sessionService'
import { abortChat, discardSessionRuns, respondInteraction, sendChat } from './chatService'
import { evictAgent, clearSessionPermissions } from '@modules/agent/main'
import { clearTraces } from '@modules/diagnostics/main'

export function registerChatIpc(ipc: IpcContext): void {
  ipc.handle(SESSION_IPC.list, () => listSessions())
  ipc.handle(SESSION_IPC.create, (_event, input) => createSession(input))
  ipc.handle(SESSION_IPC.update, async (_event, id: string, patch) => {
    discardSessionRuns(id)
    await abortChat(id)
    evictAgent(id)
    return updateSession(id, patch)
  })
  ipc.handle(SESSION_IPC.rename, (_event, id: string, title: string) => {
    updateSession(id, { title })
  })
  ipc.handle(SESSION_IPC.remove, async (_event, id: string) => {
    discardSessionRuns(id)
    await abortChat(id)
    evictAgent(id)
    clearSessionPermissions(id)
    clearTraces(id)
    deleteSession(id)
  })
  ipc.handle(SESSION_IPC.messages, (_event, sessionId: string) => listMessages(sessionId))
  ipc.handle(SESSION_IPC.deleteMessages, async (_event, sessionId: string, ids: string[]) => {
    discardSessionRuns(sessionId)
    await abortChat(sessionId)
    evictAgent(sessionId)
    deleteMessages(sessionId, ids)
  })

  ipc.handle(CHAT_IPC.send, (_event, input) =>
    sendChat(input, (payload) => ipc.send(CHAT_IPC.event, payload))
  )
  ipc.handle(CHAT_IPC.abort, (_event, sessionId: string) => abortChat(sessionId))
  ipc.handle(CHAT_IPC.interactionRespond, (_event, requestId: string, result) =>
    respondInteraction(requestId, result)
  )
}
