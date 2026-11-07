/*
 * Agent 配置服务：多 Agent 的增删改查、默认 Agent 与预设标识归一。
 *   - 唯一 getDb 出口；跨域会话占用校验由 IPC 层编排（避免 agent → chat 的规则耦合）。
 * @author xuxueli 2026-11-07
 */

import { eq } from 'drizzle-orm'
import { getDb } from '@common/main/db'
import { t } from '@common/main/i18n'
import { agentTable } from '@modules/agent/main/schema'
import { resolveAgentAvatar } from '@modules/agent/shared/agentPresets'
import {
  AGENT_DESCRIPTION_MAX_CHARS,
  AGENT_INSTRUCTION_MAX_CHARS,
  AGENT_NAME_MAX_CHARS,
  DEFAULT_AGENT_AVATAR,
  DEFAULT_AGENT_TOOLS
} from '@modules/agent/shared/contracts'
import type { AgentDTO, AgentSaveInput, AgentToolSwitches } from '@modules/agent/shared/contracts'

type AgentRow = typeof agentTable.$inferSelect

/* 安全解析 id 列表：脏数据归一为空数组 */
function parseIds(value: string): string[] {
  try {
    const parsed = JSON.parse(value) as unknown
    if (!Array.isArray(parsed)) {
      return []
    }
    return parsed.filter((item): item is string => typeof item === 'string' && item.trim() !== '')
  } catch {
    return []
  }
}

/* 安全解析数字 id 列表（MCP）：过滤非法项并去重 */
function parseNumberIds(value: string): number[] {
  try {
    const parsed = JSON.parse(value) as unknown
    if (!Array.isArray(parsed)) {
      return []
    }
    return [
      ...new Set(
        parsed.filter((item): item is number => typeof item === 'number' && Number.isInteger(item) && item > 0)
      )
    ]
  } catch {
    return []
  }
}

/* 去重、去空：未传值时沿用已存列表 */
function normalizeIds(ids: string[] | undefined, fallback: string[]): string[] {
  const source = ids ?? fallback
  return [...new Set(source.map((item) => item.trim()).filter(Boolean))]
}

/* 数字 id 去重去非法：未传值时沿用已存列表 */
function normalizeNumberIds(ids: number[] | undefined, fallback: number[]): number[] {
  const source = ids ?? fallback
  return [...new Set(source.filter((item) => Number.isInteger(item) && item > 0))]
}

/* 工具开关归一：缺省字段沿用已存值或默认值 */
function normalizeTools(
  value: Partial<AgentToolSwitches> | undefined,
  fallback: AgentToolSwitches
): AgentToolSwitches {
  return {
    fs: value?.fs ?? fallback.fs,
    shell: value?.shell ?? fallback.shell,
    browser: value?.browser ?? fallback.browser,
    general: value?.general ?? fallback.general,
    interaction: value?.interaction ?? fallback.interaction
  }
}

/* 行记录 → DTO */
export function toAgentDTO(row: AgentRow): AgentDTO {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    avatar: resolveAgentAvatar(row.avatar).id,
    systemPrompt: row.systemPrompt,
    skillIds: parseIds(row.skillIds),
    mcpIds: parseNumberIds(row.mcpIds),
    tools: {
      fs: row.toolFs === 1,
      shell: row.toolShell === 1,
      browser: row.toolBrowser === 1,
      general: row.toolGeneral === 1,
      interaction: row.toolInteraction === 1
    },
    builtin: row.builtin === 1,
    sessionCount: 0,
    addTime: row.addTime,
    updateTime: row.updateTime
  }
}

/* Agent 列表（默认 Agent 优先，其次最近更新） */
export function listAgents(): AgentDTO[] {
  const rows = getDb().select().from(agentTable).all()
  return rows.map(toAgentDTO).sort((a, b) => {
    if (a.builtin !== b.builtin) {
      return a.builtin ? -1 : 1
    }
    return b.updateTime.localeCompare(a.updateTime)
  })
}

