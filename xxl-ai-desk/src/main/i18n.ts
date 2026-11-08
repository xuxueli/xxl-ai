/*
 * 主进程 i18n 组合根：注册各领域词条，供 service / 运行时使用。
 * @author xuxueli 2026-11-07
 */

import { configureMessages } from '@common/shared/i18n'
import zhAgent from '@modules/agent/i18n/zh.json'
import enAgent from '@modules/agent/i18n/en.json'
import zhApp from '@modules/platform/i18n/zh.json'
import enApp from '@modules/platform/i18n/en.json'
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

configureMessages({
  zh: { ...zhAgent, ...zhApp, ...zhChat, ...zhGit, ...zhPlugin, ...zhProject, ...zhSettings, ...zhToolPanel },
  en: { ...enAgent, ...enApp, ...enChat, ...enGit, ...enPlugin, ...enProject, ...enSettings, ...enToolPanel }
})
