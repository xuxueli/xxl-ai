import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { api } from '../api'
import { setLanguage } from '../i18n'
import type { AppSettings, ProviderDTO } from '../../../shared/ipc'

/* 设置与供应商状态 */
export const useSettingsStore = defineStore('settings', () => {
  const settings = ref<AppSettings>({
    theme: 'dark',
    language: 'zh',
    providerId: '',
    modelId: '',
    systemPrompt: ''
  })
  const providers = ref<ProviderDTO[]>([])
  const loaded = ref(false)

  const enabledProviders = computed(() => providers.value.filter((item) => item.enabled))
  const currentProvider = computed(
    () => providers.value.find((item) => item.id === settings.value.providerId) ?? null
  )
  const currentModels = computed(() => currentProvider.value?.models ?? [])
  const ready = computed(
    () => Boolean(currentProvider.value && settings.value.modelId) || providers.value.length > 0
  )

  /* 应用主题到 DOM（Element Plus 深色模式依赖 html.dark） */
  function applyTheme(): void {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    const dark =
      settings.value.theme === 'dark' || (settings.value.theme === 'system' && prefersDark)
    document.documentElement.classList.toggle('dark', dark)
    document.documentElement.dataset.theme = dark ? 'dark' : 'light'
  }

  /* 首次加载设置与供应商 */
  async function load(): Promise<void> {
    settings.value = await api.settings.get()
    providers.value = await api.provider.list()
    setLanguage(settings.value.language)
    applyTheme()
    loaded.value = true
  }

  /* 保存设置 */
  async function saveSettings(patch: Partial<AppSettings>): Promise<void> {
    settings.value = await api.settings.save(patch)
    if (patch.language) {
      setLanguage(patch.language)
    }
    applyTheme()
  }

  /* 保存供应商并刷新列表 */
  async function saveProvider(dto: Partial<ProviderDTO>): Promise<ProviderDTO> {
    const saved = await api.provider.save(dto)
    providers.value = await api.provider.list()
    if (!settings.value.providerId) {
      await saveSettings({ providerId: saved.id, modelId: saved.models[0] ?? '' })
    }
    return saved
  }

  /* 删除供应商 */
  async function removeProvider(id: string): Promise<void> {
    await api.provider.remove(id)
    providers.value = await api.provider.list()
    if (settings.value.providerId === id) {
      const next = providers.value[0]
      await saveSettings({ providerId: next?.id ?? '', modelId: next?.models[0] ?? '' })
    }
  }

  /* 切换当前供应商（同步默认模型） */
  async function selectProvider(providerId: string): Promise<void> {
    const provider = providers.value.find((item) => item.id === providerId)
    await saveSettings({ providerId, modelId: provider?.models[0] ?? '' })
  }

  return {
    settings,
    providers,
    loaded,
    enabledProviders,
    currentProvider,
    currentModels,
    ready,
    load,
    saveSettings,
    saveProvider,
    removeProvider,
    selectProvider,
    applyTheme
  }
})
