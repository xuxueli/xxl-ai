import { defineStore } from 'pinia'
import { ref } from 'vue'

/* 布局状态：左侧会话栏折叠/展开 */
export const useLayoutStore = defineStore('layout', () => {
  /* 侧栏是否折叠（折叠后宽度收为 0，内容区铺满） */
  const sidebarCollapsed = ref(false)

  /* 切换侧栏折叠状态 */
  function toggleSidebar(): void {
    sidebarCollapsed.value = !sidebarCollapsed.value
  }

  return {
    sidebarCollapsed,
    toggleSidebar
  }
})
