/*
 * 渲染层国际化实例：只持有 vue-i18n 单例与全局翻译函数。
 *   - 词条由组合根 `renderer/src/shell/i18n` 装配后注册，本层不依赖任何模块；
 *   - 公共组件 / 领域模块统一从这里取 `t`，避免反向依赖 shell。
 * @author xuxueli 2026-11-15
 */

import { createI18n } from 'vue-i18n'

/* 词条语言包（各语言顶层 key 直接合并） */
export interface RendererMessages {
  zh: Record<string, unknown>
  en: Record<string, unknown>
}

/* 语言由配置驱动，不支持运行时切换（重启生效）；默认中文、缺失回退中文 */
export const i18n = createI18n({
  legacy: false,
  locale: 'zh',
  fallbackLocale: 'zh',
  messages: { zh: {}, en: {} }
})

/* 全局翻译函数快捷方式 */
export const t = i18n.global.t

/* 注册词条：由组合根在应用启动时调用一次 */
export function registerMessages(messages: RendererMessages): void {
  i18n.global.mergeLocaleMessage('zh', messages.zh)
  i18n.global.mergeLocaleMessage('en', messages.en)
}

/* 应用语言 */
export function setLanguage(language: 'zh' | 'en'): void {
  i18n.global.locale.value = language
}
