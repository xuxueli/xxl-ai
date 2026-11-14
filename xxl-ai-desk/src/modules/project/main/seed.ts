/*
 * 项目内置初始化：每次启动时检查，项目表为空则创建默认项目空间，保证应用始终至少有一个可用项目。
 *   - 默认项目绑定 {数据目录}/projects/default；
 *   - 项目表非空时不创建；用户清空全部项目后，下次启动重建默认项目。
 * @author xuxueli 2026-11-14
 */

import { mkdirSync } from 'fs'
import { join } from 'path'
import type Database from 'better-sqlite3'
import { getProjectsDir } from '@common/main/config/paths'
import { translate } from '@common/shared/i18n'

/* 读取设置表中的语言：数据库初始化早于主进程 i18n 运行时，需直接查表 */
function readLanguage(db: Database.Database): 'zh' | 'en' {
  const row = db.prepare('SELECT value FROM desk_setting WHERE key = ?').get('language') as
    | { value: string }
    | undefined
  return row?.value === 'en' ? 'en' : 'zh'
}

export function ensureDefaultProject(db: Database.Database): void {
  const defaultDir = join(getProjectsDir(), 'default')
  /* 默认项目已存在：仅修复目录，不做其它处理 */
  const existing = db.prepare('SELECT 1 FROM desk_project WHERE path = ?').get(defaultDir)
  if (existing) {
    mkdirSync(defaultDir, { recursive: true, mode: 0o700 })
    return
  }
  /* 项目表非空：尊重用户删除默认项目的选择，不重建 */
  if (db.prepare('SELECT 1 FROM desk_project LIMIT 1').get()) {
    return
  }
  const now = new Date().toISOString()
  mkdirSync(defaultDir, { recursive: true, mode: 0o700 })
  db.prepare(`
    INSERT INTO desk_project
      (name, path, memory_enabled, memory, memory_last_time, memory_update_time, add_time, update_time)
    VALUES (?, ?, 0, '', '', '', ?, ?)
  `).run(translate(readLanguage(db), 'project.defaultName'), defaultDir, now, now)
}
