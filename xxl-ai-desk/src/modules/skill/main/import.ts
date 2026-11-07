/*
 * SKILL 导入服务：负责本地目录 / Zip 的文件系统落位与 SKILL.md 解析。
 *   - 只做文件操作与元信息解析，不读写数据库（由 skillService 统一登记）；
 *   - 所有写入先落临时目录，校验通过后原子移动，避免半成品技能；
 *   - 统一做路径穿越与符号链接校验，不限制体积、文件数与技能数量。
 * @author xuxueli 2026-10-25
 */

import AdmZip from 'adm-zip'
import { t } from '@common/main/i18n'
import {
  closeSync,
  existsSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  readSync,
  rmSync,
  statSync,
  writeFileSync
} from 'fs'
import type { Dirent } from 'fs'
import { promises as fs } from 'fs'
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'path'
import { parse as parseYaml } from 'yaml'
import { ensureSkillsDir, getSkillsDir } from '@common/main/config/paths'
import type { SkillContentChunk, SkillImportFailure } from '@modules/skill/shared'

/* SKILL.md 正文分页块大小（字节，仅控制单次读取负载，不是内容上限） */
const CONTENT_CHUNK_BYTES = 512 * 1024
/* 遍历时跳过的目录 */
const SKIP_DIRS = new Set(['.git', 'node_modules', '.svn', '.hg'])

/* 解析后的技能元信息 */
export interface ParsedSkillMeta {
  /* 技能名 */
  name: string
  /* 技能描述 */
  description: string
  /* 版本（可选） */
  version: string
}

/* 已完成落位的技能候选（尚未写库） */
export interface ImportedSkill extends ParsedSkillMeta {
  /* 技能目录名 */
  id: string
  /* 技能目录绝对路径 */
  dir: string
}

/* 文件系统导入结果（数据库登记由调用方完成） */
export interface SkillImportOutcome {
  /* 成功落位的技能 */
  imported: ImportedSkill[]
  /* 跳过或失败的技能 */
  failed: SkillImportFailure[]
}

/* 路径是否位于根目录内（含根目录） */
function isInside(root: string, target: string): boolean {
  const rel = relative(resolve(root), resolve(target))
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))
}

/* 技能名 → 目录名：小写、非法字符转连字符，保证跨平台可用 */
function slugifySkillName(value: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/^\.+/, '')
    .slice(0, 64)
  return slug || `skill-${Date.now().toString(36)}`
}

/* 目录名去重：已存在时追加 -2 / -3 ... */
export function uniqueSkillId(preferred: string): string {
  const base = slugifySkillName(preferred)
  let candidate = base
  let index = 2
  while (existsSync(join(getSkillsDir(), candidate))) {
    candidate = `${base}-${index}`
    index += 1
  }
  return candidate
}

/* 取正文第一段（frontmatter 缺失描述时的兜底） */
function firstParagraph(body: string): string {
  const line = body
    .split('\n')
    .map((item) => item.trim())
    .find((item) => item !== '' && !item.startsWith('#') && !item.startsWith('---'))
  return line ?? ''
}

/*
 * 解析 SKILL.md：读取 YAML frontmatter 的 name / description / version。
 * 无 frontmatter 时 name 回落目录名、description 回落正文首段；内容完整读取，不做截断。
 */
export function parseSkillMeta(dir: string, fallbackName: string): ParsedSkillMeta {
  const file = join(dir, 'SKILL.md')
  if (!existsSync(file)) {
    throw new Error(t('runtime.error.skillManifestNotFound'))
  }
  const raw = readFileSync(file, 'utf-8').replace(/\r\n/g, '\n')
  let body = raw
  let data: Record<string, unknown> = {}
  if (raw.startsWith('---')) {
    const end = raw.indexOf('\n---', 3)
    if (end < 0) {
      throw new Error(t('runtime.error.skillFrontmatterUnclosed'))
    }
    const header = raw.slice(3, end).trim()
    body = raw.slice(end + 4).replace(/^\n+/, '')
    if (header) {
      try {
        const parsed = parseYaml(header)
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          data = parsed as Record<string, unknown>
        }
      } catch {
        throw new Error(t('runtime.error.skillFrontmatterInvalid'))
      }
    }
  }
  const name = String(data.name ?? '').trim() || fallbackName.trim() || basename(dir)
  const description =
    String(data.description ?? '').trim() || firstParagraph(body) || '（暂无描述）'
  return {
    name,
    description: description.replace(/\s+/g, ' '),
    version: String(data.version ?? '').trim()
  }
}

