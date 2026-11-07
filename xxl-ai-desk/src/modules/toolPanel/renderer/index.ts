/*
 * toolPanel 模块对外公共 API：供对话页装配工具面板与壳级浏览器宿主。
 * @author xuxueli 2026-10-25
 */

export { DRAFT_SESSION_KEY, sessionKeyOf, useToolPanelStore } from './store'
export type { ToolPanelTab } from './store'
export { defaultTreeWidth } from './store/state'
export type { TerminalTabState, ToolPanelState } from './store/state'
export { default as ToolPanelLayout } from '@modules/toolPanel/renderer/components/ToolPanelLayout.vue'
export { default as ToolPanelToggle } from '@modules/toolPanel/renderer/components/ToolPanelToggle.vue'
export { default as BrowserHost } from '@modules/toolPanel/renderer/components/hosts/BrowserHost.vue'
