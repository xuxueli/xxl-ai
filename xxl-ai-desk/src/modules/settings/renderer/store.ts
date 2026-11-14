/* 设置与供应商状态 */

import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { api } from '@common/renderer/api'
import { toLocalFileUrl } from '@common/renderer/utils/localFileUrl'
import { setLanguage, t } from '@common/renderer/i18n'
import builtinLogo from '@resources/icon.png'
import { createDefaultSettings } from '@modules/settings/shared'
import type { AppSettings, BrandingAssets, BrandingKind, SessionDefaults } from '@modules/settings/shared'
import type { RuntimeDetectResult, RuntimeExecInput, UpdateInfo } from '@modules/platform/shared'

export const useSettingsStore = defineStore('settings', () => {
  /* 应用设置（默认值与主进程共用 shared/defaults） */
  const settings = ref<AppSettings>(createDefaultSettings())
  /* 品牌资源：自定义 Logo / 背景图绝对路径（空串表示内置资源） */
  const branding = ref<BrandingAssets>({ logoPath: '', backgroundPath: '' })
  /* 自定义 Logo 的本地文件 URL（未设置时为空，使用方回退内置图标） */
  const logoUrl = computed(() =>
    branding.value.logoPath ? toLocalFileUrl(branding.value.logoPath) : ''
  )
  /* 对话区背景图的本地文件 URL（未设置时为空） */
  const backgroundUrl = computed(() =>
    branding.value.backgroundPath ? toLocalFileUrl(branding.value.backgroundPath) : ''
  )
  /* Logo 展示地址：自定义图片优先，未设置时回落内置图标（空态 / 关于页 / 设置预览共用） */
  const displayLogoUrl = computed(() => logoUrl.value || builtinLogo)
  /* 应用名称展示文案：自定义名称优先，未设置时回落默认名称（顶栏 / 窗口标题 / 关于页共用） */
  const displayAppName = computed(() => settings.value.appName || t('app.name'))
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

  /* 系统设置子菜单当前分类（UI 选中态，供左侧子菜单与设置页共享），默认模型供应商 */
  const activeTab = ref('providers')
  /* 新建会话默认配置写入队列：连续切换项目 / Agent / 模型时按序合并，避免相互覆盖 */
  let sessionDefaultsQueue: Promise<void> = Promise.resolve()

  /* 已启用的供应商 */
  /* 应用外观与主题预设到 DOM（Element Plus 深色模式依赖 html.dark） */
  function applyAppearance(): void {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    const appearance = settings.value.appearance
    const dark = appearance === 'dark' || (appearance === 'system' && prefersDark)
    document.documentElement.classList.toggle('dark', dark)
    /* data-theme 保留给既有样式 / 调试；data-palette 驱动主题预设 */
    document.documentElement.dataset.theme = dark ? 'dark' : 'light'
    document.documentElement.dataset.palette = settings.value.themePreset
  }

  /* 系统外观监听：仅在「跟随系统」时生效，注册一次 */
  let systemAppearanceBound = false
  function bindSystemAppearance(): void {
    if (systemAppearanceBound) {
      return
    }
    systemAppearanceBound = true
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      if (settings.value.appearance === 'system') {
        applyAppearance()
      }
    })
  }

  /* 首次加载设置与供应商 */
  async function load(): Promise<void> {
    const [nextSettings, assets] = await Promise.all([
      api.settings.get(),
      api.settings.getBranding()
    ])
    settings.value = nextSettings
    branding.value = assets
    const info = await api.app.info()
    version.value = info.version
    dataDir.value = info.dataDir
    defaultDataDir.value = info.defaultDataDir
    dbFile.value = info.dbFile
    platform.value = info.platform
    setLanguage(settings.value.language)
    bindSystemAppearance()
    applyAppearance()
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
    applyAppearance()
  }

  /* 保存单个设置项：键与值类型联动，避免调用方拼装宽泛 Partial */
  async function saveSetting<K extends keyof AppSettings>(
    key: K,
    value: AppSettings[K]
  ): Promise<void> {
    const patch: Partial<AppSettings> = {}
    patch[key] = value
    await saveSettings(patch)
  }

  /* 选择品牌图片：系统对话框 + 复制落盘由主进程完成；返回是否实际变更 */
  async function selectBranding(kind: BrandingKind): Promise<boolean> {
    const assets = await api.settings.selectBranding(kind)
    if (!assets) {
      return false
    }
    branding.value = assets
    return true
  }

  /* 恢复默认 Logo / 移除背景图 */
  async function resetBranding(kind: BrandingKind): Promise<void> {
    branding.value = await api.settings.resetBranding(kind)
  }

  /* 更新新建会话默认配置：合并后整体写入一条 JSON，避免设置表键值膨胀 */
  function saveSessionDefaults(patch: Partial<SessionDefaults>): Promise<void> {
    const next = sessionDefaultsQueue.catch(() => undefined).then(async () => {
      await saveSettings({
        sessionDefaults: { ...settings.value.sessionDefaults, ...patch }
      })
    })
    sessionDefaultsQueue = next
    return next
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
  async function selectProvider(providerId: number, modelId = ''): Promise<void> {
    await saveSessionDefaults({ providerId, modelId })
  }

  return {
    settings,
    branding,
    logoUrl,
    backgroundUrl,
    displayLogoUrl,
    displayAppName,
    loaded,
    dataDir,
    defaultDataDir,
    dbFile,
    version,
    platform,
    load,
    saveSettings,
    saveSetting,
    selectBranding,
    resetBranding,
    saveSessionDefaults,
    selectDataDir,
    saveDataDir,
    openDataDir,
    relaunch,
    selectExecutable,
    detectExecutable,
    updateInfo,
    updateChecking,
    activeTab,
    checkUpdate,
    openUpdate,
    dismissUpdate,
    selectProvider,
    applyAppearance
  }
})
