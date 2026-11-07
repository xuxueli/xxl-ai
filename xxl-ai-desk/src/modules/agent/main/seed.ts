/*
 * Agent 内置种子：首次初始化写入 3 个预设 Agent（默认 Agent 不允许删除）。
 *   - 通用助手（默认）/ 编程助手 / 陪伴交流；
 *   - MCP / SKILL 默认不选择；
 *   - 内置工具统一使用默认组合：文件 / 终端 / 浏览器开启，其余关闭。
 * @author xuxueli 2026-11-07
 */

import type Database from 'better-sqlite3'
import { translate } from '@common/shared/i18n'
import { AGENT_AVATAR_PRESETS } from '@modules/agent/shared/agentPresets'
import { DEFAULT_AGENT_TOOLS } from '@modules/agent/shared/contracts'

/* 内置 Agent 初始化标记：写入成功后不再重置，避免用户删除后被重新写回 */
const AGENT_SEED_KEY = 'seed.agent'

/* 初始化的预设 Agent（第一个为默认内置 Agent） */
const SEED_PRESET_IDS = ['assistant', 'coder', 'companion'] as const

/* 读取设置表中的原始值（不依赖 settings 领域实现） */
function readSetting(db: Database.Database, key: string): string {
  const row = db.prepare('SELECT value FROM desk_setting WHERE key = ?').get(key) as
    | { value: string }
    | undefined
  return row?.value ?? ''
}

export function seedDefaultAgent(db: Database.Database): void {
  const seeded = db.prepare('SELECT 1 FROM desk_setting WHERE key = ?').get(AGENT_SEED_KEY)
  if (seeded) {
    return
  }
  const language = readSetting(db, 'language') === 'en' ? 'en' : 'zh'
  const now = new Date().toISOString()
  const skillIds = '[]'
  const mcpIds = '[]'

  const insert = db.prepare(`
    INSERT OR IGNORE INTO desk_agent
      (name, description, avatar, system_prompt, skill_ids, mcp_ids,
       tool_fs, tool_shell, tool_browser, tool_general, tool_interaction,
       builtin, add_time, update_time)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
  const markSeeded = db.prepare('INSERT OR REPLACE INTO desk_setting (key, value) VALUES (?, ?)')

  db.transaction(() => {
    for (let index = 0; index < SEED_PRESET_IDS.length; index += 1) {
      const preset = AGENT_AVATAR_PRESETS.find((item) => item.id === SEED_PRESET_IDS[index])
      if (!preset?.preset) {
        continue
      }
      const builtin = index === 0 ? 1 : 0
      const name = translate(language, preset.labelKey)
      const description = translate(language, preset.preset.descriptionKey)
      const systemPrompt = translate(language, preset.preset.promptKey)
      const tools = DEFAULT_AGENT_TOOLS
      const toolValues = [
        tools.fs ? 1 : 0,
        tools.shell ? 1 : 0,
        tools.browser ? 1 : 0,
        tools.general ? 1 : 0,
        tools.interaction ? 1 : 0
      ]
      insert.run(
        name,
        description,
        preset.id,
        systemPrompt,
        skillIds,
        mcpIds,
        ...toolValues,
        builtin,
        now,
        now
      )
    }
    markSeeded.run(AGENT_SEED_KEY, now)
  })()
}
