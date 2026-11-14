/*
 * 启动异常提示：数据库升级不兼容或启动失败时，向用户说明原因与已执行的动作，
 * 避免界面停留在白屏且底层错误不可见。
 * @author xuxueli 2026-11-14
 */

import { dialog } from 'electron'
import log from 'electron-log/main'
import type { DatabaseInitResult } from '@common/main/db'
import { getLogDir } from '@common/main/config/paths'
import { t } from '@common/main/i18n'

/* 异常对象 → 可读文本 */
function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/* 数据库重建提示：说明原因、备份文件与已执行的动作 */
export async function showDatabaseRecoveryNotice(result: DatabaseInitResult): Promise<void> {
  const reason =
    result.reason === 'incompatible' ? t('runtime.startup.incompatible') : t('runtime.startup.broken')
  const backupFile = result.backupFile ?? t('runtime.startup.noBackup')
  log.warn(`[startup] 数据库已重建：${reason}；备份文件：${backupFile}`)
  await dialog.showMessageBox({
    type: 'warning',
    title: t('runtime.startup.recoveryTitle'),
    message: t('runtime.startup.recoveryMessage'),
    detail: t('runtime.startup.recoveryDetail', [reason, result.detail ?? '', backupFile, getLogDir()]),
    buttons: [t('common.confirm')],
    noLink: true
  })
}

/* 启动失败提示：记录错误并弹出错误框，由调用方决定是否退出 */
export async function showStartupFailure(error: unknown): Promise<void> {
  const detail = describeError(error)
  log.error('[startup] 应用初始化失败', error)
  await dialog.showMessageBox({
    type: 'error',
    title: t('runtime.startup.failureTitle'),
    message: t('runtime.startup.failureMessage'),
    detail: t('runtime.startup.failureDetail', [detail, getLogDir()]),
    buttons: [t('common.confirm')],
    noLink: true
  })
}
