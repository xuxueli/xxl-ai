/*
 * 对话消息展示格式化：时间、耗时与 token 文案。
 * @author xuxueli 2026-10-25
 */

import { t } from '@renderer/shell/i18n'

/* 格式化发送时间：ISO 字符串 → 展示文案，非法值返回空串（当天仅时分，跨天补充月日） */
export function formatTime(iso: string): string {
  if (!iso) {
    return ''
  }
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) {
    return ''
  }
  const pad = (value: number): string => String(value).padStart(2, '0')
  const hourMinute = `${pad(date.getHours())}:${pad(date.getMinutes())}`
  const nowDate = new Date()
  const sameDay =
    date.getFullYear() === nowDate.getFullYear() &&
    date.getMonth() === nowDate.getMonth() &&
    date.getDate() === nowDate.getDate()
  return sameDay
    ? hourMinute
    : `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${hourMinute}`
}

/* 耗时格式化：1s 以下用毫秒，以上用秒（保留一位小数） */
export function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${Math.max(0, Math.round(ms))}ms`
  }
  return `${(ms / 1000).toFixed(1)}s`
}

/* 上下文用量紧凑展示：小于 1000 显示原数字，其余统一用 K（保留 1 位小数） */
export function formatCompactTokens(value: number): string {
  const tokens = Math.max(0, Math.round(value))
  return tokens < 1000 ? String(tokens) : `${(tokens / 1000).toFixed(1)}K`
}

/* 完整 token 数字：千分位展示（tooltip 用） */
export function formatTokenCount(value: number, language: string): string {
  return new Intl.NumberFormat(language === 'en' ? 'en-US' : 'zh-CN').format(
    Math.max(0, value)
  )
}

/* 大数字 token 紧凑展示：K / M（保留 1 位小数，整数去掉 .0），用于底部指标胶囊 */
export function formatLargeTokens(value: number): string {
  const tokens = Math.max(0, value)
  if (tokens < 1000) {
    return String(Math.round(tokens))
  }
  const compact =
    tokens < 1_000_000 ? `${(tokens / 1000).toFixed(1)}K` : `${(tokens / 1_000_000).toFixed(1)}M`
  return compact.replace(/\.0([KM])$/, '$1')
}

/* 长耗时展示：小时 / 分钟 / 秒，高位为 0 时省略（用户可见单位走 i18n） */
export function formatLongDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.round(ms / 1000))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  if (hours > 0) {
    return t('chat.duration.hour', [hours, minutes])
  }
  if (minutes > 0) {
    return t('chat.duration.minute', [minutes, seconds])
  }
  return t('chat.duration.second', [seconds])
}
