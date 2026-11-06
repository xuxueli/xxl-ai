/* 工具面板布局动作：显隐、宽度、当前 Tab 与布局模式 */

import { LAYOUT } from '@common/renderer/config/layout'
import { type ToolPanelState, type ToolPanelTab } from '@modules/toolPanel/renderer/store/state'

/* 布局动作依赖的会话状态读取函数 */
type StateOf = (key: string) => ToolPanelState

export function createPanelActions(stateOf: StateOf) {
  /* 设置工具面板显隐 */
  function setPanelVisible(key: string, visible: boolean): void {
    stateOf(key).panel.visible = visible
  }

  /* 切换工具面板显隐 */
  function togglePanel(key: string): void {
    const state = stateOf(key)
    state.panel.visible = !state.panel.visible
  }

  /* 打开工具面板并定位到指定 Tab */
  function openTab(key: string, tab: ToolPanelTab): void {
    const state = stateOf(key)
    state.panel.activeTab = tab
    state.panel.visible = true
  }

  /* 仅切换当前 Tab，不改变面板显隐（如开发者模式关闭后的回退） */
  function setTab(key: string, tab: ToolPanelTab): void {
    stateOf(key).panel.activeTab = tab
  }

  /* 设置工具面板宽度（保存期望宽度，实际显示上限由布局组件按会话区宽度约束） */
  function setPanelWidth(key: string, width: number): void {
    stateOf(key).panel.width = Math.max(LAYOUT.toolPanel.minWidth, Math.round(width))
  }

  /* 恢复工具面板默认宽度：0 表示按视口比例自动（50%），窗口变化时保持比例 */
  function resetPanelWidth(key: string): void {
    stateOf(key).panel.width = 0
  }

  /* 在 dock / focus 之间切换工具面板布局模式 */
  function togglePanelFocus(key: string): void {
    const state = stateOf(key)
    state.panel.mode = state.panel.mode === 'focus' ? 'dock' : 'focus'
  }

  /* 打开终端（工具面板切到终端 Tab） */
  function openTerminal(key: string): void {
    openTab(key, 'terminal')
  }

  return {
    setPanelVisible,
    togglePanel,
    openTab,
    setTab,
    setPanelWidth,
    resetPanelWidth,
    togglePanelFocus,
    openTerminal
  }
}
