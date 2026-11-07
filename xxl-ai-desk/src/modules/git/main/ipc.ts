/*
 * Git 域 IPC 注册：项目变更监听事件转发。
 * @author xuxueli 2026-11-07
 */

import type { IpcContext } from '@common/main/ipc'
import { GIT_IPC } from '../shared/ipc'
import { commitGit, getGitDiff, getGitStatus, initGitWatch, stageGit, unstageGit, unwatchGitProject, watchGitProject } from './gitService'

export function registerGitIpc(ipc: IpcContext): void {
  initGitWatch((projectId) => ipc.send(GIT_IPC.change, projectId))

  ipc.handle(GIT_IPC.status, (_event, projectId: number) => getGitStatus(projectId))
  ipc.handle(GIT_IPC.diff, (_event, input) => getGitDiff(input))
  ipc.handle(GIT_IPC.stage, (_event, projectId: number, path: string, oldPath?: string) =>
    stageGit(projectId, path, oldPath)
  )
  ipc.handle(GIT_IPC.unstage, (_event, projectId: number, path: string, oldPath?: string) =>
    unstageGit(projectId, path, oldPath)
  )
  ipc.handle(GIT_IPC.commit, (_event, input) => commitGit(input))
  ipc.handle(GIT_IPC.watch, (_event, projectId: number) => watchGitProject(projectId))
  ipc.handle(GIT_IPC.unwatch, (_event, projectId: number) => unwatchGitProject(projectId))
}
