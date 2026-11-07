/*
 * 内置工具目录（扩展中心内静态目录）：
 *   - 描述内置工具的名称、分类、权限与适用模式，供「扩展中心 → 内置工具」页面只读展示；
 *   - 工具名必须与 agent/worker/tools 下的内置工具保持一致；
 *   - 是否启用由 Agent 配置决定，本目录只描述能力。
 * @author xuxueli 2026-10-25
 */

import type { ChatMode } from '@modules/chat/shared'

/* 内置工具分类：fs 文件 / shell 终端 / browser 浏览器（可开关）/ general 通用（可开关）/ interaction 人机交互（可开关） */
export type BuiltinToolCategoryKey = 'fs' | 'shell' | 'browser' | 'general' | 'interaction'

/* 工具目录项 */
export interface BuiltinToolCatalogItem {
  /* 工具名（与内置工具注册表一致） */
  name: string
  /* 所属分类 */
  category: BuiltinToolCategoryKey
  /* 工具名称文案 key */
  titleKey: string
  /* 工具说明文案 key */
  descriptionKey: string
  /* 是否只读工具 */
  readOnly: boolean
  /* 允许出现的对话模式 */
  modes: ChatMode[]
}

/* 分类定义 */
export interface BuiltinToolCategory {
  /* 分类标识 */
  key: BuiltinToolCategoryKey
  /* 分类标题文案 key */
  titleKey: string
  /* 分类说明文案 key */
  descriptionKey: string
}

/* 内置工具分类列表（展示顺序即渲染顺序） */
export const BUILTIN_TOOL_CATEGORIES: BuiltinToolCategory[] = [
  {
    key: 'fs',
    titleKey: 'plugin.builtinTool.category.fs',
    descriptionKey: 'plugin.builtinTool.categoryDesc.fs'
  },
  {
    key: 'shell',
    titleKey: 'plugin.builtinTool.category.shell',
    descriptionKey: 'plugin.builtinTool.categoryDesc.shell'
  },
  {
    key: 'browser',
    titleKey: 'plugin.builtinTool.category.browser',
    descriptionKey: 'plugin.builtinTool.categoryDesc.browser'
  },
  {
    key: 'general',
    titleKey: 'plugin.builtinTool.category.general',
    descriptionKey: 'plugin.builtinTool.categoryDesc.general'
  },
  {
    key: 'interaction',
    titleKey: 'plugin.builtinTool.category.interaction',
    descriptionKey: 'plugin.builtinTool.categoryDesc.interaction'
  }
]

const ALL_MODES: ChatMode[] = ['plan', 'build']
const BUILD_ONLY: ChatMode[] = ['build']

