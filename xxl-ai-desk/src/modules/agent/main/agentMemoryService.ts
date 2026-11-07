/*
 * Agent 记忆服务：按项目维度保存记忆，一轮对话结束后检查轮次并异步压缩生成。
 *   - 唯一 getDb 出口；模型调用经 agent/host 门面转运行时进程，worker 不访问数据库。
 *   - 生成失败只记录日志并保留旧记忆，不阻断对话主流程。
 */

import log from 'electron-log/main'
import { eq } from 'drizzle-orm'
import { getDb } from '@common/main/db'
import { t } from '@common/main/i18n'
import { agentMemoryTable } from '@modules/agent/main/schema'
import { AGENT_MEMORY_MAX_CHARS, AGENT_MEMORY_MESSAGE_LIMIT } from '@modules/agent/shared'
import type { AgentMemoryDTO, AgentMemorySaveInput } from '@modules/agent/shared'
import type { AppSettings } from '@modules/settings/shared'
import type { ProviderDTO } from '@modules/provider/shared'
import type { ProjectMessageGroup, ProjectMessages, SessionDTO } from '@modules/chat/shared'
import { translate } from '@common/shared/i18n'
import { getSettings } from '@modules/settings/main'
import { getProvider } from '@modules/provider/main'
import { getProject, listProjects } from '@modules/project/main'
import { generateMemory } from './host/runtimeHost'
import type { ProviderModelConfig } from '@modules/agent/shared/agentProtocol'

/* 记忆生成上下文：会话数据由调用方（chat）提供，避免 agent → chat 反向依赖 */
export interface AgentMemoryGenerationContext {
  /* 触发本轮记忆检查的会话 */
  session: SessionDTO
  /* 读取项目内晚于游标的消息 */
  loadPendingMessages: (since: string) => ProjectMessages
  /* 记忆变更后清理项目下会话运行时，使新记忆下一轮生效 */
  evictProjectSessions: () => void
}

/* 生成中的项目：同一项目同时只跑一个记忆任务，避免多会话并发覆盖 */
const generatingProjects = new Set<number>()

/* 生成入参最大转录长度（字符）：超长从最旧内容截断，控制压缩请求成本 */
const TRANSCRIPT_MAX_CHARS = 60_000

/* 行记录 → DTO（无记忆时字段为空串） */
function toDTO(row: {
  projectId: number
  projectName: string
  content?: string | null
  lastMessageTime?: string | null
  updateTime?: string | null
}): AgentMemoryDTO {
  return {
    projectId: row.projectId,
    projectName: row.projectName,
    content: row.content ?? '',
    lastMessageTime: row.lastMessageTime ?? '',
    updateTime: row.updateTime ?? ''
  }
}

/* 项目记忆列表：以项目为主表合并记忆，未生成过记忆的项目 content 为空 */
export function listAgentMemories(): AgentMemoryDTO[] {
  const memories = getDb().select().from(agentMemoryTable).all()
  const byProject = new Map(memories.map((row) => [row.projectId, row]))
  return listProjects()
    .map((project) => {
      const memory = byProject.get(project.id)
      return {
        projectId: project.id,
        projectName: project.name,
        content: memory?.content ?? '',
        lastMessageTime: memory?.lastMessageTime ?? '',
        updateTime: memory?.updateTime ?? ''
      }
    })
    .sort((a, b) => (b.updateTime || '').localeCompare(a.updateTime || ''))
}

/* 读取单个项目的记忆正文（未生成返回空串） */
export function getAgentMemory(projectId: number): string {
  if (!projectId) {
    return ''
  }
  const row = getDb()
    .select()
    .from(agentMemoryTable)
    .where(eq(agentMemoryTable.projectId, projectId))
    .get()
  return row?.content ?? ''
}

/* 保存记忆：以项目为唯一键幂等 upsert */
function upsertMemory(
  projectId: number,
  content: string,
  lastMessageTime: string
): AgentMemoryDTO {
  const db = getDb()
  if (!projectId) {
    throw new Error(t('runtime.error.projectMissing'))
  }
  const now = new Date().toISOString()
  const existing = db
    .select()
    .from(agentMemoryTable)
    .where(eq(agentMemoryTable.projectId, projectId))
    .get()
  const record = {
    projectId,
    content,
    lastMessageTime,
    addTime: existing?.addTime ?? now,
    updateTime: now
  }
  if (existing) {
    db.update(agentMemoryTable).set(record).where(eq(agentMemoryTable.id, existing.id)).run()
  } else {
    db.insert(agentMemoryTable).values(record).run()
  }
  return toDTO({
    ...record,
    projectName: getProject(projectId)?.name ?? ''
  })
}

/* 手动保存记忆（内容截断到固定上限） */
export function saveAgentMemory(input: AgentMemorySaveInput): AgentMemoryDTO {
  const project = getProject(input.projectId)
  if (!project) {
    throw new Error(t('runtime.error.projectMissing'))
  }
  const existing = getDb()
    .select()
    .from(agentMemoryTable)
    .where(eq(agentMemoryTable.projectId, project.id))
    .get()
  return upsertMemory(
    project.id,
    (input.content ?? '').slice(0, AGENT_MEMORY_MAX_CHARS),
    existing?.lastMessageTime ?? ''
  )
}

/* 删除项目记忆（保留项目本身；运行时清理由调用方编排） */
export function removeAgentMemory(projectId: number): void {
  if (!projectId) {
    return
  }
  getDb().delete(agentMemoryTable).where(eq(agentMemoryTable.projectId, projectId)).run()
}