/* 按主键读取 Agent */
export function getAgentById(id: number): AgentDTO | null {
  if (!id) {
    return null
  }
  const row = getDb().select().from(agentTable).where(eq(agentTable.id, id)).get()
  return row ? toAgentDTO(row) : null
}

/* 保存 Agent：新建按默认值，更新按缺省字段回落已存值 */
export function saveAgent(input: AgentSaveInput): AgentDTO {
  const db = getDb()
  const existing = input.id
    ? db.select().from(agentTable).where(eq(agentTable.id, input.id)).get()
    : null

  const name = (input.name ?? existing?.name ?? '').trim()
  if (!name) {
    throw new Error(t('runtime.error.agentNameRequired'))
  }
  if (name.length > AGENT_NAME_MAX_CHARS) {
    throw new Error(t('runtime.error.agentNameTooLong', [AGENT_NAME_MAX_CHARS]))
  }

  /* 名称唯一：工具名前缀与会话识别均依赖名称 */
  const duplicated = db
    .select()
    .from(agentTable)
    .all()
    .find((row) => row.name === name && row.id !== existing?.id)
  if (duplicated) {
    throw new Error(t('runtime.error.agentNameDuplicate', [name]))
  }

  const now = new Date().toISOString()
  const tools = normalizeTools(input.tools, existing ? toAgentDTO(existing).tools : DEFAULT_AGENT_TOOLS)
  const record = {
    name,
    description: (input.description ?? existing?.description ?? '').trim().slice(0, AGENT_DESCRIPTION_MAX_CHARS),
    avatar: resolveAgentAvatar(input.avatar ?? existing?.avatar ?? DEFAULT_AGENT_AVATAR).id,
    systemPrompt: (input.systemPrompt ?? existing?.systemPrompt ?? '').slice(0, AGENT_INSTRUCTION_MAX_CHARS),
    skillIds: JSON.stringify(normalizeIds(input.skillIds, existing ? parseIds(existing.skillIds) : [])),
    mcpIds: JSON.stringify(normalizeNumberIds(input.mcpIds, existing ? parseNumberIds(existing.mcpIds) : [])),
    toolFs: tools.fs ? 1 : 0,
    toolShell: tools.shell ? 1 : 0,
    toolBrowser: tools.browser ? 1 : 0,
    toolGeneral: tools.general ? 1 : 0,
    toolInteraction: tools.interaction ? 1 : 0,
    builtin: existing?.builtin ?? 0,
    addTime: existing?.addTime ?? now,
    updateTime: now
  }
  if (existing) {
    db.update(agentTable).set(record).where(eq(agentTable.id, existing.id)).run()
    return toAgentDTO({ ...existing, ...record })
  }
  const inserted = db
    .insert(agentTable)
    .values(record)
    .returning({ id: agentTable.id })
    .get()
  return toAgentDTO({ id: inserted.id, ...record })
}

/* 统计引用指定 SKILL 的 Agent 数量（SKILL 删除前置校验） */
export function countAgentsBySkillId(skillId: string): number {
  if (!skillId) {
    return 0
  }
  return getDb()
    .select()
    .from(agentTable)
    .all()
    .filter((row) => parseIds(row.skillIds).includes(skillId)).length
}

/* 统计引用指定 MCP 的 Agent 数量（MCP 删除前置校验） */
export function countAgentsByMcpId(mcpId: number): number {
  if (!mcpId) {
    return 0
  }
  return getDb()
    .select()
    .from(agentTable)
    .all()
    .filter((row) => parseNumberIds(row.mcpIds).includes(mcpId)).length
}

/* 删除 Agent：默认 Agent 禁止删除（会话占用由 IPC 层校验） */
export function deleteAgent(id: number): void {
  const existing = id ? getDb().select().from(agentTable).where(eq(agentTable.id, id)).get() : undefined
  if (!existing) {
    return
  }
  if (existing.builtin === 1) {
    throw new Error(t('runtime.error.agentBuiltinUndeletable'))
  }
  getDb().delete(agentTable).where(eq(agentTable.id, existing.id)).run()
}
