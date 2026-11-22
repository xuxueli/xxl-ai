/*
 * 供应商 → Pi Models 构建：把已配置的供应商统一转换为 OpenAI 兼容的 Pi Models 集合。
 * 含 BaseURL 归一化、{session} 请求头占位替换、本地/内网服务免 Key 兜底。
 */

import type { Model, MutableModels } from '@earendil-works/pi-ai'
import { normalizeBaseUrl, USER_AGENT } from '@common/shared/providerUrl'
import { CONTEXT_WINDOW_DEFAULT, isReasoningModel } from '@common/shared/model'
import type { ProviderModelConfig } from '@modules/agent/shared/agentProtocol'

/* 构建 Pi Models 所需的供应商配置：统一取自运行时协议定义 */
export type { ProviderModelConfig }

/* 请求头中的会话占位符：按实际会话 ID 替换 */
const SESSION_PLACEHOLDER = '{session}'

/* 默认计费（供应商未提供时用零值占位，不影响本地对话） */
const DEFAULT_COST = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }

/*
 * 解析请求Header：{session} 占位符按会话ID替换（语义同平台 LlmModelFactory）。
 * 会话ID为空时跳过带占位符的Header，避免透传空会话头。
 */
function buildRequestHeaders(
  headers: Record<string, string>,
  sessionId?: number
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
      result[key] = value.split(SESSION_PLACEHOLDER).join(String(sessionId))
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
    /* Pi 供应商 id 为字符串：数据库自增 id 在此边界转字符串 */
    const providerId = String(config.id)
    const requestHeaders = buildRequestHeaders(config.headers, config.sessionId)
    /* 覆盖 Pi 内置默认 User-Agent（模型 headers 优先级高于内置默认）并压过自定义同名头，统一标识 */
    requestHeaders['User-Agent'] = USER_AGENT
    const hasHeaders = Object.keys(requestHeaders).length > 0
    const baseUrl = normalizeBaseUrl(config.baseUrl)
    /* 本地/内网服务免 Key：Pi 对空 Key 会直接报错，补占位值（本地服务通常忽略 Authorization） */
    const apiKey = config.apiKey || (isLocalBaseUrl(baseUrl) ? 'not-required' : '')

    const list: Model<'openai-completions'>[] = config.models.map((model) => {
      /* 仅对话模型开启推理，通用 / 嵌入 / 文生图模型不发送推理参数 */
      const reasoning = isReasoningModel(model)
      return {
        id: model.id,
        name: model.id,
        api: 'openai-completions',
        provider: providerId,
        baseUrl,
        reasoning,
        /* Default 不显式发送关闭参数，交由供应商按默认行为处理 */
        ...(reasoning ? { thinkingLevelMap: { off: null } } : {}),
        input: ['text'],
        cost: { ...DEFAULT_COST },
        contextWindow: model.contextWindow || CONTEXT_WINDOW_DEFAULT,
        /* Pi 类型必填；0 表示不发送 max_tokens，由供应商使用默认值 */
        maxTokens: 0,
        ...(hasHeaders ? { headers: requestHeaders } : {})
      }
    })

    models.setProvider(
      createProvider({
        id: providerId,
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
