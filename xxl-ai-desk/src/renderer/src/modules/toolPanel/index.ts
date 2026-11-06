/*
 * toolPanel 模块对外公共 API：供对话页装配工具面板与壳级浏览器宿主。
 * @author xuxueli 2026-10-25
 */

export { default as ToolPanelLayout } from './components/ToolPanelLayout.vue'
export { default as BrowserHost } from './components/hosts/BrowserHost.vue'
export { default as ToolPanelToggle } from './components/ToolPanelToggle.vue'
export { useTerminalTarget } from './composables/useTerminalTarget'
export { cleanupBrowserSessions } from './composables/browserRuntime'
