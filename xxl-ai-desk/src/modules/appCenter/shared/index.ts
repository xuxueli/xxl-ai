/*
 * appCenter 模块公共契约出口。
 * @author xuxueli 2026-11-08
 */

export type { AppCenterApi } from './api'
export type { AppStateDTO } from './contracts'
export { APP_CENTER_IPC } from './ipc'
export { APP_AVAILABILITIES, APP_CATEGORIES, BUILTIN_APPS, appOfPath, isAppPage } from './registry'
export type { AppAvailability, AppCategory, BuiltinApp } from './registry'
