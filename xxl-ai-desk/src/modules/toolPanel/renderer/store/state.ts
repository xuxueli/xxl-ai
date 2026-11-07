/* 会话工具面板状态结构：类型、默认值、持久化归一化与尺寸边界 */

import { LAYOUT } from '@common/renderer/config/layout'

/* 新建对话草稿态使用的固定会话 key（首次发送创建会话后迁移给真实会话） */
export const DRAFT_SESSION_KEY = '__draft__'

/* 会话键：真实会话主键转字符串；草稿态使用固定 key（本地存储、终端、浏览器按字符串键隔离） */
export function sessionKeyOf(sessionId: number | null | undefined): string {
  return sessionId ? String(sessionId) : DRAFT_SESSION_KEY
}

/* 持久化键前缀与结构版本 */
export const STORAGE_PREFIX = 'desk:toolPanel:'
export const STORAGE_VERSION = 1

/* 工具面板当前 Tab */
export type ToolPanelTab = 'files' | 'browser' | 'terminal' | 'git' | 'diagnostics'

/* 工具面板布局模式：dock = 与正文并排，focus = 占满正文 */
export type ToolPanelMode = 'dock' | 'focus'

/* 终端标签（运行时状态：id 与主进程 PTY 对应，切换会话时保留，重启后不持久化） */
export interface TerminalTabState {
  /* 终端实例 ID */
  id: string
  /* 标签标题（目录名） */
  title: string
}

/* 工具面板布局状态 */
export interface ToolPanelLayoutState {
  /* 是否展示 */
  visible: boolean
  /* 当前 Tab */
  activeTab: ToolPanelTab
  /* 面板宽度 */
  width: number
  /* 布局模式 */
  mode: ToolPanelMode
}

/* 终端标签运行时状态（终端作为工具面板的一个 Tab） */
export interface TerminalPanelState {
  /* 终端标签（运行时，不持久化） */
  tabs: TerminalTabState[]
  /* 当前激活标签（运行时，不持久化） */
  activeId: string
}

/* 文件面板 UI 状态 */
export interface FileExplorerState {
  /* 选中文件路径 */
  selectedPath: string
  /* 是否预览 */
  preview: boolean
  /* 文件树过滤关键字 */
  keyword: string
  /* 目录展开态 */
  expanded: Record<string, boolean>
  /* 目录树宽度（px，展示时按最小 150px、正文最小 150px 动态约束） */
  treeWidth: number
  /* 是否收起文件树区域（仅展示文件内容） */
  treeCollapsed: boolean
}

/* 单个会话的工具面板状态（仅存 UI 状态，不含 PTY / webview 运行时） */
export interface ToolPanelState {
  panel: ToolPanelLayoutState
  terminalPanel: TerminalPanelState
  fileExplorer: FileExplorerState
  /* Git 工具左侧变更树宽度 */
  gitSidebarWidth: number
  /* 最近更新时间 */
  updateTime: number
  /* 持久化结构版本 */
  version: number
}

/* 创建默认工具面板状态 */
export function createState(): ToolPanelState {
  return {
    panel: {
      visible: false,
      activeTab: 'files',
      /* 0 表示自动：按视口 50% 计算，窗口变化时保持比例 */
      width: 0,
      mode: 'dock'
    },
    terminalPanel: {
      tabs: [],
      activeId: ''
    },
    fileExplorer: {
      selectedPath: '',
      preview: false,
      keyword: '',
      expanded: {},
      treeWidth: LAYOUT.fileTree.defaultWidth,
      treeCollapsed: false
    },
    gitSidebarWidth: LAYOUT.git.defaultSidebarWidth,
    updateTime: Date.now(),
    version: STORAGE_VERSION
  }
}

/* 读取布尔值（非法时回落默认值） */
function boolOf(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

/* 读取字符串（非法时回落默认值） */
function stringOf(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback
}

/* 解析目录展开态（非法时回落空对象） */
function expandedOf(value: unknown): Record<string, boolean> {
  return value && typeof value === 'object' ? (value as Record<string, boolean>) : {}
}

/* 解析当前 Tab：非法值回落到文件 */
function activeTabOf(value: unknown): ToolPanelTab {
  return value === 'browser' || value === 'terminal' || value === 'git' || value === 'diagnostics'
    ? value
    : 'files'
}

/* 默认目录树宽度：固定像素值（展示时按文件区宽度与正文最小宽度动态夹取） */
export function defaultTreeWidth(): number {
  return LAYOUT.fileTree.defaultWidth
}

/* 解析目录树宽度：非法时回落默认值 */
function treeWidthOf(value: unknown): number {
  const width = Number((value as { treeWidth?: unknown } | undefined)?.treeWidth)
  return Number.isFinite(width) && width > 0 ? Math.round(width) : defaultTreeWidth()
}

/* 解析工具面板宽度：0 表示自动比例，正数按最小宽度兜底 */
function toolWidthOf(value: unknown): number {
  const width = Number((value as { width?: unknown } | undefined)?.width)
  return Number.isFinite(width) && width > 0
    ? Math.max(LAYOUT.toolPanel.minWidth, Math.round(width))
    : 0
}

/* 归一化持久化数据：结构非法时逐字段回落默认值 */
export function normalizeState(raw: unknown): ToolPanelState {
  const parsed = raw as Partial<ToolPanelState>
  const base = createState()
  return {
    panel: {
      visible: boolOf(parsed.panel?.visible, base.panel.visible),
      activeTab: activeTabOf(parsed.panel?.activeTab),
      width: toolWidthOf(parsed.panel),
      mode: parsed.panel?.mode === 'focus' ? 'focus' : 'dock'
    },
    terminalPanel: {
      /* 终端标签属于运行时资源：重启后不恢复，首次展示时按会话重新创建 */
      tabs: [],
      activeId: ''
    },
    fileExplorer: {
      selectedPath: stringOf(parsed.fileExplorer?.selectedPath, ''),
      preview: boolOf(parsed.fileExplorer?.preview, false),
      keyword: stringOf(parsed.fileExplorer?.keyword, ''),
      expanded: expandedOf(parsed.fileExplorer?.expanded),
      treeWidth: treeWidthOf(parsed.fileExplorer),
      treeCollapsed: boolOf(parsed.fileExplorer?.treeCollapsed, false)
    },
    gitSidebarWidth: Math.max(
      0,
      Math.round(Number(parsed.gitSidebarWidth) || base.gitSidebarWidth)
    ),
    updateTime: Number(parsed.updateTime) || Date.now(),
    version: STORAGE_VERSION
  }
}
