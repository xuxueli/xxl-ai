import { t } from '../i18n'
import type { ToolCallState } from '../types'

/*
 * 工具调用的展示视图：把底层工具名与原始参数翻译成人话，
 * 让每一步执行都能在时间线上被看懂（做了什么、对谁做）。
 */

/* 工具展示视图 */
export interface ToolView {
  /* 图标组件名（已全局注册） */
  icon: string
  /* 本地化动作标题，如「读取文件」 */
  title: string
  /* 关键参数摘要，如文件路径 / 命令 / 正则 */
  detail: string
}

/* 工具名 → 标题文案 key */
const TOOL_TITLE_KEYS: Record<string, string> = {
  read_file: 'readFile',
  write_file: 'writeFile',
  edit_file: 'editFile',
  list_directory: 'listDir',
  glob_files: 'glob',
  search_files: 'search',
  run_command: 'command',
  get_current_time: 'time'
}

/* 工具名 → 图标组件名 */
const TOOL_ICONS: Record<string, string> = {
  read_file: 'Document',
  write_file: 'DocumentAdd',
  edit_file: 'EditPen',
  list_directory: 'Folder',
  glob_files: 'Search',
  search_files: 'Search',
  run_command: 'Monitor',
  get_current_time: 'Clock'
}

/* 参数摘要过长时截断，避免撑破单行 */
function clip(value: string, max = 72): string {
  return value.length > max ? `${value.slice(0, max)}…` : value
}

/* 从工具参数中提取最能说明意图的关键字段 */
function detailOf(name: string, args: unknown): string {
  if (!args || typeof args !== 'object') {
    return ''
  }
  const record = args as Record<string, unknown>
  const pick = (key: string): string => (typeof record[key] === 'string' ? (record[key] as string) : '')
  switch (name) {
    case 'read_file':
    case 'write_file':
    case 'edit_file':
    case 'list_directory':
      return clip(pick('path'))
    case 'glob_files':
      return clip(pick('pattern'))
    case 'search_files': {
      const pattern = pick('pattern')
      const include = pick('include')
      return clip(include ? `${pattern}  (${include})` : pattern)
    }
    case 'run_command':
      return clip(pick('command'))
    case 'get_current_time':
      return clip(pick('timezone'))
    default:
      return ''
  }
}

/* 生成工具调用的展示视图 */
export function toolView(tool: ToolCallState): ToolView {
  const key = TOOL_TITLE_KEYS[tool.name]
  const title = key ? t(`chat.tool.${key}`) : tool.name || t('chat.tool.generic')
  return {
    icon: TOOL_ICONS[tool.name] ?? 'Tools',
    title,
    detail: detailOf(tool.name, tool.args)
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
