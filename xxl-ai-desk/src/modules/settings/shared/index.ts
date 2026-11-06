/*
 * settings 模块跨进程公共契约出口。
 * @author xuxueli 2026-11-07
 */

export type { SettingsApi } from './api'
export { THEME_PRESETS } from './contracts'
export type { AppSettings } from './contracts'
export { NEW_CHAT_TITLE, createDefaultSettings } from './defaults'
