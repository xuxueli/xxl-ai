/*
 * Git 域 preload API 片段。
 * @author xuxueli 2026-11-07
 */

import { ipcRenderer } from 'electron'
import type { GitApi } from '../shared/api'
import { GIT_IPC } from '../shared/ipc'

export const gitApi: GitApi = {
  status: (projectId: number) => ipcRenderer.invoke(GIT_IPC.status, projectId),
  diff: (input) => ipcRenderer.invoke(GIT_IPC.diff, input),
  stage: (projectId: number, path: string, oldPath?: string) =>
    ipcRenderer.invoke(GIT_IPC.stage, projectId, path, oldPath),
  unstage: (projectId: number, path: string, oldPath?: string) =>
    ipcRenderer.invoke(GIT_IPC.unstage, projectId, path, oldPath),
  commit: (input) => ipcRenderer.invoke(GIT_IPC.commit, input),
  watch: (projectId: number) => ipcRenderer.invoke(GIT_IPC.watch, projectId),
  unwatch: (projectId: number) => ipcRenderer.invoke(GIT_IPC.unwatch, projectId),
  onChange: (callback) => {
    const listener = (_event: unknown, projectId: number): void => callback(projectId)
    ipcRenderer.on(GIT_IPC.change, listener)
    return () => ipcRenderer.removeListener(GIT_IPC.change, listener)
  }
}
