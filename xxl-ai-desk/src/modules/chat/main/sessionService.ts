/*
 * 会话与消息服务：管理会话（绑定项目/供应商/模型/对话模式）及其消息的持久化。
 *   - 消息增量落库：按稳定前缀复用旧记录，仅增删尾部差异。
 */

import { randomUUID } from 'crypto'
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

/* 行记录 → DTO（会话日志分页复用） */
export function toMessageDTO(row: MessageRow): StoredMessage {
  return {
    id: row.id,
    sessionId: row.sessionId,
    seq: row.seq,
    role: row.role,
    content: row.content,
    data: row.data,
    addTime: row.addTime
  }
}

/* 按主键读取会话 */
export function getSession(id: string): SessionDTO | null {
  const row = getDb().select().from(sessionTable).where(eq(sessionTable.id, id)).get()
  return row ? toSessionDTO(row) : null
}

/* 会话列表（最近更新优先） */
export function listSessions(): SessionDTO[] {
  const rows = getDb().select().from(sessionTable).all()
  return rows.map(toSessionDTO).sort((a, b) => b.updateTime.localeCompare(a.updateTime))
}

/* 校验会话归属项目：会话必须绑定有效项目，避免无项目会话把沙箱根退化为用户主目录 */
function assertProject(projectId: string): void {
  if (!projectId || !getProject(projectId)) {
    throw new Error(t('runtime.error.sessionProjectRequired'))
  }
}

/* 校验 Agent：新建会话必须显式绑定一个已存在的 Agent */
function assertAgent(agentId: string): string {
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
export function createSession(input: Partial<SessionDTO> = {}): SessionDTO {
  const db = getDb()
  const projectId = input.projectId || ''
  assertProject(projectId)
  const agentId = assertAgent(input.agentId || '')
  const now = new Date().toISOString()
  const record = {
    id: input.id || randomUUID(),
    title: input.title || NEW_CHAT_TITLE,
    projectId,
    agentId,
    providerId: input.providerId || '',
    modelId: input.modelId || '',
    mode: input.mode === 'plan' ? 'plan' : 'build',
    addTime: now,
    updateTime: now
  }
  db.insert(sessionTable).values(record).run()
  return toSessionDTO(record)
}

/* 更新会话（标题/模型/模式等；项目与 Agent 绑定创建后不可修改） */
export function updateSession(id: string, patch: Partial<SessionDTO>): SessionDTO {
  const db = getDb()
  const existing = db.select().from(sessionTable).where(eq(sessionTable.id, id)).get()
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
  db.update(sessionTable).set(record).where(eq(sessionTable.id, id)).run()
  return toSessionDTO(record)
}

/* 删除会话及其消息 */
export function deleteSession(id: string): void {
  const db = getDb()
  db.delete(messageTable).where(eq(messageTable.sessionId, id)).run()
  db.delete(sessionTable).where(eq(sessionTable.id, id)).run()
  /* 级联回收该会话的终端进程（服务层统一闭环） */
  disposeTerminalsBySession(id)
}

/* 会话消息（按 seq 升序） */
export function listMessages(sessionId: string): StoredMessage[] {
  const rows = getDb()
    .select()
    .from(messageTable)
    .where(eq(messageTable.sessionId, sessionId))
    .orderBy(asc(messageTable.seq))
    .all()
  return rows.map(toMessageDTO)
}

/* 项目下的会话 ID 集合（项目删除 / 记忆重建时清理运行时） */
export function listSessionIdsByProject(projectId: string): string[] {
  return getDb()
    .select({ id: sessionTable.id })
    .from(sessionTable)
    .where(eq(sessionTable.projectId, projectId))
    .all()
    .map((row) => row.id)
}

/* Agent 下的会话 ID 集合（Agent 修改后清理运行时 / 删除前校验占用） */
export function listSessionIdsByAgent(agentId: string): string[] {
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
export function countSessionsByAgents(): Record<string, number> {
  const rows = getDb()
    .select({ agentId: sessionTable.agentId, value: count() })
    .from(sessionTable)
    .groupBy(sessionTable.agentId)
    .all()
  return Object.fromEntries(rows.map((row) => [row.agentId, row.value]))
}

/* 项目内晚于游标的消息：按会话分组，供 Agent 记忆生成 */
export function listNewProjectMessages(
  projectId: string,
  lastMessageTime: string
): ProjectMessages {
  const db = getDb()
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
      .orderBy(asc(messageTable.addTime), asc(messageTable.seq))
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
    groups.push({ title: item.title, messages: rows })
  }
  groups.sort((a, b) => (a.messages[0]?.addTime ?? '').localeCompare(b.messages[0]?.addTime ?? ''))
  return { sessions: groups, total, lastMessageTime: cursor }
}

/* 会话消息分页（诊断视图复用） */
export function listSessionMessagePage(
  sessionId: string,
  limit: number,
  offset: number
): { items: StoredMessage[]; total: number } {
  const db = getDb()
  const condition = eq(messageTable.sessionId, sessionId)
  const total = db.select({ value: count() }).from(messageTable).where(condition).get()?.value ?? 0
  const items = db
    .select()
    .from(messageTable)
    .where(condition)
    .orderBy(desc(messageTable.seq))
    .limit(limit)
    .offset(offset)
    .all()
    .map(toMessageDTO)
  return { items, total }
}

/* 追加本轮新增消息（完整历史由数据库持有） */
export function appendMessages(
  sessionId: string,
  messages: Array<{ role: string; content: string; data: string }>
): void {
  if (messages.length === 0) {
    return
  }
  const db = getDb()
  const last = db
    .select({ seq: messageTable.seq })
    .from(messageTable)
    .where(eq(messageTable.sessionId, sessionId))
    .orderBy(desc(messageTable.seq))
    .limit(1)
    .get()
  const start = last?.seq ?? 0
  const now = new Date().toISOString()
  db.transaction((tx) => {
    for (let index = 0; index < messages.length; index += 1) {
      const message = messages[index]
      tx.insert(messageTable)
        .values({
          id: randomUUID(),
          sessionId,
          seq: start + index + 1,
          role: message.role,
          content: message.content,
          data: message.data,
          addTime: now
        })
        .run()
    }
  })
}

/* 删除指定的会话消息（按消息ID），与前端渲染保持一致 */
export function deleteMessages(sessionId: string, ids: string[]): void {
  if (ids.length === 0) {
    return
  }
  getDb()
    .delete(messageTable)
    .where(and(eq(messageTable.sessionId, sessionId), inArray(messageTable.id, ids)))
    .run()
}
