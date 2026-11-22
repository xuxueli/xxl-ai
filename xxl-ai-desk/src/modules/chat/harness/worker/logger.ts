/*
 * 运行时进程日志：复用主进程下发的日志目录，按天写入同一份日志文件。
 *   - 目录经 XXL_AI_RUNTIME_LOG_DIR 注入，避免运行时进程直接依赖主进程路径配置；
 *   - 未捕获异常与 Promise 拒绝同样落盘。
 *
 * @author xuxueli 2026-10-31
 */

import { mkdirSync } from 'fs'
import { join } from 'path'
import log from 'electron-log/main'
import { RUNTIME_LOG_FORMAT, dailyLogFileName } from '@common/shared/runtimeLog'

/* 初始化运行时日志；未下发目录时沿用 electron-log 默认路径 */
export function initWorkerLogger(): void {
  const dir = process.env.XXL_AI_RUNTIME_LOG_DIR?.trim()
  if (!dir) {
    return
  }
  mkdirSync(dir, { recursive: true })
  log.transports.file.resolvePathFn = () => join(dir, dailyLogFileName())
  log.transports.file.format = RUNTIME_LOG_FORMAT
  log.transports.file.maxSize = 0
  log.errorHandler.startCatching({ showDialog: false })
}
