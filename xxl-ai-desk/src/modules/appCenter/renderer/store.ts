/*
 * 应用中心状态：内置应用、安装状态、启用状态与配置。
 *   - 所有状态由 desk_app_setting 统一维护；
 *   - 应用配置按 appId 存在 state.config 中。
 * @author xuxueli 2026-11-08
 */

import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { api } from '@common/renderer/api'
import { BUILTIN_APPS, type AppAvailability, type AppCategory } from '@modules/appCenter/shared'
import type { AppStateDTO } from '@modules/appCenter/shared'

/* 带状态的应用项 */
export interface AppItem {
  id: string
  titleKey: string
  descKey: string
  icon: string
  path?: string
  category: AppCategory
  availability: AppAvailability
  installed: boolean
  enabled: boolean
}

/* 应用默认状态 */
function emptyState(appId: string): AppStateDTO {
  return { appId, installed: false, enabled: false, config: {} }
}

export const useAppCenterStore = defineStore('appCenter', () => {
  /* appId → 状态 */
  const states = ref<Record<string, AppStateDTO>>({})
  /* 状态是否已加载 */
  const loaded = ref(false)

  /* 全部应用（含安装 / 启用状态） */
  const apps = computed<AppItem[]>(() =>
    BUILTIN_APPS.map((app) => {
      const state = states.value[app.id] ?? emptyState(app.id)
      return {
        ...app,
        installed: state.installed,
        enabled: state.enabled
      }
    })
  )

  /* 我的应用：仅已安装且可用的应用 */
  const installedApps = computed(() =>
    apps.value.filter((app) => app.installed && app.availability === 'available')
  )

  /* 应用市场：内置应用目录 */
  const marketApps = computed(() => apps.value)

  /* 读取单个应用状态 */
  function stateOf(appId: string): AppStateDTO {
    return states.value[appId] ?? emptyState(appId)
  }

  /* 合并单个应用状态 */
  function setState(state: AppStateDTO): void {
    states.value = { ...states.value, [state.appId]: state }
  }

  /* 加载全部状态 */
  async function loadStates(): Promise<void> {
    const list = await api.appCenter.listStates()
    states.value = Object.fromEntries(list.map((item) => [item.appId, item]))
    loaded.value = true
  }

  /* 启动引导入口 */
  async function ensureLoaded(): Promise<void> {
    if (!loaded.value) {
      await loadStates()
    }
  }

  /* 安装应用 */
  async function install(id: string): Promise<void> {
    setState(await api.appCenter.install(id))
  }

  /* 卸载应用：仅更新状态，配置保留 */
  async function uninstall(id: string): Promise<void> {
    setState(await api.appCenter.uninstall(id))
  }

  /* 启用 / 停用应用 */
  async function setEnabled(id: string, enabled: boolean): Promise<void> {
    setState(await api.appCenter.setEnabled(id, enabled))
  }

  return {
    apps,
    installedApps,
    marketApps,
    loaded,
    stateOf,
    ensureLoaded,
    loadStates,
    install,
    uninstall,
    setEnabled
  }
})
