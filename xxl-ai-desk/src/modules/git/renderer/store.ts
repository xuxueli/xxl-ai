/* Git 工具 UI 动作：左侧变更树宽度 */

import { LAYOUT } from '@common/renderer/config/layout'
import type { ToolPanelState } from '@modules/toolPanel/renderer'

/* Git 动作依赖的会话状态读取函数 */
type StateOf = (key: string) => ToolPanelState

export function createGitPanelActions(stateOf: StateOf) {
  /* 设置变更树宽度（px，展示时由组件按 10% - 90% 夹取） */
  function setGitSidebarWidth(key: string, width: number): void {
    stateOf(key).gitSidebarWidth = Math.max(0, Math.round(width))
  }

  /* 恢复默认宽度 */
  function resetGitSidebarWidth(key: string): void {
    stateOf(key).gitSidebarWidth = LAYOUT.git.defaultSidebarWidth
  }

  return { setGitSidebarWidth, resetGitSidebarWidth }
}
