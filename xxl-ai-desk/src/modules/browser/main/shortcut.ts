/*
 * 浏览器面板快捷键：主进程优先拦截，再转发渲染层执行。
 *   - ⌘/Ctrl + R、⌘/Ctrl + W 与默认菜单的「重新加载 / 关闭窗口」加速键冲突，只能在主进程拦截；
 *   - webview 内的按键不冒泡到渲染窗口，须对 guest 的 webContents 单独绑定；
 *   - 面板未激活时不拦截，保留系统与应用默认行为。
 * @author xuxueli 2026-11-14
 */

import type { WebContents } from 'electron'
import type { BrowserKeyInput } from '../shared/contracts'
import { BROWSER_IPC } from '../shared/ipc'

/* 面板快捷键主键（仅这些组合需要主进程介入） */
const SHORTCUT_KEYS = new Set(['l', 'r', 't', 'w', 'f', 'escape'])

/* 浏览器面板是否处于激活态（由渲染层同步） */
let panelActive = false

/* 同步面板激活态：未激活时完全不拦截按键 */
export function setBrowserPanelActive(active: boolean): void {
  panelActive = active
}

/* 归一化按键：仅处理面板快捷键，其余按键原样交给页面 */
function toKeyInput(input: Electron.Input): BrowserKeyInput | null {
  if (input.type !== 'keyDown' || input.alt) {
    return null
  }
  const key = input.key.toLowerCase()
  if (!SHORTCUT_KEYS.has(key)) {
    return null
  }
  /* Esc 不要求修饰键，也不允许带修饰键 */
  if (key === 'escape') {
    return input.meta || input.control || input.shift
      ? null
      : { key, meta: false, control: false, alt: false, shift: false }
  }
  /* 其余组合要求平台主修饰键，且不得混入另一平台的修饰键 */
  const primary = process.platform === 'darwin' ? input.meta : input.control
  const secondary = process.platform === 'darwin' ? input.control : input.meta
  if (!primary || secondary) {
    return null
  }
  return { key, meta: input.meta, control: input.control, alt: input.alt, shift: input.shift }
}

/* 绑定快捷键拦截（主窗口与 webview guest 均适用） */
export function bindBrowserShortcut(contents: WebContents): void {
  /* 主窗口重载会丢失渲染层状态：取消激活，避免继续吞掉系统快捷键（webview 导航不影响面板状态） */
  if (contents.getType() !== 'webview') {
    contents.on('did-start-loading', () => {
      panelActive = false
    })
  }
  contents.on('before-input-event', (event, input) => {
    if (!panelActive) {
      return
    }
    const key = toKeyInput(input)
    if (!key) {
      return
    }
    /* Esc 同时交给页面处理（如关闭页面内弹层）；其余组合拦截，避免命中菜单加速键 */
    if (key.key !== 'escape') {
      event.preventDefault()
    }
    ;(contents.hostWebContents ?? contents).send(BROWSER_IPC.shortcutKey, key)
  })
}
