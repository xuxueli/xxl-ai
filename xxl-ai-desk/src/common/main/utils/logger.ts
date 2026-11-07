/*
 * 主进程运行日志：文件统一落到数据目录的 tmp/log 下，按天分片。
 *   - 文件名 yyyy-mm-dd.log，跨天自动切换；
 *   - 未捕获异常与 Promise 拒绝写入同一文件，避免只停留在控制台；
 *   - IPC 处理器异常统一经 logIpcError 记录，参数脱敏后再落盘。
 *
 * @author xuxueli 2026-10-31
 */

import { join } from 'path'
import log from 'electron-log/main'
import { RUNTIME_LOG_FORMAT, dailyLogFileName } from '@common/shared/runtimeLog'
import { ensureLogDir, getLogDir } from '@common/main/config/paths'

/* 初始化运行日志：按天切换文件，并接管未处理异常 */
export function initLogger(): void {
  ensureLogDir()
  log.initialize()
  /* 每次写入时按当前日期解析路径，跨天自动落到新文件 */
  log.transports.file.resolvePathFn = () => join(getLogDir(), dailyLogFileName())
  log.transports.file.format = RUNTIME_LOG_FORMAT
  /* 一天一个文件，关闭同文件大小滚动 */
  log.transports.file.maxSize = 0
  /* 未捕获异常 / Promise 拒绝：只写日志，不弹系统错误框 */
  log.errorHandler.startCatching({ showDialog: false })
}

/* 参数摘要：脱敏敏感字段并截断长文本，保证日志可定位又不泄漏密钥 */
function summarizeArgs(args: unknown[]): string {
  if (args.length === 0) {
    return ''
  }
  try {
    const text = JSON.stringify(args, (key, value) => {
      if (/(key|token|secret|password|authorization)/i.test(key)) {
        return '***'
      }
      if (typeof value === 'string' && value.length > 300) {
        return `${value.slice(0, 300)}…`
      }
      return value
    })
    return text.length > 1200 ? `${text.slice(0, 1200)}…` : text
  } catch {
    return '[unserializable]'
  }
}

/* 记录 IPC 处理器异常：通道 + 脱敏参数摘要 + 错误堆栈 */
export function logIpcError(channel: string, args: unknown[], error: unknown): void {
  const summary = summarizeArgs(args)
  log.error(`[ipc] ${channel} 执行失败${summary ? ` args=${summary}` : ''}`, error)
}
