/*
 * 工具调用的展示视图：把底层工具名与原始参数翻译成人话，
 * 让每一步执行都能在时间线上被看懂（做了什么、对谁做）。
 *
 * 单一元数据表同时维护标题、图标与参数摘要，新增内置工具只需在此登记一次。
 *
 * @author xuxueli 2026-10-31
 */

import { t } from '@renderer/shell/i18n'
import type { ToolCallState } from '@modules/chat/renderer/types'

/* 工具展示视图 */
export interface ToolView {
  /* 图标组件名（已全局注册） */
  icon: string
  /* 本地化动作标题，如「读取文件」 */
  title: string
  /* 关键参数摘要，如文件路径 / 命令 / 正则 */
  detail: string
}

/* 工具参数（模型生成的 JSON 对象） */
type ToolArgs = Record<string, unknown>

/* 展示元信息：标题文案 key、图标组件名与参数摘要生成器 */
interface ToolViewMeta {
  titleKey: string
  icon: string
  detail: (args: ToolArgs) => string
}

/* 参数摘要过长时截断，避免撑破单行 */
function clip(value: string, max = 72): string {
  return value.length > max ? `${value.slice(0, max)}…` : value
}

/* 读取字符串参数，非字符串返回空串 */
function pick(args: ToolArgs, key: string): string {
  return typeof args[key] === 'string' ? (args[key] as string) : ''
}

/* 路径类参数摘要：优先取主字段，多个字段用箭头连接 */
function pathDetail(args: ToolArgs, key = 'path'): string {
  return clip(pick(args, key))
}

/* 元素定位摘要：ref 优先，selector 兜底 */
function targetDetail(args: ToolArgs): string {
  return clip(pick(args, 'ref') || pick(args, 'selector'))
}

/* 工具名 → 展示元信息（顺序即维护顺序） */
const TOOL_VIEWS: Record<string, ToolViewMeta> = {
  read_file: { titleKey: 'readFile', icon: 'Document', detail: (args) => pathDetail(args) },
  write_file: { titleKey: 'writeFile', icon: 'DocumentAdd', detail: (args) => pathDetail(args) },
  edit_file: { titleKey: 'editFile', icon: 'EditPen', detail: (args) => pathDetail(args) },
  delete_file: { titleKey: 'deleteFile', icon: 'Delete', detail: (args) => pathDetail(args) },
  move_file: {
    titleKey: 'moveFile',
    icon: 'FolderOpened',
    detail: (args) => {
      const from = pick(args, 'from')
      const to = pick(args, 'to')
      return clip(from && to ? `${from} → ${to}` : from || to)
    }
  },
  list_directory: { titleKey: 'listDir', icon: 'Folder', detail: (args) => pathDetail(args) },
  glob_files: { titleKey: 'glob', icon: 'Search', detail: (args) => clip(pick(args, 'pattern')) },
  search_files: {
    titleKey: 'search',
    icon: 'Search',
    detail: (args) => {
      const pattern = pick(args, 'pattern')
      const include = pick(args, 'include')
      return clip(include ? `${pattern}  (${include})` : pattern)
    }
  },
  run_command: { titleKey: 'command', icon: 'Monitor', detail: (args) => clip(pick(args, 'command')) },
  get_current_time: { titleKey: 'time', icon: 'Clock', detail: (args) => clip(pick(args, 'timezone')) },
  read_skill: {
    titleKey: 'readSkill',
    icon: 'Reading',
    detail: (args) => clip(pick(args, 'name') + (pick(args, 'path') ? ` / ${pick(args, 'path')}` : ''))
  },
  open_browser: {
    titleKey: 'openBrowser',
    icon: 'Link',
    detail: (args) => clip(pick(args, 'url') || pick(args, 'action'))
  },
  read_browser: { titleKey: 'readBrowser', icon: 'View', detail: (args) => clip(pick(args, 'selector')) },
  snapshot_browser: { titleKey: 'snapshotBrowser', icon: 'Document', detail: () => '' },
  click_browser: { titleKey: 'clickBrowser', icon: 'SetUp', detail: targetDetail },
  fill_browser: {
    titleKey: 'fillBrowser',
    icon: 'EditPen',
    detail: (args) => {
      const fields = Array.isArray(args.fields) ? args.fields.length : 0
      return fields > 0 ? t('chat.toolFields', [fields]) : ''
    }
  },
  hover_browser: { titleKey: 'hoverBrowser', icon: 'View', detail: targetDetail },
  press_browser: { titleKey: 'pressBrowser', icon: 'EditPen', detail: (args) => clip(pick(args, 'key')) },
  select_browser: {
    titleKey: 'selectBrowser',
    icon: 'Finished',
    detail: (args) => {
      const target = pick(args, 'ref') || pick(args, 'selector')
      const value = pick(args, 'value')
      return clip(value ? `${target} = ${value}` : target)
    }
  },
  scroll_browser: {
    titleKey: 'scrollBrowser',
    icon: 'ArrowDown',
    detail: (args) => clip(pick(args, 'direction'))
  },
  wait_browser: {
    titleKey: 'waitBrowser',
    icon: 'Clock',
    detail: (args) => clip(pick(args, 'selector') || pick(args, 'text') || pick(args, 'url'))
  },
  screenshot_browser: { titleKey: 'screenshotBrowser', icon: 'Monitor', detail: () => '' },
  inspect_browser: { titleKey: 'inspectBrowser', icon: 'WarningFilled', detail: () => '' },
  browser_tabs: {
    titleKey: 'browserTabs',
    icon: 'FolderOpened',
    detail: (args) => {
      const operation = pick(args, 'operation')
      return clip(operation === 'list' ? 'list' : `${operation} ${pick(args, 'tab_id')}`)
    }
  },
  ask_user: { titleKey: 'askUser', icon: 'ChatDotRound', detail: (args) => clip(pick(args, 'title')) }
}

/* 生成工具调用的展示视图 */
export function toolView(tool: ToolCallState): ToolView {
  const meta = TOOL_VIEWS[tool.name]
  /* MCP 工具：展示「MCP 工具」标题，详情给出原始工具标识 */
  if (!meta && tool.name.startsWith('mcp_')) {
    return {
      icon: 'Connection',
      title: t('chat.tool.mcp'),
      detail: clip(tool.name.slice(4).replace(/_/g, ' / '))
    }
  }
  const args = (tool.args ?? {}) as ToolArgs
  /* 未知工具回退为原始工具名，再回退通用标题 */
  return {
    icon: meta?.icon ?? 'Tools',
    title: meta ? t(`chat.tool.${meta.titleKey}`) : tool.name || t('chat.tool.generic'),
    detail: meta ? meta.detail(args) : ''
  }
}

/* 工具参数 → 格式化的 JSON 文本（展开查看用） */
export function toolArgsText(args: unknown): string {
  if (args === undefined || args === null) {
    return ''
  }
  try {
    return JSON.stringify(args, null, 2)
  } catch {
    return String(args)
  }
}
