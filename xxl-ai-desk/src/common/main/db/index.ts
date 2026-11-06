/*
 * 本地数据库运行时：better-sqlite3 + Drizzle，唯一连接出口。
 *   - 建表与种子由组合根（src/main/db.ts）聚合各模块片段后注入；
 *   - 业务 service 只经 getDb() 读写。
 * @author xuxueli 2026-11-07
 */

import { mkdirSync } from 'fs'
import { dirname } from 'path'
import Database from 'better-sqlite3'
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { getDbFile, getSkillsDir } from '../config/paths'

/* 原生 better-sqlite3 连接（建表与种子直接执行 SQL 用） */
let sqlite: Database.Database | null = null
/* Drizzle 实例（业务读写用） */
let database: BetterSQLite3Database | null = null

/* 初始化本地数据库：执行聚合后的 DDL，再依次执行各域种子 */
export function initDatabase(
  ddl: string,
  seeds: Array<(db: Database.Database) => void> = []
): void {
  const file = getDbFile()
  mkdirSync(dirname(file), { recursive: true })
  mkdirSync(getSkillsDir(), { recursive: true })
  sqlite = new Database(file)
  sqlite.pragma('journal_mode = WAL')
  sqlite.exec(ddl)
  for (const seed of seeds) {
    seed(sqlite)
  }
  database = drizzle(sqlite)
}

/* 获取 Drizzle 实例 */
export function getDb(): BetterSQLite3Database {
  if (!database) {
    throw new Error('数据库尚未初始化')
  }
  return database
}
