import { randomUUID } from 'crypto'
import { and, asc, eq, gt, inArray } from 'drizzle-orm'
import { getDb } from '../db'
import { messageTable, sessionTable } from '../db/schema'
import type { SessionDTO, StoredMessage } from '../../shared/ipc'

type SessionRow = typeof sessionTable.$inferSelect
type MessageRow = typeof messageTable.$inferSelect

function toSessionDTO(row: SessionRow): SessionDTO {
  return {
    id: row.id,
    title: row.title,
    projectId: row.projectId,
    providerId: row.providerId,
    modelId: row.modelId,
    mode: row.mode === 'plan' ? 'plan' : 'build',
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
    projectId: input.projectId || '',
    providerId: input.providerId || '',
    modelId: input.modelId || '',
    mode: input.mode === 'plan' ? 'plan' : 'build',
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
    projectId: patch.projectId ?? existing.projectId,
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

/*
 * 用 Agent 完整消息覆盖会话消息（保持与运行时一致）。
 *   增量落库：Agent 上下文按轮次追加，历史前缀稳定，故仅保留与库中一致的前缀（保留其 id，
 *   避免前端整树重渲染），只删除尾部差异并追加新消息；全程单事务，避免逐条自动提交的开销。
 */
export function replaceMessages(
  sessionId: string,
  messages: Array<{ role: string; content: string; data: string }>
): void {
  const db = getDb()
  const existing = db
    .select()
    .from(messageTable)
    .where(eq(messageTable.sessionId, sessionId))
    .orderBy(asc(messageTable.seq))
    .all()

  /* 计算稳定前缀：data 与展示 content 均一致的头部保持不动 */
  const max = Math.min(existing.length, messages.length)
  let common = 0
  while (
    common < max &&
    existing[common].data === messages[common].data &&
    existing[common].content === messages[common].content &&
    existing[common].role === messages[common].role
  ) {
    common += 1
  }

  const now = new Date().toISOString()
  db.transaction((tx) => {
    /* 删除前缀之外的旧消息（内容变更/被截断的尾部） */
    if (existing.length > common) {
      tx.delete(messageTable)
        .where(and(eq(messageTable.sessionId, sessionId), gt(messageTable.seq, common)))
        .run()
    }
    /* 追加新增消息 */
    for (let index = common; index < messages.length; index += 1) {
      const message = messages[index]
      tx.insert(messageTable)
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
    }
  })
}

/* 清空会话消息 */
export function clearMessages(sessionId: string): void {
  getDb().delete(messageTable).where(eq(messageTable.sessionId, sessionId)).run()
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
