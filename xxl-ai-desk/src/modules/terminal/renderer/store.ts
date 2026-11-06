/* 终端标签运行时动作：标签列表与当前激活项（不持久化） */

import type { TerminalTabState, ToolPanelState } from '@modules/toolPanel/renderer'

/* 终端动作依赖的会话状态读取函数 */
type StateOf = (key: string) => ToolPanelState

export function createTerminalTabActions(stateOf: StateOf) {
  /* 设置终端标签列表（运行时资源，不持久化） */
  function setTerminalTabs(key: string, tabs: TerminalTabState[]): void {
    const state = stateOf(key)
    state.terminalPanel.tabs = tabs
    if (!tabs.some((tab) => tab.id === state.terminalPanel.activeId)) {
      state.terminalPanel.activeId = tabs[tabs.length - 1]?.id ?? ''
    }
  }

  /* 新增终端标签并激活 */
  function addTerminalTab(key: string, tab: TerminalTabState): void {
    const state = stateOf(key)
    state.terminalPanel.tabs.push(tab)
    state.terminalPanel.activeId = tab.id
  }

  /* 移除终端标签：激活项关闭后回落到最后一个标签 */
  function removeTerminalTab(key: string, id: string): void {
    const state = stateOf(key)
    state.terminalPanel.tabs = state.terminalPanel.tabs.filter((tab) => tab.id !== id)
    if (state.terminalPanel.activeId === id) {
      state.terminalPanel.activeId = state.terminalPanel.tabs[state.terminalPanel.tabs.length - 1]?.id ?? ''
    }
  }

  /* 切换当前终端标签 */
  function setActiveTerminal(key: string, id: string): void {
    stateOf(key).terminalPanel.activeId = id
  }

  return { setTerminalTabs, addTerminalTab, removeTerminalTab, setActiveTerminal }
}
