import { mkdirSync } from 'fs'
import { dirname } from 'path'
import Database from 'better-sqlite3'
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { getDbFile } from '../services/storageService'
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
CREATE TABLE IF NOT EXISTS desk_project (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL DEFAULT '',
  path        TEXT NOT NULL DEFAULT '',
  add_time    TEXT NOT NULL DEFAULT '',
  update_time TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS desk_session (
  id            TEXT PRIMARY KEY,
  title         TEXT NOT NULL DEFAULT '',
  project_id    TEXT NOT NULL DEFAULT '',
  provider_id   TEXT NOT NULL DEFAULT '',
  model_id      TEXT NOT NULL DEFAULT '',
  mode          TEXT NOT NULL DEFAULT 'build',
  system_prompt TEXT NOT NULL DEFAULT '',
  add_time      TEXT NOT NULL DEFAULT '',
  update_time   TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS i_desk_session_project ON desk_session (project_id);
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

/* 初始化本地数据库（应用就绪后调用） */
export function initDatabase(): void {
  const file = getDbFile()
  mkdirSync(dirname(file), { recursive: true })
  sqlite = new Database(file)
  sqlite.pragma('journal_mode = WAL')
  sqlite.exec(DDL)
  migrate(sqlite)
  database = drizzle(sqlite, { schema })
}

/*
 * 兼容旧库的结构迁移：SQLite 无 ADD COLUMN IF NOT EXISTS，用 PRAGMA 检测缺失列后补列。
 *   新增列须同时更新上方 DDL（新库直建）与此处（旧库补齐）。
 */
function migrate(db: Database.Database): void {
  ensureColumn(db, 'desk_session', 'mode', "TEXT NOT NULL DEFAULT 'build'")
}

/* 检测并补充缺失列（已存在则跳过） */
function ensureColumn(db: Database.Database, table: string, column: string, definition: string): void {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>
  if (!columns.some((item) => item.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`)
  }
}

/* 获取 Drizzle 实例 */
export function getDb(): BetterSQLite3Database<typeof schema> {
  if (!database) {
    throw new Error('数据库尚未初始化')
  }
  return database
}
