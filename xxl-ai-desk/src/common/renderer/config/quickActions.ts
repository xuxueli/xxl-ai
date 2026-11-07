/*
 * 快捷操作注册表：命令面板与快捷键设置共用同一份顺序、文案与图标。
 * @author xuxueli 2026-10-25
 */

import type { QuickAction } from '@common/shared'

/* 快捷操作条目：icon 为已全局注册的 Element Plus 图标名；svg 为自绘图标标识 */
export interface QuickActionItem {
  /* 动作标识（与全局快捷键绑定一致） */
  id: QuickAction
  /* 文案 key */
  labelKey: string
  /* Element Plus 图标组件名（与 svg 二选一） */
  icon?: string
  /* 自绘图标标识（终端 / 浏览器） */
  svg?: 'terminal' | 'browser'
}

/* 快捷操作列表（顺序即命令面板与设置页展示顺序） */
export const QUICK_ACTIONS: QuickActionItem[] = [
  { id: 'newChat', labelKey: 'chat.newChatAction', icon: 'Edit' },
  { id: 'agent', labelKey: 'agent.title', icon: 'MagicStick' },
  { id: 'mcp', labelKey: 'plugin.mcp', icon: 'Connection' },
  { id: 'skill', labelKey: 'plugin.skill', icon: 'Notebook' },
  { id: 'settings', labelKey: 'settings.title', icon: 'Setting' },
  { id: 'files', labelKey: 'panel.files', icon: 'Folder' },
  { id: 'terminal', labelKey: 'toolPanel.terminal', svg: 'terminal' },
  { id: 'browser', labelKey: 'panel.browser', svg: 'browser' }
]
