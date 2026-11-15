/*
 * 主窗口装配：尺寸策略、创建与窗口级事件边界。
 *   - 尺寸按屏幕工作区自适应：大屏按比例放大，小屏按比例收缩，始终完整落在屏幕内；
 *   - 外链、页面导航、浏览器快捷键与渲染进程回收在此统一拦截。
 * @author xuxueli 2026-11-15
 */

import { BrowserWindow, screen, shell } from 'electron'
import { join } from 'path'
import { APP_NAME } from '@common/shared/appInfo'
import { bindBrowserShortcut, disposeBrowserActions } from '@modules/browser/main'
import { disposeAllTerminals } from '@modules/terminal/main'
import { resolveDefaultAppIcon } from '@modules/platform/main'

/*
 * 主窗口尺寸策略（内容驱动 + 屏幕自适应）：
 *   - default：设计基准 1440×900，容纳图标栏 44 + 子菜单 240 + 正文 880 并留出左右余量；
 *   - min：宽 44 + 150 + 400 + 300 = 894，取 900；高为顶栏 38 + 输入区约 120 + 消息区约 480；
 *   - max：大屏放大上限 1600×1000，与浏览器首窗上限一致，避免超宽屏拉成长条；
 *   - growRatio：工作区足够大时的跟随比例；
 *   - shrinkRatio：工作区装不下时收缩到可用区域的比例。
 */
const WINDOW_SIZE = {
  default: { width: 1440, height: 900 },
  min: { width: 900, height: 640 },
  max: { width: 1600, height: 1000 },
  growRatio: { width: 0.65, height: 0.7 },
  shrinkRatio: 0.92
} as const

/*
 * 推导单个方向的窗口尺寸：
 *   1. 按工作区比例放大，并夹在 [设计基准, 放大上限] 之间；
 *   2. 工作区装得下直接用；装不下（小屏 / 高 DPI 缩放）才按 shrinkRatio 收缩。
 */
function resolveAxisSize(areaSize: number, axis: 'width' | 'height'): number {
  const preferred = Math.min(
    WINDOW_SIZE.max[axis],
    Math.max(WINDOW_SIZE.default[axis], Math.round(areaSize * WINDOW_SIZE.growRatio[axis]))
  )
  return preferred <= areaSize ? preferred : Math.round(areaSize * WINDOW_SIZE.shrinkRatio)
}

/*
 * 读取主屏工作区并推导窗口尺寸：
 *   - 使用 workAreaSize（已扣除菜单栏 / 任务栏 / Dock），避免窗口压到系统栏下方；
 *   - 最小尺寸不超过实际窗口尺寸，避免小屏下窗口无法缩小或完整显示。
 */
function resolveWindowSize(): {
  width: number
  height: number
  minWidth: number
  minHeight: number
} {
  const { width: areaWidth, height: areaHeight } = screen.getPrimaryDisplay().workAreaSize
  const width = resolveAxisSize(areaWidth, 'width')
  const height = resolveAxisSize(areaHeight, 'height')
  return {
    width,
    height,
    minWidth: Math.min(WINDOW_SIZE.min.width, width),
    minHeight: Math.min(WINDOW_SIZE.min.height, height)
  }
}

/* 创建主窗口：不传 x / y，由系统居中显示 */
export function createMainWindow(): BrowserWindow {
  const isMac = process.platform === 'darwin'
  const appIconPath = resolveDefaultAppIcon()
  const { width, height, minWidth, minHeight } = resolveWindowSize()
  const window = new BrowserWindow({
    width,
    height,
    minWidth,
    minHeight,
    /* 宽高按网页内容区计算，避免 Windows / Linux 标题栏吃掉布局所需高度 */
    useContentSize: true,
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

  /* 内容就绪后再显示，避免白屏闪烁 */
  window.on('ready-to-show', () => {
    window.show()
  })

  /* 窗口关闭：结算未完成的浏览器读取，避免等待超时 */
  window.on('closed', () => {
    disposeBrowserActions()
  })

  /* 渲染进程崩溃/重载：回收残留 PTY，避免进程泄漏 */
  window.webContents.on('render-process-gone', () => {
    disposeAllTerminals()
  })

  /* 外链使用系统浏览器打开 */
  window.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  /* 浏览器面板快捷键：主窗口内按键先经主进程拦截（避开菜单加速键） */
  bindBrowserShortcut(window.webContents)

  /*
   * 拦截窗口内导航：Markdown / 页面内的普通链接不得替换应用界面。
   * 同文档（仅 hash 变化）放行；其余 http(s) 交给系统浏览器。
   */
  const guardNavigation = (event: Electron.Event, url: string): void => {
    const current = window.webContents.getURL()
    if (url.split('#')[0] === current.split('#')[0]) {
      return
    }
    event.preventDefault()
    if (/^https?:/i.test(url)) {
      void shell.openExternal(url)
    }
  }
  window.webContents.on('will-navigate', guardNavigation)
  window.webContents.on('will-redirect', guardNavigation)

  if (process.env.ELECTRON_RENDERER_URL) {
    window.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    window.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return window
}
