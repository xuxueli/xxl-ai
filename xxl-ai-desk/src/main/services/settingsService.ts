import { getDb } from '../db'
import { settingTable } from '../db/schema'
import type { AppSettings } from '../../shared/ipc'

/* 默认设置 */
const DEFAULTS: AppSettings = {
  theme: 'light',
  language: 'zh',
  providerId: '',
  modelId: '',
  systemPrompt: '你是 XXL-AI Desk 智能助手，回答简洁、准确、有条理。可以使用工具时请主动调用。',
  appName: '',
  slogan: ''
}

/* 读取全部设置（缺省值兜底） */
export function getSettings(): AppSettings {
  const rows = getDb().select().from(settingTable).all()
  const map = new Map(rows.map((row) => [row.key, row.value]))
  return {
    theme: (map.get('theme') as AppSettings['theme']) || DEFAULTS.theme,
    language: (map.get('language') as AppSettings['language']) || DEFAULTS.language,
    providerId: map.get('providerId') || DEFAULTS.providerId,
    modelId: map.get('modelId') || DEFAULTS.modelId,
    systemPrompt: map.get('systemPrompt') ?? DEFAULTS.systemPrompt,
    appName: map.get('appName') ?? DEFAULTS.appName,
    slogan: map.get('slogan') ?? DEFAULTS.slogan
  }
}

/* 保存部分设置（key-value upsert） */
export function saveSettings(patch: Partial<AppSettings>): AppSettings {
  const db = getDb()
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined || value === null) {
      continue
    }
    const text = String(value)
    db.insert(settingTable)
      .values({ key, value: text })
      .onConflictDoUpdate({ target: settingTable.key, set: { value: text } })
      .run()
  }
  return getSettings()
}
