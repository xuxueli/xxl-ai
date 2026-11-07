/*
 * 项目服务：项目 1:1 强绑定本地磁盘目录，会话归属项目之下。
 *   - 目录选择对话框与跨域级联由 IPC 层编排，本服务只做项目持久化。
 */

import { basename } from 'path'
import { eq } from 'drizzle-orm'
import { getDb } from '@common/main/db'
import { t } from '@common/main/i18n'
import { projectTable } from '@modules/project/main/schema'
import type { ProjectCreateInput, ProjectDTO } from '@modules/project/shared'

type ProjectRow = typeof projectTable.$inferSelect

/* 项目长期记忆快照（随项目行保存，未生成时为空） */
export interface ProjectMemoryState {
  /* 记忆正文 */
  content: string
  /* 上次生成纳入的最后一条消息时间（项目级游标，ISO） */
  lastMessageTime: string
  /* 记忆生成时间（ISO） */
  updateTime: string
}

/* 项目长期记忆列表项：项目标识 + 记忆快照 */
export interface ProjectMemoryEntry extends ProjectMemoryState {
  /* 项目主键 */
  projectId: number
  /* 项目名 */
  projectName: string
}

/* 行记录 → DTO */
function toDTO(row: ProjectRow): ProjectDTO {
  return {
    id: row.id,
    name: row.name,
    path: row.path,
    memoryEnabled: row.memoryEnabled === 1,
    memoryUpdateTime: row.memoryUpdateTime,
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
export function getProject(id: number): ProjectDTO | null {
  if (!id) {
    return null
  }
  const row = getDb().select().from(projectTable).where(eq(projectTable.id, id)).get()
  return row ? toDTO(row) : null
}

/* 读取项目长期记忆（未生成返回空字段） */
export function getProjectMemory(projectId: number): ProjectMemoryState {
  if (!projectId) {
    return { content: '', lastMessageTime: '', updateTime: '' }
  }
  const row = getDb().select().from(projectTable).where(eq(projectTable.id, projectId)).get()
  return {
    content: row?.memory ?? '',
    lastMessageTime: row?.memoryLastTime ?? '',
    updateTime: row?.memoryUpdateTime ?? ''
  }
}

/* 项目长期记忆列表：一次查询返回全部项目与记忆（含未生成的项目） */
export function listProjectMemories(): ProjectMemoryEntry[] {
  return getDb()
    .select()
    .from(projectTable)
    .all()
    .map((row) => ({
      projectId: row.id,
      projectName: row.name,
      content: row.memory,
      lastMessageTime: row.memoryLastTime,
      updateTime: row.memoryUpdateTime
    }))
}

/* 保存项目长期记忆：内容与游标由调用方决定，生成时间取当前时刻 */
export function saveProjectMemory(
  projectId: number,
  content: string,
  lastMessageTime: string
): ProjectMemoryState {
  const db = getDb()
  const existing = projectId
    ? db.select().from(projectTable).where(eq(projectTable.id, projectId)).get()
    : undefined
  if (!existing) {
    throw new Error(t('runtime.error.projectMissing'))
  }
  const updateTime = new Date().toISOString()
  db.update(projectTable)
    .set({ memory: content, memoryLastTime: lastMessageTime, memoryUpdateTime: updateTime })
    .where(eq(projectTable.id, projectId))
    .run()
  return { content, lastMessageTime, updateTime }
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
    name: (input.name ?? '').trim() || basename(path) || path,
    path,
    memoryEnabled: 0,
    memory: '',
    memoryLastTime: '',
    memoryUpdateTime: '',
    addTime: now,
    updateTime: now
  }
  const inserted = getDb()
    .insert(projectTable)
    .values(record)
    .returning({ id: projectTable.id })
    .get()
  return toDTO({ id: inserted.id, ...record })
}

/* 重命名项目（仅改名称，目录绑定不变） */
export function renameProject(id: number, name: string): ProjectDTO {
  const db = getDb()
  const existing = id ? db.select().from(projectTable).where(eq(projectTable.id, id)).get() : undefined
  if (!existing) {
    throw new Error(t('runtime.error.projectMissing'))
  }
  const value = name.trim()
  if (!value) {
    throw new Error(t('runtime.error.projectNameRequired'))
  }
  const record = { ...existing, name: value, updateTime: new Date().toISOString() }
  db.update(projectTable).set(record).where(eq(projectTable.id, existing.id)).run()
  return toDTO(record)
}

/* 删除项目：长期记忆随项目行一并删除；会话 / 消息 / 终端由项目 IPC 编排各域 service 清理 */
export function deleteProject(id: number): void {
  if (!id) {
    return
  }
  getDb().delete(projectTable).where(eq(projectTable.id, id)).run()
}

/* 切换项目记忆开关（内容保留；运行时由 IPC 层清理） */
export function setProjectMemoryEnabled(id: number, enabled: boolean): ProjectDTO {
  const db = getDb()
  const existing = id ? db.select().from(projectTable).where(eq(projectTable.id, id)).get() : undefined
  if (!existing) {
    throw new Error(t('runtime.error.projectMissing'))
  }
  const record = {
    ...existing,
    memoryEnabled: enabled ? 1 : 0,
    updateTime: new Date().toISOString()
  }
  db.update(projectTable).set(record).where(eq(projectTable.id, existing.id)).run()
  return toDTO(record)
}
