import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { api } from '../api'
import { setLanguage } from '../i18n'
import type { AppSettings, ProviderDTO, ProviderModelQuery } from '../../../shared/ipc'

/* 设置与供应商状态 */
export const useSettingsStore = defineStore('settings', () => {
  const settings = ref<AppSettings>({
    theme: 'dark',
    language: 'zh',
    providerId: '',
    modelId: '',
    systemPrompt: '',
    appName: '',
    slogan: ''
  })
  const providers = ref<ProviderDTO[]>([])
  const loaded = ref(false)
  /* 运行时数据目录（含默认目录与库文件路径） */
  const dataDir = ref('')
  const defaultDataDir = ref('')
  const dbFile = ref('')
  const version = ref('')
  /* 运行平台（darwin/win32/linux），用于窗口标题栏适配 */
  const platform = ref('')

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
    const info = await api.app.info()
    version.value = info.version
    dataDir.value = info.dataDir
    defaultDataDir.value = info.defaultDataDir
    dbFile.value = info.dbFile
    platform.value = info.platform
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

  /* 远程查询供应商可用模型（不落库，供模型行下拉选择） */
  async function queryRemoteModels(input: ProviderModelQuery): Promise<string[]> {
    return api.provider.remoteModels(input)
  }

  /* 选择数据目录（系统对话框，取消返回空串） */
  async function selectDataDir(): Promise<string> {
    return api.app.selectDataDir()
  }

  /* 保存数据目录（重启后生效），返回生效目录 */
  async function saveDataDir(dir: string): Promise<string> {
    dataDir.value = await api.app.setDataDir(dir)
    return dataDir.value
  }

  /* 用系统文件管理器打开当前数据目录 */
  async function openDataDir(): Promise<void> {
    await api.app.openDataDir()
  }

  /* 重启应用（数据目录切换后生效） */
  async function relaunch(): Promise<void> {
    await api.app.relaunch()
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
    dataDir,
    defaultDataDir,
    dbFile,
    version,
    platform,
    enabledProviders,
    currentProvider,
    currentModels,
    ready,
    load,
    saveSettings,
    saveProvider,
    removeProvider,
    queryRemoteModels,
    selectDataDir,
    saveDataDir,
    openDataDir,
    relaunch,
    selectProvider,
    applyTheme
  }
})
