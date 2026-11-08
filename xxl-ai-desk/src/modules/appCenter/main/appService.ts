/*
 * 应用中心服务：安装、启用与应用配置统一读写 desk_app_setting。
 *   - 卸载只更新 installed / enabled 状态，保留配置；
 *   - 配置按应用存储为 JSON，各应用自行定义结构。
 * @author xuxueli 2026-11-08
 */

import { eq } from 'drizzle-orm'
import { getDb } from '@common/main/db'
import { t } from '@common/main/i18n'
import { BUILTIN_APPS, type BuiltinApp } from '../shared/registry'
import type { AppStateDTO } from '../shared/contracts'
import { appSettingTable } from './schema'

/* 应用配置对象 */
export type AppConfig = Record<string, unknown>

/* 注册表索引 */
const APP_MAP = new Map(BUILTIN_APPS.map((app) => [app.id, app]))

/* 校验应用存在 */
function requireKnownApp(appId: string): BuiltinApp {
  const app = APP_MAP.get(appId)
  if (!app) {
    throw new Error(t('runtime.error.appNotFound'))
  }
  return app
}

/* 校验应用存在且可安装 */
function requireInstallableApp(appId: string): BuiltinApp {
  const app = requireKnownApp(appId)
  if (app.availability !== 'available') {
    throw new Error(t('runtime.error.appNotAvailable'))
  }
  return app
}

/* 解析 JSON 配置：非法值回退空对象 */
function parseConfig(raw: string): AppConfig {
  try {
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as AppConfig)
      : {}
  } catch {
    return {}
  }
}

/* 读取单行 */
function readRow(appId: string) {
  return getDb().select().from(appSettingTable).where(eq(appSettingTable.appId, appId)).get()
}

/* 行 → DTO */
function toState(row: typeof appSettingTable.$inferSelect): AppStateDTO {
  return {
    appId: row.appId,
    installed: row.installed === 1,
    enabled: row.enabled === 1,
    config: parseConfig(row.config)
  }
}

/* 未落库应用的默认状态 */
function emptyState(appId: string): AppStateDTO {
  return { appId, installed: false, enabled: false, config: {} }
}

/* 全部应用状态 */
export function listAppStates(): AppStateDTO[] {
  return getDb().select().from(appSettingTable).all().map(toState)
}

/* 单个应用状态 */
export function getAppState(appId: string): AppStateDTO {
  const row = readRow(appId)
  return row ? toState(row) : emptyState(appId)
}

/* 读取应用配置（供各应用域读取自己的配置） */
export function getAppConfig(appId: string): AppConfig {
  return getAppState(appId).config
}

/* 写入应用状态：不存在则创建，存在则合并更新 */
function upsertState(
  appId: string,
  patch: { installed?: boolean; enabled?: boolean; config?: AppConfig }
): AppStateDTO {
  const existing = readRow(appId)
  const now = new Date().toISOString()
  const installed = patch.installed ?? existing?.installed === 1
  const enabled = patch.enabled ?? existing?.enabled === 1
  const row = {
    appId,
    installed: installed ? 1 : 0,
    enabled: enabled ? 1 : 0,
    config: JSON.stringify(patch.config ?? (existing ? parseConfig(existing.config) : {})),
    addTime: existing?.addTime ?? now,
    updateTime: now
  }
  getDb()
    .insert(appSettingTable)
    .values(row)
    .onConflictDoUpdate({
      target: appSettingTable.appId,
      set: {
        installed: row.installed,
        enabled: row.enabled,
        config: row.config,
        updateTime: row.updateTime
      }
    })
    .run()
  return toState(row)
}

/* 安装应用（幂等） */
export function installApp(appId: string): AppStateDTO {
  requireInstallableApp(appId)
  return upsertState(appId, { installed: true })
}

/* 卸载应用：仅更新状态，保留配置 */
export function uninstallApp(appId: string): AppStateDTO {
  requireKnownApp(appId)
  return upsertState(appId, { installed: false, enabled: false })
}

/* 启用 / 停用应用 */
export function setAppEnabled(appId: string, enabled: boolean): AppStateDTO {
  requireKnownApp(appId)
  return upsertState(appId, { enabled })
}

/* 合并保存应用配置 */
export function patchAppConfig(appId: string, patch: AppConfig): AppStateDTO {
  requireKnownApp(appId)
  return upsertState(appId, {
    config: { ...getAppConfig(appId), ...patch }
  })
}
