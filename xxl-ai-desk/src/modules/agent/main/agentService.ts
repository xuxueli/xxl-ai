/*
 * Agent 配置服务：多 Agent 的增删改查、默认 Agent 与预设标识归一。
 *   - 唯一 getDb 出口；跨域会话占用校验由 IPC 层编排（避免 agent → chat 的规则耦合）。
 * @author xuxueli 2026-11-07
 */

import { randomUUID } from 'crypto'
import { eq } from 'drizzle-orm'
import { getDb } from '@common/main/db'
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

/* 去重、去空：未传值时沿用已存列表 */
function normalizeIds(ids: string[] | undefined, fallback: string[]): string[] {
  const source = ids ?? fallback
  return [...new Set(source.map((item) => item.trim()).filter(Boolean))]
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
    mcpIds: parseIds(row.mcpIds),
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
export function getAgentById(id: string): AgentDTO | null {
  if (!id) {
    return null
  }
  const row = getDb().select().from(agentTable).where(eq(agentTable.id, id)).get()
  return row ? toAgentDTO(row) : null
}

/* 默认内置 Agent */
export function getDefaultAgent(): AgentDTO | null {
  const row = getDb().select().from(agentTable).where(eq(agentTable.builtin, 1)).get()
  return row ? toAgentDTO(row) : null
}

/* 保存 Agent：新建按默认值，更新按缺省字段回落已存值 */
export function saveAgent(input: AgentSaveInput): AgentDTO {
  const db = getDb()
  const existing = input.id ? db.select().from(agentTable).where(eq(agentTable.id, input.id)).get() : null

  const name = (input.name ?? existing?.name ?? '').trim()
  if (!name) {
    throw new Error('请填写 Agent 名称')
  }
  if (name.length > AGENT_NAME_MAX_CHARS) {
    throw new Error(`Agent 名称过长（最多 ${AGENT_NAME_MAX_CHARS} 个字符）`)
  }

  /* 名称唯一：工具名前缀与会话识别均依赖名称 */
  const duplicated = db
    .select()
    .from(agentTable)
    .all()
    .find((row) => row.name === name && row.id !== existing?.id)
  if (duplicated) {
    throw new Error(`Agent 名称「${name}」已存在，请更换名称`)
  }

  const id = input.id || randomUUID()
  const now = new Date().toISOString()
  const tools = normalizeTools(input.tools, existing ? toAgentDTO(existing).tools : DEFAULT_AGENT_TOOLS)
  const record: AgentRow = {
    id,
    name,
    description: (input.description ?? existing?.description ?? '').trim().slice(0, AGENT_DESCRIPTION_MAX_CHARS),
    avatar: resolveAgentAvatar(input.avatar ?? existing?.avatar ?? DEFAULT_AGENT_AVATAR).id,
    systemPrompt: (input.systemPrompt ?? existing?.systemPrompt ?? '').slice(0, AGENT_INSTRUCTION_MAX_CHARS),
    skillIds: JSON.stringify(normalizeIds(input.skillIds, existing ? parseIds(existing.skillIds) : [])),
    mcpIds: JSON.stringify(normalizeIds(input.mcpIds, existing ? parseIds(existing.mcpIds) : [])),
    toolFs: tools.fs ? 1 : 0,
    toolShell: tools.shell ? 1 : 0,
    toolBrowser: tools.browser ? 1 : 0,
    toolGeneral: tools.general ? 1 : 0,
    toolInteraction: tools.interaction ? 1 : 0,
    builtin: existing?.builtin ?? 0,
    addTime: existing?.addTime ?? now,
    updateTime: now
  }
  db.insert(agentTable)
    .values(record)
    .onConflictDoUpdate({ target: agentTable.id, set: record })
    .run()
  return toAgentDTO(record)
}

/* 删除 Agent：默认 Agent 禁止删除（会话占用由 IPC 层校验） */
export function deleteAgent(id: string): void {
  const existing = getDb().select().from(agentTable).where(eq(agentTable.id, id)).get()
  if (!existing) {
    return
  }
  if (existing.builtin === 1) {
    throw new Error('默认 Agent 不允许删除')
  }
  getDb().delete(agentTable).where(eq(agentTable.id, id)).run()
}
