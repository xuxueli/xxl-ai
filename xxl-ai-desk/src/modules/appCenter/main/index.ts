/*
 * appCenter 模块主进程公共出口。
 * @author xuxueli 2026-11-08
 */

export {
  getAppConfig,
  getAppState,
  installApp,
  listAppStates,
  patchAppConfig,
  setAppEnabled,
  uninstallApp
} from './appService'
export type { AppConfig } from './appService'
