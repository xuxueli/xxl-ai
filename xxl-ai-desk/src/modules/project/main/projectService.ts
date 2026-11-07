/*
 * 项目服务：项目 1:1 强绑定本地磁盘目录，会话归属项目之下。
 *   - 目录选择对话框与跨域级联由 IPC 层编排，本服务只做项目持久化。
 */

import { basename } from 'path'
import { randomUUID } from 'crypto'
import { eq } from 'drizzle-orm'
import { getDb } from '@common/main/db'
import { t } from '@common/main/i18n'
import { projectTable } from '@modules/project/main/schema'
import type { ProjectCreateInput, ProjectDTO } from '@modules/project/shared'

type ProjectRow = typeof projectTable.$inferSelect

/* 行记录 → DTO */
function toDTO(row: ProjectRow): ProjectDTO {
  return {
    id: row.id,
    name: row.name,
    path: row.path,
    memoryEnabled: row.memoryEnabled === 1,
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
    throw new Error(t('runtime.error.projectFolderRequired'))
  }
  /* 1:1 强绑定：同一目录不允许重复建项目 */
  const duplicated = getDb().select().from(projectTable).where(eq(projectTable.path, path)).get()
  if (duplicated) {
    throw new Error(t('runtime.error.projectDuplicate'))
  }
  const now = new Date().toISOString()
  const record = {
    id: randomUUID(),
    name: (input.name ?? '').trim() || basename(path) || path,
    path,
    memoryEnabled: 0,
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
    throw new Error(t('runtime.error.projectMissing'))
  }
  const value = name.trim()
  if (!value) {
    throw new Error(t('runtime.error.projectNameRequired'))
  }
  const record = { ...existing, name: value, updateTime: new Date().toISOString() }
  db.update(projectTable).set(record).where(eq(projectTable.id, id)).run()
  return toDTO(record)
}

/* 删除项目：仅删除项目记录；会话 / 消息 / 记忆 / 终端由项目 IPC 编排各域 service 清理 */
export function deleteProject(id: string): void {
  getDb().delete(projectTable).where(eq(projectTable.id, id)).run()
}

/* 切换项目记忆开关（内容保留；运行时由 IPC 层清理） */
export function setProjectMemoryEnabled(id: string, enabled: boolean): ProjectDTO {
  const db = getDb()
  const existing = db.select().from(projectTable).where(eq(projectTable.id, id)).get()
  if (!existing) {
    throw new Error(t('runtime.error.projectMissing'))
  }
  const record = {
    ...existing,
    memoryEnabled: enabled ? 1 : 0,
    updateTime: new Date().toISOString()
  }
  db.update(projectTable).set(record).where(eq(projectTable.id, id)).run()
  return toDTO(record)
}
