/*
 * platform 模块 IPC 注册：应用信息、数据目录、运行时检测、更新与系统外壳。
 * @author xuxueli 2026-11-07
 */

import { app, dialog, ipcMain, shell } from 'electron'
import log from 'electron-log/main'
import type { IpcContext } from '@common/main/ipc'
import { t } from '@common/main/i18n'
import type { RuntimeInfo } from '../shared/contracts'
import { APP_IPC, SHELL_IPC, UPDATE_IPC } from '../shared/ipc'
import { getDataDir, getDbFile, getDefaultDataDir, setDataDir } from '@common/main/config/paths'
import { detectExecutable } from './envService'
import { checkForUpdate, openDownload } from './updateService'
import { listOpenWithApps, openWith } from './openWithService'
import { disposeAgentRuntime } from '@modules/agent/main'
import { disposeAllTerminals } from '@modules/terminal/main'

export function registerPlatformIpc(ipc: IpcContext): void {
  ipc.handle(
    APP_IPC.info,
    (): RuntimeInfo => ({
      version: app.getVersion(),
      platform: process.platform,
      dataDir: getDataDir(),
      defaultDataDir: getDefaultDataDir(),
      dbFile: getDbFile()
    })
  )
  ipc.handle(APP_IPC.setDataDir, (_event, dir: string) => setDataDir(dir))
  ipc.handle(APP_IPC.selectDataDir, async () => {
    const result = await dialog.showOpenDialog({
      title: t('runtime.dialog.selectDataDir'),
      defaultPath: getDataDir(),
      properties: ['openDirectory', 'createDirectory']
    })
    return result.canceled || result.filePaths.length === 0 ? '' : result.filePaths[0]
  })
  ipc.handle(APP_IPC.openDataDir, async () => {
    await shell.openPath(getDataDir())
  })
  ipc.handle(APP_IPC.relaunch, () => {
    if (!app.isPackaged) {
      console.warn('[relaunch] 开发模式下不执行自动重启，请手动重新运行 npm run dev')
      return
    }
    disposeAgentRuntime()
    disposeAllTerminals()
    app.relaunch()
    app.exit(0)
  })
  ipc.handle(APP_IPC.selectExecutable, async (_event, title?: string) => {
    const result = await dialog.showOpenDialog({
      title: title || '选择可执行文件',
      properties: ['openFile']
    })
    return result.canceled || result.filePaths.length === 0 ? '' : result.filePaths[0]
  })
  ipc.handle(APP_IPC.detectExecutable, (_event, input) => detectExecutable(input))
  /* 渲染层异常上报：只落日志，不做业务处理 */
  ipcMain.on(APP_IPC.logError, (_event, message: string) => {
    log.error('[renderer]', message)
  })

  ipc.handle(UPDATE_IPC.check, () => checkForUpdate())
  ipc.handle(UPDATE_IPC.open, (_event, url: string) => openDownload(url))

  ipc.handle(SHELL_IPC.openExternal, (_event, url: string) => shell.openExternal(url))
  ipc.handle(SHELL_IPC.openPath, (_event, path: string) => shell.openPath(path))
  ipc.handle(SHELL_IPC.reveal, (_event, path: string) => {
    shell.showItemInFolder(path)
  })
  ipc.handle(SHELL_IPC.openWithApps, () => listOpenWithApps())
  ipc.handle(SHELL_IPC.openWith, (_event, appPath: string, file: string) => openWith(appPath, file))
}
