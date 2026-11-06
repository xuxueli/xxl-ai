/*
 * 浏览器运行时共享状态：webview 实例、就绪集合、诊断缓存与会话状态访问器。
 *   - 生命周期、动作执行与面板 API 共用同一份模块级资源；
 *   - 非响应式资源（webview / Map）不属于 Pinia，集中在此便于回收与测试。
 * @author xuxueli 2026-10-25
 */

import { useBrowserSessionStore } from '@renderer/stores/browserSession'
import type { BrowserTab } from '@renderer/stores/browserSession'
import type { BrowserConsoleEntry } from '@shared/ipc'

/* Electron <webview> 的最小能力声明（渲染进程无官方类型） */
export interface WebviewElement extends HTMLElement {
  loadURL(url: string): Promise<void>
  getURL(): string
  canGoBack(): boolean
  canGoForward(): boolean
  goBack(): void
  goForward(): void
  reload(): void
  stop(): void
  focus(): void
  openDevTools(): void
  remove(): void
  capturePage(): Promise<{ getSize(): { width: number; height: number }; toDataURL(): string }>
  executeJavaScript(code: string): Promise<unknown>
}

/* ============ 运行时资源（模块级单例） ============ */

/* 标签页 ID → webview 元素 */
export const webviews = new Map<string, WebviewElement>()
/* guest 是否已就绪 */
export const readyTabs = new Set<string>()
/* guest 未就绪时暂存的待导航地址（dom-ready 后再 loadURL） */
export const pendingNav = new Map<string, string>()
/* 控制台告警/错误与加载失败（供 Agent 诊断，按标签页维护） */
export const consoleLogs = new Map<string, BrowserConsoleEntry[]>()
export const failedLoads = new Map<string, string[]>()

/* 浏览器状态 store */
export function browserStore() {
  return useBrowserSessionStore()
}

/* 取某会话的标签状态 */
export function stateOf(sessionId: string) {
  return browserStore().sliceOf(sessionId)
}

/* 当前激活标签页（兜底取首个） */
export function activeTabOf(state: ReturnType<typeof stateOf>): BrowserTab | undefined {
  return state.tabs.find((tab) => tab.id === state.activeId) ?? state.tabs[0]
}

/* 按 id 查找标签页 */
export function findTab(sessionId: string, id: string): BrowserTab | undefined {
  return stateOf(sessionId).tabs.find((tab) => tab.id === id)
}

/* 简单延时 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
