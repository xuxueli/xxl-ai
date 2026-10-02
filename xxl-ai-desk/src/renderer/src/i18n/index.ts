import { createI18n } from 'vue-i18n'
import zh from './locales/zh.json'
import en from './locales/en.json'

/* 国际化：语言由设置驱动，不支持运行时切换（重启生效） */
export const i18n = createI18n({
  legacy: false,
  locale: 'zh',
  fallbackLocale: 'zh',
  messages: { zh, en }
})

/* 全局翻译函数快捷方式 */
export const t = i18n.global.t

/* 应用语言 */
export function setLanguage(language: 'zh' | 'en'): void {
  i18n.global.locale.value = language
}
