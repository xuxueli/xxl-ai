/*
 * browser 模块渲染层公共出口。
 * @author xuxueli 2026-11-07
 */

export { default as BrowserPanel } from './components/browser/BrowserPanel.vue'
export { default as BrowserAgentOverlay } from './components/browser/BrowserAgentOverlay.vue'
export {
  cancelBrowserActions,
  cleanupBrowserSessions,
  executeBrowserAction,
  openBrowserRequest
} from './composables/browserRuntime'
export { pinWarmSession, setSessionHost, warmSessions } from './composables/browserSessionHost'
export { createBrowserTab, useBrowserSessionStore } from './store'
export type { BrowserTab } from './store'
