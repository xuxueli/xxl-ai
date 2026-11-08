/*
 * 笔记应用服务：设置读写、目录解析、笔记树、文本读写、增删改与图片落盘。
 *   - 所有笔记路径统一限定在笔记根目录内，防止路径穿越；
 *   - 图片统一保存在 {noteRoot}/resource/image；
 *   - 目录切换只切换、不迁移旧文件。
 * @author xuxueli 2026-11-08
 */

import { randomBytes } from 'crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync, writeFileSync } from 'fs'
import { basename, dirname, extname, isAbsolute, join, relative, resolve, sep } from 'path'
import { shell } from 'electron'
import { t } from '@common/main/i18n'
import { imageMimeOf } from '@common/shared/fileTypes'
import { isWithinRoot, resolveTarget } from '@common/main/utils/pathGuard'
import type {
  NoteContent,
  NoteEntry,
  NoteSaveImageResult,
  NoteSettings,
  NoteSettingsPatch
} from '../shared/contracts'
import { getAppConfig, patchAppConfig } from '@modules/appCenter/main'
import { ensureWritableDir, resolveNoteRoot, type ResolvedNoteRoot } from './notePath'

/* 文本读取上限（与文件工具保持一致） */
const MAX_TEXT_BYTES = 10 * 1024 * 1024
/* 图片落盘上限 */
const MAX_IMAGE_BYTES = 20 * 1024 * 1024
/* 目录 / 文件名称长度上限 */
const MAX_NAME_LENGTH = 80
/* 支持的图片扩展名（与 imageMimeOf 白名单一致，供选择框过滤） */
export const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.avif', '.bmp', '.ico', '.svg']

/* 目录解析缓存：设置变更时失效，避免每次请求都做写探针 */
let rootCache: { configured: string; resolved: ResolvedNoteRoot } | null = null

/* 读取配置中的存储目录 */
function configuredStorageDir(): string {
  const raw = getAppConfig('note').storageDir
  return typeof raw === 'string' ? raw.trim() : ''
}

/* 解析生效目录（配置变化时重建缓存） */
function resolvedRoot(configured?: string): ResolvedNoteRoot {
  const value = configured ?? configuredStorageDir()
  if (rootCache && rootCache.configured === value) {
    return rootCache.resolved
  }
  const resolved = resolveNoteRoot(value)
  rootCache = { configured: value, resolved }
  return resolved
}

/* 当前生效的笔记根目录（供 desk-file 协议放行） */
export function getNoteStorageDir(): string {
  return resolvedRoot().root
}

/* 读取笔记设置 */
export function getNoteSettings(): NoteSettings {
  const configured = configuredStorageDir()
  const resolved = resolvedRoot(configured)
  return {
    storageDir: configured,
    resolvedStorageDir: resolved.root,
    defaultStorageDir: resolved.defaultDir,
    imageDir: join(resolved.root, 'resource', 'image'),
    storageFallback: resolved.fallback
  }
}

/* 保存笔记设置：自定义目录必须为绝对路径且可写 */
export function saveNoteSettings(patch: NoteSettingsPatch): NoteSettings {
  if (patch.storageDir !== undefined) {
    const value = patch.storageDir.trim()
    if (value) {
      if (!isAbsolute(value)) {
        throw new Error(t('runtime.error.noteStorageInvalid'))
      }
      if (!ensureWritableDir(resolve(value))) {
        throw new Error(t('runtime.error.noteStorageUnwritable'))
      }
    }
    patchAppConfig('note', { storageDir: value })
    rootCache = null
  }
  return getNoteSettings()
}

/* 解析并校验笔记路径：必须位于当前笔记根目录内 */
function notePathOf(input?: string): string {
  const root = resolvedRoot().root
  const target = resolveTarget(root, input)
  if (!isWithinRoot(root, target)) {
    throw new Error(t('runtime.error.notePathOutside'))
  }
  return target
}

/* 笔记业务禁止直接操作图片资源目录 */
function assertNotResource(target: string): void {
  const root = resolvedRoot().root
  const first = relative(root, target).split(sep)[0]
  if (first === 'resource') {
    throw new Error(t('runtime.error.notePathOutside'))
  }
}

