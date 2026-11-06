/*
 * 终端域 preload API 契约。
 * @author xuxueli 2026-11-07
 */

import type { TerminalAttachResult, TerminalCreateInput, TerminalDTO, TerminalEvent } from './contracts'

export interface TerminalApi {
  create(input: TerminalCreateInput): Promise<TerminalDTO>
  list(sessionId: string): Promise<TerminalDTO[]>
  attach(id: string): Promise<TerminalAttachResult | null>
  write(id: string, data: string): Promise<void>
  resize(id: string, cols: number, rows: number): Promise<void>
  dispose(id: string): Promise<void>
  reassign(fromSessionId: string, toSessionId: string): Promise<void>
  onEvent(cb: (event: TerminalEvent) => void): () => void
}
