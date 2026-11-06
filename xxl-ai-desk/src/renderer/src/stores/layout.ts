/* 应用外壳布局状态：左侧栏折叠与宽度（会话内工具 / 终端状态见 toolPanel store） */

import { defineStore } from 'pinia'
import { ref } from 'vue'
import { createPersistedWidth } from '@renderer/layout/utils/persistedWidth'
import { LAYOUT } from '@renderer/config/layout'

export const useLayoutStore = defineStore('layout', () => {
  /* 左侧子菜单栏宽度：三板块共用（拖拽调整、持久化、双击复位） */
  const sidebar = createPersistedWidth('desk-panel-width', {
    default: LAYOUT.sidebar.default,
    min: LAYOUT.sidebar.min,
    /* 存储不限业务上限，实际拖拽上限由组件按窗口与会话区宽度计算 */
    max: () => Math.max(LAYOUT.sidebar.min, window.innerWidth)
  })

  /* 左侧栏是否折叠（折叠后仅保留图标栏，内容区铺满） */
  const sidebarCollapsed = ref(false)

  /* 切换侧栏折叠状态 */
  function toggleSidebar(): void {
    sidebarCollapsed.value = !sidebarCollapsed.value
  }

  /* 展开侧栏（图标栏点击入口时还原完整子菜单栏） */
  function expandSidebar(): void {
    sidebarCollapsed.value = false
  }

  return {
    sidebarCollapsed,
    sidebarWidth: sidebar.width,
    setSidebarWidth: sidebar.setWidth,
    toggleSidebar,
    expandSidebar
  }
})
