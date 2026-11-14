/*
 * 设置域 IPC 注册。
 * @author xuxueli 2026-11-07
 */

import type { IpcContext } from '@common/main/ipc'
import { registerLocalFileRoot } from '@common/main/utils/localFileRoots'
import { getBrandingDir } from '@common/main/config/paths'
import type { BrandingKind } from '../shared/contracts'
import { SETTINGS_IPC } from '../shared/ipc'
import { getSettings, saveSettings } from './settingsService'
import {
  getBrandingAssets,
  readBrandingLogoDataUrl,
  resetBranding,
  selectBranding
} from './brandingService'

export function registerSettingsIpc(ipc: IpcContext): void {
  /* 品牌资源目录加入本地文件协议允许根 */
  registerLocalFileRoot('settings', () => getBrandingDir())
  ipc.handle(SETTINGS_IPC.get, () => getSettings())
  ipc.handle(SETTINGS_IPC.save, (_event, patch) => saveSettings(patch))
  ipc.handle(SETTINGS_IPC.getBranding, () => getBrandingAssets())
  ipc.handle(SETTINGS_IPC.selectBranding, (_event, kind: BrandingKind) => selectBranding(kind))
  ipc.handle(SETTINGS_IPC.resetBranding, (_event, kind: BrandingKind) => resetBranding(kind))
  ipc.handle(SETTINGS_IPC.readBrandingLogo, () => readBrandingLogoDataUrl())
}
