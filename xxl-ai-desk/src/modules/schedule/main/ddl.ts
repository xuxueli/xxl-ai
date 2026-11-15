/*
 * 定时任务表建表片段。
 * @author xuxueli 2026-11-15
 */

export const SCHEDULE_DDL = `
CREATE TABLE IF NOT EXISTS desk_scheduled_task (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  name              TEXT NOT NULL DEFAULT '',
  prompt            TEXT NOT NULL DEFAULT '',
  project_id        INTEGER NOT NULL DEFAULT 0,
  agent_id          INTEGER NOT NULL DEFAULT 0,
  provider_id       INTEGER NOT NULL DEFAULT 0,
  model_id          TEXT NOT NULL DEFAULT '',
  reasoning_level   TEXT NOT NULL DEFAULT 'default',
  permission_mode   TEXT NOT NULL DEFAULT 'workspace-write',
  schedule_expression TEXT NOT NULL DEFAULT '',
  session_mode      TEXT NOT NULL DEFAULT 'reuse',
  enabled           INTEGER NOT NULL DEFAULT 1,
  last_run_at       TEXT NOT NULL DEFAULT '',
  last_run_status   TEXT NOT NULL DEFAULT '',
  last_error        TEXT NOT NULL DEFAULT '',
  last_session_id   INTEGER NOT NULL DEFAULT 0,
  add_time          TEXT NOT NULL DEFAULT '',
  update_time       TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS i_desk_scheduled_task_enabled ON desk_scheduled_task (enabled);
`
