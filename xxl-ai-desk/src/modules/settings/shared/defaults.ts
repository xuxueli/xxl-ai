/*
 * 跨进程共享默认值：应用设置与会话占位标题。
 *   - 主进程初始化与渲染进程初始状态共用同一份，避免两处默认值漂移；
 *   - 会话标题不再用「新对话」作为状态哨兵，统一以空串表示未命名。
 * @author xuxueli 2026-10-25
 */

import { DEFAULT_SHORTCUTS } from '@common/shared/contracts/quickAction'
import { DEFAULT_REASONING_LEVEL } from '@common/shared/model'
import { THEME_PRESETS, type AppSettings } from '@modules/settings/shared/contracts'

/* 新建会话的占位标题：空串表示「尚未由首条提问命名」 */
export const NEW_CHAT_TITLE = ''

/* 默认应用设置（主进程与渲染进程共用） */
export const DEFAULT_APP_SETTINGS: AppSettings = {
  appearance: 'light',
  /* 默认主题 = 预设列表第一项（极简灰），保证排序与默认值单一来源 */
  themePreset: THEME_PRESETS[0],
  language: 'zh',
  providerId: 0,
  modelId: '',
  reasoningLevel: DEFAULT_REASONING_LEVEL,
  appName: '',
  slogan: '',
  shortcuts: DEFAULT_SHORTCUTS,
  runtimeNodeMode: 'builtin',
  runtimeNodePath: '',
  runtimePythonPath: '',
  updateAutoCheck: true,
  developerMode: false
}

/* 生成一份可安全修改的默认设置副本（含嵌套 shortcuts） */
export function createDefaultSettings(): AppSettings {
  return {
    ...DEFAULT_APP_SETTINGS,
    shortcuts: { ...DEFAULT_APP_SETTINGS.shortcuts }
  }
}
