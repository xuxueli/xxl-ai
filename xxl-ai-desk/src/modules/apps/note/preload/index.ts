/*
 * 笔记应用 preload API 片段。
 * @author xuxueli 2026-11-08
 */

import { ipcRenderer } from 'electron'
import type { NoteApi } from '../shared/api'
import { NOTE_IPC } from '../shared/ipc'

export const noteApi: NoteApi = {
  getSettings: () => ipcRenderer.invoke(NOTE_IPC.getSettings),
  saveSettings: (patch) => ipcRenderer.invoke(NOTE_IPC.saveSettings, patch),
  selectStorageDir: () => ipcRenderer.invoke(NOTE_IPC.selectStorageDir),
  list: (dir) => ipcRenderer.invoke(NOTE_IPC.list, dir),
  read: (path) => ipcRenderer.invoke(NOTE_IPC.read, path),
  write: (path, content) => ipcRenderer.invoke(NOTE_IPC.write, path, content),
  createNote: (dir, name) => ipcRenderer.invoke(NOTE_IPC.createNote, dir, name),
  createFolder: (dir, name) => ipcRenderer.invoke(NOTE_IPC.createFolder, dir, name),
  rename: (path, name) => ipcRenderer.invoke(NOTE_IPC.rename, path, name),
  trash: (path) => ipcRenderer.invoke(NOTE_IPC.trash, path),
  pickImages: (notePath) => ipcRenderer.invoke(NOTE_IPC.pickImages, notePath),
  saveImage: (notePath, data, extension) =>
    ipcRenderer.invoke(NOTE_IPC.saveImage, notePath, data, extension),
  watch: (dir) => ipcRenderer.invoke(NOTE_IPC.watch, dir),
  unwatch: (dir) => ipcRenderer.invoke(NOTE_IPC.unwatch, dir),
  onChange: (callback) => {
    const listener = (_event: unknown, dir: string): void => callback(dir)
    ipcRenderer.on(NOTE_IPC.change, listener)
    return () => ipcRenderer.removeListener(NOTE_IPC.change, listener)
  }
}
