/*
 * 定时任务时间展示：统一本地时间格式。
 * @author xuxueli 2026-11-15
 */

/* 两位补零 */
function pad(value: number): string {
  return String(value).padStart(2, '0')
}

/* ISO → 本地 YYYY-MM-DD HH:mm；空值返回空串 */
export function formatDateTime(iso: string): string {
  if (!iso) {
    return ''
  }
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) {
    return ''
  }
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/* ISO → 本地 YYYY-MM-DD HH:mm:ss（触发规则预览需要秒级精度）；空值返回空串 */
export function formatDateTimeSeconds(iso: string): string {
  if (!iso) {
    return ''
  }
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) {
    return ''
  }
  return `${formatDateTime(iso)}:${pad(date.getSeconds())}`
}

/*
 * 本地日期区间 → 查询边界：上界取右端次日 0 点，保证右端当天包含在内。
 * 日志查询与日志清理共用，null 表示不限时间。
 */
export function dayRangeBounds(dates: [string, string] | null): {
  startTime?: string
  endTime?: string
} {
  if (!dates) {
    return {}
  }
  const [firstDay, lastDay] = dates
  const start = new Date(`${firstDay}T00:00:00`)
  const end = new Date(`${lastDay}T00:00:00`)
  end.setDate(end.getDate() + 1)
  return { startTime: start.toISOString(), endTime: end.toISOString() }
}
