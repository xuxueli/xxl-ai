/*
 * settings 模块跨进程公共契约出口。
 * @author xuxueli 2026-11-07
 */

export type { SettingsApi } from './api'
export {
  BACKGROUND_OPACITY_MAX,
  BACKGROUND_OPACITY_MIN,
  SCHEDULE_MAX_CONCURRENCY_MAX,
  SCHEDULE_MAX_CONCURRENCY_MIN,
  SCHEDULE_WATCHDOG_MAX,
  SCHEDULE_WATCHDOG_MIN,
  THEME_PRESETS
} from './contracts'
export type { AppSettings, BrandingAssets, BrandingKind, SessionDefaults } from './contracts'
export { DEFAULT_APP_SETTINGS, NEW_CHAT_TITLE, createDefaultSettings } from './defaults'
