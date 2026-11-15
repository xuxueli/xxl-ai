/*
 * 设置域跨进程契约：应用设置、外观、主题与快捷键。
 * @author xuxueli 2026-11-07
 */

import type { QuickAction, ShortcutMap } from '@common/shared/contracts/quickAction'
import type { ReasoningLevel } from '@common/shared/model'
import type { PermissionMode } from '@common/shared/permission'

/* 外观：浅色 / 深色 / 跟随系统 */
export const APPEARANCES = ['light', 'dark', 'system'] as const
export type Appearance = (typeof APPEARANCES)[number]

/* 主题配色预设（顺序即设置页展示顺序：中性 → 冷蓝 → 青绿 → 暖色 → 紫粉，第一套为安装默认） */
export const THEME_PRESETS = [
  /* 中性（极简灰为安装默认） */
  'github',
  'classic',
  /* 冷蓝色系 */
  'nord',
  'onedark',
  'tokyo-night',
  /* 青绿色系 */
  'mint',
  'everforest',
  'matcha',
  /* 暖色系 */
  'kanagawa',
  'solarized',
  'gruvbox',
  /* 紫粉色系 */
  'catppuccin',
  'dracula',
  'rose-pine'
] as const
export type ThemePreset = (typeof THEME_PRESETS)[number]

/* 品牌资源类型：Logo / 背景图 */
export type BrandingKind = 'logo' | 'background'

/* 背景图不透明度范围：主进程归一化与设置页滑杆共用，避免两处边界漂移 */
export const BACKGROUND_OPACITY_MIN = 0.1
export const BACKGROUND_OPACITY_MAX = 0.6

/* 定时任务最大并发数范围：主进程归一化与调度设置页共用 */
export const SCHEDULE_MAX_CONCURRENCY_MIN = 1
export const SCHEDULE_MAX_CONCURRENCY_MAX = 500

/* 定时任务巡检间隔范围（秒）：主进程归一化与调度设置页共用 */
export const SCHEDULE_WATCHDOG_MIN = 30
export const SCHEDULE_WATCHDOG_MAX = 600

/* 品牌资源：主进程解析后的绝对路径，空串表示使用内置资源 */
export interface BrandingAssets {
  logoPath: string
  backgroundPath: string
}

/* 新建会话默认配置：统一存为一条 JSON，避免设置表键值碎片化 */
export interface SessionDefaults {
  /* 上次选择的项目主键（0 表示未选择） */
  projectId: number
  /* 上次选择的 Agent 主键（0 表示未选择） */
  agentId: number
  /* 上次选择的供应商主键（0 表示未选择） */
  providerId: number
  /* 上次选择的模型 ID */
  modelId: string
  /* 上次选择的推理等级 */
  reasoningLevel: ReasoningLevel
  /* 上次选择的权限模式 */
  permissionMode: PermissionMode
}

/* 应用设置 */
export interface AppSettings {
  /* 外观：浅色 / 深色 / 跟随系统 */
  appearance: Appearance
  /* 主题配色预设 */
  themePreset: ThemePreset
  /* 界面语言（不支持运行时切换，需重启生效） */
  language: 'zh' | 'en'
  /* 新建会话默认配置（项目 / Agent / 模型 / 推理等级 / 权限模式） */
  sessionDefaults: SessionDefaults
  /* 个性化：应用名称（左上角 Logo 区域）与 Slogan（空态欢迎语） */
  appName: string
  slogan: string
  /* 对话区背景图不透明度（BACKGROUND_OPACITY_MIN ~ MAX，未设置背景图时不生效） */
  backgroundOpacity: number
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
  /* 定时任务：阻止系统睡眠（屏幕仍可关闭） */
  scheduleKeepAwake: boolean
  /* 定时任务：最大并发运行数 */
  scheduleMaxConcurrency: number
  /* 定时任务：巡检间隔（秒），检测计时器与运行超时 */
  scheduleWatchdogInterval: number
}

/* 快捷操作类型由 common 契约统一提供 */
export type { QuickAction, ShortcutMap }
