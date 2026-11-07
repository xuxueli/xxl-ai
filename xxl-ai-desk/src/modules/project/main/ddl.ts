/*
 * 项目表建表片段。
 * @author xuxueli 2026-11-07
 */

export const PROJECT_DDL = `
CREATE TABLE IF NOT EXISTS desk_project (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL DEFAULT '',
  path        TEXT NOT NULL DEFAULT '',
  memory_enabled INTEGER NOT NULL DEFAULT 0,
  memory      TEXT NOT NULL DEFAULT '',
  memory_last_time   TEXT NOT NULL DEFAULT '',
  memory_update_time TEXT NOT NULL DEFAULT '',
  add_time    TEXT NOT NULL DEFAULT '',
  update_time TEXT NOT NULL DEFAULT ''
);
`
