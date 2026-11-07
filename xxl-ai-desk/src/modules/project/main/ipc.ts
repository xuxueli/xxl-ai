/*
 * 项目域 IPC 注册：级联删除前终止会话运行并清理运行时。
 * @author xuxueli 2026-11-07
 */

import { dialog, shell } from 'electron'
import type { IpcContext } from '@common/main/ipc'
import { t } from '@common/main/i18n'
import { PROJECT_IPC } from '../shared/ipc'
import { createProject, deleteProject, getProject, listProjects, renameProject, setProjectMemoryEnabled } from './projectService'
import { abortChat, deleteSession, discardSessionRuns, listSessionIdsByProject } from '@modules/chat/main'
import { evictAgent, clearSessionPermissions, removeAgentMemory } from '@modules/agent/main'
import { clearTraces } from '@modules/diagnostics/main'

export function registerProjectIpc(ipc: IpcContext): void {
  ipc.handle(PROJECT_IPC.list, () => listProjects())
  ipc.handle(PROJECT_IPC.create, async (_event, input) => {
    let path = input?.path?.trim() ?? ''
    if (!path) {
      const result = await dialog.showOpenDialog({
        title: input?.dialogTitle || t('runtime.dialog.selectFolderTitle'),
        properties: ['openDirectory', 'createDirectory']
      })
      if (result.canceled || result.filePaths.length === 0) {
        return null
      }
      path = result.filePaths[0]
    }
    return createProject({ name: input?.name, path })
  })
  ipc.handle(PROJECT_IPC.rename, (_event, id: string, name: string) => renameProject(id, name))
  ipc.handle(PROJECT_IPC.remove, async (_event, id: string) => {
    const sessionIds = listSessionIdsByProject(id)
    deleteProject(id)
    for (const sessionId of sessionIds) {
      discardSessionRuns(sessionId)
      await abortChat(sessionId)
      evictAgent(sessionId)
      clearSessionPermissions(sessionId)
      clearTraces(sessionId)
      deleteSession(sessionId)
    }
    removeAgentMemory(id)
  })
  ipc.handle(PROJECT_IPC.reveal, (_event, id: string) => {
    const project = getProject(id)
    if (project) {
      shell.showItemInFolder(project.path)
    }
  })
  ipc.handle(PROJECT_IPC.setMemoryEnabled, (_event, id: string, enabled: boolean) => {
    const saved = setProjectMemoryEnabled(id, enabled)
    /* 记忆注入状态变化：清理项目下会话运行时，下一轮重新装配系统提示 */
    listSessionIdsByProject(id).forEach((sessionId) => evictAgent(sessionId))
    return saved
  })
}
