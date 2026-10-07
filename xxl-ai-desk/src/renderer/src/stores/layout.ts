import { defineStore } from 'pinia'
import { ref } from 'vue'

/* 布局状态：左侧会话栏折叠/展开 + 宽度拖拽 */
export const useLayoutStore = defineStore('layout', () => {
  /* 侧栏宽度约束与默认值 */
  const DEFAULT_WIDTH = 292
  const MIN_WIDTH = 220
  const MAX_WIDTH = 560
  const STORAGE_KEY = 'desk-sidebar-width'

  /* 侧栏是否折叠（折叠后宽度收为 0，内容区铺满） */
  const sidebarCollapsed = ref(false)

  /* 侧栏宽度（持久化到 localStorage，下次启动沿用） */
  const stored = Number(localStorage.getItem(STORAGE_KEY))
  const sidebarWidth = ref(
    Number.isFinite(stored) && stored >= MIN_WIDTH && stored <= MAX_WIDTH ? stored : DEFAULT_WIDTH
  )

  /* 切换侧栏折叠状态 */
  function toggleSidebar(): void {
    sidebarCollapsed.value = !sidebarCollapsed.value
  }

  /* 设置侧栏宽度（夹取到合理区间并持久化） */
  function setSidebarWidth(width: number): void {
    const next = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, Math.round(width)))
    sidebarWidth.value = next
    localStorage.setItem(STORAGE_KEY, String(next))
  }

  return {
    sidebarCollapsed,
    sidebarWidth,
    toggleSidebar,
    setSidebarWidth
  }
})
