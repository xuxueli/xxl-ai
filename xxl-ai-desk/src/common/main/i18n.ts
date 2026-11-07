/*
 * 主进程 i18n 运行时：语言在启动时由设置确定（不支持运行时切换）。
 *   - 领域 service / IPC 的统一用户可见文案出口；
 *   - 语言未初始化前回退中文，保证启动期种子等流程可用。
 * @author xuxueli 2026-11-07
 */

import { translate } from '@common/shared/i18n'
import type { AppLanguage, TranslateParams } from '@common/shared/i18n'

/* 当前主进程语言 */
let currentLanguage: AppLanguage = 'zh'

/* 启动时设置语言（由组合根在读取设置后调用） */
export function setMainLanguage(language: AppLanguage): void {
  currentLanguage = language
}

/* 按当前语言取词 */
export function t(key: string, params?: TranslateParams): string {
  return translate(currentLanguage, key, params)
}
