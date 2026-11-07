/*
 * 文件域 preload API 片段。
 * @author xuxueli 2026-11-07
 */

import { ipcRenderer } from 'electron'
import type { FileApi } from '../shared/api'
import { FILE_IPC } from '../shared/ipc'

export const fileApi: FileApi = {
  list: (projectId: number, dir: string) => ipcRenderer.invoke(FILE_IPC.list, projectId, dir),
  read: (projectId: number, path: string) => ipcRenderer.invoke(FILE_IPC.read, projectId, path),
  write: (projectId: number, path: string, content: string) =>
    ipcRenderer.invoke(FILE_IPC.write, projectId, path, content),
  trash: (projectId: number, path: string) => ipcRenderer.invoke(FILE_IPC.trash, projectId, path),
  watch: (projectId: number, dir: string) =>
    ipcRenderer.invoke(FILE_IPC.watch, projectId, dir),
  unwatch: (projectId: number, dir: string) =>
    ipcRenderer.invoke(FILE_IPC.unwatch, projectId, dir),
  onChange: (callback) => {
    const listener = (_event: unknown, dir: string): void => callback(dir)
    ipcRenderer.on(FILE_IPC.change, listener)
    return () => ipcRenderer.removeListener(FILE_IPC.change, listener)
  }
}
