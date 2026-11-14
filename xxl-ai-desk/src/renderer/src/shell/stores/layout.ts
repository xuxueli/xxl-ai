/* 应用外壳布局状态：左侧会话栏折叠与会话列表宽度（会话内工具 / 终端状态见 toolPanel store） */

import { defineStore } from 'pinia'
import { ref } from 'vue'
import { createPersistedWidth } from '@renderer/shell/layout/utils/persistedWidth'
import { LAYOUT } from '@common/renderer/config/layout'

/* 会话列表折叠状态存储键 */
const CHAT_SIDEBAR_COLLAPSED_KEY = 'desk-chat-sidebar-collapsed'

export const useLayoutStore = defineStore('layout', () => {
  /* 左侧子菜单栏宽度：三板块共用（拖拽调整、持久化、双击复位） */
  const sidebar = createPersistedWidth('desk-panel-width', {
    default: LAYOUT.sidebar.default,
    min: LAYOUT.sidebar.min,
    /* 存储不限业务上限，实际拖拽上限由组件按窗口与会话区宽度计算 */
    max: () => Math.max(LAYOUT.sidebar.min, window.innerWidth)
  })

  /* 会话列表是否折叠（仅首页生效，其他板块子菜单固定展示） */
  const chatSidebarCollapsed = ref(localStorage.getItem(CHAT_SIDEBAR_COLLAPSED_KEY) === '1')

  /* 切换会话列表折叠状态 */
  function toggleChatSidebar(): void {
    chatSidebarCollapsed.value = !chatSidebarCollapsed.value
    try {
      localStorage.setItem(CHAT_SIDEBAR_COLLAPSED_KEY, chatSidebarCollapsed.value ? '1' : '0')
    } catch {
      /* 本地存储不可用时忽略（仅影响恢复） */
    }
  }

  return {
    sidebarWidth: sidebar.width,
    setSidebarWidth: sidebar.setWidth,
    chatSidebarCollapsed,
    toggleChatSidebar
  }
})
