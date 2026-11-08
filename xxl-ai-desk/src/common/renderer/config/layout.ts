/*
 * 布局尺寸：侧栏与工具面板的默认值与边界（JS 侧唯一来源）
 * @author xuxueli 2026-10-31
 */

/* 布局尺寸常量：与 styles/tokens.scss 中的同名 token 保持一致 */
export const LAYOUT = {
  /* 左侧常驻图标栏宽度（独立于顶栏高度） */
  railWidth: 44,
  /* 左侧子菜单栏宽度（最大宽度由会话区最小宽度动态约束） */
  sidebar: { default: 240, min: 150 },
  /* 右侧工具面板：默认按视口比例、最小宽度与会话区最小宽度 */
  toolPanel: { defaultRatio: 0.5, minWidth: 150, minChatWidth: 400 },
  /* Git 工具：左侧变更树默认宽度 */
  git: { defaultSidebarWidth: 240 },
  /* 文件工具：目录树默认/最小宽度与正文最小宽度 */
  fileTree: { defaultWidth: 240, minWidth: 150, contentMinWidth: 150 },
  /* 笔记应用：左侧笔记树默认/最小宽度 */
  note: {
    treeDefaultWidth: 240,
    treeMinWidth: 150
  }
} as const

/* 左侧子菜单栏最大宽度：为工具面板当前宽度与会话区最小宽度预留 */
export function sidebarWidthMax(viewportWidth: number, toolWidth: number): number {
  return Math.max(
    LAYOUT.sidebar.min,
    viewportWidth - LAYOUT.railWidth - toolWidth - LAYOUT.toolPanel.minChatWidth
  )
}

/* 右侧工具面板最大宽度：保障会话区最小宽度；minWidth 为当前工具所需的最小宽度 */
export function toolPanelWidthMax(
  viewportWidth: number,
  sidebarWidth: number,
  minWidth: number = LAYOUT.toolPanel.minWidth
): number {
  return Math.max(
    minWidth,
    viewportWidth - LAYOUT.railWidth - sidebarWidth - LAYOUT.toolPanel.minChatWidth
  )
}

/* 工具面板最小宽度：文件工具展开目录树时，需同时容纳「树 + 正文」的最小宽度 */
export function toolPanelMinWidth(fileTreeVisible: boolean): number {
  return fileTreeVisible
    ? LAYOUT.fileTree.minWidth + LAYOUT.fileTree.contentMinWidth
    : LAYOUT.toolPanel.minWidth
}
