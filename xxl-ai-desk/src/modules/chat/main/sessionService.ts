/*
 * 会话与消息服务：管理会话（绑定项目/供应商/模型/对话模式）及其消息的持久化。
 *   - 消息按轮次追加落库，历史完整保存在数据库。
 */

import { and, asc, count, desc, eq, gt, inArray } from 'drizzle-orm'
import { getDb } from '@common/main/db'
import { t } from '@common/main/i18n'
import { messageTable, sessionTable } from '@modules/chat/main/schema'
import { disposeTerminalsBySession } from '@modules/terminal/main'
import { getProject } from '@modules/project/main'
import { getAgentById } from '@modules/agent/main'
import { NEW_CHAT_TITLE } from '@modules/settings/shared'
import type { ProjectMessageGroup, ProjectMessages, SessionDTO, StoredMessage } from '@modules/chat/shared'

type SessionRow = typeof sessionTable.$inferSelect
type MessageRow = typeof messageTable.$inferSelect

/* 行记录 → DTO（mode 缺省归一到 build） */
function toSessionDTO(row: SessionRow): SessionDTO {
  return {
    id: row.id,
    title: row.title,
    projectId: row.projectId,
    agentId: row.agentId,
    providerId: row.providerId,
    modelId: row.modelId,
    mode: row.mode === 'plan' ? 'plan' : 'build',
    addTime: row.addTime,
    updateTime: row.updateTime
  }
}

/* 行记录 → DTO */
export function toMessageDTO(row: MessageRow): StoredMessage {
  return {
    id: row.id,
    sessionId: row.sessionId,
    turnId: row.turnId,
    role: row.role,
    injected: row.injected,
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
    mode: input.mode === 'plan' ? 'plan' : 'build',
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

/* 更新会话（标题/模型/模式等；项目与 Agent 绑定创建后不可修改） */
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
    mode: patch.mode ?? existing.mode,
    updateTime: new Date().toISOString()
  }
  db.update(sessionTable).set(record).where(eq(sessionTable.id, existing.id)).run()
  return toSessionDTO(record)
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

/* 追加消息输入：turnStart 标记本轮真实用户提问，injected 标记运行时注入提示 */
interface AppendMessageInput {
  role: string
  content: string
  data: string
  timestamp?: number
  turnStart?: boolean
  injected?: boolean
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
      const inserted = tx
        .insert(messageTable)
        .values({
          sessionId,
          turnId: message.turnStart ? 0 : turnId,
          role: message.role,
          injected: message.injected ?? false,
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
  getDb()
    .delete(messageTable)
    .where(and(eq(messageTable.sessionId, sessionId), inArray(messageTable.id, ids)))
    .run()
}
