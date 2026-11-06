/*
 * 左右面板宽度约束：统一侧栏与工具面板的最大宽度、夹取与拖拽写入
 * @author xuxueli 2026-10-31
 */
import { computed } from 'vue'
import { useLayoutStore } from '@renderer/shell/stores/layout'
import { useToolPanelStore } from '@modules/toolPanel/renderer'
import { LAYOUT, sidebarWidthMax, toolPanelMinWidth, toolPanelWidthMax } from '@common/renderer/config/layout'
import { useViewportWidth } from '@renderer/shell/layout/composables/useViewportWidth'

/* 按会话返回面板状态与宽度约束 */
export function usePanelWidths(sessionId: () => string) {
  const layout = useLayoutStore()
  const toolPanelStore = useToolPanelStore()
  const viewportWidth = useViewportWidth()

  /* 当前会话工具面板状态 */
  const panel = computed(() => toolPanelStore.sliceOf(sessionId()).panel)
  const focused = computed(() => panel.value.mode === 'focus')
  /* 工具面板是否 dock：决定侧栏是否为它预留会话区宽度 */
  const toolDocked = computed(() => panel.value.visible && !focused.value)

  /* 工具面板期望宽度：宽度为 0 表示按视口比例取默认值（50%） */
  const desiredToolWidth = computed(() =>
    panel.value.width > 0
      ? panel.value.width
      : Math.round(viewportWidth.value * LAYOUT.toolPanel.defaultRatio)
  )

  /* 左侧栏有效宽度（不含图标栏；折叠时为 0），作为工具面板上限的计算依据 */
  const effectiveSidebarWidth = computed(() =>
    layout.sidebarCollapsed ? 0 : Math.max(LAYOUT.sidebar.min, layout.sidebarWidth)
  )

  /* 工具面板最小宽度：文件工具展开目录树时，需同时容纳「树 150 + 正文 150」 */
  const toolMinWidth = computed(() => {
    const state = toolPanelStore.sliceOf(sessionId())
    return toolPanelMinWidth(
      state.panel.activeTab === 'files' && !state.fileExplorer.treeCollapsed
    )
  })

  /* 工具面板最大宽度与实际宽度：始终为会话区保留最小宽度 */
  const maxToolWidth = computed(() =>
    toolPanelWidthMax(viewportWidth.value, effectiveSidebarWidth.value, toolMinWidth.value)
  )
  const toolWidth = computed({
    get: () =>
      Math.min(
        maxToolWidth.value,
        Math.max(toolMinWidth.value, desiredToolWidth.value)
      ),
    set: (value: number) =>
      toolPanelStore.setPanelWidth(
        sessionId(),
        Math.min(maxToolWidth.value, Math.max(toolMinWidth.value, value))
      )
  })

  /* 左侧栏最大宽度：为工具面板当前实际宽度与会话区最小宽度预留 */
  const maxSidebarWidth = computed(() =>
    sidebarWidthMax(viewportWidth.value, toolDocked.value ? toolWidth.value : 0)
  )
  const sidebarWidth = computed({
    get: () =>
      Math.min(maxSidebarWidth.value, Math.max(LAYOUT.sidebar.min, layout.sidebarWidth)),
    set: (value: number) =>
      layout.setSidebarWidth(
        Math.min(maxSidebarWidth.value, Math.max(LAYOUT.sidebar.min, value))
      )
  })

  /* 双击复位 */
  function resetSidebarWidth(): void {
    sidebarWidth.value = LAYOUT.sidebar.default
  }
  function resetPanelWidth(): void {
    /* 复位为「跟随视口 50%」的自动宽度，窗口变化时仍保持比例 */
    toolPanelStore.resetPanelWidth(sessionId())
  }

  return {
    panel,
    focused,
    sidebarWidth,
    toolWidth,
    resetSidebarWidth,
    resetPanelWidth
  }
}
