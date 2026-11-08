/*
 * 会话与消息服务：管理会话（绑定项目/供应商/模型/权限模式）及其消息的持久化。
 *   - 消息按轮次追加落库，历史完整保存在数据库。
 */

import { and, asc, count, desc, eq, gt, inArray, isNull } from 'drizzle-orm'
import { getDb } from '@common/main/db'
import { t } from '@common/main/i18n'
import { messageTable, sessionTable } from '@modules/chat/main/schema'
import { disposeTerminalsBySession } from '@modules/terminal/main'
import { getProject } from '@modules/project/main'
import { getAgentById } from '@modules/agent/main'
import { NEW_CHAT_TITLE } from '@modules/settings/shared'
import { DEFAULT_REASONING_LEVEL, normalizeReasoningLevel } from '@common/shared/model'
import type { ContextBreakdown } from '@common/shared/model'
import {
  DEFAULT_PERMISSION_MODE,
  messageStatusOf,
  normalizeMessageStatus,
  normalizePermissionMode
} from '@modules/chat/shared'
import type { MessageSource, MessageStatus, MessageStatusSource, ProjectMessageGroup, ProjectMessages, SessionDTO, StoredMessage } from '@modules/chat/shared'

type SessionRow = typeof sessionTable.$inferSelect
type MessageRow = typeof messageTable.$inferSelect

/* 行记录 → DTO（推理等级与权限模式在读取边界归一） */
function toSessionDTO(row: SessionRow): SessionDTO {
  return {
    id: row.id,
    title: row.title,
    projectId: row.projectId,
    agentId: row.agentId,
    providerId: row.providerId,
    modelId: row.modelId,
    reasoningLevel: normalizeReasoningLevel(row.reasoningLevel),
    permissionMode: normalizePermissionMode(row.permissionMode),
    contextBreakdown: parseContextBreakdown(row.contextBreakdown),
    addTime: row.addTime,
    updateTime: row.updateTime
  }
}

/* 上下文分项解析：空值或非法 JSON 一律视为未采集 */
function parseContextBreakdown(value: string): ContextBreakdown | null {
  if (!value) {
    return null
  }
  try {
    const parsed = JSON.parse(value) as Partial<ContextBreakdown>
    const systemTokens = Number(parsed.systemTokens)
    const toolTokens = Number(parsed.toolTokens)
    const messageTokens = Number(parsed.messageTokens)
    if (![systemTokens, toolTokens, messageTokens].every(Number.isFinite)) {
      return null
    }
    return {
      systemTokens: Math.max(0, systemTokens),
      toolTokens: Math.max(0, toolTokens),
      messageTokens: Math.max(0, messageTokens)
    }
  } catch {
    return null
  }
}

/* 行记录 → DTO */
export function toMessageDTO(row: MessageRow): StoredMessage {
  return {
    id: row.id,
    sessionId: row.sessionId,
    turnId: row.turnId,
    role: row.role,
    source: row.source,
    status: normalizeMessageStatus(row.status),
    content: row.content,
    data: row.data,
    addTime: row.addTime
  }
}

/* 按主键读取会话 */
export function getSession(id: number): SessionDTO | null {
  if (!id) {
    return null
  }
  const row = getDb().select().from(sessionTable).where(eq(sessionTable.id, id)).get()
  return row ? toSessionDTO(row) : null
}

/* 会话列表（最近更新优先） */
export function listSessions(): SessionDTO[] {
  const rows = getDb().select().from(sessionTable).all()
  return rows.map(toSessionDTO).sort((a, b) => b.updateTime.localeCompare(a.updateTime))
}

/* 校验会话归属项目：会话必须绑定有效项目，避免无项目会话把沙箱根退化为用户主目录 */
function assertProject(projectId: number): void {
  if (!projectId || !getProject(projectId)) {
    throw new Error(t('runtime.error.sessionProjectRequired'))
  }
}

/* 校验 Agent：新建会话必须显式绑定一个已存在的 Agent */
function assertAgent(agentId: number): number {
  if (!agentId) {
    throw new Error(t('runtime.error.sessionAgentRequired'))
  }
  const agent = getAgentById(agentId)
  if (!agent) {
    throw new Error(t('runtime.error.agentMissing'))
  }
  return agent.id
}

