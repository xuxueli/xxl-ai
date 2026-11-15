/*
 * 定时任务表与运行日志表建表片段。
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
  session_block_policy TEXT NOT NULL DEFAULT 'skip',
  timeout_minutes   INTEGER NOT NULL DEFAULT 0,
  enabled           INTEGER NOT NULL DEFAULT 1,
  last_run_at       TEXT NOT NULL DEFAULT '',
  last_run_status   TEXT NOT NULL DEFAULT '',
  last_error        TEXT NOT NULL DEFAULT '',
  last_session_id   INTEGER NOT NULL DEFAULT 0,
  add_time          TEXT NOT NULL DEFAULT '',
  update_time       TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS i_desk_scheduled_task_enabled ON desk_scheduled_task (enabled);

CREATE TABLE IF NOT EXISTS desk_scheduled_log (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id           INTEGER NOT NULL DEFAULT 0,
  trigger_type      TEXT NOT NULL DEFAULT 'schedule',
  slot_at           TEXT NOT NULL DEFAULT '',
  status            TEXT NOT NULL DEFAULT 'running',
  session_id        INTEGER NOT NULL DEFAULT 0,
  error             TEXT NOT NULL DEFAULT '',
  add_time          TEXT NOT NULL DEFAULT '',
  update_time       TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS i_desk_scheduled_log_task ON desk_scheduled_log (task_id, id);
CREATE INDEX IF NOT EXISTS i_desk_scheduled_log_time ON desk_scheduled_log (add_time);
CREATE UNIQUE INDEX IF NOT EXISTS uk_desk_scheduled_log_slot ON desk_scheduled_log (task_id, slot_at) WHERE slot_at <> '';
`
