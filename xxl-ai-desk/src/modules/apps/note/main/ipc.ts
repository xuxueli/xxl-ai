/*
 * 笔记应用 IPC 注册：设置、目录、读写与图片。
 * @author xuxueli 2026-11-08
 */

import { dialog } from 'electron'
import type { IpcContext } from '@common/main/ipc'
import { t } from '@common/main/i18n'
import { registerLocalFileRoot } from '@common/main/utils/localFileRoots'
import { NOTE_IPC } from '../shared/ipc'
import {
  IMAGE_EXTENSIONS,
  assertNoteDir,
  createFolder,
  createNote,
  getNoteSettings,
  getNoteStorageDir,
  listNotes,
  readNote,
  renameNote,
  saveImage,
  saveImageFromFile,
  saveNoteSettings,
  trashNote,
  writeNote
} from './noteService'
import { initNoteWatch, unwatchNoteDir, watchNoteDir } from './fsWatchService'

export function registerNoteIpc(ipc: IpcContext): void {
  /* 笔记根目录加入本地文件协议允许根 */
  registerLocalFileRoot('note', () => getNoteStorageDir())
  ipc.handle(NOTE_IPC.getSettings, () => getNoteSettings())
  ipc.handle(NOTE_IPC.saveSettings, (_event, patch) => saveNoteSettings(patch))
  ipc.handle(NOTE_IPC.selectStorageDir, async () => {
    const result = await dialog.showOpenDialog({
      title: t('runtime.dialog.selectNoteStorageDir'),
      defaultPath: getNoteSettings().resolvedStorageDir,
      properties: ['openDirectory', 'createDirectory']
    })
    return result.canceled || result.filePaths.length === 0 ? '' : result.filePaths[0]
  })
  ipc.handle(NOTE_IPC.list, (_event, dir?: string) => listNotes(dir))
  ipc.handle(NOTE_IPC.read, (_event, file: string) => readNote(file))
  ipc.handle(NOTE_IPC.write, (_event, file: string, content: string) => writeNote(file, content))
  ipc.handle(NOTE_IPC.createNote, (_event, dir?: string, name?: string) => createNote(dir, name))
  ipc.handle(NOTE_IPC.createFolder, (_event, dir: string | undefined, name: string) =>
    createFolder(dir, name)
  )
  ipc.handle(NOTE_IPC.rename, (_event, file: string, name: string) => renameNote(file, name))
  ipc.handle(NOTE_IPC.trash, (_event, file: string) => trashNote(file))
  ipc.handle(NOTE_IPC.pickImages, async (_event, noteFile: string) => {
    const settings = getNoteSettings()
    const result = await dialog.showOpenDialog({
      title: t('runtime.dialog.selectNoteImages'),
      defaultPath: settings.imageDir,
      properties: ['openFile', 'multiSelections'],
      filters: [
        {
          name: t('runtime.dialog.noteImageFilter'),
          extensions: IMAGE_EXTENSIONS.map((ext) => ext.slice(1))
        }
      ]
    })
    if (result.canceled) {
      return []
    }
    return result.filePaths.map((file) => saveImageFromFile(noteFile, file))
  })
  ipc.handle(NOTE_IPC.saveImage, (_event, noteFile: string, data: Uint8Array, extension: string) =>
    saveImage(noteFile, data, extension)
  )
  initNoteWatch((dir) => ipc.send(NOTE_IPC.change, dir))
  ipc.handle(NOTE_IPC.watch, (_event, dir: string) => watchNoteDir(assertNoteDir(dir)))
  ipc.handle(NOTE_IPC.unwatch, (_event, dir: string) => unwatchNoteDir(dir))
}
