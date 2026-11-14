/*
 * 设置域 preload API 契约。
 * @author xuxueli 2026-11-07
 */

import type { AppSettings, BrandingAssets, BrandingKind } from './contracts'

export interface SettingsApi {
  get(): Promise<AppSettings>
  save(patch: Partial<AppSettings>): Promise<AppSettings>
  getBranding(): Promise<BrandingAssets>
  /* 选择品牌图片：用户取消时返回 null，成功时返回最新资源 */
  selectBranding(kind: BrandingKind): Promise<BrandingAssets | null>
  resetBranding(kind: BrandingKind): Promise<BrandingAssets>
  /* 读取 Logo 原图 data URL：供渲染层生成圆角 Dock 图标，不落盘、不缓存 */
  readBrandingLogo(): Promise<string>
}