/* 内置工具目录（顺序即页面展示顺序） */
export const BUILTIN_TOOL_CATALOG: BuiltinToolCatalogItem[] = [
  {
    name: 'read_file',
    category: 'fs',
    titleKey: 'chat.tool.readFile',
    descriptionKey: 'plugin.builtinTool.desc.readFile',
    readOnly: true,
    modes: ALL_MODES
  },
  {
    name: 'list_directory',
    category: 'fs',
    titleKey: 'chat.tool.listDir',
    descriptionKey: 'plugin.builtinTool.desc.listDir',
    readOnly: true,
    modes: ALL_MODES
  },
  {
    name: 'glob_files',
    category: 'fs',
    titleKey: 'chat.tool.glob',
    descriptionKey: 'plugin.builtinTool.desc.glob',
    readOnly: true,
    modes: ALL_MODES
  },
  {
    name: 'search_files',
    category: 'fs',
    titleKey: 'chat.tool.search',
    descriptionKey: 'plugin.builtinTool.desc.search',
    readOnly: true,
    modes: ALL_MODES
  },
  {
    name: 'write_file',
    category: 'fs',
    titleKey: 'chat.tool.writeFile',
    descriptionKey: 'plugin.builtinTool.desc.writeFile',
    readOnly: false,
    modes: BUILD_ONLY
  },
  {
    name: 'edit_file',
    category: 'fs',
    titleKey: 'chat.tool.editFile',
    descriptionKey: 'plugin.builtinTool.desc.editFile',
    readOnly: false,
    modes: BUILD_ONLY
  },
  {
    name: 'delete_file',
    category: 'fs',
    titleKey: 'chat.tool.deleteFile',
    descriptionKey: 'plugin.builtinTool.desc.deleteFile',
    readOnly: false,
    modes: BUILD_ONLY
  },
  {
    name: 'move_file',
    category: 'fs',
    titleKey: 'chat.tool.moveFile',
    descriptionKey: 'plugin.builtinTool.desc.moveFile',
    readOnly: false,
    modes: BUILD_ONLY
  },
  {
    name: 'run_command',
    category: 'shell',
    titleKey: 'chat.tool.command',
    descriptionKey: 'plugin.builtinTool.desc.command',
    readOnly: false,
    modes: BUILD_ONLY
  },
  {
    name: 'open_browser',
    category: 'browser',
    titleKey: 'chat.tool.openBrowser',
    descriptionKey: 'plugin.builtinTool.desc.openBrowser',
    readOnly: true,
    modes: ALL_MODES
  },
  {
    name: 'read_browser',
    category: 'browser',
    titleKey: 'chat.tool.readBrowser',
    descriptionKey: 'plugin.builtinTool.desc.readBrowser',
    readOnly: true,
    modes: ALL_MODES
  },
  {
    name: 'snapshot_browser',
    category: 'browser',
    titleKey: 'chat.tool.snapshotBrowser',
    descriptionKey: 'plugin.builtinTool.desc.snapshotBrowser',
    readOnly: true,
    modes: ALL_MODES
  },
  {
    name: 'click_browser',
    category: 'browser',
    titleKey: 'chat.tool.clickBrowser',
    descriptionKey: 'plugin.builtinTool.desc.clickBrowser',
    readOnly: false,
    modes: BUILD_ONLY
  },
  {
    name: 'fill_browser',
    category: 'browser',
    titleKey: 'chat.tool.fillBrowser',
    descriptionKey: 'plugin.builtinTool.desc.fillBrowser',
    readOnly: false,
    modes: BUILD_ONLY
  },
  {
    name: 'hover_browser',
    category: 'browser',
    titleKey: 'chat.tool.hoverBrowser',
    descriptionKey: 'plugin.builtinTool.desc.hoverBrowser',
    readOnly: true,
    modes: ALL_MODES
  },
  {
    name: 'press_browser',
    category: 'browser',
    titleKey: 'chat.tool.pressBrowser',
    descriptionKey: 'plugin.builtinTool.desc.pressBrowser',
    readOnly: false,
    modes: BUILD_ONLY
  },
  {
    name: 'select_browser',
    category: 'browser',
    titleKey: 'chat.tool.selectBrowser',
    descriptionKey: 'plugin.builtinTool.desc.selectBrowser',
    readOnly: false,
    modes: BUILD_ONLY
  },
  {
    name: 'scroll_browser',
    category: 'browser',
    titleKey: 'chat.tool.scrollBrowser',
    descriptionKey: 'plugin.builtinTool.desc.scrollBrowser',
    readOnly: true,
    modes: ALL_MODES
  },
  {
    name: 'wait_browser',
    category: 'browser',
    titleKey: 'chat.tool.waitBrowser',
    descriptionKey: 'plugin.builtinTool.desc.waitBrowser',
    readOnly: true,
    modes: ALL_MODES
  },
  {
    name: 'screenshot_browser',
    category: 'browser',
    titleKey: 'chat.tool.screenshotBrowser',
    descriptionKey: 'plugin.builtinTool.desc.screenshotBrowser',
    readOnly: true,
    modes: ALL_MODES
  },
  {
    name: 'inspect_browser',
    category: 'browser',
    titleKey: 'chat.tool.inspectBrowser',
    descriptionKey: 'plugin.builtinTool.desc.inspectBrowser',
    readOnly: true,
    modes: ALL_MODES
  },
  {
    name: 'browser_tabs',
    category: 'browser',
    titleKey: 'chat.tool.browserTabs',
    descriptionKey: 'plugin.builtinTool.desc.browserTabs',
    readOnly: true,
    modes: ALL_MODES
  },
  {
    name: 'get_current_time',
    category: 'general',
    titleKey: 'chat.tool.time',
    descriptionKey: 'plugin.builtinTool.desc.time',
    readOnly: true,
    modes: ALL_MODES
  },
  {
    name: 'ask_user',
    category: 'interaction',
    titleKey: 'chat.tool.askUser',
    descriptionKey: 'plugin.builtinTool.desc.askUser',
    readOnly: true,
    modes: ALL_MODES
  }
]
