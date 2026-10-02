import { app } from 'electron'
import { join } from 'path'
import Database from 'better-sqlite3'
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import * as schema from './schema'

/* SQLite 建表脚本：桌面端本地库，无需外部服务 */
const DDL = `
CREATE TABLE IF NOT EXISTS desk_provider (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL DEFAULT '',
  base_url    TEXT NOT NULL DEFAULT '',
  api_key     TEXT NOT NULL DEFAULT '',
  headers     TEXT NOT NULL DEFAULT '{}',
  models      TEXT NOT NULL DEFAULT '[]',
  enabled     INTEGER NOT NULL DEFAULT 1,
  sort        INTEGER NOT NULL DEFAULT 0,
  add_time    TEXT NOT NULL DEFAULT '',
  update_time TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS desk_session (
  id            TEXT PRIMARY KEY,
  title         TEXT NOT NULL DEFAULT '',
  provider_id   TEXT NOT NULL DEFAULT '',
  model_id      TEXT NOT NULL DEFAULT '',
  system_prompt TEXT NOT NULL DEFAULT '',
  add_time      TEXT NOT NULL DEFAULT '',
  update_time   TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS desk_message (
  id         TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  seq        INTEGER NOT NULL DEFAULT 0,
  role       TEXT NOT NULL DEFAULT '',
  content    TEXT NOT NULL DEFAULT '',
  data       TEXT NOT NULL DEFAULT '',
  add_time   TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS i_desk_message_session ON desk_message (session_id, seq);
CREATE TABLE IF NOT EXISTS desk_setting (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL DEFAULT ''
);
`

let sqlite: Database.Database | null = null
let database: BetterSQLite3Database<typeof schema> | null = null

/* 补齐历史库缺失字段（SQLite 不支持 ADD COLUMN IF NOT EXISTS） */
function ensureColumn(table: string, column: string, ddl: string): void {
  const columns = sqlite?.prepare(`PRAGMA table_info(${table})`).all() as
    | Array<{ name: string }>
    | undefined
  if (!columns || !columns.some((item) => item.name === column)) {
    sqlite?.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`)
  }
}

/* 初始化本地数据库（应用就绪后调用） */
export function initDatabase(): void {
  const file = join(app.getPath('userData'), 'xxl-ai-desk.sqlite')
  sqlite = new Database(file)
  sqlite.pragma('journal_mode = WAL')
  sqlite.exec(DDL)
  /* 兼容旧版本库：desk_provider 增补 headers 列 */
  ensureColumn('desk_provider', 'headers', "headers TEXT NOT NULL DEFAULT '{}'")
  database = drizzle(sqlite, { schema })
}

/* 获取 Drizzle 实例 */
export function getDb(): BetterSQLite3Database<typeof schema> {
  if (!database) {
    throw new Error('数据库尚未初始化')
  }
  return database
}

/* 获取原生连接（事务/关闭等场景） */
export function getSqlite(): Database.Database {
  if (!sqlite) {
    throw new Error('数据库尚未初始化')
  }
  return sqlite
}
