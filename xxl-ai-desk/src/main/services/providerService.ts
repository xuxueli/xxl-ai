import { randomUUID } from 'crypto'
import { eq } from 'drizzle-orm'
import { getDb } from '../db'
import { providerTable } from '../db/schema'
import { decryptSecret, encryptSecret } from '../security'
import { getSettings, saveSettings } from './settingsService'
import type { ProviderDTO } from '../../shared/ipc'

type ProviderRow = typeof providerTable.$inferSelect

/* 解析请求Header（JSON 对象） */
function parseHeaders(raw: string): Record<string, string> {
  try {
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const result: Record<string, string> = {}
      for (const [key, value] of Object.entries(parsed)) {
        result[key] = value === null || value === undefined ? '' : String(value)
      }
      return result
    }
  } catch {
    /* 忽略非法 JSON */
  }
  return {}
}

/* 行记录 → DTO（解密密钥、解析模型列表与请求Header） */
function toDTO(row: ProviderRow): ProviderDTO {
  let models: string[] = []
  try {
    const parsed = JSON.parse(row.models)
    if (Array.isArray(parsed)) {
      models = parsed.filter((item) => typeof item === 'string')
    }
  } catch {
    models = []
  }
  return {
    id: row.id,
    name: row.name,
    baseUrl: row.baseUrl,
    apiKey: decryptSecret(row.apiKey),
    headers: parseHeaders(row.headers),
    models,
    enabled: row.enabled === 1,
    sort: row.sort,
    addTime: row.addTime,
    updateTime: row.updateTime
  }
}

/* 供应商列表 */
export function listProviders(): ProviderDTO[] {
  const rows = getDb().select().from(providerTable).orderBy(providerTable.sort).all()
  return rows.map(toDTO)
}

/* 按主键读取供应商 */
export function getProvider(id: string): ProviderDTO | null {
  const row = getDb().select().from(providerTable).where(eq(providerTable.id, id)).get()
  return row ? toDTO(row) : null
}

/* 新增或更新供应商 */
export function saveProvider(input: Partial<ProviderDTO>): ProviderDTO {
  const db = getDb()
  const now = new Date().toISOString()
  const id = input.id || randomUUID()
  const existing = db.select().from(providerTable).where(eq(providerTable.id, id)).get()

  const apiKey =
    input.apiKey !== undefined ? encryptSecret(input.apiKey) : (existing?.apiKey ?? '')
  const record = {
    id,
    name: input.name ?? existing?.name ?? '未命名供应商',
    baseUrl: input.baseUrl ?? existing?.baseUrl ?? '',
    apiKey,
    headers: JSON.stringify(input.headers ?? (existing ? parseHeaders(existing.headers) : {})),
    models: JSON.stringify(input.models ?? (existing ? JSON.parse(existing.models) : [])),
    enabled: (input.enabled ?? (existing ? existing.enabled === 1 : true)) ? 1 : 0,
    sort: input.sort ?? existing?.sort ?? 0,
    addTime: existing?.addTime ?? now,
    updateTime: now
  }

  db.insert(providerTable)
    .values(record)
    .onConflictDoUpdate({ target: providerTable.id, set: record })
    .run()

  return toDTO(record)
}

/* 删除供应商 */
export function deleteProvider(id: string): void {
  getDb().delete(providerTable).where(eq(providerTable.id, id)).run()
}

/* 首次运行播种预设供应商（与平台种子保持一致；OpenCodeGo 使用 {session} 会话头） */
export function ensureSeedProviders(): void {
  const db = getDb()
  const count = db.select().from(providerTable).all().length
  if (count > 0) {
    return
  }

  const presets: Array<Partial<ProviderDTO>> = [
    {
      name: 'OpenCodeGo',
      baseUrl: 'https://opencode.ai/zen/go/v1',
      apiKey: '',
      headers: { 'x-opencode-session': '{session}' },
      models: ['deepseek-v4-flash', 'mimo-v2.5'],
      enabled: true,
      sort: 1
    },
    {
      name: 'Ollama',
      baseUrl: 'http://127.0.0.1:11434',
      apiKey: '',
      headers: {},
      models: ['qwen3.5:0.8b', 'qwen3.5:4b'],
      enabled: true,
      sort: 2
    },
    {
      name: 'Deepseek',
      baseUrl: 'https://api.deepseek.com',
      apiKey: '',
      headers: {},
      models: ['deepseek-v4-flash', 'deepseek-v4-pro'],
      enabled: true,
      sort: 3
    },
    {
      name: '智谱GLM',
      baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
      apiKey: '',
      headers: {},
      models: ['glm-5.3-flash', 'glm-5.3'],
      enabled: true,
      sort: 4
    }
  ]

  presets.forEach((preset) => saveProvider(preset))

  /* 默认选中首个供应商与模型 */
  const settings = getSettings()
  const first = listProviders()[0]
  if (first && !settings.providerId) {
    saveSettings({ providerId: first.id, modelId: first.models[0] ?? '' })
  }
}
