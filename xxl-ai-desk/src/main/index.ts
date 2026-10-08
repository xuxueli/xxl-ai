import { app, BrowserWindow, shell } from 'electron'
import { join } from 'path'
import log from 'electron-log/main'
import { initDatabase } from './db'
import { registerIpc } from './ipc'
import { ensureSeedProviders } from './services/providerService'
import { disposeAllTerminals } from './services/terminalService'
import { disposeAgentRuntime } from './agent/runtime'

/* XXL-AI Desk 主进程入口：窗口、生命周期、IPC 装配 */

let mainWindow: BrowserWindow | null = null

/* 创建主窗口 */
function createWindow(): void {
  /* macOS：隐藏标题栏但保留系统红黄绿按钮，内容铺满整个窗口；其它平台沿用系统默认边框 */
  const isMac = process.platform === 'darwin'
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
      : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

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

  app.whenReady().then(() => {
    log.initialize()
    initDatabase()
    ensureSeedProviders()
    registerIpc(() => mainWindow)
    createWindow()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow()
      }
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit()
    }
  })

  app.on('before-quit', () => {
    disposeAgentRuntime()
    disposeAllTerminals()
  })
}
