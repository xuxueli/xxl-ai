/*
 * platform 模块 preload API 片段。
 * @author xuxueli 2026-11-07
 */

import { ipcRenderer } from 'electron'
import type { AppApi, ShellApi, UpdateApi } from '../shared/api'
import { APP_IPC, SHELL_IPC, UPDATE_IPC } from '../shared/ipc'

export const appApi: AppApi = {
  info: () => ipcRenderer.invoke(APP_IPC.info),
  setDataDir: (dir: string) => ipcRenderer.invoke(APP_IPC.setDataDir, dir),
  selectDataDir: () => ipcRenderer.invoke(APP_IPC.selectDataDir),
  openDataDir: () => ipcRenderer.invoke(APP_IPC.openDataDir),
  relaunch: () => ipcRenderer.invoke(APP_IPC.relaunch),
  selectExecutable: (title?: string) => ipcRenderer.invoke(APP_IPC.selectExecutable, title),
  detectExecutable: (input) => ipcRenderer.invoke(APP_IPC.detectExecutable, input),
  logError: (message: string) => ipcRenderer.send(APP_IPC.logError, message)
}

export const updateApi: UpdateApi = {
  check: () => ipcRenderer.invoke(UPDATE_IPC.check),
  openDownload: (url: string) => ipcRenderer.invoke(UPDATE_IPC.open, url)
}

export const shellApi: ShellApi = {
  openExternal: (url: string) => ipcRenderer.invoke(SHELL_IPC.openExternal, url),
  openPath: (path: string) => ipcRenderer.invoke(SHELL_IPC.openPath, path),
  reveal: (path: string) => ipcRenderer.invoke(SHELL_IPC.reveal, path),
  openWithApps: () => ipcRenderer.invoke(SHELL_IPC.openWithApps),
  openWith: (appPath: string, file: string) => ipcRenderer.invoke(SHELL_IPC.openWith, appPath, file)
}
