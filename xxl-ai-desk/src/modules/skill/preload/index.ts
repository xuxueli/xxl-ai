/*
 * SKILL 域 preload API 片段。
 * @author xuxueli 2026-11-07
 */

import { ipcRenderer } from 'electron'
import type { SkillApi } from '../shared/api'
import { SKILL_IPC } from '../shared/ipc'

export const skillApi: SkillApi = {
  list: () => ipcRenderer.invoke(SKILL_IPC.list),
  detail: (id: string) => ipcRenderer.invoke(SKILL_IPC.detail, id),
  content: (id: string, offset: number) => ipcRenderer.invoke(SKILL_IPC.content, id, offset),
  importDirectory: () => ipcRenderer.invoke(SKILL_IPC.importDir),
  importZip: () => ipcRenderer.invoke(SKILL_IPC.importZip),
  remove: (id: string) => ipcRenderer.invoke(SKILL_IPC.remove, id),
  reveal: (id: string) => ipcRenderer.invoke(SKILL_IPC.reveal, id),
  refresh: () => ipcRenderer.invoke(SKILL_IPC.refresh),
  discover: (query) => ipcRenderer.invoke(SKILL_IPC.discover, query),
  discoverDetail: (id: string) => ipcRenderer.invoke(SKILL_IPC.discoverDetail, id),
  install: (id: string) => ipcRenderer.invoke(SKILL_IPC.install, id),
  githubInspect: (query) => ipcRenderer.invoke(SKILL_IPC.githubInspect, query),
  githubInstall: (input) => ipcRenderer.invoke(SKILL_IPC.githubInstall, input),
  githubCancel: (query) => ipcRenderer.invoke(SKILL_IPC.githubCancel, query)
}
