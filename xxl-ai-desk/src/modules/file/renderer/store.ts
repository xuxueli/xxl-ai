/* 文件面板 UI 动作：选中文件、预览、过滤与目录展开态 */

import { defaultTreeWidth, type ToolPanelState } from '@modules/toolPanel/renderer'

/* 文件动作依赖的会话状态读取函数 */
type StateOf = (key: string) => ToolPanelState

export function createFileExplorerActions(stateOf: StateOf) {
  /* 设置选中文件路径 */
  function setSelectedPath(key: string, path: string): void {
    stateOf(key).fileExplorer.selectedPath = path
  }

  /* 设置预览态 */
  function setPreview(key: string, preview: boolean): void {
    stateOf(key).fileExplorer.preview = preview
  }

  /* 设置文件树过滤关键字 */
  function setKeyword(key: string, keyword: string): void {
    stateOf(key).fileExplorer.keyword = keyword
  }

  /* 设置目录展开态 */
  function setExpanded(key: string, expanded: Record<string, boolean>): void {
    stateOf(key).fileExplorer.expanded = expanded
  }

  /* 设置目录树宽度（展示时按文件区宽度与正文最小宽度动态约束） */
  function setTreeWidth(key: string, width: number): void {
    stateOf(key).fileExplorer.treeWidth = Math.max(0, Math.round(width))
  }

  /* 恢复目录树默认宽度：固定 240px，展示时按可用宽度夹取 */
  function resetTreeWidth(key: string): void {
    stateOf(key).fileExplorer.treeWidth = defaultTreeWidth()
  }

  /* 切换文件树区域收起 / 展开 */
  function toggleTreeCollapsed(key: string): void {
    const state = stateOf(key)
    state.fileExplorer.treeCollapsed = !state.fileExplorer.treeCollapsed
  }

  return {
    setSelectedPath,
    setPreview,
    setKeyword,
    setExpanded,
    setTreeWidth,
    resetTreeWidth,
    toggleTreeCollapsed
  }
}
