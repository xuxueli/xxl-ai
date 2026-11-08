/*
 * 应用中心 IPC 注册。
 * @author xuxueli 2026-11-08
 */

import type { IpcContext } from '@common/main/ipc'
import { APP_CENTER_IPC } from '../shared/ipc'
import {
  getAppState,
  installApp,
  listAppStates,
  setAppEnabled,
  uninstallApp
} from './appService'

export function registerAppCenterIpc(ipc: IpcContext): void {
  ipc.handle(APP_CENTER_IPC.listStates, () => listAppStates())
  ipc.handle(APP_CENTER_IPC.getState, (_event, appId: string) => getAppState(appId))
  ipc.handle(APP_CENTER_IPC.install, (_event, appId: string) => installApp(appId))
  ipc.handle(APP_CENTER_IPC.uninstall, (_event, appId: string) => uninstallApp(appId))
  ipc.handle(APP_CENTER_IPC.setEnabled, (_event, appId: string, enabled: boolean) =>
    setAppEnabled(appId, enabled)
  )
}
