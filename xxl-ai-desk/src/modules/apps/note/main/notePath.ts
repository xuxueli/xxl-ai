/*
 * 笔记存储目录解析：默认目录 / 自定义目录 与可写性探测。
 *   - 默认目录：数据目录下的 notes；
 *   - 自定义目录不可写时抛错，不静默回退。
 * @author xuxueli 2026-11-08
 */

import { isAbsolute, resolve } from 'path'
import { ensureWritableDir, getNotesDir } from '@common/main/config/paths'
import { t } from '@common/main/i18n'

/* 默认笔记目录：数据目录下的 notes */
function getDefaultNoteDir(): string {
  return getNotesDir()
}

/* 解析后的笔记根目录 */
export interface ResolvedNoteRoot {
  /* 实际生效目录 */
  root: string
  /* 默认目录 */
  defaultDir: string
}

/* 解析生效目录：自定义优先，否则使用默认目录 */
export function resolveNoteRoot(configured: string): ResolvedNoteRoot {
  const defaultDir = getDefaultNoteDir()
  const value = configured.trim()
  if (value) {
    if (!isAbsolute(value)) {
      throw new Error(t('runtime.error.noteStorageInvalid'))
    }
    const custom = resolve(value)
    if (!ensureWritableDir(custom)) {
      throw new Error(t('runtime.error.noteStorageUnwritable'))
    }
    return { root: custom, defaultDir }
  }
  if (!ensureWritableDir(defaultDir)) {
    throw new Error(t('runtime.error.noteStorageUnwritable'))
  }
  return { root: defaultDir, defaultDir }
}