/* 会话运行时目标：优先会话绑定，缺失时回退设置默认，再回退供应商首个模型 */
function resolveTarget(
  session: SessionDTO,
  settings: AppSettings
): { provider: ProviderDTO; modelId: string } | null {
  const providerId = session.providerId || settings.providerId
  const provider = providerId ? getProvider(providerId) : null
  if (!provider || !provider.enabled) {
    return null
  }
  const modelId =
    session.modelId && provider.models.some((item) => item.id === session.modelId)
      ? session.modelId
      : settings.modelId && provider.models.some((item) => item.id === settings.modelId)
        ? settings.modelId
        : (provider.models[0]?.id ?? '')
  return modelId ? { provider, modelId } : null
}

/* 供应商 DTO → 运行时配置 */
function toRuntimeConfig(provider: ProviderDTO): ProviderModelConfig {
  return {
    id: provider.id,
    name: provider.name,
    baseUrl: provider.baseUrl,
    apiKey: provider.apiKey ?? '',
    headers: provider.headers,
    models: provider.models
  }
}

/* 提取消息正文：只取 text 块，排除 thinking 与工具调用 / 工具结果 */
function extractMessageText(row: { content: string; data: string }): string {
  if (!row.data) {
    return row.content.trim()
  }
  try {
    const content = (JSON.parse(row.data) as { content?: unknown }).content
    if (!Array.isArray(content)) {
      return row.content.trim()
    }
    return content
      .map((part) => {
        const block = part as { type?: string; text?: string }
        return block.type === 'text' ? (block.text ?? '') : ''
      })
      .join('')
      .trim()
  } catch {
    /* 解析失败退回归一化正文，保证记忆生成不中断 */
    return row.content.trim()
  }
}

/* 分会话拼接转录：仅用户 / 助手正文，超长从最旧截断 */
function buildTranscript(sessions: ProjectMessageGroup[], language: string): string {
  const blocks = sessions.map((session) => {
    const body = session.messages
      .filter((row) => (row.role === 'user' || row.role === 'assistant') && !row.injected)
      .map((row) => ({ role: row.role, text: extractMessageText(row) }))
      .filter((row) => row.text)
      .map((row) => `${row.role}: ${row.text}`)
      .join('\n\n')
    if (!body) {
      return ''
    }
    const title = session.title || translate(language, 'agent.memorySessionUntitled')
    return `${translate(language, 'agent.memorySessionHeader', [title])}\n\n${body}`
  })
  const transcript = blocks.filter(Boolean).join('\n\n')
  return transcript.length > TRANSCRIPT_MAX_CHARS
    ? transcript.slice(-TRANSCRIPT_MAX_CHARS)
    : transcript
}

/*
 * 一轮对话结束后调用：开启记忆且距上次生成达到阈值消息数时异步生成。
 *   - 会话与增量消息由调用方提供，计数与转录按项目内全部会话；
 *   - 生成成功覆盖项目记忆并清理项目下会话运行时，使新记忆下一轮生效。
 */
export async function maybeGenerateAgentMemory(
  context: AgentMemoryGenerationContext
): Promise<void> {
  const settings = getSettings()
  const { session } = context
  /* 记忆归属项目：未归属项目的会话不生成 */
  if (!session.projectId) {
    return
  }
  const project = getProject(session.projectId)
  /* 记忆开关按项目配置：关闭时不生成 */
  if (!project || !project.memoryEnabled || generatingProjects.has(project.id)) {
    return
  }
  const memory = getDb()
    .select()
    .from(agentMemoryTable)
    .where(eq(agentMemoryTable.projectId, project.id))
    .get()
  const pending = context.loadPendingMessages(memory?.lastMessageTime ?? '')
  if (pending.total < AGENT_MEMORY_MESSAGE_LIMIT) {
    return
  }
  const target = resolveTarget(session, settings)
  if (!target) {
    log.warn(`[agent-memory] 跳过生成：会话 ${session.id} 未找到可用模型`)
    return
  }
  const transcript = buildTranscript(pending.sessions, settings.language)
  if (!transcript) {
    return
  }
  const lastMessageTime = pending.lastMessageTime
  generatingProjects.add(project.id)
  try {
    const content = await generateMemory({
      provider: toRuntimeConfig(target.provider),
      modelId: target.modelId,
      language: settings.language,
      oldMemory: memory?.content ?? '',
      transcript,
      sessionId: session.id,
      traceEnabled: settings.developerMode
    })
    const saved = content.trim().slice(0, AGENT_MEMORY_MAX_CHARS)
    if (!saved) {
      throw new Error(t('runtime.error.memoryEmpty'))
    }
    /* 生成期间项目可能已被删除：不再写入，避免孤儿记忆 */
    if (!getProject(project.id)) {
      return
    }
    upsertMemory(project.id, saved, lastMessageTime)
    /* 系统提示词在创建 Agent 时固化：新记忆需清理项目下会话运行时，下一轮重新装配 */
    context.evictProjectSessions()
    log.info(`[agent-memory] 项目 ${project.id} 记忆已更新（${pending.total} 条消息）`)
  } catch (error) {
    /* 失败隔离：保留旧记忆，下一轮达到阈值时重试 */
    log.warn(`[agent-memory] 生成失败 project=${project.id}`, error)
  } finally {
    generatingProjects.delete(project.id)
  }
}
