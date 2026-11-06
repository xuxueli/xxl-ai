/* 工具面板布局动作：显隐、尺寸、当前工具与布局模式 */

import { LAYOUT } from '@renderer/config/layout'
import {
  type ToolPanelMode,
  type WorkspaceState,
  type WorkspaceTool
} from './state'

/* 布局动作依赖的会话状态读取函数 */
type StateOf = (key: string) => WorkspaceState

export function createPanelActions(stateOf: StateOf) {
  /* 设置工具面板显隐 */
  function setToolVisible(key: string, visible: boolean): void {
    stateOf(key).toolPanel.visible = visible
  }

  /* 切换工具面板显隐 */
  function toggleTool(key: string): void {
    const state = stateOf(key)
    state.toolPanel.visible = !state.toolPanel.visible
  }

  /* 打开工具面板并定位到指定工具 */
  function openTool(key: string, tool: WorkspaceTool): void {
    const state = stateOf(key)
    state.toolPanel.activeTool = tool
    state.toolPanel.visible = true
  }

  /* 仅切换当前工具，不改变面板显隐（如开发者模式关闭后的回退） */
  function setTool(key: string, tool: WorkspaceTool): void {
    stateOf(key).toolPanel.activeTool = tool
  }

  /* 设置工具面板宽度（保存期望宽度，实际显示上限由布局组件按会话区宽度约束） */
  function setToolWidth(key: string, width: number): void {
    stateOf(key).toolPanel.width = Math.max(LAYOUT.toolPanel.minWidth, Math.round(width))
  }

  /* 恢复工具面板默认宽度：0 表示按视口比例自动（50%），窗口变化时保持比例 */
  function resetToolWidth(key: string): void {
    stateOf(key).toolPanel.width = 0
  }

  /* 设置工具面板布局模式 */
  function setToolMode(key: string, mode: ToolPanelMode): void {
    stateOf(key).toolPanel.mode = mode
  }

  /* 在 dock / focus 之间切换工具面板布局模式 */
  function toggleToolFocus(key: string): void {
    const state = stateOf(key)
    state.toolPanel.mode = state.toolPanel.mode === 'focus' ? 'dock' : 'focus'
  }

  /* 打开终端（工具面板切到终端 Tab） */
  function openTerminal(key: string): void {
    openTool(key, 'terminal')
  }

  return {
    setToolVisible,
    toggleTool,
    openTool,
    setTool,
    setToolWidth,
    resetToolWidth,
    setToolMode,
    toggleToolFocus,
    openTerminal
  }
}
