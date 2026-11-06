/*
 * 跨进程共享默认值：应用设置、系统指令与会话占位标题。
 *   - 主进程初始化与渲染进程初始状态共用同一份，避免两处默认值漂移；
 *   - 会话标题不再用「新对话」作为状态哨兵，统一以空串表示未命名。
 * @author xuxueli 2026-10-25
 */

import { DEFAULT_SHORTCUTS, THEME_PRESETS, type AppSettings } from './contracts/app'
import { translate } from './i18n'

/* 新建会话的占位标题：空串表示「尚未由首条提问命名」 */
export const NEW_CHAT_TITLE = ''

/* 默认应用设置（主进程与渲染进程共用） */
export const DEFAULT_APP_SETTINGS: AppSettings = {
  appearance: 'light',
  /* 默认主题 = 预设列表第一项（经典灰），保证排序与默认值单一来源 */
  themePreset: THEME_PRESETS[0],
  language: 'zh',
  providerId: '',
  modelId: '',
  systemPrompt: translate('zh', 'agent.presets.general.prompt'),
  appName: '',
  slogan: '',
  shortcuts: DEFAULT_SHORTCUTS,
  runtimeNodeMode: 'builtin',
  runtimeNodePath: '',
  runtimePythonPath: '',
  updateAutoCheck: true,
  builtinToolBrowserEnabled: true,
  builtinToolFsEnabled: true,
  builtinToolShellEnabled: true,
  /* 通用工具与人机交互默认关闭，按需在「插件 → 内置工具」开启 */
  builtinToolGeneralEnabled: false,
  builtinToolInteractionEnabled: false,
  agentMemoryEnabled: false,
  developerMode: false
}

/* 生成一份可安全修改的默认设置副本（含嵌套 shortcuts） */
export function createDefaultSettings(): AppSettings {
  return { ...DEFAULT_APP_SETTINGS, shortcuts: { ...DEFAULT_APP_SETTINGS.shortcuts } }
}
