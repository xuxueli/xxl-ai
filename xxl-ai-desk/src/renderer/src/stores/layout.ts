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

  /* 底部终端面板是否展示（默认隐藏） */
  const terminalVisible = ref(false)

  /* 右侧侧栏（侧边任务）是否展示（默认隐藏） */
  const rightPanelVisible = ref(false)

  /* 右侧侧栏当前工具：'' 表示未选择（展示工具菜单），files/browser 为具体面板 */
  const rightPanelTool = ref<'' | 'files' | 'browser'>('')

  /* 右侧侧栏是否放大占满正文区 */
  const rightPanelMaximized = ref(false)

  /* 各工具的默认面板宽度（首次打开时套用，之后沿用用户拖拽宽度） */
  const RIGHT_PANEL_TOOL_WIDTH: Record<'files' | 'browser', number> = {
    files: 560,
    browser: 480
  }

  /* 侧栏宽度（持久化到 localStorage，下次启动沿用） */
  const stored = Number(localStorage.getItem(STORAGE_KEY))
  const sidebarWidth = ref(
    Number.isFinite(stored) && stored >= MIN_WIDTH && stored <= MAX_WIDTH ? stored : DEFAULT_WIDTH
  )

  /* 右侧侧栏（侧边任务）宽度约束与默认值 */
  const RIGHT_PANEL_DEFAULT_WIDTH = 320
  const RIGHT_PANEL_MIN_WIDTH = 240
  const RIGHT_PANEL_MAX_WIDTH = 720
  const RIGHT_PANEL_STORAGE_KEY = 'desk-right-panel-width'

  /* 右侧侧栏宽度（持久化到 localStorage，下次启动沿用） */
  const storedRight = Number(localStorage.getItem(RIGHT_PANEL_STORAGE_KEY))
  const rightPanelWidth = ref(
    Number.isFinite(storedRight) &&
      storedRight >= RIGHT_PANEL_MIN_WIDTH &&
      storedRight <= RIGHT_PANEL_MAX_WIDTH
      ? storedRight
      : RIGHT_PANEL_DEFAULT_WIDTH
  )

  /* 切换侧栏折叠状态 */
  function toggleSidebar(): void {
    sidebarCollapsed.value = !sidebarCollapsed.value
  }

  /* 切换底部终端面板显隐 */
  function toggleTerminal(): void {
    terminalVisible.value = !terminalVisible.value
  }

  /* 打开底部终端面板（已打开则保持） */
  function openTerminal(): void {
    terminalVisible.value = true
  }

  /* 切换右侧侧栏显隐（保留放大态，重新打开时维持全屏） */
  function toggleRightPanel(): void {
    rightPanelVisible.value = !rightPanelVisible.value
  }

  /* 打开右侧侧栏并定位到指定工具（宽度不足时套用该工具默认宽度） */
  function openRightPanelTool(tool: 'files' | 'browser'): void {
    const defaultWidth = RIGHT_PANEL_TOOL_WIDTH[tool]
    if (!rightPanelVisible.value || rightPanelWidth.value < defaultWidth) {
      setRightPanelWidth(defaultWidth)
    }
    rightPanelTool.value = tool
    rightPanelVisible.value = true
  }

  /* 切换右侧侧栏放大态（放大后占满正文区） */
  function toggleRightPanelMaximized(): void {
    rightPanelMaximized.value = !rightPanelMaximized.value
  }

  /* 设置侧栏宽度（夹取到合理区间并持久化） */
  function setSidebarWidth(width: number): void {
    const next = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, Math.round(width)))
    sidebarWidth.value = next
    localStorage.setItem(STORAGE_KEY, String(next))
  }

  /* 设置右侧侧栏宽度（夹取到合理区间并持久化） */
  function setRightPanelWidth(width: number): void {
    const next = Math.min(RIGHT_PANEL_MAX_WIDTH, Math.max(RIGHT_PANEL_MIN_WIDTH, Math.round(width)))
    rightPanelWidth.value = next
    localStorage.setItem(RIGHT_PANEL_STORAGE_KEY, String(next))
  }

  return {
    sidebarCollapsed,
    sidebarWidth,
    terminalVisible,
    rightPanelVisible,
    rightPanelTool,
    rightPanelMaximized,
    rightPanelWidth,
    toggleSidebar,
    toggleTerminal,
    openTerminal,
    toggleRightPanel,
    openRightPanelTool,
    toggleRightPanelMaximized,
    setSidebarWidth,
    setRightPanelWidth
  }
})