/* 校验并返回笔记目录（目录监听注册使用） */
export function assertNoteDir(dir: string): string {
  const target = notePathOf(dir)
  assertNotResource(target)
  if (!statSync(target).isDirectory()) {
    throw new Error(t('runtime.error.noteTargetNotDir'))
  }
  return target
}

/* 目录项 DTO */
function toEntry(root: string, path: string): NoteEntry {
  return {
    name: basename(path),
    path,
    relativePath: relative(root, path).split(sep).join('/'),
    isDir: statSync(path).isDirectory()
  }
}

/* 去除非法字符并裁剪名称 */
function sanitizeName(name: string): string {
  return name
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_NAME_LENGTH)
}

/* 生成不冲突的目标路径 */
function uniquePath(dir: string, base: string, ext: string): string {
  let candidate = join(dir, `${base}${ext}`)
  let index = 1
  while (existsSync(candidate)) {
    candidate = join(dir, `${base}-${index}${ext}`)
    index += 1
  }
  return candidate
}

/* 列出目录：目录在前、名称升序；仅展示目录与 .md 文件 */
export function listNotes(dir?: string): NoteEntry[] {
  const root = resolvedRoot().root
  const target = notePathOf(dir)
  try {
    if (!statSync(target).isDirectory()) {
      return []
    }
    const isRoot = resolve(target) === resolve(root)
    return readdirSync(target, { withFileTypes: true })
      .filter((item) => !item.name.startsWith('.'))
      .filter((item) => {
        if (item.isDirectory()) {
          return !(isRoot && item.name === 'resource')
        }
        return item.isFile() && extname(item.name).toLowerCase() === '.md'
      })
      .map((item) => toEntry(root, join(target, item.name)))
      .sort((a, b) => {
        if (a.isDir !== b.isDir) {
          return a.isDir ? -1 : 1
        }
        return a.name.localeCompare(b.name)
      })
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code === 'ENOENT' || code === 'ENOTDIR') {
      return []
    }
    throw error
  }
}

/* 读取笔记内容 */
export function readNote(file: string): NoteContent {
  const target = notePathOf(file)
  assertNotResource(target)
  const info = statSync(target)
  if (info.isDirectory()) {
    throw new Error(t('runtime.error.noteTargetIsDir'))
  }
  if (extname(target).toLowerCase() !== '.md') {
    throw new Error(t('runtime.error.noteOnlyMarkdown'))
  }
  if (info.size > MAX_TEXT_BYTES) {
    throw new Error(t('runtime.error.noteFileTooLarge'))
  }
  return {
    path: target,
    content: readFileSync(target, 'utf-8'),
    updateTime: info.mtime.toISOString()
  }
}

/* 保存笔记内容 */
export function writeNote(file: string, content: string): NoteContent {
  const target = notePathOf(file)
  assertNotResource(target)
  if (extname(target).toLowerCase() !== '.md') {
    throw new Error(t('runtime.error.noteOnlyMarkdown'))
  }
  const info = statSync(target)
  if (info.isDirectory()) {
    throw new Error(t('runtime.error.noteTargetIsDir'))
  }
  writeFileSync(target, content, 'utf-8')
  return readNote(target)
}

/* 新建笔记：名称去非法字符、自动补 .md、同名加后缀 */
export function createNote(dir?: string, name?: string): NoteEntry {
  const root = resolvedRoot().root
  const targetDir = notePathOf(dir)
  if (!statSync(targetDir).isDirectory()) {
    throw new Error(t('runtime.error.noteTargetNotDir'))
  }
  assertNotResource(join(targetDir, 'placeholder'))
  const base = sanitizeName(name ?? '') || t('runtime.note.untitled')
  const stem = base.replace(/\.md$/i, '')
  const file = uniquePath(targetDir, stem, '.md')
  writeFileSync(file, '', 'utf-8')
  return toEntry(root, file)
}

