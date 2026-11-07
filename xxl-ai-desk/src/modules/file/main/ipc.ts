/*
 * 文件域 IPC 注册：项目内文件读写与目录监听。
 * @author xuxueli 2026-11-07
 */

import type { IpcContext } from '@common/main/ipc'
import { FILE_IPC } from '../shared/ipc'
import { assertProjectDir, listDir, readFile, trashFile, writeFile } from './fsService'
import { initFsWatch, unwatchDir, watchDir } from './fsWatchService'

export function registerFileIpc(ipc: IpcContext): void {
  ipc.handle(FILE_IPC.list, (_event, projectId: number, dir: string) => listDir(projectId, dir))
  ipc.handle(FILE_IPC.read, (_event, projectId: number, path: string) => readFile(projectId, path))
  ipc.handle(FILE_IPC.write, (_event, projectId: number, path: string, content: string) =>
    writeFile(projectId, path, content)
  )
  ipc.handle(FILE_IPC.trash, (_event, projectId: number, path: string) => trashFile(projectId, path))
  initFsWatch((dir) => ipc.send(FILE_IPC.change, dir))
  ipc.handle(FILE_IPC.watch, (_event, projectId: number, dir: string) =>
    watchDir(assertProjectDir(projectId, dir))
  )
  ipc.handle(FILE_IPC.unwatch, (_event, _projectId: number, dir: string) => unwatchDir(dir))
}
