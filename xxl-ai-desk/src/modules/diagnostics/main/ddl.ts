/*
 * 模型通讯 trace 表建表片段。
 * @author xuxueli 2026-11-07
 */

export const DIAGNOSTICS_DDL = `
CREATE TABLE IF NOT EXISTS desk_llm_trace (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id       INTEGER NOT NULL DEFAULT 0,
  run_id           TEXT NOT NULL DEFAULT '',
  step             INTEGER NOT NULL DEFAULT 0,
  provider_id      INTEGER NOT NULL DEFAULT 0,
  model_id         TEXT NOT NULL DEFAULT '',
  phase            TEXT NOT NULL DEFAULT 'chat',
  status           TEXT NOT NULL DEFAULT 'success',
  http_status      INTEGER NOT NULL DEFAULT 0,
  duration_ms      INTEGER NOT NULL DEFAULT 0,
  input_tokens     INTEGER NOT NULL DEFAULT 0,
  output_tokens    INTEGER NOT NULL DEFAULT 0,
  reasoning_tokens INTEGER NOT NULL DEFAULT 0,
  request          TEXT NOT NULL DEFAULT '',
  response         TEXT NOT NULL DEFAULT '',
  tool_calls       TEXT NOT NULL DEFAULT '[]',
  error            TEXT NOT NULL DEFAULT '',
  add_time         TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS i_desk_llm_trace_session ON desk_llm_trace (session_id, add_time);
CREATE INDEX IF NOT EXISTS i_desk_llm_trace_run ON desk_llm_trace (run_id, step);
`
