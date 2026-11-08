/*
 * 供应商状态：列表、启停、远程模型查询。
 * @author xuxueli 2026-11-07
 */

import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { api } from '@common/renderer/api'
import { useSettingsStore } from '@modules/settings/renderer'
import { isSessionModel } from '@common/shared/model'
import type { ProviderDTO, ProviderModelQuery } from '@modules/provider/shared'

export const useProviderStore = defineStore('provider', () => {
  const settings = useSettingsStore()
  const providers = ref<ProviderDTO[]>([])
  const loaded = ref(false)

  /* 已启用的供应商 */
  const enabledProviders = computed(() => providers.value.filter((item) => item.enabled))

  /* 加载供应商列表 */
  async function load(): Promise<void> {
    providers.value = await api.provider.list()
    loaded.value = true
  }

  /* 保存供应商并刷新列表 */
  async function save(dto: Partial<ProviderDTO>): Promise<ProviderDTO> {
    const saved = await api.provider.save(dto)
    providers.value = await api.provider.list()
    if (!settings.settings.providerId) {
      await selectProvider(saved.id)
    }
    return saved
  }

  /* 删除供应商并刷新列表；删除当前供应商时切到列表首个 */
  async function remove(id: number): Promise<void> {
    await api.provider.remove(id)
    providers.value = await api.provider.list()
    if (settings.settings.providerId === id) {
      await selectProvider(providers.value[0]?.id ?? 0)
    }
  }

  /* 切换当前供应商（同步默认模型） */
  async function selectProvider(providerId: number): Promise<void> {
    const provider = providers.value.find((item) => item.id === providerId)
    /* 默认模型必须是可对话模型，嵌入 / 文生图模型不进入会话 */
    await settings.selectProvider(
      providerId,
      provider?.models.find((model) => isSessionModel(model))?.id ?? ''
    )
  }

  /* 远程查询可用模型（不落库） */
  async function queryRemoteModels(input: ProviderModelQuery): Promise<string[]> {
    return api.provider.remoteModels(input)
  }

  return { providers, loaded, enabledProviders, load, save, remove, queryRemoteModels, selectProvider }
})
