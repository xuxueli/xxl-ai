/*
 * 跨进程 i18n 运行时：公共词条内置，领域词条由组合根注册。
 *   - 主进程入口 / Worker 入口在启动时注册领域词条；
 *   - 渲染层由 shell/i18n 合并全部词条后交给 vue-i18n。
 * @author xuxueli 2026-10-26
 */

import zh from './locales/zh.json'
import en from './locales/en.json'

/* 应用语言 */
export type AppLanguage = 'zh' | 'en'

/* 插值参数 */
export type TranslateParams = Array<string | number> | Record<string, string | number>

/* 语言包：顶层键为领域命名空间 */
type Messages = Record<string, unknown>

/* 已注册词条：默认只含跨域公共词条 */
const dictionaries: Record<AppLanguage, Messages> = { zh, en }

/* 深合并词条，避免领域注册覆盖公共命名空间 */
function mergeMessages(target: Messages, source: Messages): Messages {
  const result: Messages = { ...target }
  for (const [key, value] of Object.entries(source)) {
    const current = result[key]
    if (
      current &&
      typeof current === 'object' &&
      !Array.isArray(current) &&
      value &&
      typeof value === 'object' &&
      !Array.isArray(value)
    ) {
      result[key] = mergeMessages(current as Messages, value as Messages)
    } else {
      result[key] = value
    }
  }
  return result
}

/* 注册领域词条：主进程 / Worker 组合根调用 */
export function configureMessages(messages: Partial<Record<AppLanguage, Messages>>): void {
  for (const language of ['zh', 'en'] as const) {
    const source = messages[language]
    if (source) {
      dictionaries[language] = mergeMessages(dictionaries[language], source)
    }
  }
}

/* 按点号路径读取词条 */
function lookup(source: unknown, key: string): string | undefined {
  let current = source as Record<string, unknown>
  for (const segment of key.split('.')) {
    if (!current || typeof current !== 'object') {
      return undefined
    }
    current = current[segment] as Record<string, unknown>
  }
  return typeof current === 'string' ? current : undefined
}

/* 替换 {0} / {name} 占位符 */
function interpolate(text: string, params?: TranslateParams): string {
  if (!params) {
    return text
  }
  return text.replace(/\{(\w+)\}/g, (match, name: string) => {
    if (Array.isArray(params)) {
      const value = params[Number(name)]
      return value === undefined ? match : String(value)
    }
    const value = params[name]
    return value === undefined ? match : String(value)
  })
}

/* 取词：目标语言缺失时回退中文，再回退 key */
export function translate(
  language: string,
  key: string,
  params?: TranslateParams
): string {
  const target = language === 'en' ? dictionaries.en : dictionaries.zh
  const text = lookup(target, key) ?? lookup(dictionaries.zh, key)
  return text === undefined ? key : interpolate(text, params)
}
