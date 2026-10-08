/* 设置与供应商状态 */

import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { api } from '../api'
import { setLanguage, t } from '../i18n'
import type {
  AppSettings,
  ProviderDTO,
  ProviderModelQuery,
  RuntimeDetectResult,
  RuntimeExecInput,
  UpdateInfo
} from '../../../shared/ipc'

export const useSettingsStore = defineStore('settings', () => {
  /* 应用设置（主题/语言/默认供应商与模型/系统提示词/快捷操作等） */
  const settings = ref<AppSettings>({
    theme: 'dark',
    language: 'zh',
    providerId: '',
    modelId: '',
    systemPrompt: '',
    appName: '',
    slogan: '',
    shortcuts: {},
    runtimeNodeMode: 'builtin',
    runtimeNodePath: '',
    runtimePythonPath: '',
    updateAutoCheck: true
  })
  /* 供应商列表 */
  const providers = ref<ProviderDTO[]>([])
  /* 设置是否已首次加载 */
  const loaded = ref(false)
  /* 运行时数据目录（含默认目录与库文件路径） */
  const dataDir = ref('')
  /* 默认数据目录 */
  const defaultDataDir = ref('')
  /* 当前数据库文件路径 */
  const dbFile = ref('')
  /* 应用版本号 */
  const version = ref('')
  /* 运行平台（darwin/win32/linux），用于窗口标题栏适配 */
  const platform = ref('')
  /* 客户端更新：检测结果（hasUpdate 时用于弹提示）与检查中状态 */
  const updateInfo = ref<UpdateInfo | null>(null)
  const updateChecking = ref(false)

  /* 已启用的供应商 */
  const enabledProviders = computed(() => providers.value.filter((item) => item.enabled))
  /* 当前选中供应商（未选中为 null） */
  const currentProvider = computed(
    () => providers.value.find((item) => item.id === settings.value.providerId) ?? null
  )
  /* 当前供应商可用模型列表 */
  const currentModels = computed(() => currentProvider.value?.models ?? [])
  /* 是否具备可对话条件（已选模型或存在可用供应商） */
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
    /* 深拷贝为纯数据，避免 Vue 响应式代理无法经 IPC 结构化克隆 */
    const payload = JSON.parse(JSON.stringify(patch)) as Partial<AppSettings>
    settings.value = await api.settings.save(payload)
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

  /* 弹出可执行文件选择框（取消返回空串） */
  async function selectExecutable(title: string): Promise<string> {
    return api.app.selectExecutable(title)
  }

  /* 检测运行时可执行文件（node / python）版本 */
  async function detectExecutable(input: RuntimeExecInput): Promise<RuntimeDetectResult> {
    return api.app.detectExecutable(input)
  }

  /* 检测客户端更新；notify 为 true（手动检查）时无更新/失败也给出提示 */
  async function checkUpdate(notify = false): Promise<void> {
    updateChecking.value = true
    try {
      const info = await api.update.check()
      updateInfo.value = info
      if (!info.hasUpdate && notify) {
        ElMessage.success(t('update.latest'))
      }
    } catch (error) {
      if (notify) {
        ElMessage.error(t('update.failed', [(error as Error).message]))
      }
    } finally {
      updateChecking.value = false
    }
  }

  /* 前往下载 / release 页面并关闭提示 */
  async function openUpdate(): Promise<void> {
    const info = updateInfo.value
    const url = info?.downloadUrl || info?.releaseUrl
    if (url) {
      await api.update.openDownload(url)
    }
    updateInfo.value = null
  }

  /* 稍后再说：关闭更新提示 */
  function dismissUpdate(): void {
    updateInfo.value = null
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
    selectExecutable,
    detectExecutable,
    updateInfo,
    updateChecking,
    checkUpdate,
    openUpdate,
    dismissUpdate,
    selectProvider,
    applyTheme
  }
})
