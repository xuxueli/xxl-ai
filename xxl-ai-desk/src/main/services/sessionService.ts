import { randomUUID } from 'crypto'
import { and, asc, eq, max } from 'drizzle-orm'
import { getDb } from '../db'
import { messageTable, sessionTable } from '../db/schema'
import type { SessionDTO, StoredMessage } from '../../shared/ipc'

type SessionRow = typeof sessionTable.$inferSelect
type MessageRow = typeof messageTable.$inferSelect

function toSessionDTO(row: SessionRow): SessionDTO {
  return {
    id: row.id,
    title: row.title,
    providerId: row.providerId,
    modelId: row.modelId,
    systemPrompt: row.systemPrompt,
    addTime: row.addTime,
    updateTime: row.updateTime
  }
}

function toMessageDTO(row: MessageRow): StoredMessage {
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

/* 创建会话 */
export function createSession(input: Partial<SessionDTO> = {}): SessionDTO {
  const db = getDb()
  const now = new Date().toISOString()
  const record = {
    id: input.id || randomUUID(),
    title: input.title || '新对话',
    providerId: input.providerId || '',
    modelId: input.modelId || '',
    systemPrompt: input.systemPrompt || '',
    addTime: now,
    updateTime: now
  }
  db.insert(sessionTable).values(record).run()
  return toSessionDTO(record)
}

/* 更新会话（标题/模型等） */
export function updateSession(id: string, patch: Partial<SessionDTO>): SessionDTO {
  const db = getDb()
  const existing = db.select().from(sessionTable).where(eq(sessionTable.id, id)).get()
  if (!existing) {
    throw new Error('会话不存在')
  }
  const record = {
    ...existing,
    title: patch.title ?? existing.title,
    providerId: patch.providerId ?? existing.providerId,
    modelId: patch.modelId ?? existing.modelId,
    systemPrompt: patch.systemPrompt ?? existing.systemPrompt,
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

/* 追加一条消息，返回自增序号 */
export function appendMessage(
  sessionId: string,
  role: string,
  content: string,
  data: string
): void {
  const db = getDb()
  const row = db
    .select({ value: max(messageTable.seq) })
    .from(messageTable)
    .where(eq(messageTable.sessionId, sessionId))
    .get()
  const seq = (row?.value ?? 0) + 1
  db.insert(messageTable)
    .values({
      id: randomUUID(),
      sessionId,
      seq,
      role,
      content,
      data,
      addTime: new Date().toISOString()
    })
    .run()
}

/* 用 Agent 完整消息覆盖会话消息（保持与运行时一致） */
export function replaceMessages(
  sessionId: string,
  messages: Array<{ role: string; content: string; data: string }>
): void {
  const db = getDb()
  db.delete(messageTable).where(eq(messageTable.sessionId, sessionId)).run()
  const now = new Date().toISOString()
  messages.forEach((message, index) => {
    db.insert(messageTable)
      .values({
        id: randomUUID(),
        sessionId,
        seq: index + 1,
        role: message.role,
        content: message.content,
        data: message.data,
        addTime: now
      })
      .run()
  })
}

/* 清空会话消息 */
export function clearMessages(sessionId: string): void {
  getDb().delete(messageTable).where(eq(messageTable.sessionId, sessionId)).run()
}

/* 判断某条消息是否存在（内部使用） */
export function hasMessage(sessionId: string, role: string): boolean {
  const row = getDb()
    .select()
    .from(messageTable)
    .where(and(eq(messageTable.sessionId, sessionId), eq(messageTable.role, role)))
    .get()
  return Boolean(row)
}
