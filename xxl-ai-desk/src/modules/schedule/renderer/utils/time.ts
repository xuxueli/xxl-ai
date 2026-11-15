/*
 * 定时任务时间展示：统一本地时间格式。
 * @author xuxueli 2026-11-15
 */

/* 两位补零 */
function pad(value: number): string {
  return String(value).padStart(2, '0')
}

/* ISO → 本地日期键 YYYY-MM-DD（运行记录按本地日期筛选）；非法值返回空串 */
export function localDateKey(iso: string): string {
  if (!iso) {
    return ''
  }
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) {
    return ''
  }
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
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
