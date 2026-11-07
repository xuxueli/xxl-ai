/*
 * SKILL 技能表建表片段。
 * @author xuxueli 2026-11-07
 */

export const SKILL_DDL = `
CREATE TABLE IF NOT EXISTS desk_skill (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  version     TEXT NOT NULL DEFAULT '',
  source      TEXT NOT NULL DEFAULT 'local',
  source_id   TEXT NOT NULL DEFAULT '',
  add_time    TEXT NOT NULL DEFAULT '',
  update_time TEXT NOT NULL DEFAULT ''
);
CREATE UNIQUE INDEX IF NOT EXISTS i_desk_skill_source_id ON desk_skill (source_id) WHERE source_id <> '';
`
