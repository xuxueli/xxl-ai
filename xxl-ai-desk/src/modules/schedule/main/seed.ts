/*
 * 定时任务示例种子：首次初始化写入 2 个面向普通用户的示例任务，默认停用。
 *   - 只在从未播种过、且任务表为空时写入，用户删除后不再回填；
 *   - 绑定首个项目与内置 Agent；供应商 / 模型留空，运行时回退应用设置默认值；
 *   - 示例只读写会话工作目录，涉及权限审批的动作由运行时自动拒绝。
 * @author xuxueli 2026-11-15
 */

import type Database from 'better-sqlite3'
import { translate } from '@common/shared/i18n'

/* 示例播种标记：写入成功后不再重复，避免用户删除示例后被重置 */
const SCHEDULE_SEED_KEY = 'seed.schedule'

/* 示例任务：名称与指令取自本域词条，规则与会话方式固定 */
const SEED_TASKS = [
  { key: 'dailyNews', expression: '0 0 8 * * * *', sessionMode: 'reuse' },
  { key: 'weeklyIndustry', expression: '0 0 9 * * 1 *', sessionMode: 'new' }
] as const

/* 读取设置表中的语言：数据库初始化早于主进程 i18n 运行时，需直接查表 */
function readLanguage(db: Database.Database): 'zh' | 'en' {
  const row = db.prepare('SELECT value FROM desk_setting WHERE key = ?').get('language') as
    | { value: string }
    | undefined
  return row?.value === 'en' ? 'en' : 'zh'
}

/* 首个项目主键（种子项目随应用初始化创建） */
function firstProjectId(db: Database.Database): number {
  const row = db.prepare('SELECT id FROM desk_project ORDER BY id LIMIT 1').get() as
    | { id: number }
    | undefined
  return row?.id ?? 0
}

/* 内置 Agent 主键：优先默认 Agent，缺省退回首个 Agent */
function firstAgentId(db: Database.Database): number {
  const row = (db
    .prepare('SELECT id FROM desk_agent ORDER BY builtin DESC, id LIMIT 1')
    .get() ?? undefined) as { id: number } | undefined
  return row?.id ?? 0
}

export function seedExampleScheduledTasks(db: Database.Database): void {
  const seeded = db.prepare('SELECT 1 FROM desk_setting WHERE key = ?').get(SCHEDULE_SEED_KEY)
  if (seeded) {
    return
  }
  /* 已有任务说明是升级用户：不注入示例，但记录标记避免后续重复判断 */
  const markSeeded = db.prepare('INSERT OR REPLACE INTO desk_setting (key, value) VALUES (?, ?)')
  const now = new Date().toISOString()
  if (db.prepare('SELECT 1 FROM desk_scheduled_task LIMIT 1').get()) {
    markSeeded.run(SCHEDULE_SEED_KEY, now)
    return
  }

  const projectId = firstProjectId(db)
  const agentId = firstAgentId(db)
  /* 项目 / Agent 尚未就绪：不写标记，下次启动再试 */
  if (!projectId || !agentId) {
    return
  }

  const language = readLanguage(db)
  const insert = db.prepare(`
    INSERT INTO desk_scheduled_task
      (name, prompt, project_id, agent_id, provider_id, model_id,
       reasoning_level, permission_mode, schedule_expression, session_mode,
       enabled, last_run_at, last_run_status, last_error, last_session_id,
       add_time, update_time)
    VALUES (?, ?, ?, ?, 0, '', 'default', 'workspace-write', ?, ?, 0, '', '', '', 0, ?, ?)
  `)

  db.transaction(() => {
    for (const task of SEED_TASKS) {
      insert.run(
        translate(language, `schedule.seed.${task.key}.name`),
        translate(language, `schedule.seed.${task.key}.prompt`),
        projectId,
        agentId,
        task.expression,
        task.sessionMode,
        now,
        now
      )
    }
    markSeeded.run(SCHEDULE_SEED_KEY, now)
  })()
}
