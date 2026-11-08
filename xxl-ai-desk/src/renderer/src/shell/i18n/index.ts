/* 国际化：装配公共词条与各领域词条，语言由设置驱动 */
import { createI18n } from 'vue-i18n'
import zhCommon from '@common/shared/i18n/locales/zh.json'
import enCommon from '@common/shared/i18n/locales/en.json'
import zhAgent from '@modules/agent/i18n/zh.json'
import enAgent from '@modules/agent/i18n/en.json'
import zhApp from '@modules/platform/i18n/zh.json'
import zhAppCenter from '@modules/appCenter/i18n/zh.json'
import zhNote from '@modules/apps/note/i18n/zh.json'
import enApp from '@modules/platform/i18n/en.json'
import enAppCenter from '@modules/appCenter/i18n/en.json'
import enNote from '@modules/apps/note/i18n/en.json'
import zhChat from '@modules/chat/i18n/zh.json'
import enChat from '@modules/chat/i18n/en.json'
import zhGit from '@modules/git/i18n/zh.json'
import enGit from '@modules/git/i18n/en.json'
import zhPlugin from '@modules/plugin/i18n/zh.json'
import enPlugin from '@modules/plugin/i18n/en.json'
import zhProject from '@modules/project/i18n/zh.json'
import enProject from '@modules/project/i18n/en.json'
import zhSettings from '@modules/settings/i18n/zh.json'
import enSettings from '@modules/settings/i18n/en.json'
import zhToolPanel from '@modules/toolPanel/i18n/zh.json'
import enToolPanel from '@modules/toolPanel/i18n/en.json'

/* 国际化：语言由设置驱动，不支持运行时切换（重启生效） */
export const i18n = createI18n({
  legacy: false,
  locale: 'zh',
  fallbackLocale: 'zh',
  messages: {
    zh: { ...zhCommon, ...zhAgent, ...zhApp, ...zhAppCenter, ...zhNote, ...zhChat, ...zhGit, ...zhPlugin, ...zhProject, ...zhSettings, ...zhToolPanel },
    en: { ...enCommon, ...enAgent, ...enApp, ...enAppCenter, ...enNote, ...enChat, ...enGit, ...enPlugin, ...enProject, ...enSettings, ...enToolPanel }
  }
})

/* 全局翻译函数快捷方式 */
export const t = i18n.global.t

/* 应用语言 */
export function setLanguage(language: 'zh' | 'en'): void {
  i18n.global.locale.value = language
}
