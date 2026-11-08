/*
 * 供应商服务：管理 OpenAI 兼容端点的配置（地址、密钥、模型列表等）。
 *   - 密钥经 security 编解码后入库；模型/请求头以 JSON 文本存储。
 *   - 首次运行播种预设供应商，供新用户开箱可用。
 */

import { eq } from 'drizzle-orm'
import { getDb } from '@common/main/db'
import { t } from '@common/main/i18n'
import { providerTable } from '@modules/provider/main/schema'
import { decryptSecret, encryptSecret } from './securityService'
import { normalizeBaseUrl, USER_AGENT } from '@common/shared/providerUrl'
import { isTimeoutError, requestWithTimeout } from '@common/main/utils/http'
import { getSettings, saveSettings } from '@modules/settings/main'
import type { ProviderDTO, ProviderModelDTO, ProviderModelQuery } from '@modules/provider/shared'
import {
  CONTEXT_WINDOW_DEFAULT,
  DEFAULT_MODEL_TYPE,
  MODEL_TYPES,
  isSessionModel,
  type ModelType
} from '@common/shared/model'

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

/* 归一化单个模型项：只接受对象格式，非法项丢弃 */
function normalizeModel(item: unknown): ProviderModelDTO | null {
  if (!item || typeof item !== 'object') {
    return null
  }
  const record = item as { id?: unknown; contextWindow?: unknown; type?: unknown }
  const id = typeof record.id === 'string' ? record.id.trim() : ''
  if (!id) {
    return null
  }
  const window = Number(record.contextWindow)
  const valid = Number.isFinite(window) && window > 0
  /* 类型缺失或非法统一回退通用模型 */
  const type: ModelType =
    typeof record.type === 'string' && (MODEL_TYPES as readonly string[]).includes(record.type)
      ? (record.type as ModelType)
      : DEFAULT_MODEL_TYPE
  return {
    id,
    contextWindow: valid ? Math.round(window) : CONTEXT_WINDOW_DEFAULT,
    type
  }
}

/* 归一化模型列表：按 ID 去重，非法项丢弃 */
function normalizeModels(items: unknown): ProviderModelDTO[] {
  if (!Array.isArray(items)) {
    return []
  }
  const models = new Map<string, ProviderModelDTO>()
  for (const item of items) {
    const model = normalizeModel(item)
    if (model && !models.has(model.id)) {
      models.set(model.id, model)
    }
  }
  return [...models.values()]
}

/* 解析模型列表：按 ID 去重，非法项丢弃 */
function parseModels(raw: string): ProviderModelDTO[] {
  try {
    return normalizeModels(JSON.parse(raw))
  } catch {
    return []
  }
}

