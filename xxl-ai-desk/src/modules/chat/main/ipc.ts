/*
 * 对话域 IPC 注册：会话、对话流与人机交互。
 * @author xuxueli 2026-11-07
 */

import type { IpcContext } from '@common/main/ipc'
import { CHAT_IPC, SESSION_IPC } from '../shared/ipc'
import { createSession, deleteMessages, deleteSession, isSessionRemoved, listMessages, listSessions, updateSession } from './sessionService'
import { abortChat, discardSessionRuns, respondInteraction, sendChat } from './chatService'
import { evictAgent, clearSessionPermissions, setSessionActiveResolver } from '@modules/agent/main'
import { clearTraces } from '@modules/diagnostics/main'

export function registerChatIpc(ipc: IpcContext): void {
  /* 会话删除后，运行时迟到的流式事件 / 交互 / 浏览器 / 轨迹统一丢弃 */
  setSessionActiveResolver((sessionId) => !isSessionRemoved(sessionId))
  ipc.handle(SESSION_IPC.list, () => listSessions())
  ipc.handle(SESSION_IPC.create, (_event, input) => createSession(input))
  ipc.handle(SESSION_IPC.update, async (_event, id: number, patch) => {
    discardSessionRuns(id)
    await abortChat(id)
    evictAgent(id)
    return updateSession(id, patch)
  })
  ipc.handle(SESSION_IPC.rename, (_event, id: number, title: string) => {
    updateSession(id, { title })
  })
  ipc.handle(SESSION_IPC.remove, async (_event, id: number) => {
    discardSessionRuns(id)
    await abortChat(id)
    evictAgent(id)
    clearSessionPermissions(id)
    clearTraces(id)
    deleteSession(id)
  })
  ipc.handle(SESSION_IPC.messages, (_event, sessionId: number) => listMessages(sessionId))
  ipc.handle(SESSION_IPC.deleteMessages, async (_event, sessionId: number, ids: number[]) => {
    discardSessionRuns(sessionId)
    await abortChat(sessionId)
    evictAgent(sessionId)
    deleteMessages(sessionId, ids)
  })

  ipc.handle(CHAT_IPC.send, (_event, input) =>
    sendChat(input, (payload) => ipc.send(CHAT_IPC.event, payload))
  )
  ipc.handle(CHAT_IPC.abort, (_event, sessionId: number) => abortChat(sessionId))
  ipc.handle(CHAT_IPC.interactionRespond, (_event, requestId: string, result) =>
    respondInteraction(requestId, result)
  )
}
