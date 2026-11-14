/*
 * 浏览器域 preload API 契约。
 * @author xuxueli 2026-11-07
 */

import type {
  BrowserActionResult,
  BrowserActionRequest,
  BrowserKeyInput,
  BrowserOpenTabRequest
} from './contracts'

export interface BrowserApi {
  onOpenTab(cb: (request: BrowserOpenTabRequest) => void): () => void
  onActionRequest(cb: (request: BrowserActionRequest) => void): () => void
  respondAction(requestId: string, result: BrowserActionResult): Promise<void>
  onShortcutKey(cb: (input: BrowserKeyInput) => void): () => void
  setPanelActive(active: boolean): Promise<void>
}
