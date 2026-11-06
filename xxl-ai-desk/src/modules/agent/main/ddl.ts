/*
 * Agent 记忆表建表片段。
 * @author xuxueli 2026-11-07
 */

export const AGENT_DDL = `
CREATE TABLE IF NOT EXISTS desk_agent_memory (
  id              TEXT PRIMARY KEY,
  project_id      TEXT NOT NULL DEFAULT '',
  content         TEXT NOT NULL DEFAULT '',
  last_time       TEXT NOT NULL DEFAULT '',
  add_time        TEXT NOT NULL DEFAULT '',
  update_time     TEXT NOT NULL DEFAULT ''
);
CREATE UNIQUE INDEX IF NOT EXISTS i_desk_agent_memory_project ON desk_agent_memory (project_id);
`
