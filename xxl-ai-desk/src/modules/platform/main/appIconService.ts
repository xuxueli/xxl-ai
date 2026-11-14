/*
 * 应用图标服务：把自定义 Logo 应用到运行期窗口图标 / macOS Dock 图标。
 *   - 仅影响运行期，安装包图标仍由 electron-builder 打包时决定；
 *   - 自定义图片无法解析（如 SVG）或缺失时回退内置 resources/icon.png。
 * @author xuxueli 2026-11-15
 */

import { app, BrowserWindow, nativeImage, type NativeImage } from 'electron'
import { existsSync } from 'fs'
import { join } from 'path'

/* 内置图标路径：开发期取项目 resources，打包后取 extraResources 注入的文件 */
export function resolveDefaultAppIcon(): string | null {
  const iconPath = app.isPackaged
    ? join(process.resourcesPath, 'icon.png')
    : join(app.getAppPath(), 'resources', 'icon.png')
  return existsSync(iconPath) ? iconPath : null
}

/* 读取图标：文件缺失或格式不被 nativeImage 支持时返回 null */
function loadIcon(iconPath: string | null): NativeImage | null {
  if (!iconPath || !existsSync(iconPath)) {
    return null
  }
  const image = nativeImage.createFromPath(iconPath)
  return image.isEmpty() ? null : image
}

/* 应用图标到运行期：macOS 更新 Dock，其它平台更新全部窗口 */
function setRuntimeIcon(image: NativeImage): void {
  if (process.platform === 'darwin') {
    app.dock?.setIcon(image)
    return
  }
  for (const window of BrowserWindow.getAllWindows()) {
    window.setIcon(image)
  }
}

/*
 * 应用运行期图标：
 *   - macOS 更新 Dock 图标；
 *   - Windows / Linux 更新全部窗口图标（任务栏 / 标题栏）。
 * iconPath 为空表示恢复内置图标。
 */
export function applyAppIcon(iconPath?: string): void {
  /* macOS 的自定义 Dock 图标由渲染层圆角生成，这里只做内置图标兜底，避免先出现方形图标 */
  const customPath = process.platform === 'darwin' ? null : (iconPath ?? null)
  const image = loadIcon(customPath) ?? loadIcon(resolveDefaultAppIcon())
  if (image) {
    setRuntimeIcon(image)
  }
}

/*
 * 以渲染层生成的 PNG 更新运行期图标：
 *   - 用于 macOS 圆角 Dock 图标（Canvas 统一裁切）；
 *   - dataUrl 为空或解析失败时回退内置图标。
 */
export function applyAppIconDataUrl(dataUrl?: string): void {
  const image = dataUrl ? nativeImage.createFromDataURL(dataUrl) : null
  const target = image && !image.isEmpty() ? image : loadIcon(resolveDefaultAppIcon())
  if (target) {
    setRuntimeIcon(target)
  }
}
