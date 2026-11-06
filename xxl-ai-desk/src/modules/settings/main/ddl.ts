/*
 * 应用设置表建表片段。
 * @author xuxueli 2026-11-07
 */

export const SETTINGS_DDL = `
CREATE TABLE IF NOT EXISTS desk_setting (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL DEFAULT ''
);
`
