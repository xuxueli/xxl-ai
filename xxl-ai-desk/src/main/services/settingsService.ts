/*
 * 应用设置服务：以 key-value 持久化主题、语言、默认模型、系统指令等配置。
 *   - 读取时逐项回退默认值；保存为部分更新（upsert）。
 */

import { getDb } from '../db'
import { settingTable } from '../db/schema'
import { DEFAULT_SHORTCUTS, type AppSettings } from '../../shared/ipc'

/* 默认设置 */
const DEFAULTS: AppSettings = {
  theme: 'light',
  language: 'zh',
  providerId: '',
  modelId: '',
  systemPrompt: '你是 XXL-AI Desk 智能助手，回答简洁、准确、有条理。',
  appName: '',
  slogan: '',
  shortcuts: DEFAULT_SHORTCUTS,
  runtimeNodeMode: 'builtin',
  runtimeNodePath: '',
  runtimePythonPath: '',
  updateAutoCheck: true
}

/* 解析快捷键配置（JSON 存储，缺省项回退默认值） */
function parseShortcuts(raw: string | undefined): AppSettings['shortcuts'] {
  if (!raw) {
    return { ...DEFAULT_SHORTCUTS }
  }
  try {
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return { ...DEFAULT_SHORTCUTS, ...parsed }
    }
  } catch {
    /* 解析失败回退默认值 */
  }
  return { ...DEFAULT_SHORTCUTS }
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
    slogan: map.get('slogan') ?? DEFAULTS.slogan,
    shortcuts: parseShortcuts(map.get('shortcuts')),
    runtimeNodeMode: map.get('runtimeNodeMode') === 'custom' ? 'custom' : DEFAULTS.runtimeNodeMode,
    runtimeNodePath: map.get('runtimeNodePath') ?? DEFAULTS.runtimeNodePath,
    runtimePythonPath: map.get('runtimePythonPath') ?? DEFAULTS.runtimePythonPath,
    updateAutoCheck: map.get('updateAutoCheck') !== 'false'
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
