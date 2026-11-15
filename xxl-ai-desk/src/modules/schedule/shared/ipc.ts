/*
 * 定时任务域 IPC 通道。
 * @author xuxueli 2026-11-15
 */

export const SCHEDULE_IPC = {
  list: 'desk:schedule:list',
  save: 'desk:schedule:save',
  remove: 'desk:schedule:remove',
  setEnabled: 'desk:schedule:set-enabled',
  runNow: 'desk:schedule:run-now',
  logs: 'desk:schedule:logs',
  clearLogs: 'desk:schedule:clear-logs',
  watchdog: 'desk:schedule:watchdog',
  getConfig: 'desk:schedule:get-config',
  saveConfig: 'desk:schedule:save-config',
  changed: 'desk:schedule:changed'
} as const
