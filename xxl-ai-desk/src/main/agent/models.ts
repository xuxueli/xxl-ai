/*
 * 供应商 → Pi Models 构建：把已配置的供应商统一转换为 OpenAI 兼容的 Pi Models 集合。
 * 含 BaseURL 归一化、{session} 请求头占位替换、本地/内网服务免 Key 兜底。
 */

import type { Model, MutableModels } from '@earendil-works/pi-ai'
import type { ProviderModelConfig } from '../../shared/agentProtocol'

/* 构建 Pi Models 所需的供应商配置：统一取自运行时协议定义 */
export type { ProviderModelConfig }

/* 请求头中的会话占位符：按实际会话 ID 替换 */
const SESSION_PLACEHOLDER = '{session}'

/* 对外请求 User-Agent（覆盖 Pi 默认的 pi (os ...)，语义同平台 LlmModelFactory） */
export const USER_AGENT = 'XXL-AI-DESK'

/* 默认计费（供应商未提供时用零值占位，不影响本地对话） */
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
 * 判断是否为本地/内网地址：本地/内网服务（如 Ollama、LM Studio、vLLM）通常不需要 API Key。
 */
function isLocalBaseUrl(baseUrl: string): boolean {
  try {
    const host = new URL(baseUrl).hostname.toLowerCase()
    return (
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === '0.0.0.0' ||
      host === '::1' ||
      host === 'host.docker.internal' ||
      host.endsWith('.local') ||
      /^10\./.test(host) ||
      /^192\.168\./.test(host) ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(host)
    )
  } catch {
    return false
  }
}

/*
 * 将已配置的供应商转换为 Pi 的 Models 集合。
 * 统一按 OpenAI 兼容协议（openai-completions）接入，覆盖 DeepSeek / Ollama / OpenCode 等。
 * 自定义请求Header（含 {session} 占位）挂到每个模型上，由 Pi 在请求时合并；
 * 并统一覆盖为 USER_AGENT，标识 Desk 客户端。
 */
export async function buildModels(configs: ProviderModelConfig[]): Promise<MutableModels> {
  const { createModels, createProvider } = await import('@earendil-works/pi-ai')
  const { openAICompletionsApi } = await import(
    '@earendil-works/pi-ai/api/openai-completions.lazy'
  )

  const models = createModels()

  for (const config of configs) {
    const requestHeaders = buildRequestHeaders(config.headers, config.sessionId)
    /* 覆盖 Pi 内置默认 User-Agent（模型 headers 优先级高于内置默认）并压过自定义同名头，统一标识 */
    requestHeaders['User-Agent'] = USER_AGENT
    const hasHeaders = Object.keys(requestHeaders).length > 0
    const baseUrl = normalizeBaseUrl(config.baseUrl)
    /* 本地/内网服务免 Key：Pi 对空 Key 会直接报错，补占位值（本地服务通常忽略 Authorization） */
    const apiKey = config.apiKey || (isLocalBaseUrl(baseUrl) ? 'not-required' : '')

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
            resolve: async () => ({ auth: { apiKey } })
          }
        },
        models: list,
        api: openAICompletionsApi()
      })
    )
  }

  return models
}
