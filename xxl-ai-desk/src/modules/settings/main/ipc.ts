/*
 * 设置域 IPC 注册。
 * @author xuxueli 2026-11-07
 */

import type { IpcContext } from '@common/main/ipc'
import { SETTINGS_IPC } from '../shared/ipc'
import { getSettings, saveSettings } from './settingsService'

export function registerSettingsIpc(ipc: IpcContext): void {
  ipc.handle(SETTINGS_IPC.get, () => getSettings())
  ipc.handle(SETTINGS_IPC.save, (_event, patch) => saveSettings(patch))
}