/* 创建会话 */
export function createSession(input: Omit<Partial<SessionDTO>, 'id'> = {}): SessionDTO {
  const db = getDb()
  const projectId = input.projectId ?? 0
  assertProject(projectId)
  const agentId = assertAgent(input.agentId ?? 0)
  const now = new Date().toISOString()
  const record = {
    title: input.title || NEW_CHAT_TITLE,
    projectId,
    agentId,
    providerId: input.providerId ?? 0,
    modelId: input.modelId || '',
    reasoningLevel: normalizeReasoningLevel(input.reasoningLevel ?? DEFAULT_REASONING_LEVEL),
    permissionMode: normalizePermissionMode(input.permissionMode ?? DEFAULT_PERMISSION_MODE),
    summary: '',
    summaryLastMessageId: 0,
    summaryUpdateTime: '',
    contextBreakdown: '',
    addTime: now,
    updateTime: now
  }
  const inserted = db
    .insert(sessionTable)
    .values(record)
    .returning({ id: sessionTable.id })
    .get()
  return toSessionDTO({ id: inserted.id, ...record })
}

/* 更新会话（标题/模型/权限模式等；项目与 Agent 绑定创建后不可修改） */
export function updateSession(id: number, patch: Partial<SessionDTO>): SessionDTO {
  const db = getDb()
  const existing = id ? db.select().from(sessionTable).where(eq(sessionTable.id, id)).get() : undefined
  if (!existing) {
    throw new Error(t('runtime.error.sessionMissing'))
  }
  const record = {
    ...existing,
    title: patch.title ?? existing.title,
    providerId: patch.providerId ?? existing.providerId,
    modelId: patch.modelId ?? existing.modelId,
    reasoningLevel: normalizeReasoningLevel(patch.reasoningLevel ?? existing.reasoningLevel),
    permissionMode: normalizePermissionMode(patch.permissionMode ?? existing.permissionMode),
    updateTime: new Date().toISOString()
  }
  db.update(sessionTable).set(record).where(eq(sessionTable.id, existing.id)).run()
  return toSessionDTO(record)
}

/* 写入会话最近一次上下文分项：每轮结束调用一次；空值保留旧数据 */
export function saveSessionContextBreakdown(
  sessionId: number,
  breakdown: ContextBreakdown | null
): void {
  if (!sessionId || !breakdown) {
    return
  }
  getDb()
    .update(sessionTable)
    .set({ contextBreakdown: JSON.stringify(breakdown) })
    .where(eq(sessionTable.id, sessionId))
    .run()
}

/*
 * 已删除会话 ID：运行时的迟到事件 / 交互 / 轨迹据此直接丢弃。
 * 会话 ID 自增不复用，集合只增不减，进程内体量可忽略。
 */
const removedSessionIds = new Set<number>()

/* 会话是否已被删除（供运行时事件入口丢弃迟到数据） */
export function isSessionRemoved(id: number): boolean {
  return removedSessionIds.has(id)
}

/* 删除会话及其消息 */
export function deleteSession(id: number): void {
  if (!id) {
    return
  }
  const db = getDb()
  /* 消息与会话同事务删除：失败时整体回滚，不留下“已删标记 + 残留数据” */
  db.transaction((tx) => {
    tx.delete(messageTable).where(eq(messageTable.sessionId, id)).run()
    tx.delete(sessionTable).where(eq(sessionTable.id, id)).run()
  })
  /* 删库成功后再标记：迟到事件立即失效，且失败时不会误伤仍存在的会话 */
  removedSessionIds.add(id)
  /* 级联回收该会话的终端进程（服务层统一闭环） */
  disposeTerminalsBySession(String(id))
}

/* 会话消息（按自增 id 升序） */
export function listMessages(sessionId: number): StoredMessage[] {
  if (!sessionId) {
    return []
  }
  const rows = getDb()
    .select()
    .from(messageTable)
    .where(eq(messageTable.sessionId, sessionId))
    .orderBy(asc(messageTable.id))
    .all()
  return rows.map(toMessageDTO)
}

/* 会话在指定消息 ID 之后的消息（摘要 + 增量装配用） */
export function listMessagesAfter(sessionId: number, afterId: number): StoredMessage[] {
  if (!sessionId) {
    return []
  }
  return getDb()
    .select()
    .from(messageTable)
    .where(and(eq(messageTable.sessionId, sessionId), gt(messageTable.id, afterId)))
    .orderBy(asc(messageTable.id))
    .all()
    .map(toMessageDTO)
}

/* 会话摘要状态（未生成时为空） */
export interface SessionSummaryState {
  /* 摘要正文 */
  summary: string
  /* 摘要覆盖到的最后一条消息 ID */
  lastMessageId: number
  /* 摘要生成时间（ISO） */
  updateTime: string
}

