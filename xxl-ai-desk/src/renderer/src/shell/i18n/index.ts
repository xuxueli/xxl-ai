/* 国际化组合根：装配公共词条与各领域词条，注册到 common 的 i18n 单例 */
import { i18n, registerMessages, setLanguage, t } from '@common/renderer/i18n'
import zhCommon from '@common/shared/i18n/locales/zh.json'
import enCommon from '@common/shared/i18n/locales/en.json'
import zhAgent from '@modules/agent/i18n/zh.json'
import enAgent from '@modules/agent/i18n/en.json'
import zhApp from '@modules/platform/i18n/zh.json'
import enApp from '@modules/platform/i18n/en.json'
import zhAppCenter from '@modules/appCenter/i18n/zh.json'
import enAppCenter from '@modules/appCenter/i18n/en.json'
import zhNote from '@modules/apps/note/i18n/zh.json'
import enNote from '@modules/apps/note/i18n/en.json'
import zhBrowser from '@modules/browser/i18n/zh.json'
import enBrowser from '@modules/browser/i18n/en.json'
import zhChat from '@modules/chat/i18n/zh.json'
import enChat from '@modules/chat/i18n/en.json'
import zhGit from '@modules/git/i18n/zh.json'
import enGit from '@modules/git/i18n/en.json'
import zhPlugin from '@modules/plugin/i18n/zh.json'
import enPlugin from '@modules/plugin/i18n/en.json'
import zhProject from '@modules/project/i18n/zh.json'
import enProject from '@modules/project/i18n/en.json'
import zhSchedule from '@modules/schedule/i18n/zh.json'
import enSchedule from '@modules/schedule/i18n/en.json'
import zhSettings from '@modules/settings/i18n/zh.json'
import enSettings from '@modules/settings/i18n/en.json'
import zhToolPanel from '@modules/toolPanel/i18n/zh.json'
import enToolPanel from '@modules/toolPanel/i18n/en.json'

/* 词条装配：公共词条在前，领域词条按模块顺序合并 */
registerMessages({
  zh: {
    ...zhCommon,
    ...zhAgent,
    ...zhApp,
    ...zhAppCenter,
    ...zhNote,
    ...zhBrowser,
    ...zhChat,
    ...zhGit,
    ...zhPlugin,
    ...zhProject,
    ...zhSchedule,
    ...zhSettings,
    ...zhToolPanel
  },
  en: {
    ...enCommon,
    ...enAgent,
    ...enApp,
    ...enAppCenter,
    ...enNote,
    ...enBrowser,
    ...enChat,
    ...enGit,
    ...enPlugin,
    ...enProject,
    ...enSchedule,
    ...enSettings,
    ...enToolPanel
  }
})

export { i18n, setLanguage, t }
