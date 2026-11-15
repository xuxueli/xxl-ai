/*
 * 应用设置服务：以 key-value 持久化外观、主题预设、语言、默认模型等配置。
 *   - 读取时逐项回退默认值；保存为部分更新（upsert）。
 */

import { eq, inArray } from 'drizzle-orm'
import { getDb } from '@common/main/db'
import { settingTable } from '@modules/settings/main/schema'
import {
  APPEARANCES,
  BACKGROUND_OPACITY_MAX,
  BACKGROUND_OPACITY_MIN,
  SCHEDULE_MAX_CONCURRENCY_MAX,
  SCHEDULE_MAX_CONCURRENCY_MIN,
  SCHEDULE_WATCHDOG_MAX,
  SCHEDULE_WATCHDOG_MIN,
  THEME_PRESETS,
  type AppSettings,
  type BrandingKind,
  type SessionDefaults
} from '@modules/settings/shared/contracts'
import { DEFAULT_APP_SETTINGS, DEFAULT_SESSION_DEFAULTS } from '@modules/settings/shared/defaults'
import { DEFAULT_SHORTCUTS } from '@common/shared/contracts/quickAction'
import { normalizeReasoningLevel } from '@common/shared/model'
import { normalizePermissionMode } from '@common/shared/permission'

/* 外观取值集合（用于配置合法性校验） */
const APPEARANCE_VALUES = new Set<string>(APPEARANCES)
/* 主题预设集合 */
const THEME_VALUES = new Set<string>(THEME_PRESETS)
/* 旧版分散存储的会话默认配置键：合并为 sessionDefaults 后清理 */
const LEGACY_SESSION_KEYS = ['providerId', 'modelId', 'reasoningLevel', 'permissionMode']

/* 品牌资源文件名键：文件本身由 brandingService 维护，此处只负责持久化 */
const BRANDING_FILE_KEYS: Record<BrandingKind, string> = {
  logo: 'brandingLogo',
  background: 'brandingBackground'
}

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

/* 归一化背景图不透明度：限制在共享范围内，非法值回退默认 */
function normalizeBackgroundOpacity(value: string | undefined): number {
  if (value === undefined || value.trim() === '') {
    return DEFAULT_APP_SETTINGS.backgroundOpacity
  }
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) {
    return DEFAULT_APP_SETTINGS.backgroundOpacity
  }
  /* 限制范围并保留两位小数，避免浮点尾数写入库 */
  return (
    Math.round(Math.min(BACKGROUND_OPACITY_MAX, Math.max(BACKGROUND_OPACITY_MIN, parsed)) * 100) /
    100
  )
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

/*
 * 归一化定时任务数值配置：取整并限制在共享范围内，非法值回退默认。
 * 这里只做读取侧防御（历史脏数据 / 越界配置），不替代 IPC 保存时的越界拒绝。
 */
function normalizeScheduleNumber(
  value: string | undefined,
  min: number,
  max: number,
  fallback: number
): number {
  const parsed = Number(value)
  if (value === undefined || value.trim() === '' || !Number.isFinite(parsed)) {
    return fallback
  }
  return Math.min(max, Math.max(min, Math.round(parsed)))
}

/* 解析新建会话默认配置：优先合并后的 JSON，兼容旧版分散键 */
function parseSessionDefaults(map: Map<string, string>): SessionDefaults {
  let stored: Record<string, unknown> = {}
  const raw = map.get('sessionDefaults')
  if (raw) {
    try {
      const parsed = JSON.parse(raw)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        stored = parsed as Record<string, unknown>
      }
    } catch {
      /* 解析失败回退旧版键 / 默认值 */
    }
  }
  return {
    projectId: Number(stored.projectId) || DEFAULT_SESSION_DEFAULTS.projectId,
    agentId: Number(stored.agentId) || DEFAULT_SESSION_DEFAULTS.agentId,
    providerId:
      Number(stored.providerId) ||
      Number(map.get('providerId')) ||
      DEFAULT_SESSION_DEFAULTS.providerId,
    modelId:
      typeof stored.modelId === 'string'
        ? stored.modelId
        : map.get('modelId') ?? DEFAULT_SESSION_DEFAULTS.modelId,
    reasoningLevel: normalizeReasoningLevel(stored.reasoningLevel ?? map.get('reasoningLevel')),
    permissionMode: normalizePermissionMode(stored.permissionMode ?? map.get('permissionMode'))
  }
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
    sessionDefaults: parseSessionDefaults(map),
    appName: map.get('appName') ?? DEFAULT_APP_SETTINGS.appName,
    slogan: map.get('slogan') ?? DEFAULT_APP_SETTINGS.slogan,
    backgroundOpacity: normalizeBackgroundOpacity(map.get('backgroundOpacity')),
    shortcuts: parseShortcuts(map.get('shortcuts')),
    runtimeNodeMode: map.get('runtimeNodeMode') === 'custom' ? 'custom' : DEFAULT_APP_SETTINGS.runtimeNodeMode,
    runtimeNodePath: map.get('runtimeNodePath') ?? DEFAULT_APP_SETTINGS.runtimeNodePath,
    runtimePythonPath: map.get('runtimePythonPath') ?? DEFAULT_APP_SETTINGS.runtimePythonPath,
    updateAutoCheck: readBoolean(map, 'updateAutoCheck'),
    developerMode: readBoolean(map, 'developerMode'),
    scheduleKeepAwake: readBoolean(map, 'scheduleKeepAwake'),
    scheduleMaxConcurrency: normalizeScheduleNumber(
      map.get('scheduleMaxConcurrency'),
      SCHEDULE_MAX_CONCURRENCY_MIN,
      SCHEDULE_MAX_CONCURRENCY_MAX,
      DEFAULT_APP_SETTINGS.scheduleMaxConcurrency
    ),
    scheduleWatchdogInterval: normalizeScheduleNumber(
      map.get('scheduleWatchdogInterval'),
      SCHEDULE_WATCHDOG_MIN,
      SCHEDULE_WATCHDOG_MAX,
      DEFAULT_APP_SETTINGS.scheduleWatchdogInterval
    )
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
  /* 会话默认配置已合并为一条 JSON，顺带清理旧版分散键 */
  if (patch.sessionDefaults) {
    db.delete(settingTable).where(inArray(settingTable.key, LEGACY_SESSION_KEYS)).run()
  }
  return getSettings()
}

/* 读取品牌资源文件名（空串表示未设置） */
export function getBrandingFileNames(): Record<BrandingKind, string> {
  const rows = getDb().select().from(settingTable).all()
  const map = new Map(rows.map((row) => [row.key, row.value]))
  return {
    logo: map.get(BRANDING_FILE_KEYS.logo) ?? '',
    background: map.get(BRANDING_FILE_KEYS.background) ?? ''
  }
}

/* 保存品牌资源文件名：空值删除记录，避免残留失效文件名 */
export function saveBrandingFileName(kind: BrandingKind, fileName: string): void {
  const key = BRANDING_FILE_KEYS[kind]
  const db = getDb()
  if (!fileName) {
    db.delete(settingTable).where(eq(settingTable.key, key)).run()
    return
  }
  db.insert(settingTable)
    .values({ key, value: fileName })
    .onConflictDoUpdate({ target: settingTable.key, set: { value: fileName } })
    .run()
}
