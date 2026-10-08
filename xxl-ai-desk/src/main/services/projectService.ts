/*
 * 项目服务：项目 1:1 强绑定本地磁盘目录，会话归属项目之下。
 *   - 目录选择对话框由 IPC 层负责，本服务只做持久化与级联清理。
 */

import { basename } from 'path'
import { randomUUID } from 'crypto'
import { eq, inArray } from 'drizzle-orm'
import { getDb } from '../db'
import { messageTable, projectTable, sessionTable } from '../db/schema'
import type { ProjectCreateInput, ProjectDTO } from '../../shared/ipc'

type ProjectRow = typeof projectTable.$inferSelect

/* 行记录 → DTO */
function toDTO(row: ProjectRow): ProjectDTO {
  return {
    id: row.id,
    name: row.name,
    path: row.path,
    addTime: row.addTime,
    updateTime: row.updateTime
  }
}

/* 项目列表（最近更新优先） */
export function listProjects(): ProjectDTO[] {
  const rows = getDb().select().from(projectTable).all()
  return rows.map(toDTO).sort((a, b) => b.updateTime.localeCompare(a.updateTime))
}

/* 按主键读取项目 */
export function getProject(id: string): ProjectDTO | null {
  const row = getDb().select().from(projectTable).where(eq(projectTable.id, id)).get()
  return row ? toDTO(row) : null
}

/* 创建项目：绑定一个本地目录，名称缺省取目录名 */
export function createProject(input: ProjectCreateInput): ProjectDTO {
  const path = (input.path ?? '').trim()
  if (!path) {
    throw new Error('未选择项目目录')
  }
  /* 1:1 强绑定：同一目录不允许重复建项目 */
  const duplicated = getDb().select().from(projectTable).where(eq(projectTable.path, path)).get()
  if (duplicated) {
    throw new Error('该目录已创建项目')
  }
  const now = new Date().toISOString()
  const record = {
    id: randomUUID(),
    name: (input.name ?? '').trim() || basename(path) || path,
    path,
    addTime: now,
    updateTime: now
  }
  getDb().insert(projectTable).values(record).run()
  return toDTO(record)
}

/* 重命名项目（仅改名称，目录绑定不变） */
export function renameProject(id: string, name: string): ProjectDTO {
  const db = getDb()
  const existing = db.select().from(projectTable).where(eq(projectTable.id, id)).get()
  if (!existing) {
    throw new Error('项目不存在')
  }
  const value = name.trim()
  if (!value) {
    throw new Error('项目名称不能为空')
  }
  const record = { ...existing, name: value, updateTime: new Date().toISOString() }
  db.update(projectTable).set(record).where(eq(projectTable.id, id)).run()
  return toDTO(record)
}

/* 项目下的会话ID集合（删除项目前用于清理运行时 Agent） */
export function listSessionIdsByProject(projectId: string): string[] {
  const rows = getDb()
    .select({ id: sessionTable.id })
    .from(sessionTable)
    .where(eq(sessionTable.projectId, projectId))
    .all()
  return rows.map((row) => row.id)
}

/* 删除项目：级联删除其下全部会话与消息，返回被删除的会话ID集合 */
export function deleteProject(id: string): string[] {
  const db = getDb()
  const sessionIds = listSessionIdsByProject(id)
  if (sessionIds.length > 0) {
    db.delete(messageTable).where(inArray(messageTable.sessionId, sessionIds)).run()
    db.delete(sessionTable).where(inArray(sessionTable.id, sessionIds)).run()
  }
  db.delete(projectTable).where(eq(projectTable.id, id)).run()
  return sessionIds
}
