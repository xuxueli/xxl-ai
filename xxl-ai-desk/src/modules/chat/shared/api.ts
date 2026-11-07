/*
 * 对话域 preload API 契约。
 * @author xuxueli 2026-11-07
 */

import type { ChatEvent, ChatInteractionCancel, ChatInteractionPrompt, InteractionResult } from './contracts'
import type { SessionDTO, StoredMessage } from './session'

export interface SessionApi {
  list(): Promise<SessionDTO[]>
  create(input?: Omit<Partial<SessionDTO>, 'id'>): Promise<SessionDTO>
  update(id: number, patch: Partial<SessionDTO>): Promise<SessionDTO>
  rename(id: number, title: string): Promise<void>
  remove(id: number): Promise<void>
  messages(sessionId: number): Promise<StoredMessage[]>
  removeMessages(sessionId: number, ids: number[]): Promise<void>
}

export interface ChatApi {
  send(input: { sessionId: number; text: string }): Promise<void>
  abort(sessionId: number): Promise<void>
  onEvent(cb: (event: ChatEvent) => void): () => void
  onInteraction(cb: (prompt: ChatInteractionPrompt) => void): () => void
  onInteractionCancel(cb: (payload: ChatInteractionCancel) => void): () => void
  respondInteraction(requestId: string, result: InteractionResult): Promise<void>
}
