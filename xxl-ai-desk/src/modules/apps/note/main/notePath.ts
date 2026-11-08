/*
 * 笔记存储目录解析：软件安装目录 / 默认目录 / 可写性探测与回退。
 *   - 默认目录：安装目录下的 note；
 *   - 安装目录不可写时回退数据目录下的 note，并标记 fallback 供界面提示；
 *   - 自定义目录不可写时抛错，不静默回退。
 * @author xuxueli 2026-11-08
 */

import { app } from 'electron'
import { mkdirSync, rmSync, writeFileSync } from 'fs'
import { dirname, isAbsolute, join, resolve } from 'path'
import { getDataDir } from '@common/main/config/paths'
import { t } from '@common/main/i18n'

/* 安装目录：macOS 取 .app 所在目录，Windows / Linux 取可执行文件所在目录 */
function getInstallDir(): string {
  if (!app.isPackaged) {
    return app.getAppPath()
  }
  if (process.platform === 'darwin') {
    const marker = '.app/Contents/'
    const index = process.execPath.indexOf(marker)
    return index >= 0 ? process.execPath.slice(0, index) : dirname(process.execPath)
  }
  return dirname(process.execPath)
}

/* 默认笔记目录：安装目录下的 note */
function getDefaultNoteDir(): string {
  return join(getInstallDir(), 'note')
}

/* 确保目录存在且可写：mkdir + 写探针，失败返回 false */
export function ensureWritableDir(dir: string): boolean {
  try {
    mkdirSync(dir, { recursive: true })
    const probe = join(dir, `.write-test-${process.pid}`)
    writeFileSync(probe, 'ok', 'utf-8')
    rmSync(probe, { force: true })
    return true
  } catch {
    return false
  }
}

/* 解析后的笔记根目录 */
export interface ResolvedNoteRoot {
  /* 实际生效目录 */
  root: string
  /* 默认目录不可写而回退 */
  fallback: boolean
  /* 默认目录 */
  defaultDir: string
}

/* 解析生效目录：自定义优先；默认目录不可写时回退数据目录 */
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
    return { root: custom, fallback: false, defaultDir }
  }
  if (ensureWritableDir(defaultDir)) {
    return { root: defaultDir, fallback: false, defaultDir }
  }
  const fallbackDir = join(getDataDir(), 'note')
  if (!ensureWritableDir(fallbackDir)) {
    throw new Error(t('runtime.error.noteStorageUnwritable'))
  }
  return { root: fallbackDir, fallback: true, defaultDir }
}
