/*
 * 应用设置组件注册表：由渲染层装配处登记，appCenter 按 appId 取用，避免反向依赖子应用。
 * @author xuxueli 2026-11-08
 */

import type { Component } from 'vue'

const settingsComponents = new Map<string, Component>()

/* 登记应用设置组件（重复登记覆盖） */
export function registerAppSettings(appId: string, component: Component): void {
  settingsComponents.set(appId, component)
}

/* 读取应用设置组件 */
export function appSettingsOf(appId: string): Component | undefined {
  return settingsComponents.get(appId)
}
