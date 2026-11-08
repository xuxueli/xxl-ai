/*
 * chat 模块对外公共 API：仅供布局域（Layout / Navbar）复用，
 * 模块内部页面/组件仍通过相对路径引用，避免外部直接依赖内部文件。
 * @author xuxueli 2026-10-25
 */

export { useChatStore } from './store'
export { useChatUiStore } from './store/ui'
export { default as ChatSearchAction } from '@modules/chat/renderer/components/ChatSearchAction.vue'
export { default as ChatSidebarPanel } from '@modules/chat/renderer/components/ChatSidebarPanel.vue'
export { default as ChatCommandPalette } from '@modules/chat/renderer/components/CommandPalette.vue'
export { useCommandPalette } from '@modules/chat/renderer/composables/useCommandPalette'
