/*
 * 会话与消息服务：管理会话（绑定项目/供应商/模型/对话模式）及其消息的持久化。
 *   - 消息增量落库：按稳定前缀复用旧记录，仅增删尾部差异。
 */

import { randomUUID } from 'crypto'
import { and, asc, desc, eq, inArray } from 'drizzle-orm'
import { getDb } from '../db'
import { llmTraceTable, messageTable, sessionTable } from '../db/schema'
import { disposeTerminalsBySession } from './terminalService'
import { getProject } from './projectService'
import { NEW_CHAT_TITLE } from '@shared/ipc'
import type { SessionDTO, StoredMessage } from '@shared/ipc'

type SessionRow = typeof sessionTable.$inferSelect
type MessageRow = typeof messageTable.$inferSelect

/* 行记录 → DTO（mode 缺省归一到 build） */
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
    throw new Error('会话必须归属有效项目，请先选择项目')
  }
}

/* 创建会话 */
export function createSession(input: Partial<SessionDTO> = {}): SessionDTO {
  const db = getDb()
  const projectId = input.projectId || ''
  assertProject(projectId)
  const now = new Date().toISOString()
  const record = {
    id: input.id || randomUUID(),
    title: input.title || NEW_CHAT_TITLE,
    projectId,
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
  /* 重新绑定项目时必须指向有效项目；缺省保持原项目不变 */
  if (patch.projectId !== undefined) {
    assertProject(patch.projectId)
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
  /* 通讯记录随会话级联清理（SQLite 无外键级联） */
  db.delete(llmTraceTable).where(eq(llmTraceTable.sessionId, id)).run()
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
