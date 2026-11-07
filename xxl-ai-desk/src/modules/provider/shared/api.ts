/*
 * 供应商域 preload API 契约。
 * @author xuxueli 2026-11-07
 */

import type { ProviderDTO, ProviderModelQuery } from './contracts'

export interface ProviderApi {
  list(): Promise<ProviderDTO[]>
  save(dto: Partial<ProviderDTO>): Promise<ProviderDTO>
  remove(id: number): Promise<void>
  remoteModels(input: ProviderModelQuery): Promise<string[]>
}
