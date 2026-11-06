/*
 * 对话消息展示格式化：时间与耗时（纯函数）。
 * @author xuxueli 2026-10-25
 */

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
