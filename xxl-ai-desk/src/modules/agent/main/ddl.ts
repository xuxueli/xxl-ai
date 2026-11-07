/*
 * Agent 表建表片段：Agent 配置。
 * @author xuxueli 2026-11-07
 */

export const AGENT_DDL = `
CREATE TABLE IF NOT EXISTS desk_agent (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  name             TEXT NOT NULL DEFAULT '',
  description      TEXT NOT NULL DEFAULT '',
  avatar           TEXT NOT NULL DEFAULT 'assistant',
  system_prompt    TEXT NOT NULL DEFAULT '',
  skill_ids        TEXT NOT NULL DEFAULT '[]',
  mcp_ids          TEXT NOT NULL DEFAULT '[]',
  tool_fs          INTEGER NOT NULL DEFAULT 1,
  tool_shell       INTEGER NOT NULL DEFAULT 1,
  tool_browser     INTEGER NOT NULL DEFAULT 1,
  tool_general     INTEGER NOT NULL DEFAULT 0,
  tool_interaction INTEGER NOT NULL DEFAULT 0,
  builtin          INTEGER NOT NULL DEFAULT 0,
  add_time         TEXT NOT NULL DEFAULT '',
  update_time      TEXT NOT NULL DEFAULT ''
);
CREATE UNIQUE INDEX IF NOT EXISTS i_desk_agent_name ON desk_agent (name);
CREATE INDEX IF NOT EXISTS i_desk_agent_builtin ON desk_agent (builtin);
`
