/*
 * 应用中心 IPC 通道。
 * @author xuxueli 2026-11-08
 */

export const APP_CENTER_IPC = {
  listStates: 'desk:app-center:list-states',
  getState: 'desk:app-center:get-state',
  install: 'desk:app-center:install',
  uninstall: 'desk:app-center:uninstall',
  setEnabled: 'desk:app-center:set-enabled'
} as const
