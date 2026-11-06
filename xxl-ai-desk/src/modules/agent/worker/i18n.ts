/*
 * Worker i18n 组合根：注册运行时所需的领域词条。
 * @author xuxueli 2026-11-07
 */

import { configureMessages } from '@common/shared/i18n'
import zhAgent from '@modules/agent/i18n/zh.json'
import enAgent from '@modules/agent/i18n/en.json'
import zhChat from '@modules/chat/i18n/zh.json'
import enChat from '@modules/chat/i18n/en.json'

configureMessages({
  zh: { ...zhAgent, ...zhChat },
  en: { ...enAgent, ...enChat }
})