/* 行记录 → DTO（解码密钥、解析模型列表与请求Header） */
function toDTO(row: ProviderRow): ProviderDTO {
  return {
    id: row.id,
    name: row.name,
    baseUrl: row.baseUrl,
    apiKey: decryptSecret(row.apiKey),
    headers: parseHeaders(row.headers),
    models: parseModels(row.models),
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
export function getProvider(id: number): ProviderDTO | null {
  if (!id) {
    return null
  }
  const row = getDb().select().from(providerTable).where(eq(providerTable.id, id)).get()
  return row ? toDTO(row) : null
}

/* 新增或更新供应商 */
export function saveProvider(input: Partial<ProviderDTO>): ProviderDTO {
  const db = getDb()
  const now = new Date().toISOString()
  const existing = input.id
    ? db.select().from(providerTable).where(eq(providerTable.id, input.id)).get()
    : undefined

  /* 未传 apiKey 表示保持原值；显式空串表示清空 */
  const apiKey = input.apiKey !== undefined ? encryptSecret(input.apiKey) : (existing?.apiKey ?? '')
  /* 写库前统一归一化模型：去重并保证窗口合法 */
  const models = normalizeModels(
    input.models ?? (existing ? parseModels(existing.models) : [])
  )
  const record = {
    name: input.name ?? existing?.name ?? '未命名供应商',
    baseUrl: input.baseUrl ?? existing?.baseUrl ?? '',
    apiKey,
    headers: JSON.stringify(input.headers ?? (existing ? parseHeaders(existing.headers) : {})),
    models: JSON.stringify(models),
    enabled: (input.enabled ?? (existing ? existing.enabled === 1 : true)) ? 1 : 0,
    sort: input.sort ?? existing?.sort ?? 0,
    addTime: existing?.addTime ?? now,
    updateTime: now
  }

  if (existing) {
    db.update(providerTable).set(record).where(eq(providerTable.id, existing.id)).run()
    return toDTO({ ...existing, ...record })
  }
  const inserted = db
    .insert(providerTable)
    .values(record)
    .returning({ id: providerTable.id })
    .get()
  return toDTO({ id: inserted.id, ...record })
}

/* 删除供应商 */
export function deleteProvider(id: number): void {
  if (!id) {
    return
  }
  getDb().delete(providerTable).where(eq(providerTable.id, id)).run()
}

/*
 * 远程查询供应商可用模型（OpenAI 兼容 GET /models，兼容 Ollama /api/tags）。
 * 未保存的草稿可直接传表单 baseUrl/apiKey/headers；已保存的可只传 id 复用库存配置（密钥解密后使用）。
 */
export async function fetchRemoteModels(input: ProviderModelQuery): Promise<string[]> {
  let baseUrl = input.baseUrl?.trim() ?? ''
  let apiKey = input.apiKey ?? ''
  let headers = input.headers ?? {}

  if (input.id && (!baseUrl || !apiKey || Object.keys(headers).length === 0)) {
    const existing = getProvider(input.id)
    if (existing) {
      baseUrl = baseUrl || existing.baseUrl
      apiKey = apiKey || existing.apiKey || ''
      headers = Object.keys(headers).length > 0 ? headers : existing.headers
    }
  }

  if (!baseUrl) {
    throw new Error(t('runtime.error.providerBaseUrlRequired'))
  }

  /* 统一携带 User-Agent，标识 Desk 客户端（压过自定义同名头） */
  const requestHeaders: Record<string, string> = {
    ...headers,
    'User-Agent': USER_AGENT
  }
  if (apiKey) {
    requestHeaders.Authorization = `Bearer ${apiKey}`
  }

  try {
    const response = await requestWithTimeout(`${normalizeBaseUrl(baseUrl)}/models`, {
      headers: requestHeaders
    })
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }
    const data = (await response.json()) as {
      data?: Array<{ id?: string }>
      models?: Array<{ name?: string; model?: string }>
    }
    const ids = Array.isArray(data.data)
      ? data.data.map((item) => item.id)
      : Array.isArray(data.models)
        ? data.models.map((item) => item.name ?? item.model)
        : []
    return Array.from(new Set(ids.filter((id): id is string => Boolean(id))))
  } catch (error) {
    if (isTimeoutError(error)) {
      throw new Error(t('runtime.error.providerModelsTimeout'))
    }
    throw error as Error
  }
}

/* 预设模型：统一使用默认上下文窗口，并按给定类型标注 */
function seedModels(models: Array<{ id: string; type: ModelType }>): ProviderModelDTO[] {
  return models.map((model) => ({ ...model, contextWindow: CONTEXT_WINDOW_DEFAULT }))
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
      models: seedModels([
        { id: 'deepseek-v4.1-flash', type: 'chat' },
        { id: 'glm-5.3', type: 'general' }
      ]),
      enabled: true,
      sort: 1
    },
    {
      name: 'Ollama',
      baseUrl: 'http://127.0.0.1:11434',
      apiKey: '',
      headers: {},
      models: seedModels([
        { id: 'qwen3.5:0.8b', type: 'general' },
        { id: 'qwen3.5:4b', type: 'general' },
        { id: 'qwen3-embedding:0.6b', type: 'embedding' }
      ]),
      enabled: true,
      sort: 2
    },
    {
      name: 'Deepseek',
      baseUrl: 'https://api.deepseek.com',
      apiKey: '',
      headers: {},
      models: seedModels([
        { id: 'deepseek-v4-flash', type: 'general' },
        { id: 'deepseek-v4-pro', type: 'general' }
      ]),
      enabled: true,
      sort: 3
    },
    {
      name: '智谱GLM',
      baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
      apiKey: '',
      headers: {},
      models: seedModels([
        { id: 'glm-5.3-flash', type: 'general' },
        { id: 'glm-5.3', type: 'general' }
      ]),
      enabled: true,
      sort: 4
    }
  ]

  presets.forEach((preset) => saveProvider(preset))

  /* 默认选中首个供应商与模型 */
  const settings = getSettings()
  const first = listProviders()[0]
  if (first && !settings.providerId) {
    saveSettings({
      providerId: first.id,
      modelId: first.models.find((model) => isSessionModel(model))?.id ?? ''
    })
  }
}