/* 新建目录 */
export function createFolder(dir: string | undefined, name: string): NoteEntry {
  const root = resolvedRoot().root
  const targetDir = notePathOf(dir)
  if (!statSync(targetDir).isDirectory()) {
    throw new Error(t('runtime.error.noteTargetNotDir'))
  }
  const base = sanitizeName(name)
  if (!base) {
    throw new Error(t('runtime.error.noteNameEmpty'))
  }
  assertNotResource(join(targetDir, base))
  const folder = uniquePath(targetDir, base, '')
  mkdirSync(folder)
  return toEntry(root, folder)
}

/* 重命名笔记 / 目录 */
export function renameNote(source: string, name: string): NoteEntry {
  const root = resolvedRoot().root
  const target = notePathOf(source)
  assertNotResource(target)
  const info = statSync(target)
  const base = sanitizeName(name)
  if (!base) {
    throw new Error(t('runtime.error.noteNameEmpty'))
  }
  const nextName = info.isDirectory() ? base : `${base.replace(/\.md$/i, '')}.md`
  const next = join(dirname(target), nextName)
  if (next === target) {
    return toEntry(root, target)
  }
  assertNotResource(next)
  if (existsSync(next)) {
    throw new Error(t('runtime.error.noteNameDuplicate'))
  }
  renameSync(target, next)
  return toEntry(root, next)
}

/* 删除笔记 / 目录：移入系统废纸篓，根目录禁止删除 */
export async function trashNote(target: string): Promise<void> {
  const root = resolvedRoot().root
  const path = notePathOf(target)
  assertNotResource(path)
  if (resolve(path) === resolve(root)) {
    throw new Error(t('runtime.error.noteRootDelete'))
  }
  await shell.trashItem(path)
}

/* 规范化图片扩展名 */
function normalizeImageExtension(extension: string): string {
  const ext = extension.startsWith('.') ? extension : `.${extension}`
  const lower = ext.toLowerCase()
  if (!IMAGE_EXTENSIONS.includes(lower) || !imageMimeOf(`image${lower}`)) {
    throw new Error(t('runtime.error.noteImageType'))
  }
  return lower
}

/* 图片目录（确保存在） */
function ensureImageDir(): string {
  const dir = join(resolvedRoot().root, 'resource', 'image')
  mkdirSync(dir, { recursive: true })
  return dir
}

/* 校验笔记路径并返回图片落盘结果 */
function saveImageBuffer(
  noteFile: string,
  data: Uint8Array,
  extension: string
): NoteSaveImageResult {
  const note = notePathOf(noteFile)
  assertNotResource(note)
  if (extname(note).toLowerCase() !== '.md') {
    throw new Error(t('runtime.error.noteOnlyMarkdown'))
  }
  if (data.byteLength > MAX_IMAGE_BYTES) {
    throw new Error(t('runtime.error.noteImageTooLarge'))
  }
  const ext = normalizeImageExtension(extension)
  const stamp = new Date()
    .toISOString()
    .replace(/[-:T]/g, '')
    .slice(0, 14)
  const fileName = `${stamp}-${randomBytes(3).toString('hex')}${ext}`
  const imagePath = join(ensureImageDir(), fileName)
  writeFileSync(imagePath, Buffer.from(data))
  const relativePath = relative(dirname(note), imagePath).split(sep).join('/')
  return {
    path: imagePath,
    relativePath,
    markdown: `![${fileName}](${relativePath})`
  }
}

/* 保存粘贴 / 上传的图片字节 */
export function saveImage(noteFile: string, data: Uint8Array, extension: string): NoteSaveImageResult {
  return saveImageBuffer(noteFile, data, extension)
}

/* 从本地图片文件复制到笔记图片目录 */
export function saveImageFromFile(noteFile: string, source: string): NoteSaveImageResult {
  const info = statSync(source)
  if (!info.isFile()) {
    throw new Error(t('runtime.error.noteImageType'))
  }
  if (info.size > MAX_IMAGE_BYTES) {
    throw new Error(t('runtime.error.noteImageTooLarge'))
  }
  return saveImageBuffer(noteFile, readFileSync(source), extname(source))
}
