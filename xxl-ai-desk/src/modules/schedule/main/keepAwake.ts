/*
 * 定时任务休眠策略：仅跟随用户开关，与是否存在任务无关。
 *   - 使用 prevent-app-suspension：允许屏幕关闭，但避免应用被系统挂起；
 *   - 启停保持幂等，由设置保存、应用启动与退出统一调用。
 * @author xuxueli 2026-11-15
 */

import { powerSaveBlocker } from 'electron'
import { getSettings } from '@modules/settings/main'

/* 当前 blocker id；null 表示未持有 */
let blockerId: number | null = null

/* 按开关同步 blocker */
export function syncKeepAwake(): void {
  const shouldKeep = getSettings().scheduleKeepAwake
  if (shouldKeep) {
    if (blockerId === null) {
      blockerId = powerSaveBlocker.start('prevent-app-suspension')
    }
    return
  }
  if (blockerId !== null) {
    powerSaveBlocker.stop(blockerId)
    blockerId = null
  }
}

/* 退出时释放，避免系统残留不休眠状态 */
export function disposeKeepAwake(): void {
  if (blockerId !== null) {
    powerSaveBlocker.stop(blockerId)
    blockerId = null
  }
}
