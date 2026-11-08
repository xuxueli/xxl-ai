/*
 * Agent 运行目标解析：会话绑定的供应商 / 模型 → 运行时配置。
 *   - 记忆生成与会话摘要共用同一套回退规则，避免两处各写一份。
 * @author xuxueli 2026-11-08
 */

import { getProvider } from '@modules/provider/main'
import { isSessionModel } from '@common/shared/model'
import type { ProviderDTO } from '@modules/provider/shared'
import type { AppSettings } from '@modules/settings/shared'
import type { SessionDTO } from '@modules/chat/shared'
import type { ProviderModelConfig } from '@modules/agent/shared/agentProtocol'

/* 会话运行时目标：优先会话绑定，缺失时回退设置默认，再回退供应商首个模型 */
export function resolveAgentTarget(
  session: SessionDTO,
  settings: AppSettings
): { provider: ProviderDTO; modelId: string } | null {
  const providerId = session.providerId || settings.providerId
  const provider = providerId ? getProvider(providerId) : null
  if (!provider || !provider.enabled) {
    return null
  }
  /* 只使用可对话模型（通用 / 对话），嵌入与文生图模型不参与会话 */
  const sessionModels = provider.models.filter((item) => isSessionModel(item))
  const modelId =
    session.modelId && sessionModels.some((item) => item.id === session.modelId)
      ? session.modelId
      : settings.modelId && sessionModels.some((item) => item.id === settings.modelId)
        ? settings.modelId
        : (sessionModels[0]?.id ?? '')
  return modelId ? { provider, modelId } : null
}

/* 供应商 DTO → 运行时配置 */
export function toRuntimeConfig(provider: ProviderDTO): ProviderModelConfig {
  return {
    id: provider.id,
    name: provider.name,
    baseUrl: provider.baseUrl,
    apiKey: provider.apiKey ?? '',
    headers: provider.headers,
    models: provider.models
  }
}
