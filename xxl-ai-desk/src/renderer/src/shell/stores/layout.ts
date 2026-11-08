/* 应用外壳布局状态：左侧栏折叠与宽度（会话内工具 / 终端状态见 toolPanel store） */

import { defineStore } from 'pinia'
import { ref } from 'vue'
import { createPersistedWidth } from '@renderer/shell/layout/utils/persistedWidth'
import { LAYOUT } from '@common/renderer/config/layout'

/* 侧栏折叠过渡时长（与 Sidebar 样式保持一致） */
const ANIMATE_DURATION = 220

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

  /* 是否播放折叠过渡：仅手动点击当前板块图标时开启，切换板块一律直接跳变 */
  const sidebarAnimated = ref(false)
  let animateTimer: ReturnType<typeof setTimeout> | null = null

  /* 停止折叠过渡 */
  function stopSidebarAnimation(): void {
    sidebarAnimated.value = false
    if (animateTimer) {
      clearTimeout(animateTimer)
      animateTimer = null
    }
  }

  /* 切换侧栏折叠状态：重复点击当前板块图标时展示 / 折叠 */
  function toggleSidebar(): void {
    sidebarAnimated.value = true
    sidebarCollapsed.value = !sidebarCollapsed.value
    if (animateTimer) {
      clearTimeout(animateTimer)
    }
    animateTimer = setTimeout(() => {
      animateTimer = null
      sidebarAnimated.value = false
    }, ANIMATE_DURATION)
  }

  /* 展开侧栏：图标栏切换入口时还原完整子菜单栏，直接展开不播放动画 */
  function expandSidebar(): void {
    stopSidebarAnimation()
    sidebarCollapsed.value = false
  }

  return {
    sidebarCollapsed,
    sidebarAnimated,
    sidebarWidth: sidebar.width,
    setSidebarWidth: sidebar.setWidth,
    toggleSidebar,
    expandSidebar
  }
})
