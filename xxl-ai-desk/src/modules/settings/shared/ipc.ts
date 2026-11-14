/*
 * 设置域 IPC 通道。
 * @author xuxueli 2026-11-07
 */

export const SETTINGS_IPC = {
  get: 'desk:settings:get',
  save: 'desk:settings:save',
  getBranding: 'desk:settings:getBranding',
  selectBranding: 'desk:settings:selectBranding',
  resetBranding: 'desk:settings:resetBranding',
  readBrandingLogo: 'desk:settings:readBrandingLogo'
} as const
