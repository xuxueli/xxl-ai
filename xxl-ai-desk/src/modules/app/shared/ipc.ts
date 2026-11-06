/*
 * 系统域 IPC 通道：应用信息、数据目录、运行时检测、更新与系统外壳。
 * @author xuxueli 2026-11-07
 */

export const APP_IPC = {
  info: 'desk:app:info',
  setDataDir: 'desk:app:set-data-dir',
  selectDataDir: 'desk:app:select-data-dir',
  openDataDir: 'desk:app:open-data-dir',
  relaunch: 'desk:app:relaunch',
  selectExecutable: 'desk:app:select-executable',
  detectExecutable: 'desk:app:detect-executable',
  logError: 'desk:app:log-error'
} as const

export const UPDATE_IPC = {
  check: 'desk:update:check',
  open: 'desk:update:open'
} as const

export const SHELL_IPC = {
  openExternal: 'desk:shell:open-external',
  openPath: 'desk:shell:open-path',
  reveal: 'desk:shell:reveal',
  openWithApps: 'desk:shell:open-with-apps',
  openWith: 'desk:shell:open-with'
} as const
