/*
 * SKILL 业务服务：技能目录扫描对账、详情、删除与运行时清单。
 *   - 目录内容为权威：列表以扫描 {数据目录}/skills 为准，本表只保存来源等状态；
 *   - 唯一读写 desk_skill 的出口；文件解析与落位由 skillImportService 负责。
 */

import { existsSync, readdirSync, rmSync } from 'fs'
import { isAbsolute, join, relative, resolve } from 'path'
import { eq } from 'drizzle-orm'
import { getDb } from '@common/main/db'
import { t } from '@common/main/i18n'
import { skillTable } from '@modules/skill/main/schema'
import { ensureSkillsDir, getSkillsDir } from '@common/main/config/paths'
import {
  importSkillDirectory,
  importSkillZip,
  listSkillFiles,
  parseSkillMeta,
  readSkillContentChunk,
  type ImportedSkill
} from './import'
import type { SkillContentChunk, SkillDTO, SkillDetail, SkillImportResult, SkillRuntimeConfig, SkillSource } from '@modules/skill/shared'

type SkillRow = typeof skillTable.$inferSelect

/* 技能名自然排序（数字按数值比较） */
const NAME_COLLATOR = new Intl.Collator('zh-Hans-CN', { numeric: true, sensitivity: 'base' })

/* 行记录 → DTO（布尔归一） */
function toDTO(row: SkillRow): SkillDTO {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    version: row.version,
    source: row.source,
    sourceId: row.sourceId,
    agentCount: 0,
    addTime: row.addTime,
    updateTime: row.updateTime
  }
}

/* 技能目录绝对路径（拒绝越界的 id） */
export function getSkillDir(id: string): string {
  const root = getSkillsDir()
  /* 目录名只允许单层名称，拒绝空值、. / .. 与路径分隔符 */
  if (!id || id === '.' || id === '..' || id.includes('/') || id.includes('\\')) {
    throw new Error(t('runtime.error.skillIdInvalid'))
  }
  const target = resolve(root, id)
  const rel = relative(root, target)
  if (!rel || rel.startsWith('..') || isAbsolute(rel)) {
    throw new Error(t('runtime.error.skillIdInvalid'))
  }
  return target
}

