/*
 * chat 模块主进程公共出口。
 * @author xuxueli 2026-11-07
 */

export { abortChat, discardSessionRuns } from './chatService'
export { registerChatIpc } from './ipc'
export { appendMessages, countSessionsByAgent, deleteSession, getSession, listMessages, listNewProjectMessages, listSessionIdsByAgent, listSessionIdsByProject, listSessionMessagePage, updateSession } from './sessionService'
export type { ProjectMessageGroup } from './sessionService'
