/*
 * 运行日志文件命名与格式：主进程与运行时进程共用，保证同一目录、同一天写入同一文件。
 *   - 仅描述磁盘上的运行日志，不含会话消息与模型通讯记录。
 *
 * @author xuxueli 2026-10-31
 */

/* 按本地日期生成文件名：log-yyyy-mm-dd.log */
export function dailyLogFileName(date = new Date()): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `log-${year}-${month}-${day}.log`
}

/* 单行运行日志格式：时间 + 级别 + 内容 */
export const RUNTIME_LOG_FORMAT = '{y}-{m}-{d} {h}:{i}:{s}.{ms} [{level}] {text}'
