/* XXL-AI Desk 主进程入口：窗口、生命周期、IPC 装配 */

import { app, BrowserWindow, nativeImage, shell } from 'electron'
import { existsSync } from 'fs'
import { join } from 'path'
import log from 'electron-log/main'
import { IPC } from '../shared/ipc'
import { initDatabase } from './db'
import { registerIpc } from './ipc'
import { ensureSeedProviders } from './services/providerService'
import { disposeAllTerminals } from './services/terminalService'
import { disposeAllFsWatch } from './services/fsWatchService'
import { disposeAgentRuntime } from './agent/runtime'

/* 主窗口引用（未创建或已关闭时为 null） */
let mainWindow: BrowserWindow | null = null

/* 运行期应用图标路径：开发期取渲染层图标源 src/renderer/src/assets/icon.png；打包后取 resources/icon.png（由 electron-builder extraResources 注入） */
function resolveAppIconPath(): string | null {
  const iconPath = app.isPackaged
    ? join(process.resourcesPath, 'icon.png')
    : join(app.getAppPath(), 'src', 'renderer', 'src', 'assets', 'icon.png')
  return existsSync(iconPath) ? iconPath : null
}

/* 创建主窗口 */
function createWindow(): void {
  /* macOS：隐藏标题栏但保留系统红黄绿按钮，内容铺满整个窗口；其它平台沿用系统默认边框 */
  const isMac = process.platform === 'darwin'
  const appIconPath = resolveAppIconPath()
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1080,
    minHeight: 720,
    show: false,
    autoHideMenuBar: true,
    title: 'XXL-AI Desk',
    backgroundColor: '#ffffff',
    ...(isMac
      ? {
          titleBarStyle: 'hidden' as const,
          /* 红黄绿窗口按钮垂直居中于右侧标题栏高度（45px），水平位置与侧栏左内边距对齐 */
          trafficLightPosition: { x: 14, y: 16 }
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

  /* 窗口关闭：解除引用，避免后续误用已销毁窗口 */
  mainWindow.on('closed', () => {
    mainWindow = null
  })

  /* 外链使用系统浏览器打开 */
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

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
    log.initialize()
    initDatabase()
    ensureSeedProviders()
    registerIpc(() => mainWindow)

    /*
     * 内嵌浏览器（<webview> guest）：把「新窗口」请求转成渲染层的新标签页。
     * 不设置将默认拦截 window.open / target=_blank，表现为点击无反应。
     */
    app.on('web-contents-created', (_event, contents) => {
      if (contents.getType() === 'webview') {
        contents.setWindowOpenHandler(({ url }) => {
          mainWindow?.webContents.send(IPC.browserOpenTab, url)
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

  /* 退出前回收托管运行时进程、全部终端与目录监听，避免残留 */
  app.on('before-quit', () => {
    disposeAgentRuntime()
    disposeAllTerminals()
    disposeAllFsWatch()
  })
}
