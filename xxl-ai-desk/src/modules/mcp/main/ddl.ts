/*
 * MCP 服务表建表片段。
 * @author xuxueli 2026-11-07
 */

export const MCP_DDL = `
CREATE TABLE IF NOT EXISTS desk_mcp (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL DEFAULT '',
  type        TEXT NOT NULL DEFAULT 'remote',
  transport   TEXT NOT NULL DEFAULT 'streamable-http',
  url         TEXT NOT NULL DEFAULT '',
  headers     TEXT NOT NULL DEFAULT '{}',
  command     TEXT NOT NULL DEFAULT '',
  args        TEXT NOT NULL DEFAULT '[]',
  env         TEXT NOT NULL DEFAULT '{}',
  cwd         TEXT NOT NULL DEFAULT '',
  config      TEXT NOT NULL DEFAULT '{}',
  remark      TEXT NOT NULL DEFAULT '',
  health      TEXT NOT NULL DEFAULT '',
  add_time    TEXT NOT NULL DEFAULT '',
  update_time TEXT NOT NULL DEFAULT ''
);
CREATE UNIQUE INDEX IF NOT EXISTS i_desk_mcp_name ON desk_mcp (name);
`
