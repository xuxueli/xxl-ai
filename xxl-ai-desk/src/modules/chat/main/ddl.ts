/*
 * 会话与消息表建表片段。
 * @author xuxueli 2026-11-07
 */

export const CHAT_DDL = `
CREATE TABLE IF NOT EXISTS desk_session (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  title         TEXT NOT NULL DEFAULT '',
  project_id    INTEGER NOT NULL DEFAULT 0,
  agent_id      INTEGER NOT NULL DEFAULT 0,
  provider_id   INTEGER NOT NULL DEFAULT 0,
  model_id      TEXT NOT NULL DEFAULT '',
  reasoning_level TEXT NOT NULL DEFAULT 'default',
  permission_mode TEXT NOT NULL DEFAULT 'workspace-write',
  summary       TEXT NOT NULL DEFAULT '',
  summary_last_message_id INTEGER NOT NULL DEFAULT 0,
  summary_update_time     TEXT NOT NULL DEFAULT '',
  context_breakdown       TEXT NOT NULL DEFAULT '',
  add_time      TEXT NOT NULL DEFAULT '',
  update_time   TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS i_desk_session_project ON desk_session (project_id);
CREATE INDEX IF NOT EXISTS i_desk_session_agent ON desk_session (agent_id);
CREATE TABLE IF NOT EXISTS desk_message (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL,
  turn_id    INTEGER NOT NULL DEFAULT 0,
  role       TEXT NOT NULL DEFAULT '',
  source     TEXT,
  status     TEXT NOT NULL DEFAULT '',
  content    TEXT NOT NULL DEFAULT '',
  data       TEXT NOT NULL DEFAULT '',
  add_time   TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS i_desk_message_session ON desk_message (session_id, id);
CREATE INDEX IF NOT EXISTS i_desk_message_turn ON desk_message (session_id, turn_id, id);
`