/* 扫描技能目录：返回含 SKILL.md 的目录名（忽略隐藏目录与临时目录） */
function scanSkillDirs(): string[] {
  ensureSkillsDir()
  try {
    return readdirSync(getSkillsDir(), { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
      .map((entry) => entry.name)
      .filter((name) => existsSync(join(getSkillsDir(), name, 'SKILL.md')))
  } catch {
    return []
  }
}

/*
 * 技能列表：扫描目录 → 解析 SKILL.md → 与数据库对账。
 * 目录存在但 DB 无记录时自动补登；DB 有记录但目录已删除时清理。
 */
export function listSkills(): SkillDTO[] {
  const db = getDb()
  const rows = db.select().from(skillTable).all()
  const rowMap = new Map(rows.map((row) => [row.id, row]))
  const dirs = scanSkillDirs()
  const dirSet = new Set(dirs)
  const validIds = new Set<string>()
  const now = new Date().toISOString()

  for (const id of dirs) {
    if (syncSkillRow(id, rowMap, now)) {
      validIds.add(id)
    }
  }

  /* 清理目录已不存在的记录 */
  for (const row of rows) {
    if (!dirSet.has(row.id)) {
      db.delete(skillTable).where(eq(skillTable.id, row.id)).run()
      rowMap.delete(row.id)
    }
  }

  return [...rowMap.values()]
    .filter((row) => validIds.has(row.id))
    .map(toDTO)
    .sort((a, b) => NAME_COLLATOR.compare(a.name, b.name))
}

/* 同步单个技能元信息：解析失败返回 false；字段变化时才更新，避免 update_time 漂移 */
function syncSkillRow(id: string, rowMap: Map<string, SkillRow>, now: string): boolean {
  let meta: ReturnType<typeof parseSkillMeta>
  try {
    meta = parseSkillMeta(join(getSkillsDir(), id), id)
  } catch {
    return false
  }
  const db = getDb()
  const existing = rowMap.get(id)
  if (!existing) {
    const record: SkillRow = {
      id,
      name: meta.name,
      description: meta.description,
      version: meta.version,
      source: 'local',
      sourceId: '',
      addTime: now,
      updateTime: now
    }
    db.insert(skillTable).values(record).run()
    rowMap.set(id, record)
    return true
  }
  if (
    existing.name === meta.name &&
    existing.description === meta.description &&
    existing.version === meta.version
  ) {
    return true
  }
  const patch = {
    name: meta.name,
    description: meta.description,
    version: meta.version,
    updateTime: now
  }
  db.update(skillTable).set(patch).where(eq(skillTable.id, id)).run()
  rowMap.set(id, { ...existing, ...patch })
  return true
}

/* 登记导入 / 安装的技能（存在则刷新元信息，保留启停状态与新增时间） */
export function registerSkill(
  item: ImportedSkill,
  source: SkillSource,
  sourceId = ''
): SkillDTO {
  const db = getDb()
  const existing = db.select().from(skillTable).where(eq(skillTable.id, item.id)).get()
  const now = new Date().toISOString()
  const record = {
    id: item.id,
    name: item.name,
    description: item.description,
    version: item.version,
    source,
    sourceId,
    addTime: existing?.addTime ?? now,
    updateTime: now
  }
  db.insert(skillTable)
    .values(record)
    .onConflictDoUpdate({ target: skillTable.id, set: record })
    .run()
  return toDTO(record as SkillRow)
}

/* 删除技能：先删目录，再删记录（目录不存在也允许清理记录） */
export function deleteSkill(id: string): void {
  const dir = getSkillDir(id)
  if (existsSync(dir)) {
    rmSync(dir, { recursive: true, force: true })
  }
  getDb().delete(skillTable).where(eq(skillTable.id, id)).run()
}

/* 技能详情：元信息 + SKILL.md 正文首屏 + 附属文件清单 */
export function getSkillDetail(id: string): SkillDetail {
  const list = listSkills()
  const dto = list.find((item) => item.id === id)
  if (!dto) {
    throw new Error(t('runtime.error.skillNotFound'))
  }
  const dir = getSkillDir(id)
  return {
    ...dto,
    dir,
    content: readSkillContentChunk(dir),
    files: listSkillFiles(dir)
  }
}

/* 技能正文续读：按字节偏移返回下一段（详情页「加载更多」使用，内容不截断） */
export function getSkillContent(id: string, offset: number): SkillContentChunk {
  return readSkillContentChunk(getSkillDir(id), offset)
}

/* 技能运行时清单（会话按 Agent 选中的 id 过滤；目录缺失的自动跳过） */
export function listSkillsForRuntime(): SkillRuntimeConfig[] {
  return getDb()
    .select()
    .from(skillTable)
    .all()
    .map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      dir: getSkillDir(row.id)
    }))
    .filter((item) => existsSync(join(item.dir, 'SKILL.md')))
}

/* 按 skills.sh 标识查找已安装技能（发现页去重） */
export function findSkillBySourceId(sourceId: string): SkillDTO | null {
  const row = getDb().select().from(skillTable).where(eq(skillTable.sourceId, sourceId)).get()
  return row ? toDTO(row) : null
}

/* 已安装的 skills.sh 标识集合（发现页批量标记） */
export function listInstalledSourceIds(): Set<string> {
  const rows = getDb().select().from(skillTable).all()
  return new Set(rows.map((row) => row.sourceId).filter((value) => value !== ''))
}

/* 重新扫描技能目录：用户手动放入/删除技能后刷新（运行时清理由 IPC 编排） */
export function refreshSkills(): SkillDTO[] {
  return listSkills()
}

/* 本地目录导入：落位后逐个登记，返回成功与失败汇总 */
export async function importSkillsFromDirectory(sourceDir: string): Promise<SkillImportResult> {
  const outcome = await importSkillDirectory(sourceDir)
  const imported = outcome.imported.map((item) => registerSkill(item, 'local'))
  return { imported, failed: outcome.failed }
}

/* Zip 导入：解压落位后逐个登记，返回成功与失败汇总 */
export async function importSkillsFromZip(zipFile: string): Promise<SkillImportResult> {
  const outcome = await importSkillZip(zipFile)
  const imported = outcome.imported.map((item) => registerSkill(item, 'local'))
  return { imported, failed: outcome.failed }
}

/* 技能目录展示路径（在文件管理器中定位用） */
export function getSkillRevealPath(id: string): string {
  const dir = getSkillDir(id)
  const file = join(dir, 'SKILL.md')
  return existsSync(file) ? file : dir
}