/* 读取会话摘要 */
export function getSessionSummary(sessionId: number): SessionSummaryState {
  if (!sessionId) {
    return { summary: '', lastMessageId: 0, updateTime: '' }
  }
  const row = getDb().select().from(sessionTable).where(eq(sessionTable.id, sessionId)).get()
  return {
    summary: row?.summary ?? '',
    lastMessageId: row?.summaryLastMessageId ?? 0,
    updateTime: row?.summaryUpdateTime ?? ''
  }
}

/* 写入会话摘要：游标推进到本次覆盖的最后一条消息 */
export function saveSessionSummary(
  sessionId: number,
  summary: string,
  lastMessageId: number
): SessionSummaryState {
  const db = getDb()
  const existing = sessionId
    ? db.select().from(sessionTable).where(eq(sessionTable.id, sessionId)).get()
    : undefined
  if (!existing) {
    throw new Error(t('runtime.error.sessionMissing'))
  }
  const updateTime = new Date().toISOString()
  db.update(sessionTable)
    .set({ summary, summaryLastMessageId: lastMessageId, summaryUpdateTime: updateTime })
    .where(eq(sessionTable.id, sessionId))
    .run()
  return { summary, lastMessageId, updateTime }
}

/* 清空会话摘要（摘要覆盖的消息被删除时重置，避免摘要与历史不一致） */
export function clearSessionSummary(sessionId: number): void {
  if (!sessionId) {
    return
  }
  getDb()
    .update(sessionTable)
    .set({ summary: '', summaryLastMessageId: 0, summaryUpdateTime: '' })
    .where(eq(sessionTable.id, sessionId))
    .run()
}

/* 摘要游标之后的真实用户轮次（用于“对话轮次超过 20 次”判定） */
export function countTurnsAfter(sessionId: number, afterId: number): number {
  if (!sessionId) {
    return 0
  }
  const condition = and(
    eq(messageTable.sessionId, sessionId),
    eq(messageTable.role, 'user'),
    isNull(messageTable.source),
    gt(messageTable.id, afterId)
  )
  return getDb().select({ value: count() }).from(messageTable).where(condition).get()?.value ?? 0
}

/* 项目下的会话 ID 集合（项目删除 / 记忆重建时清理运行时） */
export function listSessionIdsByProject(projectId: number): number[] {
  if (!projectId) {
    return []
  }
  return getDb()
    .select({ id: sessionTable.id })
    .from(sessionTable)
    .where(eq(sessionTable.projectId, projectId))
    .all()
    .map((row) => row.id)
}

/* Agent 下的会话 ID 集合（Agent 修改后清理运行时 / 删除前校验占用） */
export function listSessionIdsByAgent(agentId: number): number[] {
  if (!agentId) {
    return []
  }
  return getDb()
    .select({ id: sessionTable.id })
    .from(sessionTable)
    .where(eq(sessionTable.agentId, agentId))
    .all()
    .map((row) => row.id)
}

/* 各 Agent 绑定会话数：一次分组统计，供列表批量回填 */
export function countSessionsByAgents(): Record<number, number> {
  const rows = getDb()
    .select({ agentId: sessionTable.agentId, value: count() })
    .from(sessionTable)
    .groupBy(sessionTable.agentId)
    .all()
  return Object.fromEntries(rows.map((row) => [row.agentId, row.value]))
}

/* 项目内晚于游标的消息：按会话分组，供 Agent 记忆生成 */
export function listNewProjectMessages(
  projectId: number,
  lastMessageTime: string
): ProjectMessages {
  const db = getDb()
  if (!projectId) {
    return { sessions: [], total: 0, lastMessageTime }
  }
  const sessions = db
    .select({ id: sessionTable.id, title: sessionTable.title })
    .from(sessionTable)
    .where(eq(sessionTable.projectId, projectId))
    .all()
  let total = 0
  let cursor = lastMessageTime
  const groups: ProjectMessageGroup[] = []
  for (const item of sessions) {
    const conditions = [eq(messageTable.sessionId, item.id)]
    if (lastMessageTime) {
      conditions.push(gt(messageTable.addTime, lastMessageTime))
    }
    const rows = db
      .select()
      .from(messageTable)
      .where(and(...conditions))
      .orderBy(asc(messageTable.addTime), asc(messageTable.id))
      .all()
      .map(toMessageDTO)
    if (rows.length === 0) {
      continue
    }
    total += rows.length
    const lastRow = rows[rows.length - 1]
    if (lastRow.addTime > cursor) {
      cursor = lastRow.addTime
    }
    groups.push({ sessionId: item.id, title: item.title, messages: rows })
  }
  groups.sort((a, b) => (a.messages[0]?.addTime ?? '').localeCompare(b.messages[0]?.addTime ?? ''))
  return { sessions: groups, total, lastMessageTime: cursor }
}

