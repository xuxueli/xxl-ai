/*
 * 会话与消息表建表片段。
 * @author xuxueli 2026-11-07
 */

export const CHAT_DDL = `
CREATE TABLE IF NOT EXISTS desk_session (
  id            TEXT PRIMARY KEY,
  title         TEXT NOT NULL DEFAULT '',
  project_id    TEXT NOT NULL DEFAULT '',
  provider_id   TEXT NOT NULL DEFAULT '',
  model_id      TEXT NOT NULL DEFAULT '',
  mode          TEXT NOT NULL DEFAULT 'build',
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
`
