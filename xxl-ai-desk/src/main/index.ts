/* XXL-AI-Desk 主进程入口：窗口、生命周期、IPC 装配 */

import { app, BrowserWindow } from 'electron'
import { mkdirSync } from 'fs'
import './i18n'
import { BROWSER_IPC } from '@modules/browser/shared'
import { getCacheDir, getDataDir } from '@common/main/config/paths'
import { initDatabaseFromModules } from '@main/db'
import type { DatabaseInitResult } from '@common/main/db'
import { setMainLanguage } from '@common/main/i18n'
import { getBrandingAssets, getSettings } from '@modules/settings/main'
import { purgeExpiredTraces } from '@modules/diagnostics/main'
import { registerIpc } from '@main/ipc'
import { cleanupGithubArchiveTemps } from '@modules/skill/main'
import { ensureSeedProviders } from '@modules/provider/main'
import {
  applyAppIcon,
  registerLocalFileProtocol,
  showDatabaseRecoveryNotice,
  showStartupFailure
} from '@modules/platform/main'
import { disposeAllTerminals } from '@modules/terminal/main'
import { disposeAllFsWatch } from '@modules/file/main'
import { disposeAllNoteWatch } from '@modules/apps/note/main'
import { disposeAllGitWatch } from '@modules/git/main'
import { disposeAgentRuntime } from '@modules/chat/harness'
import { disposeScheduleScheduler, startScheduleScheduler } from '@modules/schedule/main'
import { bindBrowserShortcut } from '@modules/browser/main'
import { initLogger } from '@common/main/utils/logger'
import { createMainWindow } from '@main/window'

/* 业务数据目录：默认系统配置目录，可由 xxl-ai-desk-config.json 切换；必须在 app ready 前设置 */
const dataDir = getDataDir()
mkdirSync(dataDir, { recursive: true, mode: 0o700 })

/* 系统缓存目录：Chromium 缓存与本地存储独立存放，避免污染业务数据目录 */
const cacheDir = getCacheDir()
mkdirSync(cacheDir, { recursive: true, mode: 0o700 })
app.setPath('userData', cacheDir)
app.setPath('sessionData', cacheDir)

/* 主窗口引用（未创建或已关闭时为 null） */
let mainWindow: BrowserWindow | null = null

/* 创建主窗口：窗口内部逻辑在 window.ts，这里只维护引用与应用级图标 */
function createWindow(): void {
  mainWindow = createMainWindow()
  /* 运行期应用图标：自定义 Logo 优先，未设置时回退内置 icon.png */
  applyAppIcon(getBrandingAssets().logoPath)
  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

/*
 * 启动引导：数据库初始化与后续装配分开处理。
 *   - 旧库升级不兼容：初始化已自动备份并重建，这里弹框说明原因与备份位置；
 *   - 其它启动异常：统一弹框提示并退出，避免界面白屏且错误不可见。
 */
async function bootstrap(): Promise<void> {
  initLogger()

  let database: DatabaseInitResult
  try {
    database = initDatabaseFromModules()
  } catch (error) {
    await showStartupFailure(error)
    app.exit(1)
    return
  }

  try {
    /* 主进程错误文案语言：语言由配置决定且不支持运行时切换，启动时初始化一次 */
    setMainLanguage(getSettings().language)
    /* 旧库已备份重建：先告知用户原因与备份文件，再进入应用 */
    if (database.recovered) {
      await showDatabaseRecoveryNotice(database)
    }
    /* 清理过期模型通讯记录（开发者模式） */
    purgeExpiredTraces()
    cleanupGithubArchiveTemps()
    ensureSeedProviders()
    registerLocalFileProtocol()
    registerIpc(() => mainWindow)

    /*
     * 内嵌浏览器（<webview> guest）：把「新窗口」请求转成渲染层的新标签页。
     * 不设置将默认拦截 window.open / target=_blank，表现为点击无反应。
     */
    app.on('web-contents-created', (_event, contents) => {
      if (contents.getType() === 'webview') {
        contents.setWindowOpenHandler(({ url }) => {
          /* 页面内新窗口请求：始终新建标签页；sessionId 留空由渲染层按当前会话兜底 */
          mainWindow?.webContents.send(BROWSER_IPC.openTab, {
            sessionId: '',
            url,
            newTab: true
          })
          return { action: 'deny' }
        })
        /* webview 内按键不冒泡到渲染窗口：guest 的快捷键同样在主进程拦截 */
        bindBrowserShortcut(contents)
      }
    })

    createWindow()
    /* 窗口就绪后再启动调度：到点触发的会话事件有渲染层可接 */
    startScheduleScheduler()

    /* macOS 点击 Dock 图标且无窗口时重新建窗 */
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow()
      }
    })
  } catch (error) {
    await showStartupFailure(error)
    app.exit(1)
  }
}

/* 单实例锁：避免多开导致数据库竞争 */
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) {
        mainWindow.restore()
      }
      mainWindow.focus()
    }
  })

  /* 应用就绪：初始化数据库、播种供应商、注册 IPC、建立窗口 */
  app.whenReady().then(() => {
    void bootstrap()
  })

  /*
   * 关闭全部窗口后完全退出（含 macOS）：
   * 该应用无托盘/后台常驻能力，若沿用 macOS 默认「关窗不退出」，
   * 应用与开发期 electron-vite 监听进程会留在后台，表现为「退出后残留 node 进程」。
   */
  app.on('window-all-closed', () => {
    app.quit()
  })

  /* 退出前回收托管运行时进程、全部终端与目录监听，避免残留（含 MCP 的 npx/node 子进程） */
  let quitting = false
  app.on('before-quit', (event) => {
    if (quitting) {
      return
    }
    /* 先阻塞退出，等待运行时进程优雅关闭后再统一清理并真正退出 */
    event.preventDefault()
    quitting = true
    /* 先停调度，避免退出过程中再触发新任务，再回收运行时与终端 */
    disposeScheduleScheduler()
    void disposeAgentRuntime().finally(() => {
      disposeAllTerminals()
      disposeAllFsWatch()
      disposeAllNoteWatch()
      disposeAllGitWatch()
      app.quit()
    })
  })
}
