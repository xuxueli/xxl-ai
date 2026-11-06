/*
 * 对话域 IPC 通道：会话、对话流与人机交互。
 * @author xuxueli 2026-11-07
 */

export const SESSION_IPC = {
  list: 'desk:session:list',
  create: 'desk:session:create',
  update: 'desk:session:update',
  rename: 'desk:session:rename',
  remove: 'desk:session:remove',
  messages: 'desk:session:messages',
  deleteMessages: 'desk:session:delete-messages'
} as const

export const CHAT_IPC = {
  send: 'desk:chat:send',
  abort: 'desk:chat:abort',
  event: 'desk:chat:event',
  interactionRequest: 'desk:chat:interaction-request',
  interactionRespond: 'desk:chat:interaction-respond',
  interactionCancel: 'desk:chat:interaction-cancel'
} as const
