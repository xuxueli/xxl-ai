/*
 * 布局尺寸：侧栏与工具面板的默认值与边界（JS 侧唯一来源）
 * @author xuxueli 2026-10-31
 */

/* 布局尺寸常量：与 styles/tokens.scss 中的同名 token 保持一致 */
export const LAYOUT = {
  /* 左侧常驻图标栏宽度（独立于顶栏高度） */
  railWidth: 44,
  /* 左侧子菜单栏宽度 */
  sidebar: { default: 240, min: 100 },
  /* 右侧工具面板宽度 / 正文最小可用宽度 */
  toolPanel: { defaultWidth: 520, minWidth: 40, minChatWidth: 300 },
  /* Git 工具：左侧变更树默认宽度 */
  git: { defaultSidebarWidth: 240 },
  /* 文件工具：目录树默认占比与默认宽度区间 / 拖拽占比上下限 */
  fileTree: {
    defaultRatio: 0.45,
    defaultMinWidth: 180,
    defaultMaxWidth: 300,
    minRatio: 0.1,
    maxRatio: 0.9
  }
} as const

/* 左侧子菜单栏最大宽度：为工具面板最小宽度与会话区最小宽度预留 */
export function sidebarWidthMax(viewportWidth: number, toolDocked: boolean): number {
  const reserved = toolDocked ? LAYOUT.toolPanel.minWidth : 0
  return Math.max(
    LAYOUT.sidebar.min,
    viewportWidth - LAYOUT.railWidth - reserved - LAYOUT.toolPanel.minChatWidth
  )
}

/* 右侧工具面板最大宽度：保障会话区最小宽度 */
export function toolPanelWidthMax(viewportWidth: number, sidebarWidth: number): number {
  return Math.max(
    LAYOUT.toolPanel.minWidth,
    viewportWidth - LAYOUT.railWidth - sidebarWidth - LAYOUT.toolPanel.minChatWidth
  )
}
