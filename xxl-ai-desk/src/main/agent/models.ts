import type { Model, MutableModels } from '@earendil-works/pi-ai'

/* 构建 Pi Models 所需的供应商配置 */
export interface ProviderModelConfig {
  id: string
  name: string
  baseUrl: string
  apiKey: string
  headers: Record<string, string>
  models: string[]
  sessionId?: string
}

const SESSION_PLACEHOLDER = '{session}'
const DEFAULT_COST = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }

/*
 * 归一化供应商 BaseURL：结尾去斜杠；裸地址（无路径前缀，如 Ollama http://host:11434）
 * 自动补 /v1 OpenAI 兼容版本前缀（语义同平台 LlmModelFactory）。
 */
export function normalizeBaseUrl(baseUrl: string): string {
  let url = (baseUrl ?? '').trim()
  if (url.endsWith('/')) {
    url = url.slice(0, -1)
  }
  try {
    const path = new URL(url).pathname
    if (!path || path === '/') {
      url = `${url}/v1`
    }
  } catch {
    /* 非法 URL 按原值使用，交由后续请求报错 */
  }
  return url
}

/*
 * 解析请求Header：{session} 占位符按会话ID替换（语义同平台 LlmModelFactory）。
 * 会话ID为空时跳过带占位符的Header，避免透传空会话头。
 */
function buildRequestHeaders(
  headers: Record<string, string>,
  sessionId?: string
): Record<string, string> {
  const result: Record<string, string> = {}
  for (const [rawKey, rawValue] of Object.entries(headers ?? {})) {
    const key = rawKey.trim()
    if (!key) {
      continue
    }
    const value = rawValue ?? ''
    if (value.includes(SESSION_PLACEHOLDER)) {
      if (!sessionId) {
        continue
      }
      result[key] = value.split(SESSION_PLACEHOLDER).join(sessionId)
    } else {
      result[key] = value
    }
  }
  return result
}

/*
 * 将已配置的供应商转换为 Pi 的 Models 集合。
 * 统一按 OpenAI 兼容协议（openai-completions）接入，覆盖 DeepSeek / Ollama / OpenCode 等。
 * 自定义请求Header（含 {session} 占位）挂到每个模型上，由 Pi 在请求时合并。
 */
export async function buildModels(configs: ProviderModelConfig[]): Promise<MutableModels> {
  const { createModels, createProvider } = await import('@earendil-works/pi-ai')
  const { openAICompletionsApi } = await import(
    '@earendil-works/pi-ai/api/openai-completions.lazy'
  )

  const models = createModels()

  for (const config of configs) {
    const requestHeaders = buildRequestHeaders(config.headers, config.sessionId)
    const hasHeaders = Object.keys(requestHeaders).length > 0
    const baseUrl = normalizeBaseUrl(config.baseUrl)

    const list: Model<'openai-completions'>[] = config.models.map((modelId) => ({
      id: modelId,
      name: modelId,
      api: 'openai-completions',
      provider: config.id,
      baseUrl,
      reasoning: false,
      input: ['text'],
      cost: { ...DEFAULT_COST },
      contextWindow: 128000,
      maxTokens: 8192,
      ...(hasHeaders ? { headers: requestHeaders } : {})
    }))

    models.setProvider(
      createProvider({
        id: config.id,
        name: config.name,
        baseUrl,
        auth: {
          apiKey: {
            name: config.name,
            resolve: async () => ({ auth: { apiKey: config.apiKey } })
          }
        },
        models: list,
        api: openAICompletionsApi()
      })
    )
  }

  return models
}
