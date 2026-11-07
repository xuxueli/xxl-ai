/*
 * chat 模块跨进程公共契约出口。
 * @author xuxueli 2026-11-07
 */

export type { ChatApi, SessionApi } from './api'
export type { ChatEvent, ChatInteractionCancel, ChatInteractionPrompt, ChoiceInteractionRequest, InteractionOption, InteractionRequest, InteractionResult, PermissionInteractionRequest } from './contracts'
export { HISTORY_MAX_MESSAGES, contentBlocks, trimHistory } from './history'
export type { HistoryEntry } from './history'
export { isRuntimeSource } from './messageSource'
export type { MessageSource } from './messageSource'
export { hasVisiblePart, messageStatusOf, normalizeMessageStatus } from './messageStatus'
export type { MessageStatus, MessageStatusSource } from './messageStatus'
export { CHAT_IPC } from './ipc'
export type { ChatMode, ProjectMessageGroup, ProjectMessages, SessionDTO, StoredMessage } from './session'
