/*
 * 设置域 preload API 契约。
 * @author xuxueli 2026-11-07
 */

import type { AppSettings, BrandingAssets, BrandingKind } from './contracts'

export interface SettingsApi {
  get(): Promise<AppSettings>
  save(patch: Partial<AppSettings>): Promise<AppSettings>
  getBranding(): Promise<BrandingAssets>
  selectBranding(kind: BrandingKind): Promise<BrandingAssets>
  resetBranding(kind: BrandingKind): Promise<BrandingAssets>
  /* 读取 Logo 原图 data URL：供渲染层生成圆角 Dock 图标，不落盘、不缓存 */
  readBrandingLogo(): Promise<string>
}