/* 复制技能目录：跳过符号链接与依赖/版本库目录 */
async function copySkillDir(source: string, target: string): Promise<void> {
  await fs.cp(source, target, {
    recursive: true,
    dereference: false,
    filter: (src) => {
      if (src === source) {
        return true
      }
      if (SKIP_DIRS.has(basename(src))) {
        return false
      }
      try {
        return !lstatSync(src).isSymbolicLink()
      } catch {
        return false
      }
    }
  })
}

/* 技能目录扫描选项 */
export interface SkillRootScanOptions {
  /* 是否扫描 .claude/skills 等隐藏容器目录（默认否） */
  includeHidden?: boolean
}

/*
 * 在指定根目录内识别技能目录：
 *   - 根目录自身含 SKILL.md 即为单技能（Zip 常把技能打在一个顶层目录里）；
 *   - 否则逐层向下扫描（不限制深度与数量），命中 SKILL.md 即收下并停止深入该分支，
 *     既兼容 repo/skills/foo 的多技能包，也避免把技能内部示例目录误判为新技能。
 */
export function listSkillRoots(root: string, options: SkillRootScanOptions = {}): string[] {
  if (existsSync(join(root, 'SKILL.md'))) {
    return [root]
  }
  const includeHidden = options.includeHidden === true
  const roots: string[] = []
  const queue = [root]
  while (queue.length > 0) {
    const current = queue.shift() as string
    let entries: Dirent[]
    try {
      entries = readdirSync(current, { withFileTypes: true })
    } catch {
      continue
    }
    for (const entry of entries) {
      if (!entry.isDirectory() || SKIP_DIRS.has(entry.name)) {
        continue
      }
      if (!includeHidden && entry.name.startsWith('.')) {
        continue
      }
      const child = join(current, entry.name)
      if (existsSync(join(child, 'SKILL.md'))) {
        roots.push(child)
        continue
      }
      queue.push(child)
    }
  }
  return roots
}

/* 创建临时目录（与 skills 同级，保证 rename 原子性） */
function createTempDir(): string {
  ensureSkillsDir()
  const dir = join(getSkillsDir(), `.tmp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`)
  mkdirSync(dir, { recursive: true })
  return dir
}

/*
 * 校验并落位单个技能：
 *   - copy=true 时先复制到临时目录再原子移动（本地目录导入）；
 *   - copy=false 时直接移动已解压的目录（Zip 导入）。
 */
export async function commitSkillRoot(root: string, copy: boolean): Promise<ImportedSkill> {
  const meta = parseSkillMeta(root, basename(root))
  const id = uniqueSkillId(meta.name)
  const target = join(getSkillsDir(), id)

  if (!copy) {
    await fs.rename(root, target)
    return { id, dir: target, ...meta }
  }

  const temp = createTempDir()
  const staged = join(temp, 'skill')
  try {
    await copySkillDir(root, staged)
    await fs.rename(staged, target)
    return { id, dir: target, ...meta }
  } finally {
    rmSync(temp, { recursive: true, force: true })
  }
}

/* 普通目录导入：识别技能目录 → 校验 → 复制落位 */
export async function importSkillDirectory(sourceDir: string): Promise<SkillImportOutcome> {
  ensureSkillsDir()
  const roots = listSkillRoots(sourceDir)
  if (roots.length === 0) {
    return {
      imported: [],
      failed: [{ name: sourceDir, reason: '未找到 SKILL.md，请选择技能目录或包含技能的上级目录' }]
    }
  }
  const outcome: SkillImportOutcome = { imported: [], failed: [] }
  for (const root of roots) {
    try {
      outcome.imported.push(await commitSkillRoot(root, true))
    } catch (error) {
      outcome.failed.push({ name: basename(root), reason: (error as Error).message })
    }
  }
  return outcome
}

/* Zip 条目路径校验：拒绝绝对路径、盘符与 .. 穿越 */
function assertZipEntrySafe(entryName: string): string {
  const normalized = entryName.replace(/\\/g, '/').replace(/^\/+/, '')
  if (!normalized || normalized.includes('\0')) {
    throw new Error(t('runtime.error.zipEmptyPath'))
  }
  if (/^[a-zA-Z]:\//.test(normalized) || isAbsolute(entryName)) {
    throw new Error(t('runtime.error.zipAbsolutePath', [entryName]))
  }
  const parts = normalized.split('/')
  if (parts.some((part) => part === '..')) {
    throw new Error(t('runtime.error.zipEscapePath', [entryName]))
  }
  if (parts.some((part) => SKIP_DIRS.has(part))) {
    return ''
  }
  return normalized
}

/* 是否为符号链接条目（Unix mode 高位标识） */
function isSymlinkEntry(entry: AdmZip.IZipEntry): boolean {
  const attr = entry.attr ?? 0
  return ((attr >>> 16) & 0o170000) === 0o120000
}

