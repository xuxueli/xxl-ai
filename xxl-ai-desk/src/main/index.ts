/* XXL-AI-Desk 主进程入口：窗口、生命周期、IPC 装配 */

import { app, BrowserWindow, nativeImage, shell } from 'electron'
import { existsSync } from 'fs'
import { join } from 'path'
import './i18n'
import { BROWSER_IPC } from '@modules/browser/shared'
import { APP_NAME } from '@common/shared/appInfo'
import { initDatabaseFromModules } from '@main/db'
import { setMainLanguage } from '@common/main/i18n'
import { getSettings } from '@modules/settings/main'
import { purgeExpiredTraces } from '@modules/diagnostics/main'
import { registerIpc } from '@main/ipc'
import { cleanupGithubArchiveTemps } from '@modules/skill/main'
import { ensureSeedProviders } from '@modules/provider/main'
import { registerLocalFileProtocol } from '@modules/platform/main'
import { disposeAllTerminals } from '@modules/terminal/main'
import { disposeAllFsWatch } from '@modules/file/main'
import { disposeAllNoteWatch } from '@modules/apps/note/main'
import { disposeAllGitWatch } from '@modules/git/main'
import { disposeAgentRuntime } from '@modules/agent/main'
import { disposeBrowserActions } from '@modules/browser/main'
import { initLogger } from '@common/main/utils/logger'

/* 主窗口引用（未创建或已关闭时为 null） */
let mainWindow: BrowserWindow | null = null

/* 运行期应用图标路径：开发期取项目 resources/icon.png；打包后取 resources/icon.png（由 electron-builder extraResources 注入） */
function resolveAppIconPath(): string | null {
  const iconPath = app.isPackaged
    ? join(process.resourcesPath, 'icon.png')
    : join(app.getAppPath(), 'resources', 'icon.png')
  return existsSync(iconPath) ? iconPath : null
}

/* 创建主窗口 */
function createWindow(): void {
  /* macOS：隐藏标题栏但保留系统红黄绿按钮，内容铺满整个窗口；其它平台沿用系统默认边框 */
  const isMac = process.platform === 'darwin'
  const appIconPath = resolveAppIconPath()
  mainWindow = new BrowserWindow({
    width: 1512,
    height: 944,
    minWidth: 900,
    minHeight: 720,
    show: false,
    autoHideMenuBar: true,
    title: APP_NAME,
    backgroundColor: '#ffffff',
    ...(isMac
      ? {
          titleBarStyle: 'hidden' as const,
          /* 红黄绿窗口按钮垂直居中于顶部栏（38px），水平位置与左内边距对齐 */
          trafficLightPosition: { x: 14, y: 13 }
        }
      : appIconPath
        ? { icon: appIconPath }
        : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
      /* 右侧「浏览器」面板使用 <webview> 内嵌网页 */
      webviewTag: true
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  /* macOS：dev 期运行原装 Electron，Dock 图标仍为 Electron 默认，需显式覆盖（打包后 bundle 已是自定义 icns，属冗余设置） */
  if (isMac && appIconPath) {
    app.dock?.setIcon(nativeImage.createFromPath(appIconPath))
  }

  /* 窗口关闭：解除引用并结算未完成的浏览器读取，避免等待超时 */
  mainWindow.on('closed', () => {
    disposeBrowserActions()
    mainWindow = null
  })

  /* 渲染进程崩溃/重载：回收残留 PTY，避免进程泄漏 */
  mainWindow.webContents.on('render-process-gone', () => {
    disposeAllTerminals()
  })

  /* 外链使用系统浏览器打开 */
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  /*
   * 拦截主窗口内导航：Markdown / 页面内的普通链接不得替换应用界面。
   * 同文档（仅 hash 变化）放行；其余 http(s) 交给系统浏览器。
   */
  const guardNavigation = (event: Electron.Event, url: string): void => {
    const current = mainWindow?.webContents.getURL() ?? ''
    if (url.split('#')[0] === current.split('#')[0]) {
      return
    }
    event.preventDefault()
    if (/^https?:/i.test(url)) {
      void shell.openExternal(url)
    }
  }
  mainWindow.webContents.on('will-navigate', guardNavigation)
  mainWindow.webContents.on('will-redirect', guardNavigation)

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
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
    initLogger()
    initDatabaseFromModules()
    /* 主进程错误文案语言：语言由配置决定且不支持运行时切换，启动时初始化一次 */
    setMainLanguage(getSettings().language)
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
      }
    })

    createWindow()

    /* macOS 点击 Dock 图标且无窗口时重新建窗 */
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow()
      }
    })
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
    void disposeAgentRuntime().finally(() => {
      disposeAllTerminals()
      disposeAllFsWatch()
      disposeAllNoteWatch()
      disposeAllGitWatch()
      app.quit()
    })
  })
}
