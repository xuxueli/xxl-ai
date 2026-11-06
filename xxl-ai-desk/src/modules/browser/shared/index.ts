/*
 * browser 模块跨进程公共契约出口。
 * @author xuxueli 2026-11-07
 */

export type { BrowserApi } from './api'
export type { BrowserAction, BrowserActionRequest, BrowserActionResult, BrowserConsoleEntry, BrowserFillField, BrowserSnapshotNode, BrowserTabInfo } from './contracts'
export { BROWSER_IPC } from './ipc'
