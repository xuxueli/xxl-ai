/*
 * Agent 长期记忆服务：随项目行保存记忆，一轮对话结束后按保鲜间隔异步生成。
 *   - 存储经 project 域公共入口，worker 不访问数据库。
 *   - 生成失败只记录日志并保留旧记忆，不阻断对话主流程。
 */

import log from 'electron-log/main'
import { t } from '@common/main/i18n'
import { AGENT_MEMORY_MAX_CHARS, AGENT_MEMORY_REFRESH_MS } from '@modules/agent/shared'
import type { AgentMemoryDTO, AgentMemorySaveInput } from '@modules/agent/shared'
import { isRuntimeSource, type ProjectMessageGroup, type ProjectMessages, type SessionDTO } from '@modules/chat/shared'
import { translate } from '@common/shared/i18n'
import { getSettings } from '@modules/settings/main'
import { getProject, getProjectMemory, listProjectMemories, saveProjectMemory } from '@modules/project/main'
import { generateMemory } from './host/runtimeHost'
import { resolveAgentTarget, toRuntimeConfig } from './runtimeTarget'

/* 记忆生成上下文：会话数据由调用方（chat）提供，避免 agent → chat 反向依赖 */
export interface AgentMemoryGenerationContext {
  /* 触发本轮记忆检查的会话 */
  session: SessionDTO
  /* 读取项目内晚于游标的消息 */
  loadPendingMessages: (since: string) => ProjectMessages
  /* 记忆变更后清理项目下会话运行时，使新记忆下一轮生效 */
  evictProjectSessions: () => void
  /* 来源会话是否仍存在：写入前复核，避免已删会话内容进入项目记忆 */
  isSessionActive: (sessionId: number) => boolean
}

/* 生成中的项目：同一项目同时只跑一个记忆任务，避免多会话并发覆盖 */
const generatingProjects = new Set<number>()

/* 生成入参最大转录长度（字符）：超长从最旧内容截断，控制压缩请求成本 */
const TRANSCRIPT_MAX_CHARS = 60_000

/* 项目长期记忆列表：项目与记忆同表，一次查询后按生成时间倒序 */
export function listAgentMemories(): AgentMemoryDTO[] {
  return listProjectMemories().sort((a, b) => (b.updateTime || '').localeCompare(a.updateTime || ''))
}

/* 读取单个项目的记忆正文（未生成返回空串） */
export function getAgentMemory(projectId: number): string {
  return projectId ? getProjectMemory(projectId).content : ''
}

/* 手动保存记忆（内容截断到固定上限，游标保持不变） */
export function saveAgentMemory(input: AgentMemorySaveInput): AgentMemoryDTO {
  const project = getProject(input.projectId)
  if (!project) {
    throw new Error(t('runtime.error.projectMissing'))
  }
  const existing = getProjectMemory(project.id)
  const content = (input.content ?? '').slice(0, AGENT_MEMORY_MAX_CHARS)
  const saved = saveProjectMemory(project.id, content, existing.lastMessageTime)
  return { projectId: project.id, projectName: project.name, ...saved }
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

/*
 * 分会话拼接转录：仅真实用户 / 助手正文，注入消息与工具结果不参与；
 * 同时返回有效消息数，用于生成日志。
 */
function buildTranscript(
  sessions: ProjectMessageGroup[],
  language: string
): { text: string; count: number } {
  let count = 0
  const blocks = sessions.map((session) => {
    const rows = session.messages
      .filter(
        (row) =>
          (row.role === 'user' || row.role === 'assistant') &&
          !isRuntimeSource(row.source)
      )
      .map((row) => ({ role: row.role, text: extractMessageText(row) }))
      .filter((row) => row.text)
    count += rows.length
    const body = rows.map((row) => `${row.role}: ${row.text}`).join('\n\n')
    if (!body) {
      return ''
    }
    const title = session.title || translate(language, 'agent.memorySessionUntitled')
    return `${translate(language, 'agent.memorySessionHeader', [title])}\n\n${body}`
  })
  const transcript = blocks.filter(Boolean).join('\n\n')
  return {
    text:
      transcript.length > TRANSCRIPT_MAX_CHARS
        ? transcript.slice(-TRANSCRIPT_MAX_CHARS)
        : transcript,
    count
  }
}

/*
 * 一轮对话结束后调用：开启记忆时异步生成 / 保鲜。
 *   - 触发条件：记忆为空，或距上次生成超过 5 分钟，且存在新消息；
 *   - 会话与增量消息由调用方提供，转录按项目内全部会话；
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
  const memory = getProjectMemory(project.id)
  const lastGeneratedAt = memory.updateTime ? Date.parse(memory.updateTime) : 0
  const needsRefresh =
    !memory.content.trim() ||
    !lastGeneratedAt ||
    Date.now() - lastGeneratedAt > AGENT_MEMORY_REFRESH_MS
  if (!needsRefresh) {
    return
  }
  const pending = context.loadPendingMessages(memory.lastMessageTime)
  if (pending.total === 0) {
    return
  }
  const transcript = buildTranscript(pending.sessions, settings.language)
  if (!transcript.text) {
    return
  }
  const target = resolveAgentTarget(session, settings)
  if (!target) {
    log.warn(`[agent-memory] 跳过生成：会话 ${session.id} 未找到可用模型`)
    return
  }
  const lastMessageTime = pending.lastMessageTime
  generatingProjects.add(project.id)
  try {
    const content = await generateMemory({
      provider: toRuntimeConfig(target.provider),
      modelId: target.modelId,
      language: settings.language,
      oldMemory: memory.content,
      transcript: transcript.text,
      sessionId: session.id,
      traceEnabled: settings.developerMode
    })
    const saved = content.trim().slice(0, AGENT_MEMORY_MAX_CHARS)
    if (!saved) {
      throw new Error(t('runtime.error.memoryEmpty'))
    }
    /* 生成期间项目或任一来源会话被删除：不再写入，避免孤儿记忆与已删内容残留 */
    const sourcesActive = pending.sessions.every((group) => context.isSessionActive(group.sessionId))
    if (!getProject(project.id) || !sourcesActive) {
      return
    }
    saveProjectMemory(project.id, saved, lastMessageTime)
    /* 系统提示词在创建 Agent 时固化：新记忆需清理项目下会话运行时，下一轮重新装配 */
    context.evictProjectSessions()
    log.info(`[agent-memory] 项目 ${project.id} 记忆已更新（${transcript.count} 条消息）`)
  } catch (error) {
    /* 失败隔离：保留旧记忆，下一轮继续尝试 */
    log.warn(`[agent-memory] 生成失败 project=${project.id}`, error)
  } finally {
    generatingProjects.delete(project.id)
  }
}