/* 解压 Zip 到临时目录（逐条校验，防 Zip Slip 与符号链接；不限制体积与条目数） */
function extractZip(zipFile: string, dest: string): void {
  const zip = new AdmZip(zipFile)
  for (const entry of zip.getEntries()) {
    const safe = assertZipEntrySafe(entry.entryName)
    if (!safe) {
      continue
    }
    if (isSymlinkEntry(entry)) {
      throw new Error(t('runtime.error.zipSymlink', [entry.entryName]))
    }
    const target = resolve(dest, safe)
    if (!isInside(dest, target)) {
      throw new Error(t('runtime.error.zipEscapePath', [entry.entryName]))
    }
    if (entry.isDirectory) {
      mkdirSync(target, { recursive: true })
      continue
    }
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, entry.getData())
  }
}

/* Zip 导入：解压到临时目录后复用目录导入流程 */
export async function importSkillZip(zipFile: string): Promise<SkillImportOutcome> {
  ensureSkillsDir()
  const temp = createTempDir()
  try {
    extractZip(zipFile, temp)
    const roots = listSkillRoots(temp)
    if (roots.length === 0) {
      return {
        imported: [],
        failed: [{ name: basename(zipFile), reason: 'Zip 内未找到 SKILL.md' }]
      }
    }
    const outcome: SkillImportOutcome = { imported: [], failed: [] }
    for (const root of roots) {
      try {
        outcome.imported.push(await commitSkillRoot(root, false))
      } catch (error) {
        outcome.failed.push({ name: basename(root), reason: (error as Error).message })
      }
    }
    return outcome
  } catch (error) {
    return { imported: [], failed: [{ name: basename(zipFile), reason: (error as Error).message }] }
  } finally {
    rmSync(temp, { recursive: true, force: true })
  }
}

/* 列出技能目录内的全部附属文件（相对路径 + 大小，不设数量上限） */
export function listSkillFiles(dir: string): { path: string; size: number }[] {
  const files: { path: string; size: number }[] = []
  const stack = [dir]
  while (stack.length > 0) {
    const current = stack.pop() as string
    let entries: Dirent[]
    try {
      entries = readdirSync(current, { withFileTypes: true })
    } catch {
      continue
    }
    for (const entry of entries) {
      if (entry.name.startsWith('.') || SKIP_DIRS.has(entry.name)) {
        continue
      }
      const full = join(current, entry.name)
      if (entry.isDirectory()) {
        stack.push(full)
      } else if (entry.isFile()) {
        try {
          files.push({ path: relative(dir, full).split(sep).join('/'), size: statSync(full).size })
        } catch {
          /* 忽略读取失败的单个文件 */
        }
      }
    }
  }
  return files.sort((a, b) => a.path.localeCompare(b.path))
}

/*
 * 计算 UTF-8 完整字符边界：分页末尾若落在多字节字符中间，回退到完整字符。
 * 返回本次可安全解码的字节数。
 */
function trimIncompleteUtf8(buffer: Buffer, length: number): number {
  const end = length
  for (let back = 1; back <= 3 && end - back >= 0; back += 1) {
    const byte = buffer[end - back]
    if ((byte & 0x80) === 0) {
      /* ASCII 字节，边界完整 */
      return end
    }
    if ((byte & 0xc0) === 0xc0) {
      /* 多字节起始字节：判断该字符是否已被完整读入 */
      const need = byte >= 0xf0 ? 4 : byte >= 0xe0 ? 3 : 2
      return back < need ? end - back : end
    }
  }
  return end
}

/* 读取 SKILL.md 正文分页（offset 为字节偏移，返回本次片段与下一次偏移） */
export function readSkillContentChunk(
  dir: string,
  offset = 0,
  limit = CONTENT_CHUNK_BYTES
): SkillContentChunk {
  const file = join(dir, 'SKILL.md')
  if (!existsSync(file)) {
    return { content: '', offset: 0, nextOffset: 0, total: 0, eof: true }
  }
  const total = statSync(file).size
  const start = Math.min(Math.max(0, Math.floor(offset)), total)
  const size = Math.max(0, Math.min(limit, total - start))
  let content = ''
  let readBytes = 0
  if (size > 0) {
    const fd = openSync(file, 'r')
    try {
      const buffer = Buffer.alloc(size)
      readBytes = readSync(fd, buffer, 0, size, start)
      readBytes = trimIncompleteUtf8(buffer, readBytes)
      content = buffer.subarray(0, readBytes).toString('utf-8')
    } finally {
      closeSync(fd)
    }
  }
  const nextOffset = start + readBytes
  return { content, offset: start, nextOffset, total, eof: nextOffset >= total }
}
