/*
 * 诊断域 preload API 契约。
 * @author xuxueli 2026-11-07
 */

import type { PageResult } from '@common/shared/contracts/pagination'
import type { StoredMessage } from '@modules/chat/shared'
import type { DiagnosticsQuery, LlmTraceDTO } from './contracts'

export interface DiagnosticsApi {
  messages(query: DiagnosticsQuery): Promise<PageResult<StoredMessage>>
  traces(query: DiagnosticsQuery): Promise<PageResult<LlmTraceDTO>>
  clearTraces(sessionId: number): Promise<void>
}
