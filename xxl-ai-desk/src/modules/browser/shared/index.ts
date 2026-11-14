/*
 * browser 模块跨进程公共契约出口。
 * @author xuxueli 2026-11-07
 */

export type { BrowserApi } from './api'
export { BROWSER_READ_DEFAULT_CHARS, BROWSER_READ_MAX_CHARS } from './contracts'
export type { BrowserAction, BrowserActionRequest, BrowserActionResult, BrowserConsoleEntry, BrowserFillField, BrowserKeyInput, BrowserSnapshotNode, BrowserTabInfo } from './contracts'
export { BROWSER_IPC } from './ipc'
