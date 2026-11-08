/*
 * 应用设置服务：以 key-value 持久化外观、主题预设、语言、默认模型等配置。
 *   - 读取时逐项回退默认值；保存为部分更新（upsert）。
 */

import { getDb } from '@common/main/db'
import { settingTable } from '@modules/settings/main/schema'
import {
  APPEARANCES,
  THEME_PRESETS,
  type AppSettings
} from '@modules/settings/shared/contracts'
import { DEFAULT_APP_SETTINGS } from '@modules/settings/shared/defaults'
import { DEFAULT_SHORTCUTS } from '@common/shared/contracts/quickAction'
import { normalizeReasoningLevel } from '@common/shared/model'

/* 外观取值集合（用于配置合法性校验） */
const APPEARANCE_VALUES = new Set<string>(APPEARANCES)
/* 主题预设集合 */
const THEME_VALUES = new Set<string>(THEME_PRESETS)

/* 归一化外观：非法值回退默认 */
function normalizeAppearance(value: string | undefined): AppSettings['appearance'] {
  return APPEARANCE_VALUES.has(value ?? '')
    ? (value as AppSettings['appearance'])
    : DEFAULT_APP_SETTINGS.appearance
}

/* 归一化主题预设：非法值回退默认预设 */
function normalizeTheme(value: string | undefined): AppSettings['themePreset'] {
  return THEME_VALUES.has(value ?? '')
    ? (value as AppSettings['themePreset'])
    : DEFAULT_APP_SETTINGS.themePreset
}

/* 为快捷键绑定补齐 Shift（已包含则原样返回；主键保持在末尾） */
function withShift(binding: string): string {
  const tokens = binding.split('+').filter(Boolean)
  if (tokens.includes('shift')) {
    return binding
  }
  const key = tokens.pop()
  return key ? [...tokens, 'shift', key].join('+') : binding
}

/* 解析快捷键配置（JSON 存储，缺省项回退默认值） */
function parseShortcuts(raw: string | undefined): AppSettings['shortcuts'] {
  if (!raw) {
    return { ...DEFAULT_SHORTCUTS }
  }
  try {
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const stored = parsed as Record<string, unknown>
      const merged: AppSettings['shortcuts'] = { ...DEFAULT_SHORTCUTS }
      /* 只读取当前快捷键清单内的键，未知键直接忽略 */
      for (const action of Object.keys(DEFAULT_SHORTCUTS) as (keyof AppSettings['shortcuts'])[]) {
        const binding = stored[action]
        if (typeof binding === 'string' && binding) {
          merged[action] = binding
        }
      }
      /* 统一附加 Shift：避开 Cmd/Ctrl+A、Cmd/Ctrl+F、Cmd/Ctrl+S 等系统默认快捷键 */
      for (const action of Object.keys(merged) as (keyof AppSettings['shortcuts'])[]) {
        const binding = merged[action]
        if (binding) {
          merged[action] = withShift(binding)
        }
      }
      return merged
    }
  } catch {
    /* 解析失败回退默认值 */
  }
  return { ...DEFAULT_SHORTCUTS }
}

/* 布尔配置键：默认值统一从 DEFAULT_APP_SETTINGS 取，避免开关默认值两处维护 */
type BooleanSettingKey = {
  [K in keyof AppSettings]: AppSettings[K] extends boolean ? K : never
}[keyof AppSettings]

/* 读取布尔配置：显式 true/false 优先，缺省或非法值回退默认值 */
function readBoolean(map: Map<string, string>, key: BooleanSettingKey): boolean {
  const value = map.get(key)
  if (value === 'true') {
    return true
  }
  if (value === 'false') {
    return false
  }
  return DEFAULT_APP_SETTINGS[key]
}

/* 读取全部设置（缺省值兜底） */
export function getSettings(): AppSettings {
  const rows = getDb().select().from(settingTable).all()
  const map = new Map(rows.map((row) => [row.key, row.value]))
  const language = (map.get('language') as AppSettings['language']) || DEFAULT_APP_SETTINGS.language
  return {
    appearance: normalizeAppearance(map.get('appearance')),
    themePreset: normalizeTheme(map.get('themePreset')),
    language,
    providerId: Number(map.get('providerId')) || DEFAULT_APP_SETTINGS.providerId,
    modelId: map.get('modelId') || DEFAULT_APP_SETTINGS.modelId,
    reasoningLevel: normalizeReasoningLevel(map.get('reasoningLevel')),
    appName: map.get('appName') ?? DEFAULT_APP_SETTINGS.appName,
    slogan: map.get('slogan') ?? DEFAULT_APP_SETTINGS.slogan,
    shortcuts: parseShortcuts(map.get('shortcuts')),
    runtimeNodeMode: map.get('runtimeNodeMode') === 'custom' ? 'custom' : DEFAULT_APP_SETTINGS.runtimeNodeMode,
    runtimeNodePath: map.get('runtimeNodePath') ?? DEFAULT_APP_SETTINGS.runtimeNodePath,
    runtimePythonPath: map.get('runtimePythonPath') ?? DEFAULT_APP_SETTINGS.runtimePythonPath,
    updateAutoCheck: readBoolean(map, 'updateAutoCheck'),
    developerMode: readBoolean(map, 'developerMode')
  }
}

/* 保存部分设置（key-value upsert；对象值序列化为 JSON 文本） */
export function saveSettings(patch: Partial<AppSettings>): AppSettings {
  const db = getDb()
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined || value === null) {
      continue
    }
    const text = typeof value === 'object' ? JSON.stringify(value) : String(value)
    db.insert(settingTable)
      .values({ key, value: text })
      .onConflictDoUpdate({ target: settingTable.key, set: { value: text } })
      .run()
  }
  return getSettings()
}