/* 会话消息分页（诊断视图复用） */
export function listSessionMessagePage(
  sessionId: number,
  limit: number,
  offset: number
): { items: StoredMessage[]; total: number } {
  const db = getDb()
  if (!sessionId) {
    return { items: [], total: 0 }
  }
  const condition = eq(messageTable.sessionId, sessionId)
  const total = db.select({ value: count() }).from(messageTable).where(condition).get()?.value ?? 0
  const items = db
    .select()
    .from(messageTable)
    .where(condition)
    .orderBy(desc(messageTable.id))
    .limit(limit)
    .offset(offset)
    .all()
    .map(toMessageDTO)
  return { items, total }
}

/* 追加消息输入：turnStart 标记本轮真实用户提问，source 标记运行时注入来源 */
interface AppendMessageInput {
  role: string
  content: string
  data: string
  timestamp?: number
  turnStart?: boolean
  source?: MessageSource | null
}

/* 从原始消息 JSON 归一状态：写入时统一重生派生字段，避免调用方各写一份 */
function statusOfData(role: string, data: string): MessageStatus | '' {
  if (role !== 'assistant') {
    return ''
  }
  try {
    const raw = JSON.parse(data) as MessageStatusSource
    return messageStatusOf({ ...raw, role })
  } catch {
    return ''
  }
}

/*
 * 追加本轮新增消息（完整历史由数据库持有；消息自带时间戳时按各自时间落库）。
 * 真实用户提问插入后取其自增 id 作为本轮 turnId，后续消息统一挂到该轮次。
 */
export function appendMessages(sessionId: number, messages: AppendMessageInput[]): void {
  if (!sessionId || messages.length === 0) {
    return
  }
  const db = getDb()
  const now = new Date().toISOString()
  /* 模型跑一轮可能跨越较长时间：用户提问取发送时刻，助手回复取结束时刻，均来自运行时时间戳 */
  const addTimeOf = (timestamp: number | undefined): string =>
    typeof timestamp === 'number' && Number.isFinite(timestamp)
      ? new Date(timestamp).toISOString()
      : now
  db.transaction((tx) => {
    let turnId = 0
    for (const message of messages) {
      /* 非轮次头消息必须已归属某一轮：避免静默写入 turn_id = 0 的孤儿消息 */
      if (!message.turnStart && turnId === 0) {
        throw new Error(t('runtime.error.messageTurnMissing'))
      }
      const inserted = tx
        .insert(messageTable)
        .values({
          sessionId,
          turnId: message.turnStart ? 0 : turnId,
          role: message.role,
          source: message.source ?? null,
          status: statusOfData(message.role, message.data),
          content: message.content,
          data: message.data,
          addTime: addTimeOf(message.timestamp)
        })
        .run()
      /* 轮次头：以自增主键回填 turn_id，使该轮后续消息统一归组 */
      if (message.turnStart) {
        turnId = Number(inserted.lastInsertRowid)
        tx.update(messageTable).set({ turnId }).where(eq(messageTable.id, turnId)).run()
      }
    }
  })
}

/* 删除指定的会话消息（按消息ID），与前端渲染保持一致 */
export function deleteMessages(sessionId: number, ids: number[]): void {
  if (!sessionId || ids.length === 0) {
    return
  }
  /* 删除范围触及摘要覆盖区：摘要已失真，清空后下一轮重新压缩 */
  const summary = getSessionSummary(sessionId)
  if (summary.summary && ids.some((id) => id <= summary.lastMessageId)) {
    clearSessionSummary(sessionId)
  }
  getDb()
    .delete(messageTable)
    .where(and(eq(messageTable.sessionId, sessionId), inArray(messageTable.id, ids)))
    .run()
  /* 删除消息会改变上下文构成：分项立即失效，等待下一轮重新采集 */
  getDb()
    .update(sessionTable)
    .set({ contextBreakdown: '' })
    .where(eq(sessionTable.id, sessionId))
    .run()
}
