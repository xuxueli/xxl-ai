/*
 * 设置域跨进程契约：应用设置、外观、主题与快捷键。
 * @author xuxueli 2026-11-07
 */

import type { QuickAction, ShortcutMap } from '@common/shared/contracts/quickAction'
import type { ReasoningLevel } from '@common/shared/model'

/* 外观：浅色 / 深色 / 跟随系统 */
export const APPEARANCES = ['light', 'dark', 'system'] as const
export type Appearance = (typeof APPEARANCES)[number]

/* 主题配色预设（顺序即设置页展示顺序：中性 → 蓝 → 暖 → 青绿 → 紫，第一套为安装默认） */
export const THEME_PRESETS = [
  /* 中性（极简灰为安装默认） */
  'github',
  'classic',
  /* 蓝色系 */
  'onedark',
  'tokyo-night',
  'nord',
  /* 暖色系 */
  'kanagawa',
  'gruvbox',
  /* 青绿系 */
  'mint',
  /* 紫色系 */
  'catppuccin',
  'rose-pine'
] as const
export type ThemePreset = (typeof THEME_PRESETS)[number]

/* 应用设置 */
export interface AppSettings {
  /* 外观：浅色 / 深色 / 跟随系统 */
  appearance: Appearance
  /* 主题配色预设 */
  themePreset: ThemePreset
  /* 界面语言（不支持运行时切换，需重启生效） */
  language: 'zh' | 'en'
  /* 当前供应商主键（0 表示未选择） */
  providerId: number
  /* 当前模型 ID */
  modelId: string
  /* 上次选择的推理等级，新建对话沿用 */
  reasoningLevel: ReasoningLevel
  /* 个性化：应用名称（左上角 Logo 区域）与 Slogan（空态欢迎语） */
  appName: string
  slogan: string
  /* 快捷操作快捷键（缺省项回退 DEFAULT_SHORTCUTS） */
  shortcuts: ShortcutMap
  /* 命令运行环境：Node 来源（builtin 内置 Electron Node / custom 自定义路径） */
  runtimeNodeMode: 'builtin' | 'custom'
  /* 自定义 Node 可执行文件路径（runtimeNodeMode=custom 时生效） */
  runtimeNodePath: string
  /* 自定义 Python 解释器路径（留空自动探测系统 python3 / python） */
  runtimePythonPath: string
  /* 启动时自动检查客户端更新 */
  updateAutoCheck: boolean
  /* 开发者模式：开启后记录模型通讯 trace，并在工具面板展示「会话日志」 */
  developerMode: boolean
}

/* 快捷操作类型由 common 契约统一提供 */
export type { QuickAction, ShortcutMap }
