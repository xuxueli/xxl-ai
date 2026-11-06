/*
 * 设置域 preload API 契约。
 * @author xuxueli 2026-11-07
 */

import type { AppSettings } from './contracts'

export interface SettingsApi {
  get(): Promise<AppSettings>
  save(patch: Partial<AppSettings>): Promise<AppSettings>
}
