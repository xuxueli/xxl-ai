/*
 * 对话域 preload API 契约。
 * @author xuxueli 2026-11-07
 */

import type { ChatEvent, ChatInteractionCancel, ChatInteractionPrompt, InteractionResult } from './contracts'
import type { SessionDTO, StoredMessage } from './session'

export interface SessionApi {
  list(): Promise<SessionDTO[]>
  create(input?: Partial<SessionDTO>): Promise<SessionDTO>
  update(id: string, patch: Partial<SessionDTO>): Promise<SessionDTO>
  rename(id: string, title: string): Promise<void>
  remove(id: string): Promise<void>
  messages(sessionId: string): Promise<StoredMessage[]>
  removeMessages(sessionId: string, ids: string[]): Promise<void>
}

export interface ChatApi {
  send(input: { sessionId: string; text: string }): Promise<void>
  abort(sessionId: string): Promise<void>
  onEvent(cb: (event: ChatEvent) => void): () => void
  onInteraction(cb: (prompt: ChatInteractionPrompt) => void): () => void
  onInteractionCancel(cb: (payload: ChatInteractionCancel) => void): () => void
  respondInteraction(requestId: string, result: InteractionResult): Promise<void>
}
