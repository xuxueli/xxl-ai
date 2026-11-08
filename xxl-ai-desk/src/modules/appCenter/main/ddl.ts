/*
 * 应用状态表建表片段。
 * @author xuxueli 2026-11-08
 */

export const APP_CENTER_DDL = `
CREATE TABLE IF NOT EXISTS desk_app_setting (
  app_id      TEXT PRIMARY KEY,
  installed   INTEGER NOT NULL DEFAULT 0,
  enabled     INTEGER NOT NULL DEFAULT 0,
  config      TEXT NOT NULL DEFAULT '{}',
  add_time    TEXT NOT NULL DEFAULT '',
  update_time TEXT NOT NULL DEFAULT ''
);
`
