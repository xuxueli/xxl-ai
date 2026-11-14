/*
 * 本地数据库运行时：better-sqlite3 + Drizzle，唯一连接出口。
 *   - 建表与种子由组合根（src/main/db.ts）聚合各模块片段后注入；
 *   - 启动时校验历史库结构，升级不兼容则备份旧库并重建，避免白屏；
 *   - 业务 service 只经 getDb() 读写。
 * @author xuxueli 2026-11-07
 */

import { copyFileSync, existsSync, mkdirSync, rmSync } from 'fs'
import { basename, dirname, extname, join } from 'path'
import Database from 'better-sqlite3'
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { getDbFile, getSkillsDir } from '../config/paths'

/* 原生 better-sqlite3 连接（建表与种子直接执行 SQL 用） */
let sqlite: Database.Database | null = null
/* Drizzle 实例（业务读写用） */
let database: BetterSQLite3Database | null = null

/* 字段结构：是否必填、是否有默认值（用于识别旧版必填字段） */
interface ColumnInfo {
  notNull: boolean
  hasDefault: boolean
}

/* 表结构快照：表名 → 字段名 → 字段结构 */
type SchemaSnapshot = Map<string, Map<string, ColumnInfo>>

/* 初始化失败原因：结构不兼容（升级导致）/ 数据库文件无法打开 */
type InitFailureReason = 'incompatible' | 'broken'

/* 单次打开失败信息 */
interface InitFailure {
  reason: InitFailureReason
  detail: string
}

/* 数据库初始化结果：recovered 表示旧库已备份并重建 */
export interface DatabaseInitResult {
  recovered: boolean /* 是否执行了备份重建 */
  reason?: InitFailureReason /* 重建原因 */
  detail?: string /* 具体原因：缺失字段或 SQLite 报错 */
  backupFile?: string /* 旧库备份文件路径 */
}

/* 初始化本地数据库：校验结构、执行聚合后的 DDL、依次执行各域种子 */
export function initDatabase(
  ddl: string,
  seeds: Array<(db: Database.Database) => void> = []
): DatabaseInitResult {
  const file = getDbFile()
  mkdirSync(dirname(file), { recursive: true })
  mkdirSync(getSkillsDir(), { recursive: true })

  /* 期望结构由 DDL 在内存库中生成，避免另维护一份字段清单 */
  const expected = readExpectedSchema(ddl)
  const failure = tryOpenDatabase(file, ddl, seeds, expected)
  if (!failure) {
    return { recovered: false }
  }

  /* 旧库备份后重建：关闭连接再复制，避免 WAL 未落盘或文件被占用 */
  closeDatabase()
  const backupFile = existsSync(file) ? backupDatabaseFile(file) : undefined
  removeDatabaseFiles(file)
  /* 重建仍失败说明问题不在历史数据，直接抛给启动入口提示并退出 */
  const retryFailure = tryOpenDatabase(file, ddl, seeds, expected)
  if (retryFailure) {
    closeDatabase()
    throw new Error(retryFailure.detail)
  }
  return { recovered: true, reason: failure.reason, detail: failure.detail, backupFile }
}

/* 获取 Drizzle 实例 */
export function getDb(): BetterSQLite3Database {
  if (!database) {
    throw new Error('数据库尚未初始化')
  }
  return database
}

/* 打开库并建表、校验结构、播种；返回失败原因，成功返回 null */
function tryOpenDatabase(
  file: string,
  ddl: string,
  seeds: Array<(db: Database.Database) => void>,
  expected: SchemaSnapshot
): InitFailure | null {
  closeDatabase()
  try {
    const connection = new Database(file)
    sqlite = connection
    connection.pragma('journal_mode = WAL')
    connection.exec(ddl)
    /* 建表后仍有缺字段，说明是旧版表结构，新代码写入会失败 */
    const mismatch = describeMismatch(expected, readSchema(connection))
    if (mismatch) {
      return { reason: 'incompatible', detail: mismatch }
    }
    for (const seed of seeds) {
      seed(connection)
    }
    database = drizzle(connection)
    return null
  } catch (error) {
    return { reason: 'broken', detail: error instanceof Error ? error.message : String(error) }
  }
}

/* 关闭连接：连接可能已失效，异常忽略即可 */
function closeDatabase(): void {
  database = null
  if (!sqlite) {
    return
  }
  try {
    sqlite.close()
  } catch {
    /* 已关闭或文件损坏时关闭失败不影响后续重建 */
  }
  sqlite = null
}

/* 在临时内存库执行 DDL，得到期望的表结构 */
function readExpectedSchema(ddl: string): SchemaSnapshot {
  const memory = new Database(':memory:')
  try {
    memory.exec(ddl)
    return readSchema(memory)
  } finally {
    memory.close()
  }
}

/* 读取库中全部用户表结构 */
function readSchema(connection: Database.Database): SchemaSnapshot {
  const tables = connection
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
    .all() as Array<{ name: string }>
  const snapshot: SchemaSnapshot = new Map()
  for (const { name } of tables) {
    const columns = connection.prepare(`PRAGMA table_info("${name.replaceAll('"', '""')}")`).all() as Array<{
      name: string
      notnull: number
      dflt_value: string | null
    }>
    const columnMap = new Map<string, ColumnInfo>()
    for (const column of columns) {
      columnMap.set(column.name, { notNull: column.notnull === 1, hasDefault: column.dflt_value !== null })
    }
    snapshot.set(name, columnMap)
  }
  return snapshot
}

/* 对比期望结构与实际结构：缺少字段或残留旧版必填字段都需要重建 */
function describeMismatch(expected: SchemaSnapshot, actual: SchemaSnapshot): string | null {
  for (const [table, expectedColumns] of expected) {
    const actualColumns = actual.get(table)
    if (!actualColumns) {
      return `数据表 ${table} 不存在`
    }
    const missing = [...expectedColumns.keys()].filter((column) => !actualColumns.has(column))
    if (missing.length > 0) {
      return `数据表 ${table} 缺少字段：${missing.join('、')}`
    }
    /* 旧版遗留的必填无默认字段：新代码不再写入，插入会直接失败 */
    const legacyRequired = [...actualColumns.entries()]
      .filter(([column, info]) => !expectedColumns.has(column) && info.notNull && !info.hasDefault)
      .map(([column]) => column)
    if (legacyRequired.length > 0) {
      return `数据表 ${table} 存在旧版必填字段：${legacyRequired.join('、')}`
    }
  }
  return null
}

/* 备份旧库文件：{旧文件名}-backup-{yyyymmdd-HHmmss}{旧后缀} */
function backupDatabaseFile(file: string): string {
  const ext = extname(file)
  const base = basename(file, ext)
  const stamp = formatStamp(new Date())
  let target = join(dirname(file), `${base}-backup-${stamp}${ext}`)
  /* 同一秒内多次重建时追加序号，避免覆盖已有备份 */
  let index = 2
  while (existsSync(target)) {
    target = join(dirname(file), `${base}-backup-${stamp}-${index}${ext}`)
    index += 1
  }
  copyFileSync(file, target)
  return target
}

/* 删除库文件及其日志文件，确保从空库重建 */
function removeDatabaseFiles(file: string): void {
  for (const suffix of ['', '-wal', '-shm', '-journal']) {
    rmSync(`${file}${suffix}`, { force: true })
  }
}

/* 本地时间戳：yyyyMMdd-HHmmss */
function formatStamp(date: Date): string {
  const pad = (value: number): string => String(value).padStart(2, '0')
  const day = `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`
  const time = `${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
  return `${day}-${time}`
}
