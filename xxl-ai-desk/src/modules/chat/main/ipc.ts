/*
 * 对话域 IPC 注册：会话、对话流与人机交互。
 * @author xuxueli 2026-11-07
 */

import type { IpcContext } from '@common/main/ipc'
import { CHAT_IPC, SESSION_IPC } from '../shared/ipc'
import { createSession, deleteMessages, deleteSession, isSessionRemoved, listMessages, listSessions, updateSession } from './sessionService'
import { resolveUnattendedInteraction } from './interactionPolicy'
import { abortChat, discardSessionRuns, respondInteraction, sendChat } from './chatService'
import { evictAgent, clearSessionPermissions, setInteractionAutoResolver, setSessionActiveResolver } from '@modules/agent/main'
import { clearTraces } from '@modules/diagnostics/main'

export function registerChatIpc(ipc: IpcContext): void {
  /* 会话删除后，运行时迟到的流式事件 / 交互 / 浏览器 / 轨迹统一丢弃 */
  setSessionActiveResolver((sessionId) => !isSessionRemoved(sessionId))
  /* 定时任务会话无人值守：交互请求直接结算，避免工具调用永久挂起 */
  setInteractionAutoResolver((sessionId, request) =>
    resolveUnattendedInteraction(sessionId, request)
  )
  ipc.handle(SESSION_IPC.list, () => listSessions())
  ipc.handle(SESSION_IPC.create, (_event, input) => {
    /* 触发来源只允许主进程写入：渲染层新建会话固定为用户手动 */
    const { triggerType: _triggerType, scheduleTaskId: _scheduleTaskId, ...rest } = input ?? {}
    return createSession(rest)
  })
  /* 会话配置变更：只落库并清理运行时缓存，不中止当前轮次；新配置从下一轮生效 */
  ipc.handle(SESSION_IPC.update, (_event, id: number, patch) => {
    const session = updateSession(id, patch)
    /* 本轮仍在执行时 evict 会延后到轮次结束，当前回答不中断、不丢内容 */
    evictAgent(id)
    return session
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
