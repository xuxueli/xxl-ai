/*
 * 浏览器域 preload API 契约。
 * @author xuxueli 2026-11-07
 */

import type { BrowserActionResult, BrowserActionRequest, BrowserOpenTabRequest } from './contracts'

export interface BrowserApi {
  onOpenTab(cb: (request: BrowserOpenTabRequest) => void): () => void
  onActionRequest(cb: (request: BrowserActionRequest) => void): () => void
  respondAction(requestId: string, result: BrowserActionResult): Promise<void>
}
